import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { indicatorWeek } from '../../../../lib/weekly-indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deliberately scoped to the test school. No bulk sending is possible here.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase server configuration missing' }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: schools, error } = await db.from('schools').select('id,school_name,is_active').eq('is_active', true);
  if (error) return NextResponse.json({ error: 'School lookup failed' }, { status: 500 });
  const matches = (schools || []).filter(s => s.school_name.trim() === 'اختبار');
  if (matches.length !== 1) return NextResponse.json({ error: 'Expected exactly one test school' }, { status: 409 });
  const school = matches[0];
  const { data: profile, error: profileError } = await db.from('school_profiles').select('contact_mobile').eq('school_id', school.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'School contact lookup failed' }, { status: 500 });
  const mobile = profile?.contact_mobile?.trim() || '';
  const normalizedMobile = mobile.replace(/[^0-9]/g, '').replace(/^00/, '');
  const validMobile = /^(?:9665\d{8}|05\d{8}|5\d{8})$/.test(normalizedMobile);
  const week = indicatorWeek();
  const { data: entries, error: entryError } = await db.from('school_madrasati_daily_indicators').select('id').eq('school_id', school.id).gte('indicator_date', week.start).lte('indicator_date', week.end).limit(1);
  if (entryError) return NextResponse.json({ error: 'Indicator lookup failed' }, { status: 500 });
  const pending = !entries?.length;
  const configured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  // Preview only: this route never sends WhatsApp messages.
  return NextResponse.json({ school: 'اختبار', indicator: 'madrasati', week: {start:week.start,end:week.end}, pending, recipientConfigured: validMobile, providerConfigured: configured, mode: 'dry-run', sent: false });
}

 
// Explicit, authenticated, single-school test only. No cron or bulk delivery.
export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization') || '';
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.WHATSAPP_TEST_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID;
  if (!url || !key || !token || !phoneId) return NextResponse.json({ error: 'Server configuration missing' }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: identity, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !identity.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: admin, error: adminError } = await db.from('admin_users').select('id').eq('user_id', identity.user.id).eq('is_active', true).maybeSingle();
  if (adminError || !admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { data: schools, error: schoolError } = await db.from('schools').select('id,school_name').eq('is_active', true);
  if (schoolError) return NextResponse.json({ error: 'School lookup failed' }, { status: 500 });
  const matches = (schools || []).filter(s => s.school_name.trim() === 'اختبار');
  if (matches.length !== 1) return NextResponse.json({ error: 'Expected exactly one test school' }, { status: 409 });
  const school = matches[0];
  const { data: profile, error: profileError } = await db.from('school_profiles').select('contact_mobile').eq('school_id', school.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 });
  const digits = (profile?.contact_mobile || '').replace(/[^0-9]/g, '').replace(/^00/, '');
  const recipient = digits.startsWith('966') ? digits : digits.startsWith('0') ? '966' + digits.slice(1) : '966' + digits;
  if (!/^9665\d{8}$/.test(recipient)) return NextResponse.json({ error: 'Invalid school contact mobile' }, { status: 422 });
  const allowlisted = (process.env.WHATSAPP_TEST_ALLOWED_RECIPIENT || '').replace(/[^0-9]/g, '').replace(/^00/, '');
  const allowedRecipient = allowlisted.startsWith('966') ? allowlisted : allowlisted.startsWith('0') ? '966' + allowlisted.slice(1) : '966' + allowlisted;
  if (!allowlisted || recipient !== allowedRecipient) return NextResponse.json({error:'رقم مدرسة اختبار لا يطابق المستلم المعتمد في Meta للتجربة'},{status:403});
  // Manual admin test: the indicator may already be submitted.
  // Use a distinct test indicator key so scheduled reminders retain their own deduplication.
  const week = indicatorWeek();
  let { data: reservation, error: reserveError } = await db.from('whatsapp_test_delivery_log').insert({school_id:school.id,indicator:'meta_sandbox_hello_world',week_start:week.start,status:'reserved'}).select('id').single();
  if (reserveError || !reservation) {
    // Retry only a provider-confirmed failed attempt; never resend reserved or sent messages.
    const retry = await db.from('whatsapp_test_delivery_log').update({status:'reserved',error_message:null,updated_at:new Date().toISOString()}).eq('school_id',school.id).eq('indicator','meta_sandbox_hello_world').eq('week_start',week.start).eq('status','failed').select('id').maybeSingle();
    reservation = retry.data;
    if (retry.error || !reservation) return NextResponse.json({ sent:false, reason:'A message was already sent or is being processed this week' }, { status:409 });
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
      method:'POST',
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:recipient,type:'template',template:{name:'hello_world',language:{code:'en_US'}}}),
      cache:'no-store',
    });
    const payload = await response.json();
    if (!response.ok || !payload?.messages?.[0]?.id) {
      await db.from('whatsapp_test_delivery_log').update({status:'failed',error_message:JSON.stringify(payload).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',reservation.id);
      return NextResponse.json({sent:false,error:payload?.error?.code === 133010 ? 'رقم الإرسال غير مسجل أو غير مفعّل في WhatsApp Cloud API لدى Meta (133010).' : (payload?.error?.message || 'WhatsApp provider rejected the message'),providerCode:payload?.error?.code,providerStatus:response.status},{status:502});
    }
    await db.from('whatsapp_test_delivery_log').update({status:'sent',provider_message_id:payload.messages[0].id,updated_at:new Date().toISOString()}).eq('id',reservation.id);
    return NextResponse.json({sent:true,school:'اختبار',providerMessageId:payload.messages[0].id});
  } catch {
    await db.from('whatsapp_test_delivery_log').update({status:'failed',error_message:'Network request failed',updated_at:new Date().toISOString()}).eq('id',reservation.id);
    return NextResponse.json({sent:false,error:'WhatsApp request failed'},{status:502});
  }
}

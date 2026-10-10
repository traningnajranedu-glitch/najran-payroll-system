import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { indicatorWeek } from '../../../../lib/weekly-indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sandbox only: one named school and one Meta-approved recipient. No bulk delivery.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const week = indicatorWeek();
  const day = new Date(week.today + 'T12:00:00Z').getUTCDay();
  if (day !== 0 && day !== 3) return NextResponse.json({ skipped: true, reason: 'Not scheduled weekday' });
  const kind = day === 0 ? 'week_open' : 'madrasati_pending';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: schools, error: schoolError } = await db.from('schools').select('id,school_name').eq('is_active', true);
  if (schoolError) return NextResponse.json({ error: 'School lookup failed' }, { status: 500 });
  const matches = (schools || []).filter(s => s.school_name.trim() === 'اختبار');
  if (matches.length !== 1) return NextResponse.json({ error: 'Expected one test school' }, { status: 409 });
  const school = matches[0];
  if (day === 3) {
    const { data: entries, error } = await db.from('school_madrasati_daily_indicators').select('id').eq('school_id', school.id).gte('indicator_date', week.start).lte('indicator_date', week.end).limit(1);
    if (error) return NextResponse.json({ error: 'Indicator lookup failed' }, { status: 500 });
    if (entries?.length) return NextResponse.json({ skipped: true, reason: 'Madrasati already submitted' });
  }
  const indicator = 'sandbox_' + kind;
  const { data: reserved, error: reserveError } = await db.from('whatsapp_test_delivery_log')
    .insert({ school_id: school.id, indicator, week_start: week.start, status: 'reserved' }).select('id').single();
  if (reserveError || !reserved) return NextResponse.json({ skipped: true, reason: 'Already reserved or sent this week' });
  const title = day === 0 ? 'بدء فترة إدخال المؤشرات الأسبوعية' : 'تذكير بإدخال مؤشر منصة مدرستي';
  const message = day === 0
    ? `فترة إدخال مؤشر منصة مدرستي ومؤشر الانضباط المدرسي مفتوحة لهذا الأسبوع من ${week.start} إلى ${week.end}. يرجى الدخول إلى البوابة وإدخال المؤشرات قبل نهاية الخميس.`
    : `لم يتم تسجيل مؤشر منصة مدرستي لهذا الأسبوع (${week.start} إلى ${week.end}). فترة الإدخال لا تزال مفتوحة حتى الخميس، يرجى استكمال الإدخال.`;
  const { error: notificationError } = await db.from('school_notifications').insert({
    school_id: school.id, title, message, notification_type: 'system', is_read: false,
  });
  if (notificationError) {
    await db.from('whatsapp_test_delivery_log').update({ status: 'failed', error_message: 'In-app notification: ' + notificationError.message }).eq('id', reserved.id);
    return NextResponse.json({ error: 'Could not create school notification' }, { status: 500 });
  }
  const digits = (process.env.WHATSAPP_TEST_ALLOWED_RECIPIENT || '').replace(/\D/g, '').replace(/^00/, '');
  const recipient = digits.startsWith('966') ? digits : digits.startsWith('0') ? '966' + digits.slice(1) : '966' + digits;
  const token = process.env.WHATSAPP_TEST_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID;
  if (!/^9665\d{8}$/.test(recipient) || !token || !phoneId) {
    await db.from('whatsapp_test_delivery_log').update({ status: 'failed', error_message: 'Sandbox configuration incomplete' }).eq('id', reserved.id);
    return NextResponse.json({ notificationCreated: true, whatsappSent: false, error: 'Sandbox configuration incomplete' }, { status: 503 });
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneId)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }),
      cache: 'no-store',
    });
    const payload = await response.json();
    const messageId = payload?.messages?.[0]?.id;
    await db.from('whatsapp_test_delivery_log').update({
      status: response.ok && messageId ? 'sent' : 'failed',
      provider_message_id: messageId || null,
      error_message: response.ok && messageId ? null : JSON.stringify(payload).slice(0, 900),
      updated_at: new Date().toISOString(),
    }).eq('id', reserved.id);
    return NextResponse.json({ notificationCreated: true, whatsappAccepted: Boolean(response.ok && messageId), kind, week: week.start });
  } catch {
    await db.from('whatsapp_test_delivery_log').update({ status: 'failed', error_message: 'Network failure' }).eq('id', reserved.id);
    return NextResponse.json({ notificationCreated: true, whatsappAccepted: false, error: 'Network failure' }, { status: 502 });
  }
}

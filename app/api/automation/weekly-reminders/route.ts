import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { indicatorWeek } from '../../../../lib/weekly-indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only preview. Deliberately no WhatsApp API calls or database writes.
// Scheduling this endpoint does not authorize live sending.
async function handler(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const cronAuthorized = Boolean(cronSecret) && request.headers.get('authorization') === 'Bearer ' + cronSecret;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Server configuration incomplete' }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  let authorized = cronAuthorized;
  if (!authorized) {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (token) {
      const { data: identity } = await db.auth.getUser(token);
      if (identity.user) {
        const { data: admin } = await db.from('admin_users').select('id').eq('user_id', identity.user.id).eq('is_active', true).maybeSingle();
        authorized = Boolean(admin);
      }
    }
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const week = indicatorWeek();
  const now = new Date();
  const riyadh = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = riyadh.find(p => p.type === 'weekday')?.value;
  const hour = Number(riyadh.find(p => p.type === 'hour')?.value);
  const [{ data: schools, error: schoolError }, { data: madrasati, error: madrasatiError }, { data: discipline, error: disciplineError }, { data: profiles, error: profileError }] = await Promise.all([
    db.from('schools').select('id,school_name,is_active,is_test').eq('is_active', true),
    db.from('school_madrasati_daily_indicators').select('school_id').gte('indicator_date', week.start).lte('indicator_date', week.end),
    db.from('school_discipline_daily').select('school_id').gte('attendance_date', week.start).lte('attendance_date', week.end),
    db.from('school_profiles').select('school_id,contact_mobile')
  ]);
  if (schoolError || madrasatiError || disciplineError || profileError)
    return NextResponse.json({ error: 'Indicator or school data lookup failed' }, { status: 503 });
  const submittedMadrasati = new Set((madrasati || []).map(r => r.school_id));
  const submittedDiscipline = new Set((discipline || []).map(r => r.school_id));
  const phones = new Map((profiles || []).map(p => [p.school_id, p.contact_mobile]));
  const normalize = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.startsWith('00966') ? digits.slice(2) : digits.startsWith('05') ? '966' + digits.slice(1) : digits.startsWith('5') ? '966' + digits : digits;
  };
  const eligible = (schools || []).filter(s => !s.is_test && s.school_name.trim() !== 'اختبار');
  const pending = eligible.map(s => {
    const tasks = [
      ...(!submittedMadrasati.has(s.id) ? ['madrasati'] : []),
      ...(!submittedDiscipline.has(s.id) ? ['discipline'] : [])
    ];
    return { school_id: s.id, school_name: s.school_name, tasks, has_valid_mobile: /^9665\d{8}$/.test(normalize(String(phones.get(s.id) || ''))) };
  }).filter(s => s.tasks.length > 0);
  const live = request.method === 'POST' || (cronAuthorized && weekday === 'Wed' && hour === 9);
  if (live) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return NextResponse.json({error:'WhatsApp sender configuration missing'}, {status:503});
    let accepted = 0, failed = 0, skipped = 0;
    const outcomes: {school_name:string; status:string; code?:number}[] = [];
    for (const school of pending) {
      if (!school.has_valid_mobile) { skipped++; continue; }
      const reservation = await db.from('weekly_whatsapp_reminder_delivery_log').insert({school_id:school.school_id,week_start:week.start,tasks:school.tasks,status:'reserved'}).select('id').single();
      if (reservation.error) {
        if (reservation.error.code === '23505') { skipped++; continue; }
        return NextResponse.json({error:'Reminder log reservation failed',accepted,failed,skipped}, {status:503});
      }
      const to = normalize(String(phones.get(school.school_id) || ''));
      const taskText = school.tasks.map(t => t === 'madrasati' ? 'إدخال مؤشر منصة مدرستي الأسبوعي' : 'إدخال مؤشر الانضباط المدرسي الأسبوعي').join('، و');
      const payload = {messaging_product:'whatsapp',to,type:'template',template:{name:'school_task_notification',language:{code:'ar'},components:[{type:'body',parameters:[{type:'text',parameter_name:'school_name',text:school.school_name.slice(0,120)},{type:'text',parameter_name:'task_name',text:taskText},{type:'text',parameter_name:'deadline',text:'الخميس من الأسبوع الحالي'}]}]}};
      try {
        const res = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'}/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result = await res.json().catch(()=>({}));
        const messageId = result?.messages?.[0]?.id;
        const ok = res.ok && typeof messageId === 'string';
        const code = result?.error?.code;
        await db.from('weekly_whatsapp_reminder_delivery_log').update({status:ok?'accepted':'failed',meta_message_id:ok?messageId:null,error_code:ok?null:String(code || res.status),updated_at:new Date().toISOString()}).eq('id',reservation.data.id);
        if(ok) accepted++; else failed++;
        outcomes.push({school_name:school.school_name,status:ok?'accepted':'failed',...(typeof code==='number'?{code}:{})});
      } catch {
        failed++;
        await db.from('weekly_whatsapp_reminder_delivery_log').update({status:'unknown',error_code:'network_error',updated_at:new Date().toISOString()}).eq('id',reservation.data.id);
        outcomes.push({school_name:school.school_name,status:'unknown'});
      }
    }
    return NextResponse.json({mode:'live',accepted,failed,skipped,delivery_confirmed:0,outcomes},{headers:{'Cache-Control':'no-store'}});
  }
  return NextResponse.json({
    mode: 'dry-run', sent: 0, live_sending_enabled: true,
    schedule: { weekday: 'Wednesday', time: '09:00', timezone: 'Asia/Riyadh', on_schedule: weekday === 'Wed' && hour === 9 },
    week, active_schools: eligible.length,
    pending_madrasati: pending.filter(s => s.tasks.includes('madrasati')).length,
    pending_discipline: pending.filter(s => s.tasks.includes('discipline')).length,
    pending_schools: pending.length,
    valid_recipients: pending.filter(s => s.has_valid_mobile).length,
    schools: pending
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) { return handler(request); }
export async function POST(request: NextRequest) { return handler(request); }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { indicatorWeek } from '../../../../lib/weekly-indicators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only preview. Deliberately no WhatsApp API calls or database writes.
// Scheduling this endpoint does not authorize live sending.
export async function GET(request: NextRequest) {
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
  return NextResponse.json({
    mode: 'dry-run', sent: 0, live_sending_enabled: false,
    schedule: { weekday: 'Wednesday', time: '09:00', timezone: 'Asia/Riyadh', on_schedule: weekday === 'Wed' && hour === 9 },
    week, active_schools: eligible.length,
    pending_madrasati: pending.filter(s => s.tasks.includes('madrasati')).length,
    pending_discipline: pending.filter(s => s.tasks.includes('discipline')).length,
    pending_schools: pending.length,
    valid_recipients: pending.filter(s => s.has_valid_mobile).length,
    schools: pending
  }, { headers: { 'Cache-Control': 'no-store' } });
}

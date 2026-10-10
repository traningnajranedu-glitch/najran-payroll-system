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
  const { data: schools, error } = await db.from('schools').select('id,school_name,whatsapp_number,is_active').eq('is_active', true);
  if (error) return NextResponse.json({ error: 'School lookup failed' }, { status: 500 });
  const matches = (schools || []).filter(s => s.school_name.trim() === 'اختبار');
  if (matches.length !== 1) return NextResponse.json({ error: 'Expected exactly one test school' }, { status: 409 });
  const school = matches[0];
  const week = indicatorWeek();
  const { data: entries, error: entryError } = await db.from('school_madrasati_daily_indicators').select('id').eq('school_id', school.id).gte('indicator_date', week.start).lte('indicator_date', week.end).limit(1);
  if (entryError) return NextResponse.json({ error: 'Indicator lookup failed' }, { status: 500 });
  const pending = !entries?.length;
  const configured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_REMINDER_TEMPLATE);
  // Preview only: this route never sends WhatsApp messages.
  return NextResponse.json({ school: 'اختبار', indicator: 'madrasati', week: {start:week.start,end:week.end}, pending, recipientConfigured: Boolean(school.whatsapp_number?.trim()), providerConfigured: configured, mode: 'dry-run', sent: false });
}

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  if (params.get('hub.mode') === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN &&
    params.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(params.get('hub.challenge') || '', { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !key || !url) return NextResponse.json({ error: 'Missing server configuration' }, { status: 503 });
  const raw = await request.text();
  const supplied = Buffer.from(request.headers.get('x-hub-signature-256') || '');
  const computed = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  if (supplied.length !== computed.length || !timingSafeEqual(supplied, computed)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }
  const body = JSON.parse(raw);
  const client = createClient(url, key);
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages' || String(change.value?.metadata?.phone_number_id) !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const message of change.value?.messages || []) {
        const phone = String(message.from || '').replace(/\D/g, '');
        if (!/^9665\d{8}$/.test(phone)) continue;
        const at = new Date(Number(message.timestamp) * 1000);
        if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() || at.getTime() < Date.now() - 30 * 86400000) continue;
        const { data: previous, error: readError } = await client.from('whatsapp_contact_windows').select('last_inbound_at').eq('phone', phone).maybeSingle();
        if (readError) return NextResponse.json({ error: 'Database read failed' }, { status: 503 });
        if (previous && Date.parse(previous.last_inbound_at) >= at.getTime()) continue;
        const { error } = await client.from('whatsapp_contact_windows').upsert({
          phone, last_inbound_at: at.toISOString(), last_message_id: String(message.id || ''), updated_at: new Date().toISOString()
        }, { onConflict: 'phone' });
        if (error) return NextResponse.json({ error: 'Database write failed' }, { status: 503 });
      }
    }
  }
  return NextResponse.json({ received: true });
}

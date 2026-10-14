import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

type Recipient = { school_id?: string | null; school_name?: string; phone?: string | null };

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('05')) return '966' + digits.slice(1);
  if (digits.startsWith('5')) return '966' + digits;
  return digits;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'غير مصرح بالدخول' }, { status: 401 });
    const { data: admin } = await supabase.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) return NextResponse.json({ error: 'هذه الخدمة متاحة لمدير النظام فقط' }, { status: 403 });

    const body = await request.json();
    const recipients: Recipient[] = Array.isArray(body.recipients) ? body.recipients : [];
    const message = String(body.message || '').trim();
    const documentUrl = body.documentUrl ? String(body.documentUrl).trim() : '';
    const sendMode = body.sendMode === 'direct' ? 'direct' : 'template';
    const content = documentUrl ? `${message}\n\n${documentUrl}` : message;
    if (!recipients.length) return NextResponse.json({ error: 'لا توجد مدارس مستهدفة' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'نص الرسالة مطلوب' }, { status: 400 });
    if (content.length > (sendMode === 'direct' ? 4096 : 900)) return NextResponse.json({ error: 'نص الرسالة مع الرابط أطول من الحد المسموح' }, { status: 400 });
    if (documentUrl && !/^https?:\/\//i.test(documentUrl)) return NextResponse.json({ error: 'أدخل رابطًا يبدأ بـ https:// أو http://' }, { status: 400 });

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
    if (!token || !phoneNumberId) return NextResponse.json({ error: 'لم يتم إعداد بيانات WhatsApp Cloud API في Vercel: WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID' }, { status: 500 });

    const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    let sent = 0, failed = 0;
    const errors: { school_name?: string; error: string; code?: number; subcode?: number; fbtrace_id?: string; error_type?: string }[] = [];

    for (const recipient of recipients) {
      const to = normalizePhone(String(recipient.phone || ''));
      if (!to || to.length < 10) { failed++; errors.push({ school_name: recipient.school_name, error: 'رقم واتساب غير صالح' }); continue; }

      // Meta enforces the 24-hour customer-service window for direct replies.
      const dueDate = String(body.dueDate || 'في أقرب وقت');
      const payload = sendMode === 'direct' ? {
        messaging_product: 'whatsapp', to, type: 'text',
        text: { body: content, preview_url: false }
      } : {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'school_task_notification',
          language: { code: 'ar' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', parameter_name: 'school_name', text: String(recipient.school_name || 'المدرسة').slice(0, 120) },
              { type: 'text', parameter_name: 'task_name', text: content },
              { type: 'text', parameter_name: 'deadline', text: dueDate.slice(0, 120) }
            ]
          }]
        }
      };

      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.messages?.[0]?.id) sent++; else {
        failed++;
        const code = result?.error?.code;
        const error = code === 131047
          ? 'انتهت نافذة الرد المباشر. اطلب من المدرسة إرسال رسالة إلى رقم البوابة، أو استخدم قالبًا معتمدًا.'
          : code === 132001 ? 'قالب المهمة غير متاح بالعربية في حساب واتساب الحالي. تحقق من اسمه واعتماده أو اختر رسالة مباشرة ضمن نافذة الرد.'
          : result?.error?.message || 'رفضت Meta عملية الإرسال';
        errors.push({ school_name: recipient.school_name, error, ...(typeof code === 'number' ? { code } : {}), ...(typeof result?.error?.error_subcode === 'number' ? { subcode: result.error.error_subcode } : {}), ...(typeof result?.error?.fbtrace_id === 'string' ? { fbtrace_id: result.error.fbtrace_id } : {}), ...(typeof result?.error?.type === 'string' ? { error_type: result.error.type } : {}) });
      }
    }

    return NextResponse.json({ sent, failed, errors: errors.slice(0, 20) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}

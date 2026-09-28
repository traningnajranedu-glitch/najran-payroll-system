import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return NextResponse.json({ error: 'إعدادات الخادم غير مكتملة.' }, { status: 500 });
    if (!accessToken) return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 });

    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 });

    const { data: admin } = await adminClient.from('admin_users').select('id,signature_path').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) return NextResponse.json({ error: 'حساب مدير النظام غير فعال.' }, { status: 403 });

    const form = await request.formData();
    const rawFile = form.get('signature');
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    if (!file) return NextResponse.json({ error: 'اختر صورة التوقيع.' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'التوقيع يجب أن يكون صورة.' }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'حجم صورة التوقيع يجب ألا يتجاوز 2 ميجابايت.' }, { status: 400 });

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const signaturePath = `admin/${admin.id}/signature.${ext}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await adminClient.storage.from('school-stamps').upload(signaturePath, bytes, { contentType: file.type, upsert: true, cacheControl: '3600' });
    if (uploadError) return NextResponse.json({ error: 'تعذر رفع التوقيع: ' + uploadError.message }, { status: 400 });
    if (admin.signature_path && admin.signature_path !== signaturePath) await adminClient.storage.from('school-stamps').remove([admin.signature_path]);

    const { error: updateError } = await adminClient.from('admin_users').update({ signature_path: signaturePath }).eq('id', admin.id);
    if (updateError) return NextResponse.json({ error: 'تعذر حفظ التوقيع: ' + updateError.message }, { status: 400 });

    const signatureUrl = adminClient.storage.from('school-stamps').getPublicUrl(signaturePath).data.publicUrl;
    return NextResponse.json({ success: true, signature_url: signatureUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' }, { status: 500 });
  }
}

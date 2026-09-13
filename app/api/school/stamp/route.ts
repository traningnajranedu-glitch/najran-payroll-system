import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'إعدادات الخادم غير مكتملة.' }, { status: 500 });
    }
    if (!accessToken) return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 });

    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 });

    const { data: schoolUser } = await adminClient
      .from('school_users')
      .select('school_id, is_active')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!schoolUser) return NextResponse.json({ error: 'حساب المدرسة غير فعال أو غير مرتبط بمدرسة.' }, { status: 403 });

    const form = await request.formData();
    const file = form.get('stamp');
    const managerName = String(form.get('manager_name') || '').trim();

    if (!(file instanceof File)) return NextResponse.json({ error: 'أرفق صورة الختم.' }, { status: 400 });
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'الختم يجب أن يكون صورة.' }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'حجم صورة الختم يجب ألا يتجاوز 2 ميجابايت.' }, { status: 400 });

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${schoolUser.school_id}/stamp.${ext}`;
    const bytes = await file.arrayBuffer();

    const { data: oldSchool } = await adminClient.from('schools').select('stamp_path').eq('id', schoolUser.school_id).maybeSingle();

    const { error: uploadError } = await adminClient.storage
      .from('school-stamps')
      .upload(path, bytes, { contentType: file.type, upsert: true, cacheControl: '3600' });

    if (uploadError) return NextResponse.json({ error: 'تعذر رفع الختم: ' + uploadError.message }, { status: 400 });

    if (oldSchool?.stamp_path && oldSchool.stamp_path !== path) {
      await adminClient.storage.from('school-stamps').remove([oldSchool.stamp_path]);
    }

    const { error: updateError } = await adminClient
      .from('schools')
      .update({ manager_name: managerName || null, stamp_path: path })
      .eq('id', schoolUser.school_id);

    if (updateError) return NextResponse.json({ error: 'تم رفع الختم لكن تعذر حفظ بيانات المدرسة: ' + updateError.message }, { status: 400 });

    const { data: publicUrl } = adminClient.storage.from('school-stamps').getPublicUrl(path);
    return NextResponse.json({ success: true, stamp_url: publicUrl.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' }, { status: 500 });
  }
}

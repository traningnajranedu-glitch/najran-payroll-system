import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'إعدادات الخادم غير مكتملة: أضف SUPABASE_SERVICE_ROLE_KEY في Vercel.' }, { status: 500 });
    }
    if (!accessToken) return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 });

    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 });

    const { data: admin } = await adminClient
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!admin) return NextResponse.json({ error: 'هذا الإجراء مخصص لمدير النظام.' }, { status: 403 });

    const body = await request.json();
    const schoolId = String(body.school_id || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim();

    if (!schoolId || !username || !password) return NextResponse.json({ error: 'المدرسة واسم المستخدم وكلمة المرور مطلوبة.' }, { status: 400 });
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ error: 'اسم المستخدم يجب أن يكون 3-40 حرفًا، وبأحرف إنجليزية صغيرة أو أرقام أو . _ - فقط.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف.' }, { status: 400 });

    const { data: school } = await adminClient.from('schools').select('id,school_name,is_active').eq('id', schoolId).maybeSingle();
    if (!school) return NextResponse.json({ error: 'المدرسة غير موجودة.' }, { status: 404 });
    if (!school.is_active) return NextResponse.json({ error: 'المدرسة غير مفعلة.' }, { status: 400 });

    const email = `${username}@schools.ceedu.local`;
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) return NextResponse.json({ error: createError?.message || 'تعذر إنشاء الحساب.' }, { status: 400 });

    const { error: mapError } = await adminClient.from('school_users').insert({
      auth_user_id: created.user.id,
      school_id: school.id,
      username,
      display_name: displayName || school.school_name,
      is_active: true,
    });

    if (mapError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: `تعذر ربط الحساب بالمدرسة: ${mapError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, username, school: school.school_name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' }, { status: 500 });
  }
}

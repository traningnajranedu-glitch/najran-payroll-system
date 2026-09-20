import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('إعدادات الخادم غير مكتملة.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: 'غير مصرح.' }, { status: 401 });

    const client = adminClient();
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: 'جلسة الدخول غير صالحة.' }, { status: 401 });

    const { data: schoolUser } = await client
      .from('school_users')
      .select('id,is_active,must_change_password')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!schoolUser || !schoolUser.is_active) {
      return NextResponse.json({ error: 'حساب المدرسة غير نشط.' }, { status: 403 });
    }

    const body = await request.json();
    const password = String(body.password || '');
    if (password.length < 8) {
      return NextResponse.json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' }, { status: 400 });
    }
    if (password === 'Aa123456') {
      return NextResponse.json({ error: 'يجب اختيار كلمة مرور جديدة مختلفة عن كلمة المرور المؤقتة.' }, { status: 400 });
    }

    const { error: updateError } = await client.auth.admin.updateUserById(user.id, { password });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    const { error: dbError } = await client
      .from('school_users')
      .update({ must_change_password: false })
      .eq('id', schoolUser.id);

    if (dbError) return NextResponse.json({ error: 'تم تغيير كلمة المرور ولكن تعذر تحديث حالة الحساب: ' + dbError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع.' }, { status: 500 });
  }
}

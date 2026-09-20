import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'إعدادات الخادم غير مكتملة: أضف SUPABASE_SERVICE_ROLE_KEY في Vercel.'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authorizeAdmin(request: Request) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '');

  if (!accessToken) {
    return {
      client: null,
      user: null,
      response: NextResponse.json(
        { error: 'غير مصرح.' },
        { status: 401 }
      ),
    };
  }

  const client = await getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      client: null,
      user: null,
      response: NextResponse.json(
        { error: 'جلسة الدخول غير صالحة.' },
        { status: 401 }
      ),
    };
  }

  const { data: admin } = await client
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!admin) {
    return {
      client: null,
      user: null,
      response: NextResponse.json(
        { error: 'هذا الإجراء مخصص لمدير النظام.' },
        { status: 403 }
      ),
    };
  }

  return {
    client,
    user,
    response: null,
  };
}

/**
 * إنشاء حساب مدرسة
 */
export async function POST(request: Request) {
  try {
    const auth = await authorizeAdmin(request);

    if (auth.response) {
      return auth.response;
    }

    const adminClient = auth.client!;

    const body = await request.json();

    const schoolId = String(body.school_id || '').trim();
    const username = String(body.username || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim();
    const mode = String(body.mode || '').trim();

    if (mode === 'bulk-default') {
      const defaultPassword = 'Aa123456';
      const { data: schools } = await adminClient
        .from('schools')
        .select('id,school_code,school_name,is_active')
        .eq('is_active', true)
        .order('school_code');
      const results: { school: string; username: string; created: boolean; message?: string }[] = [];
      for (const school of schools || []) {
        const username = String(school.school_code || '').trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
          results.push({ school: school.school_name, username, created: false, message: 'رمز المدرسة غير صالح لاسم مستخدم.' });
          continue;
        }
        const { data: existing } = await adminClient
          .from('school_users')
          .select('id,auth_user_id,username,is_active')
          .eq('school_id', school.id)
          .maybeSingle();
        if (existing) {
          results.push({ school: school.school_name, username: existing.username, created: false, message: 'الحساب موجود مسبقًا.' });
          continue;
        }
        const email = `${username}@schools.ceedu.local`;
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password: defaultPassword, email_confirm: true });
        if (createError || !created.user) {
          results.push({ school: school.school_name, username, created: false, message: createError?.message || 'تعذر إنشاء حساب الدخول.' });
          continue;
        }
        const { error: mapError } = await adminClient.from('school_users').insert({
          auth_user_id: created.user.id,
          school_id: school.id,
          username,
          display_name: school.school_name,
          is_active: true,
          must_change_password: true,
        });
        if (mapError) {
          await adminClient.auth.admin.deleteUser(created.user.id);
          results.push({ school: school.school_name, username, created: false, message: mapError.message });
          continue;
        }
        results.push({ school: school.school_name, username, created: true });
      }
      return NextResponse.json({ success: true, defaultPassword, results, created: results.filter(x => x.created).length, existing: results.filter(x => !x.created && x.message === 'الحساب موجود مسبقًا.').length });
    }

    if (!schoolId || !username || !password) {
      return NextResponse.json(
        {
          error:
            'المدرسة واسم المستخدم وكلمة المرور مطلوبة.',
        },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return NextResponse.json(
        {
          error:
            'اسم المستخدم يجب أن يكون 3-40 حرفًا، وبأحرف إنجليزية صغيرة أو أرقام أو . _ - فقط.',
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error:
            'كلمة المرور يجب ألا تقل عن 8 أحرف.',
        },
        { status: 400 }
      );
    }

    const { data: school } = await adminClient
      .from('schools')
      .select('id,school_name,is_active')
      .eq('id', schoolId)
      .maybeSingle();

    if (!school) {
      return NextResponse.json(
        { error: 'المدرسة غير موجودة.' },
        { status: 404 }
      );
    }

    if (!school.is_active) {
      return NextResponse.json(
        { error: 'المدرسة غير مفعلة.' },
        { status: 400 }
      );
    }

    const email = `${username}@schools.ceedu.local`;

    const {
      data: created,
      error: createError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ||
            'تعذر إنشاء الحساب.',
        },
        { status: 400 }
      );
    }

    const { error: mapError } = await adminClient
      .from('school_users')
      .insert({
        auth_user_id: created.user.id,
        must_change_password: true,
        school_id: school.id,
        username,
        display_name:
          displayName || school.school_name,
        is_active: true,
      });

    if (mapError) {
      await adminClient.auth.admin.deleteUser(
        created.user.id
      );

      return NextResponse.json(
        {
          error:
            `تعذر ربط الحساب بالمدرسة: ${mapError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      username,
      school: school.school_name,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'حدث خطأ غير متوقع.',
      },
      { status: 500 }
    );
  }
}

/**
 * تعديل حساب مدرسة
 */
export async function PUT(request: Request) {
  try {
    const auth = await authorizeAdmin(request);

    if (auth.response) {
      return auth.response;
    }

    const adminClient = auth.client!;

    const body = await request.json();

    const id = String(body.id || '').trim();
    const schoolId = String(body.school_id || '').trim();
    const username = String(body.username || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim();
    const isActive = Boolean(body.is_active);

    if (!id || !schoolId || !username) {
      return NextResponse.json(
        {
          error:
            'معرف الحساب والمدرسة واسم المستخدم مطلوبة.',
        },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return NextResponse.json(
        {
          error:
            'اسم المستخدم يجب أن يكون 3-40 حرفًا، وبأحرف إنجليزية صغيرة أو أرقام أو . _ - فقط.',
        },
        { status: 400 }
      );
    }

    if (password && password.length < 8) {
      return NextResponse.json(
        {
          error:
            'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.',
        },
        { status: 400 }
      );
    }

    const { data: account } = await adminClient
      .from('school_users')
      .select(
        'id,auth_user_id,school_id,username,display_name,is_active'
      )
      .eq('id', id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'حساب المدرسة غير موجود.' },
        { status: 404 }
      );
    }

    const { data: school } = await adminClient
      .from('schools')
      .select('id,school_name,is_active')
      .eq('id', schoolId)
      .maybeSingle();

    if (!school) {
      return NextResponse.json(
        { error: 'المدرسة غير موجودة.' },
        { status: 404 }
      );
    }

    if (!school.is_active && isActive) {
      return NextResponse.json(
        {
          error:
            'لا يمكن تفعيل حساب مدرسة غير مفعلة.',
        },
        { status: 400 }
      );
    }

    const email = `${username}@schools.ceedu.local`;

    const authUpdate: {
      email: string;
      email_confirm: boolean;
      password?: string;
    } = {
      email,
      email_confirm: true,
    };

    if (password) {
      authUpdate.password = password;
    }

    const {
      error: authUpdateError,
    } = await adminClient.auth.admin.updateUserById(
      account.auth_user_id,
      authUpdate
    );

    if (authUpdateError) {
      return NextResponse.json(
        {
          error:
            `تعذر تحديث بيانات الدخول: ${authUpdateError.message}`,
        },
        { status: 400 }
      );
    }

    const { error: dbError } = await adminClient
      .from('school_users')
      .update({
        school_id: schoolId,
        username,
        display_name:
          displayName || school.school_name,
        is_active: isActive,
        ...(password ? { must_change_password: true } : {}),
      })
      .eq('id', id);

    if (dbError) {
      return NextResponse.json(
        {
          error:
            `تم تحديث الدخول ولكن تعذر تحديث بيانات الحساب: ${dbError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      username,
      school: school.school_name,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'حدث خطأ غير متوقع.',
      },
      { status: 500 }
    );
  }
}

/**
 * حذف حساب مدرسة
 * يحذف حساب الدخول فقط ولا يحذف المدرسة أو الموظفين أو المسيرات.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await authorizeAdmin(request);

    if (auth.response) {
      return auth.response;
    }

    const adminClient = auth.client!;

    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return NextResponse.json(
        { error: 'معرف الحساب مطلوب.' },
        { status: 400 }
      );
    }

    const { data: account } = await adminClient
      .from('school_users')
      .select(
        'id,auth_user_id,school_id,username'
      )
      .eq('id', id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'حساب المدرسة غير موجود.' },
        { status: 404 }
      );
    }

    const {
      error: deleteAuthError,
    } = await adminClient.auth.admin.deleteUser(
      account.auth_user_id
    );

    if (deleteAuthError) {
      return NextResponse.json(
        {
          error:
            `تعذر حذف حساب الدخول: ${deleteAuthError.message}`,
        },
        { status: 400 }
      );
    }

    const { error: deleteDbError } =
      await adminClient
        .from('school_users')
        .delete()
        .eq('id', id);

    if (deleteDbError) {
      return NextResponse.json(
        {
          error:
            `تم حذف حساب الدخول ولكن تعذر حذف ربط الحساب: ${deleteDbError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      username: account.username,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'حدث خطأ غير متوقع.',
      },
      { status: 500 }
    );
  }
}

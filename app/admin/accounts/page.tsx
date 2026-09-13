'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  UserRound,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School = {
  id: string;
  school_code: string;
  school_name: string;
  is_active: boolean;
};

type SchoolUser = {
  id: string;
  school_id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
};

type EditForm = {
  id: string;
  school_id: string;
  username: string;
  password: string;
  display_name: string;
  is_active: boolean;
};

export default function SchoolAccountsPage() {
  const sb = supabaseBrowser();

  const [schools, setSchools] = useState<School[]>([]);
  const [accounts, setAccounts] = useState<SchoolUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    school_id: '',
    username: '',
    password: '',
    display_name: '',
  });

  const [editForm, setEditForm] = useState<EditForm | null>(null);

  async function load() {
    setLoading(true);
    setMessage('');
    setError('');

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      location.href = '/';
      return;
    }

    const { data: admin } = await sb
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!admin) {
      location.href = '/';
      return;
    }

    const [s, a] = await Promise.all([
      sb
        .from('schools')
        .select('id,school_code,school_name,is_active')
        .order('school_name'),

      sb
        .from('school_users')
        .select('id,school_id,username,display_name,is_active')
        .order('username'),
    ]);

    if (s.error) setError(s.error.message);
    if (a.error) setError(a.error.message);

    setSchools(s.data || []);
    setAccounts(a.data || []);

    if (!form.school_id && s.data?.[0]) {
      setForm((x) => ({
        ...x,
        school_id: s.data[0].id,
      }));
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function getAccessToken() {
    const {
      data: { session },
    } = await sb.auth.getSession();

    if (!session?.access_token) {
      setError('انتهت جلسة الدخول. أعد تسجيل الدخول.');
      return null;
    }

    return session.access_token;
  }

  async function createAccount() {
    setMessage('');
    setError('');

    if (
      !form.school_id ||
      !form.username.trim() ||
      form.password.length < 8
    ) {
      setError(
        'اختر المدرسة وأدخل اسم المستخدم وكلمة مرور لا تقل عن 8 أحرف.'
      );
      return;
    }

    setBusy(true);
    setMessage('جاري إنشاء حساب المدرسة…');

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setBusy(false);
      return;
    }

    const response = await fetch('/api/admin/school-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(form),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || 'تعذر إنشاء الحساب.');
    } else {
      setMessage(
        `تم إنشاء حساب المدرسة بنجاح. اسم المستخدم: ${result.username}`
      );

      setForm((x) => ({
        ...x,
        username: '',
        password: '',
        display_name: '',
      }));

      await load();
    }

    setBusy(false);
  }

  function openEdit(account: SchoolUser) {
    setMessage('');
    setError('');

    setEditForm({
      id: account.id,
      school_id: account.school_id,
      username: account.username,
      password: '',
      display_name: account.display_name || '',
      is_active: account.is_active,
    });
  }

  async function updateAccount() {
    if (!editForm) return;

    setMessage('');
    setError('');

    if (!editForm.school_id || !editForm.username.trim()) {
      setError('المدرسة واسم المستخدم مطلوبان.');
      return;
    }

    if (
      !/^[a-z0-9._-]{3,40}$/.test(
        editForm.username.trim().toLowerCase()
      )
    ) {
      setError(
        'اسم المستخدم يجب أن يكون 3-40 حرفًا، وبأحرف إنجليزية صغيرة أو أرقام أو . _ - فقط.'
      );
      return;
    }

    if (
      editForm.password &&
      editForm.password.length < 8
    ) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }

    setBusy(true);
    setMessage('جاري حفظ تعديلات الحساب…');

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setBusy(false);
      return;
    }

    const response = await fetch('/api/admin/school-account', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: editForm.id,
        school_id: editForm.school_id,
        username: editForm.username.trim().toLowerCase(),
        password: editForm.password,
        display_name: editForm.display_name.trim(),
        is_active: editForm.is_active,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || 'تعذر تعديل الحساب.');
    } else {
      setMessage('تم تعديل حساب المدرسة بنجاح.');
      setEditForm(null);
      await load();
    }

    setBusy(false);
  }

  async function deleteAccount(account: SchoolUser) {
    const school = schools.find(
      (s) => s.id === account.school_id
    );

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف حساب الدخول؟\n\nالمدرسة: ${
        school?.school_name || ''
      }\nاسم المستخدم: ${account.username}\n\nسيتم حذف حساب الدخول فقط، ولن يتم حذف المدرسة أو الموظفين أو مسيرات الرواتب.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage('جاري حذف حساب المدرسة…');
    setError('');

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setBusy(false);
      return;
    }

    const response = await fetch('/api/admin/school-account', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: account.id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || 'تعذر حذف الحساب.');
    } else {
      setMessage('تم حذف حساب الدخول بنجاح.');
      await load();
    }

    setBusy(false);
  }

  async function logout() {
    await sb.auth.signOut();
    location.href = '/';
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="card p-10">
          جارٍ تحميل حسابات المدارس…
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-slate-50 p-5 md:p-8"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto space-y-6">

        <header className="bg-[var(--navy)] text-white rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              حسابات المدارس
            </h1>

            <p className="text-sm text-blue-100 mt-1">
              إنشاء وإدارة حسابات الدخول الخاصة بالمدارس.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              className="bg-white/10 rounded-xl p-3"
              title="تحديث"
            >
              <RefreshCw size={18} />
            </button>

            <button
              type="button"
              onClick={logout}
              className="bg-white/10 rounded-xl px-4 py-2 flex items-center gap-2"
            >
              <LogOut size={17} />
              خروج
            </button>
          </div>
        </header>

        {message && (
          <div className="bg-green-50 text-green-800 border border-green-200 rounded-xl px-4 py-3 text-sm">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-800 border border-red-200 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <section className="card p-6">

          <div className="flex items-center gap-2 mb-5">
            <KeyRound size={20} />
            <h2 className="font-bold text-lg">
              فتح حساب مدرسة
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            <label>
              <span className="block text-sm font-semibold mb-2">
                المدرسة
              </span>

              <select
                value={form.school_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    school_id: e.target.value,
                  })
                }
                className="border rounded-xl px-4 py-3 w-full"
              >
                <option value="">
                  اختر المدرسة
                </option>

                {schools
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                    >
                      {s.school_name} — {s.school_code}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span className="block text-sm font-semibold mb-2">
                اسم المستخدم
              </span>

              <input
                value={form.username}
                onChange={(e) =>
                  setForm({
                    ...form,
                    username: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9._-]/g, ''),
                  })
                }
                className="border rounded-xl px-4 py-3 w-full"
                placeholder="مثال: school101"
                dir="ltr"
              />
            </label>

            <label>
              <span className="block text-sm font-semibold mb-2">
                كلمة المرور
              </span>

              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({
                    ...form,
                    password: e.target.value,
                  })
                }
                className="border rounded-xl px-4 py-3 w-full"
                placeholder="8 أحرف على الأقل"
                dir="ltr"
              />
            </label>

            <label>
              <span className="block text-sm font-semibold mb-2">
                اسم مسؤول الحساب
              </span>

              <input
                value={form.display_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    display_name: e.target.value,
                  })
                }
                className="border rounded-xl px-4 py-3 w-full"
                placeholder="اختياري"
              />
            </label>

          </div>

          <button
            type="button"
            disabled={busy}
            onClick={createAccount}
            className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={18} />

            {busy
              ? 'جاري الإنشاء…'
              : 'إنشاء حساب المدرسة'}
          </button>

          <p className="text-xs text-gray-500 mt-3">
            كلمة المرور لا تُحفظ في قاعدة البيانات، ويستخدم
            الحساب Supabase Auth بشكل آمن.
          </p>

        </section>

        <section className="card overflow-hidden">

          <div className="p-5 border-b">
            <h2 className="font-bold text-lg">
              الحسابات الحالية
            </h2>
          </div>

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right">
                    المدرسة
                  </th>

                  <th className="p-4 text-right">
                    اسم المستخدم
                  </th>

                  <th className="p-4 text-right">
                    مسؤول الحساب
                  </th>

                  <th className="p-4 text-right">
                    الحالة
                  </th>

                  <th className="p-4 text-right">
                    الإجراءات
                  </th>
                </tr>
              </thead>

              <tbody>

                {accounts.map((a) => {

                  const s = schools.find(
                    (x) => x.id === a.school_id
                  );

                  return (
                    <tr
                      key={a.id}
                      className="border-t"
                    >

                      <td className="p-4 font-semibold">
                        {s?.school_name || '—'}
                      </td>

                      <td
                        className="p-4"
                        dir="ltr"
                      >
                        {a.username}
                      </td>

                      <td className="p-4">
                        {a.display_name || '—'}
                      </td>

                      <td className="p-4">
                        {a.is_active ? (
                          <span className="text-green-700 font-semibold">
                            نشط
                          </span>
                        ) : (
                          <span className="text-red-700 font-semibold">
                            موقوف
                          </span>
                        )}
                      </td>

                      <td className="p-4">

                        <div className="flex gap-2">

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEdit(a)}
                            className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-1"
                          >
                            <Pencil size={16} />
                            تعديل
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              deleteAccount(a)
                            }
                            className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1"
                          >
                            <Trash2 size={16} />
                            حذف
                          </button>

                        </div>

                      </td>

                    </tr>
                  );
                })}

                {!accounts.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-gray-500"
                    >
                      <UserRound className="mx-auto mb-2" />
                      لا توجد حسابات مدارس بعد.
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>

        </section>

        <div className="text-sm text-gray-500">
          بعد إنشاء الحساب، يدخل مسؤول المدرسة من صفحة الدخول
          نفسها، ثم تظهر له موظفو مدرسته فقط.
        </div>

      </div>

      {editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">

          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">

            <div className="flex items-center justify-between mb-6">

              <div>
                <h2 className="text-xl font-bold">
                  تعديل حساب المدرسة
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  يمكنك تعديل بيانات الحساب أو إيقافه.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>

            </div>

            <div className="grid md:grid-cols-2 gap-4">

              <label>
                <span className="block text-sm font-semibold mb-2">
                  المدرسة
                </span>

                <select
                  value={editForm.school_id}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      school_id: e.target.value,
                    })
                  }
                  className="border rounded-xl px-4 py-3 w-full"
                >
                  {schools.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                    >
                      {s.school_name} — {s.school_code}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="block text-sm font-semibold mb-2">
                  اسم المستخدم
                </span>

                <input
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      username: e.target.value
                        .toLowerCase()
                        .replace(
                          /[^a-z0-9._-]/g,
                          ''
                        ),
                    })
                  }
                  className="border rounded-xl px-4 py-3 w-full"
                  dir="ltr"
                />
              </label>

              <label>
                <span className="block text-sm font-semibold mb-2">
                  كلمة مرور جديدة
                </span>

                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      password: e.target.value,
                    })
                  }
                  className="border rounded-xl px-4 py-3 w-full"
                  placeholder="اتركها فارغة إذا لا تريد تغييرها"
                  dir="ltr"
                />
              </label>

              <label>
                <span className="block text-sm font-semibold mb-2">
                  اسم مسؤول الحساب
                </span>

                <input
                  value={editForm.display_name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      display_name: e.target.value,
                    })
                  }
                  className="border rounded-xl px-4 py-3 w-full"
                />
              </label>

            </div>

            <label className="flex items-center gap-3 mt-5 cursor-pointer">

              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    is_active: e.target.checked,
                  })
                }
                className="w-5 h-5"
              />

              <span className="font-semibold">
                الحساب نشط
              </span>

            </label>

            <div className="flex gap-3 mt-6">

              <button
                type="button"
                disabled={busy}
                onClick={updateAccount}
                className="bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold disabled:opacity-50"
              >
                {busy
                  ? 'جاري الحفظ…'
                  : 'حفظ التعديلات'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setEditForm(null)}
                className="border rounded-xl px-6 py-3 font-semibold"
              >
                إلغاء
              </button>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}

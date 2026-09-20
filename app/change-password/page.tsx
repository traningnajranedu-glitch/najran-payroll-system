'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase';

export default function ChangePasswordPage() {
  const sb = supabaseBrowser();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (password !== confirm) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }

    setBusy(true);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      setError('انتهت جلسة الدخول. سجل الدخول مرة أخرى.');
      setBusy(false);
      return;
    }

    const response = await fetch('/api/school/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error || 'تعذر تغيير كلمة المرور.');
      setBusy(false);
      return;
    }

    setMessage('تم تغيير كلمة المرور بنجاح. سيتم تحويلك إلى لوحة المدرسة.');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 700);
  }

  async function logout() {
    await sb.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-[#f4f8f6] to-white" dir="rtl">
      <div className="w-full max-w-lg">
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-4 bg-white border border-emerald-100 rounded-2xl px-6 py-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#0b6b50] text-white flex items-center justify-center shadow-md">
              <ShieldCheck size={31} />
            </div>
            <div className="text-right border-r pr-4">
              <div className="font-bold text-[#07533e] text-lg">وزارة التعليم</div>
              <div className="font-semibold text-gray-700 text-sm mt-1">الإدارة العامة للتعليم بمنطقة نجران</div>
              <div className="text-xs text-gray-500 mt-1">قسم التعليم المستمر</div>
            </div>
          </div>
        </div>

        <div className="card p-7 md:p-8 border-t-4 border-t-[#0b6b50]">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-50 p-3 rounded-xl text-[#0b6b50]"><KeyRound size={23} /></div>
            <div>
              <h1 className="font-bold text-xl">تغيير كلمة المرور</h1>
              <p className="text-sm text-gray-500 mt-1">هذه أول مرة تدخل فيها بحساب المدرسة، ويجب تغيير كلمة المرور المؤقتة.</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-sm mb-5">
            كلمة المرور المؤقتة للحساب الجديد هي <strong dir="ltr">Aa123456</strong>. اختر كلمة مرور جديدة ولا تشاركها مع الآخرين.
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">كلمة المرور الجديدة</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-2 w-full border rounded-xl px-4 py-3.5"
                minLength={8}
                required
                autoComplete="new-password"
                dir="ltr"
                placeholder="8 أحرف على الأقل"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold">تأكيد كلمة المرور</span>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="mt-2 w-full border rounded-xl px-4 py-3.5"
                minLength={8}
                required
                autoComplete="new-password"
                dir="ltr"
                placeholder="أعد كتابة كلمة المرور"
              />
            </label>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm">{error}</div>}
            {message && <div className="bg-green-50 text-green-700 border border-green-100 rounded-xl p-3 text-sm">{message}</div>}

            <button
              disabled={busy}
              className="w-full bg-[#0b6b50] hover:bg-[#07533e] text-white rounded-xl py-3.5 font-bold disabled:opacity-60"
            >
              {busy ? 'جارٍ حفظ كلمة المرور…' : 'حفظ كلمة المرور والدخول'}
            </button>
          </form>

          <button type="button" onClick={logout} className="w-full mt-3 border rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
            <LogOut size={17} /> تسجيل الخروج
          </button>
        </div>
      </div>
    </main>
  );
}

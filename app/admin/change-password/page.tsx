'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight, KeyRound } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

export default function AdminChangePasswordPage() {
  const [sb] = useState(() => supabaseBrowser());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function checkAdmin() {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { location.replace('/'); return; }
        const { data: admin, error: adminError } = await sb.from('admin_users')
          .select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
        if (adminError) { setError('تعذر التحقق من الحساب. أعد تحميل الصفحة.'); return; }
        if (!admin) { location.replace('/'); return; }
        setLoading(false);
      } catch {
        setError('تعذر الاتصال. أعد تحميل الصفحة.');
      }
    }
    void checkAdmin();
  }, [sb]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage('');
    if (password.length < 8) { setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.'); return; }
    if (password !== confirm) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
    if (password === current) { setError('اختر كلمة مرور جديدة مختلفة عن الحالية.'); return; }
    setBusy(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user?.email) { setError('جلسة الدخول غير صالحة. سجل الدخول مجددًا.'); return; }
      const { data: admin, error: adminError } = await sb.from('admin_users')
        .select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
      if (adminError || !admin) { setError('تعذر التحقق من صلاحية مدير النظام.'); return; }

      // Verify the current password without replacing the browser's active session.
      const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: current });
      if (verifyError || verified.user?.id !== user.id) {
        setError(verifyError?.status === 429 ? 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.' : 'تعذر التحقق من كلمة المرور الحالية. تأكد منها وحاول مجددًا.');
        return;
      }
      await verifier.auth.signOut({ scope: 'local' });
      const { error: updateError } = await sb.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.code === 'weak_password' ? 'كلمة المرور لا تحقق متطلبات الأمان. اختر كلمة مرور أقوى.' : 'تعذر تغيير كلمة المرور. حاول مجددًا أو سجل الدخول من جديد.');
        return;
      }
      setCurrent(''); setPassword(''); setConfirm('');
      setMessage('تم تغيير كلمة المرور بنجاح. استخدم كلمة المرور الجديدة عند الدخول القادم.');
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مجددًا.');
    } finally {
      setBusy(false);
    }
  }

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800">
    <div className="max-w-xl mx-auto space-y-5">
      <a href="/admin" className="inline-flex items-center gap-2 text-emerald-800 font-semibold"><ArrowRight size={18} />العودة إلى حساب مدير النظام</a>
      <section className="bg-white border rounded-2xl shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800"><KeyRound size={26} /></div>
          <div><h1 className="text-xl font-bold">تغيير كلمة المرور</h1><p className="text-sm text-slate-500 mt-1">حساب مدير النظام</p></div>
        </div>
        {error && <p role="alert" className="mb-4 p-3 rounded-xl bg-red-50 text-red-800">{error}</p>}
        {message && <p role="status" className="mb-4 p-3 rounded-xl bg-green-50 text-green-800">{message}</p>}
        {loading ? <p role="status">جارٍ التحقق من الحساب…</p> : <form onSubmit={save} className="space-y-5">
          <label className="block"><span className="font-semibold text-sm">كلمة المرور الحالية</span>
            <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required disabled={busy} className="mt-2 w-full border rounded-xl px-4 py-3" /></label>
          <label className="block"><span className="font-semibold text-sm">كلمة المرور الجديدة</span>
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} disabled={busy} aria-describedby="password-help" className="mt-2 w-full border rounded-xl px-4 py-3" />
            <span id="password-help" className="block text-xs text-slate-500 mt-2">8 أحرف على الأقل. يُفضّل الجمع بين الحروف والأرقام والرموز.</span></label>
          <label className="block"><span className="font-semibold text-sm">تأكيد كلمة المرور الجديدة</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} disabled={busy} className="mt-2 w-full border rounded-xl px-4 py-3" /></label>
          <button type="submit" disabled={busy} className="w-full bg-emerald-800 text-white font-bold rounded-xl px-4 py-3 disabled:opacity-50">{busy ? 'جارٍ حفظ كلمة المرور…' : 'حفظ كلمة المرور'}</button>
        </form>}
      </section>
    </div>
  </main>;
}

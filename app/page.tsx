'use client';
import {useState} from 'react';
import {LogIn,ShieldCheck,School,LockKeyhole} from 'lucide-react';
import {supabaseBrowser} from '../lib/supabase';

export default function Home(){
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  async function login(e:React.FormEvent){
    e.preventDefault(); setLoading(true); setError('');
    const sb=supabaseBrowser();
    const email=username.includes('@')?username:`${username}@schools.ceedu.local`;
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error){setError('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');setLoading(false);return;}
    const userId=data.user?.id;
    if(!userId){setError('تعذر تحديد نوع الحساب.');setLoading(false);return;}
    const {data:admin}=await sb.from('admin_users').select('id').eq('user_id',userId).eq('is_active',true).maybeSingle();
    if(admin){window.location.href='/admin';return;}
    const {data:schoolUser}=await sb.from('school_users').select('id,school_id,is_active,must_change_password').eq('auth_user_id',userId).eq('is_active',true).maybeSingle();
    if(schoolUser){window.location.href=schoolUser.must_change_password?'/change-password':'/dashboard';return;}
    await sb.auth.signOut();setError('بيانات الدخول غير صحيحة أو حساب المدرسة غير مفعّل.');setLoading(false);
  }

  return <main id="main-content" className="min-h-screen relative overflow-hidden bg-[#062b60] flex items-center justify-center p-4 md:p-8" dir="rtl">
    <div className="absolute inset-0 opacity-30 pointer-events-none" style={{background:'radial-gradient(circle at 25% 18%,#168ee5,transparent 42%),radial-gradient(circle at 80% 90%,#ffbf12,transparent 45%)'}}/>
    <div className="relative z-10 w-full max-w-md">
      <div className="flex justify-center mb-5"><img src="/portal-brand.svg" alt="شعار بوابة رفاد لمدارس التعليم المستمر" className="w-48 h-48 md:w-56 md:h-56 rounded-[32px] shadow-2xl"/></div>
      <section className="bg-white/95 backdrop-blur rounded-[28px] shadow-2xl p-6 md:p-9 border border-[#f5ce62]">
        <h1 className="text-center text-2xl font-black text-[#073b7c] mb-2">تسجيل الدخول</h1>
        <p className="text-center text-slate-500 text-sm mb-6">مرحبًا بكم في بوابة رفاد لمدارس التعليم المستمر</p>
        <p className="text-center text-[#0759aa] font-semibold text-sm mb-7">إدارة التعليم بمنطقة نجران</p>
        <form onSubmit={login} className="space-y-4">
          <label className="block"><span className="text-sm font-semibold text-slate-700">اسم المستخدم</span><input value={username} onChange={e=>setUsername(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3.5" placeholder="اسم المستخدم" autoComplete="username"/></label>
          <label className="block"><span className="text-sm font-semibold text-slate-700">كلمة المرور</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3.5" placeholder="كلمة المرور" autoComplete="current-password"/></label>
          {error&&<div className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm">{error}</div>}
          <button disabled={loading} className="w-full bg-[#0759aa] hover:bg-[#073b7c] text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition">{loading?'جارٍ الدخول…':<><LogIn size={19}/> تسجيل الدخول</>}</button>
        </form>
        <div className="mt-7 pt-5 border-t border-slate-100 text-center"><p className="text-sm font-bold text-[#0759aa]">وزارة التعليم</p><p className="text-xs text-slate-500">الإدارة العامة للتعليم بمنطقة نجران — التعليم المستمر</p></div>
      </section>
      <p className="text-center text-xs text-[#fbe29c] mt-5">بوابة رفاد لمدارس التعليم المستمر</p>
    </div>
  </main>;
}

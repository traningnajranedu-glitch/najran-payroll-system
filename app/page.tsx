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

  return <main id="main-content" className="rifad-login-page min-h-screen flex items-center justify-center px-4 py-6 md:py-10" dir="rtl">
    <section className="rifad-login-poster relative isolate w-full max-w-[420px] min-h-[660px] overflow-hidden rounded-[22px] border border-[#d8e8fa] shadow-[0_16px_45px_rgba(6,45,104,.14)] bg-white flex flex-col items-center px-7 sm:px-10 pt-8 pb-24 text-center">
      <div className="rifad-login-corner" aria-hidden="true"/>
      <div className="relative z-10 self-start text-right text-[#008c83] font-extrabold text-xs leading-5"><span className="block tracking-[.18em] text-base">وزارة التعليم</span><span className="block text-[9px] font-medium text-slate-500">Ministry of Education</span></div>
      <img src="/portal-brand.png.png?v=rifad-official-20261021" alt="شعار بوابة رفاد" className="relative z-10 w-44 h-32 sm:w-52 sm:h-36 object-contain mt-1"/>
      <h1 className="relative z-10 text-[24px] font-black text-[#0b3d91] mt-1">مرحباً بك في بوابة رفاد</h1>
      <p className="relative z-10 text-[#4d6c92] text-[13px] leading-6 mt-2 max-w-[310px]">إدارة مكافآت العاملين في مدارس التعليم المستمر<br/>بإدارة التعليم بمنطقة نجران</p>
      <form onSubmit={login} className="relative z-10 w-full space-y-3 mt-6 text-right">
        <label className="relative block"><span className="sr-only">اسم المستخدم</span><input value={username} onChange={e=>setUsername(e.target.value)} required className="w-full h-12 rounded-xl border border-[#d9e5f4] bg-white px-4 pr-11 text-sm text-[#123b70] placeholder:text-[#7290b3]" placeholder="اسم المستخدم" autoComplete="username"/><School size={18} aria-hidden="true" className="absolute right-4 top-[15px] text-[#6f8aaa]"/></label>
        <label className="relative block"><span className="sr-only">كلمة المرور</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full h-12 rounded-xl border border-[#d9e5f4] bg-white px-4 pr-11 text-sm text-[#123b70] placeholder:text-[#7290b3]" placeholder="كلمة المرور" autoComplete="current-password"/><LockKeyhole size={18} aria-hidden="true" className="absolute right-4 top-[15px] text-[#6f8aaa]"/></label>
        {error&&<div role="alert" className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm">{error}</div>}
        <button disabled={loading} className="w-full h-12 bg-[#0769cb] hover:bg-[#0b3d91] text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition">{loading?'جارٍ الدخول…':<><LogIn size={18}/> تسجيل الدخول</>}</button>
      </form>
      <p className="relative z-10 mt-5 text-xs text-[#0865bf] font-medium">بوابة رفاد لمدارس التعليم المستمر</p>
      <div className="rifad-poster-waves" aria-hidden="true"><div className="rifad-wave-gold"/><div className="rifad-wave-blue"/><div className="rifad-wave-navy"/></div>
    </section>
  </main>;
}

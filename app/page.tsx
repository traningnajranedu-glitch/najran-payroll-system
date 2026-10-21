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

  return <main id="main-content" className="rifad-login min-h-screen bg-[#edf5fd] flex items-center justify-center p-4 md:p-8" dir="rtl">
    <div className="rifad-login-shell w-full max-w-6xl grid lg:grid-cols-2 overflow-hidden rounded-[28px] shadow-2xl bg-white">
      <section className="rifad-login-intro relative min-h-[260px] lg:min-h-[680px] flex flex-col justify-center items-center text-center px-7 py-12">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#fbbf24]/20 blur-3xl pointer-events-none"/>
        <img src="/portal-brand.png.png?v=rifad-official-20261021" alt="شعار رفاد الأصلي" className="relative w-48 md:w-64 h-auto rounded-2xl object-contain"/>
        <h1 className="relative text-3xl font-black text-[#0b3d91] mt-5">مرحباً بك في بوابة رفاد</h1>
        <p className="relative text-[#43658c] mt-3 max-w-md leading-8">إدارة مكافآت العاملين في مدارس التعليم المستمر بإدارة التعليم بمنطقة نجران</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3 text-sm"><span className="rounded-full bg-white/80 px-4 py-2 text-[#0b3d91] shadow-sm"><ShieldCheck className="inline ml-2" size={17}/>بيئة آمنة</span><span className="rounded-full bg-white/80 px-4 py-2 text-[#0b3d91] shadow-sm"><School className="inline ml-2" size={17}/>خدمات المدارس</span></div>
        <div className="rifad-login-wave" aria-hidden="true"/>
      </section>
      <section className="rifad-login-form flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="flex items-center gap-3 mb-10"><span className="h-10 w-2 rounded-full bg-[#fbbf24]"/><div><p className="font-black text-[#0b3d91] text-xl">بوابة رفاد</p><p className="text-sm text-slate-500">وزارة التعليم · تعليم نجران</p></div></div>
        <div className="mb-8"><h2 className="text-3xl font-black text-[#0b3d91]">تسجيل الدخول</h2><p className="text-slate-500 mt-3">أدخل بيانات حسابك للوصول إلى خدمات البوابة</p></div>
        <form onSubmit={login} className="space-y-5">
          <label className="block"><span className="block text-sm font-bold text-[#153b70] mb-2">اسم المستخدم</span><input value={username} onChange={e=>setUsername(e.target.value)} required className="w-full border border-[#d8e5f4] bg-[#f8fbff] rounded-xl px-4 py-4 focus:border-[#1479df]" placeholder="اسم المستخدم" autoComplete="username"/></label>
          <label className="block"><span className="block text-sm font-bold text-[#153b70] mb-2">كلمة المرور</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="w-full border border-[#d8e5f4] bg-[#f8fbff] rounded-xl px-4 py-4 focus:border-[#1479df]" placeholder="كلمة المرور" autoComplete="current-password"/></label>
          {error&&<div role="alert" className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm">{error}</div>}
          <button disabled={loading} className="w-full bg-[#0865c5] hover:bg-[#0b3d91] text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition">{loading?'جارٍ الدخول…':<><LogIn size={19}/> تسجيل الدخول</>}</button>
        </form>
        <div className="mt-10 pt-6 border-t border-[#e4edf8] text-center"><p className="text-sm font-semibold text-[#0b3d91]">معاً لتميز التعليم المستمر</p><p className="text-xs text-slate-500 mt-2">الإدارة العامة للتعليم بمنطقة نجران</p></div>
      </section>
    </div>
  </main>;
}

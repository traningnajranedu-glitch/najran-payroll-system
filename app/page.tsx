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
    e.preventDefault();
    setLoading(true);setError('');
    const sb=supabaseBrowser();
    const email=username.includes('@')?username:`${username}@schools.ceedu.local`;
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error){setError('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');setLoading(false);return;}
    const userId=data.user?.id;
    if(!userId){setError('تعذر تحديد نوع الحساب.');setLoading(false);return;}
    const {data:admin}=await sb.from('admin_users').select('id').eq('user_id',userId).eq('is_active',true).maybeSingle();
    if(admin){window.location.href='/admin';return;}
    const {data:schoolUser}=await sb.from('school_users').select('id,school_id,is_active').eq('auth_user_id',userId).eq('is_active',true).maybeSingle();
    if(schoolUser){window.location.href='/dashboard';return;}
    await sb.auth.signOut();setError('بيانات الدخول غير صحيحة أو حساب المدرسة غير مفعّل.');setLoading(false);
  }

  return <main className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-[#f4f8f6] to-white">
    <div className="w-full max-w-lg">
      <div className="text-center mb-7">
        <div className="inline-flex items-center gap-4 bg-white border border-emerald-100 rounded-2xl px-6 py-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0b6b50] to-[#0b7894] text-white flex items-center justify-center shadow-md"><School size={31}/></div>
          <div className="text-right border-r pr-4">
            <div className="font-bold text-[#07533e] text-lg">وزارة التعليم</div>
            <div className="font-semibold text-gray-700 text-sm mt-1">الإدارة العامة للتعليم بمنطقة نجران</div>
            <div className="text-xs text-gray-500 mt-1">قسم التعليم المستمر</div>
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mt-7 text-[#07533e]">نظام مسيرات الرواتب</h1>
        <p className="text-gray-500 mt-2">نظام إلكتروني لإدارة مسيرات موظفي المدارس</p>
      </div>

      <div className="card p-7 md:p-8 border-t-4 border-t-[#0b6b50]">
        <div className="flex items-center gap-3 mb-7">
          <div className="bg-emerald-50 p-3 rounded-xl text-[#0b6b50]"><ShieldCheck size={23}/></div>
          <div><h2 className="font-bold text-lg">تسجيل الدخول</h2><p className="text-sm text-gray-500 mt-1">الدخول المخصص للمدارس والإدارة</p></div>
        </div>
        <form onSubmit={login} className="space-y-4">
          <label className="block"><span className="text-sm font-semibold">اسم المستخدم</span><input value={username} onChange={e=>setUsername(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3.5" placeholder="اسم المستخدم" autoComplete="username"/></label>
          <label className="block"><span className="text-sm font-semibold">كلمة المرور</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3.5" placeholder="••••••••" autoComplete="current-password"/></label>
          {error&&<div className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 text-sm">{error}</div>}
          <button disabled={loading} className="w-full bg-[#0b6b50] hover:bg-[#07533e] text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition">{loading?'جارٍ الدخول…':<><LogIn size={19}/> دخول آمن</>}</button>
        </form>
        <div className="mt-6 pt-5 border-t border-gray-100 text-xs text-gray-400 flex gap-2 items-center justify-center"><LockKeyhole size={14}/> يتم حفظ بيانات الدخول عبر نظام المصادقة الآمن</div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">الإدارة العامة للتعليم بمنطقة نجران — قسم التعليم المستمر</p>
    </div>
  </main>
}

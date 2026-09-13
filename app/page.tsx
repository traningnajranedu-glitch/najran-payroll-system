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

    // School accounts are created with the internal email suffix below.
    // Admin accounts may still use their normal email address.
    const email=username.includes('@')?username:`${username}@schools.ceedu.local`;

    const {data,error}=await sb.auth.signInWithPassword({email,password});

    if(error){
      setError('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');
      setLoading(false);
      return;
    }

    const userId=data.user?.id;

    if(!userId){
      setError('تعذر تحديد نوع الحساب.');
      setLoading(false);
      return;
    }

    // First check whether this is an active system administrator.
    const {data:admin}=await sb
      .from('admin_users')
      .select('id')
      .eq('user_id',userId)
      .eq('is_active',true)
      .maybeSingle();

    if(admin){
      window.location.href='/admin';
      return;
    }

    // Otherwise the account must be an active school account.
    const {data:schoolUser}=await sb
      .from('school_users')
      .select('id,school_id,is_active')
      .eq('auth_user_id',userId)
      .eq('is_active',true)
      .maybeSingle();

    if(schoolUser){
      window.location.href='/dashboard';
      return;
    }

    await sb.auth.signOut();
    setError('بيانات الدخول غير صحيحة أو حساب المدرسة غير مفعّل.');
    setLoading(false);
  }

  return <main className="min-h-screen flex items-center justify-center p-5"><div className="w-full max-w-md"><div className="text-center mb-7"><div className="mx-auto w-20 h-20 rounded-2xl bg-[var(--navy)] text-white flex items-center justify-center shadow-lg"><School size={38}/></div><h1 className="text-2xl font-bold mt-5 text-[var(--navy)]">نظام مسيرات الرواتب</h1><p className="text-gray-500 mt-2">إدارة التعليم بمنطقة نجران</p></div><div className="card p-7"><div className="flex items-center gap-3 mb-6"><div className="bg-blue-50 p-3 rounded-xl text-[var(--navy)]"><ShieldCheck size={22}/></div><div><h2 className="font-bold">تسجيل الدخول</h2><p className="text-sm text-gray-500">الدخول المخصص للمدارس والإدارة</p></div></div><form onSubmit={login} className="space-y-4"><label className="block"><span className="text-sm font-semibold">اسم المستخدم</span><input value={username} onChange={e=>setUsername(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3" placeholder="اسم المدرسة / المستخدم"/></label><label className="block"><span className="text-sm font-semibold">كلمة المرور</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="mt-2 w-full border rounded-xl px-4 py-3" placeholder="••••••••"/></label>{error&&<div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>}<button disabled={loading} className="w-full bg-[var(--navy)] text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 disabled:opacity-60">{loading?'جارٍ الدخول…':<><LogIn size={19}/> دخول آمن</>}</button></form><div className="mt-6 text-xs text-gray-400 flex gap-2 items-center justify-center"><LockKeyhole size={14}/> يتم حفظ كلمات المرور عبر نظام المصادقة الآمن</div></div><p className="text-center text-xs text-gray-400 mt-6">الإصدار الأول — نظام مركزي لإدارة مسيرات المدارس</p></div></main>
}

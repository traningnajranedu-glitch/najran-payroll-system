'use client';
import { useEffect,useState } from 'react';
import { BarChart3,School,GraduationCap,ArrowRight } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';
export default function IndicatorForms(){
 const sb=supabaseBrowser(); const [ok,setOk]=useState(false);
 useEffect(()=>{(async()=>{const {data:{user}}=await sb.auth.getUser();if(!user){location.href='/';return}const {data}=await sb.from('school_users').select('school_id').eq('auth_user_id',user.id).eq('is_active',true).maybeSingle();if(!data){location.href='/dashboard';return}setOk(true)})()},[]);
 if(!ok)return <main className="min-h-screen grid place-items-center">جارٍ التحميل…</main>;
 const cards=[
  {title:'مؤشر منصة مدرستي',desc:'الإدخال اليومي لنسب الدخول والتفعيل والدعم',href:'/dashboard/indicators/madrasati',icon:BarChart3,active:true},
  {title:'مؤشر الانضباط المدرسي',desc:'تسجيل حضور الطلاب والغياب والتأخر وحساب الانتظام',href:'/dashboard/indicators/discipline',icon:School,active:true},
  {title:'مؤشر التحصيل العلمي',desc:'إدخال نتائج الطلاب وحساب الإتقان والنجاح والتحسن',href:'/dashboard/indicators/achievement',icon:GraduationCap,active:true}
 ];
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-5xl mx-auto"><a href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold mb-6"><ArrowRight size={18}/>العودة لخدمات المدرسة</a><h1 className="text-3xl font-black text-[var(--navy)]">نماذج إدخال المؤشرات</h1><p className="text-gray-500 mt-2 mb-7">اختر المؤشر المطلوب لإدخال بيانات المدرسة.</p><div className="grid md:grid-cols-3 gap-5">{cards.map(({title,desc,href,icon:Icon,active})=><a key={title} href={active?href:undefined} className={'rounded-2xl border bg-white p-6 shadow-sm '+(active?'hover:shadow-lg cursor-pointer':'opacity-60 cursor-not-allowed')}><div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 grid place-items-center mb-4"><Icon size={28}/></div><h2 className="text-xl font-black">{title}</h2><p className="text-sm text-gray-500 mt-2">{desc}</p><div className="mt-5 text-sm font-bold text-emerald-700">{active?'فتح النموذج ←':'قريبًا'}</div></a>)}</div></div></main>
}
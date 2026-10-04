'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Award, Printer, Trophy } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School={id:string;school_name:string;manager_name:string|null};
type MonthlyAward={id:string;month_key:string;rank:number;total_score:number;login_score:number;payroll_score:number;achievements_score:number;activities_score:number;employee_updates_score:number;issued_at:string};

export default function AwardsPage(){
  const sb=supabaseBrowser();
  const [school,setSchool]=useState<School|null>(null);
  const [awards,setAwards]=useState<MonthlyAward[]>([]);
  const [selected,setSelected]=useState<MonthlyAward|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    const {data:{user}}=await sb.auth.getUser();
    if(!user){location.href='/';return;}
    const {data:su}=await sb.from('school_users').select('school_id,schools(id,school_name,manager_name)').eq('auth_user_id',user.id).eq('is_active',true).single();
    if(!su){setLoading(false);return;}
    const current=su.schools as unknown as School; setSchool(current);
    const {data}=await sb.from('school_monthly_awards').select('id,month_key,rank,total_score,login_score,payroll_score,achievements_score,activities_score,employee_updates_score,issued_at').eq('school_id',su.school_id).order('month_key',{ascending:false});
    const list=(data||[]) as MonthlyAward[]; setAwards(list); setSelected(list[0]||null); setLoading(false);
  })();},[]);

  if(loading)return <main className="min-h-screen grid place-items-center bg-slate-50" dir="rtl">جارٍ تحميل الشهادات…</main>;
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8" dir="rtl">
    <div className="mx-auto max-w-6xl print:max-w-none">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <div><h1 className="text-2xl font-black text-slate-900">شهادات التميز</h1><p className="mt-1 text-sm text-slate-500">سجل شهادات التميز الشهرية الخاصة بالمدرسة</p></div>
        <a href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 font-bold text-slate-700"><ArrowRight size={18}/> العودة للرئيسية</a>
      </div>
      {!awards.length?<div className="rounded-3xl border border-dashed bg-white p-12 text-center print:hidden"><Award className="mx-auto text-slate-300" size={48}/><div className="mt-4 font-black text-slate-700">لا توجد شهادات تميز صادرة حتى الآن</div></div>:
      <div className="grid gap-6 lg:grid-cols-[300px_1fr] print:block">
        <aside className="space-y-3 print:hidden">{awards.map(a=><button key={a.id} onClick={()=>setSelected(a)} className={`w-full rounded-2xl border p-4 text-right shadow-sm transition ${selected?.id===a.id?'border-amber-400 bg-amber-50':'bg-white hover:bg-slate-50'}`}><div className="flex items-center justify-between"><span className="font-black">شهر {a.month_key.slice(0,7)}</span><Trophy size={19} className="text-amber-600"/></div><div className="mt-2 text-sm text-slate-600">المركز {a.rank} · {Number(a.total_score).toFixed(1)}%</div></button>)}</aside>
        {selected&&<section className="overflow-hidden rounded-[32px] border-4 border-amber-300 bg-white shadow-xl print:shadow-none print:border-amber-500">
          <div className="bg-gradient-to-l from-[#063f49] to-[#087f78] px-8 py-7 text-center text-white"><div className="text-sm font-bold">وزارة التعليم · الإدارة العامة للتعليم بمنطقة نجران</div><div className="mt-2 text-xs text-white/80">إدارة التعليم المستمر</div></div>
          <div className="px-7 py-10 text-center sm:px-14">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Trophy size={42}/></div>
            <div className="mt-5 text-sm font-black tracking-widest text-amber-700">شـهـادة تـمـيـز</div>
            <h2 className="mt-3 text-3xl font-black text-slate-900">تهنئة وتقدير</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-9 text-slate-600">تُمنح هذه الشهادة إلى <b className="text-slate-900">{school?.school_name}</b> تقديرًا لتميزها وتحقيقها <b className="text-amber-700">المركز {selected.rank}</b> في مؤشر التنافس بين مدارس التعليم المستمر لشهر <b>{selected.month_key.slice(0,7)}</b>.</p>
            <div className="mx-auto mt-7 max-w-md rounded-3xl bg-amber-50 p-6"><div className="text-sm font-bold text-amber-800">نسبة الإنجاز الإجمالية</div><div className="mt-1 text-5xl font-black text-amber-700">{Number(selected.total_score).toFixed(1)}%</div></div>
            <div className="mt-8 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">{[['تسجيل الدخول',selected.login_score],['اعتماد المسير',selected.payroll_score],['المنجزات',selected.achievements_score],['الأنشطة',selected.activities_score],['تحديث الموظفين',selected.employee_updates_score]].map(([n,v])=><div key={String(n)} className="rounded-2xl border bg-slate-50 p-3"><div className="font-black text-slate-800">{Number(v).toFixed(1)}</div><div className="mt-1 text-xs text-slate-500">{n}</div></div>)}</div>
            <div className="mt-12 grid grid-cols-2 gap-10 text-sm"><div><div className="font-black">مدير المدرسة</div><div className="mt-8 border-t pt-2 text-slate-500">{school?.manager_name||'التوقيع'}</div></div><div><div className="font-black">إدارة التعليم المستمر</div><div className="mt-8 border-t pt-2 text-slate-500">الختم والتوقيع</div></div></div>
            <div className="mt-8 text-xs text-slate-400">صدرت إلكترونيًا بتاريخ {new Date(selected.issued_at).toLocaleDateString('ar-SA')}</div>
          </div>
        </section>}
      </div>}
      {selected&&<button type="button" onClick={()=>window.print()} className="fixed bottom-6 left-6 inline-flex items-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 font-black text-white shadow-xl print:hidden"><Printer size={19}/> طباعة الشهادة</button>}
    </div>
  </main>;
}
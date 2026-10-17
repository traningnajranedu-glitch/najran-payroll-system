'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabaseBrowser} from '../../../../lib/supabase';
type Publication={id:string;week_start:string;week_end:string;published_at:string|null};
type Metric={id:string;indicator_key:number;metrics:Record<string,number>;source_file:string;row_count:number};
const labels=['الدخول والوصول','الجدول المدرسي','الأدوات والأنشطة','إعداد الدروس','المؤشر الخامس'];
export default function SchoolMadrasati(){
 const sb=useMemo(()=>supabaseBrowser(),[]);
 const [weeks,setWeeks]=useState<Publication[]>([]),[selected,setSelected]=useState(''),[rows,setRows]=useState<Metric[]>([]),[message,setMessage]=useState('جارٍ تحميل المؤشرات المعتمدة…');
 useEffect(()=>{void (async()=>{const {data:{user}}=await sb.auth.getUser();if(!user){location.href='/';return;}
 const school=await sb.from('school_users').select('school_id').eq('auth_user_id',user.id).eq('is_active',true).maybeSingle();
 if(!school.data){setMessage('هذه الصفحة مخصصة لحساب المدرسة.');return;}
 const p=await sb.from('madrasati_weekly_publications').select('id,week_start,week_end,published_at').eq('status','published').order('week_start',{ascending:false}).limit(52);
 if(p.error){setMessage('تعذر تحميل النتائج: '+p.error.message);return;}
 const items=(p.data||[]) as Publication[];setWeeks(items);setSelected(items[0]?.id||'');if(!items.length)setMessage('لم تُنشر مؤشرات مدرستي لهذا الأسبوع بعد.');})();},[sb]);
 useEffect(()=>{if(!selected)return;void (async()=>{const {data,error}=await sb.from('madrasati_weekly_school_metrics').select('id,indicator_key,metrics,source_file,row_count').eq('publication_id',selected).order('indicator_key');if(error){setMessage('تعذر تحميل مؤشرات المدرسة: '+error.message);return;}setRows((data||[]) as Metric[]);setMessage('');})();},[sb,selected]);
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-5xl space-y-5"><Link href="/dashboard/indicators" className="font-bold text-blue-800">العودة إلى التقارير والمؤشرات</Link><h1 className="text-3xl font-black">مؤشر منصة مدرستي</h1><p className="text-slate-600">النتائج الأسبوعية المعتمدة من مدير النظام. البيانات للعرض فقط ولا تحتاج إلى إدخال أو تحديث من المدرسة.</p><label className="block rounded-xl bg-white border p-4">الأسبوع المنشور <select className="mr-3 rounded border p-2" value={selected} onChange={e=>setSelected(e.target.value)}>{weeks.map(w=><option key={w.id} value={w.id}>{w.week_start} إلى {w.week_end}</option>)}</select></label>
 {message&&<p role="status" className="rounded-xl border bg-white p-5">{message}</p>}
 <div className="grid gap-4 md:grid-cols-2">{rows.map(row=><section key={row.id} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-black">{labels[row.indicator_key-1]||'مؤشر مدرستي'}</h2><p className="text-xs text-slate-500 mt-2">السجلات: {row.row_count}</p>{Object.entries(row.metrics||{}).map(([key,value])=><div key={key} className="mt-3 border-t pt-3 flex justify-between gap-3"><span>{key}</span><strong>{Number(value).toFixed(1)}%</strong></div>)}{!Object.keys(row.metrics||{}).length&&<p className="text-slate-500 mt-3">لا تتضمن بيانات المؤشر أعمدة نسب قابلة للعرض.</p>}</section>)}</div>
 {selected&&!message&&!rows.length&&<p className="rounded-xl bg-white p-5">لا توجد مؤشرات منشورة لهذه المدرسة في الأسبوع المختار.</p>}</div></main>;
}

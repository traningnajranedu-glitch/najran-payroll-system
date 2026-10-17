'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {supabaseBrowser} from '../../../lib/supabase';
import {indicatorWeek} from '../../../lib/weekly-indicators';

type School={id:string;school_name:string};
type Sheet={file:string;rows:Record<string,unknown>[];column:string};
type Result={school:School;indicator:number;source:string;metrics:Record<string,number>;count:number};
const labels=['قائمة مدارس البوابة','الدخول والوصول','الجدول المدرسي','الأدوات والأنشطة','إعداد الدروس'];
function norm(value:unknown){
 return String(value??'').toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
 .replace(/[ـ\u064b-\u065f]/g,'').replace(/[^\u0621-\u064a\d ]/g,' ').replace(/\s+/g,' ').trim()
 .replace(/بتدائيه/g,'ابتدائيه').replace(/بشروره/g,'شروره').replace(/عبد العزيز/g,'عبدالعزيز')
 .replace(/لتعليم الكبار|للتعليم المستمر|تعليم الكبيرات|تعليم الكبار|التعليم المستمر|الليليه|الليلي|مسارات|مدرسه|مركز/g,' ')
 .replace(/\s+/g,' ').trim();
}
const aliases=[
 ['ابتدائية الوديعة الثانية بشرورة','مركز الوديعة الثانية لتعليم الكبيرات'],
 ['بتدائية – متوسط -ثانوية / الوديعة بشروره','مدرسة الوديعة الثانوية الليلية بمدرسة جابر بن عبدالله'],
 ['بتدائية – متوسط -ثانوية / الوديعة بشروره','مركز التعليم المستمر بمدرسة الوديعة'],
 ['بتدائية – متوسط -ثانوية / الوديعة بشروره','مدرسة الوديعة المتوسطة الليلية بمدرسة الإمام شعبة'],
 ['ابتدائية حمزة بن عبد المطلب (شرورة)','مركز التعليم المستمر بمدرسة حمزة بن عبدالمطلب']
];
function core(s:string){return norm(s).replace(/ابتدائيه|متوسطه|ثانويه|بنين|بنات|شروره/g,' ').replace(/\s+/g,' ').trim();}
function matches(portal:string,source:string){
 if(aliases.some(([p,s])=>norm(p)===norm(portal)&&norm(s)===norm(source)))return true;
 const p=norm(portal),s=norm(source),a=core(portal),b=core(source);
 if(!a||!b)return false;
 if((p.includes('الوديع')||s.includes('الوديع'))&&(/الثانيه/.test(p)!==/الثانيه/.test(s)))return false;
 const stages=['ابتدائيه','متوسطه','ثانويه'];
 if(stages.some(stage=>p.includes(stage))&&stages.some(stage=>s.includes(stage))&&!stages.some(stage=>p.includes(stage)&&s.includes(stage)))return false;
 return a===b||(a.length>=6&&b.length>=6&&(a.includes(b)||b.includes(a)));
}
function percent(v:unknown){if(typeof v==='number')return v>=0&&v<=1?v*100:v>=0&&v<=100?v:null;const raw=String(v??'').trim();if(!raw)return null;const n=Number(raw.replace(/[٪%]/g,'').replace(',','.'));return Number.isFinite(n)&&n>=0&&n<=100?n:null;}
function getMetrics(rows:Record<string,unknown>[]){const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>/نسب|معدل|[%٪]/.test(k));const out:Record<string,number>={};for(const key of keys){const values=rows.map(r=>percent(r[key])).filter((v):v is number=>v!==null);if(values.length)out[key]=Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100;}return out;}
export default function AdminMadrasati(){
 const sb=useMemo(()=>supabaseBrowser(),[]);
 const [allowed,setAllowed]=useState(false),[schools,setSchools]=useState<School[]>([]),[sheets,setSheets]=useState<(Sheet|null)[]>([null,null,null,null,null]);
 const [weekStart,setWeekStart]=useState(()=>indicatorWeek().start),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[published,setPublished]=useState(false);
 useEffect(()=>{void (async()=>{const {data:{user}}=await sb.auth.getUser();if(!user)return;const a=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();if(!a.data)return;setAllowed(true);const r=await sb.from('schools').select('id,school_name').eq('is_active',true).order('school_name');if(r.error)setStatus(r.error.message);else setSchools(r.data||[]);})();},[sb]);
 useEffect(()=>{void (async()=>{if(!allowed)return;const r=await sb.from('madrasati_weekly_publications').select('status').eq('week_start',weekStart).maybeSingle();setPublished(r.data?.status==='published');})();},[allowed,sb,weekStart]);
 async function read(i:number,file:File){try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:''});const column=Object.keys(rows[0]||{}).find(k=>/مدرس/.test(k)&&/اسم/.test(k));if(!column)throw Error('لا يوجد عمود اسم المدرسة في '+file.name);setSheets(v=>v.map((x,j)=>i===j?{file:file.name,rows,column}:x));setStatus('تم تحميل '+file.name+' للمراجعة.');}catch(e){setStatus(String(e));}}
 const preview=useMemo(()=>{
 const results:Result[]=[];const unmatched:string[]=[];const ambiguous:string[]=[];
 sheets.forEach((sheet,i)=>{if(!sheet||i===0)return;const groups=new Map<string,Record<string,unknown>[]>();
 for(const row of sheet.rows){const name=String(row[sheet.column]||'').trim();if(!name)continue;const roster=sheets[0];const rosterNames=roster?roster.rows.map(r=>String(r[roster.column]||'').trim()).filter(Boolean):[];
 const candidates=schools.filter(s=>matches(s.school_name,name)&&rosterNames.some(rosterName=>matches(s.school_name,rosterName)));
 if(candidates.length!==1){(candidates.length?ambiguous:unmatched).push(labels[i]+': '+name);continue;}
 const key=candidates[0].id;groups.set(key,[...(groups.get(key)||[]),row]);}
 for(const [id,rows] of groups){const school=schools.find(s=>s.id===id)!;results.push({school,indicator:i,source:sheet.file,metrics:getMetrics(rows),count:rows.length});}
 });return {results,unmatched:[...new Set(unmatched)],ambiguous:[...new Set(ambiguous)]};
 },[sheets,schools]);
 async function publish(){if(busy||published||sheets.some(x=>!x)||preview.unmatched.length||preview.ambiguous.length||!preview.results.length)return;
 if(!window.confirm('اعتماد ونشر مؤشرات الأسبوع لجميع المدارس المطابقة؟ لا يمكن للمدارس تعديل النتائج.'))return;
 setBusy(true);setStatus('');
 try{
 const {data:{user}}=await sb.auth.getUser();if(!user)throw Error('انتهت جلسة الدخول');
 const end=new Date(weekStart+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+4);const weekEnd=end.toISOString().slice(0,10);
 const existing=await sb.from('madrasati_weekly_publications').select('id,status').eq('week_start',weekStart).maybeSingle();
 if(existing.error)throw Error(existing.error.message);if(existing.data?.status==='published')throw Error('تم نشر هذا الأسبوع مسبقًا ولا يمكن إعادة نشره.');
 let publicationId=existing.data?.id as string|undefined;
 if(!publicationId){const created=await sb.from('madrasati_weekly_publications').insert({week_start:weekStart,week_end:weekEnd,status:'draft'}).select('id').single();if(created.error)throw Error(created.error.message);publicationId=created.data.id;}
 const items=preview.results.map(r=>({publication_id:publicationId,school_id:r.school.id,indicator_key:r.indicator,source_file:r.source,source_school_name:r.school.school_name,metrics:r.metrics,row_count:r.count}));
 const saved=await sb.from('madrasati_weekly_school_metrics').upsert(items,{onConflict:'publication_id,school_id,indicator_key'});if(saved.error)throw Error(saved.error.message);
 const done=await sb.from('madrasati_weekly_publications').update({status:'published',published_at:new Date().toISOString(),published_by:user.id}).eq('id',publicationId).eq('status','draft').select('id');
 if(done.error)throw Error(done.error.message);if(!done.data?.length)throw Error('تعذر اعتماد الأسبوع، ربما نُشر بالفعل.');
 setPublished(true);setStatus('تم اعتماد ونشر '+preview.results.length+' سجل مؤشرات أسبوعية بنجاح.');
 }catch(e){setStatus('تعذر النشر: '+String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-6xl space-y-5"><Link href="/admin" className="text-blue-800 font-bold">العودة إلى لوحة الإدارة</Link><h1 className="text-3xl font-black">مؤشر مدرستي — رفع واعتماد ونشر</h1>
 {!allowed?<p>التحقق من صلاحيات مدير النظام…</p>:<><p className="text-slate-600">يرفع المدير قائمة المدارس وأربعة ملفات مؤشرات للأسبوع، ثم يراجع المطابقة قبل اعتماد النتائج. لا يحق للمدارس الإدخال أو التعديل.</p><label className="block rounded-xl border bg-white p-4 font-bold">بداية الأسبوع (الأحد) <input type="date" className="mr-3 rounded border p-2" value={weekStart} onChange={e=>setWeekStart(e.target.value)} /></label>
 {published&&<p className="rounded-xl bg-emerald-50 p-4 font-bold text-emerald-800">تم نشر نتائج هذا الأسبوع مسبقًا؛ لا يمكن اعتمادها مرة ثانية.</p>}
 <div className="grid gap-3 md:grid-cols-5">{labels.map((label,i)=><label key={label} className="rounded-xl border bg-white p-4"><strong className="block mb-2">{i+1}. {label}</strong><input aria-label={label} type="file" accept=".xlsx,.xls" disabled={published} className="w-full text-xs" onChange={e=>{const f=e.target.files?.[0];if(f)void read(i,f);}}/><small className="block mt-2">{sheets[i]?sheets[i]!.rows.length+' سجل':'لم يرفع'}</small></label>)}</div>
 <div className="grid gap-3 md:grid-cols-3">{[['مدارس البوابة',schools.length],['مجموع سجلات المدارس والمؤشرات',preview.results.length],['أسماء تحتاج مراجعة',preview.unmatched.length+preview.ambiguous.length]].map(([label,n])=><div key={String(label)} className="rounded-xl bg-white border p-5"><p>{label}</p><strong className="text-3xl">{n}</strong></div>)}</div>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-black mb-3">معاينة المؤشرات قبل الاعتماد</h2><div className="max-h-96 overflow-auto"><table className="w-full text-sm text-right"><thead><tr><th>المدرسة</th><th>المؤشر</th><th>عدد السجلات</th><th>النسب المستخرجة</th></tr></thead><tbody>{preview.results.map(r=><tr key={r.school.id+'-'+r.indicator} className="border-t"><td className="p-2">{r.school.school_name}</td><td>{labels[r.indicator]}</td><td>{r.count}</td><td>{Object.entries(r.metrics).map(([k,v])=>k+': '+v+'%').join(' | ')||'لا توجد أعمدة نسب'}</td></tr>)}</tbody></table></div></section>
 {(preview.unmatched.length>0||preview.ambiguous.length>0)&&<section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-black">مطابقات تحتاج مراجعة قبل النشر</h2><p>غير متطابقة: {preview.unmatched.length} · ملتبسة: {preview.ambiguous.length}</p><div className="max-h-44 overflow-auto text-sm">{[...preview.unmatched,...preview.ambiguous].map((n,i)=><p key={i}>{n}</p>)}</div></section>}
 <footer className="rounded-xl border bg-white p-5"><p className="mb-3 text-sm text-slate-600">لن يُنشر أي ملف قبل رفع قائمة المدارس وملفات المؤشرات الأربعة وحل المطابقات الملتبسة وغير المتطابقة.</p><button onClick={()=>void publish()} disabled={busy||published||sheets.some(x=>!x)||!!preview.unmatched.length||!!preview.ambiguous.length||!preview.results.length} className="rounded-xl bg-emerald-700 px-8 py-3 font-bold text-white disabled:opacity-40">{busy?'جارٍ الاعتماد…':'اعتماد ونشر'}</button>{status&&<p role="status" className="mt-3">{status}</p>}</footer></>}
 </div></main>;

'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

type Row=Record<string,unknown>;
type Dataset={name:string;rows:Row[];schoolColumn:string;};
const titles=['الدخول والوصول','الجدول المدرسي','الأدوات والأنشطة','إعداد الدروس'];
function normalize(v:unknown){
 return String(v??'').toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
 .replace(/[ـ\u064b-\u065f]/g,'').replace(/[^\u0621-\u064a\d ]/g,' ')
 .replace(/\s+/g,' ').trim()
 .replace(/بتدائيه/g,'ابتدائيه').replace(/بشروره/g,'شروره')
 .replace(/الانصاري/g,'الانصاري').replace(/عبد العزيز/g,'عبدالعزيز')
 .replace(/لتعليم الكبار|للتعليم المستمر|تعليم الكبيرات|تعليم الكبار|التعليم المستمر|الليليه|الليلي|مسارات|مدرسه|مركز/g,' ')
 .replace(/\s+/g,' ').trim();
}
const levels=['ابتدائيه','متوسطه','ثانويه'];
function features(v:string){
 const n=normalize(v);
 const level=levels.filter(l=>n.includes(l));
 const second=/الثانيه|الثاني/.test(n);
 const core=n.replace(/ابتدائيه|متوسطه|ثانويه|بنين|بنات|الثانيه|الثاني|شروره/g,' ').replace(/\s+/g,' ').trim();
 return {n,level,second,core,tokens:core.split(' ').filter(x=>x.length>1)};
}
// Approved aliases from the schools administrator. Compare names only, never codes.
const approvedAliases: {portal:string; sources:string[]}[]=[
 {portal:'ابتدائية الوديعة الثانية بشرورة',sources:['مركز الوديعة الثانية لتعليم الكبيرات']},
 {portal:'بتدائية – متوسط -ثانوية / الوديعة بشروره',sources:[
  'مدرسة الوديعة الثانوية الليلية بمدرسة جابر بن عبدالله',
  'مركز التعليم المستمر بمدرسة الوديعة',
  'مدرسة الوديعة المتوسطة الليلية بمدرسة الإمام شعبة'
 ]},
 {portal:'ابتدائية حمزة بن عبد المطلب (شرورة)',sources:['مركز التعليم المستمر بمدرسة حمزة بن عبدالمطلب']}
];
function approvedAliasMatch(portal:string,source:string){
 const p=normalize(portal),s=normalize(source);
 return approvedAliases.some(entry=>normalize(entry.portal)===p&&entry.sources.some(alias=>normalize(alias)===s));
}
function matchSchoolName(a:string,b:string){
 if(approvedAliasMatch(a,b))return true;
 const x=features(a),y=features(b);
 if(!x.core||!y.core)return false;
 // Prevent conflating the second Al-Wadiah girls' school with the combined Al-Wadiah school.
 if(x.second!==y.second && (x.core.includes('الوديع')||y.core.includes('الوديع')))return false;
 if(x.level.length&&y.level.length&&!x.level.some(l=>y.level.includes(l)))return false;
 if(x.core===y.core)return true;
 // Match a distinctive school name within a longer title, not a generic stage/location.
 if(x.core.length>=5&&y.core.length>=5&&(x.core.includes(y.core)||y.core.includes(x.core)))return true;
 const common=x.tokens.filter(t=>y.tokens.includes(t));
 return common.length>=2 && common.length/Math.min(x.tokens.length,y.tokens.length)>=0.75;
}
function asPercent(v:unknown):number|null{if(typeof v==='number')return v>=0&&v<=1?v*100:v>=0&&v<=100?v:null;const s=String(v??'').trim().replace('%','').replace('٪','').replace(',','.');if(!s)return null;const n=Number(s);return Number.isFinite(n)&&n>=0&&n<=100?n:null;}
function percentageColumn(k:string){return k.includes('نسب') || k.includes('%') || k.includes('٪') || k.includes('معدل');}

export default function MadrasatiImported(){
 const [files,setFiles]=useState<(Dataset|null)[]>([null,null,null,null]);
 const [roster,setRoster]=useState<string[]>([]);
 const [selected,setSelected]=useState('');
 const [message,setMessage]=useState('');
 async function readSheet(file:File){const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json<Row>(ws,{defval:''});}
 async function loadRoster(file:File){try{const rows=await readSheet(file);const col=Object.keys(rows[0]||{}).find(k=>/اسم.*مدرس|مدرس.*اسم/.test(k));if(!col)throw Error('لم يتم العثور على عمود اسم المدرسة');const names=[...new Set(rows.map(r=>String(r[col]||'').trim()).filter(Boolean))];setRoster(names);setSelected('');setMessage('تم تحميل أسماء '+names.length+' مدرسة للمطابقة بالاسم فقط.');}catch(e){setMessage(String(e));}}
 async function loadFile(i:number,file:File){try{const rows=await readSheet(file);const col=Object.keys(rows[0]||{}).find(k=>/اسم.*مدرس|مدرس.*اسم/.test(k));if(!col)throw Error('لم يتم العثور على عمود اسم المدرسة');setFiles(old=>old.map((v,j)=>i===j?{name:file.name,rows,schoolColumn:col}:v));setMessage('تم تحميل '+file.name+' محليًا للعرض. لم تُحفظ البيانات في قاعدة البوابة.');}catch(e){setMessage(String(e));}}
 const summaries=useMemo(()=>roster.map(name=>({name,sections:files.map(f=>{if(!f)return null;const rows=f.rows.filter(r=>matchSchoolName(name,String(r[f.schoolColumn]||'')));const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(percentageColumn);const metrics=keys.map(key=>{const vals=rows.map(r=>asPercent(r[key])).filter((n):n is number=>n!==null);return {key,value:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null};});return {count:rows.length,metrics};})})),[roster,files]);
 const visible=selected?summaries.filter(s=>s.name===selected):summaries;
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-10 text-slate-900"><div className="mx-auto max-w-7xl space-y-6">
 <div className="flex flex-wrap justify-between gap-4 items-center"><div><h1 className="text-3xl font-black">مؤشر مدرستي</h1><p className="text-slate-600 mt-2">لوحة مستقلة لنتائج ملفات مدرستي الأربعة، دون استخدام مؤشرات البوابة الحالية.</p></div><Link href="/admin" className="rounded-xl border bg-white px-5 py-3 font-bold">العودة إلى الإدارة</Link></div>
 <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">هذه نسخة أولية للعرض والمطابقة بالأسماء. ارفع ملف المدارس والملفات الأربعة لعرض النتائج؛ لا يتم حفظها أو نشرها لحسابات المدارس بعد. لا يُستخدم أي رقم مدرسي للمطابقة، وتحتاج الأسماء الملتبسة إلى مراجعة.</div>
 <section className="grid gap-3 md:grid-cols-5"><label className="rounded-2xl border bg-white p-4"><strong className="block mb-3">قائمة مدارس البوابة</strong><input aria-label="قائمة مدارس البوابة" type="file" accept=".xlsx,.xls" className="w-full text-xs" onChange={e=>{const f=e.target.files?.[0];if(f)void loadRoster(f);}}/></label>{titles.map((title,i)=><label key={title} className="rounded-2xl border bg-white p-4"><strong className="block mb-3">{title}</strong><input aria-label={title} type="file" accept=".xlsx,.xls" className="w-full text-xs" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(i,f);}}/><small className="block mt-2 text-slate-500">{files[i]?files[i]!.rows.length+' سجل':'لم يُرفع الملف'}</small></label>)}</section>
 {message&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm">{message}</p>}
 <div className="rounded-2xl border bg-white p-5 flex flex-wrap items-center gap-4"><label className="font-bold" htmlFor="school">المدرسة</label><select id="school" className="rounded-xl border p-3 min-w-64" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">جميع المدارس</option>{roster.map(n=><option key={n} value={n}>{n}</option>)}</select><span className="text-sm text-slate-600">{summaries.length} مدرسة في القائمة · {summaries.filter(s=>s.sections.some(x=>x&&x.count>0)).length} مدرسة لها سجلات متطابقة بالاسم</span></div>
 {visible.map(s=><section key={s.name} className="rounded-2xl border bg-white p-5 space-y-4"><h2 className="text-xl font-black">{s.name}</h2><div className="grid gap-3 md:grid-cols-4">{s.sections.map((section,i)=><div key={i} className="rounded-xl border bg-slate-50 p-4"><h3 className="font-bold mb-2">{titles[i]}</h3><p className="text-sm text-slate-600 mb-3">{section?section.count+' سجل مطابق':'الملف غير محمل'}</p>{section?.metrics.length?section.metrics.map(m=><div key={m.key} className="border-t py-2 text-sm flex justify-between gap-2"><span>{m.key}</span><b>{m.value===null?'—':m.value.toFixed(1)+'%'}</b></div>):<p className="text-xs text-slate-500">لا توجد نسب قابلة للعرض في السجلات المطابقة</p>}</div>)}</div></section>)}
 {!roster.length&&<p className="rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">ارفع قائمة المدارس لعرض نسبة كل مدرسة منفصلة.</p>}
 </div></main>;
}

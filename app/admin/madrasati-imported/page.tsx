'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {supabaseBrowser} from '../../../lib/supabase';
import {indicatorWeek} from '../../../lib/weekly-indicators';

type Row=Record<string,unknown>;
type Dataset={name:string;rows:Row[];schoolColumn:string;};
const titles=['الدخول والوصول','الجدول المدرسي','الأدوات والأنشطة','إعداد الدروس'];
function normalize(v:unknown){
 return String(v??'').toLowerCase().replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
 .replace(/[ـ\u064b-\u065f]/g,'').replace(/[^\u0621-\u064a\d ]/g,' ')
 .replace(/\s+/g,' ').trim()
 .replace(/(^|\s)بتدائيه(?=\s|$)/g,'$1ابتدائيه').replace(/بشروره/g,'شروره')
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
 const sb=useMemo(()=>supabaseBrowser(),[]);
 const [allowed,setAllowed]=useState(false);
 const [schools,setSchools]=useState<{id:string;school_name:string}[]>([]);
 const [weekStart,setWeekStart]=useState(()=>indicatorWeek().start);
 const [published,setPublished]=useState(false);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{void(async()=>{const {data:{user}}=await sb.auth.getUser();if(!user)return;const a=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();if(!a.data)return;setAllowed(true);const r=await sb.from('schools').select('id,school_name').eq('is_active',true);if(r.error)setMessage(r.error.message);else setSchools(r.data||[]);})();},[sb]);
 useEffect(()=>{void(async()=>{if(!allowed)return;const r=await sb.from('madrasati_weekly_publications').select('status').eq('week_start',weekStart).maybeSingle();if(r.error)setMessage(r.error.message);setPublished(r.data?.status==='published');})();},[sb,allowed,weekStart]);
 const [history,setHistory]=useState<{week:string;schoolId:string;indicator:number;value:number}[]>([]);
 const [chartSchool,setChartSchool]=useState('');
 const [chartIndicator,setChartIndicator]=useState('all');
 const [chartError,setChartError]=useState('');
 useEffect(()=>{if(!allowed)return;let active=true;void(async()=>{
  const pub=await sb.from('madrasati_weekly_publications').select('id,week_start').eq('status','published').order('week_start',{ascending:false}).limit(24);
  if(pub.error){if(active)setChartError(pub.error.message);return;}
  const weeks=pub.data||[];if(!weeks.length){if(active)setHistory([]);return;}
  const result=await sb.from('madrasati_weekly_school_metrics').select('publication_id,school_id,indicator_key,metrics').in('publication_id',weeks.map(w=>w.id)).range(0,9999);
  if(result.error){if(active)setChartError(result.error.message);return;}
  const byId=new Map(weeks.map(w=>[w.id,w.week_start]));
  const values=(result.data||[]).flatMap(r=>{const nums=Object.values((r.metrics||{}) as Record<string,unknown>).map(v=>Number(v)).filter(v=>Number.isFinite(v)&&v>=0&&v<=100);return nums.length?[{week:byId.get(r.publication_id)||'',schoolId:r.school_id,indicator:Number(r.indicator_key),value:nums.reduce((a,b)=>a+b,0)/nums.length}]:[];});
  if(active){setHistory(values);setChartError('');}
 })();return()=>{active=false};},[allowed,sb,published]);
 const analytics=useMemo(()=>{
  const rows=history.filter(r=>(!chartSchool||r.schoolId===chartSchool)&&(chartIndicator==='all'||r.indicator===Number(chartIndicator)));
  const weeks=[...new Set(rows.map(r=>r.week))].sort();
  const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
  const series=weeks.map(week=>({week,value:mean(rows.filter(r=>r.week===week).map(r=>r.value))}));
  const last=weeks.at(-1)||'';
  const prev=weeks.at(-2)||'';
  const scores=schools.map(s=>({name:s.school_name,id:s.id,value:mean(rows.filter(r=>r.week===last&&r.schoolId===s.id).map(r=>r.value)),count:rows.filter(r=>r.week===last&&r.schoolId===s.id).length})).filter(s=>s.count).sort((a,b)=>b.value-a.value);
  const changes=scores.map(s=>{const old=rows.filter(r=>r.week===prev&&r.schoolId===s.id).map(r=>r.value);return {...s,change:old.length?s.value-mean(old):null};}).filter(s=>s.change!==null).sort((a,b)=>(b.change??0)-(a.change??0));
  const bands=[{label:'مرتفع (80–100%)',count:scores.filter(s=>s.value>=80).length},{label:'متوسط (60–79%)',count:scores.filter(s=>s.value>=60&&s.value<80).length},{label:'منخفض (أقل من 60%)',count:scores.filter(s=>s.value<60).length}];
  return {series,scores,changes,bands,last,prev};
 },[history,schools,chartSchool,chartIndicator]);
 async function readSheet(file:File){const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json<Row>(ws,{defval:''});}
 async function loadRoster(file:File){try{const rows=await readSheet(file);const col=Object.keys(rows[0]||{}).find(k=>/اسم.*مدرس|مدرس.*اسم|^المدرسة$|^المدرسه$|اسم.*مركز/.test(k));if(!col)throw Error('لم يتم العثور على عمود اسم المدرسة');const names=[...new Set(rows.map(r=>String(r[col]||'').trim()).filter(Boolean))];setRoster(names);setSelected('');setMessage('تم تحميل أسماء '+names.length+' مدرسة للمطابقة بالاسم فقط.');}catch(e){setMessage(String(e));}}
 async function loadFile(i:number,file:File){try{const rows=await readSheet(file);const col=Object.keys(rows[0]||{}).find(k=>/اسم.*مدرس|مدرس.*اسم|^المدرسة$|^المدرسه$|اسم.*مركز/.test(k));if(!col)throw Error('لم يتم العثور على عمود اسم المدرسة');setFiles(old=>old.map((v,j)=>i===j?{name:file.name,rows,schoolColumn:col}:v));setMessage('تم تحميل '+file.name+' للمعاينة. يمكنك مراجعة نتائج المطابقة ثم الاعتماد والنشر.');}catch(e){setMessage(String(e));}}
 const summaries=useMemo(()=>roster.map(name=>({name,sections:files.map(f=>{if(!f)return null;const rows=f.rows.filter(r=>matchSchoolName(name,String(r[f.schoolColumn]||'')));const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(percentageColumn);const metrics=keys.map(key=>{const vals=rows.map(r=>asPercent(r[key])).filter((n):n is number=>n!==null);return {key,value:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null};});return {count:rows.length,metrics};})})),[roster,files]);
 const visible=selected?summaries.filter(s=>s.name===selected):summaries;
 const review=useMemo(()=>{
  const results:{school:{id:string;school_name:string};indicator:number;metrics:Record<string,number>;count:number;source:string;sourceSchool:string}[]=[];
  const unmatched:string[]=[];const ambiguous:string[]=[];
  if(!roster.length)return {results,unmatched,ambiguous};
  for(let i=0;i<files.length;i++){const f=files[i];if(!f)continue;
   const groups=new Map<string,{school:{id:string;school_name:string};rows:Row[];names:Set<string>}>();
   for(const row of f.rows){const source=String(row[f.schoolColumn]||'').trim();if(!source)continue;
    const candidates=schools.filter(s=>matchSchoolName(s.school_name,source)&&roster.some(n=>matchSchoolName(s.school_name,n)));
    if(candidates.length!==1){(candidates.length?ambiguous:unmatched).push(titles[i]+': '+source);continue;}
    const school=candidates[0],group=groups.get(school.id)||{school,rows:[],names:new Set<string>()};group.rows.push(row);group.names.add(source);groups.set(school.id,group);
   }
   for(const group of groups.values()){
    const keys=[...new Set(group.rows.flatMap(r=>Object.keys(r)))].filter(percentageColumn);
    const metrics:Record<string,number>={};
    for(const key of keys){const vals=group.rows.map(r=>asPercent(r[key])).filter((n):n is number=>n!==null);if(vals.length)metrics[key]=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100;}
    results.push({school:group.school,indicator:i+1,metrics,count:group.rows.length,source:f.name,sourceSchool:[...group.names].join('، ')});
   }
  }
  return {results,unmatched:[...new Set(unmatched)],ambiguous:[...new Set(ambiguous)]};
 },[files,roster,schools]);
 async function publish(){
  if(busy||published)return;
  if(!allowed){setMessage('لا يمكن الاعتماد: الحساب الحالي ليس لديه صلاحية مدير النظام.');return;}
  if(!roster.length){setMessage('ارفع ملف قائمة مدارس البوابة أولًا.');return;}
  if(files.some(f=>!f)){setMessage('ارفع ملفات المؤشرات الأربعة جميعها قبل الاعتماد.');return;}
  if(review.ambiguous.length){setMessage('لا يمكن الاعتماد: توجد '+review.ambiguous.length+' أسماء ملتبسة قد تؤدي إلى نشر النتائج لمدرسة خاطئة.');return;}
  if(!review.results.length){setMessage('لم يتم العثور على نتائج مرتبطة بمدارس البوابة. تحقق من أسماء المدارس أو صلاحية حساب المدير.');return;}
  const d=new Date(weekStart+'T12:00:00Z');if(Number.isNaN(d.getTime())||d.getUTCDay()!==0){setMessage('اختر يوم الأحد كبداية للأسبوع.');return;}
  if(!window.confirm('سيتم نشر '+review.results.length+' سجلًا للمدارس المطابقة فقط.'+(review.unmatched.length?' سيتم استبعاد '+review.unmatched.length+' اسمًا غير مطابق.':'')+' هل تريد الاعتماد والنشر لهذا الأسبوع؟'))return;
  setBusy(true);setMessage('');
  try{
   const {data:{user}}=await sb.auth.getUser();if(!user)throw Error('انتهت جلسة الدخول');
   const existing=await sb.from('madrasati_weekly_publications').select('id,status').eq('week_start',weekStart).maybeSingle();
   if(existing.error)throw Error(existing.error.message);if(existing.data?.status==='published')throw Error('هذا الأسبوع منشور مسبقًا.');
   const end=new Date(d);end.setUTCDate(end.getUTCDate()+4);
   let publicationId=existing.data?.id as string|undefined;
   if(!publicationId){const created=await sb.from('madrasati_weekly_publications').insert({week_start:weekStart,week_end:end.toISOString().slice(0,10),status:'draft'}).select('id').single();if(created.error)throw Error(created.error.message);publicationId=created.data.id;}
   const saved=await sb.from('madrasati_weekly_school_metrics').upsert(review.results.map(r=>({publication_id:publicationId,school_id:r.school.id,indicator_key:r.indicator,source_file:r.source,source_school_name:r.sourceSchool,metrics:r.metrics,row_count:r.count})),{onConflict:'publication_id,school_id,indicator_key'});
   if(saved.error)throw Error(saved.error.message);
   const done=await sb.from('madrasati_weekly_publications').update({status:'published',published_at:new Date().toISOString(),published_by:user.id}).eq('id',publicationId).eq('status','draft').select('id');
   if(done.error)throw Error(done.error.message);if(!done.data?.length)throw Error('تعذر اعتماد الأسبوع.');
   setPublished(true);setMessage('تم اعتماد ونشر '+review.results.length+' سجلًا وحفظها في أرشيف الأسبوع.');
  }catch(e){setMessage('تعذر النشر: '+String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-10 text-slate-900"><div className="mx-auto max-w-7xl space-y-6">
 <div className="flex flex-wrap justify-between gap-4 items-center print:hidden"><div><h1 className="text-3xl font-black">مؤشر مدرستي</h1><p className="text-slate-600 mt-2">عرض مؤشرات مدرستي الأربعة لكل مدرسة، مع اعتماد النتائج وحفظها أسبوعيًا.</p></div><Link href="/admin" className="rounded-xl border bg-white px-5 py-3 font-bold">العودة إلى الإدارة</Link></div>
 <div className="print:hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">ارفع قائمة المدارس وملفات المؤشرات الأربعة ثم راجع النتائج في البطاقات أدناه. لا تُنشر البيانات إلا بعد اعتماد الأسبوع. المطابقة بالأسماء فقط.</div>
 <div className="print:hidden rounded-2xl border bg-white p-5 flex flex-wrap gap-4 items-center"><label className="font-bold">بداية الأسبوع (الأحد) <input type="date" className="mr-3 rounded-xl border p-2" value={weekStart} onChange={e=>setWeekStart(e.target.value)}/></label><span className="text-sm">{published?"تم نشر هذا الأسبوع":"الأسبوع قيد الإعداد"}</span></div>
 <section className="print:hidden rounded-3xl border border-blue-100 bg-white p-5 md:p-7 space-y-5 shadow-sm">
 <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black text-[#0b3d91]">التحليل البياني ومؤشرات الأداء KPIs</h2><p className="text-sm text-slate-500 mt-1">مقارنات مبنية على الأسابيع المنشورة والمعتمدة فقط · متوسط النسب المسجلة لكل محور</p></div><div className="flex flex-wrap gap-2"><select aria-label="فلتر المدرسة للرسوم" className="rounded-xl border p-2" value={chartSchool} onChange={e=>setChartSchool(e.target.value)}><option value="">جميع المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><select aria-label="فلتر المؤشر للرسوم" className="rounded-xl border p-2" value={chartIndicator} onChange={e=>setChartIndicator(e.target.value)}><option value="all">جميع المؤشرات</option>{titles.map((t,i)=><option key={t} value={String(i+1)}>{t}</option>)}</select></div></div>
 {chartError&&<p className="rounded-xl bg-rose-50 text-rose-700 p-3">تعذر تحميل التحليل: {chartError}</p>}
 {!analytics.series.length?<div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">لا توجد نتائج أسبوعية منشورة متاحة للرسم بعد. ستظهر الرسوم تلقائيًا عند اعتماد بيانات الأسابيع.</div>:
 <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
 <article className="rounded-2xl border p-5"><h3 className="font-black text-[#0b3d91] mb-2">١. اتجاه الأداء عبر الأسابيع</h3><p className="text-xs text-slate-500 mb-3">ارتفاع وانخفاض متوسط النسبة أسبوعيًا</p><svg viewBox="0 0 500 210" role="img" aria-label="رسم خطي لتطور النسب الأسبوعية" className="w-full"><line x1="40" y1="170" x2="485" y2="170" stroke="#cbd5e1"/>{[0,25,50,75,100].map(n=><g key={n}><line x1="40" y1={170-n*1.4} x2="485" y2={170-n*1.4} stroke="#e2e8f0"/><text x="5" y={174-n*1.4} fontSize="12" fill="#64748b">{n}%</text></g>)}<polyline fill="none" stroke="#0876dd" strokeWidth="3" points={analytics.series.map((v,i)=>`${40+i*440/Math.max(analytics.series.length-1,1)},${170-v.value*1.4}`).join(' ')}/>{analytics.series.map((v,i)=><g key={v.week}><circle cx={40+i*440/Math.max(analytics.series.length-1,1)} cy={170-v.value*1.4} r="4" fill="#fbbf24" stroke="#0b3d91"/><title>{v.week}: {v.value.toFixed(1)}%</title></g>)}</svg><div className="text-xs text-slate-500 flex justify-between"><span>{analytics.series[0]?.week}</span><span>{analytics.series.at(-1)?.week}</span></div></article>
 <article className="rounded-2xl border p-5"><h3 className="font-black text-[#0b3d91] mb-2">٢. مقارنة أداء المدارس</h3><p className="text-xs text-slate-500 mb-3">أعلى عشر مدارس في الأسبوع الأخير {analytics.last}</p><div className="space-y-3">{analytics.scores.slice(0,10).map(s=><div key={s.id}><div className="flex justify-between gap-2 text-xs mb-1"><span className="truncate">{s.name}</span><b>{s.value.toFixed(1)}%</b></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{width:s.value+'%'}}/></div></div>)}</div></article>
 <article className="rounded-2xl border p-5"><h3 className="font-black text-[#0b3d91] mb-3">٣. ترتيب المدارس حسب KPI</h3><div className="space-y-2">{analytics.scores.slice(0,10).map((s,i)=><div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 text-sm"><span className="truncate"><b className="text-amber-600 ml-2">#{i+1}</b>{s.name}</span><strong>{s.value.toFixed(1)}%</strong></div>)}</div></article>
 <article className="rounded-2xl border p-5"><h3 className="font-black text-[#0b3d91] mb-2">٤. التحسن والتراجع الأسبوعي</h3><p className="text-xs text-slate-500 mb-3">فرق النقاط المئوية بين آخر أسبوعين</p>{analytics.changes.length?<div className="space-y-2">{analytics.changes.slice(0,12).map(s=><div key={s.id} className="flex justify-between gap-3 border-b py-2 text-sm"><span className="truncate">{s.name}</span><b className={(s.change??0)>=0?'text-emerald-700':'text-rose-600'}>{(s.change??0)>0?'+':''}{s.change?.toFixed(1)} نقطة</b></div>)}</div>:<p className="text-sm text-slate-500">تتطلب المقارنة أسبوعين منشورين لنفس المدارس.</p>}</article>
 <article className="rounded-2xl border p-5 xl:col-span-2"><h3 className="font-black text-[#0b3d91] mb-3">٥. توزيع مستويات الإنجاز بين المدارس</h3><div className="grid md:grid-cols-3 gap-3">{analytics.bands.map((b,i)=><div key={b.label} className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-600">{b.label}</div><div className="text-3xl font-black mt-2">{b.count} <span className="text-xs font-normal">مدرسة</span></div><div className="h-3 bg-slate-200 rounded-full mt-3 overflow-hidden"><div className={i===0?'h-full bg-emerald-500':i===1?'h-full bg-amber-400':'h-full bg-rose-500'} style={{width:(analytics.scores.length?b.count/analytics.scores.length*100:0)+'%'}}/></div></div>)}</div><p className="text-xs text-slate-500 mt-3">يحتسب ترتيب المدارس من متوسط النسب المتاحة فقط؛ المدارس دون بيانات لا تُصنّف صفرًا.</p></article>
 </div>}</section>
 <section className="print:hidden grid gap-3 md:grid-cols-5"><label className="rounded-2xl border bg-white p-4"><strong className="block mb-3">قائمة مدارس البوابة</strong><input aria-label="قائمة مدارس البوابة" type="file" accept=".xlsx,.xls" disabled={published||!allowed} className="w-full text-xs" onChange={e=>{const f=e.target.files?.[0];if(f)void loadRoster(f);}}/></label>{titles.map((title,i)=><label key={title} className="rounded-2xl border bg-white p-4"><strong className="block mb-3">{title}</strong><input aria-label={title} type="file" accept=".xlsx,.xls" disabled={published||!allowed} className="w-full text-xs" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(i,f);}}/><small className="block mt-2 text-slate-500">{files[i]?files[i]!.rows.length+' سجل':'لم يُرفع الملف'}</small></label>)}</section>
 {!allowed&&<p className="print:hidden rounded-xl bg-amber-50 p-3">هذه الخدمة متاحة لمدير النظام فقط.</p>}
 {message&&<p role="status" className="print:hidden rounded-xl bg-blue-50 p-3 text-sm">{message}</p>}
 <div className="print:hidden rounded-2xl border bg-white p-5 flex flex-wrap items-center gap-4"><label className="font-bold" htmlFor="school">المدرسة</label><select id="school" className="rounded-xl border p-3 min-w-64" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">جميع المدارس</option>{roster.map(n=><option key={n} value={n}>{n}</option>)}</select><span className="text-sm text-slate-600">{summaries.length} مدرسة في القائمة · {summaries.filter(s=>s.sections.some(x=>x&&x.count>0)).length} مدرسة لها سجلات متطابقة بالاسم</span></div>
 <div className="print:hidden rounded-2xl border bg-white p-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-600">الطباعة تشمل {selected?"المدرسة المختارة":"جميع المدارس المعروضة"} ومؤشراتها الأربعة حسب الملفات المرفوعة.</span><button type="button" onClick={()=>window.print()} disabled={!visible.length||!files.some(Boolean)} className="rounded-xl bg-slate-800 px-6 py-3 font-bold text-white disabled:opacity-40">طباعة المؤشرات PDF</button></div>
 <header className="hidden print:block text-center mb-6"><h1 className="text-xl font-black">إدارة التعليم بمنطقة نجران</h1><h2 className="text-lg font-bold">تقرير مؤشرات منصة مدرستي الأسبوعية</h2><p>الأسبوع الذي يبدأ في {weekStart} · {selected?selected:"جميع المدارس"}</p></header>
 {visible.map(s=><section key={s.name} className="rounded-2xl border bg-white p-5 space-y-4 print:break-inside-avoid print:shadow-none print:border-slate-400 print:p-4 print:mb-4"><h2 className="text-xl font-black">{s.name}</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">{s.sections.map((section,i)=><div key={i} className="rounded-xl border bg-slate-50 p-4 print:p-3 print:border-slate-400 print:bg-white print:break-inside-avoid"><h3 className="font-bold mb-2">{titles[i]}</h3><p className="text-sm text-slate-600 mb-3">{section?section.count+' سجل مطابق':'الملف غير محمل'}</p>{section?.metrics.length?section.metrics.map(m=><div key={m.key} className="border-t py-2 text-sm flex justify-between gap-2"><span>{m.key}</span><b>{m.value===null?'—':m.value.toFixed(1)+'%'}</b></div>):<p className="text-xs text-slate-500">لا توجد نسب قابلة للعرض في السجلات المطابقة</p>}</div>)}</div></section>)}
 <section className="print:hidden rounded-2xl border bg-white p-5 space-y-3"><h2 className="text-xl font-black">اعتماد المؤشرات الأسبوعية ونشرها</h2><p className="text-sm text-slate-600">سجلات جاهزة للنشر: {review.results.length} · أسماء غير مطابقة (لن تُنشر): {review.unmatched.length} · أسماء ملتبسة (تمنع النشر): {review.ambiguous.length}</p>{(review.unmatched.length>0||review.ambiguous.length>0)&&<div className="max-h-44 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{[...review.unmatched,...review.ambiguous].map((name,i)=><p key={i}>{name}</p>)}</div>}<button className="rounded-xl bg-emerald-700 px-7 py-3 font-bold text-white disabled:opacity-40" disabled={busy||published} onClick={()=>void publish()}>{busy?"جارٍ الاعتماد…":published?"تم اعتماد هذا الأسبوع":"اعتماد ونشر نتائج الأسبوع"}</button></section>
 {!roster.length&&<p className="print:hidden rounded-2xl border border-dashed bg-white p-10 text-center text-slate-500">ارفع قائمة المدارس لعرض نسبة كل مدرسة منفصلة.</p>}
 <style jsx global>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white !important; } main { padding: 0 !important; background: white !important; } section { break-inside: avoid; page-break-inside: avoid; } .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } }`}</style>
 </div></main>;
}

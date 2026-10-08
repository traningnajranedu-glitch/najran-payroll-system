'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,RefreshCw,Printer,CalendarDays} from 'lucide-react';
import {supabaseBrowser} from '../../../lib/supabase';
import {indicatorWeek} from '../../../lib/weekly-indicators';
type School={id:string;school_name:string;is_active:boolean};
type Row={school_id:string;[key:string]:unknown};
const pct=(n:number,d:number)=>d?((n/d)*100).toFixed(1)+'%':'0%';
export default function WeeklyReport(){
 const sb=useMemo(()=>supabaseBrowser(),[]);
 const [allowed,setAllowed]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [schools,setSchools]=useState<School[]>([]),[profiles,setProfiles]=useState<Row[]>([]),[mad,setMad]=useState<Row[]>([]),[discipline,setDiscipline]=useState<Row[]>([]),[payroll,setPayroll]=useState<Row[]>([]),[period,setPeriod]=useState('');
 const [updated,setUpdated]=useState('');const week=indicatorWeek();
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const {data:{user}}=await sb.auth.getUser();if(!user){location.href='/';return;}
   const {data:admin,error:authError}=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
   if(authError||!admin)throw new Error('هذه الصفحة مخصصة لمدير النظام.');
   setAllowed(true);
   const [s,p,m,d,periods]=await Promise.all([
    sb.from('schools').select('id,school_name,is_active').eq('is_active',true).order('school_name'),
    sb.from('school_profiles').select('school_id,completion_percent'),
    sb.from('school_madrasati_daily_indicators').select('school_id,indicator_date').eq('indicator_date',week.start),
    sb.from('school_discipline_daily').select('school_id,attendance_date').eq('attendance_date',week.start),
    sb.from('payroll_periods').select('id,period_name,start_date').order('start_date',{ascending:false}).limit(1)
   ]);
   for(const x of [s,p,m,d,periods])if(x.error)throw new Error(x.error.message);
   const latest=periods.data?.[0];setPeriod(latest?.period_name||'لا توجد فترة');
   const records=latest?await sb.from('payroll_records').select('school_id,status').eq('period_id',latest.id):null;
   if(records?.error)throw new Error(records.error.message);
   setSchools(s.data||[]);setProfiles((p.data||[]) as Row[]);setMad((m.data||[]) as Row[]);setDiscipline((d.data||[]) as Row[]);setPayroll((records?.data||[]) as Row[]);
   setUpdated(new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date()));
  }catch(e){setError(e instanceof Error?e.message:'تعذر تحميل التقرير');}
  finally{setLoading(false);}
 },[sb,week.start]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer);},[load]);
 const completed=new Set(profiles.filter(p=>Number(p.completion_percent)>=100).map(p=>p.school_id));
 const madSet=new Set(mad.map(x=>x.school_id)),discSet=new Set(discipline.map(x=>x.school_id));
 const approved=new Set(schools.filter(s=>{const rows=payroll.filter(x=>x.school_id===s.id);return rows.length>0&&rows.every(x=>x.status==='تم الاعتماد');}).map(s=>s.id));
 const missingMad=schools.filter(s=>!madSet.has(s.id)),missingDisc=schools.filter(s=>!discSet.has(s.id));
 const sections=[
  {name:'الملف الشخصي',yes:schools.filter(s=>completed.has(s.id)).length,no:schools.filter(s=>!completed.has(s.id)),color:'#07866b'},
  {name:'اعتماد مسير الرواتب',yes:approved.size,no:schools.filter(s=>!approved.has(s.id)),color:'#1256b5'},
  {name:'مؤشر منصة مدرستي',yes:schools.length-missingMad.length,no:missingMad,color:'#0879a5'},
  {name:'مؤشر الانضباط المدرسي',yes:schools.length-missingDisc.length,no:missingDisc,color:'#6438a8'}
 ];
 if(loading&&!updated)return <main dir="rtl" className="p-10">جارٍ تحميل التقرير الأسبوعي…</main>;
 if(!allowed)return <main dir="rtl" className="p-10 text-red-700">{error||'غير مصرح بالدخول'}</main>;
 return <main dir="rtl" className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900"><div className="mx-auto max-w-6xl">
 <header className="rounded-3xl bg-gradient-to-l from-teal-900 to-sky-900 p-6 text-white print:rounded-none">
 <p className="text-sm">وزارة التعليم | الإدارة العامة للتعليم بمنطقة نجران | إدارة التعليم المستمر</p>
 <h1 className="mt-3 text-2xl md:text-4xl font-black">البوابة الإلكترونية لمدارس التعليم المستمر</h1>
 <h2 className="mt-2 text-xl font-bold">تقرير متابعة المدارس الأسبوعي</h2>
 <p className="mt-3 text-sm">الأسبوع: {week.start} إلى {week.end} | فترة المسير: {period}</p><p className="text-xs mt-1">آخر جلب للبيانات: {updated||'—'} | التحديث المجدول كل خميس 7:30 مساءً بتوقيت الرياض</p>
 </header>
 <div className="flex flex-wrap gap-2 my-5 print:hidden"><button onClick={()=>void load()} className="rounded-xl bg-white px-4 py-3 flex gap-2 items-center"><RefreshCw size={17}/> تحديث البيانات</button><button onClick={()=>window.print()} className="rounded-xl bg-white px-4 py-3 flex gap-2 items-center"><Printer size={17}/> طباعة / حفظ PDF</button><a href="/admin/daily-report" className="rounded-xl bg-white px-4 py-3 flex gap-2 items-center"><ArrowRight size={17}/> التقرير اليومي</a></div>
 {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">تعذر تحديث البيانات: {error}. قد تكون الأرقام المعروضة من آخر جلب ناجح.</p>}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"><div className="rounded-2xl bg-white p-5 shadow-sm"><CalendarDays className="text-teal-700"/><b className="block text-4xl mt-2">{schools.length}</b><span>إجمالي المدارس النشطة</span></div>{sections.slice(0,3).map(x=><div key={x.name} className="rounded-2xl bg-white p-5 shadow-sm"><p className="font-bold">{x.name}</p><b className="block text-3xl mt-2" style={{color:x.color}}>{x.yes} / {schools.length}</b><p className="text-sm">{pct(x.yes,schools.length)} مكتمل</p></div>)}</div>
 <div className="grid md:grid-cols-2 gap-5">{sections.map(x=><section key={x.name} className="overflow-hidden rounded-2xl bg-white shadow-sm break-inside-avoid"><h3 className="p-4 text-white text-lg font-bold" style={{background:x.color}}>{x.name}</h3><div className="p-5"><div className="flex justify-between text-center gap-3"><div><b className="text-3xl text-emerald-700">{x.yes}</b><p>أنجزت | {pct(x.yes,schools.length)}</p></div><div><b className="text-3xl text-red-600">{x.no.length}</b><p>لم تنجز | {pct(x.no.length,schools.length)}</p></div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-red-100"><div className="h-full rounded-full bg-emerald-600" style={{width:pct(x.yes,schools.length)}}/></div><h4 className="mt-5 mb-2 font-bold">المدارس التي لم تنجز ({x.no.length})</h4>{x.no.length?<ol className="list-decimal pr-6 text-sm leading-8">{x.no.map(s=><li key={s.id}>{s.school_name}</li>)}</ol>:<p className="text-sm text-emerald-700">جميع المدارس أنجزت</p>}</div></section>)}</div>
 <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-xl font-black text-amber-800">المدارس التي لم تدخل المؤشرين معًا</h3>{schools.filter(s=>!madSet.has(s.id)&&!discSet.has(s.id)).length?<ol className="list-decimal pr-6 mt-3 leading-8">{schools.filter(s=>!madSet.has(s.id)&&!discSet.has(s.id)).map(s=><li key={s.id}>{s.school_name}</li>)}</ol>:<p className="mt-3">لا توجد مدارس متأخرة في المؤشرين معًا.</p>}</section>
 <footer className="mt-5 text-center text-xs text-slate-500">المؤشرات الأسبوعية مرتبطة بتاريخ بداية الأسبوع (الأحد). المسير مرتبط بأحدث فترة. الأرقام تُقرأ مباشرة من قاعدة البيانات عند فتح التقرير أو تحديثه.</footer>
 </div></main>;
}

'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Building2, Users, PartyPopper, Star, GraduationCap, RefreshCw, Maximize2, Minimize2, Target, TrendingUp } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School={id:string;school_code:string;school_name:string;is_active:boolean};
type Teacher={id:string;school_id:string;is_active:boolean};
type Activity={id:string;name:string;is_active:boolean};
type Report={id:string;activity_id:string;school_id:string;rating:number|null;status:string};
type Achievement={id:string;school_id:string;academic_year:string;achievement_percent:number;target_percent:number|null;notes:string|null};
type Row={school:School;totalStaff:number;activeStaff:number;staffingRate:number;completedActivities:number;activityRate:number;avgRating:number;achievement:number|null;target:number|null;achievementYear:string|null};

const pct=(n:number)=>Number.isFinite(n)?Math.round(n*10)/10:0;
const clamp=(n:number)=>Math.max(0,Math.min(100,Number(n)||0));

function Progress({value,className='bg-cyan-400'}:{value:number;className?:string}){return <div className="h-2.5 rounded-full bg-white/5 overflow-hidden"><div className={'h-full rounded-full '+className} style={{width:clamp(value)+'%'}}/></div>}
function Card({title,sub,icon:Icon,children,className=''}:{title:string;sub?:string;icon?:any;children:ReactNode;className?:string}){return <section className={'rounded-[24px] border border-white/10 bg-[#0d2135] shadow-xl overflow-hidden '+className}><div className="px-5 lg:px-6 py-5 border-b border-white/10 flex items-start justify-between gap-3"><div><h2 className="font-black text-lg lg:text-xl">{title}</h2>{sub&&<p className="text-xs text-slate-400 mt-1">{sub}</p>}</div>{Icon&&<div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-cyan-300"><Icon size={20}/></div>}</div><div className="p-5 lg:p-6">{children}</div></section>}
function Metric({title,value,unit,icon:Icon,bar,tone}:{title:string;value:number;unit:string;icon:any;bar:number;tone:string}){return <div className="relative rounded-[22px] border border-white/10 bg-[#0d2135] p-5 shadow-xl overflow-hidden"><div className={'absolute -left-10 -top-10 w-28 h-28 rounded-full opacity-10 '+tone}/><div className="flex items-start justify-between gap-3"><div><p className="text-xs lg:text-sm text-slate-400 font-bold">{title}</p><div className="mt-2 text-3xl lg:text-4xl font-black">{pct(value)}<span className="text-base text-slate-500 mr-1">{unit}</span></div></div><div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center"><Icon size={23}/></div></div><div className="mt-4"><Progress value={bar} className={tone}/></div></div>}

export default function KpiDashboard(){
  const sb=supabaseBrowser();
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [schools,setSchools]=useState<School[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[activities,setActivities]=useState<Activity[]>([]),[reports,setReports]=useState<Report[]>([]),[achievements,setAchievements]=useState<Achievement[]>([]);
  const [selectedSchool,setSelectedSchool]=useState('all'),[isFullscreen,setIsFullscreen]=useState(false),[saving,setSaving]=useState(false);
  const [academicYear,setAcademicYear]=useState('1447-1448'),[achievementPercent,setAchievementPercent]=useState(''),[targetPercent,setTargetPercent]=useState(''),[achievementNotes,setAchievementNotes]=useState('');

  async function load(){
    setLoading(true);setError('');
    const {data:{user}}=await sb.auth.getUser();
    if(!user){location.href='/';return;}
    const {data:admin}=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(!admin){setError('غير مصرح بالدخول إلى مؤشرات الأداء.');setLoading(false);return;}
    const [s,t,a,r,e]=await Promise.all([
      sb.from('schools').select('id,school_code,school_name,is_active').order('school_name'),
      sb.from('teachers').select('id,school_id,is_active'),
      sb.from('school_activities').select('id,name,is_active'),
      sb.from('school_activity_reports').select('id,activity_id,school_id,rating,status'),
      sb.from('school_educational_achievement').select('*').order('academic_year',{ascending:false})
    ]);
    const first=s.error||t.error||a.error||r.error||e.error;
    if(first){setError(first.message);setLoading(false);return;}
    setSchools(s.data||[]);setTeachers(t.data||[]);setActivities(a.data||[]);setReports(r.data||[]);setAchievements(e.data||[]);
    const latest=(e.data||[])[0];
    if(latest){setAcademicYear(latest.academic_year);setAchievementPercent(String(latest.achievement_percent));setTargetPercent(latest.target_percent==null?'':String(latest.target_percent));setAchievementNotes(latest.notes||'');}
    setLoading(false);
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{const id=setInterval(load,60000);return()=>clearInterval(id)},[]);
  useEffect(()=>{const h=()=>setIsFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h)},[]);

  const activeSchools=useMemo(()=>schools.filter(s=>s.is_active),[schools]);
  const activeActivities=useMemo(()=>activities.filter(a=>a.is_active),[activities]);
  const rows=useMemo<Row[]>(()=>activeSchools.map(s=>{
    const staff=teachers.filter(t=>t.school_id===s.id),reps=reports.filter(r=>r.school_id===s.id&&activeActivities.some(a=>a.id===r.activity_id)),rated=reps.filter(r=>r.rating!=null);
    const ach=achievements.filter(a=>a.school_id===s.id).sort((x,y)=>y.academic_year.localeCompare(x.academic_year))[0],completed=reps.filter(r=>r.status==='مراجع'||r.status==='مقدم').length;
    return {school:s,totalStaff:staff.length,activeStaff:staff.filter(t=>t.is_active).length,staffingRate:staff.length?staff.filter(t=>t.is_active).length/staff.length*100:0,completedActivities:completed,activityRate:activeActivities.length?completed/activeActivities.length*100:0,avgRating:rated.length?rated.reduce((sum,r)=>sum+(r.rating||0),0)/rated.length:0,achievement:ach?Number(ach.achievement_percent):null,target:ach?.target_percent==null?null:Number(ach.target_percent),achievementYear:ach?.academic_year||null};
  }),[activeSchools,teachers,reports,activeActivities,achievements]);

  const filtered=selectedSchool==='all'?rows:rows.filter(r=>r.school.id===selectedSchool);
  const selected=selectedSchool==='all'?null:rows.find(r=>r.school.id===selectedSchool)||null;
  const overall=useMemo(()=>{
    const staff=filtered.reduce((n,r)=>n+r.activeStaff,0),total=filtered.reduce((n,r)=>n+r.totalStaff,0),rated=reports.filter(r=>filtered.some(x=>x.school.id===r.school_id)&&r.rating!=null),vals=filtered.filter(r=>r.achievement!=null).map(r=>r.achievement as number);
    return {staffing:total?staff/total*100:0,activities:filtered.length?filtered.reduce((n,r)=>n+r.activityRate,0)/filtered.length:0,rating:rated.length?rated.reduce((n,r)=>n+(r.rating||0),0)/rated.length:0,achievement:vals.length?vals.reduce((n,v)=>n+v,0)/vals.length:0,staff,total};
  },[filtered,reports]);
  const ranking=[...filtered].sort((a,b)=>((b.staffingRate+b.activityRate+(b.achievement||0)+b.avgRating*20)-(a.staffingRate+a.activityRate+(a.achievement||0)+a.avgRating*20)));
  const distribution=[0,0,0,0];filtered.forEach(r=>{if(r.achievement==null)return;if(r.achievement>=90)distribution[3]++;else if(r.achievement>=75)distribution[2]++;else if(r.achievement>=60)distribution[1]++;else distribution[0]++;});

  function chooseSchool(id:string){
    setSelectedSchool(id);
    if(id==='all'){setAchievementPercent('');setTargetPercent('');setAchievementNotes('');return;}
    const ach=achievements.filter(a=>a.school_id===id).sort((x,y)=>y.academic_year.localeCompare(x.academic_year))[0];
    if(ach){setAcademicYear(ach.academic_year);setAchievementPercent(String(ach.achievement_percent));setTargetPercent(ach.target_percent==null?'':String(ach.target_percent));setAchievementNotes(ach.notes||'');}
    else{setAchievementPercent('');setTargetPercent('');setAchievementNotes('');}
  }
  async function saveAchievement(){
    if(selectedSchool==='all'){setError('اختر مدرسة محددة قبل حفظ مؤشر التحصيل التعليمي.');return;}
    const value=Number(achievementPercent),target=targetPercent===''?null:Number(targetPercent);
    if(!academicYear.trim()||!Number.isFinite(value)||value<0||value>100||(target!==null&&(!Number.isFinite(target)||target<0||target>100))){setError('أدخل السنة ونسبة التحصيل والمستهدف بشكل صحيح من 0 إلى 100.');return;}
    setSaving(true);setError('');setMessage('');
    const {data:{user}}=await sb.auth.getUser();
    const {error}=await sb.from('school_educational_achievement').upsert({school_id:selectedSchool,academic_year:academicYear.trim(),achievement_percent:value,target_percent:target,notes:achievementNotes.trim()||null,updated_by:user?.id||null,updated_at:new Date().toISOString()},{onConflict:'school_id,academic_year'});
    if(error)setError('تعذر حفظ التحصيل التعليمي: '+error.message);else{setMessage('تم حفظ مؤشر التحصيل التعليمي للمدرسة.');await load();}
    setSaving(false);
  }
  async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}}
  if(loading)return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-[#071525] text-white"><div className="text-xl font-bold">جارٍ تجهيز لوحة المؤشرات…</div></main>;

  return <main dir="rtl" className="min-h-screen bg-[#071525] text-white overflow-x-hidden">
    <div className="national-day-96-bar"><div className="max-w-[1920px] mx-auto px-4 lg:px-8 py-2 flex flex-wrap gap-2 justify-between items-center"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><b>عزّنا بطبعنا</b><div className="text-[10px] text-white/80">اليوم الوطني السعودي</div></div></div><span className="text-xs lg:text-sm font-bold">البوابة الإلكترونية لمدارس التعليم المستمر</span></div></div>
    <div className="max-w-[1920px] mx-auto p-4 lg:p-6 2xl:p-8 space-y-5">
      <header className="rounded-[28px] border border-white/10 bg-gradient-to-l from-[#12304a] via-[#0d2338] to-[#081827] shadow-2xl p-5 lg:p-7">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-5">
          <div><div className="flex items-center gap-2 text-cyan-300 text-xs font-black tracking-[.18em]"><BarChart3 size={17}/> EXECUTIVE PERFORMANCE CENTER</div><h1 className="text-3xl lg:text-5xl font-black mt-2">لوحة المؤشرات التنفيذية</h1><p className="text-slate-300 mt-2 text-sm lg:text-base">نظرة موحدة على المدارس والقوى العاملة والأنشطة والتحصيل التعليمي</p></div>
          <div className="flex flex-wrap gap-2 items-center"><select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="rounded-xl bg-white text-slate-900 px-4 py-3 min-w-[250px] font-bold"><option value="all">جميع المدارس</option>{activeSchools.map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select><button type="button" onClick={load} className="rounded-xl border border-white/15 bg-white/5 p-3 hover:bg-white/10" title="تحديث"><RefreshCw size={20}/></button><button type="button" onClick={toggleFullscreen} className="rounded-xl border border-white/15 bg-white/5 p-3 hover:bg-white/10" title="ملء الشاشة">{isFullscreen?<Minimize2 size={20}/>:<Maximize2 size={20}/>}</button></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {[[Building2,'المدارس النشطة',activeSchools.length,'مدرسة'],[Users,'إجمالي المنسوبين',overall.total,'منسوب'],[PartyPopper,'الأنشطة النشطة',activeActivities.length,'نشاط'],[TrendingUp,'التقارير المنجزة',filtered.reduce((n,r)=>n+r.completedActivities,0),'تقرير']].map(([Icon,label,value,unit]:any)=><div key={label} className="rounded-2xl bg-white/5 border border-white/5 p-4"><div className="flex items-center gap-2 text-slate-400 text-xs"><Icon size={16}/>{label}</div><div className="text-2xl font-black mt-2">{value}<span className="text-xs text-slate-500 mr-1">{unit}</span></div></div>)}
        </div>
      </header>
      {error&&<div className="rounded-2xl border border-red-400/30 bg-red-950/50 text-red-200 p-4">{error}</div>}
      {message&&<div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/40 text-emerald-200 p-4">{message}</div>}

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric title="نسبة المنسوبين العاملين" value={overall.staffing} unit="%" icon={Users} bar={overall.staffing} tone="bg-cyan-400"/>
        <Metric title="إنجاز الأنشطة" value={overall.activities} unit="%" icon={PartyPopper} bar={overall.activities} tone="bg-emerald-400"/>
        <Metric title="متوسط تقييم الأنشطة" value={overall.rating} unit="/ 5" icon={Star} bar={overall.rating*20} tone="bg-amber-400"/>
        <Metric title="متوسط التحصيل التعليمي" value={overall.achievement} unit="%" icon={GraduationCap} bar={overall.achievement} tone="bg-violet-400"/>
      </section>

      <section className="grid xl:grid-cols-12 gap-5">
        <Card title="مقارنة المدارس" sub="مؤشرات مختصرة قابلة للتفاعل" icon={Building2} className="xl:col-span-7"><div className="space-y-3">{ranking.slice(0,10).map((r,i)=><button key={r.school.id} type="button" onClick={()=>chooseSchool(r.school.id)} className={'w-full text-right rounded-2xl border p-3 transition '+(selectedSchool===r.school.id?'border-cyan-400 bg-cyan-400/10':'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]')}><div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-5"><div className="lg:w-[270px] shrink-0"><div className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-xs">{i+1}</span><b className="text-sm">{r.school.school_code} — {r.school.school_name}</b></div><div className="text-[11px] text-slate-500 mt-1 mr-9">{r.activeStaff} نشط من {r.totalStaff} · {r.completedActivities} تقرير</div></div><div className="flex-1 grid grid-cols-3 gap-3"><div><div className="flex justify-between text-[11px] mb-1"><span>العاملون</span><b>{pct(r.staffingRate)}%</b></div><Progress value={r.staffingRate} className="bg-cyan-400"/></div><div><div className="flex justify-between text-[11px] mb-1"><span>الأنشطة</span><b>{pct(r.activityRate)}%</b></div><Progress value={r.activityRate} className="bg-emerald-400"/></div><div><div className="flex justify-between text-[11px] mb-1"><span>التحصيل</span><b>{r.achievement==null?'—':pct(r.achievement)+'%'}</b></div><Progress value={r.achievement||0} className="bg-violet-400"/></div></div></div></button>)}</div></Card>
        <Card title="العاملون × إنجاز الأنشطة" sub="مقارنة بصرية لكل مدرسة" icon={TrendingUp} className="xl:col-span-5"><svg viewBox="0 0 620 330" className="w-full h-[300px] lg:h-[350px]"><line x1="55" y1="275" x2="590" y2="275" stroke="#334155"/><line x1="55" y1="25" x2="55" y2="275" stroke="#334155"/><line x1="55" y1="150" x2="590" y2="150" stroke="#1e3a52" strokeDasharray="5 5"/><line x1="322" y1="25" x2="322" y2="275" stroke="#1e3a52" strokeDasharray="5 5"/><text x="322" y="315" textAnchor="middle" fontSize="12" fill="#94a3b8">نسبة العاملين %</text><text x="17" y="150" transform="rotate(-90 17 150)" textAnchor="middle" fontSize="12" fill="#94a3b8">إنجاز الأنشطة %</text>{filtered.filter(r=>r.totalStaff>0).map(r=>{const x=55+clamp(r.staffingRate)*5.35,y=275-clamp(r.activityRate)*2.5;return <g key={r.school.id} onClick={()=>chooseSchool(r.school.id)} style={{cursor:'pointer'}}><circle cx={x} cy={y} r={selectedSchool===r.school.id?12:9} fill={selectedSchool===r.school.id?'#22d3ee':'#38bdf8'} opacity=".9"/><text x={x+12} y={y+4} fontSize="10" fill="#cbd5e1">{r.school.school_code}</text><title>{r.school.school_name}</title></g>})}</svg></Card>
      </section>

      <section className="grid xl:grid-cols-12 gap-5">
        <Card title="التحصيل التعليمي مقابل المستهدف" sub="قراءة الفجوة لكل مدرسة" icon={Target} className="xl:col-span-5"><div className="space-y-4">{filtered.filter(r=>r.achievement!=null).slice(0,10).map(r=><button type="button" key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className="w-full text-right"><div className="flex justify-between text-xs lg:text-sm"><b>{r.school.school_code} — {r.school.school_name}</b><span>{pct(r.achievement||0)}%{r.target==null?'':' / '+pct(r.target)+'%'}</span></div><div className="h-5 rounded-full bg-white/5 mt-2 overflow-hidden relative"><span className="absolute inset-y-0 right-0 bg-violet-500 rounded-full" style={{width:clamp(r.achievement||0)+'%'}}/>{r.target!=null&&<span className="absolute top-0 bottom-0 border-r-2 border-amber-300" style={{right:clamp(r.target)+'%'}}/>}</div></button>)}{!filtered.some(r=>r.achievement!=null)&&<div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-slate-500">لا توجد بيانات تحصيل تعليمية مسجلة حاليًا.</div>}</div><div className="flex gap-5 text-xs text-slate-400 mt-5"><span><i className="inline-block w-3 h-3 rounded bg-violet-500 ml-1"/> التحصيل</span><span><i className="inline-block w-3 h-3 rounded bg-amber-300 ml-1"/> المستهدف</span></div></Card>
        <Card title="النشاط والتقييم" sub="إنجاز التقارير ومتوسط التقييم" icon={Star} className="xl:col-span-4"><div className="space-y-4">{ranking.slice(0,8).map(r=><button type="button" key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className="w-full text-right"><div className="flex justify-between text-xs"><b>{r.school.school_code}</b><span>{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</span></div><div className="flex gap-2 mt-2"><div className="flex-1"><Progress value={r.activityRate} className="bg-emerald-400"/></div><div className="w-24"><Progress value={r.avgRating*20} className="bg-amber-400"/></div></div></button>)}</div></Card>
        <Card title="توزيع التحصيل" sub="عدد المدارس حسب النسبة" icon={GraduationCap} className="xl:col-span-3"><div className="grid grid-cols-4 gap-2 items-end h-52">{distribution.map((v,i)=><div key={i} className="flex flex-col items-center justify-end h-full gap-2"><b>{v}</b><div className="w-full rounded-t-xl bg-violet-500/10 flex items-end overflow-hidden" style={{height:145}}><div className="w-full bg-violet-500 rounded-t-xl" style={{height:Math.max(v?12:0,Math.min(145,v*35))}}/></div><span className="text-[10px] text-slate-400">{['أقل من 60','60–74','75–89','90+'][i]}</span></div>)}</div></Card>
      </section>

      <Card title="مصفوفة المؤشرات" sub="اضغط على المدرسة لعرض التفاصيل وتحديث التحصيل" icon={BarChart3}><div className="overflow-x-auto -mx-2"><table className="w-full text-sm min-w-[780px]"><thead className="bg-white/[0.03] text-slate-400"><tr><th className="p-4 text-right">المدرسة</th><th>المنسوبون</th><th>الأنشطة</th><th>التقييم</th><th>التحصيل</th><th>المستهدف</th></tr></thead><tbody>{filtered.map(r=><tr key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className={'border-t border-white/5 cursor-pointer hover:bg-white/[0.04] '+(selectedSchool===r.school.id?'bg-cyan-400/10':'')}><td className="p-4"><b>{r.school.school_code} — {r.school.school_name}</b><div className="text-[11px] text-slate-500 mt-1">{r.activeStaff} نشط / {r.totalStaff}</div></td><td className="text-center">{pct(r.staffingRate)}%</td><td className="text-center">{pct(r.activityRate)}%</td><td className="text-center">{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</td><td className="text-center">{r.achievement==null?'—':pct(r.achievement)+'%'}</td><td className="text-center">{r.target==null?'—':pct(r.target)+'%'}</td></tr>)}</tbody></table></div></Card>

      {selected&&<section className="grid lg:grid-cols-2 gap-5"><Card title="تفاصيل المدرسة" sub={selected.school.school_name} icon={Building2}><div className="grid grid-cols-2 gap-4">{[['العاملون',selected.staffingRate,'bg-cyan-400'],['الأنشطة',selected.activityRate,'bg-emerald-400'],['التقييم',selected.avgRating*20,'bg-amber-400'],['التحصيل',selected.achievement||0,'bg-violet-400']].map(([label,value,tone]:any)=><div key={label} className="rounded-2xl bg-white/[0.03] border border-white/5 p-4"><div className="flex justify-between text-xs mb-2"><span className="text-slate-400">{label}</span><b>{label==='التقييم'?pct((value as number)/20)+' / 5':pct(value)+'%'}</b></div><Progress value={value} className={tone}/></div>)}</div></Card>
      <Card title="تحديث التحصيل التعليمي" sub={selected.achievementYear?'آخر سنة مسجلة: '+selected.achievementYear:'لا توجد سنة مسجلة'} icon={Target}><div className="grid sm:grid-cols-3 gap-3"><input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="السنة الدراسية"/><input type="number" min="0" max="100" step=".1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="التحصيل %"/><input type="number" min="0" max="100" step=".1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="المستهدف %"/></div><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={3} className="rounded-xl bg-white text-slate-900 px-3 py-3 w-full mt-3" placeholder="ملاحظات المؤشر"/><button type="button" disabled={saving} onClick={saveAchievement} className="mt-3 rounded-xl bg-cyan-400 text-slate-950 px-6 py-3 font-black hover:bg-cyan-300 disabled:opacity-50">{saving?'جارٍ الحفظ…':'حفظ مؤشر التحصيل'}</button></Card></section>}

      <footer className="text-center text-xs text-slate-500 py-2">تحديث تلقائي كل 60 ثانية · {selected?'المدرسة المحددة: '+selected.school.school_name:'جميع المدارس'}</footer>
    </div>
  </main>;
}

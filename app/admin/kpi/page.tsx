'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Building2, Users, PartyPopper, Star, GraduationCap, RefreshCw, Save, Target, Maximize2, Minimize2 } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School={id:string;school_code:string;school_name:string;is_active:boolean};
type Teacher={id:string;school_id:string;is_active:boolean};
type Activity={id:string;name:string;is_active:boolean};
type Report={id:string;activity_id:string;school_id:string;rating:number|null;status:string};
type Achievement={id:string;school_id:string;academic_year:string;achievement_percent:number;target_percent:number|null;notes:string|null};

type Row={
  school:School;
  totalStaff:number;
  activeStaff:number;
  staffingRate:number;
  activities:number;
  completedActivities:number;
  activityRate:number;
  avgRating:number;
  achievement:number|null;
  target:number|null;
  achievementYear:string|null;
};

function pct(n:number){return Number.isFinite(n)?Math.round(n*10)/10:0}
function barClass(v:number){return v>=80?'bg-emerald-600':v>=60?'bg-amber-500':'bg-rose-500'}

export default function KpiDashboard(){
  const sb=supabaseBrowser();
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [schools,setSchools]=useState<School[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[activities,setActivities]=useState<Activity[]>([]),[reports,setReports]=useState<Report[]>([]),[achievements,setAchievements]=useState<Achievement[]>([]);
  const [selectedSchool,setSelectedSchool]=useState('all');
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [academicYear,setAcademicYear]=useState('1447-1448');
  const [achievementPercent,setAchievementPercent]=useState('');
  const [targetPercent,setTargetPercent]=useState('');
  const [achievementNotes,setAchievementNotes]=useState('');

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
  useEffect(()=>{const t=setInterval(()=>load(),60000);return()=>clearInterval(t)},[]);
  useEffect(()=>{const h=()=>setIsFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h)},[]);

  const activeActivities=activities.filter(a=>a.is_active);
  const rows=useMemo<Row[]>(()=>schools.filter(s=>s.is_active).map(s=>{
    const st=teachers.filter(t=>t.school_id===s.id);
    const reps=reports.filter(r=>r.school_id===s.id && activeActivities.some(a=>a.id===r.activity_id));
    const rated=reps.filter(r=>r.rating!=null);
    const ach=achievements.filter(a=>a.school_id===s.id).sort((x,y)=>y.academic_year.localeCompare(x.academic_year))[0];
    return {
      school:s,totalStaff:st.length,activeStaff:st.filter(t=>t.is_active).length,
      staffingRate:st.length?st.filter(t=>t.is_active).length/st.length*100:0,
      activities:activeActivities.length,completedActivities:reps.filter(r=>r.status==='مراجع'||r.status==='مقدم').length,
      activityRate:activeActivities.length?reps.filter(r=>r.status==='مراجع'||r.status==='مقدم').length/activeActivities.length*100:0,
      avgRating:rated.length?rated.reduce((sum,r)=>sum+(r.rating||0),0)/rated.length:0,
      achievement:ach?Number(ach.achievement_percent):null,target:ach?.target_percent==null?null:Number(ach.target_percent),achievementYear:ach?.academic_year||null
    };
  }),[schools,teachers,reports,activeActivities,achievements]);

  const filtered=selectedSchool==='all'?rows:rows.filter(r=>r.school.id===selectedSchool);
  const chartRows=filtered.slice(0,10);
  const distribution=[0,0,0,0]; filtered.forEach(r=>{if(r.achievement==null)return;const v=r.achievement;if(v>=90)distribution[3]++;else if(v>=75)distribution[2]++;else if(v>=60)distribution[1]++;else distribution[0]++;});
  const overall={
    staffing:filtered.length?filtered.reduce((s,r)=>s+r.staffingRate,0)/filtered.length:0,
    activities:filtered.length?filtered.reduce((s,r)=>s+r.activityRate,0)/filtered.length:0,
    rating:(()=>{const ids=new Set(filtered.map(x=>x.school.id));const rated=reports.filter(r=>ids.has(r.school_id)&&r.rating!=null);return rated.length?rated.reduce((s,r)=>s+(r.rating||0),0)/rated.length:0})(),
    achievement:(()=>{const vals=filtered.filter(r=>r.achievement!=null).map(r=>r.achievement as number);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:0})()
  };

  function chooseSchool(id:string){
    setSelectedSchool(id);
    const row=rows.find(r=>r.school.id===id);
    const ach=achievements.filter(a=>a.school_id===id).sort((x,y)=>y.academic_year.localeCompare(x.academic_year))[0];
    if(row&&ach){setAcademicYear(ach.academic_year);setAchievementPercent(String(ach.achievement_percent));setTargetPercent(ach.target_percent==null?'':String(ach.target_percent));setAchievementNotes(ach.notes||'');}
    else {setAchievementPercent('');setTargetPercent('');setAchievementNotes('');}
  }

  async function saveAchievement(){
    if(selectedSchool==='all'){setError('اختر مدرسة محددة قبل حفظ مؤشر التحصيل التعليمي.');return;}
    const value=Number(achievementPercent),target=targetPercent===''?null:Number(targetPercent);
    if(!academicYear.trim()||!Number.isFinite(value)||value<0||value>100||(target!==null&&(!Number.isFinite(target)||target<0||target>100))){setError('أدخل السنة ونسبة التحصيل بشكل صحيح من 0 إلى 100.');return;}
    setSaving(true);setError('');setMessage('');
    const {data:{user}}=await sb.auth.getUser();
    const {error}=await sb.from('school_educational_achievement').upsert({
      school_id:selectedSchool,academic_year:academicYear.trim(),achievement_percent:value,target_percent:target,notes:achievementNotes.trim()||null,updated_by:user?.id||null,updated_at:new Date().toISOString()
    },{onConflict:'school_id,academic_year'});
    if(error)setError('تعذر حفظ التحصيل التعليمي: '+error.message);
    else{setMessage('تم حفظ مؤشر التحصيل التعليمي للمدرسة.');await load();}
    setSaving(false);
  }

  async function toggleFullscreen(){try{if(!document.fullscreenElement){await document.documentElement.requestFullscreen()}else{await document.exitFullscreen()}}catch{}}

  if(loading)return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-[#071525] text-white"><div className="text-xl font-bold">جارٍ تجهيز لوحة المؤشرات…</div></main>;

  const topSchools=[...filtered].sort((a,b)=>b.staffingRate+b.activityRate+(b.achievement||0)-(a.staffingRate+a.activityRate+(a.achievement||0))).slice(0,8);
  const scatterRows=filtered.filter(r=>r.totalStaff>0);
  const achievementRows=filtered.filter(r=>r.achievement!=null).slice(0,8);
  const maxStaff=Math.max(1,...topSchools.map(r=>r.totalStaff));
  return <main dir="rtl" className="min-h-screen bg-[#071525] text-white overflow-x-hidden">
    <div className="national-day-96-bar"><div className="national-day-96-content max-w-[1920px] mx-auto px-6 py-2 flex justify-between items-center"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><b>عزّنا بطبعنا</b><div className="text-[11px] text-white/80">اليوم الوطني السعودي</div></div></div><span className="text-xs md:text-sm font-bold opacity-90">البوابة الإلكترونية لمدارس التعليم المستمر — لوحة المؤشرات التنفيذية</span></div></div>
    <div className="max-w-[1920px] mx-auto p-4 lg:p-6 2xl:p-8 space-y-5">
      <header className="rounded-[28px] border border-white/10 bg-gradient-to-l from-[#102a43] via-[#0c2136] to-[#081827] shadow-2xl px-6 py-5 lg:px-8 flex flex-col xl:flex-row justify-between gap-5">
        <div><div className="flex items-center gap-2 text-emerald-300 text-xs font-black tracking-widest"><BarChart3 size={18}/> EXECUTIVE PERFORMANCE CENTER</div><h1 className="text-3xl lg:text-5xl font-black mt-2">لوحة الأداء التنفيذي</h1><p className="text-slate-300 mt-2 text-sm lg:text-base">مركز متابعة موحد لمؤشرات المدارس والأنشطة والتحصيل التعليمي</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={()=>chooseSchool("all")} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-bold hover:bg-white/10">جميع المدارس</button>
          <select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="rounded-xl bg-white text-slate-900 px-4 py-3 min-w-[260px] font-bold"><option value="all">كل المدارس</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select>
          <button type="button" onClick={load} title="تحديث البيانات" className="rounded-xl border border-white/15 bg-white/5 p-3 hover:bg-white/10"><RefreshCw size={20}/></button>
          <button type="button" onClick={toggleFullscreen} title="ملء الشاشة" className="rounded-xl border border-white/15 bg-white/5 p-3 hover:bg-white/10">{isFullscreen?<Minimize2 size={20}/>:<Maximize2 size={20}/>}</button>
        </div>
      </header>
      {error&&<div className="rounded-2xl border border-red-400/30 bg-red-950/50 text-red-200 p-4">{error}</div>}
      {message&&<div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/40 text-emerald-200 p-4">{message}</div>}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[[Users,'نسبة منسوبي المدارس العاملين',overall.staffing,'%', 'bg-cyan-500'],[PartyPopper,'إنجاز الأنشطة',overall.activities,'%', 'bg-emerald-500'],[Star,'متوسط تقييم الأنشطة',overall.rating,'/ 5', 'bg-amber-400'],[GraduationCap,'متوسط التحصيل التعليمي',overall.achievement,'%', 'bg-violet-500']].map(([Icon,title,value,unit,bg]:any)=><div key={title} className="rounded-[24px] border border-white/10 bg-[#0d2135] p-5 lg:p-6 shadow-xl relative overflow-hidden"><div className={"absolute -left-8 -top-8 w-24 h-24 rounded-full "+bg+" opacity-10"}/><div className="flex justify-between items-start"><div><div className="text-slate-400 text-xs lg:text-sm font-bold">{title}</div><div className="text-4xl lg:text-5xl font-black mt-3">{pct(value)}<span className="text-lg lg:text-xl text-slate-500 mr-1">{unit}</span></div></div><div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center"><Icon size={25}/></div></div><div className="mt-4 h-2 rounded-full bg-white/5 overflow-hidden"><div className={"h-full rounded-full "+bg} style={{width:Math.min(100,unit==='/ 5'?Number(value)*20:Number(value))+'%'}}/></div></div>)}
      </section>
      <section className="grid xl:grid-cols-12 gap-5">
        <TVCard title="أداء المدارس" sub="العاملون والأنشطة والتحصيل" className="xl:col-span-7">
          <div className="space-y-3">{topSchools.map(r=><button type="button" key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className={"w-full text-right rounded-2xl p-3 border transition-all "+(selectedSchool===r.school.id?"border-cyan-400 bg-cyan-400/10":"border-white/5 bg-white/[0.02] hover:bg-white/[0.05]")}><div className="flex justify-between items-center gap-4"><div className="min-w-0"><b className="text-sm lg:text-base">{r.school.school_code} — {r.school.school_name}</b><div className="text-[11px] text-slate-500 mt-1">{r.activeStaff} نشط من {r.totalStaff} · {r.completedActivities} تقرير</div></div><div className="flex gap-4 text-xs lg:text-sm shrink-0"><span>عاملون <b>{pct(r.staffingRate)}%</b></span><span>أنشطة <b>{pct(r.activityRate)}%</b></span><span>تحصيل <b>{r.achievement==null?'—':pct(r.achievement)+'%'}</b></span></div></div><div className="grid grid-cols-3 gap-1 mt-2"><div className="h-2 rounded-full bg-white/5 overflow-hidden"><span className="block h-full bg-cyan-400" style={{width:Math.min(100,r.staffingRate)+'%'}}/></div><div className="h-2 rounded-full bg-white/5 overflow-hidden"><span className="block h-full bg-emerald-400" style={{width:Math.min(100,r.activityRate)+'%'}}/></div><div className="h-2 rounded-full bg-white/5 overflow-hidden"><span className="block h-full bg-violet-400" style={{width:Math.min(100,r.achievement||0)+'%'}}/></div></div></button>)}</div>
        </TVCard>
        <TVCard title="العاملون × إنجاز الأنشطة" sub="كل نقطة تمثل مدرسة" className="xl:col-span-5">
          <svg viewBox="0 0 620 330" className="w-full h-[300px] lg:h-[350px]"><line x1="55" y1="275" x2="590" y2="275" stroke="#334155"/><line x1="55" y1="25" x2="55" y2="275" stroke="#334155"/><line x1="55" y1="150" x2="590" y2="150" stroke="#1e3a52" strokeDasharray="5 5"/><line x1="322" y1="25" x2="322" y2="275" stroke="#1e3a52" strokeDasharray="5 5"/><text x="322" y="315" textAnchor="middle" fontSize="12" fill="#94a3b8">نسبة العاملين %</text><text x="17" y="150" transform="rotate(-90 17 150)" textAnchor="middle" fontSize="12" fill="#94a3b8">إنجاز الأنشطة %</text>{scatterRows.map(r=>{const x=55+Math.min(100,r.staffingRate)*5.35,y=275-Math.min(100,r.activityRate)*2.5;return <g key={r.school.id} onClick={()=>chooseSchool(r.school.id)} style={{cursor:"pointer"}}><circle cx={x} cy={y} r={selectedSchool===r.school.id?12:9} fill={selectedSchool===r.school.id?"#22d3ee":"#38bdf8"} opacity=".9"/><text x={x+12} y={y+4} fontSize="10" fill="#cbd5e1">{r.school.school_code}</text><title>{r.school.school_name} — العاملون {pct(r.staffingRate)}% — الأنشطة {pct(r.activityRate)}%</title></g>})}</svg>
        </TVCard>
      </section>
      <section className="grid xl:grid-cols-12 gap-5">
        <TVCard title="التحصيل التعليمي مقابل المستهدف" sub="قراءة مباشرة للفجوة" className="xl:col-span-5">
          <div className="space-y-4">{achievementRows.map(r=><button type="button" key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className="w-full text-right"><div className="flex justify-between text-xs lg:text-sm"><b>{r.school.school_code}</b><span>{pct(r.achievement||0)}% {r.target==null?'':' / '+pct(r.target)+'% مستهدف'}</span></div><div className="h-5 rounded-full bg-white/5 mt-1 overflow-hidden relative"><span className="absolute inset-y-0 right-0 bg-violet-500 rounded-full" style={{width:Math.min(100,r.achievement||0)+'%'}}/>{r.target!=null&&<span className="absolute top-0 bottom-0 border-r-2 border-amber-300" style={{right:Math.min(100,r.target)+'%'}}/>}</div></button>)}</div>
          <div className="flex gap-5 text-xs text-slate-400 mt-5"><span><i className="inline-block w-3 h-3 rounded bg-violet-500 ml-1"/> التحصيل</span><span><i className="inline-block w-3 h-3 rounded bg-amber-300 ml-1"/> المستهدف</span></div>
        </TVCard>
        <TVCard title="النشاط والتقييم" sub="العلاقة بين الإنجاز وجودة التقارير" className="xl:col-span-4">
          <div className="space-y-4">{topSchools.slice(0,6).map(r=><button type="button" key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className="w-full text-right"><div className="flex justify-between text-xs"><b>{r.school.school_code}</b><span>{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</span></div><div className="flex gap-2 mt-2"><div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden"><span className="block h-full bg-emerald-400" style={{width:Math.min(100,r.activityRate)+'%'}}/></div><div className="w-24 h-3 bg-white/5 rounded-full overflow-hidden"><span className="block h-full bg-amber-400" style={{width:Math.min(100,r.avgRating*20)+'%'}}/></div></div></button>)}</div>
        </TVCard>
        <TVCard title="توزيع المدارس" sub="حسب شرائح التحصيل" className="xl:col-span-3">
          <div className="grid grid-cols-4 gap-2 items-end h-48">{distribution.map((v,i)=><div key={i} className="flex flex-col items-center justify-end h-full gap-2"><b className="text-lg">{v}</b><div className="w-full rounded-t-xl bg-violet-500/20 flex items-end overflow-hidden" style={{height:130}}><div className="w-full bg-violet-500 rounded-t-xl" style={{height:Math.max(v?12:0,Math.min(130,v*32))}}/></div><span className="text-[10px] text-slate-400 text-center">{['<60','60–74','75–89','90+'][i]}</span></div>)}</div>
        </TVCard>
      </section>
      <section className="rounded-[24px] border border-white/10 bg-[#0d2135] shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center"><div><h2 className="font-black text-lg">مصفوفة المؤشرات</h2><p className="text-xs text-slate-500 mt-1">اضغط على أي مدرسة لفتح التفاصيل</p></div><span className="text-xs text-slate-500">{filtered.length} مدرسة</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-white/[0.03] text-slate-400"><tr><th className="p-4 text-right">المدرسة</th><th>العاملون</th><th>الأنشطة</th><th>التقييم</th><th>التحصيل</th><th>المستهدف</th></tr></thead><tbody>{filtered.map(r=><tr key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className={"border-t border-white/5 cursor-pointer hover:bg-white/[0.04] "+(selectedSchool===r.school.id?"bg-cyan-400/10":"")}><td className="p-4"><b>{r.school.school_code} — {r.school.school_name}</b></td><td className="text-center">{pct(r.staffingRate)}%</td><td className="text-center">{pct(r.activityRate)}%</td><td className="text-center">{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</td><td className="text-center">{r.achievement==null?'—':pct(r.achievement)+'%'}</td><td className="text-center">{r.target==null?'—':pct(r.target)+'%'}</td></tr>)}</tbody></table></div>
      </section>
      {selectedSchool!=='all'&&<section className="grid lg:grid-cols-2 gap-5"><TVCard title="تفاصيل المدرسة" sub={filtered[0]?.school.school_name||''}><div className="grid grid-cols-2 gap-4">{filtered.map(r=><div key={r.school.id}><TVMetric label="العاملون" value={r.staffingRate}/><TVMetric label="الأنشطة" value={r.activityRate}/><TVMetric label="التقييم" value={r.avgRating*20}/><TVMetric label="التحصيل" value={r.achievement??0}/></div>)}</div></TVCard><div className="rounded-[24px] border border-white/10 bg-[#0d2135] p-5"><h2 className="font-black text-lg">تحديث التحصيل التعليمي</h2><div className="grid sm:grid-cols-3 gap-3 mt-4"><input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="السنة"/><input type="number" min="0" max="100" step=".1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="التحصيل %"/><input type="number" min="0" max="100" step=".1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="rounded-xl bg-white text-slate-900 px-3 py-3" placeholder="المستهدف %"/></div><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={2} className="rounded-xl bg-white text-slate-900 px-3 py-3 w-full mt-3" placeholder="ملاحظات"/><button disabled={saving} onClick={saveAchievement} className="mt-3 rounded-xl bg-cyan-500 text-slate-950 px-5 py-3 font-black">{saving?'جاري الحفظ…':'حفظ المؤشر'}</button></div></section>}
      <footer className="text-center text-xs text-slate-500 py-2">تحديث تلقائي كل 60 ثانية · {selectedSchool==="all"?"جميع المدارس":filtered[0]?.school.school_name||''}</footer>
    </div>
  </main>;
}

function MetricMini({value}:{value:number}){const v=Math.max(0,Math.min(100,Number(value)||0));return <div className="min-w-[110px]"><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-700 rounded-full" style={{width:v+'%'}}/></div><div className="text-xs text-center mt-1">{pct(v)}%</div></div>}

function Mini({label,v}:{label:string;v:number}){const n=Math.max(0,Math.min(100,Number(v)||0));return <div className="mt-2"><div className="flex justify-between text-[11px] text-slate-500"><span>{label}</span><span>{pct(n)}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-700 rounded-full" style={{width:n+'%'}}/></div></div>}

function ChartCard({title,sub,children}:{title:string;sub?:string;children:ReactNode}){return <div className="card p-5 shadow-sm"><div className="flex justify-between items-center mb-5"><div><h2 className="font-black text-lg">{title}</h2>{sub&&<p className="text-xs text-slate-500 mt-1">{sub}</p>}</div><BarChart3 size={20}/></div>{children}</div>}

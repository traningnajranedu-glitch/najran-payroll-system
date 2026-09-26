'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Building2, Users, PartyPopper, Star, GraduationCap, RefreshCw, Save, Target } from 'lucide-react';
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

  if(loading)return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50"><div className="card p-10">جارٍ تحميل مؤشرات الأداء…</div></main>;

  const scatterRows=filtered.filter(r=>r.totalStaff>0);
  return <main dir="rtl" className="min-h-screen bg-[#f4f7fb]">
    <div className="national-day-96-bar"><div className="national-day-96-content max-w-[1500px] mx-auto px-4 py-2 flex justify-between items-center"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><b>عزّنا بطبعنا</b><div className="text-[11px] text-white/80">اليوم الوطني السعودي</div></div></div><span className="hidden md:block text-sm">لوحة المؤشرات التنفيذية — مدارس التعليم المستمر</span></div></div>
    <header className="bg-[var(--navy)] text-white shadow-lg"><div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6 flex justify-between items-center gap-4"><div><div className="flex items-center gap-2 text-emerald-300 text-xs font-bold"><BarChart3 size={16}/> EXECUTIVE PERFORMANCE DASHBOARD</div><h1 className="text-2xl sm:text-3xl font-black mt-1">لوحة الأداء التنفيذي</h1><p className="text-sm text-blue-100 mt-1">تحليل تفاعلي للعلاقات بين المدارس والمؤشرات التعليمية والتشغيلية</p></div><div className="flex gap-2"><button onClick={()=>load()} className="bg-white/10 rounded-xl px-4 py-2"><RefreshCw size={17}/></button><button onClick={()=>location.href='/admin'} className="bg-white text-[var(--navy)] rounded-xl px-4 py-2 font-bold">الإدارة</button></div></div></header>
    <div className="max-w-[1500px] mx-auto p-4 sm:p-6 space-y-6">
      {message&&<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4">{message}</div>}{error&&<div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4">{error}</div>}
      <div className="card p-4 shadow-sm flex flex-wrap justify-between items-center gap-4"><div><span className="text-xs text-slate-500 font-bold">الفلاتر التفاعلية</span><h2 className="font-black text-lg">نطاق التحليل</h2><p className="text-xs text-slate-500 mt-1">{selectedSchool==="all"?"عرض جميع المدارس":filtered[0]?.school.school_name}</p></div><div className="flex gap-2 items-center"><button type="button" onClick={()=>chooseSchool("all")} className="border rounded-xl px-4 py-3 font-bold hover:bg-slate-50">إعادة ضبط</button><select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="border rounded-xl px-4 py-3 min-w-[300px]"><option value="all">جميع المدارس</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[[Users,'نسبة العاملين',overall.staffing,'%'],[PartyPopper,'إنجاز الأنشطة',overall.activities,'%'],[Star,'متوسط التقييم',overall.rating,'/ 5'],[GraduationCap,'التحصيل التعليمي',overall.achievement,'%']].map(([Icon,title,value,unit]:any)=><div className="card p-5 shadow-sm" key={title as string}><div className="flex justify-between"><div><span className="text-xs text-slate-500">{title}</span><div className="text-3xl font-black mt-2">{pct(value as number)} <small className="text-base text-slate-400">{unit}</small></div></div><div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><Icon/></div></div></div>)}</div>
      <div className="grid xl:grid-cols-2 gap-6">
        <ChartCard title="1. نسبة العاملين حسب المدرسة" sub="مقارنة تفاعلية"><div className="space-y-4">{chartRows.map(r=><div key={r.school.id}><div className="flex justify-between text-xs mb-1"><b>{r.school.school_code} — {r.school.school_name}</b><span>{pct(r.staffingRate)}%</span></div><div className="h-4 bg-slate-100 rounded-full overflow-hidden"><button type="button" aria-label={"اختيار "+r.school.school_name} onClick={()=>chooseSchool(r.school.id)} className="h-full bg-teal-700 rounded-full hover:bg-teal-800 transition-all" style={{width:Math.min(100,r.staffingRate)+'%'}}/></div></div>)}</div></ChartCard>
        <ChartCard title="2. علاقة العاملين بإنجاز الأنشطة" sub="Scatter Plot — كل نقطة تمثل مدرسة"><svg viewBox="0 0 640 310" className="w-full"><line x1="55" y1="265" x2="610" y2="265" stroke="#cbd5e1"/><line x1="55" y1="20" x2="55" y2="265" stroke="#cbd5e1"/><line x1="55" y1="142" x2="610" y2="142" stroke="#e2e8f0" strokeDasharray="5 5"/><line x1="332" y1="20" x2="332" y2="265" stroke="#e2e8f0" strokeDasharray="5 5"/><text x="330" y="295" textAnchor="middle" fontSize="11">نسبة العاملين %</text><text x="15" y="145" transform="rotate(-90 15 145)" textAnchor="middle" fontSize="11">إنجاز الأنشطة %</text>{filtered.map(r=>{const x=55+r.staffingRate*5.55,y=265-r.activityRate*2.45;return <g key={r.school.id}><circle onClick={()=>chooseSchool(r.school.id)} style={{cursor:"pointer"}} cx={x} cy={y} r={selectedSchool===r.school.id?"11":"8"} fill={selectedSchool===r.school.id?"#0f766e":"#1d4ed8"} opacity=".85"><title>{r.school.school_code} — العاملون {pct(r.staffingRate)}% — الأنشطة {pct(r.activityRate)}%</title></circle><text x={x+10} y={y+4} fontSize="9" fill="#475569">{r.school.school_code}</text></g>})}</svg></ChartCard>
        <ChartCard title="3. توزيع التحصيل التعليمي" sub="عدد المدارس ضمن شرائح التحصيل"><div className="h-64 flex items-end justify-around gap-4">{distribution.map((v,i)=>{const labels=['أقل من 60%','60–74%','75–89%','90% فأعلى'];return <div className="flex-1 flex flex-col items-center gap-2" key={labels[i]}><b>{v}</b><div className="w-full max-w-20 bg-slate-100 rounded-t-xl overflow-hidden flex items-end" style={{height:160}}><div className="w-full bg-indigo-600 rounded-t-xl transition-all hover:bg-indigo-700" style={{height:Math.max(8,v*40)}}/></div><span className="text-xs text-slate-500 text-center">{labels[i]}</span></div>})}</div></ChartCard>
        <ChartCard title="4. النشاط مقابل التقييم" sub="مقارنة نسبة الإنجاز بجودة التقييم"><div className="space-y-4">{chartRows.map(r=><div key={r.school.id}><div className="flex justify-between text-xs mb-1"><b>{r.school.school_code}</b><span>{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</span></div><div className="flex gap-2"><button type="button" onClick={()=>chooseSchool(r.school.id)} aria-label={"عرض "+r.school.school_name} className="flex-1 h-3 bg-slate-100 rounded-full text-right"><span className="block h-full bg-amber-500 rounded-full hover:bg-amber-600 transition-all" style={{width:Math.min(100,r.activityRate)+'%'}}/></button><button type="button" onClick={()=>chooseSchool(r.school.id)} aria-label={"عرض تقييم "+r.school.school_name} className="w-28 h-3 bg-slate-100 rounded-full text-right"><span className="block h-full bg-violet-600 rounded-full hover:bg-violet-700 transition-all" style={{width:Math.min(100,r.avgRating*20)+'%'}}/></button></div></div>)}</div></ChartCard>
      </div>
      <div className="grid xl:grid-cols-3 gap-6">
        <ChartCard title="5. بصمة المدارس متعددة المحاور" sub="مؤشرات العاملين والأنشطة والتقييم والتحصيل"><div className="grid grid-cols-2 gap-3">{chartRows.slice(0,6).map(r=><button type="button" onClick={()=>chooseSchool(r.school.id)} className={"text-right border rounded-2xl p-3 w-full hover:shadow-md transition-all "+(selectedSchool===r.school.id?"ring-2 ring-teal-600":"")} key={r.school.id}><b>{r.school.school_code}</b><Mini label="العاملون" v={r.staffingRate}/><Mini label="الأنشطة" v={r.activityRate}/><Mini label="التقييم" v={r.avgRating*20}/><Mini label="التحصيل" v={r.achievement??0}/></button>)}</div></ChartCard>
        <ChartCard title="6. التحصيل مقابل المستهدف" sub="الفجوة لكل مدرسة"><div className="space-y-4">{chartRows.filter(r=>r.achievement!=null).map(r=>{const gap=(r.achievement||0)-(r.target??0);return <div key={r.school.id}><div className="flex justify-between text-xs"><b>{r.school.school_code}</b><span>{pct(r.achievement||0)}%</span></div><button type="button" onClick={()=>chooseSchool(r.school.id)} className="h-4 w-full bg-slate-100 rounded-full mt-1 text-right"><span className="block h-4 bg-sky-600 rounded-full hover:bg-sky-700" style={{width:Math.min(100,r.achievement||0)+'%'}}/></button><small className="text-slate-500">{r.target==null?'لا يوجد مستهدف':gap>=0?'فوق المستهدف':'دون المستهدف'}{r.target!=null?' — '+Math.abs(pct(gap))+' نقطة':''}</small></div>})}</div></ChartCard>
        <ChartCard title="7. كثافة المنسوبين والأنشطة" sub="الحجم التشغيلي لكل مدرسة"><div className="space-y-3">{chartRows.map(r=><button type="button" onClick={()=>chooseSchool(r.school.id)} className={"w-full text-right p-2 rounded-xl hover:bg-slate-50 "+(selectedSchool===r.school.id?"ring-1 ring-teal-600":"")} key={r.school.id}><div className="flex justify-between text-xs"><b>{r.school.school_code}</b><span>{r.activeStaff} منسوب نشط · {r.completedActivities} تقرير</span></div><div className="h-3 bg-slate-100 rounded-full mt-1 overflow-hidden"><span className="block h-full bg-emerald-600 rounded-full" style={{width:Math.min(100,r.totalStaff*4)+"%"}}/></div></button>)}</div></ChartCard>
      </div>
      <ChartCard title="8. مصفوفة العلاقات بين المدارس" sub="قراءة تنفيذية متعددة المؤشرات"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><th className="p-3 text-right">المدرسة</th><th className="p-3">العاملون</th><th className="p-3">الأنشطة</th><th className="p-3">التقييم</th><th className="p-3">التحصيل</th></tr></thead><tbody>{filtered.map(r=><tr className="border-t" key={r.school.id}><td className="p-3"><b>{r.school.school_name}</b><div className="text-xs text-slate-400">{r.school.school_code}</div></td><td className="p-3 text-center">{pct(r.staffingRate)}%</td><td className="p-3 text-center">{pct(r.activityRate)}%</td><td className="p-3 text-center">{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</td><td className="p-3 text-center">{r.achievement==null?'—':pct(r.achievement)+'%'}</td></tr>)}</tbody></table></div></ChartCard>
      {selectedSchool!=='all'&&<div className="grid lg:grid-cols-2 gap-6"><ChartCard title="تفاصيل المدرسة" sub={filtered[0]?.school.school_name||''}>{filtered.map(r=><div key={r.school.id} className="space-y-4"><Mini label="نسبة العاملين" v={r.staffingRate}/><Mini label="إنجاز الأنشطة" v={r.activityRate}/><Mini label="التقييم" v={r.avgRating*20}/><Mini label="التحصيل" v={r.achievement??0}/></div>)}</ChartCard><ChartCard title="تحديث التحصيل التعليمي" sub="حسب السنة الدراسية"><div className="grid sm:grid-cols-2 gap-4"><label className="text-sm font-bold">السنة<input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="border rounded-xl px-4 py-3 w-full mt-2"/></label><label className="text-sm font-bold">التحصيل %<input type="number" min="0" max="100" step=".1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full mt-2"/></label><label className="text-sm font-bold">المستهدف %<input type="number" min="0" max="100" step=".1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full mt-2"/></label><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={3} className="border rounded-xl px-4 py-3 w-full sm:col-span-2" placeholder="ملاحظات"/></div><button disabled={saving} onClick={saveAchievement} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold inline-flex items-center gap-2"><Save/>{saving?'جاري الحفظ…':'حفظ المؤشر'}</button></ChartCard></div>}
    </div>
  </main>;
}

function MetricMini({value}:{value:number}){const v=Math.max(0,Math.min(100,Number(value)||0));return <div className="min-w-[110px]"><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-700 rounded-full" style={{width:v+'%'}}/></div><div className="text-xs text-center mt-1">{pct(v)}%</div></div>}

function Mini({label,v}:{label:string;v:number}){const n=Math.max(0,Math.min(100,Number(v)||0));return <div className="mt-2"><div className="flex justify-between text-[11px] text-slate-500"><span>{label}</span><span>{pct(n)}%</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-700 rounded-full" style={{width:n+'%'}}/></div></div>}

function ChartCard({title,sub,children}:{title:string;sub?:string;children:ReactNode}){return <div className="card p-5 shadow-sm"><div className="flex justify-between items-center mb-5"><div><h2 className="font-black text-lg">{title}</h2>{sub&&<p className="text-xs text-slate-500 mt-1">{sub}</p>}</div><BarChart3 size={20}/></div>{children}</div>}

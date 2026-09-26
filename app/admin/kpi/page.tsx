'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const overall={
    staffing:rows.length?rows.reduce((s,r)=>s+r.staffingRate,0)/rows.length:0,
    activities:rows.length?rows.reduce((s,r)=>s+r.activityRate,0)/rows.length:0,
    rating:(()=>{const rated=reports.filter(r=>r.rating!=null);return rated.length?rated.reduce((s,r)=>s+(r.rating||0),0)/rated.length:0})(),
    achievement:(()=>{const vals=rows.filter(r=>r.achievement!=null).map(r=>r.achievement as number);return vals.length?vals.reduce((s,v)=>s+v,0)/vals.length:0})()
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

  const chartRows=filtered.slice(0,12);
  const scatterRows=filtered.filter(r=>r.totalStaff>0);
  return <main dir="rtl" className="min-h-screen bg-[#f5f7fb]">
    <div className="national-day-96-bar"><div className="national-day-96-content max-w-[1400px] mx-auto px-4 py-2 flex items-center justify-between"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><b>عزّنا بطبعنا</b><div className="text-[11px] text-white/80">اليوم الوطني السعودي 96</div></div></div><span className="hidden md:inline text-sm">لوحة مؤشرات الأداء — مدارس التعليم المستمر</span></div></div>
    <header className="bg-[var(--navy)] text-white shadow-lg"><div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-emerald-300 text-xs font-bold mb-1"><BarChart3 size={16}/> تحليل مؤشرات المدارس</div><h1 className="text-2xl sm:text-3xl font-black">لوحة الأداء المؤسسي</h1><p className="text-xs sm:text-sm text-blue-100 mt-1">علاقات ومقارنات بين المدارس في أربعة محاور رئيسية</p></div><div className="flex gap-2"><button onClick={()=>load()} className="bg-white/10 rounded-xl px-3 py-2 inline-flex items-center gap-2"><RefreshCw size={17}/> تحديث</button><button onClick={()=>location.href='/admin'} className="bg-white text-[var(--navy)] rounded-xl px-3 py-2 font-bold">لوحة الإدارة</button></div></div></header>
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
      {message&&<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3">{message}</div>}{error&&<div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3">{error}</div>}
      <div className="card p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><span className="text-xs font-bold text-slate-500">نطاق التحليل</span><h2 className="text-lg font-black mt-1">العلاقات بين المدارس</h2></div><select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="border rounded-xl px-4 py-3 min-w-[280px]"><option value="all">جميع المدارس</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[[Users,'العاملون داخل المدرسة',overall.staffing,'%'],[PartyPopper,'إنجاز الأنشطة',overall.activities,'%'],[Star,'تقييم الأنشطة',overall.rating,'/ 5'],[GraduationCap,'التحصيل التعليمي',overall.achievement,'%']].map(([Icon,title,value,unit]:any)=><div className="card p-5 shadow-sm" key={title as string}><div className="flex justify-between"><div><div className="text-sm font-bold text-slate-600">{title}</div><div className="text-3xl font-black mt-3">{pct(value as number)} <span className="text-base text-slate-400">{unit}</span></div></div><div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><Icon size={23}/></div></div></div>)}</div>
      <div className="grid xl:grid-cols-2 gap-6">
        <div className="card p-5 shadow-sm"><div className="flex justify-between mb-4"><div><h2 className="font-black text-lg">مقارنة مؤشرات المدارس</h2><p className="text-xs text-slate-500 mt-1">نسبة العاملين وإنجاز الأنشطة</p></div><BarChart3/></div><div className="space-y-4">{chartRows.map(r=><div key={r.school.id}><div className="flex justify-between text-xs mb-1"><b>{r.school.school_code} — {r.school.school_name}</b><span>{pct(r.staffingRate)}%</span></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-700 rounded-full" style={{width:Math.min(100,r.staffingRate)+'%'}}/></div><div className="flex justify-between text-[11px] text-slate-400 mt-1"><span>الأنشطة: {pct(r.activityRate)}%</span><span>التقييم: {r.avgRating?r.avgRating.toFixed(1):'—'} / 5</span></div></div>)}</div></div>
        <div className="card p-5 shadow-sm"><div className="flex justify-between mb-4"><div><h2 className="font-black text-lg">علاقة العاملين بالأنشطة</h2><p className="text-xs text-slate-500 mt-1">كل نقطة تمثل مدرسة</p></div><Target/></div><svg viewBox="0 0 620 320" className="w-full"><line x1="55" y1="270" x2="590" y2="270" stroke="#cbd5e1"/><line x1="55" y1="25" x2="55" y2="270" stroke="#cbd5e1"/><line x1="55" y1="147" x2="590" y2="147" stroke="#e2e8f0" strokeDasharray="5 5"/><line x1="322" y1="25" x2="322" y2="270" stroke="#e2e8f0" strokeDasharray="5 5"/><text x="322" y="310" textAnchor="middle" fontSize="11">نسبة العاملين %</text><text x="16" y="150" transform="rotate(-90 16 150)" textAnchor="middle" fontSize="11">إنجاز الأنشطة %</text>{scatterRows.map(r=>{const x=55+(r.staffingRate/100)*535;const y=270-(r.activityRate/100)*245;return <g key={r.school.id}><circle cx={x} cy={y} r="8" fill="#1d4ed8" opacity=".8"><title>{r.school.school_code} — العاملون {pct(r.staffingRate)}% — الأنشطة {pct(r.activityRate)}%</title></circle><text x={x+10} y={y+4} fontSize="9" fill="#475569">{r.school.school_code}</text></g>})}</svg></div>
      </div>
      <div className="card p-5 shadow-sm"><div className="flex justify-between items-center mb-5"><div><h2 className="font-black text-lg">مصفوفة أداء المدارس</h2><p className="text-xs text-slate-500 mt-1">عرض متكامل للمحاور الأربعة — بدون ترتيب نهائي للمدارس</p></div><Building2/></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50"><th className="p-3 text-right">المدرسة</th><th className="p-3">العاملون</th><th className="p-3">الأنشطة</th><th className="p-3">التقييم</th><th className="p-3">التحصيل</th></tr></thead><tbody>{filtered.map(r=><tr className="border-t" key={r.school.id}><td className="p-3"><b>{r.school.school_name}</b><div className="text-xs text-slate-400">{r.school.school_code}</div></td><td className="p-3"><MetricMini value={r.staffingRate}/></td><td className="p-3"><MetricMini value={r.activityRate}/></td><td className="p-3 text-center">{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</td><td className="p-3 text-center">{r.achievement==null?'غير مسجل':pct(r.achievement)+'%'}</td></tr>)}</tbody></table></div></div>
      {selectedSchool!=='all'&&<div className="grid lg:grid-cols-2 gap-6"><div className="card p-5 shadow-sm"><h2 className="font-black text-lg mb-5">تفاصيل المدرسة</h2>{filtered.map(r=><div key={r.school.id} className="space-y-5"><MetricRow title="منسوبو المدرسة العاملون" value={r.staffingRate}/><MetricRow title="إنجاز الأنشطة" value={r.activityRate}/><MetricRow title="تقييم الأنشطة" value={r.avgRating*20} display={r.avgRating?r.avgRating.toFixed(1)+' / 5':'—'}/><MetricRow title="التحصيل التعليمي" value={r.achievement||0} display={r.achievement==null?'غير مسجل':pct(r.achievement)+'%'}/></div>)}</div><div className="card p-5 shadow-sm"><h2 className="font-black text-lg mb-5 flex items-center gap-2"><GraduationCap/> تحديث التحصيل التعليمي</h2><div className="bg-slate-50 rounded-2xl p-4 mb-4"><b>{filtered[0]?.school.school_name}</b></div><div className="grid sm:grid-cols-2 gap-4"><label><span className="block text-sm font-bold mb-2">السنة الدراسية</span><input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="border rounded-xl px-4 py-3 w-full"/></label><label><span className="block text-sm font-bold mb-2">نسبة التحصيل %</span><input type="number" min="0" max="100" step="0.1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full"/></label><label><span className="block text-sm font-bold mb-2">المستهدف %</span><input type="number" min="0" max="100" step="0.1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full"/></label><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={3} className="border rounded-xl px-4 py-3 w-full sm:col-span-2" placeholder="ملاحظات"/></div><button disabled={saving} onClick={saveAchievement} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold inline-flex items-center gap-2"><Save/>{saving?'جاري الحفظ…':'حفظ مؤشر التحصيل'}</button></div></div>}
      <div className="grid sm:grid-cols-3 gap-4"><div className="card p-4"><b>المدارس المشمولة</b><div className="text-2xl font-black mt-2">{rows.length}</div></div><div className="card p-4"><b>إجمالي المنسوبين</b><div className="text-2xl font-black mt-2">{rows.reduce((s,r)=>s+r.totalStaff,0)}</div></div><div className="card p-4"><b>مدارس لديها تحصيل مسجل</b><div className="text-2xl font-black mt-2">{rows.filter(r=>r.achievement!=null).length}</div></div></div>
    </div>
  </main>;
}
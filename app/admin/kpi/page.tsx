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

  return <main dir="rtl" className="min-h-screen bg-slate-50">
    <div className="national-day-96-bar"><div className="national-day-96-content max-w-7xl mx-auto px-4 py-2 flex items-center justify-between"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><b>عزّنا بطبعنا</b><div className="text-[11px] text-white/80">اليوم الوطني السعودي 2026</div></div></div><span className="hidden sm:inline text-sm">🇸🇦 مؤشرات أداء مدارس التعليم المستمر</span></div></div>
    <header className="bg-[var(--navy)] text-white"><div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between gap-3"><div><h1 className="text-xl sm:text-2xl font-black">لوحة مؤشرات الأداء</h1><p className="text-xs sm:text-sm text-blue-100 mt-1">البوابة الإلكترونية لمدارس التعليم المستمر — الإدارة العامة للتعليم بنجران</p></div><div className="flex gap-2"><button onClick={()=>load()} className="bg-white/10 hover:bg-white/15 rounded-xl px-3 py-2 inline-flex items-center gap-2"><RefreshCw size={17}/> تحديث</button><button onClick={()=>location.href='/admin'} className="bg-white text-[var(--navy)] rounded-xl px-3 py-2 font-bold">العودة للإدارة</button></div></div></header>
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      {message&&<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3">{message}</div>}
      {error&&<div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3">{error}</div>}
      <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between"><div><b>المدرسة</b><p className="text-sm text-gray-500">اختر مدرسة لعرض تفاصيل مؤشرات الأداء وتحديث التحصيل التعليمي.</p></div><select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="border rounded-xl px-4 py-3 min-w-[260px]"><option value="all">جميع المدارس</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select></div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {icon:Users,title:'نسبة منسوبي المدرسة العاملين فيها',value:overall.staffing,unit:'%',desc:'متوسط نسبة العاملين النشطين من إجمالي منسوبي المدارس'},
          {icon:PartyPopper,title:'مؤشر الأنشطة لكل مدرسة',value:overall.activities,unit:'%',desc:'نسبة الأنشطة التي قدمت المدرسة تقاريرها'},
          {icon:Star,title:'متوسط تقييم الأنشطة',value:overall.rating,unit:'/ 5',desc:'متوسط تقييم مدير النظام للتقارير المقدمة'},
          {icon:GraduationCap,title:'متوسط التحصيل التعليمي',value:overall.achievement,unit:'%',desc:'متوسط أحدث نسبة تحصيل مسجلة للمدارس'}
        ].map(({icon:Icon,title,value,unit,desc})=><div className="card p-5 relative overflow-hidden" key={title}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-gray-700">{title}</div><div className="mt-4 text-3xl font-black">{pct(value)} <span className="text-base font-bold text-gray-500">{unit}</span></div></div><div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><Icon size={22}/></div></div><p className="text-xs text-gray-500 mt-3 leading-6">{desc}</p></div>)}
      </div>

      {selectedSchool!=='all'&&<div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5"><h2 className="text-lg font-black mb-5 flex items-center gap-2"><BarChart3 size={20}/> مؤشرات المدرسة</h2>{filtered.map(r=><div key={r.school.id} className="space-y-5">
          <div><div className="flex justify-between text-sm mb-2"><span>منسوبو المدرسة العاملون</span><b>{pct(r.staffingRate)}%</b></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barClass(r.staffingRate)}`} style={{width:`${Math.min(100,r.staffingRate)}%`}}/></div><div className="text-xs text-gray-500 mt-1">{r.activeStaff} عامل نشط من {r.totalStaff}</div></div>
          <div><div className="flex justify-between text-sm mb-2"><span>الأنشطة المنفذة</span><b>{r.completedActivities} / {r.activities}</b></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barClass(r.activityRate)}`} style={{width:`${Math.min(100,r.activityRate)}%`}}/></div><div className="text-xs text-gray-500 mt-1">نسبة استكمال تقارير الأنشطة {pct(r.activityRate)}%</div></div>
          <div><div className="flex justify-between text-sm mb-2"><span>تقييم الأنشطة</span><b>{r.avgRating? r.avgRating.toFixed(1):'—'} / 5</b></div><div className="flex gap-1">{[1,2,3,4,5].map(n=><Star key={n} size={25} className={r.avgRating>=n?'fill-amber-400 text-amber-400':'text-slate-200'}/>)}</div></div>
          <div><div className="flex justify-between text-sm mb-2"><span>التحصيل التعليمي {r.achievementYear&&`(${r.achievementYear})`}</span><b>{r.achievement==null?'غير مسجل':pct(r.achievement)+'%'}</b></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${barClass(r.achievement||0)}`} style={{width:`${Math.min(100,r.achievement||0)}%`}}/></div>{r.target!=null&&<div className="text-xs text-gray-500 mt-1">المستهدف: {pct(r.target)}%</div>}</div>
        </div>)}</div>
        <div className="card p-5"><h2 className="text-lg font-black mb-5 flex items-center gap-2"><GraduationCap size={20}/> تحديث مؤشر التحصيل التعليمي</h2><div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-gray-600"><b>{filtered[0]?.school.school_name}</b><div className="text-xs mt-1">يتم حفظ المؤشر حسب السنة الدراسية ويمكن تحديثه دون حذف البيانات السابقة.</div></div><div className="grid sm:grid-cols-2 gap-4"><label><span className="block text-sm font-bold mb-2">السنة الدراسية</span><input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="border rounded-xl px-4 py-3 w-full" placeholder="1447-1448"/></label><label><span className="block text-sm font-bold mb-2">نسبة التحصيل %</span><input type="number" min="0" max="100" step="0.1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 82.5"/></label><label><span className="block text-sm font-bold mb-2">المستهدف %</span><input type="number" min="0" max="100" step="0.1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 90"/></label><label className="sm:col-span-2"><span className="block text-sm font-bold mb-2">ملاحظات</span><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={3} className="border rounded-xl px-4 py-3 w-full" placeholder="مصدر المؤشر أو ملاحظات مدير النظام"/></label></div><button disabled={saving} onClick={saveAchievement} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold inline-flex items-center gap-2"><Save size={18}/>{saving?'جاري الحفظ…':'حفظ مؤشر التحصيل'}</button></div>
      </div>}

      <div className="card overflow-hidden"><div className="p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h2 className="text-lg font-black">مقارنة مؤشرات المدارس</h2><p className="text-sm text-gray-500 mt-1">عرض وصفي للمؤشرات الأربعة لكل مدرسة، دون احتساب ترتيب أو تقييم نهائي للمدارس.</p></div><div className="text-xs text-gray-500">الأنشطة النشطة حاليًا: {activeActivities.length}</div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">العاملون</th><th className="p-3 text-right">الأنشطة</th><th className="p-3 text-right">تقييم الأنشطة</th><th className="p-3 text-right">التحصيل التعليمي</th></tr></thead><tbody>{filtered.map(r=><tr className="border-t" key={r.school.id}><td className="p-3"><b>{r.school.school_name}</b><div className="text-xs text-gray-500">{r.school.school_code}</div></td><td className="p-3"><b>{pct(r.staffingRate)}%</b><div className="text-xs text-gray-500">{r.activeStaff}/{r.totalStaff}</div></td><td className="p-3"><b>{r.completedActivities}/{r.activities}</b><div className="text-xs text-gray-500">{pct(r.activityRate)}%</div></td><td className="p-3"><div className="flex items-center gap-2"><span>{r.avgRating?r.avgRating.toFixed(1):'—'}</span><Star size={16} className={r.avgRating?'fill-amber-400 text-amber-400':'text-slate-300'}/></div></td><td className="p-3">{r.achievement==null?<span className="text-gray-400">غير مسجل</span>:<><b>{pct(r.achievement)}%</b>{r.target!=null&&<span className="text-xs text-gray-500 mr-2">مستهدف {pct(r.target)}%</span>}</>}</td></tr>)}</tbody></table></div></div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-4"><div className="flex items-center gap-2 font-bold"><Building2 size={18}/> المدارس المشمولة</div><div className="text-2xl font-black mt-2">{rows.length}</div></div>
        <div className="card p-4"><div className="flex items-center gap-2 font-bold"><Users size={18}/> إجمالي المنسوبين</div><div className="text-2xl font-black mt-2">{rows.reduce((s,r)=>s+r.totalStaff,0)}</div></div>
        <div className="card p-4"><div className="flex items-center gap-2 font-bold"><Target size={18}/> مدارس لديها تحصيل مسجل</div><div className="text-2xl font-black mt-2">{rows.filter(r=>r.achievement!=null).length}</div></div>
      </div>
    </div>
  </main>;
}

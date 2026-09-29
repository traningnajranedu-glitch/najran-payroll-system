'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3, Building2, Users, PartyPopper, Star, GraduationCap, RefreshCw,
  Maximize2, Minimize2, Target, TrendingUp, Home, UserRound, CalendarDays,
  FileText, Settings, ClipboardList, Bell, Sparkles, CheckCircle2, Clock3,
  AlertCircle, ChevronLeft, Menu, X, Trophy, Award
} from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School={id:string;school_code:string;school_name:string;is_active:boolean};
type Teacher={id:string;school_id:string;is_active:boolean};
type Activity={id:string;name:string;is_active:boolean};
type Report={id:string;activity_id:string;school_id:string;rating:number|null;status:string};
type Achievement={id:string;school_id:string;academic_year:string;achievement_percent:number;target_percent:number|null;notes:string|null};
type CompetitionScore={school_id:string;school_name:string;login_score:number;payroll_score:number;achievements_score:number;activities_score:number;employee_updates_score:number;total_score:number};
type MadrasatiDaily={id:string;school_id:string;indicator_date:string;manager_login_percent:number;teachers_login_percent:number;teachers_tools_percent:number;students_login_percent:number;students_tools_percent:number;support_challenges_count:number;updated_at:string};
type Row={school:School;totalStaff:number;activeStaff:number;staffingRate:number;completedActivities:number;activityRate:number;avgRating:number;achievement:number|null;target:number|null;achievementYear:string|null};

const pct=(n:number)=>Number.isFinite(n)?Math.round(n*10)/10:0;
const clamp=(n:number)=>Math.max(0,Math.min(100,Number(n)||0));

function Progress({value,className='bg-[#159f7d]'}:{value:number;className?:string}) {
  return <div className="h-2.5 rounded-full bg-[#edf3f2] overflow-hidden"><div className={'h-full rounded-full '+className} style={{width:clamp(value)+'%'}}/></div>;
}
function Panel({title,sub,icon:Icon,children,className=''}:{title:string;sub?:string;icon?:any;children:ReactNode;className?:string}) {
  return <section className={'rounded-2xl border border-[#dce8e6] bg-white shadow-[0_4px_18px_rgba(15,74,66,.06)] overflow-hidden '+className}>
    <div className="px-5 py-4 border-b border-[#edf2f1] flex items-start justify-between gap-3">
      <div><h2 className="font-black text-[#123f3a] text-base lg:text-lg">{title}</h2>{sub&&<p className="text-xs text-[#718582] mt-1">{sub}</p>}</div>
      {Icon&&<div className="w-9 h-9 rounded-xl bg-[#e8f5f1] text-[#087f69] flex items-center justify-center"><Icon size={19}/></div>}
    </div>
    <div className="p-4 lg:p-5">{children}</div>
  </section>;
}
function StatCard({title,value,unit,icon:Icon,tone='green',sub}:{title:string;value:number|string;unit?:string;icon:any;tone?:string;sub?:string}) {
  const tones:any={green:'bg-[#e5f5f0] text-[#087f69]',blue:'bg-[#eaf1fb] text-[#2867b2]',amber:'bg-[#fff4dc] text-[#b57a0a]',violet:'bg-[#f0eafd] text-[#6950a6]'};
  return <div className="rounded-2xl border border-[#dce8e6] bg-white p-4 shadow-[0_3px_14px_rgba(15,74,66,.05)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#667b78]">{title}</p><div className="mt-2 text-3xl font-black text-[#153d3a]">{value}<span className="text-xs text-[#7a8b88] mr-1">{unit}</span></div>{sub&&<p className="text-[10px] text-[#8a9996] mt-1">{sub}</p>}</div><div className={'w-11 h-11 rounded-2xl flex items-center justify-center '+tones[tone]}><Icon size={23}/></div></div>
  </div>;
}
function Donut({active,review,blocked}:{active:number;review:number;blocked:number}) {
  const total=Math.max(1,active+review+blocked), p1=active/total*100, p2=review/total*100;
  const r=52,c=2*Math.PI*r;
  return <div className="relative w-40 h-40 mx-auto"><svg viewBox="0 0 140 140" className="w-full h-full -rotate-90"><circle cx="70" cy="70" r={r} fill="none" stroke="#eef4f2" strokeWidth="20"/><circle cx="70" cy="70" r={r} fill="none" stroke="#159f7d" strokeWidth="20" strokeDasharray={c} strokeDashoffset={c*(1-p1/100)} strokeLinecap="butt"/><circle cx="70" cy="70" r={r} fill="none" stroke="#f2a719" strokeWidth="20" strokeDasharray={c} strokeDashoffset={c*(1-p2/100)} strokeLinecap="butt" transform={'rotate('+(p1/100*360)+' 70 70)'}/><circle cx="70" cy="70" r={r} fill="none" stroke="#e94d4d" strokeWidth="20" strokeDasharray={c} strokeDashoffset={c*((active+review)/total)} strokeLinecap="butt" transform={'rotate('+((p1+p2)/100*360)+' 70 70)'}/></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><b className="text-2xl text-[#173e3a]">{total}</b><span className="text-xs font-bold text-[#61736f]">مدرسة</span></div></div>;
}

export default function KpiDashboard(){
  const sb=supabaseBrowser();
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [competition,setCompetition]=useState<CompetitionScore[]>([]),[madrasati,setMadrasati]=useState<MadrasatiDaily[]>([]),[issuingAwards,setIssuingAwards]=useState(false);
  const [schools,setSchools]=useState<School[]>([]),[teachers,setTeachers]=useState<Teacher[]>([]),[activities,setActivities]=useState<Activity[]>([]),[reports,setReports]=useState<Report[]>([]),[achievements,setAchievements]=useState<Achievement[]>([]);
  const [selectedSchool,setSelectedSchool]=useState('all'),[isFullscreen,setIsFullscreen]=useState(false),[mobileNav,setMobileNav]=useState(false),[saving,setSaving]=useState(false);
  const [academicYear,setAcademicYear]=useState('1447-1448'),[achievementPercent,setAchievementPercent]=useState(''),[targetPercent,setTargetPercent]=useState(''),[achievementNotes,setAchievementNotes]=useState('');
  const [currentDate,setCurrentDate]=useState(new Date());

  const gregorianDate=useMemo(()=>new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{
    timeZone:'Asia/Riyadh',weekday:'long',day:'numeric',month:'long',year:'numeric'
  }).format(currentDate),[currentDate]);
  const hijriDate=useMemo(()=>new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{
    timeZone:'Asia/Riyadh',day:'numeric',month:'long',year:'numeric'
  }).format(currentDate),[currentDate]);

  async function load(){
    setLoading(true);setError('');
    const {data:{user}}=await sb.auth.getUser();
    if(!user){location.href='/';return;}
    const {data:admin}=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(!admin){setError('غير مصرح بالدخول إلى مؤشرات الأداء.');setLoading(false);return;}
    const [s,t,a,r,e,m]=await Promise.all([
      sb.from('schools').select('id,school_code,school_name,is_active').order('school_name'),
      sb.from('teachers').select('id,school_id,is_active'),
      sb.from('school_activities').select('id,name,is_active'),
      sb.from('school_activity_reports').select('id,activity_id,school_id,rating,status'),
      sb.from('school_educational_achievement').select('*').order('academic_year',{ascending:false}),
      sb.from('school_madrasati_daily_indicators').select('*').eq('indicator_date',new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).order('updated_at',{ascending:false})
    ]);
    const first=s.error||t.error||a.error||r.error||e.error||m.error;
    if(first){setError(first.message);setLoading(false);return;}
    setSchools(s.data||[]);
    const monthStart=new Date().toISOString().slice(0,7)+'-01';
    const {data:competitionData}=await sb.rpc('school_competition_scores',{p_month:monthStart});
    setCompetition((competitionData||[]) as CompetitionScore[]);setMadrasati((m.data||[]) as MadrasatiDaily[]);setTeachers(t.data||[]);setActivities(a.data||[]);setReports(r.data||[]);setAchievements(e.data||[]);
    const latest=(e.data||[])[0];
    if(latest){setAcademicYear(latest.academic_year);setAchievementPercent(String(latest.achievement_percent));setTargetPercent(latest.target_percent==null?'':String(latest.target_percent));setAchievementNotes(latest.notes||'');}
    setLoading(false);
  }
  useEffect(()=>{load()},[]);
  useEffect(()=>{const id=setInterval(()=>setCurrentDate(new Date()),60000);return()=>clearInterval(id)},[]);
  useEffect(()=>{const id=setInterval(load,60000);return()=>clearInterval(id)},[]);
  useEffect(()=>{const h=()=>setIsFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h)},[]);

  const activeSchools=useMemo(()=>schools.filter(s=>s.is_active),[schools]);
  const activeActivities=useMemo(()=>activities.filter(a=>a.is_active),[activities]);
  const rows=useMemo<Row[]>(()=>activeSchools.map(s=>{
    const staff=teachers.filter(t=>t.school_id===s.id), reps=reports.filter(r=>r.school_id===s.id&&activeActivities.some(a=>a.id===r.activity_id)), rated=reps.filter(r=>r.rating!=null);
    const ach=achievements.filter(a=>a.school_id===s.id).sort((x,y)=>y.academic_year.localeCompare(x.academic_year))[0];
    const completed=reps.filter(r=>r.status==='مراجع'||r.status==='مقدم').length;
    return {school:s,totalStaff:staff.length,activeStaff:staff.filter(t=>t.is_active).length,staffingRate:staff.length?staff.filter(t=>t.is_active).length/staff.length*100:0,completedActivities:completed,activityRate:activeActivities.length?completed/activeActivities.length*100:0,avgRating:rated.length?rated.reduce((sum,r)=>sum+(r.rating||0),0)/rated.length:0,achievement:ach?Number(ach.achievement_percent):null,target:ach?.target_percent==null?null:Number(ach.target_percent),achievementYear:ach?.academic_year||null};
  }),[activeSchools,teachers,reports,activeActivities,achievements]);

  const filtered=selectedSchool==='all'?rows:rows.filter(r=>r.school.id===selectedSchool);
  const selected=selectedSchool==='all'?null:rows.find(r=>r.school.id===selectedSchool)||null;
  const overall=useMemo(()=>{
    const staff=filtered.reduce((n,r)=>n+r.activeStaff,0),total=filtered.reduce((n,r)=>n+r.totalStaff,0),rated=reports.filter(r=>filtered.some(x=>x.school.id===r.school_id)&&r.rating!=null),vals=filtered.filter(r=>r.achievement!=null).map(r=>r.achievement as number);
    return {staffing:total?staff/total*100:0,activities:filtered.length?filtered.reduce((n,r)=>n+r.activityRate,0)/filtered.length:0,rating:rated.length?rated.reduce((n,r)=>n+(r.rating||0),0)/rated.length:0,achievement:vals.length?vals.reduce((n,v)=>n+v,0)/vals.length:0,staff,total};
  },[filtered,reports]);
  const ranking=[...filtered].sort((a,b)=>b.activityRate-a.activityRate);
  const activityReports=filtered.reduce((n,r)=>n+r.completedActivities,0);
  const recentReports=reports.filter(r=>filtered.some(x=>x.school.id===r.school_id)).slice(0,5);
  const recentActivities=activeActivities.slice(0,3);
  const schoolStatus={active:activeSchools.length,review:Math.max(0,Math.round(activeSchools.length*.1)),blocked:Math.max(0,activeSchools.length-Math.max(0,Math.round(activeSchools.length*.9))-Math.max(0,Math.round(activeSchools.length*.1)))};

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
  async function issueMonthlyAwards(){
    setIssuingAwards(true);setError('');setMessage('');
    const d=new Date(); d.setUTCMonth(d.getUTCMonth()-1,1);
    const month=d.toISOString().slice(0,10);
    const {data,error}=await sb.rpc('issue_school_monthly_awards',{p_month:month});
    if(error)setError('تعذر إصدار شهادات التميز: '+error.message);else setMessage('تم إصدار شهادات التميز لأول '+String(data||3)+' مدارس عن الشهر السابق، وستظهر تلقائيًا في حساباتها.');
    setIssuingAwards(false);
  }
  async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}}

  if(loading)return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-[#f5f9f8] text-[#16443e]"><div className="text-xl font-black">جارٍ تجهيز لوحة المؤشرات…</div></main>;

  const nav=[
    [Home,'الرئيسية','/admin'],[Building2,'المدارس','/admin'],[Users,'الموظفون','/admin'],[CalendarDays,'فترات المسيرات','/admin'],[ClipboardList,'إدارة المسيرات','/admin'],[Star,'الأنشطة والاحتفاليات','/admin'],[FileText,'التقارير','/admin/daily-report'],[Settings,'الإعدادات','/admin']
  ];

  return <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top_right,#e7f6f1_0,#f5f9f8_34%,#f8fbfa_100%)] text-[#183b38] overflow-x-hidden">
    <div className="flex min-h-screen">
      <aside className={(mobileNav?'translate-x-0':'translate-x-full')+' fixed z-40 inset-y-0 right-0 w-[285px] bg-gradient-to-b from-[#005d52] via-[#006d60] to-[#003e38] text-white shadow-2xl transition-transform lg:translate-x-0 lg:static lg:w-[250px] shrink-0'}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between"><div className="font-black text-xl">البوابة الإلكترونية</div><button className="lg:hidden" onClick={()=>setMobileNav(false)}><X/></button></div>
          <div className="text-xs text-white/75 mt-1">مدارس التعليم المستمر</div>
        </div>
        <nav className="p-3 space-y-1">
          {nav.map(([Icon,label,href]:any,i)=><a key={label} href={href} className={'flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition '+(i===0?'bg-white/15':'hover:bg-white/10')}><Icon size={20}/><span>{label}</span>{i===0&&<span className="mr-auto w-2 h-2 rounded-full bg-[#48d6ad]"/>}</a>)}
        </nav>
        <div className="absolute bottom-5 inset-x-4 rounded-2xl bg-white/10 p-4">
          <div className="text-xs text-white/70">الهوية الوطنية</div><div className="font-black mt-1">اليوم الوطني السعودي 96</div><div className="mt-3 h-1.5 rounded-full bg-white/15"><div className="h-full w-2/3 bg-[#d8b04a] rounded-full"/></div>
        </div>
      </aside>
      {mobileNav&&<button className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={()=>setMobileNav(false)} aria-label="إغلاق القائمة"/>}

      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-[#dce8e6] shadow-sm">
          <div className="h-[92px] px-4 lg:px-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button className="lg:hidden p-2 rounded-xl bg-[#edf5f3]" onClick={()=>setMobileNav(true)}><Menu size={21}/></button>
              <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-full border border-[#b9dcd4] bg-[#f2faf7] text-[#087f69]"><Building2 size={25}/></div>
              <div className="min-w-0"><h1 className="font-black text-lg lg:text-2xl text-[#064d44] truncate">البوابة الالكترونية لمدارس التعليم المستمر</h1><p className="text-xs lg:text-sm text-[#6e817e] truncate">الإدارة العامة للتعليم بنجران — قسم التعليم المستمر</p></div>
            </div>
            <div className="hidden md:flex items-center gap-5 text-xs text-[#60716e]">
              <div className="text-right"><div className="font-bold">{gregorianDate} م</div><div>{hijriDate} هـ</div></div>
              <div className="w-px h-10 bg-[#dce8e6]"/>
              <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-[#e7f4f0] text-[#087f69] flex items-center justify-center"><UserRound size={19}/></div><span>مرحباً بك في البوابة</span></div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2.5 rounded-xl border border-[#dce8e6] bg-white text-[#087f69]" title="تحديث"><RefreshCw size={19}/></button>
              <button onClick={toggleFullscreen} className="p-2.5 rounded-xl border border-[#dce8e6] bg-white text-[#087f69]" title="ملء الشاشة">{isFullscreen?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</button>
            </div>
          </div>
          <div className="h-[38px] bg-gradient-to-l from-[#f0faf7] via-white to-[#fffdf4] border-t border-[#eef3f1] px-4 lg:px-7 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-black text-[#0d7c68]"><Sparkles size={15}/> عزّنا بطبعنا — اليوم الوطني السعودي 96</div>
            <div className="text-[#78908b] hidden sm:block">آخر تحديث تلقائي كل 60 ثانية</div>
          </div>
        </header>

        <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6">
            <div className="flex items-start gap-4"><div className="hidden sm:flex w-14 h-14 rounded-2xl bg-white border border-[#d6e8e3] shadow-sm items-center justify-center text-[#087f69]"><BarChart3 size={28}/></div><div><div className="text-xs text-[#78908b] font-black mb-1">مركز المتابعة والتحليل</div><h2 className="text-2xl lg:text-3xl font-black text-[#073f38] tracking-tight">لوحة مؤشرات الأداء</h2><p className="text-sm text-[#6e817e] mt-1">متابعة تشغيلية موحدة لمدارس التعليم المستمر في نجران</p></div></div>
            <div className="flex flex-wrap gap-2">
              <select value={selectedSchool} onChange={e=>chooseSchool(e.target.value)} className="rounded-xl border border-[#d4e3e0] bg-white text-[#173e3a] px-4 py-2.5 min-w-[220px] font-bold text-sm shadow-sm"><option value="all">جميع المدارس</option>{activeSchools.map(s=><option key={s.id} value={s.id}>{s.school_code} — {s.school_name}</option>)}</select>
            </div>
          </div>

          {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 p-3 text-sm font-bold">{error}</div>}
          {message&&<div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 p-3 text-sm font-bold">{message}</div>}

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5 mb-6">
            <StatCard title="المدارس النشطة" value={activeSchools.length} unit="مدرسة" icon={Building2} tone="green" sub="مدارس مفعلة ضمن المتابعة"/>
            <StatCard title="المنسوبون النشطون" value={overall.staff} unit="منسوب" icon={Users} tone="blue" sub="إجمالي المنسوبين النشطين"/>
            <StatCard title="التقارير المنجزة" value={activityReports} unit="تقرير" icon={FileText} tone="violet" sub="تقارير أنشطة مكتملة المراجعة"/>
            <StatCard title="الأنشطة النشطة" value={activeActivities.length} unit="نشاط" icon={PartyPopper} tone="amber" sub="أنشطة متاحة حاليًا للمدارس"/>
          </section>

          <section className="grid xl:grid-cols-12 gap-5 mb-6">
            <Panel title="حالة المدارس" sub="توزيع المدارس حسب حالة المتابعة" icon={Building2} className="xl:col-span-5">
              <div className="flex flex-col sm:flex-row items-center gap-7">
                <Donut active={schoolStatus.active} review={schoolStatus.review} blocked={schoolStatus.blocked}/>
                <div className="flex-1 w-full space-y-4">
                  {[['مدارس نشطة',schoolStatus.active,'#159f7d'],['مدارس قيد المراجعة',schoolStatus.review,'#f2a719'],['مدارس موقوفة',schoolStatus.blocked,'#e94d4d']].map(([l,v,c]:any)=><div key={l} className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-sm font-bold text-[#34524e]"><span className="w-3 h-3 rounded-full" style={{background:c}}/>{l}</div><b className="text-lg text-[#173e3a]">{v}</b></div>)}
                </div>
              </div>
            </Panel>
            <Panel title="مؤشر المتابعة حسب المدرسة" sub="مقارنة بصرية سريعة لمؤشرات التشغيل والأنشطة" icon={TrendingUp} className="xl:col-span-7">
              <div className="overflow-x-auto"><div className="min-w-[650px] h-[260px] flex items-end gap-5 px-4 pt-3">
                {ranking.slice(0,7).map((r,i)=><div key={r.school.id} className="flex-1 h-full flex flex-col justify-end items-center gap-1 cursor-pointer" onClick={()=>chooseSchool(r.school.id)}>
                  <div className="w-full flex items-end justify-center gap-1 h-[190px]">
                    <div className="w-5 rounded-t bg-[#159f7d]" style={{height:Math.max(20,r.staffingRate*1.25)}} title="مكتملة"/>
                    <div className="w-5 rounded-t bg-[#3677c8]" style={{height:Math.max(10,r.activityRate*.8)}} title="قيد التنفيذ"/>
                    <div className="w-5 rounded-t bg-[#f2a719]" style={{height:Math.max(7,(100-r.activityRate)*.45)}} title="مفتوحة"/>
                  </div>
                  <span className="text-[10px] text-[#4d6662] text-center leading-4">{r.school.school_name}</span>
                </div>)}
              </div></div>
              <div className="flex items-center justify-center gap-5 text-xs text-[#657a76] mt-2"><span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#159f7d] ml-1"/>مكتملة</span><span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#3677c8] ml-1"/>قيد التنفيذ</span><span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#f2a719] ml-1"/>مفتوحة</span></div>
            </Panel>
          </section>

          <section className="grid xl:grid-cols-12 gap-4 mb-5">
            <Panel title="آخر مسيرات المدارس" sub="آخر الفترات المسجلة في النظام" icon={CalendarDays} className="xl:col-span-7">
              <div className="overflow-x-auto"><table className="w-full text-xs min-w-[650px]"><thead><tr className="bg-[#f3f7f6] text-[#58706b]"><th className="p-3 text-right rounded-r-lg">المدرسة</th><th>الفترة</th><th>تاريخ البداية</th><th>تاريخ النهاية</th><th>الحالة</th></tr></thead><tbody>{ranking.slice(0,5).map((r,i)=><tr key={r.school.id} className="border-b border-[#edf2f1] hover:bg-[#f8fbfa]"><td className="p-3 font-bold">{r.school.school_name}</td><td className="text-center">{['الأولى','الثانية','الثالثة','الرابعة','الخامسة'][i]}</td><td className="text-center">1447/0{3+i}/01</td><td className="text-center">1447/0{3+i}/15</td><td className="text-center"><span className={'inline-flex px-3 py-1 rounded-full font-bold '+(i%3===0?'bg-[#fff1d1] text-[#9c6d10]':i%3===1?'bg-[#e8f0ff] text-[#376bb0]':'bg-[#ddf5ec] text-[#167a60]')}>{i%3===0?'مفتوحة':i%3===1?'قيد التنفيذ':'مكتملة'}</span></td></tr>)}</tbody></table></div>
            </Panel>
            <Panel title="التنبيهات" sub="أحدث التنبيهات التي تحتاج متابعة" icon={Bell} className="xl:col-span-5">
              <div className="space-y-1">{[
                ['تم اعتماد تقرير نشاط اليوم الوطني 96 من قبل الإدارة.','تمت المتابعة','green',CheckCircle2],
                ['يوجد فترة مسير جديدة قيد المراجعة (فترة أكتوبر 2025).','تحتاج متابعة','amber',Clock3],
                ['تم إضافة موظفين جدد لمدرسة ابتدائية سهل بن سعد.','معلومة','blue',Users],
                ['تنبيه: إغلاق فترة المسير الحالية قبل موعدها بـ 3 أيام.','تنبيه','red',AlertCircle]
              ].map(([txt,time,tone,Icon]:any)=><div key={txt} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#f7faf9]"><div className={'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 '+(tone==='green'?'bg-[#e1f5ed] text-[#0c8a6b]':tone==='amber'?'bg-[#fff2d5] text-[#b17a0a]':tone==='blue'?'bg-[#e6effb] text-[#316fb6]':'bg-[#fde8e8] text-[#d43d3d]')}><Icon size={17}/></div><div className="flex-1"><p className="text-xs font-bold text-[#294945] leading-5">{txt}</p><span className="text-[10px] text-[#8a9a97]">{time}</span></div></div>)}</div>
            </Panel>
          </section>

          <section className="grid xl:grid-cols-12 gap-4 mb-5">
            <Panel title="آخر الأنشطة والاحتفاليات" sub="أحدث الأنشطة المفعلة في المدارس" icon={Star} className="xl:col-span-4">
              <div className="space-y-2">{recentActivities.map((a,i)=><div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#edf2f1]"><div className={'w-10 h-10 rounded-xl flex items-center justify-center '+(i===0?'bg-[#e3f4ee] text-[#087f69]':i===1?'bg-[#e8f0fb] text-[#326fb5]':'bg-[#fff1d5] text-[#ad7607]')}><PartyPopper size={19}/></div><div className="min-w-0"><b className="text-sm block truncate">{a.name}</b><span className="text-[10px] text-[#81918e]">فعالية مدرسية · نشطة</span></div></div>)}{!recentActivities.length&&<div className="text-center text-sm text-[#899995] p-6">لا توجد أنشطة نشطة حاليًا.</div>}</div>
              <button className="mt-3 text-xs font-black text-[#087f69] flex items-center gap-1">عرض الكل <ChevronLeft size={14}/></button>
            </Panel>
            <Panel title="مؤشرات الأداء" sub="ملخص مؤشرات الأداء الرئيسية" icon={TrendingUp} className="xl:col-span-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['نسبة الموظفين العاملين',overall.staffing,'green'],['إنجاز الأنشطة',overall.activities,'blue'],['متوسط تقييم الأنشطة',overall.rating*20,'amber'],['متوسط التحصيل التعليمي',overall.achievement,'violet']
                ].map(([l,v,t]:any)=><div key={l} className="rounded-xl bg-[#f7faf9] p-3 border border-[#edf2f1]"><div className="flex justify-between text-xs font-bold mb-2"><span>{l}</span><b>{pct(v)}%</b></div><Progress value={v} className={t==='green'?'bg-[#159f7d]':t==='blue'?'bg-[#3677c8]':t==='amber'?'bg-[#f2a719]':'bg-[#7b61b5]'}/></div>)}
              </div>
            </Panel>
            <Panel title="ملخص سريع" sub="بيانات التشغيل الحالية" icon={Sparkles} className="xl:col-span-3">
              <div className="space-y-3 text-xs">{[['إجمالي التقارير المنجزة',activityReports],['الأنشطة النشطة',activeActivities.length],['المدارس المعروضة',filtered.length],['الموظفون',overall.total]].map(([l,v]:any)=><div key={l} className="flex justify-between items-center border-b border-[#edf2f1] pb-2"><span className="text-[#6d807c]">{l}</span><b className="text-[#16443e]">{v}</b></div>)}</div>
            </Panel>
          </section>

          <Panel title="التنافس اليومي — مؤشر منصة مدرستي" sub="مقارنة بصرية مرتبة من الأعلى إلى الأقل حسب متوسط الدخول والتفعيل" icon={BarChart3} className="mb-5">
            {madrasati.length>0&&<div className="space-y-3">
              {madrasati.map(x=>({...x,school:schools.find(s=>s.id===x.school_id),avg:(x.manager_login_percent+x.teachers_login_percent+x.teachers_tools_percent+x.students_login_percent+x.students_tools_percent)/5})).sort((a,b)=>b.avg-a.avg||a.support_challenges_count-b.support_challenges_count).map((x,i)=>{
                const tone=x.avg>=90?'from-emerald-700 to-emerald-500':x.avg>=80?'from-green-600 to-green-400':x.avg>=70?'from-blue-600 to-sky-400':x.avg>=60?'from-amber-500 to-yellow-400':'from-orange-600 to-red-500';
                const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
                return <div key={x.id} className={`rounded-2xl border p-3 sm:p-4 ${i<3?'border-amber-200 bg-amber-50/40':'border-slate-200 bg-white'}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2"><span className="w-7 text-center font-black text-slate-500">{medal||`#${i+1}`}</span><span className="truncate font-bold text-slate-800">{x.school?.school_name||'—'}</span></div>
                    <div className="shrink-0 rounded-xl bg-slate-900 px-3 py-1 text-sm font-black text-white">{pct(x.avg)}%</div>
                  </div>
                  <div className="h-5 overflow-hidden rounded-full bg-slate-100 shadow-inner" dir="ltr"><div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-700`} style={{width:`${Math.max(0,Math.min(100,x.avg))}%`}} /></div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500"><span>0%</span><span>التحديات/الدعم: <b className="text-slate-700">{x.support_challenges_count}</b></span><span>100%</span></div>
                </div>
              })}
              <div className="flex flex-wrap gap-3 pt-2 text-[11px] font-bold text-slate-600"><span>● 90–100% متفوق</span><span>● 80–89% مرتفع</span><span>● 70–79% جيد</span><span>● 60–69% متوسط</span><span>● أقل من 60% يحتاج متابعة</span></div>
            </div>}
            {!madrasati.length&&<div className="text-center text-sm text-[#718582] py-5">لم تُدخل المدارس مؤشرات منصة مدرستي لليوم حتى الآن.</div>}
          </Panel>

          <Panel title="مؤشر منصة مدرستي — اليوم" sub="المقارنة اليومية بين المدارس حسب آخر إدخال؛ الترتيب يعتمد متوسط نسب الدخول والتفعيل الخمس" icon={BarChart3} className="mb-5">
            <div className="overflow-x-auto rounded-2xl border border-[#e4eeeb]"><table className="w-full text-xs min-w-[1050px]"><thead className="bg-[#eef6f3] text-[#48655f]"><tr><th className="p-3 text-right">الترتيب</th><th className="text-right">المدرسة</th><th>دخول المدير</th><th>دخول المعلمين</th><th>تفعيل المعلمين</th><th>دخول الطلاب</th><th>تفعيل الطلاب</th><th>التحديات/الدعم</th><th>المتوسط</th></tr></thead><tbody>{madrasati.map(x=>({...x,school:schools.find(s=>s.id===x.school_id),avg:(x.manager_login_percent+x.teachers_login_percent+x.teachers_tools_percent+x.students_login_percent+x.students_tools_percent)/5})).sort((a,b)=>b.avg-a.avg||a.support_challenges_count-b.support_challenges_count).map((x,i)=><tr key={x.id} className="border-b border-[#edf2f1]"><td className="p-3 font-black">{i+1}</td><td className="font-bold">{x.school?.school_name||'—'}</td><td className="text-center">{x.manager_login_percent}%</td><td className="text-center">{x.teachers_login_percent}%</td><td className="text-center">{x.teachers_tools_percent}%</td><td className="text-center">{x.students_login_percent}%</td><td className="text-center">{x.students_tools_percent}%</td><td className="text-center">{x.support_challenges_count}</td><td className="text-center font-black text-[#087f69]">{pct(x.avg)}%</td></tr>)}</tbody></table></div>
            {!madrasati.length&&<div className="text-center text-sm text-[#718582] py-5">لم تُدخل المدارس مؤشرات منصة مدرستي لليوم حتى الآن.</div>}
          </Panel>

          <Panel title="التنافس الشهري بين المدارس" sub="ترتيب المدارس حسب نسبة الإنجاز من 100 نقطة" icon={Trophy} className="mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4"><div className="text-xs text-[#6d807c]">الأوزان: تسجيل الدخول 15% · سرعة اعتماد المسير 30% · المنجزات 20% · الأنشطة 20% · تحديث بيانات الموظفين 15%</div><button disabled={issuingAwards} onClick={issueMonthlyAwards} className="rounded-xl bg-[#b47b16] text-white px-4 py-2 font-black text-sm disabled:opacity-50 inline-flex items-center gap-2 justify-center"><Award size={17}/>{issuingAwards?'جارٍ الإصدار…':'إصدار شهادات الشهر السابق'}</button></div>
            <div className="overflow-x-auto rounded-2xl border border-[#e4eeeb]"><table className="w-full text-xs min-w-[900px]"><thead className="bg-[#fff8e7] text-[#6f571d]"><tr><th className="p-3 text-right">الترتيب</th><th className="text-right">المدرسة</th><th>الدخول /15</th><th>المسير /30</th><th>المنجزات /20</th><th>الأنشطة /20</th><th>الموظفون /15</th><th>الإنجاز</th></tr></thead><tbody>{competition.map((x,i)=><tr key={x.school_id} className="border-b border-[#edf2f1]"><td className="p-3 font-black">{i<3?['🥇','🥈','🥉'][i]:i+1}</td><td className="font-bold">{x.school_name}</td><td className="text-center">{pct(Number(x.login_score))}</td><td className="text-center">{pct(Number(x.payroll_score))}</td><td className="text-center">{pct(Number(x.achievements_score))}</td><td className="text-center">{pct(Number(x.activities_score))}</td><td className="text-center">{pct(Number(x.employee_updates_score))}</td><td className="text-center"><b className="text-[#087f69]">{pct(Number(x.total_score))}%</b></td></tr>)}</tbody></table></div>
          </Panel>

          <Panel title="مصفوفة مؤشرات المدارس" sub="اضغط على أي مدرسة لفتح تفاصيلها وتحديث التحصيل التعليمي" icon={BarChart3}>
            <div className="overflow-x-auto rounded-2xl border border-[#e4eeeb]"><table className="w-full text-sm min-w-[820px]"><thead className="bg-[#eef6f3] text-[#48655f] sticky top-0"><tr><th className="p-3 text-right">المدرسة</th><th>المنسوبون</th><th>الأنشطة</th><th>التقييم</th><th>التحصيل</th><th>المستهدف</th></tr></thead><tbody>{filtered.map(r=><tr key={r.school.id} onClick={()=>chooseSchool(r.school.id)} className={'border-b border-[#edf2f1] cursor-pointer hover:bg-[#f7faf9] '+(selectedSchool===r.school.id?'bg-[#edf8f5]':'')}><td className="p-3"><b>{r.school.school_code} — {r.school.school_name}</b><div className="text-[10px] text-[#8a9996] mt-1">{r.activeStaff} نشط / {r.totalStaff}</div></td><td className="text-center">{pct(r.staffingRate)}%</td><td className="text-center">{pct(r.activityRate)}%</td><td className="text-center">{r.avgRating?r.avgRating.toFixed(1):'—'} / 5</td><td className="text-center">{r.achievement==null?'—':pct(r.achievement)+'%'}</td><td className="text-center">{r.target==null?'—':pct(r.target)+'%'}</td></tr>)}</tbody></table></div>
          </Panel>

          {selected&&<section className="grid lg:grid-cols-2 gap-4 mt-5">
            <Panel title="تفاصيل المدرسة" sub={selected.school.school_name} icon={Building2}><div className="grid grid-cols-2 gap-3">{[['العاملون',selected.staffingRate,'bg-[#159f7d]'],['الأنشطة',selected.activityRate,'bg-[#3677c8]'],['التقييم',selected.avgRating*20,'bg-[#f2a719]'],['التحصيل',selected.achievement||0,'bg-[#7b61b5]']].map(([l,v,t]:any)=><div key={l} className="rounded-xl border border-[#edf2f1] p-3"><div className="flex justify-between text-xs mb-2"><span className="text-[#6c7e7b]">{l}</span><b>{l==='التقييم'?pct(v/20)+' / 5':pct(v)+'%'}</b></div><Progress value={v} className={t}/></div>)}</div></Panel>
            <Panel title="تحديث التحصيل التعليمي" sub={selected.achievementYear?'آخر سنة مسجلة: '+selected.achievementYear:'لا توجد سنة مسجلة'} icon={Target}><div className="grid sm:grid-cols-3 gap-2"><input value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="rounded-xl border border-[#d6e4e1] bg-white text-[#183b38] px-3 py-2.5" placeholder="السنة الدراسية"/><input type="number" min="0" max="100" step=".1" value={achievementPercent} onChange={e=>setAchievementPercent(e.target.value)} className="rounded-xl border border-[#d6e4e1] bg-white text-[#183b38] px-3 py-2.5" placeholder="التحصيل %"/><input type="number" min="0" max="100" step=".1" value={targetPercent} onChange={e=>setTargetPercent(e.target.value)} className="rounded-xl border border-[#d6e4e1] bg-white text-[#183b38] px-3 py-2.5" placeholder="المستهدف %"/></div><textarea value={achievementNotes} onChange={e=>setAchievementNotes(e.target.value)} rows={2} className="rounded-xl border border-[#d6e4e1] bg-white text-[#183b38] px-3 py-2.5 w-full mt-2" placeholder="ملاحظات المؤشر"/><button disabled={saving} onClick={saveAchievement} className="mt-2 rounded-xl bg-[#087f69] text-white px-5 py-2.5 font-black disabled:opacity-50">{saving?'جارٍ الحفظ…':'حفظ مؤشر التحصيل'}</button></Panel>
          </section>}

          <footer className="text-center text-xs text-[#8b9b98] py-7 border-t border-[#e4eeeb] mt-6">البوابة الإلكترونية لمدارس التعليم المستمر · الإدارة العامة للتعليم بنجران · تحديث تلقائي كل 60 ثانية</footer>
        </div>
      </div>
    </div>
  </main>;
}

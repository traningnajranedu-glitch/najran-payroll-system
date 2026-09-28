'use client';

import { useEffect, useMemo, useState } from 'react';
import { LogOut, Users, FileText, CalendarDays, CheckCircle2, Lock, RefreshCw, Printer, Upload, ShieldCheck, PartyPopper, Paperclip, Star, BarChart3, Trophy, Award } from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase';

type Teacher = { id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null; auto_open_close?: boolean; is_open: boolean; allow_edit: boolean };
type PayrollRow = { id?: string; teacher_id: string; direct_start_date: string | null; pre_start_hours: number; absence_days: number; notes: string | null; status: string; approved_at?: string | null };
type School = { id: string; school_code: string; school_name: string; manager_name: string | null; stamp_path: string | null; manager_signature_path: string | null; allow_school_teacher_edit?: boolean };
type Activity = { id: string; name: string; description: string | null; is_active: boolean };
type ActivityReport = { id?: string; activity_id: string; school_id: string; report_text: string; statistics: string; attachment_path: string | null; status: string; rating: number | null };
type MonthlyAward = { id:string; month_key:string; rank:number; total_score:number; issued_at:string };

function hijriKey(value: string): number | null {
  const m = value.trim().match(/^(\d{4})[\/]([01]\d)[\/]([0-3]\d)$/);
  if (!m) return null;
  return Number(m[1] + m[2] + m[3]);
}

function currentHijriKey(): number | null {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Riyadh'
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return hijriKey(`${get('year')}/${get('month')}/${get('day')}`);
}

function periodIsOpen(p: Period): boolean {
  if (p.auto_open_close && p.start_hijri && p.end_hijri) {
    const today = currentHijriKey();
    const start = hijriKey(p.start_hijri);
    const end = hijriKey(p.end_hijri);
    return today !== null && start !== null && end !== null && today >= start && today <= end;
  }
  return !!p.is_open;
}

function gregorianToHijri(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')}`;
}

function hijriToGregorian(value: string): string | null {
  const normalized=value.trim().replace(/[-.]/g,'/');
  const m=normalized.match(/^(\d{4})[\/]([01]?\d)[\/]([0-3]?\d)$/);
  if(!m)return null;
  const hy=Number(m[1]),hm=Number(m[2]),hd=Number(m[3]);
  if(hy<1300||hy>1600||hm<1||hm>12||hd<1||hd>30)return null;
  const target=hy+'/'+String(hm).padStart(2,'0')+'/'+String(hd).padStart(2,'0');

  // البحث عن التاريخ الميلادي المطابق داخل نطاق أم القرى بدل الاعتماد على تقريب السنة.
  const approxYear=hy+579;
  let lo=Date.UTC(approxYear-2,0,1), hi=Date.UTC(approxYear+2,11,31);
  while(lo<=hi){
    const mid=lo+Math.floor((hi-lo)/2/86400000)*86400000;
    const g=new Date(mid).toISOString().slice(0,10);
    const h=gregorianToHijri(g);
    if(h===target)return g;
    if(h<target)lo=mid+86400000;
    else hi=mid-86400000;
  }
  return null;
}
function formatHijriInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

function payrollWorkDays(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let count = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 5 && day !== 6) count++;
  }
  return count;
}

const hijriMonths=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const weekDays=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
function hijriPartsFromGregorian(value:string){
  const [y,m,d]=value.split('-').map(Number); if(!y||!m||!d)return null;
  const parts=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'Asia/Riyadh'}).formatToParts(new Date(Date.UTC(y,m-1,d,12)));
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0); return {year:get('year'),month:get('month'),day:get('day')};
}
function hijriMonthDays(year:number,month:number){
  const now=new Date();
  const base=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),12));
  const result:{hijri:string;day:number;weekday:number}[]=[];
  for(let offset=-500;offset<=500;offset++){
    const d=new Date(base); d.setUTCDate(base.getUTCDate()+offset);
    const g=d.toISOString().slice(0,10);
    const h=hijriPartsFromGregorian(g);
    if(h&&h.year===year&&h.month===month){
      result.push({hijri:year+'/'+String(month).padStart(2,'0')+'/'+String(h.day).padStart(2,'0'),day:h.day,weekday:d.getUTCDay()});
    }
  }
  return result;
}
function HijriDatePicker({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const parsed=value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/), today=hijriPartsFromGregorian(new Date().toISOString().slice(0,10));
  const initial=parsed?{year:Number(parsed[1]),month:Number(parsed[2])}:(today?{year:today.year,month:today.month}:{year:1448,month:1});
  const [open,setOpen]=useState(false),[ym,setYm]=useState(initial);
  useEffect(()=>{if(open&&parsed)setYm({year:Number(parsed[1]),month:Number(parsed[2])});},[open,value]);
  const days=hijriMonthDays(ym.year,ym.month),leading=days.length?days[0].weekday:0;const cells=[...Array(leading).fill(null),...days];while(cells.length%7)cells.push(null);
  const move=(delta:number)=>{let y=ym.year,m=ym.month+delta;if(m<1){m=12;y--}if(m>12){m=1;y++}setYm({year:y,month:m})};
  return <div className="relative min-w-[230px]">
    <div className="flex gap-2">
      <input disabled={disabled} value={value} onChange={e=>onChange(formatHijriInput(e.target.value))} onFocus={()=>!disabled&&setOpen(true)} inputMode="numeric" placeholder="1448/03/01" className="border rounded-lg px-3 py-2 w-[175px] disabled:bg-gray-100 disabled:text-gray-400"/>
      <button disabled={disabled} type="button" onClick={()=>setOpen(v=>!v)} className="border rounded-lg px-3 py-2 bg-white disabled:bg-gray-100 disabled:text-gray-400" title="فتح التقويم الهجري"><CalendarDays size={17}/></button>
    </div>
    {open&&<div className="absolute z-[100] right-0 mt-2 w-[330px] rounded-2xl border bg-white shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3"><button type="button" onClick={()=>move(-1)} className="border rounded-lg px-3 py-1">‹</button><b>{hijriMonths[ym.month-1]} {ym.year} هـ</b><button type="button" onClick={()=>move(1)} className="border rounded-lg px-3 py-1">›</button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">{weekDays.map(x=><div key={x}>{x.slice(0,2)}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map((cell:any,i:number)=>cell?<button type="button" key={cell.hijri} onClick={()=>{onChange(cell.hijri);setOpen(false)}} className={value===cell.hijri?'rounded-lg bg-[var(--navy)] text-white py-2 font-bold':'rounded-lg hover:bg-slate-100 py-2'}>{cell.day}</button>:<div key={i}/>)}</div>
      <div className="text-xs text-gray-400 text-center mt-3">تقويم أم القرى</div>
    </div>}
  </div>;
}

export default function Dashboard() {
  const sb = supabaseBrowser();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [rows, setRows] = useState<Record<string, PayrollRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [managerName, setManagerName] = useState('');
  const [stampUrl, setStampUrl] = useState('');
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingTeachers, setSavingTeachers] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityReports, setActivityReports] = useState<Record<string, ActivityReport>>({});
  const [activityFiles, setActivityFiles] = useState<Record<string, File | null>>({});
  const [savingActivity, setSavingActivity] = useState(false);
  const [monthlyAwards, setMonthlyAwards] = useState<MonthlyAward[]>([]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }

    const { data: su } = await sb
      .from('school_users')
      .select('school_id,schools(id,school_code,school_name,manager_name,stamp_path,manager_signature_path,allow_school_teacher_edit)')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!su) { setMessage('لم يتم ربط الحساب بمدرسة.'); setLoading(false); return; }

    const currentSchool = su.schools as unknown as School;
    setSchool(currentSchool);
    // يسجل زيارة واحدة فقط لكل جلسة متصفح حتى لا يتحول تحديث الصفحة إلى نقاط مصطنعة.
    const loginKey='school-login-'+su.school_id+'-'+new Date().toISOString().slice(0,10);
    if(!sessionStorage.getItem(loginKey)){
      await sb.from('school_login_events').insert({school_id:su.school_id,user_id:user.id});
      sessionStorage.setItem(loginKey,'1');
    }
    const {data:awards}=await sb.from('school_monthly_awards').select('id,month_key,rank,total_score,issued_at').eq('school_id',su.school_id).order('month_key',{ascending:false}).limit(12);
    setMonthlyAwards((awards||[]) as MonthlyAward[]);
    setManagerName(currentSchool?.manager_name || '');
    if (currentSchool?.stamp_path) {
      setStampUrl(sb.storage.from('school-stamps').getPublicUrl(currentSchool.stamp_path).data.publicUrl);
    } else {
      setStampUrl('');
    }
    if (currentSchool?.manager_signature_path) {
      setSignatureUrl(sb.storage.from('school-stamps').getPublicUrl(currentSchool.manager_signature_path).data.publicUrl);
    } else {
      setSignatureUrl('');
    }

    const { data: t } = await sb
      .from('teachers')
      .select('id,full_name,national_id,job_role,specialization')
      .eq('school_id', su.school_id)
      .eq('is_active', true)
      .order('full_name');
    setTeachers(t || []);

    const { data: p } = await sb.from('payroll_periods').select('*').order('start_date', { ascending: false });
    const { data: acts } = await sb.from('school_activities').select('id,name,description,is_active').eq('is_active', true).order('created_at', { ascending: false });
    const { data: reports } = await sb.from('school_activity_reports').select('*').eq('school_id', su.school_id);
    const reportMap: Record<string, ActivityReport> = {};
    (reports || []).forEach((x: ActivityReport) => { reportMap[x.activity_id] = x; });
    setActivities(acts || []);
    setActivityReports(reportMap);
    setPeriods(p || []);
    const active = (p || []).find((x: Period) => periodIsOpen(x as Period)) || p?.[0];
    if (active) {
      setPeriod(active);
      await loadRecords(su.school_id, active.id);
    } else {
      setRows({});
    }
    setLoading(false);
  }

  async function loadRecords(schoolId?: string, periodId?: string) {
    const sid = schoolId || school?.id;
    const pid = periodId || period?.id;
    if (!sid || !pid) return;
    const { data: r } = await sb
      .from('payroll_records')
      .select('*')
      .eq('school_id', sid)
      .eq('period_id', pid);
    const map: Record<string, PayrollRow> = {};
    (r || []).forEach((x: PayrollRow) => { map[x.teacher_id] = x; });
    setRows(map);
  }

  useEffect(() => { load(); }, []);

  const editable = !!period && periodIsOpen(period) && !!period.allow_edit;
  const teacherDataEditable = !!school?.allow_school_teacher_edit;
  const approved = teachers.length > 0 && teachers.every(t => rows[t.id]?.status === 'تم الاعتماد');
  const savedCount = teachers.filter(t => rows[t.id]?.status === 'تم الحفظ' || rows[t.id]?.status === 'تم الاعتماد').length;
  const approvedAt = useMemo(() => {
    const dates = Object.values(rows).map(r => r.approved_at).filter(Boolean) as string[];
    return dates.sort().at(-1) || null;
  }, [rows]);
  const approvedHijri = approvedAt ? gregorianToHijri(approvedAt.slice(0, 10)) : '—';

  const printRows = useMemo(() => teachers.map(t => {
    const row = rows[t.id] || { teacher_id: t.id, direct_start_date: null, pre_start_hours: 0, absence_days: 0, notes: null, status: 'لم يبدأ' };
    const periodDays = payrollWorkDays(period?.start_date, period?.end_date);
    const absenceDays = Number(row.absence_days ?? 0);
    const netDays = Math.max(0, periodDays - absenceDays);
    return { teacher: t, row, periodDays, netDays };
  }), [teachers, rows, period]);

  async function saveSingleTeacher(t: Teacher) {
    if (!school || !teacherDataEditable) return;
    setSavingTeachers(true);
    setMessage('');
    const { error } = await sb.from('teachers').update({
      full_name: t.full_name.trim(),
      national_id: t.national_id.replace(/\D/g, '').slice(0, 10),
      job_role: t.job_role,
      specialization: t.specialization?.trim() || null
    }).eq('id', t.id).eq('school_id', school.id);
    if (error) {
      setMessage('تعذر حفظ بيانات الموظف: ' + error.message);
    } else {
      setMessage('تم حفظ بيانات الموظف بنجاح.');
      setEditingTeacherId(null);
      await load();
    }
    setSavingTeachers(false);
  }

  async function save() {
    if (!period || !school || !editable) return;
    setSaving(true); setMessage('');
    if (teacherDataEditable) {
      for (const t of teachers) {
        const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, absence_days: 0, notes: null, status: 'لم يبدأ' };
        const { error } = await sb.from('teachers').update({ full_name: t.full_name, national_id: t.national_id, job_role: t.job_role, specialization: t.specialization || null }).eq('id', t.id).eq('school_id', school.id);
        if (error) { setMessage('تعذر حفظ بيانات الموظف: ' + error.message); setSaving(false); return; }
      }
    }
    for (const t of teachers) {
      const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' };
      const { error } = await sb.from('payroll_records').upsert({
        period_id: period.id,
        school_id: school.id,
        teacher_id: t.id,
        direct_start_date: r.direct_start_date || null,
        pre_start_hours: Number(r.pre_start_hours ?? 0),
        absence_days: Number(r.absence_days ?? 0),
        notes: r.notes || null,
        status: 'تم الحفظ',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'period_id,teacher_id' });
      if (error) { setMessage('تعذر الحفظ: ' + error.message); setSaving(false); return; }
    }
    setMessage('تم حفظ المسير بنجاح. راجع البيانات ثم اضغط «اعتماد المسير».');
    await loadRecords();
    setSaving(false);
  }

  async function approvePayroll() {
    if (!period || !school || !editable || teachers.length === 0) return;
    if (savedCount !== teachers.length) {
      setMessage('يجب حفظ جميع بيانات الموظفين أولاً قبل الاعتماد.');
      return;
    }
    if (!confirm('هل أنت متأكد من اعتماد المسير؟ بعد الاعتماد لن يمكن تعديل بيانات الموظفين من حساب المدرسة.')) return;
    setSaving(true); setMessage('جاري اعتماد المسير…');
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb
      .from('payroll_records')
      .update({ status: 'تم الاعتماد', approved_at: new Date().toISOString(), approved_by: user?.id })
      .eq('school_id', school.id)
      .eq('period_id', period.id);
    if (error) {
      setMessage('تعذر اعتماد المسير: ' + error.message);
    } else {
      setMessage('تم اعتماد المسير بنجاح. أصبح جاهزًا للطباعة.');
      await loadRecords();
    }
    setSaving(false);
  }

  async function saveActivityReport(activity: Activity) {
    if (!school) return;
    setSavingActivity(true); setMessage('');
    const existing = activityReports[activity.id];
    let attachmentPath = existing?.attachment_path || null;
    const file = activityFiles[activity.id];
    if (file) {
      const safeName = file.name.replace(/[^\\p{L}\\p{N}._-]/gu, '_');
      attachmentPath = school.id + '/' + activity.id + '/' + Date.now() + '-' + safeName;
      const { error: uploadError } = await sb.storage.from('school-activities').upload(attachmentPath, file, { upsert: false });
      if (uploadError) { setMessage('تعذر رفع المرفق: ' + uploadError.message); setSavingActivity(false); return; }
    }
    const payload = {
      activity_id: activity.id,
      school_id: school.id,
      report_text: existing?.report_text || '',
      statistics: existing?.statistics || '',
      attachment_path: attachmentPath,
      status: 'مقدم',
      submitted_at: new Date().toISOString()
    };
    const { data, error } = await sb.from('school_activity_reports').upsert(payload, { onConflict: 'activity_id,school_id' }).select('*').single();
    if (error) setMessage('تعذر حفظ تقرير النشاط: ' + error.message);
    else {
      setActivityReports(x => ({ ...x, [activity.id]: data as ActivityReport }));
      setActivityFiles(x => ({ ...x, [activity.id]: null }));
      setMessage('تم حفظ تقرير النشاط وإرساله لمدير النظام.');
    }
    setSavingActivity(false);
  }

  async function openActivityAttachment(path: string) {
    const { data, error } = await sb.storage.from('school-activities').createSignedUrl(path, 300);
    if (error) { setMessage('تعذر فتح المرفق: ' + error.message); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function updateActivityReport(activityId: string, patch: Partial<ActivityReport>) {
    setActivityReports(x => ({ ...x, [activityId]: { ...(x[activityId] || { activity_id: activityId, school_id: school?.id || '', report_text: '', statistics: '', attachment_path: null, status: 'مسودة', rating: null }), ...patch } }));
  }

  async function saveSchoolSettings() {
    if (!managerName.trim() && !stampFile && !signatureFile) {
      setMessage('أدخل اسم مدير المدرسة أو اختر صورة الختم أو التوقيع.');
      return;
    }
    setSavingSchool(true); setMessage('جاري حفظ بيانات المدير والختم والتوقيع…');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setMessage('انتهت جلسة الدخول.'); setSavingSchool(false); return; }
    const form = new FormData();
    form.append('manager_name', managerName.trim());
    if (stampFile) form.append('stamp', stampFile);
    if (signatureFile) form.append('signature', signatureFile);
    const response = await fetch('/api/school/stamp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || 'تعذر حفظ بيانات المدرسة.');
    } else {
      setStampUrl(result.stamp_url || stampUrl);
      setSignatureUrl(result.signature_url || signatureUrl);
      setStampFile(null);
      setSignatureFile(null);
      setMessage('تم حفظ بيانات مدير المدرسة والختم والتوقيع الإلكتروني.');
      await load();
    }
    setSavingSchool(false);
  }

  function printPayroll() {
    if (!approved) {
      setMessage('الطباعة متاحة بعد اعتماد المسير فقط.');
      return;
    }
    window.print();
  }

  async function logout() { await sb.auth.signOut(); location.href = '/'; }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل البيانات…</div></main>;
  if (!school) return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-8 text-center text-red-700">{message || 'تعذر تحميل بيانات المدرسة.'}</div></main>;

  return <div className="min-h-screen bg-slate-50 print:bg-white" dir="rtl">
    <div className="national-day-96-bar print:hidden"><div className="national-day-96-content max-w-7xl mx-auto px-4 sm:px-5 py-2 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="national-day-96-number">96</span><div><div className="font-black text-sm sm:text-base">عزّنا بطبعنا</div><div className="text-[11px] sm:text-xs text-white/80">اليوم الوطني السعودي 2026</div></div></div><span className="national-day-96-mark hidden sm:inline-flex">🇸🇦 23 سبتمبر</span></div></div><header className="bg-[var(--navy)] text-white print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
        <div><div className="portal-title font-bold text-base sm:text-lg">البوابة الإلكترونية لمدارس التعليم المستمر</div><div className="text-sm text-blue-100 mt-1">{school.school_name}</div></div>
        <button type="button" onClick={logout} className="flex gap-2 items-center bg-white/10 px-3 sm:px-4 py-2 rounded-xl shrink-0"><LogOut size={17}/> <span className="hidden sm:inline">خروج</span></button>
      </div>
    </header>

    <main className="max-w-7xl mx-auto p-3 sm:p-5 md:p-8">
      <div className="print:hidden">
        <section className="mb-7" aria-labelledby="services-title">
          <div className="mb-4">
            <h2 id="services-title" className="text-xl sm:text-2xl font-black text-[var(--navy)]">خدمات المدرسة</h2>
            <p className="text-sm text-gray-500 mt-1">الوصول السريع إلى الخدمات الإلكترونية المتاحة لحساب المدرسة</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a href="#activities" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"><div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4"><PartyPopper size={30}/></div><div className="font-black text-lg text-slate-900">الأنشطة والاحتفاليات</div><div className="text-sm text-gray-500 mt-1">إدارة الأنشطة والمناسبات ورفع التقارير والمرفقات</div><div className="mt-4 text-sm font-bold text-[var(--navy)]">الدخول إلى الخدمة ←</div></a>
            <a href="#employees" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"><div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4"><Users size={30}/></div><div className="font-black text-lg text-slate-900">بيانات الموظفين</div><div className="text-sm text-gray-500 mt-1">استعراض وتحديث بيانات الموظفين حسب الصلاحيات</div><div className="mt-4 text-sm font-bold text-[var(--navy)]">الدخول إلى الخدمة ←</div></a>
            <a href="#payroll" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"><div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4"><FileText size={30}/></div><div className="font-black text-lg text-slate-900">مسيرات الرواتب</div><div className="text-sm text-gray-500 mt-1">تعبئة المسير واعتماده وتجهيزه للطباعة</div><div className="mt-4 text-sm font-bold text-[var(--navy)]">الدخول إلى الخدمة ←</div></a>
          </div>
        </section>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="card p-5"><Users/><div className="text-2xl font-bold mt-3">{teachers.length}</div><div className="text-gray-500 text-sm">عدد الموظفين</div></div>
          <div className="card p-5"><CalendarDays/><div className="font-bold mt-3">{period?.period_name || 'لا توجد فترة'}</div><div className="text-gray-500 text-sm">الفترة الحالية</div></div>
          <div className="card p-5"><Lock/><div className="font-bold mt-3">{period && periodIsOpen(period) ? 'مفتوح للتعبئة' : 'مغلق'}</div><div className="text-gray-500 text-sm">حالة الفترة</div></div>
          <div className="card p-5"><CheckCircle2/><div className="text-2xl font-bold mt-3">{savedCount}</div><div className="text-gray-500 text-sm">السجلات المحفوظة</div></div>
        </div>

        <div className="card p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h2 className="font-bold text-lg">بيانات اعتماد المدرسة</h2><p className="text-sm text-gray-500 mt-1">تظهر بيانات المدير والختم والتوقيع الإلكتروني في المسير عند الطباعة.</p></div>
            <div className="flex items-center gap-2">{signatureUrl && <img src={signatureUrl} alt="توقيع مدير المدرسة" className="w-28 h-20 object-contain border rounded-xl bg-white" />}{stampUrl && <img src={stampUrl} alt="ختم المدرسة" className="w-20 h-20 object-contain border rounded-xl bg-white" />}</div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
            <label className="block"><span className="block text-sm font-semibold mb-2">اسم مدير المدرسة</span><input value={managerName} onChange={e => setManagerName(e.target.value)} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم مدير المدرسة" /></label>
            <label className="block"><span className="block text-sm font-semibold mb-2">صورة ختم المدرسة</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setStampFile(e.target.files?.[0] || null)} className="border rounded-xl px-3 py-2.5 w-full bg-white" /></label>
            <label className="block"><span className="block text-sm font-semibold mb-2">{signatureUrl ? "تغيير توقيع مدير المدرسة" : "رفع توقيع مدير المدرسة"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setSignatureFile(e.target.files?.[0] || null)} className="border rounded-xl px-3 py-2.5 w-full bg-white" /></label>
            <button type="button" disabled={savingSchool} onClick={saveSchoolSettings} className="bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold flex items-center justify-center gap-2"><Upload size={18}/>{savingSchool ? 'جارٍ الحفظ…' : 'حفظ البيانات'}</button>
          </div>
        </div>

        <div id="activities" className="card overflow-hidden mb-6 scroll-mt-6">
          <div className="p-5 border-b flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><PartyPopper size={22}/></div>
            <div><h2 className="font-bold text-lg">الأنشطة والاحتفالات والمناسبات</h2><p className="text-sm text-gray-500 mt-1">استعرض النشاط المضاف من مدير النظام، ثم قدم التقرير والإحصائيات وأرفق المستندات. التقييم بالنجوم للعرض فقط ويُدار من مدير النظام.</p></div>
          </div>
          <div className="p-5 space-y-4">
            {!activities.length && <div className="bg-slate-50 border rounded-xl p-5 text-sm text-gray-500">لا توجد أنشطة أو مناسبات متاحة حاليًا.</div>}
            {activities.map(activity => {
              const r = activityReports[activity.id] || { activity_id: activity.id, school_id: school.id, report_text: '', statistics: '', attachment_path: null, status: 'مسودة', rating: null };
              const submitted = r.status === 'مقدم' || r.status === 'مراجع';
              return <div key={activity.id} className="border rounded-2xl p-5 bg-white shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-[var(--navy)] flex items-center justify-center"><PartyPopper size={22}/></div>
                    <div><h3 className="font-bold text-lg">{activity.name}</h3>{submitted && <div className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><ShieldCheck size={14}/> تم إرسال النشاط — بانتظار تقييم مدير النظام</div>}</div>
                  </div>
                  <div className="shrink-0 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3"><div className="text-xs text-gray-500 mb-1">تقييم مدير النظام</div><div className="flex gap-1" aria-label="التقييم">{[1,2,3,4,5].map(n=><Star key={n} size={22} className={r.rating && n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}/>)}</div></div>
                </div>
                {!submitted ? <div className="mt-5">
                  <div className="grid md:grid-cols-2 gap-4">
                    <label><span className="block text-sm font-semibold mb-2">تقرير النشاط</span><textarea value={r.report_text || ''} onChange={e=>updateActivityReport(activity.id,{report_text:e.target.value})} rows={5} className="border rounded-xl px-4 py-3 w-full" placeholder="اكتب تقرير تنفيذ النشاط والنتائج..."/></label>
                    <label><span className="block text-sm font-semibold mb-2">الإحصائيات</span><textarea value={r.statistics || ''} onChange={e=>updateActivityReport(activity.id,{statistics:e.target.value})} rows={5} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: عدد المستفيدين، المشاركين، الحضور، الفعاليات..."/></label>
                  </div>
                  <div className="flex flex-wrap items-end gap-3 mt-4">
                    <label className="flex-1 min-w-[260px]"><span className="block text-sm font-semibold mb-2">مرفق التقرير</span><input type="file" onChange={e=>setActivityFiles(x=>({...x,[activity.id]:e.target.files?.[0] || null}))} className="border rounded-xl px-3 py-2.5 w-full bg-white"/></label>
                    {r.attachment_path && <button type="button" onClick={()=>openActivityAttachment(r.attachment_path!)} className="text-sm text-emerald-700 flex items-center gap-2 pb-3 hover:underline"><Paperclip size={17}/> عرض المرفق</button>}
                    <button type="button" disabled={savingActivity} onClick={()=>saveActivityReport(activity)} className="bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold flex items-center gap-2"><BarChart3 size={18}/>{savingActivity?'جارٍ الحفظ…':'حفظ وإرسال التقرير'}</button>
                  </div>
                </div> : <div className="mt-5 rounded-xl bg-slate-50 border p-4 text-sm text-gray-600 flex items-center gap-2"><Lock size={17} className="text-emerald-700"/> تم إغلاق التعديل بعد إرسال النشاط. يمكنك الاطلاع على اسم النشاط والتقييم فقط.</div>}
              </div>;
            })}
          </div>
        </div>

        <div id="employees" className="card overflow-hidden mb-6 scroll-mt-6">
          <div className="p-5 border-b">
            <h2 className="font-bold text-lg">بيانات الموظفين</h2>
            <p className="text-sm text-gray-500 mt-1">تعديل مستقل عن المسير. البيانات غير قابلة للتعديل إلا بعد الضغط على «تعديل» للموظف.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-4 text-right">#</th><th className="p-4 text-right">الاسم</th><th className="p-4 text-right">السجل المدني</th><th className="p-4 text-right">الوظيفة</th><th className="p-4 text-right">التخصص</th><th className="p-4 text-right">الإجراء</th></tr></thead>
              <tbody>{teachers.map((t,i) => { const editing=editingTeacherId===t.id; return <tr key={t.id} className="border-t">
                <td className="p-4">{i+1}</td>
                <td className="p-4"><input disabled={!editing} value={t.full_name} onChange={e=>setTeachers(xs=>xs.map(x=>x.id===t.id?{...x,full_name:e.target.value}:x))} className="border rounded-lg px-3 py-2 w-full min-w-[190px] disabled:bg-gray-50 disabled:text-gray-700"/></td>
                <td className="p-4"><input disabled={!editing} value={t.national_id} onChange={e=>setTeachers(xs=>xs.map(x=>x.id===t.id?{...x,national_id:e.target.value.replace(/\D/g,'').slice(0,10)}:x))} className="border rounded-lg px-3 py-2 w-full min-w-[140px] disabled:bg-gray-50 disabled:text-gray-700" maxLength={10} inputMode="numeric"/></td>
                <td className="p-4"><select disabled={!editing} value={t.job_role} onChange={e=>setTeachers(xs=>xs.map(x=>x.id===t.id?{...x,job_role:e.target.value}:x))} className="border rounded-lg px-3 py-2 w-full min-w-[120px] disabled:bg-gray-50 disabled:text-gray-700"><option>مدير</option><option>معلم</option><option>إداري</option><option>مستخدم</option><option>حارس</option></select></td>
                <td className="p-4"><input disabled={!editing} value={t.specialization||''} onChange={e=>setTeachers(xs=>xs.map(x=>x.id===t.id?{...x,specialization:e.target.value}:x))} className="border rounded-lg px-3 py-2 w-full min-w-[160px] disabled:bg-gray-50 disabled:text-gray-700"/></td>
                <td className="p-4">{teacherDataEditable ? (editing ? <button type="button" disabled={savingTeachers} onClick={()=>saveSingleTeacher(t)} className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50">{savingTeachers?'جارٍ الحفظ…':'حفظ'}</button> : <button type="button" disabled={savingTeachers} onClick={()=>setEditingTeacherId(t.id)} className="bg-[var(--navy)] text-white px-4 py-2 rounded-lg font-bold disabled:opacity-50">تعديل</button>) : null}</td>
              </tr>; })}</tbody>
            </table>
          </div>
        </div>

        <div id="payroll" className="card overflow-hidden scroll-mt-6">
          <div className="p-5 border-b flex flex-wrap gap-3 items-center justify-between">
            <div><h2 className="font-bold text-lg">مسير الرواتب</h2><p className="text-sm text-gray-500">أدخل تاريخ المباشرة والملاحظات لكل موظف. تعديل بيانات الموظف الأساسية {teacherDataEditable ? 'مفتوح من مدير النظام.' : 'مغلق من مدير النظام.'}</p></div>
            <div className="flex gap-2">
              <select value={period?.id || ''} onChange={async e => { const p = periods.find(x => x.id === e.target.value); if (p) { setPeriod(p); await loadRecords(school.id, p.id); } }} className="border rounded-xl px-3 py-2"><option value="">اختر الفترة</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period_name}</option>)}</select>
              <button type="button" onClick={load} className="border rounded-xl p-2"><RefreshCw size={18}/></button>
            </div>
          </div>
          {!editable && <div className="bg-amber-50 text-amber-800 px-5 py-3 flex gap-2 items-center text-sm"><Lock size={17}/> الفترة مغلقة حاليًا حسب التاريخ الهجري المحدد أو إعدادات الفترة، لا يمكن تعديل المسير.</div>}
          <div className="bg-slate-50 text-gray-600 px-5 py-3 text-sm">بيانات الاسم والسجل المدني والوظيفة والتخصص للعرض فقط داخل المسير، ولا يمكن تعديلها من هنا. للتعديل استخدم «بيانات الموظفين» أعلاه. تاريخ المباشرة والملاحظات فقط قابلة للتعديل حسب صلاحية فترة المسير.</div>
          {approved && <div className="bg-green-50 text-green-800 px-5 py-3 flex gap-2 items-center text-sm"><ShieldCheck size={18}/> تم اعتماد المسير — يمكنك الآن طباعته.</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-4 text-right">#</th><th className="p-4 text-right">الاسم</th><th className="p-4 text-right">الهوية</th><th className="p-4 text-right">الوظيفة</th><th className="p-4 text-right">التخصص</th><th className="p-4 text-right">تاريخ المباشرة</th><th className="p-4 text-right">عدد الحصص</th><th className="p-4 text-right">عدد أيام الغياب</th><th className="p-4 text-right">ملاحظات</th><th className="p-4 text-right">الحالة</th></tr></thead>
              <tbody>{teachers.map((t, i) => { const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' }; return <tr key={t.id} className="border-t">
                <td className="p-4">{i + 1}</td><td className="p-4"><input readOnly value={t.full_name} className="border rounded-lg px-3 py-2 w-full min-w-[190px] bg-gray-50 text-gray-700" /></td><td className="p-4"><input readOnly value={t.national_id} className="border rounded-lg px-3 py-2 w-full min-w-[130px] bg-gray-50 text-gray-700" maxLength={10} inputMode="numeric" /></td><td className="p-4"><select disabled value={t.job_role} className="border rounded-lg px-3 py-2 w-full min-w-[120px] bg-gray-50 text-gray-700"><option>مدير</option><option>معلم</option><option>إداري</option><option>مستخدم</option><option>حارس</option></select></td><td className="p-4"><input readOnly value={t.specialization || ''} className="border rounded-lg px-3 py-2 w-full min-w-[150px] bg-gray-50 text-gray-700" placeholder="—" /></td>
                <td className="p-4">
                  <HijriDatePicker disabled={!editable || r.status === 'تم الاعتماد'} value={r.direct_start_date ? gregorianToHijri(r.direct_start_date) : ''} onChange={hijri => { const gregorian=hijriToGregorian(hijri); if (gregorian) setRows(x=>({...x,[t.id]:{...r,direct_start_date:gregorian}})); }} />
                  <div className="text-[11px] text-gray-400 mt-1">هجري (أم القرى)</div>
                </td>
                <td className="p-4"><select disabled={!editable || r.status === 'تم الاعتماد'} value={r.pre_start_hours ?? 0} onChange={e => setRows(x => ({ ...x, [t.id]: { ...r, pre_start_hours: Number(e.target.value) } }))} className="border rounded-lg px-3 py-2 w-[125px] bg-white">{Array.from({length:21},(_,i)=><option key={i} value={i}>{i}</option>)}</select></td><td className="p-4"><select disabled={!editable || r.status === 'تم الاعتماد'} value={r.absence_days ?? 0} onChange={e => setRows(x => ({ ...x, [t.id]: { ...r, absence_days: Number(e.target.value) } }))} className="border rounded-lg px-3 py-2 w-[110px] bg-white"><option value={0}>0</option>{Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></td>
                <td className="p-4"><input disabled={!editable || r.status === 'تم الاعتماد'} value={r.notes || ''} onChange={e => setRows(x => ({ ...x, [t.id]: { ...r, notes: e.target.value } }))} className="border rounded-lg px-3 py-2" placeholder="اختياري" /></td>
                <td className="p-4"><span className={`px-2.5 py-1.5 rounded-full text-xs ${r.status === 'تم الاعتماد' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{r.status || 'لم يبدأ'}</span></td>
              </tr>; })}</tbody>
            </table>
          </div>
          <div className="p-5 border-t flex flex-wrap justify-between items-center gap-3">
            <div className="text-sm text-gray-500">{message}</div>
            <div className="flex gap-2">
              <button type="button" disabled={!editable || saving || approved} onClick={save} className="bg-[var(--navy)] text-white px-6 py-3 rounded-xl font-bold flex gap-2 items-center disabled:opacity-50"><FileText size={18}/>{saving ? 'جارٍ الحفظ…' : 'حفظ المسير'}</button>
              <button type="button" disabled={saving || approved || !editable} onClick={approvePayroll} className="bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex gap-2 items-center disabled:opacity-50"><ShieldCheck size={18}/>اعتماد المسير</button>
              <button type="button" disabled={!approved} onClick={printPayroll} className="border border-[var(--navy)] text-[var(--navy)] px-6 py-3 rounded-xl font-bold flex gap-2 items-center disabled:opacity-40"><Printer size={18}/>طباعة المسير</button>
            </div>
          </div>
        </div>
      </div>

      <section className="hidden print:block bg-white text-black print-payroll-sheet" dir="rtl">
        <div className="print-letterhead">
          <div className="print-letterhead-right">
            <div>المملكة العربية السعودية</div><div className="print-ministry">وزارة التعليم</div>
            <div>الإدارة العامة للتعليم بمنطقة نجران</div><div>الشؤون التعليمية/إدارة أداء التعليم</div>
          </div>
          <div className="print-letterhead-center">
            <svg viewBox="0 0 180 120" aria-label="شعار وزارة التعليم" role="img" className="print-moe-logo">
              <g fill="#00857a"><circle cx="48" cy="20" r="5"/><circle cx="66" cy="16" r="5"/><circle cx="84" cy="14" r="5"/><circle cx="102" cy="16" r="5"/><circle cx="120" cy="20" r="5"/><circle cx="40" cy="36" r="5"/><circle cx="58" cy="32" r="5"/><circle cx="76" cy="30" r="5"/><circle cx="94" cy="32" r="5"/><circle cx="112" cy="36" r="5"/><circle cx="34" cy="52" r="5"/><circle cx="52" cy="48" r="5"/><circle cx="70" cy="46" r="5"/><circle cx="88" cy="48" r="5"/><circle cx="106" cy="52" r="5"/></g>
              <text x="90" y="82" textAnchor="middle" fill="#00857a" fontSize="18" fontWeight="700">وزارة التعليم</text><text x="90" y="101" textAnchor="middle" fill="#4a4a4a" fontSize="9">Ministry of Education</text>
            </svg>
          </div>
          <div className="print-letterhead-left">
            <div><b>الرقم:</b> ....................................</div><div><b>التاريخ:</b> {approvedHijri !== '—' ? `${approvedHijri} هـ` : '....................................'}</div>
          </div>
        </div>
        <div className="print-main-title">طباعة مسير الرواتب</div>
        <div className="print-portal-title">البوابة الالكترونية لمدارس التعليم المستمر</div>
        <div className="print-meta">
          <div><b>اسم المدرسة:</b> {school.school_name}</div>
          <div><b>فترة المسير:</b> {period?.period_name || '—'} &nbsp; | &nbsp; من {period?.start_hijri || gregorianToHijri(period?.start_date)} هـ إلى {period?.end_hijri || gregorianToHijri(period?.end_date)} هـ</div>
        </div>
        <div className="print-reward-title">مكافأة العاملين وشهادة إنهاء مهمة بمدرسة {school.school_name} للتعليم المستمر بمنطقة نجران للعام: 1448هـ</div>
        <table className="print-payroll-table">
          <thead><tr><th>م</th><th>اسم الموظف</th><th>الوظيفة</th><th>عدد الحصص</th><th>عدد الأيام</th><th>أيام الغياب</th><th>تاريخ المباشرة</th><th>الملاحظات</th></tr></thead>
          <tbody>{printRows.map(({ teacher, row, netDays }, i) => <tr key={teacher.id}>
            <td>{i+1}</td><td className="employee-name">{teacher.full_name}</td><td>{teacher.job_role}</td><td>{row.pre_start_hours ?? 0}</td><td>{netDays}</td><td>{row.absence_days ?? 0}</td><td>{row.direct_start_date ? gregorianToHijri(row.direct_start_date) : '—'}</td><td>{row.notes || '—'}</td>
          </tr>)}</tbody>
        </table>
        <div className="print-certification-text">
          تشهد إدارة المدرسة بأن المرشحين للعمل بالمدرسة والموضحة بياناتهم أعلاه قد أنهوا المهمة لشهر <b>{period?.period_name || '—'}</b> للمدة من <b>{period?.start_hijri || gregorianToHijri(period?.start_date)} هـ</b> إلى <b>{period?.end_hijri || gregorianToHijri(period?.end_date)} هـ</b> بمدرسة <b>{school.school_name}</b> للفصل الدراسي الأول للعام 1448هـ
          <div className="print-certification-closing">للإحاطة والاطلاع ،،،،،،</div>
        </div>
        <div className="print-approval-grid">
          <div className="print-signature-box"><b>مدير المدرسة</b><div className="approval-name">{school.manager_name || managerName || '................................'}</div>{signatureUrl ? <img src={signatureUrl} alt="توقيع مدير المدرسة" className="print-signature-image"/> : <div className="approval-line">التوقيع: ................................</div>}</div>
          <div className="print-stamp-box"><b>ختم المدرسة</b><div className="print-stamp-area">{stampUrl ? <img src={stampUrl} alt="ختم المدرسة" className="print-stamp-image"/> : <span>موضع الختم</span>}</div></div>
          <div className="print-signature-box"><b>يعتمد</b><div className="approval-role">المشرف / مدير إدارة التعليم المستمر</div><div className="approval-line">التوقيع: ................................</div></div>
        </div>
        <div className="print-footer-note">هذا النموذج صادر من البوابة الإلكترونية لمدارس التعليم المستمر — الإدارة العامة للتعليم بمنطقة نجران</div>
      </section>
    </main>

    <style jsx global>{`@media print {
    @page { size: A4 landscape; margin: 8mm; }
    body { background:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .print-payroll-sheet { font-family: Tahoma, Arial, sans-serif; color:#064f50; position:relative; min-height:190mm; padding:2mm 3mm 0; }
    .print-letterhead { position:relative; height:34mm; }
    .print-letterhead-right { position:absolute; right:0; top:1mm; width:34%; text-align:right; font-weight:800; font-size:13px; line-height:1.7; }
    .print-letterhead-right .print-ministry { font-size:17px; }
    .print-letterhead-center { position:absolute; left:50%; top:-2mm; transform:translateX(-50%); width:32%; text-align:center; }
    .print-moe-logo { width:145px; height:98px; }
    .print-letterhead-left { position:absolute; left:0; top:3mm; width:25%; border:1px solid #9ccbd0; border-radius:7px; padding:8px 10px; text-align:right; line-height:1.9; font-size:11px; }
    .print-letterhead-left small { display:block; font-size:9px; }
    .print-main-title { width:310px; margin:0 auto 4px; padding:8px 22px; border-radius:16px; background:linear-gradient(135deg,#006b78,#078b82); color:#fff; text-align:center; font-size:24px; font-weight:900; }
    .print-portal-title { text-align:center; font-size:17px; font-weight:900; margin-bottom:10px; }
    .print-meta { display:grid; grid-template-columns:1fr 1.3fr; gap:10px; margin:0 0 10px; font-size:11px; color:#064f50; }
    .print-meta > div { border:1px solid #b7d9dc; border-radius:6px; padding:6px 10px; background:#fbfefe; }
    .print-reward-title{text-align:center;font-size:14px;font-weight:900;color:#064f50;margin:5px 0 9px;line-height:1.8}.print-certification-text{margin:10px 3px 6px;padding:8px 12px;border:1px solid #b7d9dc;border-radius:7px;background:#fbfefe!important;font-size:11px;font-weight:600;line-height:2;text-align:right;color:#203f40}.print-certification-closing{margin-top:3px;font-weight:800}
        .print-payroll-table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:10px; color:#173f41; overflow:hidden; border:1px solid #0b7e7b; border-radius:7px; }
    .print-payroll-table th { background:#087f78 !important; color:#fff !important; padding:8px 5px; font-weight:900; border-left:1px solid rgba(255,255,255,.45); }
    .print-payroll-table td { height:25px; padding:5px; text-align:center; border-left:1px solid #77b5b8; border-top:1px solid #9ac9cb; }
    .print-payroll-table tbody tr:nth-child(even) td { background:#f6fbfb !important; }
    .print-payroll-table .employee-name { text-align:right; font-weight:700; }
    .print-payroll-table th:nth-child(1){width:4%}.print-payroll-table th:nth-child(2){width:22%}.print-payroll-table th:nth-child(3){width:12%}.print-payroll-table th:nth-child(4){width:10%}.print-payroll-table th:nth-child(5){width:10%}.print-payroll-table th:nth-child(6){width:10%}.print-payroll-table th:nth-child(7){width:14%}.print-payroll-table th:nth-child(8){width:18%}
    .print-approval-grid { display:grid; grid-template-columns:1fr .8fr 1fr; gap:22px; align-items:center; margin:12px auto 0; width:82%; page-break-inside:avoid; }
    .print-signature-box,.print-stamp-box { min-height:72px; border:1px solid #9ccbd0; border-radius:7px; text-align:center; padding:7px 12px; color:#064f50; }
    .approval-name,.approval-role { margin-top:8px; font-size:11px; font-weight:700; }.approval-line{margin-top:10px;font-size:10px}.print-signature-image{display:block;max-width:110px;max-height:42px;object-fit:contain;margin:5px auto 0}
    .print-stamp-area { height:52px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#8aa; }
    .print-stamp-image { max-width:72px; max-height:58px; object-fit:contain; }
    .print-footer-note { position:absolute; bottom:1mm; left:0; right:0; text-align:center; border-top:1px solid #d7e8e8; padding-top:4px; font-size:8px; color:#628080; }
    tr { page-break-inside:avoid; } thead { display:table-header-group; }
  }`}</style>
  </div>;
}

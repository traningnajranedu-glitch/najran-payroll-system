'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, CheckCircle2, ShieldCheck, LogOut, Printer, MessageCircle, Plus, UserPlus, Power, FileSpreadsheet, PartyPopper, Star, BarChart3, Upload, Home, Settings, Bell, Clock3, ClipboardList, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name?: string | null; allow_school_teacher_edit?: boolean };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null; is_active: boolean };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null; auto_open_close?: boolean; is_open: boolean; allow_edit: boolean };
type RecordRow = { id: string; period_id: string; school_id: string; teacher_id: string; status: string; direct_start_date: string | null; pre_start_hours: number; payroll_days: number; payroll_days_manual: boolean; notes: string | null; approved_at?: string | null };
type Activity = { id: string; name: string; description: string | null; is_active: boolean };
type ActivityReport = { id: string; activity_id: string; school_id: string; report_text: string | null; statistics: string | null; attachment_path: string | null; status: string; rating: number | null; rated_at: string | null };
type MadrasatiDaily = { id:string; school_id:string; indicator_date:string; updated_at:string };

const roles = ['مدير','معلم','إداري','مستخدم','حارس'];

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

function gregorianToHijri(value: string): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Riyadh'
  }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
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
function periodIsOpen(p: Period): boolean {
  if (p.auto_open_close && p.start_hijri && p.end_hijri) {
    const today=currentHijriKey(), start=hijriKey(p.start_hijri), end=hijriKey(p.end_hijri);
    return today!==null && start!==null && end!==null && today>=start && today<=end;
  }
  return !!p.is_open && !!p.allow_edit;
}


const hijriMonths=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const weekDays=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function hijriPartsFromGregorian(value:string){
  if(!value)return null;
  const [y,m,d]=value.split('-').map(Number); if(!y||!m||!d)return null;
  const parts=new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'Asia/Riyadh'}).formatToParts(new Date(Date.UTC(y,m-1,d,12)));
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day')};
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
function HijriDatePicker({value,onChange,placeholder='اختر التاريخ الهجري'}:{value:string;onChange:(value:string)=>void;placeholder?:string}) {
  const parsed=value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  const todayParts=hijriPartsFromGregorian(new Date().toISOString().slice(0,10));
  const initial=parsed?{year:Number(parsed[1]),month:Number(parsed[2])}:(todayParts?{year:todayParts.year,month:todayParts.month}:{year:1448,month:1});
  const [open,setOpen]=useState(false),[ym,setYm]=useState(initial);
  useEffect(()=>{if(open&&parsed)setYm({year:Number(parsed[1]),month:Number(parsed[2])});},[open,value]);
  const days=hijriMonthDays(ym.year,ym.month),leading=days.length?days[0].weekday:0;
  const cells=[...Array(leading).fill(null),...days];while(cells.length%7)cells.push(null);
  function move(delta:number){let y=ym.year,m=ym.month+delta;if(m<1){m=12;y--;}if(m>12){m=1;y++;}setYm({year:y,month:m});}
  return <div className="relative">
    <div className="flex gap-2">
      <input value={value} onChange={e=>onChange(e.target.value.replace(/\D/g,'').slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1/$2/$3'))} onFocus={()=>setOpen(true)} inputMode="numeric" className="border rounded-xl px-4 py-3 w-full" placeholder={placeholder}/>
      <button type="button" onClick={()=>setOpen(v=>!v)} className="border rounded-xl px-4 py-3 bg-white shrink-0" title="فتح التقويم الهجري"><CalendarDays size={18}/></button>
    </div>
    {open&&<div className="absolute z-[100] right-0 mt-2 w-[330px] rounded-2xl border bg-white shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3"><button type="button" onClick={()=>move(-1)} className="border rounded-lg px-3 py-1">‹</button><b>{hijriMonths[ym.month-1]} {ym.year} هـ</b><button type="button" onClick={()=>move(1)} className="border rounded-lg px-3 py-1">›</button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">{weekDays.map(x=><div key={x} className="py-1">{x.slice(0,2)}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">{cells.map((cell:any,i:number)=>cell?<button type="button" key={cell.hijri} onClick={()=>{onChange(cell.hijri);setOpen(false)}} className={value===cell.hijri?'rounded-lg bg-[var(--navy)] text-white py-2 font-bold':'rounded-lg hover:bg-slate-100 py-2'}>{cell.day}</button>:<div key={'empty-'+i}/>)}</div>
      <div className="text-xs text-gray-500 mt-3 text-center">تقويم أم القرى — اختر اليوم مباشرة</div>
    </div>}
  </div>;
}

export default function AdminPage() {
  const sb = supabaseBrowser();
  const [loading,setLoading]=useState(true), [allowed,setAllowed]=useState(false);
  const [tab,setTab]=useState('overview'), [schools,setSchools]=useState<School[]>([]), [teachers,setTeachers]=useState<Teacher[]>([]), [periods,setPeriods]=useState<Period[]>([]), [records,setRecords]=useState<RecordRow[]>([]), [allRecords,setAllRecords]=useState<RecordRow[]>([]);
  const [schoolId,setSchoolId]=useState(''), [periodId,setPeriodId]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [schoolForm,setSchoolForm]=useState({school_code:'',school_name:'',manager_name:''});
  const [teacherForm,setTeacherForm]=useState({school_id:'',full_name:'',national_id:'',job_role:'معلم',specialization:''});
  const [editingSchoolId,setEditingSchoolId]=useState<string|null>(null);
  const [editingTeacherId,setEditingTeacherId]=useState<string|null>(null);
  const [schoolEditForm,setSchoolEditForm]=useState({school_code:'',school_name:'',manager_name:''});
  const [teacherEditForm,setTeacherEditForm]=useState({school_id:'',full_name:'',national_id:'',job_role:'معلم',specialization:''});
  const [importingSchools,setImportingSchools]=useState(false), [importingTeachers,setImportingTeachers]=useState(false);
  const [periodForm,setPeriodForm]=useState({period_name:'',start_hijri:'',end_hijri:'',allow_edit:true});
  const [activities,setActivities]=useState<Activity[]>([]), [activityReports,setActivityReports]=useState<ActivityReport[]>([]), [madrasatiDaily,setMadrasatiDaily]=useState<MadrasatiDaily[]>([]);
  const [activityForm,setActivityForm]=useState({name:'',description:''});
  const [activityRating,setActivityRating]=useState<Record<string,number>>({});
  const [editingActivityId,setEditingActivityId]=useState<string|null>(null);
  const [adminSignatureUrl,setAdminSignatureUrl]=useState(''), [adminSignatureFile,setAdminSignatureFile]=useState<File|null>(null), [savingAdminSignature,setSavingAdminSignature]=useState(false);

  async function load(){
    setLoading(true); setError('');
    const {data:{user}}=await sb.auth.getUser();
    if(!user){location.href='/';return;}
    const {data:admin}=await sb.from('admin_users').select('id,signature_path').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(!admin){setLoading(false);return;} setAllowed(true);
    setAdminSignatureUrl(admin.signature_path ? sb.storage.from('school-stamps').getPublicUrl(admin.signature_path).data.publicUrl : '');
    const [s,t,p,acts,reps,allPayroll,mad]=await Promise.all([
      sb.from('schools').select('*').order('school_name'),
      sb.from('teachers').select('*').order('full_name'),
      sb.from('payroll_periods').select('*').order('start_date',{ascending:false}),
      sb.from('school_activities').select('*').order('created_at',{ascending:false}),
      sb.from('school_activity_reports').select('*').order('created_at',{ascending:false}),
      sb.from('payroll_records').select('*'),
      sb.from('school_madrasati_daily_indicators').select('id,school_id,indicator_date,updated_at').order('updated_at',{ascending:false}).limit(50)
    ]);
    if(s.error||t.error||p.error)setError(s.error?.message||t.error?.message||p.error?.message||'تعذر تحميل البيانات');
    setSchools(s.data||[]);setTeachers(t.data||[]);setPeriods(p.data||[]);setActivities(acts.data||[]);setActivityReports(reps.data||[]);setAllRecords(allPayroll.data||[]);setMadrasatiDaily((mad.data||[]) as MadrasatiDaily[]);
    if(!schoolId&&s.data?.[0])setSchoolId(s.data[0].id);
    if(!periodId&&p.data?.[0])setPeriodId(p.data[0].id);
    if(!teacherForm.school_id&&s.data?.[0])setTeacherForm(x=>({...x,school_id:s.data[0].id}));
    setLoading(false);
  }

  async function loadRecords(){if(!periodId)return;let q=sb.from('payroll_records').select('*').eq('period_id',periodId);if(schoolId)q=q.eq('school_id',schoolId);const {data,error}=await q;if(error)setError(error.message);else setRecords(data||[])}
  useEffect(()=>{load()},[]); useEffect(()=>{if(allowed)loadRecords()},[allowed,schoolId,periodId]);
  async function logout(){await sb.auth.signOut();location.href='/'}

  async function saveAdminSignature(){
    if(!adminSignatureFile){setError('اختر صورة توقيع مدير النظام أولًا.');return;}
    setSavingAdminSignature(true);setError('');setMessage('جاري رفع التوقيع الإلكتروني…');
    const {data:{session}}=await sb.auth.getSession();
    if(!session){setError('انتهت جلسة الدخول.');setSavingAdminSignature(false);return;}
    const form=new FormData();form.append('signature',adminSignatureFile);
    const response=await fetch('/api/admin/signature',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});
    const result=await response.json();
    if(!response.ok)setError(result.error||'تعذر حفظ توقيع مدير النظام.');
    else{setAdminSignatureUrl(result.signature_url||'');setAdminSignatureFile(null);setMessage('تم حفظ توقيع مدير النظام بنجاح.');}
    setSavingAdminSignature(false);
  }

  async function addActivity(){
    setMessage(''); setError('');
    if(!activityForm.name.trim()){setError('اسم النشاط أو الاحتفال مطلوب.');return;}
    setBusy(true);
    const {error}=await sb.from('school_activities').insert({name:activityForm.name.trim(),description:activityForm.description.trim()||null,is_active:true});
    if(error)setError('تعذر إضافة النشاط: '+error.message);
    else{setMessage('تمت إضافة النشاط أو المناسبة بنجاح.');setActivityForm({name:'',description:''});await load();}
    setBusy(false);
  }

  function startActivityEdit(activity: Activity){
    setEditingActivityId(activity.id);
    setActivityForm({name:activity.name,description:activity.description||''});
    setMessage(''); setError('');
  }

  function cancelActivityEdit(){
    setEditingActivityId(null);
    setActivityForm({name:'',description:''});
  }

  async function updateActivity(id:string){
    setMessage(''); setError('');
    if(!activityForm.name.trim()){setError('اسم النشاط أو الاحتفال مطلوب.');return;}
    setBusy(true);
    const {error}=await sb.from('school_activities').update({name:activityForm.name.trim(),description:activityForm.description.trim()||null}).eq('id',id);
    if(error) setError('تعذر تعديل النشاط: '+error.message);
    else {setMessage('تم تعديل النشاط أو المناسبة بنجاح.');cancelActivityEdit();await load();}
    setBusy(false);
  }

  async function deleteActivity(activity: Activity){
    const hasReports=activityReports.some(r=>r.activity_id===activity.id);
    const warning=hasReports?'سيتم حذف النشاط وجميع تقارير المدارس المرتبطة به. هل أنت متأكد؟':'هل أنت متأكد من حذف هذا النشاط؟';
    if(!confirm(warning)) return;
    setBusy(true); setError('');
    const {error}=await sb.from('school_activities').delete().eq('id',activity.id);
    if(error) setError('تعذر حذف النشاط: '+error.message);
    else {setMessage('تم حذف النشاط بنجاح.');await load();}
    setBusy(false);
  }

  async function toggleActivity(activity: Activity){
    setBusy(true); setError('');
    const {error}=await sb.from('school_activities').update({is_active:!activity.is_active}).eq('id',activity.id);
    if(error)setError('تعذر تغيير حالة النشاط: '+error.message); else await load();
    setBusy(false);
  }

  async function openActivityAttachment(path: string) {
    const { data, error } = await sb.storage.from('school-activities').createSignedUrl(path, 300);
    if (error) { setError('تعذر فتح المرفق: ' + error.message); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function rateActivity(report: ActivityReport, rating: number){
    setBusy(true); setError('');
    const {error}=await sb.from('school_activity_reports').update({rating,rated_by: (await sb.auth.getUser()).data.user?.id || null,rated_at:new Date().toISOString(),status:'مراجع'}).eq('id',report.id);
    if(error)setError('تعذر حفظ التقييم: '+error.message); else {setMessage('تم حفظ تقييم النشاط.');await load();}
    setBusy(false);
  }

  async function toggleSchoolTeacherEdit(school: School) {
    setBusy(true); setError(''); setMessage('');
    const next = !school.allow_school_teacher_edit;
    const { error } = await sb.from('schools').update({ allow_school_teacher_edit: next }).eq('id', school.id);
    if (error) setError('تعذر تغيير صلاحية تعديل بيانات الموظفين: ' + error.message);
    else setMessage(next ? `تم فتح تعديل بيانات موظفي مدرسة ${school.school_name} لحساب المدرسة.` : `تم إغلاق تعديل بيانات موظفي مدرسة ${school.school_name}. سيبقى تاريخ المباشرة والملاحظات متاحين.`);
    await load();
    setBusy(false);
  }

  async function addSchool(){
    setMessage('');setError('');
    if(!schoolForm.school_code.trim()||!schoolForm.school_name.trim()){setError('رمز المدرسة واسم المدرسة مطلوبان.');return;}
    setBusy(true);
    const {error}=await sb.from('schools').insert({school_code:schoolForm.school_code.trim(),school_name:schoolForm.school_name.trim(),manager_name:schoolForm.manager_name.trim()||null,is_active:true});
    if(error)setError('تعذر إضافة المدرسة: '+error.message);else{setMessage('تمت إضافة المدرسة بنجاح.');setSchoolForm({school_code:'',school_name:'',manager_name:''});await load();}
    setBusy(false);
  }

  function cleanExcelValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function normalizeHeader(value: unknown): string {
    return cleanExcelValue(value).toLowerCase().replace(/[\s_\-./\]+/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
  }

  function pickExcelValue(row: Record<string, unknown>, aliases: string[]): string {
    const normalized = new Map(Object.entries(row).map(([key,value]) => [normalizeHeader(key), cleanExcelValue(value)]));
    for (const alias of aliases) {
      const value = normalized.get(normalizeHeader(alias));
      if (value) return value;
    }
    return '';
  }

  async function importSchoolsFromExcel(file: File) {
    setMessage(''); setError(''); setImportingSchools(true); setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('ملف Excel لا يحتوي على ورقة بيانات.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      if (!rows.length) throw new Error('ملف Excel فارغ.');

      const parsed = rows.map((row, index) => ({
        rowNumber: index + 2,
        school_code: pickExcelValue(row, ['رمز المدرسة','رقم المدرسة','كود المدرسة','school_code','school code','code']),
        school_name: pickExcelValue(row, ['اسم المدرسة','المدرسة','school_name','school name','school']),
        manager_name: pickExcelValue(row, ['اسم مدير المدرسة','مدير المدرسة','قائد المدرسة','اسم القائد','manager_name','manager name','manager']),
      })).filter(row => row.school_code || row.school_name);

      if (!parsed.length) throw new Error('لم يتم العثور على بيانات المدارس. يجب أن يحتوي الملف على عمودين على الأقل: رمز المدرسة واسم المدرسة.');
      const invalid = parsed.find(row => !row.school_code || !row.school_name);
      if (invalid) throw new Error('الصف ' + invalid.rowNumber + ' ناقص: رمز المدرسة واسم المدرسة مطلوبان.');

      const unique = new Map<string, typeof parsed[number]>();
      for (const row of parsed) unique.set(row.school_code, row);
      const imported = Array.from(unique.values());

      const { data: existing, error: existingError } = await sb.from('schools').select('id,school_code,school_name,manager_name,is_active');
      if (existingError) throw existingError;
      const existingByCode = new Map((existing || []).map((school) => [String(school.school_code).trim(), school as School]));

      const toInsert = imported.filter(row => !existingByCode.has(row.school_code)).map(row => ({
        school_code: row.school_code,
        school_name: row.school_name,
        manager_name: row.manager_name || null,
        is_active: true,
      }));

      let insertedCount = 0;
      if (toInsert.length) {
        for (let i = 0; i < toInsert.length; i += 100) {
          const chunk = toInsert.slice(i, i + 100);
          const { error } = await sb.from('schools').insert(chunk);
          if (error) throw error;
          insertedCount += chunk.length;
        }
      }

      let updatedCount = 0;
      for (const row of imported) {
        const current = existingByCode.get(row.school_code);
        if (!current) continue;
        const manager = row.manager_name || null;
        if (current.school_name !== row.school_name || (current.manager_name || null) !== manager) {
          const { error } = await sb.from('schools').update({ school_name: row.school_name, manager_name: manager }).eq('id', current.id);
          if (error) throw error;
          updatedCount++;
        }
      }

      await load();
      setMessage('تم استيراد ' + insertedCount + ' مدرسة جديدة وتحديث ' + updatedCount + ' مدرسة موجودة. المدارس المكررة في الملف تم دمجها حسب رمز المدرسة.');
    } catch (err) {
      setError('تعذر استيراد ملف Excel: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'));
    } finally {
      setImportingSchools(false); setBusy(false);
    }
  }

  async function handleSchoolsExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('اختر ملف Excel بصيغة XLSX أو XLS أو CSV.'); return; }
    await importSchoolsFromExcel(file);
  }
  function startSchoolEdit(s:School){
    setEditingSchoolId(s.id); setSchoolEditForm({school_code:s.school_code,school_name:s.school_name,manager_name:s.manager_name||''}); setMessage(''); setError('');
  }
  function cancelSchoolEdit(){setEditingSchoolId(null);}

  async function updateSchool(id:string){
    setMessage(''); setError('');
    if(!schoolEditForm.school_code.trim()||!schoolEditForm.school_name.trim()){setError('رمز المدرسة واسم المدرسة مطلوبان.');return;}
    setBusy(true);
    const duplicate=schools.find(s=>s.id!==id && s.school_code.trim()===schoolEditForm.school_code.trim());
    if(duplicate){setError('رمز المدرسة مستخدم لمدرسة أخرى.');setBusy(false);return;}
    const {error}=await sb.from('schools').update({school_code:schoolEditForm.school_code.trim(),school_name:schoolEditForm.school_name.trim(),manager_name:schoolEditForm.manager_name.trim()||null}).eq('id',id);
    if(error)setError('تعذر تعديل المدرسة: '+error.message);else{setMessage('تم تعديل بيانات المدرسة بنجاح.');setEditingSchoolId(null);await load();}
    setBusy(false);
  }

  async function deleteSchool(s:School){
    if(!confirm('سيتم حذف المدرسة «'+s.school_name+'». لا يمكن التراجع عن الحذف. هل تريد المتابعة؟'))return;
    setBusy(true); setMessage(''); setError('');
    const [{count:teacherCount},{count:recordCount},{count:accountCount}]=await Promise.all([
      sb.from('teachers').select('id',{count:'exact',head:true}).eq('school_id',s.id),
      sb.from('payroll_records').select('id',{count:'exact',head:true}).eq('school_id',s.id),
      sb.from('school_users').select('id',{count:'exact',head:true}).eq('school_id',s.id),
    ]);
    if((teacherCount||0)>0 || (recordCount||0)>0 || (accountCount||0)>0){
      setError('لا يمكن حذف المدرسة لأنها مرتبطة ببيانات أخرى. الموظفون: '+(teacherCount||0)+'، سجلات المسيرات: '+(recordCount||0)+'، حسابات المدارس: '+(accountCount||0)+'؛ استخدم الإيقاف بدل الحذف أو احذف الارتباطات أولًا.');
      setBusy(false); return;
    }
    const {error}=await sb.from('schools').delete().eq('id',s.id);
    if(error)setError('تعذر حذف المدرسة: '+error.message);else{setMessage('تم حذف المدرسة بنجاح.');await load();}
    setBusy(false);
  }

  async function toggleSchool(s:School){
    setBusy(true);setError('');
    const {error}=await sb.from('schools').update({is_active:!s.is_active}).eq('id',s.id);
    if(error)setError('تعذر تغيير حالة المدرسة: '+error.message);else{setMessage(s.is_active?'تم إيقاف المدرسة.':'تم تفعيل المدرسة.');await load();}
    setBusy(false);
  }


  async function importTeachersFromExcel(file: File) {
    setMessage(''); setError(''); setImportingTeachers(true); setBusy(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('جلسة الدخول غير صالحة. سجل الخروج ثم ادخل مرة أخرى.');

      const form = new FormData();
      form.append('file', file);
      form.append('mode', 'teachers');

      const response = await fetch('/api/admin/import-excel', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
        body: form,
      });

      const raw = await response.text();
      let result: any = {};
      try { result = raw ? JSON.parse(raw) : {}; } catch { result = { error: raw || 'استجابة غير صالحة من الخادم.' }; }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || ('HTTP ' + response.status));
      }

      setMessage('تم استيراد ' + (result.added || 0) + ' موظف جديد وتحديث ' + (result.updated || 0) + ' موظف موجود. تم ربط الموظفين بالمدارس المحددة في الملف.');
      await load();
    } catch (err) {
      setError('تعذر استيراد ملف Excel: ' + (err instanceof Error ? err.message : 'حدث خطأ غير متوقع.'));
    } finally {
      setImportingTeachers(false); setBusy(false);
    }
  }

  async function handleTeachersExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('اختر ملف Excel بصيغة XLSX أو XLS أو CSV.');
      return;
    }
    await importTeachersFromExcel(file);
  }

  async function addTeacher(){
    setMessage('');setError('');
    if(!teacherForm.school_id||!teacherForm.full_name.trim()||!/^\d{10}$/.test(teacherForm.national_id.trim())){setError('اختر المدرسة وأدخل اسم الموظف ورقم هوية/سجل مدني من 10 أرقام.');return;}
    setBusy(true);
    const {error}=await sb.from('teachers').insert({school_id:teacherForm.school_id,full_name:teacherForm.full_name.trim(),national_id:teacherForm.national_id.trim(),job_role:teacherForm.job_role,specialization:teacherForm.specialization.trim()||null,is_active:true});
    if(error)setError('تعذر إضافة الموظف: '+error.message);else{setMessage('تمت إضافة الموظف وإسناده للمدرسة بنجاح.');setTeacherForm(x=>({...x,full_name:'',national_id:'',specialization:''}));await load();}
    setBusy(false);
  }

  function startTeacherEdit(t:Teacher){
    setEditingTeacherId(t.id); setTeacherEditForm({school_id:t.school_id,full_name:t.full_name,national_id:t.national_id,job_role:t.job_role,specialization:t.specialization||''}); setMessage(''); setError('');
  }
  function cancelTeacherEdit(){setEditingTeacherId(null);}

  async function updateTeacher(id:string){
    setMessage(''); setError('');
    if(!teacherEditForm.school_id||!teacherEditForm.full_name.trim()||!/^\d{10}$/.test(teacherEditForm.national_id.trim())){setError('اختر المدرسة وأدخل اسم الموظف ورقم هوية/سجل مدني من 10 أرقام.');return;}
    const school=schools.find(s=>s.id===teacherEditForm.school_id);
    if(!school){setError('المدرسة المحددة غير موجودة.');return;}
    if(!school.is_active){setError('لا يمكن إسناد الموظف إلى مدرسة موقوفة.');return;}
    const duplicate=teachers.find(t=>t.id!==id && t.national_id===teacherEditForm.national_id.trim());
    if(duplicate){setError('رقم الهوية/السجل المدني مستخدم لموظف آخر.');return;}
    setBusy(true);
    const {error}=await sb.from('teachers').update({school_id:teacherEditForm.school_id,full_name:teacherEditForm.full_name.trim(),national_id:teacherEditForm.national_id.trim(),job_role:teacherEditForm.job_role,specialization:teacherEditForm.specialization.trim()||null}).eq('id',id);
    if(error)setError('تعذر تعديل الموظف: '+error.message);else{setMessage('تم تعديل بيانات الموظف وإسناده للمدرسة بنجاح.');setEditingTeacherId(null);await load();}
    setBusy(false);
  }

  async function deleteTeacher(t:Teacher){
    if(!confirm('سيتم حذف الموظف «'+t.full_name+'». لا يمكن التراجع عن الحذف. هل تريد المتابعة؟'))return;
    setBusy(true); setMessage(''); setError('');
    const {count}=await sb.from('payroll_records').select('id',{count:'exact',head:true}).eq('teacher_id',t.id);
    if((count||0)>0){setError('لا يمكن حذف الموظف لأنه مرتبط بـ '+count+' سجل/سجلات في المسيرات. استخدم التعطيل للحفاظ على السجل التاريخي.');setBusy(false);return;}
    const {error}=await sb.from('teachers').delete().eq('id',t.id);
    if(error)setError('تعذر حذف الموظف: '+error.message);else{setMessage('تم حذف الموظف بنجاح.');await load();}
    setBusy(false);
  }

  async function moveTeacher(t:Teacher,newSchoolId:string){
    if(!newSchoolId||newSchoolId===t.school_id)return;
    setBusy(true);setError('');
    const {error}=await sb.from('teachers').update({school_id:newSchoolId}).eq('id',t.id);
    if(error)setError('تعذر إسناد الموظف: '+error.message);else{setMessage(`تم إسناد ${t.full_name} للمدرسة المحددة.`);await load();}
    setBusy(false);
  }

  async function generate(){if(!schoolId||!periodId)return;setBusy(true);const {error}=await sb.rpc('generate_school_payroll',{p_school_id:schoolId,p_period_id:periodId});if(error)setError('تعذر تجهيز المسير: '+error.message);else{setMessage('تم تجهيز مسير المدرسة بنجاح');loadRecords()}setBusy(false)}
  async function status(id:string,status:string){setBusy(true);const {error}=await sb.rpc('set_payroll_status',{p_record_id:id,p_status:status});if(error)setError(error.message);else loadRecords();setBusy(false)}
  async function updatePreStartHours(id:string,value:string){const hours=Math.max(0,Math.min(20,Number(value)||0));setRecords(rs=>rs.map(r=>r.id===id?{...r,pre_start_hours:hours}:r));const {error}=await sb.from('payroll_records').update({pre_start_hours:hours}).eq('id',id);if(error){setError('تعذر تعديل عدد الحصص قبل تاريخ المباشرة: '+error.message);loadRecords();}} async function updatePayrollDays(id:string,value:string){const days=Math.max(0,Math.min(31,Number(value)||0));setRecords(rs=>rs.map(r=>r.id===id?{...r,payroll_days:days,payroll_days_manual:true}:r));const {error}=await sb.from('payroll_records').update({payroll_days:days,payroll_days_manual:true}).eq('id',id);if(error){setError('تعذر تعديل عدد أيام المسير: '+error.message);loadRecords();}}
  async function addPeriod(){
    setMessage(''); setError('');
    const name=periodForm.period_name.trim();
    const sk=hijriKey(periodForm.start_hijri), ek=hijriKey(periodForm.end_hijri);
    const startG=hijriToGregorian(periodForm.start_hijri), endG=hijriToGregorian(periodForm.end_hijri);
    if(!name||sk===null||ek===null||!startG||!endG){setError('أدخل اسم الفترة وتاريخ بداية ونهاية هجريين صحيحين بصيغة سنة/شهر/يوم.');return;}
    if(sk>ek){setError('تاريخ بداية المسير يجب أن يكون قبل أو مساويًا لتاريخ الإغلاق.');return;}
    setBusy(true);
    const today=currentHijriKey();
    const open=today!==null && today>=sk && today<=ek;
    const {error}=await sb.from('payroll_periods').insert({
      period_name:name,start_hijri:periodForm.start_hijri,end_hijri:periodForm.end_hijri,
      start_date:startG,end_date:endG,auto_open_close:true,is_open:open,allow_edit:open && periodForm.allow_edit
    });
    if(error)setError('تعذر إنشاء الفترة: '+error.message);
    else{setMessage('تم إنشاء فترة المسير وتحديد فتحها وإغلاقها تلقائيًا حسب التاريخ الهجري.');setPeriodForm({period_name:'',start_hijri:'',end_hijri:'',allow_edit:true});await load();}
    setBusy(false);
  }

  async function periodState(p:Period){
  setBusy(true); setError('');
  const open=!(p.is_open&&p.allow_edit);
  const {error}=await sb.rpc('set_period_state',{p_period_id:p.id,p_is_open:open,p_allow_edit:open});
  if(error)setError(error.message); else await load();
  setBusy(false);
}

async function editPeriodDates(p:Period){
  setMessage(''); setError('');
  const name=prompt('اسم فترة المسير', p.period_name);
  if(name===null)return;
  if(!name.trim()){setError('اسم الفترة مطلوب.');return;}
  const start=prompt('تاريخ بداية المسير الهجري (أم القرى) بصيغة 1448/02/04', p.start_hijri || gregorianToHijri(p.start_date));
  if(start===null)return;
  const end=prompt('تاريخ نهاية المسير الهجري (أم القرى) بصيغة 1448/02/09', p.end_hijri || gregorianToHijri(p.end_date));
  if(end===null)return;
  const startG=hijriToGregorian(start), endG=hijriToGregorian(end);
  const sk=hijriKey(start), ek=hijriKey(end);
  if(!startG||!endG||sk===null||ek===null||sk>ek){setError('تواريخ الفترة الهجرية غير صحيحة أو تاريخ البداية بعد النهاية.');return;}
  const auto=confirm('هل تريد أن يفتح ويغلق المسير تلقائيًا حسب التاريخ الهجري؟\nموافق = تلقائي\nإلغاء = تحكم يدوي');
  setBusy(true); setError('');
  const today=currentHijriKey();
  const autoOpen=auto && today!==null && today>=sk && today<=ek;
  const {error}=await sb.from('payroll_periods').update({
    period_name:name.trim(),
    start_hijri:start.replace(/[-.]/g,'/'), end_hijri:end.replace(/[-.]/g,'/'),
    start_date:startG, end_date:endG, auto_open_close:auto,
    is_open:auto ? autoOpen : p.is_open,
    allow_edit:auto ? autoOpen : p.allow_edit
  }).eq('id',p.id);
  if(error)setError('تعذر تعديل فترة المسير: '+error.message);
  else {setMessage('تم تعديل فترة المسير بنجاح.'); await load();}
  setBusy(false);
}

async function deletePeriod(p:Period){
  if(!confirm('سيتم حذف فترة المسير «'+p.period_name+'» وجميع سجلات المسير المرتبطة بها. لا يمكن التراجع عن الحذف. هل تريد المتابعة؟'))return;
  setBusy(true); setMessage(''); setError('');
  const {count,error:countError}=await sb.from('payroll_records').select('id',{count:'exact',head:true}).eq('period_id',p.id);
  if(countError){setError('تعذر التحقق من سجلات الفترة: '+countError.message);setBusy(false);return;}

  // علاقة period_id في قاعدة البيانات مضبوطة على ON DELETE CASCADE،
  // لذلك حذف الفترة يحذف سجلاتها المرتبطة تلقائيًا.
  const {error}=await sb.from('payroll_periods').delete().eq('id',p.id);
  if(error)setError('تعذر حذف فترة المسير: '+error.message);
  else {
    if(periodId===p.id)setPeriodId('');
    setMessage((count||0)>0
      ? 'تم حذف فترة المسير وحذف '+count+' سجل مرتبط بها بنجاح.'
      : 'تم حذف فترة المسير بنجاح.');
    await load();
  }
  setBusy(false);
}

  if(loading)return <main className="min-h-screen flex items-center justify-center">
<div className="card p-10">جارٍ تحميل لوحة الإدارة…</div></main>;
  if(!allowed)return <main className="min-h-screen flex items-center justify-center"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">هذا القسم مخصص لمدير النظام.</p></div></main>;

  const nav=[['overview','الرئيسية',Home],['schools','المدارس',Building2],['teachers','الموظفون',Users],['periods','فترات المسيرات',CalendarDays],['payroll','إدارة المسيرات',ClipboardList],['activities','الأنشطة والاحتفالات',Star],['kpi','التقارير والمؤشرات',BarChart3],['accounts','الإعدادات والحسابات',Settings],['print','طباعة المسيرات',Printer],['whatsapp','التواصل مع المدارس',MessageCircle],['daily-report','التقرير اليومي',FileSpreadsheet]] as const;
  const school=schools.find(s=>s.id===schoolId), period=periods.find(p=>p.id===periodId);

  function go(key:string){setTab(key);if(key==='accounts')location.href='/admin/accounts';if(key==='print')location.href='/admin/school-print';if(key==='whatsapp')location.href='/admin/whatsapp';if(key==='daily-report')location.href='/admin/daily-report';if(key==='kpi')location.href='/admin/kpi'}

  const openPeriods=periods.filter(p=>periodIsOpen(p)).length;
  const activeTeachers=teachers.filter(t=>t.is_active).length;
  const approvedRecords=records.filter(r=>r.status==='تم الاعتماد').length;
  const savedRecords=records.filter(r=>r.status==='تم الحفظ').length;
  const pendingRecords=Math.max(0,records.length-approvedRecords-savedRecords);
  const currentPeriodRecords=allRecords.filter(r=>r.period_id===periodId);
  const approvedSchoolIds=new Set(schools.filter(s=>{
    const sr=currentPeriodRecords.filter(r=>r.school_id===s.id);
    return sr.length>0&&sr.every(r=>r.status==='تم الاعتماد');
  }).map(s=>s.id));
  const approvedSchools=schools.filter(s=>approvedSchoolIds.has(s.id));
  const approvedSchoolsCount=approvedSchools.length;
  const unapprovedSchools=schools.filter(s=>!approvedSchoolIds.has(s.id));
  const unapprovedSchoolsCount=unapprovedSchools.length;
  const currentPeriodName=periods.find(p=>p.id===periodId)?.period_name||'الفترة الحالية';
  const roleCounts=roles.map(role=>({role,count:teachers.filter(t=>t.is_active&&t.job_role===role).length}));
  const maxRoleCount=Math.max(1,...roleCounts.map(x=>x.count));
  const recentActivities=activities.slice(0,3);
  const recentPeriods=periods.slice(0,5);
  const payrollApprovalNotifications=periods.flatMap(period=>schools.map(school=>{
    const periodRecords=allRecords.filter(r=>r.period_id===period.id&&r.school_id===school.id);
    if(!periodRecords.length||!periodRecords.every(r=>r.status==='تم الاعتماد'))return null;
    const approvedAt=periodRecords.map(r=>r.approved_at).filter(Boolean).sort().at(-1)||null;
    return {id:school.id+'-'+period.id,school,period,approvedAt};
  })).filter((x):x is NonNullable<typeof x>=>!!x).sort((a,b)=>(b.approvedAt||'').localeCompare(a.approvedAt||''));
  const recentApprovalNotifications=payrollApprovalNotifications.slice(0,4);
  const recentMadrasatiNotifications=madrasatiDaily.slice(0,4).map(x=>({ ...x, school:schools.find(s=>s.id===x.school_id) }));
  const latestSchoolPayrolls=schools.map(school=>{
    const schoolRecords=allRecords.filter(r=>r.school_id===school.id);
    const periodWithRecords=periods.find(p=>schoolRecords.some(r=>r.period_id===p.id));
    if(!periodWithRecords)return {school,period:null,approved:false,approvedAt:null};
    const periodRecords=schoolRecords.filter(r=>r.period_id===periodWithRecords.id);
    const approved=periodRecords.length>0&&periodRecords.every(r=>r.status==='تم الاعتماد');
    const approvedAt=approved?periodRecords.map(r=>r.approved_at).filter(Boolean).sort().at(-1)||null:null;
    return {school,period:periodWithRecords,approved,approvedAt};
  }).sort((a,b)=>{
    const ad=a.period?.start_date||'', bd=b.period?.start_date||'';
    return bd.localeCompare(ad);
  }).slice(0,5);

  return <div dir="rtl" className="min-h-screen bg-[#f4f7f6] text-slate-800">
    <div className="lg:pr-[220px]">
      <header className="bg-white border-b border-emerald-100 shadow-sm">
        <div className="px-4 md:px-7 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center"><ShieldCheck size={30}/></div><div><h1 className="font-black text-lg md:text-2xl text-emerald-950">البوابة الإلكترونية لمدارس التعليم المستمر</h1><p className="text-xs md:text-sm text-slate-500 mt-1">الإدارة العامة للتعليم بمنطقة نجران — قسم التعليم المستمر</p></div></div>
          <div className="flex items-center gap-3"><div className="hidden md:block text-left"><div className="text-xs text-slate-400">مرحبًا بك</div><div className="font-bold text-sm">مدير النظام</div></div><button onClick={logout} title="تسجيل الخروج" className="w-10 h-10 rounded-xl border bg-white flex items-center justify-center text-emerald-900 hover:bg-emerald-50"><LogOut size={18}/></button></div>
        </div>
      </header>
      <div className="mx-3 md:mx-6 mt-4 rounded-2xl overflow-hidden bg-gradient-to-l from-emerald-900 via-emerald-700 to-emerald-600 text-white shadow-sm">
        <div className="px-6 py-5 md:py-7 flex items-center justify-between gap-4"><div><div className="text-2xl md:text-3xl font-black">وطن طموح .. تعليم مستمر</div><div className="text-emerald-100 mt-1">لنرتقي بمستقبل أبنائنا</div></div><div className="hidden sm:flex items-center gap-3"><div className="text-left"><div className="text-xs text-emerald-100">البوابة الإلكترونية</div><div className="font-black">التعليم المستمر</div></div><Building2 size={48} className="opacity-80"/></div></div>
      </div>
  <main className="p-3 sm:p-5 md:p-6"><div>
      <aside className="fixed right-0 top-0 bottom-0 w-[220px] bg-gradient-to-b from-[#064e3b] to-[#043f34] text-white z-40 hidden lg:flex flex-col shadow-xl"><div className="h-[92px] flex items-center justify-center border-b border-white/10"><div className="text-center"><div className="font-black text-lg">التعليم المستمر</div><div className="text-[11px] text-emerald-100 mt-1">لوحة مدير النظام</div></div></div><nav className="p-3 space-y-1 flex-1 overflow-y-auto">{nav.map(([key,label,Icon])=><button key={key} type="button" onClick={()=>go(key)} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-right text-sm transition ${tab===key?'bg-white text-emerald-900 font-black shadow':'text-emerald-50 hover:bg-white/10'}`}><Icon size={18}/><span>{label}</span></button>)}</nav><div className="p-4 border-t border-white/10 text-center text-xs text-emerald-100">الإدارة العامة للتعليم بنجران</div></aside>
      <div className="lg:hidden mb-4 overflow-x-auto flex gap-2 pb-1">{nav.map(([key,label,Icon])=><button key={key} onClick={()=>go(key)} className={`shrink-0 rounded-xl px-3 py-2 flex items-center gap-2 text-sm ${tab===key?'bg-emerald-800 text-white':'bg-white border'}`}><Icon size={16}/>{label}</button>)}</div>
      <section className="space-y-5">
        {message&&<div className="bg-green-50 text-green-800 border border-green-100 rounded-xl px-4 py-3">{message}</div>}
        {error&&<div className="bg-red-50 text-red-800 border border-red-100 rounded-xl px-4 py-3">{error}</div>}

        {tab==='overview'&&<div className="space-y-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <button onClick={()=>setTab('schools')} className="bg-white border border-slate-200 rounded-2xl p-5 text-right shadow-sm hover:shadow-md transition"><div className="flex justify-between"><div><div className="font-bold">إجمالي المدارس</div><div className="text-4xl font-black mt-3 text-slate-900">{schools.length}</div><div className="text-xs text-slate-500 mt-2">مدرسة مسجلة في النظام</div></div><div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center"><Building2 size={27}/></div></div></button>
            <button onClick={()=>setTab('teachers')} className="bg-white border border-slate-200 rounded-2xl p-5 text-right shadow-sm hover:shadow-md transition"><div className="flex justify-between"><div><div className="font-bold">الموظفون النشطون</div><div className="text-4xl font-black mt-3 text-slate-900">{activeTeachers}</div><div className="text-xs text-slate-500 mt-2">موظف نشط في جميع المدارس</div></div><div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Users size={27}/></div></div></button>
            <button onClick={()=>setTab('periods')} className="bg-white border border-slate-200 rounded-2xl p-5 text-right shadow-sm hover:shadow-md transition"><div className="flex justify-between"><div><div className="font-bold">فترات المسيرات</div><div className="text-4xl font-black mt-3 text-slate-900">{periods.length}</div><div className="text-xs text-slate-500 mt-2">فترة مسيرة حالية وسابقة</div></div><div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><CalendarDays size={27}/></div></div></button>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 text-right shadow-sm"><button onClick={()=>setTab('payroll')} className="w-full text-right"><div className="flex justify-between"><div><div className="font-bold">المدارس المعتمدة للمسير</div><div className="text-4xl font-black mt-3 text-slate-900">{approvedSchoolsCount}</div><div className="text-xs text-slate-500 mt-2">من أصل {schools.length} مدرسة — المتبقي {unapprovedSchoolsCount}</div><div className="text-[11px] text-emerald-700 mt-1">{currentPeriodName}</div></div><div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><CheckCircle2 size={27}/></div></div></button>{approvedSchoolsCount>0&&<div className="mt-4 pt-3 border-t"><div className="text-xs font-black text-emerald-700 mb-2">تم اعتماد المسير:</div><div className="max-h-28 overflow-y-auto space-y-1.5">{approvedSchools.map(s=><button key={s.id} onClick={()=>{setSchoolId(s.id);setTab('payroll')}} className="w-full flex items-center gap-2 text-xs text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg px-2 py-1.5"><CheckCircle2 size={13} className="text-emerald-600 shrink-0"/><span className="truncate">{s.school_name}</span></button>)}</div></div>}{unapprovedSchoolsCount>0&&<div className="mt-4 pt-3 border-t"><div className="text-xs font-black text-red-700 mb-2">لم تعتمد المسير:</div><div className="max-h-28 overflow-y-auto space-y-1.5">{unapprovedSchools.map(s=><button key={s.id} onClick={()=>{setSchoolId(s.id);setTab('payroll')}} className="w-full flex items-center gap-2 text-xs text-slate-700 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1.5"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0"/><span className="truncate">{s.school_name}</span></button>)}</div></div>}</div>
          </div>
          <div className="grid xl:grid-cols-[1.45fr_.85fr] gap-4">
            <div className="bg-white border rounded-2xl p-5 shadow-sm"><div className="flex items-center justify-between mb-5"><h2 className="font-black text-lg flex items-center gap-2"><BarChart3 size={20} className="text-emerald-700"/> إحصائية الموظفين حسب الوظيفة</h2><button onClick={()=>setTab('teachers')} className="text-xs font-bold text-emerald-700">عرض الكل</button></div><div className="space-y-4">{roleCounts.map((x,i)=><div key={x.role} className="grid grid-cols-[80px_1fr_45px] items-center gap-3"><span className="text-sm font-bold">{x.role}</span><div className="h-8 rounded-lg bg-slate-100 overflow-hidden"><div className="h-full rounded-lg bg-gradient-to-l from-emerald-700 to-emerald-400" style={{width:`${Math.max(x.count?8:0,(x.count/maxRoleCount)*100)}%`}}/></div><b className="text-center">{x.count}</b></div>)}</div></div>
            <div className="bg-white border rounded-2xl p-5 shadow-sm"><h2 className="font-black text-lg flex items-center gap-2 mb-5"><CalendarDays size={20} className="text-emerald-700"/> حالة المسيرات</h2><div className="flex items-center justify-center py-2"><div className="relative w-40 h-40 rounded-full flex items-center justify-center" style={{background:`conic-gradient(#059669 0 ${records.length?approvedRecords/records.length*100:0}%,#f59e0b 0 ${records.length?(approvedRecords+savedRecords)/records.length*100:0}%,#2563eb 0)`}}><div className="w-24 h-24 rounded-full bg-white flex flex-col items-center justify-center"><b className="text-3xl">{records.length}</b><span className="text-xs text-slate-500">سجل</span></div></div></div><div className="space-y-2 mt-3 text-sm"><div className="flex justify-between"><span>● معتمدة</span><b>{approvedRecords}</b></div><div className="flex justify-between text-amber-700"><span>● قيد المراجعة</span><b>{savedRecords}</b></div><div className="flex justify-between text-blue-700"><span>● أخرى</span><b>{pendingRecords}</b></div></div></div>
          </div>
          <div className="grid xl:grid-cols-3 gap-4">
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden"><div className="p-4 border-b flex justify-between"><h3 className="font-black">أحدث الأنشطة والاحتفالات</h3><button onClick={()=>setTab('activities')} className="text-xs text-emerald-700 font-bold">عرض الكل</button></div><div className="divide-y">{recentActivities.length?recentActivities.map(a=><div key={a.id} className="p-4 flex gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><PartyPopper size={18}/></div><div><b className="text-sm">{a.name}</b><p className="text-xs text-slate-500 mt-1 line-clamp-1">{a.description||'نشاط مدارس التعليم المستمر'}</p></div></div>):<div className="p-5 text-sm text-slate-500">لا توجد أنشطة حاليًا.</div>}</div></div>
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden"><div className="p-4 border-b flex justify-between items-center"><h3 className="font-black flex gap-2 items-center"><span className="relative"><Bell size={18}/>{payrollApprovalNotifications.length>0&&<span className="absolute -top-2 -left-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">{payrollApprovalNotifications.length}</span>}</span> التنبيهات</h3><button onClick={()=>setTab('payroll')} className="text-xs text-emerald-700 font-bold">عرض الكل</button></div><div className="divide-y">{recentMadrasatiNotifications.map(n=><button key={'mad-'+n.id} onClick={()=>location.href='/admin/kpi'} className="w-full p-4 text-right hover:bg-violet-50/50 transition flex gap-3"><div className="w-9 h-9 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center shrink-0"><BarChart3 size={18}/></div><div className="min-w-0"><div className="text-sm"><b>{n.school?.school_name||'مدرسة'}</b> حدّثت مؤشر منصة مدرستي</div><div className="text-xs text-slate-500 mt-1">{n.indicator_date}</div></div></button>)}{recentApprovalNotifications.map(n=><button key={n.id} onClick={()=>{setPeriodId(n.period.id);setSchoolId(n.school.id);setTab('payroll')}} className="w-full p-4 text-right hover:bg-emerald-50/50 transition flex gap-3"><div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><CheckCircle2 size={18}/></div><div className="min-w-0"><div className="text-sm"><b>{n.school.school_name}</b> اعتمدت مسير الرواتب</div><div className="text-xs text-slate-500 mt-1">{n.period.period_name}</div></div></button>)}{!recentMadrasatiNotifications.length&&!recentApprovalNotifications.length&&<div className="p-5 text-sm text-slate-500 text-center">لا توجد تنبيهات جديدة.</div>}</div></div>
            <div className="bg-white border rounded-2xl shadow-sm overflow-hidden"><div className="p-4 border-b flex justify-between"><h3 className="font-black">آخر مسيرات المدارس</h3><button onClick={()=>setTab('payroll')} className="text-xs text-emerald-700 font-bold">عرض الكل</button></div><div className="divide-y">{latestSchoolPayrolls.map(item=><div key={item.school.id} className="p-3 flex items-center justify-between gap-3"><div className="min-w-0"><b className="text-sm block truncate">{item.school.school_name}</b><div className="text-[11px] text-slate-500 mt-1">{item.period?item.period.period_name:'لا يوجد مسير حتى الآن'}</div>{item.approvedAt&&<div className="text-[10px] text-emerald-700 mt-1">تاريخ الاعتماد: {gregorianToHijri(item.approvedAt.slice(0,10))} هـ</div>}</div><span className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-bold ${item.approved?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{item.approved?'معتمد':'لم يعتمد'}</span></div>)}</div></div>
          </div>
        </div>}

        {tab==='schools'&&<div className="space-y-5"><div className="card p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5"><div><h1 className="text-2xl font-bold">إدارة المدارس</h1><p className="text-sm text-gray-500 mt-1">أضف المدارس يدويًا أو استوردها دفعة واحدة من Excel.</p></div><label className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"><FileSpreadsheet size={18}/>{importingSchools?'جاري الاستيراد…':'استيراد المدارس من Excel'}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleSchoolsExcel} disabled={busy} className="hidden"/></label></div><div className="bg-slate-50 border rounded-xl p-4 text-sm text-gray-600"><b className="text-gray-800">تنسيق الملف:</b> استخدم أعمدة <span className="font-semibold">رمز المدرسة</span> و<span className="font-semibold">اسم المدرسة</span>، ويمكن إضافة <span className="font-semibold">مدير المدرسة</span>. يتم منع التكرار اعتمادًا على رمز المدرسة.</div><div className="grid md:grid-cols-3 gap-4"><label><span className="block text-sm font-semibold mb-2">رمز المدرسة</span><input value={schoolForm.school_code} onChange={e=>setSchoolForm({...schoolForm,school_code:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 101"/></label><label><span className="block text-sm font-semibold mb-2">اسم المدرسة</span><input value={schoolForm.school_name} onChange={e=>setSchoolForm({...schoolForm,school_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم المدرسة"/></label><label><span className="block text-sm font-semibold mb-2">اسم قائد/مدير المدرسة</span><input value={schoolForm.manager_name} onChange={e=>setSchoolForm({...schoolForm,manager_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اختياري"/></label></div><button disabled={busy} onClick={addSchool} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><Plus size={18}/> إضافة المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>المدارس المسجلة ({schools.length})</b></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الرمز</th><th className="p-3 text-right">اسم المدرسة</th><th className="p-3 text-right">مدير المدرسة</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">إجراء</th></tr></thead><tbody>{schools.map(s=>editingSchoolId===s.id?<tr className="border-t bg-blue-50/50" key={s.id}><td className="p-3"><input value={schoolEditForm.school_code} onChange={e=>setSchoolEditForm({...schoolEditForm,school_code:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={schoolEditForm.school_name} onChange={e=>setSchoolEditForm({...schoolEditForm,school_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={schoolEditForm.manager_name} onChange={e=>setSchoolEditForm({...schoolEditForm,manager_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3">{s.is_active?'نشطة':'موقوفة'}</td><td className="p-3"><div className="flex gap-2"><button disabled={busy} onClick={()=>updateSchool(s.id)} className="bg-[var(--navy)] text-white rounded-lg px-3 py-2">حفظ</button><button disabled={busy} onClick={cancelSchoolEdit} className="border rounded-lg px-3 py-2">إلغاء</button></div></td></tr>:<tr className="border-t" key={s.id}><td className="p-3">{s.school_code}</td><td className="p-3 font-semibold">{s.school_name}</td><td className="p-3">{s.manager_name||'—'}</td><td className="p-3">{s.is_active?'نشطة':'موقوفة'}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>startSchoolEdit(s)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>toggleSchool(s)} className="border rounded-lg px-3 py-2 inline-flex items-center gap-1"><Power size={15}/>{s.is_active?'إيقاف':'تفعيل'}</button><button disabled={busy} onClick={()=>toggleSchoolTeacherEdit(s)} className={`rounded-lg px-3 py-2 inline-flex items-center gap-1 ${s.allow_school_teacher_edit?'bg-emerald-700 text-white':'border'}`}><Power size={15}/>{s.allow_school_teacher_edit?'إغلاق تعديل الموظفين':'فتح تعديل الموظفين'}</button><button disabled={busy} onClick={()=>deleteSchool(s)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div><div className="text-xs mt-2 ${s.allow_school_teacher_edit?'text-emerald-700':'text-gray-500'}">{s.allow_school_teacher_edit?'حساب المدرسة يستطيع تعديل بيانات الموظفين':'حساب المدرسة لا يستطيع تعديل بيانات الموظفين — المباشرة والملاحظات متاحتان'}</div></td></tr>)}</tbody></table></div></div></div>}

        {tab==='teachers'&&<div className="space-y-5"><div className="card p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5"><div><h1 className="text-2xl font-bold">إضافة وإسناد الموظفين</h1><p className="text-sm text-gray-500 mt-1">يمكنك الإضافة يدويًا أو استيراد الموظفين من Excel وربطهم بالمدرسة.</p></div><label className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"><FileSpreadsheet size={18}/>{importingTeachers?"جاري الاستيراد…":"استيراد الموظفين من Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleTeachersExcel} disabled={busy} className="hidden"/></label></div><div className="bg-slate-50 border rounded-xl p-4 text-sm text-gray-600 mb-5"><b className="text-gray-800">تنسيق الملف:</b> الأعمدة المطلوبة: <span className="font-semibold">المدرسة، الاسم، رقم الهوية/السجل المدني</span>. ويمكن إضافة <span className="font-semibold">الوظيفة والتخصص</span>. يجب أن تكون المدرسة مسجلة في النظام، ويتم التحديث تلقائيًا عند وجود نفس رقم الهوية.</div><div className="grid md:grid-cols-2 gap-4"><label><span className="block text-sm font-semibold mb-2">المدرسة</span><select value={teacherForm.school_id} onChange={e=>setTeacherForm({...teacherForm,school_id:e.target.value})} className="border rounded-xl px-4 py-3 w-full"><option value="">اختر المدرسة</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_name} — {s.school_code}</option>)}</select></label><label><span className="block text-sm font-semibold mb-2">اسم الموظف</span><input value={teacherForm.full_name} onChange={e=>setTeacherForm({...teacherForm,full_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="الاسم رباعيًا"/></label><label><span className="block text-sm font-semibold mb-2">رقم الهوية / السجل المدني</span><input value={teacherForm.national_id} onChange={e=>setTeacherForm({...teacherForm,national_id:e.target.value.replace(/\D/g,'').slice(0,10)})} className="border rounded-xl px-4 py-3 w-full" inputMode="numeric" maxLength={10} placeholder="10 أرقام"/></label><label><span className="block text-sm font-semibold mb-2">الوظيفة</span><select value={teacherForm.job_role} onChange={e=>setTeacherForm({...teacherForm,job_role:e.target.value})} className="border rounded-xl px-4 py-3 w-full">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label className="md:col-span-2"><span className="block text-sm font-semibold mb-2">التخصص</span><input value={teacherForm.specialization} onChange={e=>setTeacherForm({...teacherForm,specialization:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="التخصص — اختياري"/></label></div><button disabled={busy} onClick={addTeacher} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><UserPlus size={18}/> إضافة الموظف وإسناده</button></div><div className="card overflow-hidden"><div className="p-5 border-b flex justify-between items-center"><b>الموظفون وإسنادهم للمدارس</b><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-3 py-2"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الهوية</th><th className="p-3 text-right">الوظيفة</th><th className="p-3 text-right">التخصص</th><th className="p-3 text-right">المدرسة المسند إليها</th></tr></thead><tbody>{teachers.filter(t=>!schoolId||t.school_id===schoolId).map(t=>editingTeacherId===t.id?<tr className="border-t bg-blue-50/50" key={t.id}><td className="p-3"><input value={teacherEditForm.full_name} onChange={e=>setTeacherEditForm({...teacherEditForm,full_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={teacherEditForm.national_id} onChange={e=>setTeacherEditForm({...teacherEditForm,national_id:e.target.value.replace(/\D/g,'').slice(0,10)})} maxLength={10} inputMode="numeric" className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><select value={teacherEditForm.job_role} onChange={e=>setTeacherEditForm({...teacherEditForm,job_role:e.target.value})} className="border rounded-lg px-3 py-2 w-full">{roles.map(r=><option key={r}>{r}</option>)}</select></td><td className="p-3"><input value={teacherEditForm.specialization} onChange={e=>setTeacherEditForm({...teacherEditForm,specialization:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><select value={teacherEditForm.school_id} onChange={e=>setTeacherEditForm({...teacherEditForm,school_id:e.target.value})} className="border rounded-lg px-3 py-2 w-full">{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><div className="flex gap-2 mt-2"><button disabled={busy} onClick={()=>updateTeacher(t.id)} className="bg-[var(--navy)] text-white rounded-lg px-3 py-2">حفظ</button><button disabled={busy} onClick={cancelTeacherEdit} className="border rounded-lg px-3 py-2">إلغاء</button><button disabled={busy} onClick={()=>deleteTeacher(t)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>:<tr className="border-t" key={t.id}><td className="p-3 font-semibold">{t.full_name}</td><td className="p-3">{t.national_id}</td><td className="p-3">{t.job_role}</td><td className="p-3">{t.specialization||'—'}</td><td className="p-3"><div className="flex flex-wrap gap-2 items-center"><select disabled={busy} value={t.school_id} onChange={e=>moveTeacher(t,e.target.value)} className="border rounded-lg px-3 py-2">{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button disabled={busy} onClick={()=>startTeacherEdit(t)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>deleteTeacher(t)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>)}</tbody></table></div></div></div>}

        {tab==='periods'&&<div className="space-y-5">
  <div className="card p-6">
    <h1 className="text-2xl font-bold mb-2">إنشاء فترة مسير</h1>
    <p className="text-sm text-gray-500 mb-5">حدد تاريخ فتح المسير وتاريخ إغلاقه بالهجري. النظام يحولهما داخليًا للميلادي للتحقق، لكن صلاحية التعبئة تعتمد على التاريخ الهجري وفق تقويم أم القرى.</p>
    <div className="grid md:grid-cols-4 gap-4">
      <label><span className="block text-sm font-semibold mb-2">اسم الفترة</span><input value={periodForm.period_name} onChange={e=>setPeriodForm({...periodForm,period_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: مسير شهر ربيع الأول"/></label>
      <label><span className="block text-sm font-semibold mb-2">تاريخ الفتح الهجري</span><HijriDatePicker value={periodForm.start_hijri} onChange={value=>setPeriodForm({...periodForm,start_hijri:value})}/></label>
      <label><span className="block text-sm font-semibold mb-2">تاريخ الإغلاق الهجري</span><HijriDatePicker value={periodForm.end_hijri} onChange={value=>setPeriodForm({...periodForm,end_hijri:value})}/></label>
      <label className="flex items-center gap-2 pt-8"><input type="checkbox" checked={periodForm.allow_edit} onChange={e=>setPeriodForm({...periodForm,allow_edit:e.target.checked})}/><span className="text-sm font-semibold">السماح للمدرسة بالتعبئة</span></label>
    </div>
    <button disabled={busy} onClick={addPeriod} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold">إنشاء الفترة وبدء التحكم التلقائي</button>
  </div>
  <div className="card p-6"><h2 className="text-xl font-bold mb-2">فترات المسيرات</h2><p className="text-sm text-gray-500 mb-5">داخل التاريخ المحدد تكون الفترة مفتوحة، وخارجها مغلقة تلقائيًا.</p>{periods.map(p=>{const open=periodIsOpen(p);const sh=p.start_hijri||gregorianToHijri(p.start_date);const eh=p.end_hijri||gregorianToHijri(p.end_date);return <div key={p.id} className="border rounded-xl p-4 mb-3"><div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3"><div><b>{p.period_name}</b><div className="text-sm text-gray-600 mt-1">فتح: {sh} — إغلاق: {eh}</div><div className="mt-2 text-sm"><span className={open?'text-green-700':'text-amber-700'}>{open?'مفتوح للتعبئة':'مغلق'}</span> — {p.auto_open_close?'تلقائي حسب التاريخ الهجري':'تحكم يدوي'}</div></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>editPeriodDates(p)} className="border rounded-lg px-4 py-2">تعديل الفترة</button><button disabled={busy||!!p.auto_open_close} onClick={()=>periodState(p)} className="border rounded-lg px-4 py-2 disabled:opacity-50">{p.is_open&&p.allow_edit?'إغلاق يدوي':'فتح يدوي'}</button><button disabled={busy} onClick={()=>deletePeriod(p)} className="border border-red-200 text-red-700 rounded-lg px-4 py-2">حذف</button></div></div></div>})}</div>
</div>}

        {tab==='activities'&&<div className="space-y-5">
  <div className="card p-6">
    <div className="flex items-center gap-3 mb-5"><div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><PartyPopper size={22}/></div><div><h1 className="text-2xl font-bold">الأنشطة والاحتفالات والمناسبات</h1><p className="text-sm text-gray-500 mt-1">أنشئ النشاط أو المناسبة وحدد الوصف المطلوب، ثم راجع تقارير وإحصائيات المدارس وقيّمها من 5 نجوم.</p></div></div>
    <div className="grid md:grid-cols-2 gap-4">
      <label><span className="block text-sm font-semibold mb-2">اسم النشاط أو الاحتفال</span><input value={activityForm.name} onChange={e=>setActivityForm({...activityForm,name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: اليوم الوطني"/></label>
      <label><span className="block text-sm font-semibold mb-2">وصف المطلوب من المدرسة</span><textarea value={activityForm.description} onChange={e=>setActivityForm({...activityForm,description:e.target.value})} rows={3} className="border rounded-xl px-4 py-3 w-full" placeholder="حدد المطلوب تنفيذه والتقرير والإحصائيات المطلوبة"/></label>
    </div>
    {editingActivityId ? <div className="mt-4 flex gap-2"><button disabled={busy} onClick={()=>updateActivity(editingActivityId)} className="bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold">حفظ التعديل</button><button disabled={busy} onClick={cancelActivityEdit} className="border rounded-xl px-6 py-3 font-bold">إلغاء</button></div> : <button disabled={busy} onClick={addActivity} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2"><Plus size={18}/> إضافة النشاط</button>}
  </div>
  <div className="card overflow-hidden">
    <div className="p-5 border-b"><b>الأنشطة والتقارير ({activities.length})</b></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3 text-right">النشاط / المناسبة</th><th className="p-3 text-right">الوصف</th><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">التقرير والإحصائيات</th><th className="p-3 text-right">التقييم</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">النشاط</th></tr></thead>
    <tbody>{activities.flatMap(activity=>{
      const rows=activityReports.filter(r=>r.activity_id===activity.id);
      if(!rows.length)return [<tr key={activity.id} className="border-t"><td className="p-3 font-semibold">{activity.name}</td><td className="p-3 max-w-[280px] whitespace-pre-line">{activity.description||'—'}</td><td className="p-3 text-gray-500">لم يرسل بعد</td><td className="p-3">—</td><td className="p-3">—</td><td className="p-3">{activity.is_active?'نشط':'موقوف'}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>startActivityEdit(activity)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>toggleActivity(activity)} className="border rounded-lg px-3 py-2">{activity.is_active?'إيقاف':'تفعيل'}</button><button disabled={busy} onClick={()=>deleteActivity(activity)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>];
      return rows.map(r=>{const schoolName=schools.find(s=>s.id===r.school_id)?.school_name||'—';return <tr key={r.id} className="border-t align-top"><td className="p-3 font-semibold">{activity.name}</td><td className="p-3 max-w-[260px] whitespace-pre-line">{activity.description||'—'}</td><td className="p-3">{schoolName}</td><td className="p-3 max-w-[300px]"><div className="whitespace-pre-line">{r.report_text||'—'}</div><div className="mt-2 text-xs text-gray-500">الإحصائيات: {r.statistics||'—'}</div>{r.attachment_path&&<button type="button" onClick={()=>r.attachment_path && openActivityAttachment(r.attachment_path)} className="text-xs text-emerald-700 mt-1 hover:underline">عرض المرفق</button>}</td><td className="p-3"><div className="flex gap-0.5">{[1,2,3,4,5].map(n=><button key={n} type="button" disabled={busy} onClick={()=>rateActivity(r,n)} title={n+' نجوم'}><Star size={19} className={r.rating&&n<=r.rating?'fill-amber-400 text-amber-400':'text-gray-300'}/></button>)}</div></td><td className="p-3">{r.status}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>startActivityEdit(activity)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>toggleActivity(activity)} className="border rounded-lg px-3 py-2">{activity.is_active?'إيقاف النشاط':'تفعيل النشاط'}</button><button disabled={busy} onClick={()=>deleteActivity(activity)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>});
    })}</tbody></table></div>
  </div>
</div>}

{tab==='payroll'&&<div className="space-y-5"><div className="card p-5 grid md:grid-cols-3 gap-3"><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">اختر الفترة</option>{periods.map(p=><option key={p.id} value={p.id}>{p.period_name}</option>)}</select><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button disabled={busy||!schoolId||!periodId} onClick={generate} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold">تجهيز مسير المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>{school?.school_name||'كل المدارس'}</b> — {period?.period_name||''}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">تاريخ المباشرة</th><th className="p-3 text-right">عدد الحصص قبل تاريخ المباشرة</th><th className="p-3 text-right">عدد أيام المسير</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{records.map(r=>{const t=teachers.find(x=>x.id===r.teacher_id),s=schools.find(x=>x.id===r.school_id);return <tr className="border-t" key={r.id}><td className="p-3">{t?.full_name||'—'}</td><td className="p-3">{s?.school_name||'—'}</td><td className="p-3">{r.direct_start_date||'—'}</td><td className="p-3"><select value={r.pre_start_hours ?? 0} disabled={busy} onChange={e=>updatePreStartHours(r.id,e.target.value)} className="border rounded-lg px-3 py-2 w-[125px]"><option value={0}>0</option>{Array.from({length:20},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></td><td className="p-3"><div className="flex items-center gap-2"><input type="number" min={0} max={31} value={r.payroll_days ?? 0} disabled={busy} onChange={e=>updatePayrollDays(r.id,e.target.value)} className="border rounded-lg px-3 py-2 w-24 text-center"/><span className="text-xs text-gray-500">{r.payroll_days_manual?'يدوي':'تلقائي'}</span></div></td><td className="p-3"><select value={r.status} disabled={busy} onChange={e=>status(r.id,e.target.value)} className="border rounded-lg px-2 py-1"><option>لم يبدأ</option><option>مفتوح للتعبئة</option><option>تم الحفظ</option><option>تم الاعتماد</option><option>مغلق</option></select></td></tr>})}</tbody></table></div></div></div>}
      </section>
    </div></main>
    </div>
  </div>;
}
'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, CheckCircle2, ShieldCheck, LogOut, Printer, MessageCircle, Plus, UserPlus, Power, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name?: string | null };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null; is_active: boolean };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null; auto_open_close?: boolean; is_open: boolean; allow_edit: boolean };
type RecordRow = { id: string; school_id: string; teacher_id: string; status: string; direct_start_date: string | null; notes: string | null };

const roles = ['مدير','معلم','إداري','مستخدم','حارس'];

function hijriKey(value: string): number | null {
  const m = value.trim().match(/^(\\d{4})[\\/]([01]\\d)[\\/]([0-3]\\d)$/);
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
  const m = value.trim().replace(/[-.]/g,'/').match(/^(\\d{4})[\\/]([01]?\\d)[\\/]([0-3]?\\d)$/);
  if (!m) return null;
  const hy=Number(m[1]), hm=Number(m[2]), hd=Number(m[3]);
  if (hm<1||hm>12||hd<1||hd>30) return null;
  const jd=Math.floor((11*hy+3)/30)+354*hy+30*hm-Math.floor((hm-1)/2)+hd+1948440-385;
  const l=jd+68569, n=Math.floor(4*l/146097), l2=l-Math.floor((146097*n+3)/4);
  const y=Math.floor(4000*(l2+1)/1461001), l3=l2-Math.floor(1461*y/4)+31;
  const mm=Math.floor(80*l3/2447), dd=l3-Math.floor(2447*mm/80), yy=y+Math.floor(mm/11);
  const mo=mm+2-12*Math.floor(mm/14);
  const base=new Date(Date.UTC(yy,mo-1,dd,12));
  const target=`${hy}/${String(hm).padStart(2,'0')}/${String(hd).padStart(2,'0')}`;
  for(let offset=-10;offset<=10;offset++){
    const candidate=new Date(base); candidate.setUTCDate(candidate.getUTCDate()+offset);
    if(gregorianToHijri(candidate.toISOString().slice(0,10))===target)return candidate.toISOString().slice(0,10);
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
  const first=hijriToGregorian(year+'/'+String(month).padStart(2,'0')+'/01'); if(!first)return [];
  const result:{hijri:string;day:number;weekday:number}[]=[]; const start=new Date(first+'T12:00:00Z');
  for(let i=-2;i<40;i++){const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);const g=d.toISOString().slice(0,10);const h=hijriPartsFromGregorian(g);if(h&&h.year===year&&h.month===month)result.push({hijri:year+'/'+String(month).padStart(2,'0')+'/'+String(h.day).padStart(2,'0'),day:h.day,weekday:d.getUTCDay()});}
  return result;
}
function HijriDatePicker({value,onChange,placeholder='اختر التاريخ الهجري'}:{value:string;onChange:(value:string)=>void;placeholder?:string}) {
  const parsed=value.match(/^(\\d{4})\\/(\\d{2})\\/(\\d{2})$/);
  const todayParts=hijriPartsFromGregorian(new Date().toISOString().slice(0,10));
  const initial=parsed?{year:Number(parsed[1]),month:Number(parsed[2])}:(todayParts?{year:todayParts.year,month:todayParts.month}:{year:1448,month:1});
  const [open,setOpen]=useState(false),[ym,setYm]=useState(initial);
  useEffect(()=>{if(open&&parsed)setYm({year:Number(parsed[1]),month:Number(parsed[2])});},[open,value]);
  const days=hijriMonthDays(ym.year,ym.month),leading=days.length?days[0].weekday:0;
  const cells=[...Array(leading).fill(null),...days];while(cells.length%7)cells.push(null);
  function move(delta:number){let y=ym.year,m=ym.month+delta;if(m<1){m=12;y--;}if(m>12){m=1;y++;}setYm({year:y,month:m});}
  return <div className="relative">
    <div className="flex gap-2">
      <input value={value} onChange={e=>onChange(e.target.value.replace(/\\D/g,'').slice(0,8).replace(/^(\\d{4})(\\d{2})(\\d{2})$/,'$1/$2/$3'))} onFocus={()=>setOpen(true)} inputMode="numeric" className="border rounded-xl px-4 py-3 w-full" placeholder={placeholder}/>
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
  const [tab,setTab]=useState('overview'), [schools,setSchools]=useState<School[]>([]), [teachers,setTeachers]=useState<Teacher[]>([]), [periods,setPeriods]=useState<Period[]>([]), [records,setRecords]=useState<RecordRow[]>([]);
  const [schoolId,setSchoolId]=useState(''), [periodId,setPeriodId]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [schoolForm,setSchoolForm]=useState({school_code:'',school_name:'',manager_name:''});
  const [teacherForm,setTeacherForm]=useState({school_id:'',full_name:'',national_id:'',job_role:'معلم',specialization:''});
  const [editingSchoolId,setEditingSchoolId]=useState<string|null>(null);
  const [editingTeacherId,setEditingTeacherId]=useState<string|null>(null);
  const [schoolEditForm,setSchoolEditForm]=useState({school_code:'',school_name:'',manager_name:''});
  const [teacherEditForm,setTeacherEditForm]=useState({school_id:'',full_name:'',national_id:'',job_role:'معلم',specialization:''});
  const [importingSchools,setImportingSchools]=useState(false), [importingTeachers,setImportingTeachers]=useState(false);
  const [periodForm,setPeriodForm]=useState({period_name:'',start_hijri:'',end_hijri:'',allow_edit:true});

  async function load(){
    setLoading(true); setError('');
    const {data:{user}}=await sb.auth.getUser();
    if(!user){location.href='/';return;}
    const {data:admin}=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
    if(!admin){setLoading(false);return;} setAllowed(true);
    const [s,t,p]=await Promise.all([
      sb.from('schools').select('*').order('school_name'),
      sb.from('teachers').select('*').order('full_name'),
      sb.from('payroll_periods').select('*').order('start_date',{ascending:false})
    ]);
    if(s.error||t.error||p.error)setError(s.error?.message||t.error?.message||p.error?.message||'تعذر تحميل البيانات');
    setSchools(s.data||[]);setTeachers(t.data||[]);setPeriods(p.data||[]);
    if(!schoolId&&s.data?.[0])setSchoolId(s.data[0].id);
    if(!periodId&&p.data?.[0])setPeriodId(p.data[0].id);
    if(!teacherForm.school_id&&s.data?.[0])setTeacherForm(x=>({...x,school_id:s.data[0].id}));
    setLoading(false);
  }

  async function loadRecords(){if(!periodId)return;let q=sb.from('payroll_records').select('*').eq('period_id',periodId);if(schoolId)q=q.eq('school_id',schoolId);const {data,error}=await q;if(error)setError(error.message);else setRecords(data||[])}
  useEffect(()=>{load()},[]); useEffect(()=>{if(allowed)loadRecords()},[allowed,schoolId,periodId]);
  async function logout(){await sb.auth.signOut();location.href='/'}

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
    return cleanExcelValue(value).toLowerCase().replace(/[\s_\-./\\]+/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
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
    if(!teacherEditForm.school_id||!teacherEditForm.full_name.trim()||!/^\\d{10}$/.test(teacherEditForm.national_id.trim())){setError('اختر المدرسة وأدخل اسم الموظف ورقم هوية/سجل مدني من 10 أرقام.');return;}
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
  const start=prompt('تاريخ بداية المسير الهجري (أم القرى) بصيغة 1448/02/04', p.start_hijri || gregorianToHijri(p.start_date));
  if(start===null)return;
  const end=prompt('تاريخ نهاية المسير الهجري (أم القرى) بصيغة 1448/02/09', p.end_hijri || gregorianToHijri(p.end_date));
  if(end===null)return;
  const startG=hijriToGregorian(start), endG=hijriToGregorian(end);
  const sk=hijriKey(start), ek=hijriKey(end);
  if(!startG||!endG||sk===null||ek===null||sk>ek){setError('تواريخ الفترة الهجرية غير صحيحة أو تاريخ البداية بعد النهاية.');return;}
  const auto=confirm('هل تريد أن يفتح ويغلق المسير تلقائيًا حسب التاريخ الهجري؟\\nموافق = تلقائي\\nإلغاء = تحكم يدوي');
  setBusy(true); setError('');
  const today=currentHijriKey();
  const autoOpen=auto && today!==null && today>=sk && today<=ek;
  const {error}=await sb.from('payroll_periods').update({
    start_hijri:start.replace(/-/g,'/'), end_hijri:end.replace(/-/g,'/'),
    start_date:startG, end_date:endG, auto_open_close:auto,
    is_open:auto ? autoOpen : p.is_open,
    allow_edit:auto ? autoOpen : p.allow_edit
  }).eq('id',p.id);
  if(error)setError('تعذر تحديث الفترة: '+error.message); else {setMessage('تم حفظ الفترة الهجرية وإعداد فتح/إغلاق المسير.'); await load();}
  setBusy(false);
}

  if(loading)return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل لوحة الإدارة…</div></main>;
  if(!allowed)return <main className="min-h-screen flex items-center justify-center"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">هذا القسم مخصص لمدير النظام.</p></div></main>;

  const nav=[['overview','نظرة عامة',Building2],['schools','المدارس',Building2],['teachers','الموظفون وإسنادهم',Users],['periods','فترات المسيرات',CalendarDays],['payroll','إدارة المسيرات',CheckCircle2],['accounts','حسابات المدارس',ShieldCheck],['print','طباعة المسيرات',Printer],['whatsapp','التواصل مع المدارس',MessageCircle]] as const;
  const school=schools.find(s=>s.id===schoolId), period=periods.find(p=>p.id===periodId);

  function go(key:string){setTab(key);if(key==='accounts')location.href='/admin/accounts';if(key==='print')location.href='/admin/school-print';if(key==='whatsapp')location.href='/admin/whatsapp'}

  return <div dir="rtl" className="min-h-screen bg-slate-50">
    <header className="bg-[var(--navy)] text-white"><div className="max-w-7xl mx-auto px-5 py-4 flex justify-between items-center"><div><div className="font-bold text-xl">نظام مسيرات الرواتب</div><div className="text-sm text-blue-100">لوحة مدير النظام — إدارة التعليم بمنطقة نجران</div></div><button onClick={logout} className="flex gap-2 items-center bg-white/10 px-4 py-2 rounded-xl"><LogOut size={17}/> خروج</button></div></header>
    <main className="max-w-7xl mx-auto p-5 md:p-8"><div className="grid lg:grid-cols-[230px_1fr] gap-6">
      <aside className="card p-3 h-fit">{nav.map(([key,label,Icon])=><button key={key} type="button" onClick={()=>go(key)} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-right mb-1 ${tab===key?'bg-[var(--navy)] text-white':'hover:bg-slate-100'}`}><Icon size={18}/>{label}</button>)}</aside>
      <section className="space-y-5">
        {message&&<div className="bg-green-50 text-green-800 border border-green-100 rounded-xl px-4 py-3">{message}</div>}
        {error&&<div className="bg-red-50 text-red-800 border border-red-100 rounded-xl px-4 py-3">{error}</div>}

        {tab==='overview'&&<><h1 className="text-2xl font-bold">لوحة التحكم</h1><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="card p-5"><Building2/><b className="block text-3xl mt-3">{schools.length}</b><span className="text-gray-500">إجمالي المدارس</span></div><div className="card p-5"><Users/><b className="block text-3xl mt-3">{teachers.filter(x=>x.is_active).length}</b><span className="text-gray-500">الموظفون النشطون</span></div><div className="card p-5"><CalendarDays/><b className="block text-3xl mt-3">{periods.length}</b><span className="text-gray-500">فترات المسيرات</span></div><div className="card p-5"><CheckCircle2/><b className="block text-3xl mt-3">{records.length}</b><span className="text-gray-500">سجلات الفترة المحددة</span></div></div><div className="grid md:grid-cols-2 gap-4"><button onClick={()=>setTab('schools')} className="card p-5 text-right hover:border-emerald-300"><Plus className="mb-2"/><b>إضافة مدرسة جديدة</b><p className="text-sm text-gray-500 mt-1">إضافة المدرسة ثم تفعيل حسابها وإسناد الموظفين.</p></button><button onClick={()=>setTab('teachers')} className="card p-5 text-right hover:border-emerald-300"><UserPlus className="mb-2"/><b>إضافة موظفين للمدرسة</b><p className="text-sm text-gray-500 mt-1">إضافة الموظف واختيار المدرسة المسند إليها.</p></button></div></>}

        {tab==='schools'&&<div className="space-y-5"><div className="card p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5"><div><h1 className="text-2xl font-bold">إدارة المدارس</h1><p className="text-sm text-gray-500 mt-1">أضف المدارس يدويًا أو استوردها دفعة واحدة من Excel.</p></div><label className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"><FileSpreadsheet size={18}/>{importingSchools?'جاري الاستيراد…':'استيراد المدارس من Excel'}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleSchoolsExcel} disabled={busy} className="hidden"/></label></div><div className="bg-slate-50 border rounded-xl p-4 text-sm text-gray-600"><b className="text-gray-800">تنسيق الملف:</b> استخدم أعمدة <span className="font-semibold">رمز المدرسة</span> و<span className="font-semibold">اسم المدرسة</span>، ويمكن إضافة <span className="font-semibold">مدير المدرسة</span>. يتم منع التكرار اعتمادًا على رمز المدرسة.</div><div className="grid md:grid-cols-3 gap-4"><label><span className="block text-sm font-semibold mb-2">رمز المدرسة</span><input value={schoolForm.school_code} onChange={e=>setSchoolForm({...schoolForm,school_code:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 101"/></label><label><span className="block text-sm font-semibold mb-2">اسم المدرسة</span><input value={schoolForm.school_name} onChange={e=>setSchoolForm({...schoolForm,school_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم المدرسة"/></label><label><span className="block text-sm font-semibold mb-2">اسم قائد/مدير المدرسة</span><input value={schoolForm.manager_name} onChange={e=>setSchoolForm({...schoolForm,manager_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اختياري"/></label></div><button disabled={busy} onClick={addSchool} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><Plus size={18}/> إضافة المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>المدارس المسجلة ({schools.length})</b></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الرمز</th><th className="p-3 text-right">اسم المدرسة</th><th className="p-3 text-right">مدير المدرسة</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">إجراء</th></tr></thead><tbody>{schools.map(s=>editingSchoolId===s.id?<tr className="border-t bg-blue-50/50" key={s.id}><td className="p-3"><input value={schoolEditForm.school_code} onChange={e=>setSchoolEditForm({...schoolEditForm,school_code:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={schoolEditForm.school_name} onChange={e=>setSchoolEditForm({...schoolEditForm,school_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={schoolEditForm.manager_name} onChange={e=>setSchoolEditForm({...schoolEditForm,manager_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3">{s.is_active?'نشطة':'موقوفة'}</td><td className="p-3"><div className="flex gap-2"><button disabled={busy} onClick={()=>updateSchool(s.id)} className="bg-[var(--navy)] text-white rounded-lg px-3 py-2">حفظ</button><button disabled={busy} onClick={cancelSchoolEdit} className="border rounded-lg px-3 py-2">إلغاء</button></div></td></tr>:<tr className="border-t" key={s.id}><td className="p-3">{s.school_code}</td><td className="p-3 font-semibold">{s.school_name}</td><td className="p-3">{s.manager_name||'—'}</td><td className="p-3">{s.is_active?'نشطة':'موقوفة'}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>startSchoolEdit(s)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>toggleSchool(s)} className="border rounded-lg px-3 py-2 inline-flex items-center gap-1"><Power size={15}/>{s.is_active?'إيقاف':'تفعيل'}</button><button disabled={busy} onClick={()=>deleteSchool(s)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>)}</tbody></table></div></div></div>}

        {tab==='teachers'&&<div className="space-y-5"><div className="card p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5"><div><h1 className="text-2xl font-bold">إضافة وإسناد الموظفين</h1><p className="text-sm text-gray-500 mt-1">يمكنك الإضافة يدويًا أو استيراد الموظفين من Excel وربطهم بالمدرسة.</p></div><label className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"><FileSpreadsheet size={18}/>{importingTeachers?"جاري الاستيراد…":"استيراد الموظفين من Excel"}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleTeachersExcel} disabled={busy} className="hidden"/></label></div><div className="bg-slate-50 border rounded-xl p-4 text-sm text-gray-600 mb-5"><b className="text-gray-800">تنسيق الملف:</b> الأعمدة المطلوبة: <span className="font-semibold">المدرسة، الاسم، رقم الهوية/السجل المدني</span>. ويمكن إضافة <span className="font-semibold">الوظيفة والتخصص</span>. يجب أن تكون المدرسة مسجلة في النظام، ويتم التحديث تلقائيًا عند وجود نفس رقم الهوية.</div><div className="grid md:grid-cols-2 gap-4"><label><span className="block text-sm font-semibold mb-2">المدرسة</span><select value={teacherForm.school_id} onChange={e=>setTeacherForm({...teacherForm,school_id:e.target.value})} className="border rounded-xl px-4 py-3 w-full"><option value="">اختر المدرسة</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_name} — {s.school_code}</option>)}</select></label><label><span className="block text-sm font-semibold mb-2">اسم الموظف</span><input value={teacherForm.full_name} onChange={e=>setTeacherForm({...teacherForm,full_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="الاسم رباعيًا"/></label><label><span className="block text-sm font-semibold mb-2">رقم الهوية / السجل المدني</span><input value={teacherForm.national_id} onChange={e=>setTeacherForm({...teacherForm,national_id:e.target.value.replace(/\D/g,'').slice(0,10)})} className="border rounded-xl px-4 py-3 w-full" inputMode="numeric" maxLength={10} placeholder="10 أرقام"/></label><label><span className="block text-sm font-semibold mb-2">الوظيفة</span><select value={teacherForm.job_role} onChange={e=>setTeacherForm({...teacherForm,job_role:e.target.value})} className="border rounded-xl px-4 py-3 w-full">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label className="md:col-span-2"><span className="block text-sm font-semibold mb-2">التخصص</span><input value={teacherForm.specialization} onChange={e=>setTeacherForm({...teacherForm,specialization:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="التخصص — اختياري"/></label></div><button disabled={busy} onClick={addTeacher} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><UserPlus size={18}/> إضافة الموظف وإسناده</button></div><div className="card overflow-hidden"><div className="p-5 border-b flex justify-between items-center"><b>الموظفون وإسنادهم للمدارس</b><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-3 py-2"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الهوية</th><th className="p-3 text-right">الوظيفة</th><th className="p-3 text-right">التخصص</th><th className="p-3 text-right">المدرسة المسند إليها</th></tr></thead><tbody>{teachers.filter(t=>!schoolId||t.school_id===schoolId).map(t=>editingTeacherId===t.id?<tr className="border-t bg-blue-50/50" key={t.id}><td className="p-3"><input value={teacherEditForm.full_name} onChange={e=>setTeacherEditForm({...teacherEditForm,full_name:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><input value={teacherEditForm.national_id} onChange={e=>setTeacherEditForm({...teacherEditForm,national_id:e.target.value.replace(/\\D/g,'').slice(0,10)})} maxLength={10} inputMode="numeric" className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><select value={teacherEditForm.job_role} onChange={e=>setTeacherEditForm({...teacherEditForm,job_role:e.target.value})} className="border rounded-lg px-3 py-2 w-full">{roles.map(r=><option key={r}>{r}</option>)}</select></td><td className="p-3"><input value={teacherEditForm.specialization} onChange={e=>setTeacherEditForm({...teacherEditForm,specialization:e.target.value})} className="border rounded-lg px-3 py-2 w-full"/></td><td className="p-3"><select value={teacherEditForm.school_id} onChange={e=>setTeacherEditForm({...teacherEditForm,school_id:e.target.value})} className="border rounded-lg px-3 py-2 w-full">{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><div className="flex gap-2 mt-2"><button disabled={busy} onClick={()=>updateTeacher(t.id)} className="bg-[var(--navy)] text-white rounded-lg px-3 py-2">حفظ</button><button disabled={busy} onClick={cancelTeacherEdit} className="border rounded-lg px-3 py-2">إلغاء</button><button disabled={busy} onClick={()=>deleteTeacher(t)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>:<tr className="border-t" key={t.id}><td className="p-3 font-semibold">{t.full_name}</td><td className="p-3">{t.national_id}</td><td className="p-3">{t.job_role}</td><td className="p-3">{t.specialization||'—'}</td><td className="p-3"><div className="flex flex-wrap gap-2 items-center"><select disabled={busy} value={t.school_id} onChange={e=>moveTeacher(t,e.target.value)} className="border rounded-lg px-3 py-2">{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button disabled={busy} onClick={()=>startTeacherEdit(t)} className="border rounded-lg px-3 py-2">تعديل</button><button disabled={busy} onClick={()=>deleteTeacher(t)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2">حذف</button></div></td></tr>)}</tbody></table></div></div></div>}

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
  <div className="card p-6"><h2 className="text-xl font-bold mb-2">فترات المسيرات</h2><p className="text-sm text-gray-500 mb-5">داخل التاريخ المحدد تكون الفترة مفتوحة، وخارجها مغلقة تلقائيًا.</p>{periods.map(p=>{const open=periodIsOpen(p);const sh=p.start_hijri||gregorianToHijri(p.start_date);const eh=p.end_hijri||gregorianToHijri(p.end_date);return <div key={p.id} className="border rounded-xl p-4 mb-3"><div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3"><div><b>{p.period_name}</b><div className="text-sm text-gray-600 mt-1">فتح: {sh} — إغلاق: {eh}</div><div className="mt-2 text-sm"><span className={open?'text-green-700':'text-amber-700'}>{open?'مفتوح للتعبئة':'مغلق'}</span> — {p.auto_open_close?'تلقائي حسب التاريخ الهجري':'تحكم يدوي'}</div></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>editPeriodDates(p)} className="border rounded-lg px-4 py-2">تعديل التواريخ</button><button disabled={busy||!!p.auto_open_close} onClick={()=>periodState(p)} className="border rounded-lg px-4 py-2 disabled:opacity-50">{p.is_open&&p.allow_edit?'إغلاق يدوي':'فتح يدوي'}</button></div></div></div>})}</div>
</div>}

        {tab==='payroll'&&<div className="space-y-5"><div className="card p-5 grid md:grid-cols-3 gap-3"><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">اختر الفترة</option>{periods.map(p=><option key={p.id} value={p.id}>{p.period_name}</option>)}</select><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button disabled={busy||!schoolId||!periodId} onClick={generate} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold">تجهيز مسير المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>{school?.school_name||'كل المدارس'}</b> — {period?.period_name||''}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">تاريخ المباشرة</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{records.map(r=>{const t=teachers.find(x=>x.id===r.teacher_id),s=schools.find(x=>x.id===r.school_id);return <tr className="border-t" key={r.id}><td className="p-3">{t?.full_name||'—'}</td><td className="p-3">{s?.school_name||'—'}</td><td className="p-3">{r.direct_start_date||'—'}</td><td className="p-3"><select value={r.status} disabled={busy} onChange={e=>status(r.id,e.target.value)} className="border rounded-lg px-2 py-1"><option>لم يبدأ</option><option>مفتوح للتعبئة</option><option>تم الحفظ</option><option>تم الاعتماد</option><option>مغلق</option></select></td></tr>})}</tbody></table></div></div></div>}
      </section>
    </div></main>
  </div>;
}
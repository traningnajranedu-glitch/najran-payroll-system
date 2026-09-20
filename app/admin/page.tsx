'use client';

import { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, CheckCircle2, ShieldCheck, LogOut, Printer, MessageCircle, Plus, UserPlus, Power, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name?: string | null };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null; is_active: boolean };
type Period = { id: string; period_name: string; start_date: string; end_date: string; is_open: boolean; allow_edit: boolean };
type RecordRow = { id: string; school_id: string; teacher_id: string; status: string; direct_start_date: string | null; notes: string | null };

const roles = ['مدير','معلم','إداري','مستخدم','حارس'];

export default function AdminPage() {
  const sb = supabaseBrowser();
  const [loading,setLoading]=useState(true), [allowed,setAllowed]=useState(false);
  const [tab,setTab]=useState('overview'), [schools,setSchools]=useState<School[]>([]), [teachers,setTeachers]=useState<Teacher[]>([]), [periods,setPeriods]=useState<Period[]>([]), [records,setRecords]=useState<RecordRow[]>([]);
  const [schoolId,setSchoolId]=useState(''), [periodId,setPeriodId]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [schoolForm,setSchoolForm]=useState({school_code:'',school_name:'',manager_name:''});
  const [teacherForm,setTeacherForm]=useState({school_id:'',full_name:'',national_id:'',job_role:'معلم',specialization:''});
  const [importingSchools,setImportingSchools]=useState(false);

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
    return cleanExcelValue(value).toLowerCase().replace(/[\\s_\\-./\\\\]+/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
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
  async function toggleSchool(s:School){
    setBusy(true);setError('');
    const {error}=await sb.from('schools').update({is_active:!s.is_active}).eq('id',s.id);
    if(error)setError('تعذر تغيير حالة المدرسة: '+error.message);else{setMessage(s.is_active?'تم إيقاف المدرسة.':'تم تفعيل المدرسة.');await load();}
    setBusy(false);
  }

  async function addTeacher(){
    setMessage('');setError('');
    if(!teacherForm.school_id||!teacherForm.full_name.trim()||!/^\d{10}$/.test(teacherForm.national_id.trim())){setError('اختر المدرسة وأدخل اسم الموظف ورقم هوية/سجل مدني من 10 أرقام.');return;}
    setBusy(true);
    const {error}=await sb.from('teachers').insert({school_id:teacherForm.school_id,full_name:teacherForm.full_name.trim(),national_id:teacherForm.national_id.trim(),job_role:teacherForm.job_role,specialization:teacherForm.specialization.trim()||null,is_active:true});
    if(error)setError('تعذر إضافة الموظف: '+error.message);else{setMessage('تمت إضافة الموظف وإسناده للمدرسة بنجاح.');setTeacherForm(x=>({...x,full_name:'',national_id:'',specialization:''}));await load();}
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
  async function periodState(p:Period){setBusy(true);const open=!(p.is_open&&p.allow_edit);const {error}=await sb.rpc('set_period_state',{p_period_id:p.id,p_is_open:open,p_allow_edit:open});if(error)setError(error.message);else load();setBusy(false)}

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

        {tab==='schools'&&<div className="space-y-5"><div className="card p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5"><div><h1 className="text-2xl font-bold">إدارة المدارس</h1><p className="text-sm text-gray-500 mt-1">أضف المدارس يدويًا أو استوردها دفعة واحدة من Excel.</p></div><label className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-90"><FileSpreadsheet size={18}/>{importingSchools?'جاري الاستيراد…':'استيراد المدارس من Excel'}<input type="file" accept=".xlsx,.xls,.csv" onChange={handleSchoolsExcel} disabled={busy} className="hidden"/></label></div><div className="bg-slate-50 border rounded-xl p-4 text-sm text-gray-600"><b className="text-gray-800">تنسيق الملف:</b> استخدم أعمدة <span className="font-semibold">رمز المدرسة</span> و<span className="font-semibold">اسم المدرسة</span>، ويمكن إضافة <span className="font-semibold">مدير المدرسة</span>. يتم منع التكرار اعتمادًا على رمز المدرسة.</div><div className="grid md:grid-cols-3 gap-4"><label><span className="block text-sm font-semibold mb-2">رمز المدرسة</span><input value={schoolForm.school_code} onChange={e=>setSchoolForm({...schoolForm,school_code:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 101"/></label><label><span className="block text-sm font-semibold mb-2">اسم المدرسة</span><input value={schoolForm.school_name} onChange={e=>setSchoolForm({...schoolForm,school_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم المدرسة"/></label><label><span className="block text-sm font-semibold mb-2">اسم قائد/مدير المدرسة</span><input value={schoolForm.manager_name} onChange={e=>setSchoolForm({...schoolForm,manager_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اختياري"/></label></div><button disabled={busy} onClick={addSchool} className="mt-4 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><Plus size={18}/> إضافة المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>المدارس المسجلة ({schools.length})</b></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الرمز</th><th className="p-3 text-right">اسم المدرسة</th><th className="p-3 text-right">مدير المدرسة</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">إجراء</th></tr></thead><tbody>{schools.map(s=><tr className="border-t" key={s.id}><td className="p-3">{s.school_code}</td><td className="p-3 font-semibold">{s.school_name}</td><td className="p-3">{s.manager_name||'—'}</td><td className="p-3">{s.is_active?'نشطة':'موقوفة'}</td><td className="p-3"><button disabled={busy} onClick={()=>toggleSchool(s)} className="border rounded-lg px-3 py-2 inline-flex items-center gap-1"><Power size={15}/>{s.is_active?'إيقاف':'تفعيل'}</button></td></tr>)}</tbody></table></div></div></div>}

        {tab==='teachers'&&<div className="space-y-5"><div className="card p-6"><h1 className="text-2xl font-bold mb-5">إضافة وإسناد الموظفين</h1><div className="grid md:grid-cols-2 gap-4"><label><span className="block text-sm font-semibold mb-2">المدرسة</span><select value={teacherForm.school_id} onChange={e=>setTeacherForm({...teacherForm,school_id:e.target.value})} className="border rounded-xl px-4 py-3 w-full"><option value="">اختر المدرسة</option>{schools.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.school_name} — {s.school_code}</option>)}</select></label><label><span className="block text-sm font-semibold mb-2">اسم الموظف</span><input value={teacherForm.full_name} onChange={e=>setTeacherForm({...teacherForm,full_name:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="الاسم رباعيًا"/></label><label><span className="block text-sm font-semibold mb-2">رقم الهوية / السجل المدني</span><input value={teacherForm.national_id} onChange={e=>setTeacherForm({...teacherForm,national_id:e.target.value.replace(/\D/g,'').slice(0,10)})} className="border rounded-xl px-4 py-3 w-full" inputMode="numeric" maxLength={10} placeholder="10 أرقام"/></label><label><span className="block text-sm font-semibold mb-2">الوظيفة</span><select value={teacherForm.job_role} onChange={e=>setTeacherForm({...teacherForm,job_role:e.target.value})} className="border rounded-xl px-4 py-3 w-full">{roles.map(r=><option key={r}>{r}</option>)}</select></label><label className="md:col-span-2"><span className="block text-sm font-semibold mb-2">التخصص</span><input value={teacherForm.specialization} onChange={e=>setTeacherForm({...teacherForm,specialization:e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="التخصص — اختياري"/></label></div><button disabled={busy} onClick={addTeacher} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold inline-flex items-center gap-2 disabled:opacity-50"><UserPlus size={18}/> إضافة الموظف وإسناده</button></div><div className="card overflow-hidden"><div className="p-5 border-b flex justify-between items-center"><b>الموظفون وإسنادهم للمدارس</b><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-3 py-2"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الهوية</th><th className="p-3 text-right">الوظيفة</th><th className="p-3 text-right">التخصص</th><th className="p-3 text-right">المدرسة المسند إليها</th></tr></thead><tbody>{teachers.filter(t=>!schoolId||t.school_id===schoolId).map(t=><tr className="border-t" key={t.id}><td className="p-3 font-semibold">{t.full_name}</td><td className="p-3">{t.national_id}</td><td className="p-3">{t.job_role}</td><td className="p-3">{t.specialization||'—'}</td><td className="p-3"><select disabled={busy} value={t.school_id} onChange={e=>moveTeacher(t,e.target.value)} className="border rounded-lg px-3 py-2">{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></td></tr>)}</tbody></table></div></div></div>}

        {tab==='periods'&&<div className="card p-6"><h1 className="text-2xl font-bold mb-5">فترات المسيرات</h1>{periods.map(p=><div key={p.id} className="border rounded-xl p-4 mb-3 flex justify-between items-center"><div><b>{p.period_name}</b><div className="text-sm text-gray-500">{p.start_date} إلى {p.end_date}</div></div><button disabled={busy} onClick={()=>periodState(p)} className="border rounded-lg px-4 py-2">{p.is_open&&p.allow_edit?'إغلاق الفترة':'فتح للتعبئة'}</button></div>)}</div>}

        {tab==='payroll'&&<div className="space-y-5"><div className="card p-5 grid md:grid-cols-3 gap-3"><select value={periodId} onChange={e=>setPeriodId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">اختر الفترة</option>{periods.map(p=><option key={p.id} value={p.id}>{p.period_name}</option>)}</select><select value={schoolId} onChange={e=>setSchoolId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">كل المدارس</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button disabled={busy||!schoolId||!periodId} onClick={generate} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold">تجهيز مسير المدرسة</button></div><div className="card overflow-hidden"><div className="p-5 border-b"><b>{school?.school_name||'كل المدارس'}</b> — {period?.period_name||''}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">تاريخ المباشرة</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{records.map(r=>{const t=teachers.find(x=>x.id===r.teacher_id),s=schools.find(x=>x.id===r.school_id);return <tr className="border-t" key={r.id}><td className="p-3">{t?.full_name||'—'}</td><td className="p-3">{s?.school_name||'—'}</td><td className="p-3">{r.direct_start_date||'—'}</td><td className="p-3"><select value={r.status} disabled={busy} onChange={e=>status(r.id,e.target.value)} className="border rounded-lg px-2 py-1"><option>لم يبدأ</option><option>مفتوح للتعبئة</option><option>تم الحفظ</option><option>تم الاعتماد</option><option>مغلق</option></select></td></tr>})}</tbody></table></div></div></div>}
      </section>
    </div></main>
  </div>;
}

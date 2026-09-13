'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  CalendarDays,
  Plus,
  Lock,
  Unlock,
  CheckCircle2,
  Printer,
  RefreshCw,
  LogOut,
  Search,
  Trash2,
} from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null; is_active: boolean };
type Period = { id: string; period_name: string; start_date: string; end_date: string; is_open: boolean; allow_edit: boolean };
type RecordRow = { id: string; school_id: string; teacher_id: string; status: string; direct_start_date: string | null; notes: string | null };

const roles = ['مدير', 'معلم', 'إداري', 'مستخدم', 'حارس'];

export default function AdminPage() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [tab, setTab] = useState<'overview' | 'schools' | 'teachers' | 'periods' | 'payroll'>('overview');
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ school_code: '', school_name: '' });
  const [teacherForm, setTeacherForm] = useState({ full_name: '', national_id: '', job_role: 'معلم', specialization: '' });
  const [periodForm, setPeriodForm] = useState({ period_name: '', start_date: '', end_date: '' });

  async function loadAll() {
    setLoading(true);
    setMessage('');
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }
    const { data: admin } = await sb.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) { setAllowed(false); setLoading(false); return; }
    setAllowed(true);
    const [s, t, p] = await Promise.all([
      sb.from('schools').select('*').order('school_name'),
      sb.from('teachers').select('*').order('full_name'),
      sb.from('payroll_periods').select('*').order('start_date', { ascending: false }),
    ]);
    if (s.error) setMessage(s.error.message);
    setSchools(s.data || []);
    setTeachers(t.data || []);
    setPeriods(p.data || []);
    if (!selectedSchool && s.data?.[0]) setSelectedSchool(s.data[0].id);
    if (!selectedPeriod && p.data?.[0]) setSelectedPeriod(p.data[0].id);
    setLoading(false);
  }

  async function loadRecords(periodId = selectedPeriod, schoolId = selectedSchool) {
    if (!periodId) return;
    let q = sb.from('payroll_records').select('*').eq('period_id', periodId);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) setMessage(error.message); else setRecords(data || []);
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (allowed) loadRecords(); }, [allowed, selectedPeriod, selectedSchool]);

  const schoolTeachers = useMemo(() => teachers.filter(t => t.school_id === selectedSchool), [teachers, selectedSchool]);
  const filteredSchools = schools.filter(s => `${s.school_name} ${s.school_code}`.includes(search.trim()));
  const selectedSchoolName = schools.find(s => s.id === selectedSchool)?.school_name || '';
  const selectedPeriodName = periods.find(p => p.id === selectedPeriod)?.period_name || '';

  async function addSchool() {
    const code = schoolForm.school_code.trim();
    const name = schoolForm.school_name.trim();
    if (!code || !name) {
      setMessage('يرجى إدخال رمز المدرسة واسم المدرسة أولاً.');
      return;
    }
    setBusy(true); setMessage('جاري إضافة المدرسة…');
    const { error } = await sb.from('schools').insert({ school_code: code, school_name: name, is_active: true });
    if (error) {
      setMessage('تعذر إضافة المدرسة: ' + error.message);
    } else {
      setMessage('تمت إضافة المدرسة بنجاح.');
      setSchoolForm({ school_code: '', school_name: '' });
      await loadAll();
    }
    setBusy(false);
  }

  async function addTeacher() {
    if (!selectedSchool || !teacherForm.full_name || !/^\d{10}$/.test(teacherForm.national_id)) {
      setMessage('أدخل المدرسة والاسم ورقم هوية مكوّنًا من 10 أرقام.'); return;
    }
    setBusy(true); setMessage('');
    const { error } = await sb.from('teachers').insert({ school_id: selectedSchool, ...teacherForm, specialization: teacherForm.specialization || null, is_active: true });
    if (error) setMessage('تعذر إضافة الموظف: ' + error.message);
    else { setMessage('تمت إضافة الموظف.'); setTeacherForm({ full_name: '', national_id: '', job_role: 'معلم', specialization: '' }); await loadAll(); }
    setBusy(false);
  }

  async function addPeriod() {
    if (!periodForm.period_name || !periodForm.start_date || !periodForm.end_date) return;
    setBusy(true); setMessage('');
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('payroll_periods').insert({ ...periodForm, is_open: false, allow_edit: false, created_by: user?.id });
    if (error) setMessage('تعذر إنشاء الفترة: ' + error.message);
    else { setMessage('تم إنشاء الفترة.'); setPeriodForm({ period_name: '', start_date: '', end_date: '' }); await loadAll(); }
    setBusy(false);
  }

  async function generateForSchool() {
    if (!selectedSchool || !selectedPeriod) return;
    setBusy(true); setMessage('');
    const { error } = await sb.rpc('generate_school_payroll', { p_school_id: selectedSchool, p_period_id: selectedPeriod });
    if (error) setMessage('تعذر إنشاء سجلات المسير: ' + error.message);
    else { setMessage('تم تجهيز مسير المدرسة للفترة.'); await loadRecords(); }
    setBusy(false);
  }

  async function setPeriodState(period: Period, open: boolean, edit: boolean) {
    setBusy(true); setMessage('');
    const { error } = await sb.rpc('set_period_state', { p_period_id: period.id, p_is_open: open, p_allow_edit: edit });
    if (error) setMessage('تعذر تغيير حالة الفترة: ' + error.message);
    else { setMessage(open ? 'تم فتح الفترة.' : 'تم إغلاق الفترة.'); await loadAll(); }
    setBusy(false);
  }

  async function setRecordStatus(recordId: string, status: string) {
    setBusy(true);
    const { error } = await sb.rpc('set_payroll_status', { p_record_id: recordId, p_status: status });
    if (error) setMessage('تعذر تغيير الحالة: ' + error.message); else await loadRecords();
    setBusy(false);
  }

  async function toggleSchool(s: School) {
    setBusy(true);
    const { error } = await sb.from('schools').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) setMessage(error.message); else await loadAll();
    setBusy(false);
  }

  async function deleteTeacher(id: string) {
    if (!confirm('هل تريد حذف الموظف من المدرسة؟')) return;
    setBusy(true);
    const { error } = await sb.from('teachers').update({ is_active: false }).eq('id', id);
    if (error) setMessage(error.message); else await loadAll();
    setBusy(false);
  }

  async function logout() { await sb.auth.signOut(); location.href = '/'; }

  function printPayroll() { window.print(); }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل لوحة الإدارة…</div></main>;
  if (!allowed) return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">هذا القسم مخصص لمدير النظام.</p><button onClick={() => location.href = '/'} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-5 py-3">العودة للدخول</button></div></main>;

  const nav = [
    ['overview', 'نظرة عامة', Building2],
    ['schools', 'المدارس', Building2],
    ['teachers', 'الموظفون', Users],
    ['periods', 'فترات المسيرات', CalendarDays],
    ['payroll', 'إدارة المسيرات', CheckCircle2],
  ] as const;

  return <div className="min-h-screen bg-slate-50 print:bg-white">
    <header className="bg-[var(--navy)] text-white print:hidden">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div><div className="font-bold text-xl">نظام مسيرات الرواتب</div><div className="text-sm text-blue-100 mt-1">لوحة مدير النظام — إدارة التعليم بمنطقة نجران</div></div>
        <button type="button" onClick={logout} className="flex gap-2 items-center bg-white/10 px-4 py-2 rounded-xl"><LogOut size={17}/> خروج</button>
      </div>
    </header>

    <main className="max-w-7xl mx-auto p-5 md:p-8">
      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <aside className="card p-3 h-fit print:hidden">
          {nav.map(([key, label, Icon]) => <button type="button" key={key} onClick={() => setTab(key)} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-right mb-1 ${tab === key ? 'bg-[var(--navy)] text-white' : 'hover:bg-slate-100'}`}><Icon size={18}/>{label}</button>)}
        </aside>

        <section className="space-y-6">
          {message && <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-4 py-3 text-sm print:hidden">{message}</div>}

          {tab === 'overview' && <>
            <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">لوحة التحكم</h1><p className="text-gray-500 mt-1">إدارة المدارس والموظفين وفترات المسيرات.</p></div><button type="button" onClick={loadAll} className="border bg-white rounded-xl p-3 print:hidden"><RefreshCw size={18}/></button></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5"><Building2/><div className="text-3xl font-bold mt-3">{schools.length}</div><div className="text-gray-500">إجمالي المدارس</div></div>
              <div className="card p-5"><Users/><div className="text-3xl font-bold mt-3">{teachers.filter(t => t.is_active).length}</div><div className="text-gray-500">الموظفون النشطون</div></div>
              <div className="card p-5"><CalendarDays/><div className="text-3xl font-bold mt-3">{periods.length}</div><div className="text-gray-500">فترات المسيرات</div></div>
              <div className="card p-5"><Unlock/><div className="text-3xl font-bold mt-3">{periods.filter(p => p.is_open).length}</div><div className="text-gray-500">فترات مفتوحة</div></div>
            </div>
            <div className="card p-6"><h2 className="font-bold text-lg mb-4">اختصار إدارة المسير</h2><div className="grid md:grid-cols-3 gap-3"><button type="button" onClick={() => setTab('schools')} className="border rounded-xl p-4 text-right hover:bg-slate-50">إضافة مدرسة جديدة</button><button type="button" onClick={() => setTab('teachers')} className="border rounded-xl p-4 text-right hover:bg-slate-50">إضافة موظفين للمدرسة</button><button type="button" onClick={() => setTab('periods')} className="border rounded-xl p-4 text-right hover:bg-slate-50">إنشاء فترة مسير جديدة</button></div></div>
          </>}

          {tab === 'schools' && <div className="space-y-5">
            <div><h1 className="text-2xl font-bold">إدارة المدارس</h1><p className="text-gray-500 mt-1">إضافة المدارس وتفعيلها أو إيقافها.</p></div>
            <div className="card p-5 print:hidden">
              <h2 className="font-bold text-lg mb-4">إضافة مدرسة جديدة</h2>
              <div className="grid md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
                <label className="block"><span className="block text-sm font-semibold mb-2">رمز المدرسة</span><input value={schoolForm.school_code} onChange={e => setSchoolForm({...schoolForm, school_code: e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="مثال: 101001" /></label>
                <label className="block"><span className="block text-sm font-semibold mb-2">اسم المدرسة</span><input value={schoolForm.school_name} onChange={e => setSchoolForm({...schoolForm, school_name: e.target.value})} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم المدرسة" /></label>
                <button type="button" disabled={busy} onClick={addSchool} className="bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold flex justify-center items-center gap-2 min-h-[50px] disabled:opacity-50"><Plus size={18}/> {busy ? 'جاري الحفظ…' : 'إضافة مدرسة'}</button>
              </div>
              <p className="text-xs text-gray-500 mt-3">أدخل رمز المدرسة واسمها ثم اضغط «إضافة مدرسة».</p>
            </div>
            <div className="card overflow-hidden"><div className="p-4 border-b flex gap-3 print:hidden"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} className="outline-none flex-1" placeholder="بحث باسم المدرسة أو الرمز"/></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الرمز</th><th className="p-4 text-right">اسم المدرسة</th><th className="p-4 text-right">الموظفون</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right print:hidden">إجراء</th></tr></thead><tbody>{filteredSchools.map(s => <tr key={s.id} className="border-t"><td className="p-4">{s.school_code}</td><td className="p-4 font-semibold">{s.school_name}</td><td className="p-4">{teachers.filter(t => t.school_id === s.id && t.is_active).length}</td><td className="p-4"><span className={`px-3 py-1 rounded-full text-xs ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.is_active ? 'نشطة' : 'موقوفة'}</span></td><td className="p-4 print:hidden"><button type="button" onClick={() => toggleSchool(s)} className="border rounded-lg px-3 py-2">{s.is_active ? 'إيقاف' : 'تفعيل'}</button></td></tr>)}</tbody></table></div></div>
          </div>}

          {tab === 'teachers' && <div className="space-y-5">
            <div><h1 className="text-2xl font-bold">إدارة الموظفين</h1><p className="text-gray-500 mt-1">إضافة الموظفين وربطهم بالمدرسة.</p></div>
            <div className="card p-5 grid md:grid-cols-2 lg:grid-cols-5 gap-3 print:hidden"><select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} className="border rounded-xl px-4 py-3 lg:col-span-2"><option value="">اختر المدرسة</option>{schools.map(s => <option key={s.id} value={s.id}>{s.school_name}</option>)}</select><input value={teacherForm.full_name} onChange={e => setTeacherForm({...teacherForm, full_name: e.target.value})} className="border rounded-xl px-4 py-3" placeholder="اسم الموظف"/><input maxLength={10} value={teacherForm.national_id} onChange={e => setTeacherForm({...teacherForm, national_id: e.target.value.replace(/\D/g, '').slice(0,10)})} className="border rounded-xl px-4 py-3" placeholder="رقم الهوية 10 أرقام"/><select value={teacherForm.job_role} onChange={e => setTeacherForm({...teacherForm, job_role: e.target.value})} className="border rounded-xl px-4 py-3">{roles.map(r => <option key={r}>{r}</option>)}</select><input value={teacherForm.specialization} onChange={e => setTeacherForm({...teacherForm, specialization: e.target.value})} className="border rounded-xl px-4 py-3" placeholder="التخصص"/><button type="button" disabled={busy} onClick={addTeacher} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold flex justify-center gap-2 lg:col-span-5"><Plus size={18}/> إضافة الموظف</button></div>
            <div className="card overflow-hidden"><div className="p-4 border-b font-bold">{selectedSchoolName || 'اختر مدرسة'} — {schoolTeachers.filter(t => t.is_active).length} موظف</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الاسم</th><th className="p-4 text-right">الهوية</th><th className="p-4 text-right">الوظيفة</th><th className="p-4 text-right">التخصص</th><th className="p-4 text-right print:hidden">إجراء</th></tr></thead><tbody>{schoolTeachers.filter(t => t.is_active).map(t => <tr key={t.id} className="border-t"><td className="p-4 font-semibold">{t.full_name}</td><td className="p-4">{t.national_id}</td><td className="p-4">{t.job_role}</td><td className="p-4">{t.specialization || '—'}</td><td className="p-4 print:hidden"><button type="button" onClick={() => deleteTeacher(t.id)} className="text-red-600"><Trash2 size={18}/></button></td></tr>)}</tbody></table></div></div>
          </div>}

          {tab === 'periods' && <div className="space-y-5">
            <div><h1 className="text-2xl font-bold">فترات المسيرات</h1><p className="text-gray-500 mt-1">إنشاء الفترات والتحكم في فتح وإغلاق التعبئة.</p></div>
            <div className="card p-5 grid md:grid-cols-4 gap-3 print:hidden"><input value={periodForm.period_name} onChange={e => setPeriodForm({...periodForm, period_name: e.target.value})} className="border rounded-xl px-4 py-3" placeholder="اسم الفترة: مسير سبتمبر 2026"/><input type="date" value={periodForm.start_date} onChange={e => setPeriodForm({...periodForm, start_date: e.target.value})} className="border rounded-xl px-4 py-3"/><input type="date" value={periodForm.end_date} onChange={e => setPeriodForm({...periodForm, end_date: e.target.value})} className="border rounded-xl px-4 py-3"/><button type="button" disabled={busy} onClick={addPeriod} className="bg-[var(--navy)] text-white rounded-xl font-bold flex justify-center items-center gap-2"><Plus size={18}/> إنشاء الفترة</button></div>
            <div className="card overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الفترة</th><th className="p-4 text-right">من</th><th className="p-4 text-right">إلى</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right print:hidden">تحكم</th></tr></thead><tbody>{periods.map(p => <tr key={p.id} className="border-t"><td className="p-4 font-semibold">{p.period_name}</td><td className="p-4">{p.start_date}</td><td className="p-4">{p.end_date}</td><td className="p-4">{p.is_open && p.allow_edit ? 'مفتوح للتعبئة' : 'مغلق'}</td><td className="p-4 print:hidden"><button type="button" onClick={() => setPeriodState(p, !(p.is_open && p.allow_edit), !(p.is_open && p.allow_edit))} className="border rounded-lg px-3 py-2 flex items-center gap-2">{p.is_open && p.allow_edit ? <><Lock size={16}/> إغلاق</> : <><Unlock size={16}/> فتح للتعبئة</>}</button></td></tr>)}</tbody></table></div>
          </div>}

          {tab === 'payroll' && <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">إدارة المسيرات</h1><p className="text-gray-500 mt-1">تجهيز المسير ومتابعة حالته واعتماده وطباعته.</p></div><button type="button" onClick={printPayroll} className="border bg-white rounded-xl px-4 py-3 flex items-center gap-2 print:hidden"><Printer size={18}/> طباعة</button></div>
            <div className="card p-5 grid md:grid-cols-3 gap-3 print:hidden"><select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">اختر الفترة</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period_name}</option>)}</select><select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">كل المدارس</option>{schools.map(s => <option key={s.id} value={s.id}>{s.school_name}</option>)}</select><button type="button" disabled={busy || !selectedSchool || !selectedPeriod} onClick={generateForSchool} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold"><Plus size={17} className="inline ml-1"/> تجهيز مسير المدرسة</button></div>
            <div className="card overflow-hidden"><div className="p-5 border-b"><h2 className="font-bold text-lg">{selectedSchoolName || 'كل المدارس'} — {selectedPeriodName}</h2><p className="text-sm text-gray-500 mt-1">عدد السجلات: {records.length}</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الموظف</th><th className="p-4 text-right">المدرسة</th><th className="p-4 text-right">تاريخ المباشرة</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right print:hidden">تغيير الحالة</th></tr></thead><tbody>{records.map(r => { const t = teachers.find(x => x.id === r.teacher_id); const s = schools.find(x => x.id === r.school_id); return <tr key={r.id} className="border-t"><td className="p-4 font-semibold">{t?.full_name || '—'}</td><td className="p-4">{s?.school_name || '—'}</td><td className="p-4">{r.direct_start_date || '—'}</td><td className="p-4"><span className="bg-gray-100 rounded-full px-3 py-1 text-xs">{r.status}</span></td><td className="p-4 print:hidden"><select value={r.status} onChange={e => setRecordStatus(r.id, e.target.value)} disabled={busy} className="border rounded-lg px-3 py-2"><option>لم يبدأ</option><option>مفتوح للتعبئة</option><option>تم الحفظ</option><option>تم الاعتماد</option><option>مغلق</option></select></td></tr>; })}</tbody></table></div></div>
            <div className="hidden print:block text-center mt-8"><h2 className="text-xl font-bold">مسير الرواتب</h2><p>{selectedSchoolName} — {selectedPeriodName}</p><p className="mt-2">تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')}</p></div>
          </div>}
        </section>
      </div>
    </main>
  </div>;
}

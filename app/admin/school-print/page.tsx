'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, Search, RefreshCw, ArrowRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name: string | null; stamp_path: string | null };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null };
type RecordRow = { id: string; school_id: string; teacher_id: string; period_id: string; status: string; direct_start_date: string | null; notes: string | null };

function gregorianToHijri(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Riyadh'
  }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')}`;
}

function hijriOrGregorian(hijri: string | null | undefined, gregorian: string | null | undefined): string {
  return hijri || gregorianToHijri(gregorian);
}

export default function SchoolPayrollPrint() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [printRows, setPrintRows] = useState<RecordRow[]>([]);
  const [printMode, setPrintMode] = useState<'all' | 'school'>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  async function load() {
    setLoading(true); setMessage('');
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }
    const { data: admin } = await sb.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) { setAllowed(false); setLoading(false); return; }
    setAllowed(true);

    const [s, t, p] = await Promise.all([
      sb.from('schools').select('*').order('school_name'),
      sb.from('teachers').select('id,school_id,full_name,national_id,job_role,specialization').eq('is_active', true).order('full_name'),
      sb.from('payroll_periods').select('*').order('start_date', { ascending: false }),
    ]);
    if (s.error || t.error || p.error) setMessage(s.error?.message || t.error?.message || p.error?.message || 'تعذر تحميل البيانات.');
    setSchools(s.data || []);
    setTeachers(t.data || []);
    setPeriods(p.data || []);
    if (!periodId && p.data?.[0]) setPeriodId(p.data[0].id);
    if (!selectedSchoolId && s.data?.[0]) setSelectedSchoolId(s.data[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => schools.filter(s => `${s.school_name} ${s.school_code}`.includes(search.trim())),
    [schools, search]
  );

  const selectedPeriod = periods.find(p => p.id === periodId) || null;
  const selectedSchool = schools.find(s => s.id === selectedSchoolId) || null;

  async function loadRows(schoolId?: string) {
    setBusy(true); setMessage('');
    let query = sb.from('payroll_records').select('id,school_id,teacher_id,period_id,status,direct_start_date,notes');
    if (periodId) query = query.eq('period_id', periodId);
    if (schoolId) query = query.eq('school_id', schoolId);
    const { data, error } = await query;
    if (error) {
      setMessage('تعذر تحميل المسيرات: ' + error.message);
      setBusy(false);
      return null;
    }
    const rows = (data || []) as RecordRow[];
    if (!rows.length) {
      setMessage('لا توجد سجلات مسيرات مطابقة للاختيار الحالي.');
      setBusy(false);
      return null;
    }
    setPrintRows(rows);
    setBusy(false);
    return rows;
  }

  async function printAll() {
    if (!periodId) return setMessage('اختر فترة المسير أولاً.');
    const rows = await loadRows();
    if (!rows) return;
    setPrintMode('all');
    setTimeout(() => window.print(), 250);
  }

  async function printSchool(school: School) {
    if (!periodId) return setMessage('اختر فترة المسير أولاً.');
    const rows = await loadRows(school.id);
    if (!rows) return;
    setSelectedSchoolId(school.id);
    setPrintMode('school');
    setTimeout(() => window.print(), 250);
  }

  function exportExcel() {
    if (!periodId) {
      setMessage('اختر فترة المسير أولاً قبل التصدير.');
      return;
    }
    setBusy(true);
    sb.from('payroll_records')
      .select('id,school_id,teacher_id,period_id,status,direct_start_date,notes')
      .eq('period_id', periodId)
      .then(({ data, error }) => {
        if (error) {
          setMessage('تعذر تصدير المسيرات: ' + error.message);
          setBusy(false);
          return;
        }
        const rows = (data || []) as RecordRow[];
        if (!rows.length) {
          setMessage('لا توجد سجلات للتصدير في الفترة المحددة.');
          setBusy(false);
          return;
        }
        const sheetRows = rows.map((r, i) => {
          const school = schools.find(s => s.id === r.school_id);
          const teacher = teachers.find(t => t.id === r.teacher_id);
          const period = periods.find(p => p.id === r.period_id);
          return {
            'م': i + 1,
            'رمز المدرسة': school?.school_code || '',
            'اسم المدرسة': school?.school_name || '',
            'فترة المسير': period?.period_name || '',
            'بداية الفترة هجري': hijriOrGregorian(period?.start_hijri, period?.start_date),
            'نهاية الفترة هجري': hijriOrGregorian(period?.end_hijri, period?.end_date),
            'اسم الموظف': teacher?.full_name || '',
            'رقم الهوية / السجل المدني': teacher?.national_id || '',
            'الوظيفة': teacher?.job_role || '',
            'التخصص': teacher?.specialization || '',
            'تاريخ المباشرة هجري': gregorianToHijri(r.direct_start_date),
            'تاريخ المباشرة ميلادي': r.direct_start_date || '',
            'الملاحظات': r.notes || '',
            'حالة المسير': r.status || ''
          };
        });
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        ws['!cols'] = [
          { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 24 },
          { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 22 },
          { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
          { wch: 32 }, { wch: 18 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'جميع المسيرات');
        const periodName = selectedPeriod?.period_name || 'المسيرات';
        XLSX.writeFile(wb, `مسيرات_الرواتب_${periodName.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`);
        setMessage('تم تصدير جميع مسيرات المدارس في ورقة Excel واحدة.');
        setBusy(false);
      });
  }

  const printRowsFiltered = useMemo(() => {
    if (printMode === 'school' && selectedSchoolId) return printRows.filter(r => r.school_id === selectedSchoolId);
    return printRows;
  }, [printRows, printMode, selectedSchoolId]);

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل نظام مسيرات الرواتب…</div></main>;
  if (!allowed) return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">صلاحية طباعة المسيرات متاحة لمدير النظام فقط.</p></div></main>;

  return <div className="min-h-screen bg-slate-50 print:bg-white" dir="rtl">
    <main className="max-w-7xl mx-auto p-5 md:p-8 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold">طباعة المسيرات</h1><p className="text-gray-500 mt-1">طباعة مسير مدرسة واحدة أو جميع مسيرات المدارس للفترة المحددة، وتصديرها في ورقة Excel واحدة.</p></div>
        <div className="flex gap-2"><button onClick={load} className="border bg-white rounded-xl p-3"><RefreshCw size={18}/></button><button onClick={() => location.href='/admin'} className="border bg-white rounded-xl px-4 py-3 flex items-center gap-2"><ArrowRight size={17}/> لوحة المدير</button></div>
      </div>
      {message && <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-4 py-3 mb-5">{message}</div>}

      <div className="card p-5 mb-5 grid lg:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center">
        <select value={periodId} onChange={e => setPeriodId(e.target.value)} className="border rounded-xl px-4 py-3">
          <option value="">اختر فترة المسير</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} — {hijriOrGregorian(p.start_hijri, p.start_date)} إلى {hijriOrGregorian(p.end_hijri, p.end_date)} هـ</option>)}
        </select>
        <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} className="border rounded-xl px-4 py-3">
          <option value="">كل المدارس</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.school_name} — {s.school_code}</option>)}
        </select>
        <div className="border rounded-xl px-4 py-3 flex items-center gap-2"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} className="outline-none flex-1" placeholder="بحث باسم المدرسة أو رمز المدرسة"/></div>
        <button disabled={busy || !periodId} onClick={exportExcel} className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50"><FileSpreadsheet size={18}/> تصدير Excel</button>
      </div>

      <div className="card p-5 mb-5 flex flex-wrap gap-3">
        <button disabled={busy || !periodId} onClick={printAll} className="bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold flex items-center gap-2 disabled:opacity-50"><Printer size={18}/> طباعة جميع المسيرات</button>
        <button disabled={busy || !periodId || !selectedSchoolId} onClick={() => selectedSchool && printSchool(selectedSchool)} className="border border-[var(--navy)] text-[var(--navy)] rounded-xl px-6 py-3 font-bold flex items-center gap-2 disabled:opacity-50"><Printer size={18}/> طباعة المدرسة المحددة</button>
      </div>

      <div className="card overflow-hidden">
        <div className="p-5 border-b"><b>المدارس المسجلة ({filtered.length})</b><span className="text-sm text-gray-500 mr-3">— اختر فترة المسير ثم استخدم الطباعة الفردية أو الجماعية.</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الرمز</th><th className="p-4 text-right">اسم المدرسة</th><th className="p-4 text-right">عدد الموظفين</th><th className="p-4 text-right">الإجراء</th></tr></thead><tbody>
          {filtered.map(s => <tr key={s.id} className="border-t"><td className="p-4">{s.school_code}</td><td className="p-4 font-semibold">{s.school_name}</td><td className="p-4">{teachers.filter(t => t.school_id === s.id).length}</td><td className="p-4"><button disabled={busy || !periodId} onClick={() => printSchool(s)} className="bg-[var(--navy)] text-white rounded-lg px-4 py-2.5 flex items-center gap-2 disabled:opacity-50"><Printer size={17}/> طباعة مسير المدرسة</button></td></tr>)}
        </tbody></table></div>
      </div>
    </main>

    <section className="hidden print:block bg-white text-black p-2" dir="rtl">
      {printRowsFiltered.length > 0 && selectedPeriod && <>
        <div className="text-center mb-5">
          <h1 className="text-2xl font-bold">مسير رواتب الموظفين</h1>
          <div className="text-lg font-semibold mt-2">{printMode === 'all' ? 'جميع المدارس' : (selectedSchool?.school_name || 'المدرسة')}</div>
          <div className="text-sm mt-2">الفترة: {selectedPeriod.period_name}</div>
          <div className="text-sm mt-1 font-semibold">من {hijriOrGregorian(selectedPeriod.start_hijri, selectedPeriod.start_date)} هـ إلى {hijriOrGregorian(selectedPeriod.end_hijri, selectedPeriod.end_date)} هـ</div>
        </div>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="bg-gray-100">
            <th className="border p-2">#</th><th className="border p-2">رمز المدرسة</th><th className="border p-2">اسم المدرسة</th><th className="border p-2">اسم الموظف</th><th className="border p-2">رقم الهوية</th><th className="border p-2">الوظيفة</th><th className="border p-2">التخصص</th><th className="border p-2">تاريخ المباشرة هجري</th><th className="border p-2">الملاحظات</th><th className="border p-2">الحالة</th>
          </tr></thead>
          <tbody>{printRowsFiltered.map((r, i) => {
            const s = schools.find(x => x.id === r.school_id);
            const t = teachers.find(x => x.id === r.teacher_id);
            return <tr key={r.id}>
              <td className="border p-2 text-center">{i + 1}</td><td className="border p-2 text-center">{s?.school_code || '—'}</td><td className="border p-2">{s?.school_name || '—'}</td><td className="border p-2">{t?.full_name || '—'}</td><td className="border p-2 text-center">{t?.national_id || '—'}</td><td className="border p-2">{t?.job_role || '—'}</td><td className="border p-2">{t?.specialization || '—'}</td><td className="border p-2 text-center">{gregorianToHijri(r.direct_start_date) || '—'}</td><td className="border p-2">{r.notes || '—'}</td><td className="border p-2 text-center">{r.status || '—'}</td>
            </tr>;
          })}</tbody>
        </table>
        <div className="mt-8 text-sm text-gray-700">عدد سجلات المسيرات: {printRowsFiltered.length}</div>
      </>}
    </section>
    <style jsx global>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } thead { display: table-header-group; } }`}</style>
  </div>;
}

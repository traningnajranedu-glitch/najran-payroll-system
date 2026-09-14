'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, Search, RefreshCw, ArrowRight } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name: string | null; stamp_path: string | null };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string };
type RecordRow = { id: string; teacher_id: string; status: string; direct_start_date: string | null; notes: string | null };

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
  const [printSchool, setPrintSchool] = useState<School | null>(null);
  const [printPeriod, setPrintPeriod] = useState<Period | null>(null);
  const [printRows, setPrintRows] = useState<RecordRow[]>([]);

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
      sb.from('payroll_periods').select('id,period_name,start_date,end_date').order('start_date', { ascending: false }),
    ]);
    if (s.error || t.error || p.error) setMessage(s.error?.message || t.error?.message || p.error?.message || 'تعذر تحميل البيانات.');
    setSchools(s.data || []); setTeachers(t.data || []); setPeriods(p.data || []);
    if (!periodId && p.data?.[0]) setPeriodId(p.data[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => schools.filter(s => `${s.school_name} ${s.school_code}`.includes(search.trim())), [schools, search]);

  async function printOne(school: School) {
    const period = periods.find(p => p.id === periodId);
    if (!period) return setMessage('اختر فترة المسير أولاً.');
    setBusy(true); setMessage('جاري تجهيز مسير المدرسة للطباعة…');
    const { data, error } = await sb.from('payroll_records').select('id,teacher_id,status,direct_start_date,notes').eq('school_id', school.id).eq('period_id', period.id);
    if (error) { setMessage('تعذر تحميل المسير: ' + error.message); setBusy(false); return; }
    if (!data?.length) { setMessage(`لا توجد سجلات مسير لـ ${school.school_name} في الفترة ${period.period_name}. جهّز المسير أولاً.`); setBusy(false); return; }
    setPrintSchool(school); setPrintPeriod(period); setPrintRows(data); setBusy(false);
    setTimeout(() => window.print(), 250);
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل نظام مسيرات الرواتب…</div></main>;
  if (!allowed) return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">صلاحية طباعة المسيرات متاحة لمدير النظام فقط.</p></div></main>;

  return <div className="min-h-screen bg-slate-50 print:bg-white" dir="rtl">
    <main className="max-w-7xl mx-auto p-5 md:p-8 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-bold">طباعة مسيرات المدارس</h1><p className="text-gray-500 mt-1">اختر فترة المسير ثم اطبع مسير مدرسة واحدة بشكل مستقل.</p></div>
        <div className="flex gap-2"><button onClick={load} className="border bg-white rounded-xl p-3"><RefreshCw size={18}/></button><button onClick={() => location.href='/admin'} className="border bg-white rounded-xl px-4 py-3 flex items-center gap-2"><ArrowRight size={17}/> لوحة المدير</button></div>
      </div>
      {message && <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-4 py-3 mb-5">{message}</div>}
      <div className="card p-5 mb-5 grid md:grid-cols-[1fr_2fr] gap-3">
        <select value={periodId} onChange={e => setPeriodId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">اختر فترة المسير</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period_name} — {p.start_date} إلى {p.end_date}</option>)}</select>
        <div className="border rounded-xl px-4 py-3 flex items-center gap-2"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} className="outline-none flex-1" placeholder="بحث باسم المدرسة أو رمز المدرسة"/></div>
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-4 text-right">الرمز</th><th className="p-4 text-right">اسم المدرسة</th><th className="p-4 text-right">عدد الموظفين</th><th className="p-4 text-right">الإجراء</th></tr></thead><tbody>{filtered.map(s => <tr key={s.id} className="border-t"><td className="p-4">{s.school_code}</td><td className="p-4 font-semibold">{s.school_name}</td><td className="p-4">{teachers.filter(t => t.school_id === s.id).length}</td><td className="p-4"><button disabled={busy || !periodId} onClick={() => printOne(s)} className="bg-[var(--navy)] text-white rounded-lg px-4 py-2.5 flex items-center gap-2 disabled:opacity-50"><Printer size={17}/> طباعة مسير المدرسة</button></td></tr>)}</tbody></table></div></div>
    </main>

    <section className="hidden print:block bg-white text-black p-2" dir="rtl">
      {printSchool && printPeriod && <>
        <div className="text-center mb-5"><h1 className="text-2xl font-bold">مسير رواتب الموظفين</h1><div className="text-lg font-semibold mt-2">{printSchool.school_name}</div><div className="text-sm mt-1">الفترة: {printPeriod.period_name} — من {printPeriod.start_date} إلى {printPeriod.end_date}</div></div>
        <table className="w-full border-collapse text-xs"><thead><tr className="bg-gray-100"><th className="border p-2">#</th><th className="border p-2">اسم الموظف</th><th className="border p-2">رقم الهوية</th><th className="border p-2">الوظيفة</th><th className="border p-2">التخصص</th><th className="border p-2">تاريخ المباشرة</th><th className="border p-2">الملاحظات</th><th className="border p-2">الحالة</th></tr></thead><tbody>{printRows.map((r, i) => { const t = teachers.find(x => x.id === r.teacher_id); return <tr key={r.id}><td className="border p-2 text-center">{i + 1}</td><td className="border p-2">{t?.full_name || '—'}</td><td className="border p-2 text-center">{t?.national_id || '—'}</td><td className="border p-2">{t?.job_role || '—'}</td><td className="border p-2">{t?.specialization || '—'}</td><td className="border p-2 text-center">{r.direct_start_date || '—'}</td><td className="border p-2">{r.notes || '—'}</td><td className="border p-2 text-center">{r.status || '—'}</td></tr>; })}</tbody></table>
        <div className="mt-10" style={{ direction: 'ltr', display: 'flex', justifyContent: 'flex-start' }}><div className="text-center w-[300px]"><div className="font-bold mb-2">مدير المدرسة</div><div className="mb-3">{printSchool.manager_name || '—'}</div><div className="flex items-end justify-center gap-5 min-h-[90px]"><div className="text-sm">التوقيع: __________________</div>{printSchool.stamp_path && <img src={sb.storage.from('school-stamps').getPublicUrl(printSchool.stamp_path).data.publicUrl} alt="ختم المدرسة" className="w-24 h-24 object-contain" />}</div></div></div>
      </>}
    </section>
    <style jsx global>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { background: white !important; } }`}</style>
  </div>;
}

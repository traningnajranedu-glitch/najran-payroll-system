'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, Search, RefreshCw, ArrowRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name: string | null; stamp_path: string | null };
type Teacher = { id: string; school_id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null };
type RecordRow = { id: string; school_id: string; teacher_id: string; period_id: string; status: string; direct_start_date: string | null; absence_days: number; payroll_days: number; notes: string | null; approved_at?: string | null };

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
  const PRINT_TEMPLATE_VERSION = '2026-09-28-v3';

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
    let query = sb.from('payroll_records').select('id,school_id,teacher_id,period_id,status,direct_start_date,absence_days,payroll_days,notes,approved_at');
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
      .select('id,school_id,teacher_id,period_id,status,direct_start_date,absence_days,payroll_days,notes')
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
            'عدد أيام الغياب': r.absence_days ?? 0,
            'عدد أيام المسير': r.payroll_days ?? 0,
            'الملاحظات': r.notes || '',
            'حالة المسير': r.status || ''
          };
        });
        const ws = XLSX.utils.json_to_sheet(sheetRows);
        ws['!cols'] = [
          { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 24 },
          { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 22 },
          { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
          { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 18 }
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

  const approvedAt = useMemo(() => {
    const dates = printRowsFiltered.map(r => r.approved_at).filter(Boolean) as string[];
    return dates.sort().at(-1) || null;
  }, [printRowsFiltered]);

  const approvedHijri = approvedAt ? gregorianToHijri(approvedAt.slice(0, 10)) : '—';

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

    <section className="hidden print:block bg-white text-black print-payroll-sheet" dir="rtl">
      {printRowsFiltered.length > 0 && selectedPeriod && <>
        <div className="print-letterhead">
          <div className="print-letterhead-right"><div>المملكة العربية السعودية</div><div className="print-ministry">وزارة التعليم</div><div>الإدارة العامة للتعليم بمنطقة نجران</div><div>الشؤون التعليمية/إدارة أداء التعليم</div></div>
          <div className="print-letterhead-center"><svg viewBox="0 0 180 120" aria-label="شعار وزارة التعليم" role="img" className="print-moe-logo"><g fill="#00857a"><circle cx="48" cy="20" r="5"/><circle cx="66" cy="16" r="5"/><circle cx="84" cy="14" r="5"/><circle cx="102" cy="16" r="5"/><circle cx="120" cy="20" r="5"/><circle cx="40" cy="36" r="5"/><circle cx="58" cy="32" r="5"/><circle cx="76" cy="30" r="5"/><circle cx="94" cy="32" r="5"/><circle cx="112" cy="36" r="5"/><circle cx="34" cy="52" r="5"/><circle cx="52" cy="48" r="5"/><circle cx="70" cy="46" r="5"/><circle cx="88" cy="48" r="5"/><circle cx="106" cy="52" r="5"/></g><text x="90" y="82" textAnchor="middle" fill="#00857a" fontSize="18" fontWeight="700">وزارة التعليم</text><text x="90" y="101" textAnchor="middle" fill="#4a4a4a" fontSize="9">Ministry of Education</text></svg></div>
          <div className="print-letterhead-left"><div><b>الرقم:</b> ....................................</div><div><b>التاريخ:</b> {approvedHijri !== '—' ? `${approvedHijri} هـ` : '....................................'}</div></div>
        </div>
        <div className="print-main-title">طباعة مسير الرواتب</div><div className="print-portal-title">البوابة الإلكترونية لمدارس التعليم المستمر</div><div className="print-template-version">نموذج الطباعة الرسمي — {PRINT_TEMPLATE_VERSION}</div>
        <div className="print-meta"><div><b>اسم المدرسة:</b> {printMode === 'all' ? 'جميع المدارس' : (selectedSchool?.school_name || '—')}</div><div><b>فترة المسير:</b> {selectedPeriod.period_name} &nbsp; | &nbsp; من {hijriOrGregorian(selectedPeriod.start_hijri,selectedPeriod.start_date)} هـ إلى {hijriOrGregorian(selectedPeriod.end_hijri,selectedPeriod.end_date)} هـ</div></div>
        <table className="print-payroll-table"><thead><tr><th>م</th>{printMode==='all'&&<th>المدرسة</th>}<th>اسم الموظف</th><th>الوظيفة</th><th>عدد الأيام</th><th>أيام الغياب</th><th>تاريخ المباشرة</th><th>الملاحظات</th></tr></thead><tbody>
          {printRowsFiltered.map((r,i)=>{const s=schools.find(x=>x.id===r.school_id);const t=teachers.find(x=>x.id===r.teacher_id);return <tr key={r.id}><td>{i+1}</td>{printMode==='all'&&<td>{s?.school_name||'—'}</td>}<td className="employee-name">{t?.full_name||'—'}</td><td>{t?.job_role||'—'}</td><td>{r.payroll_days??0}</td><td>{r.absence_days??0}</td><td>{gregorianToHijri(r.direct_start_date)||'—'}</td><td>{r.notes||'—'}</td></tr>})}
        </tbody></table>
        <div className="print-approval-grid">
          <div className="print-signature-box"><b>مدير المدرسة</b><div className="approval-name">{printMode==='school' ? (selectedSchool?.manager_name || '................................') : '................................'}</div><div className="approval-line">التوقيع: ................................</div></div>
          <div className="print-stamp-box"><b>ختم المدرسة</b><div className="print-stamp-area">{printMode==='school' && selectedSchool?.stamp_path ? <img src={sb.storage.from('school-stamps').getPublicUrl(selectedSchool.stamp_path).data.publicUrl} alt="ختم المدرسة" className="print-stamp-image"/> : <span>موضع الختم</span>}</div></div>
          <div className="print-signature-box"><b>يعتمد</b><div className="approval-role">المشرف / مدير إدارة التعليم المستمر</div><div className="approval-line">التوقيع: ................................</div></div>
        </div>
        <div className="print-footer-note">هذا النموذج صادر من البوابة الإلكترونية لمدارس التعليم المستمر — الإدارة العامة للتعليم بمنطقة نجران</div>
      </>}
    </section>
    <style jsx global>{`@media print {
    @page { size:A4 landscape; margin:8mm; } body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-payroll-sheet{font-family:Tahoma,Arial,sans-serif;color:#064f50;position:relative;min-height:190mm;padding:2mm 3mm 0}
    .print-letterhead{position:relative;height:34mm}.print-letterhead-right{position:absolute;right:0;top:1mm;width:34%;text-align:right;font-weight:800;font-size:13px;line-height:1.7}.print-ministry{font-size:17px}.print-letterhead-center{position:absolute;left:50%;top:-2mm;transform:translateX(-50%);width:32%;text-align:center}.print-moe-logo{width:145px;height:98px}.print-letterhead-left{position:absolute;left:0;top:3mm;width:25%;border:1px solid #9ccbd0;border-radius:7px;padding:8px 10px;text-align:right;line-height:1.9;font-size:11px}.print-letterhead-left small{display:block;font-size:9px}
    .print-template-version{text-align:center;font-size:8px;color:#6b8b8b;margin:-5px 0 7px}.print-main-title{width:310px;margin:0 auto 4px;padding:8px 22px;border-radius:16px;background:linear-gradient(135deg,#006b78,#078b82)!important;color:#fff!important;text-align:center;font-size:24px;font-weight:900}.print-portal-title{text-align:center;font-size:17px;font-weight:900;margin-bottom:10px}
    .print-meta{display:grid;grid-template-columns:1fr 1.3fr;gap:10px;margin-bottom:10px;font-size:11px}.print-meta>div{border:1px solid #b7d9dc;border-radius:6px;padding:6px 10px;background:#fbfefe!important}
    .print-payroll-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:10px;color:#173f41;border:1px solid #0b7e7b;border-radius:7px;overflow:hidden}.print-payroll-table th{background:#087f78!important;color:#fff!important;padding:8px 5px;font-weight:900;border-left:1px solid rgba(255,255,255,.45)}.print-payroll-table td{height:25px;padding:5px;text-align:center;border-left:1px solid #77b5b8;border-top:1px solid #9ac9cb}.print-payroll-table tbody tr:nth-child(even) td{background:#f6fbfb!important}.employee-name{text-align:right!important;font-weight:700}
    .print-approval-grid{display:grid;grid-template-columns:1fr .8fr 1fr;gap:22px;align-items:center;margin:12px auto 0;width:82%;page-break-inside:avoid}.print-signature-box,.print-stamp-box{min-height:72px;border:1px solid #9ccbd0;border-radius:7px;text-align:center;padding:7px 12px}.approval-name,.approval-role{margin-top:8px;font-size:11px;font-weight:700}.approval-line{margin-top:10px;font-size:10px}.print-stamp-area{height:52px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#8aa}.print-stamp-image{max-width:72px;max-height:58px;object-fit:contain}.print-footer-note{position:absolute;bottom:1mm;left:0;right:0;text-align:center;border-top:1px solid #d7e8e8;padding-top:4px;font-size:8px;color:#628080}tr{page-break-inside:avoid}thead{display:table-header-group}
  }`}</style>
  </div>;
}

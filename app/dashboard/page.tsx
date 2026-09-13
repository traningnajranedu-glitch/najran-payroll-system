'use client';

import { useEffect, useMemo, useState } from 'react';
import { LogOut, Users, FileText, CalendarDays, CheckCircle2, Lock, RefreshCw, Printer, Upload, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase';

type Teacher = { id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string; is_open: boolean; allow_edit: boolean };
type PayrollRow = { id?: string; teacher_id: string; direct_start_date: string | null; notes: string | null; status: string; approved_at?: string | null };
type School = { id: string; school_code: string; school_name: string; manager_name: string | null; stamp_path: string | null };

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
  const [savingSchool, setSavingSchool] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }

    const { data: su } = await sb
      .from('school_users')
      .select('school_id,schools(id,school_code,school_name,manager_name,stamp_path)')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!su) { setMessage('لم يتم ربط الحساب بمدرسة.'); setLoading(false); return; }

    const currentSchool = su.schools as unknown as School;
    setSchool(currentSchool);
    setManagerName(currentSchool?.manager_name || '');
    if (currentSchool?.stamp_path) {
      setStampUrl(sb.storage.from('school-stamps').getPublicUrl(currentSchool.stamp_path).data.publicUrl);
    } else {
      setStampUrl('');
    }

    const { data: t } = await sb
      .from('teachers')
      .select('id,full_name,national_id,job_role,specialization')
      .eq('school_id', su.school_id)
      .eq('is_active', true)
      .order('full_name');
    setTeachers(t || []);

    const { data: p } = await sb.from('payroll_periods').select('*').order('start_date', { ascending: false });
    setPeriods(p || []);
    const active = (p || []).find((x: Period) => x.is_open) || p?.[0];
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

  const editable = !!period?.is_open && !!period?.allow_edit;
  const approved = teachers.length > 0 && teachers.every(t => rows[t.id]?.status === 'تم الاعتماد');
  const savedCount = teachers.filter(t => rows[t.id]?.status === 'تم الحفظ' || rows[t.id]?.status === 'تم الاعتماد').length;

  const printRows = useMemo(() => teachers.map(t => ({ teacher: t, row: rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' } })), [teachers, rows]);

  async function save() {
    if (!period || !school || !editable) return;
    setSaving(true); setMessage('');
    for (const t of teachers) {
      const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' };
      const { error } = await sb.from('payroll_records').upsert({
        period_id: period.id,
        school_id: school.id,
        teacher_id: t.id,
        direct_start_date: r.direct_start_date || null,
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

  async function saveSchoolSettings() {
    if (!managerName.trim() && !stampFile) {
      setMessage('أدخل اسم مدير المدرسة أو اختر صورة الختم.');
      return;
    }
    setSavingSchool(true); setMessage('جاري حفظ بيانات المدير والختم…');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setMessage('انتهت جلسة الدخول.'); setSavingSchool(false); return; }
    const form = new FormData();
    form.append('manager_name', managerName.trim());
    if (stampFile) form.append('stamp', stampFile);
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
      setStampFile(null);
      setMessage('تم حفظ بيانات مدير المدرسة والختم.');
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
    <header className="bg-[var(--navy)] text-white print:hidden">
      <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
        <div><div className="font-bold text-lg">نظام مسيرات الرواتب</div><div className="text-sm text-blue-100 mt-1">{school.school_name}</div></div>
        <button type="button" onClick={logout} className="flex gap-2 items-center bg-white/10 px-4 py-2 rounded-xl"><LogOut size={17}/> خروج</button>
      </div>
    </header>

    <main className="max-w-7xl mx-auto p-5 md:p-8">
      <div className="print:hidden">
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="card p-5"><Users/><div className="text-2xl font-bold mt-3">{teachers.length}</div><div className="text-gray-500 text-sm">عدد الموظفين</div></div>
          <div className="card p-5"><CalendarDays/><div className="font-bold mt-3">{period?.period_name || 'لا توجد فترة'}</div><div className="text-gray-500 text-sm">الفترة الحالية</div></div>
          <div className="card p-5"><Lock/><div className="font-bold mt-3">{period?.is_open ? 'مفتوح للتعبئة' : 'مغلق'}</div><div className="text-gray-500 text-sm">حالة الفترة</div></div>
          <div className="card p-5"><CheckCircle2/><div className="text-2xl font-bold mt-3">{savedCount}</div><div className="text-gray-500 text-sm">السجلات المحفوظة</div></div>
        </div>

        <div className="card p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h2 className="font-bold text-lg">بيانات اعتماد المدرسة</h2><p className="text-sm text-gray-500 mt-1">تظهر بيانات المدير والختم في أسفل يسار المسير عند الطباعة.</p></div>
            {stampUrl && <img src={stampUrl} alt="ختم المدرسة" className="w-20 h-20 object-contain border rounded-xl bg-white" />}
          </div>
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block"><span className="block text-sm font-semibold mb-2">اسم مدير المدرسة</span><input value={managerName} onChange={e => setManagerName(e.target.value)} className="border rounded-xl px-4 py-3 w-full" placeholder="اسم مدير المدرسة" /></label>
            <label className="block"><span className="block text-sm font-semibold mb-2">صورة ختم المدرسة</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setStampFile(e.target.files?.[0] || null)} className="border rounded-xl px-3 py-2.5 w-full bg-white" /></label>
            <button type="button" disabled={savingSchool} onClick={saveSchoolSettings} className="bg-[var(--navy)] text-white rounded-xl px-5 py-3 font-bold flex items-center justify-center gap-2"><Upload size={18}/>{savingSchool ? 'جارٍ الحفظ…' : 'حفظ البيانات'}</button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-5 border-b flex flex-wrap gap-3 items-center justify-between">
            <div><h2 className="font-bold text-lg">مسير الرواتب</h2><p className="text-sm text-gray-500">أدخل تاريخ المباشرة والملاحظات لكل موظف ثم احفظ واعتمد المسير.</p></div>
            <div className="flex gap-2">
              <select value={period?.id || ''} onChange={async e => { const p = periods.find(x => x.id === e.target.value); if (p) { setPeriod(p); await loadRecords(school.id, p.id); } }} className="border rounded-xl px-3 py-2"><option value="">اختر الفترة</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period_name}</option>)}</select>
              <button type="button" onClick={load} className="border rounded-xl p-2"><RefreshCw size={18}/></button>
            </div>
          </div>
          {!editable && <div className="bg-amber-50 text-amber-800 px-5 py-3 flex gap-2 items-center text-sm"><Lock size={17}/> الفترة مغلقة حاليًا، لا يمكن تعديل المسير.</div>}
          {approved && <div className="bg-green-50 text-green-800 px-5 py-3 flex gap-2 items-center text-sm"><ShieldCheck size={18}/> تم اعتماد المسير — يمكنك الآن طباعته.</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-4 text-right">#</th><th className="p-4 text-right">الاسم</th><th className="p-4 text-right">الهوية</th><th className="p-4 text-right">الوظيفة</th><th className="p-4 text-right">التخصص</th><th className="p-4 text-right">تاريخ المباشرة</th><th className="p-4 text-right">ملاحظات</th><th className="p-4 text-right">الحالة</th></tr></thead>
              <tbody>{teachers.map((t, i) => { const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' }; return <tr key={t.id} className="border-t">
                <td className="p-4">{i + 1}</td><td className="p-4 font-semibold">{t.full_name}</td><td className="p-4">{t.national_id}</td><td className="p-4">{t.job_role}</td><td className="p-4">{t.specialization || '—'}</td>
                <td className="p-4"><input disabled={!editable || r.status === 'تم الاعتماد'} type="date" value={r.direct_start_date || ''} onChange={e => setRows(x => ({ ...x, [t.id]: { ...r, direct_start_date: e.target.value } }))} className="border rounded-lg px-2 py-2" /></td>
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

      <section className="hidden print:block bg-white text-black" dir="rtl">
        <div className="text-center mb-5">
          <h1 className="text-2xl font-bold">مسير رواتب الموظفين</h1>
          <div className="text-lg font-semibold mt-2">{school.school_name}</div>
          <div className="text-sm mt-1">الفترة: {period?.period_name || '—'} — من {period?.start_date || '—'} إلى {period?.end_date || '—'}</div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead><tr className="bg-gray-100"><th className="border p-2">#</th><th className="border p-2">اسم الموظف</th><th className="border p-2">رقم الهوية</th><th className="border p-2">الوظيفة</th><th className="border p-2">التخصص</th><th className="border p-2">تاريخ المباشرة</th><th className="border p-2">الملاحظات</th></tr></thead>
          <tbody>{printRows.map(({ teacher, row }, i) => <tr key={teacher.id}><td className="border p-2 text-center">{i + 1}</td><td className="border p-2">{teacher.full_name}</td><td className="border p-2 text-center">{teacher.national_id}</td><td className="border p-2">{teacher.job_role}</td><td className="border p-2">{teacher.specialization || '—'}</td><td className="border p-2 text-center">{row.direct_start_date || '—'}</td><td className="border p-2">{row.notes || '—'}</td></tr>)}</tbody>
        </table>
        <div className="mt-10" style={{ direction: 'ltr', display: 'flex', justifyContent: 'flex-start' }}>
          <div className="text-center w-[300px]">
            <div className="font-bold mb-2">مدير المدرسة</div>
            <div className="mb-3">{school.manager_name || managerName || '—'}</div>
            <div className="flex items-end justify-center gap-5 min-h-[90px]">
              <div className="text-sm">التوقيع: __________________</div>
              {stampUrl && <img src={stampUrl} alt="ختم المدرسة" className="w-24 h-24 object-contain" />}
            </div>
          </div>
        </div>
      </section>
    </main>

    <style jsx global>{`@media print { @page { size: A4 portrait; margin: 12mm; } body { background: white !important; } }`}</style>
  </div>;
}

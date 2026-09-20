'use client';

import { useEffect, useMemo, useState } from 'react';
import { LogOut, Users, FileText, CalendarDays, CheckCircle2, Lock, RefreshCw, Printer, Upload, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase';

type Teacher = { id: string; full_name: string; national_id: string; job_role: string; specialization: string | null };
type Period = { id: string; period_name: string; start_date: string; end_date: string; start_hijri?: string | null; end_hijri?: string | null; auto_open_close?: boolean; is_open: boolean; allow_edit: boolean };
type PayrollRow = { id?: string; teacher_id: string; direct_start_date: string | null; notes: string | null; status: string; approved_at?: string | null };
type School = { id: string; school_code: string; school_name: string; manager_name: string | null; stamp_path: string | null };

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

function gregorianToHijri(value: string): string {
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
  const approxYear=hy+579;\n  let lo=Date.UTC(approxYear-2,0,1), hi=Date.UTC(approxYear+2,11,31);
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
          <div className="card p-5"><Lock/><div className="font-bold mt-3">{period && periodIsOpen(period) ? 'مفتوح للتعبئة' : 'مغلق'}</div><div className="text-gray-500 text-sm">حالة الفترة</div></div>
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
          {!editable && <div className="bg-amber-50 text-amber-800 px-5 py-3 flex gap-2 items-center text-sm"><Lock size={17}/> الفترة مغلقة حاليًا حسب التاريخ الهجري المحدد أو إعدادات الفترة، لا يمكن تعديل المسير.</div>}
          {approved && <div className="bg-green-50 text-green-800 px-5 py-3 flex gap-2 items-center text-sm"><ShieldCheck size={18}/> تم اعتماد المسير — يمكنك الآن طباعته.</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-4 text-right">#</th><th className="p-4 text-right">الاسم</th><th className="p-4 text-right">الهوية</th><th className="p-4 text-right">الوظيفة</th><th className="p-4 text-right">التخصص</th><th className="p-4 text-right">تاريخ المباشرة</th><th className="p-4 text-right">ملاحظات</th><th className="p-4 text-right">الحالة</th></tr></thead>
              <tbody>{teachers.map((t, i) => { const r = rows[t.id] || { teacher_id: t.id, direct_start_date: null, notes: null, status: 'لم يبدأ' }; return <tr key={t.id} className="border-t">
                <td className="p-4">{i + 1}</td><td className="p-4 font-semibold">{t.full_name}</td><td className="p-4">{t.national_id}</td><td className="p-4">{t.job_role}</td><td className="p-4">{t.specialization || '—'}</td>
                <td className="p-4">
                  <HijriDatePicker disabled={!editable || r.status === 'تم الاعتماد'} value={r.direct_start_date ? gregorianToHijri(r.direct_start_date) : ''} onChange={hijri => { const gregorian=hijriToGregorian(hijri); if (gregorian) setRows(x=>({...x,[t.id]:{...r,direct_start_date:gregorian}})); }} />
                  <div className="text-[11px] text-gray-400 mt-1">هجري (أم القرى)</div>
                </td>
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
          <tbody>{printRows.map(({ teacher, row }, i) => <tr key={teacher.id}><td className="border p-2 text-center">{i + 1}</td><td className="border p-2">{teacher.full_name}</td><td className="border p-2 text-center">{teacher.national_id}</td><td className="border p-2">{teacher.job_role}</td><td className="border p-2">{teacher.specialization || '—'}</td><td className="border p-2 text-center">{row.direct_start_date ? gregorianToHijri(row.direct_start_date) : '—'}</td><td className="border p-2">{row.notes || '—'}</td></tr>)}</tbody>
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

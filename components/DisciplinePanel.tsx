"use client";
import {useEffect, useState} from 'react';
import {CalendarCheck, RefreshCw} from 'lucide-react';
import {supabaseBrowser} from '../lib/supabase';
import {fetchDiscipline, type DisciplineRecord} from '../lib/discipline';
import {indicatorWeek, absenceSummary, validAbsence} from '../lib/weekly-indicators';
type School = {id:string; school_name:string};
export default function DisciplinePanel({schools, admin=false}:{schools:School[]; admin?:boolean}) {
  const sb = supabaseBrowser();
  const [week, setWeek] = useState(() => indicatorWeek());
  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true, request = 0;
    async function load() {
      const sequence = ++request;
      const current = indicatorWeek();
      try {
        const rows = await fetchDiscipline(sb, {start:current.start,end:current.start});
        if(active && sequence === request){setRecords(rows);setWeek(current);setError('');}
      } catch(e) {if(active && sequence === request)setError(String((e as Error).message || 'تعذر تحميل مؤشر الانضباط.'));}
      finally {if(active && sequence === request)setLoading(false);}
    }
    void load();
    const timer = setInterval(() => void load(), 60000);
    const channel = sb.channel('weekly-discipline-panel').on('postgres_changes',{event:'*',schema:'public',table:'school_discipline_daily'},() => void load()).subscribe();
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => {active=false;clearInterval(timer);window.removeEventListener('focus',focus);void sb.removeChannel(channel);};
  }, [sb, revision]);
  const selected = records.filter(r => schools.some(s => s.id === r.school_id) && r.attendance_date === week.start);
  const summary = absenceSummary(selected);
  const metric = (v:number|null) => v === null ? '—' : `${Math.round(v*10)/10}%`;
  return <section dir="rtl" className="mb-6 overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
    <header className="flex items-center justify-between bg-gradient-to-l from-emerald-900 to-teal-800 p-5 text-white">
      <div><h2 className="flex items-center gap-2 text-xl font-black"><CalendarCheck/>مؤشر الانضباط المدرسي الأسبوعي</h2><p className="mt-2 text-xs">{week.start} إلى {week.end} — الأحد إلى الخميس</p></div>
      <button type="button" aria-label="تحديث مؤشر الانضباط" onClick={() => setRevision(v=>v+1)} className="rounded-xl border border-white/30 p-2"><RefreshCw size={18}/></button>
    </header>
    <div className="p-4 md:p-6">
      {error?<p role="alert" className="text-red-700">{error}</p>:loading?<p>جارٍ تحميل المؤشر…</p>:<>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ['المدارس التي أدخلت المؤشر',`${summary.submitted} من ${schools.length}`],
          ['المدارس التي ثبتت الغياب',`${summary.confirmed} من ${schools.length}`],
          ['متوسط الغياب بعذر',metric(summary.excused)],
          ['متوسط الغياب بدون عذر',metric(summary.unexcused)],
        ].map(([label,value])=><div key={label} className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold">{label}</p><b className="mt-2 block text-2xl">{value}</b></div>)}</div>
        <p className="mb-5 text-xs text-slate-600">متوسط بسيط لنسب المدارس التي ثبتت الغياب وأدخلت نسبًا صحيحة في الأسبوع الحالي. عدم الإدخال أو عدم التثبيت لا يُحسب كنسبة غياب صفر. لا تُستخدم أعداد الحضور أو التأخر القديمة.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-slate-50"><tr>{['المدرسة','حالة الإدخال','تثبيت الغياب في نور','الغياب بعذر','الغياب بدون عذر','الملاحظات وخطة المتابعة'].map(h=><th key={h} className="p-3 text-right">{h}</th>)}</tr></thead><tbody>{schools.map(s=>{
          const r=selected.find(x=>x.school_id===s.id), valid=r && validAbsence(r);
          return <tr key={s.id} className="border-b"><td className="p-3 font-bold">{s.school_name}</td><td>{r?'تم الإدخال':'لم يتم الإدخال'}</td><td>{!r?'—':r.noor_absence_confirmed?'تم التثبيت':'لم يتم التثبيت'}</td><td>{valid?metric(Number(r.noor_excused_absence_percent)):'—'}</td><td>{valid?metric(Number(r.noor_unexcused_absence_percent)):'—'}</td><td className="max-w-xs whitespace-pre-wrap">{r?.notes||'—'}</td></tr>;
        })}</tbody></table></div>
        {admin&&<p className="mt-4 text-xs text-slate-500">المتابعة تعتمد على حالة تثبيت الغياب والنسب الأسبوعية؛ مستهدف انتظام الحضور السابق لا ينطبق على هذا النموذج.</p>}
      </>}
    </div>
  </section>;
}

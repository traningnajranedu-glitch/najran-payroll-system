"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { supabaseBrowser } from "../../../../lib/supabase";
import {
  currentAcademicYear,
  riyadhDate,
} from "../../../../lib/achievement";
import {
  fetchDiscipline,
  type DisciplineInput,
  type DisciplineRecord,
} from "../../../../lib/discipline";
const blank = (): DisciplineInput => ({
  academic_year: currentAcademicYear(),
  semester: "الأول",
  attendance_date: riyadhDate(),
  expected_count: "",
  on_time_count: "",
  late_count: "",
  excused_absent_count: "",
  unexcused_absent_count: "",
  notes: "",
  noor_absence_confirmed: false,
  noor_excused_absence_percent: "0",
  noor_unexcused_absence_percent: "0",
});
export default function DisciplineForm() {
  const sb = supabaseBrowser();
  const [school, setSchool] = useState<{
      id: string;
      school_name: string;
    } | null>(null),
    [form, setForm] = useState(blank),
    [records, setRecords] = useState<DisciplineRecord[]>([]),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0);
  async function load() {
    try {
      const {
        data: { user },
        error: authError,
      } = await sb.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        location.href = "/";
        return;
      }
      const { data: su, error: schoolError } = await sb
        .from("school_users")
        .select("school_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (schoolError) throw schoolError;
      if (!su) {
        location.href = "/dashboard";
        return;
      }
      const [s, r] = await Promise.all([
        sb
          .from("schools")
          .select("id,school_name,is_active")
          .eq("id", su.school_id)
          .single(),
        fetchDiscipline(sb, { schoolId: su.school_id }),
      ]);
      if (s.error) throw s.error;
      if (!s.data.is_active) throw new Error("المدرسة غير مفعلة.");
      setSchool(s.data);
      setRecords(r);
    } catch (e) {
      setError(
        String(
          (e as { message?: string }).message || "تعذر تحميل بيانات المدرسة.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(r: DisciplineRecord) {
    setForm({
      academic_year: r.academic_year,
      semester: r.semester,
      attendance_date: r.attendance_date,
      expected_count: String(r.expected_count),
      on_time_count: String(r.on_time_count),
      late_count: String(r.late_count),
      excused_absent_count: String(r.excused_absent_count),
      unexcused_absent_count: String(r.unexcused_absent_count),
      notes: r.notes || "",
      noor_absence_confirmed: Boolean(r.noor_absence_confirmed),
      noor_excused_absence_percent: String(r.noor_excused_absence_percent ?? 0),
      noor_unexcused_absence_percent: String(r.noor_unexcused_absence_percent ?? 0),
    });
    setMessage("تم تحميل سجل اليوم للتحديث.");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!school) return;
    setMessage(""); setError("");
    if (form.noor_absence_confirmed) {
      const excused=Number(form.noor_excused_absence_percent);
      const unexcused=Number(form.noor_unexcused_absence_percent);
      if (!Number.isFinite(excused)||!Number.isFinite(unexcused)||excused<0||excused>100||unexcused<0||unexcused>100) {
        setError("أدخل نسب الغياب من 0 إلى 100%."); return;
      }
    }
    setSaving(true);
    try {
      const {data:{user},error:authError}=await sb.auth.getUser();
      if(authError) throw authError;
      if(!user) throw new Error("انتهت جلسة الدخول.");
      const {error}=await sb.from("school_discipline_daily").upsert({
        school_id:school.id,
        attendance_date:riyadhDate(),
        academic_year:null, semester:null,
        expected_count:null,on_time_count:null,late_count:null,
        excused_absent_count:null,unexcused_absent_count:null,
        notes:form.notes.trim()||null,
        noor_absence_confirmed:form.noor_absence_confirmed,
        noor_excused_absence_percent:form.noor_absence_confirmed?Number(form.noor_excused_absence_percent):null,
        noor_unexcused_absence_percent:form.noor_absence_confirmed?Number(form.noor_unexcused_absence_percent):null,
        submitted_by:user.id,updated_at:new Date().toISOString()
      },{onConflict:"school_id,attendance_date"});
      if(error) throw error;
      await load(); setRevision(v=>v+1);
      setMessage("تم حفظ حالة تثبيت الغياب في نظام نور والنسب بنجاح.");
    } catch(e){setError(String((e as {message?:string}).message||"تعذر حفظ مؤشر الانضباط."));}
    finally{setSaving(false);}
  }
  const input =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900";
  type TextDisciplineKey = Exclude<keyof DisciplineInput, "noor_absence_confirmed">;
  const field = (k: TextDisciplineKey, label: string, type = "number") => (
    <label key={k} className="text-sm font-bold">
      {label}
      <input
        required
        className={input}
        type={type}
        min={type === "number" ? 0 : undefined}
        max={
          type === "date"
            ? riyadhDate()
            : type === "number"
              ? 2147483647
              : undefined
        }
        step={type === "number" ? 1 : undefined}
        maxLength={k === "academic_year" ? 4 : undefined}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  if (loading)
    return (
      <main dir="rtl" className="p-10">
        جارٍ تحميل بيانات الانضباط…
      </main>
    );
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <a
          className="inline-flex items-center gap-2 mb-5"
          href="/dashboard/indicators"
        >
          <ArrowRight size={18} />
          العودة لنماذج المؤشرات
        </a>
        <h1 className="flex items-center gap-3 text-3xl font-black text-emerald-900">
          <CalendarCheck />
          إدخال الانضباط المدرسي
        </h1>
        <p className="my-3 text-slate-600">
          {school?.school_name} — سجل إجمالي حضور الطلاب يوميًا، دون إدخال
          بيانات شخصية.
        </p>
        {error && (
          <p
            role="alert"
            className="my-3 rounded-xl bg-red-50 p-4 text-red-700"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="my-3 rounded-xl bg-emerald-50 p-4 text-emerald-800"
          >
            {message}
          </p>
        )}
        {school && (
          <>
            <form
              onSubmit={save}
              className="mb-6 rounded-3xl border bg-white p-5"
            >

              <section className="mt-6 rounded-3xl border border-sky-200 bg-gradient-to-l from-sky-50 via-white to-indigo-50 p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h2 className="text-lg font-black text-slate-900">تثبيت الغياب في نظام نور</h2><p className="mt-1 text-sm text-slate-500">حدد حالة تثبيت الغياب، ثم أدخل نسب الغياب المعتمدة في نظام نور.</p></div>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
                    <input type="checkbox" className="peer sr-only" checked={form.noor_absence_confirmed} onChange={(e)=>setForm({...form,noor_absence_confirmed:e.target.checked})}/>
                    <span className="relative h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 after:absolute after:right-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:-translate-x-5"></span>
                    <span className={"text-sm font-black "+(form.noor_absence_confirmed?"text-emerald-700":"text-slate-600")}>{form.noor_absence_confirmed?"تم تثبيت الغياب":"لم يتم تثبيت الغياب"}</span>
                  </label>
                </div>
                {form.noor_absence_confirmed&&<div className="mt-5 grid gap-4 md:grid-cols-2">
                  {([["noor_excused_absence_percent","نسبة الغياب بعذر","emerald"],["noor_unexcused_absence_percent","نسبة الغياب بدون عذر","rose"]] as const).map(([key,label,tone])=><label key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="font-black text-slate-800">{label}</span><span className={"rounded-xl px-3 py-1 text-xl font-black "+(tone==="emerald"?"bg-emerald-50 text-emerald-700":"bg-rose-50 text-rose-700")}>{form[key]}%</span></div><input type="range" min="0" max="100" step="1" value={form[key]} onChange={(e)=>setForm({...form,[key]:e.target.value})} className="mt-5 w-full accent-emerald-600"/><div className="mt-3 flex items-center gap-2"><input type="number" min="0" max="100" step="1" value={form[key]} onChange={(e)=>{const v=Math.min(100,Math.max(0,Number(e.target.value)||0));setForm({...form,[key]:String(v)})}} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-center font-black"/><span className="text-sm font-bold text-slate-500">من 100%</span></div></label>)}
                </div>}
              </section>
              <label className="block text-sm font-bold">
                الملاحظات وخطة المتابعة
                <textarea
                  maxLength={4000}
                  rows={3}
                  className={input}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="flex gap-3 mt-5">
                <button
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50"
                >
                  {saving ? "جارٍ الحفظ…" : "حفظ مؤشر الانضباط"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setForm(blank());
                    setMessage("");
                    setError("");
                  }}
                  className="rounded-xl border px-4"
                >
                  إعادة تعيين
                </button>
              </div>
            </form>
            <section className="rounded-3xl border bg-white p-5">
              <h2 className="mb-4 text-xl font-black">سجلات تثبيت الغياب في نظام نور</h2>
              <div className="overflow-x-auto">
                <table className="min-w-[650px] w-full text-sm">
                  <thead><tr>{["التاريخ","حالة التثبيت","نسبة الغياب بعذر","نسبة الغياب بدون عذر","الإجراء"].map(h=><th key={h} className="bg-slate-50 p-3 text-right">{h}</th>)}</tr></thead>
                  <tbody>{records.map(r=><tr key={r.id} className="border-b">
                    <td className="p-3">{r.attendance_date}</td>
                    <td><span className={"rounded-full px-3 py-1 text-xs font-black "+(r.noor_absence_confirmed?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")}>{r.noor_absence_confirmed?"تم التثبيت":"لم يتم التثبيت"}</span></td>
                    <td>{r.noor_absence_confirmed ? (r.noor_excused_absence_percent ?? 0)+"%" : "—"}</td>
                    <td>{r.noor_absence_confirmed ? (r.noor_unexcused_absence_percent ?? 0)+"%" : "—"}</td>
                    <td><button onClick={()=>edit(r)} className="font-bold text-emerald-700 underline">تحديث</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {!records.length&&<p className="p-5 text-slate-500">لم تُدخل بيانات تثبيت الغياب بعد.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

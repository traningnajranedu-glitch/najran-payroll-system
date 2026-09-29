"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { supabaseBrowser } from "../../../../lib/supabase";
import {
  currentAcademicYear,
  riyadhDate,
  percent,
} from "../../../../lib/achievement";
import {
  fetchDiscipline,
  validateDiscipline,
  type DisciplineInput,
  type DisciplineRecord,
} from "../../../../lib/discipline";
import DisciplinePanel from "../../../../components/DisciplinePanel";
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
    });
    setMessage("تم تحميل سجل اليوم للتحديث.");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!school) return;
    setMessage("");
    setError("");
    const invalid = validateDiscipline(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await sb.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("انتهت جلسة الدخول.");
      const { error } = await sb
        .from("school_discipline_daily")
        .upsert(
          {
            school_id: school.id,
            academic_year: form.academic_year,
            semester: form.semester,
            attendance_date: form.attendance_date,
            expected_count: Number(form.expected_count),
            on_time_count: Number(form.on_time_count),
            late_count: Number(form.late_count),
            excused_absent_count: Number(form.excused_absent_count),
            unexcused_absent_count: Number(form.unexcused_absent_count),
            notes: form.notes.trim() || null,
            submitted_by: user.id,
          },
          { onConflict: "school_id,attendance_date" },
        );
      if (error) throw error;
      await load();
      setRevision((v) => v + 1);
      setMessage(
        "تم حفظ واعتماد سجل الانضباط وتحديث مؤشر المدرسة ولوحة مدير النظام.",
      );
    } catch (e) {
      setError(
        String((e as { message?: string }).message || "تعذر حفظ سجل الانضباط."),
      );
    } finally {
      setSaving(false);
    }
  }
  const total = Number(form.expected_count),
    onTime = Number(form.on_time_count),
    late = Number(form.late_count),
    absence =
      Number(form.excused_absent_count) + Number(form.unexcused_absent_count);
  const ready =
    [
      "expected_count",
      "on_time_count",
      "late_count",
      "excused_absent_count",
      "unexcused_absent_count",
    ].every(
      (k) =>
        form[k as keyof DisciplineInput].trim() !== "" &&
        Number.isFinite(Number(form[k as keyof DisciplineInput])),
    ) && total > 0;
  const input =
    "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900";
  const field = (k: keyof DisciplineInput, label: string, type = "number") => (
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
              <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                كل طالب ضمن فئة واحدة: حاضر في الوقت أو متأخر أو غائب بعذر أو
                غائب دون عذر. أدخل بيانات يوم دراسي فعلي فقط. الحفظ لنفس اليوم
                يحدّث سجله ويمنع تكراره.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {field("academic_year", "العام الدراسي الهجري", "text")}
                <label className="text-sm font-bold">
                  الفصل الدراسي
                  <select
                    className={input}
                    value={form.semester}
                    onChange={(e) =>
                      setForm({ ...form, semester: e.target.value })
                    }
                  >
                    {["الأول", "الثاني", "الثالث"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {field("attendance_date", "تاريخ الحضور", "date")}
                {field("expected_count", "عدد الطلاب المتوقع حضورهم")}
                {field("on_time_count", "الحاضرون في الوقت")}
                {field("late_count", "المتأخرون")}
                {field("excused_absent_count", "الغائبون بعذر")}
                {field("unexcused_absent_count", "الغائبون دون عذر")}
              </div>
              <div className="grid grid-cols-3 gap-3 my-5">
                {[
                  [
                    "انتظام الحضور",
                    onTime,
                    "text-emerald-800",
                    "bg-emerald-50",
                  ],
                  ["التأخر", late, "text-blue-700", "bg-blue-50"],
                  ["الغياب", absence, "text-amber-700", "bg-amber-50"],
                ].map(([label, value, tone, bg]) => (
                  <div key={String(label)} className={"rounded-xl p-3 " + bg}>
                    <span className="text-xs font-bold">{label}</span>
                    <b className={"block text-2xl mt-2 " + tone}>
                      {ready ? percent((Number(value) / total) * 100) : "—"}
                    </b>
                  </div>
                ))}
              </div>
              {ready && (
                <p
                  className={
                    "mb-4 text-sm " +
                    (onTime + late + absence === total
                      ? "text-emerald-700"
                      : "text-red-700")
                  }
                >
                  مجموع الفئات: {onTime + late + absence} / المتوقع: {total}
                </p>
              )}
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
                  {saving ? "جارٍ الحفظ…" : "حفظ واعتماد سجل اليوم"}
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
                  سجل جديد
                </button>
              </div>
            </form>
            <DisciplinePanel key={revision} schools={[school]} />
            <section className="rounded-3xl border bg-white p-5">
              <h2 className="text-xl font-black mb-4">
                سجلات الانضباط المعتمدة
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "التاريخ",
                        "العام / الفصل",
                        "المتوقع",
                        "في الوقت",
                        "المتأخرون",
                        "الغائبون",
                        "الانتظام",
                        "الإجراء",
                      ].map((h) => (
                        <th key={h} className="bg-slate-50 p-3 text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">{r.attendance_date}</td>
                        <td>
                          {r.academic_year} / {r.semester}
                        </td>
                        <td>{r.expected_count}</td>
                        <td>{r.on_time_count}</td>
                        <td>{r.late_count}</td>
                        <td>
                          {Number(r.excused_absent_count) +
                            Number(r.unexcused_absent_count)}
                        </td>
                        <td>{percent(r.regularity_percent)}</td>
                        <td>
                          <button
                            onClick={() => edit(r)}
                            className="text-emerald-700 underline"
                          >
                            تحديث
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!records.length && (
                <p className="p-5 text-slate-500">
                  لم تُدخل سجلات الانضباط بعد.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

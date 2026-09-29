"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, GraduationCap } from "lucide-react";
import { supabaseBrowser } from "../../../../lib/supabase";
import {
  currentAcademicYear,
  riyadhDate,
  validateAssessment,
  percent,
  fetchAssessments,
  type Assessment,
} from "../../../../lib/achievement";
import AchievementPanel from "../../../../components/AchievementPanel";
const blank = () => ({
  academic_year: currentAcademicYear(),
  semester: "الأول",
  stage: "ابتدائي",
  grade: "الأول",
  subject: "اللغة العربية",
  evaluation_type: "ختامي",
  evaluation_date: riyadhDate(),
  registered_count: "",
  assessed_count: "",
  passed_count: "",
  mastered_count: "",
  total_scores: "",
  max_score: "100",
  notes: "",
});
export default function AchievementForm() {
  const sb = supabaseBrowser();
  const [school, setSchool] = useState<{
      id: string;
      school_name: string;
    } | null>(null),
    [form, setForm] = useState(blank()),
    [records, setRecords] = useState<Assessment[]>([]),
    [threshold, setThreshold] = useState(70),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [attachment, setAttachment] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  async function load() {
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        location.href = "/";
        return;
      }
      const { data: su, error: e } = await sb
        .from("school_users")
        .select("school_id")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (e) throw e;
      if (!su) {
        location.href = "/dashboard";
        return;
      }
      const [s, r, c] = await Promise.all([
        sb
          .from("schools")
          .select("id,school_name")
          .eq("id", su.school_id)
          .single(),
        fetchAssessments(sb, { schoolId: su.school_id }),
        sb.from("school_achievement_settings").select("*").single(),
      ]);
      if (s.error || c.error) throw s.error || c.error;
      setSchool(s.data);
      setRecords(r);
      setThreshold(Number(c.data.mastery_threshold));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(
              (e as { message?: string }).message || "تعذر تحميل البيانات.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(r: Assessment) {
    setForm({
      academic_year: r.academic_year,
      semester: r.semester,
      stage: r.stage,
      grade: r.grade,
      subject: r.subject,
      evaluation_type: r.evaluation_type,
      evaluation_date: r.evaluation_date,
      registered_count: String(r.registered_count),
      assessed_count: String(r.assessed_count),
      passed_count: String(r.passed_count),
      mastered_count: String(r.mastered_count),
      total_scores: String(r.total_scores),
      max_score: String(r.max_score),
      notes: r.notes || "",
    });
    setAttachment(r.attachment_path);
    setFile(null);
    setMessage("تم تحميل السجل للتحديث.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!school) return;
    setError("");
    setMessage("");
    const invalid = validateAssessment(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (
      file &&
      (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024)
    ) {
      setError("المرفق PDF فقط، بحد أقصى 5 ميجابايت.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) throw new Error("انتهت جلسة الدخول.");
      let path = attachment;
      if (file) {
        path = school.id + "/" + crypto.randomUUID() + ".pdf";
        const { error } = await sb.storage
          .from("achievement-reports")
          .upload(path, file, { contentType: "application/pdf" });
        if (error) throw error;
        setAttachment(path);
        setFile(null);
      }
      const payload = {
        ...form,
        school_id: school.id,
        grade: form.grade.trim(),
        subject: form.subject.trim(),
        notes: form.notes.trim() || null,
        registered_count: Number(form.registered_count),
        assessed_count: Number(form.assessed_count),
        passed_count: Number(form.passed_count),
        mastered_count: Number(form.mastered_count),
        total_scores: Number(form.total_scores),
        max_score: Number(form.max_score),
        mastery_threshold: threshold,
        attachment_path: path,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      };
      const { error } = await sb
        .from("school_achievement_assessments")
        .upsert(payload, {
          onConflict:
            "school_id,academic_year,semester,stage,grade,subject,evaluation_type",
        });
      if (error) throw error;
      setMessage(
        "تم حفظ واعتماد البيانات وتحديث مؤشر المدرسة ولوحة مدير النظام.",
      );
      await load();
      setVersion((v) => v + 1);
      setForm(blank());
      setAttachment(null);
    } catch (e) {
      setError(
        String((e as { message?: string }).message || "تعذر حفظ البيانات."),
      );
    } finally {
      setSaving(false);
    }
  }
  async function openFile(path: string) {
    const { data, error } = await sb.storage
      .from("achievement-reports")
      .createSignedUrl(path, 60);
    if (error) {
      setError(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const input =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
  const field = (k: keyof typeof form, label: string, type = "text") => (
    <label key={k} className="text-sm font-bold">
      {label}
      <input
        required
        maxLength={type === "text" ? 100 : undefined}
        type={type}
        min={type === "number" ? 0 : undefined}
        max={type === "date" ? riyadhDate() : undefined}
        step={
          type === "number" && (k === "total_scores" || k === "max_score")
            ? "any"
            : undefined
        }
        className={input}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  const select = (k: keyof typeof form, label: string, values: string[]) => (
    <label className="text-sm font-bold">
      {label}
      <select
        className={input}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  if (loading)
    return (
      <main dir="rtl" className="p-10">
        جارٍ تحميل بيانات المدرسة…
      </main>
    );
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <a
          href="/dashboard/indicators"
          className="flex items-center gap-2 mb-5"
        >
          <ArrowRight size={18} />
          العودة لنماذج المؤشرات
        </a>
        <h1 className="flex items-center gap-3 text-3xl font-black text-emerald-800">
          <GraduationCap />
          إدخال بيانات التحصيل العلمي
        </h1>
        <p className="my-3 text-slate-600">
          {school?.school_name} — تُحسب النسب تلقائيًا من أعداد الطلاب ودرجاتهم.
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
              className="rounded-2xl border bg-white p-5 mb-6"
            >
              <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm">
                مستوى الإتقان الموحد: {threshold}% من الدرجة القصوى. يُحدد عدد
                المتقنين بناءً عليه. الحفظ لنفس العام والفصل والصف والمادة ونوع
                التقييم يحدّث السجل الموجود.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {field("academic_year", "العام الدراسي الهجري")}
                {select("semester", "الفصل الدراسي", [
                  "الأول",
                  "الثاني",
                  "الثالث",
                ])}
                {select("stage", "المرحلة", ["ابتدائي", "متوسط", "ثانوي"])}
                {select("grade", "الصف", [
                  "الأول",
                  "الثاني",
                  "الثالث",
                  "الرابع",
                  "الخامس",
                  "السادس",
                ])}
                {select("subject", "المادة", [
                  "اللغة العربية",
                  "الرياضيات",
                  "العلوم",
                  "الدراسات الإسلامية",
                  "الدراسات الاجتماعية",
                  "اللغة الإنجليزية",
                  "المهارات الرقمية",
                ])}
                {select("evaluation_type", "نوع التقييم", [
                  "قبلي",
                  "دوري",
                  "ختامي",
                ])}
                {field("evaluation_date", "تاريخ التقييم", "date")}
                {field("registered_count", "عدد الطلاب المسجلين", "number")}
                {field(
                  "assessed_count",
                  "عدد الطلاب الذين أدّوا التقييم",
                  "number",
                )}
                {field("passed_count", "عدد الناجحين", "number")}
                {field("mastered_count", "عدد المحققين للإتقان", "number")}
                {field(
                  "total_scores",
                  "مجموع درجات الطلاب المقيّمين",
                  "number",
                )}
                {field("max_score", "الدرجة القصوى للتقييم", "number")}
              </div>
              <div className="grid sm:grid-cols-3 gap-3 my-5">
                {[
                  [
                    "نسبة الإتقان",
                    (Number(form.mastered_count) /
                      Number(form.assessed_count)) *
                      100,
                  ],
                  [
                    "نسبة النجاح",
                    (Number(form.passed_count) / Number(form.assessed_count)) *
                      100,
                  ],
                  [
                    "متوسط الدرجات",
                    (Number(form.total_scores) /
                      (Number(form.assessed_count) * Number(form.max_score))) *
                      100,
                  ],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-xl bg-emerald-50 p-4">
                    <span>{l}</span>
                    <b className="block mt-2 text-2xl text-emerald-800">
                      {Number.isFinite(Number(v)) ? percent(Number(v)) : "—"}
                    </b>
                  </div>
                ))}
              </div>
              <label className="block text-sm font-bold">
                خطة التحسين والملاحظات
                <textarea
                  maxLength={4000}
                  rows={3}
                  className={input}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <label className="block mt-4 text-sm font-bold">
                مرفق النتائج (PDF اختياري، حتى 5 ميجابايت)
                <input
                  key={version}
                  className={input}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                استخدم تقريرًا إجماليًا دون أسماء الطلاب أو بياناتهم الشخصية.
              </p>
              {attachment && (
                <button
                  type="button"
                  onClick={() => void openFile(attachment)}
                  className="mt-2 text-emerald-700 underline"
                >
                  عرض المرفق الحالي
                </button>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-50"
                >
                  {saving ? "جارٍ الحفظ…" : "حفظ واعتماد البيانات"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setForm(blank());
                    setAttachment(null);
                    setFile(null);
                    setVersion((v) => v + 1);
                  }}
                  className="rounded-xl border px-4"
                >
                  نموذج جديد
                </button>
              </div>
            </form>
            <AchievementPanel key={version} schools={[school]} />
            <section className="mt-6 rounded-2xl border bg-white p-5">
              <h2 className="text-xl font-black mb-4">السجلات المعتمدة</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[850px]">
                  <thead>
                    <tr>
                      {[
                        "العام / الفصل",
                        "المرحلة / الصف",
                        "المادة / التقييم",
                        "التاريخ",
                        "المقيّمون",
                        "الإتقان",
                        "الإجراء",
                      ].map((h) => (
                        <th key={h} className="p-3 text-right bg-slate-50">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">
                          {r.academic_year} / {r.semester}
                        </td>
                        <td>
                          {r.stage} / {r.grade}
                        </td>
                        <td>
                          {r.subject} / {r.evaluation_type}
                        </td>
                        <td>{r.evaluation_date}</td>
                        <td>{r.assessed_count}</td>
                        <td>{percent(r.mastery_percent)}</td>
                        <td>
                          <button
                            onClick={() => edit(r)}
                            className="text-emerald-700 underline"
                          >
                            تحديث
                          </button>
                          {r.attachment_path && (
                            <button
                              className="mr-3 text-blue-700 underline"
                              onClick={() => void openFile(r.attachment_path!)}
                            >
                              المرفق
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!records.length && (
                <p className="p-5 text-slate-500">
                  لم تُدخل بيانات التحصيل العلمي بعد.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

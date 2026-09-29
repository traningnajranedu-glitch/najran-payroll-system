"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase";
import {
  currentAcademicYear,
  percent,
  fetchAssessments,
  type Assessment,
} from "../lib/achievement";
type School = { id: string; school_name: string };
export default function AchievementPanel({
  schools,
  admin = false,
}: {
  schools: School[];
  admin?: boolean;
}) {
  const sb = supabaseBrowser();
  const [records, setRecords] = useState<Assessment[]>([]),
    [year, setYear] = useState(currentAcademicYear()),
    [semester, setSemester] = useState("الأول"),
    [evaluation, setEvaluation] = useState("ختامي"),
    [stage, setStage] = useState("الكل"),
    [grade, setGrade] = useState("الكل"),
    [subject, setSubject] = useState("الكل"),
    [target, setTarget] = useState(85),
    [threshold, setThreshold] = useState(70),
    [draftTarget, setDraftTarget] = useState("85"),
    [draftThreshold, setDraftThreshold] = useState("70"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  async function load() {
    try {
      const [r, c] = await Promise.all([
        fetchAssessments(sb, { year, semester }),
        sb.from("school_achievement_settings").select("*").single(),
      ]);
      if (c.error) throw c.error;
      setRecords(r);
      setTarget(Number(c.data.target_percent));
      setThreshold(Number(c.data.mastery_threshold));
      setDraftTarget(String(c.data.target_percent));
      setDraftThreshold(String(c.data.mastery_threshold));
      setError("");
    } catch (e) {
      setError(
        String(
          (e as { message?: string }).message || "تعذر تحميل مؤشر التحصيل.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => clearInterval(id);
  }, [year, semester]);
  const common = records.filter(
    (r) =>
      r.academic_year === year &&
      r.semester === semester &&
      (stage === "الكل" || r.stage === stage) &&
      (grade === "الكل" || r.grade === grade) &&
      (subject === "الكل" || r.subject === subject),
  );
  const eligible = common.filter(
    (r) => Number(r.mastery_threshold) === threshold,
  );
  const filtered = eligible.filter((r) => r.evaluation_type === evaluation);
  const sum = (
    rs: Assessment[],
    key: "assessed_count" | "mastered_count" | "passed_count",
  ) => rs.reduce((n, r) => n + Number(r[key]), 0);
  const calc = (rs: Assessment[]) => {
    const n = sum(rs, "assessed_count");
    return {
      n,
      mastery: n ? (sum(rs, "mastered_count") / n) * 100 : null,
      success: n ? (sum(rs, "passed_count") / n) * 100 : null,
      average: n
        ? (rs.reduce(
            (v, r) => v + Number(r.total_scores) / Number(r.max_score),
            0,
          ) /
            n) *
          100
        : null,
    };
  };
  const rows = schools
    .map((s) => ({
      ...s,
      ...calc(filtered.filter((r) => r.school_id === s.id)),
    }))
    .sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1));
  const overall = calc(
    filtered.filter((r) => schools.some((s) => s.id === r.school_id)),
  );
  const key = (r: Assessment) =>
    [r.school_id, r.stage, r.grade, r.subject].join("|");
  const finals = eligible.filter(
    (r) =>
      r.evaluation_type === "ختامي" &&
      schools.some((s) => s.id === r.school_id),
  );
  const paired = finals
    .map((f) => ({
      f,
      p: eligible.find(
        (p) =>
          p.evaluation_type === "قبلي" &&
          key(p) === key(f) &&
          p.evaluation_date <= f.evaluation_date,
      ),
    }))
    .filter((x): x is { f: Assessment; p: Assessment } => !!x.p);
  const growth = paired.length
    ? Number(calc(paired.map((x) => x.f)).mastery) -
      Number(calc(paired.map((x) => x.p)).mastery)
    : null;
  async function saveSettings() {
    const t = Number(draftTarget),
      m = Number(draftThreshold);
    if (
      !draftTarget ||
      !draftThreshold ||
      !Number.isFinite(t) ||
      !Number.isFinite(m) ||
      t <= 0 ||
      t > 100 ||
      m <= 0 ||
      m > 100
    ) {
      setError("المستهدف ومستوى الإتقان من أكبر من صفر إلى 100.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb
        .from("school_achievement_settings")
        .update({ target_percent: t, mastery_threshold: m })
        .eq("id", true);
      if (error) throw error;
      await load();
      setMessage("تم تحديث المستهدف ومستوى الإتقان الموحد.");
    } catch (e) {
      setError(String((e as { message?: string }).message));
    } finally {
      setSaving(false);
    }
  }
  async function openAttachment(path: string) {
    const { data, error } = await sb.storage
      .from("achievement-reports")
      .createSignedUrl(path, 60);
    if (error) {
      setError(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const select = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: string[],
  ) => (
    <label className="text-xs font-bold">
      {label}
      <select
        className="mt-1 block rounded-lg border bg-white p-2 text-slate-800 w-full"
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  const metric = (value: number | null) =>
    value === null ? "—" : percent(value);
  return (
    <section className="rounded-2xl border bg-white p-4 md:p-6 mb-5" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-emerald-900">
          مؤشر التحصيل العلمي — إتقان المهارات
        </h2>
        <button
          onClick={() => void load()}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          تحديث
        </button>
      </div>
      <p className="mt-2 mb-4 text-sm text-slate-500">
        المقارنة ضمن العام والفصل ونوع التقييم المحدد؛ مستوى الإتقان الموحد{" "}
        {threshold}% من الدرجة القصوى.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        <label className="text-xs font-bold">
          العام الهجري
          <input
            className="mt-1 block rounded-lg border p-2 w-full"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            maxLength={4}
          />
        </label>
        {select("الفصل", semester, setSemester, ["الأول", "الثاني", "الثالث"])}
        {select("نوع التقييم", evaluation, setEvaluation, [
          "قبلي",
          "دوري",
          "ختامي",
        ])}
        {select("المرحلة", stage, setStage, [
          "الكل",
          "ابتدائي",
          "متوسط",
          "ثانوي",
        ])}
        {select("الصف", grade, setGrade, [
          "الكل",
          "الأول",
          "الثاني",
          "الثالث",
          "الرابع",
          "الخامس",
          "السادس",
        ])}
        {select("المادة", subject, setSubject, [
          "الكل",
          ...Array.from(new Set(records.map((r) => r.subject))),
        ])}
      </div>
      {loading && <p>جارٍ تحميل المؤشر…</p>}
      {error && (
        <p role="alert" className="my-3 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="my-3 text-emerald-700">
          {message}
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          ["نسبة الإتقان الإجمالية", metric(overall.mastery)],
          ["نسبة النجاح", metric(overall.success)],
          ["متوسط الدرجات", metric(overall.average)],
          [
            "التحسن: قبلي ← ختامي",
            growth === null ? "—" : growth.toFixed(1) + " نقطة مئوية",
          ],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-emerald-50 p-4">
            <p className="text-xs text-emerald-900">{l}</p>
            <b className="block text-2xl mt-2 text-emerald-800">{v}</b>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mb-6 text-sm text-slate-600">
        <span>المستهدف: {target}%</span>
        <span>
          حققت المستهدف:{" "}
          {rows.filter((r) => r.mastery !== null && r.mastery >= target).length}
        </span>
        <span>
          المدارس المشاركة: {rows.filter((r) => r.mastery !== null).length} /{" "}
          {schools.length}
        </span>
        <span>حالات التقييم: {overall.n}</span>
      </div>
      <div className="space-y-4">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(110px,1fr)_3fr] md:grid-cols-[240px_1fr] gap-3 items-center"
          >
            <div className="text-sm font-bold">{r.school_name}</div>
            {r.mastery === null ? (
              <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-500">
                لم تُدخل البيانات لهذا الاختيار
              </p>
            ) : (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <b>{metric(r.mastery)}</b>
                  <span>{r.n} حالة تقييم</span>
                </div>
                <div className="relative h-6 rounded-lg bg-slate-100" dir="ltr">
                  <div
                    className={
                      "h-full rounded-lg " +
                      (r.mastery >= target
                        ? "bg-emerald-600"
                        : r.mastery >= 70
                          ? "bg-teal-500"
                          : "bg-amber-400")
                    }
                    style={{ width: r.mastery + "%" }}
                  />
                  <div
                    title={"المستهدف " + target + "%"}
                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-700"
                    style={{ left: target + "%" }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        className="flex justify-between mt-4 text-xs text-slate-400"
        dir="ltr"
      >
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p className="mt-5 text-xs text-slate-500">
        أخضر: حقق المستهدف · فيروزي: 70% فأكثر دون المستهدف · ذهبي: أقل من 70%.
        النسبة الإجمالية موزونة بعدد حالات التقييم، وقد يُقيّم الطالب في أكثر من
        مادة. التحسن يستخدم المواد والصفوف ذات تقييم قبلي وختامي متطابقين.
      </p>
      {common.some((r) => Number(r.mastery_threshold) !== threshold) && (
        <p className="mt-3 text-sm text-amber-700">
          توجد سجلات بمستوى إتقان سابق؛ استُبعدت من المقارنة لتوحيد المعيار.
          حدّث أعداد المتقنين وفق المستوى الحالي لإدراجها.
        </p>
      )}
      {admin && (
        <details className="mt-5 rounded-xl border p-4">
          <summary className="font-bold cursor-pointer">
            تفاصيل النتائج وخطط التحسين ({filtered.length})
          </summary>
          <div className="overflow-x-auto mt-4">
            <table className="min-w-[950px] w-full text-xs">
              <thead>
                <tr>
                  {[
                    "المدرسة",
                    "الصف / المادة",
                    "التقييم",
                    "التاريخ",
                    "المقيّمون",
                    "الناجحون",
                    "المتقنون",
                    "الإتقان",
                    "خطة التحسين",
                    "المرفق",
                  ].map((h) => (
                    <th key={h} className="text-right p-3 bg-slate-50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered
                  .filter((r) => schools.some((s) => s.id === r.school_id))
                  .map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3">
                        {schools.find((s) => s.id === r.school_id)?.school_name}
                      </td>
                      <td>
                        {r.stage} / {r.grade} / {r.subject}
                      </td>
                      <td>{r.evaluation_type}</td>
                      <td>{r.evaluation_date}</td>
                      <td>{r.assessed_count}</td>
                      <td>{r.passed_count}</td>
                      <td>{r.mastered_count}</td>
                      <td>{percent(r.mastery_percent)}</td>
                      <td className="max-w-xs whitespace-pre-wrap">
                        {r.notes || "—"}
                      </td>
                      <td>
                        {r.attachment_path ? (
                          <button
                            className="text-blue-700 underline"
                            onClick={() =>
                              void openAttachment(r.attachment_path!)
                            }
                          >
                            عرض PDF
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {admin && (
        <details className="mt-5 rounded-xl border p-4">
          <summary className="cursor-pointer font-bold">
            إعداد المستهدف ومستوى الإتقان
          </summary>
          <p className="text-xs text-slate-500 my-3">
            تغيير مستوى الإتقان يسري على الإدخالات القادمة. السجلات السابقة تظل
            محفوظة وتحتاج تحديث أعداد المتقنين لتدخل المقارنة الجديدة.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              المستهدف %
              <input
                className="block border rounded-lg p-2 mt-1"
                type="number"
                min="1"
                max="100"
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
              />
            </label>
            <label className="text-sm">
              مستوى الإتقان %
              <input
                className="block border rounded-lg p-2 mt-1"
                type="number"
                min="1"
                max="100"
                value={draftThreshold}
                onChange={(e) => setDraftThreshold(e.target.value)}
              />
            </label>
            <button
              disabled={saving}
              onClick={() => void saveSettings()}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-white self-end disabled:opacity-50"
            >
              {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
            </button>
          </div>
        </details>
      )}
    </section>
  );
}

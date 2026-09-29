import type { supabaseBrowser } from "./supabase";
export type Assessment = {
  id: string;
  school_id: string;
  academic_year: string;
  semester: string;
  stage: string;
  grade: string;
  subject: string;
  evaluation_type: string;
  evaluation_date: string;
  registered_count: number;
  assessed_count: number;
  passed_count: number;
  mastered_count: number;
  total_scores: number;
  max_score: number;
  mastery_threshold: number;
  notes: string | null;
  attachment_path: string | null;
  mastery_percent: number;
  success_percent: number;
  average_percent: number;
};
export type AchievementSummary = {
  school_id: string;
  academic_year: string;
  semester: string;
  evaluation_type: string;
  assessed_count: number;
  mastered_count: number;
  achievement_percent: number;
  success_percent: number;
  average_percent: number;
};
export const currentAcademicYear = () =>
  new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    year: "numeric",
    timeZone: "Asia/Riyadh",
  })
    .format(new Date())
    .replace(/\D/g, "");
export const riyadhDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date());
export const percent = (n: number) => Number(n).toFixed(1) + "%";
export function validateAssessment(f: Record<string, unknown>) {
  for (const k of [
    "academic_year",
    "semester",
    "stage",
    "grade",
    "subject",
    "evaluation_type",
    "evaluation_date",
  ])
    if (!String(f[k] ?? "").trim())
      return "أكمل بيانات العام والفصل والصف والمادة والتقييم.";
  if (!/^\d{4}$/.test(String(f.academic_year)))
    return "أدخل العام الدراسي الهجري من أربعة أرقام.";
  for (const k of [
    "registered_count",
    "assessed_count",
    "passed_count",
    "mastered_count",
  ])
    if (f[k] === "" || !Number.isInteger(Number(f[k])) || Number(f[k]) < 0)
      return "أدخل أعداد الطلاب بأرقام صحيحة غير سالبة.";
  const registered = Number(f.registered_count),
    assessed = Number(f.assessed_count);
  if (registered <= 0 || assessed <= 0 || assessed > registered)
    return "عدد المقيّمين يجب أن يكون أكبر من صفر ولا يتجاوز المسجلين.";
  if (Number(f.passed_count) > assessed || Number(f.mastered_count) > assessed)
    return "عدد الناجحين والمتقنين لا يتجاوز عدد المقيّمين.";
  const total = Number(f.total_scores),
    max = Number(f.max_score);
  if (
    f.total_scores === "" ||
    f.max_score === "" ||
    !Number.isFinite(total) ||
    !Number.isFinite(max) ||
    max <= 0 ||
    total < 0 ||
    total > assessed * max
  )
    return "راجع مجموع الدرجات والدرجة القصوى: المجموع لا يتجاوز عدد المقيّمين × الدرجة القصوى.";
  if (String(f.evaluation_date) > riyadhDate())
    return "تاريخ التقييم لا يكون في المستقبل.";
  return "";
}

export async function fetchAssessments(
  sb: ReturnType<typeof supabaseBrowser>,
  filters: { schoolId?: string; year?: string; semester?: string } = {},
) {
  const records: Assessment[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = sb
      .from("school_achievement_assessments")
      .select("*")
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (filters.schoolId) query = query.eq("school_id", filters.schoolId);
    if (filters.year) query = query.eq("academic_year", filters.year);
    if (filters.semester) query = query.eq("semester", filters.semester);
    const { data, error } = await query;
    if (error) throw error;
    records.push(...((data || []) as Assessment[]));
    if ((data || []).length < 1000) return records;
  }
}

import type { supabaseBrowser } from "./supabase";
import { riyadhDate } from "./achievement";
export type DisciplineRecord = {
  id: string;
  school_id: string;
  academic_year: string;
  semester: string;
  attendance_date: string;
  expected_count: number;
  on_time_count: number;
  late_count: number;
  excused_absent_count: number;
  unexcused_absent_count: number;
  notes: string | null;
  regularity_percent: number;
  late_percent: number;
  absence_percent: number;
};
export type DisciplineInput = {
  academic_year: string;
  semester: string;
  attendance_date: string;
  expected_count: string;
  on_time_count: string;
  late_count: string;
  excused_absent_count: string;
  unexcused_absent_count: string;
  notes: string;
};
export function validateDiscipline(f: DisciplineInput) {
  if (
    !/^\d{4}$/.test(f.academic_year) ||
    !["الأول", "الثاني", "الثالث"].includes(f.semester)
  )
    return "أدخل العام الدراسي والفصل بشكل صحيح.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(f.attendance_date) ||
    !Number.isFinite(Date.parse(f.attendance_date)) ||
    new Date(f.attendance_date + "T12:00:00Z").toISOString().slice(0, 10) !==
      f.attendance_date ||
    f.attendance_date > riyadhDate()
  )
    return "أدخل تاريخ حضور صحيحًا لا يتجاوز اليوم.";
  for (const k of [
    "expected_count",
    "on_time_count",
    "late_count",
    "excused_absent_count",
    "unexcused_absent_count",
  ] as const)
    if (
      f[k].trim() === "" ||
      !Number.isSafeInteger(Number(f[k])) ||
      Number(f[k]) < 0 ||
      Number(f[k]) > 2147483647
    )
      return "أدخل جميع أعداد الطلاب بأرقام صحيحة غير سالبة.";
  if (Number(f.expected_count) <= 0)
    return "عدد الطلاب المتوقع حضورهم يجب أن يكون أكبر من صفر.";
  if (
    Number(f.on_time_count) +
      Number(f.late_count) +
      Number(f.excused_absent_count) +
      Number(f.unexcused_absent_count) !==
    Number(f.expected_count)
  )
    return "مجموع الحاضرين في الوقت والمتأخرين والغائبين يجب أن يساوي عدد الطلاب المتوقع حضورهم.";
  return "";
}
export function disciplineSummary(records: DisciplineRecord[]) {
  const total = records.reduce((n, r) => n + Number(r.expected_count), 0);
  const sum = (
    k:
      | "on_time_count"
      | "late_count"
      | "excused_absent_count"
      | "unexcused_absent_count",
  ) => records.reduce((n, r) => n + Number(r[k]), 0);
  return {
    total,
    days: new Set(records.map((r) => r.attendance_date)).size,
    regularity: total ? (sum("on_time_count") / total) * 100 : null,
    late: total ? (sum("late_count") / total) * 100 : null,
    absence: total
      ? ((sum("excused_absent_count") + sum("unexcused_absent_count")) /
          total) *
        100
      : null,
  };
}
export function startOfPeriod(end: string, period: string) {
  if (period === "اليوم") return end;
  if (period === "الشهر الحالي") return end.slice(0, 7) + "-01";
  const d = new Date(end + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}
export async function fetchDiscipline(
  sb: ReturnType<typeof supabaseBrowser>,
  filters: {
    schoolId?: string;
    year?: string;
    semester?: string;
    start?: string;
    end?: string;
  } = {},
) {
  const records: DisciplineRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = sb
      .from("school_discipline_daily")
      .select("*")
      .order("attendance_date", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (filters.schoolId) q = q.eq("school_id", filters.schoolId);
    if (filters.year) q = q.eq("academic_year", filters.year);
    if (filters.semester) q = q.eq("semester", filters.semester);
    if (filters.start) q = q.gte("attendance_date", filters.start);
    if (filters.end) q = q.lte("attendance_date", filters.end);
    const { data, error } = await q;
    if (error) throw error;
    records.push(...((data || []) as DisciplineRecord[]));
    if ((data || []).length < 1000) return records;
  }
}

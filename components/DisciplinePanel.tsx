"use client";
import { useEffect, useState } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import { supabaseBrowser } from "../lib/supabase";
import { currentAcademicYear, riyadhDate, percent } from "../lib/achievement";
import {
  disciplineSummary,
  fetchDiscipline,
  startOfPeriod,
  type DisciplineRecord,
} from "../lib/discipline";
type School = { id: string; school_name: string };
export default function DisciplinePanel({
  schools,
  admin = false,
}: {
  schools: School[];
  admin?: boolean;
}) {
  const sb = supabaseBrowser();
  const [records, setRecords] = useState<DisciplineRecord[]>([]),
    [year, setYear] = useState(currentAcademicYear()),
    [semester, setSemester] = useState("الأول"),
    [period, setPeriod] = useState("آخر 7 أيام"),
    [start, setStart] = useState(() =>
      startOfPeriod(riyadhDate(), "آخر 7 أيام"),
    ),
    [end, setEnd] = useState(riyadhDate()),
    [target, setTarget] = useState(95),
    [draftTarget, setDraftTarget] = useState("95"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [revision, setRevision] = useState(0);
  const validRange =
    /^\d{4}$/.test(year) &&
    !!start &&
    !!end &&
    start <= end &&
    end <= riyadhDate();
  useEffect(() => {
    let active = true;
    async function load() {
      if (!validRange) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [r, c] = await Promise.all([
          fetchDiscipline(sb, { year, semester, start, end }),
          sb.from("school_discipline_settings").select("*").single(),
        ]);
        if (c.error) throw c.error;
        if (active) {
          setRecords(r);
          setTarget(Number(c.data.target_percent));
          setDraftTarget(String(c.data.target_percent));
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            String(
              (e as { message?: string }).message ||
                "تعذر تحميل مؤشر الانضباط.",
            ),
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [year, semester, start, end, revision, validRange]);
  const selected = records.filter(
    (r) =>
      schools.some((s) => s.id === r.school_id) &&
      r.academic_year === year &&
      r.semester === semester &&
      r.attendance_date >= start &&
      r.attendance_date <= end,
  );
  const rows = schools
    .map((s) => ({
      ...s,
      ...disciplineSummary(selected.filter((r) => r.school_id === s.id)),
    }))
    .sort((a, b) => (b.regularity ?? -1) - (a.regularity ?? -1));
  const overall = disciplineSummary(selected);
  function changePeriod(value: string) {
    setPeriod(value);
    if (value !== "مخصص") {
      const today = riyadhDate();
      setEnd(today);
      setStart(startOfPeriod(today, value));
    }
  }
  async function saveTarget() {
    const value = Number(draftTarget);
    if (!draftTarget || !Number.isFinite(value) || value <= 0 || value > 100) {
      setError("المستهدف أكبر من صفر وحتى 100%.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb
        .from("school_discipline_settings")
        .update({ target_percent: value })
        .eq("id", true);
      if (error) throw error;
      setTarget(value);
      setMessage("تم تحديث مستهدف الانضباط المدرسي.");
    } catch (e) {
      setError(
        String((e as { message?: string }).message || "تعذر حفظ المستهدف."),
      );
    } finally {
      setSaving(false);
    }
  }
  const metric = (v: number | null) => (v === null ? "—" : percent(v));
  const input =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-800";
  return (
    <section
      dir="rtl"
      className="mb-6 overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm"
    >
      <header className="flex gap-3 items-center justify-between bg-gradient-to-l from-emerald-900 to-teal-800 p-5 text-white">
        <div>
          <h2 className="flex gap-2 items-center text-xl font-black">
            <CalendarCheck />
            مؤشر الانضباط المدرسي
          </h2>
          <p className="mt-2 text-xs text-emerald-100">
            انتظام حضور الطلاب في الوقت المحدد خلال الفترة المختارة
          </p>
        </div>
        <button
          className="rounded-xl border border-white/30 p-2"
          title="تحديث المؤشر"
          aria-label="تحديث مؤشر الانضباط"
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <label className="text-xs font-bold">
            العام الدراسي الهجري
            <input
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={input}
            />
          </label>
          <label className="text-xs font-bold">
            الفصل الدراسي
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className={input}
            >
              {["الأول", "الثاني", "الثالث"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            الفترة
            <select
              value={period}
              onChange={(e) => changePeriod(e.target.value)}
              className={input}
            >
              {["اليوم", "آخر 7 أيام", "الشهر الحالي", "مخصص"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            من تاريخ
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => {
                setPeriod("مخصص");
                setStart(e.target.value);
              }}
              className={input}
            />
          </label>
          <label className="text-xs font-bold">
            إلى تاريخ
            <input
              type="date"
              value={end}
              min={start}
              max={riyadhDate()}
              onChange={(e) => {
                setPeriod("مخصص");
                setEnd(e.target.value);
              }}
              className={input}
            />
          </label>
        </div>
        {!validRange && (
          <p role="alert" className="my-3 text-red-700">
            اختر عامًا صحيحًا وفترة مرتبة لا تتجاوز اليوم.
          </p>
        )}
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
        {loading ? (
          <p className="p-5 text-center">جارٍ تحميل مؤشر الانضباط…</p>
        ) : (
          validRange &&
          !error && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  [
                    "نسبة انتظام الحضور",
                    metric(overall.regularity),
                    "text-emerald-800",
                    "bg-emerald-50",
                  ],
                  [
                    "نسبة الغياب",
                    metric(overall.absence),
                    "text-amber-700",
                    "bg-amber-50",
                  ],
                  [
                    "نسبة التأخر",
                    metric(overall.late),
                    "text-blue-700",
                    "bg-blue-50",
                  ],
                  [
                    "المدارس المشاركة",
                    String(rows.filter((r) => r.regularity !== null).length) +
                      " من " +
                      schools.length,
                    "text-emerald-800",
                    "bg-emerald-50",
                  ],
                ].map(([label, value, tone, bg]) => (
                  <div key={label} className={"rounded-2xl p-4 " + bg}>
                    <p className="text-xs font-bold text-slate-600">{label}</p>
                    <b className={"block mt-2 text-3xl font-black " + tone}>
                      {value}
                    </b>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap justify-between gap-3 mb-4">
                <h3 className="font-black text-emerald-900">
                  نسبة انتظام الحضور حسب المدرسة
                </h3>
                <span className="rounded-lg bg-amber-50 px-3 py-1 text-sm text-amber-800">
                  المستهدف {target}%
                </span>
              </div>
              <div className="space-y-4">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[minmax(105px,1fr)_2fr] md:grid-cols-[240px_1fr] gap-3 items-center"
                  >
                    <div className="text-sm font-bold text-slate-700">
                      {r.school_name}
                    </div>
                    {r.regularity === null ? (
                      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                        لم تُدخل البيانات لهذه الفترة
                      </p>
                    ) : (
                      <div>
                        <div className="flex justify-between gap-2 mb-1 text-xs">
                          <b className="text-emerald-900">
                            {metric(r.regularity)}
                          </b>
                          <span className="text-slate-500">
                            {r.days} أيام مسجلة
                          </span>
                        </div>
                        <div
                          className="relative h-6 rounded-lg bg-slate-100"
                          dir="ltr"
                        >
                          <div
                            className={
                              "h-full rounded-lg " +
                              (r.regularity >= target
                                ? "bg-emerald-600"
                                : r.regularity >= 90
                                  ? "bg-teal-500"
                                  : "bg-amber-500")
                            }
                            style={{ width: r.regularity + "%" }}
                          />
                          <div
                            className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-700"
                            style={{ left: target + "%" }}
                            title={"المستهدف " + target + "%"}
                          />
                        </div>
                        <div
                          className="flex justify-between text-[10px] text-slate-400 mt-1"
                          dir="ltr"
                        >
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-slate-500">
                أخضر: حقق المستهدف · فيروزي: 90% فأكثر دون المستهدف · ذهبي: أقل
                من 90%. الحاضر في الوقت والمتأخر والغائب فئات منفصلة، ومجموع
                نسبها 100%.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                تُحسب النسب من إجمالي حالات الحضور المتوقعة في الأيام المسجلة (
                {overall.total})، وليست عدد طلاب فريدين. الأيام دون إدخال لا
                تُحسب كغياب؛ راجع عدد الأيام المسجلة عند المقارنة.
              </p>
              <details className="mt-5 rounded-xl border p-4">
                <summary className="font-bold cursor-pointer">
                  السجلات اليومية وخطط المتابعة ({selected.length})
                </summary>
                <div className="overflow-x-auto mt-3">
                  <table className="min-w-[850px] w-full text-xs">
                    <thead>
                      <tr>
                        {[
                          "المدرسة",
                          "التاريخ",
                          "المتوقع",
                          "في الوقت",
                          "المتأخرون",
                          "غياب بعذر",
                          "غياب دون عذر",
                          "الانتظام",
                          "الملاحظات",
                        ].map((h) => (
                          <th key={h} className="p-3 text-right bg-slate-50">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="p-3">
                            {
                              schools.find((s) => s.id === r.school_id)
                                ?.school_name
                            }
                          </td>
                          <td>{r.attendance_date}</td>
                          <td>{r.expected_count}</td>
                          <td>{r.on_time_count}</td>
                          <td>{r.late_count}</td>
                          <td>{r.excused_absent_count}</td>
                          <td>{r.unexcused_absent_count}</td>
                          <td>{percent(r.regularity_percent)}</td>
                          <td className="max-w-xs whitespace-pre-wrap">
                            {r.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!selected.length && (
                  <p className="p-4 text-slate-500">
                    لا توجد سجلات للفترة المحددة.
                  </p>
                )}
              </details>
            </>
          )
        )}
        {admin && (
          <details className="mt-5 rounded-xl border p-4">
            <summary className="font-bold cursor-pointer">
              إعداد مستهدف الانضباط
            </summary>
            <div className="flex gap-3 items-end mt-3">
              <label className="text-sm">
                المستهدف %
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.1"
                  className={input}
                  value={draftTarget}
                  onChange={(e) => setDraftTarget(e.target.value)}
                />
              </label>
              <button
                disabled={saving}
                onClick={() => void saveTarget()}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-white disabled:opacity-50"
              >
                {saving ? "جارٍ الحفظ…" : "حفظ المستهدف"}
              </button>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

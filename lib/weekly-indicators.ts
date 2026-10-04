/** Sunday–Thursday reporting window, independent of the server timezone. */
export function indicatorWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const date = new Date(today + 'T12:00:00Z');
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 4);
  return {start, end:date.toISOString().slice(0, 10), today, canSubmit:day <= 4};
}
export type WeeklyAbsence = {school_id:string; attendance_date:string; noor_absence_confirmed:boolean; noor_excused_absence_percent:number|null; noor_unexcused_absence_percent:number|null; notes:string|null};
export function validAbsence(record: WeeklyAbsence) {
  return record.noor_absence_confirmed && [record.noor_excused_absence_percent, record.noor_unexcused_absence_percent].every(v => v !== null && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
}
export function absenceSummary(records: WeeklyAbsence[]) {
  const confirmed = records.filter(validAbsence);
  const average = (key:'noor_excused_absence_percent'|'noor_unexcused_absence_percent') => confirmed.length ? confirmed.reduce((sum,r) => sum + Number(r[key]),0)/confirmed.length : null;
  return {submitted:records.length, confirmed:confirmed.length, excused:average('noor_excused_absence_percent'), unexcused:average('noor_unexcused_absence_percent')};
}
export type MadrasatiPercentages = {manager_login_percent:number; teachers_login_percent:number; teachers_tools_percent:number; students_login_percent:number; students_tools_percent:number};
export function madrasatiMean(row: MadrasatiPercentages) {
  return (Number(row.manager_login_percent)+Number(row.teachers_login_percent)+Number(row.teachers_tools_percent)+Number(row.students_login_percent)+Number(row.students_tools_percent))/5;
}

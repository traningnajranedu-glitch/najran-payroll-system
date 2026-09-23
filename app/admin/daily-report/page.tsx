'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, MessageCircle, RefreshCw, Send, Settings2, Users, AlertCircle } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School={id:string;school_code:string;school_name:string;is_active:boolean;whatsapp_number?:string|null};
type Log={id:string;school_id:string|null;user_id:string|null;action:string;details:any;created_at:string};

function todayRiyadh(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function formatTime(value:string){
  return new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}

export default function DailyReportPage(){
  const sb=supabaseBrowser();
  const [loading,setLoading]=useState(true),[allowed,setAllowed]=useState(false),[schools,setSchools]=useState<School[]>([]),[logs,setLogs]=useState<Log[]>([]);
  const [phone,setPhone]=useState(''),[enabled,setEnabled]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const [date,setDate]=useState(todayRiyadh());

  async function load(){
    setLoading(true);setNotice('');setError('');
    const {data:{session}}=await sb.auth.getSession();
    const token=session?.access_token;
    if(!token){location.href='/';return;}
    const authCheck=await fetch('/api/admin/daily-report',{headers:{Authorization:'Bearer '+token}}).then(r=>r.ok).catch(()=>false);
    if(!authCheck){setLoading(false);setError('حسابك مسجل، لكن لم يتم التحقق من صلاحية مدير النظام. أعد تسجيل الدخول ثم حاول مرة أخرى.');return;}
    setAllowed(true);
    const [{data:s},{data:setting},{data:l,error:le}]=await Promise.all([
      sb.from('schools').select('id,school_code,school_name,is_active,whatsapp_number').order('school_name'),
      sb.from('daily_school_activity_settings').select('*').limit(1).maybeSingle(),
      sb.from('audit_logs').select('id,school_id,user_id,action,details,created_at').gte('created_at',date+'T00:00:00+03:00').lt('created_at',date+'T23:59:59.999+03:00').order('created_at',{ascending:false}).limit(1000)
    ]);
    if(le)setError('تعذر تحميل سجل النشاط: '+le.message);
    setSchools(s||[]);setLogs(l||[]);
    if(setting){setPhone(setting.recipient_phone||'');setEnabled(setting.is_enabled!==false);}
    setLoading(false);
  }
  useEffect(()=>{load()},[date]);

  const stats=useMemo(()=>{
    const activeSchools=schools.filter(s=>s.is_active);
    const schoolIds=new Set(logs.map(x=>x.school_id).filter(Boolean) as string[]);
    const actionCounts=logs.reduce<Record<string,number>>((a,x)=>{a[x.action]=(a[x.action]||0)+1;return a},{});
    return {active:activeSchools.length,activeToday:schoolIds.size,none:Math.max(0,activeSchools.length-schoolIds.size),events:logs.length,actionCounts};
  },[schools,logs]);

  const schoolRows=useMemo(()=>schools.filter(s=>s.is_active).map(s=>{
    const items=logs.filter(l=>l.school_id===s.id);
    const last=items[0];
    return {s,items,last};
  }),[schools,logs]);

  function buildReport(){
    const lines=[
      '📊 التقرير اليومي لبوابة المدارس للتعليم المستمر',
      'التاريخ: '+date,
      '',
      'إجمالي المدارس النشطة: '+stats.active,
      'مدارس نفذت نشاطًا اليوم: '+stats.activeToday,
      'مدارس دون نشاط مسجل: '+stats.none,
      'إجمالي العمليات المسجلة: '+stats.events,
      '',
      'العمليات: '+Object.entries(stats.actionCounts).map(([k,v])=>k+': '+v).join(' | '),
      '',
      'تفصيل المدارس:'
    ];
    for(const row of schoolRows){
      const name=row.s.school_name+' ('+row.s.school_code+')';
      if(!row.items.length) lines.push('• '+name+': لا يوجد نشاط مسجل اليوم.');
      else lines.push('• '+name+': '+row.items.length+' عملية'+(row.last?' — آخر نشاط '+formatTime(row.last.created_at):''));
    }
    return lines.join('\n');
  }

  async function saveSettings(){
    setBusy(true);setNotice('');setError('');
    if(!phone.trim()){setError('أدخل رقم WhatsApp المستلم بصيغة 9665XXXXXXXX.');setBusy(false);return;}
    const {data:{user}}=await sb.auth.getUser();
    const {data:existing}=await sb.from('daily_school_activity_settings').select('id').limit(1).maybeSingle();
    const payload={recipient_phone:phone.trim(),is_enabled:enabled,updated_at:new Date().toISOString(),created_by:user?.id||null};
    const result=existing?await sb.from('daily_school_activity_settings').update(payload).eq('id',existing.id):await sb.from('daily_school_activity_settings').insert(payload);
    if(result.error)setError('تعذر حفظ الإعدادات: '+result.error.message);else setNotice('تم حفظ إعدادات التقرير اليومي.');
    setBusy(false);
  }

  async function sendNow(){
    setBusy(true);setNotice('');setError('');
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('انتهت جلسة الدخول، أعد تسجيل الدخول.');
      const res=await fetch('/api/admin/daily-report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({date,phone:phone.trim()})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'تعذر إرسال التقرير');
      setNotice('تم طلب إرسال التقرير عبر WhatsApp بنجاح.');
    }catch(e:any){setError(e?.message||'حدث خطأ أثناء الإرسال.');}
    finally{setBusy(false);}
  }

  if(loading)return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل التقرير اليومي…</div></main>;
  if(!allowed)return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">الخدمة متاحة لمدير النظام فقط.</p></div></main>;

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-8"><div className="max-w-7xl mx-auto">
    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3/> التقرير اليومي لنشاط المدارس</h1><p className="text-gray-500 mt-1">متابعة نشاط حسابات المدارس وتجهيز التقرير اليومي للإرسال عبر WhatsApp.</p></div>
      <div className="flex gap-2"><button onClick={load} className="border bg-white rounded-xl p-3"><RefreshCw size={18}/></button><button onClick={()=>location.href='/admin'} className="border bg-white rounded-xl px-4 py-3 flex items-center gap-2"><ArrowRight size={17}/> لوحة المدير</button></div>
    </div>
    {notice&&<div className="bg-green-50 text-green-800 border border-green-100 rounded-xl px-4 py-3 mb-5"><CheckCircle2 className="inline ml-2" size={18}/>{notice}</div>}
    {error&&<div className="bg-red-50 text-red-800 border border-red-100 rounded-xl px-4 py-3 mb-5"><AlertCircle className="inline ml-2" size={18}/>{error}</div>}

    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div className="card p-5"><Building2Icon/><b className="block text-3xl mt-3">{stats.active}</b><span className="text-gray-500">المدارس النشطة</span></div>
      <div className="card p-5"><Users/><b className="block text-3xl mt-3">{stats.activeToday}</b><span className="text-gray-500">مدارس لها نشاط</span></div>
      <div className="card p-5"><AlertCircle/><b className="block text-3xl mt-3">{stats.none}</b><span className="text-gray-500">دون نشاط</span></div>
      <div className="card p-5"><BarChart3/><b className="block text-3xl mt-3">{stats.events}</b><span className="text-gray-500">إجمالي العمليات</span></div>
    </div>

    <div className="grid lg:grid-cols-3 gap-5">
      <div className="card p-5 lg:col-span-1">
        <h2 className="font-bold flex items-center gap-2 mb-4"><Settings2 size={19}/> إعداد الإرسال اليومي</h2>
        <label className="block text-sm font-semibold mb-2">رقم WhatsApp المستلم</label>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="9665XXXXXXXX" className="w-full border rounded-xl px-4 py-3"/>
        <label className="flex items-center gap-3 mt-4 cursor-pointer"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>تفعيل التقرير اليومي</span></label>
        <div className="bg-slate-50 rounded-xl p-4 mt-4 text-sm text-gray-600">موعد الإرسال المجدول: <b>8:00 مساءً بتوقيت السعودية</b>.</div>
        <div className="grid grid-cols-2 gap-2 mt-4"><button disabled={busy} onClick={saveSettings} className="bg-[var(--navy)] text-white rounded-xl px-4 py-3 font-bold">حفظ الإعدادات</button><button disabled={busy} onClick={sendNow} className="border rounded-xl px-4 py-3 font-bold flex items-center justify-center gap-2"><Send size={17}/> إرسال الآن</button></div>
      </div>

      <div className="card p-5 lg:col-span-2">
        <div className="flex flex-wrap justify-between gap-3 items-center mb-4"><div><h2 className="font-bold">معاينة التقرير</h2><p className="text-sm text-gray-500 mt-1">اختر التاريخ لمراجعة نشاط المدارس.</p></div><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-xl px-4 py-3"/></div>
        <pre className="whitespace-pre-wrap bg-slate-50 border rounded-xl p-4 text-sm leading-7 font-sans">{buildReport()}</pre>
      </div>
    </div>

    <div className="card overflow-hidden mt-5"><div className="p-5 border-b font-bold">تفصيل نشاط المدارس</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3 text-right">المدرسة</th><th className="p-3 text-right">عدد العمليات</th><th className="p-3 text-right">آخر نشاط</th><th className="p-3 text-right">العمليات</th></tr></thead><tbody>{schoolRows.map(row=><tr key={row.s.id} className="border-t align-top"><td className="p-3 font-semibold">{row.s.school_name}<div className="text-xs text-gray-500">{row.s.school_code}</div></td><td className="p-3">{row.items.length}</td><td className="p-3">{row.last?formatTime(row.last.created_at):'—'}</td><td className="p-3">{row.items.length?row.items.slice(0,8).map(x=><div key={x.id} className="mb-1"><span className="font-semibold">{x.action}</span> <span className="text-gray-500">{formatTime(x.created_at)}</span></div>):<span className="text-gray-400">لا يوجد نشاط مسجل</span>}</td></tr>)}</tbody></table></div></div>
  </div></main>;
}

function Building2Icon(){ return <div className="w-5 h-5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M6 21V4h12v17M9 8h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2"/></svg></div>; }

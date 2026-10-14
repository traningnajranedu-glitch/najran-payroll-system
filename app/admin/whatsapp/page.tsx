'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, MessageCircle, RefreshCw, Send, Users, Building2, AlertCircle, Link2 } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name?: string | null; contact_mobile?: string | null };
function validMobile(value?: string | null) {
  return /^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test((value || '').replace(/\D/g, ''));
}
type TargetMode = 'all' | 'single';
type ContactWindow = { phone: string; last_inbound_at: string };
function normalizedMobile(value?: string | null) { const d = (value || '').replace(/\D/g, ''); return d.startsWith('00966') ? d.slice(2) : d.startsWith('05') ? '966' + d.slice(1) : d.startsWith('5') ? '966' + d : d; }
function windowActive(value?: string) { const t = Date.parse(value || ''); return Number.isFinite(t) && t <= Date.now() && Date.now() - t < 86400000; }
type SendError = { school_name?: string; error: string };

export default function WhatsAppSchoolsPage() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [contactWindows, setContactWindows] = useState<ContactWindow[]>([]);
  const [windowError, setWindowError] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [mode, setMode] = useState<TargetMode>('all');
  const [schoolId, setSchoolId] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sendMode, setSendMode] = useState<'direct' | 'template'>('direct');
  const [documentUrl, setDocumentUrl] = useState('');
  const [dueDate,setDueDate]=useState('في أقرب وقت');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sendErrors, setSendErrors] = useState<SendError[]>([]);
  const [metaNotice, setMetaNotice] = useState('');
  const [reminderPreview, setReminderPreview] = useState<any>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID || '';
  const metaConfigId = process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || '';

  async function load() {
    setLoading(true); setNotice(''); setSendErrors([]);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }
    const { data: admin } = await sb.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) { setLoading(false); return; }
    setAllowed(true);
    const [{ data, error }, { data: profiles, error: profileError }, { data: windows, error: windowsError }] = await Promise.all([
      sb.from('schools').select('*').order('school_name'),
      sb.from('school_profiles').select('school_id,contact_mobile'),
      sb.from('whatsapp_contact_windows').select('phone,last_inbound_at'),
    ]);
    if (error || profileError) {
      setNotice('تعذر تحميل المدارس وأرقام التواصل: ' + (error || profileError)?.message);
      setSchools([]); setLoading(false); return;
    }
    setContactWindows(windows || []);
    setWindowError(windowsError ? 'تعذر قراءة سجل المحادثات: ' + windowsError.message : '');
    const mobiles = new Map((profiles || []).map(p => [p.school_id, p.contact_mobile]));
    setSchools((data || []).map(s => ({ ...s, contact_mobile: mobiles.get(s.id) || null })));
    if (!schoolId && data?.[0]) setSchoolId(data[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const timer = setInterval(() => setCurrentTime(Date.now()), 60000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!metaAppId || document.getElementById('facebook-jssdk')) return;
    (window as any).fbAsyncInit = () => (window as any).FB.init({ appId: metaAppId, cookie: true, xfbml: false, version: 'v23.0' });
    const script = document.createElement('script');
    script.id = 'facebook-jssdk'; script.async = true; script.defer = true; script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    document.body.appendChild(script);
  }, [metaAppId]);

  function startEmbeddedSignup() {
    setMetaNotice('');
    if (!metaAppId || !metaConfigId) return setMetaNotice('يلزم إضافة App ID وEmbedded Signup Configuration ID في Vercel أولاً.');
    const FB = (window as any).FB;
    if (!FB) return setMetaNotice('جارٍ تجهيز اتصال Meta. انتظر لحظات ثم أعد المحاولة.');
    FB.login((response: any) => {
      setMetaNotice(response?.authResponse?.code ? 'اكتملت نافذة التسجيل المضمّن في Meta. لا تفصل الرقم من تطبيق WhatsApp Business.' : 'لم تكتمل عملية الربط، ولم يتم تغيير رقم واتساب الحالي.');
    }, { config_id: metaConfigId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
  }

  const selectedSchool = schools.find(s => s.id === schoolId);
  const inboundByPhone = new Map(contactWindows.map(w => [w.phone, w.last_inbound_at]));
  function schoolStatus(s: School) { const date = inboundByPhone.get(normalizedMobile(s.contact_mobile)); const t = Date.parse(date || ''); return date && Number.isFinite(t) && t <= currentTime && currentTime - t < 86400000 ? 'متاح الرد المباشر' : date ? 'انتهت نافذة 24 ساعة' : 'لم تبدأ محادثة مسجلة'; }
  const activeWindows = schools.filter(s => s.is_active && validMobile(s.contact_mobile) && schoolStatus(s) === 'متاح الرد المباشر').length;
  const allRecipients = useMemo(() => schools.filter(s => s.is_active && validMobile(s.contact_mobile)), [schools]);
  const missingContacts = useMemo(() => schools.filter(s => s.is_active && !validMobile(s.contact_mobile)), [schools]);
  const targetCount = mode === 'single' ? (validMobile(phone || selectedSchool?.contact_mobile) ? 1 : 0) : allRecipients.length;

  async function previewWeeklyReminders() {
    setPreviewBusy(true);
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('يرجى تسجيل الدخول مجددًا');
      const res = await fetch('/api/automation/weekly-reminders', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر جلب المعاينة');
      setReminderPreview(data);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر عرض المعاينة'); }
    finally { setPreviewBusy(false); }
  }

  async function sendWeeklyRemindersNow() {
    if (!reminderPreview || !window.confirm('إرسال قالب التذكير الآن إلى المدارس غير المنجزة فقط (حتى ' + reminderPreview.valid_recipients + ' مدرسة)، مع استثناء مدرسة اختبار ومنع التكرار لهذا الأسبوع؟')) return;
    setPreviewBusy(true); setNotice('');
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('يرجى تسجيل الدخول مجددًا');
      const res = await fetch('/api/automation/weekly-reminders', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر إرسال التذكيرات');
      setNotice('قبلت Meta ' + data.accepted + ' تذكيرًا، فشل ' + data.failed + '، وتُخطي ' + data.skipped + '. القبول لا يؤكد التسليم.');
      await previewWeeklyReminders();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'تعذر الإرسال'); }
    finally { setPreviewBusy(false); }
  }

  async function sendTestReminder() {
    if (!window.confirm('هل تريد إرسال تذكير مؤشر منصة مدرستي إلى مدرسة اختبار فقط؟')) return;
    setBusy(true); setNotice(''); setSendErrors([]);
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) throw new Error('انتهت جلسة الدخول، يرجى تسجيل الدخول مجددًا.');
      const response = await fetch('/api/automation/whatsapp-test', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.reason || 'تعذر إرسال التذكير');
      setNotice(result.sent ? 'قبلت Meta رسالة التذكير لمدرسة اختبار. رقم التتبع: ' + result.providerMessageId : 'لم تُرسل الرسالة: ' + (result.reason || 'لم تتحقق شروط الإرسال'));
    } catch (err) {
      setNotice('تعذر إرسال التجربة: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'));
    } finally { setBusy(false); }
  }

  async function send() {
    setNotice(''); setSendErrors([]);
    if (!message.trim()) return setNotice('اكتب نص التعميم أو الخطاب أولاً.');
    if (mode === 'single' && !validMobile(phone.trim() || selectedSchool?.contact_mobile)) return setNotice('أدخل رقم جوال سعودي صالح للمدرسة.');
    if (mode === 'all' && !allRecipients.length) return setNotice('لا توجد أرقام تواصل صالحة في الملفات الشخصية للمدارس النشطة.');
    setBusy(true);
    try {
      const recipients = mode === 'single'
        ? [{ school_id: schoolId || null, school_name: selectedSchool?.school_name || 'مدرسة', phone: phone.trim() || selectedSchool?.contact_mobile }]
        : allRecipients.map(s => ({ school_id: s.id, school_name: s.school_name, phone: s.contact_mobile }));
      const res = await fetch('/api/admin/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients, sendMode, message: message.trim(), documentUrl: documentUrl.trim() || null, dueDate: dueDate.trim() || 'في أقرب وقت' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر إرسال الرسالة');
      setNotice(`قبلت Meta طلب الإرسال إلى ${data.sent} مدرسة${data.failed ? `، وتعذر الإرسال إلى ${data.failed}` : ''}. قبول الطلب لا يؤكد تسليم الرسالة؛ تحقق من وصولها لدى المستلم.`);
      setSendErrors(Array.isArray(data.errors) ? data.errors : []);
    } catch (e: any) {
      setNotice(e?.message || 'حدث خطأ أثناء الإرسال.');
    } finally { setBusy(false); }
  }

  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="card p-10">جارٍ تحميل خدمة التواصل…</div></main>;
  if (!allowed) return <main className="min-h-screen flex items-center justify-center p-5"><div className="card p-10 text-center"><h1 className="text-xl font-bold text-red-700">غير مصرح بالدخول</h1><p className="text-gray-500 mt-2">الخدمة متاحة لمدير النظام فقط.</p></div></main>;

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-8">
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><MessageCircle/> التواصل مع المدارس عبر واتساب</h1><p className="text-gray-500 mt-1">إرسال التعاميم والخطابات لجميع المدارس أو لمدرسة محددة.</p></div>
        <div className="flex gap-2"><button onClick={load} className="border bg-white rounded-xl p-3"><RefreshCw size={18}/></button><button onClick={() => location.href='/admin'} className="border bg-white rounded-xl px-4 py-3 flex items-center gap-2"><ArrowRight size={17}/> لوحة المدير</button></div>
      </div>

      <div className="card p-5 mb-5 border border-emerald-100 bg-emerald-50/40">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-bold">ربط WhatsApp Business الحالي</h2><p className="text-sm text-gray-600 mt-1">التسجيل المضمّن عبر Meta مع الحفاظ على الرقم الحالي وعدم استخدام الترحيل أو إلغاء الربط.</p></div>
          <button onClick={startEmbeddedSignup} className="bg-emerald-700 text-white rounded-xl px-5 py-3 font-bold flex items-center gap-2"><Link2 size={18}/> ربط WhatsApp Business</button>
        </div>
        {metaNotice && <div className="mt-3 bg-white border rounded-xl px-4 py-3 text-sm">{metaNotice}</div>}
      </div>

      {notice && <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-4 py-3 mb-5">{notice}</div>}

      {sendErrors.length > 0 && <div className="bg-red-50 text-red-800 border border-red-200 rounded-xl px-4 py-4 mb-5">
        <div className="font-bold flex items-center gap-2"><AlertCircle size={19}/> تفاصيل تعذر الإرسال</div>
        <div className="mt-3 space-y-2">
          {sendErrors.map((item, index) => <div key={index} className="bg-white/70 rounded-lg px-3 py-2 text-sm"><b>{item.school_name || 'المدرسة'}</b><div className="mt-1">{item.error}</div></div>)}
        </div>
      </div>}

      <section className="card p-5 mb-5 border border-[#d7af62] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-[#00523d]">التذكيرات الأسبوعية — إرسال ومعاينة</h2><p className="text-sm text-gray-600 mt-1">الأربعاء 9:00 صباحًا بتوقيت السعودية. فحص مؤشر منصة مدرستي والانضباط المدرسي، باستخدام قالب معتمد للمدارس غير المنجزة فقط، مع منع التكرار الأسبوعي.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={previewBusy} onClick={previewWeeklyReminders} className="rounded-xl bg-[#00523d] text-white px-4 py-3 font-semibold disabled:opacity-50">{previewBusy ? 'جارٍ الفحص…' : 'معاينة المدارس غير المنجزة'}</button><button type="button" disabled={previewBusy || !reminderPreview} onClick={sendWeeklyRemindersNow} className="rounded-xl bg-amber-600 text-white px-4 py-3 font-semibold disabled:opacity-50">إرسال التذكيرات الآن</button></div>
        </div>
        {reminderPreview && <div className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black">{reminderPreview.pending_schools}</div><div className="text-xs">مدارس غير منجزة</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black">{reminderPreview.pending_madrasati}</div><div className="text-xs">منصة مدرستي</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black">{reminderPreview.pending_discipline}</div><div className="text-xs">الانضباط المدرسي</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-2xl font-black">{reminderPreview.valid_recipients}</div><div className="text-xs">أرقام صالحة</div></div>
          </div>
          <p className="text-xs text-amber-700 mt-3 font-bold">مدرسة اختبار مستثناة. إرسال رسالة واحدة لكل مدرسة غير منجزة أسبوعيًا، وقد يُعاد عرض مدارس أُرسلت لها تذكيرات في قائمة المعاينة.</p>
          <div className="max-h-72 overflow-y-auto mt-3 divide-y">{reminderPreview.schools.map((item:any)=><div key={item.school_id} className="py-2 flex flex-wrap justify-between gap-2 text-sm"><span>{item.school_name}</span><span>{item.tasks.map((t:string)=>t==='madrasati'?'منصة مدرستي':'الانضباط').join('، ')} — {item.has_valid_mobile?'رقم صالح':'رقم غير متاح'}</span></div>)}</div>
        </div>}
      </section>

      <div className="card p-5 mb-5 border border-slate-200 bg-white">
        <h2 className="font-bold mb-2">حالة التواصل المباشر مع المدارس</h2>
        <p className="text-sm text-gray-600 mb-3">مدارس ضمن نافذة 24 ساعة: {activeWindows} من {allRecipients.length}. تعتمد الحالة على آخر رسالة واردة مسجلة من رقم المدرسة، وليس على قبول طلب الإرسال.</p>
        {windowError && <p className="text-sm text-red-700 mb-3">{windowError}</p>}
        <div className="max-h-72 overflow-auto space-y-2">{schools.filter(s => s.is_active).map(s => <div key={s.id} className="flex flex-wrap justify-between gap-2 border rounded-lg px-3 py-2 text-sm"><span>{s.school_name}</span><span className={schoolStatus(s) === 'متاح الرد المباشر' ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>{validMobile(s.contact_mobile) ? schoolStatus(s) : 'رقم غير صالح'}</span></div>)}</div>
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card p-5 lg:col-span-1">
          <h2 className="font-bold mb-4">جهة الإرسال</h2>
          <div className="grid gap-3">
            <button onClick={() => setMode('all')} className={`rounded-xl border p-4 text-right ${mode==='all'?'bg-[var(--navy)] text-white':'bg-white'}`}><div className="flex items-center gap-3"><Users/><div><b>جميع المدارس</b><div className="text-sm opacity-80 mt-1">إرسال التعميم لجميع المدارس المسجلة</div></div></div></button>
            <button onClick={() => setMode('single')} className={`rounded-xl border p-4 text-right ${mode==='single'?'bg-[var(--navy)] text-white':'bg-white'}`}><div className="flex items-center gap-3"><Building2/><div><b>مدرسة محددة</b><div className="text-sm opacity-80 mt-1">إرسال خطاب أو تعميم لمدرسة واحدة</div></div></div></button>
          </div>
          {mode === 'single' && <div className="mt-4 space-y-3"><select value={schoolId} onChange={e=>{setSchoolId(e.target.value); setPhone('')}} className="w-full border rounded-xl px-4 py-3"><option value="">اختر المدرسة</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><input value={phone || selectedSchool?.contact_mobile || ''} onChange={e=>setPhone(e.target.value)} placeholder="جوال التواصل من الملف الشخصي للمدرسة" className="w-full border rounded-xl px-4 py-3"/></div>}
          <div className="mt-5 bg-slate-50 rounded-xl p-4 text-sm"><b>عدد المستهدفين:</b> {targetCount} مدرسة</div>
          <p className="mt-2 text-xs text-gray-500">الأرقام من خانة جوال التواصل في الملف الشخصي لكل مدرسة. زر التحديث يجلب أحدث الأرقام.</p>
          {mode === 'all' && missingContacts.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><b>مدارس نشطة بلا رقم صالح ({missingContacts.length}):</b><p className="mt-1">{missingContacts.map(s => s.school_name).join('، ')}</p></div>}
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <h3 className="font-bold text-sky-950 mb-2">اختبار تنبيه منصة مدرستي</h3>
            <p className="text-sm text-sky-900 mb-3">يرسل القالب العربي المعتمد إلى رقم التواصل المحفوظ في الملف الشخصي لمدرسة «اختبار» فقط، إذا لم تُدخل مؤشر الأسبوع الحالي. لا يشمل بقية المدارس.</p>
            <button type="button" disabled={busy} onClick={sendTestReminder} className="bg-sky-800 text-white rounded-xl px-5 py-3 font-bold disabled:opacity-50 flex items-center gap-2"><Send size={17}/>{busy ? 'جارٍ تنفيذ الطلب…' : 'إرسال رسالة واتساب تجريبية'}</button>
          </div>
          <h2 className="font-bold mb-4">محتوى الرسالة</h2>
          <label htmlFor="whatsapp-send-mode" className="block text-sm font-bold mb-2">طريقة الإرسال</label>
          <select id="whatsapp-send-mode" value={sendMode} onChange={e=>setSendMode(e.target.value as 'direct' | 'template')} className="w-full border rounded-xl px-4 py-3 mb-3">
            <option value="direct">رسالة مباشرة</option>
            <option value="template">قالب إشعار مهمة</option>
          </select>
          <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">{sendMode === 'direct' ? 'للإرسال المباشر، يجب أن يرسل المستلم رسالة إلى رقم البوابة أولًا. يمكنك الرد خلال 24 ساعة من آخر رسالة منه. خارج هذه المدة يلزم قالب معتمد.' : 'يستخدم هذا الخيار قالب school_task_notification العربي بعد اعتماده في حساب واتساب المرتبط بالبوابة.'}</div>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={10} placeholder="اكتب الإجراء أو المهمة المطلوبة من المدرسة…" className="w-full border rounded-xl px-4 py-3 resize-y" />
          {sendMode === 'template' && <div className="mt-3"><label className="block text-sm font-bold mb-2">الموعد المطلوب للتنفيذ</label><input value={dueDate} onChange={e=>setDueDate(e.target.value)} placeholder="مثال: الخميس 15 أكتوبر 2026" className="w-full border rounded-xl px-4 py-3"/></div>}
          <div className="mt-3 flex items-center gap-2 border rounded-xl px-4 py-3"><FileText size={18}/><input value={documentUrl} onChange={e=>setDocumentUrl(e.target.value)} placeholder="رابط ملف PDF أو مستند اختياري (رابط عام)" className="outline-none flex-1"/></div>
          <p className="text-xs text-gray-500 mt-2">يُضاف رابط الملف إلى نص الرسالة ليتمكن المستلم من فتحه.</p>
          <div className="mt-5 flex justify-end"><button disabled={busy} onClick={send} className="bg-[var(--navy)] text-white rounded-xl px-7 py-3 font-bold flex items-center gap-2 disabled:opacity-50"><Send size={18}/>{busy?'جاري الإرسال…':'إرسال عبر واتساب'}</button></div>
        </div>
      </div>
    </div>
  </main>;
}

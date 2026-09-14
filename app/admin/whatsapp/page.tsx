'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, MessageCircle, RefreshCw, Send, Users, Building2, AlertCircle } from 'lucide-react';
import { supabaseBrowser } from '../../../lib/supabase';

type School = { id: string; school_code: string; school_name: string; is_active: boolean; manager_name?: string | null; whatsapp_number?: string | null };
type TargetMode = 'all' | 'single';
type SendError = { school_name?: string; error: string };

export default function WhatsAppSchoolsPage() {
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [mode, setMode] = useState<TargetMode>('all');
  const [schoolId, setSchoolId] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sendErrors, setSendErrors] = useState<SendError[]>([]);

  async function load() {
    setLoading(true); setNotice(''); setSendErrors([]);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = '/'; return; }
    const { data: admin } = await sb.from('admin_users').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (!admin) { setLoading(false); return; }
    setAllowed(true);
    const { data, error } = await sb.from('schools').select('*').order('school_name');
    if (error) setNotice('تعذر تحميل المدارس: ' + error.message);
    setSchools(data || []);
    if (!schoolId && data?.[0]) setSchoolId(data[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const selectedSchool = schools.find(s => s.id === schoolId);
  const targetCount = useMemo(() => mode === 'single' ? (phone || selectedSchool?.whatsapp_number ? 1 : 0) : schools.filter(s => s.whatsapp_number).length, [mode, phone, selectedSchool, schools]);

  async function send() {
    setNotice(''); setSendErrors([]);
    if (!message.trim()) return setNotice('اكتب نص التعميم أو الخطاب أولاً.');
    if (mode === 'single' && !phone.trim() && !selectedSchool?.whatsapp_number) return setNotice('أدخل رقم واتساب المدرسة.');
    if (mode === 'all' && !schools.some(s => s.whatsapp_number)) return setNotice('لا توجد أرقام واتساب مسجلة للمدارس حتى الآن.');
    setBusy(true);
    try {
      const recipients = mode === 'single'
        ? [{ school_id: schoolId || null, school_name: selectedSchool?.school_name || 'مدرسة', phone: phone.trim() || selectedSchool?.whatsapp_number }]
        : schools.filter(s => s.whatsapp_number).map(s => ({ school_id: s.id, school_name: s.school_name, phone: s.whatsapp_number }));
      const res = await fetch('/api/admin/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipients, message: message.trim(), documentUrl: documentUrl.trim() || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر إرسال الرسالة');
      setNotice(`تم إرسال الرسالة بنجاح إلى ${data.sent} مدرسة${data.failed ? `، وتعذر الإرسال إلى ${data.failed}` : ''}.`);
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

      {notice && <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-4 py-3 mb-5">{notice}</div>}

      {sendErrors.length > 0 && <div className="bg-red-50 text-red-800 border border-red-200 rounded-xl px-4 py-4 mb-5">
        <div className="font-bold flex items-center gap-2"><AlertCircle size={19}/> تفاصيل تعذر الإرسال</div>
        <div className="mt-3 space-y-2">
          {sendErrors.map((item, index) => <div key={index} className="bg-white/70 rounded-lg px-3 py-2 text-sm"><b>{item.school_name || 'المدرسة'}</b><div className="mt-1">{item.error}</div></div>)}
        </div>
      </div>}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="card p-5 lg:col-span-1">
          <h2 className="font-bold mb-4">جهة الإرسال</h2>
          <div className="grid gap-3">
            <button onClick={() => setMode('all')} className={`rounded-xl border p-4 text-right ${mode==='all'?'bg-[var(--navy)] text-white':'bg-white'}`}><div className="flex items-center gap-3"><Users/><div><b>جميع المدارس</b><div className="text-sm opacity-80 mt-1">إرسال التعميم لجميع المدارس المسجلة</div></div></div></button>
            <button onClick={() => setMode('single')} className={`rounded-xl border p-4 text-right ${mode==='single'?'bg-[var(--navy)] text-white':'bg-white'}`}><div className="flex items-center gap-3"><Building2/><div><b>مدرسة محددة</b><div className="text-sm opacity-80 mt-1">إرسال خطاب أو تعميم لمدرسة واحدة</div></div></div></button>
          </div>
          {mode === 'single' && <div className="mt-4 space-y-3"><select value={schoolId} onChange={e=>{setSchoolId(e.target.value); setPhone('')}} className="w-full border rounded-xl px-4 py-3"><option value="">اختر المدرسة</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select><input value={phone || selectedSchool?.whatsapp_number || ''} onChange={e=>setPhone(e.target.value)} placeholder="رقم واتساب المدرسة 9665XXXXXXXX" className="w-full border rounded-xl px-4 py-3"/></div>}
          <div className="mt-5 bg-slate-50 rounded-xl p-4 text-sm"><b>عدد المستهدفين:</b> {targetCount} مدرسة</div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="font-bold mb-4">محتوى الرسالة</h2>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={10} placeholder="اكتب نص التعميم أو الخطاب هنا…" className="w-full border rounded-xl px-4 py-3 resize-y" />
          <div className="mt-3 flex items-center gap-2 border rounded-xl px-4 py-3"><FileText size={18}/><input value={documentUrl} onChange={e=>setDocumentUrl(e.target.value)} placeholder="رابط ملف PDF أو مستند اختياري (رابط عام)" className="outline-none flex-1"/></div>
          <p className="text-xs text-gray-500 mt-2">يمكن إرفاق الخطاب عبر رابط ملف عام، وسيتم إرساله كمستند واتساب.</p>
          <div className="mt-5 flex justify-end"><button disabled={busy} onClick={send} className="bg-[var(--navy)] text-white rounded-xl px-7 py-3 font-bold flex items-center gap-2 disabled:opacity-50"><Send size={18}/>{busy?'جاري الإرسال…':'إرسال عبر واتساب'}</button></div>
        </div>
      </div>
    </div>
  </main>;
}

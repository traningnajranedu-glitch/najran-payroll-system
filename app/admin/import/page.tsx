'use client';

import { useEffect, useState } from 'react';
import { FileSpreadsheet, Download, Upload, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabaseBrowser } from '../../../lib/supabase';

type Mode = 'schools' | 'teachers' | 'accounts';
const configs = {
  schools: { title:'استيراد المدارس', fields:[['school_code','رمز المدرسة'],['school_name','اسم المدرسة'],['manager_name','اسم مدير المدرسة'],['is_active','نشطة؟']] },
  teachers: { title:'استيراد الموظفين وإسنادهم للمدارس', fields:[['school_code','رمز المدرسة'],['full_name','اسم الموظف'],['national_id','رقم الهوية / السجل المدني'],['job_role','الوظيفة'],['specialization','التخصص'],['is_active','نشط؟']] },
  accounts: { title:'استيراد حسابات المدارس', fields:[['school_code','رمز المدرسة'],['username','اسم المستخدم'],['password','كلمة المرور'],['display_name','اسم مسؤول الحساب'],['is_active','نشط؟']] },
} as const;

export default function ImportPage() {
  const sb = supabaseBrowser();
  const [mode,setMode]=useState<Mode>('schools');
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{(async()=>{const {data:{user}}=await sb.auth.getUser();if(!user){location.href='/';return;}const {data}=await sb.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();if(!data)location.href='/';})()},[]);

  function downloadTemplate() {
    const c = configs[mode];
    const header = c.fields.map(x=>x[0]);
    const example = mode==='schools'
      ? ['101','مدرسة نموذجية','أحمد محمد', 'true']
      : mode==='teachers'
        ? ['101','محمد أحمد علي','1234567890','معلم','رياضيات','true']
        : ['101','school101','ChangeMe123','مسؤول مدرسة نموذجية','true'];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'البيانات');
    XLSX.writeFile(wb, mode==='schools'?'قالب_المدارس.xlsx':mode==='teachers'?'قالب_الموظفين.xlsx':'قالب_حسابات_المدارس.xlsx');
  }

  async function upload() {
    if(!file){setError('اختر ملف Excel أولًا.');return;}
    setBusy(true);setMessage('جاري التحقق والاستيراد…');setError('');
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token){setError('انتهت جلسة الدخول.');setBusy(false);return;}
    const fd=new FormData();fd.append('file',file);fd.append('mode',mode);
    const res=await fetch('/api/admin/import-excel',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:fd});
    const result=await res.json();
    if(!res.ok){setError(result.error||'تعذر الاستيراد.');setMessage('');}
    else{
      setMessage(`تمت العملية. جديد: ${result.added} — محدث: ${result.updated} — متجاوز: ${result.skipped}${result.errors?.length?' — توجد ملاحظات في القائمة أدناه.':''}`);
      if(result.errors?.length)setError(result.errors.slice(0,20).join(' | '));
      setFile(null);
    }
    setBusy(false);
  }

  const c=configs[mode];
  return <main dir="rtl" className="min-h-screen bg-slate-50 p-5 md:p-8">
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="bg-[var(--navy)] text-white rounded-2xl p-6">
        <h1 className="text-2xl font-bold">استيراد البيانات من Excel</h1>
        <p className="text-blue-100 mt-1">إضافة المدارس والموظفين المسندين لكل مدرسة وحسابات الدخول دفعة واحدة.</p>
      </header>
      <section className="grid md:grid-cols-3 gap-3">
        {(Object.keys(configs) as Mode[]).map(x=><button key={x} onClick={()=>{setMode(x);setFile(null);setMessage('');setError('')}} className={`card p-5 text-right border-2 ${mode===x?'border-blue-600':'border-transparent'}`}><FileSpreadsheet className="mb-3"/><b>{configs[x].title}</b><p className="text-sm text-gray-500 mt-1">{x==='schools'?'استيراد قائمة المدارس':x==='teachers'?'استيراد الموظفين مع رمز المدرسة':'إنشاء أو تحديث حسابات المدارس'}</p></button>)}
      </section>
      <section className="card p-6">
        <div className="flex flex-wrap gap-3 justify-between items-center mb-5">
          <div><h2 className="text-xl font-bold">{c.title}</h2><p className="text-sm text-gray-500 mt-1">الأعمدة المطلوبة في الملف:</p></div>
          <button onClick={downloadTemplate} className="border rounded-xl px-4 py-2 flex items-center gap-2"><Download size={17}/> تحميل قالب Excel</button>
        </div>
        <div className="overflow-x-auto mb-5"><table className="w-full text-sm"><thead><tr className="bg-gray-50">{c.fields.map(x=><th key={x[0]} className="p-3 text-right">{x[1]}<div className="text-[11px] font-normal text-gray-400" dir="ltr">{x[0]}</div></th>)}</tr></thead><tbody><tr className="border-t">{c.fields.map(x=><td key={x[0]} className="p-3 text-gray-600">{x[0]==='job_role'?'معلم':x[0]==='national_id'?'1234567890':x[0]==='school_code'?'101':x[0]==='is_active'?'true':'مثال'}</td>)}</tr></tbody></table></div>
        <label className="block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer hover:bg-slate-50">
          <Upload className="mx-auto mb-3" size={30}/>
          <b>{file?file.name:'اختر ملف Excel'}</b><p className="text-sm text-gray-500 mt-1">XLSX أو XLS — حتى 10MB</p>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)}/>
        </label>
        {message&&<div className="mt-4 bg-green-50 border border-green-200 text-green-800 rounded-xl p-4">{message}</div>}
        {error&&<div className="mt-4 bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">{error}</div>}
        <button disabled={busy||!file} onClick={upload} className="mt-5 bg-[var(--navy)] text-white rounded-xl px-6 py-3 font-bold disabled:opacity-50 flex items-center gap-2"><RefreshCw size={17}/>{busy?'جاري الاستيراد…':'بدء الاستيراد'}</button>
        <div className="mt-5 text-xs text-gray-500 space-y-1">
          <p>• استيراد الموظفين يعتمد على <b>رمز المدرسة</b> لإسناد كل موظف تلقائيًا.</p>
          <p>• رقم الهوية/السجل المدني يجب أن يكون 10 أرقام.</p>
          <p>• الحسابات تستخدم Supabase Auth؛ كلمة المرور لا تُخزن في جدول البيانات.</p>
          <p>• إذا كان السجل موجودًا، يتم تحديثه بدل إنشاء سجل مكرر.</p>
        </div>
      </section>
    </div>
  </main>;
}

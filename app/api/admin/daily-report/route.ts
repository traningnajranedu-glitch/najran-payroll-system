import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('05')) return '966' + digits.slice(1);
  if (digits.startsWith('5')) return '966' + digits;
  return digits;
}
function dateRange(date:string){
  return {from:date+'T00:00:00+03:00',to:date+'T23:59:59.999+03:00'};
}
function riyadhDate(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function time(value:string){
  return new Intl.DateTimeFormat('ar-SA',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}

async function isAdmin(supabase:any, request:Request){
  const auth=request.headers.get('authorization')||'';
  if(auth.startsWith('Bearer ')){
    const token=auth.slice(7);
    const {data:{user}}=await supabase.auth.getUser(token);
    if(user){
      const {data}=await supabase.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
      if(data)return true;
    }
  }
  return false;
}

async function buildReport(supabase:any,date:string){
  const {from,to}=dateRange(date);
  const [{data:schools,error:se},{data:logs,error:le}]=await Promise.all([
    supabase.from('schools').select('id,school_code,school_name,is_active').eq('is_active',true).order('school_name'),
    supabase.from('audit_logs').select('id,school_id,action,details,created_at').gte('created_at',from).lt('created_at',to).order('created_at',{ascending:false}).limit(2000)
  ]);
  if(se)throw new Error(se.message); if(le)throw new Error(le.message);
  const activeSchools=schools||[], activityLogs=logs||[];
  const schoolIds=new Set(activityLogs.map((x:any)=>x.school_id).filter(Boolean));
  const counts=activityLogs.reduce((a:any,x:any)=>{a[x.action]=(a[x.action]||0)+1;return a},{});
  const lines=[
    '📊 التقرير اليومي لبوابة المدارس للتعليم المستمر',
    'التاريخ: '+date,
    '',
    'إجمالي المدارس النشطة: '+activeSchools.length,
    'مدارس نفذت نشاطًا: '+schoolIds.size,
    'مدارس دون نشاط مسجل: '+Math.max(0,activeSchools.length-schoolIds.size),
    'إجمالي العمليات: '+activityLogs.length,
    '',
    'العمليات: '+(Object.entries(counts).map(([k,v])=>k+': '+v).join(' | ')||'لا توجد عمليات'),
    '',
    'تفصيل المدارس:'
  ];
  for(const s of activeSchools){
    const items=activityLogs.filter((x:any)=>x.school_id===s.id);
    lines.push(items.length
      ? '• '+s.school_name+' ('+s.school_code+'): '+items.length+' عملية — آخر نشاط '+time(items[0].created_at)
      : '• '+s.school_name+' ('+s.school_code+'): لا يوجد نشاط مسجل اليوم');
  }
  return lines.join('\n');
}

async function sendWhatsApp(phone:string,message:string){
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
  if(!token||!phoneNumberId)throw new Error('لم يتم إعداد WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID في Vercel.');
  const to=normalizePhone(phone);
  if(to.length<10)throw new Error('رقم WhatsApp المستلم غير صالح.');
  const endpoint='https://graph.facebook.com/'+graphVersion+'/'+phoneNumberId+'/messages';
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{preview_url:false,body:message}})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error?.message||'رفضت Meta عملية إرسال WhatsApp.');
  return result;
}

export async function POST(request:Request){
  try{
    const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const cronSecret=process.env.CRON_SECRET;
    const authorization=request.headers.get('authorization')||'';
    const cronAuthorized=!!cronSecret&&authorization==='Bearer '+cronSecret;
    if(!cronAuthorized&&!await isAdmin(supabase,request))return NextResponse.json({error:'غير مصرح بالدخول'},{status:401});

    const body=await request.json().catch(()=>({}));
    const date=String(body.date||riyadhDate());
    let phone=String(body.phone||'').trim();
    if(!phone){
      const {data:setting}=await supabase.from('daily_school_activity_settings').select('recipient_phone,is_enabled').limit(1).maybeSingle();
      if(!setting?.is_enabled)return NextResponse.json({message:'التقرير اليومي غير مفعل.'});
      phone=String(setting.recipient_phone||'').trim();
    }
    if(!phone)return NextResponse.json({error:'لم يتم تحديد رقم WhatsApp للتقرير اليومي.'},{status:400});

    const report=await buildReport(supabase,date);
    await sendWhatsApp(phone,report);
    await supabase.from('daily_school_activity_settings').update({last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).not('id','is',null);
    return NextResponse.json({ok:true,date});
  }catch(error:any){
    return NextResponse.json({error:error?.message||'حدث خطأ غير متوقع'},{status:500});
  }
}


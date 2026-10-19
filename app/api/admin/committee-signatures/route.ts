import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

function db() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) throw new Error('إعدادات Supabase غير مكتملة');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function authorize(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token) return null;
 const client=db();
 const {data:{user}}=await client.auth.getUser(token);
 if(!user) return null;
 const {data:admin}=await client.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
 return admin?client:null;
}
export async function GET(request:Request){
 try {
  const client=await authorize(request);
  if(!client) return NextResponse.json({error:'غير مصرح'},{status:403});
  const periodId=new URL(request.url).searchParams.get('periodId');
  if(!periodId) return NextResponse.json({items:[]});
  const {data,error}=await client.from('payroll_committee_signatures').select('member_slot,member_name,signed_at,signature_data').eq('period_id',periodId);
  if(error) throw error;
  return NextResponse.json({items:data||[]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'خطأ'},{status:500})}
}
export async function POST(request:Request){
 try{
  const client=await authorize(request);
  if(!client) return NextResponse.json({error:'غير مصرح'},{status:403});
  const {periodId,slot,name,phone}=await request.json();
  if(typeof periodId!=='string'||!periodId||![0,1,2].includes(slot)||typeof name!=='string'||!name.trim()||typeof phone!=='string'||!/^9665\d{8}$/.test(phone))
   return NextResponse.json({error:'أدخل الاسم ورقم الجوال بصيغة 9665XXXXXXXX وحدد الفترة'},{status:400});
  const {data:period}=await client.from('payroll_periods').select('id').eq('id',periodId).maybeSingle();
  if(!period) return NextResponse.json({error:'فترة غير موجودة'},{status:400});
  const token=randomBytes(32).toString('hex');
  const hash=createHash('sha256').update(token).digest('hex');
  const {data:existing}=await client.from('payroll_committee_signatures').select('signed_at').eq('period_id',periodId).eq('member_slot',slot).maybeSingle();
  if(existing?.signed_at) return NextResponse.json({error:'تم اعتماد التوقيع مسبقًا؛ لا يمكن إصدار رابط بديل تلقائيًا'},{status:409});
  const {error}=await client.from('payroll_committee_signatures').upsert({period_id:periodId,member_slot:slot,member_name:name.trim(),phone,token_hash:hash,expires_at:new Date(Date.now()+48*3600000).toISOString(),signed_at:null,signature_data:null},{onConflict:'period_id,member_slot'});
  if(error) throw error;
  const origin=new URL(request.url).origin;
  const link=origin+'/committee-sign/'+token;
  const message='السلام عليكم، نأمل اعتماد توقيع لجنة مسيرات مدارس التعليم المستمر عبر الرابط الآمن التالي (صالح لمدة 48 ساعة): '+link;
  return NextResponse.json({whatsapp:'https://wa.me/'+phone+'?text='+encodeURIComponent(message)});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'خطأ'},{status:500})}
}

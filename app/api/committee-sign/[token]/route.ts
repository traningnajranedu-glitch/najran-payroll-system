import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
function client(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) throw new Error('إعدادات الخادم غير مكتملة');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function lookup(token:string){
 if(!/^[a-f0-9]{64}$/.test(token)) return null;
 const hash=createHash('sha256').update(token).digest('hex');
 const {data}=await client().from('payroll_committee_signatures').select('*').eq('token_hash',hash).maybeSingle();
 return data;
}
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const row=await lookup((await params).token);
  if(!row||new Date(row.expires_at).getTime()<Date.now()) return NextResponse.json({error:'الرابط غير صالح أو منتهي'},{status:404});
  return NextResponse.json({name:row.member_name,signed:!!row.signed_at});
 }catch{return NextResponse.json({error:'تعذر التحقق من الرابط'},{status:500})}
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const token=(await params).token,row=await lookup(token);
  if(!row||row.signed_at||new Date(row.expires_at).getTime()<Date.now()) return NextResponse.json({error:'الرابط مستخدم أو منتهي'},{status:403});
  const {signature}=await request.json();
  if(typeof signature!=='string'||signature.length>180000||!/^data:image\\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) return NextResponse.json({error:'التوقيع غير صالح'},{status:400});
  const {data,error}=await client().from('payroll_committee_signatures').update({signature_data:signature,signed_at:new Date().toISOString()}).eq('id',row.id).is('signed_at',null).select('id');
  if(error) throw error;
  if(!data?.length) return NextResponse.json({error:'تم اعتماد التوقيع مسبقًا'},{status:409});
  return NextResponse.json({success:true});
 }catch{return NextResponse.json({error:'تعذر حفظ التوقيع'},{status:500})}
}

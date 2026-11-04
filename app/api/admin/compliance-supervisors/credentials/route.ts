import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||!secret)return NextResponse.json({error:'إعدادات الخادم غير مكتملة'},{status:503});
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'يلزم تسجيل الدخول'},{status:401});
  const auth=createClient(url,key,{auth:{persistSession:false}});
  const {data:{user},error:authErr}=await auth.auth.getUser(token);
  if(authErr||!user)return NextResponse.json({error:'جلسة غير صالحة'},{status:401});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin,error:adminErr}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(adminErr||!admin)return NextResponse.json({error:'غير مصرح: العملية لمدير النظام فقط'},{status:403});
  const body=await req.json();const id=String(body.id||'').trim();
  if(!id)return NextResponse.json({error:'معرف المشرف مطلوب'},{status:400});
  const {data:s,error:readErr}=await db.from('compliance_supervisors').select('id,auth_user_id,full_name,phone,is_active').eq('id',id).maybeSingle();
  if(readErr||!s)return NextResponse.json({error:'المشرف غير موجود'},{status:404});
  if(!s.is_active||!s.auth_user_id||!s.phone)return NextResponse.json({error:'الحساب موقوف أو بياناته ناقصة'},{status:409});
  const password=randomBytes(24).toString('base64url')+'R7!';
  const {error:updateErr}=await db.auth.admin.updateUserById(s.auth_user_id,{password});
  if(updateErr)return NextResponse.json({error:'تعذر تحديث كلمة المرور'},{status:500});
  const {data:account}=await db.auth.admin.getUserById(s.auth_user_id);
  return NextResponse.json({success:true,name:s.full_name,phone:String(s.phone).replace(/\D/g,''),username:account.user?.email?.split('@')[0]||'',password},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache'}});
 }catch{return NextResponse.json({error:'تعذر إصدار بيانات الدخول'},{status:500});}
}
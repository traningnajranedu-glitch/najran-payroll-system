import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';

async function adminClient(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!secret) throw new Error('إعدادات الخادم غير مكتملة');
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token) throw new Error('يلزم تسجيل الدخول');
 const auth=createClient(url,key,{auth:{persistSession:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user) throw new Error('جلسة غير صالحة');
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
 if(!admin) throw new Error('غير مصرح: العملية لمدير النظام فقط');
 return db;
}
const fail=(e:unknown)=>NextResponse.json({error:e instanceof Error?e.message:'تعذر تنفيذ العملية'},{status:e instanceof Error&&e.message==='غير مصرح: العملية لمدير النظام فقط'?403:401,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 try{
  const db=await adminClient(req);
  const {data:rows,error}=await db.from('compliance_supervisors').select('id,auth_user_id');
  if(error) throw error;
  const {data:users,error:userError}=await db.auth.admin.listUsers({page:1,perPage:1000});
  if(userError) throw userError;
  const byId=new Map(users.users.map(u=>[u.id,u.email||'']));
  const credentials=Object.fromEntries((rows||[]).map(s=>[s.id,(byId.get(s.auth_user_id)||'').replace(/@schools\.ceedu\.local$/i,'')]));
  return NextResponse.json({credentials},{headers:{'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache'}});
 }catch(e){return fail(e);}
}
export async function PATCH(req:NextRequest){
 try{
  const db=await adminClient(req);
  const body=await req.json();
  const id=String(body.id||'').trim();
  const username=String(body.username||'').trim().toLowerCase();
  const password=typeof body.password==='string'?body.password:'';
  const name=String(body.name||'').trim().replace(/\s+/g,' ');
  const phone=String(body.phone||'').replace(/\D/g,'');
  if(!id||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) return NextResponse.json({error:'اسم المستخدم يجب أن يكون من 3 إلى 40 حرفًا إنجليزيًا أو رقمًا، ويمكن استخدام النقطة والشرطة والشرطة السفلية.'},{status:400});
  if(password&&password.length<12) return NextResponse.json({error:'كلمة المرور يجب ألا تقل عن 12 حرفًا.'},{status:400});
  if(name.length<3||!(/^(?:9665\d{8}|05\d{8}|5\d{8})$/.test(phone))) return NextResponse.json({error:'الاسم أو رقم الجوال غير صحيح'},{status:400});
  const normalized=phone.startsWith('966')?phone:phone.startsWith('0')?'966'+phone.slice(1):'966'+phone;
  const {data:other}=await db.from('compliance_supervisors').select('id').eq('phone',normalized).neq('id',id).limit(1);
  if(other?.length) return NextResponse.json({error:'رقم الجوال مسجل لمشرف آخر'},{status:409});
  const {data:s,error:readError}=await db.from('compliance_supervisors').select('id,auth_user_id,is_active').eq('id',id).maybeSingle();
  if(readError||!s) return NextResponse.json({error:'المشرف غير موجود'},{status:404});
  if(!s.is_active||!s.auth_user_id) return NextResponse.json({error:'حساب المشرف موقوف أو غير مرتبط'},{status:409});
  const email=username+'@schools.ceedu.local';
  const {data:users,error:listError}=await db.auth.admin.listUsers({page:1,perPage:1000});
  if(listError) throw listError;
  if(users.users.some(u=>u.id!==s.auth_user_id&&u.email?.toLowerCase()===email)) return NextResponse.json({error:'اسم المستخدم مستخدم لحساب آخر'},{status:409});
  const update:Record<string,unknown>={email,email_confirm:true,user_metadata:{full_name:name}};
  if(password) update.password=password;
  const {error:updateError}=await db.auth.admin.updateUserById(s.auth_user_id,update);
  if(updateError) return NextResponse.json({error:'تعذر تحديث بيانات الدخول: '+updateError.message},{status:400});
  const {error:profileError}=await db.from('compliance_supervisors').update({full_name:name,phone:normalized}).eq('id',id);
  if(profileError) return NextResponse.json({error:'تم تحديث بيانات الدخول لكن تعذر حفظ ملف المشرف: '+profileError.message},{status:500});
  return NextResponse.json({success:true,username,passwordChanged:!!password},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e);}
}

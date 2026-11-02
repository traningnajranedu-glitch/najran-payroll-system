import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const metaToken=process.env.META_WHATSAPP_ACCESS_TOKEN,phoneId=process.env.META_WHATSAPP_PHONE_NUMBER_ID,template=process.env.META_WHATSAPP_REMINDER_TEMPLATE;
 if(!url||!pub||!secret)return NextResponse.json({error:'إعدادات قاعدة البيانات غير مكتملة'},{status:503});
 const bearer=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!bearer)return NextResponse.json({error:'يلزم تسجيل الدخول'},{status:401});
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(bearer);
 if(authError||!user)return NextResponse.json({error:'جلسة غير صالحة'},{status:401});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
 if(!admin)return NextResponse.json({error:'غير مصرح'},{status:403});
 const {supervisorId}=await request.json();
 const {data:supervisor,error:se}=await db.from('compliance_supervisors').select('id,full_name,phone,is_active').eq('id',supervisorId).single();
 if(se||!supervisor||!supervisor.is_active)return NextResponse.json({error:'المشرف غير موجود أو غير نشط'},{status:404});
 if(!metaToken||!phoneId||!template)return NextResponse.json({error:'إرسال Meta غير مهيأ. يلزم رمز الوصول ومعرّف رقم واتساب واسم قالب تذكير معتمد في Meta.'},{status:503});
 const recipient=String(supervisor.phone||'').replace(/\D/g,'');
 if(!/^9665\d{8}$/.test(recipient))return NextResponse.json({error:'رقم جوال المشرف غير صالح'},{status:400});
 const response=await fetch('https://graph.facebook.com/v22.0/'+encodeURIComponent(phoneId)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+metaToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:recipient,type:'template',template:{name:template,language:{code:process.env.META_WHATSAPP_REMINDER_LANGUAGE||'ar'}}}),cache:'no-store'});
 const result=await response.json();
 if(!response.ok)return NextResponse.json({error:result?.error?.message||'رفضت Meta إرسال القالب'},{status:502});
 return NextResponse.json({success:true,messageId:result?.messages?.[0]?.id||null});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'تعذر إرسال التذكير'},{status:500});}
}

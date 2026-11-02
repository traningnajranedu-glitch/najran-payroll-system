import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||!secret)return NextResponse.json({error:'إعدادات المصادقة غير مكتملة'},{status:503});
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'يلزم تسجيل الدخول'},{status:401});
  const auth=createClient(url,key,{auth:{persistSession:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user)return NextResponse.json({error:'جلسة غير صالحة'},{status:401});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
  if(!admin)return NextResponse.json({error:'صلاحية مدير النظام مطلوبة'},{status:403});
  const waToken=process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template=process.env.WHATSAPP_SUPERVISOR_CREDENTIALS_TEMPLATE;
  const recipient=process.env.WHATSAPP_TEST_ALLOWED_RECIPIENT?.replace(/\D/g,'');
  if(!waToken||!phoneId||!template||!recipient)return NextResponse.json({error:'إعدادات اختبار واتساب أو القالب غير مكتملة'},{status:503});
  const response=await fetch('https://graph.facebook.com/v22.0/'+encodeURIComponent(phoneId)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+waToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:recipient,type:'template',template:{name:template,language:{code:'ar'},components:[{type:'body',parameters:[{type:'text',text:'مشرف تجريبي'},{type:'text',text:'rifad_test_user'},{type:'text',text:'TEST-NOT-A-REAL-PASSWORD'}]}]}}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)return NextResponse.json({accepted:false,error:result?.error?.message||'رفضت Meta طلب الاختبار',code:result?.error?.code||null},{status:502,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({accepted:true,deliveryConfirmed:false,messageId:result?.messages?.[0]?.id||null,notice:'قبلت Meta الطلب، لكن التسليم لم يتأكد بعد'},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'تعذر تنفيذ اختبار Meta'},{status:500});}
}

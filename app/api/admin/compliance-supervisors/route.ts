import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
export const runtime='nodejs';
const arabicLetters:Record<string,string>={ا:'a',أ:'a',إ:'i',آ:'a',ب:'b',ت:'t',ث:'th',ج:'j',ح:'h',خ:'kh',د:'d',ذ:'dh',ر:'r',ز:'z',س:'s',ش:'sh',ص:'s',ض:'d',ط:'t',ظ:'z',ع:'a',غ:'gh',ف:'f',ق:'q',ك:'k',ل:'l',م:'m',ن:'n',ه:'h',ة:'h',و:'w',ؤ:'w',ي:'y',ى:'a',ئ:'y',ء:'',پ:'p',ڤ:'v',چ:'ch',گ:'g'};
function transliterate(part:string){return [...part.normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'')].map(ch=>arabicLetters[ch]??ch).join('').toLowerCase().replace(/[^a-z]/g,'');}
function supervisorUsername(name:string){const parts=name.trim().split(/\s+/);const first=transliterate(parts[0]);const last=parts.length>1?transliterate(parts[parts.length-1]):'';return first&&last?first+'.'+last:'';}

async function authorized(request:NextRequest){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!pub||!secret)throw Error('إعدادات الخادم غير مكتملة');const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)throw Error('يلزم تسجيل الدخول');const publicClient=createClient(url,pub,{auth:{persistSession:false}});const {data:{user},error}=await publicClient.auth.getUser(token);if(error||!user)throw Error('جلسة غير صالحة');const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});const {data:admin}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();if(!admin)throw Error('غير مصرح');return db;}
export async function POST(request:NextRequest){
 try{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!pub||!secret)return NextResponse.json({error:'إعدادات إنشاء الحسابات غير مكتملة على الخادم'},{status:503});
 const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return NextResponse.json({error:'يلزم تسجيل الدخول'},{status:401});
 const client=createClient(url,pub,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return NextResponse.json({error:'جلسة غير صالحة'},{status:401});
 const service=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin,error:adminError}=await service.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
 if(adminError||!admin)return NextResponse.json({error:'غير مصرح'},{status:403});
 const waToken=process.env.WHATSAPP_ACCESS_TOKEN;
 const waPhoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
 const waTemplate=process.env.WHATSAPP_SUPERVISOR_CREDENTIALS_TEMPLATE;
 if(!waToken||!waPhoneId||!waTemplate)return NextResponse.json({error:'يلزم إعداد قالب Meta معتمد لبيانات دخول المشرف وربط إعدادات واتساب قبل إنشاء الحساب'},{status:503});
 const body=await request.json();
 const name=String(body.name||'').trim().replace(/\s+/g,' ');
 const phone=String(body.phone||'').replace(/[^\d]/g,'');
 if(name.length<3||name.length>120||!(/^(?:9665\d{8}|05\d{8}|5\d{8})$/.test(phone)))return NextResponse.json({error:'أدخل الاسم ورقم جوال سعودي صحيح'},{status:400});
 const normalized=phone.startsWith('966')?phone:phone.startsWith('0')?'966'+phone.slice(1):'966'+phone;
 const {data:exists}=await service.from('compliance_supervisors').select('id').eq('phone',normalized).limit(1);
 if(exists?.length)return NextResponse.json({error:'هذا الجوال مسجل لمشرف سابق'},{status:409});
 const username=supervisorUsername(name);
 if(!username)return NextResponse.json({error:'أدخل الاسم الأول واسم العائلة لتوليد اسم المستخدم بالإنجليزية'},{status:400});
 const {data:existingUsers,error:listError}=await service.auth.admin.listUsers({page:1,perPage:1000});
 if(listError)return NextResponse.json({error:'تعذر التحقق من تكرار اسم المستخدم'},{status:500});
 if(existingUsers.users.some(u=>u.email?.toLowerCase()===username+'@schools.ceedu.local'))return NextResponse.json({error:'اسم المستخدم موجود مسبقًا، يرجى مراجعة اسم المشرف'},{status:409});
 const password=randomBytes(18).toString('base64url')+'A7!';
 const email=username+'@schools.ceedu.local';
 const {data:created,error:createError}=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{rifad_role:'compliance_supervisor'},user_metadata:{full_name:name}});
 if(createError||!created.user)return NextResponse.json({error:createError?.message||'تعذر إنشاء الحساب'},{status:500});
 const {error:insertError}=await service.from('compliance_supervisors').insert({auth_user_id:created.user.id,full_name:name,phone:normalized,is_active:true});
 if(insertError){await service.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:'تعذر ربط صلاحية المشرف: '+insertError.message},{status:500});}
 const waResponse=await fetch('https://graph.facebook.com/v22.0/'+encodeURIComponent(waPhoneId)+'/messages',{method:'POST',headers:{Authorization:'Bearer '+waToken,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:normalized,type:'template',template:{name:waTemplate,language:{code:'ar'},components:[{type:'body',parameters:[{type:'text',text:name},{type:'text',text:username},{type:'text',text:password}]}]}}),cache:'no-store'});
 if(!waResponse.ok)return NextResponse.json({created:true,sent:false,error:'تم إنشاء الحساب، لكن Meta رفضت طلب إرسال بيانات الدخول. راجع القالب المعتمد ثم أعد تعيين كلمة المرور وإرسالها بطريقة آمنة.'},{status:502,headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({created:true,sent:true,name,phone:normalized,username},{headers:{'Cache-Control':'no-store'}});

 }catch{return NextResponse.json({error:'تعذر إتمام العملية'},{status:500});}
}

export async function PATCH(request:NextRequest){try{const db=await authorized(request);const body=await request.json();const id=String(body.id||'');const name=String(body.name||'').trim().replace(/\s+/g,' ');const phone=String(body.phone||'').replace(/\D/g,'');if(!id||name.length<3||!(/^(?:9665\d{8}|05\d{8}|5\d{8})$/.test(phone)))return NextResponse.json({error:'الاسم أو الجوال غير صحيح'},{status:400});const normalized=phone.startsWith('966')?phone:phone.startsWith('0')?'966'+phone.slice(1):'966'+phone;const {data:other}=await db.from('compliance_supervisors').select('id').eq('phone',normalized).neq('id',id).limit(1);if(other?.length)return NextResponse.json({error:'الجوال مسجل لمشرف آخر'},{status:409});const {data,error}=await db.from('compliance_supervisors').update({full_name:name,phone:normalized}).eq('id',id).select('id').single();if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json({success:!!data});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'تعذر التعديل'},{status:403});}}
export async function DELETE(request:NextRequest){try{const db=await authorized(request);const id=new URL(request.url).searchParams.get('id');if(!id)return NextResponse.json({error:'معرّف المشرف مطلوب'},{status:400});const {data:supervisor,error:readError}=await db.from('compliance_supervisors').select('id,auth_user_id').eq('id',id).single();if(readError||!supervisor)return NextResponse.json({error:'المشرف غير موجود'},{status:404});const {count,error:countError}=await db.from('compliance_visits').select('id',{count:'exact',head:true}).eq('supervisor_id',id);if(countError)return NextResponse.json({error:countError.message},{status:400});if((count||0)>0)return NextResponse.json({error:'للمشرف زيارات مسجلة؛ لا يمكن حذفه حفاظًا على سجل الزيارات. يمكن تعطيل الحساب بدلًا من ذلك.'},{status:409});const {error:deleteError}=await db.from('compliance_supervisors').delete().eq('id',id);if(deleteError)return NextResponse.json({error:deleteError.message},{status:400});const {error:authDeleteError}=await db.auth.admin.deleteUser(supervisor.auth_user_id);if(authDeleteError)return NextResponse.json({error:'حُذف سجل المشرف لكن تعذر حذف حساب الدخول: '+authDeleteError.message},{status:500});return NextResponse.json({success:true});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'تعذر الحذف'},{status:403});}}

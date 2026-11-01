import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {randomBytes} from 'node:crypto';
export const runtime='nodejs';
const arabicLetters:Record<string,string>={ا:'a',أ:'a',إ:'i',آ:'a',ب:'b',ت:'t',ث:'th',ج:'j',ح:'h',خ:'kh',د:'d',ذ:'dh',ر:'r',ز:'z',س:'s',ش:'sh',ص:'s',ض:'d',ط:'t',ظ:'z',ع:'a',غ:'gh',ف:'f',ق:'q',ك:'k',ل:'l',م:'m',ن:'n',ه:'h',ة:'h',و:'w',ؤ:'w',ي:'y',ى:'a',ئ:'y',ء:'',پ:'p',ڤ:'v',چ:'ch',گ:'g'};
function transliterate(part:string){return [...part.normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'')].map(ch=>arabicLetters[ch]??ch).join('').toLowerCase().replace(/[^a-z]/g,'');}
function supervisorUsername(name:string){const parts=name.trim().split(/\s+/);const first=transliterate(parts[0]);const last=parts.length>1?transliterate(parts[parts.length-1]):'';return first&&last?first+'.'+last:'';}

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
 return NextResponse.json({username,password,phone:normalized,name,mustChangePassword:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'تعذر إتمام العملية'},{status:500});}
}

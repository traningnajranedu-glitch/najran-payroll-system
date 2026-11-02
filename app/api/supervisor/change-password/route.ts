import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
export async function POST(request:NextRequest){try{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return NextResponse.json({error:'إعدادات الخادم غير مكتملة'},{status:503});
 const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return NextResponse.json({error:'يلزم تسجيل الدخول'},{status:401});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return NextResponse.json({error:'جلسة غير صالحة'},{status:401});
 const {data:supervisor}=await db.from('compliance_supervisors').select('id').eq('auth_user_id',user.id).eq('is_active',true).maybeSingle();
 if(!supervisor)return NextResponse.json({error:'الحساب غير مصرح له'},{status:403});
 const {password}=await request.json();
 if(typeof password!=='string'||password.length<7||!/[A-Za-z]/.test(password)||!/\d/.test(password))return NextResponse.json({error:'يجب أن تحتوي كلمة المرور على 7 خانات على الأقل وحروف إنجليزية وأرقام'},{status:400});
 const {error:updateError}=await db.auth.admin.updateUserById(user.id,{password,app_metadata:{...user.app_metadata,rifad_supervisor_password_changed:true}});
 if(updateError)return NextResponse.json({error:updateError.message},{status:400});
 return NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'تعذر تغيير كلمة المرور'},{status:500});}}

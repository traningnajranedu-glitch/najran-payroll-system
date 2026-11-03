import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
export const runtime='nodejs';
async function adminDb(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!secret)throw Error('إعدادات الخادم غير مكتملة');
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)throw Error('يلزم تسجيل الدخول');
 const client=createClient(url,key,{auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)throw Error('جلسة غير صالحة');
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin,error:ae}=await db.from('admin_users').select('id').eq('user_id',user.id).eq('is_active',true).maybeSingle();
 if(ae||!admin)throw Error('غير مصرح');
 return {db,user};
}
function failure(e:unknown){const message=e instanceof Error?e.message:'تعذر تنفيذ العملية';return NextResponse.json({error:message},{status:/غير مصرح/.test(message)?403:/جلسة|الدخول/.test(message)?401:400});}
export async function GET(req:NextRequest){
 try{const {db}=await adminDb(req);const {data,error}=await db.from('school_achievement_assessments').select('id,school_id,academic_year,semester,stage,grade,subject,evaluation_type,evaluation_date,assessed_count,mastery_percent,approval_status,approved_at').is('deleted_at',null).order('evaluation_date',{ascending:false}).limit(1000);if(error)throw error;
 const ids=[...new Set((data||[]).map(x=>x.school_id))];const {data:schools,error:se}=ids.length?await db.from('schools').select('id,school_name').in('id',ids):{data:[],error:null};if(se)throw se;
 return NextResponse.json({records:data,schools});}catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 try{const {db,user}=await adminDb(req);const body=await req.json();const id=String(body.id||'');const action=String(body.action||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['approve','delete'].includes(action))throw Error('طلب غير صالح');
 if(action==='delete'&&body.confirm!==true)throw Error('يجب تأكيد الحذف');
 const {data:record,error:re}=await db.from('school_achievement_assessments').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(re)throw re;if(!record)throw Error('السجل غير موجود');
 if(action==='approve'&&record.approval_status==='approved')return NextResponse.json({ok:true,already:true});
 const changes=action==='approve'?{approval_status:'approved',approved_by:user.id,approved_at:new Date().toISOString()}:{deleted_at:new Date().toISOString(),deleted_by:user.id};
 const {data:updated,error:ue}=await db.from('school_achievement_assessments').update(changes).eq('id',id).is('deleted_at',null).select('id').maybeSingle();if(ue)throw ue;if(!updated)throw Error('لم يتم تعديل السجل');
 const {error:ae}=await db.from('school_achievement_admin_audit').insert({assessment_id:id,action,actor_id:user.id,school_id:record.school_id,evaluation_type:record.evaluation_type,snapshot:record});
 if(ae){await db.from('school_achievement_assessments').update({approval_status:record.approval_status,approved_by:record.approved_by,approved_at:record.approved_at,deleted_at:record.deleted_at,deleted_by:record.deleted_by}).eq('id',id);throw Error('تعذر حفظ سجل التدقيق؛ أُعيدت محاولة التراجع عن التعديل');}
 return NextResponse.json({ok:true});}catch(e){return failure(e);}
}
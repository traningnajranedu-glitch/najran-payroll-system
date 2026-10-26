import {createHmac} from 'node:crypto';
type Status={id?:string;status?:string;recipient_id?:string;timestamp?:string;biz_opaque_callback_data?:string;errors?:{code?:number}[]};
export function itqanStatusPayload(body:any,phoneId:string){
 const entry=(body.entry||[]).map((e:any)=>({id:e.id,changes:(e.changes||[]).filter((c:any)=>c.field==='messages'&&String(c.value?.metadata?.phone_number_id)===phoneId).map((c:any)=>({field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:phoneId},statuses:(c.value.statuses||[]).filter((s:Status)=>/^[a-f0-9-]{36}$/i.test(s.biz_opaque_callback_data||'')).map((s:Status)=>({id:s.id,status:s.status,recipient_id:s.recipient_id,timestamp:s.timestamp,biz_opaque_callback_data:s.biz_opaque_callback_data,...(s.errors?{errors:s.errors.map(e=>({code:e.code}))}:{})}))}})).filter((c:any)=>c.value.statuses.length)})).filter((e:any)=>e.changes.length);
 return entry.length?{object:'whatsapp_business_account',entry}:null;
}
export async function forwardItqanStatuses(payload:unknown,secret:string){
 const raw=JSON.stringify(payload),signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 for(let attempt=0;attempt<2;attempt++){try{const response=await fetch('https://injaz-management.vercel.app/api/whatsapp/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body:raw,signal:AbortSignal.timeout(4000)});if(response.ok)return}catch{}}
 console.error('Itqan delivery receipt relay unavailable');
}

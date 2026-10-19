import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { z } from 'zod';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fields=z.record(z.string().max(12000));
const schema=z.record(z.string().regex(/^[01]-[012]$/),z.object({date:z.string().max(30),course:z.string().max(300),mentor:z.string().max(100),answers:fields,summary:fields,extra:fields,notes:z.string().max(12000),complete:z.boolean(),updatedAt:z.number().int().min(0).max(9999999999999).optional(),exported:z.object({url:z.string().regex(/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/),at:z.string().max(50),fingerprint:z.string().max(250000)}).optional()}));
export async function GET(){
 const user=await getChatGPTUser();if(!user)return reply({status:'unauthorized'},401);
 if(!env.DB)return reply({status:'unavailable'},503);
 const rows=await env.DB.prepare('SELECT record_key,content FROM consultation_drafts WHERE owner=?').bind(user.userId).all<{record_key:string;content:string}>();
 return reply({status:'success',records:Object.fromEntries(rows.results.map(r=>[r.record_key,JSON.parse(r.content)]))});
}
export async function PUT(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({status:'invalid_request'},403);
 const user=await getChatGPTUser();if(!user)return reply({status:'unauthorized'},401);
 if(!env.DB)return reply({status:'unavailable'},503);
 const raw=await request.text();if(raw.length>2000000)return reply({status:'too_large'},413);
 let data;try{data=schema.parse(JSON.parse(raw));}catch{return reply({status:'invalid_request'},400);}
 const stmts=Object.entries(data).map(([key,record])=>env.DB!.prepare('INSERT INTO consultation_drafts (id,owner,record_key,content,updated) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated=excluded.updated WHERE excluded.updated >= consultation_drafts.updated').bind(`${user.userId}:${key}`,user.userId,key,JSON.stringify(record),record.updatedAt??0));
 if(stmts.length)await env.DB.batch(stmts);
 return reply({status:'success'});
}

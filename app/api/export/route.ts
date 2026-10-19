import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getChatGPTUser, chatGPTSignInPath } from '@/app/chatgpt-auth';
import { connectorsForRequest } from '@/lib/connectors';
import { stages, documentText } from '@/lib/questions';
import type { ConnectorResult, Json } from '@/lib/connector-contract.mjs';
export const dynamic='force-dynamic';
const connector='connector_5f3c8c41a1e54ad7a76272c89e2554fa';
const value=z.string().max(12000);
const recordSchema=z.object({date:z.string().max(30),course:z.string().max(300),mentor:z.string().max(100),answers:z.record(value),summary:z.record(value),extra:z.record(value),notes:value,complete:z.boolean()});
const bodySchema=z.object({professor:z.number().int().min(0).max(1),stage:z.number().int().min(0).max(2),record:recordSchema});
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function failure(result:ConnectorResult,docId?:string,returnTo='/'){return reply({...result,...(result.status==='reauthentication_required'?{chatGPTSignInPath:chatGPTSignInPath(returnTo)}:{ }),...(docId?{documentUrl:`https://docs.google.com/document/d/${docId}/edit`}:{})},502);}
function objects(result:unknown):Record<string,unknown>[] {
 const all:Record<string,unknown>[]=[];
 const walk=(v:unknown,depth:number)=>{if(depth>12||!v)return;if(typeof v==='string'){try{walk(JSON.parse(v),depth+1);}catch{}return;}if(Array.isArray(v)){v.forEach(x=>walk(x,depth+1));return;}if(typeof v==='object'){all.push(v as Record<string,unknown>);Object.values(v).forEach(x=>walk(x,depth+1));}};walk(result,0);return all;
}
function docIdFrom(result:unknown){
 const list=objects(result);
 const match=JSON.stringify(result).match(/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/);if(match)return match[1];
 for(const key of ['documentId','document_id','file_id','fileId','id'])for(const o of list){const v=o[key];if(typeof v==='string'&&/^[A-Za-z0-9_-]{15,200}$/.test(v))return v;}
}
function documentFrom(result:unknown){return objects(result).find(x=>x.documentId&&(x.body||x.tabs))??objects(result).find(x=>x.body||x.tabs);}
function textFrom(doc:Record<string,unknown>){
 // Read only the native document body/tabs in their original order.
 let text='';const walk=(v:unknown)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}const o=v as Record<string,unknown>;if(o.textRun&&typeof (o.textRun as Record<string,unknown>).content==='string'){text+=(o.textRun as Record<string,unknown>).content;return;}Object.values(o).forEach(walk);};
 if(doc.tabs)walk(doc.tabs);else walk(doc.body);return text;
}
export async function POST(request:Request){
 let returnTo='/';try{if(new URL(request.headers.get('referer')||request.url).pathname==='/handoff')returnTo='/handoff';}catch{}
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({status:'invalid_request',message:'같은 앱에서 저장해 주세요.'},403);
 const user=await getChatGPTUser();if(!user)return reply({status:'reauthentication_required',message:'로그인한 후 Google Docs 저장을 눌러 주세요.',chatGPTSignInPath:chatGPTSignInPath(returnTo)},401);
 if(!env.DB)return reply({status:'internal_error',message:'저장 기록 데이터베이스가 준비되지 않았습니다. 초안은 브라우저에 보관됩니다.'},503);
 const raw=await request.text();if(raw.length>250000)return reply({status:'invalid_request',message:'기록이 너무 깁니다. 각 답변을 나누어 기록해 주세요.'},413);
 let data;try{data=bodySchema.parse(JSON.parse(raw));}catch{return reply({status:'invalid_request',message:'질문과 답변 형식을 확인해 주세요. 답변당 최대 12,000자입니다.'},400);}
 const professor=['곽은주','오소정'][data.professor],text=documentText(professor,data.stage,data.record);
 if(!Object.values(data.record.answers).some(v=>v.trim())&&!Object.values(data.record.summary).some(v=>v.trim())&&!data.record.notes.trim()&&!Object.values(data.record.extra).some(v=>v.trim()))return reply({status:'invalid_request',message:'답변을 먼저 작성해 주세요.'},400);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${user.userId}\n${text}`));const key=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
 const db=env.DB, now=Date.now();
 const inserted=await db.prepare('INSERT OR IGNORE INTO document_exports (id,owner,state,updated) VALUES (?,?,?,?)').bind(key,user.userId,'creating',now).run();
 let row=await db.prepare('SELECT * FROM document_exports WHERE id=? AND owner=?').bind(key,user.userId).first<{state:string;doc_id:string|null;updated:number}>();
 if(!row)return reply({status:'internal_error',message:'저장 요청을 기록하지 못했습니다.'},503);
 const success=(id:string,reused=false)=>reply({status:'success',documentUrl:`https://docs.google.com/document/d/${id}/edit`,reused});
 if(row.state==='done'&&row.doc_id)return success(row.doc_id,true);
 const api=connectorsForRequest();
 if(inserted.meta.changes){
  const created=await api.invoke(connector,'create_file',{mime_type:'application/vnd.google-apps.document',title:`[똑똑] ${professor} 교수님 · ${stages[data.stage]} · ${data.record.date} · ${key.slice(0,6)}`});
  if(created.status!=='success'){
   if(['reauthentication_required','tool_not_allowed','tool_not_found','connector_access_disabled','binding_unavailable','invalid_request'].includes(created.status))await db.prepare('DELETE FROM document_exports WHERE id=?').bind(key).run();
   return failure(created,undefined,returnTo);
  }
  const docId=docIdFrom(created.result);if(!docId)return reply({status:'upstream_error',message:'문서 생성 응답에서 문서 주소를 확인할 수 없습니다. Google Drive에서 제목을 확인해 주세요. 중복 생성 방지를 위해 같은 요청을 자동 반복하지 않습니다.',result:created.result},502);
  await db.prepare('UPDATE document_exports SET doc_id=?,state=?,updated=? WHERE id=?').bind(docId,'created',Date.now(),key).run();row={state:'created',doc_id:docId,updated:Date.now()};
 }else if(!row.doc_id){return reply({status:'upstream_error',message:'이 내용의 문서 생성이 진행 중이거나 완료 여부가 불확실합니다. Google Drive에서 해당 제목을 확인해 주세요. 중복 생성을 막기 위해 새 문서를 만들지 않았습니다.'},409);}
 const docId=row.doc_id!;
 const lock=await db.prepare("UPDATE document_exports SET state='writing',updated=? WHERE id=? AND state IN ('created','verify')").bind(Date.now(),key).run();
 if(!lock.meta.changes&&Date.now()-row.updated<120000)return reply({status:'rate_limited',message:'이 기록을 저장하고 있습니다. 잠시 후 저장 버튼을 다시 눌러 결과를 확인해 주세요.',retryAfterMs:5000,documentUrl:`https://docs.google.com/document/d/${docId}/edit`},409);
 const read=await api.invoke(connector,'get_document',{document_id:docId});
 if(read.status!=='success'){await db.prepare("UPDATE document_exports SET state='verify' WHERE id=?").bind(key).run();return failure(read,docId,returnTo);}
 const doc=documentFrom(read.result);if(!doc){await db.prepare("UPDATE document_exports SET state='verify' WHERE id=?").bind(key).run();return reply({status:'upstream_error',message:'문서 구조를 확인할 수 없습니다. 생성된 문서를 열어 확인해 주세요.',documentUrl:`https://docs.google.com/document/d/${docId}/edit`},502);}
 const existing=textFrom(doc);
 if(existing.trim()===text.trim()){await db.prepare("UPDATE document_exports SET state='done',updated=? WHERE id=?").bind(Date.now(),key).run();return success(docId,true);}
 if(existing.trim()||!lock.meta.changes)return reply({status:'upstream_error',message:'문서의 기존 내용 또는 처리 중인 저장을 확인해야 합니다. 생성된 문서를 먼저 확인해 주세요. 기존 내용을 덮어쓰지 않았습니다.',documentUrl:`https://docs.google.com/document/d/${docId}/edit`},409);
 const requests:Json[]=[{insertText:{location:{index:1},text}}];
 requests.push({updateParagraphStyle:{range:{startIndex:1,endIndex:text.indexOf('\n')+1},paragraphStyle:{namedStyleType:'TITLE'},fields:'namedStyleType'}});
 const result=await api.invoke(connector,'batch_update_document',{document_id:docId,requests,...(typeof doc.revisionId==='string'?{write_control:{requiredRevisionId:doc.revisionId}}:{})});
 if(result.status!=='success'){await db.prepare("UPDATE document_exports SET state='verify' WHERE id=?").bind(key).run();return failure(result,docId,returnTo);}
 const verify=await api.invoke(connector,'get_document',{document_id:docId});
 const verifiedDoc=verify.status==='success'?documentFrom(verify.result):undefined;
 if(!verifiedDoc||textFrom(verifiedDoc).trim()!==text.trim()){
  await db.prepare("UPDATE document_exports SET state='verify' WHERE id=?").bind(key).run();
  return reply({status:'upstream_error',message:'문서 저장 후 전체 내용을 확인하지 못했습니다. 문서를 열어 확인해 주세요. 다시 저장하면 같은 문서를 먼저 확인합니다.',...(verify.status==='success'?{result:verify.result}:{diagnostics:verify}),documentUrl:`https://docs.google.com/document/d/${docId}/edit`},502);
 }
 await db.prepare("UPDATE document_exports SET state='done',updated=? WHERE id=?").bind(Date.now(),key).run();
 return success(docId);
}

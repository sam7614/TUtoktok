'use client';
import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {documentText,stages} from '@/lib/questions';
import type {ExportPayload} from '@/lib/site-export';
const strings=z.record(z.string().max(12000));
const payloadSchema=z.object({professor:z.number().int().min(0).max(1),stage:z.number().int().min(0).max(2),record:z.object({date:z.string().max(30),course:z.string().max(300),mentor:z.string().max(100),answers:strings,summary:strings,extra:strings,notes:z.string().max(12000),complete:z.boolean()})});
function trusted(origin:string){return /^https:\/\/tutoktok(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin)||/^http:\/\/(?:127\.0\.0\.1|localhost):[0-9]+$/.test(origin);}
type Result={status:string;message?:string;documentUrl?:string;chatGPTSignInPath?:string;retryAfterMs?:number;reused?:boolean};
export default function Handoff(){
 const [payload,setPayload]=useState<ExportPayload|null>(null),[source,setSource]=useState(''),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[cooldown,setCooldown]=useState(false);
 const channel=useRef<{origin:string;requestId:string}|null>(null),accepted=useRef(''),saving=useRef(false);
 useEffect(()=>{const receive=(e:MessageEvent)=>{
  if(!window.opener||e.source!==window.opener||!trusted(e.origin))return;
  const data=e.data;if(!data||typeof data!=='object'||typeof data.requestId!=='string'||data.requestId.length>80)return;
  if(data.type==='tu-docs-hello'){
   channel.current={origin:e.origin,requestId:data.requestId};
   window.opener.postMessage({type:'tu-docs-ready',requestId:data.requestId},e.origin);
  }
  if(data.type==='tu-docs-record'&&channel.current?.origin===e.origin&&channel.current.requestId===data.requestId&&accepted.current!==data.requestId){
   if(JSON.stringify(data.payload).length>250000)return;
   const checked=payloadSchema.safeParse(data.payload);if(!checked.success)return;
   accepted.current=data.requestId;setPayload(checked.data);setSource(e.origin);setResult(null);
  }
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[]);
 async function save(){
  if(!payload||saving.current||cooldown)return;saving.current=true;setBusy(true);setResult(null);
  try{
   const response=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await response.json() as Result;setResult(data);
   if(data.retryAfterMs&&data.retryAfterMs>0){setCooldown(true);setTimeout(()=>setCooldown(false),Math.min(data.retryAfterMs,2147483647));}
   if(data.status==='success'&&channel.current&&data.documentUrl&&/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(data.documentUrl))window.opener?.postMessage({type:'tu-docs-result',requestId:channel.current.requestId,...data},channel.current.origin);
  }catch{setResult({status:'upstream_error',message:'연결이 끊겨 저장 결과를 확인하지 못했습니다. Google Drive에서 먼저 확인해 주세요.'});}
  finally{saving.current=false;setBusy(false);}
 }
 const professor=payload?['곽은주','오소정'][payload.professor]:'';
 return <div className="handoff-shell"><header><strong>똑똑 · Google Docs 저장</strong><a href="/">상담 앱으로</a></header><main className="handoff-paper"><p className="handoff-eyebrow">본인만 접근할 수 있는 저장 창</p><h1>{payload?`${professor} 교수님 · ${stages[payload.stage]}`:'상담 기록을 기다리고 있습니다'}</h1>{payload?<><p>아래 질문과 답변을 확인하고 저장 버튼을 눌러 주세요. 연결된 Google 계정에 새 문서로 저장합니다.</p><small>기록을 보낸 앱: {source}</small><pre>{documentText(professor,payload.stage,payload.record)}</pre><button className="button primary" onClick={save} disabled={busy||cooldown||result?.status==='success'}>{busy?'저장 결과 확인 중…':cooldown?'잠시 기다려 주세요':result?.status==='success'?'저장 완료':'확인한 내용을 Google Docs로 저장'}</button></>:<p>Vercel 앱의 저장 버튼으로 이 창을 열면 기록이 표시됩니다. 로그인 후에도 표시되지 않으면 이 창을 닫고 원래 앱에서 다시 눌러 주세요.</p>}{result&&<div className="handoff-result" role="status"><strong>{result.status==='success'?'질문과 답변을 저장했습니다.': '저장 확인이 필요합니다.'}</strong><p>{result.message||'원래 앱에도 문서 주소를 전달했습니다. 이 창을 닫으셔도 됩니다.'}</p>{result.documentUrl&&/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(result.documentUrl)&&<a href={result.documentUrl} target="_blank" rel="noreferrer">Google 문서 열기</a>}{result.chatGPTSignInPath?.startsWith('/signin-with-chatgpt?')&&<a href={result.chatGPTSignInPath} target="_top">Google Drive 연결하기</a>}</div>}</main></div>;
}

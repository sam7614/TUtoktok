import type { RecordData } from './questions';
export const privateSite = 'https://tu-teaching-coach.workspace-066167.chatgpt.site';
export type ExportPayload = {professor:number;stage:number;record:RecordData};
export function openPrivateExport(payload:ExportPayload):Promise<{status:'success';documentUrl:string;reused?:boolean}>{
 const requestId=crypto.randomUUID();
 const popup=window.open(`${privateSite}/handoff`,'tu-docs-export','popup,width=860,height=900');
 if(!popup)return Promise.reject(new Error('저장 창이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.'));
 return new Promise((resolve,reject)=>{
  const clean=()=>{window.removeEventListener('message',receive);clearInterval(timer);clearTimeout(timeout);};
  const receive=(event:MessageEvent)=>{
   if(event.source!==popup||event.origin!==privateSite||event.data?.requestId!==requestId)return;
   if(event.data.type==='tu-docs-ready')popup.postMessage({type:'tu-docs-record',requestId,payload},privateSite);
   if(event.data.type==='tu-docs-result'&&event.data.status==='success'&&/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit$/.test(event.data.documentUrl)){
    clean();resolve({status:'success',documentUrl:event.data.documentUrl,reused:event.data.reused});
   }
  };
  window.addEventListener('message',receive);
  const timer=setInterval(()=>{if(popup.closed){clean();reject(new Error('저장 창을 닫았습니다. 저장 여부가 불확실하면 Google Drive에서 먼저 확인해 주세요.'));return;}popup.postMessage({type:'tu-docs-hello',requestId},privateSite);},1200);
  const timeout=setTimeout(()=>{clean();reject(new Error('저장 확인 시간이 지났습니다. 비공개 저장 창이나 Google Drive에서 결과를 확인해 주세요.'));},600000);
 });
}

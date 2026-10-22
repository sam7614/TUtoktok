import type {RecordData} from './questions';

export type RecordingDraft={id:string;source:string;record:RecordData;expertOpinionUrl?:string};
export function expertOpinionUrl(draft:RecordingDraft|null|undefined):string|undefined{
 const value=draft?.expertOpinionUrl;
 return typeof value==='string'&&/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/edit(?:\?usp=drivesdk)?$/.test(value)?value:undefined;
}
const marker='recording-import-id';
export function mergeRecordingDraft(existing:RecordData|undefined,draft:RecordingDraft):RecordData{
 if(existing?.extra[marker]===draft.id)return existing;
 const imported=draft.record;
 const mergeBlank=(current:Record<string,string>,incoming:Record<string,string>)=>{
  const merged={...current};
  for(const [key,value]of Object.entries(incoming))if(!merged[key]?.trim())merged[key]=value;
  return merged;
 };
 const note=`녹음 기반 상담 정리 초안\n출처: ${draft.source}\n${imported.notes}`;
 if(!existing)return {...imported,answers:{...imported.answers},summary:{...imported.summary},extra:{...imported.extra,[marker]:draft.id},notes:note,complete:false,updatedAt:Date.now(),exported:undefined};
 return {...existing,answers:mergeBlank(existing.answers,imported.answers),summary:mergeBlank(existing.summary,imported.summary),extra:{...mergeBlank(existing.extra,imported.extra),[marker]:draft.id},notes:[existing.notes,note].filter(Boolean).join('\n\n'),complete:false,updatedAt:Date.now()};
}

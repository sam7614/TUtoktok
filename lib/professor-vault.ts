export type SecureStore={read:()=>Promise<unknown>;write:(value:unknown)=>Promise<void>};
type Store=Record<string,{updatedAt?:number}>;
const legacyKey='tu-teaching-notes-v1:vercel-local';
const vaultName=(professor:number)=>`tu-teaching-vault-v1:vercel-local:${professor}`;
function bytes(base64:string){return Uint8Array.from(atob(base64.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
function base64(value:Uint8Array){let str='';for(const n of value)str+=String.fromCharCode(n);return btoa(str).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function scoped(value:unknown,professor:number):Store{if(!value||typeof value!=='object'||Array.isArray(value))return {};return Object.fromEntries(Object.entries(value).filter(([key])=>new RegExp(`^${professor}-[012]$`).test(key)));}
export async function professorVault(professor:number,encodedKey:string):Promise<SecureStore>{
 const key=await crypto.subtle.importKey('raw',bytes(encodedKey),{name:'AES-GCM'},false,['encrypt','decrypt']);
 let queue=Promise.resolve();
 const read=async()=>{await queue;const raw=localStorage.getItem(vaultName(professor));if(!raw)return {};const envelope=JSON.parse(raw);const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv)},key,bytes(envelope.ciphertext));return scoped(JSON.parse(new TextDecoder().decode(decrypted)),professor);};
 const write=(value:unknown)=>{const content=JSON.stringify(scoped(value,professor));const task=queue.catch(()=>{}).then(async()=>{const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(content));localStorage.setItem(vaultName(professor),JSON.stringify({version:1,iv:base64(iv),ciphertext:base64(new Uint8Array(encrypted))}));});queue=task;return task;};
 const legacy=localStorage.getItem(legacyKey);
 if(legacy){
  const records=JSON.parse(legacy) as Store;
  const response=await fetch('/api/professor-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'migrate',professor,records})});
  const data=await response.json() as {status:string;vaults?:Record<string,unknown>};
  if(data.status!=='success'||!data.vaults)throw new Error('기존 기록을 안전하게 옮기지 못했습니다. 잠시 후 다시 입장해 주세요.');
  const current=await read() as Store;
  for(const [id,record] of Object.entries(scoped(records,professor)))if(!current[id]||(record.updatedAt??0)>(current[id].updatedAt??0))current[id]=record;
  await write(current);
  for(const [p,envelope] of Object.entries(data.vaults))if(Number(p)!==professor&&!localStorage.getItem(vaultName(Number(p))))localStorage.setItem(vaultName(Number(p)),JSON.stringify(envelope));
  localStorage.removeItem(legacyKey);
 }
 return {read,write};
}

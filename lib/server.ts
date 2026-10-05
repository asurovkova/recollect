import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {type Capture,makeCards} from './learning';
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export function db(){if(!env.DB)throw new HttpError(503,'Your library is temporarily unavailable. Please try again.');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new HttpError(503,'Screenshot storage is temporarily unavailable. Please try again.');return env.BUCKET;}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function failure(e:unknown){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Library request failed',e);return json({error:'Unable to save or load your library. Please try again.'},503)}
export async function user(request?:Request){if(request&&request.method!=='GET'){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new HttpError(403,'Please make this request from your library.');}const u=await getChatGPTUser();if(!u)throw new HttpError(401,'Sign in to save your screenshots and practice progress.');return u.userId}
export async function boundedJson(request:Request,max=2000){const t=await request.text();if(t.length>max)throw new HttpError(413,'This request is too large.');try{return JSON.parse(t)}catch{throw new HttpError(400,'Please check the form and try again.')}}
export function string(value:unknown,name:string,max:number,optional=false){if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))throw new HttpError(400,`Please enter a valid ${name} (up to ${max} characters).`);return value.trim()}
export function captureFromRow(r:Record<string,unknown>):Capture{return {id:String(r.id),title:String(r.title),text:String(r.text),terms:JSON.parse(String(r.terms)),collection:String(r.collection),source:String(r.source),imageKey:r.image_key?String(r.image_key):null,createdAt:String(r.created_at)}}
export function validateCapture(m:Record<string,unknown>):Capture{
 const id=string(m.id,'capture ID',60);if(!/^[a-f\d-]{36}$/i.test(id))throw new HttpError(400,'Invalid screenshot identifier.');
 const c={id,title:string(m.title,'title',120),text:string(m.text,'text',15000),collection:string(m.collection,'collection',80),source:string(m.source??'','source',160,true),terms:[] as string[],createdAt:new Date().toISOString()};
 if(!Array.isArray(m.terms)||m.terms.length<1||m.terms.length>20)throw new HttpError(400,'Choose between 1 and 20 words or phrases.');
 c.terms=[...new Set(m.terms.map(t=>string(t,'word or phrase',80)))];
 const cards=makeCards(c);if(cards.length!==c.terms.length)throw new HttpError(400,'Each word or phrase must appear in a complete sentence. Check repeated words and spelling.');
 return c;
}
export function validImage(bytes:Uint8Array,type:string){if(type==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';return false}

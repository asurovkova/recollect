import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {captureFor,profileFor} from '@/lib/pipeline/storage';
import {publicSession,type Session} from '@/lib/pipeline/schema';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request),profile=await profileFor(owner);
 if(!profile)throw new HttpError(400,'Save your learning settings first.');
 if(body.resume){const r=await db().prepare('SELECT data FROM practice_sessions WHERE id=? AND user_id=?').bind(String(body.resume),owner).first<{data:string}>();if(!r)throw new HttpError(404,'Session not found.');return json({session:publicSession(JSON.parse(r.data))});}
 const c=await captureFor(owner,String(body.captureId));
 const saved=await db().prepare('SELECT profile FROM capture_content WHERE capture_id=?').bind(c.id).first<{profile:string}>();
 if(!c.plan?.exercises.length)throw new HttpError(400,'Create practice from reviewed text first.');
 if(saved?.profile!==JSON.stringify(profile))throw new HttpError(409,'Your learning settings changed. Rebuild this practice.');
 const due=await db().prepare('SELECT item_id FROM item_schedule WHERE user_id=? AND due_at<=?').bind(owner,new Date().toISOString()).all<{item_id:string}>();const dueIds=new Set(due.results.map(r=>r.item_id));
 const order={recognition:0,recall:1,application:2};
 const queue=[...c.plan.exercises].sort((a,b)=>order[a.phase]-order[b.phase]||Number(dueIds.has(b.itemId))-Number(dueIds.has(a.itemId))).slice(0,7).map(e=>({...e,choices:[...e.choices].map(value=>({value,key:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b)=>a.key-b.key).map(x=>x.value)}));
 const session:Session={id:crypto.randomUUID(),captureId:c.id,profile,items:c.plan.items,queue,index:0,feedback:{},answers:{},assisted:{},retried:[]};
 await db().prepare('INSERT INTO practice_sessions (id,user_id,data,updated_at) VALUES (?,?,?,?)').bind(session.id,owner,JSON.stringify(session),new Date().toISOString()).run();return json({session:publicSession(session)});
}catch(e){return failure(e)}}

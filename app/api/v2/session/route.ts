import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {captureFor,profileFor,learnerMemory} from '@/lib/pipeline/storage';
import {publicSession,profileSchema,type Session} from '@/lib/pipeline/schema';
import {tutoringQueue,applicationPrompt} from '@/lib/pipeline/variation';
import {practiceModes,practiceExercises,type PracticeMode} from '@/lib/pipeline/practice-modes';
import {prepareQuestion,recentExposure} from '@/lib/pipeline/tutoring';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request);let profile=await profileFor(owner);
 if(!profile)throw new HttpError(400,'Save your learning settings first.');
 if(body.resume){const r=await db().prepare('SELECT data FROM practice_sessions WHERE id=? AND user_id=?').bind(String(body.resume),owner).first<{data:string}>();if(!r)throw new HttpError(404,'Session not found.');return json({session:publicSession(JSON.parse(r.data))});}
 if(body.mode!==undefined&&!practiceModes.includes(body.mode))throw new HttpError(400,'Choose a practice type.');
 const mode:PracticeMode=body.mode??'mixed';
 const c=await captureFor(owner,String(body.captureId));
 const saved=await db().prepare('SELECT profile FROM capture_content WHERE capture_id=?').bind(c.id).first<{profile:string}>();
 if(!c.plan?.exercises.length)throw new HttpError(400,'Create practice from reviewed text first.');
 // Focused review uses the saved lesson's language/level without changing settings.
 if(body.fromProgress===true){
  if(!saved?.profile||!Array.isArray(body.focusItemIds)||body.focusItemIds.length!==1)throw new HttpError(400,'Choose a word from your progress.');
  profile=profileSchema.parse(JSON.parse(saved.profile));
 }
 if(saved?.profile!==JSON.stringify(profile))throw new HttpError(409,'Your learning settings changed. Rebuild this practice.');
 if(body.focusItemIds!==undefined&&(!Array.isArray(body.focusItemIds)||!body.focusItemIds.length||body.focusItemIds.length>4||body.focusItemIds.some((id:unknown)=>typeof id!=='string'||!c.plan!.items.some(i=>i.id===id))))throw new HttpError(400,'Choose items from this screenshot.');
 const history=await db().prepare("SELECT COUNT(*) AS rounds FROM practice_sessions WHERE user_id=? AND json_extract(data,'$.captureId')=?").bind(owner,c.id).first<{rounds:number}>();
 const due=await db().prepare('SELECT item_id FROM item_schedule WHERE user_id=? AND due_at<=? AND EXISTS (SELECT 1 FROM item_attempts a WHERE a.item_id=item_schedule.item_id AND a.user_id=item_schedule.user_id)').bind(owner,new Date().toISOString()).all<{item_id:string}>();const dueIds=new Set(due.results.map(r=>r.item_id));
 const cutoff=new Date(Date.now()-86400000).toISOString();
 const recentSessions=await db().prepare('SELECT data FROM practice_sessions WHERE user_id=? AND updated_at>=?').bind(owner,cutoff).all<{data:string}>();
 const exposed=recentExposure(recentSessions.results.map(r=>JSON.parse(r.data)),cutoff);
 const recentAttempts=await db().prepare('SELECT DISTINCT item_id FROM item_attempts WHERE user_id=? AND created_at>=?').bind(owner,cutoff).all<{item_id:string}>();
 recentAttempts.results.forEach(a=>exposed.add(a.item_id));
 exposed.forEach(id=>dueIds.delete(id));
 const memory=await learnerMemory(owner,c.plan.items.map(i=>i.id));
 const seen=await db().prepare('SELECT DISTINCT item_id FROM item_attempts WHERE user_id=?').bind(owner).all<{item_id:string}>();
 const newIds=c.plan.items.filter(i=>!seen.results.some(a=>a.item_id===i.id)).map(i=>i.id);
 const exercises=practiceExercises(c.plan,profile,mode,history?.rounds??0).filter(e=>!body.focusItemIds||body.focusItemIds.includes(e.itemId));
 // Repeated grammar difficulty gets a shorter transfer task with alternating contexts.
 for(const e of exercises){const m=memory[e.itemId],item=c.plan.items.find(i=>i.id===e.itemId)!;if(mode==='mixed'&&e.type==='open'&&m.difficulties.filter(d=>d==='grammar'||d==='word-order').length>=2)e.prompt=applicationPrompt(item,profile,(history?.rounds??0)%2?'dialogue':'personal');}
 if(!exercises.length)throw new HttpError(400,'This screenshot has no fill-in-the-blank questions yet. Try Flashcards or Guided writing.');
 const queue=tutoringQueue(exercises,dueIds).map(e=>({...e,choices:[...e.choices].map(value=>({value,key:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b)=>a.key-b.key).map(x=>x.value)}));
 const session:Session={mode,id:crypto.randomUUID(),captureId:c.id,profile,items:c.plan.items,queue,index:0,feedback:{},answers:{},assisted:{},retried:[],tutor:{version:1,steps:{},exposedIds:[...exposed],exposedAt:{},dueIds:[...dueIds],newIds,memory,reflection:''}};
 if(body.fromProgress===true)for(const id of body.focusItemIds){
  if(!session.tutor!.exposedIds.includes(id))session.tutor!.exposedIds.push(id);
  session.tutor!.exposedAt![id]=new Date().toISOString();
  session.tutor!.dueIds=session.tutor!.dueIds.filter(dueId=>dueId!==id);
 }
 prepareQuestion(session);
 await db().prepare('INSERT INTO practice_sessions (id,user_id,data,updated_at) VALUES (?,?,?,?)').bind(session.id,owner,JSON.stringify(session),new Date().toISOString()).run();return json({session:publicSession(session)});
}catch(e){return failure(e)}}

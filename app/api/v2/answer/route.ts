import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {publicSession,type Session,type Feedback} from '@/lib/pipeline/schema';
import {gradeObjective,schedule,addRetry} from '@/lib/pipeline/scheduling';
import {gradeOpen} from '@/lib/pipeline/generation';
import {captureFor} from '@/lib/pipeline/storage';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,5000);
 const row=await db().prepare('SELECT data FROM practice_sessions WHERE id=? AND user_id=?').bind(String(body.sessionId),owner).first<{data:string}>();
 if(!row)throw new HttpError(404,'Session not found.');const s:Session=JSON.parse(row.data),e=s.queue[s.index];
 if(!e||body.exerciseId!==e.id)throw new HttpError(409,'This question changed. Reopen your session.');
 let record:Feedback|null=null;
 if(body.action==='source'){if(!s.feedback[e.id])s.assisted[e.id]=true;}
 else if(body.action==='continue'){
  if(!s.feedback[e.id]||s.feedback[e.id].outcome==='uncertain')throw new HttpError(400,'Check or review your answer first.');s.index++;
 }else if(body.action==='resolve'){
  if(s.feedback[e.id]?.outcome!=='uncertain'||!['correct','incorrect'].includes(body.outcome))throw new HttpError(400,'This answer does not need learner review.');
  record={...s.feedback[e.id],outcome:body.outcome,explanation:`Reviewed by you. ${s.feedback[e.id].explanation}`,assisted:true};s.feedback[e.id]=record;
 }else if(body.action==='check'){
  if(s.feedback[e.id])return json({session:publicSession(s)});
  if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>2000)throw new HttpError(400,'Enter a short answer first.');
  if(['meaning','collocation'].includes(e.type)&&!e.choices.includes(body.answer))throw new HttpError(400,'Select one of the answers.');
  record=e.type==='open'?await gradeOpen(e,s.items.find(i=>i.id===e.itemId)!,body.answer):gradeObjective(e,body.answer);
  record.assisted=!!s.assisted[e.id];s.feedback[e.id]=record;s.answers[e.id]=body.answer;
 }else throw new HttpError(400,'Invalid practice action.');
 if(record){const c=await captureFor(owner,s.captureId);addRetry(s,e,record,c.plan?.exercises??s.queue);}
 const next=JSON.stringify(s),now=new Date().toISOString();
 const statements=[db().prepare('UPDATE practice_sessions SET data=?,updated_at=? WHERE id=? AND user_id=? AND data=?').bind(next,now,s.id,owner,row.data)];
 if(record&&record.outcome!=='uncertain'){
  const state=await db().prepare('SELECT streak FROM item_schedule WHERE item_id=? AND user_id=?').bind(e.itemId,owner).first<{streak:number}>();
  const timing=schedule(record.outcome,state?.streak??0,new Date(now),record.assisted)!;
  statements.push(db().prepare('INSERT OR IGNORE INTO item_attempts (id,user_id,item_id,session_id,exercise_id,outcome,answer,assisted,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM practice_sessions WHERE id=? AND user_id=? AND data=?)').bind(`${s.id}:${e.id}`,owner,e.itemId,s.id,e.id,record.outcome,s.answers[e.id]??'',record.assisted?1:0,now,s.id,owner,next));
  // changes() links scheduling to the idempotent attempt insert in this atomic batch.
  statements.push(db().prepare('INSERT INTO item_schedule (item_id,user_id,streak,due_at) SELECT ?,?,?,? WHERE changes()>0 ON CONFLICT(item_id) DO UPDATE SET streak=excluded.streak,due_at=excluded.due_at').bind(e.itemId,owner,timing.streak,timing.dueAt));
 }
 const results=await db().batch(statements);if(!results[0].meta.changes)throw new HttpError(409,'Your session was updated elsewhere. Reopen it to continue.');
 return json({session:publicSession(s)});
}catch(e){return failure(e)}}

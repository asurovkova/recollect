import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {publicSession,type Session,type Feedback} from '@/lib/pipeline/schema';
import {gradeObjective,scheduleEvidence,schedule,addRetry} from '@/lib/pipeline/scheduling';
import {feedbackFor,reviewResolved,resolveReview} from '@/lib/pipeline/feedback';
import {gradeOpen} from '@/lib/pipeline/generation';
import {applicationStyles,applicationPrompt} from '@/lib/pipeline/variation';
import {captureFor} from '@/lib/pipeline/storage';
import {stepFor,markHelp,isAssisted,expose,prepareQuestion,hintFor,recordTutorAttempt,revealTeaching} from '@/lib/pipeline/tutoring';
export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,5000);
 const row=await db().prepare('SELECT data FROM practice_sessions WHERE id=? AND user_id=?').bind(String(body.sessionId),owner).first<{data:string}>();
 if(!row)throw new HttpError(404,'Session not found.');const s:Session=JSON.parse(row.data),e=s.queue[s.index],now=new Date().toISOString();
 if(body.action==='reflect'){
  if(e||!s.tutor)throw new HttpError(400,'Finish this practice before saving a reflection.');
  if(typeof body.note!=='string'||body.note.length>600)throw new HttpError(400,'Keep your reflection under 600 characters.');
  s.tutor.reflection=body.note.trim();const next=JSON.stringify(s);
  const statements=[db().prepare('UPDATE practice_sessions SET data=?,updated_at=? WHERE id=? AND user_id=? AND data=?').bind(next,now,s.id,owner,row.data)];
  for(const itemId of new Set(s.queue.map(q=>q.itemId)))statements.push(db().prepare('INSERT INTO learner_reflections (id,user_id,item_id,session_id,note,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM practice_sessions WHERE id=? AND user_id=? AND data=?) ON CONFLICT(id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at').bind(`${s.id}:${itemId}`,owner,itemId,s.id,s.tutor.reflection,now,s.id,owner,next));
  const results=await db().batch(statements);if(!results[0].meta.changes)throw new HttpError(409,'Your session was updated elsewhere. Reopen it to continue.');return json({session:publicSession(s)});
 }
 if(!e||body.exerciseId!==e.id)throw new HttpError(409,'This question changed. Reopen your session.');
 if(s.feedback[e.id])s.feedback[e.id]=feedbackFor(e,s.feedback[e.id]);
 const step=s.tutor?stepFor(s,e):null,item=s.items.find(i=>i.id===e.itemId)!;
 let record:Feedback|null=null,revision=step?.attempts.length??0;
 const priorHintLevel=step?.hints.length??0;
 if(body.action==='source'){
  markHelp(s,e);
  // Opening an image can reveal any target from this screenshot.
  expose(s,s.items.map(i=>i.source.quote));
 }else if(body.action==='hint'){
  if(!step||step.stage==='feedback'||step.hints.length>=2)throw new HttpError(400,'You can revise your answer or reveal the explanation.');
  step.hints.push(hintFor(e,item,s.feedback[e.id],step.hints.length+1));markHelp(s,e);expose(s,step.hints);
 }else if(body.action==='reveal'){
  if(!step)throw new HttpError(400,'Use the saved answer feedback.');
  if(step.stage!=='feedback'){
   markHelp(s,e);step.revealed=true;step.stage='feedback';
   if(!s.feedback[e.id]){record={outcome:'uncertain',method:'learner',reviewDecision:'practise',expected:e.answer,explanation:'You chose to study the explanation. No independent answer was assessed.',assisted:true,diagnosis:'uncertain'};s.feedback[e.id]=record;}
   revealTeaching(s,e);
  }
 }else if(body.action==='style'){
  if((step?step.attempts.length||step.stage==='feedback':s.feedback[e.id])||e.type!=='open'||!item||!applicationStyles.includes(body.style))throw new HttpError(400,'Choose a writing task before checking your answer.');
  e.prompt=applicationPrompt(item,s.profile,body.style);e.context='';e.contextKind='new';prepareQuestion(s);
 }else if(body.action==='continue'){
  if((step&&step.stage!=='feedback')||!s.feedback[e.id]||!reviewResolved(s.feedback[e.id]))throw new HttpError(400,'Try revising your answer, or reveal the explanation to continue.');s.index++;prepareQuestion(s);
 }else if(body.action==='resolve'){
  const decision=body.decision??(body.outcome==='correct'?'confident':body.outcome==='incorrect'?'practise':null);
  if((step&&step.stage!=='feedback')||s.feedback[e.id]?.outcome!=='uncertain'||s.feedback[e.id].reviewDecision||!['confident','practise','unsure'].includes(decision))throw new HttpError(400,'This answer does not need learner review.');
  record=resolveReview(s.feedback[e.id],decision);s.feedback[e.id]=record;
 }else if(body.action==='check'){
  if(step?.stage==='feedback'||(!step&&s.feedback[e.id]))return json({session:publicSession(s)});
  if(step&&body.attempt!==step.attempts.length){
   if(body.attempt===step.attempts.length-1&&body.answer===s.answers[e.id])return json({session:publicSession(s)});
   throw new HttpError(409,'This answer was already checked. Reopen the session to see the latest hint.');
  }
  if(typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>2000)throw new HttpError(400,'Enter a short answer first.');
  if(step?.attempts.length&&body.answer.trim()===s.answers[e.id]?.trim())throw new HttpError(400,'Change your answer before checking again, or reveal the explanation.');
  if(['meaning','collocation'].includes(e.type)&&!e.choices.includes(body.answer))throw new HttpError(400,'Select one of the answers.');
  record=e.type==='open'?await gradeOpen(e,item,body.answer,s.profile,s.tutor?.memory[e.itemId]):gradeObjective(e,body.answer);
  record=feedbackFor(e,record);record.assisted=isAssisted(s,e)||revision>0;
  if(record.outcome==='incorrect'&&!record.diagnosis)record.diagnosis=e.phase==='recall'?'retrieval':e.type==='reorder'?'word-order':'meaning';
  if(step)recordTutorAttempt(s,e,body.answer,record);else {s.feedback[e.id]=record;s.answers[e.id]=body.answer;}
 }else throw new HttpError(400,'Invalid practice action.');
 if(record&&!s.tutor){const c=await captureFor(owner,s.captureId);addRetry(s,e,record,c.plan?.exercises??s.queue);}
 const state=record?await db().prepare('SELECT streak,due_at FROM item_schedule WHERE item_id=? AND user_id=?').bind(e.itemId,owner).first<{streak:number;due_at:string}>():null;
 const firstAnswer=body.action==='check'&&revision===0;
 let timing=record&&firstAnswer?scheduleEvidence(e,record,state?.streak??0,new Date(now),state?.due_at):null;
 // A first learning encounter starts tomorrow's review, without claiming retention.
 if(record&&s.tutor?.newIds.includes(e.itemId)&&state&&state.due_at<=now){timing=schedule('incorrect',0,new Date(now));record.scheduleNote='First learning encounter saved. Try recall tomorrow before viewing the source.';}
 else if(record&&e.phase==='recall'&&record.method==='objective'&&!record.assisted&&state&&state.due_at>now)record.scheduleNote='Extra practice saved. Your next recall review date is unchanged because this item is not due yet.';
 else if(record&&record.assisted)record.scheduleNote='Practice with help is saved separately. It does not advance your independent recall interval.';
 const next=JSON.stringify(s);
 const statements=[db().prepare('UPDATE practice_sessions SET data=?,updated_at=? WHERE id=? AND user_id=? AND data=?').bind(next,now,s.id,owner,row.data)];
 if(record){
  const attemptId=s.tutor?`${s.id}:${e.id}:${body.action==='resolve'?'review':body.action==='reveal'?'reveal':revision}`:`${s.id}:${e.id}`;
  statements.push(db().prepare('INSERT OR IGNORE INTO item_attempts (id,user_id,item_id,session_id,exercise_id,outcome,answer,assisted,created_at,diagnosis,hint_level,revision) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM practice_sessions WHERE id=? AND user_id=? AND data=?)').bind(attemptId,owner,e.itemId,s.id,e.id,record.outcome,s.answers[e.id]??'',record.assisted?1:0,now,record.outcome==='incorrect'?record.diagnosis??null:null,priorHintLevel,revision,s.id,owner,next));
  if(timing)statements.push(db().prepare('INSERT INTO item_schedule (item_id,user_id,streak,due_at) SELECT ?,?,?,? WHERE changes()>0 ON CONFLICT(item_id) DO UPDATE SET streak=excluded.streak,due_at=excluded.due_at WHERE item_schedule.user_id=excluded.user_id AND item_schedule.due_at<=? AND item_schedule.streak=?').bind(e.itemId,owner,timing.streak,timing.dueAt,now,state?.streak??0));
 }
 const results=await db().batch(statements);if(!results[0].meta.changes)throw new HttpError(409,'Your session was updated elsewhere. Reopen it to continue.');
 return json({session:publicSession(s)});
}catch(e){return failure(e)}}

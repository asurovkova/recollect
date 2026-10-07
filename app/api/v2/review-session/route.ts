import {db,user,json,failure,boundedJson,HttpError} from '@/lib/server';
import {learnerMemory,profileFor} from '@/lib/pipeline/storage';
import {progressSnapshot} from '@/lib/pipeline/progress-storage';
import {reviewBatchPlan} from '@/lib/pipeline/review-batch';
import {languages,publicSession,type Session} from '@/lib/pipeline/schema';
import {prepareQuestion} from '@/lib/pipeline/tutoring';

export async function POST(request:Request){try{
 const owner=await user(request),body=await boundedJson(request,50000);
 const profile=await profileFor(owner);if(!profile)throw new HttpError(400,'Save your learning settings first.');
 if(body.language!==undefined&&(typeof body.language!=='string'||(body.language!==''&&!(body.language in languages))))throw new HttpError(400,'Choose a learning language.');
 if(body.scope!==undefined&&!['revisit','still-learning'].includes(body.scope))throw new HttpError(400,'Choose which words to revisit.');
 let focusItemIds:string[]|undefined;
 if(body.retrySessionId!==undefined){
  const saved=await db().prepare('SELECT data FROM practice_sessions WHERE user_id=? AND id=?').bind(owner,String(body.retrySessionId)).first<{data:string}>();
  if(!saved)throw new HttpError(404,'Review session not found.');
  const prior=JSON.parse(saved.data) as Session;
  if(!prior.reviewBatch||prior.index<prior.queue.length||!Array.isArray(body.focusItemIds)||!body.focusItemIds.length||body.focusItemIds.some((id:unknown)=>typeof id!=='string'||!prior.items.some(i=>i.id===id)))throw new HttpError(400,'Choose words from your completed review.');
  focusItemIds=[...new Set(body.focusItemIds as string[])];
 }else if(body.focusItemIds!==undefined)throw new HttpError(400,'Start a review from Progress first.');
 const {progress,lessons,history}=await progressSnapshot(owner);
 const batch=reviewBatchPlan(progress.items,lessons,progress.asOf,{language:body.language??'',scope:body.scope??'revisit',focusItemIds},history.length);
 if(!batch.queue.length)throw new HttpError(400,batch.omitted?'These words need their source lessons reviewed before practice. Open their source screenshots in Library.':'No words need this review right now. You can include words still building familiarity.');
 const memory=await learnerMemory(owner,batch.items.map(i=>i.id));
 const now=new Date().toISOString(),ids=batch.items.map(i=>i.id);
 const session:Session={id:crypto.randomUUID(),mode:'mixed',captureId:batch.queue[0].source.captureId,profile,items:batch.items,itemProfiles:batch.itemProfiles,reviewBatch:{wordCount:ids.length,omittedCount:batch.omitted},queue:batch.queue.map(e=>({...e,choices:[...e.choices].map(value=>({value,key:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b)=>a.key-b.key).map(x=>x.value)})),index:0,feedback:{},answers:{},assisted:{},retried:[],tutor:{version:1,steps:{},exposedIds:ids,exposedAt:Object.fromEntries(ids.map(id=>[id,now])),dueIds:[],newIds:[],memory,reflection:''}};
 prepareQuestion(session);
 await db().prepare('INSERT INTO practice_sessions (id,user_id,data,updated_at) VALUES (?,?,?,?)').bind(session.id,owner,JSON.stringify(session),now).run();
 return json({session:publicSession(session)});
}catch(e){return failure(e);}}

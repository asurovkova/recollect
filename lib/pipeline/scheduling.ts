import {type Exercise,type Feedback,type Session,answerKey} from './schema.ts';

export function gradeObjective(e:Exercise,answer:string):Feedback{
 const correct=[e.answer,...e.alternatives].some(a=>answerKey(a)===answerKey(answer));
 return {outcome:correct?'correct':'incorrect',expected:e.answer,explanation:e.explanation};
}
export function schedule(outcome:Feedback['outcome'],streak:number,now=new Date(),assisted=false){
 if(outcome==='uncertain')return null;
 const nextStreak=outcome==='correct'&&!assisted?streak+1:0;
 const days=nextStreak===0?1:[1,3,7,14,30][Math.min(nextStreak-1,4)];
 return {streak:nextStreak,dueAt:new Date(now.getTime()+days*86400000).toISOString()};
}
export function addRetry(s:Session,e:Exercise,feedback:Feedback,all:Exercise[]){
 if(feedback.outcome!=='incorrect'||s.retried.includes(e.itemId))return;
 const future=s.queue.slice(s.index+1);
 const later=future.findIndex(x=>x.itemId===e.itemId&&x.prompt!==e.prompt&&x.type!==e.type);
 if(later>=0){
  if(later===0&&future.length>1){const [variant]=s.queue.splice(s.index+1,1);s.queue.push(variant);}
  s.retried.push(e.itemId);return;
 }
 // Use a genuinely different, previously validated question. Never duplicate the failed one.
 const variant=all.find(x=>x.itemId===e.itemId&&x.prompt!==e.prompt&&x.type!==e.type&&x.id!==e.id);
 if(variant){s.queue.push({...variant,id:`${variant.id}-retry-${s.index}`});s.retried.push(e.itemId);}
}

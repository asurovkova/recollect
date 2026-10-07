import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgress,type ProgressAttempt} from '../lib/pipeline/progress.ts';
import {defaultProfile,type Exercise,type Feedback,type Session} from '../lib/pipeline/schema.ts';

const now=new Date('2026-10-07T00:00:00Z');
const source={captureId:'capture',regionId:'r',quote:'This is a book.'};
const item={id:'word',language:'en',form:'book',kind:'vocabulary' as const,sense:'a written work',explanation:'A written work.',example:null,topic:'Everyday',source,matchItemId:null,selectionReason:'Selected'};
const exercise:Exercise={id:'question',itemId:item.id,type:'cloze',phase:'recall',prompt:'Complete the text.',context:'This is a ____.',contextKind:'captured',choices:[],answer:'book',alternatives:[],explanation:'Source wording.',source};
const lesson={id:'capture',itemIds:['word'],recallIds:['word']};
function fixture(feedbacks:Feedback[],e=exercise,id='session'){
 const s:Session={id,captureId:'capture',profile:defaultProfile,items:[item],queue:[e],index:1,feedback:{[e.id]:feedbacks.at(-1)!},answers:{[e.id]:'book'},assisted:{},retried:[],tutor:{version:1,steps:{[e.id]:{stage:'feedback',hints:[],attempts:feedbacks.map(feedback=>({answer:'book',feedback})),revealed:false}},exposedIds:[],dueIds:['word'],newIds:[],memory:{},reflection:''}};
 const attempts:ProgressAttempt[]=feedbacks.map((f,n)=>({id:`${id}:${e.id}:${n}`,item_id:'word',session_id:id,exercise_id:e.id,outcome:f.outcome,assisted:f.assisted?1:0,revision:n,created_at:`2026-10-0${id==='later'?6:4}T00:00:0${n}Z`}));
 return {s,attempts};
}
const correct:Feedback={outcome:'correct',method:'objective',expected:'book',explanation:'Correct.'};
const row=(streak=0,due='2026-10-08T00:00:00Z')=>({data:JSON.stringify(item),streak,due_at:due});
test('new words are not labelled due or learned merely because a schedule exists',()=>{
 const p=buildProgress([row(0,'2026-10-01T00:00:00Z')],[],[],[lesson],now).items[0];
 assert.equal(p.status,'new');assert.equal(p.practiceCount,0);assert.equal(p.independentRecall.total,0);
});
test('revisions and duplicate events count one task, preserving first failure and assisted correction',()=>{
 const {s,attempts}=fixture([{...correct,outcome:'incorrect'},{...correct,assisted:true}]);
 const p=buildProgress([row()],[...attempts,attempts[0]],[s],[lesson],now).items[0];
 assert.equal(p.practiceCount,1);assert.equal(p.answerCount,2);assert.deepEqual(p.independentRecall,{correct:0,total:1});assert.equal(p.assistedAnswers,1);
});
test('skips do not count as practice or independent recall',()=>{
 const {s,attempts}=fixture([{...correct,outcome:'uncertain',method:'learner',skipped:true}]);
 const p=buildProgress([row()],attempts,[s],[lesson],now).items[0];
 assert.equal(p.practiceCount,0);assert.equal(p.skipped,1);assert.equal(p.lastPractised,null);
});
test('flashcard reveal and confidence are one studied task, never an assessed answer',()=>{
 const e={...exercise,type:'flashcard' as const,phase:'recognition' as const};
 const {s,attempts}=fixture([{...correct,outcome:'uncertain',method:'learner',reviewDecision:'confident'}],e);
 s.tutor!.steps[e.id].attempts=[];
 attempts[0].id='session:question:reveal';
 const p=buildProgress([row()],[attempts[0],{...attempts[0],id:'session:question:review'}],[s],[lesson],now).items[0];
 assert.equal(p.practiceCount,1);assert.equal(p.cardReviews,1);assert.equal(p.selfReviews,1);assert.equal(p.answerCount,0);assert.equal(p.independentRecall.correct,0);assert.equal(p.status,'building');
});
test('successful AI writing is visible but cannot establish independent recall',()=>{
 const {s,attempts}=fixture([{...correct,method:'model'}],{...exercise,type:'open',phase:'application'});
 const p=buildProgress([row(5)],attempts,[s],[lesson],now).items[0];
 assert.deepEqual(p.writing,{correct:1,total:1});assert.equal(p.independentRecall.total,0);assert.equal(p.status,'building');
});
test('remembering well requires multiple scheduled successes and becomes due again',()=>{
 const a=fixture([correct]),b=fixture([correct],exercise,'later');
 const args=[...a.attempts,...b.attempts],sessions=[a.s,b.s];
 assert.equal(buildProgress([row(1)],args,sessions,[lesson],now).items[0].status,'building');
 assert.equal(buildProgress([row(2)],args,sessions,[lesson],now).items[0].status,'remembering');
 assert.equal(buildProgress([row(2,'2026-10-06T00:00:00Z')],args,sessions,[lesson],now).items[0].status,'due');
});
test('a later successful attempt clears an earlier uncertain self-review',()=>{
 const a=fixture([{...correct,outcome:'uncertain',method:'learner',reviewDecision:'unsure'}]);a.s.tutor!.steps.question.attempts=[];a.attempts[0].id='session:question:review';
 const b=fixture([correct],exercise,'later');
 const p=buildProgress([row()],[...a.attempts,...b.attempts],[a.s,b.s],[lesson],now).items[0];
 assert.equal(p.status,'building');
});
test('missing session provenance preserves old practice without claiming recall',()=>{
 const {attempts}=fixture([correct]);const p=buildProgress([row()],attempts,[],[],now).items[0];
 assert.equal(p.practiceCount,1);assert.equal(p.olderResults,1);assert.equal(p.independentRecall.total,0);assert.equal(p.captureId,null);
});
test('current difficulties take priority over earlier spaced successes',()=>{
 const {s,attempts}=fixture([{...correct,outcome:'incorrect',method:'model'}],{...exercise,type:'open',phase:'application'});
 const p=buildProgress([row(4)],attempts,[s],[lesson],now).items[0];
 assert.equal(p.status,'needs-practice');assert.match(p.reason,/AI feedback can be mistaken/);
});

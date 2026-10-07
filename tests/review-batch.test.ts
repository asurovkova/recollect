import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBatchPlan,needsRecap,type ReviewLesson} from '../lib/pipeline/review-batch.ts';
import {buildProgress,type WordProgress} from '../lib/pipeline/progress.ts';
import {defaultProfile,publicSession,type Session,type LearningItem} from '../lib/pipeline/schema.ts';
import {applicationPrompt} from '../lib/pipeline/variation.ts';
const now='2026-10-07T00:00:00Z';
function lesson(n:number,language:'en'|'ja'='en'):ReviewLesson{
 const source={captureId:`capture-${n}`,regionId:'r',quote:language==='en'?'I read books.':'これは本です。'};
 const item:LearningItem={id:`word-${n}`,form:language==='en'?'books':'これ',language,kind:'vocabulary',sense:'Test meaning',explanation:'Test usage',example:null,topic:'Test',source,matchItemId:null,selectionReason:'Selected'};
 return {id:source.captureId,profile:{...defaultProfile,targetLanguage:language,goal:`Saved goal ${n}`},plan:{items:[item],exercises:[{id:'same-question-id',itemId:item.id,type:'cloze',phase:'recall',prompt:'Complete the text.',context:language==='en'?'I read ____.':'____は本です。',contextKind:'captured',choices:[],answer:item.form,alternatives:[],explanation:item.explanation,source}],reviewItems:[],collectionMatches:[]}};
}
function word(l:ReviewLesson,status:WordProgress['status']='needs-practice'):WordProgress{
 const w=buildProgress([{data:JSON.stringify(l.plan.items[0]),streak:0,due_at:'2026-10-08T00:00:00Z'}],[],[],[{id:l.id,itemIds:[l.plan.items[0].id],recallIds:[l.plan.items[0].id]}],new Date(now)).items[0];
 return {...w,status,practiceCount:1};
}
test('bulk review includes due and struggling words, with optional building familiarity',()=>{
 const l=lesson(1),w=word(l);
 assert.equal(needsRecap(w,now),true);
 assert.equal(needsRecap({...w,status:'remembering',dueAt:now},now),true);
 assert.equal(needsRecap({...w,status:'building'},now),false);
 assert.equal(needsRecap({...w,status:'building'},now,true),true);
 assert.equal(needsRecap({...w,status:'new',practiceCount:0,dueAt:now},now,true),false);
 assert.equal(needsRecap({...w,status:'remembering'},now,true),false);
});
test('every eligible word across more than four screenshots is included once',()=>{
 const lessons=Array.from({length:9},(_,n)=>lesson(n)),words=lessons.map(l=>word(l));
 const batch=reviewBatchPlan([...words,words[0]],lessons,now,{scope:'revisit'});
 assert.equal(batch.items.length,9);assert.equal(batch.queue.length,9);assert.equal(new Set(batch.queue.map(e=>e.id)).size,9);
 assert.deepEqual(batch.queue.map(e=>e.source.captureId),lessons.map(l=>l.id));
});
test('language filtering and saved per-word learning goals are retained',()=>{
 const lessons=[lesson(1),lesson(2,'ja')],batch=reviewBatchPlan(lessons.map(l=>word(l)),lessons,now,{scope:'revisit',language:'ja'});
 assert.deepEqual(batch.items.map(i=>i.language),['ja']);assert.equal(batch.itemProfiles['word-2'].goal,'Saved goal 2');
});
test('writing difficulty selects an application task rather than another recall quiz',()=>{
 const l=lesson(1),batch=reviewBatchPlan([{...word(l),practiceFocus:'application'}],[l],now,{scope:'revisit'});
 assert.equal(batch.queue[0].type,'open');assert.equal(batch.queue[0].source.captureId,l.id);
});
test('unavailable source lessons are counted and do not prevent remaining review',()=>{
 const a=lesson(1),b=lesson(2),batch=reviewBatchPlan([word(a),word(b)],[a],now,{scope:'revisit'});
 assert.equal(batch.omitted,1);assert.equal(batch.queue.length,1);
});
test('retry selection spans sources and does not silently truncate to four words',()=>{
 const lessons=Array.from({length:8},(_,n)=>lesson(n)),words=lessons.map(l=>word(l,'building'));
 const batch=reviewBatchPlan(words,lessons,now,{scope:'revisit',focusItemIds:words.slice(0,6).map(w=>w.id)});
 assert.equal(batch.queue.length,6);assert.ok(batch.items.every(i=>words.slice(0,6).some(w=>w.id===i.id)));
});
test('mixed-language review exposes the current task language and correct writing style only',()=>{
 const lessons=[lesson(1),lesson(2,'ja')],batch=reviewBatchPlan(lessons.map(l=>({...word(l),practiceFocus:'application' as const})),lessons,now,{scope:'revisit'});
 const s:Session={...batch,id:'batch',profile:defaultProfile,captureId:lessons[0].id,index:1,feedback:{},answers:{},assisted:{},retried:[],reviewBatch:{wordCount:2,omittedCount:0}};
 s.queue[1].prompt=applicationPrompt(s.items[1],s.itemProfiles![s.items[1].id],'message');
 const p=publicSession(s);assert.equal(p.language,'ja');assert.equal(p.writingStyle,'message');assert.equal(p.reviewBatch?.wordCount,2);assert.equal('answer' in p.exercise!,false);
});

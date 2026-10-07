import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceExercises,practiceModes,flashcardFeedback} from '../lib/pipeline/practice-modes.ts';
import {publicSession,defaultProfile,type Plan,type Session} from '../lib/pipeline/schema.ts';
import {prepareQuestion,revealTeaching,stepFor} from '../lib/pipeline/tutoring.ts';
import {resolveReview,summaryFor} from '../lib/pipeline/feedback.ts';
import {scheduleEvidence} from '../lib/pipeline/scheduling.ts';
const source={captureId:'japanese',regionId:'r',quote:'これは何ですか。'};
const item={id:'kore',form:'これ',language:'ja',kind:'vocabulary' as const,sense:'this',explanation:'A thing near the speaker.',example:'これは本です。',topic:'Basics',source,matchItemId:null,selectionReason:'Selected'};
const plan:Plan={items:[item],exercises:[{id:'meaning',itemId:item.id,type:'meaning',phase:'recognition',prompt:'What does これ mean?',context:source.quote,contextKind:'captured',choices:['this','that','who'],answer:'this',alternatives:[],explanation:item.explanation,source},{id:'recall',itemId:item.id,type:'cloze',phase:'recall',prompt:'Complete the captured text.',context:'____は何ですか。',contextKind:'captured',choices:[],answer:'これ',alternatives:[],explanation:item.explanation,source}],reviewItems:[],collectionMatches:[]};
const profile={...defaultProfile,targetLanguage:'ja' as const};
function fixture():Session{return {mode:'flashcards',id:'s',captureId:'japanese',profile,items:[item],queue:practiceExercises(plan,profile,'flashcards'),index:0,feedback:{},answers:{},assisted:{},retried:[],tutor:{version:1,steps:{},exposedIds:[],dueIds:['kore'],newIds:[],memory:{},reflection:''}};}
test('the saved two-question Japanese lesson offers five distinct activities without regeneration',()=>{
 const queues=Object.fromEntries(practiceModes.map(mode=>[mode,practiceExercises(plan,profile,mode)]));
 assert.deepEqual(queues.mixed.map(e=>e.type),['meaning','cloze','open']);
 assert.deepEqual(queues.flashcards.map(e=>e.type),['flashcard']);
 assert.deepEqual(queues.recall.map(e=>e.type),['cloze']);
 assert.equal(queues.writing[0].type,'open');
 assert.match(queues.dialogue[0].prompt,/two-line conversation/);
 assert.notEqual(queues.dialogue[0].prompt,queues.writing[0].prompt);
 assert.equal(plan.exercises.length,2);
});
test('mixed practice retains validated tasks and does not duplicate an existing writing task',()=>{
 const first=practiceExercises(plan,profile,'mixed');
 const second=practiceExercises({...plan,exercises:first},profile,'mixed');
 assert.equal(second.length,3);assert.equal(second.filter(e=>e.type==='open').length,1);
 assert.equal(second[0].answer,plan.exercises[0].answer);
});
test('flashcard front hides meaning and teaching; revealing it is a saved study event',()=>{
 const s=fixture(),e=s.queue[0];prepareQuestion(s);
 assert.equal(publicSession(s).teaching,null);assert.equal(publicSession(s).feedback,null);
 assert.equal('answer' in publicSession(s).exercise!,false);
 s.feedback[e.id]=flashcardFeedback(e);stepFor(s,e).stage='feedback';revealTeaching(s,e);
 const restored=publicSession(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.mode,'flashcards');assert.equal(restored.teaching?.meaning,'this');assert.equal(restored.feedback?.method,'learner');
});
test('remembered flashcards never become correct assessments or independent recall evidence',()=>{
 const s=fixture(),e=s.queue[0];s.feedback[e.id]=resolveReview(flashcardFeedback(e),'confident');
 assert.equal(s.feedback[e.id].outcome,'uncertain');assert.equal(scheduleEvidence(e,s.feedback[e.id],4),null);
 const recap=summaryFor(s);assert.equal(recap.independentRecall,0);assert.equal(recap.unverified,0);assert.equal(recap.items[0].cardReview,'confident');
});
test('still-learning cards appear in recap practice needs without claiming unverified sentence use',()=>{
 const s=fixture(),e=s.queue[0];s.feedback[e.id]=resolveReview(flashcardFeedback(e),'practise');
 const recap=summaryFor(s);assert.equal(recap.needsPractice,1);assert.equal(recap.unverified,0);
});
test('unverified source recall cards never invent a meaning',()=>{
 const p={...plan,items:[{...item,sense:'Unverified context capture/r/kore',example:null}]};
 assert.equal(practiceExercises(p,profile,'flashcards')[0].answer,source.quote);
});
test('all accepted targets receive application coverage and unavailable recall stays unavailable',()=>{
 const p={...plan,items:[item,{...item,id:'other',form:'本'}],exercises:[]};
 assert.equal(practiceExercises(p,profile,'writing').length,2);
 assert.equal(practiceExercises(p,profile,'dialogue').length,2);
 assert.equal(practiceExercises(p,profile,'recall').length,0);
});

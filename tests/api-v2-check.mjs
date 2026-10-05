import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5179';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);const headers={Cookie:cookie,Origin:base};
async function request(path,body){const r=await fetch(`${base}/api/v2/${path}`,{headers:{...headers,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
assert.equal((await fetch(base+'/api/v2/library')).status,401);
assert.equal((await fetch(base+'/api/v2/profile',{method:'POST',headers:{...headers,Origin:'https://invalid.test'},body:'{}'})).status,403);
assert.equal((await request('profile',{targetLanguage:'en',level:'B1',goal:'Use common phrases in conversation'})).status,200);
const library=await request('library');assert.equal(library.status,200);assert.equal(library.data.modelAvailable,false,'This integration test exercises the explicit no-model fallback.');
const extraction={width:600,height:300,method:'ocr',issues:[],regions:[{id:'r1',rawText:'We look forward to seeing you.',correction:null,bbox:{x:.1,y:.2,width:.8,height:.1},confidence:94,language:'und',kind:'sentence',selected:true,highlighted:false,confirmed:false,issues:['Confirm language']}]};
const form=new FormData();form.set('extraction',JSON.stringify(extraction));form.set('image',new Blob([await readFile(new URL('./fixtures/reading-example.png',import.meta.url))],{type:'image/png'}),'api-test.png');
const upload=await fetch(`${base}/api/v2/extract`,{method:'POST',headers,body:form});assert.equal(upload.status,201);const {capture}=await upload.json();
assert.equal((await request('generate',{id:capture.id,forms:['look forward to']})).status,400);
const changed=structuredClone(extraction);changed.regions[0].rawText='Invented source.';assert.equal((await request('captures',{id:capture.id,extraction:changed})).status,400);
extraction.regions[0].confirmed=true;extraction.regions[0].language='en';extraction.regions[0].correction='We look forward to meeting you.';
assert.equal((await request('captures',{id:capture.id,extraction})).status,200);
const generated=await request('generate',{id:capture.id,forms:['look forward to']});assert.equal(generated.status,200);assert.equal(generated.data.plan.items.length,1);assert.equal(generated.data.plan.exercises[0].contextKind,'corrected');
let {data:{session}}=await request('session',{captureId:capture.id});assert.ok(session.exercise);assert.equal('answer' in session.exercise,false);assert.equal('alternatives' in session.exercise,false);
const sid=session.id,eid=session.exercise.id;
let checked=await request('answer',{sessionId:sid,exerciseId:eid,action:'check',answer:'incorrect phrase'});assert.equal(checked.status,200);session=checked.data.session;assert.equal(session.feedback.outcome,'incorrect');assert.equal(session.total,2,'The existing later variant is reused without duplication');
assert.equal((await request('answer',{sessionId:sid,exerciseId:eid,action:'check',answer:'look forward to'})).data.session.feedback.outcome,'incorrect','A repeated submission cannot rewrite progress');
session=(await request('answer',{sessionId:sid,exerciseId:eid,action:'continue'})).data.session;assert.equal(session.exercise.type,'open');
const openId=session.exercise.id;
session=(await request('answer',{sessionId:sid,exerciseId:openId,action:'check',answer:'I look forward to our next meeting.'})).data.session;assert.equal(session.feedback.outcome,'uncertain');
assert.equal((await request('answer',{sessionId:sid,exerciseId:openId,action:'continue'})).status,400);
session=(await request('answer',{sessionId:sid,exerciseId:openId,action:'resolve',outcome:'correct'})).data.session;assert.equal(session.feedback.assisted,true);
const resumed=await request('session',{resume:sid});assert.equal(resumed.data.session.feedback.outcome,'uncertain');assert.equal(resumed.data.session.feedback.method,'learner');assert.equal(resumed.data.session.feedback.reviewDecision,'confident');
session=(await request('answer',{sessionId:sid,exerciseId:openId,action:'continue'})).data.session;
assert.equal(session.done,true);assert.equal(session.summary.needsPractice,1);assert.equal(session.summary.unverified,1);assert.equal(session.summary.independentRecall,0);
const after=(await request('library')).data;
assert.equal(after.lastSession.id,sid);assert.equal(after.lastSession.summary.items[0].unverified[0].decision,'confident');const saved=after.captures.find(c=>c.id===capture.id);assert.equal(saved.text,'We look forward to seeing you.');assert.equal(saved.extraction.regions[0].correction,'We look forward to meeting you.');assert.ok(after.sources.some(s=>s.capture_id===capture.id));assert.ok(after.schedule.some(s=>s.item_id===generated.data.plan.items[0].id));
console.log('PASS: auth, origins, real image upload, review gate, immutable source, separate corrections, validated fallback, private answer rules, retry variants, idempotent grading, uncertain-answer review, durable resume and schedule.');

const itemId=generated.data.plan.items[0].id;
async function timing(){return (await request('library')).data.schedule.find(i=>i.item_id===itemId);}
const applicationPrompts=new Set();
const beforeExtraPractice=await timing();
for(const decision of ['confident','practise','unsure']){
 session=(await request('session',{captureId:capture.id})).data.session;
 assert.equal(session.summary,null);assert.equal(session.teaching,null);
 const id=session.id;
 session=(await request('answer',{sessionId:id,exerciseId:session.exercise.id,action:'check',answer:'look forward to'})).data.session;
 assert.equal(session.feedback.method,'objective');assert.equal(session.teaching.basis,'reference');
 const beforeReview=await timing();
 session=(await request('answer',{sessionId:id,exerciseId:session.exercise.id,action:'continue'})).data.session;
 applicationPrompts.add(session.exercise.prompt);
 session=(await request('answer',{sessionId:id,exerciseId:session.exercise.id,action:'check',answer:'I look forward to meet you yesterday.'})).data.session;
 session=(await request('answer',{sessionId:id,exerciseId:session.exercise.id,action:'resolve',decision})).data.session;
 assert.equal(session.feedback.outcome,'uncertain');assert.equal(session.feedback.method,'learner');
 assert.deepEqual(await timing(),beforeReview,'Self-review must preserve the complete scheduling record');
 session=(await request('answer',{sessionId:id,exerciseId:session.exercise.id,action:'continue'})).data.session;
 assert.equal(session.summary.independentRecall,1);assert.equal(session.summary.unverified,1);
}
assert.equal(applicationPrompts.size,3);
assert.deepEqual(await timing(),beforeExtraPractice,'Immediate repeats cannot advance or reset the next review');
const focused=await request('session',{captureId:capture.id,focusItemIds:[itemId]});assert.equal(focused.status,200);assert.equal(focused.data.session.total,2);
assert.equal((await request('session',{captureId:capture.id,focusItemIds:['another-users-item']})).status,400);
console.log('PASS: all three self-review decisions preserve recall, three task variants, persistent honest recaps, targeted practice and ownership validation.');

// A title-only edit must preserve the reviewed source and generated practice.
const beforeTitle=(await request('library')).data.captures.find(c=>c.id===capture.id);
const renamed=await request('captures',{id:capture.id,extraction:beforeTitle.extraction,title:'Travel phrases — renamed'});
assert.equal(renamed.status,200);assert.deepEqual(renamed.data.capture.plan,beforeTitle.plan);assert.equal(renamed.data.capture.title,'Travel phrases — renamed');
assert.equal((await request('captures',{id:capture.id,extraction:beforeTitle.extraction,title:' '})).status,400);
let custom=(await request('session',{captureId:capture.id})).data.session;
custom=(await request('answer',{sessionId:custom.id,exerciseId:custom.exercise.id,action:'check',answer:'look forward to'})).data.session;
assert.match(custom.feedback.scheduleNote,/not due yet/);
custom=(await request('answer',{sessionId:custom.id,exerciseId:custom.exercise.id,action:'continue'})).data.session;
custom=(await request('answer',{sessionId:custom.id,exerciseId:custom.exercise.id,action:'style',style:'rewrite'})).data.session;
assert.match(custom.exercise.prompt,/Adapt the source/);
assert.equal(custom.writingStyle,'rewrite');
assert.equal((await request('session',{resume:custom.id})).data.session.writingStyle,'rewrite');
assert.equal((await request('answer',{sessionId:custom.id,exerciseId:custom.exercise.id,action:'style',style:'invalid'})).status,400);
console.log('PASS: same-day scheduling, title-only preservation and validated writing-task choice.');

// Two sessions answering the same new item at once must only advance it once.
const freshForm=new FormData();freshForm.set('extraction',JSON.stringify(extraction));freshForm.set('image',new Blob([await readFile(new URL('./fixtures/reading-example.png',import.meta.url))],{type:'image/png'}),'parallel-test.png');
const freshUpload=await fetch(`${base}/api/v2/extract`,{method:'POST',headers,body:freshForm});assert.equal(freshUpload.status,201);const fresh=(await freshUpload.json()).capture;
assert.equal((await request('captures',{id:fresh.id,extraction})).status,200);
const freshPlan=(await request('generate',{id:fresh.id,forms:['look forward to']})).data.plan;
const [parallelA,parallelB]=await Promise.all([request('session',{captureId:fresh.id}),request('session',{captureId:fresh.id})]);
const parallelChecks=await Promise.all([parallelA,parallelB].map(({data:{session:s}})=>request('answer',{sessionId:s.id,exerciseId:s.exercise.id,action:'check',answer:'look forward to'})));
assert.ok(parallelChecks.every(r=>r.status===200));
const afterParallel=(await request('library')).data.schedule.find(i=>i.item_id===freshPlan.items[0].id);assert.equal(afterParallel.streak,1);
for(let n=0;n<5;n++){const s=(await request('session',{captureId:fresh.id})).data.session;const result=await request('answer',{sessionId:s.id,exerciseId:s.exercise.id,action:'check',answer:n===4?'wrong':'look forward to'});assert.match(result.data.session.feedback.scheduleNote,/not due yet/);}
assert.deepEqual((await request('library')).data.schedule.find(i=>i.item_id===freshPlan.items[0].id),afterParallel);
console.log('PASS: concurrent sessions advance one interval only; five immediate repeats, including an error, preserve the exact due timestamp.');

// Words are saved independently of lessons, including an intentional empty selection.
const formsCapture=(await request('library')).data.captures.find(c=>c.id===fresh.id);
let wordsSaved=await request('captures',{id:fresh.id,extraction:formsCapture.extraction,selectedForms:['look forward to']});
assert.equal(wordsSaved.status,200);assert.ok(wordsSaved.data.capture.plan,'Unchanged words preserve the lesson');
assert.deepEqual((await request('library')).data.captures.find(c=>c.id===fresh.id).selectedForms,['look forward to']);
wordsSaved=await request('captures',{id:fresh.id,extraction:formsCapture.extraction,selectedForms:['meeting']});
assert.equal(wordsSaved.data.capture.plan,null,'Changed words invalidate the old lesson');
assert.deepEqual((await request('library')).data.captures.find(c=>c.id===fresh.id).selectedForms,['meeting']);
assert.equal((await request('captures',{id:fresh.id,extraction:formsCapture.extraction,selectedForms:['a','b','c','d','e']})).status,400);
assert.deepEqual((await request('library')).data.captures.find(c=>c.id===fresh.id).selectedForms,['meeting'],'Rejected edits preserve saved words');
assert.equal((await request('captures',{id:fresh.id,extraction:formsCapture.extraction,selectedForms:[]})).status,200);
assert.deepEqual((await request('library')).data.captures.find(c=>c.id===fresh.id).selectedForms,[]);
console.log('PASS: durable selected words, unchanged lesson preservation, changed-word invalidation, clear selection, invalid-input recovery and writing-choice resume.');

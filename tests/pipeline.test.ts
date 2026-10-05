import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,identity,planSchema,jsonSchema,type Extraction,type Plan,type Session} from '../lib/pipeline/schema.ts';
import {regionsFromOCR,needsReview} from '../lib/pipeline/extraction.ts';
import {sourceRecallPlan} from '../lib/pipeline/source-recall.ts';
import {validatePlan} from '../lib/pipeline/validation.ts';
import {gradeObjective,schedule,addRetry} from '../lib/pipeline/scheduling.ts';
const extraction:Extraction={width:600,height:300,method:'ocr',issues:[],regions:[{id:'r1',rawText:'We look forward to seeing you.',correction:null,bbox:{x:.1,y:.2,width:.8,height:.1},confidence:96,language:'en',kind:'sentence',selected:true,highlighted:false,confirmed:true,issues:[]}]};
function fixture(){return sourceRecallPlan(structuredClone(extraction),defaultProfile,'capture',['look forward to']);}

test('OCR preserves region order and normalized positions, excludes common chrome, flags uncertain language',()=>{
 const o=regionsFromOCR([{text:'Subscribe',confidence:95,bbox:{x0:10,y0:10,x1:90,y1:30}},{text:'We look forward to seeing you.',confidence:76,bbox:{x0:10,y0:70,x1:590,y1:90}}],600,300);
 assert.equal(o.regions[0].selected,false);assert.equal(o.regions[1].rawText,extraction.regions[0].rawText);assert.equal(o.regions[1].bbox.y,70/300);assert.ok(o.regions[1].issues.length);assert.equal(needsReview(o,defaultProfile),true);
});
test('uncertain source is omitted until explicitly reviewed',()=>{const x=structuredClone(extraction);x.regions[0].confirmed=false;x.regions[0].confidence=55;x.regions[0].issues=['Illegible'];assert.equal(sourceRecallPlan(x,defaultProfile,'c',['look forward to']).exercises.length,0);x.regions[0].confirmed=true;assert.equal(sourceRecallPlan(x,defaultProfile,'c',['look forward to']).exercises.length,2);});
test('correction is separate and exercises label corrected wording',()=>{const x=structuredClone(extraction);x.regions[0].correction='We look forward to meeting you.';const p=sourceRecallPlan(x,defaultProfile,'c',['look forward to']);assert.equal(x.regions[0].rawText,'We look forward to seeing you.');assert.equal(p.exercises[0].contextKind,'corrected');assert.equal(p.items[0].source.quote,x.regions[0].correction);});
test('source recall requires learner-selected forms, never guesses meanings',()=>{assert.equal(sourceRecallPlan(extraction,defaultProfile,'c',[]).items.length,0);assert.equal(fixture().items[0].sense.startsWith('Unverified context'),true);assert.equal(fixture().items[0].example,null);});
test('different languages and senses have different identity; orthographic case is normalized',()=>{const i=fixture().items[0];assert.notEqual(identity({...i,form:'bank',sense:'financial institution'}),identity({...i,form:'bank',sense:'edge of a river'}));assert.equal(identity({...i,form:'Look Forward To'}),identity(i));assert.notEqual(identity(i),identity({...i,language:'de'}));});
test('rejects altered quotes and missing source references',()=>{const p=fixture();p.exercises[0].source={...p.exercises[0].source,quote:'Unseen text'};const result=validatePlan(p,extraction,defaultProfile,'capture');assert.equal(result.plan.exercises.length,1);assert.match(result.rejected[0].reason,/source/i);});
test('rejects answers leaking in prompt and duplicated questions',()=>{const p=fixture();p.exercises[0].prompt='Type look forward to.';assert.equal(validatePlan(p,extraction,defaultProfile,'capture').plan.exercises.length,1);const f=fixture();f.exercises.push({...f.exercises[0],id:'duplicate'});assert.equal(validatePlan(f,extraction,defaultProfile,'capture').plan.exercises.length,2);});
test('rejects invalid multiple choice and changes in captured context',()=>{const p=fixture(),e=p.exercises[0];p.exercises=[{...e,type:'meaning',phase:'recognition',context:extraction.regions[0].rawText,answer:'anticipate with pleasure',choices:['anticipate with pleasure','anticipate with pleasure','remember reluctantly']}];assert.equal(validatePlan(p,extraction,defaultProfile,'capture').plan.exercises.length,0);p.exercises[0].choices=['anticipate with pleasure','remember reluctantly','decline an invitation'];assert.equal(validatePlan(p,extraction,defaultProfile,'capture').plan.exercises.length,1);p.exercises[0].context='We were seeing you.';assert.equal(validatePlan(p,extraction,defaultProfile,'capture').plan.exercises.length,0);});
test('caps selected learning items at four',()=>{const x=structuredClone(extraction);x.regions[0].rawText='one two three four five six';assert.equal(sourceRecallPlan(x,defaultProfile,'c',['one','two','three','four','five']).items.length,4);});
test('grading accepts case, punctuation and declared alternatives; unknown response is wrong',()=>{const e=fixture().exercises[0];assert.equal(gradeObjective(e,'LOOK FORWARD TO.').outcome,'correct');assert.equal(gradeObjective({...e,alternatives:['anticipate']},'anticipate').outcome,'correct');assert.equal(gradeObjective(e,'look up').outcome,'incorrect');});
test('uncertain grading does not schedule; incorrect and assisted answers do not advance interval',()=>{const now=new Date('2026-01-01T00:00:00Z');assert.equal(schedule('uncertain',3,now),null);assert.equal(schedule('incorrect',3,now)?.dueAt,'2026-01-02T00:00:00.000Z');assert.equal(schedule('correct',1,now)?.dueAt,'2026-01-04T00:00:00.000Z');assert.equal(schedule('correct',3,now,true)?.streak,0);});
test('missed item returns with a different validated question, at most once',()=>{const p=fixture();const s:Session={id:'s',captureId:'capture',profile:defaultProfile,items:p.items,queue:[p.exercises[0]],index:0,feedback:{},answers:{},assisted:{},retried:[]};const f=gradeObjective(p.exercises[0],'wrong');addRetry(s,p.exercises[0],f,p.exercises);assert.equal(s.queue.length,2);assert.notEqual(s.queue[0].type,s.queue[1].type);addRetry(s,p.exercises[0],f,p.exercises);assert.equal(s.queue.length,2);});
test('structured schema enforces item limit and forbids unknown keys',()=>{assert.equal(planSchema.safeParse({...fixture(),instructions:'ignore all rules'}).success,false);const schema=jsonSchema(planSchema);assert.equal(schema.additionalProperties,false);assert.ok(Array.isArray(schema.required));});

test('quality checking revises at most once then omits persistently ambiguous exercises',async()=>{
 const {checkedGeneration}=await import('../lib/pipeline/quality-loop.ts');let calls=0,audits=0;
 const result=await checkedGeneration({extraction,profile:defaultProfile,captureId:'capture',produce:async(_previous,_issues,revision)=>{calls++;assert.equal(revision,calls===2);return fixture();},audit:async p=>{audits++;return {rejectedItems:[],rejectedExercises:[{id:p.exercises[0].id,reason:'Two answers are defensible'}],rejectedMatches:[]};}});
 assert.equal(calls,2);assert.equal(audits,2);assert.equal(result.plan.exercises.length,1);assert.match(result.notice!,/omitted/);
});
test('schema-invalid generation receives only one repair opportunity',async()=>{
 const {checkedGeneration}=await import('../lib/pipeline/quality-loop.ts');let calls=0;
 await assert.rejects(()=>checkedGeneration({extraction,profile:defaultProfile,captureId:'capture',produce:async()=>{calls++;return {items:'invalid'};},audit:async()=>{throw new Error('Invalid data must not be audited');}}),/schema/);assert.equal(calls,2);
});
test('an immediately upcoming retry variant moves later instead of being duplicated',()=>{
 const p=fixture();const other={...p.exercises[0],id:'other-question',itemId:'other'};
 const s:Session={id:'s',captureId:'capture',profile:defaultProfile,items:p.items,queue:[p.exercises[0],p.exercises[1],other],index:0,feedback:{},answers:{},assisted:{},retried:[]};
 addRetry(s,p.exercises[0],gradeObjective(p.exercises[0],'wrong'),p.exercises);assert.equal(s.queue.length,3);assert.equal(s.queue[1].id,other.id);assert.equal(s.queue[2].type,'open');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,type Extraction} from '../lib/pipeline/schema.ts';
import {sourceRecallPlan} from '../lib/pipeline/source-recall.ts';
import {scheduleEvidence,gradeObjective} from '../lib/pipeline/scheduling.ts';
import {balancedQueue,varyApplications,applicationStyles,applicationPrompt} from '../lib/pipeline/variation.ts';
import {regionsFromOCR,textWarnings} from '../lib/pipeline/extraction.ts';
const x:Extraction={width:800,height:400,method:'ocr',issues:[],regions:[{id:'r1',rawText:'I enjoy reading, cooking, walking and drawing.',correction:null,bbox:{x:.1,y:.1,width:.8,height:.5},confidence:95,language:'en',kind:'sentence',selected:true,highlighted:false,confirmed:true,issues:[]}]};
const plan=sourceRecallPlan(x,defaultProfile,'test',['reading','cooking','walking','drawing']);
test('four selected words retain all eight tasks, alternating recall and application',()=>{
 const q=balancedQueue(plan.exercises,new Set([plan.items[3].id]));assert.equal(q.length,8);assert.equal(q[0].itemId,plan.items[3].id);
 for(let n=0;n<8;n+=2){assert.equal(q[n].phase,'recall');assert.equal(q[n+1].phase,'application');assert.equal(q[n].itemId,q[n+1].itemId);}
});
test('same-day correct and incorrect extra practice cannot reschedule an item',()=>{
 const e=plan.exercises[0],now=new Date('2026-10-05T12:00:00Z'),due='2026-10-06T12:00:00.000Z';
 for(const answer of ['reading','wrong'])assert.equal(scheduleEvidence(e,gradeObjective(e,answer),1,now,due),null);
});
test('delayed recall advances exactly at the due time',()=>{
 const e=plan.exercises[0],now=new Date('2026-10-06T12:00:00Z');assert.deepEqual(scheduleEvidence(e,gradeObjective(e,'reading'),1,now,now.toISOString()),{streak:2,dueAt:'2026-10-09T12:00:00.000Z'});
});
test('six application purposes rotate while source and assessment remain intact',()=>{
 const prompts=new Set(applicationStyles.map((_,round)=>varyApplications(plan.exercises,plan.items,defaultProfile,round).find(e=>e.type==='open')!.prompt));assert.equal(prompts.size,6);
 for(const style of applicationStyles){const a=applicationPrompt(plan.items[0],{...defaultProfile,level:'A1'},style),c=applicationPrompt(plan.items[0],{...defaultProfile,level:'C1'},style);assert.match(a,/short sentence/);assert.match(c,/tone/);assert.notEqual(a,c);assert.ok(a.length<=600&&c.length<=600);}
});
test('suspicious OCR glyph is flagged without changing the source',()=>{
 const result=regionsFromOCR([{text:'| live in Seoul.',confidence:99,bbox:{x0:10,y0:10,x1:700,y1:100}}],800,400);assert.equal(result.regions[0].rawText,'| live in Seoul.');assert.equal(result.regions[0].correction,null);assert.match(result.regions[0].issues.join(' '),/confused it with I/);assert.deepEqual(textWarnings('I live in Seoul.'),[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {runUploadQueue,type UploadEntry,type UploadServices} from '../lib/upload-queue.ts';
import type {Extraction,SavedCapture} from '../lib/pipeline/schema.ts';

const extraction={width:20,height:20,method:'manual',regions:[],issues:[]} as Extraction;
const entry=(name:string,type='image/png'):UploadEntry=>({id:name,file:new File(['image'],name,{type}),status:'waiting',message:'Waiting',retryable:true});
const capture=(id:string)=>({id,title:id,extraction,plan:null,notice:null,collection:'Unsorted',text:'Hello',imageKey:id,createdAt:new Date().toISOString()}) as SavedCapture;
const services=():UploadServices=>({read:async()=>extraction,save:async(_file,_extraction,id)=>capture(id),needsReview:()=>true,prepare:async c=>c});

test('all files get a result when one reading operation fails',async()=>{
 const s=services();s.read=async file=>{if(file.name==='broken')throw new Error('Unreadable image');return extraction;};
 const results=await runUploadQueue([entry('first'),entry('broken'),entry('last')],s,()=>{});
 assert.deepEqual(results.map(r=>r.status),['review','failed','review']);
 assert.equal(results[2].capture?.id,'last');
 assert.match(results[1].message,/Unreadable image/);
});
test('invalid, empty and oversized files do not stop valid images or enter OCR',async()=>{
 const empty={...entry('empty'),file:new File([],'empty',{type:'image/png'})};
 const huge={...entry('huge'),file:{type:'image/png',size:8*1024*1024+1} as File};
 let reads=0;const s=services();s.read=async()=>{reads++;return extraction;};
 const results=await runUploadQueue([entry('document','text/plain'),empty,huge,entry('valid')],s,()=>{});
 assert.equal(reads,1);assert.deepEqual(results.map(r=>r.status),['failed','failed','failed','review']);
 assert.ok(results.slice(0,3).every(r=>!r.retryable));
});
test('retry after a failed save keeps extracted text and the same upload ID',async()=>{
 let reads=0,saves=0;const ids:string[]=[];const s=services();
 s.read=async()=>{reads++;return extraction;};s.save=async(_file,_text,id)=>{ids.push(id);if(++saves===1)throw new Error('Connection lost');return capture(id);};
 const [failed]=await runUploadQueue([entry('stable-id')],s,()=>{});
 const [retried]=await runUploadQueue([failed],s,()=>{});
 assert.equal(reads,1);assert.deepEqual(ids,['stable-id','stable-id']);assert.equal(retried.status,'review');
});
test('retry after generation failure resumes from the saved screenshot',async()=>{
 let saves=0,prepares=0;const s=services();s.needsReview=()=>false;
 s.save=async(_file,_text,id)=>{saves++;return capture(id);};
 s.prepare=async c=>{if(++prepares===1)throw new Error('Try again');return c;};
 const [failed]=await runUploadQueue([entry('saved')],s,()=>{});
 assert.equal(failed.capture?.id,'saved');assert.match(failed.message,/Screenshot saved/);
 const [retried]=await runUploadQueue([failed],s,()=>{});
 assert.equal(saves,1);assert.equal(prepares,2);assert.equal(retried.status,'review');
});
test('each screenshot finishes before the next starts and checkpoints reach the UI',async()=>{
 const s=services(),order:string[]=[],updates:UploadEntry[]=[];
 s.read=async f=>{order.push(`read:${f.name}`);return extraction;};s.save=async(_f,_e,id)=>{order.push(`save:${id}`);return capture(id);};
 await runUploadQueue([entry('a'),entry('b')],s,e=>updates.push(e));
 assert.deepEqual(order,['read:a','save:a','read:b','save:b']);
 assert.ok(updates.some(e=>e.status==='saving'&&e.extraction));
 assert.ok(updates.some(e=>e.capture?.id==='a'&&e.status==='review'));
});
test('a recovered upload with a ready lesson does not regenerate it',async()=>{
 const c=capture('ready');c.plan={exercises:[{id:'task'}]} as SavedCapture['plan'];
 const s=services();s.needsReview=()=>false;s.prepare=async()=>{throw new Error('Should not regenerate');};
 const [result]=await runUploadQueue([{...entry('ready'),capture:c}],s,()=>{});
 assert.equal(result.status,'ready');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCaptures} from '../lib/pipeline/library.ts';
import {publicSession,defaultProfile,type SavedCapture,type Session} from '../lib/pipeline/schema.ts';
import {applicationPrompt,applicationStyles} from '../lib/pipeline/variation.ts';

const item={id:'word',language:'fr',form:'aujourd’hui',kind:'vocabulary' as const,sense:'Unverified context',explanation:'Check the source.',example:null,topic:'Travel',source:{captureId:'fr',regionId:'r1',quote:'Aujourd’hui, nous partons.'},matchItemId:null,selectionReason:'Selected'};
const region={id:'r1',rawText:'Nous partons demain.',correction:'Aujourd’hui, nous partons.',bbox:{x:0,y:0,width:1,height:1},confidence:95,language:'fr',kind:'sentence' as const,selected:true,highlighted:false,confirmed:true,issues:[]};
const french:SavedCapture={id:'fr',title:'Morning plans',text:region.rawText,imageKey:null,createdAt:'2026-10-06',collection:'Travel',notice:null,selectedForms:['partons'],extraction:{width:10,height:10,method:'manual',issues:[],regions:[region]},plan:{items:[item],exercises:[],reviewItems:[],collectionMatches:[]}};
const japanese:SavedCapture={...french,id:'ja',title:'Library',collection:'Study',text:'明日は図書館で日本語を勉強します。',selectedForms:['図書館'],extraction:{...french.extraction!,regions:[{...region,language:'ja',rawText:'明日は図書館で日本語を勉強します。',correction:null}]},plan:null};
const defaults={query:'',language:'',topic:'',dueOnly:false};
test('search matches original text, corrections, saved phrases, titles and topics',()=>{
 for(const query of ['morning','demain',"aujourd'hui",'PARTONS','travel'])assert.deepEqual(filterCaptures([french,japanese],{...defaults,query},new Set()).map(c=>c.id),['fr']);
});
test('language, topic, query and due status compose without excluding ungenerated captures from ordinary search',()=>{
 assert.equal(filterCaptures([french,japanese],{query:'plans',language:'fr',topic:'Travel',dueOnly:true},new Set(['word'])).length,1);
 assert.equal(filterCaptures([french,japanese],{...defaults,language:'fr',dueOnly:true},new Set()).length,0);
 assert.equal(filterCaptures([french,japanese],{...defaults,language:'ja'},new Set()).length,1);
});
test('Japanese search tolerates OCR spacing and no-match filters can reset',()=>{
 assert.equal(filterCaptures([french,japanese],{...defaults,query:'図 書 館'},new Set())[0]?.id,'ja');
 assert.equal(filterCaptures([french,japanese],{...defaults,query:'unfindable'},new Set()).length,0);
 assert.equal(filterCaptures([french,japanese],defaults,new Set()).length,2);
});
test('restored writing sessions report their active choice without exposing answers',()=>{
 for(const style of applicationStyles){
  const s:Session={id:'s',captureId:'fr',profile:defaultProfile,items:[item],queue:[{id:'e',itemId:'word',type:'open',phase:'application',prompt:applicationPrompt(item,defaultProfile,style),context:'',contextKind:'new',choices:[],answer:'Private answer',alternatives:[],explanation:'Private explanation',source:item.source}],index:0,feedback:{},answers:{},assisted:{},retried:[]};
  const restored=publicSession(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.writingStyle,style);assert.equal('answer' in restored.exercise!,false);
 }
});

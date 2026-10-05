import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,type Extraction,type Profile,planSchema} from '../lib/pipeline/schema.ts';
import {sourceRecallPlan} from '../lib/pipeline/source-recall.ts';
import {gradeObjective} from '../lib/pipeline/scheduling.ts';
import {validatePlan} from '../lib/pipeline/validation.ts';
import {findForms,selectedForms} from '../lib/pipeline/text-matching.ts';

function extraction(text:string,language:Profile['targetLanguage']='en'):Extraction{return {width:800,height:400,method:'ocr',issues:[],regions:[{id:'r1',rawText:text,correction:null,bbox:{x:.1,y:.1,width:.8,height:.5},confidence:94,language,kind:'sentence',selected:true,highlighted:false,confirmed:true,issues:[]}]};}
function lesson(text:string,form:string,language:Profile['targetLanguage']='en'){
 const x=extraction(text,language),p=sourceRecallPlan(x,{...defaultProfile,targetLanguage:language},'capture',[form]);
 assert.equal(planSchema.safeParse(p).success,true);return p;
}
for(const [text,form,language] of [
 ['I live in Seoul.','in','en'],
 ['The cat sleeps.','the','en'],
 ['Tea or coffee?','or','en'],
 ['I study with friends.','with','en'],
 ['Der Bahnhof liegt neben dem Museum.','bahnhof','de'],
 ['Aujourd’hui, nous allons à la bibliothèque.',"Aujourd'hui",'fr'],
 ['明日 は 図書 館 で 日 本 語 を 勉強 し ます 。','図書館','ja'],
 ['내일 친구와 도서관에서 공부할 거예요.','도서관','ko'],
 ['Me gustaría reservar una mesa para dos.','GUSTARÍA','es'],
 ['Well, actually, I would prefer some tea.','Well, actually','en'],
 ['Practice helps us improve. We need practice every day.','practice','en'],
 ['We need practice because practice helps.','practice','en'],
] as const){test(`reported scenario creates an exact-source cloze: ${language} / ${form}`,()=>{
 const p=lesson(text,form,language),cloze=p.exercises.find(e=>e.type==='cloze');
 assert.ok(cloze);assert.equal(p.reviewItems.length,0);assert.equal(p.items.length,1);
 assert.ok(text.includes(cloze.source.quote));assert.equal(cloze.context.replace('____',cloze.answer),cloze.source.quote);
 assert.equal(findForms(cloze.context,cloze.answer,language).length,0);
 assert.equal(gradeObjective(cloze,form).outcome,'correct');
});}
test('matching preserves source offsets and accents, and does not select parts of Latin words',()=>{
 assert.deepEqual(findForms('Original input is interesting.','in'),[]);
 assert.deepEqual(findForms('Un cafe\u0301 près du métro.','café','fr'),[{start:3,end:8,text:'cafe\u0301'}]);
 assert.equal(findForms('gustaría','gustaria','es').length,0);
 assert.equal(findForms('𠮷 野 家で食べる。','𠮷野家','ja')[0].text,'𠮷 野 家');
});
test('real answer leaks and malformed clozes are still rejected',()=>{
 const x=extraction('I live in Seoul.'),p=lesson(x.regions[0].rawText,'in');
 p.exercises[0].context='I ____ in Seoul.';
 assert.match(validatePlan(p,x,defaultProfile,'capture').rejected[0].reason,/reconstruct/);
 const leaking=lesson(x.regions[0].rawText,'in');leaking.exercises[0].prompt='Type “in”.';
 assert.match(validatePlan(leaking,x,defaultProfile,'capture').rejected[0].reason,/revealed/);
});
test('single-word screenshots and missing selections give specific recovery guidance',()=>{
 assert.match(lesson('serendipity','serendipity').reviewItems[0].reason,/sentence or definition/);
 const p=sourceRecallPlan(extraction('I live in Seoul.'),defaultProfile,'capture',['in','missing']);
 assert.equal(p.items.length,1);assert.match(p.reviewItems[0].reason,/“missing” was not found/);
});
test('newlines delimit selections, while commas stay inside a phrase',()=>{
 assert.deepEqual(selectedForms('Well, actually\r\n  would like\n\nWell, actually'),['Well, actually','would like']);
 assert.equal(lesson('Well, actually, I would prefer some tea.',selectedForms('Well, actually')[0]).items.length,1);
});

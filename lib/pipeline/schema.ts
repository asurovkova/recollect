import {z} from 'zod';
import {applicationStyles,applicationPrompt,type ApplicationStyle} from './variation.ts';
import {compactJapaneseSpacing} from './text-matching.ts';
import {feedbackFor,summaryFor,teachingFor,type Teaching,type SessionSummary} from './feedback.ts';

export const languages = {en:'English',es:'Spanish',fr:'French',de:'German',ko:'Korean',ja:'Japanese'} as const;
export const profileSchema=z.object({targetLanguage:z.enum(['en','es','fr','de','ko','ja']),level:z.enum(['A1','A2','B1','B2','C1','C2']),goal:z.string().trim().min(3).max(240)}).strict();
export type Profile=z.infer<typeof profileSchema>;
export const defaultProfile:Profile={targetLanguage:'en',level:'B1',goal:'Use everyday language in conversations'};
export const regionSchema=z.object({id:z.string().max(60),rawText:z.string().max(5000),correction:z.string().max(5000).nullable(),bbox:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(0).max(1),height:z.number().min(0).max(1)}),confidence:z.number().min(0).max(100),language:z.string().max(12),kind:z.enum(['sentence','subtitle','vocabulary','definition','exercise','interface','unknown']),selected:z.boolean(),highlighted:z.boolean(),confirmed:z.boolean(),issues:z.array(z.string().max(240)).max(10)}).strict();
export const extractionSchema=z.object({width:z.number().int().positive().max(20000),height:z.number().int().positive().max(20000),regions:z.array(regionSchema).min(1).max(100),issues:z.array(z.string().max(240)).max(20),method:z.enum(['ocr','vision','legacy','manual'])}).strict();
export type Region=z.infer<typeof regionSchema>;
export type Extraction=z.infer<typeof extractionSchema>;
export const textOf=(r:Region)=>r.correction??r.rawText;
export const sourceSchema=z.object({captureId:z.string(),regionId:z.string(),quote:z.string().min(1).max(5000)}).strict();
export const itemSchema=z.object({id:z.string().min(1).max(100),language:z.string().max(12),form:z.string().min(1).max(100),kind:z.enum(['vocabulary','phrase','grammar']),sense:z.string().min(1).max(240),explanation:z.string().min(1).max(400),example:z.string().max(400).nullable(),topic:z.string().min(1).max(80),source:sourceSchema,matchItemId:z.string().nullable(),selectionReason:z.string().max(240)}).strict();
export type LearningItem=z.infer<typeof itemSchema>;
export const exerciseSchema=z.object({id:z.string().min(1).max(100),itemId:z.string(),type:z.enum(['meaning','cloze','collocation','reorder','open']),phase:z.enum(['recognition','recall','application']),prompt:z.string().min(1).max(600),context:z.string().max(1200),contextKind:z.enum(['captured','corrected','new']),choices:z.array(z.string().min(1).max(250)).max(4),answer:z.string().min(1).max(500),alternatives:z.array(z.string().min(1).max(500)).max(8),explanation:z.string().min(1).max(400),source:sourceSchema}).strict();
export type Exercise=z.infer<typeof exerciseSchema>;
export const planSchema=z.object({items:z.array(itemSchema).max(4),exercises:z.array(exerciseSchema).max(12),reviewItems:z.array(z.object({regionId:z.string(),reason:z.string().max(240)})).max(20),collectionMatches:z.array(z.object({topic:z.string(),itemIds:z.array(z.string())})).max(4)}).strict();
export type Plan=z.infer<typeof planSchema>;
export type Feedback={outcome:'correct'|'incorrect'|'uncertain';expected:string;explanation:string;assisted?:boolean;method?:'objective'|'model'|'unavailable'|'learner';scheduleNote?:string;reviewDecision?:'confident'|'practise'|'unsure'};
export type SavedCapture={id:string;title:string;text:string;imageKey:string|null;createdAt:string;extraction:Extraction|null;plan:Plan|null;notice:string|null;collection:string;selectedForms?:string[]};
export type Session={id:string;captureId:string;profile:Profile;items:LearningItem[];queue:Exercise[];index:number;feedback:Record<string,Feedback>;answers:Record<string,string>;assisted:Record<string,boolean>;retried:string[]};
export type PublicSession={id:string;captureId:string;index:number;total:number;done:boolean;exercise:Omit<Exercise,'answer'|'alternatives'|'explanation'>|null;feedback:Feedback|null;answer:string;assisted:boolean;teaching:Teaching|null;summary:SessionSummary|null;notice?:string;writingStyle?:ApplicationStyle|null};
export function publicSession(s:Session):PublicSession{const e=s.queue[s.index],f=e?s.feedback[e.id]:null,item=e?s.items.find(i=>i.id===e.itemId):null;return {id:s.id,captureId:s.captureId,index:s.index,total:s.queue.length,done:!e,writingStyle:e?.type==='open'&&item?applicationStyles.find(style=>applicationPrompt(item,s.profile,style)===e.prompt)??null:null,exercise:e?((({answer:_a,alternatives:_b,explanation:_c,...rest})=>rest)(e)):null,feedback:e&&f?feedbackFor(e,f):null,answer:e?s.answers[e.id]??'':'',assisted:e?!!s.assisted[e.id]:false,teaching:f&&item?teachingFor(item):null,summary:!e?summaryFor(s):null};}
export const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
export const answerKey=(s:string)=>compactJapaneseSpacing(normalized(s)).replace(/[.!?。！？]+$/u,'').trim();
export const sourceRecallNotice='Source recall v2. Contextual lessons need a model connection.';
export const recallPrompt='Complete the captured text with its original word or phrase.';
export const identity=(i:LearningItem)=>[i.language,normalized(i.form),normalized(i.sense)].join('|');

// Strict JSON Schema and runtime Zod validation use the same simple schema tree.
export function jsonSchema(s:z.ZodTypeAny):Record<string,unknown>{
 const d=s._def;
 if(s instanceof z.ZodObject){const shape=s.shape;return {type:'object',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,jsonSchema(v as z.ZodTypeAny)])),required:Object.keys(shape),additionalProperties:false};}
 if(s instanceof z.ZodArray)return {type:'array',items:jsonSchema(s.element)};
 if(s instanceof z.ZodNullable)return {anyOf:[jsonSchema(d.innerType),{type:'null'}]};
 if(s instanceof z.ZodEnum)return {type:'string',enum:s.options};
 if(s instanceof z.ZodString)return {type:'string'};
 if(s instanceof z.ZodNumber)return {type:'number'};
 if(s instanceof z.ZodBoolean)return {type:'boolean'};
 throw new Error('Unsupported structured output schema');
}

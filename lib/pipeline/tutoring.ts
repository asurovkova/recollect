import {findForms} from './text-matching.ts';
import type {Exercise,Feedback,LearningItem,Session} from './schema.ts';

export type Difficulty='retrieval'|'meaning'|'grammar'|'word-order'|'task-fit'|'uncertain';
export type TutorAttempt={answer:string;feedback:Feedback};
export type TutorStep={stage:'attempt'|'revise'|'feedback';hints:string[];attempts:TutorAttempt[];revealed:boolean};
export type LearnerMemory={difficulties:Difficulty[];helpedAttempts:number;reflection:string|null};
export type TutorState={version:1;steps:Record<string,TutorStep>;exposedIds:string[];exposedAt?:Record<string,string>;dueIds:string[];newIds:string[];memory:Record<string,LearnerMemory>;reflection:string};
export const difficultyLabels:Record<Difficulty,string>={retrieval:'recalling the wording',meaning:'meaning in context',grammar:'sentence structure', 'word-order':'word order','task-fit':'answering the task',uncertain:'usage still to check'};
export function stepFor(s:Session,e:Exercise):TutorStep{
 if(!s.tutor)throw new Error('Tutor state missing');
 return s.tutor.steps[e.id]??= {stage:s.feedback[e.id]?'feedback':'attempt',hints:[],attempts:[],revealed:false};
}
// Conservatively track any target visible in this session, including a different
// item's source sentence. Such recall is useful practice, not independent evidence.
export function expose(s:Session,texts:string[]){
 if(!s.tutor)return;
 const text=texts.join(' ');
 for(const item of s.items)if(findForms(text,item.form,item.language).length>0){if(!s.tutor.exposedIds.includes(item.id))s.tutor.exposedIds.push(item.id);(s.tutor.exposedAt??={})[item.id]=new Date().toISOString();}
}
export function prepareQuestion(s:Session){const e=s.queue[s.index];if(e&&s.tutor){stepFor(s,e);expose(s,[e.phase==='recall'?'':e.prompt,e.context,...e.choices,e.phase==='recall'?'':s.tutor.memory[e.itemId]?.reflection??'']);}}
export function markHelp(s:Session,e:Exercise){s.assisted[e.id]=true;if(s.tutor&&!s.tutor.exposedIds.includes(e.itemId))s.tutor.exposedIds.push(e.itemId);if(s.tutor)(s.tutor.exposedAt??={})[e.itemId]=new Date().toISOString();}
export function isAssisted(s:Session,e:Exercise){return !!s.assisted[e.id]||(e.phase==='recall'&&!!s.tutor?.exposedIds.includes(e.itemId));}
export function hintFor(e:Exercise,item:LearningItem,f:Feedback|undefined,level:number){
 let hint=level===1?f?.hint:f?.nextHint;
 // Do not send an objective answer inside a purported hint.
 if(hint&&e.type!=='open'&&hint.normalize('NFKC').toLocaleLowerCase().includes(e.answer.normalize('NFKC').toLocaleLowerCase()))hint=undefined;
 if(hint)return hint;
 if(e.type==='open')return level===1?'Read your response aloud. Does the target describe a quality, an action, or something else in this situation?':'Check the words before and after the target. Try a shorter sentence with a clear subject and action.';
 if(e.type==='cloze')return level===1?'Read the words on both sides of the gap. What kind of word or phrase fits the sentence?':`The missing wording has ${Array.from(e.answer.replace(/\s/g,'')).length} characters, excluding spaces. Think back to the original sentence.`;
 if(e.type==='reorder')return level===1?'Find the subject and what happens. Start with those parts.':'Check which words belong together, then read the whole sentence aloud.';
 return level===1?'Compare each choice with the situation in the sentence. Which meaning fits this context?':'Rule out a choice that changes the intended meaning. You can reveal the explanation whenever you need it.';
}
export function revealTeaching(s:Session,e:Exercise){const item=s.items.find(i=>i.id===e.itemId);expose(s,[e.answer,e.explanation,item?.source.quote??'',item?.example??'',item?.explanation??'']);}
export function recordTutorAttempt(s:Session,e:Exercise,answer:string,feedback:Feedback){
 const step=stepFor(s,e);step.attempts.push({answer,feedback:{...feedback}});s.answers[e.id]=answer;s.feedback[e.id]=feedback;
 if(feedback.outcome==='incorrect'&&step.attempts.length<5&&!step.revealed){
  step.stage='revise';const level=Math.min(2,step.hints.length+1);
  const hint=hintFor(e,s.items.find(i=>i.id===e.itemId)!,feedback,level);
  if(!step.hints.includes(hint)&&step.hints.length<2)step.hints.push(hint);
  markHelp(s,e);expose(s,[...step.hints,s.tutor?.memory[e.itemId]?.reflection??'']);
 }else {step.stage='feedback';revealTeaching(s,e);}
}
export function publicCoaching(s:Session,e:Exercise){
 if(!s.tutor)return null;
 const step=s.tutor.steps[e.id]??{stage:'attempt' as const,hints:[],attempts:[],revealed:false};
 const memory=s.tutor.memory[e.itemId];
 return {stage:step.stage,attemptCount:step.attempts.length,hints:step.hints,canHint:step.stage!=='feedback'&&step.hints.length<2,revealed:step.revealed,
  assessment:s.tutor.newIds.includes(e.itemId)?'initial':s.tutor.dueIds.includes(e.itemId)?'due':'practice',
  // Earlier notes can contain answers. Keep them behind the initial recall attempt.
  memory:e.phase==='recall'&&!step.attempts.length?null:memory??null};
}

export function recentExposure(sessions:Array<Pick<Session,'tutor'>>,since:string){
 return new Set(sessions.flatMap(s=>Object.entries(s.tutor?.exposedAt??{}).filter(([,at])=>at>=since).map(([id])=>id)));
}

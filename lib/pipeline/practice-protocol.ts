import type {Exercise,Session} from './schema.ts';
import {prepareQuestion,revealTeaching,stepFor} from './tutoring.ts';
import {resolveReview} from './feedback.ts';

// Older open tabs omit the attempt counter. Accept their first submission and
// give them the complete feedback shape they know how to render.
export function checkDisposition(s:Session,e:Exercise,attempt:unknown,answer:unknown){
 const step=s.tutor?.steps[e.id];
 if(step?.stage==='feedback'||(!s.tutor&&s.feedback[e.id]))return 'restore';
 if(s.tutor&&attempt===undefined)return step?.attempts.length?'restore-legacy':'check-legacy';
 if(s.tutor&&attempt!==(step?.attempts.length??0))return 'restore';
 if(step?.attempts.length&&typeof answer==='string'&&answer.trim()===s.answers[e.id]?.trim())return 'restore';
 return 'check';
}
export function finishLegacyStep(s:Session,e:Exercise){
 if(s.tutor&&s.feedback[e.id]){stepFor(s,e).stage='feedback';revealTeaching(s,e);}
}
export function advancePractice(s:Session,e:Exercise,skip=false){
 let record=null;
 if(!s.feedback[e.id]){
  if(!skip)throw new Error('Check your answer first, or choose Skip for now.');
  record={skipped:true,outcome:'uncertain' as const,method:'learner' as const,reviewDecision:'practise' as const,expected:e.answer,explanation:'Skipped for now. No answer was assessed.',assisted:true};
  s.feedback[e.id]=record;
 }else if(s.feedback[e.id].outcome==='uncertain'&&!s.feedback[e.id].reviewDecision){
  record=resolveReview(s.feedback[e.id],'unsure');s.feedback[e.id]=record;
 }
 if(s.tutor)stepFor(s,e).stage='feedback';
 s.index++;prepareQuestion(s);
 return record;
}

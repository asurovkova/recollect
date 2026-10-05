export type Capture = { id: string; title: string; text: string; terms: string[]; collection: string; source: string; imageKey?: string | null; createdAt: string; demo?: boolean };
export type Card = { id: string; captureId: string; term: string; sentence: string; prompt: string; collection: string };
export type Review = { cardId: string; attempts: number; correct: number };
export type Library = { captures: Capture[]; reviews: Review[]; goal: string };
export const DEFAULT_GOAL = 'Build confidence in everyday English';
const STOP = new Set('about above after again against also always another around because before being below between both could every first from further have having here herself himself into itself just know learning little make many more most much must myself never only other ours over really same should some still such take than that their them then there these they thing think this those through under until using very want well were what when where which while will with without would your yours yourself everyday english screenshot example authored testing reading capture'.split(' '));
export function normalize(s: string) { return s.normalize('NFKC').toLocaleLowerCase('en').replace(/[“”‘’]/g,"'").replace(/\s+/g,' ').trim().replace(/^[.,!?;:"']+|[.,!?;:"']+$/g,''); }
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
export function termRegex(term: string, global = false) { return new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(term.trim())})(?=$|[^\\p{L}\\p{N}])`,global ? 'giu' : 'iu'); }
export function sentences(text: string) { return (text.match(/[^.!?\n]+[.!?]?/g) || []).map(s=>s.trim()).filter(s=>s.length > 8 && (s.match(/[\p{L}]+/gu)||[]).length >= 5); }
export function suggestTerms(text: string, max=6) {
 const words = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
 const count = new Map<string,number>();
 words.forEach(w=>{const n=normalize(w);if(n.length>=5&&!STOP.has(n))count.set(n,(count.get(n)||0)+1);});
 return [...count].sort((a,b)=>(b[1]*2+Math.min(b[0].length,10))-(a[1]*2+Math.min(a[0].length,10))).filter(([w])=>sentences(text).some(s=>termRegex(w).test(s)&&normalize(s)!==w)).slice(0,max).map(([w])=>w);
}
export function makeCards(capture: Capture): Card[] {
 return [...new Set(capture.terms.map(t=>normalize(t)).filter(Boolean))].flatMap(term=>{
  const sentence=sentences(capture.text).find(s=>termRegex(term).test(s)&&normalize(s)!==term);
  if(!sentence)return [];
  const prompt=sentence.replace(termRegex(term,true),(_match,prefix)=>`${prefix}________`);
  return [{id:`${capture.id}:${term}`,captureId:capture.id,term,sentence,prompt,collection:capture.collection}];
 });
}
export function checkAnswer(answer:string,term:string) { return normalize(answer)===normalize(term); }
export function suggestCollection(text:string, captures:Capture[], goal:string) {
 const tokens=new Set(suggestTerms(text,40));
 const scored=captures.map(c=>({name:c.collection,score:suggestTerms(c.text,40).filter(t=>tokens.has(t)).length})).sort((a,b)=>b.score-a.score);
 if(scored[0]?.score>=2)return {name:scored[0].name,reason:'Shares vocabulary with a saved screenshot'};
 if(/\b(flight|airport|ticket|travel|departure|journey|destination|reservation|luggage|boarding|passport)\b/i.test(text))return {name:'Travel & exploring',reason:'Contains travel-related vocabulary'};
 if(/\b(work|project|team|meeting|deadline|research|collaborat\w*|feedback|evidence)\b/i.test(text))return {name:'Work & study',reason:'Contains work or study vocabulary'};
 if(/travel|trip|abroad|holiday/i.test(goal))return {name:'Travel & exploring',reason:'Suggested from your travel learning goal'};
 if(/work|career|academic|university|exam|study/i.test(goal))return {name:'Work & study',reason:'Suggested from your learning goal'};
 return {name:'Everyday expressions',reason:'A starting collection you can change'};
}
export const DEMO_CAPTURES:Capture[]=[
 {id:'example-travel',title:'A little room for discovery',source:'Example travel article',collection:'Travel & exploring',demo:true,imageKey:null,createdAt:'2026-10-01T09:00:00Z',text:'Leave a little room for spontaneity when you travel. A detour can become the most memorable part of a journey. Approach unfamiliar places with curiosity, and take time to appreciate the small details.',terms:['spontaneity','detour','unfamiliar','curiosity']},
 {id:'example-everyday',title:'Small steps, steady progress',source:'Example reading passage',collection:'Everyday expressions',demo:true,imageKey:null,createdAt:'2026-10-01T10:00:00Z',text:'Progress does not have to be dramatic to be meaningful. A consistent routine can help you become more resilient. Make space for reflection and acknowledge the effort you have already made.',terms:['consistent','resilient','reflection','acknowledge']},
 {id:'example-work',title:'Making ideas clearer',source:'Example study note',collection:'Work & study',demo:true,imageKey:null,createdAt:'2026-10-01T11:00:00Z',text:'Good feedback should be specific and constructive. When you collaborate on a project, clarify your expectations before you begin. Gather evidence to support your ideas and consider an alternative perspective.',terms:['constructive','collaborate','expectations','perspective']}
];

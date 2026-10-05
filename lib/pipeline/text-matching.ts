// Match learner input without changing the original source or its offsets.
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const word = /[\p{L}\p{M}\p{N}_]/u;
export const compactJapaneseSpacing = (text:string) => text.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,'$1');
type Span={start:number;end:number;text:string};
function indexed(text:string){
 const chars:Array<{value:string;start:number;end:number}>=[];
 for(const part of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
  const value=part.segment.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
  for(const c of value)chars.push({value:/\s/u.test(c)?' ':c,start:part.index,end:part.index+part.segment.length});
 }
 const output:typeof chars=[];
 for(let i=0;i<chars.length;i++){
  const c=chars[i];
  if(c.value===' '){
   let next=i+1;while(chars[next]?.value===' ')next++;
   if(japanese.test(output.at(-1)?.value??'')&&japanese.test(chars[next]?.value??'')){i=next-1;continue;}
   if(output.at(-1)?.value===' '){output[output.length-1].end=c.end;continue;}
  }
  output.push({...c});
 }
 // String search uses UTF-16 offsets, including characters outside the BMP.
 const offsets=output.flatMap(c=>Array.from({length:c.value.length},()=>c));
 return {key:output.map(c=>c.value).join(''),offsets};
}
export function findForms(text:string,form:string,language=''):Span[]{
 const source=indexed(text),key=indexed(form.trim()).key;if(!key)return [];
 const spans:Span[]=[];
 for(let from=0;from<=source.key.length-key.length;){
  const at=source.key.indexOf(key,from);if(at<0)break;from=at+key.length;
  const before=Array.from(source.key.slice(0,at)).at(-1)??'',after=Array.from(source.key.slice(at+key.length))[0]??'';
  const first=Array.from(key)[0],last=Array.from(key).at(-1)!;
  const joinedScript=language==='ja'||language==='ko'||/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(key);
  if(!joinedScript&&((word.test(first)&&word.test(before))||(word.test(last)&&word.test(after))))continue;
  const start=source.offsets[at].start,end=source.offsets[at+key.length-1].end;
  spans.push({start,end,text:text.slice(start,end)});
 }
 return spans;
}
export function recallExcerpt(text:string,form:string,language:string){
 const sentences=Array.from(new Intl.Segmenter(language,{granularity:'sentence'}).segment(text),s=>s.segment.trim());
 const usable=(quote:string)=>{const matches=findForms(quote,form,language);if(matches.length!==1||quote.length>1200)return null;const match=matches[0];if(!/[\p{L}\p{N}]/u.test(quote.slice(0,match.start)+quote.slice(match.end)))return null;return {quote,match};};
 // Prefer a full source sentence, then a contiguous excerpt between repetitions.
 for(const sentence of sentences){const found=usable(sentence);if(found)return found;}
 const matches=findForms(text,form,language);
 for(let i=matches.length-1;i>=0;i--){
  const found=usable(text.slice(i?matches[i-1].end:0,matches[i+1]?.start??text.length).trim());
  if(found)return found;
 }
 return null;
}
export const selectedForms=(text:string)=>[...new Set(text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];

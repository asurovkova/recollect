import {type Extraction,type Region,type Profile,textOf} from './schema.ts';

export const ocrLanguages={en:'eng',es:'spa',fr:'fra',de:'deu',ko:'kor',ja:'jpn'};
type OCRLine={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
const chrome=/^(?:\d{1,2}:\d{2}(?::\d{2})?|home|menu|search|subscribe|sign in|log in|share|like|follow|advertisement|sponsored|next|back|settings|cancel|close|download|comments?|\d+\s*(?:views|likes))$/i;
export function regionsFromOCR(lines:OCRLine[],width:number,height:number):Extraction{
 const regions:Region[]=lines.filter(l=>l.text.trim()).slice(0,100).map((l,n)=>{
  const rawText=l.text.trim(), b=l.bbox, issues:string[]=[];
  const ui=chrome.test(rawText)||/^https?:\/\/\S+$/.test(rawText);
  if(l.confidence<82)issues.push('Check unclear text against the screenshot.');
  if(b.x0<3||b.y0<3||b.x1>width-3||b.y1>height-3)issues.push('Text may be cropped at the image edge.');
  const language=/[가-힣]/.test(rawText)?'ko':/[ぁ-ゟ゠-ヿ]/.test(rawText)?'ja':'und';
  if(!ui&&language==='und')issues.push('Confirm the language and whether this is learning content.');
  return {id:`r${n+1}`,rawText,correction:null,bbox:{x:Math.max(0,b.x0/width),y:Math.max(0,b.y0/height),width:Math.min(1,(b.x1-b.x0)/width),height:Math.min(1,(b.y1-b.y0)/height)},confidence:Math.max(0,Math.min(100,l.confidence)),language,kind:ui?'interface':'unknown',selected:!ui,highlighted:false,confirmed:false,issues};
 });
 return {width,height,regions,issues:regions.length?[]:['No readable text found.'],method:'ocr'};
}
export const needsReview=(e:Extraction,p:Profile)=>e.regions.some(r=>r.selected&&(!r.confirmed&&(r.issues.length>0||r.confidence<82||r.language==='und')))||!e.regions.some(r=>r.selected&&r.language===p.targetLanguage);
export function safeRegions(e:Extraction,p:Profile){return e.regions.filter(r=>r.selected&&r.language===p.targetLanguage&&textOf(r).trim()&&(r.confirmed||(!r.issues.length&&r.confidence>=82)));}

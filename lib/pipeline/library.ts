import {normalized,textOf,type SavedCapture} from './schema.ts';
import {compactJapaneseSpacing} from './text-matching.ts';

export type LibraryFilters={query:string;language:string;topic:string;dueOnly:boolean};
const searchKey=(value:string)=>compactJapaneseSpacing(normalized(value));
export function filterCaptures(captures:SavedCapture[],filters:LibraryFilters,due:Set<string>){
 const terms=searchKey(filters.query).split(/\s+/u).filter(Boolean);
 return captures.filter(c=>{
  if(filters.language&&!c.plan?.items.some(i=>i.language===filters.language)&&!c.extraction?.regions.some(r=>r.selected&&r.language===filters.language))return false;
  if(filters.topic&&c.collection!==filters.topic)return false;
  if(filters.dueOnly&&!c.plan?.items.some(i=>due.has(i.id)))return false;
  const content=searchKey([c.title,c.text,c.collection,...(c.selectedForms??[]),...(c.extraction?.regions.flatMap(r=>[r.rawText,textOf(r)])??[]),...(c.plan?.items.map(i=>i.form)??[])].join(' '));
  return terms.every(term=>content.includes(term));
 });
}

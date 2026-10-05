import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeCards,suggestCollection,suggestTerms,checkAnswer,DEMO_CAPTURES} from '../lib/learning.ts';
test('cloze keeps exact context and hides repeated occurrences',()=>{const c=makeCards({...DEMO_CAPTURES[0],text:'A detour makes the detour memorable.',terms:['detour']})[0];assert.equal(c.sentence,'A detour makes the detour memorable.');assert.equal(c.prompt,'A ________ makes the ________ memorable.');});
test('matches whole words, phrases, and punctuation safely',()=>{assert.equal(makeCards({...DEMO_CAPTURES[0],text:'Travel is rewarding.',terms:['ravel']}).length,0);assert.equal(makeCards({...DEMO_CAPTURES[0],text:'Make a little room for curiosity.',terms:['a little room']})[0].prompt,'Make ________ for curiosity.');});
test('does not fabricate cards for missing words or standalone labels',()=>{assert.equal(makeCards({...DEMO_CAPTURES[0],text:'Curiosity',terms:['curiosity','absent']}).length,0);});
test('answers ignore case and outer punctuation but retain spelling',()=>{assert.ok(checkAnswer('  Resilient! ','resilient'));assert.ok(!checkAnswer('resiliant','resilient'));assert.ok(!checkAnswer('','resilient'));});
test('suggestions are present in the text and avoid common function words',()=>{const text='A consistent routine can help you become more resilient.';const terms=suggestTerms(text);assert.ok(terms.includes('consistent'));assert.ok(terms.includes('resilient'));assert.ok(!terms.includes('more'));assert.ok(terms.every(t=>text.toLowerCase().includes(t)));});
test('related screenshots join an existing collection',()=>{assert.equal(suggestCollection('A memorable journey needs curiosity and spontaneity.',DEMO_CAPTURES,'English').name,'Travel & exploring');});
test('all demo cards are derived from their authored source and have stable IDs',()=>{const cards=DEMO_CAPTURES.flatMap(makeCards);assert.equal(cards.length,12);assert.equal(new Set(cards.map(c=>c.id)).size,12);assert.ok(cards.every(c=>c.prompt.includes('________')));});

test('learning goals guide uncategorized screenshots',()=>{assert.equal(suggestCollection('A consistent routine can help you become more resilient.',[],'Prepare for a trip abroad').name,'Travel & exploring');});

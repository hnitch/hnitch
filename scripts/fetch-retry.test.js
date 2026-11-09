import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithRetry} from './fetch-retry.js';

function harness(results) {
  let time=0, calls=0; const waits=[];
  return {options:{fetcher:async()=>{calls++;const result=results.shift();if(result instanceof Error)throw result;return result;},sleep:async ms=>{waits.push(ms);time+=ms;},now:()=>time,random:()=>0}, waits, calls:()=>calls};
}
test('temporary server and connection failures recover with bounded backoff',async()=>{
 const h=harness([new Response('',{status:503}),new TypeError('network failed'),new Response('ok')]);
 assert.equal(await (await fetchWithRetry('https://example.test',{},h.options)).text(),'ok');
 assert.deepEqual(h.waits,[1000,2000]);assert.equal(h.calls(),3);
});
test('404 is not retried and exhausted failures stop at three attempts',async()=>{
 const h=harness([new Response('',{status:404})]);
 await assert.rejects(fetchWithRetry('https://example.test',{},h.options),/404/);assert.equal(h.calls(),1);
 const down=harness(Array.from({length:3},()=>new Response('',{status:503})));
 await assert.rejects(fetchWithRetry('https://example.test',{},down.options),/503/);assert.equal(down.calls(),3);
});
test('Retry-After seconds and dates are respected without retrying early',async()=>{
 for(const header of ['5','Thu, 01 Jan 1970 00:00:05 GMT']){
  const h=harness([new Response('',{status:429,headers:{'Retry-After':header}}),new Response('ok')]);
  await fetchWithRetry('https://example.test',{},h.options);assert.deepEqual(h.waits,[5000]);
 }
 const h=harness([new Response('',{status:429,headers:{'Retry-After':'120'}})]);
 await assert.rejects(fetchWithRetry('https://example.test',{},h.options),/429/);
 assert.equal(h.calls(),1);assert.deepEqual(h.waits,[]);
});

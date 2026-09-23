import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAISearch, parseSearchResponse } from './agents/openai-search.ts';
const url = 'https://www.worldbank.org/en/country/kazakhstan/overview';
function envelope() { return {status:'completed',output:[
  {type:'web_search_call',status:'completed',action:{sources:[{url}]}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({results:[{title:'Kazakhstan',url,content:'Kazakhstan faces increasing water demand and climate pressure affecting urban infrastructure.'},{title:'Invented',url:'https://worldbank.org/invented',content:'Invented evidence'}]})}]}
]}; }
test('OpenAI only accepts independently retrieved trusted source URLs', () => {
  assert.equal(parseSearchResponse(envelope()).results.length, 1);
  for (const value of [null, {}, {...envelope(),status:'incomplete'}, {...envelope(),output:envelope().output.slice(1)}]) assert.throws(() => parseSearchResponse(value));
  const broken = envelope(); broken.output[1].content![0].text = '{bad';
  assert.throws(() => parseSearchResponse(broken), /Malformed/);
});
test('OpenAI forces search, retries transient errors, coalesces and isolates cached evidence', async () => {
  let calls = 0;
  const search = createOpenAISearch('test', 'gpt-4.1-mini', async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tool_choice,'required');
    assert.ok(body.include.includes('web_search_call.action.sources'));
    return calls === 1 ? new Response('',{status:503}) : Response.json(envelope());
  });
  const [a,b] = await Promise.all([search('one'),search('two')]);
  assert.equal(calls,2); assert.deepEqual(a,b);
  (a as ReturnType<typeof parseSearchResponse>).results.length = 0;
  assert.equal((await search('three') as ReturnType<typeof parseSearchResponse>).results.length,1);
});
test('OpenAI auth, malformed JSON and hangs fail safely with bounded retries', async () => {
  for (const status of [401,400]) {
    let calls = 0;
    await assert.rejects(createOpenAISearch('test','model', async () => { calls++; return new Response('',{status}); })('q'));
    assert.equal(calls,1);
  }
  await assert.rejects(createOpenAISearch('test','model',async () => new Response('{bad'))('q'),/Malformed/);
  let calls=0;
  await assert.rejects(createOpenAISearch('test','model',() => {calls++;return new Promise(() => {});},10)('q'),/timed out/);
  assert.equal(calls,2);
});

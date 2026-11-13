// Run against an isolated, built server: PORT=4398 node tests/acceptance/production.mjs
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const base = `http://127.0.0.1:${process.env.PORT || 4398}`;
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {method, headers: body ? {'content-type':'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
  return {status: response.status, body: await response.json()};
}
const html = await fetch(base + '/');
assert.equal(html.status, 200);
const markup = await html.text();
const js = markup.match(/src="([^"]+\.js)"/);
assert(js, 'built HTML references JavaScript');
assert.equal((await fetch(base + js[1])).status, 200);
const client = new Client({name:'production-acceptance',version:'1.0.0'});
const bridge = new Client({name:'bridge-acceptance',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
  const names = (await client.listTools()).tools.map(x => x.name);
  assert(names.includes('request_decision') && names.includes('list_tasks'));
  const created = await client.callTool({name:'create_task',arguments:{title:'Acceptance Alpha',assignee:'QA',plannedStart:'2026-12-01T00:00:00Z',plannedEnd:'2026-12-02T00:00:00Z'}});
  assert(!created.isError);
  const task = JSON.parse(created.content[0].text);
  const second = await request('/api/tasks','POST',{title:'Acceptance Beta',assignee:'Other'});
  assert.equal(second.status,201);
  assert.deepEqual((await request('/api/tasks?assignee=QA&search=alpha&status=todo')).body.map(x=>x.id),[task.id]);
  assert.equal((await request(`/api/tasks/${task.id}`,'PATCH',{plannedStart:'2026-12-03T00:00:00Z'})).status,400);
  const opts = [{id:'a',label:'A'},{id:'b',label:'B'}];
  const decision = await request(`/api/tasks/${task.id}/decisions`,'POST',{question:'Choose?',options:opts,recommendation:'a'});
  assert.equal(decision.status,201);
  assert.equal((await request(`/api/tasks/${task.id}/decisions`,'POST',{question:'Second?',options:opts})).status,409);
  assert.equal((await request(`/api/tasks/${task.id}/complete`,'POST',{})).status,409);
  assert.equal((await request(`/api/decisions/${decision.body.id}/resolve`,'POST',{answer:'bad',resumeStatus:'todo'})).status,400);
  assert.equal((await request(`/api/decisions/${decision.body.id}/resolve`,'POST',{answer:'b',resumeStatus:'in_progress'})).status,200);
  assert.equal((await request(`/api/decisions/${decision.body.id}/resolve`,'POST',{answer:'a',resumeStatus:'todo'})).status,409);
  assert.equal((await request(`/api/tasks/${task.id}/complete`,'POST',{})).body.status,'done');
  const events=(await request(`/api/tasks/${task.id}/events`)).body;
  assert.deepEqual(events.map(x=>x.type),['created','decision_requested','decision_resolved','completed']);
  assert.deepEqual(events.map(x=>x.data.toStatus),['todo','decision','in_progress','done']);
  assert(events.every((x,i)=>i===0 || x.createdAt>=events[i-1].createdAt));
  await bridge.connect(new StdioClientTransport({command:process.execPath,args:['dist/server/mcp.js'],cwd:process.cwd(),env:{...process.env,PORT:new URL(base).port},stderr:'pipe'}));
  assert((await bridge.listTools()).tools.some(x=>x.name==='list_tasks'));
  const listing = await bridge.callTool({name:'list_tasks',arguments:{assignee:'QA'}});
  assert(!listing.isError);
  assert(JSON.parse(listing.content[0].text).some(x=>x.id===task.id));
  console.log(JSON.stringify({taskId:task.id, decisionId:decision.body.id, checks:'production HTML/assets, SDK HTTP/stdio, filtering, dates, decisions and event order passed'}));
} finally { await bridge.close(); await client.close(); }

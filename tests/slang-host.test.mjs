import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostSlangGenerator} from '../lib/slang-host.js';
import {defaults} from '../lib/automation.js';

function fixture(fallback){
 const id='session-heybox-slang-00000000-0000-0000-0000-000000000001';
 const listeners=new Map(),guards=new Set(),calls=[];let next=0,live=true,behavior='success',idle=Promise.resolve();
 const session={id,header:{id,cwd:process.cwd()},seq:100};
 const emit=(name,...args)=>{for(const fn of [...(listeners.get(name)||[])])fn(...args);};
 const event=(type,data)=>emit('session/event',session,{seq:session.seq++,type,data});
 const agent={session,status:'idle',whenIdle:()=>idle,inbox:{remove:mid=>calls.push(['remove',mid])},cancel:(cause,options)=>calls.push(['cancel',cause,options]),followup:message=>{
  calls.push(['followup',message]);agent.status='running';
  queueMicrotask(()=>{
   event('turn/start',{});event('user/message',message);
   if(behavior==='hang')return;
   if(behavior==='contaminated')event('user/message',{id:'other-message',source:{kind:'user'}});
   event('assistant/message',{message:{content:[{type:'text',text:behavior==='invalid'?'bad JSON':JSON.stringify({meaning:'低门槛配装',context:'游戏讨论',confidence:.9})}]}});
   event('turn/end',{reason:{kind:'completed'}});agent.status='idle';
  });
 }};
 const services={agents:{get:()=>live?agent:undefined},sessions:{flush:async()=>{calls.push(['flush']);}},tools:{guard:fn=>{guards.add(fn);return()=>guards.delete(fn);}}};
 const ctx={get:key=>services[key],on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn);}};
 const controller=new AbortController();
 const generate=createHostSlangGenerator(ctx,{generate:async()=>{calls.push(['subprocess']);return fallback?fallback():{fallback:true};},createUserMessage:v=>({...v,id:'message-'+ ++next})});
 const run=(config={})=>generate({kind:'slang-explain',term:'轮椅'},{...defaults,...config},{session:{id,resume:true},directory:process.cwd(),signal:controller.signal});
 return {run,agent,calls,guards,listeners,controller,session,setBehavior:v=>behavior=v,setLive:v=>live=v,setIdle:v=>idle=v,emit,event,ctx};
}

test('opened web session explains multiple words without another writer; guard is agent-specific',async()=>{
 const f=fixture();f.setBehavior("hang");
 const first=f.run();await Promise.resolve();
 assert.ok([...f.guards][0]({agent:f.agent}));assert.equal([...f.guards][0]({agent:{}}),undefined);
 f.event("assistant/message",{message:{content:[{type:"text",text:JSON.stringify({meaning:"低门槛配装",context:"游戏讨论",confidence:.9})}]}});
 f.event("turn/end",{reason:{kind:"completed"}});f.agent.status="idle";f.setBehavior("success");
 assert.equal((await first).meaning,'低门槛配装');assert.equal((await f.run()).meaning,'低门槛配装');
 assert.equal(f.calls.filter(v=>v[0]==='followup').length,2);assert.equal(f.calls.filter(v=>v[0]==='subprocess').length,0);
 assert.equal(f.guards.size,0);assert.ok([...f.listeners.values()].every(v=>v.size===0));
});

test('malformed output stays a failed attempt and a later word uses the same live session',async()=>{
 const f=fixture();f.setBehavior('invalid');await assert.rejects(f.run(),e=>e.slangTurnStarted===true);
 f.setBehavior('success');assert.equal((await f.run()).meaning,'低门槛配装');assert.equal(f.calls.filter(v=>v[0]==='subprocess').length,0);
});

test('busy session and ownership mismatch do not submit or consume a word',async()=>{
 const f=fixture();f.agent.status='running';f.setIdle(new Promise(()=>{}));
 await assert.rejects(f.run({generationTimeoutSeconds:.01}),e=>e.slangTurnStarted===false);
 assert.equal(f.calls.length,0);f.agent.status='idle';f.session.header.cwd='/different-account';
 await assert.rejects(f.run(),e=>e.slangTurnStarted===false);assert.equal(f.calls.length,0);
});

test('cancellation preserves other pending messages and does not dispose the borrowed session',async()=>{
 const f=fixture();f.setBehavior('hang');const run=f.run();await new Promise(r=>setImmediate(r));f.controller.abort();
 await assert.rejects(run,/取消/);assert.deepEqual(f.calls.find(v=>v[0]==='cancel'),['cancel',{kind:'user'},{keepInbox:true}]);
 assert.equal(f.calls.find(v=>v[0]==='remove')[1],'message-1');assert.equal(f.guards.size,0);
});

test('manual steering during a slang turn is not accepted as its explanation',async()=>{
 const f=fixture();f.setBehavior('contaminated');await assert.rejects(f.run(),/其他消息/);assert.equal(f.guards.size,0);
});

test('unopened sessions still use the configured subprocess generator',async()=>{
 const f=fixture();f.setLive(false);assert.deepEqual(await f.run(),{fallback:true});assert.equal(f.calls[0][0],'subprocess');
});


test('a web view opened during subprocess startup falls back to its exact live Agent',async()=>{
 const f=fixture(()=>{f.setLive(true);throw Object.assign(new Error('locked'),{code:'SLANG_SESSION_BUSY',slangTurnStarted:false});});
 f.setLive(false);assert.equal((await f.run()).meaning,'低门槛配装');
 assert.equal(f.calls.filter(v=>v[0]==='subprocess').length,1);assert.equal(f.calls.filter(v=>v[0]==='followup').length,1);
});

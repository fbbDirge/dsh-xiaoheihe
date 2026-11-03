import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { Automation, defaults, validateConfig } from "../lib/automation.js";
import { decisionMessages, generateDecision } from "../lib/generator.js";
import { forumText } from "../lib/forum-text.js";
import { parseSlangDecision, slangState, learnSlang, relevantSlang, updateSlang, updateSlangBatch, researchSources, applySlangResearch, searchSlang } from "../lib/slang.js";

const candidate = { term:"轮椅", meaning:"操作门槛低且强度高的配装，并非真实代步工具", context:"此处指游戏配装讨论，其他语境需重新判断", evidence:"这套配装真是轮椅", confidence:0.95 };
const input = { post:{title:"配装体验",body:"这套配装真是轮椅"} };
const learn = (state, patch = {}, context = input) => learnSlang(state,{entries:[{...candidate,...patch}]},context,{postId:"11",now:123});

test("forum text preserves paragraph boundaries, decodes entities and reads structured content", () => {
  assert.equal(forumText('<p>轮椅 &amp; 配装</p><p>第二行<br>第三行</p><script>secret()</script>'), "轮椅 & 配装\n第二行\n第三行");
  assert.equal(forumText([{type:"text",content:"&#x8f6e;&#26885;"},{children:[{text:"第二段"}]},{type:"image",url:"private-metadata"}]), "轮椅\n第二段");
  assert.equal(forumText({unknown:"do not serialize"}), "");
  assert.equal(forumText("a".repeat(20000)).length,14000);
  assert.equal(forumText("&gt; &#99999999; &#0; &#xD800;"), ">");
});

test("slang parser rejects malformed, oversized and unsafe records", () => {
  assert.deepEqual(parseSlangDecision('```json\n{"entries":[]}\n```'),{entries:[]});
  for (const patch of [{term:"<a>"},{meaning:"x".repeat(401)},{context:null},{evidence:"two\nlines"},{confidence:"1"},{confidence:2}]) assert.throws(()=>parseSlangDecision(JSON.stringify({entries:[{...candidate,...patch}]})));
  assert.equal(parseSlangDecision(JSON.stringify({entries:[{term:"轮椅",evidence:candidate.evidence,sourceId:"post:body"}]})).entries[0].meaning,"");
  assert.throws(()=>parseSlangDecision(JSON.stringify({entries:Array(13).fill(candidate)})));
  assert.throws(()=>parseSlangDecision('{"action":"send"}'));
});

test("learning grounds evidence, keeps uncertainty and never overwrites manual corrections or disabled terms", () => {
  const state = slangState({});
  assert.equal(learn(state,{evidence:"原文不存在的轮椅"}),0);
  assert.equal(learn(state,{term:"逃课"}),0);
  assert.equal(learn(state),1);
  assert.equal(state.entries[0].status,"pending","high confidence never auto-confirms a candidate");
  assert.equal(relevantSlang(state,input)[0].usable,false);
  assert.equal(relevantSlang(state,input)[0].meaning,undefined,"unconfirmed guesses never reach the reply model");
  learn(state,{meaning:"另一种解释"});
  assert.equal(state.entries[0].status,"pending");
  assert.equal(relevantSlang(state,input)[0].usable,false);
  assert.equal(state.entries[0].alternatives.length,1);
  updateSlang(state,{action:"save",id:state.entries[0].id,term:"轮椅",meaning:"人工纠正含义",context:"游戏配装"},200);
  learn(state,{meaning:"不能覆盖人工"});
  assert.equal(state.entries[0].meaning,"人工纠正含义");
  updateSlang(state,{action:"disable",id:state.entries[0].id},201);
  learn(state);
  assert.deepEqual(relevantSlang(state,input),[]);
  updateSlang(state,{action:"enable",id:state.entries[0].id},202);
  assert.equal(relevantSlang(state,input)[0].verified,true);
  assert.throws(()=>updateSlang(state,{action:"save",term:"轮椅",meaning:"重复",context:"测试"},203),/已存在/);
});

test("uncertain candidates remain pending and Latin abbreviations match word boundaries", () => {
  const state = slangState({});
  learn(state,{confidence:0.5});
  assert.equal(state.entries[0].status,"pending");
  updateSlang(state,{action:"confirm",id:state.entries[0].id},200);
  assert.equal(state.entries[0].status,"active");
  updateSlang(state,{action:"save",term:"OP",meaning:"过强",context:"游戏平衡"},201);
  assert.equal(relevantSlang(state,{incoming:"hope"}).length,0);
  assert.equal(relevantSlang(state,{incoming:"这角色op了"})[0].term,"OP");
  assert.equal(relevantSlang(state,{incoming:"ops"}).length,0);
});

function fixture(t, generate) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),"heybox-slang-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const account = {id:"7",identity:"identity",cookie:"never-in-prompt"};
  const sent=[];
  const api = async (_account,endpoint,params,method,form) => {
    if (method === "POST") {sent.push(form);return {commentid:"101"};}
    if (endpoint.endsWith("/feeds")) return {result:{links:params.offset === "0" ? [{linkid:"11"}] : []}};
    if (endpoint.endsWith("/tree")) return {result:{link:{linkid:"11",title:input.post.title,text:[{text:input.post.body}],user:{userid:"8",username:"作者"}},comments:[{commentid:"90",text:"确实是轮椅配装",user:{userid:"8"}}]}};
    return {result:{messages:[]}};
  };
  return { worker:new Automation({directory,account:()=>account,api,generate,wait:async()=>{}}), account, sent, directory };
}

test("learning is opt-in, works during read-only browsing and persists before comment generation", async t => {
  const calls=[];
  const {worker,sent,directory,account}=fixture(t,async payload=>{
    calls.push(payload);
    assert.ok(!JSON.stringify(payload).includes("never-in-prompt"));
    return payload.kind === "slang" ? {entries:[candidate]} : {action:"send",text:"这套配装确实省操作。"};
  });
  assert.equal(defaults.slangLearning,false);
  assert.throws(()=>validateConfig({slangLearning:"true"}));
  worker.configure({enabled:true}); await worker.run();
  assert.equal(calls.length,0);
  worker.data.accounts[account.id].seen={}; worker.data.accounts[account.id].offset=0; worker.save();
  worker.configure({slangLearning:true}); await worker.run();
  assert.deepEqual(calls.map(v=>v.kind),["slang"]);
  assert.equal(sent.length,0);
  const restored=new Automation({directory,account:()=>account,api:worker.api,generate:worker.generate,wait:worker.wait});
  assert.equal(restored.status().slang.entries[0].meaning,candidate.meaning);
  restored.editSlang({accountId:account.id,action:"confirm",id:restored.status().slang.entries[0].id});
  restored.data.accounts[account.id].seen={}; restored.data.accounts[account.id].offset=0; restored.save();
  restored.configure({autoComment:true}); await restored.run();
  assert.deepEqual(calls.map(v=>v.kind),["slang","comment"],"repeated context does not re-extract");
  assert.equal(calls.at(-1).slang[0].meaning,candidate.meaning);
  assert.ok(calls.at(-1).comments.some(v=>v.text === "确实是轮椅配装"));
  assert.equal(sent.length,1);
  account.id="9";
  assert.equal(restored.status().slang.entries.length,0);
  assert.throws(()=>restored.editSlang({accountId:"7",action:"confirm",id:"anything"}),/账号已切换/);
});

test("reply extraction keeps new meanings unconfirmed; only reviewed entries provide meanings", async t => {
  const calls=[];
  const {worker,account}=fixture(t,async payload=>{calls.push(payload);return payload.kind === "slang" ? {entries:[candidate]} : {action:"skip"};});
  worker.configure({autoReply:true,slangLearning:true});
  worker.controller=new AbortController();
  const a=worker.accountState(account);
  const job={kind:"reply",key:"reply:92",postId:"11",replyId:"92",input:{kind:"reply",...input,parent:"你这套配装怎么样",incoming:"这套配装真是轮椅"}};
  await worker.interact(a,account,()=>true,job);
  assert.deepEqual(calls.map(v=>v.kind),["slang","reply"]);
  assert.equal(calls[1].slang[0].meaning,undefined);
  updateSlang(slangState(a),{action:"confirm",id:a.slang.entries[0].id},Date.now());
  await worker.interact(a,account,()=>true,{...job,key:"reply:93",replyId:"93"});
  assert.equal(calls.at(-1).slang[0].meaning,candidate.meaning);
  worker.data.config.slangEnabled=false;
  await worker.interact(a,account,()=>true,{...job,key:"reply:94",replyId:"94"});
  assert.equal(calls.at(-1).slang,undefined);
});

test("failed or cancelled learning never stores guessed meanings or sends a reply", async t => {
  for (const cancel of [false,true]) {
    let worker;
    let interactions=0;
    ({worker}=fixture(t,async payload=>{
      if (payload.kind === "slang") {
        if (cancel) {worker.cancel();return {entries:[candidate]};}
        throw new Error("upstream secret diagnostics");
      }
      interactions++;
      return {action:"skip"};
    }));
    worker.configure({enabled:true,autoComment:true,slangLearning:true});
    await worker.run();
    assert.equal(worker.status().slang.entries.length,0);
    assert.ok(!JSON.stringify(worker.status()).includes("upstream secret"));
    assert.equal(interactions,cancel ? 0 : 1,"cancel prevents the next generation; extraction failure allows normal skip");
  }
});

test("reply queue reads real relationships and falls back to our saved parent before using learned slang", async t => {
  const calls=[];
  const {worker,account,sent}=fixture(t,async payload=>{calls.push(payload);return payload.kind === "slang" ? {entries:[candidate]} : {action:"send",text:"确实更省操作，机制还是得留意。"};});
  const original=worker.api;
  worker.api=async(_account,endpoint,params,method,form)=>{
    if(endpoint.endsWith("/message")) return {result:{messages:[{comment_a_id:"92",root_comment_id:"90",linkid:"11",is_unread:1}]}};
    if(endpoint.endsWith("/tree")) return {result:{link:{linkid:"11",...input.post,text:input.post.body,user:{userid:"8"}},comments:[
      {commentid:"90",text:"配装讨论",user:{userid:"8"}},
      {commentid:"92",root_id:"90",reply_id:"91",text:"<p>这套配装真是轮椅</p>",user:{userid:"8"},replyuser:{userid:"7"}},
    ]}};
    return original(_account,endpoint,params,method,form);
  };
  worker.configure({autoReply:true,slangLearning:true});
  worker.editSlang({action:"save",accountId:account.id,term:candidate.term,meaning:candidate.meaning,context:candidate.context});
  const a=worker.accountState(account);
  a.actions["old"]={status:"sent",commentId:"91",postId:"11",displayText:"我这套配装更省操作"};worker.save();
  await worker.run("reply");
  assert.deepEqual(calls.map(v=>v.kind),["slang","reply"]);
  assert.equal(calls[1].parent,"我这套配装更省操作");
  assert.equal(calls[1].incoming,"这套配装真是轮椅");
  assert.equal(calls[1].slang[0].meaning,candidate.meaning);
  assert.equal(sent[0].reply_id,"92");assert.equal(sent[0].root_id,"90");
});

test("renaming and re-adding a term preserves distinct identities; cache and source evidence stay bounded", () => {
  const state=slangState({});learn(state);
  const first=state.entries[0].id;
  updateSlang(state,{action:"save",id:first,term:"原词的新名字",meaning:"新的含义",context:"游戏"},1);
  updateSlang(state,{action:"save",term:"轮椅",meaning:"重新添加的含义",context:"游戏"},2);
  assert.notEqual(state.entries[0].id,state.entries[1].id);
  for(let i=0;i<205;i++) learn(state,{}, {post:{...input.post,title:"语境"+i}});
  assert.equal(state.sources.length,200);
  const full={entries:Array.from({length:500},(_,i)=>({id:String(i),term:"条目"+i})),sources:[]};
  assert.equal(learn(full),0);
  assert.throws(()=>updateSlang(full,{action:"save",term:"新的词",meaning:"含义",context:"游戏"},3),/500/);
});

test("DSH slang extraction uses structured parser and guarded prompt", async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-slang-generator-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const entry=path.join(directory,"fake.mjs");
  fs.writeFileSync(entry,`process.stdout.write(${JSON.stringify(JSON.stringify({entries:[candidate]}))});`);
  const decision=await generateDecision({kind:"slang",...input},{...defaults,nodePath:process.execPath,dshCommand:entry},{directory,signal:new AbortController().signal});
  assert.equal(decision.entries[0].term,"轮椅");
  fs.writeFileSync(entry,`process.stdout.write(${JSON.stringify(JSON.stringify(researchDecision))});`);
  const research=await generateDecision({kind:"slang-research",term:"轮椅"},{...defaults,nodePath:process.execPath,dshCommand:entry},{directory,signal:new AbortController().signal});
  assert.equal(research.sourceUrls[0],webSources[0].url);
  const prompt=decisionMessages({kind:"reply",...input},defaults)[0].content;
  assert.ok(prompt.includes("usable=false"));
  assert.ok(prompt.includes("skip"));
});

test("slang host routes validate origin, content type, account and persistence", async t => {
  const {apply}=await import("../lib/index.js");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-slang-routes-"));
  const previous=process.env.DSH_HOME;process.env.DSH_HOME=directory;
  t.after(()=>{if(previous === undefined) delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;fs.rmSync(directory,{recursive:true,force:true});});
  fs.mkdirSync(path.join(directory,"heybox"));
  fs.writeFileSync(path.join(directory,"heybox","state.json"),JSON.stringify({cookie:"heybox_id=7; user_pkey=private",heyboxId:"7",deviceId:"test"}));
  const routes=new Map();apply({webServer:{register:spec=>routes.set(spec.path,spec)},effect(){}});
  async function call(body,headers={},method="POST") {
    const req=Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req,{method,headers:{host:"localhost",origin:"http://localhost","content-type":"application/json",...headers}});
    let code,data;
    await routes.get("/heybox/slang").handler(req,{setHeader(){},writeHead(value){code=value;},end(value){data=JSON.parse(value);}});
    return {code,data};
  }
  const save={action:"save",accountId:"7",term:"轮椅",meaning:"低操作难度配装",context:"游戏"};
  assert.equal((await call(save,{origin:"https://other.example"})).code,403);
  assert.equal((await call(save,{"content-type":"text/plain"})).code,415);
  assert.equal((await call({...save,accountId:"8"})).code,400);
  assert.equal((await call({...save,action:"exec"})).code,400);
  const result=await call(save);
  assert.equal(result.code,200);
  assert.equal(result.data.slang.entries[0].verified,true);
  assert.ok(!JSON.stringify(result).includes("user_pkey"));
  assert.equal((await call({}, {}, "GET")).data.entries[0].term,"轮椅");
  assert.equal((await call({}, {}, "DELETE")).code,405);
  const restored=new Automation({directory:path.join(directory,"heybox"),account:()=>({id:"7"})});
  assert.equal(restored.status().slang.entries[0].meaning,"低操作难度配装");
});

test("candidate extraction accepts unknown meanings, grounds source IDs and excludes system failures",()=>{
  const state=slangState({});
  assert.equal(learn(state,{sourceId:"incoming"}),0,"wrong source ID cannot cite post text");
  const raw={term:candidate.term,evidence:candidate.evidence,sourceId:"post:body"};
  learnSlang(state,{entries:[raw,raw]},input,{postId:"11",now:1});
  assert.equal(state.entries.length,1);assert.equal(state.entries[0].meaning,"");
  assert.equal(state.entries[0].occurrences,1);assert.equal(state.entries[0].sources[0].sourceId,"post:body");
  assert.throws(()=>updateSlang(state,{action:"confirm",id:state.entries[0].id},2),/先研究/);
  const errorText="agent 处理出错：This model is temporarily unavailable";
  assert.equal(learnSlang(state,{entries:[{term:"temporarily",evidence:errorText}]},{incoming:errorText},{postId:"11",now:2}),0);
});

test("batch review skips unexplained candidates, rejects persistently and deletes explicitly",()=>{
  const state=slangState({});learn(state);
  learnSlang(state,{entries:[{term:"逃课",evidence:"这套打法是逃课"}]},{incoming:"这套打法是逃课"},{postId:"11",now:1});
  const ids=state.entries.map(v=>v.id);
  assert.deepEqual(updateSlangBatch(state,{action:"confirm",ids},2),{updated:1,skipped:1});
  assert.equal(state.entries[1].status,"pending");
  assert.equal(relevantSlang(state,input)[0].meaning,candidate.meaning);
  assert.throws(()=>updateSlangBatch(state,{action:"delete",ids:[ids[0],"foreign-account-id"]},3));
  assert.equal(state.entries.length,2,"invalid batch does not partially mutate");
  updateSlangBatch(state,{action:"disable",ids},4);learn(state);
  assert.equal(state.entries[0].status,"disabled");
  updateSlangBatch(state,{action:"delete",ids},5);assert.equal(state.entries.length,0);
});

test("explicit extraction analyzes retained contexts without enabling automatic learning or sending",async t=>{
  const calls=[];
  const {worker,sent,account}=fixture(t,async payload=>{calls.push(payload);return {entries:[{term:"轮椅",sourceId:"post:body",evidence:candidate.evidence}]};});
  worker.configure({enabled:true});await worker.run();
  assert.equal(calls.length,0);assert.equal(worker.status().slang.contextCount,1);
  worker.configure({enabled:false});
  assert.equal(worker.runSlang({action:"extract",accountId:account.id}).busy,true);
  await worker.running;
  assert.equal(worker.status().slang.entries[0].meaning,"");
  assert.equal(worker.status().slang.entries[0].status,"pending");
  assert.equal(calls[0].sources.find(v=>v.sourceId === "post:body").text,input.post.body);
  assert.equal(worker.status().config.slangLearning,false);assert.equal(sent.length,0);
  assert.throws(()=>worker.runSlang({action:"extract",accountId:account.id}),/暂无/);
});

function seedCandidate(worker,account) {
  const state=slangState(worker.accountState(account));
  learnSlang(state,{entries:[{term:"轮椅",sourceId:"post:body",evidence:candidate.evidence}]},input,{postId:"11",now:1});
  worker.save();return state.entries[0].id;
}
const webSources=[{url:"https://example.org/glossary",title:"游戏用语",snippet:"轮椅在配装讨论中表示低操作门槛的强力配装。"}];
const researchDecision={meaning:candidate.meaning,context:candidate.context,confidence:0.94,sourceUrls:[webSources[0].url]};

test("host search precedes model research; citations persist but only confirmation enables reply meanings",async t=>{
  const calls=[];
  const {worker,account,sent}=fixture(t,async payload=>{calls.push(payload);return researchDecision;});
  worker.search=async(request,signal)=>{assert.ok(!signal.aborted);assert.ok(request.query.includes("轮椅"));assert.ok(!request.query.includes(account.cookie));return {sources:webSources};};
  const id=seedCandidate(worker,account);
  assert.equal(worker.runSlang({action:"research",accountId:account.id,ids:[id]}).runningKind,"slang");
  assert.throws(()=>worker.editSlang({action:"confirm",accountId:account.id,id}),/运行中/);
  await worker.running;
  const entry=worker.status().slang.entries[0];
  assert.equal(calls[0].kind,"slang-research");assert.equal(calls[0].searchSources[0].url,webSources[0].url);
  assert.equal(entry.research.status,"done");assert.equal(entry.status,"pending");assert.equal(entry.verified,false);
  assert.equal(relevantSlang(slangState(worker.data.accounts[account.id]),input)[0].meaning,undefined);
  worker.editSlang({action:"confirm",accountId:account.id,id});
  assert.equal(relevantSlang(slangState(worker.data.accounts[account.id]),input)[0].meaning,candidate.meaning);
  assert.equal(sent.length,0);
});

test("research failure, missing search sources and fabricated citations never confirm or leak diagnostics",async t=>{
  for(const mode of ["unavailable","empty","citation","model-error"]){
    const {worker,account,sent}=fixture(t,async()=>{if(mode === "model-error")throw new Error("private upstream diagnostic");return {...researchDecision,sourceUrls:["https://invented.example/false"]};});
    const id=seedCandidate(worker,account);
    worker.search=async()=>{if(mode === "unavailable")throw new Error("secret-provider-key");return {sources:mode === "empty" ? [] : webSources};};
    worker.runSlang({action:"research",accountId:account.id,ids:[id]});await worker.running;
    const status=worker.status();assert.equal(status.slang.entries[0].status,"pending");assert.equal(status.slang.entries[0].meaning,"");
    assert.equal(status.slang.entries[0].research.status,"error");assert.equal(status.slang.task.failed,1);
    assert.ok(!JSON.stringify(status).includes("secret-provider-key"));assert.ok(!JSON.stringify(status).includes("private upstream"));assert.equal(sent.length,0);
  }
});

test("cancel or account switch during search discards research; a stopped provider cannot block task cleanup",async t=>{
  for(const changeAccount of [false,true]){
    let resolve;let generated=0;
    const {worker,account}=fixture(t,async()=>{generated++;return researchDecision;});
    worker.search=()=>new Promise(done=>{resolve=done;});
    const id=seedCandidate(worker,account);
    worker.runSlang({action:"research",accountId:account.id,ids:[id]});
    for(let i=0;i<10 && !resolve;i++)await Promise.resolve();
    if(changeAccount){account.id="8";assert.equal(worker.status().slang.task,null);resolve({sources:webSources});}
    else worker.cancel();
    await worker.running;assert.equal(generated,0);assert.equal(worker.status().busy,false);
    if(!changeAccount)assert.equal(worker.status().slang.entries[0].meaning,"");
    resolve({sources:webSources});
  }
  const controller=new AbortController();
  await assert.rejects(searchSlang(()=>new Promise(()=>{}),{query:"轮椅"},controller.signal,10),/超时/);
});

test("research sources reject unsafe links and model citations must be in actual search results",()=>{
  const sources=researchSources({sources:[{url:"javascript:alert(1)"},{url:"https://user:secret@example.org"},...webSources,...webSources]});
  assert.equal(sources.length,1);
  const entry={status:"pending",verified:false};
  assert.throws(()=>applySlangResearch(entry,{...researchDecision,sourceUrls:["https://invented.example"]},sources,1),/之外/);
  assert.equal(entry.meaning,undefined);
  applySlangResearch(entry,researchDecision,sources,2);assert.equal(entry.verified,false);
});

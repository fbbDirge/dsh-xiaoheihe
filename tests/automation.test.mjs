import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Automation, defaults, validateConfig, inValley, mentionText, commentText, isNewReply } from "../lib/automation.js";
import { parseDecision } from "../lib/generator.js";

function fixture(t, overrides = {}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"heybox-test-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let time=Date.parse("2026-10-23T12:00:00Z");
  const sent=[];
  const account={id:"7",identity:"test",cookie:"never-in-prompt"};
  const api=async (_account, endpoint, params, method, form)=> {
    if(method==="POST") {sent.push(form);return {status:"ok",commentid:String(100+sent.length)};}
    if(endpoint.endsWith("/feeds")) return {result:{links:[1,2,3].slice(+params.offset).map((linkid)=>({linkid}))}};
    if(endpoint.endsWith("/tree")) return {result:{link:{linkid:params.link_id,title:"游戏体验",text:"剧情与关卡值得讨论",user:{userid:8,username:"作者"}},comments:[]}};
    return {result:{messages:[]}};
  };
  const worker=new Automation({directory,account:()=>account,api,generate:async ()=>({action:"send",text:"这个关卡设计挺有意思。"}),now:()=>time,wait:async(ms)=>{time+=ms;},...overrides});
  return {worker,sent,directory,account,advance:(ms)=>{time+=ms;}};
}

test("configuration rejects coercion, unknown fields and invalid windows",()=>{
  assert.equal(defaults.replyMaxAttempts,5);
  for(const value of [1,5,100]) assert.equal(validateConfig({replyMaxAttempts:value}).replyMaxAttempts,value);
  for(const value of [0,-1,101,1.5,"5",null]) assert.throws(()=>validateConfig({replyMaxAttempts:value}));
  for(const key of ["dailyComments","dailyReplies"]) {
    for(const value of [0,101,9999]) assert.equal(validateConfig({[key]:value})[key],value);
    for(const value of [-1,10000,1.5,"9999",null]) assert.throws(()=>validateConfig({[key]:value}));
  }
  for(const patch of [{enabled:"true"},{postsPerRound:0},{cooldownSeconds:0},{force:true},{intervalMinutes:1.5},{valleyWindows:[[900,900]]},{timeZone:"bad"}]) assert.throws(()=>validateConfig(patch));
  assert.equal(validateConfig({postsPerRound:3}).postsPerRound,3);
  assert.equal(validateConfig({ replyPersona: "理性讨论\n不编造经历" }).replyPersona, "理性讨论\n不编造经历");
  assert.throws(() => validateConfig({ replyPersona: 123 }));
  assert.throws(() => validateConfig({ replyPersona: "x".repeat(2001) }));
  assert.throws(() => validateConfig({ replyPersona: "bad\0" }));
});
test("valley uses Shanghai boundary, weekend and workday override",()=>{
  assert.equal(inValley(Date.parse("2026-10-23T03:59:00Z"),defaults),false);
  assert.equal(inValley(Date.parse("2026-10-23T04:00:00Z"),defaults),true);
  assert.equal(inValley(Date.parse("2026-10-23T06:00:00Z"),defaults),false);
  assert.equal(inValley(Date.parse("2026-10-23T16:30:00Z"),defaults),true);
  const noon=Date.parse("2026-10-24T02:00:00Z");
  assert.equal(inValley(noon,defaults),true);
  assert.equal(inValley(noon,{...defaults,workdays:["2026-10-24"]}),false);
});
test("custom schedule supports independent day types, full day and midnight boundaries", () => {
  const config = validateConfig({ valleyWindows: [[570, 645], [1320, 120]], weekendWindows: [[60, 180]], holidayWindows: [] });
  const at = (local) => Date.parse(local + "+08:00");
  for (const [local, allowed] of [
    ["2026-10-23T09:29:00", false], ["2026-10-23T09:30:00", true],
    ["2026-10-23T10:45:00", false], ["2026-10-23T22:00:00", true],
    ["2026-10-23T01:59:00", true], ["2026-10-23T02:00:00", false],
    ["2026-10-24T01:00:00", true], ["2026-10-24T03:00:00", false],
  ]) assert.equal(inValley(at(local), config), allowed, local);
  assert.equal(inValley(at("2026-10-24T01:00:00"), { ...config, holidays: ["2026-10-24"] }), false);
  assert.equal(inValley(at("2026-10-24T09:30:00"), { ...config, workdays: ["2026-10-24"] }), true);
  assert.equal(inValley(at("2026-10-23T23:59:00"), validateConfig({ valleyWindows: [[0, 1440]] })), true);
  assert.equal(inValley(at("2026-10-23T00:00:00"), validateConfig({ valleyWindows: [[0, 1440]] })), true);
  for (const key of ["valleyWindows", "weekendWindows", "holidayWindows"]) {
    for (const window of [[1440, 0], [0, 1441], [-1, 60], [60, 60], [0.5, 60]]) assert.throws(() => validateConfig({ [key]: [window] }));
    assert.deepEqual(validateConfig({ [key]: [] })[key], []);
  }
});
test("mention targets current author, invalid identities stop sending",()=>{
  const markup = mentionText({userid:"12345678",username:"示例用户"},"正文");
  assert.equal(markup, '<a data-user-id="12345678" href="https://api.xiaoheihe.cn/open_inapp/#heybox://%7B%22protocol_type%22%3A%22openUser%22%2C%22user_id%22%3A%2212345678%22%7D">@示例用户</a> 正文');
  const href = markup.match(/href="([^"]+)"/)[1];
  assert.deepEqual(JSON.parse(decodeURIComponent(href.split("#heybox://")[1])), { protocol_type:"openUser", user_id:"12345678" });
  assert.equal(new URLSearchParams(new URLSearchParams({ text:markup }).toString()).get("text"), markup);
  assert.ok(mentionText({userid:8,username:'A&B "昵称"'},"正文").includes('@A&amp;B &quot;昵称&quot;</a>'));
  assert.throws(()=>mentionText({username:"作者"},"正文"));
  for (const userid of ["0", "-1", '8" onclick="bad', "1e5"]) assert.throws(()=>mentionText({userid,username:"作者"},"正文"));
  for (const username of ['<a>用户', '用户\0', '@用户']) assert.throws(()=>mentionText({userid:8,username},"正文"));
});
test("custom mentions are added by host and modes survive restart", async (t) => {
  const { worker, sent, directory } = fixture(t);
  worker.configure({ enabled: true, autoComment: true, mentionTarget: "custom", mentionName: "指定用户", mentionUserId: "12345678" });
  await worker.run();
  assert.equal(sent[0].text, mentionText({userid:"12345678",username:"指定用户"}, "这个关卡设计挺有意思。"));
  const next = new Automation({ directory, account: worker.account });
  assert.equal(next.status().config.mentionName, "指定用户");
  assert.equal(next.status().config.mentionUserId, "12345678");
  assert.equal(commentText({ ...defaults, mentionTarget: "none" }, null, "正文"), "正文");
  assert.equal(commentText({ ...defaults, mentionAuthor: false, mentionTarget: "custom" }, null, "正文"), "正文");
  assert.equal(validateConfig({ mentionTarget: "custom", mentionName: " @指定用户 " }).mentionName, "指定用户");
  for (const mentionName of ["", "@@用户", "用\n户", "<用户>"]) assert.throws(() => validateConfig({ mentionTarget: "custom", mentionName }));
  for (const mentionUserId of [null, 12345678, "0", "-8", "1e8", "<8>", "1".repeat(21)]) assert.throws(() => validateConfig({ mentionUserId }));
  assert.equal(validateConfig({ mentionUserId: " 12345678 " }).mentionUserId, "12345678");
});
test("legacy nickname-only configs stay readable but never send an unbound mention", async (t) => {
  const { worker, sent } = fixture(t);
  worker.configure({ enabled:true, autoComment:true, mentionTarget:"custom", mentionName:"旧昵称" });
  const config = JSON.parse(fs.readFileSync(worker.configFile, "utf8"));
  delete config.mentionUserId;
  delete config.mentionPlainTextFallback;
  fs.writeFileSync(worker.configFile, JSON.stringify(config));
  worker.reload();
  assert.equal(worker.status().config.mentionName, "旧昵称");
  assert.equal(worker.status().config.mentionUserId, "");
  assert.equal(worker.status().config.mentionPlainTextFallback, false);
  assert.throws(() => commentText(worker.status().config, null, "正文"), /缺少用户 ID/);
  await worker.run();
  assert.equal(sent.length, 0);
  assert.equal(worker.status().usage.comment, 0);
  assert.ok(worker.status().history.some((v) => v.message.includes("缺少用户 ID")));
});
test("nickname-only mention fallback is opt-in, persists, and never replaces a bound mention",async(t)=>{
  assert.throws(()=>validateConfig({mentionPlainTextFallback:"true"}));
  const {worker,sent,directory}=fixture(t);
  worker.configure({enabled:true,autoComment:true,mentionTarget:"custom",mentionName:" @示例用户 ",mentionPlainTextFallback:true});
  await worker.run();
  assert.equal(sent.length,1);assert.equal(sent[0].text,"@示例用户 这个关卡设计挺有意思。");
  assert.equal(worker.status().interactions[0].displayText,sent[0].text);
  const next=new Automation({directory,account:worker.account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  assert.equal(next.status().config.mentionPlainTextFallback,true);
  assert.ok(commentText({...next.status().config,mentionUserId:"12345678"},null,"正文").startsWith('<a data-user-id="12345678"'));
  assert.equal(commentText({...next.status().config,mentionAuthor:false},null,"正文"),"正文");
  assert.equal(commentText({...next.status().config,mentionTarget:"none"},null,"正文"),"正文");
  next.configure({mentionName:"示例用户",mentionUserId:"",mentionPlainTextFallback:false});
  assert.throws(()=>commentText(next.status().config,null,"正文"),/缺少用户 ID/);
});
test("separate editable config preserves history and redacts keys", async (t) => {
  const { worker, directory } = fixture(t);
  worker.configure({ enabled: true, postsPerRound: 2, apiKey: "private-test-key" });
  await worker.run();
  const before = worker.watched();
  const config = JSON.parse(fs.readFileSync(worker.configFile, "utf8"));
  assert.equal(fs.statSync(worker.configFile).mode & 0o777, 0o600);
  assert.equal(config.apiKey, "private-test-key");
  assert.ok(!JSON.stringify(worker.status()).includes("private-test-key"));
  assert.ok(!fs.readFileSync(worker.file, "utf8").includes("private-test-key"));
  fs.writeFileSync(worker.configFile, JSON.stringify({ ...config, persona: "文件修改的人格", intervalMinutes: 45 }));
  worker.reload();
  assert.equal(worker.status().config.persona, "文件修改的人格");
  worker.configure({ dailyComments: 2 });
  assert.equal(worker.data.config.apiKey, "private-test-key");
  const next = new Automation({ directory, account: worker.account });
  assert.deepEqual(next.watched(), before);
  assert.equal(next.status().config.intervalMinutes, 45);
  assert.equal(next.status().apiKeyConfigured, true);
  next.configure({ apiKey: "" });
  assert.equal(next.status().apiKeyConfigured, false);
  for (const patch of [{ apiBaseUrl: "http://example.com/v1" }, { apiBaseUrl: "https://user:secret@example.com" }, { apiKey: "key\n" }, { generationProvider: "external" }]) assert.throws(() => validateConfig(patch));
});
test("model accepts only bounded structured content",()=>{
  assert.equal(parseDecision('{"action":"skip"}').action,"skip");
  assert.equal(parseDecision('```json\n{"action":"send","text":"评论"}\n```').text,"评论");
  for(const text of ['日志\n{"action":"skip"}','{"action":"send","text":"@其他人"}','{"action":"send","text":"<script>"}','{"action":"force"}']) assert.throws(()=>parseDecision(text));
});
test("timer waits until due, reads chosen batch and never overlaps",async(t)=>{
  const {worker,sent,advance}=fixture(t);
  worker.configure({enabled:true,autoComment:true,postsPerRound:2});
  await worker.tick(); assert.equal(sent.length,0);
  advance(30*60000); const run=worker.tick();
  await worker.tick(); await run;
  assert.equal(sent.length,2);
  assert.equal(sent[0].text,mentionText({userid:8,username:"作者"},"这个关卡设计挺有意思。"));
  assert.equal(worker.status().usage.comment,2);
  assert.equal(worker.status().history.filter((v)=>v.type==="browse").length,2);
  assert.equal(worker.status().interactions[0].text, sent[0].text);
  assert.equal(worker.status().interactions[0].displayText, "@作者 这个关卡设计挺有意思。");
  assert.equal(worker.status().interactions[0].status, "sent");
});
test("budget applies to manual rounds; per-post dedup survives restart",async(t)=>{
  const {worker,sent,directory}=fixture(t);
  worker.configure({enabled:true,autoComment:true,dailyComments:1,postsPerRound:2});
  await worker.run(); await worker.run();
  assert.equal(sent.length,1);
  const reopened=new Automation({directory,account:worker.account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  assert.equal(reopened.status().interactions[0].text, sent[0].text);
  await reopened.run(); assert.equal(sent.length,1);
});
test("watched archive survives event rotation, retry, upgrade and stays isolated from bili files", async (t) => {
  const { worker, directory } = fixture(t);
  const bili = path.join(directory, "..", path.basename(directory) + "-bili-duty");
  fs.mkdirSync(bili);
  t.after(() => fs.rmSync(bili, { recursive: true, force: true }));
  const seenFile = path.join(bili, "seen.md");
  const original = "- 2026-10-24 · BV1dsn86FEKB · 标题 · 挑中（值得看）\n";
  fs.writeFileSync(seenFile, original);
  worker.configure({ enabled: true, postsPerRound: 2 });
  await worker.run();
  for (let i = 0; i < 205; i++) worker.log("done", "event");
  assert.equal(worker.status().history.some((v) => v.type === "browse"), false);
  assert.equal(worker.watched().total, 2);
  worker.data.accounts[7].seen = {};
  worker.save();
  const reopened = new Automation({ directory, account: worker.account });
  assert.equal(reopened.watched().total, 2);
  assert.equal(reopened.watched({ limit: 1, offset: 1 }).records.length, 1);
  assert.equal(reopened.watched().records[0].title, "游戏体验");
  assert.throws(() => reopened.watched({ limit: 101 }));
  reopened.account = () => ({ id: "other" });
  assert.equal(reopened.watched().total, 0);
  assert.equal(fs.readFileSync(seenFile, "utf8"), original);

  const legacy = JSON.parse(fs.readFileSync(worker.file, "utf8"));
  delete legacy.accounts[7].watched;
  legacy.accounts[7].seen = { "1": 100, "2": 200 };
  legacy.history = [{ type: "browse", postId: "1", at: 100, title: "恢复的标题" }];
  fs.writeFileSync(worker.file, JSON.stringify(legacy));
  const migrated = new Automation({ directory, account: worker.account });
  assert.equal(migrated.watched().total, 2);
  assert.equal(migrated.watched().records.find((v) => v.postId === "1").title, "恢复的标题");
  assert.equal(migrated.watched().records.find((v) => v.postId === "2").title, "");
});
test("network ambiguity consumes quota and prevents retry",async(t)=>{
  let attempts=0;
  const {worker}=fixture(t);
  const read=worker.api;
  worker.api=async(...args)=>{if(args[3]==="POST"){attempts++;throw new Error("timeout");}return read(...args);};
  worker.configure({enabled:true,autoComment:true});
  await worker.run();
  assert.equal(worker.data.accounts[7].actions["post:1"].status,"unknown");
  assert.equal(worker.status().usage.comment,1);
  assert.equal(worker.status().interactions[0].status, "unknown");
  assert.ok(worker.status().interactions[0].text.includes("这个关卡"));
  worker.data.accounts[7].seen={}; worker.data.accounts[7].offset=0; worker.save();
  await worker.run(); assert.equal(attempts,1);
});
test("stop during generation blocks send; a second host cannot run",async(t)=>{
  let release, started;
  const ready=new Promise((r)=>{started=r;});
  const {worker,sent,directory}=fixture(t,{generate:async()=>{started();return new Promise((r)=>{release=r;});}});
  worker.configure({enabled:true,autoComment:true});
  const running=worker.run(); await ready;
  const other=new Automation({directory,account:worker.account,api:worker.api});
  assert.throws(()=>other.run(),/另一个任务/);
  worker.configure({enabled:false}); release({action:"send",text:"取消后的评论"}); await running;
  assert.equal(sent.length,0); assert.equal(worker.status().nextRunAt,null);
});
test("account changes during generation block send",async(t)=>{
  const f=fixture(t);
  f.worker.generate=async()=>{f.account.identity="changed";return {action:"send",text:"正文"};};
  f.worker.configure({enabled:true,autoComment:true});await f.worker.run();assert.equal(f.sent.length,0);
});
test("replies require an actual parent belonging to us and use incoming/root IDs",async(t)=>{
  const {worker,sent}=fixture(t);
  const read=worker.api;
  worker.api=async(...args)=>{
    if(args[1].endsWith("/message")) return {result:{messages:[
      {comment_a_id:91,root_comment_id:90,linkid:1,is_read:0},
      {comment_a_id:92,root_comment_id:90,linkid:1,is_read:0},
    ]}};
    if(args[1].endsWith("/tree")) {
      const result=await read(...args);
      result.result.comments=[{comment:[
        {commentid:90,user:{userid:7},text:"我的评论"},
        {commentid:91,reply_id:90,user:{userid:8},text:"你觉得结局怎么样？"},
        {commentid:92,reply_id:93,user:{userid:9},text:"别人的对话"},
      ]}];return result;
    }
    return read(...args);
  };
  worker.configure({enabled:true,autoReply:true,repliesPerRound:5,dailyComments:0});
  await worker.run("reply");
  assert.equal(sent.length,1); assert.equal(sent[0].reply_id,"91"); assert.equal(sent[0].root_id,"90");
  assert.equal(worker.status().usage.reply,1);
  assert.equal(worker.status().interactions[0].incoming, "你觉得结局怎么样？");
  assert.equal(worker.status().interactions[0].kind, "reply");
  await worker.run("reply");assert.equal(sent.length,1);
});

test("old configs gain reply persona; interaction records are isolated by account and bounded", (t) => {
  const { worker, account, directory } = fixture(t);
  const oldConfig = { ...defaults }; delete oldConfig.replyPersona;
  const actions = Object.fromEntries(Array.from({ length: 110 }, (_, i) => ["post:" + i, { status: "sent", at: i, postId: String(i), text: "正文" + i }]));
  actions["reply:old"] = { status: "unknown", at: 111, postId: "1" };
  fs.writeFileSync(worker.file, JSON.stringify({ config: oldConfig, accounts: { "7": { actions } }, history: [] }));
  const reopened = new Automation({ directory, account: () => account, api: worker.api });
  assert.equal(reopened.status().config.replyPersona, "");
  assert.equal(reopened.status().interactions.length, 100);
  assert.equal(reopened.status().interactions[0].kind, "reply");
  assert.equal(reopened.status().interactions[0].text, undefined);
  account.id = "8";
  assert.deepEqual(reopened.status().interactions, []);
});
test("read-only mode needs no model and no send",async(t)=>{
  const {worker,sent}=fixture(t,{generate:async()=>{throw new Error("must not generate");}});
  worker.configure({enabled:true,postsPerRound:3});await worker.run();
  assert.equal(sent.length,0);assert.equal(worker.status().history.filter((v)=>v.type==="browse").length,3);
});
test("corrupt state fails closed",(t)=>{
  const {directory,worker}=fixture(t);
  fs.writeFileSync(worker.file,"broken");
  const next=new Automation({directory,account:worker.account,api:worker.api});
  assert.ok(next.status().fault); assert.throws(()=>next.configure({enabled:true}));
});

test("temporary generation failure retries the same post without consuming send quota",async(t)=>{
  const {worker,sent}=fixture(t);
  const generate=worker.generate;
  worker.generate=async()=>{throw new Error("model unavailable");};
  worker.configure({enabled:true,autoComment:true});await worker.run();
  assert.equal(worker.status().usage.comment,0);
  worker.generate=generate;await worker.run();
  assert.equal(sent.length,1);assert.equal(sent[0].link_id,"1");
});

test("reply freshness respects explicit read flags and seconds/millisecond timestamps", () => {
  const baseline = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(isNewReply({is_read:0}, baseline), true);
  assert.equal(isNewReply({is_unread:false,timestamp:baseline+1000}, baseline), false);
  assert.equal(isNewReply({read_status:"unread"}, baseline), true);
  assert.equal(isNewReply({read_status:"read"}, baseline), false);
  assert.equal(isNewReply({timestamp:(baseline+1000)/1000}, baseline), true);
  assert.equal(isNewReply({create_at:baseline+1000}, baseline), true);
  for (const message of [{}, {timestamp:"bad"}, {timestamp:baseline}, {is_read:"unknown"}]) assert.equal(isNewReply(message,baseline),false);
  for (const patch of [{replyIntervalSeconds:29},{replyIntervalSeconds:86401},{replyFollowSchedule:"true"}]) assert.throws(()=>validateConfig(patch));
});

test("reply polling runs without browsing and preserves its independent due time", async (t) => {
  const {worker,advance}=fixture(t);
  let checks=0, feeds=0;
  const read=worker.api;
  worker.api=async(...args)=>{if(args[1].endsWith('/message')) checks++; if(args[1].endsWith('/feeds')) feeds++; return read(...args);};
  worker.configure({autoReply:true,replyIntervalSeconds:30});
  await worker.tick(); assert.equal(checks,1); assert.equal(feeds,0);
  const next=worker.status().nextReplyAt;
  await worker.tick(); assert.equal(checks,1);
  worker.configure({persona:"认真回答"}); assert.equal(worker.status().nextReplyAt,next);
  advance(30000); await worker.tick(); assert.equal(checks,2);
  worker.configure({enabled:true,intervalMinutes:1});
  advance(60000); await worker.tick(); await worker.tick();
  assert.equal(feeds,1); assert.equal(checks,3);
  assert.equal(worker.status().nextReplyAt,worker.now()+30000);
});

test("replies can run all day or follow browsing windows",async(t)=>{
  const {worker}=fixture(t);let checks=0;
  worker.api=async()=>{checks++;return {result:{messages:[]}};};
  worker.configure({autoReply:true,valleyOnly:true,valleyWindows:[],weekendWindows:[],holidayWindows:[]});
  await worker.run("reply"); assert.equal(checks,1);
  worker.configure({replyFollowSchedule:true});
  await worker.run("reply"); assert.equal(checks,1);
});

test("reply polling backs off, persists auth pause, and resumes with new credentials",async(t)=>{
  const {worker,account,directory,advance}=fixture(t);let calls=0;
  worker.api=async()=>{calls++;throw Object.assign(new Error("limited"),{kind:"rate_limit"});};
  worker.configure({autoReply:true,replyIntervalSeconds:30});
  await worker.tick(); assert.equal(worker.status().nextReplyAt,worker.now()+60000);
  advance(60000);
  worker.api=async()=>{calls++;throw Object.assign(new Error("login"),{kind:"authentication"});};
  await worker.tick(); assert.match(worker.status().replyPaused,/登录/);
  const next=new Automation({directory,account:()=>account,api:worker.api,now:worker.now});
  advance(3600000);await next.tick();assert.equal(calls,2);
  account.identity="new-test-session";
  next.api=async()=>{calls++;return {result:{messages:[]}};};
  await next.tick();assert.equal(calls,3);assert.equal(next.status().replyPaused,"");assert.equal(next.status().replyFailures,0);
});

function replyFixture(t, overrides = {}) {
  const f=fixture(t, overrides);const read=f.worker.api;
  f.worker.api=async(...args)=>{
    if(args[1].endsWith('/message')) return {result:{messages:[{comment_a_id:91,root_comment_id:90,linkid:1,is_unread:1}]}};
    if(args[1].endsWith('/tree')) return {result:{link:{linkid:1,title:"讨论"},comments:[{comment:[
      {commentid:90,user:{userid:7},text:"我的评论"},
      {commentid:91,reply_id:90,user:{userid:8},text:"请问怎么操作？"},
    ]}]}};
    return read(...args);
  };
  return f;
}

test("reply send deduplication and baseline survive restart",async(t)=>{
  const {worker,sent,directory,account,advance}=replyFixture(t);
  worker.configure({autoReply:true}); await worker.tick();assert.equal(sent.length,1);
  const baseline=worker.data.accounts[7].replyPoll.baselineAt;
  advance(180000);
  const next=new Automation({directory,account:()=>account,api:worker.api,now:worker.now,generate:worker.generate,wait:worker.wait});
  await next.tick();assert.equal(sent.length,1);assert.equal(next.data.accounts[7].replyPoll.baselineAt,baseline);
  account.id="9";account.identity="other-account";await next.tick();assert.equal(sent.length,1);
  assert.notEqual(next.data.accounts[9].replyPoll.baselineAt,baseline);
});

test("stopping all tasks during reply generation cancels sending and prevents overlap",async(t)=>{
  let release,started;const ready=new Promise(r=>{started=r;});
  const {worker,sent}=replyFixture(t,{generate:async()=>{started();return new Promise(r=>{release=r;});}});
  worker.configure({autoReply:true,enabled:true});
  const pending=worker.run("reply");await ready;
  assert.throws(()=>worker.run(),/正在运行/);
  worker.configure({enabled:false,autoReply:false});release({action:"send",text:"回复"});await pending;
  assert.equal(sent.length,0);assert.equal(worker.status().nextReplyAt,null);assert.equal(worker.status().nextRunAt,null);
  assert.equal(worker.status().replyQueue.length,1,"stopping retains unsent candidate");
});

test("unknown reply receipt never retries; captcha on send pauses polling",async(t)=>{
  for(const kind of ["network","captcha"]) {
    const {worker,sent}=replyFixture(t);const read=worker.api;let attempts=0;
    worker.api=async(...args)=>{if(args[3]==="POST"){attempts++;throw Object.assign(new Error("failed"),{kind});}return read(...args);};
    worker.configure({autoReply:true});await worker.run("reply");
    assert.equal(sent.length,0);assert.equal(worker.status().usage.reply,1);
    if(kind==="captcha") assert.match(worker.status().replyPaused,/验证/);
    else {await worker.run("reply");assert.equal(attempts,1);}
  }
});

test("platform rejection diagnostics persist; only queued replies retry", async(t)=>{
  for (const kind of ["comment","reply"]) {
    const {worker,directory,account}=replyFixture(t);const read=worker.api;let attempts=0;
    worker.api=async(...args)=>{
      if(args[3]==="POST") {attempts++;throw Object.assign(new Error("rejected"),{definitive:true,httpStatus:200,platformStatus:"failed",platformMessage:"缺失参数"});}
      return read(...args);
    };
    worker.configure(kind==="reply" ? {autoReply:true} : {enabled:true,autoComment:true,mentionAuthor:false});
    await worker.run(kind==="reply"?"reply":"browse");
    let record=worker.status().interactions[0];
    assert.equal(record.status,"rejected");assert.equal(record.platformMessage,"缺失参数");
    assert.equal(record.platformStatus,"failed");assert.equal(record.httpStatus,200);
    assert.match(worker.status().history.find(v=>v.type==="rejected").message,/缺失参数/);
    const next=new Automation({directory,account:()=>account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
    assert.equal(next.status().interactions[0].platformMessage,"缺失参数");
    await next.run(kind==="reply"?"reply":"browse");
    // The browser may process a different post; the rejected action itself stays unchanged.
    assert.equal(next.data.accounts[7].actions[kind==="reply"?"reply:91":"post:1"].status,"rejected");
    if(kind==="reply") { assert.equal(attempts,2); assert.equal(next.status().replyQueue.length,1); }
  }
});

test("diagnostics remove account and model secrets before saving",async(t)=>{
  const {worker,account}=fixture(t);const read=worker.api;
  worker.configure({enabled:true,autoComment:true,apiKey:"fixture-model-private"});
  worker.api=async(...args)=>{
    if(args[3]==="POST") throw Object.assign(new Error("failed"),{definitive:true,platformStatus:"failed",platformMessage:`${account.cookie} fixture-model-private user_pkey=fixture-pkey`});
    return read(...args);
  };
  await worker.run();
  const data=fs.readFileSync(worker.file,"utf8");
  for(const secret of [account.cookie,"fixture-model-private","fixture-pkey"]) assert.ok(!data.includes(secret));
});

test("ten replies drain in batches of five across restart after messages disappear",async(t)=>{
  const {worker,sent,directory,account}=replyFixture(t);const read=worker.api;
  let messages=Array.from({length:10},(_,i)=>({comment_a_id:91+i,root_comment_id:90,linkid:1,is_unread:1}));
  worker.api=async(...args)=>{
    if(args[1].endsWith('/message')) return {result:{messages}};
    if(args[1].endsWith('/tree')) return {result:{link:{linkid:1,title:"讨论"},comments:[{comment:[
      {commentid:90,user:{userid:7}},...Array.from({length:10},(_,i)=>({commentid:91+i,reply_id:90,user:{userid:8},text:"问题"})),
    ]}]}};
    return read(...args);
  };
  worker.configure({autoReply:true,repliesPerRound:5,dailyReplies:10});await worker.run("reply");
  assert.equal(sent.length,5);assert.equal(worker.status().replyQueue.length,5);
  messages=[];
  const next=new Automation({directory,account:()=>account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  assert.equal(next.status().replyQueue.length,5);await next.run("reply");
  assert.equal(sent.length,10);assert.equal(new Set(sent.map(v=>v.reply_id)).size,10);
  assert.equal(next.status().replyQueue.length,0);
});

test("generation failure is persisted and retried even when message discovery fails",async(t)=>{
  const {worker,sent,directory,account}=replyFixture(t);const read=worker.api;
  worker.configure({autoReply:true,apiKey:"queue-private-model"});
  worker.generate=async()=>{throw new Error("model failed queue-private-model "+account.cookie);};
  await worker.run("reply");
  assert.equal(sent.length,0);assert.equal(worker.status().replyQueue[0].attempts,1);
  const saved=fs.readFileSync(worker.file,"utf8");
  assert.ok(!saved.includes("queue-private-model"));assert.ok(!saved.includes(account.cookie));
  const next=new Automation({directory,account:()=>account,api:async(...args)=>{
    if(args[1].endsWith('/message')) throw new Error("temporary network error");
    return read(...args);
  },generate:async()=>({action:"send",text:"重试成功"}),now:worker.now,wait:worker.wait});
  await next.run("reply");assert.equal(sent.length,1);assert.equal(next.status().replyQueue.length,0);
  assert.equal(next.status().replyFailures,1);
});

test("explicit rejection retries successfully and each send attempt consumes quota",async(t)=>{
  const {worker,sent}=replyFixture(t);const read=worker.api;let attempts=0;
  worker.api=async(...args)=>{
    if(args[3]==="POST" && ++attempts===1) throw Object.assign(new Error("rejected"),{definitive:true,platformMessage:"稍后再试"});
    return read(...args);
  };
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(worker.status().replyQueue[0].state,"pending");
  await worker.run("reply");assert.equal(sent.length,1);assert.equal(attempts,2);
  assert.equal(worker.status().usage.reply,2);assert.equal(worker.status().replyQueue.length,0);
});

test("daily quota keeps pending replies until the next day",async(t)=>{
  const {worker,sent,advance}=replyFixture(t);const read=worker.api;let attempts=0;
  worker.api=async(...args)=>{
    if(args[3]==="POST" && ++attempts===1) throw Object.assign(new Error("rejected"),{definitive:true});
    return read(...args);
  };
  worker.configure({autoReply:true,dailyReplies:1});await worker.run("reply");
  await worker.run("reply");assert.equal(attempts,1);assert.equal(worker.status().replyQueue.length,1);
  advance(86400000);await worker.run("reply");assert.equal(sent.length,1);assert.equal(worker.status().replyQueue.length,0);
});

test("unknown send remains queued for confirmation without retry after restart",async(t)=>{
  const {worker,directory,account}=replyFixture(t);const read=worker.api;let attempts=0;
  worker.api=async(...args)=>{if(args[3]==="POST"){attempts++;throw new Error("timeout");}return read(...args);};
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(worker.status().replyQueue[0].state,"uncertain");
  const next=new Automation({directory,account:()=>account,api:worker.api,now:worker.now,wait:worker.wait});
  await next.run("reply");assert.equal(attempts,1);assert.equal(next.status().replyQueue[0].state,"uncertain");
  account.id="9";account.identity="other-session";assert.equal(next.status().replyQueue.length,0);
});

test("model skip finishes queue entry; old rejected records are not retroactively retried",async(t)=>{
  const {worker,sent}=replyFixture(t,{generate:async()=>({action:"skip"})});
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(worker.status().replyQueue.length,0);assert.equal(worker.data.accounts[7].actions["reply:91"].status,"skipped");
  worker.data.accounts[7].actions["reply:91"].status="rejected";worker.save();
  worker.generate=async()=>({action:"send",text:"回复"});await worker.run("reply");assert.equal(sent.length,0);
});

test("a failing candidate does not starve later replies",async(t)=>{
  const {worker,sent}=replyFixture(t);const read=worker.api;
  worker.api=async(...args)=>{
    if(args[1].endsWith('/message')) return {result:{messages:[91,92].map(v=>({comment_a_id:v,root_comment_id:90,linkid:1,is_unread:1}))}};
    if(args[1].endsWith('/tree')) {const tree=await read(...args);tree.result.comments[0].comment.push({commentid:92,reply_id:90,user:{userid:8},text:"可以回答"});return tree;}
    return read(...args);
  };
  worker.generate=async(input)=>{if(input.incoming.includes("请问")) throw new Error("model error");return {action:"send",text:"回答"};};
  worker.configure({autoReply:true,repliesPerRound:1});await worker.run("reply");
  assert.equal(sent.length,0);await worker.run("reply");assert.equal(sent[0].reply_id,"92");
  assert.equal(worker.status().replyQueue.length,1);
});

test("all discovered message pages are queued before processing a small batch",async(t)=>{
  const {worker}=replyFixture(t);const read=worker.api;const offsets=[];
  const messages=Array.from({length:25},(_,i)=>({comment_a_id:91+i,root_comment_id:90,linkid:1,is_unread:1}));
  worker.api=async(...args)=>{
    if(args[1].endsWith('/message')) {offsets.push(+args[2].offset);return {result:{messages:messages.slice(+args[2].offset,+args[2].offset+20)}};}
    return read(...args);
  };
  worker.configure({autoReply:true});await worker.run("reply");
  assert.deepEqual(offsets,[0,20]);assert.equal(worker.status().replyQueue.length,24);
});

test("temporarily incomplete comment tree retries instead of losing the queued reply",async(t)=>{
  const {worker,sent}=replyFixture(t);const read=worker.api;let missing=true;
  worker.api=async(...args)=>{
    if(missing && args[1].endsWith('/tree')) return {result:{link:{linkid:1},comments:[]}};
    return read(...args);
  };
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(sent.length,0);assert.match(worker.status().replyQueue[0].error,/评论关系/);
  missing=false;await worker.run("reply");assert.equal(sent.length,1);assert.equal(worker.status().replyQueue.length,0);
});

test("failure to save queued send intent prevents the network send",async(t)=>{
  const {worker,sent}=replyFixture(t);
  worker.configure({autoReply:true});const save=worker.save.bind(worker);
  worker.save=()=>{
    if(worker.data.accounts[7]?.actions['reply:91']?.status==='unknown') throw Object.assign(new Error("disk full"),{persistence:true});
    save();
  };
  await worker.run("reply");assert.equal(sent.length,0);assert.match(worker.fault,/保存/);
});

test("reply lookup resumes beyond five subcomment pages after restart",async(t)=>{
  const {worker,sent,directory,account}=replyFixture(t);const read=worker.api;const cursors=[];
  worker.api=async(...args)=>{
    if(args[1].endsWith('/tree')) return {result:{link:{linkid:1,title:"讨论"},comments:[{comment:[{commentid:90,user:{userid:7},text:"我的评论"}]}]}};
    if(args[1].endsWith('/sub/comments')) {
      const cursor=+(args[2].lastval||0);cursors.push(cursor);
      if(cursor===500) return {result:{comments:[{commentid:91,replyid:90,user:{userid:8},replyuser:{userid:7},text:"问题"}],has_more:false,lastval:91}};
      return {result:{comments:[{commentid:cursor+100,user:{userid:9},text:"其他评论"}],has_more:true,lastval:cursor+100}};
    }
    return read(...args);
  };
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(sent.length,0);assert.equal(worker.data.accounts[7].replyQueue[91].scanCursor,"500");
  const next=new Automation({directory,account:()=>account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  await next.run("reply");assert.deepEqual(cursors,[0,100,200,300,400,500]);
  assert.equal(sent.length,1);assert.equal(sent[0].reply_id,"91");assert.equal(next.status().replyQueue.length,0);
});

test("exhausted subcomment scan resets cursor to discover later additions",async(t)=>{
  const {worker}=replyFixture(t);const read=worker.api;
  worker.api=async(...args)=>{
    if(args[1].endsWith('/tree')) return {result:{link:{linkid:1},comments:[]}};
    if(args[1].endsWith('/sub/comments')) return {result:{comments:[{commentid:100,user:{userid:8}}],has_more:false,lastval:100}};
    return read(...args);
  };
  worker.configure({autoReply:true});await worker.run("reply");
  assert.equal(worker.status().replyQueue.length,1);assert.equal(worker.data.accounts[7].replyQueue[91].scanCursor,undefined);
});

function ownPostFixture(t, { rootId = 91, author = 7, targetUser = 8, generate, nested = false, replyUser = 7 } = {}) {
  const f = fixture(t, generate ? { generate } : {}), read = f.worker.api;
  f.worker.api = async (...args) => {
    if (args[1].endsWith('/message')) return { result: { messages: [{ comment_a_id: nested ? 92 : 91, root_comment_id: rootId, linkid: 1, is_unread: 1 }] } };
    if (args[1].endsWith('/tree')) return { result: { link: { linkid: 1, title: '我的游戏分享', text: '正文', user: author ? { userid: author } : undefined }, comments: [
      { comment: [{ commentid: 91, user: { userid: targetUser }, text: '请问适合新手吗？' }, ...(nested ? [{ commentid: 92, reply_id: 91, user: { userid: 9 }, replyuser: { userid: replyUser }, text: '继续问作者' }] : [])] }
    ] } };
    return read(...args);
  };
  return f;
}

test('own-post options validate and old configs remain opt-in', t => {
  assert.equal(defaults.replyOwnPosts, false);
  assert.equal(defaults.ownPostReplyPersona, 'reply');
  assert.throws(() => validateConfig({ replyOwnPosts: 'true' }));
  assert.throws(() => validateConfig({ ownPostReplyPersona: 'other' }));
  assert.throws(() => validateConfig({ replyOwnPosts: true, ownPostReplyPersona: 'posting', postingPersona: ' ' }));
  const f = fixture(t); f.worker.configure({ autoReply: true });
  const config = JSON.parse(fs.readFileSync(f.worker.configFile)); delete config.replyOwnPosts; delete config.ownPostReplyPersona;
  fs.writeFileSync(f.worker.configFile, JSON.stringify(config)); f.worker.reload();
  assert.equal(f.worker.data.config.replyOwnPosts, false);
});

test('own top-level comments use correct reply/root IDs and deduplicate after restart', async t => {
  for (const rootId of [91, 0, null]) {
    const inputs = [];
    const f = ownPostFixture(t, { rootId, generate: async (input, config) => { inputs.push({ input, config }); return { action: 'send', text: '新手可以从简单难度开始。' }; } });
    f.worker.configure({ autoReply: true, replyOwnPosts: true, replyPersona: 'REPLY_ONLY', postingPersona: 'POST_ONLY' });
    await f.worker.run('reply');
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0].reply_id, '91'); assert.equal(f.sent[0].root_id, '91');
    assert.equal(inputs[0].input.ownPost, true); assert.equal(inputs[0].config.replyPersona, 'REPLY_ONLY');
    assert.equal(f.worker.status().interactions[0].ownPost, true); assert.equal(f.worker.status().interactions[0].personaSource, 'reply');
    const reopened = new Automation({ directory: f.directory, account: f.worker.account, api: f.worker.api, generate: f.worker.generate, now: f.worker.now, wait: f.worker.wait });
    await reopened.run('reply'); assert.equal(f.sent.length, 1);
  }
});

test('disabled own-post switch preserves queued comments for re-enable and failed generation retries', async t => {
  let calls = 0;
  const f = ownPostFixture(t, { generate: async () => { if (++calls === 1) throw new Error('temporary'); return { action: 'send', text: '谢谢你的留言。' }; } });
  f.worker.configure({ autoReply: true }); await f.worker.run('reply');
  assert.equal(calls, 0); assert.equal(f.worker.status().replyQueue.length, 1);
  assert.match(f.worker.status().replyQueue[0].error, /已关闭/);
  f.worker.configure({ replyOwnPosts: true }); await f.worker.run('reply');
  assert.equal(f.worker.status().replyQueue.length, 1);
  await f.worker.run('reply'); assert.equal(f.sent.length, 1); assert.equal(f.worker.status().replyQueue.length, 0);
});

test('own-post author verification excludes self and other users conversations', async t => {
  for (const settings of [{ targetUser: 7 }, { author: 8 }, { nested: true, replyUser: 10 }]) {
    const f = ownPostFixture(t, settings); f.worker.configure({ autoReply: true, replyOwnPosts: true }); await f.worker.run('reply');
    assert.equal(f.sent.length, 0); assert.equal(f.worker.status().replyQueue.length, 0);
  }
  const f = ownPostFixture(t, { author: null }); f.worker.configure({ autoReply: true, replyOwnPosts: true }); await f.worker.run('reply');
  assert.equal(f.sent.length, 0); assert.match(f.worker.status().replyQueue[0].error, /帖子作者/);
});

test('own-post persona uses original post snapshot or current posting persona, including direct follow-up', async t => {
  for (const snapshot of [false, true]) for (const nested of [false, true]) {
    let used;
    const f = ownPostFixture(t, { nested, generate: async (_, config) => { used = config.replyPersona; return { action: 'send', text: '欢迎继续交流。' }; } });
    f.worker.configure({ autoReply: true, replyOwnPosts: true, ownPostReplyPersona: 'posting', postingPersona: 'CURRENT_POST', replyPersona: 'REPLY_ONLY' });
    if (snapshot) { f.worker.data.accounts['7'].posting.jobs.push({ postId: '1', status: 'verified', persona: 'ORIGINAL_POST', slot: f.worker.now() }); f.worker.save(); }
    await f.worker.run('reply'); assert.equal(used, snapshot ? 'ORIGINAL_POST' : 'CURRENT_POST');
    assert.equal(f.worker.status().interactions[0].personaSource, 'posting');
  }
  const f = replyFixture(t, { generate: async (_, c) => { assert.equal(c.replyPersona, 'REPLY_ONLY'); return { action: 'skip' }; } });
  f.worker.configure({ autoReply: true, replyOwnPosts: true, ownPostReplyPersona: 'posting', replyPersona: 'REPLY_ONLY' }); await f.worker.run('reply');
});

test('own-post replies honor per-round and daily limits and persist remaining work', async t => {
  const f = ownPostFixture(t), api = f.worker.api;
  f.worker.api = async (...args) => {
    if (args[1].endsWith('/message')) return { result: { messages: [91, 92].map(id => ({ comment_a_id: id, root_comment_id: id, linkid: 1, is_unread: 1 })) } };
    if (args[1].endsWith('/tree')) return { result: { link: { user: { userid: 7 }, title: '帖子' }, comments: [91, 92].map(id => ({ commentid: id, user: { userid: 8 }, text: '问作者' })) } };
    return api(...args);
  };
  f.worker.configure({ autoReply: true, replyOwnPosts: true, repliesPerRound: 1, dailyReplies: 1 }); await f.worker.run('reply'); await f.worker.run('reply');
  assert.equal(f.sent.length, 1); assert.equal(f.worker.status().replyQueue.length, 1);
  f.advance(86400000); await f.worker.run('reply'); assert.equal(f.sent.length, 2);
});

test('own-post root comment lookup resumes tree pagination across rounds', async t => {
  const f = ownPostFixture(t), api = f.worker.api, offsets = [];
  f.worker.api = async (...args) => {
    if (args[1].endsWith('/tree')) {
      const offset = +args[2].offset; offsets.push(offset);
      return { result: { link: { user: { userid: 7 }, title: '帖子' }, comments: offset === 600 ? [{ commentid: 91, user: { userid: 8 }, text: '问作者' }] : Array.from({ length: 100 }, (_, i) => ({ commentid: offset + i + 1000, user: { userid: 9 }, text: '其他留言' })) } };
    }
    return api(...args);
  };
  f.worker.configure({ autoReply: true, replyOwnPosts: true }); await f.worker.run('reply');
  assert.equal(f.sent.length, 0); assert.equal(f.worker.data.accounts['7'].replyQueue['91'].treeOffset, 600);
  await f.worker.run('reply'); assert.equal(f.sent.length, 1); assert.deepEqual(offsets, [0, 100, 200, 300, 400, 500, 0, 600]);
});


test('stopping during own-post generation blocks send and retains queued comment', async t => {
  let release;
  const f = ownPostFixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
  f.worker.configure({ autoReply: true, replyOwnPosts: true });
  const task = f.worker.run('reply');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.worker.configure({ autoReply: false });
  release({ action: 'send', text: '停止后不应发送' }); await task;
  assert.equal(f.sent.length, 0); assert.equal(f.worker.status().replyQueue.length, 1);
});

test('own-post rejected sends retry, unknown outcomes never auto resend', async t => {
  for (const definitive of [true, false]) {
    const f = ownPostFixture(t), read = f.worker.api; let attempts = 0;
    f.worker.api = async (...args) => {
      if (args[3] === 'POST' && ++attempts === 1) throw Object.assign(new Error('temporary refusal'), { definitive });
      return read(...args);
    };
    f.worker.configure({ autoReply: true, replyOwnPosts: true }); await f.worker.run('reply');
    assert.equal(f.worker.status().replyQueue.length, 1);
    await f.worker.run('reply');
    assert.equal(attempts, definitive ? 2 : 1);
    assert.equal(f.worker.status().replyQueue.length, definitive ? 0 : 1);
  }
});

test("reply generation failures stop at the configured limit and unread messages never recreate the job",async t=>{
  let generations=0;
  const {worker,sent}=replyFixture(t,{generate:async()=>{generations++;throw new Error("model failed");}});
  worker.configure({autoReply:true,replyMaxAttempts:3});
  for(let i=1;i<=3;i++){
    await worker.run("reply");
    assert.equal(generations,i);
    assert.equal(worker.status().replyQueue.length,i<3 ? 1 : 0);
  }
  const record=worker.status().interactions.find(v=>v.replyId === "91");
  assert.equal(record.status,"exhausted");assert.equal(record.attempts,3);assert.equal(record.retryLimit,3);
  assert.match(record.error,/model failed/);assert.equal(worker.status().replyExhaustedCount,1);
  await worker.run("reply");assert.equal(generations,3);assert.equal(sent.length,0);
  assert.equal(worker.status().usage.reply,0);
});

test("missing comment relationships and inaccessible posts have bounded lookup attempts",async t=>{
  for(const mode of ["missing","unavailable"]){
    const {worker,sent}=replyFixture(t);const read=worker.api;let lookups=0;
    worker.api=async(...args)=>{
      if(args[1].endsWith('/tree')){
        lookups++;
        if(mode === "unavailable")throw new Error("该内容暂不可查看");
        return {result:{link:{linkid:1},comments:[]}};
      }
      return read(...args);
    };
    worker.configure({autoReply:true,replyMaxAttempts:2});
    for(let i=0;i<4;i++)await worker.run("reply");
    assert.equal(lookups,2);assert.equal(sent.length,0);assert.equal(worker.status().replyQueue.length,0);
    assert.equal(worker.status().interactions[0].status,"exhausted");
    assert.ok(!worker.status().interactions[0].error.includes("下轮重试"));
  }
});

test("definitive reply rejections stop at the limit while retaining submitted text and receipt diagnostics",async t=>{
  const {worker}=replyFixture(t);const read=worker.api;let sends=0;
  worker.api=async(...args)=>{
    if(args[3] === "POST"){sends++;throw Object.assign(new Error("platform rejection"),{definitive:true,httpStatus:200,platformStatus:"failed",platformMessage:"不可回复"});}
    return read(...args);
  };
  worker.configure({autoReply:true,replyMaxAttempts:2});
  for(let i=0;i<4;i++)await worker.run("reply");
  assert.equal(sends,2);assert.equal(worker.status().usage.reply,2);assert.equal(worker.status().replyQueue.length,0);
  const record=worker.status().interactions[0];assert.equal(record.status,"exhausted");
  assert.ok(record.text);assert.equal(record.httpStatus,200);assert.equal(record.platformMessage,"不可回复");
});

test("legacy high-attempt queues retire without I/O, preserve uncertain sends and remain stopped after restart",async t=>{
  const {worker,account,directory,sent}=replyFixture(t);const read=worker.api;let lookups=0;
  worker.api=async(...args)=>{if(args[1].endsWith('/tree'))lookups++;return read(...args);};
  worker.configure({autoReply:true,dailyReplies:0});
  const a=worker.data.accounts[account.id];
  a.replyQueue={
    91:{replyId:"91",postId:"1",rootId:"90",attempts:2634,queuedAt:1,error:"暂未找到完整评论关系，下轮重试"},
    92:{replyId:"92",postId:"1",rootId:"90",attempts:2045,queuedAt:2,error:"发送结果未知"},
  };
  a.actions['reply:92']={status:"unknown",kind:"reply",postId:"1",replyId:"92",at:2,text:"待核实的旧回复"};worker.save();
  const config=JSON.parse(fs.readFileSync(worker.configFile,"utf8"));delete config.replyMaxAttempts;fs.writeFileSync(worker.configFile,JSON.stringify(config));
  const before=fs.readFileSync(worker.file,"utf8");
  const create=()=>new Automation({directory,account:()=>account,api:worker.api,generate:worker.generate,now:worker.now,wait:worker.wait});
  const next=create();
  assert.equal(next.status().config.replyMaxAttempts,5);
  assert.equal(fs.readFileSync(worker.file,"utf8"),before,"read-only reload must not overwrite an active host's state");
  assert.equal(next.status().interactions.find(v=>v.replyId === "91").status,"exhausted");
  assert.equal(next.status().replyQueue.length,1);assert.equal(next.status().replyQueue[0].state,"uncertain");
  await next.run("reply");assert.equal(lookups,0);assert.equal(sent.length,0);
  assert.equal(JSON.parse(fs.readFileSync(worker.file,"utf8")).accounts[account.id].actions['reply:91'].attempts,2634);
  next.configure({replyMaxAttempts:100,autoReply:false});next.configure({autoReply:true});
  const restored=create();await restored.run("reply");
  assert.equal(restored.status().replyExhaustedCount,1);assert.equal(lookups,0);
  account.id="9";assert.equal(restored.status().replyExhaustedCount,0);assert.equal(restored.status().replyQueue.length,0);
});

test("exhausted entries do not consume per-round slots or starve fresh replies",async t=>{
  const {worker,sent}=replyFixture(t);const read=worker.api;
  worker.configure({autoReply:true,repliesPerRound:1,replyMaxAttempts:2});
  const a=worker.data.accounts[7];
  a.replyQueue={91:{replyId:"91",postId:"1",rootId:"90",attempts:2,queuedAt:1,error:"旧失败"}};worker.save();
  worker.api=async(...args)=>{
    if(args[1].endsWith('/message'))return {result:{messages:[91,92].map(id=>({comment_a_id:id,root_comment_id:90,linkid:1,is_unread:1}))}};
    if(args[1].endsWith('/tree')){const tree=await read(...args);tree.result.comments[0].comment.push({commentid:92,reply_id:90,user:{userid:8},text:"新问题"});return tree;}
    return read(...args);
  };
  await worker.run("reply");
  assert.equal(sent.length,1);assert.equal(sent[0].reply_id,"92");assert.equal(worker.status().replyQueue.length,0);
  assert.equal(worker.status().replyExhaustedCount,1);
});

test("lowering the reply limit retires existing failures immediately without reviving them when raised",async t=>{
  const {worker,sent}=replyFixture(t,{generate:async()=>{throw new Error("failed");}});
  worker.configure({autoReply:true,replyMaxAttempts:5});
  for(let i=0;i<3;i++)await worker.run("reply");
  assert.equal(worker.status().replyQueue.length,1);
  const status=worker.configure({replyMaxAttempts:2});
  assert.equal(status.replyQueue.length,0);assert.equal(status.replyExhaustedCount,1);
  worker.configure({replyMaxAttempts:10});worker.generate=async()=>({action:"send",text:"不应恢复"});
  await worker.run("reply");assert.equal(sent.length,0);
});

test("uncertain last sends stay reserved, and a successful final attempt is never marked exhausted",async t=>{
  for(const mode of ["unknown","success"]){
    const {worker,sent}=replyFixture(t);const read=worker.api;
    worker.api=async(...args)=>{if(mode === "unknown" && args[3] === "POST")throw new Error("timeout");return read(...args);};
    worker.configure({autoReply:true,replyMaxAttempts:1});
    await worker.run("reply");await worker.run("reply");
    assert.equal(worker.status().replyExhaustedCount,0);
    if(mode === "unknown"){assert.equal(worker.status().replyQueue[0].state,"uncertain");assert.equal(sent.length,0);}
    else {assert.equal(worker.status().replyQueue.length,0);assert.equal(sent.length,1);assert.equal(worker.status().interactions[0].status,"sent");}
  }
});

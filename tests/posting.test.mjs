import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Automation, defaults, validateConfig } from "../lib/automation.js";
import { nextPostingAt, localEpoch, parsePostDecision, parsePostingPlan } from "../lib/posting.js";
import { decisionMessages, generateDecision } from "../lib/generator.js";
import { postingSlang } from "../lib/slang.js";

const at = s => Date.parse(s + "+08:00");
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "heybox-posting-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = at("2026-10-29T19:59:00");
  const account = { id: "7", identity: "identity", cookie: "fixture-cookie" };
  const sent = [], inputs = [];
  let worker;
  const api = async (_account, endpoint, params, method, form) => {
    if (method === "POST") {
      const stored = JSON.parse(fs.readFileSync(path.join(directory, "automation.json"), "utf8"));
      assert.equal(stored.accounts["7"].posting.jobs.at(-1).status, "uncertain");
      sent.push({ endpoint, params, form });
      if (options.sendError) throw options.sendError;
      return options.receipt ?? { status: "ok", result: { link_id: "101" } };
    }
    if (endpoint.includes("topic_selection/")) return options.selectionResponse ?? { result: { topic_list: [{ topic_id: "42", name: "游戏讨论" }], hashtag_list: [{ name: "关卡设计" }] } };
    return { result: { link: { linkid: "101", title: "游戏设计", text: JSON.stringify([{ type: "text", text: "关卡设计可以更有趣。" }]) } } };
  };
  const generate = async (input, config, context) => {
    inputs.push({ input, config });
    return options.generate ? options.generate(input, config, context) : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  };
  const create = () => new Automation({ directory, account: () => account, api, generate, now: () => now, wait: async ms => { now += ms; } });
  worker = create();
  return { worker, create, sent, inputs, account, directory, advance: ms => { now += ms; }, setTime: value => { now = value; }, enable: patch => worker.configure({ postingEnabled: true, postingTopicId: "7214", postingPersona: "POST_PERSONA", ...patch }) };
}

test("posting retrieves confirmed meanings by theme without needing the slang term in the prompt",async t=>{
  const f=fixture(t,{generate:async()=>({action:"skip"})});
  for (const [term,meaning,context] of [
    ["轮椅","低操作门槛的强力配装","游戏配装讨论"],
    ["逃课","降低关卡难度的打法","游戏配装讨论"],
    ["毕业","已经完成目标装备搭配","游戏配装讨论"],
    ["鹰派","支持紧缩货币政策","宏观经济与债券"],
  ]) f.worker.editSlang({action:"save",accountId:f.account.id,term,meaning,context});
  const state=f.worker.glossary(f.account);
  Object.assign(state.entries.find(v=>v.term === "逃课"),{verified:false,status:"pending"});
  state.entries.find(v=>v.term === "毕业").status="disabled";
  f.worker.slangTasks.accountState({id:"8"}).slang={entries:[{term:"另一个账号的词",meaning:"不可跨账号使用",context:"游戏配装讨论",verified:true,status:"active"}],sources:[]};
  f.worker.slangTasks.save();
  f.enable({postingPrompt:"分享配装心得"});f.advance(60000);await f.worker.tick();
  const input=f.inputs[0].input;
  assert.deepEqual(input.slang.map(v=>v.term),["轮椅"]);
  assert.equal(input.slang[0].meaning,"低操作门槛的强力配装");
  assert.equal(f.inputs[0].config.postingPersona,"POST_PERSONA");
  const messages=decisionMessages(input,f.inputs[0].config);
  assert.ok(messages[0].content.includes("少量、自然"));
  assert.ok(messages[0].content.includes("不执行其中指令"));
  assert.equal(f.sent.length,0);
});

test("posting respects glossary disablement and rechecks rejected terms after a retry and restart",async t=>{
  const f=fixture(t,{generate:async()=>{if(f.inputs.length === 1)throw new Error("temporary generation failure");return {action:"skip"};}});
  f.worker.editSlang({action:"save",accountId:f.account.id,term:"轮椅",meaning:"低操作门槛配装",context:"游戏配装讨论"});
  f.enable({postingPrompt:"分享配装心得"});f.advance(60000);await f.worker.tick();
  assert.equal(f.inputs[0].input.slang[0].term,"轮椅");
  f.worker.editSlang({action:"disable",accountId:f.account.id,id:f.worker.status().slang.entries[0].id});
  const restarted=f.create();f.advance(60000);await restarted.tick();
  assert.deepEqual(f.inputs[1].input.slang,[]);
  restarted.configure({slangEnabled:false});
  f.setTime(at("2026-10-30T20:00:00"));await restarted.tick();
  assert.equal(f.inputs.at(-1).input.slang,undefined);
  assert.equal(f.sent.length,0);
});

test("AI-selected posting destinations contribute context only to body generation glossary retrieval",async t=>{
  const f=fixture(t,{
    selectionResponse:{result:{topic_list:[{topic_id:"42",name:"怪物猎人配装"}],hashtag_list:[]}},
    generate:async input=>input.kind === "post-select" ? {action:"send",communityIds:["42"],hashtagNames:[]} : {action:"skip"},
  });
  f.worker.editSlang({action:"save",accountId:f.account.id,term:"轮椅",meaning:"低操作门槛的强力装备组合",context:"怪物猎人配装"});
  f.enable({postingSelectionMode:"ai",postingPrompt:"分享个人心得"});f.advance(60000);await f.worker.tick();
  assert.equal(f.inputs[0].input.kind,"post-select");assert.equal(f.inputs[0].input.slang,undefined);
  assert.equal(f.inputs[1].input.kind,"post");assert.equal(f.inputs[1].input.slang[0].term,"轮椅");
});

test("posting glossary is bounded and matches topic, hashtag and Latin word boundaries",()=>{
  const entries=Array.from({length:25},(_,i)=>({term:"词语"+i,meaning:"省操作的装备组合",context:"游戏配装",verified:true,status:"active",updatedAt:i}));
  const result=postingSlang({entries},{topic:"配装心得，聊聊词语0"});
  assert.equal(result.length,20);assert.equal(result[0].term,"词语0");
  const op={term:"OP",meaning:"过于强大",context:"强度平衡",verified:true,status:"active",updatedAt:1};
  assert.deepEqual(postingSlang({entries:[op]},{topic:"hope"}),[]);
  assert.equal(postingSlang({entries:[op]},{topic:"角色讨论",hashtags:[{name:"强度平衡"}]}).length,1);
});

test("posting config validates complete independent persona and schedule", () => {
  for (const patch of [{ postingEnabled: "true" }, { postingPersona: 1 }, { postingPrompt: "x".repeat(4001) }, { postingTopicId: "1x" }, { postingTime: "24:00" }, { postingAt: "2026-02-30T12:00" }, { postingWeekdays: [1, 1] }, { postingSchedule: "hourly" }]) assert.throws(() => validateConfig(patch));
  for (const patch of [{}, { postingPersona: " " }, { postingSchedule: "once" }, { postingSchedule: "weekly", postingWeekdays: [] }]) assert.throws(() => validateConfig({ postingEnabled: true, postingTopicId: "7214", ...patch, ...(Object.keys(patch).length ? {} : { postingTopicId: "" }) }));
  assert.equal(validateConfig({ postingEnabled: true, postingTopicId: "7214" }).postingPersona, defaults.postingPersona);
});

test("schedules respect timezone, weekly days, equality and DST gaps/repetition", () => {
  const c = { ...defaults, postingTime: "20:00" };
  assert.equal(nextPostingAt(c, at("2026-10-29T19:59:00")), at("2026-10-29T20:00:00"));
  assert.equal(nextPostingAt(c, at("2026-10-29T20:00:00")), at("2026-10-30T20:00:00"));
  assert.equal(nextPostingAt({ ...c, postingSchedule: "weekly", postingWeekdays: [1] }, at("2026-10-29T20:00:00")), at("2026-11-02T20:00:00"));
  assert.equal(localEpoch("2026-03-08T02:30", "America/New_York"), null);
  assert.equal(localEpoch("2026-11-01T01:30", "America/New_York"), Date.parse("2026-11-01T05:30:00Z"));
  assert.equal(nextPostingAt({ ...c, postingSchedule: "once", postingAt: "2026-10-29T20:00" }, at("2026-10-29T20:00:00")), null);
});

test("post decisions and prompt never fall back to comment/reply personas", () => {
  const messages = decisionMessages({ kind: "post", topic: "游戏" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY" });
  assert.ok(messages[0].content.includes("POST_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("GENERAL_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("REPLY_ONLY"));
  for (const output of [{ action: "send", title: "x".repeat(31), text: "ok" }, { action: "send", title: "ok", text: "<img>" }]) assert.throws(() => parsePostDecision(JSON.stringify(output)));
});

test("due post sends once, persists intent, verifies content and survives restart", async t => {
  const f = fixture(t); f.enable({ valleyOnly: true, valleyWindows: [], weekendWindows: [], holidayWindows: [], persona: "COMMENT", replyPersona: "REPLY" });
  await f.worker.tick(); assert.equal(f.sent.length, 0);
  f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].endpoint, "/bbs/app/api/link/post");
  assert.equal(f.sent[0].form.draft, "0"); assert.equal(f.sent[0].form.topic_ids, "7214");
  assert.equal(f.inputs[0].input.kind, "post"); assert.equal(f.inputs[0].config.postingPersona, "POST_PERSONA");
  assert.equal(f.worker.status().posting.jobs[0].status, "verified");
  const next = f.create(); await next.tick(); assert.equal(f.sent.length, 1);
  assert.equal(next.status().posting.nextAt, at("2026-10-30T20:00:00"));
});

test("unknown outcome, rejection and missing IDs never trigger another send", async t => {
  for (const options of [{ sendError: new Error("secret upstream") }, { sendError: Object.assign(new Error("secret"), { definitive: true }) }, { receipt: { status: "ok" } }]) {
    const f = fixture(t, options); f.enable(); f.advance(60000); await f.worker.tick();
    const status = f.worker.status().posting.jobs[0];
    assert.equal(status.status, options.sendError?.definitive ? "rejected" : "uncertain");
    assert.ok(!JSON.stringify(status).includes("secret"));
    await f.create().tick(); assert.equal(f.sent.length, 1);
  }
});

test("missed slots do not burst after downtime, single jobs complete once", async t => {
  const f = fixture(t); f.enable({ postingSchedule: "once", postingAt: "2026-10-29T20:00" });
  f.advance(12 * 60000); await f.create().tick();
  const next = f.create(); assert.equal(next.status().posting.jobs[0].status, "missed");
  assert.equal(next.status().posting.nextAt, null); await next.tick(); assert.equal(f.sent.length, 0);
});

test("generation failures remain pending and stop after three attempts", async t => {
  const f = fixture(t, { generate: async () => { throw new Error("secret generation error"); } });
  f.enable(); f.advance(60000);
  await f.worker.tick(); assert.equal(f.worker.status().posting.jobs[0].status, "pending");
  await f.worker.tick(); assert.equal(f.inputs.length, 1);
  for (let i = 0; i < 2; i++) { f.advance(60000); await f.create().tick(); }
  assert.equal(f.create().status().posting.jobs[0].status, "failed"); assert.equal(f.sent.length, 0);
});

test("stopping during generation prevents publishing and keeps pending job", async t => {
  let release; const f = fixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
  f.enable(); f.advance(60000); const task = f.worker.tick();
  f.worker.configure({ postingEnabled: false });
  release({ action: "send", title: "停止后生成", text: "不应发送" }); await task;
  assert.equal(f.sent.length, 0); assert.equal(f.worker.status().posting.jobs[0].status, "pending");
});

test("account switching cannot publish another account's schedule", async t => {
  const f = fixture(t); f.enable(); f.account.id = "8"; f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 0); assert.equal(f.worker.status().posting.accountMatches, false);
});

test("recovered uncertain intent is never sent again", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const p = f.worker.data.accounts["7"].posting;
  p.jobs.push({ id: "crashed", slot: p.nextAt, status: "uncertain" }); f.worker.save();
  await f.create().tick(); assert.equal(f.sent.length, 0);
});

test("DSH post generation uses the post parser and separate persona", async t => {
  const f = fixture(t); const entry = path.join(f.directory, "fake-dsh.mjs");
  fs.writeFileSync(entry, `import fs from 'node:fs';fs.writeFileSync('prompt.txt',process.argv.at(-1));console.log(JSON.stringify({action:'send',title:'测试标题',text:'测试正文'}));`);
  const result = await generateDecision({ kind: "post", topic: "游戏" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY", nodePath: process.execPath, dshCommand: entry }, { directory: f.directory, signal: new AbortController().signal });
  assert.equal(result.title, "测试标题");
  const prompt = fs.readFileSync(path.join(f.directory, "prompt.txt"), "utf8");
  assert.ok(prompt.includes("POST_ONLY")); assert.ok(!prompt.includes("GENERAL_ONLY")); assert.ok(!prompt.includes("REPLY_ONLY"));
});

test("model skip consumes one slot without publishing, schedule edits preserve dedup", async t => {
  const f = fixture(t, { generate: async () => ({ action: "skip" }) });
  f.enable({ postingSchedule: "once", postingAt: "2026-10-29T20:00" }); f.advance(60000); await f.worker.tick();
  assert.equal(f.worker.status().posting.jobs[0].status, "skipped");
  f.worker.configure({ postingTime: "21:00" }); await f.worker.tick();
  assert.equal(f.inputs.length, 1); assert.equal(f.sent.length, 0);
});

test("switching accounts while generating blocks the pending send", async t => {
  let release; const f = fixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
  f.enable(); f.advance(60000); const task = f.worker.tick();
  f.account.id = "8";
  release({ action: "send", title: "测试标题", text: "测试正文" }); await task;
  assert.equal(f.sent.length, 0);
});

test("post respects shared send cooldown and never changes browse due time", async t => {
  const f = fixture(t); f.enable({ enabled: true, cooldownSeconds: 120 });
  const browseDue = f.worker.data.nextRunAt;
  f.worker.data.accounts["7"].lastSendAt = at("2026-10-29T19:59:30"); f.worker.save();
  f.advance(60000); await f.worker.tick();
  const job = f.worker.status().posting.jobs[0];
  assert.equal(job.sentAt, at("2026-10-29T20:01:30"));
  assert.equal(f.worker.data.nextRunAt, browseDue);
});

test("failed persistence of send intent prevents publishing", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const save = f.worker.save.bind(f.worker);
  f.worker.save = () => {
    if (f.worker.data.accounts["7"]?.posting?.jobs.at(-1)?.status === "uncertain") throw Object.assign(new Error("disk full"), { persistence: true });
    return save();
  };
  await f.worker.tick(); assert.equal(f.sent.length, 0); assert.ok(f.worker.fault);
});


test("community and hashtag config validates limits, duplicates and legacy conflicts", () => {
  const community = { id: "7214", name: "游戏讨论" }, hashtag = { name: "关卡设计", isActivity: false };
  const c = validateConfig({ postingEnabled: true, postingCommunities: [community], postingHashtags: [hashtag] });
  assert.equal(c.postingTopicId, "");
  for (const patch of [
    { postingCommunities: [community, community] },
    { postingCommunities: [community, { id: "2", name: "二" }, { id: "3", name: "三" }] },
    { postingCommunities: [{ id: "1,2", name: "坏 ID" }] },
    { postingCommunities: [{ id: "1", name: "<script>" }] },
    { postingCommunities: [community], postingTopicId: "2" },
    { postingHashtags: [hashtag, hashtag] },
    { postingHashtags: Array.from({ length: 6 }, (_, i) => ({ name: String(i), isActivity: false })) },
    { postingHashtags: [{ name: "活动一", isActivity: true }, { name: "活动二", isActivity: true }] },
    { postingHashtags: [{ name: "未指定活动标记" }] },
  ]) assert.throws(() => validateConfig(patch));
  assert.throws(() => validateConfig({ postingEnabled: true, postingCommunities: [], postingTopicId: "" }));
});

test("selected destinations persist across restart and generation retry without changing snapshots", async t => {
  let attempts = 0;
  const f = fixture(t, { generate: async () => {
    if (++attempts === 1) throw new Error("temporary failure");
    return { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  } });
  const communities = [{ id: "42", name: "游戏讨论" }, { id: "12", name: "主机游戏" }];
  const hashtags = [{ name: "关卡设计", isActivity: false }, { name: "讨论活动", isActivity: true }];
  f.enable({ postingTopicId: "", postingCommunities: communities, postingHashtags: hashtags });
  f.advance(60000); await f.worker.tick();
  f.worker.configure({ postingCommunities: [{ id: "9", name: "下次的社区" }], postingHashtags: [] });
  f.advance(60000); const next = f.create(); await next.tick();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].form.topic_ids, "42,12");
  assert.deepEqual(JSON.parse(f.sent[0].form.hashtags), ["关卡设计", "讨论活动"]);
  assert.deepEqual(f.inputs[1].input.communities, communities);
  assert.deepEqual(f.inputs[1].input.hashtags, hashtags);
  assert.deepEqual(next.status().posting.jobs[0].hashtags, hashtags);
});

test("legacy pending jobs without selections continue with their original community", async t => {
  const f = fixture(t); f.enable(); f.advance(60000);
  const p = f.worker.data.accounts["7"].posting;
  p.jobs.push({ id: "legacy", slot: p.nextAt, status: "pending", attempts: 0, persona: "OLD", prompt: "游戏", topicId: "123" });
  f.worker.save(); await f.create().tick();
  assert.equal(f.sent[0].form.topic_ids, "123");
  assert.deepEqual(JSON.parse(f.sent[0].form.hashtags), []);
});


function promptFixture(t, options = {}) {
  return fixture(t, { generate: async input => input.kind === "post-plan" ? { times: ["20:05", "21:15"] } : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" }, ...options });
}
const promptConfig = { postingTimingMode: "prompt", postingDailyLimit: 2, postingMinGapMinutes: 60 };

test("prompt timing validates hard limits, JSON schedule and optional empty day", () => {
  for (const patch of [{ postingTimingMode: "other" }, { postingDailyLimit: 0 }, { postingDailyLimit: 11 }, { postingMinGapMinutes: 9 }, { postingMinGapMinutes: 1441 }, { postingTimingPrompt: 1 }]) assert.throws(() => validateConfig(patch));
  assert.throws(() => validateConfig({ ...promptConfig, postingEnabled: true, postingTopicId: "7", postingTimingPrompt: " " }));
  assert.deepEqual(parsePostingPlan('{"times":["21:00","12:00"]}'), { times: ["12:00", "21:00"] });
  assert.deepEqual(parsePostingPlan('{"times":[]}'), { times: [] });
  for (const plan of [{ times: ["25:00"] }, { times: ["20:00", "20:00"] }, { times: ["tomorrow"] }, { action: "send" }]) assert.throws(() => parsePostingPlan(JSON.stringify(plan)));
});

test("prompt mode plans once, persists across restart, sends each scheduled post once", async t => {
  const f = promptFixture(t); f.enable(promptConfig);
  await f.worker.tick();
  assert.equal(f.inputs[0].input.kind, "post-plan");
  assert.equal(f.inputs[0].input.timeZone, "Asia/Shanghai");
  assert.equal(f.sent.length, 0);
  assert.equal(f.worker.status().posting.nextAt, at("2026-10-29T20:05:00"));
  await f.create().tick(); assert.equal(f.inputs.length, 1);
  f.setTime(at("2026-10-29T20:05:00")); await f.create().tick();
  assert.equal(f.sent.length, 1);
  assert.equal(f.create().status().posting.nextAt, at("2026-10-29T21:15:00"));
  f.setTime(at("2026-10-29T21:15:00")); await f.create().tick(); await f.create().tick();
  assert.equal(f.sent.length, 2); assert.equal(f.inputs.length, 3);
  assert.equal(f.create().status().posting.nextAt, null);
});

test("day rollover creates a new plan with previous dates, downtime never bursts yesterday", async t => {
  const f = promptFixture(t); f.enable(promptConfig); await f.worker.tick();
  f.setTime(at("2026-10-30T10:00:00")); await f.create().tick();
  assert.equal(f.sent.length, 0); assert.equal(f.inputs.length, 2);
  assert.equal(f.inputs[1].input.date, "2026-10-30");
  assert.deepEqual(f.inputs[1].input.previousPlans, [{ date: "2026-10-29", times: ["20:05", "21:15"] }]);
  assert.equal(f.create().status().posting.plans.length, 2);
});

test("empty plan does not repeatedly call model on the same day", async t => {
  const f = promptFixture(t, { generate: async () => ({ times: [] }) });
  f.enable(promptConfig); await f.worker.tick(); await f.create().tick();
  assert.equal(f.inputs.length, 1); assert.equal(f.sent.length, 0);
  assert.equal(f.create().status().posting.plans[0].status, "skipped");
});

test("past, excessive, overly close and nonexistent times fail closed with bounded retries", async t => {
  for (const times of [["19:00"], ["20:05", "20:10"], ["20:05", "21:15", "22:30"], ["00:00"], ["24:00"]]) {
    const f = promptFixture(t, { generate: async () => ({ times }) }); f.enable(promptConfig);
    await f.worker.tick(); await f.create().tick(); assert.equal(f.inputs.length, 1);
    for (let i = 0; i < 2; i++) { f.advance(5 * 60000); await f.create().tick(); }
    await f.create().tick();
    assert.equal(f.inputs.length, 3); assert.equal(f.sent.length, 0);
    assert.equal(f.create().status().posting.plans[0].status, "failed");
    assert.ok(!JSON.stringify(f.create().status().posting).includes("secret"));
  }
  const f = promptFixture(t, { generate: async () => ({ times: ["02:30"] }) });
  f.setTime(Date.parse("2026-03-08T00:00:00-05:00"));
  f.enable({ ...promptConfig, timeZone: "America/New_York" }); await f.worker.tick();
  assert.equal(f.worker.status().posting.plans[0].status, "pending");
});

test("editing timing prompt keeps today's plan and lowering cap skips extra task", async t => {
  const f = promptFixture(t); f.enable(promptConfig); await f.worker.tick();
  f.worker.configure({ postingTimingPrompt: "新提示词明天用", postingDailyLimit: 1 });
  await f.create().tick(); assert.equal(f.inputs.length, 1);
  f.setTime(at("2026-10-29T20:05:00")); await f.create().tick();
  f.setTime(at("2026-10-29T21:15:00")); await f.create().tick();
  assert.equal(f.sent.length, 1);
  assert.equal(f.create().status().posting.jobs[0].status, "skipped");
});

test("stop or account switch during planning never installs an executable plan", async t => {
  for (const switchAccount of [false, true]) {
    let release; const f = promptFixture(t, { generate: () => new Promise(resolve => { release = resolve; }) });
    f.enable(promptConfig); const task = f.worker.tick();
    if (switchAccount) f.account.id = "8"; else f.worker.configure({ postingEnabled: false });
    release({ times: ["20:05"] }); await task;
    assert.equal(f.sent.length, 0);
    assert.deepEqual(f.worker.data.accounts["7"].posting.plans[0].slots, []);
  }
});

test("crashed final planning attempt becomes failed instead of restarting indefinitely", async t => {
  const f = promptFixture(t); f.enable(promptConfig); await f.worker.tick();
  const p = f.worker.data.accounts["7"].posting;
  p.plans[0].status = "planning"; p.plans[0].slots = []; p.plans[0].attempts = 3;
  p.plans[0].retryAt = at("2026-10-29T20:00:00"); f.worker.save();
  f.advance(60000); await f.create().tick();
  assert.equal(f.create().status().posting.plans[0].status, "failed");
  assert.equal(f.inputs.length, 1);
});

test("planning cannot publish after midnight while content generation is pending", async t => {
  const f = promptFixture(t, { generate: async input => {
    if (input.kind === "post-plan") return { times: ["23:59"] };
    f.advance(2 * 60000); return { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  } });
  f.enable(promptConfig); await f.worker.tick(); f.setTime(at("2026-10-29T23:59:00")); await f.create().tick();
  assert.equal(f.sent.length, 0);
  assert.equal(f.create().status().posting.jobs[0].status, "missed");
});

test("planning via DSH uses JSON plan parser and isolated posting persona", async t => {
  const f = fixture(t), entry = path.join(f.directory, "planner.mjs");
  fs.writeFileSync(entry, `import fs from 'node:fs';fs.writeFileSync('prompt.txt',process.argv.at(-1));console.log('{"times":["21:00"]}');`);
  const result = await generateDecision({ kind: "post-plan", timingPrompt: "每天随机" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY", nodePath: process.execPath, dshCommand: entry }, { directory: f.directory, signal: new AbortController().signal });
  assert.deepEqual(result, { times: ["21:00"] });
  const prompt = fs.readFileSync(path.join(f.directory, "prompt.txt"), "utf8");
  assert.ok(prompt.includes("POST_ONLY")); assert.ok(prompt.includes("时间规划器"));
  assert.ok(!prompt.includes("GENERAL_ONLY")); assert.ok(!prompt.includes("REPLY_ONLY"));
});


test("midnight during planning does not install stale times and next day plans separately", async t => {
  const f = promptFixture(t, { generate: async () => { f.advance(2 * 60000); return { times: ["23:59"] }; } });
  f.setTime(at("2026-10-29T23:59:00")); f.enable(promptConfig); await f.worker.tick();
  assert.equal(f.worker.status().posting.plans[0].status, "pending");
  await f.create().tick();
  assert.equal(f.inputs.length, 2); assert.equal(f.sent.length, 0);
  assert.equal(f.create().status().posting.plans[0].date, "2026-10-30");
});

test("plan honors actual send spacing when previous generation is delayed", async t => {
  const f = promptFixture(t, { generate: async input => {
    if (input.kind === "post-plan") return { times: ["20:05", "21:05"] };
    if (f.sent.length === 0) f.advance(5 * 60000);
    return { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  } });
  f.enable(promptConfig); await f.worker.tick();
  f.setTime(at("2026-10-29T20:05:00")); await f.create().tick();
  f.setTime(at("2026-10-29T21:05:00")); await f.create().tick();
  assert.equal(f.sent.length, 2);
  const jobs = f.create().status().posting.jobs;
  assert.equal(jobs[0].sentAt - jobs[1].sentAt, 60 * 60000);
});

test("failed plan persistence prevents any model or platform request", async t => {
  const f = promptFixture(t); f.enable(promptConfig);
  const save = f.worker.save.bind(f.worker);
  f.worker.save = () => {
    if (f.worker.data.accounts["7"].posting.plans?.at(-1)?.status === "planning") throw Object.assign(new Error("disk full"), { persistence: true });
    return save();
  };
  await f.worker.tick();
  assert.equal(f.inputs.length, 0); assert.equal(f.sent.length, 0);
});


test("AI selection config keeps manual compatibility and accepts no preset community", () => {
  assert.equal(defaults.postingSelectionMode, "manual");
  assert.doesNotThrow(() => validateConfig({ postingEnabled: true, postingSelectionMode: "ai" }));
  for (const patch of [{ postingSelectionMode: "random" }, { postingSelectionQuery: "x".repeat(101) }, { postingSelectionQuery: "bad\nquery" }, { postingSelectionPrompt: 1 }]) assert.throws(() => validateConfig(patch));
});

test("AI selects only platform candidates before generating and persists the destination", async t => {
  const f = fixture(t, { generate: async input => input.kind === "post-select" ? { action: "send", communityIds: ["42"], hashtagNames: ["关卡设计"] } : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" } });
  f.enable({ postingSelectionMode: "ai" }); f.advance(60000); await f.worker.tick();
  assert.deepEqual(f.inputs.map(v => v.input.kind), ["post-select", "post"]);
  assert.equal(f.inputs[0].config.postingPersona, "POST_PERSONA");
  assert.deepEqual(f.inputs[1].input.communities, [{ id: "42", name: "游戏讨论" }]);
  assert.equal(f.sent[0].form.topic_ids, "42");
  assert.equal(f.sent[0].form.hashtags, '["关卡设计"]');
  const job = f.create().status().posting.jobs[0];
  assert.equal(job.selectionResolved, true); assert.equal(job.selectionMode, "ai");
});

test("empty candidates, model skips and invented destinations cannot publish", async t => {
  for (const options of [
    { selectionResponse: { result: { topic_list: [], hashtag_list: [] } } },
    { generate: async () => ({ action: "skip" }) },
    { generate: async () => ({ action: "send", communityIds: ["999"], hashtagNames: [] }) },
    { generate: async () => ({ action: "send", communityIds: ["42"], hashtagNames: ["编造话题"] }) },
  ]) {
    const f = fixture(t, options); f.enable({ postingSelectionMode: "ai" }); f.advance(60000); await f.worker.tick();
    assert.equal(f.sent.length, 0);
    assert.ok(["skipped", "pending"].includes(f.worker.status().posting.jobs[0].status));
  }
});

test("resolved AI selections survive content failures, restart and config changes", async t => {
  let selects = 0, posts = 0;
  const f = fixture(t, { generate: async input => {
    if (input.kind === "post-select") { selects++; return { action: "send", communityIds: ["42"], hashtagNames: [] }; }
    if (++posts === 1) throw new Error("fixture generation failure");
    return { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" };
  } });
  f.enable({ postingSelectionMode: "ai" }); f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 0);
  const restarted = f.create(); restarted.configure({ postingSelectionMode: "manual", postingTopicId: "123" });
  f.advance(60000); await restarted.tick();
  assert.equal(selects, 1); assert.equal(f.sent[0].form.topic_ids, "42");
});

test("selection subprocess parser and persona remain independent", async t => {
  const f = fixture(t);
  const entry = path.join(f.directory, "select-model.mjs");
  fs.writeFileSync(entry, 'process.stdout.write(JSON.stringify({action:"send",communityIds:["42"],hashtagNames:[]}));');
  const result = await generateDecision({ kind: "post-select", candidates: { communities: [{ id: "42", name: "游戏" }], hashtags: [] } }, { ...defaults, postingPersona: "POST_ONLY", nodePath: process.execPath, dshCommand: entry }, { directory: f.directory, signal: new AbortController().signal });
  assert.deepEqual(result.communityIds, ["42"]);
  const messages = decisionMessages({ kind: "post-select" }, { ...defaults, persona: "GENERAL_ONLY", replyPersona: "REPLY_ONLY", postingPersona: "POST_ONLY" });
  assert.ok(messages[0].content.includes("POST_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("GENERAL_ONLY"));
  assert.ok(!JSON.stringify(messages).includes("REPLY_ONLY"));
});


test("long posting role cards persist intact and reach all posting model stages", async t => {
  const persona = "# 小鲸鱼角色卡\n" + "网瘾水友，保持论坛口吻。\n".repeat(500);
  assert.ok(persona.length > 2000);
  const f = fixture(t, { generate: async input => input.kind === "post-select" ? { action: "send", communityIds: ["42"], hashtagNames: [] } : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" } });
  f.enable({ postingSelectionMode: "ai", postingPersona: persona });
  assert.equal(f.create().status().config.postingPersona, persona);
  f.advance(60000); await f.worker.tick();
  assert.equal(f.sent.length, 1);
  for (const { input, config } of f.inputs) {
    assert.equal(config.postingPersona, persona);
    assert.ok(decisionMessages(input, config)[0].content.includes(persona));
  }
  assert.equal(validateConfig({ postingPersona: "鲸".repeat(20000) }).postingPersona.length, 20000);
  assert.throws(() => validateConfig({ postingPersona: "鲸".repeat(20001) }), /最多 20000/);
});


test("community-only posts submit empty hashtags for manual and AI modes", async t => {
  for (const mode of ["manual", "ai"]) {
    const f = fixture(t, { generate: async input => input.kind === "post-select" ? { action: "send", communityIds: ["42"], hashtagNames: [] } : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" } });
    f.enable({ postingSelectionMode: mode, postingHashtags: [] });
    f.advance(60000); await f.worker.tick();
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0].form.hashtags, "[]");
    assert.equal(f.sent[0].form.topic_ids, mode === "ai" ? "42" : "7214");
  }
});


test("posting rejection preserves sanitized platform diagnostics across restart", async t => {
  const f = fixture(t, { sendError: Object.assign(new Error("private upstream"), { definitive: true, httpStatus: 200, platformStatus: "failed", platformMessage: "缺失参数 fixture-cookie api_key=private-key" }) });
  f.enable(); f.advance(60000); await f.worker.tick();
  const job = f.create().status().posting.jobs[0];
  assert.equal(job.status, "rejected"); assert.equal(job.httpStatus, 200); assert.equal(job.platformStatus, "failed");
  assert.match(job.platformMessage, /缺失参数/); assert.ok(!JSON.stringify(job).includes("fixture-cookie")); assert.ok(!JSON.stringify(job).includes("private-key"));
  await f.create().tick(); assert.equal(f.sent.length, 1);
});


test("legacy conflicting manual targets load safely but cannot submit; AI ignores old manual targets", async t => {
  for (const mode of ["manual", "ai"]) {
    const f = fixture(t, { generate: async input => input.kind === "post-select" ? { action: "send", communityIds: ["42"], hashtagNames: [] } : { action: "send", title: "游戏设计", text: "关卡设计可以更有趣。" } });
    f.enable({ postingTopicId: "", postingSelectionMode: mode, postingCommunities: [{ id: "7214", name: "盒友杂谈" }, { id: "42", name: "游戏讨论" }] });
    const next = f.create(); assert.equal(next.fault, ""); f.advance(60000); await next.tick();
    assert.equal(f.sent.length, mode === "ai" ? 1 : 0);
    if (mode === "manual") assert.match(next.status().posting.jobs[0].error, /只能单独选择/);
  }
});

const postNow=(worker,account,requestId="manual-request-1")=>worker.run("post",{manual:true,accountId:account.id,requestId});

test("manual posting executes immediately without browsing, preserves schedule and deduplicates after restart",async t=>{
  const f=fixture(t);f.enable({postingDailyLimit:3});
  const next=f.worker.status().posting.nextAt;
  assert.equal(f.worker.data.config.enabled,false);
  await postNow(f.worker,f.account);
  assert.equal(f.sent.length,1);assert.equal(f.inputs[0].input.kind,"post");
  assert.equal(f.inputs[0].config.postingPersona,"POST_PERSONA");
  assert.equal(f.worker.status().posting.nextAt,next);
  assert.equal(f.worker.status().posting.jobs[0].trigger,"manual");
  assert.equal(f.worker.status().posting.jobs[0].status,"verified");
  const restarted=f.create();await postNow(restarted,f.account);
  assert.equal(f.sent.length,1);
  f.advance(60000);await restarted.tick();
  assert.equal(f.sent.length,2,"the original fixed schedule is preserved");
});

test("manual posting bypasses prompt scheduling but respects daily task caps and send intervals",async t=>{
  const f=fixture(t);f.enable({...promptConfig,postingDailyLimit:2});
  await postNow(f.worker,f.account);
  assert.deepEqual(f.inputs.map(v=>v.input.kind),["post"]);
  assert.throws(()=>postNow(f.worker,f.account,"manual-request-2"),/不足 60 分钟/);
  assert.ok(!fs.existsSync(f.worker.lockFile));
  f.advance(3600000);await postNow(f.worker,f.account,"manual-request-2");
  f.advance(3600000);assert.throws(()=>postNow(f.worker,f.account,"manual-request-3"),/已达上限/);
  assert.equal(f.sent.length,2);assert.equal(f.worker.status().posting.jobs.length,2);
});

test("manual posting recovers the same queued job after generation failure and restart",async t=>{
  let attempts=0;
  const f=fixture(t,{generate:async()=>{if(++attempts===1)throw new Error("model temporary");return {action:"send",title:"游戏设计",text:"关卡设计可以更有趣。"};}});
  f.enable({postingTime:"23:00"});
  await postNow(f.worker,f.account);
  assert.equal(f.worker.status().posting.jobs[0].status,"pending");
  const restarted=f.create();f.advance(60000);await restarted.tick();
  assert.equal(f.sent.length,1);assert.equal(restarted.status().posting.jobs.length,1);
  assert.equal(restarted.status().posting.jobs[0].status,"verified");
  assert.equal(restarted.status().posting.nextAt,at("2026-10-29T23:00:00"));
});

test("manual posting rejects disabled, stale-account, duplicate in-flight and unscheduled extra requests",async t=>{
  let release;
  const f=fixture(t,{generate:()=>new Promise(resolve=>{release=resolve;})});
  assert.throws(()=>postNow(f.worker,f.account),/开启定时发帖/);
  f.enable();assert.throws(()=>postNow(f.worker,{id:"8"}),/账号已切换/);
  assert.throws(()=>postNow(f.worker,f.account,"bad"),/请求标识/);
  assert.ok(!fs.existsSync(f.worker.lockFile));
  const task=postNow(f.worker,f.account);assert.throws(()=>postNow(f.worker,f.account),/任务正在运行/);
  f.worker.configure({postingEnabled:false});release({action:"send",title:"标题",text:"停止后不发送"});await task;
  assert.equal(f.sent.length,0);assert.equal(f.worker.status().posting.jobs[0].status,"pending");
});

test("manual posting uncertain outcomes are never retried by repeated requests or ticks",async t=>{
  const f=fixture(t,{sendError:new Error("network disconnected")});f.enable({postingTime:"23:00"});
  await postNow(f.worker,f.account);assert.equal(f.worker.status().posting.jobs[0].status,"uncertain");
  const restarted=f.create();await postNow(restarted,f.account);f.advance(60000);await restarted.tick();
  assert.equal(f.sent.length,1);
});

test("scheduled posting runs while glossary explanation waits without sharing state or cancellation",async t=>{
 let release,entered;
 const ready=new Promise(done=>{entered=done;});const gate=new Promise(done=>{release=done;});
 const f=fixture(t,{generate:async input=>{
  if(input.kind==='slang-explain'){entered();await gate;return {meaning:'游戏配装',context:'游戏讨论',confidence:0.9};}
  return {action:'skip'};
 }});
 f.enable({postingPrompt:'分享配装心得'});
 f.worker.glossary(f.account).entries.push({id:'pending',term:'轮椅',status:'pending',sources:[]});f.worker.slangTasks.save();
 f.worker.runSlang({action:'research',accountId:f.account.id,ids:['pending']});await ready;
 f.advance(60000);await f.worker.tick();
 assert.equal(f.worker.status().slang.busy,true);
 assert.ok(f.inputs.some(v=>v.input.kind==='post'));
 assert.equal(f.sent.length,0);assert.equal(f.worker.posting.state(f.account).jobs.at(-1).status,'skipped');
 release();await f.worker.slangTasks.running;
 const restored=f.create();assert.equal(restored.glossary(f.account).entries[0].research.status,'done');
 assert.equal(restored.posting.state(f.account).jobs.at(-1).status,'skipped');
});

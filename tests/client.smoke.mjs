/** Load through DSH's ModuleLoader and exercise the registered settings view. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { formatPost } from "../lib/post-format.js";
import { defaults } from "../lib/automation.js";

let bundle;
const styles = [];
global.window = { __ModuleLoader__: { load(spec) { bundle = spec; } } };
global.document = {
  createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }),
  head: { appendChild(style) { styles.push(style); } },
};
new Function(fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8"))();
assert.equal(bundle.id, "heybox");

const timers = new Map();
const nativeInterval = global.setInterval;
const nativeClear = global.clearInterval;
global.setInterval = (fn) => { const key = timers.size + 1; timers.set(key, fn); return key; };
global.clearInterval = (key) => timers.delete(key);
const requests = [];
let server = { ok: true, config: structuredClone(defaults), slang:{accountId:"123",entries:[]}, busy: false, nextRunAt: null, fault: "", usage: { comment: 0, reply: 0 }, history: [] };
let account = { ok: true, loggedIn: true, heyboxId: "123" };
let failSave = false;
let dependencies = { ok: true, qrReady: false, nodeReady: true, nodeVersion: "v24.0.0", dshReady: true, npmReady: true, installing: false, logs: [], error: "" };
global.fetch = async (url, options) => {
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, body, signal: options.signal });
  if (url.endsWith("/slang")) {
    if (body.action === "save") server.slang.entries=[{...body,id:"slang-1",status:"active",verified:true,confidence:1,sources:[{postId:"11",title:"配装讨论",quote:"原文 <script>文本</script>"}]}];
    else if (body.action === "disable") server.slang.entries[0].status="disabled";
    return {ok:true,status:200,json:async()=>structuredClone(server)};
  }
  if (url.includes("posting-selections?")) return { ok: true, status: 200, json: async () => ({ ok: true, communities: [{ id: "7214", name: "游戏讨论" }], hashtags: [{ name: "关卡设计", isActivity: false }] }) };
  if (url.includes("/watched?")) return { ok: true, status: 200, json: async () => ({ ok: true, total: 1, records: [{ at: Date.now(), type: "browse", title: "示例帖子", postId: "123" }] }) };
  if (url.endsWith("dependencies")) {
    if (body?.action === "install") dependencies = { ...dependencies, installing: true, logs: ["正在安装 qrcode…"] };
    return { ok: true, status: 200, json: async () => structuredClone(dependencies) };
  }
  if (body?.action === "configure") {
    if (failSave) return { ok: false, status: 409, json: async () => ({ ok: false, error: "配置保存失败" }) };
    server = { ...server, config: { ...server.config, ...body.config } };
  }
  if (body?.action === "run" || body?.action === "post-now") server = { ...server, busy: true };
  if (body?.action === "login") account = { ...account, loggedIn: true };
  if (body?.action === "logout") account = { ...account, loggedIn: false };
  return { ok: true, status: 200, json: async () => structuredClone(url.endsWith("state") ? account : server) };
};

// Minimal hook lifecycle: state and refs persist, effects run after mount and clean up.
function harness() {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) }, children: children.flat(Infinity) }),
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }];
    },
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useEffect(fn) { const i = cursor++; if (!(i in hooks)) { hooks[i] = true; effects.push(fn); } },
  };
  const registrations = new Map();
  const cleanup = [];
  const module = bundle.factory((name) => { assert.equal(name, "react"); return react; });
  assert.deepEqual(module.inject, ["slots"]);
  module.apply({
    effect: (fn) => cleanup.push(fn()),
    get: () => ({
      inject: (name, fn) => { assert.ok(["settings.section", "conversation.view"].includes(name)); return fn(); },
      register: (desc, render) => { registrations.set(desc.name, { desc, render }); },
    }),
  });
  function expand(node) {
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, children: node.children.map(expand) };
  }
  let component;
  return {
    registrations,
    mount(name) { component = registrations.get(name).render().type; const tree = this.render(); for (const effect of effects.splice(0)) cleanup.push(effect()); return tree; },
    render() { cursor = 0; return expand(component()); },
    unmount() { for (const stop of cleanup) stop?.(); },
  };
}
function all(tree) { return tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(all)] : []; }
function text(tree) { return tree && typeof tree === "object" ? tree.children.map(text).join("") : typeof tree === "string" || typeof tree === "number" ? String(tree) : ""; }
function control(tree, label) { const found = all(tree).find((n) => n.props["aria-label"] === label); assert.ok(found, label); return found; }
function button(tree, label) { const found = all(tree).find((n) => n.type === "button" && text(n) === label); assert.ok(found, label); return found; }
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
async function poll() { await Promise.all([...timers.values()].map((fn) => fn())); await settle(); }

try {
  const page = harness();
  assert.equal(page.registrations.get("settings.section").desc.label, "刷小黑盒");
  assert.equal(page.registrations.get("conversation.view").desc.label, "刷过的帖子");
  assert.equal(page.registrations.get("conversation.view").desc.scope, "session");
  assert.equal(page.registrations.get("conversation.view").desc.id, "heybox-watched");
  page.mount("settings.section");
  await settle();
  let tree = page.render();
  assert.ok(text(tree).includes("已保存 Cookie"));
  const tabs = all(tree).filter((n) => n.props.role === "tab");
  assert.deepEqual(tabs.map(text), ["概览", "账号", "浏览", "互动", "黑话", "发帖", "评论记录", "运行时段", "高级"]);
  assert.equal(tabs.filter((n) => n.props["aria-selected"]).length, 1);
  button(tree,"黑话").props.onClick();
  assert.equal(control(page.render(),"发帖与回复时参考黑话词库").props.checked,true);
  server.slang.entries=Array.from({length:75},(_,i)=>({id:"bulk-"+i,term:"黑话"+i,status:"pending",sources:[]}));await poll();
  control(page.render(),"全选本页黑话").props.onChange({target:{checked:true}});
  assert.equal(button(page.render(),"解释我勾选的词").props.disabled,false);
  await button(page.render(),"解释我勾选的词").props.onClick();
  assert.equal(requests.filter(r=>r.body?.action === "research").at(-1).body.ids.length,50);
  await button(page.render(),"让 AI 解释全部待处理词（75个）").props.onClick();
  assert.equal(requests.filter(r=>r.body?.action === "research").at(-1).body.ids.length,75);
  server.slang.entries=[];await poll();

  assert.equal(control(page.render(),"怎么解释这些词").props.value,"context");
  assert.equal(control(page.render(),"一个对话最多解释几个词").props.value,20);
  control(page.render(),"一个对话最多解释几个词").props.onChange({target:{value:"30"}});
  assert.equal(control(page.render(),"自动从帖子和评论学习").props.checked,false);
  control(page.render(),"自动从帖子和评论学习").props.onChange({target:{checked:true}});
  control(page.render(),"黑话词语").props.onChange({target:{value:"轮椅"}});
  control(page.render(),"这个词是什么意思").props.onChange({target:{value:"操作简单的配装"}});
  control(page.render(),"一般在什么情况下用").props.onChange({target:{value:"游戏配装讨论"}});
  await poll();
  assert.equal(control(page.render(),"这个词是什么意思").props.value,"操作简单的配装");
  await button(page.render(),"认可这个解释并保存").props.onClick();
  button(page.render(),"全部（1）").props.onClick();
  assert.equal(server.slang.entries[0].term,"轮椅");
  assert.equal(control(page.render(),"黑话词语").props.value,"");
  assert.equal(server.config.slangLearning,false,"dictionary action preserves unsaved settings");
  assert.equal(control(page.render(),"自动从帖子和评论学习").props.checked,true);
  assert.ok(text(page.render()).includes("原文 <script>文本</script>"));
  assert.equal(all(page.render()).some(n=>n.props.dangerouslySetInnerHTML),false);
  control(page.render(),"搜索黑话").props.onChange({target:{value:"不存在"}});
  assert.ok(text(page.render()).includes("没有匹配的黑话"));
  control(page.render(),"搜索黑话").props.onChange({target:{value:""}});
  button(page.render(),"编辑「轮椅」").props.onClick();
  assert.equal(control(page.render(),"这个词是什么意思").props.value,"操作简单的配装");
  await button(page.render(),"不使用「轮椅」").props.onClick();
  assert.equal(server.slang.entries[0].status,"disabled");
  button(page.render(),"清空编辑").props.onClick();
  button(tree, "发帖").props.onClick();
  assert.equal(control(page.render(), "发帖人格").props.maxLength, 20000);
  control(page.render(), "发帖时自动配一张合适的图").props.onChange({target:{checked:true}});
  control(page.render(), "正文排版").props.onChange({target:{value:"rich"}});
  server.posting={jobs:[{id:'rich-preview',image:{status:'uploaded',id:'060',url:'https://imgheybox.max-c.com/bbs/pic.png',sourceUrl:'https://aigengtu.com/zh/meme/060',title:'下班休息',reason:'符合正文情绪',note:'已匹配并上传 1 张图片'},format:'rich',title:'排版预览',text:'**重点**',bodyBlocks:formatPost('# 小标题\n\n**重点**\n\n- 第一项\n- 第二项\n\n> 引用 <script>alert(1)</script>').blocks}]}; await poll();
  const preview=all(page.render()).find(n=>n.props['aria-label']==='正文排版预览');
  assert.ok(all(preview).some(n=>n.type==='strong' && text(n)==='重点'));
  assert.ok(all(preview).some(n=>n.type==='ul'));
  assert.ok(text(preview).includes('<script>alert(1)</script>'));
  assert.equal(all(preview).some(n=>n.type==='script' || n.props.dangerouslySetInnerHTML),false);
  assert.ok(all(page.render()).some(n=>n.type==='img' && n.props.src==='/heybox/img?u='+encodeURIComponent('https://imgheybox.max-c.com/bbs/pic.png')));
  assert.ok(text(page.render()).includes('符合正文情绪'));
  assert.ok(text(page.render()).includes('已匹配并上传 1 张图片'));

  const longPersona = "# 小鲸鱼角色卡\n" + "论坛口吻，保持人格。\n".repeat(400);
  control(page.render(), "发帖人格").props.onChange({ target: { value: longPersona } });
  await all(page.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.postingPersona, longPersona);
  assert.equal(server.config.postingFormat,"rich");
  assert.equal(server.config.postingImages,true);
  assert.equal(server.config.slangSessionTerms,30);
  assert.ok(text(page.render()).includes(longPersona.length + " / 20000"));
  control(page.render(), "发帖人格").props.onChange({ target: { value: "独立写作人格" } });
  control(page.render(), "发帖主题与要求").props.onChange({ target: { value: "讨论关卡设计" } });
  control(page.render(), "发帖社区 ID").props.onChange({ target: { value: "7214" } });
  control(page.render(), "搜索分区或话题").props.onChange({ target: { value: "游戏" } });
  await button(page.render(), "查询分区与话题").props.onClick();
  assert.ok(requests.some(r => r.url.endsWith("posting-selections?q=" + encodeURIComponent("游戏"))));
  all(page.render()).find(n => n.props["aria-label"] === "选择分区：游戏讨论").props.onClick();
  all(page.render()).find(n => n.props["aria-label"] === "选择话题：关卡设计").props.onClick();
  assert.equal(server.config.postingCommunities.length, 0, "selection changes remain unsaved");
  all(page.render()).find(n => n.props["aria-label"] === "移除已选话题：关卡设计").props.onClick();
  assert.equal(all(page.render()).filter(n => n.props["aria-label"] === "移除已选话题：关卡设计").length, 0);
  all(page.render()).find(n => n.props["aria-label"] === "选择话题：关卡设计").props.onClick();
  control(page.render(), "发帖周期").props.onChange({ target: { value: "weekly" } });
  button(page.render(), "周日").props.onClick();
  assert.deepEqual(control(page.render(), "发帖人格").props.value, "独立写作人格");
  await all(page.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.postingPersona, "独立写作人格");
  assert.equal(server.config.postingTopicId, "", "search selection clears legacy target");
  assert.deepEqual(server.config.postingCommunities, [{ id: "7214", name: "游戏讨论" }]);
  assert.deepEqual(server.config.postingHashtags, [{ name: "关卡设计", isActivity: false }]);
  assert.equal(server.config.postingPrompt, "讨论关卡设计");
  assert.deepEqual(server.config.postingWeekdays, [1, 2, 3, 4, 5, 6]);
  control(page.render(), "分区与话题选择方式").props.onChange({ target: { value: "ai" } });
  assert.equal(all(page.render()).some(n => n.props["aria-label"] === "搜索分区或话题"), false);
  control(page.render(), "AI 候选搜索词").props.onChange({ target: { value: "单机游戏" } });
  control(page.render(), "AI 分区与话题选择偏好").props.onChange({ target: { value: "优先讨论游戏设计" } });
  await all(page.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.postingSelectionMode, "ai");
  assert.equal(server.config.postingSelectionQuery, "单机游戏");
  assert.equal(server.config.postingSelectionPrompt, "优先讨论游戏设计");
  control(page.render(), "分区与话题选择方式").props.onChange({ target: { value: "manual" } });
  assert.ok(all(page.render()).some(n => n.props["aria-label"] === "移除已选分区：游戏讨论"));
  control(page.render(), "发帖时间方式").props.onChange({ target: { value: "prompt" } });
  assert.equal(all(page.render()).some(n => n.props["aria-label"] === "每天发布时间"), false);
  control(page.render(), "发帖时间提示词").props.onChange({ target: { value: "每天午休或晚间随机发 1–2 条" } });
  control(page.render(), "每日最多安排帖子").props.onChange({ target: { value: "2" } });
  control(page.render(), "计划最短间隔（分钟）").props.onChange({ target: { value: "120" } });
  assert.ok(text(page.render()).includes("时间规划记录"));
  await all(page.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.postingTimingMode, "prompt");
  assert.equal(server.config.postingTimingPrompt, "每天午休或晚间随机发 1–2 条");
  assert.equal(server.config.postingDailyLimit, 2);
  assert.equal(server.config.postingMinGapMinutes, 120);
  assert.equal(all(tree).find((n) => n.props.id === "hx-panel-browse").props.hidden, true);
  button(tree, "浏览").props.onClick();
  tree = page.render();
  assert.equal(all(tree).find((n) => n.props.id === "hx-panel-browse").props.hidden, false);
  control(tree, "定时浏览开关").props.onChange({ target: { checked: true } });
  tree = page.render();
  control(tree, "每轮最多浏览帖子数").props.onChange({ target: { value: "3" } });
  button(page.render(), "互动").props.onClick();
  assert.equal(control(page.render(),"单条来信最多尝试次数").props.value,5);
  assert.equal(control(page.render(),"单条来信最多尝试次数").props.max,100);
  control(page.render(),"单条来信最多尝试次数").props.onChange({target:{value:"3"}});
  control(page.render(), "回复检查间隔（秒）").props.onChange({ target: { value: "45" } });
  control(page.render(), "回复跟随浏览运行时段").props.onChange({ target: { checked: true } });
  control(page.render(), "回复人格").props.onChange({ target: { value: "认真倾听\n简洁回答" } });
  control(page.render(), "自动回复自己帖子的评论").props.onChange({ target: { checked: true } });
  control(page.render(), "自己的每篇帖子最多回复多少条").props.onChange({ target: { value: "3" } });
  control(page.render(), "自己帖子的回复人格").props.onChange({ target: { value: "posting" } });
  control(page.render(), "评论提及对象").props.onChange({ target: { value: "custom" } });
  control(page.render(), "自定义提及昵称").props.onChange({ target: { value: "@指定用户" } });
  control(page.render(), "提及用户 ID").props.onChange({ target: { value: "12345678" } });
  assert.equal(control(page.render(), "每日评论额度").props.max, 9999);
  assert.equal(control(page.render(), "每日回复额度").props.max, 9999);
  control(page.render(), "缺少 ID 时允许纯文本 @").props.onChange({ target: { checked: true } });
  button(page.render(), "高级").props.onClick();
  control(page.render(), "生成方式").props.onChange({ target: { value: "external" } });
  control(page.render(), "API Base URL").props.onChange({ target: { value: "https://example.com/v1" } });
  control(page.render(), "模型名称").props.onChange({ target: { value: "custom-model" } });
  control(page.render(), "API Key").props.onChange({ target: { value: "private-key" } });
  button(page.render(), "概览").props.onClick();
  await poll();
  assert.equal(control(page.render(), "每轮最多浏览帖子数").props.value, 3, "poll preserves unsaved form");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(server.config.replyOwnPosts, true);
  assert.equal(server.config.ownPostReplyPersona, "posting");
  assert.equal(server.config.ownPostReplyLimit, 3);
  assert.equal(server.config.enabled, true);
  assert.equal(server.config.postsPerRound, 3);
  assert.equal(server.config.replyIntervalSeconds, 45);
  assert.equal(server.config.replyMaxAttempts,3);
  assert.equal(server.config.replyFollowSchedule, true);
  assert.equal(server.config.replyPersona, "认真倾听\n简洁回答");
  assert.equal(server.config.mentionName, "@指定用户");
  assert.equal(server.config.mentionUserId, "12345678");
  assert.equal(server.config.mentionPlainTextFallback, true);
  assert.equal(server.config.generationProvider, "external");
  assert.equal(control(page.render(), "API Key").props.value, "", "clear key field after save");
  button(page.render(), "编辑配置 JSON").props.onClick();
  const json = JSON.parse(control(page.render(), "配置 JSON").props.value);
  assert.equal(json.apiKey, undefined);
  control(page.render(), "配置 JSON").props.onChange({ target: { value: JSON.stringify({ ...json, persona: "从 JSON 修改" }) } });
  await button(page.render(), "保存配置文件").props.onClick();
  assert.equal(control(page.render(), "通用人设与兴趣").props.value, "从 JSON 修改");
  assert.equal(typeof server.config.postsPerRound, "number");
  assert.deepEqual(server.config.valleyWindows, defaults.valleyWindows);
  assert.equal(button(page.render(), "立即浏览一轮").props.disabled, false);
  assert.equal(button(page.render(), "立即发帖").props.disabled,true);
  server.config.postingEnabled=true;server.posting={accountMatches:true,jobs:[]};await poll();
  assert.equal(button(page.render(), "立即发帖").props.disabled,false);
  await button(page.render(), "立即发帖").props.onClick();
  const manual=requests.filter(r=>r.body?.action === "post-now").at(-1).body;
  assert.equal(manual.accountId,"123");assert.match(manual.requestId,/^manual-/);
  assert.equal(button(page.render(), "立即发帖").props.disabled,true);
  server.busy=false;server.config.enabled=false;server.config.autoReply=false;await poll();
  assert.equal(button(page.render(), "停止全部任务").props.disabled,false,"posting-only automation can be stopped");
  server.config.enabled=true;await poll();


  button(page.render(), "运行时段").props.onClick();
  button(page.render(), "峰底快捷方案").props.onClick();
  assert.equal(control(page.render(), "限制任务开始时段").props.checked, true);
  assert.equal(control(page.render(), "工作日时段结束 1").props.value, "06:00");
  control(page.render(), "工作日时段开始 1").props.onChange({ target: { value: "22:30" } });
  control(page.render(), "工作日时段结束 1").props.onChange({ target: { value: "05:15" } });
  button(page.render(), "周末时段不运行").props.onClick();
  button(page.render(), "节假日时段全天").props.onClick();
  await poll();
  assert.equal(control(page.render(), "工作日时段开始 1").props.value, "22:30");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(server.config.valleyWindows, [[1350, 315]]);
  assert.deepEqual(server.config.weekendWindows, []);
  assert.deepEqual(server.config.holidayWindows, [[0, 1440]]);
  button(page.render(), "不限时段").props.onClick();
  assert.equal(control(page.render(), "限制任务开始时段").props.checked, false);
  assert.equal(control(page.render(), "工作日时段开始 1").props.value, "22:30");
  button(page.render(), "峰谷快捷方案").props.onClick();
  assert.equal(control(page.render(), "工作日时段开始 2").props.value, "18:00");
  assert.equal(control(page.render(), "周末时段结束 1").props.value, "00:00");
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(server.config.valleyWindows, defaults.valleyWindows);

  failSave = true;
  await all(page.render()).find((n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.ok(text(page.render()).includes("配置保存失败"));
  await poll();
  assert.ok(text(page.render()).includes("配置保存失败"), "successful polls do not hide action errors");
  failSave = false;
  await button(page.render(), "立即浏览一轮").props.onClick();
  assert.equal(button(page.render(), "保存设置").props.disabled, true);
  await button(page.render(), "停止全部任务").props.onClick();
  assert.deepEqual(requests.filter((r) => r.body?.action === "configure").at(-1).body.config, { enabled: false, autoReply: false, postingEnabled: false });

  control(page.render(), "Cookie").props.onChange({ target: { value: "heybox_id=123; user_pkey=secret" } });
  await button(page.render(), "保存账号").props.onClick();
  assert.equal(control(page.render(), "Cookie").props.value, "", "clear cookie after host saves");
  assert.equal(requests.filter((r) => r.body?.action === "login").at(-1).body.cookie, "heybox_id=123; user_pkey=secret");
  await button(page.render(), "一键安装依赖").props.onClick();
  assert.equal(button(page.render(), "正在安装依赖…").props.disabled, true);
  dependencies = { ...dependencies, installing: false, qrReady: true, logs: ["依赖安装完成"] };
  server.interactions = [
    { at: Date.now(), kind: "comment", status: "sent", postId: "1", text: '<a data-user-id="8">@作者</a> 测试评论正文', displayText: "@作者 测试评论正文" },
    { at: Date.now(), kind: "reply", status: "rejected", platformStatus: "failed", platformMessage: "缺失参数 <script>test</script>", httpStatus: 200, postId: "2", text: "测试回复正文", incoming: "对方的问题" },
    { at: Date.now(), kind:"reply",status:"exhausted",postId:"3",replyId:"93",attempts:2634,retryLimit:5,error:"暂未找到完整评论关系" },
  ];
  server.replyQueue = [
    { at: Date.now(), replyId: "91", postId: "2", attempts: 2, state: "pending", error: "模型失败 <script>test</script>" },
    { at: Date.now(), replyId: "92", postId: "3", attempts: 1, state: "uncertain", error: "发送结果未知" },
  ];
  await poll();
  button(page.render(), "评论记录").props.onClick();
  assert.ok(text(page.render()).includes("待回复队列"));
  assert.ok(text(page.render()).includes("模型失败 <script>test</script>"));
  assert.ok(text(page.render()).includes("待确认，不自动重发"));
  assert.ok(text(page.render()).includes("已达尝试上限，停止自动回复"));
  assert.ok(text(page.render()).includes("已尝试 2634 次 · 上限 5 次"));
  assert.ok(text(page.render()).includes("最近原因：暂未找到完整评论关系"));
  assert.equal(all(page.render()).some(n => n.props?.dangerouslySetInnerHTML), false);
  assert.ok(text(page.render()).includes("@作者 测试评论正文"));
  assert.ok(!text(page.render()).includes("data-user-id"));
  button(page.render(), "评论回复").props.onClick();
  assert.ok(text(page.render()).includes("测试回复正文"));
  assert.ok(text(page.render()).includes("对方的问题"));
  assert.ok(text(page.render()).includes("缺失参数 <script>test</script>"));
  assert.ok(text(page.render()).includes("HTTP 200"));
  assert.ok(!text(page.render()).includes("@作者 测试评论正文"));
  page.unmount();
  assert.equal(timers.size, 0, "poll timer cleaned up");
  assert.ok(styles.at(-1).removed);

  server.history = [
    { at: Date.now(), type: "browse", message: "已读取帖子", title: "示例帖子", postId: "123" },
    { at: Date.now(), type: "error", message: "示例失败" },
  ];
  const watched = harness();
  watched.mount("conversation.view");
  await settle();
  tree = watched.render();
  assert.ok(text(tree).includes("示例帖子"));
  assert.ok(!text(tree).includes("示例失败"));
  assert.ok(!text(tree).includes("已读取帖子"), "watched list omits redundant event message");
  assert.equal(all(tree).find((n) => n.type === "a").props.href, "https://www.xiaoheihe.cn/app/bbs/link/123");
  assert.ok(requests.some((r) => r.url.includes("/heybox/watched?offset=0&limit=50")));
  assert.ok(text(tree).includes("共 1 帖"));
  watched.unmount();
  assert.equal(timers.size, 0);

  // Settings continue to register when an older DSH host lacks conversation.view.
  const fallback = bundle.factory(() => ({ createElement() {} }));
  let settingsRegistered = false;
  fallback.apply({ effect() {}, slots: { inject(name, fn) { if (name === "conversation.view") throw new Error("unsupported slot"); fn(); }, register(desc) { settingsRegistered = desc.name === "settings.section"; } } });
  assert.ok(settingsRegistered);
  console.log("client settings/view registration, save, polling, stop, account and cleanup tests passed");
} finally {
  global.setInterval = nativeInterval;
  global.clearInterval = nativeClear;
}

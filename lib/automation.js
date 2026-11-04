import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./state-file.js";
import { SlangTasks } from "./slang-tasks.js";
import { setTimeout as delay } from "node:timers/promises";
import { generateDecision } from "./generator.js";
import { platformDetails, platformText } from "./platform-error.js";
import { Posting, postingDefaults, validatePosting } from "./posting.js";
import { forumText } from "./forum-text.js";
import { relevantSlang, rememberSlangContext } from "./slang.js";

export const defaults = Object.freeze({
  ...postingDefaults,
  enabled: false, intervalMinutes: 30, postsPerRound: 1,
  autoComment: false, mentionAuthor: true, autoReply: false, repliesPerRound: 1,
  replyIntervalSeconds: 180, replyFollowSchedule: false, replyMaxAttempts: 5,
  replyOwnPosts: false, ownPostReplyPersona: "reply", ownPostReplyLimit: 5,
  dailyComments: 10, dailyReplies: 10, cooldownSeconds: 60,
  valleyOnly: false, timeZone: "Asia/Shanghai", valleyWindows: [[720, 840], [1080, 540]],
  weekendWindows: [[0, 1440]], holidayWindows: [[0, 1440]],
  holidays: [], workdays: [], persona: "友好、克制，关注游戏与数码，有内容再发言。", replyPersona: "",
  dshCommand: "dsh", nodePath: "", generationTimeoutSeconds: 180,
  mentionTarget: "author", mentionName: "", mentionUserId: "", mentionPlainTextFallback: false,
  generationProvider: "dsh", apiBaseUrl: "", apiModel: "", apiKey: "",
  slangEnabled: true, slangLearning: false, slangResearchMode:"context", slangSessionTerms:20,
});

export function validateConfig(patch, previous = defaults) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("配置必须是对象");
  const c = structuredClone(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults,key)) throw new Error(`未知设置：${key}`);
    c[key] = value;
  }
  for (const key of ["enabled", "autoComment", "autoReply", "mentionAuthor", "valleyOnly", "replyFollowSchedule", "mentionPlainTextFallback", "replyOwnPosts", "slangEnabled", "slangLearning"]) {
    if (typeof c[key] !== "boolean") throw new Error(`${key} 必须是开关`);
  }
  for (const [key, min, max] of [["ownPostReplyLimit",0,1000],["slangSessionTerms",1,100],["replyMaxAttempts",1,100],["replyIntervalSeconds",30,86400],["intervalMinutes",1,1440],["postsPerRound",1,10],["repliesPerRound",1,10],["dailyComments",0,9999],["dailyReplies",0,9999],["cooldownSeconds",10,3600],["generationTimeoutSeconds",10,600]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 范围 ${min}–${max}`);
  }
  for (const key of ["persona", "replyPersona"]) {
    if (typeof c[key] !== "string" || c[key].length > 2000 || /[\0\x01-\x08\x0b\x0c\x0e-\x1f]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (!["reply", "posting"].includes(c.ownPostReplyPersona)) throw new Error("自己帖子回复人格无效");
  if (!["context","web"].includes(c.slangResearchMode)) throw new Error("黑话释义研究方式无效");
  if (c.replyOwnPosts && c.ownPostReplyPersona === "posting" && !c.postingPersona?.trim()) throw new Error("沿用发帖人格时，请填写发帖人格");
  if (!["author", "custom", "none"].includes(c.mentionTarget)) throw new Error("提及对象无效");
  if (typeof c.mentionName === "string") c.mentionName = c.mentionName.trim().replace(/^@/, "").trim();
  if (typeof c.mentionName !== "string" || c.mentionName.length > 80 || /[<>@\r\n\x00-\x1f]/.test(c.mentionName)) throw new Error("自定义昵称无效，请填写单个昵称");
  if (c.mentionTarget === "custom" && !c.mentionName.trim()) throw new Error("请填写自定义提及昵称");
  // Nickname-only configs require explicit opt-in to send a plain-text mention.
  if (c.mentionUserId === undefined) c.mentionUserId = "";
  if (typeof c.mentionUserId !== "string") throw new Error("提及用户 ID 必须为数字字符串");
  c.mentionUserId = c.mentionUserId.trim();
  if (c.mentionUserId && !/^[1-9]\d{0,19}$/.test(c.mentionUserId)) throw new Error("提及用户 ID 必须为 1–20 位正整数");
  if (!["dsh", "external"].includes(c.generationProvider)) throw new Error("生成方式无效");
  for (const key of ["apiBaseUrl", "apiModel", "apiKey"]) {
    if (typeof c[key] !== "string" || c[key].length > 4096 || /[\x00-\x1f\x7f]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (c.apiBaseUrl) {
    let url;
    try { url = new URL(c.apiBaseUrl); } catch { throw new Error("API 地址无效"); }
    if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) throw new Error("API 地址必须为无凭据、查询参数的 HTTP(S) 地址");
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("远程 API 必须使用 HTTPS");
  }
  if (c.generationProvider === "external" && (!c.apiBaseUrl || !c.apiModel.trim())) throw new Error("第三方 API 需要填写地址与模型名");
  for (const key of ["dshCommand", "nodePath", "timeZone"]) {
    if (typeof c[key] !== "string" || c[key].length > 2000 || /[\n\r\0]/.test(c[key])) throw new Error(`${key} 无效`);
  }
  if (!c.dshCommand.trim()) throw new Error("DSH 命令不能为空");
  new Intl.DateTimeFormat("en", { timeZone: c.timeZone }).format();
  validatePosting(c);
  for (const key of ["holidays", "workdays"]) {
    if (!Array.isArray(c[key]) || c[key].length > 400 || c[key].some((d) => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d).toISOString().slice(0,10) !== d)) throw new Error(`${key} 日期格式 YYYY-MM-DD`);
  }
  for (const key of ["valleyWindows", "weekendWindows", "holidayWindows"]) {
    if (!Array.isArray(c[key]) || c[key].length > 10 || c[key].some((w) => !Array.isArray(w) || w.length !== 2 || !Number.isInteger(w[0]) || w[0] < 0 || w[0] > 1439 || !Number.isInteger(w[1]) || w[1] < 0 || w[1] > 1440 || w[0] === w[1])) throw new Error(`${key} 使用 [起始分钟,结束分钟]，支持跨午夜；[0,1440] 表示全天，空数组表示不运行`);
  }
  return c;
}

export function localTime(now, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23", weekday:"short" }).formatToParts(now).map((v) => [v.type,v.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, weekend: ["Sat","Sun"].includes(p.weekday) };
}
export function inValley(now, config) {
  const t = localTime(now, config.timeZone);
  const windows = config.holidays.includes(t.day) ? config.holidayWindows ?? defaults.holidayWindows
    : t.weekend && !config.workdays.includes(t.day) ? config.weekendWindows ?? defaults.weekendWindows : config.valleyWindows;
  return windows.some(([a,b]) => a < b ? t.minute >= a && t.minute < b : t.minute >= a || t.minute < b);
}

const positiveId = v => /^[1-9]\d*$/.test(String(v)) ? String(v) : null;
const id = (v) => v != null && /^\d+$/.test(String(v)) ? String(v) : null;
const userId = (u) => id(u?.userid ?? u?.heybox_id ?? u?.user_id);
export function mentionText(author, text) {
  const name = author?.username || author?.nickname;
  const uid = userId(author);
  if (!uid || !/^[1-9]\d{0,19}$/.test(uid) || typeof name !== "string" || !name.trim() || /[<>@\x00-\x1f\x7f]/.test(name) || name.length > 80) throw new Error("缺少可靠提及用户 ID 或昵称，跳过 @ 评论");
  const escapedName = name.trim().replace(/[&"']/g, (v) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;" })[v]);
  // Match the user-selected mention markup observed in the official mobile client.
  const protocol = encodeURIComponent(JSON.stringify({ protocol_type: "openUser", user_id: uid }));
  return `<a data-user-id="${uid}" href="https://api.xiaoheihe.cn/open_inapp/#heybox://${protocol}">@${escapedName}</a> ${text}`;
}
export function commentText(config, author, text) {
  if (!config.mentionAuthor || config.mentionTarget === "none") return text;
  if (config.mentionTarget === "custom") {
    if (!config.mentionUserId) {
      if (config.mentionPlainTextFallback) return `@${config.mentionName.trim()} ${text}`;
      throw new Error("自定义 @ 缺少用户 ID，请填写 ID 或显式开启纯文本兼容；仅昵称无法绑定用户");
    }
    return mentionText({ userid: config.mentionUserId, username: config.mentionName }, text);
  }
  return mentionText(author, text);
}
function commentsFrom(result, rootHint) {
  const groups = result?.comments || result?.comment || [];
  return Array.isArray(groups) ? groups.flatMap((g) => {
    const items = Array.isArray(g.comment) ? g.comment : [g];
    const root = Array.isArray(g.comment) ? id(items[0]?.commentid) : rootHint;
    return items.map((c) => ({ ...c, threadRoot: root || positiveId(c.root_comment_id ?? c.root_id) || (!positiveId(c.reply_id ?? c.replyid) ? positiveId(c.commentid) : null) }));
  }) : [];
}
function postText(link) {
  return { title: forumText(link?.title, 400), body: forumText(link?.text || link?.description || "") };
}

function exhaustReply(account, entry, limit, now) {
  const key = `reply:${entry.replyId}`, action = account.actions[key];
  // Uncertain sends remain reserved for manual verification; successes and skips are terminal too.
  if (action && action.status !== "rejected") return false;
  if ((entry.attempts || 0) < limit) return false;
  const error = platformText(entry.error || action?.platformMessage || "多次未能完成来信处理").replace(/[，,；;]?下轮重试/g, "");
  account.actions[key] = { ...action, status:"exhausted", kind:"reply", postId:entry.postId, replyId:entry.replyId,
    at:now, queuedAt:entry.queuedAt, attempts:entry.attempts, retryLimit:limit, error, ownPost:entry.ownPost ?? action?.ownPost };
  delete account.replyQueue[entry.replyId];
  return true;
}

function knownOwnPost(account, postId) {
  return account.ownReplyPosts?.[postId] === true
    || Object.values(account.actions || {}).some(v => v.ownPost === true && String(v.postId) === String(postId))
    || (account.posting?.jobs || []).some(v => String(v.postId) === String(postId) && ["accepted","verified"].includes(v.status));
}
export function ownPostReplyUsage(account, postId) {
  // Derive from durable send intents, including legacy records. No daily reset or separate counter to drift.
  return Object.entries(account.actions || {}).filter(([key,v]) => (v.kind === "reply" || key.startsWith("reply:"))
    && String(v.postId) === String(postId) && ["sent","accepted","unknown"].includes(v.status)).length;
}
function limitOwnPostReply(account, entry, limit, now) {
  const key=`reply:${entry.replyId}`, action=account.actions[key];
  if (action && action.status !== "rejected") return false;
  if (!knownOwnPost(account,entry.postId)) return false;
  const used=ownPostReplyUsage(account,entry.postId);
  if (used < limit) return false;
  account.actions[key]={status:"limited",kind:"reply",ownPost:true,postId:entry.postId,replyId:entry.replyId,at:now,
    error:`本帖自动回复已占用 ${used} 条名额，上限 ${limit} 条，停止回复这条评论`};
  delete account.replyQueue?.[entry.replyId];
  return true;
}

// Unknown read state requires a reliable timestamp; never infer that old history is new.
export function isNewReply(message, baselineAt) {
  const boolean = (value) => {
    const text = String(value ?? "").toLowerCase().trim();
    return ["1", "true", "yes"].includes(text) ? true : ["0", "false", "no"].includes(text) ? false : undefined;
  };
  for (const key of ["is_unread", "unread", "is_read", "has_read", "read_status"]) {
    const text = String(message[key] ?? "").toLowerCase().trim();
    if (text === "unread") return true;
    if (text === "read") return false;
    const value = boolean(message[key]);
    if (value !== undefined) return ["is_unread", "unread"].includes(key) ? value : !value;
  }
  const value = Number(message.timestamp || message.create_at);
  const timestamp = value < 1e12 ? value * 1000 : value;
  return Number.isFinite(timestamp) && timestamp > baselineAt;
}

export class Automation {
  constructor({ directory, account, api, generate = generateDecision, search, imageFetch, now = Date.now, wait = delay }) {
    Object.assign(this, { directory, account, api, generate, search, imageFetch, now, wait });
    fs.mkdirSync(directory, { recursive:true, mode:0o700 });
    this.file = path.join(directory,"automation.json");
    this.configFile = path.join(directory,"config.json");
    this.lockFile = path.join(directory,"automation.lock");
    this.data = { config: structuredClone(defaults), accounts: {}, history: [], nextRunAt: null };
    this.fault = "";
    try { this.reload(); } catch { this.fault = "配置或自动化状态损坏，已停止；请先备份并检查 config.json 与 automation.json"; }
    this.revision = 0;
    this.posting = new Posting(this);
    this.slangTasks = new SlangTasks(this);
  }
  reload() {
    const data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file,"utf8")) : this.data;
    if (!data.accounts || typeof data.accounts !== "object" || !Array.isArray(data.history)) throw new Error("invalid state");
    const hasConfig = fs.existsSync(this.configFile);
    data.config = validateConfig(hasConfig ? JSON.parse(fs.readFileSync(this.configFile,"utf8")) : data.config);
    if (!hasConfig) atomicWrite(this.configFile, data.config);
    // Older versions kept titles only in the rolling event log; retain what remains.
    const browseEvents = new Map(data.history.filter((v) => v.type === "browse").map((v) => [v.postId + ":" + v.at, v]));
    for (const account of Object.values(data.accounts)) {
      // Glossary entries have their own store; this worker retains only captured contexts.
      account.watched ||= {};
      account.replyQueue ||= {};
      // In-memory migration only: the next locked save persists retirement atomically.
      for (const entry of Object.values(account.replyQueue)) exhaustReply(account,entry,data.config.replyMaxAttempts,this.now());
      for (const entry of Object.values(account.replyQueue)) limitOwnPostReply(account,entry,data.config.ownPostReplyLimit,this.now());
      for (const [postId, at] of Object.entries(account.seen || {})) {
        const event = browseEvents.get(postId + ":" + at);
        account.watched[postId] ||= { at, postId, title: event?.title || "" };
      }
    }
    this.data = data;
  }
  save() {
    const { apiKey, ...config } = this.data.config;
    try { atomicWrite(this.file, { ...this.data, config, accounts:Object.fromEntries(Object.entries(this.data.accounts).map(([id,a])=>[id,this.slangTasks?.migrated && a.slang ? {...a,slang:{contexts:a.slang.contexts || []}} : a])) }); }
    catch (e) { e.persistence = true; throw e; }
  }
  watched({ offset = 0, limit = 50 } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("浏览记录分页参数无效");
    const account = this.data.accounts[this.account()?.id];
    const records = Object.values(account?.watched || {}).sort((a, b) => b.at - a.at || String(a.postId).localeCompare(String(b.postId)));
    return { total: records.length, offset, limit, records: records.slice(offset, offset + limit).map((record) => ({ ...record, type: "browse" })) };
  }
  lock(file = this.lockFile) {
    const recovery = file + ".recovery";
    if (fs.existsSync(recovery)) throw new Error("正在恢复任务锁，请稍后重试");
    // Never steal a lock based on elapsed time: a live worker may be awaiting upstream.
    try {
      const fd = fs.openSync(file,"wx",0o600);
      fs.writeFileSync(fd,JSON.stringify({ pid:process.pid })); fs.closeSync(fd);
      return () => fs.unlinkSync(file);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let owner;
      try { owner = JSON.parse(fs.readFileSync(file,"utf8")); } catch { throw new Error(`任务锁异常，请检查 ${path.basename(file)}`); }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("任务锁无效");
      try { process.kill(owner.pid,0); } catch (err) {
        if (err.code === "ESRCH") {
          // Serialize stale-lock recovery so two workers cannot delete each other's lock.
          const recoveryFd = fs.openSync(recovery,"wx",0o600);
          try {
            const latest = JSON.parse(fs.readFileSync(file,"utf8"));
            if (latest.pid !== owner.pid) throw new Error("任务锁已改变，请重试");
            fs.unlinkSync(file);
          } finally { fs.closeSync(recoveryFd); fs.unlinkSync(recovery); }
          return this.lock(file);
        }
      }
      throw new Error("另一个任务正在运行");
    }
  }
  status() {
    const key = this.account()?.id;
    const a = this.data.accounts[key];
    const interactions = Object.entries(a?.actions || {}).filter(([, v]) => v.status !== "skipped")
      .sort(([, x], [, y]) => y.at - x.at).slice(0, 100).map(([key, v]) => ({
        at: v.at, kind: v.kind || (key.startsWith("reply:") ? "reply" : "comment"), status: v.status,
        postId: v.postId, title: v.title, text: v.text, displayText: v.displayText, incoming: v.incoming, parent: v.parent, ownPost: v.ownPost, personaSource: v.personaSource, commentId: v.commentId, replyId: v.replyId,
        attempts:v.attempts, retryLimit:v.retryLimit, error:v.error,
        ...platformDetails(v),
      }));
    const { apiKey, ...config } = this.data.config;
    return { config, slang: { accountId:key || null, busy:!!this.slangTasks?.running, fault:this.slangTasks?.fault || "", entries:[...(this.slangTasks?.data.accounts[key]?.slang?.entries || [])].sort((x,y)=>y.updatedAt-x.updatedAt), contextCount:a?.slang?.contexts?.length || 0, task:this.slangTasks?.slangTask?.accountId === key ? this.slangTasks.slangTask : null }, posting: this.posting.status(), apiKeyConfigured:!!apiKey, configPath:this.configFile, busy:!!this.running, runningKind:this.runningKind || null, nextRunAt:this.data.nextRunAt,
      nextReplyAt:config.autoReply && !a?.replyPoll?.paused ? a?.replyPoll?.nextAt ?? null : null,
      replyPaused:a?.replyPoll?.paused || "", replyFailures:a?.replyPoll?.failures || 0, interactions,
      replyExhaustedCount:Object.values(a?.actions || {}).filter(v=>v.status === "exhausted").length,
      ownPostReplyLimitedCount:Object.values(a?.actions || {}).filter(v=>v.status === "limited").length,
      replyQueue:Object.values(a?.replyQueue || {}).sort((x,y)=>x.queuedAt-y.queuedAt).map((v)=>({
        replyId:v.replyId, postId:v.postId, at:v.queuedAt, attempts:v.attempts || 0, maxAttempts:config.replyMaxAttempts,
        ownPost:v.ownPost, state:a?.actions?.[`reply:${v.replyId}`]?.status === "unknown" ? "uncertain" : "pending",
        error:v.error || "", ...platformDetails(v),
      })),
      fault:this.fault, history:this.data.history.slice(-40).reverse(),
      usage:a?.days?.[localTime(this.now(),this.data.config.timeZone).day] || { comment:0,reply:0 },
      mentionMode:"user-link-unverified" };
  }
  configure(patch) {
    if (this.fault) throw new Error(this.fault);
    if(Object.keys(patch).length === 3 && patch.enabled === false && patch.autoReply === false && patch.postingEnabled === false)this.slangTasks.cancel();
    // Forum and glossary cancellation are independent unless stopping everything.
    if (this.running) {
      if (Object.keys(patch).length && Object.entries(patch).every(([key, value]) => ["enabled", "autoReply", "postingEnabled"].includes(key) && value === false)) {
        Object.assign(this.data.config, patch);
        atomicWrite(this.configFile, this.data.config);
        if (patch.enabled === false) this.data.nextRunAt = null;
        if (patch[this.runningKind === "post" ? "postingEnabled" : this.runningKind === "reply" ? "autoReply" : "enabled"] === false) this.cancelMain();
        this.save(); return this.status();
      }
      throw new Error("任务运行中，请先停止，待任务结束后保存设置");
    }
    const unlock = this.lock();
    try {
      this.reload();
      const wasReplyEnabled = this.data.config.autoReply;
      const previousReplyInterval = this.data.config.replyIntervalSeconds;
      const nextConfig = validateConfig(patch,this.data.config);
      const selected = this.account();
      if (patch.postingEnabled === true) {
        if (!selected?.id) throw new Error("开启定时发帖前请登录账号");
        this.data.postingAccountId = selected.id;
      }
      this.data.config = nextConfig;
      for (const account of Object.values(this.data.accounts)) {
        for (const entry of Object.values(account.replyQueue || {})) exhaustReply(account,entry,nextConfig.replyMaxAttempts,this.now());
        for (const entry of Object.values(account.replyQueue || {})) limitOwnPostReply(account,entry,nextConfig.ownPostReplyLimit,this.now());
      }
      atomicWrite(this.configFile,this.data.config);
      this.revision++;
      if (selected?.id) this.posting.state(selected);
      if (this.data.config.autoReply && selected?.id) {
        const poll = this.replyState(selected);
        if (!wasReplyEnabled) {
          poll.baselineAt = this.now(); poll.paused = ""; poll.failures = 0; poll.nextAt = this.now();
        } else if (previousReplyInterval !== this.data.config.replyIntervalSeconds) {
          poll.nextAt = this.now() + this.data.config.replyIntervalSeconds * 1000 * 2 ** Math.min(poll.failures, 5);
        }
      }
      this.data.nextRunAt = this.data.config.enabled ? this.now() + this.data.config.intervalMinutes * 60000 : null;
      this.save();
    } finally { unlock(); }
    return this.status();
  }
  glossary(account) {return this.slangTasks.state(account);}
  editSlang(payload) {return this.slangTasks.editSlang(payload);}
  runSlang(payload) {return this.slangTasks.runSlang(payload);}
  stopSlang(payload) {
    if(payload.accountId!==this.account()?.id)throw new Error("账号已切换，请刷新后重试");
    this.slangTasks.cancel();return this.status();
  }
  cancelMain() {this.revision++;this.controller?.abort();}
  cancel() {this.cancelMain();this.slangTasks?.cancel();}
  start() {
    const timer = setInterval(() => { this.tick().catch(() => {}); },5000);
    timer.unref?.();
    return () => { clearInterval(timer); this.closed = true; this.cancel(); };
  }
  accountState(account) {
    return this.data.accounts[account.id] ||= { seen:{}, actions:{}, days:{}, lastSendAt:0, offset:0 };
  }
  replyState(account) {
    const a = this.accountState(account);
    const poll = a.replyPoll ||= { baselineAt:this.now(), nextAt:this.now(), failures:0, paused:"", identity:account.identity };
    if (poll.identity !== account.identity) {
      poll.identity = account.identity; poll.paused = ""; poll.failures = 0; poll.nextAt = this.now();
    }
    return poll;
  }
  async tick() {
    if (this.running || this.closed || this.fault) return;
    try { this.reload(); } catch { this.fault="自动化状态损坏，已停止"; return; }
    const account = this.account();
    if (!account?.id) return;
    const c = this.data.config;
    if (this.posting.due(account)) return this.run("post");
    const poll = c.autoReply ? this.replyState(account) : null;
    const browseDue = c.enabled && (!this.data.nextRunAt || this.now() >= this.data.nextRunAt);
    const replyDue = poll && !poll.paused && this.now() >= poll.nextAt;
    if (replyDue && (!browseDue || poll.nextAt <= (this.data.nextRunAt || 0))) return this.run("reply");
    if (browseDue) return this.run("browse");
  }
  run(kind = "browse", options = {}) {
    if (!["browse", "reply", "post"].includes(kind)) throw new Error("任务类型无效");
    if (this.running || this.closed) throw new Error("任务正在运行或宿主已停止");
    if (this.fault) throw new Error(this.fault);
    const unlock = this.lock();
    try { this.reload(); } catch(e) { unlock(); throw e; }
    const enabledKey = kind === "post" ? "postingEnabled" : kind === "reply" ? "autoReply" : "enabled";
    if (!this.data.config[enabledKey]) { unlock(); throw new Error(kind === "post" ? "请先开启定时发帖" : kind === "reply" ? "请先开启自动回复" : "请先开启定时浏览开关"); }
    const selected = this.account();
    const account = selected ? { ...selected } : null;
    if (!account?.id) { unlock(); throw new Error("请登录包含 heybox_id 的 Cookie"); }
    if (kind === "post" && this.data.postingAccountId !== account.id) { unlock(); throw new Error("发帖计划绑定其他账号，请重新保存发帖开关"); }
    if (options.manual) {
      try {
        if (kind !== "post" || options.accountId !== account.id) throw new Error("账号已切换，请刷新后再执行发帖");
        if (!this.posting.requestManual(account,options.requestId)) {unlock();return Promise.resolve();}
      } catch (error) {unlock();throw error;}
    }
    const poll = kind === "reply" ? this.replyState(account) : null;
    if (poll?.paused) { unlock(); throw new Error(poll.paused); }
    try { this.save(); } catch(e) { unlock(); throw e; }
    this.controller = new AbortController();
    this.runningKind = kind;
    const revision = this.revision;
    const current = () => !this.closed && !this.controller.signal.aborted && this.revision === revision && this.data.config[enabledKey] && this.account()?.id === account.id && this.account()?.identity === account.identity;
    this.running = (kind === "post" ? this.posting.round(account,current) : this.round(account,current,kind)).then(() => {
      if (poll) poll.failures = 0;
    }).catch((e) => {
      try {
        if (poll && current()) {
          poll.failures = Math.min(10, poll.failures + 1);
          if (["authentication", "captcha"].includes(e.kind)) poll.paused = e.kind === "captcha"
            ? "回复检查已暂停：请完成平台人机验证后重新登录。"
            : "回复检查已暂停：登录失效，请重新登录。";
        }
        this.log("error", this.controller.signal.aborted ? "任务已停止" : (poll?.paused || e.message));
      } catch { this.fault="保存自动化状态失败，任务已停止"; }
    }).finally(() => {
      try {
        if (poll) poll.nextAt = this.now() + this.data.config.replyIntervalSeconds * 1000 * 2 ** Math.min(poll.failures, 5);
        else if (kind === "browse") this.data.nextRunAt = this.data.config.enabled ? this.now()+this.data.config.intervalMinutes*60000 : null;
        this.save();
      } catch { this.fault = "保存自动化状态失败，任务已停止"; }
      finally { unlock(); this.running = null; this.runningKind = null; }
    });
    return this.running;
  }
  log(type,message,extra = {}) {
    this.data.history.push({ at:this.now(),type,message,...extra });
    this.data.history = this.data.history.slice(-200);
    this.save();
  }
  async round(account,current,kind) {
    const c = this.data.config;
    if (c.valleyOnly && (kind !== "reply" || c.replyFollowSchedule) && !inValley(this.now(),c)) { this.log("skip","当前不在允许运行时段，跳过本轮"); return; }
    const a = this.accountState(account);
    this.log("start",kind === "reply" ? "检查评论回复" : "开始一轮浏览");
    const request = async (...args) => {
      if (!current()) throw new Error("任务已停止");
      const value = await this.api(account,...args);
      if (!current()) throw new Error("任务已停止");
      return value.result || {};
    };
    if (kind === "reply") {
      await this.replies(a,account,current,request);
      this.log("done", "本轮回复检查完成"); return;
    }
    let count = 0;
    for (let page=0; page<5 && count<c.postsPerRound && current(); page++) {
      const feed = await request("/bbs/app/feeds",{offset:String(a.offset),pull:"0",dw:"800"});
      const links = (feed.links || []).filter((p) => id(p.linkid));
      if (!links.length) { a.offset=0; this.save(); break; }
      let consumed=0;
      for (const item of links) {
        consumed++;
        const postId = String(item.linkid);
        if (a.seen[postId]) continue;
        const tree = await request("/bbs/app/link/tree",{link_id:postId,offset:"0",limit:"30"});
        if (!tree.link || String(tree.link.linkid) !== postId) continue;
        a.seen[postId] = this.now();
        (a.watched ||= {})[postId] = { at: a.seen[postId], postId, title: String(tree.link.title || "").slice(0, 160) };
        count++; this.save();
        this.log("browse", "已读取帖子",{postId,title:String(tree.link.title||"").slice(0,160)});
        const context = {post:postText(tree.link),comments:commentsFrom(tree).slice(0,20).map((v,index)=>({sourceId:`comment:${id(v.commentid) || index}`,text:forumText(v.text,1000)}))};
        rememberSlangContext((a.slang ||= {contexts:[]}),context,postId,this.now());this.save();
        if(current())this.slangTasks.enqueue(account,context,postId);
        if (c.autoComment && userId(tree.link.user) !== account.id && (postText(tree.link).body.trim() || postText(tree.link).title.trim())) {
          try {
            await this.interact(a,account,current,{kind:"comment",key:`post:${postId}`,postId,replyId:"-1",rootId:"-1",author:tree.link.user,input:{kind:"comment",...context}});
          } catch(e) {
            // A generation failure may retry next round; committed send intents still deduplicate.
            if (!a.actions[`post:${postId}`]) delete a.seen[postId];
            this.save(); throw e;
          }
        }
        if (count>=c.postsPerRound) break;
      }
      a.offset += consumed; this.save();
    }
    this.log("done",`本轮读取 ${count} 帖`);
  }
  async replies(a,account,current,request) {
    const queue = a.replyQueue ||= {};
    const c=this.data.config;
    const secrets=[account.cookie,c.apiKey,...(account.cookie || "").split(";").map(v=>v.slice(v.indexOf("=")+1).trim())];
    let discoveryError;
    // Persist every discovered candidate before processing the per-round batch.
    for (let offset=0;offset<100;offset+=20) {
      let box;
      try { box=await request("/bbs/app/user/message",{list_type:"0",offset:String(offset),limit:"20",no_more:"false"}); }
      catch (e) {
        e.message=platformText(e.message,secrets);
        if (!current() || ["authentication","captcha","rate_limit"].includes(e.kind)) throw e;
        discoveryError=new Error("消息获取失败："+platformText(e.message,secrets));
        break;
      }
      const messages=box.messages || box.list || [];
      if (!Array.isArray(messages) || !messages.length) break;
      for (const m of messages) {
        const incoming=positiveId(m.comment_a_id), root=positiveId(m.root_comment_id), postId=id(m.link?.linkid ?? m.linkid ?? m.link_id);
        if (!incoming || !postId || queue[incoming] || a.actions[`reply:${incoming}`] || !isNewReply(m, a.replyPoll.baselineAt)) continue;
        queue[incoming] = {replyId:incoming, rootId:root, postId, queuedAt:this.now(), attempts:0};
      }
      this.save();
      if (messages.length < 20) break;
    }
    let count=0;
    // Rotate failed entries behind candidates that have not yet been attempted.
    for (const entry of Object.values(queue).sort((x,y)=>(x.lastAttemptAt || 0)-(y.lastAttemptAt || 0) || x.queuedAt-y.queuedAt)) {
      const {replyId:incoming, postId}=entry;
      let root=positiveId(entry.rootId);
      const action=a.actions[`reply:${incoming}`];
      if (action && action.status !== "rejected") {
        if (action.status !== "unknown") delete queue[incoming];
        this.save(); continue;
      }
      if (exhaustReply(a,entry,c.replyMaxAttempts,this.now())) { this.save(); continue; }
      if (limitOwnPostReply(a,entry,c.ownPostReplyLimit,this.now())) { this.save(); continue; }
      if (entry.requiresOwnPostReply && !c.replyOwnPosts) continue;
      if (!current() || count >= c.repliesPerRound || (a.days[localTime(this.now(),c.timeZone).day]?.reply || 0) >= c.dailyReplies) break;
      count++; entry.attempts++; entry.lastAttemptAt=this.now(); this.save();
      let attemptError="";
      try {
        const tree=await request("/bbs/app/link/tree",{link_id:postId,offset:"0",limit:"100"});
        if (String(tree.link?.linkid) === postId && userId(tree.link?.user) === account.id) {
          (a.ownReplyPosts ||= {})[postId]=true;
          if (limitOwnPostReply(a,entry,c.ownPostReplyLimit,this.now())) { this.save(); continue; }
        }
        let comments=commentsFrom(tree);
        let target=comments.find((v) => id(v.commentid)===incoming);
        // Root-level comments live in the post tree, not in the subcomment pages.
        if (!target && (!root || root === incoming)) {
          let offset=Number.isInteger(entry.treeOffset) && entry.treeOffset >= 100 ? entry.treeOffset : 100;
          for (let page=0;page<5 && !target;page++) {
            const nextTree=await request("/bbs/app/link/tree",{link_id:postId,offset:String(offset),limit:"100"});
            const batch=commentsFrom(nextTree); comments.push(...batch);
            target=batch.find(v=>id(v.commentid)===incoming);
            const groups=nextTree.comments || nextTree.comment || [];
            if (target || !Array.isArray(groups) || groups.length < 100 || nextTree.has_more === false || nextTree.has_more === 0) { delete entry.treeOffset; break; }
            entry.treeOffset=offset+=100; this.save();
          }
        }
        if (!root && target) { root=positiveId(target.threadRoot); if (root) entry.rootId=root; }
        if (!target && root && root !== incoming) {
          let cursor=id(entry.scanCursor);
          for(let page=0;page<5 && !target;page++) {
            const sub=await request("/bbs/app/comment/sub/comments",{root_comment_id:root,limit:"10",...(cursor?{lastval:cursor}:{})});
            const batch=commentsFrom(sub,root); comments.push(...batch);
            target=batch.find((v)=>id(v.commentid)===incoming);
            const next=id(sub.lastval ?? batch.at(-1)?.commentid);
            if (target || !batch.length || !next || cursor===next || sub.has_more === false || sub.has_more === 0) {
              delete entry.scanCursor; this.save(); break;
            }
            // Resume the bounded scan next round instead of rereading the first pages.
            entry.scanCursor=cursor=next; this.save();
          }
        }
        if (target) delete entry.scanCursor;
        const parent=positiveId(target?.reply_id ?? target?.replyid);
        const addressedToUs=userId(target?.replyuser)===account.id;
        const parentComment=comments.find((v)=>id(v.commentid)===parent);
        const ours=Object.values(a.actions).find((v)=>v.status==="sent" && v.commentId===parent && v.postId===postId);
        const rootKnown=comments.some((v)=>id(v.commentid)===root);
        if (!target || !rootKnown) throw new Error("暂未找到完整评论关系，下轮重试");
        const skip = () => { a.actions[`reply:${incoming}`]={status:"skipped",postId,at:this.now()}; delete queue[incoming]; this.save(); };
        if (target.threadRoot!==root || userId(target.user)===account.id || !userId(target.user)) { skip(); continue; }
        const topLevel=incoming===root && !parent;
        const ownPost=userId(tree.link?.user)===account.id;
        entry.ownPost=ownPost;
        entry.requiresOwnPostReply=ownPost && topLevel;
        if (topLevel) {
          if (!userId(tree.link?.user)) throw new Error("暂未确认帖子作者，下轮重试");
          if (!ownPost) { skip(); continue; }
          if (!c.replyOwnPosts) { entry.error="自己帖子的顶层评论回复已关闭，开启后继续"; this.save(); continue; }
        } else {
          if (!parentComment && !ours && !addressedToUs) throw new Error("暂未找到父评论关系，下轮重试");
          if (!(ours || userId(parentComment?.user)===account.id || addressedToUs)) { skip(); continue; }
        }
        const usePostingPersona=ownPost && c.replyOwnPosts && c.ownPostReplyPersona==="posting";
        const postJob=usePostingPersona ? a.posting?.jobs?.find(v=>v.postId===postId && ["accepted","verified"].includes(v.status)) : null;
        await this.interact(a,account,current,{kind:"reply",key:`reply:${incoming}`,postId,replyId:incoming,rootId:root,
          ownPost, requiresOwnPostReply:topLevel, personaSource:usePostingPersona ? "posting" : "reply", persona:usePostingPersona ? postJob?.persona || c.postingPersona : undefined,
          input:{kind:"reply",ownPost,post:postText(tree.link),parent:forumText(parentComment?.text || ours?.displayText,2000),incoming:forumText(target.text,4000)}});
      } catch(e) {
        if (e.persistence) throw e;
        entry.error=attemptError=platformText(e.message,secrets);
        e.message=entry.error;
        Object.assign(entry,platformDetails(e,secrets));
        this.save();
        if (!current() || ["authentication","captcha","rate_limit"].includes(e.kind)) throw e;
        if (exhaustReply(a,entry,c.replyMaxAttempts,this.now())) {
          this.log("reply-exhausted", `来信已尝试 ${entry.attempts} 次，达到上限 ${c.replyMaxAttempts} 次，停止自动回复`,{postId,kind:"reply",replyId:incoming});
          continue;
        }
        this.log("error", "回复保留在队列，下轮重试："+entry.error,{postId,kind:"reply"});
      }
      const result=a.actions[`reply:${incoming}`];
      if (result && !["rejected","unknown"].includes(result.status)) delete queue[incoming];
      else if (result) {
        if (!attemptError) Object.assign(entry,platformDetails(result,secrets));
        entry.error=result.status === "unknown" ? "发送结果未知，等待确认，不自动重发" : (attemptError || result.platformMessage || "平台拒绝发送，下轮重试");
      }
      if (exhaustReply(a,entry,c.replyMaxAttempts,this.now())) {
        this.log("reply-exhausted", `来信已尝试 ${entry.attempts} 次，达到上限 ${c.replyMaxAttempts} 次，停止自动回复`,{postId,kind:"reply",replyId:incoming});
      }
      this.save();
    }
    if (discoveryError) throw discoveryError;
  }
  async interact(a,account,current,job) {
    const c=this.data.config;
    const budget=()=> a.days[localTime(this.now(),c.timeZone).day] ||= {comment:0,reply:0};
    if(job.kind === "reply" && job.ownPost)(a.ownReplyPosts ||= {})[job.postId]=true;
    const withinOwnPostLimit=()=>{
      if(job.kind !== "reply" || !knownOwnPost(a,job.postId))return true;
      if(limitOwnPostReply(a,job,c.ownPostReplyLimit,this.now()))this.save();
      return ownPostReplyUsage(a,job.postId)<c.ownPostReplyLimit;
    };
    const allowed=()=>current() && withinOwnPostLimit() && (!job.requiresOwnPostReply || c.replyOwnPosts) && c[job.kind==="comment"?"autoComment":"autoReply"] && (!c.valleyOnly || (job.kind === "reply" && !c.replyFollowSchedule) || inValley(this.now(),c)) && budget()[job.kind]<c[job.kind==="comment"?"dailyComments":"dailyReplies"] && (!a.actions[job.key] || (job.kind === "reply" && a.replyQueue?.[job.replyId] && a.actions[job.key].status === "rejected"));
    if(!allowed()) return false;
    if (job.kind === "reply") {
      rememberSlangContext((a.slang ||= {contexts:[]}),job.input,job.postId,this.now());this.save();
      if(current())this.slangTasks.enqueue(account,job.input,job.postId);
    }
    if(!allowed()) return false;
    const input = { ...job.input, ...(c.slangEnabled ? { slang:relevantSlang(this.glossary(account),job.input) } : {}) };
    const decision=await this.generate(input,job.personaSource === "posting" ? { ...c, replyPersona:job.persona } : c,{signal:this.controller.signal,directory:this.directory});
    if(!allowed()) return false;
    if(decision.action!=="send") {
      a.actions[job.key]={status:"skipped",postId:job.postId,at:this.now()}; this.save(); return true;
    }
    if(typeof decision.text!=="string" || !decision.text.trim() || decision.text.length>500 || /[<>@\u0000-\u0008]/.test(decision.text)) throw new Error("生成内容不符合发送要求");
    const text=job.kind==="comment" ? commentText(c,job.author,decision.text.trim()) : decision.text.trim();
    if (text.length > 500) throw new Error("添加提及后评论超过 500 字，请缩短正文或昵称");
    const displayText = text.startsWith("<a ")
      ? `@${c.mentionTarget === "custom" ? c.mentionName : (job.author.username || job.author.nickname).trim()} ${decision.text.trim()}` : text;
    const waitMs=Math.max(0,a.lastSendAt+c.cooldownSeconds*1000-this.now());
    if(waitMs) await this.wait(waitMs,undefined,{signal:this.controller.signal});
    if(!allowed()) return false;
    // Commit the intent and reserve the quota before the irreversible network call.
    const action={status:"unknown",kind:job.kind,postId:job.postId,at:this.now(),replyId:job.replyId,
      text, displayText, ownPost:job.ownPost, personaSource:job.personaSource, title:job.input.post?.title || "", incoming:job.input.incoming || "", parent:job.input.parent || ""};
    a.actions[job.key]=action; budget()[job.kind]++; a.lastSendAt=this.now(); this.save();
    try {
      const receipt=await this.api(account,"/bbs/app/comment/create",{},"POST",{is_cy:"0",link_id:job.postId,reply_id:job.replyId,root_id:job.rootId,text});
      action.commentId=id(receipt.commentid ?? receipt.result?.commentid ?? receipt.result?.comment?.[0]?.commentid ?? receipt.comment?.[0]?.commentid);
      action.status=action.commentId?"sent":"accepted";
      this.log(action.status,action.commentId?"平台返回评论 ID":"平台接受请求，未返回评论 ID",{postId:job.postId,kind:job.kind});
    } catch(e) {
      if (e.persistence) throw e;
      action.status=e.definitive?"rejected":"unknown";
      Object.assign(action, platformDetails(e, [account.cookie, c.apiKey, ...(account.cookie || "").split(";").map(v=>v.slice(v.indexOf("=")+1).trim())]));
      const reason = [action.platformStatus, action.platformMessage, action.httpStatus ? `HTTP ${action.httpStatus}` : ""].filter(Boolean).join(" · ");
      this.log(action.status,(e.definitive?(job.kind === "reply" ? (a.replyQueue?.[job.replyId]?.attempts >= c.replyMaxAttempts ? "平台明确拒绝发送，已达到尝试上限" : "平台明确拒绝发送，已保留待重试") : "平台明确拒绝发送"):"发送结果未知，已去重且不会自动重试") + (reason ? "：" + reason : ""),{postId:job.postId,kind:job.kind,...platformDetails(action)});
      if (job.kind === "reply" && ["authentication", "captcha", "rate_limit"].includes(e.kind)) { this.save(); throw e; }
    }
    this.save(); return true;
  }
}

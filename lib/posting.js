import crypto from "node:crypto";
import { platformDetails } from "./platform-error.js";
import { validateSelections, searchPostingSelections, resolveSelectionDecision } from "./posting-selections.js";
import { postingSlang } from "./slang.js";

export const postingDefaults = Object.freeze({
  postingEnabled: false,
  postingPersona: "以自然、真诚的口吻分享游戏与数码见闻。观点明确，不编造个人经历，不做广告。",
  postingPrompt: "分享一个值得讨论的游戏话题，给出具体观点，并邀请盒友交流。",
  postingCommunities: [], postingHashtags: [],
  postingSelectionMode: "manual", postingSelectionQuery: "", postingSelectionPrompt: "",
  postingTimingMode: "fixed",
  postingTimingPrompt: "每天选择 1 个自然、不固定的时间发帖，安排在 10:00 到 22:00 之间，尽量不要连续几天使用相同时间。",
  postingDailyLimit: 1, postingMinGapMinutes: 60,
  postingTopicId: "", postingSchedule: "daily", postingTime: "20:00", postingAt: "",
  postingWeekdays: [1, 2, 3, 4, 5, 6, 7],
});

export function validatePosting(c) {
  if (typeof c.postingEnabled !== "boolean") throw new Error("发帖开关无效");
  for (const [key, max] of [["postingSelectionQuery", 100], ["postingSelectionPrompt", 2000], ["postingPersona", 20000], ["postingPrompt", 4000], ["postingTimingPrompt", 2000]]) {
    if (typeof c[key] !== "string" || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(c[key])) throw new Error(`${key} 无效`);
    if (c[key].length > max) throw new Error(`${key} 最多 ${max} 字符，当前 ${c[key].length} 字符`);
  }
  if (typeof c.postingTopicId !== "string" || (c.postingTopicId && !/^[1-9]\d{0,19}$/.test(c.postingTopicId))) throw new Error("发帖社区 ID 必须为正整数");
  if (!["manual", "ai"].includes(c.postingSelectionMode)) throw new Error("发帖分区选择方式无效");
  if (/[\x00-\x1f\x7f]/.test(c.postingSelectionQuery)) throw new Error("分区搜索词不能包含控制字符");
  validateSelections(c.postingCommunities, c.postingHashtags, { checkCombination: false });
  if (c.postingCommunities.length && c.postingTopicId) throw new Error("已选择发帖分区，请清空旧版社区 ID，避免目标不明确");
  if (!["fixed", "prompt"].includes(c.postingTimingMode)) throw new Error("发帖时间模式无效");
  if (!Number.isInteger(c.postingDailyLimit) || c.postingDailyLimit < 1 || c.postingDailyLimit > 10) throw new Error("提示词调度每日最多安排 1–10 条");
  if (!Number.isInteger(c.postingMinGapMinutes) || c.postingMinGapMinutes < 10 || c.postingMinGapMinutes > 1440) throw new Error("计划发帖间隔范围 10–1440 分钟");
  if (c.postingEnabled && c.postingTimingMode === "prompt" && !c.postingTimingPrompt.trim()) throw new Error("请填写发帖时间提示词");
  if (!["once", "daily", "weekly"].includes(c.postingSchedule)) throw new Error("发帖周期无效");
  if (typeof c.postingTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.postingTime)) throw new Error("发帖时间格式 HH:mm");
  if (typeof c.postingAt !== "string" || (c.postingAt && !validLocal(c.postingAt))) throw new Error("单次发帖时间格式 YYYY-MM-DDTHH:mm");
  if (!Array.isArray(c.postingWeekdays) || c.postingWeekdays.length > 7 || new Set(c.postingWeekdays).size !== c.postingWeekdays.length || c.postingWeekdays.some(v => !Number.isInteger(v) || v < 1 || v > 7)) throw new Error("发帖星期无效（1–7）");
  if (c.postingEnabled && (!c.postingPersona.trim() || !c.postingPrompt.trim() || (c.postingSelectionMode === "manual" && !c.postingTopicId && !c.postingCommunities.length) || (c.postingTimingMode === "fixed" && c.postingSchedule === "once" && !c.postingAt) || (c.postingTimingMode === "fixed" && c.postingSchedule === "weekly" && !c.postingWeekdays.length))) throw new Error("开启发帖前请填写独立发帖人格、主题、社区和完整时间");
  if (c.postingAt && localEpoch(c.postingAt, c.timeZone) === null) throw new Error("单次发帖时间在所选时区不存在");
}

function validLocal(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return false;
  const epoch = Date.parse(value + ":00Z");
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 16) === value;
}
function localStamp(epoch, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(epoch).map(v => [v.type, v.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
// Try offsets on both sides of a DST transition; choose the first repeated minute.
export function localEpoch(stamp, zone) {
  const naive = Date.parse(stamp + ":00Z");
  const candidates = [-86400000, 0, 86400000].map(delta => {
    const probe = naive + delta;
    const offset = Date.parse(localStamp(probe, zone) + ":00Z") - probe;
    return naive - offset;
  }).filter(epoch => localStamp(epoch, zone) === stamp);
  return candidates.length ? Math.min(...candidates) : null;
}
export function nextPostingAt(c, after) {
  if (c.postingTimingMode === "prompt") return null;
  if (c.postingSchedule === "once") {
    const epoch = c.postingAt ? localEpoch(c.postingAt, c.timeZone) : null;
    return epoch !== null && epoch > after ? epoch : null;
  }
  const date = localStamp(after, c.timeZone).slice(0, 10);
  for (let day = 0; day < 9; day++) {
    const calendar = new Date(Date.parse(date + "T00:00:00Z") + day * 86400000);
    if (c.postingSchedule === "weekly" && !c.postingWeekdays.includes(calendar.getUTCDay() || 7)) continue;
    const epoch = localEpoch(calendar.toISOString().slice(0, 10) + "T" + c.postingTime, c.timeZone);
    if (epoch !== null && epoch > after) return epoch;
  }
  return null;
}
function signature(c) {
  return crypto.createHash("sha256").update(JSON.stringify(c.postingTimingMode === "prompt" ? ["prompt", c.timeZone] : [c.postingSchedule, c.postingTime, c.postingAt, c.postingWeekdays, c.timeZone])).digest("hex");
}
export function parsePostDecision(text) {
  const value = JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));
  if (!value || !["send", "skip"].includes(value.action)) throw new Error("发帖决策无效");
  if (value.action === "skip") {
    const reason = typeof value.reason === "string" ? value.reason.trim() : "";
    // A deliberate skip stays terminal, even if an older model omits or malforms its explanation.
    return { action: "skip", reason: reason && reason.length <= 200 && !/[<>\x00-\x1f\x7f]/.test(reason) ? reason : "模型未说明具体原因" };
  }
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 30 || typeof value.text !== "string" || !value.text.trim() || value.text.length > 10000 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.title + value.text) || /[\r\n]/.test(value.title)) throw new Error("帖子内容无效（标题 1–30 字，正文 1–10000 字，不含 HTML）");
  return { action: "send", title: value.title.trim(), text: value.text.trim() };
}
export function parsePostingPlan(text) {
  const value = JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));
  if (!value || !Array.isArray(value.times) || value.times.length > 10 || value.times.some(v => typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) || new Set(value.times).size !== value.times.length) throw new Error("时间计划必须包含不重复的 HH:mm 时间数组，最多 10 个");
  return { times: [...value.times].sort() };
}
const terminal = job => !["pending", "generating"].includes(job.status);
function planKey(now, zone) { return zone + ":" + localStamp(now, zone).slice(0, 10); }
function currentPlan(p, now, zone) { return (p.plans || []).find(v => v.key === planKey(now, zone)); }
function planSlot(p, plan) { return plan?.slots?.find(slot => !p.jobs.some(job => job.trigger !== "manual" && job.slot === slot && terminal(job))) ?? null; }
function todayJobs(p, now, zone) { const date = localStamp(now, zone).slice(0, 10); return p.jobs.filter(v => localStamp(v.slot, zone).startsWith(date)); }

function receiptId(data) {
  const value = data?.link_id ?? data?.linkid ?? data?.result?.link_id ?? data?.result?.linkid ?? data?.result?.link?.linkid;
  return /^[1-9]\d{0,19}$/.test(String(value)) ? String(value) : null;
}

export class Posting {
  constructor(worker) { this.worker = worker; }
  state(account) {
    const w = this.worker, c = w.data.config;
    const p = w.accountState(account).posting ||= { jobs: [], nextAt: null, scheduleKey: "" };
    const key = signature(c);
    if (key !== p.scheduleKey) {
      p.scheduleKey = key;
      p.nextAt = c.postingTimingMode === "fixed" && c.postingSchedule === "once" && c.postingAt ? localEpoch(c.postingAt, c.timeZone) : nextPostingAt(c, w.now());
    }
    if (c.postingTimingMode === "prompt") {
      const date = localStamp(w.now(), c.timeZone).slice(0, 10);
      for (const job of p.jobs) if (!terminal(job) && localStamp(job.slot, c.timeZone).slice(0, 10) < date) {
        job.status = "missed"; job.error = "已跨天，不补发昨日任务";
      }
      const plan = currentPlan(p, w.now(), c.timeZone);
      if (plan?.status === "planning" && plan.attempts >= 3 && !(plan.retryAt > w.now())) {
        plan.status = "failed"; plan.error = "规划连续中断，今日不再自动重试";
      }
      p.nextAt = planSlot(p, plan);
    }
    return p;
  }
  createJob(p, slot, extra = {}) {
    const w=this.worker,c=w.data.config;
    const job={id:crypto.randomUUID(),slot,at:w.now(),status:"pending",attempts:0,persona:c.postingPersona,prompt:c.postingPrompt,selectionMode:c.postingSelectionMode,selectionQuery:c.postingSelectionQuery,selectionPrompt:c.postingSelectionPrompt,topicId:c.postingTopicId,communities:c.postingCommunities.map(({id,name})=>({id,name})),hashtags:c.postingHashtags.map(({name,isActivity})=>({name,isActivity})),...extra};
    if (job.selectionMode === "ai") {job.communities=[];job.hashtags=[];job.topicId="";}
    p.jobs.push(job);p.jobs=p.jobs.slice(-200);
    return job;
  }
  requestManual(account, requestId) {
    const w=this.worker,c=w.data.config,p=this.state(account);
    if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error("手动发帖请求标识无效，请刷新后重试");
    // Replaying an HTTP request must never create a second post, even after restart.
    if (p.jobs.some(job=>job.requestId === requestId)) return false;
    if (p.jobs.some(job=>!terminal(job))) throw new Error("已有发帖任务等待处理，请先查看发帖记录");
    if (todayJobs(p,w.now(),c.timeZone).length >= c.postingDailyLimit) throw new Error("今日发帖任务已达上限，无法追加手动发帖");
    const last=Math.max(0,...p.jobs.map(job=>job.sentAt || 0));
    if (last && w.now()-last < c.postingMinGapMinutes*60000) throw new Error(`距离上次发帖不足 ${c.postingMinGapMinutes} 分钟，请稍后再试`);
    this.createJob(p,w.now(),{trigger:"manual",requestId});
    return true;
  }
  status() {
    const w = this.worker, account = w.account();
    const p = account?.id ? w.data.accounts[account.id]?.posting : null;
    const accountMatches = !!account?.id && w.data.postingAccountId === account.id;
    return { accountMatches, nextAt: w.data.config.postingEnabled && accountMatches ? p?.nextAt ?? null : null, plans: (p?.plans || []).slice(-14).reverse(), jobs: (p?.jobs || []).slice(-50).reverse() };
  }
  due(account) {
    const w = this.worker;
    if (!w.data.config.postingEnabled || w.data.postingAccountId !== account.id) return false;
    const unlock = w.lock();
    try {
      w.reload();
      const previousState = JSON.stringify(w.data.accounts[account.id]?.posting);
      const p = this.state(account);
      if (previousState !== JSON.stringify(p)) w.save();
      const c = w.data.config;
      if (!c.postingEnabled || w.data.postingAccountId !== account.id) return false;
      if (p.jobs.some(job=>job.trigger === "manual" && !terminal(job))) return !(p.retryAt > w.now());
      if (c.postingTimingMode === "prompt") {
        const plan = currentPlan(p, w.now(), c.timeZone);
        if (!plan || (["pending", "planning"].includes(plan.status) && plan.attempts < 3 && !(plan.retryAt > w.now()))) return true;
      }
      return p.nextAt !== null && p.nextAt <= w.now() && !(p.retryAt > w.now());
    } finally { unlock(); }
  }
  async plan(account, current) {
    const w = this.worker, c = w.data.config, p = this.state(account);
    let plan = currentPlan(p, w.now(), c.timeZone);
    if (plan && (!["pending", "planning"].includes(plan.status) || plan.attempts >= 3 || plan.retryAt > w.now())) return;
    if (!current()) return;
    if (!plan) {
      plan = { id: crypto.randomUUID(), key: planKey(w.now(), c.timeZone), date: localStamp(w.now(), c.timeZone).slice(0, 10), zone: c.timeZone, at: w.now(), status: "pending", attempts: 0, slots: [], prompt: c.postingTimingPrompt };
      p.plans ||= []; p.plans.push(plan); p.plans = p.plans.slice(-30);
    }
    const occupied = todayJobs(p, w.now(), c.timeZone);
    const remaining = Math.max(0, c.postingDailyLimit - occupied.length);
    if (!remaining) { plan.status = "skipped"; plan.note = "今日发帖任务已达上限"; w.save(); return; }
    // Save attempt/backoff before calling the model, including across process restarts.
    plan.status = "planning"; plan.attempts++; plan.retryAt = w.now() + 5 * 60000; w.save();
    try {
      const result = await w.generate({ kind: "post-plan", date: plan.date, timeZone: c.timeZone, now: localStamp(w.now(), c.timeZone), earliest: localStamp(Math.ceil((w.now() + 60000) / 60000) * 60000, c.timeZone), limit: remaining, minGapMinutes: c.postingMinGapMinutes,
        timingPrompt: plan.prompt, existingTimes: occupied.map(v => localStamp(v.slot, c.timeZone).slice(11)),
        previousPlans: p.plans.filter(v => v !== plan && v.status === "ready").slice(-7).map(v => ({ date: v.date, times: v.slots.map(slot => localStamp(slot, v.zone).slice(11)) }))
      }, c, { signal: w.controller.signal, directory: w.directory });
      if (!current()) throw new Error("任务已停止");
      const { times } = parsePostingPlan(JSON.stringify(result));
      if (plan.key !== planKey(w.now(), c.timeZone)) throw new Error("规划已跨天");
      if (times.length > remaining) throw new Error("超过每日上限");
      const slots = times.map(time => localEpoch(plan.date + "T" + time, c.timeZone));
      if (slots.some(slot => slot === null || slot < w.now() + 60000)) throw new Error("时间已过或不存在");
      const allSlots = [...slots, ...occupied.map(v => v.slot)].sort((a, b) => a - b);
      if (allSlots.some((slot, i) => i && slot - allSlots[i - 1] < c.postingMinGapMinutes * 60000)) throw new Error("发帖计划过密");
      plan.slots = slots; plan.status = slots.length ? "ready" : "skipped";
      plan.note = slots.length ? "按时间提示词生成，宿主到点执行" : "模型决定今日剩余时间不安排发帖";
      delete plan.error; delete plan.retryAt; p.nextAt = planSlot(p, plan); w.save();
    } catch (error) {
      if (error.persistence) throw error;
      plan.status = plan.attempts >= 3 ? "failed" : "pending";
      plan.error = current() ? "时间规划失败或超出约束，5 分钟后重试；最多 3 次，当日失败后不发帖" : "规划已停止，重新开启后按重试时间继续";
      w.save();
    }
  }
  async round(account, current) {
    const w = this.worker, c = w.data.config, p = this.state(account);
    const manual=p.jobs.find(job=>job.trigger === "manual" && !terminal(job));
    if (!manual && c.postingTimingMode === "prompt") {
      const plan = currentPlan(p, w.now(), c.timeZone);
      if (!plan || ["pending", "planning"].includes(plan.status)) { await this.plan(account, current); return; }
    }
    const slot = manual ? manual.slot : p.nextAt;
    if (slot === null || slot > w.now() || !current()) return;
    let job = manual || p.jobs.find(v => v.trigger !== "manual" && v.slot === slot);
    const advance = () => { if (manual) {delete p.retryAt;w.save();return;} p.nextAt = c.postingTimingMode === "prompt" ? planSlot(p, currentPlan(p, w.now(), c.timeZone)) : nextPostingAt(c, Math.max(slot, w.now())); delete p.retryAt; w.save(); };
    if (job && !["generating", "pending"].includes(job.status)) { advance(); return; }
    if (w.now() - slot > 10 * 60000) {
      if (!job) { job = { id: crypto.randomUUID(), slot, at: w.now() }; p.jobs.push(job); }
      p.jobs = p.jobs.slice(-200);
      job.status = "missed"; job.error = "错过发布时间超过 10 分钟，请重新安排"; advance(); return;
    }
    if (!job) {
      job=this.createJob(p,slot);w.save();
    }
    if ((manual || c.postingTimingMode === "prompt") && todayJobs(p, w.now(), c.timeZone).filter(v => v !== job).length >= c.postingDailyLimit) {
      job.status = "skipped"; job.error = "今日发帖任务已达上限"; advance(); return;
    }
    if (job.attempts >= 3) { job.status = "failed"; job.error = "内容生成已尝试三次，请重新安排"; advance(); return; }
    try {
      job.status = "generating"; job.attempts++; w.save();
      if (job.selectionMode === "ai" && !job.selectionResolved) {
        const candidates = await searchPostingSelections(account, w.api, job.selectionQuery || "");
        if (!current()) throw new Error("任务已停止");
        if (!candidates.communities.length) { job.status = "skipped"; job.error = "平台没有返回可选分区，本次不发帖"; advance(); return; }
        const selection = resolveSelectionDecision(await w.generate({ kind: "post-select", topic: job.prompt, preference: job.selectionPrompt || "", candidates }, { ...c, postingPersona: job.persona }, { signal: w.controller.signal, directory: w.directory }), candidates);
        if (!current()) throw new Error("任务已停止");
        if (selection.action === "skip") { job.status = "skipped"; job.error = "模型未找到适合主题与人格的分区，本次不发帖"; advance(); return; }
        job.communities = selection.communities; job.hashtags = selection.hashtags; job.topicId = "";
        job.selectionResolved = true; w.save();
      }
      try { validateSelections(job.communities || [], job.hashtags || []); }
      catch (error) { job.status = "rejected"; job.error = error.message; advance(); return; }
      const input = {kind:"post",topic:job.prompt,communities:job.communities || [],hashtags:job.hashtags || [],currentTime:{local:localStamp(w.now(),c.timeZone),timeZone:c.timeZone}};
      if (c.slangEnabled) input.slang = postingSlang(w.glossary(account),input);
      const decision = await w.generate(input, { ...c, postingPersona: job.persona }, { signal: w.controller.signal, directory: w.directory });
      if (!current()) throw new Error("任务已停止");
      const content = parsePostDecision(JSON.stringify(decision));
      if (content.action === "skip") { job.status = "skipped"; job.error = `未发布原因：${content.reason}`; advance(); return; }
      job.title = content.title; job.text = content.text;
      const sameDay = () => (!manual && c.postingTimingMode !== "prompt") || localStamp(slot, c.timeZone).slice(0, 10) === localStamp(w.now(), c.timeZone).slice(0, 10);
      const a = w.accountState(account);
      const lastPostAt = manual || c.postingTimingMode === "prompt" ? Math.max(0, ...p.jobs.filter(v => v !== job && v.sentAt).map(v => v.sentAt)) : 0;
      const remaining = Math.max(c.cooldownSeconds * 1000 - (w.now() - a.lastSendAt), lastPostAt ? c.postingMinGapMinutes * 60000 - (w.now() - lastPostAt) : 0);
      if ((manual || c.postingTimingMode === "prompt") && w.now() + Math.max(0, remaining) - slot > 10 * 60000) {
        job.status = "missed"; job.error = "发送冷却或最短间隔导致错过计划超过 10 分钟"; advance(); return;
      }
      if (remaining > 0) await w.wait(remaining, undefined, { signal: w.controller.signal });
      if (!current()) throw new Error("任务已停止");
      if (!sameDay()) { job.status = "missed"; job.error = "生成或等待期间已跨天，不补发昨日任务"; advance(); return; }
      // Persist an uncertain intent before the irreversible request; never blindly resend it.
      job.status = "uncertain"; job.sentAt = w.now(); a.lastSendAt = w.now(); w.save();
      let receipt;
      try {
        receipt = await w.api(account, "/bbs/app/api/link/post", { web_version: "3.0" }, "POST", {
          title: job.title, text: JSON.stringify([{ type: "text", text: job.text }]),
          desc: job.text.slice(0, 100), words_count: String(job.text.length), topic_ids: job.communities?.length ? job.communities.map(v => v.id).join(",") : job.topicId,
          link_tag: "27", post_type: "1", draft: "0", original: "1", view_limit: "1", hashtags: JSON.stringify((job.hashtags || []).map(v => v.name)), schedule_ts: "0", declaration: "0",
        });
      } catch (error) {
        Object.assign(job, platformDetails(error, [account.cookie, c.apiKey, ...(account.cookie || "").split(";").map(v => v.slice(v.indexOf("=") + 1).trim())]));
        job.status = error.definitive ? "rejected" : "uncertain";
        job.error = error.definitive ? "平台拒绝发布，请检查登录、社区权限或平台限制" : "发送结果未知，请到平台核对，不会自动重发";
        advance(); return;
      }
      job.postId = receiptId(receipt);
      job.status = job.postId ? "accepted" : "uncertain";
      if (!job.postId) job.error = "平台未返回帖子 ID，请到平台核对，不会自动重发";
      w.save();
      if (job.postId) {
        try {
          const detail = await w.api(account, "/bbs/app/link/tree", { link_id: job.postId, offset: "0", limit: "1" });
          const link = detail.result?.link;
          let blocks; try { blocks = JSON.parse(link?.text); } catch { blocks = null; }
          const body = Array.isArray(blocks) ? blocks.filter(v => v.type === "text").map(v => v.text).join("\n") : link?.text;
          if (String(link?.linkid) === job.postId && link?.title === job.title && body === job.text) job.status = "verified";
          else job.error = "已取得帖子 ID，读取内容尚未核验一致";
        } catch { job.error = "已取得帖子 ID，读取核验暂未成功"; }
      }
      advance();
    } catch (error) {
      if (["uncertain", "accepted", "verified"].includes(job.status) || error.persistence) throw error;
      job.status = job.attempts >= 3 ? "failed" : "pending";
      job.error = current() ? "内容生成失败，稍后重试；连续失败三次后结束本次任务" : "任务已停止，重新开启后可继续";
      if (job.selectionMode === "ai" && !job.selectionResolved && current()) job.error = job.status === "failed" ? "分区与话题选择失败三次，本次任务结束" : "分区与话题查询或选择失败，稍后重试；最多三次";
      if (job.status === "failed") advance();
      else { p.retryAt = w.now() + 60000; w.save(); }
    }
  }
}

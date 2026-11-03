import crypto from "node:crypto";

const MAX_ENTRIES = 500;
const keyFor = term => term.normalize("NFKC").toLocaleLowerCase("en");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const plain = (value, max) => typeof value === "string" && !!value.trim() && value.length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
const optional = (value, max) => value === undefined || value === "" || plain(value,max);
const json = text => JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));

export function parseSlangDecision(text) {
  const value = json(text);
  if (!value || !Array.isArray(value.entries) || value.entries.length > 12) throw new Error("黑话提取格式无效");
  return { entries: value.entries.map(entry => {
    if (!entry || !plain(entry.term, 40) || !optional(entry.meaning, 400) || !optional(entry.context, 160) || !plain(entry.evidence, 300)
      || !optional(entry.sourceId,80) || (entry.confidence !== undefined && (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1))) throw new Error("黑话候选无效");
    return { term: entry.term.trim(), meaning: entry.meaning?.trim() || "", context: entry.context?.trim() || "", evidence: entry.evidence.trim(), confidence: entry.confidence ?? 0, ...(entry.sourceId ? {sourceId:entry.sourceId} : {}) };
  }) };
}

export function slangState(account) {
  const state = account.slang ||= { entries: [], sources: [] };
  state.contexts ||= [];
  for (const entry of state.entries) if (entry.status === "active" && !entry.verified) entry.status = "pending";
  return state;
}

export function slangSources(input) {
  return [{sourceId:"post:title",text:input.post?.title}, {sourceId:"post:body",text:input.post?.body},
    ...(input.comments || []).map((value,index)=>typeof value === "string" ? {sourceId:`comment:${index}`,text:value} : {sourceId:value.sourceId || `comment:${index}`,text:value.text}),
    {sourceId:"parent",text:input.parent}, {sourceId:"incoming",text:input.incoming}].filter(v=>typeof v.text === "string" && v.text.trim());
}
export function sourceText(input) {
  return slangSources(input).map(v=>v.text).join("\n");
}

export function sourceKey(input) { return digest(sourceText(input)); }

export function rememberSlangContext(state,input,postId,now) {
  const key = sourceKey(input);
  state.contexts = [...(state.contexts || []).filter(v=>v.key !== key), {key,input,postId,at:now}].slice(-10);
}

export function learnSlang(state, decision, input, { postId, now }) {
  // Validate injected generators too; only accept quotes that exist in the supplied context.
  const { entries } = parseSlangDecision(JSON.stringify(decision));
  const originals = slangSources(input);
  const seen = new Set();
  let added = 0;
  for (const candidate of entries) {
    const original = originals.find(v=>(!candidate.sourceId || v.sourceId === candidate.sourceId) && v.text.includes(candidate.evidence));
    if (!original || !candidate.evidence.includes(candidate.term) || candidate.term.length < 2 || !/[\p{L}]/u.test(candidate.term)
      || /^(图片|表情|视频|的|了|呢|啊|你好|谢谢|什么|怎么|可以|自动提取)$/u.test(candidate.term)
      || /usage limit|temporarily unavailable|agent 处理出错|模型.*不可用/i.test(candidate.evidence)) continue;
    const key = keyFor(candidate.term);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = state.entries.find(v => keyFor(v.term) === key);
    const evidence = { postId, sourceId:original.sourceId, title: input.post?.title || "", quote: candidate.evidence, at: now };
    if (entry) {
      if (entry.status === "disabled" || entry.verified) continue;
      if (candidate.meaning && entry.meaning && (entry.meaning !== candidate.meaning || entry.context !== candidate.context)) {
        // Rephrasing and genuine multiple senses are both uncertain until reviewed.
        entry.status = "pending";
        entry.alternatives ||= [];
        if (!entry.alternatives.some(v => v.meaning === candidate.meaning && v.context === candidate.context) && entry.alternatives.length < 3) entry.alternatives.push({ ...candidate, source: evidence });
      }
      entry.updatedAt = now;
      entry.occurrences = (entry.occurrences || 1) + 1;
      if (!entry.sources.some(v => v.postId === postId && v.quote === evidence.quote)) entry.sources = [...entry.sources, evidence].slice(-3);
      continue;
    }
    if (state.entries.length >= MAX_ENTRIES) continue;
    state.entries.push({ id: crypto.randomUUID(), ...candidate, status:"pending", verified: false, occurrences:1, sources: [evidence], createdAt: now, updatedAt: now });
    added++;
  }
  state.sources = [...state.sources.filter(v => v !== sourceKey(input)), sourceKey(input)].slice(-200);
  return added;
}

function matchesTerm(text,term) {
  const key = keyFor(term);
  let start = text.indexOf(key);
  while (start !== -1) {
    if ((!/^[a-z0-9]/.test(key) || !/[a-z0-9]/.test(text[start-1] || "")) && (!/[a-z0-9]$/.test(key) || !/[a-z0-9]/.test(text[start+key.length] || ""))) return true;
    start = text.indexOf(key,start+1);
  }
  return false;
}

const confirmedReference = v => ({term:v.term,meaning:v.meaning,context:v.context,confidence:v.confidence,verified:true,usable:true});

export function relevantSlang(state, input) {
  const text = keyFor(sourceText(input));
  return [...state.entries].filter(v => v.status !== "disabled" && matchesTerm(text,v.term))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.term.length - a.term.length).slice(0, 20)
    .map(v => v.verified && v.status === "active" ? confirmedReference(v)
      : {term:v.term,usable:false});
}

export function postingSlang(state, input) {
  const text = keyFor([input.topic, ...(input.communities || []).map(v=>v.name), ...(input.hashtags || []).map(v=>v.name)].filter(Boolean).join("\n"));
  // A writing theme may describe a slang meaning without containing the slang itself.
  const words = value => {
    const tokens = new Set();
    for (const word of keyFor(value).match(/[a-z0-9]{2,}|\p{Script=Han}{2,}/gu) || []) {
      if (/^[a-z0-9]/.test(word)) tokens.add(word);
      else for (let i=0;i<word.length-1;i++) tokens.add(word.slice(i,i+2));
    }
    return tokens;
  };
  const query = words(text);
  const overlap = value => [...words(value)].filter(word=>query.has(word)).length;
  return state.entries.filter(v=>v.verified && v.status === "active")
    .map(entry=>({entry,score:(matchesTerm(text,entry.term) ? 1000000 : 0) + overlap(entry.context)*3 + overlap(entry.meaning)}))
    .filter(v=>v.score > 0).sort((a,b)=>b.score-a.score || b.entry.updatedAt-a.entry.updatedAt).slice(0,20)
    .map(v=>confirmedReference(v.entry));
}

export function updateSlang(state, payload, now) {
  if (!["save", "confirm", "disable", "enable", "delete"].includes(payload.action)) throw new Error("黑话操作无效");
  let entry = state.entries.find(v => v.id === payload.id);
  if (payload.action === "save") {
    if (!plain(payload.term, 40) || !plain(payload.meaning, 400) || !plain(payload.context, 160)) throw new Error("请填写黑话（40 字内）、释义（400 字内）和适用语境（160 字内），不含 HTML 或控制字符");
    if (payload.id && !entry) throw new Error("黑话条目已不存在，请刷新");
    const duplicate = state.entries.find(v => keyFor(v.term) === keyFor(payload.term.trim()) && v !== entry);
    if (duplicate) throw new Error("黑话已存在，请编辑已有条目");
    if (!entry) {
      if (state.entries.length >= MAX_ENTRIES) throw new Error("词库已达 500 条上限");
      entry = { id: crypto.randomUUID(), createdAt: now, sources: [] };
      state.entries.push(entry);
    }
    Object.assign(entry, { term: payload.term.trim(), meaning: payload.meaning.trim(), context: payload.context.trim(), confidence: 1, verified: true, status: "active", alternatives: [] });
  } else {
    if (!entry) throw new Error("黑话条目已不存在，请刷新");
    if (payload.action === "confirm") {
      if (!plain(entry.meaning,400) || !plain(entry.context,160)) throw new Error("请先研究或编辑释义与适用语境，再确认入库");
      Object.assign(entry, { verified: true, status: "active", alternatives: [] });
    } else if (payload.action === "delete") state.entries = state.entries.filter(v=>v !== entry);
    else entry.status = payload.action === "disable" ? "disabled" : entry.verified ? "active" : "pending";
  }
  entry.updatedAt = now;
}

export function updateSlangBatch(state,payload,now) {
  if (!Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > MAX_ENTRIES || new Set(payload.ids).size !== payload.ids.length || payload.ids.some(id=>typeof id !== "string" || !state.entries.some(v=>v.id === id))) throw new Error("请选择有效黑话条目，最多 500 条");
  if (!["confirm","disable","enable","delete"].includes(payload.action)) throw new Error("黑话批量操作无效");
  let updated = 0, skipped = 0;
  for (const id of payload.ids) {
    const entry = state.entries.find(v=>v.id === id);
    if (payload.action === "confirm" && (!entry.meaning || !entry.context || entry.status === "disabled")) {skipped++;continue;}
    updateSlang(state,{action:payload.action,id},now);updated++;
  }
  return {updated,skipped};
}

export function researchSources(result) {
  const seen = new Set();
  return (Array.isArray(result?.sources) ? result.sources : []).slice(0,20).flatMap(source=>{
    try {
      const url = new URL(source.url);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || source.url.length > 2000 || seen.has(url.href)) return [];
      seen.add(url.href);
      const clean = value => typeof value === "string" ? value.replace(/[<>\x00-\x1f\x7f]/g," ") : "";
      return [{url:url.href,title:clean(source.title).slice(0,200),snippet:clean(source.snippet).slice(0,1400)}];
    } catch {return [];}
  }).slice(0,6);
}

export function parseSlangResearch(text) {
  const value = json(text);
  if (!value || !optional(value.meaning,400) || !optional(value.context,160) || typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1
    || !Array.isArray(value.sourceUrls) || value.sourceUrls.length > 6 || value.sourceUrls.some(v=>typeof v !== "string" || v.length > 2000)) throw new Error("黑话研究结果无效");
  return {meaning:value.meaning?.trim() || "",context:value.context?.trim() || "",confidence:value.confidence,sourceUrls:[...new Set(value.sourceUrls)]};
}

export function applySlangResearch(entry,decision,sources,now) {
  const result = parseSlangResearch(JSON.stringify(decision));
  if (result.sourceUrls.some(url=>!sources.some(v=>v.url === url))) throw new Error("研究引用了检索结果之外的来源");
  if (!result.meaning || !result.context || !result.sourceUrls.length) throw new Error("没有足够依据解释该词，请补充语境或手动编辑");
  Object.assign(entry,{meaning:result.meaning,context:result.context,confidence:result.confidence,status:"pending",verified:false,updatedAt:now,
    research:{status:"done",at:now,sources:sources.filter(v=>result.sourceUrls.includes(v.url))}});
}

export async function searchSlang(search,request,signal,timeoutMs = 30000) {
  if (signal.aborted) throw new Error("任务已取消");
  const controller = new AbortController();
  let abort, timer;
  const interrupted = new Promise((_,reject)=>{
    abort = ()=>{controller.abort();reject(new Error("搜索已取消或超时"));};
    signal.addEventListener("abort",abort,{once:true});
    timer = setTimeout(abort,timeoutMs);
  });
  try {return await Promise.race([Promise.resolve().then(()=>search(request,controller.signal)),interrupted]);}
  finally {clearTimeout(timer);signal.removeEventListener("abort",abort);}
}

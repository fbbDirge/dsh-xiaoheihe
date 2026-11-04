import crypto from "node:crypto";

const INDEX = "https://aigengtu.com/gallery-index.json";
const MAX_IMAGE = 8 * 1024 * 1024;
const unsuitable = /性关系|性交|做爱|裸体|露点|乳头|色情|淫|骚货|烧货|你妈|操你|去死|杀了你|血腥/;
const clean = (value, max) => typeof value === "string" ? value.replace(/[\x00-\x1f<>]/g, " ").trim().slice(0, max) : "";

export function catalogEntries(data) {
  if (!data?.gallery || typeof data.gallery !== "object") throw new Error("配图目录无效");
  const entries = new Map();
  for (const category of Object.values(data.gallery).slice(0, 50)) {
    for (const item of (Array.isArray(category?.images) ? category.images : []).slice(0, 10000)) {
      const match = /^https:\/\/img\.aigengtu\.com\/meme\/(\d{1,8})\.(webp|png|jpe?g)$/.exec(item?.original);
      const title = clean(item?.alt || item?.name, 180), description = clean(item?.story?.zh, 500);
      if (!match || !title || unsuitable.test(title + description + clean(item?.name, 180))) continue;
      const id = match[1];
      entries.set(id, { id, title, description, category: clean(category.name, 40), url: item.original,
        sourceUrl: `https://aigengtu.com/zh/meme/${id}`, author: clean(item.story?.contributor, 80) });
    }
  }
  return [...entries.values()].slice(0, 10000);
}

function terms(text) {
  const result = new Set();
  for (const run of text.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]{2,}/gu) || []) {
    if (/^[a-z0-9]/.test(run)) result.add(run);
    else for (let i = 0; i < run.length - 1; i++) result.add(run.slice(i, i + 2));
  }
  return result;
}

export function imageCandidates(entries, title, text, excluded = []) {
  const query = terms((title + " " + text).slice(0, 12000)), used = new Set(excluded);
  const docs = entries.filter(e => !used.has(e.id)).map(entry => ({ entry, title: terms(entry.title), body: terms(entry.description) }));
  const df = new Map();
  for (const doc of docs) for (const term of new Set([...doc.title, ...doc.body])) if (query.has(term)) df.set(term, (df.get(term) || 0) + 1);
  return docs.map(doc => {
    let score = 0, matches = 0;
    for (const term of query) if (doc.title.has(term) || doc.body.has(term)) {
      matches++; score += Math.log(1 + docs.length / (df.get(term) || 1)) * (doc.title.has(term) ? 2 : 0.6);
    }
    return { ...doc, score, matches };
  }).filter(doc => doc.matches >= 2).sort((a, b) => b.score - a.score).slice(0, 20).map(doc => doc.entry);
}

export function parseImageDecision(text) {
  const value = JSON.parse(text.trim().replace(/^```json\s*\n([\s\S]*?)\n```$/, "$1"));
  if (value?.action === "skip") return { action: "skip" };
  if (value?.action !== "select" || typeof value.id !== "string" || !/^\d{1,8}$/.test(value.id) || typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 200 || /[<>\x00-\x1f]/.test(value.reason)) throw new Error("配图选择无效");
  return { action: "select", id: value.id, reason: value.reason.trim() };
}

// All public downloads are credential-free, bounded and refuse redirects.
export async function readPublic(url, { fetcher = fetch, signal, maxBytes }) {
  const response = await fetcher(url, { redirect: "error", signal, headers: { Accept: "*/*" } });
  if (!response.ok || Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel(); throw new Error("配图资源不可用");
  }
  const chunks = []; let total = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("配图资源为空");
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("配图资源过大"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function decodeImage(buffer) {
  const { default: sharp } = await import("sharp");
  const input = sharp(buffer, { limitInputPixels: 16000000, failOn: "warning" });
  const meta = await input.metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format) || (meta.pages || 1) !== 1) throw new Error("仅支持静态图片");
  const { data, info } = await input.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || data.length > MAX_IMAGE) throw new Error("图片尺寸或大小不合适");
  return { buffer: data, width: info.width, height: info.height };
}

export function cosAuthorization({ secretId, secretKey, pathname, host, signTime }) {
  const key = crypto.createHmac("sha1", secretKey).update(signTime).digest("hex");
  const canonical = `put\n${pathname}\n\nhost=${encodeURIComponent(host)}\n`;
  const hashed = crypto.createHash("sha1").update(canonical).digest("hex");
  const signature = crypto.createHmac("sha1", key).update(`sha1\n${signTime}\n${hashed}\n`).digest("hex");
  return `q-sign-algorithm=sha1&q-ak=${encodeURIComponent(secretId)}&q-sign-time=${signTime}&q-key-time=${signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

export function validPostImage(image) {
  try {
    const url = new URL(image.url);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && /^(?:[a-z0-9-]+\.)*(?:xiaoheihe\.cn|max-c\.com)$/.test(url.hostname)
      && Number.isInteger(image.width) && image.width > 0 && image.width <= 2048
      && Number.isInteger(image.height) && image.height > 0 && image.height <= 2048;
  } catch { return false; }
}

export async function uploadPostImage(image, { api, account, fetcher = fetch, signal, current = () => true }) {
  const check = () => { if (!current() || signal.aborted) throw new Error("配图任务已停止"); };
  const post = async (route, form) => { check(); const result = await api(account, `/bbs/app/api/qcloud/cos/upload/${route}/v2`, { web_version: "3.0" }, "POST", form); check(); return result.result; };
  const info = await post("info", { scope: "bbs", need_cache: "0", file_infos: JSON.stringify([{ name: "heybox-meme.png", mimetype: "image/png", fsize: image.buffer.length, width: image.width, height: image.height }]) });
  const key = info?.keys?.[0];
  if (!Array.isArray(info?.keys) || info.keys.length !== 1 || typeof key !== "string" || !/^\/[a-zA-Z0-9_/.-]+$/.test(key) || key.includes("..") || key.includes("//") || !/^[a-z0-9-]+-\d+$/.test(info.bucket) || !/^[a-z]{2}-[a-z]+(?:-\d+)?$/.test(info.region)) throw new Error("图片上传目标无效");
  const uploaded = { url: `https://${info.host}${key}`, width: image.width, height: image.height };
  if (!validPostImage(uploaded)) throw new Error("图片公开地址无效");
  const token = await post("token", { bucket: info.bucket, keys: JSON.stringify(info.keys), mimetypes: JSON.stringify(["image/png"]), is_multipart_upload: "0" });
  const credentials = token?.credentials;
  if (!credentials || ["tmpSecretId", "tmpSecretKey", "sessionToken"].some(k => typeof credentials[k] !== "string" || !credentials[k] || credentials[k].length > 8000) || !Number.isInteger(token.startTime) || !Number.isInteger(token.expiredTime) || token.expiredTime <= token.startTime) throw new Error("图片上传凭证无效");
  const host = `${info.bucket}.cos.${info.region}.myqcloud.com`;
  const authorization = cosAuthorization({ secretId: credentials.tmpSecretId, secretKey: credentials.tmpSecretKey, pathname: key, host, signTime: `${token.startTime};${token.expiredTime}` });
  check();
  const response = await fetcher(`https://${host}${key}`, { method: "PUT", redirect: "error", signal,
    headers: { Authorization: authorization, "Content-Type": "image/png", "x-cos-security-token": credentials.sessionToken }, body: new Uint8Array(image.buffer) });
  await response.body?.cancel();
  if (!response.ok) throw new Error("图片上传未完成");
  await post("callback", { keys: JSON.stringify(info.keys) });
  return uploaded;
}

export class PostImages {
  constructor(worker) { this.worker = worker; this.cache = null; }
  async prepare(job, account, current) {
    if (!job.imageEnabled || ["uploaded", "skipped", "failed"].includes(job.image?.status)) return;
    const w = this.worker;
    if (job.image?.status === "uploading") {
      job.image = { status: "failed", note: "上次图片上传中断，本次只发文字，避免重复上传" }; w.save(); return;
    }
    const controller = new AbortController(), abort = () => controller.abort();
    const parent = w.controller.signal; parent.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 120000);
    const check = () => { if (!current() || controller.signal.aborted) throw new Error("配图任务已停止"); };
    const fetcher = w.imageFetch || fetch;
    let phase = "图库目录加载";
    try {
      check(); job.image = { status: "selecting", note: "正在按正文挑选配图" }; w.save();
      if (!this.cache || w.now() - this.cache.at > 6 * 3600000) {
        const raw = await readPublic(INDEX, { fetcher, signal: controller.signal, maxBytes: 5 * 1024 * 1024 });
        this.cache = { at: w.now(), entries: catalogEntries(JSON.parse(raw.toString("utf8"))) };
      }
      check();
      const recent = (w.accountState(account).posting?.jobs || []).filter(j => j !== job && j.image?.status === "uploaded" && ["accepted", "verified", "uncertain"].includes(j.status)).slice(-30).map(j => j.image.id);
      const candidates = imageCandidates(this.cache.entries, job.title, job.text, recent);
      if (!candidates.length) { job.image = { status: "skipped", note: "没有找到贴合正文的图片，本次只发文字" }; w.save(); return; }
      const input = { kind: "post-image", title: job.title, text: job.text, candidates: candidates.map(({ id, title, description, category }) => ({ id, title, description, category })) };
      phase = "AI 选图";
      const choice = parseImageDecision(JSON.stringify(await w.generate(input, { ...w.data.config, postingPersona: job.persona }, { signal: controller.signal, directory: w.directory })));
      check();
      if (choice.action === "skip") { job.image = { status: "skipped", note: "AI 判断候选图片不够贴切，本次只发文字" }; w.save(); return; }
      const selected = candidates.find(e => e.id === choice.id);
      if (!selected) throw new Error("图片不在候选目录中");
      phase = "图片下载";
      const raw = await readPublic(selected.url, { fetcher, signal: controller.signal, maxBytes: MAX_IMAGE });
      phase = "图片处理";
      const image = await decodeImage(raw); check();
      // Save intent before upload. A restart never blindly repeats an unfinished upload.
      job.image = { status: "uploading", id: selected.id, title: selected.title, sourceUrl: selected.sourceUrl, author: selected.author, reason: choice.reason }; w.save();
      phase = "图片上传";
      const uploaded = await uploadPostImage(image, { api: w.api, account, fetcher, signal: controller.signal, current }); check();
      Object.assign(job.image, uploaded, { status: "uploaded", note: "已匹配并上传 1 张图片" }); w.save();
    } catch (error) {
      if (error.persistence) throw error;
      if (!current() || parent.aborted) throw error;
      job.image = { status: "failed", note: `${phase}未完成，本次只发文字` }; w.save();
    } finally { clearTimeout(timer); parent.removeEventListener("abort", abort); }
  }
}

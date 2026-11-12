/**
 * Host-half unit tests: URL/host allowlist, cookie rules, signature.
 * Run: node tests/rewrite.test.mjs
 */
import assert from "node:assert/strict";
import {
  requestHeybox,
  safeUrl,
  isAllowedHost,
  heyboxIdFromCookie,
  validateCookie,
  ov,
  generateSignature,
  generateCommentRnd16,
} from "../lib/index.js";

// --- safeUrl ---------------------------------------------------------------
assert.equal(safeUrl("https://api.xiaoheihe.cn/").href, "https://api.xiaoheihe.cn/");
assert.equal(safeUrl(" http://www.xiaoheihe.cn/x ").href, "http://www.xiaoheihe.cn/x");
assert.equal(safeUrl("ftp://xiaoheihe.cn/"), null);
assert.equal(safeUrl("javascript:alert(1)"), null);
assert.equal(safeUrl(""), null);
assert.equal(safeUrl("xiaoheihe.cn"), null); // 无协议

// --- isAllowedHost ----------------------------------------------------------
for (const ok of [
  "https://xiaoheihe.cn/",
  "https://www.xiaoheihe.cn/community",
  "https://api.xiaoheihe.cn/bbs/app/feeds",
  "https://img.xiaoheihe.cn/x.png",
  "https://static.max-c.com/static/x.js", // 小黑盒 CDN
  "https://imgheybox.max-c.com/x.png",
  "https://cdn.max-c.com/x",
]) {
  assert.equal(isAllowedHost(ok), true, "should allow " + ok);
}
for (const bad of [
  "https://xiaoheihe.cn.evil.com/x", // 后缀欺骗
  "https://evilxiaoheihe.cn/x",
  "https://static.max-c.com.evil.com/x",
  "https://evilmax-c.com/x",
  "http://localhost/x",
  "https://raw.githubusercontent.com/x", // 开发期源码域已移除
  "https://api.github.com/x",
  "ftp://xiaoheihe.cn/x",
  "https://user:pass@xiaoheihe.cn/x", // 带凭据
]) {
  assert.equal(isAllowedHost(bad), false, "should refuse " + bad);
}

// --- cookie -----------------------------------------------------------------
assert.equal(heyboxIdFromCookie("a=1; heybox_id=123456; b=2"), "123456");
assert.equal(heyboxIdFromCookie("nothing=here"), null);
assert.equal(validateCookie("x_xhh_tokenid=abc"), true);
assert.equal(validateCookie("user_pkey=abc"), true);
assert.equal(validateCookie("heybox_id=42; x=1"), true);
assert.equal(validateCookie("foo=bar"), false);
assert.equal(validateCookie(""), false);

// --- signature ----------------------------------------------------------------
// ov() 对相同入参必须确定。
assert.equal(ov("/bbs/app/feeds", 1700000000, "ABCDEF0123456789ABCDEF0123456789"), ov("/bbs/app/feeds", 1700000000, "ABCDEF0123456789ABCDEF0123456789"));
// 规范化路径(首尾斜杠)。
assert.equal(ov("bbs/app/feeds", 1700000000, "N"), ov("/bbs/app/feeds/", 1700000000, "N"));
const sig = generateSignature("/bbs/app/link/tree");
assert.ok(/^[A-Z0-9]{1,5}\d{2}$/.test(sig.hkey), "hkey shape: " + sig.hkey);
assert.equal(String(sig._time).length, 10, "_time is unix seconds");
assert.ok(/^[0-9A-F]{32}$/.test(sig.nonce), "nonce 32 upper hex");
// 同一路径连续生成签名结构一致
for (let i = 0; i < 20; i++) {
  const s2 = generateSignature("/bbs/app/feeds");
  assert.ok(/^[A-Z0-9]{1,5}\d{2}$/.test(s2.hkey));
}

console.log("host helpers test passed ✔");


// HTTP errors may be HTML; classification must not depend on JSON parsing.
const originalFetch = globalThis.fetch;
try {
  for (const [status, body, kind] of [
    [401, "Unauthorized", "authentication"],
    [429, "Too many requests", "rate_limit"],
    [200, JSON.stringify({status:"show_captcha"}), "captcha"],
    [200, JSON.stringify({status:"relogin"}), "authentication"],
  ]) {
    globalThis.fetch = async () => new Response(body, {status});
    await assert.rejects(requestHeybox({cookie:"test-only",deviceId:"test"}, "/bbs/app/user/message"), (error) => error.kind === kind);
  }
} finally { globalThis.fetch = originalFetch; }

// Exercise the actual request builder with an offline fetch stub for both write modes.
const { createDecipheriv, webcrypto } = await import("node:crypto");
const { platformText } = await import("../lib/platform-error.js");
const rnd16Key = Buffer.from("HFFSTsqmvG3uGxPNXDQW+1VARfqgG4nT6LS1PX7F8NQ=", "base64"); // gitleaks:allow -- public web protocol constant
function decodeRnd16(value) {
  assert.match(value, /^16:[A-Za-z0-9_-]+$/);
  const bytes = Buffer.from(value.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", rnd16Key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from("heybox-rnd:v16"));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
}
// Fixed-IV comparison with the official client's Web Crypto construction.
const fixturePath = "/bbs/app/comment/create";
const fixtureTime = 1794447614;
const fixtureNonce = "9F472703E6B1736ABB1751F006F79AEA";
const fixtureIv = Uint8Array.from({length:12}, (_, i) => i);
const webKey = await webcrypto.subtle.importKey("raw", rnd16Key, {name:"AES-GCM"}, false, ["encrypt"]);
const webCiphertext = await webcrypto.subtle.encrypt({
  name:"AES-GCM", iv:fixtureIv, additionalData:Buffer.from("heybox-rnd:v16"), tagLength:128,
}, webKey, Buffer.from(JSON.stringify([String(fixtureTime), fixtureNonce, fixturePath + "/"])));
const expectedRnd = "16:" + Buffer.concat([fixtureIv, Buffer.from(webCiphertext)]).toString("base64url");
assert.equal(generateCommentRnd16(fixturePath, fixtureTime, fixtureNonce, fixtureIv), expectedRnd);
assert.equal(generateCommentRnd16(fixturePath + "/", fixtureTime, fixtureNonce, fixtureIv), expectedRnd);
assert.deepEqual(decodeRnd16(expectedRnd), [String(fixtureTime), fixtureNonce, fixturePath + "/"]);
assert.notEqual(generateCommentRnd16(fixturePath, fixtureTime, fixtureNonce), generateCommentRnd16(fixturePath, fixtureTime, fixtureNonce));
for (const invalid of ["-1", "01", "1.5", "NaN", "9007199254740992"]) {
  assert.throws(() => generateCommentRnd16(fixturePath, invalid, fixtureNonce), /parameters/);
}
for (const invalid of ["", fixtureNonce.toLowerCase(), "not-a-nonce"]) {
  assert.throws(() => generateCommentRnd16(fixturePath, fixtureTime, invalid), /parameters/);
}
for (const invalid of ["relative", "/path?query=1", "/path#fragment", "/bad path", "/bad\\path"]) {
  assert.throws(() => generateCommentRnd16(invalid, fixtureTime, fixtureNonce), /parameters/);
}
assert.throws(() => generateCommentRnd16(fixturePath, fixtureTime, fixtureNonce, new Uint8Array(11)), /IV/);
const writeCalls = [];
try {
  globalThis.fetch = async (url, options) => {
    writeCalls.push({url:new URL(url),options});
    return new Response(JSON.stringify({status:"ok",commentid:12345,result:{}}), {status:200});
  };
  const state = {cookie:"heybox_id=42; user_pkey=fixture-private-cookie",heyboxId:"42",deviceId:"fixture-device"};
  for (const ids of [{reply_id:"-1",root_id:"-1"},{reply_id:"1002",root_id:"1001"}]) {
    const form = {is_cy:"0",link_id:"1000",...ids,text:'<a data-user-id="8">@示例</a> & + %\n第二行'};
    const result = await requestHeybox(state,"/bbs/app/comment/create",{heybox_id:"must-not-leak",_rnd:"must-not-override"},"POST",form);
    assert.equal(result.commentid,12345);
    const {url,options} = writeCalls.at(-1);
    assert.equal(url.origin,"https://api.xiaoheihe.cn");
    assert.equal(url.pathname,"/bbs/app/comment/create");
    const {hkey,_time,nonce,_rnd,...base} = Object.fromEntries(url.searchParams);
    assert.deepEqual(base, {app:"heybox",heybox_id:"42",os_type:"web",x_app:"heybox_website",x_client_type:"web",x_os_type:"Windows",x_client_version:"",client_type:"web",web_version:"3.0",version:"999.0.4"});
    assert.equal(hkey,ov(url.pathname,Number(_time),nonce));
    assert.match(nonce,/^[A-F0-9]{32}$/);
    assert.ok(Math.abs(Number(_time)-Math.floor(Date.now()/1000))<5);
    assert.deepEqual(decodeRnd16(_rnd), [_time, nonce, url.pathname + "/"]);
    assert.equal(options.method,"POST");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers.Cookie,state.cookie);
    assert.equal(options.headers["Content-Type"],"application/x-www-form-urlencoded;charset=utf-8");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)),form);
  }
  assert.notEqual(writeCalls[0].url.searchParams.get("nonce"),writeCalls[1].url.searchParams.get("nonce"));
  assert.notEqual(writeCalls[0].url.searchParams.get("_rnd"),writeCalls[1].url.searchParams.get("_rnd"));
  await requestHeybox(state,"/bbs/app/feeds",{offset:"20"});
  const readParams=writeCalls.at(-1).url.searchParams;
  assert.equal(readParams.get("web_version"),"2.5");
  assert.equal(readParams.get("heybox_id"),"42");
  assert.equal(readParams.get("device_id"),state.deviceId);
  assert.equal(readParams.get("offset"),"20");
  assert.equal(readParams.has("_rnd"),false);
  const postForm = { title: "图文标题", text: JSON.stringify([{ type: "text", text: "正文 & + %\n第二行" }]), topic_ids: "7214", draft: "0" };
  await requestHeybox(state,"/bbs/app/api/link/post",{web_version:"3.0"},"POST",postForm);
  const postCall = writeCalls.at(-1);
  assert.equal(postCall.url.pathname,"/bbs/app/api/link/post");
  assert.equal(postCall.url.searchParams.get("web_version"),"3.0");
  assert.equal(postCall.url.searchParams.get("hkey"),ov(postCall.url.pathname,Number(postCall.url.searchParams.get("_time")),postCall.url.searchParams.get("nonce")));
  assert.deepEqual(Object.fromEntries(new URLSearchParams(postCall.options.body)),postForm);

  globalThis.fetch=async()=>new Response(JSON.stringify({status:"failed",msg:"缺失参数",result:{}}),{status:200});
  await assert.rejects(requestHeybox(state,"/bbs/app/comment/create",{},"POST",{}),(error)=>{
    assert.equal(error.definitive,true);assert.equal(error.httpStatus,200);
    assert.equal(error.platformStatus,"failed");assert.equal(error.platformMessage,"缺失参数");
    assert.match(error.message,/缺失参数/);return true;
  });
  globalThis.fetch=async()=>new Response(JSON.stringify({status:"failed",msg:'fixture-private-cookie\nAuthorization: Bearer fixture-auth'}),{status:200});
  await assert.rejects(requestHeybox(state,"/bbs/app/comment/create",{},"POST",{}),(error)=>{
    assert.ok(!JSON.stringify(error).includes("fixture-private-cookie"));
    assert.ok(!error.message.includes("fixture-auth"));return true;
  });
  let attempts=0;
  globalThis.fetch=async()=>{attempts++;throw new Error("timeout");};
  await assert.rejects(requestHeybox(state,"/bbs/app/comment/create",{},"POST",{}),/timeout/);
  assert.equal(attempts,1);
} finally { globalThis.fetch=originalFetch; }
assert.equal(platformText("缺失参数\n请检查"),"缺失参数 请检查");
assert.equal(platformText("x".repeat(1000)).length,300);
assert.ok(!platformText("api_key=fixture-key; user_pkey=fixture-pkey").includes("fixture-"));
console.log("comment/reply web signing, platform diagnostics and no-retry tests passed");

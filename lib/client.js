/** DSH settings section and optional conversation view, following dsh-bili-scroll. */
window.__ModuleLoader__.load({
  id: "heybox",
  factory: (require) => {
    const React = require("react");
    const { useState, useEffect, useRef } = React;
    const h = React.createElement;
    const CSS = `
.hx-page{--hx-line:rgba(127,127,127,.2);--hx-fill:rgba(127,127,127,.055);--hx-muted:var(--dsw-alias-label-secondary,inherit);--hx-accent:#2678d5;display:flex;flex-direction:column;gap:22px;width:100%;max-width:820px;min-width:0;box-sizing:border-box;color:var(--dsw-alias-label-primary,inherit);font:inherit;padding:8px 4px 24px;line-height:1.6}
.hx-page *{box-sizing:border-box}.hx-page [hidden]{display:none!important}.hx-page h2,.hx-page h3,.hx-page p{margin:0}.hx-page h2{font-size:22px;font-weight:650;letter-spacing:-.5px}.hx-page h3{font-size:15px;font-weight:600}.hx-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.hx-kicker{font-size:11px;font-weight:650;letter-spacing:1.6px;opacity:.5;margin-bottom:4px}.hx-note{font-size:12px;line-height:1.8;color:var(--hx-muted);opacity:.75}.hx-badge{display:inline-flex;align-items:center;gap:7px;flex:none;border:1px solid var(--hx-line);border-radius:99px;padding:5px 10px;font-size:12px;white-space:nowrap}.hx-badge:before{content:"";width:6px;height:6px;border-radius:50%;background:#9298a0}.hx-badge[data-active=true]:before{background:#27a583}
.hx-tabs{display:flex;gap:4px;padding:5px;border:1px solid var(--hx-line);border-radius:12px;background:var(--hx-fill);overflow-x:auto}.hx-tab{appearance:none;flex:1 0 auto;min-width:58px;white-space:nowrap;border:1px solid transparent;border-radius:8px;padding:8px 12px;font:inherit;font-size:13px;color:inherit;background:transparent;cursor:pointer;opacity:.65}.hx-tab[aria-selected=true]{background:var(--dsw-alias-background-primary,rgba(127,127,127,.13));border-color:var(--hx-line);box-shadow:0 1px 3px #0000000a;opacity:1;font-weight:600}.hx-form{display:flex;flex-direction:column;gap:20px;min-width:0}.hx-panel{display:flex;flex-direction:column;gap:20px;min-width:0}.hx-section{display:flex;flex-direction:column;gap:16px;padding:20px;border:1px solid var(--hx-line);border-radius:14px}.hx-section-head{display:flex;flex-direction:column;gap:4px}.hx-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.hx-grow{flex:1;min-width:140px}.hx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.hx-field{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:13px}.hx-input,.hx-button{appearance:none;font:inherit;font-size:13px;color:inherit;border:1px solid var(--hx-line);border-radius:8px;background:transparent;padding:9px 12px;line-height:1.6}.hx-input{display:block;width:100%;min-width:0;background:var(--hx-fill)}.hx-page textarea{resize:vertical}.hx-button{cursor:pointer;min-height:38px;font-weight:500;transition:transform 140ms cubic-bezier(.23,1,.32,1)}.hx-primary{background:var(--hx-accent);color:#fff;border-color:var(--hx-accent)}.hx-button:disabled,.hx-input:disabled{opacity:.45;cursor:default}.hx-page :focus-visible{outline:2px solid var(--hx-accent);outline-offset:3px}.hx-button:active:not(:disabled),.hx-tab:active{transform:scale(.97)}
.hx-toggle{display:flex;align-items:center;justify-content:space-between;gap:20px;position:relative;cursor:pointer;font-size:13px;line-height:1.7;min-height:28px}.hx-toggle-copy{display:flex;flex-direction:column;gap:3px}.hx-toggle input{appearance:none!important;position:absolute!important;right:0!important;width:40px!important;height:24px!important;margin:0!important;opacity:0;cursor:pointer}.hx-switch{display:block;flex:none;width:40px;height:24px;border:1px solid var(--hx-line);border-radius:99px;background:rgba(127,127,127,.2);pointer-events:none}.hx-switch:after{content:"";display:block;width:18px;height:18px;margin:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002}.hx-toggle input:checked+.hx-switch{background:var(--hx-accent);border-color:var(--hx-accent)}.hx-toggle input:checked+.hx-switch:after{transform:translateX(16px)}.hx-toggle input:focus-visible+.hx-switch{outline:2px solid var(--hx-accent);outline-offset:3px}.hx-toggle:has(input:disabled){opacity:.5;cursor:default}.hx-divider{border:0;border-top:1px solid var(--hx-line);margin:0}.hx-message{font-size:13px;line-height:1.7;padding:11px 14px;border-radius:9px;background:var(--hx-fill);overflow-wrap:anywhere}.hx-error{color:var(--dsw-alias-status-error,#c54c3b)}.hx-footer{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--hx-line);padding-top:18px}.hx-save-state{font-size:12px;margin-left:auto;opacity:.6}.hx-save-state[data-dirty=true]{color:var(--hx-accent);opacity:1}.hx-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.hx-stat{padding:16px;border:1px solid var(--hx-line);border-radius:12px;background:linear-gradient(140deg,var(--hx-fill),transparent)}.hx-stat strong{display:block;font-size:24px;font-weight:600;line-height:1.4;font-variant-numeric:tabular-nums;letter-spacing:-.7px}.hx-stat small{font-size:12px;font-weight:400;letter-spacing:0;opacity:.5}.hx-stat .hx-stat-time{font-size:13px;letter-spacing:0;margin-top:8px;line-height:1.8}.hx-history{list-style:none;padding:0;margin:0;display:flex;flex-direction:column}.hx-history li{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid var(--hx-line);overflow-wrap:anywhere}.hx-history li:last-child{border-bottom:0}.hx-history-copy{flex:1;min-width:0}.hx-history-title{font-size:14px;font-weight:500;line-height:1.7}.hx-history .hx-note{margin-top:4px}.hx-history-index{font-size:12px;opacity:.35;min-width:22px;padding-top:3px;font-variant-numeric:tabular-nums}.hx-page a{color:inherit;text-underline-offset:3px}.hx-history-title a{text-decoration:none}.hx-empty{padding:30px 16px;text-align:center;border:1px dashed var(--hx-line);border-radius:12px}.hx-empty p{margin-top:6px}.hx-page summary{cursor:pointer;font-size:13px}.hx-details{display:flex;flex-direction:column;gap:14px;padding-top:14px}.hx-account{display:flex;align-items:center;gap:12px}.hx-account-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--hx-fill);border:1px solid var(--hx-line);font-size:18px;font-weight:600}.hx-wide{max-width:920px;margin:0 auto;padding:28px clamp(18px,4vw,40px) 40px}.hx-watch-heading{display:flex;align-items:baseline;gap:10px}.hx-count{font-size:12px;opacity:.5}
.hx-selection-list{max-height:320px;overflow-y:auto;align-content:flex-start;padding:4px}.hx-selection{max-width:100%;overflow-wrap:anywhere;text-align:left}.hx-comment-body{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px!important;font-size:14px;line-height:1.85}.hx-quote{margin:12px 0 0;padding:8px 12px;border-left:2px solid var(--hx-line);background:var(--hx-fill);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--hx-muted)}.hx-install-log{margin:0;padding:14px;background:var(--hx-fill);border:1px solid var(--hx-line);border-radius:9px;font-size:12px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
.hx-post-body{display:flex;flex-direction:column;gap:12px;margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}.hx-post-body h3{font-size:20px}.hx-post-body h4{font-size:17px;margin:0}.hx-post-body strong{font-weight:700}.hx-post-body ul,.hx-post-body ol{margin:0;padding-left:26px;list-style-position:outside}.hx-post-body ul{list-style-type:disc}.hx-post-body ol{list-style-type:decimal}.hx-history .hx-post-body li{display:list-item;padding:2px 0;border:0}.hx-post-body blockquote{margin:0;padding:8px 14px;border-left:3px solid var(--hx-line);background:var(--hx-fill)}
@media(hover:hover) and (pointer:fine){.hx-button:hover:not(:disabled),.hx-tab:hover:not([aria-selected=true]){background:var(--hx-fill)}.hx-primary:hover:not(:disabled){background:#206bc0}.hx-history-title a:hover{text-decoration:underline}}
@media(max-width:520px){.hx-page{gap:18px}.hx-section{padding:16px}.hx-grid{grid-template-columns:1fr;gap:16px}.hx-tabs{gap:0;padding:4px}.hx-tab{padding:8px;min-width:46px}.hx-stats{gap:8px}.hx-stat{padding:12px 10px}.hx-stat strong{font-size:21px}.hx-stat .hx-stat-time{font-size:12px}.hx-save-state{width:100%;margin-left:0}.hx-footer .hx-button{flex-grow:1}.hx-header{align-items:flex-start}.hx-badge{margin-top:5px}.hx-wide{padding:22px 18px}}
@media(prefers-reduced-motion:reduce){.hx-button{transition:none}.hx-button:active:not(:disabled),.hx-tab:active{transform:none}}
`;
    async function api(path, body, signal) {
      const response = await fetch("/heybox/" + path, {
        credentials: "same-origin", signal,
        ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await response.json(); } catch { throw new Error("宿主返回无效响应（HTTP " + response.status + "）"); }
      if (!response.ok || !data.ok) throw new Error(data.error || data.msg || "HTTP " + response.status);
      return data;
    }
    function editable(config) {
      return { ...config, apiKey: "", holidays: config.holidays.join(", "), workdays: config.workdays.join(", ") };
    }
    function configFrom(draft) {
      const config = { ...draft };
      for (const key of ["holidays", "workdays"]) config[key] = draft[key].split(/[,，\s]+/).filter(Boolean);
      if (!config.apiKey) delete config.apiKey;
      return config;
    }
    function time(value, zone) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false, ...(zone ? { timeZone: zone } : {}) }) : "—"; }
    function postPreview(job) {
      if (job.format !== "rich" || !Array.isArray(job.bodyBlocks)) return h("p", { style: { whiteSpace: "pre-wrap" } }, job.text);
      const parts = values => values.map((part, i) => part.bold ? h("strong", { key: i }, part.text) : part.text);
      return h("div", { className: "hx-post-body", "aria-label": "正文排版预览" }, ...job.bodyBlocks.map((block, i) => {
        if (["ul", "ol"].includes(block.type)) return h(block.type, { key: i, ...(block.type === "ol" ? { start: block.start } : {}) }, ...block.items.map((item, j) => h("li", { key: j }, ...parts(item))));
        const tag = ({ p: "p", h1: "h3", h2: "h4", blockquote: "blockquote" })[block.type] || "p";
        return h(tag, { key: i }, ...parts(block.parts));
      }));
    }
    function postLink(record) {
      return /^\d+$/.test(String(record.postId))
        ? h("a", { href: "https://www.xiaoheihe.cn/app/bbs/link/" + record.postId, target: "_blank", rel: "noopener noreferrer" }, record.title || "帖子 " + record.postId)
        : record.title || null;
    }
    const typeNames = { browse: "浏览", start: "开始", done: "完成", error: "失败", sent: "已发送", accepted: "已受理", unknown: "结果未知", rejected: "已拒绝", skip: "跳过" };
    function historyList(records, watched = false) {
      return records.length ? h("ul", { className: "hx-history" }, ...records.map((record, i) => h("li", { key: record.at + ":" + i },
        watched && h("span", { className: "hx-history-index", "aria-hidden": true }, String(i + 1).padStart(2, "0")),
        h("div", { className: "hx-history-copy" }, h("div", { className: "hx-history-title" }, watched ? postLink(record) || "帖子标题暂缺" : record.message),
          !watched && record.postId && h("div", { className: "hx-note" }, postLink(record)),
          h("div", { className: "hx-note" }, time(record.at), " · ", typeNames[record.type] || record.type)))))
        : h("div", { className: "hx-empty" }, h("h3", null, watched ? "还没有浏览记录" : "暂无运行记录"), h("p", { className: "hx-note" }, "开启任务后，最近的记录会显示在这里。"));
    }
    function Toggle({ label, note, value, onChange, disabled }) {
      return h("label", { className: "hx-toggle" }, h("span", { className: "hx-toggle-copy" }, h("span", null, label), note && h("span", { className: "hx-note" }, note)),
        h("input", { type: "checkbox", "aria-label": label, checked: value, disabled, onChange: (e) => onChange(e.target.checked) }), h("span", { className: "hx-switch", "aria-hidden": true }));
    }
    function interactionList(records, filter) {
      const selected = records.filter((record) => filter === "all" || record.kind === filter);
      const names = { sent: "已发送", accepted: "已受理，未返回评论 ID", unknown: "结果未知，请勿重复发送", rejected: "已拒绝", exhausted:"已达尝试上限，停止自动回复", limited:"本帖回复已达上限，停止自动回复" };
      return selected.length ? h("ul", { className: "hx-history" }, ...selected.map((record, i) => h("li", { key: record.at + ":" + i },
        h("div", { className: "hx-history-copy" },
          h("div", { className: "hx-row" }, h("span", { className: "hx-note" }, record.kind === "reply" ? (record.ownPost ? "回复自己帖子的评论" : "回复评论") : "评论帖子"), h("span", { className: "hx-note" }, names[record.status] || record.status)),
          h("div", { className: "hx-history-title" }, postLink(record)),
          record.personaSource && h("p", { className: "hx-note" }, "人格来源：" + (record.personaSource === "posting" ? "发帖人格" : "回复人格（留空沿用通用）")),
          record.incoming && h("blockquote", { className: "hx-quote" }, "对方：", record.incoming),
          h("p", { className: "hx-comment-body" }, record.displayText || record.text || (["exhausted","limited"].includes(record.status) ? "已停止处理这条来信，未发送回复。" : "旧版记录未保存正文，升级后产生的内容会显示在这里。")),
          record.status === "exhausted" && h("p", {className:"hx-note"}, "来信 ID " + record.replyId + " · 已尝试 " + record.attempts + " 次 · 上限 " + record.retryLimit + " 次"),
          record.error && h("p", {className:"hx-note"}, "最近原因：" + record.error),
          (record.platformStatus || record.platformMessage || record.httpStatus) && h("p", { className: "hx-note" }, "平台响应：", [record.platformStatus, record.platformMessage, record.httpStatus ? "HTTP " + record.httpStatus : ""].filter(Boolean).join(" · ")),
          h("p", { className: "hx-note" }, time(record.at), record.commentId ? " · 评论 ID " + record.commentId : "")))))
        : h("div", { className: "hx-empty" }, h("h3", null, "暂无评论记录"), h("p", { className: "hx-note" }, "自动评论或回复发起后，可在这里查看正文与发送状态。"));
    }
    function replyQueueList(records) {
      return records.length ? h("ul", { className: "hx-history" }, ...records.slice(0, 50).map((record) => h("li", { key: record.replyId },
        h("div", { className: "hx-history-copy" },
          h("div", { className: "hx-row" }, postLink(record), h("span", { className: "hx-note" }, record.state === "uncertain" ? "待确认，不自动重发" : "等待下轮处理")),
          h("p", { className: "hx-note" }, "来信 ID ", record.replyId, " · 已尝试 ", record.attempts, record.maxAttempts ? " / " + record.maxAttempts : "", " 次 · 入队 ", time(record.at)),
          record.error && h("p", { className: "hx-note" }, "最近原因：", record.error)))))
        : h("p", { className: "hx-note" }, "当前没有待处理来信。");
    }
    function Field({ label, note, children }) {
      return h("label", { className: "hx-field" }, label, children, note && h("span", { className: "hx-note" }, note));
    }
    function QrLoginPanel({ onAuthenticated }) {
      const [qr, setQr] = useState(null);
      const [pending, setPending] = useState(false);
      const [error, setError] = useState("");
      const current = useRef(null);
      const active = useRef(false);
      const busy = useRef(false);
      const request = useRef(null);
      const revision = useRef(0);
      useEffect(() => {
        active.current = true;
        const timer = setInterval(async () => {
          const session = current.current;
          if (!session || !["waiting", "scanned"].includes(session.status) || busy.current) return;
          if (Date.now() >= session.expiresAt) {
            current.current = { ...session, status: "expired", image: null }; setQr(current.current); return;
          }
          busy.current = true;
          const token = revision.current;
          const controller = new AbortController(); request.current = controller;
          try {
            const next = await api("login", { action: "poll", sessionId: session.sessionId }, controller.signal);
            if (!active.current || revision.current !== token) return;
            current.current = next; setQr(next); setError("");
            if (next.status === "authenticated") {
              const account = await api("state", null, controller.signal);
              if (active.current && revision.current === token) onAuthenticated(account);
            }
          } catch (e) { if (active.current && token === revision.current && e.name !== "AbortError") setError(e.message); }
          finally { if (token === revision.current) busy.current = false; }
        }, 1500);
        return () => { active.current = false; revision.current++; clearInterval(timer); request.current?.abort(); };
      }, []);
      async function start() {
        if (pending) return;
        request.current?.abort();
        busy.current = true; setPending(true); setError("");
        const token = ++revision.current;
        const controller = new AbortController(); request.current = controller;
        try {
          const next = await api("login", { action: "start" }, controller.signal);
          if (active.current && revision.current === token) { current.current = next; setQr(next); }
        } catch (e) { if (active.current && token === revision.current && e.name !== "AbortError") setError(e.message); }
        finally { if (active.current && token === revision.current) { busy.current = false; setPending(false); } }
      }
      function cancel() {
        revision.current++; request.current?.abort(); busy.current = false; setPending(false);
        const session = current.current;
        current.current = null; setQr(null); setError("");
        if (session) api("login", { action: "cancel", sessionId: session.sessionId }).catch(() => {});
      }
      const messages = { waiting: "请使用小黑盒 App 扫码", scanned: "已扫码，请在手机上确认登录", authenticated: "扫码登录成功", expired: "二维码已过期，请刷新", requires_2fa: "账号需要额外验证，请在官网完成验证后使用 Cookie 备用登录" };
      return h("div", { className: "hx-details" },
        h("div", { className: "hx-row" }, h("button", { className: "hx-button", type: "button", disabled: pending, onClick: start }, pending ? "正在获取二维码…" : qr ? "刷新二维码" : "扫码登录"),
          qr && h("button", { className: "hx-button", type: "button", onClick: cancel }, "取消扫码")),
        error && h("div", { className: "hx-message hx-error", role: "alert" }, error),
        qr?.image && h("img", { src: qr.image, alt: "小黑盒 App 登录二维码", width: 256, height: 256, style: { maxWidth: "100%", height: "auto", alignSelf: "flex-start", borderRadius: 8 } }),
        qr && h("p", { className: "hx-note", role: "status" }, messages[qr.status] || "正在获取登录状态…"),
        h("p", { className: "hx-note" }, "使用小黑盒 App 扫码并确认，登录凭据由 DSH 宿主保存。二维码过期后可刷新。"));
    }
    function Panel() {
      const [status, setStatus] = useState(null);
      const [auth, setAuth] = useState(null);
      const [draft, setDraft] = useState(null);
      const [cookie, setCookie] = useState("");
      const [pending, setPending] = useState("");
      const [message, setMessage] = useState("");
      const [error, setError] = useState("");
      const [pollError, setPollError] = useState("");
      const [dirty, setDirty] = useState(false);
      const [tab, setTab] = useState("overview");
      const [slangQuery, setSlangQuery] = useState("");
      const [slangFilter, setSlangFilter] = useState("pending");
      const [slangSelected, setSlangSelected] = useState({accountId:null,ids:[]});
      const [slangPage, setSlangPage] = useState(1);
      const [slangPageSize, setSlangPageSize] = useState(50);
      const [slangDraft, setSlangDraft] = useState({ term:"", meaning:"", context:"", accountId:null });
      const [recordFilter, setRecordFilter] = useState("all");
      const [dependencies, setDependencies] = useState(null);
      const [dependencyError, setDependencyError] = useState("");
      const [configJson, setConfigJson] = useState(null);
      const [selectionQuery, setSelectionQuery] = useState("");
      const [selectionResults, setSelectionResults] = useState(null);
      const tabRefs = useRef({});
      const draftRef = useRef(null);
      const active = useRef(false);
      const action = useRef(false);
      const manualPostRequest = useRef(null);
      const requests = useRef(new Set());
      const polling = useRef(false);
      function replaceDraft(value) { draftRef.current = value; setDraft(value); }
      function change(key, value) { replaceDraft({ ...draftRef.current, [key]: value }); setDirty(true); setMessage(""); setError(""); }
      function schedulePreset(preset) {
        const windows = preset === "valley" ? [[720, 840], [1080, 540]] : [[0, 360]];
        replaceDraft({ ...draftRef.current, valleyOnly: preset !== "all", ...(preset === "all" ? {} : {
          valleyWindows: windows, weekendWindows: preset === "valley" ? [[0, 1440]] : windows,
          holidayWindows: preset === "valley" ? [[0, 1440]] : windows,
        }) });
        setDirty(true); setMessage(""); setError("");
      }
      useEffect(() => {
        active.current = true;
        async function refresh() {
          if (action.current || polling.current) return;
          polling.current = true;
          const controller = new AbortController();
          requests.current.add(controller);
          try {
            const [nextStatus, nextAuth, nextDependencies] = await Promise.all([
              api("automation", null, controller.signal), api("state", null, controller.signal),
              api("dependencies", null, controller.signal).then((value) => ({ value }), (error) => ({ error })),
            ]);
            if (!active.current || action.current) return;
            setStatus(nextStatus); setAuth(nextAuth); setPollError("");
            if (nextDependencies.value) { setDependencies(nextDependencies.value); setDependencyError(""); }
            else if (nextDependencies.error.name !== "AbortError") setDependencyError(nextDependencies.error.message);
            // Polling updates runtime status without replacing an unsaved form.
            if (!draftRef.current) replaceDraft(editable(nextStatus.config));
          } catch (e) { if (active.current && e.name !== "AbortError") setPollError(e.message); }
          finally { requests.current.delete(controller); polling.current = false; }
        }
        refresh();
        const timer = setInterval(refresh, 5000);
        return () => { active.current = false; clearInterval(timer); for (const controller of requests.current) controller.abort(); };
      }, []);
      async function perform(name, operation) {
        if (action.current) return;
        action.current = true;
        // Cancel older polls so an earlier snapshot cannot overwrite this action's result.
        for (const request of requests.current) request.abort();
        const controller = new AbortController();
        requests.current.add(controller);
        setPending(name); setMessage(""); setError("");
        try { await operation(controller.signal); }
        catch (e) { if (active.current && e.name !== "AbortError") setError(e.message); }
        finally { requests.current.delete(controller); action.current = false; if (active.current) setPending(""); }
      }
      function slangAction(payload) {
        return perform("slang", async (signal) => {
          const next = await api("slang", { accountId:status?.slang?.accountId, ...payload }, signal);
          if (!active.current) return;
          setStatus(next);
          setMessage(["extract","research"].includes(payload.action) ? "黑话任务已开始，可在这里查看进度。" : payload.action === "stop" ? "已停止黑话任务，刷帖、回复和发帖不受影响。" : next.slangMutation ? "已更新 " + next.slangMutation.updated + " 条，跳过 " + next.slangMutation.skipped + " 条（缺少释义或已拒绝）。" : "黑话词库已更新");
          if (!["extract","research"].includes(payload.action)) setSlangSelected({accountId:null,ids:[]});
          if (payload.action === "save") setSlangDraft({ term:"", meaning:"", context:"", accountId:null });
        });
      }
      function changeSlang(key, value) {
        setSlangDraft({ ...slangDraft, accountId:slangDraft.accountId || status?.slang?.accountId, [key]:value });
      }
      function save(event) {
        event.preventDefault();
        const invalid = Array.from(event.currentTarget?.elements || []).find((field) => field.willValidate && !field.validity.valid);
        if (invalid) {
          setTab(invalid.closest("[role=tabpanel]").dataset.tab);
          setError(invalid.getAttribute("aria-label") + "：" + invalid.validationMessage);
          requestAnimationFrame(() => invalid.focus());
          return;
        }
        return perform("save", async (signal) => {
          const next = await api("automation", { action: "configure", config: configFrom(draftRef.current) }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft(editable(next.config)); setDirty(false); setMessage("设置已保存");
        });
      }
      function searchSelections() {
        return perform("selections", async signal => {
          setSelectionResults(null);
          const result = await api("posting-selections?q=" + encodeURIComponent(selectionQuery.trim()), null, signal);
          if (active.current) setSelectionResults(result);
        });
      }
      function addSelection(key, item) {
        const values = draftRef.current[key] || [];
        if (values.some(v => key === "postingCommunities" ? v.id === item.id : v.name === item.name)) return;
        if (key === "postingCommunities" && values.length && (item.id === "7214" || values.some(v => v.id === "7214"))) { setError("盒友杂谈分区只能单独选择，请先移除其他已选分区。"); return; }
        if (values.length >= (key === "postingCommunities" ? 2 : 5)) { setError(key === "postingCommunities" ? "分区最多选择 2 个" : "话题最多选择 5 个"); return; }
        if (key === "postingHashtags" && item.isActivity && values.some(v => v.isActivity)) { setError("活动话题最多选择 1 个"); return; }
        replaceDraft({ ...draftRef.current, [key]: [...values, item], ...(key === "postingCommunities" ? { postingTopicId: "" } : {}) });
        setDirty(true); setMessage(""); setError("");
      }
      function stop() {
        return perform("stop", async (signal) => {
          const next = await api("automation", { action: "configure", config: { enabled: false, autoReply: false, postingEnabled: false } }, signal);
          if (!active.current) return;
          setStatus(next); replaceDraft({ ...draftRef.current, enabled: false, autoReply: false, postingEnabled: false });
          setMessage("已停止调度并请求取消当前生成；已提交的平台请求无法撤回。");
        });
      }
      function accountAction(login) {
        return perform("account", async (signal) => {
          const next = await api("state", login ? { action: "login", cookie } : { action: "logout" }, signal);
          if (!active.current) return;
          setAuth(next); setCookie(""); setMessage(login ? "账号信息已保存，请先运行一轮验证 Cookie。" : "已退出账号");
        });
      }
      const locked = !!pending || !!status?.busy;
      const slangLocked = !!pending || !!status?.slang?.busy || !!status?.slang?.fault;
      const number = (key, label, min, max) => h(Field, { label }, h("input", { className: "hx-input", type: "number", "aria-label": label, required: true, min, max, step: 1, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value === "" ? "" : Number(e.target.value)) }));
      const text = (key, label, note) => h(Field, { label, note }, h("input", { className: "hx-input", type: "text", "aria-label": label, maxLength: key === "postingSelectionQuery" ? 100 : key === "holidays" || key === "workdays" ? 5000 : 2000, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) }));
      const persona = (key, label, note) => {
        const max = key === "postingPersona" ? 20000 : 2000;
        return h(Field, { label, note: note + " 已输入 " + (draft[key] || "").length + " / " + max + " 字符。" }, h("textarea", { className: "hx-input", "aria-label": label, rows: key === "postingPersona" ? 8 : 4, maxLength: max, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) }));
      };
      const toggle = (key, label, note) => h(Toggle, { label, note, value: draft[key], disabled: locked, onChange: (value) => change(key, value) });
      const select = (key, label, options) => h(Field, { label }, h("select", { className: "hx-input", "aria-label": label, value: draft[key], disabled: locked, onChange: (e) => change(key, e.target.value) },
        ...options.map(([value, title]) => h("option", { key: value, value }, title))));
      const selectionGroup = (key, title, items, selected) => h("div", { className: "hx-details" },
        h("strong", null, title),
        h("div", { className: "hx-row" + (selected ? "" : " hx-selection-list"), ...(!selected ? { role: "group", "aria-label": title + "候选列表", tabIndex: 0 } : {}) }, ...(items || []).map(item => {
          const chosen = (draft[key] || []).some(v => key === "postingCommunities" ? v.id === item.id : v.name === item.name);
          const label = item.name + (item.isActivity ? "（活动）" : "");
          return h("button", { key: item.id || item.name, type: "button", className: "hx-button hx-selection", disabled: locked || (!selected && chosen),
            "aria-label": (selected ? "移除" : "选择") + title + "：" + item.name,
            onClick: () => selected ? change(key, draft[key].filter(v => key === "postingCommunities" ? v.id !== item.id : v.name !== item.name)) : addSelection(key, item) }, (selected ? "× " : chosen ? "已选 · " : "+ ") + label);
        })),
        !(items || []).length && h("p", { className: "hx-note" }, selected ? "尚未选择" : "没有匹配结果，试试其他关键词。"));
      const clock = (minute) => String(Math.floor(minute % 1440 / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      const windowSummary = (windows = [[0, 1440]]) => windows.length ? windows.map(([start, end]) =>
        start === 0 && end === 1440 ? "全天" : clock(start) + "–" + (end === 1440 ? "24:00" : end < start ? "次日 " + clock(end) : clock(end))).join("、") : "不运行";
      const windowsEditor = (key, title) => {
        const windows = draft[key] || [[0, 1440]];
        const update = (index, edge, value) => {
          if (!/^\d{2}:\d{2}$/.test(value)) return;
          const [hour, minute] = value.split(":").map(Number);
          const next = windows.map((window) => [...window]);
          next[index][edge] = edge === 1 && hour === 0 && minute === 0 ? 1440 : hour * 60 + minute;
          change(key, next);
        };
        return section(title, "可添加多段；结束时间早于开始时间表示跨午夜。00:00 → 00:00 表示全天；移除全部时间段表示当天不运行。",
          ...windows.map(([start, end], index) => h("div", { className: "hx-row", key: index },
            h(Field, { label: "开始" }, h("input", { className: "hx-input", type: "time", step: 60, required: true, "aria-label": title + "开始 " + (index + 1), value: clock(start), disabled: locked, onChange: (e) => update(index, 0, e.target.value) })),
            h("span", { "aria-hidden": true }, "→"),
            h(Field, { label: "结束" }, h("input", { className: "hx-input", type: "time", step: 60, required: true, "aria-label": title + "结束 " + (index + 1), value: clock(end), disabled: locked, onChange: (e) => update(index, 1, e.target.value) })),
            h("span", { className: "hx-note" }, start === 0 && (end === 1440 || end === 0) ? "全天" : end < start ? "跨午夜" : end === 1440 ? "至当天午夜" : ""),
            h("button", { className: "hx-button", type: "button", "aria-label": "移除" + title + " " + (index + 1), disabled: locked, onClick: () => change(key, windows.filter((_, i) => i !== index)) }, "移除"))),
          !windows.length && h("p", { className: "hx-note" }, "当天不运行"),
          h("div", { className: "hx-row" },
            h("button", { className: "hx-button", type: "button", disabled: locked || windows.length >= 10, onClick: () => change(key, [...windows, [540, 1080]]) }, "添加" + title),
            h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => change(key, [[0, 1440]]) }, title + "全天"),
            h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => change(key, []) }, title + "不运行")));
      };
      const tabs = [["overview", "概览"], ["account", "账号"], ["browse", "浏览"], ["interaction", "互动"], ["slang", "黑话"], ["posting", "发帖"], ["records", "评论记录"], ["valley", "运行时段"], ["advanced", "高级"]];
      const slangEntries = status?.slang?.entries || [];
      const slangResearchMode = status?.config?.slangResearchMode || "context";
      const slangResearchVerb = slangResearchMode === "web" ? "上网查" : "让 AI 解释";
      const slangUnresearched = slangEntries.filter(v=>v.status === "pending" && (v.research?.status !== "done" || (v.research.mode || "web") !== slangResearchMode));
      const slangMatches = slangEntries.filter(entry => (slangFilter === "all" || entry.status === slangFilter) && [entry.term,entry.meaning,entry.context,...(entry.sources || []).map(v=>v.quote)].join(" ").toLowerCase().includes(slangQuery.trim().toLowerCase()));
      const slangPages = Math.max(1,Math.ceil(slangMatches.length/slangPageSize));
      const slangCurrentPage = Math.min(slangPage,slangPages);
      const slangVisible = slangMatches.slice((slangCurrentPage-1)*slangPageSize,slangCurrentPage*slangPageSize);
      const slangIds = slangSelected.accountId === status?.slang?.accountId ? slangSelected.ids.filter(id=>slangEntries.some(v=>v.id === id)) : [];
      const slangResearchIds = slangIds.filter(id=>slangEntries.some(v=>v.id === id && v.status === "pending"));
      const selectSlang = ids => setSlangSelected({accountId:status?.slang?.accountId,ids});
      const filterSlang = value => {setSlangFilter(value);setSlangPage(1);selectSlang([]);};
      const section = (title, note, ...children) => h("section", { className: "hx-section" }, h("div", { className: "hx-section-head" }, h("h3", null, title), note && h("p", { className: "hx-note" }, note)), ...children);
      // Keep panels mounted so QR polling and form edits survive tab changes.
      const panel = (id, ...children) => h("div", { role: "tabpanel", id: "hx-panel-" + id, "aria-labelledby": "hx-tab-" + id, "data-tab": id, hidden: tab !== id, tabIndex: 0, className: "hx-panel" }, ...children);
      const stateLabel = status?.busy && status?.slang?.busy ? "刷帖任务与黑话同时执行" : status?.slang?.busy ? "黑话执行中" : status?.busy ? "正在执行" : (status?.config.enabled || status?.config.autoReply || status?.config.postingEnabled) ? "等待调度检查" : "已停止";
      return h("div", { className: "hx-page" },
        h("header", { className: "hx-header" }, h("div", null, h("div", { className: "hx-kicker" }, "HEYBOX / AUTOMATION"), h("h2", null, "刷小黑盒"), h("p", { className: "hx-note" }, "按你的节奏，浏览与交流。")),
          h("span", { className: "hx-badge", "data-active": !!(status?.busy || status?.slang?.busy || status?.config.enabled || status?.config.autoReply || status?.config.postingEnabled), role: "status" }, status ? stateLabel : "连接中")),
        h("div", { className: "hx-tabs", role: "tablist", "aria-label": "小黑盒设置菜单" }, ...tabs.map(([id, label], index) => h("button", {
          key: id, ref: (node) => { tabRefs.current[id] = node; }, type: "button", role: "tab", id: "hx-tab-" + id, "aria-controls": "hx-panel-" + id,
          "aria-selected": tab === id, tabIndex: tab === id ? 0 : -1, className: "hx-tab", onClick: () => setTab(id),
          onKeyDown: (event) => {
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!offset && !["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length][0];
            setTab(next); tabRefs.current[next]?.focus();
          },
        }, label))),
        (error || pollError) && h("div", { className: "hx-message hx-error", role: "alert" }, error || pollError),
        message && h("div", { className: "hx-message", role: "status" }, message),
        h("form", { className: "hx-form", onSubmit: save, noValidate: true },
          panel("overview", status ? h(React.Fragment, null,
            status.fault && h("div", { className: "hx-message hx-error", role: "alert" }, status.fault),
            status.replyPaused && h("div", { className: "hx-message hx-error", role: "alert" }, status.replyPaused),
            h("div", { className: "hx-stats" },
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "今日评论"), h("strong", null, status.usage.comment, h("small", null, " / " + status.config.dailyComments))),
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "今日回复"), h("strong", null, status.usage.reply, h("small", null, " / " + status.config.dailyReplies))),
              h("div", { className: "hx-stat" }, h("p", { className: "hx-note" }, "下次浏览检查"), h("strong", { className: "hx-stat-time" }, status.runningKind === "browse" ? "本轮结束后计算" : time(status.nextRunAt)),
                h("p", { className: "hx-note" }, "到点检查运行条件，符合条件才开始。时间按浏览器本地时区显示。"))),
            section("已生效的任务规则", "频率决定何时检查，运行时段决定能否开始。状态每 5 秒刷新。",
              dirty && h("p", { className: "hx-note" }, "有未保存的修改；此处仍显示已保存的规则。"),
              h("p", { className: "hx-note" }, "浏览检查间隔：" + status.config.intervalMinutes + " 分钟（从本轮结束后计时）；每轮最多浏览 " + status.config.postsPerRound + " 个新帖子。"),
              h("p", { className: "hx-note" }, "浏览运行时段：" + (status.config.valleyOnly ? "仅在自定义时段内开始任务" : "全天允许，不限制时段") + " · 调度时区：" + status.config.timeZone),
              status.config.valleyOnly && h(React.Fragment, null,
                h("p", { className: "hx-note" }, "工作日：" + windowSummary(status.config.valleyWindows)),
                h("p", { className: "hx-note" }, "周末：" + windowSummary(status.config.weekendWindows) + "；节假日：" + windowSummary(status.config.holidayWindows)),
                h("p", { className: "hx-note" }, "不在允许时段时跳过本次检查，间隔结束后再检查；不会在时段开始时额外触发。节假日和补班日期按运行时段页的设置判断。")),
              h("p", { className: "hx-note" }, "回复检查：" + (status.config.autoReply ? "每 " + status.config.replyIntervalSeconds + " 秒；" + (status.config.replyFollowSchedule ? "跟随浏览运行时段" : "全天检查") : "已关闭")),
              h("p", { className: "hx-note" }, "下次回复检查：" + (status.replyPaused ? "已暂停" : status.runningKind === "reply" ? "本轮结束后计算" : time(status.nextReplyAt)) + (status.replyFailures ? " · 连续失败，已延长间隔" : "")),
              h("p", { className: "hx-note" }, "回复队列：待处理 " + (status.replyQueue || []).filter(v => v.state === "pending").length + " 条 · 发送结果待确认 " + (status.replyQueue || []).filter(v => v.state === "uncertain").length + " 条 · 尝试失败已停止 " + (status.replyExhaustedCount || 0) + " 条 · 本帖回复上限已停止 " + (status.ownPostReplyLimitedCount || 0) + " 条；详情见评论记录。"),
              h("p", { className: "hx-note" }, "自动评论" + (status.config.autoComment ? "开启" : "关闭") + " · 自动回复" + (status.config.autoReply ? "开启" : "关闭") + " · 每日额度按调度时区统计。"),
              h("div", { className: "hx-row" }, h("button", { className: "hx-button", type: "button", onClick: () => setTab("browse") }, "调整执行频率"), h("button", { className: "hx-button", type: "button", onClick: () => setTab("valley") }, "调整运行时段"), !auth?.loggedIn && h("button", { className: "hx-button", type: "button", onClick: () => setTab("account") }, "绑定账号"))),
            section("最近动态", "最近 40 条运行事件，所有会话共享。", historyList(status.history))) : h("p", { className: "hx-note" }, "正在读取运行状态…")),
          panel("account", section("小黑盒账号", "使用小黑盒 App 扫码，在手机上确认即可登录。",
            !auth ? h("p", { className: "hx-note" }, "正在读取账号…") : h("div", { className: "hx-account" }, h("span", { className: "hx-account-icon", "aria-hidden": true }, "盒"),
              h("div", { className: "hx-grow" }, h("h3", null, auth.loggedIn ? "账号已绑定" : "尚未绑定账号"), h("p", { className: "hx-note" }, auth.loggedIn ? "已保存 Cookie · 账号 " + (auth.heyboxId || "ID 未识别") : "绑定后即可开始自动浏览")),
              auth.loggedIn && h("button", { className: "hx-button", type: "button", disabled: !!pending, onClick: () => accountAction(false) }, "退出账号")),
            auth && h(QrLoginPanel, { key: String(auth.loggedIn) + ":" + auth.heyboxId, onAuthenticated: (next) => { if (active.current) { setAuth(next); setCookie(""); setMessage("扫码登录成功，账号信息已保存。"); } } })),
            section("备用登录", "扫码遇到问题时，可手动更新 Cookie。", h("details", null, h("summary", null, auth?.loggedIn ? "更新 Cookie" : "使用 Cookie 登录"), h("div", { className: "hx-details" },
              h("p", { className: "hx-note" }, "在 ", h("a", { href: "https://www.xiaoheihe.cn", target: "_blank", rel: "noopener noreferrer" }, "小黑盒网页版"), " 登录，从开发者工具 Network 请求头复制 Cookie，仅提交给 DSH 宿主保存。"),
              h(Field, { label: "Cookie" }, h("textarea", { className: "hx-input", "aria-label": "Cookie", rows: 3, value: cookie, maxLength: 16384, autoComplete: "off", spellCheck: false, disabled: !!pending, onChange: (e) => setCookie(e.target.value) })),
              h("div", null, h("button", { className: "hx-button", type: "button", disabled: !!pending || !cookie.trim(), onClick: () => accountAction(true) }, "保存账号")))))),
          panel("browse", draft ? section("执行频率与数量", "设置多久检查一次、每轮最多浏览多少个新帖子；允许开始任务的时间在「运行时段」中设置。",
            toggle("enabled", "定时浏览开关", "由 DSH 宿主在后台执行"), h("hr", { className: "hx-divider" }),
            h("div", { className: "hx-grid" }, number("intervalMinutes", "调度检查间隔（分钟）", 1, 1440), number("postsPerRound", "每轮最多浏览帖子数", 1, 10)),
            h("p", { className: "hx-note" }, "本轮结束或跳过后，等待上述间隔再检查。保存设置也会重新计时。例如每 30 分钟检查一次、仅允许 00:00–06:00，白天的检查会跳过，不刷帖子。"),
            h("p", { className: "hx-note" }, "关闭设置页或浏览器后任务继续；退出 DSH 宿主后停止。")) : h("p", { className: "hx-note" }, "正在读取设置…")),
          panel("interaction", draft && h(React.Fragment, null,
            section("评论帖子", "有合适内容时才发言，默认关闭。", toggle("autoComment", "自动评论"), toggle("mentionAuthor", "评论时添加 @ 提及", "按官方客户端样本生成带用户 ID 的提及链接；实际通知仍待平台验证。仅影响帖子评论。"),
              select("mentionTarget", "评论提及对象", [["author", "帖子作者"], ["custom", "自定义用户"], ["none", "不提及"]]),
              draft.mentionTarget === "custom" && h(React.Fragment, null,
                text("mentionName", "自定义提及昵称", "填写完整昵称，也支持 @昵称。由插件添加提及，无需在人格中设置。"),
                text("mentionUserId", "提及用户 ID", "填写该用户的数字 ID，例如 12345678，必须与昵称属于同一账号。未填时默认停止该条评论；开启下方兼容选项可按普通文字发送。"),
                toggle("mentionPlainTextFallback", "缺少 ID 时允许纯文本 @", "默认关闭。开启后仅在自定义用户缺少 ID 时发送普通 @昵称，不能保证通知对方；填写 ID 后仍生成用户链接。")),
              number("dailyComments", "每日评论额度", 0, 9999)),
            section("回复来信", "独立于浏览任务检查消息；回复能确认是在回复自己的评论；可选接收自己帖子下的顶层评论。开启后将在下一次调度检查时启动（通常 5 秒内）。", toggle("autoReply", "自动回复评论"),
              h("div", { className: "hx-grid" }, number("replyIntervalSeconds", "回复检查间隔（秒）", 30, 86400), number("repliesPerRound", "每轮最多处理来信数", 1, 10), number("dailyReplies", "每日回复额度", 0, 9999)),
              number("replyMaxAttempts", "单条来信最多尝试次数", 1, 100),
              h("p", {className:"hx-note"}, "默认共尝试 5 次（首次加最多 4 次重试）。查找评论关系、生成或发送失败均受此上限约束，达到后移出待回复队列并保留原因。旧队列已超过上限的也会停止；重启、重新开启或提高上限不会恢复已停止的来信。发送结果未知仍保留待确认，不自动重发。"),
              toggle("replyOwnPosts", "自动回复自己帖子的评论", "需同时开启自动回复评论。核实帖子作者后回复顶层评论；不主动加入其他用户之间的对话。适用于插件发布和手动发布的自己的帖子，关闭后已入队的顶层评论等待重新开启。"),
              number("ownPostReplyLimit", "自己的每篇帖子最多回复多少条", 0, 1000),
              h("p", {className:"hx-note"}, "默认每篇累计最多回复 5 条，设为 0 则不自动回复自己的帖子。顶层评论和后续追问共用名额，跨天、重启不清零；按插件已有发送记录统计，平台手动回复不计入。已发送、已受理和结果待确认占名额，明确拒绝或模型跳过不占。达到上限的来信停止处理，提高上限后只处理尚未停止的新来信。"),
              draft.replyOwnPosts && select("ownPostReplyPersona", "自己帖子的回复人格", [["reply", "使用回复人格"], ["posting", "沿用发帖人格"]]),
              draft.replyOwnPosts && h("p", { className: "hx-note" }, "沿用发帖人格时，优先使用该帖发帖记录中的人格；无记录则使用当前发帖人格。使用回复人格时，留空沿用通用人设。对自己帖子中的后续直接回复也适用。"),
              toggle("replyFollowSchedule", "回复跟随浏览运行时段", "关闭时全天检查回复；不受定时浏览开关影响。"),
              h("p", { className: "hx-note" }, "默认每 180 秒检查。优先使用未读标记；没有已读标记时仅处理启用后的消息，时间不明则跳过；明确未读可能包含旧来信。模型可决定不回复，跳过也计入本轮处理数。"),
              h("p", { className: "hx-note" }, "超出本轮上限、生成失败或平台明确拒绝的来信保存到本地队列，在单条来信的尝试上限内继续；发送尝试占用每日额度。结果未知会留为待确认，不自动重发；模型决定跳过则结束处理。"),
              h("p", { className: "hx-note" }, "回复与浏览串行执行，共用发送冷却；生成耗时、当前浏览任务和限流退避都会延迟回复。登录失效或人机验证会暂停检查，请处理后重新登录。")),
            section("发言人格", "DSH 和第三方 API 都使用这些人格设置。",
              persona("persona", "通用人设与兴趣", "用于帖子评论；回复人格留空时也使用此设置。"),
              persona("replyPersona", "回复人格", "只影响回复评论，可设置语气、立场与回答习惯；留空沿用通用人设。"),
              number("cooldownSeconds", "评论与回复最短间隔（秒）", 10, 3600)))),
          panel("slang", draft && h(React.Fragment, null,
            section("读懂帖子里的言外之意", "先找出不懂的词，让 AI 解释，再由你判断对不对。你认可后，回复和发帖才会参考这个意思。",
              toggle("slangEnabled", "发帖与回复时参考黑话词库", "评论、回复和发帖共用此开关。只参考当前账号已确认的释义；发帖结合主题、分区和话题自然使用，语境不合适时不强行玩梗。"),
              toggle("slangLearning", "自动从帖子和评论学习", "打开后，浏览帖子和回复评论时会顺便找出疑似黑话，保存原句。这里只找词，不会自动认可解释。"),
              number("slangSessionTerms", "一个对话最多解释几个词", 1, 100),
              h("p", {className:"hx-note"}, "批量解释会一直用同一个对话，达到你设置的词数才换新对话。解释失败、换解释方式或下次继续，都不会提前新建；每尝试解释一个词计 1 个，失败的也计数。默认上限 20，修改后记得保存。第三方直连接口不创建 DSH 对话；找新词单独运行。"),
              select("slangResearchMode", "怎么解释这些词", [["context","让 AI 根据原文解释（不上网）"],["web","先上网查，再让 AI 解释"]]),
              h("p", {className:"hx-note"}, "AI 使用你在高级设置里选的 DSH 或第三方模型。选“上网查”还需要配置搜索服务。改完记得保存；AI 解释可能有误，必须由你认可后才会用于回复和发帖。"),
              status?.slang?.task && h("div", {className:"hx-message",role:"status"}, (status.slang.task.kind === "extract" ? "找新黑话" : status.slang.task.mode === "context" ? "AI 解释（未上网）" : "上网查意思") + "：" + status.slang.task.done + " / " + status.slang.task.total + "，失败 " + status.slang.task.failed + (status.slang.task.currentTerm ? " · " + status.slang.task.currentTerm : ""))),
            h("p", {className:"hx-note"}, "黑话任务在后台单独运行，不会让刷帖、回复和发帖等待。新设置从下一批黑话任务开始生效。"),
            status?.slang?.fault && h("p", {className:"hx-error",role:"alert"}, status.slang.fault),
            h("button", {type:"button",className:"hx-button",disabled:!!pending || !status?.slang?.busy,onClick:()=>slangAction({action:"stop"})}, "只停止黑话任务"),
            status?.slang?.task?.pausedReason && h("p", {className:"hx-message hx-error",role:"status"}, status.slang.task.pausedReason),
            section("黑话 / 网络用语库", "记住这个顺序：找新词 → 让 AI 解释 → 你认可并保存。当前保留了 " + (status?.slang?.contextCount || 0) + " 份帖子和评论内容，可以从中找词；每个账号最多保存 500 个词。",
              !status?.slang?.accountId && h("p", {className:"hx-note"}, "请先到账号 Tab 登录小黑盒。"),
              h("div", {className:"hx-row",role:"group","aria-label":"黑话分类"}, ...[["pending","待你确认"],["active","已认可"],["disabled","不使用"],["all","全部"]].map(([value,label])=>h("button", {key:value,type:"button",className:"hx-button"+(slangFilter === value ? " hx-primary" : ""),"aria-pressed":slangFilter === value,onClick:()=>filterSlang(value)}, label + "（" + slangEntries.filter(v=>value === "all" || v.status === value).length + "）"))),
              h("div", {className:"hx-row"},
                h("button", {type:"button",className:"hx-button",disabled:slangLocked || !status?.slang?.contextCount,onClick:()=>slangAction({action:"extract"})}, "从帖子里找新黑话"),
                h("button", {type:"button",className:"hx-button",disabled:slangLocked || !slangUnresearched.length,onClick:()=>slangAction({action:"research",ids:slangUnresearched.map(v=>v.id)})}, (slangResearchMode === "web" ? "上网解释全部待处理词" : "让 AI 解释全部待处理词") + "（" + slangUnresearched.length + "个）")),
              h("p", {className:"hx-note"}, slangResearchMode === "web" ? "批量查意思：把所有还没解释完成的词，先搜索，再让 AI 解释，不用勾选。" : "批量解释：把所有还没解释完成的词，交给 AI 逐个解释，不用勾选。找新黑话只是把词找出来，不会解释意思。"),
              h("p", {className:"hx-note"}, "“待你确认”里既有还没解释的词，也有 AI 已经解释、等你认可的词。认可后才会放进“已认可”。"),
              slangLocked && h("p", {className:"hx-note",role:"status"}, "黑话任务正在处理，结束后可继续操作词库；刷帖、回复和发帖照常运行。"),
              !slangLocked && !slangUnresearched.length && h("p", {className:"hx-note"}, "目前没有需要批量解释的词。已有解释的词，可以检查后认可并保存。"),
              h("div", {className:"hx-grid"},
                h(Field, {label:"搜索黑话"}, h("input", {className:"hx-input",type:"search","aria-label":"搜索黑话",placeholder:"搜索词语 / 解释 / 原句",value:slangQuery,onChange:e=>{setSlangQuery(e.target.value);setSlangPage(1);}})),
                h(Field, {label:"每页黑话数量"}, h("select", {className:"hx-input","aria-label":"每页黑话数量",value:slangPageSize,onChange:e=>{setSlangPageSize(Number(e.target.value));setSlangPage(1);}}, ...[25,50,100,500].map(value=>h("option", {key:value,value}, "每页 " + value))))),
              h("div", {className:"hx-row"},
                h("label", {className:"hx-row"}, h("input", {type:"checkbox","aria-label":"全选本页黑话",disabled:slangLocked || !slangVisible.length,checked:!!slangVisible.length && slangVisible.every(v=>slangIds.includes(v.id)),onChange:e=>selectSlang(e.target.checked ? [...new Set([...slangIds,...slangVisible.map(v=>v.id)])] : slangIds.filter(id=>!slangVisible.some(v=>v.id === id)))}), "全选本页"),
                h("span", {className:"hx-note"}, "已选 " + slangIds.length + " 个，将解释 " + slangResearchIds.length + " 个"),
                h("button", {type:"button",className:"hx-button",disabled:slangLocked || !slangResearchIds.length,onClick:()=>slangAction({action:"research",ids:slangResearchIds})}, slangResearchMode === "web" ? "上网查我勾选的词" : "解释我勾选的词"),
                h("button", {type:"button",className:"hx-button",disabled:slangLocked || !slangIds.length,onClick:()=>slangAction({action:"confirm",ids:slangIds})}, "认可所选解释并保存"),
                h("button", {type:"button",className:"hx-button",disabled:slangLocked || !slangIds.length,onClick:()=>slangAction({action:"disable",ids:slangIds})}, "不使用勾选的词"),
                h("button", {type:"button",className:"hx-button hx-error",disabled:slangLocked || !slangIds.length,onClick:()=>slangAction({action:"delete",ids:slangIds})}, "删除勾选的词")),
              h("p", {className:"hx-note"}, "想自己挑词：先勾选，再点解释按钮，勾选多少就处理多少。“全选本页”会选中这一页的全部词；已认可和不使用的词不会重新解释。认可并保存会跳过还没有完整解释的词；不使用会保留记录，删除会移除记录。"),
              slangVisible.length ? h("ul", {className:"hx-history"}, ...slangVisible.map(entry=>h("li", {key:entry.id},
                h("input", {type:"checkbox","aria-label":"选择黑话："+entry.term,disabled:slangLocked,checked:slangIds.includes(entry.id),onChange:e=>selectSlang(e.target.checked ? [...slangIds,entry.id] : slangIds.filter(id=>id !== entry.id)),style:{marginTop:6}}),
                h("div", {className:"hx-history-copy"},
                  h("strong", {className:"hx-history-title"}, entry.term),
                  h("p", {className:"hx-note"}, ({active:"已认可",pending:"待你确认",disabled:"不使用"}[entry.status] || "待你确认") + " · 出现 " + (entry.occurrences || 1) + " 次 · " + (entry.verified ? "你已认可" : entry.research?.status === "done" ? (entry.research.mode === "context" ? "AI 已解释（未上网），等你确认" : "已上网查过，等你确认") + " · AI 自评把握 " + Math.round(entry.confidence*100)+"%" : entry.meaning ? "已有解释，等你确认" : "还没解释")),
                  h("p", null, entry.meaning || "还不知道是什么意思，可以让 AI 解释"), entry.context && h("p", {className:"hx-note"}, "在什么情况下这样用：" + entry.context),
                  ...(entry.sources || []).map((source,index)=>h("p", {key:index,className:"hx-note"}, "原文：", source.quote, " · ", h("a", {href:postLink(source),target:"_blank",rel:"noopener noreferrer"}, source.title || "来源帖子"), source.sourceId ? " · " + source.sourceId : "")),
                  ...(entry.research?.sources || []).map((source,index)=>h("p", {key:"research-"+index,className:"hx-note"}, "网上查到的来源：", h("a", {href:source.url,target:"_blank",rel:"noopener noreferrer"}, source.title || source.url))),
                  entry.research?.error && h("p", {className:"hx-error hx-note"}, entry.research.error + (entry.research.code ? "（" + entry.research.code + "）" : "")),
                  ...(entry.alternatives || []).map((alternative,index)=>h("p", {key:"alt-"+index,className:"hx-note"}, "待核对解释：" + alternative.meaning + "（" + alternative.context + "） · 原文：" + alternative.source.quote)),
                  h("div", {className:"hx-row",style:{marginTop:8}},
                    entry.status === "pending" && h("button", {type:"button",className:"hx-button",disabled:slangLocked,onClick:()=>slangAction({action:"research",ids:[entry.id]})}, slangResearchVerb+"「"+entry.term+"」"),
                    h("button", {type:"button",className:"hx-button",disabled:slangLocked,onClick:()=>setSlangDraft({id:entry.id,term:entry.term,meaning:entry.meaning || "",context:entry.context || "",accountId:status?.slang?.accountId})}, "编辑「"+entry.term+"」"),
                    !entry.verified && entry.status !== "disabled" && h("button", {type:"button",className:"hx-button",disabled:slangLocked || !entry.meaning || !entry.context,onClick:()=>slangAction({action:"confirm",id:entry.id})}, "解释正确，保存「"+entry.term+"」"),
                    h("button", {type:"button",className:"hx-button",disabled:slangLocked,onClick:()=>slangAction({action:entry.status === "disabled" ? "enable" : "disable",id:entry.id})}, (entry.status === "disabled" ? "恢复使用「" : "不使用「")+entry.term+"」"),
                    h("button", {type:"button",className:"hx-button hx-error",disabled:slangLocked,onClick:()=>slangAction({action:"delete",id:entry.id})}, "删除「"+entry.term+"」"))))))
                : h("div", {className:"hx-empty"}, h("p", null, slangEntries.length ? "没有匹配的黑话" : "还没有找到黑话。先浏览帖子，再点“从帖子里找新黑话”；也可以自己添加。")),
              h("div", {className:"hx-row"}, h("span", {className:"hx-note"}, "筛选 " + slangMatches.length + " 条 · " + slangCurrentPage + " / " + slangPages + " 页"),
                h("button", {type:"button",className:"hx-button",disabled:slangCurrentPage <= 1,onClick:()=>setSlangPage(slangCurrentPage-1)}, "上一页黑话"),
                h("button", {type:"button",className:"hx-button",disabled:slangCurrentPage >= slangPages,onClick:()=>setSlangPage(slangCurrentPage+1)}, "下一页黑话"))),
            section(slangDraft.id ? "编辑并确认黑话" : "手动添加黑话", "填写这个词的意思和使用场景。保存后就算你认可，AI 回复或发帖时可以参考；一个词有几种意思时，请分开说明。",
              h(Field, {label:"黑话词语"}, h("input", {className:"hx-input","aria-label":"黑话词语",maxLength:40,value:slangDraft.term,disabled:slangLocked,onChange:e=>changeSlang("term",e.target.value)})),
              h(Field, {label:"这个词是什么意思"}, h("textarea", {className:"hx-input","aria-label":"这个词是什么意思",rows:3,maxLength:400,value:slangDraft.meaning,disabled:slangLocked,onChange:e=>changeSlang("meaning",e.target.value)})),
              h(Field, {label:"一般在什么情况下用"}, h("input", {className:"hx-input","aria-label":"一般在什么情况下用",maxLength:160,placeholder:"例如：某款游戏的配装讨论；其他语境可能有不同意思",value:slangDraft.context,disabled:slangLocked,onChange:e=>changeSlang("context",e.target.value)})),
              slangDraft.accountId && slangDraft.accountId !== status?.slang?.accountId && h("p", {className:"hx-error",role:"alert"}, "账号已切换，请清空编辑后重新填写。"),
              h("div", {className:"hx-row"}, h("button", {type:"button",className:"hx-button hx-primary",disabled:slangLocked || !status?.slang?.accountId || !!(slangDraft.accountId && slangDraft.accountId !== status?.slang?.accountId),onClick:()=>slangAction({...slangDraft,accountId:slangDraft.accountId || status?.slang?.accountId,action:"save"})}, "认可这个解释并保存"),
                h("button", {type:"button",className:"hx-button",disabled:!!pending,onClick:()=>setSlangDraft({term:"",meaning:"",context:"",accountId:null})}, "清空编辑"))))),
          panel("posting", draft && h(React.Fragment, null,
            section("定时发帖", "文字帖子会在指定时间按发帖主题自动生成并发布。发帖与浏览共用执行锁和发送冷却，可能略有延迟；不受浏览峰谷时段限制。",
              toggle("postingEnabled", "开启定时发帖", "保存后绑定当前登录账号；关闭页面仍会运行，DSH 宿主需保持在线。"),
              text("timeZone", "发帖调度时区", "与浏览调度共用此时区，例如 Asia/Shanghai。"),
              select("postingTimingMode", "发帖时间方式", [["fixed", "固定时间"], ["prompt", "提示词规划时间"]]),
              number("postingDailyLimit", "每日最多安排帖子", 1, 10),
              number("postingMinGapMinutes", "计划最短间隔（分钟）", 10, 1440),
              h("p", {className:"hx-note"}, "手动发帖也受以上限制，失败或跳过的任务也占当天名额；固定时间计划仍按设定时间执行。"),
              draft.postingTimingMode === "prompt" ? h("div", { className: "hx-details" },
                h(Field, { label: "发帖时间提示词", note: "例如：每天发 1–2 条，随机安排在午休或晚间，间隔至少 2 小时，周日不发。仅规划今天剩余时间，可决定今天不发。" }, h("textarea", { className: "hx-input", rows: 4, maxLength: 2000, "aria-label": "发帖时间提示词", value: draft.postingTimingPrompt, disabled: locked, onChange: e => change("postingTimingPrompt", e.target.value) })),
                h("p", { className: "hx-note" }, "开启后宿主规划当天时间，跨天后规划新一天；正常每天调用模型规划一次，到点另行生成正文。规划失败每 5 分钟重试，最多 3 次。今日计划保存后不会因修改提示词而重排，新提示词用于下一次规划；降低每日上限、增大发送间隔会立即约束剩余任务，可能使其跳过或错过。"))
                : h(React.Fragment, null,
                select("postingSchedule", "发帖周期", [["once", "单次"], ["daily", "每天"], ["weekly", "每周"]]),
              draft.postingSchedule === "once" ? h(Field, { label: "单次发布时间", note: "按上方调度时区解释，不按浏览器所在时区。" }, h("input", { className: "hx-input", type: "datetime-local", "aria-label": "单次发布时间", value: draft.postingAt, disabled: locked, onChange: e => change("postingAt", e.target.value) }))
                : h(Field, { label: "每天发布时间" }, h("input", { className: "hx-input", type: "time", "aria-label": "每天发布时间", value: draft.postingTime, disabled: locked, onChange: e => change("postingTime", e.target.value) })),
              draft.postingSchedule === "weekly" && h("div", { className: "hx-row", role: "group", "aria-label": "发帖星期" }, ...["一", "二", "三", "四", "五", "六", "日"].map((name, i) => h("button", { key: i, type: "button", disabled: locked, className: "hx-button" + (draft.postingWeekdays.includes(i + 1) ? " hx-primary" : ""), "aria-pressed": draft.postingWeekdays.includes(i + 1), onClick: () => change("postingWeekdays", draft.postingWeekdays.includes(i + 1) ? draft.postingWeekdays.filter(v => v !== i + 1) : [...draft.postingWeekdays, i + 1].sort()) }, "周" + name)))),
              h("p", { className: "hx-note" }, "下一次发布时间：" + time(status?.posting?.nextAt, status?.config.timeZone) + " · 保存设置后生效。"),
              h("p", { className: "hx-note" }, status?.posting?.accountMatches === false ? "发帖计划绑定其他账号；如需切换，请在当前账号下重新保存开启定时发帖。" : "超过计划时间 10 分钟的任务记为错过，不集中补发。发送结果未知时不自动重发。")),
            draft.postingTimingMode === "prompt" && section("时间规划记录", "最近 14 次按账号保存的计划。每日上限按任务数量计算，跳过、失败和错过也占名额；规划失败不会自动退回固定时间发帖。",
              !(status?.posting?.plans || []).length ? h("p", { className: "hx-note" }, "保存并开启后，宿主会在下一次检查时规划今天剩余时间。") : h("ul", { className: "hx-history" }, ...(status.posting.plans || []).map(plan => h("li", { key: plan.id }, h("div", { className: "hx-history-copy" },
                h("strong", null, plan.date + " · " + plan.zone),
                h("p", { className: "hx-note" }, ({ pending: "待重试", planning: "规划中", ready: "已安排", skipped: "未安排", failed: "规划失败" }[plan.status] || plan.status) + " · 尝试 " + plan.attempts + " 次"),
                h("p", { className: "hx-note" }, (plan.slots || []).map(v => time(v, plan.zone)).join("、") || "没有发帖时间"),
                plan.retryAt && ["pending", "planning"].includes(plan.status) && h("p", { className: "hx-note" }, "最早重试：" + time(plan.retryAt, plan.zone)),
                (plan.error || plan.note) && h("p", { className: "hx-note" }, plan.error || plan.note)))))),
            section("发帖分区与话题", "分区决定帖子发布到哪个社区，最多 2 个，盒友杂谈须单独选择；话题选填，可只选分区直接发帖；最多 5 个话题，其中活动话题最多 1 个。选择后保存生效，请确认账号有对应分区的发帖权限。",
              select("postingSelectionMode", "分区与话题选择方式", [["manual", "手动选择"], ["ai", "AI 自动选择"]]),
              draft.postingSelectionMode === "ai" ? h("div", { className: "hx-details" },
                text("postingSelectionQuery", "AI 候选搜索词", "选填，最多 100 字；留空合并推荐、已关注和近期热门分区，填写后从对应搜索结果中选择。"),
                persona("postingSelectionPrompt", "AI 分区与话题选择偏好", "选填，例如：优先单机游戏讨论，话题只选与正文相关的普通话题。每次发帖前按发帖主题与独立发帖人格选择；无合适分区则跳过。手动选择在此模式不参与发布。")) : h(React.Fragment, null,
              h(Field, { label: "搜索分区或话题", note: "登录后按名称搜索；留空可浏览推荐、已关注和近期热门分区。不是平台全部分区，找不到可搜索；话题不选也能发布。" },
                h("div", { className: "hx-row" },
                  h("input", { className: "hx-input", type: "search", "aria-label": "搜索分区或话题", placeholder: "输入游戏、社区或话题名称", maxLength: 100, value: selectionQuery, disabled: locked, onChange: e => { setSelectionQuery(e.target.value); setSelectionResults(null); }, onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); searchSelections(); } } }),
                  h("button", { className: "hx-button", type: "button", disabled: locked || !auth?.loggedIn, onClick: searchSelections }, pending === "selections" ? "查询中…" : "查询分区与话题"))),
              !auth?.loggedIn && h("p", { className: "hx-note" }, "请先到账号 Tab 登录小黑盒。"),
              selectionGroup("postingCommunities", "已选分区", draft.postingCommunities, true),
              selectionGroup("postingHashtags", "已选话题", draft.postingHashtags, true),
              selectionResults && h("div", { className: "hx-details", "aria-live": "polite" },
                h("p", { className: "hx-note" }, "本次找到 " + selectionResults.communities.length + " 个分区；可按名称继续搜索。话题选填。"),
                selectionResults.catalogUnavailable && h("p", { className: "hx-note" }, "更多分区暂时加载失败，当前显示编辑器推荐；可重试或按名称搜索。"),
                selectionGroup("postingCommunities", "分区", selectionResults.communities, false),
                selectionGroup("postingHashtags", "话题", selectionResults.hashtags, false)),
              !(draft.postingCommunities || []).length && h("details", null, h("summary", null, "手动填写社区 ID（兼容旧配置）"),
                text("postingTopicId", "发帖社区 ID", "可保留原有数字 ID；通过搜索选择分区后自动清空此项。没有选择分区或填写 ID 时无法开启手动模式发帖。")))),
            section("独立发帖人格", "发帖始终使用这里的人格，不沿用通用人格或回复人格。生成方式与模型使用高级设置中选定的 DSH 或第三方 API。",
              toggle("postingImages", "发帖时自动配一张合适的图", "从梗鲸图库按正文、情绪和图上台词选图；没有合适的、配图失败或近期用过的就不配。保存后用于新任务。"),
              toggle("postingAvoidTitleCard", "避免生成标题卡片", "开启后用文章形式发布，避开图文模式把标题做成图片的效果；正常配图保留，没配图就只发文字。保存后用于新任务。"),
              h("p", {className:"hx-note"}, "基于图库的台词和场景说明挑选，每帖最多 1 张；支持静态梗图，配在正文末尾，发帖记录可查看来源与匹配理由。"),
              select("postingFormat", "正文排版", [["plain", "纯文本"], ["rich", "AI 自动排版（文章）"]]),
              h("p", {className:"hx-note"}, "自动排版会按内容需要加粗重点、分小标题、列清单或引用，以文章形式发布。短帖不会强行套格式；保存后用于新任务，已有任务保留原排版方式。"),
              persona("postingPersona", "发帖人格", "设置写作身份、口吻、立场和表达习惯；开启时不能为空。"),
              h("p", {className:"hx-note"}, "发帖会根据主题、已选分区和话题参考当前账号已确认的黑话，自然使用合适用语；在「黑话」Tab 控制是否启用，保存后生效。"),
              h(Field, { label: "发帖主题与要求", note: "每次按这个主题生成新帖子；标题最多 30 字，正文最多 10000 字。支持纯文本或 AI 自动排版，可自动匹配梗鲸图库的静态图片，本地选图和视频尚未接入。" }, h("textarea", { className: "hx-input", rows: 5, maxLength: 4000, "aria-label": "发帖主题与要求", value: draft.postingPrompt, disabled: locked, onChange: e => change("postingPrompt", e.target.value) }))),
            section("发帖记录", "当前账号最近 50 次任务。下方显示生成内容与本地排版预览，平台最终样式以实际帖子为准。已受理表示取得帖子 ID，核验通过表示读取到一致内容；两者都不保证对所有用户可见。",
              !(status?.posting?.jobs || []).length ? h("p", { className: "hx-note" }, "还没有发帖记录。") : h("ul", { className: "hx-history" }, ...status.posting.jobs.map(job => h("li", { key: job.id }, h("div", { className: "hx-history-copy" },
                h("div", { className: "hx-history-title" }, job.postId ? h("a", { href: "https://www.xiaoheihe.cn/app/bbs/link/" + job.postId, target: "_blank", rel: "noopener noreferrer" }, job.title || "查看帖子") : job.title || (job.trigger === "manual" ? "手动发帖" : "定时发帖")),
                h("p", { className: "hx-note" }, (job.trigger === "manual" ? "手动执行 " : "计划 ") + time(job.slot) + " · " + ({ pending: "等待重试", generating: "生成中", skipped: "模型跳过", missed: "已错过", failed: "生成失败", rejected: "平台拒绝", uncertain: "待确认，不自动重发", accepted: "平台已受理", verified: "内容核验通过" }[job.status] || job.status)),
                h("p", { className: "hx-note" }, (job.selectionMode === "ai" ? "AI 选择 · " : "") + "分区：" + (job.communities?.map(v => v.name).join("、") || job.topicId || "未记录") + " · 话题：" + ((job.hashtags || []).map(v => "#" + v.name).join("、") || "无")),
                (job.platformStatus || job.platformMessage || job.httpStatus) && h("p", { className: "hx-note" }, "平台响应：", [job.platformStatus, job.platformMessage, job.httpStatus ? "HTTP " + job.httpStatus : ""].filter(Boolean).join(" · ")),
                job.text && postPreview(job),
                job.image?.status === "uploaded" && h("figure", {style:{margin:"12px 0"}},
                  h("img", {src:"/heybox/img?u="+encodeURIComponent(job.image.url),alt:job.image.title || "帖子配图",loading:"lazy",style:{display:"block",maxWidth:"100%",maxHeight:"360px",objectFit:"contain",borderRadius:"8px"}}),
                  h("figcaption", {className:"hx-note"}, "图片来源：", h("a",{href:job.image.sourceUrl,target:"_blank",rel:"noopener noreferrer"},"梗鲸 #"+job.image.id),job.image.author ? " · "+job.image.author : "",job.image.reason ? " · "+job.image.reason : "")),
                job.image?.note && h("p", {className:"hx-note"},job.image.note), job.error && h("p", { className: "hx-note" }, job.error)))))))),
          panel("records", h(React.Fragment, null,
            section("待回复队列", "当前账号共 " + (status?.replyQueue || []).length + " 条，最多展示前 50 条。单条最多尝试 " + (status?.config.replyMaxAttempts || 5) + " 次，达到上限后停止并移出队列；停止原因见下方记录。发送结果待确认项不自动重发。", replyQueueList(status?.replyQueue || [])),
            section("评论与回复", "显示当前账号最近 100 条发送或停止重试记录，每 5 秒刷新；已受理或结果未知不等于确认发布。",
            h("div", { className: "hx-row", role: "group", "aria-label": "评论记录类型" }, ...[["all", "全部"], ["comment", "帖子评论"], ["reply", "评论回复"]].map(([value, label]) =>
              h("button", { key: value, type: "button", className: "hx-button" + (recordFilter === value ? " hx-primary" : ""), "aria-pressed": recordFilter === value, onClick: () => setRecordFilter(value) }, label))),
            interactionList(status?.interactions || [], recordFilter)))),
          panel("valley", draft && h(React.Fragment, null,
            section("允许运行时段", "这是浏览任务的时间限制。回复仅在开启「回复跟随浏览运行时段」时遵守这里的设置。",
              h("div", { className: "hx-row", role: "group", "aria-label": "时段快捷方案" }, ...[["all", "不限时段"], ["valley", "峰谷快捷方案"], ["bottom", "峰底快捷方案"]].map(([value, label]) =>
                h("button", { key: value, className: "hx-button", type: "button", disabled: locked, onClick: () => schedulePreset(value) }, label))),
              h("p", { className: "hx-note" }, "峰谷预设：工作日 12:00–14:00、18:00–次日 09:00，周末和节假日全天。峰底示例：每天 00:00–06:00。它们是可修改的本地预设，请按所用 API 的实际时段调整。"),
              toggle("valleyOnly", "限制任务开始时段", "关闭时全天允许，保留下方时间段；开启后限制浏览和评论；回复仅在开启跟随时段时受限，发送前也会检查。已开始的一轮浏览可能延续到时段外。"), text("timeZone", "调度时区"),
              h("p", { className: "hx-note" }, "选择快捷方案只修改表单，保存后生效。时段开始时不会立即触发；较短时段可能被较长的检查间隔错过，请在「浏览」中缩短间隔。")),
            windowsEditor("valleyWindows", "工作日时段"), windowsEditor("weekendWindows", "周末时段"), windowsEditor("holidayWindows", "节假日时段"),
            section("日历例外", "节假日使用节假日时段；周末补班使用工作日时段。同一天同时列入时，节假日优先。", text("holidays", "节假日日期", "YYYY-MM-DD，多个日期用逗号分隔。"), text("workdays", "周末补班日期", "YYYY-MM-DD，多个日期用逗号分隔。"), h("p", { className: "hx-note" }, "这是本地时间策略，不会自动查询模型价格。")))),
          panel("advanced", section("依赖与环境", "一键安装扫码所需的 qrcode；安装到当前 DSH 数据目录，无需重启。",
            dependencyError && h("p", { className: "hx-error", role: "alert" }, dependencyError),
            dependencies ? h(React.Fragment, null,
              h("div", { className: "hx-message" }, "Node " + dependencies.nodeVersion + (dependencies.nodeReady ? " · 可用" : " · 需要 Node 18+"), h("br"),
                "DSH 命令：" + (dependencies.dshReady ? "已找到" : "未找到，请检查下方命令和 Node 路径"), h("br"),
                "扫码依赖：" + (dependencies.qrReady ? "已就绪" : "未安装"), " · npm：" + (dependencies.npmReady ? "可用" : "未找到")),
              h("div", null, h("button", { className: "hx-button", type: "button", disabled: !!pending || dependencies.installing || !dependencies.npmReady, onClick: () => perform("dependencies", async (signal) => {
                const next = await api("dependencies", { action: "install" }, signal);
                if (active.current) { setDependencies(next); setMessage("已开始安装依赖，可在这里查看进度。网页关闭后安装仍会继续。"); }
              }) }, dependencies.installing ? "正在安装依赖…" : "一键安装依赖")),
              dependencies.error && h("p", { className: "hx-error", role: "alert" }, dependencies.error),
              dependencies.logs?.length > 0 && h("pre", { className: "hx-install-log", "aria-label": "依赖安装进度", role: "log" }, dependencies.logs.join("\n")))
              : h("p", { className: "hx-note" }, "正在检测依赖…"),
            h("p", { className: "hx-note" }, "此处检测已保存的命令路径。DSH 随宿主安装，模型连接需在 DSH 中配置。")),
            draft && section("模型来源", "第三方 API 使用兼容 Chat Completions 的接口。评论与回复均遵守互动页的人格设置。",
              select("generationProvider", "生成方式", [["dsh", "DSH 已配置模型"], ["external", "第三方 API"]]),
              draft.generationProvider === "external" && h(React.Fragment, null,
                text("apiBaseUrl", "API Base URL", "例如 https://api.example.com/v1；也可填写完整 /chat/completions 地址。本机服务支持 HTTP。"),
                text("apiModel", "模型名称"),
                h(Field, { label: "API Key", note: status?.apiKeyConfigured ? "已保存密钥，留空保留；填写新密钥后保存即可替换。" : "尚未保存密钥；本机无鉴权服务可留空。" },
                  h("input", { className: "hx-input", type: "password", "aria-label": "API Key", autoComplete: "new-password", maxLength: 4096, value: draft.apiKey, disabled: locked, onChange: (e) => change("apiKey", e.target.value) })),
                h("button", { className: "hx-button", type: "button", disabled: locked || !status?.apiKeyConfigured, onClick: () => perform("clear-key", async (signal) => {
                  const next = await api("automation", { action: "configure", config: { apiKey: "" } }, signal);
                  if (active.current) { setStatus(next); replaceDraft({ ...draftRef.current, apiKey: "" }); setMessage("已清除保存的 API Key，其他未保存设置仍保留。"); }
                }) }, "清除已保存密钥")),
              number("generationTimeoutSeconds", "生成超时（秒）", 10, 600)),
            draft && section("DSH 生成环境", "使用 DSH 模型时，自定义路径用于修复宿主的命令或 Node 环境。",
              text("dshCommand", "DSH 命令或 JS 入口"), text("nodePath", "Node 可执行路径（可选）")),
            draft && section("配置文件", "配置与浏览历史独立保存。可在这里编辑 JSON，或直接编辑服务器文件；文件修改在下一轮前读取。",
              h("p", { className: "hx-note" }, status?.configPath || "DSH_HOME/heybox/config.json"),
              h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => {
                const config = configFrom(draftRef.current); delete config.apiKey;
                setConfigJson(JSON.stringify(config, null, 2));
              } }, configJson === null ? "编辑配置 JSON" : "从当前表单重新载入 JSON"),
              configJson !== null && h(React.Fragment, null,
                h(Field, { label: "配置 JSON", note: "此快照不显示密钥。未提供 apiKey 时保留原密钥；显式设置 apiKey 为空字符串可清除。保存 JSON 后会同步表单，覆盖尚未保存的表单修改。" },
                  h("textarea", { className: "hx-input", "aria-label": "配置 JSON", rows: 18, spellCheck: false, maxLength: 32768, value: configJson, disabled: locked, onChange: (e) => setConfigJson(e.target.value) })),
                h("button", { className: "hx-button", type: "button", disabled: locked, onClick: () => perform("config-json", async (signal) => {
                  const next = await api("automation", { action: "configure", config: JSON.parse(configJson) }, signal);
                  if (active.current) { setStatus(next); replaceDraft(editable(next.config)); setConfigJson(null); setDirty(false); setMessage("配置文件已保存"); }
                }) }, "保存配置文件")))),
          draft && h("footer", { className: "hx-footer" },
            h("div", { className: "hx-row" }, h("button", { className: "hx-button hx-primary", type: "submit", disabled: locked }, pending === "save" ? "保存中…" : "保存设置"),
              h("button", { className: "hx-button", type: "button", disabled: !!pending || !status?.config.enabled || status.busy || !auth?.loggedIn || dirty, onClick: () => perform("run", async (signal) => {
                const next = await api("automation", { action: "run" }, signal);
                if (active.current) { setStatus(next); setMessage("已请求浏览一轮，可在概览查看结果"); }
              }) }, "立即浏览一轮"),
              h("button", { className: "hx-button", type: "button", disabled: !!pending || !status?.config.postingEnabled || !status?.posting?.accountMatches || status.busy || !auth?.loggedIn || dirty, onClick: () => perform("post-now", async (signal) => {
                const accountId=status.slang.accountId;
                if (!manualPostRequest.current || manualPostRequest.current.accountId !== accountId) manualPostRequest.current={accountId,requestId:"manual-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)};
                const next=await api("automation",{action:"post-now",...manualPostRequest.current},signal);
                if (active.current) {manualPostRequest.current=null;setStatus(next);setTab("posting");setMessage("已请求手动发帖，请在发帖记录查看进度和结果");}
              }) }, "立即发帖"),
              h("button", { className: "hx-button", type: "button", disabled: !!pending || !(status?.config.enabled || status?.config.autoReply || status?.config.postingEnabled || status?.busy || status?.slang?.busy), onClick: stop }, "停止全部任务"),
              h("span", { className: "hx-save-state", "data-dirty": dirty, role: "status" }, dirty ? "有未保存的设置" : "设置已同步")),
            h("p", { className: "hx-note" }, "先保存设置。立即浏览一轮：读取帖子，并按互动设置评论；需要开启浏览。立即发帖：按已保存的人格、主题和分区生成并发布 1 帖，无需等到计划时间；需要开启定时发帖，计入当天任务数，遵守每日上限、发帖间隔与发送冷却。自动回复独立计时；停止全部任务会同时停止黑话任务，并关闭浏览、回复和发帖。"))),
      );
    }

    function WatchTab() {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState("");
      const [offset, setOffset] = useState(0);
      useEffect(() => {
        let active = true;
        let polling = false;
        const controller = new AbortController();
        async function refresh() {
          if (polling) return;
          polling = true;
          try { const next = await api("watched?offset=" + offset + "&limit=50", null, controller.signal); if (active) { setStatus(next); setError(""); } }
          catch (e) { if (active && e.name !== "AbortError") setError(e.message); }
          finally { polling = false; }
        }
        refresh(); const timer = setInterval(refresh, 5000);
        return () => { active = false; clearInterval(timer); controller.abort(); };
      }, [offset]);
      return h("div", { className: "hx-page hx-wide" }, h("header", { className: "hx-watch-heading" }, h("h2", null, "刷过的帖子"), status && h("span", { className: "hx-count" }, "共 " + status.total + " 帖")),
        h("p", { className: "hx-note" }, "当前账号的独立浏览档案，每页 50 帖，所有会话共享。旧版标题缺失时显示帖子 ID。点击标题前往小黑盒。"),
        error && h("div", { className: "hx-message hx-error", role: "alert" }, error),
        status ? historyList(status.records, true) : h("p", { className: "hx-note" }, "正在读取记录…"),
        status && h("div", { className: "hx-row", "aria-label": "浏览记录分页" },
          h("button", { className: "hx-button", disabled: offset === 0, onClick: () => { setStatus(null); setOffset(Math.max(0, offset - 50)); } }, "上一页"),
          h("span", { className: "hx-note" }, "第 " + (offset / 50 + 1) + " 页"),
          h("button", { className: "hx-button", disabled: offset + 50 >= status.total, onClick: () => { setStatus(null); setOffset(offset + 50); } }, "下一页")));
    }
    return {
      inject: ["slots"],
      apply(ctx) {
        const style = document.createElement("style");
        style.setAttribute("data-plugin-css", "heybox-settings");
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());
        const slots = (typeof ctx.get === "function" ? ctx.get("slots") : undefined) || ctx.slots;
        if (!slots) return;
        slots.inject("settings.section", () => slots.register({ name: "settings.section", id: "heybox", order: 30, label: "刷小黑盒" }, () => h(Panel)));
        try {
          slots.inject("conversation.view", () => slots.register({ name: "conversation.view", id: "heybox-watched", order: 20, label: "刷过的帖子", scope: "session" }, () => h(WatchTab)));
        } catch { /* Older hosts may not expose conversation views. */ }
      },
    };
  },
});

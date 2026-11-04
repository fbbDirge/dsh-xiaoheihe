// Deliberately small Markdown subset. Text is always escaped; model HTML is never trusted.
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function inline(text) {
  const parts = []; let end = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
    if (match.index > end) parts.push({ text: text.slice(end, match.index) });
    parts.push({ text: match[1], bold: true }); end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end) });
  return parts;
}
const plain = parts => parts.map(p => p.text).join("");
const html = parts => parts.map(p => {
  const value = escape(p.text).replace(/\n/g, "<br>");
  return p.bold ? `<strong>${value}</strong>` : value;
}).join("");

export function formatPost(text) {
  const blocks = []; let current;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) { current = null; continue; }
    const heading = /^(#{1,2}) +(.+)$/.exec(line);
    const quote = /^> ?(.*)$/.exec(line);
    const list = /^(?:([-*]) +|([1-9]\d{0,3})\. +)(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: heading[1].length === 1 ? "h1" : "h2", parts: inline(heading[2]) }); current = null;
    } else if (list) {
      const type = list[1] ? "ul" : "ol";
      // Models often insert blank lines between list items (a Markdown loose list).
      if (!current && blocks.at(-1)?.type === type) current = blocks.at(-1);
      if (!current || current.type !== type) {
        current = { type, items: [], ...(type === "ol" ? { start: Number(list[2]) } : {}) }; blocks.push(current);
      }
      current.items.push(inline(list[3]));
    } else {
      const type = quote ? "blockquote" : "p", value = quote ? quote[1] : line;
      if (current?.type === type) current.parts.push({ text: "\n" }, ...inline(value));
      else { current = { type, parts: inline(value) }; blocks.push(current); }
    }
  }
  return {
    blocks,
    plainText: blocks.map(b => b.items ? b.items.map(plain).join("\n") : plain(b.parts)).join("\n\n"),
    html: blocks.map(b => b.items
      ? `<${b.type}${b.type === "ol" && b.start !== 1 ? ` start="${b.start}"` : ""}>${b.items.map(item => `<li><p>${html(item)}</p></li>`).join("")}</${b.type}>`
      : b.type === "blockquote" ? `<blockquote><p>${html(b.parts)}</p></blockquote>` : `<${b.type}>${html(b.parts)}</${b.type}>`).join(""),
  };
}

export function postBody(text, format = "plain") {
  if (format !== "rich") return { text: JSON.stringify([{ type: "text", text }]), desc: text.slice(0, 100), words_count: String(text.length), link_tag: "27" };
  const result = formatPost(text);
  if (!result.plainText.trim()) throw new Error("排版后的正文不能为空");
  return { text: JSON.stringify([{ type: "html", text: result.html }]), desc: result.plainText.slice(0, 100), words_count: String(result.plainText.length), link_tag: "11" };
}

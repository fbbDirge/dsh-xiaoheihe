/** Keep readable forum text without serializing editor metadata into the prompt. */
export function forumText(value, limit = 14000) {
  let remaining = 2000;
  function read(node, depth = 0) {
    if (--remaining < 0 || depth > 12 || node == null) return "";
    if (typeof node === "string") return node.slice(0, limit * 2);
    if (Array.isArray(node)) return node.slice(0, 200).map(v => read(v, depth + 1)).filter(Boolean).join("\n");
    if (typeof node !== "object") return "";
    for (const key of ["text", "insert", "content", "children", "description"]) {
      if (node[key] != null) return read(node[key], depth + 1);
    }
    return "";
  }
  return read(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (entity[0] !== "#") return named[entity.toLowerCase()];
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : " ";
    }).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim().slice(0, limit);
}

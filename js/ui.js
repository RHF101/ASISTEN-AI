export const $ = (s, r = document) => r.querySelector(s);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(s) {
  const keep = [];
  let t = esc(s).replace(/`([^`\n]+)`/g, (_, c) => {
    keep.push("<code>" + c + "</code>");
    return "\u0000" + (keep.length - 1) + "\u0000";
  });
  t = t
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*\n]*)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => keep[+n]);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEAD = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function startsBlock(l, next) {
  return HEAD.test(l) || HR.test(l) || /^\s*>/.test(l) || LIST.test(l) || (l.includes("|") && next !== undefined && SEP.test(next));
}

function renderList(items) {
  let out = "";
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) out += "</li></" + stack.pop().tag + ">";
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? "ol" : "ul";
      out += "<" + tag + ">";
      stack.push({ indent: it.indent, tag });
    } else out += "</li>";
    out += "<li>" + inline(it.text);
  }
  while (stack.length) out += "</li></" + stack.pop().tag + ">";
  return out;
}

const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function md(src) {
  const lines = String(src ?? "").split("\n");
  let h = "";
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    let m = ln.match(HEAD);
    if (m) {
      const n = m[1].length + 1;
      h += `<h${n}>${inline(m[2])}</h${n}>`;
      i++;
      continue;
    }
    if (HR.test(ln)) { h += "<hr>"; i++; continue; }
    if (/^\s*>/.test(ln)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      h += "<blockquote>" + md(q.join("\n")) + "</blockquote>";
      continue;
    }
    if (ln.includes("|") && i + 1 < lines.length && SEP.test(lines[i + 1])) {
      const head = cells(ln);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      h += '<div class="tw"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
      continue;
    }
    if (LIST.test(ln)) {
      const items = [];
      while (i < lines.length) {
        const mm = lines[i].match(LIST);
        if (mm) {
          const item = { indent: Math.floor(mm[1].replace(/\t/g, "  ").length / 2), ordered: /\d/.test(mm[2]), text: mm[3] };
          if (items.length && item.indent === 0 && items[0].indent === 0 && item.ordered !== items[0].ordered) break;
          items.push(item);
          i++;
        } else if (lines[i].trim() && /^\s+\S/.test(lines[i]) && items.length) {
          items[items.length - 1].text += " " + lines[i].trim();
          i++;
        } else if (!lines[i].trim() && i + 1 < lines.length && LIST.test(lines[i + 1])) i++;
        else break;
      }
      h += renderList(items);
      continue;
    }
    const p = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) p.push(lines[i++]);
    h += "<p>" + p.map(inline).join("<br>") + "</p>";
  }
  return h;
}

export function toast(msg, kind = "") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.className = "show " + kind;
  t.textContent = msg;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = ""), 3500);
}

export function compressImage(file, max = 1280, q = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((blob) => {
        if (!blob) return reject(new Error("gagal kompres gambar"));
        const r = new FileReader();
        r.onload = () => resolve({ blob, dataUrl: r.result, mime: "image/jpeg", b64: String(r.result).split(",")[1] });
        r.readAsDataURL(blob);
      }, "image/jpeg", q);
    };
    img.onerror = () => reject(new Error("file bukan gambar valid"));
    img.src = u;
  });
}

export async function urlToImg(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("gagal ambil gambar");
  const blob = await r.blob();
  return compressImage(new File([blob], "x.jpg", { type: blob.type || "image/jpeg" }));
}

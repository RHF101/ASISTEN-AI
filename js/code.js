import { highlight, esc } from "./highlight.js";
import { md, toast } from "./ui.js";
import { makeZip } from "./zip.js";
import { icon } from "./icons.js";

export const FILE_LINES = 30;

const EXT = {
  javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx", python: "py", py: "py",
  html: "html", htm: "html", css: "css", scss: "scss", json: "json", bash: "sh", sh: "sh", shell: "sh", zsh: "sh",
  java: "java", c: "c", cpp: "cpp", "c++": "cpp", cs: "cs", csharp: "cs", go: "go", rust: "rs", rs: "rs",
  kotlin: "kt", kt: "kt", swift: "swift", php: "php", ruby: "rb", rb: "rb", sql: "sql", yaml: "yml", yml: "yml",
  xml: "xml", svg: "svg", markdown: "md", md: "md", gdscript: "gd", gd: "gd", nasm: "asm", asm: "asm",
  dart: "dart", vue: "vue", toml: "toml", text: "txt", txt: "txt", plaintext: "txt", env: "env"
};

const LANG_BY_EXT = {
  js: "js", mjs: "js", cjs: "js", jsx: "jsx", ts: "ts", tsx: "tsx", py: "py", html: "html", htm: "html",
  css: "css", scss: "scss", json: "json", sh: "sh", bash: "sh", java: "java", c: "c", h: "c", cpp: "cpp",
  cs: "cs", go: "go", rs: "rs", kt: "kt", swift: "swift", php: "php", rb: "rb", sql: "sql", yml: "yml",
  yaml: "yml", xml: "xml", svg: "svg", md: "md", gd: "gd", asm: "asm", dart: "dart", vue: "vue",
  toml: "toml", txt: "txt", env: "env", gitignore: "txt", dockerfile: "dockerfile", makefile: "makefile"
};

const store = new Map();
const groups = new Map();
let viewer = null;
let cur = { k: null, tab: "code" };

const isName = (t) => /^[\w@./-]+\.[A-Za-z0-9]+$/.test(t) || /^(Dockerfile|Makefile)$/.test(t);
const clean = (t) => t.replace(/^(?:title|filename|file|path|name)=/i, "").replace(/^["'{]+|["'}]+$/g, "");

function parseInfo(info) {
  const tokens = String(info || "").trim().split(/\s+/).filter(Boolean);
  let lang = "";
  let name = "";
  if (!tokens.length) return { lang, name };
  const first = clean(tokens[0]);
  if (first.includes(":")) {
    const at = first.indexOf(":");
    lang = first.slice(0, at);
    name = first.slice(at + 1);
  } else if (isName(first) && /[./]/.test(first)) name = first;
  else lang = first;
  for (const t of tokens.slice(1)) {
    const c = clean(t);
    if (!name && isName(c)) name = c;
  }
  return { lang: lang.toLowerCase(), name };
}

function cleanName(n) {
  return String(n).replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/").slice(0, 120);
}

function langFor(lang, name) {
  const base = name.split("/").pop();
  const ext = base.includes(".") ? base.split(".").pop().toLowerCase() : base.toLowerCase();
  return LANG_BY_EXT[ext] || lang;
}

// Baris "judul nama-file" yang kadang ditulis model tepat sebelum fence, mis:
// "## index.html", "**js/app.js**", "📄 style.css" — dipakai sebagai fallback
// nama file kalau fence sendiri tidak membawa nama.
const STRAY_NAME = /^\s*(?:#{1,4}\s*|[*_]{1,2})?\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*)?([\w@./-]+\.[A-Za-z0-9]{1,8})\s*(?:[*_]{1,2})?\s*$/u;

// Nama file yang disebut di tengah kalimat biasa sesaat sebelum fence, mis:
// "Simpan kode di bawah ini dengan nama index.html", "beri nama file style.css".
// Dicari di 1-3 baris terakhir teks sebelum fence dibuka.
const MENTION_NAME = /(?:nama(?:kan)?|simpan(?:lah)?|beri\s*nama|sebagai|file)\s*(?:file\s*)?(?:["'`]?\s*)([\w@./-]+\.[A-Za-z0-9]{1,8})\b/iu;

function findMentionedName(text) {
  const lines = text.split("\n").filter((l) => l.trim()).slice(-3);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(MENTION_NAME);
    if (m) return m[1];
  }
  return "";
}

export function parseMessage(content) {
  const lines = String(content ?? "").replace(/\r\n?/g, "\n").split("\n");
  const segs = [];
  let text = [];
  let i = 0;
  let strayName = "";
  const flush = () => {
    if (text.length) {
      segs.push({ type: "text", text: text.join("\n") });
      text = [];
    }
  };
  while (i < lines.length) {
    const open = lines[i].match(/^\s{0,3}(`{3,})\s*([^`]*)$/);
    if (!open) {
      text.push(lines[i]);
      i++;
      continue;
    }
    // kalau baris tepat sebelum fence cuma berisi "nama-file.ext" (judul/bold/emoji),
    // simpan sebagai kandidat nama dan buang dari teks biar tidak tampil dobel
    const prev = text[text.length - 1];
    const m = prev != null ? prev.match(STRAY_NAME) : null;
    if (m) {
      strayName = m[1];
      text.pop();
    } else {
      strayName = findMentionedName(text.join("\n"));
    }
    flush();
    const fence = open[1].length;
    const body = [];
    let closed = false;
    i++;
    while (i < lines.length) {
      const c = lines[i].match(/^\s{0,3}(`{3,})\s*$/);
      if (c && c[1].length >= fence) {
        closed = true;
        i++;
        break;
      }
      body.push(lines[i]);
      i++;
    }
    let info = open[2];
    if (strayName && !/\.[A-Za-z0-9]{1,8}(\s|$)/.test(info)) info = (info ? info.trim() + " " : "") + strayName;
    segs.push({ type: "code", info, code: body.join("\n").replace(/\n+$/, ""), closed });
  }
  flush();
  return segs;
}

function resolve(segs) {
  const used = new Map();
  for (const s of segs) {
    if (s.type !== "code") continue;
    const p = parseInfo(s.info);
    const name = cleanName(p.name);
    s.lines = s.code ? s.code.split("\n").length : 0;
    s.lang = langFor(p.lang, name);
    s.file = !!name || s.lines > FILE_LINES;
    let n = name || "kode." + (EXT[s.lang] || "txt");
    const dot = n.lastIndexOf(".");
    const stem = dot > 0 ? n.slice(0, dot) : n;
    const tail = dot > 0 ? n.slice(dot) : "";
    const seen = used.get(n) || 0;
    used.set(n, seen + 1);
    if (seen) n = `${stem}-${seen + 1}${tail}`;
    s.name = n;
  }
  return segs;
}

const previewable = (l) => ["html", "htm", "svg", "md", "markdown"].includes(l);
const fmtSize = (b) => (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB");
const btn = (act, k, ic, label, cls = "") =>
  `<button type="button" class="sb ${cls}" data-act="${act}" data-k="${esc(k)}">${icon(ic, 14)}<span>${label}</span></button>`;

function inlineBlock(s, k) {
  return `<div class="cb"><div class="cbh"><span class="lg">${esc(s.lang || "kode")}</span><span class="sp"></span>${previewable(s.lang) ? btn("view", k, "play", "Pratinjau") : ""}${btn("copy", k, "copy", "Salin")}</div><pre><code>${highlight(s.code, s.lang)}</code></pre></div>`;
}

function fileCard(s, k) {
  const base = s.name.split("/").pop();
  const ext = base.includes(".") ? base.split(".").pop().slice(0, 4).toUpperCase() : "FILE";
  const size = fmtSize(new Blob([s.code]).size);
  return `<div class="fc" data-k="${esc(k)}">
    <button type="button" class="fcopen" data-act="view" data-k="${esc(k)}">
      <span class="fi">${icon("file", 16)}</span>
      <span class="fm"><span class="fn">${esc(s.name)}</span><span class="fs">${s.lines} baris · ${size}${s.closed ? "" : " · terpotong"}</span></span>
    </button>
    <div class="fmenu">
      <button type="button" class="icb sm" data-act="menu" data-k="${esc(k)}" aria-haspopup="true" aria-label="menu">${icon("dots", 18)}</button>
      <div class="fpop" data-pop="${esc(k)}" role="menu">
        <button type="button" role="menuitem" data-act="copy" data-k="${esc(k)}">${icon("copy", 15)}<span>Salin</span></button>
        <button type="button" role="menuitem" data-act="dl" data-k="${esc(k)}">${icon("download", 15)}<span>Unduh</span></button>
        <div class="fpopd"></div>
        <button type="button" role="menuitem" class="vote" data-act="up" data-k="${esc(k)}">${icon("thumbUp", 15)}<span>Bagus</span></button>
        <button type="button" role="menuitem" class="vote" data-act="down" data-k="${esc(k)}">${icon("thumbDown", 15)}<span>Kurang tepat</span></button>
      </div>
    </div>
  </div>`;
}

const zipBar = (key, n) =>
  `<div class="zipbar"><button type="button" class="sb pri" data-act="zip" data-key="${esc(key)}">${icon("archive", 14)}<span>Unduh semua (${n} file) .zip</span></button></div>`;

export function renderMessage(content, key, cards = true) {
  const segs = resolve(parseMessage(content));
  const total = segs.filter((s) => s.type === "code" && cards && s.file).length;
  const files = [];
  let lastFile = -1;
  segs.forEach((s, i) => { if (s.type === "code" && cards && s.file) lastFile = i; });
  let h = "";
  let ci = 0;
  segs.forEach((s, i) => {
    if (s.type === "text") {
      h += md(s.text);
      return;
    }
    const k = key + ":" + ci++;
    s.k = k;
    const asFile = cards && s.file;
    if (asFile) files.push(s);
    store.set(k, { name: s.name, lang: s.lang, code: s.code, key, lines: s.lines });
    h += asFile ? fileCard(s, k) : inlineBlock(s, k);
    if (i === lastFile && total > 1) h += zipBar(key, total);
  });
  groups.set(key, files);
  return h;
}

export function compactHistory(list) {
  const idx = [];
  list.forEach((m, i) => { if (m.role === "assistant") idx.push(i); });
  const keep = new Set(idx.slice(-2));
  return list.map((m, i) => {
    if (m.role !== "assistant" || keep.has(i) || !String(m.content).includes("```")) return m;
    const out = resolve(parseMessage(m.content)).map((s) => {
      if (s.type === "text") return s.text;
      if (!s.file) return "```" + s.info + "\n" + s.code + "\n```";
      return `[file ${s.name}: ${s.lines} baris, isi tidak dikirim ulang]`;
    }).join("\n");
    return { ...m, content: out };
  });
}

export async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Tersalin", "ok");
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

function saveFile(it) {
  saveBlob(new Blob([it.code], { type: "text/plain;charset=utf-8" }), it.name.split("/").pop());
  toast("Mengunduh " + it.name.split("/").pop(), "ok");
}

function saveZip(key) {
  const files = groups.get(key) || [];
  if (!files.length) return;
  const tops = new Set(files.map((f) => (f.name.includes("/") ? f.name.split("/")[0] : "")));
  const top = tops.size === 1 ? [...tops][0] : "";
  saveBlob(makeZip(files.map((f) => ({ name: f.name, text: f.code }))), (top || "rhf-project") + ".zip");
  toast("Mengunduh " + files.length + " file (.zip)", "ok");
}

const SHIM = '<script>try{localStorage.getItem("x")}catch(e){var m={},s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null}};["localStorage","sessionStorage"].forEach(function(n){try{Object.defineProperty(window,n,{value:s,configurable:true})}catch(_){}})}<\/script>';

const DOC_CSS = 'body{font:16px/1.65 system-ui,sans-serif;margin:0;padding:20px;max-width:780px;margin:auto;color:#161a29;background:#fff}h2,h3,h4,h5{line-height:1.25}pre{background:#f4f5fb;border:1px solid #dfe3ef;border-radius:12px;padding:14px;overflow:auto;font:13px/1.6 ui-monospace,Menlo,monospace}code{background:#eef0f8;padding:1px 6px;border-radius:6px;font-size:.9em}pre code{background:none;padding:0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe3ef;padding:8px 10px;text-align:left}blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid #5b61f0;color:#5d6580}a{color:#5b61f0}img{max-width:100%}.tk-kw{color:#d6336c}.tk-f,.tk-k{color:#0b7ac7}.tk-s{color:#2f855a}.tk-n{color:#c05621}.tk-c{color:#8a92a8}.tk-t{color:#a16207}';

function renderDoc(code) {
  return parseMessage(code).map((s) => (s.type === "text" ? md(s.text) : `<pre><code>${highlight(s.code, s.info.trim().split(/\s+/)[0].toLowerCase())}</code></pre>`)).join("");
}

const inject = (h) =>
  /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + SHIM)
    : /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => SHIM + m)
      : SHIM + h;

function buildDoc(it, sib) {
  if (it.lang === "svg") {
    return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${it.code}</body>`;
  }
  if (it.lang === "md" || it.lang === "markdown") {
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${DOC_CSS}</style><body>${renderDoc(it.code)}</body>`;
  }
  const files = new Map(sib.map((f) => [f.name.split("/").pop(), f.code]));
  const pick = (u) => files.get(String(u).split("?")[0].split("#")[0].split("/").pop());
  let out = it.code.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = tag.match(/href=["']([^"']+)["']/i);
    const f = href && /stylesheet/i.test(tag) ? pick(href[1]) : undefined;
    return f !== undefined ? `<style>${f}</style>` : tag;
  });
  out = out.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
    const f = pick(src);
    return f === undefined ? tag : `<script${a}${b}>${f.replace(/<\/script/gi, "<\\/script")}<\/script>`;
  });
  return inject(out);
}

function ensureViewer() {
  if (viewer) return viewer;
  const el = document.createElement("div");
  el.className = "cv";
  el.innerHTML = `<div class="cvp" role="dialog" aria-modal="true">
    <div class="cvh">
      <div class="cvt"><b id="cvName"></b><span id="cvMeta"></span></div>
      <div class="cvtabs" id="cvTabs"><button type="button" data-t="code">Kode</button><button type="button" data-t="run">Hasil</button></div>
      <div class="cva">
        <button type="button" class="sb" data-a="copy">${icon("copy", 14)}<span>Salin</span></button>
        <button type="button" class="sb pri" data-a="dl">${icon("download", 14)}<span>Unduh</span></button>
        <button type="button" class="icb" data-a="x" aria-label="tutup">${icon("x", 20)}</button>
      </div>
    </div>
    <div class="cvfiles" id="cvFiles"></div>
    <div class="cvb" id="cvBody">
      <div class="cvcode"><div class="gut" id="cvGut"></div><pre><code id="cvSrc"></code></pre></div>
      <iframe id="cvRun" title="pratinjau" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    if (e.target === el) return closeViewer();
    const a = e.target.closest("[data-a]");
    const t = e.target.closest("[data-t]");
    const f = e.target.closest("[data-fk]");
    const it = store.get(cur.k);
    if (a) {
      if (a.dataset.a === "x") closeViewer();
      else if (a.dataset.a === "copy" && it) copyText(it.code);
      else if (a.dataset.a === "dl" && it) saveFile(it);
    } else if (t) {
      cur.tab = t.dataset.t;
      paintViewer();
    } else if (f) {
      if (f.dataset.fk === "zip") saveZip(it.key);
      else {
        cur.k = f.dataset.fk;
        if (!previewable(store.get(cur.k).lang)) cur.tab = "code";
        paintViewer();
      }
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) closeViewer(); });
  viewer = el;
  return el;
}

function paintViewer() {
  const el = viewer;
  const it = store.get(cur.k);
  if (!it) return;
  const files = groups.get(it.key) || [];
  const can = previewable(it.lang);
  if (!can) cur.tab = "code";
  el.querySelector("#cvName").textContent = it.name;
  el.querySelector("#cvMeta").textContent = `${it.lines} baris · ${fmtSize(new Blob([it.code]).size)}`;
  el.querySelector("#cvTabs").style.display = can ? "flex" : "none";
  el.querySelectorAll("#cvTabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === cur.tab));
  const fl = el.querySelector("#cvFiles");
  if (files.length > 1) {
    fl.style.display = "flex";
    fl.innerHTML = files.map((f) => `<button type="button" class="fchip${f.k === cur.k ? " on" : ""}" data-fk="${esc(f.k)}">${esc(f.name)}</button>`).join("") +
      `<button type="button" class="fchip zip" data-fk="zip">${icon("archive", 13)}<span>.zip</span></button>`;
  } else {
    fl.style.display = "none";
    fl.innerHTML = "";
  }
  el.querySelector("#cvSrc").innerHTML = highlight(it.code, it.lang);
  el.querySelector("#cvGut").textContent = Array.from({ length: it.lines }, (_, i) => i + 1).join("\n");
  const run = el.querySelector("#cvRun");
  const body = el.querySelector("#cvBody");
  body.classList.toggle("run", cur.tab === "run");
  if (cur.tab === "run") run.srcdoc = buildDoc(it, files.length ? files : [it]);
  else run.srcdoc = "";
  body.querySelector(".cvcode").scrollTop = 0;
}

function openViewer(k) {
  const el = ensureViewer();
  cur = { k, tab: "code" };
  paintViewer();
  el.classList.add("open");
}

function closeViewer() {
  if (!viewer) return;
  viewer.classList.remove("open");
  viewer.querySelector("#cvRun").srcdoc = "";
}

const votes = new Map();

function closePops(except) {
  document.querySelectorAll(".fpop.open").forEach((p) => { if (p !== except) p.classList.remove("open"); });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".fmenu")) closePops();
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePops(); });

function setVote(k, val) {
  const cur = votes.get(k);
  votes.set(k, cur === val ? null : val);
  document.querySelectorAll(`.fpop[data-pop="${CSS.escape(k)}"]`).forEach((p) => {
    p.querySelector('[data-act="up"]').classList.toggle("on", votes.get(k) === "up");
    p.querySelector('[data-act="down"]').classList.toggle("on", votes.get(k) === "down");
  });
  toast(votes.get(k) === "up" ? "Makasih masukannya" : votes.get(k) === "down" ? "Dicatat, makasih" : "Dibatalkan", "ok");
}

export function codeClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return false;
  if (b.dataset.act === "zip") {
    saveZip(b.dataset.key);
    return true;
  }
  if (b.dataset.act === "menu") {
    const pop = document.querySelector(`.fpop[data-pop="${CSS.escape(b.dataset.k)}"]`);
    const open = pop.classList.contains("open");
    closePops();
    pop.classList.toggle("open", !open);
    return true;
  }
  if (b.dataset.act === "up" || b.dataset.act === "down") {
    setVote(b.dataset.k, b.dataset.act);
    closePops();
    return true;
  }
  const it = store.get(b.dataset.k);
  if (!it) return false;
  if (b.dataset.act === "copy") { copyText(it.code); closePops(); }
  else if (b.dataset.act === "dl") { saveFile(it); closePops(); }
  else if (b.dataset.act === "view") openViewer(b.dataset.k);
  return true;
}

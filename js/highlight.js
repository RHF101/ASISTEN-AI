const KW = new Set(("abstract as async await break case catch class const continue debugger default defer del delete do elif else enum except export extends extern false final finally fn for from func function get global go goto if impl implements import in instanceof interface is lambda let loop match mod mut namespace new nil none None not null of or override package pass pub raise readonly ref return self set static struct super switch template this throw throws trait true True try type typedef typeof union unsafe use using var virtual void volatile where while with yield and print echo section global_start int long short char float double bool boolean string byte unsigned signed auto register inline sizeof signal onready tool extends class_name").split(" "));

const HASH = new Set(["py", "python", "sh", "bash", "shell", "zsh", "yaml", "yml", "rb", "ruby", "toml", "gd", "gdscript", "dockerfile", "makefile", "ini", "env", "conf", "r", "pl", "perl"]);
const SLASH = new Set(["js", "javascript", "jsx", "mjs", "ts", "typescript", "tsx", "java", "c", "cpp", "cc", "h", "hpp", "cs", "csharp", "go", "rs", "rust", "kt", "kotlin", "swift", "php", "dart", "scala", "json", "jsonc", "glsl", "shader", "vue", "svelte"]);
const BACKTICK = new Set(["js", "javascript", "jsx", "mjs", "ts", "typescript", "tsx", "go", "vue", "svelte"]);
const TRIPLE = new Set(["py", "python"]);
const ASM = new Set(["asm", "nasm", "s"]);
const SQL = new Set(["sql", "mysql", "postgres", "sqlite"]);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const wrap = (cls, s) => `<span class="tk-${cls}">${esc(s)}</span>`;

function scan(code, lang) {
  const parts = [];
  if (SLASH.has(lang)) parts.push("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/");
  else if (HASH.has(lang)) parts.push("#[^\\n]*");
  else if (SQL.has(lang)) parts.push("--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/");
  else if (ASM.has(lang)) parts.push(";[^\\n]*");
  else parts.push("\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#[^\\n]*");
  const strs = [];
  if (TRIPLE.has(lang)) strs.push('"""[\\s\\S]*?"""', "'''[\\s\\S]*?'''");
  strs.push('"(?:\\\\.|[^"\\\\\\n])*"', "'(?:\\\\.|[^'\\\\\\n])*'");
  if (BACKTICK.has(lang) || !lang) strs.push("`(?:\\\\.|[^`\\\\])*`");
  const re = new RegExp(`(${parts[0]})|(${strs.join("|")})|(\\b0x[\\da-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)`, "g");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] !== undefined) out += wrap("c", m[0]);
    else if (m[2] !== undefined) {
      const after = code.slice(re.lastIndex).match(/^\s*:/);
      out += wrap(lang === "json" && after ? "k" : "s", m[0]);
    } else if (m[3] !== undefined) out += wrap("n", m[0]);
    else {
      const w = m[0];
      const next = code[re.lastIndex];
      if (KW.has(w)) out += wrap("kw", w);
      else if (next === "(") out += wrap("f", w);
      else if (/^[A-Z][A-Za-z0-9_]*$/.test(w) && w.length > 1) out += wrap("t", w);
      else out += esc(w);
    }
  }
  return out + esc(code.slice(last));
}

function css(code) {
  const re = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[0-9a-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|(@[\w-]+)|([\w-]+)(?=\s*:)|(--[\w-]+)/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) out += wrap("c", m[0]);
    else if (m[2]) out += wrap("s", m[0]);
    else if (m[3]) out += wrap("n", m[0]);
    else if (m[4]) out += wrap("n", m[0]);
    else if (m[5]) out += wrap("kw", m[0]);
    else if (m[6] || m[7]) out += wrap("k", m[0]);
  }
  return out + esc(code.slice(last));
}

function markup(code) {
  const re = /(<!--[\s\S]*?-->)|(<\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {
      out += wrap("c", m[1]);
      continue;
    }
    out += esc(m[2]) + wrap("kw", m[3]);
    out += m[4].replace(/(\s+)([^\s=>\/]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g, (_, sp, name, eq, val) =>
      esc(sp) + wrap("f", name) + (eq ? esc(eq) + wrap("s", val) : ""));
    out += esc(m[5]);
  }
  return out + esc(code.slice(last));
}

function html(code) {
  const re = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += markup(code.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) out += markup(m[1]) + scan(m[2], "js") + markup(m[3]);
    else out += markup(m[4]) + css(m[5]) + markup(m[6]);
  }
  return out + markup(code.slice(last));
}

export function highlight(code, lang) {
  const l = String(lang || "").toLowerCase();
  if (code.length > 120000) return esc(code);
  try {
    if (["html", "htm", "xml", "svg", "xhtml"].includes(l)) return html(code);
    if (["css", "scss", "less"].includes(l)) return css(code);
    if (["md", "markdown", "txt", "text", "plain", "log", "csv"].includes(l)) return esc(code);
    return scan(code, l);
  } catch {
    return esc(code);
  }
}

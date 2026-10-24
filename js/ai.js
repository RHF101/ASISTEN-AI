import { loadSettings } from "./config.js";
import { describeImage } from "./vision.js";

const GROQ = "https://api.groq.com/openai/v1";

function mkErr(name, r, j) {
  const e = new Error(`${name} ${r.status}: ${j?.error?.message || r.statusText}`);
  e.status = r.status;
  return e;
}

async function withKeys(keys, activeId, rotate, label, fn) {
  if (!keys.length) throw new Error(`${label} key kosong — isi di settings.html`);
  const ordered = [...keys.filter((k) => k.id === activeId), ...keys.filter((k) => k.id !== activeId)];
  const list = rotate ? ordered : ordered.slice(0, 1);
  let last;
  for (const k of list) {
    try { return await fn(k.key); }
    catch (e) {
      last = e;
      const bad = [401, 403, 429].includes(e.status) || (e.status === 400 && /api key/i.test(e.message));
      if (!bad) throw e;
    }
  }
  throw last;
}

const today = () => new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

function buildSystem(s, o) {
  if (o.system !== undefined) return o.system;
  const parts = [];
  if (s.system) parts.push(s.system);
  parts.push("Hari ini: " + today() + ". Pengetahuanmu punya batas waktu dan bisa usang soal teknologi, versi, harga, berita, dan penemuan baru. Jangan menebak hal seperti itu; kalau tidak ada hasil pencarian web, katakan perlu dicek.");
  if (o.memory) parts.push(o.memory);
  if (o.web) parts.push("Pakai pencarian web untuk info terbaru dan sebut sumbernya singkat.");
  if (o.localImage) parts.push("Kamu tidak melihat gambar langsung. Kamu menerima hasil OCR dan analisis warna serta pola yang dibaca di perangkat. Jangan mengarang objek yang tidak ada di data; jujur kalau hanya bisa menebak.");
  if (o.images?.length) parts.push("Untuk gambar: salin teks persis apa adanya, jelaskan pola dan detail dengan teliti, katakan jika ada bagian yang tidak jelas.");
  return parts.join("\n\n");
}


const VISION_RE = /llama-4|scout|maverick|vision/i;
const webModel = (s) => (/gpt-oss/.test(s.groqModel) ? s.groqModel : "openai/gpt-oss-120b");

function hasVision(s) {
  const live = s.groqModels?.length ? s.groqModels.includes(s.groqVisionModel) : false;
  return live && VISION_RE.test(s.groqVisionModel || "");
}

export const canSeeImages = () => hasVision(loadSettings());

function askGroq(s, history, o) {
  const imgs = o.images || [];
  const web = !!o.web && !imgs.length;
  const msgs = [];
  const sys = buildSystem(s, { ...o, web });
  if (sys) msgs.push({ role: "system", content: sys });
  history.forEach((m, i) => {
    if (imgs.length && i === history.length - 1 && m.role === "user") {
      msgs.push({ role: "user", content: [
        { type: "text", text: m.content || "Jelaskan gambar ini." },
        ...imgs.map((im) => ({ type: "image_url", image_url: { url: im.dataUrl } }))
      ]});
    } else msgs.push({ role: m.role, content: m.content });
  });
  const body = { model: imgs.length ? s.groqVisionModel : web ? webModel(s) : s.groqModel, messages: msgs };
  if (web) { body.tools = [{ type: "browser_search" }]; body.tool_choice = "required"; }
  else body.temperature = 0.7;
  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const r = await fetch(GROQ + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Groq", r, j);
    const msg = j.choices?.[0]?.message || {};
    const found = [
      ...(msg.executed_tools || []).flatMap((t) => t.search_results?.results || []),
      ...(msg.annotations || []).map((a) => a.url_citation || a)
    ];
    const seen = new Set();
    const sources = found
      .filter((x) => x?.url && !seen.has(x.url) && seen.add(x.url))
      .slice(0, 6)
      .map((x) => ({ title: x.title || x.url, url: x.url }));
    return { text: msg.content || "(kosong)", sources };
  });
}

export async function askAI(history, o = {}) {
  const s = loadSettings();
  const imgs = o.images || [];
  if (!imgs.length) return askGroq(s, history, o);
  const last = history[history.length - 1];
  if (hasVision(s)) {
    if (!o.web) return askGroq(s, history, o);
    const seen = await askGroq(s, history, { images: imgs, memory: o.memory });
    const ask = last.content || "Jelaskan gambar ini dan cek info terbarunya.";
    const next = [...history.slice(0, -1), { role: "user", content: `Hasil membaca gambar:\n${seen.text}\n\nPermintaan user: ${ask}` }];
    return askGroq(s, next, { web: true, memory: o.memory });
  }
  const info = await describeImage(imgs[0], last.content);
  const ask = last.content || "Jelaskan gambar ini.";
  const next = [...history.slice(0, -1), { role: "user", content: `Hasil analisis gambar (dibaca di perangkat, bukan penglihatan langsung):\n${info}\n\nPermintaan user: ${ask}` }];
  return askGroq(s, next, { web: o.web, memory: o.memory, localImage: true });
}

export async function testProvider() {
  const s = loadSettings();
  const t0 = performance.now();
  const out = await askGroq(s, [{ role: "user", content: "balas satu kata: pong" }], { system: "" });
  return { ms: Math.round(performance.now() - t0), out: out.text.slice(0, 60) };
}

export async function listModels() {
  const s = loadSettings();
  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const r = await fetch(GROQ + "/models", { headers: { Authorization: "Bearer " + key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Groq", r, j);
    return (j.data || []).filter((m) => m.active !== false).map((m) => m.id)
      .filter((id) => !/whisper|tts|guard|orpheus|playai|safeguard/.test(id)).sort();
  });
}

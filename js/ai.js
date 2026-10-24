import { loadSettings } from "./config.js";

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
  parts.push("Hari ini: " + today() + ".");
  if (o.memory) parts.push(o.memory);
  if (o.web) parts.push("Pakai pencarian web untuk info terbaru dan sebut sumbernya singkat.");
  if (o.images?.length) parts.push("Untuk gambar: salin teks persis apa adanya, jelaskan pola dan detail dengan teliti, katakan jika ada bagian yang tidak jelas.");
  return parts.join("\n\n");
}

export function askAI(history, o = {}) {
  return askGroq(loadSettings(), history, o);
}

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
  const model = imgs.length ? s.groqVisionModel : web ? s.groqWebModel : s.groqModel;
  const body = { model, messages: msgs };
  if (!web) body.temperature = 0.7;
  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const r = await fetch(GROQ + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Groq", r, j);
    const msg = j.choices?.[0]?.message || {};
    const sources = (msg.executed_tools || [])
      .flatMap((t) => t.search_results?.results || [])
      .filter((x) => x.url)
      .slice(0, 6)
      .map((x) => ({ title: x.title || x.url, url: x.url }));
    return { text: msg.content || "(kosong)", sources };
  });
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

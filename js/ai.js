import { loadSettings } from "./config.js";
import { describeImage } from "./vision.js";

// GANTI ENDPOINT KE AIMLAPI
const GROQ = "https://api.aimlapi.com/v1"; 
function mkErr(name, r, j) { const e = new Error(`${name} ${r.status}: ${j?.error?.message || j?.message || r.statusText}`); e.status = r.status; return e; }

async function withKeys(keys, activeId, rotate, label, fn) {
  if (!keys.length) throw new Error(`${label} key kosong`);
  const ordered = [...keys.filter((k) => k.id === activeId), ...keys.filter((k) => k.id !== activeId)];
  const list = rotate ? ordered : ordered.slice(0, 1); let last;
  for (const k of list) {
    try { return await fn(k.key); } catch (e) { last = e; const bad = [401, 403, 429].includes(e.status); if (!bad) throw e; }
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
  return parts.join("\n\n");
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
    } else {
      msgs.push({ role: m.role, content: m.content });
    }
  });

  const limit = o.system !== undefined ? 1500 : Math.max(1000, Math.min(32000, +s.maxTokens || 6000));
  const body = { model: imgs.length ? s.groqVisionModel : s.groqModel, messages: msgs, max_tokens: limit, temperature: 0.7 };

  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "AIMLAPI", async (key) => {
    const res = await fetch(GROQ + "/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify(body)
    });
    
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw mkErr("AIMLAPI", res, j);
    
    const msg = j.choices?.[0]?.message || {};
    let text = msg.content || "(kosong)";
    return { text, sources: [], truncated: false };
  });
}

export async function askAI(history, o = {}) {
  const s = loadSettings();
  const imgs = o.images || [];
  if (!imgs.length) return askGroq(s, history, o);
  
  const last = history[history.length - 1];
  const info = await describeImage(imgs[0], last.content);
  const ask = last.content || "Jelaskan gambar ini.";
  const next = [...history.slice(0, -1), { role: "user", content: `Hasil analisis gambar:\n${info}\n\nPermintaan user: ${ask}` }];
  return askGroq(s, next, { ...o, web: false });
}

export async function testProvider() {
  const s = loadSettings();
  const t0 = performance.now();
  const out = await askGroq(s, [{ role: "user", content: "balas satu kata: pong" }], { system: "" });
  return { ms: Math.round(performance.now() - t0), out: out.text.slice(0, 60) };
}

export async function listModels() {
  return ["dolphin-mixtral-8x7b", "cognitivecomputations/dolphin-mixtral-8x7b", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"];
}

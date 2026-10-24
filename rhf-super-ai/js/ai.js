import { loadSettings } from "./config.js";

const GROQ = "https://api.groq.com/openai/v1";
const GGL = "https://generativelanguage.googleapis.com/v1beta";

function mkErr(name, r, j) {
  const e = new Error(`${name} ${r.status}: ${j?.error?.message || r.statusText}`);
  e.status = r.status;
  return e;
}
// coba key aktif dulu; kalau 401/403/429/key invalid → pindah key berikutnya (kalau rotate nyala)
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

// history: [{role,content}], img: {dataUrl,mime,b64}|null (nempel di pesan user terakhir)
export async function askAI(history, img = null) {
  const s = loadSettings();
  return s.provider === "google" ? askGoogle(s, history, img) : askGroq(s, history, img);
}

function askGroq(s, history, img) {
  const msgs = [];
  if (s.system) msgs.push({ role: "system", content: s.system });
  history.forEach((m, i) => {
    if (img && i === history.length - 1 && m.role === "user") {
      msgs.push({ role: "user", content: [
        { type: "text", text: m.content || "Jelaskan gambar ini." },
        { type: "image_url", image_url: { url: img.dataUrl } }
      ]});
    } else msgs.push({ role: m.role, content: m.content });
  });
  const model = img ? s.groqVisionModel : s.groqModel;
  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const r = await fetch(GROQ + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.7 })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Groq", r, j);
    return j.choices?.[0]?.message?.content || "(kosong)";
  });
}

function askGoogle(s, history, img) {
  const contents = history.map((m, i) => {
    const parts = [{ text: m.content || (img && i === history.length - 1 ? "Jelaskan gambar ini." : " ") }];
    if (img && i === history.length - 1 && m.role === "user")
      parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const body = { contents };
  if (s.system) body.systemInstruction = { parts: [{ text: s.system }] };
  return withKeys(s.googleKeys, s.googleKeyId, s.rotate, "Google", async (key) => {
    const r = await fetch(`${GGL}/models/${encodeURIComponent(s.googleModel)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Google", r, j);
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    if (!t) throw new Error("Google: respons kosong/diblok (" + (j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason || "?") + ")");
    return t;
  });
}

export async function testProvider(provider) {
  const s = { ...loadSettings(), provider, system: "" };
  const h = [{ role: "user", content: "balas satu kata: pong" }];
  const t0 = performance.now();
  const out = provider === "google" ? await askGoogle(s, h, null) : await askGroq(s, h, null);
  return { ms: Math.round(performance.now() - t0), out: out.slice(0, 60) };
}

// ambil daftar model asli dari API pakai key tersimpan
export async function listModels(provider) {
  const s = loadSettings();
  if (provider === "google") {
    return withKeys(s.googleKeys, s.googleKeyId, s.rotate, "Google", async (key) => {
      const r = await fetch(`${GGL}/models?pageSize=200&key=${encodeURIComponent(key)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw mkErr("Google", r, j);
      return (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((n) => /^gemini/.test(n) && !/embed|tts|image|live|audio|robotics/.test(n))
        .sort();
    });
  }
  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const r = await fetch(GROQ + "/models", { headers: { Authorization: "Bearer " + key } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw mkErr("Groq", r, j);
    return (j.data || []).filter((m) => m.active !== false).map((m) => m.id)
      .filter((id) => !/whisper|tts|guard|orpheus|playai|safeguard/.test(id)).sort();
  });
}

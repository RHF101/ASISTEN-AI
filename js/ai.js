import { loadSettings } from "./config.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// history: [{role:'user'|'assistant', content}], img: {dataUrl,mime,b64}|null (nempel di pesan user terakhir)
export async function askAI(history, img = null) {
  const s = loadSettings();
  return s.provider === "google" ? askGoogle(s, history, img) : askGroq(s, history, img);
}

async function askGroq(s, history, img) {
  if (!s.groqKey) throw new Error("Groq key kosong — isi di settings.html");
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
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.groqKey },
    body: JSON.stringify({ model: img ? s.groqVisionModel : s.groqModel, messages: msgs, temperature: 0.7 })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Groq " + r.status + ": " + (j.error?.message || r.statusText));
  return j.choices?.[0]?.message?.content || "(kosong)";
}

async function askGoogle(s, history, img) {
  if (!s.googleKey) throw new Error("Google API key kosong — isi di settings.html");
  const contents = history.map((m, i) => {
    const parts = [{ text: m.content || (img && i === history.length - 1 ? "Jelaskan gambar ini." : " ") }];
    if (img && i === history.length - 1 && m.role === "user")
      parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const body = { contents };
  if (s.system) body.systemInstruction = { parts: [{ text: s.system }] };
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(s.googleModel) + ":generateContent?key=" + encodeURIComponent(s.googleKey);
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google " + r.status + ": " + (j.error?.message || r.statusText));
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!t) throw new Error("Google: respons kosong/diblok (" + (j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason || "?") + ")");
  return t;
}

export async function testProvider(provider) {
  const old = loadSettings();
  const s = { ...old, provider };
  const t0 = performance.now();
  const out = provider === "google"
    ? await askGoogle(s, [{ role: "user", content: "balas satu kata: pong" }], null)
    : await askGroq(s, [{ role: "user", content: "balas satu kata: pong" }], null);
  return { ms: Math.round(performance.now() - t0), out: out.slice(0, 60) };
}

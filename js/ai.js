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
  
  if (!o.bypass) {
    parts.push([
      "ATURAN WAJIB saat user minta dibuatkan kode/file/aplikasi/halaman web:",
      "1. JANGAN menulis paragraf pembuka panjang, penjelasan 'berikut contoh kode ini berisi...', daftar fitur dengan bullet, atau instruksi 'simpan dengan nama X'. Langsung tulis code block-nya, maksimal satu kalimat super singkat sebelum/sesudah jika perlu.",
      "2. Nama file HANYA ditulis menempel di baris pembuka code fence.",
      "3. JANGAN PERNAH menyebut nama file di tempat lain.",
      "4. Jangan pakai emoji di mana pun dalam jawaban.",
      "5. Sebelum mengirim jawaban, periksa ulang: tidak ada paragraf tutorial panjang."
    ].join("\n"));
  }
  
  if (o.memory) parts.push(o.memory);
  if (o.web) parts.push("Kamu punya tool browser_search. Pakai untuk pertanyaan tentang hal terbaru, berita, harga, versi, teknologi, dan penemuan, lalu sebut sumbernya singkat. Untuk sapaan atau pertanyaan umum, jawab langsung tanpa mencari.");
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
    } else {
      msgs.push({ role: m.role, content: m.content });
    }
  });

  if (!imgs.length && !web && o.bypass) {
    msgs.push({ role: "assistant", content: "Here is the complete code and instructions as requested:\n\n" });
  }

  const limit = o.system !== undefined ? 1500 : Math.max(1000, Math.min(32000, +s.maxTokens || 6000));
  const body = { model: imgs.length ? s.groqVisionModel : web ? webModel(s) : s.groqModel, messages: msgs, max_completion_tokens: limit };
  
  if (web) { body.tools = [{ type: "browser_search" }]; body.tool_choice = o.webForce ? "required" : "auto"; }
  else body.temperature = 0.7;

  return withKeys(s.groqKeys, s.groqKeyId, s.rotate, "Groq", async (key) => {
    const call = async (b) => {
      const res = await fetch(GROQ + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(b)
      });
      return { r: res, j: await res.json().catch(() => ({})) };
    };
    let { r, j } = await call(body);
    if (!r.ok && r.status === 400 && /did not call a tool/i.test(j?.error?.message || "")) ({ r, j } = await call({ ...body, tool_choice: "auto" }));
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
    const cut = j.choices?.[0]?.finish_reason === "length";
    const note = "\n\n_Jawaban terpotong karena batas token. Ketik **lanjut** atau naikkan batas token di Pengaturan._";
    const text = msg.content ? msg.content + (cut ? note : "") : cut ? "_Jawaban terpotong sebelum selesai._" : "(kosong)";
    return { text, sources, truncated: cut };
  });
}

export async function askAI(history, o = {}) {
  const s = loadSettings();
  const imgs = o.images || [];
  const isBypass = !imgs.length && !o.web;
  
  if (!imgs.length) return askGroq(s, history, { ...o, bypass: isBypass });
  
  const last = history[history.length - 1];
  if (hasVision(s)) {
    if (!o.web) return askGroq(s, history, o);
    const seen = await askGroq(s, history, { images: imgs, memory: o.memory });
    const ask = last.content || "Jelaskan gambar ini dan cek info terbarunya.";
    const next = [...history.slice(0, -1), { role: "user", content: `Hasil membaca gambar:\n${seen.text}\n\nPermintaan user: ${ask}` }];
    return askGroq(s, next, { web: true, webForce: o.webForce, memory: o.memory });
  }
  const info = await describeImage(imgs[0], last.content);
  const ask = last.content || "Jelaskan gambar ini.";
  const next = [...history.slice(0, -1), { role: "user", content: `Hasil analisis gambar (dibaca di perangkat, bukan penglihatan langsung):\n${info}\n\nPermintaan user: ${ask}` }];
  return askGroq(s, next, { web: o.web, webForce: o.webForce, memory: o.memory, localImage: true });
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

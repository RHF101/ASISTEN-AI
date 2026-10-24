import { db } from "./firebase.js";
import { askAI } from "./ai.js";
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const MAX = 60;
const SECRET = /(password|passwd|sandi|api[ _-]?key|token|secret|kartu kredit|cvv|\bnik\b|\bktp\b|\bpin\b)/i;

const EXTRACT_PROMPT = "Kamu pengekstrak ingatan. Dari pesan user, ambil fakta pribadi yang stabil dan berguna jangka panjang: nama, pekerjaan, proyek yang dikerjakan, preferensi, alat atau perangkat yang dipakai, tujuan. Abaikan hal sesaat, pertanyaan umum, dan data rahasia seperti password, key, token, nomor kartu. Balas hanya JSON array berisi string pendek bahasa Indonesia, maksimal 3 item. Jika tidak ada, balas [].";

const col = (uid) => collection(db, "users", uid, "memory");
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export async function loadMemories(uid) {
  const snap = await getDocs(query(col(uid), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, text: d.data().text || "" })).filter((m) => m.text);
}

export async function addMemory(uid, text, list) {
  const ref = doc(col(uid));
  await setDoc(ref, { text, createdAt: serverTimestamp() });
  const next = [...list, { id: ref.id, text }];
  while (next.length > MAX) {
    const old = next.shift();
    await deleteDoc(doc(col(uid), old.id));
  }
  return next;
}

export async function removeMemory(uid, id) {
  await deleteDoc(doc(col(uid), id));
}

export async function clearMemories(uid, list) {
  await Promise.all(list.map((m) => deleteDoc(doc(col(uid), m.id))));
}

export function memoryBlock(list) {
  if (!list.length) return "";
  return "Ingatan tentang user dari sesi sebelumnya (pakai hanya bila relevan, jangan diumbar):\n" + list.map((m) => "- " + m.text).join("\n");
}

export function memoryCommand(text) {
  const t = text.trim();
  if (/^lupakan semua( ingatan)?\.?$/i.test(t)) return { type: "clear" };
  const m = t.match(/^(?:tolong\s+)?ingat(?:kan)?\s*(?::|bahwa\b)\s*(.{3,})$/is);
  return m ? { type: "add", text: m[1].trim().slice(0, 200) } : null;
}

export async function extractFacts(userText, reply, existing) {
  const out = await askAI(
    [{ role: "user", content: `Pesan user:\n${userText.slice(0, 800)}\n\nBalasan AI:\n${reply.slice(0, 400)}` }],
    { system: EXTRACT_PROMPT }
  );
  const m = out.text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr;
  try { arr = JSON.parse(m[0]); } catch { return []; }
  const have = existing.map((e) => norm(e.text));
  return arr
    .filter((x) => typeof x === "string")
    .map((x) => x.trim().slice(0, 160))
    .filter((x) => {
      const n = norm(x);
      return n.length > 3 && !SECRET.test(x) && !have.some((h) => h === n || h.includes(n) || n.includes(h));
    })
    .slice(0, 3);
}

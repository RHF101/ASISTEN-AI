export const firebaseConfig = {
  apiKey: "AIzaSyCE0U0a3BYVFG_-FEjTueyhx5zHf5oKNbU",
  authDomain: "rhfzero-d8771.firebaseapp.com",
  projectId: "rhfzero-d8771",
  storageBucket: "rhfzero-d8771.firebasestorage.app",
  messagingSenderId: "544364687625",
  appId: "1:544364687625:web:59cceb5cb5eb834088a3d8",
  measurementId: "G-JB7S1DVJN1"
};

export const SUPABASE_URL = "https://vphdsdnjgmicomvqnqdr.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwaGRzZG5qZ21pY29tdnFucWRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MTYyOTksImV4cCI6MjEwODM5MjI5OX0.fnWtfeK0uH_7j-gRGzu2gQyyeF_nPmm-Hk6grfV5yvw";

const KEY = "rhf_super_settings_v1";

export const BUILTIN_PROMPTS = [
  { id: "b-default", name: "Default", text: "Kamu RHF Super AI. Jawab singkat, jelas, bahasa mengikuti user. Kode selalu lengkap dan siap jalan." },
  { id: "b-coder", name: "Coder", text: "Kamu senior engineer. Jawab langsung dengan kode lengkap yang jalan, tanpa basa-basi. Sebut asumsi dalam satu baris." },
  { id: "b-short", name: "Singkat", text: "Jawab sesingkat mungkin, maksimal 3 kalimat kecuali user minta detail." },
  { id: "b-teacher", name: "Guru", text: "Jelaskan step by step dengan contoh sederhana, bahasa santai, cek pemahaman di akhir." },
  { id: "b-trans", name: "Penerjemah", text: "Terjemahkan teks user ke bahasa Indonesia. Kalau sudah bahasa Indonesia, terjemahkan ke Inggris. Keluarkan hasil terjemahan saja." }
];

// daftar awal — daftar asli diambil dari API lewat tombol "Ambil daftar model" di settings
export const GROQ_MODELS = ["openai/gpt-oss-120b"];

export const DEFAULTS = {
  groqModel: "openai/gpt-oss-120b",
  groqVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
  bucket: "chat-images",
  web: false,
  autoWeb: true,
  autoMemory: true,
  rotate: true,
  promptId: "b-default"
};

function raw() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
export function loadSettings() {
  const r = raw();
  const s = { ...DEFAULTS, ...r };
  s.groqKeys = Array.isArray(r.groqKeys) ? r.groqKeys : [];
  // migrasi key tunggal versi lama
  if (!s.groqKeys.length && r.groqKey) s.groqKeys = [{ id: "k-old-groq", label: "key lama", key: r.groqKey }];
  s.prompts = Array.isArray(r.prompts) ? r.prompts : [];
  s.allPrompts = [...BUILTIN_PROMPTS, ...s.prompts];
  const p = s.allPrompts.find((x) => x.id === s.promptId) || s.allPrompts[0];
  s.promptId = p.id;
  s.system = p.text; // prompt aktif ditanam jadi system prompt
  return s;
}
export function saveSettings(patch) {
  localStorage.setItem(KEY, JSON.stringify({ ...raw(), ...patch }));
}

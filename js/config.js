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
export const DEFAULTS = {
  provider: "groq",
  groqKey: "",
  googleKey: "",
  groqModel: "llama-3.3-70b-versatile",
  groqVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
  googleModel: "gemini-2.5-flash",
  bucket: "chat-images",
  system: "Kamu RHF Super AI. Jawab singkat, jelas, bahasa mengikuti user. Kode selalu lengkap."
};
export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...s }));
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { firebaseConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

export function requireUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      if (!u) location.replace("index.html");
      else resolve(u);
    });
  });
}
export async function logout() { await signOut(auth); location.replace("index.html"); }

# RHF Super AI

Static, tanpa build. Jalan di Vercel atau lokal (Termux): `python -m http.server 8080` lalu buka `http://localhost:8080`.
(ES module — tidak jalan kalau dibuka `file://`.)

Alur: `index.html` login -> `chat.html` -> `settings.html` isi key + tes.

## Setup sekali jalan

### 1. Firebase (rhfzero-d8771)
- Authentication -> Sign-in method -> aktifkan **Email/Password** dan **Google** (Google di sini hanya untuk login).
- Authentication -> Settings -> Authorized domains -> tambah domain Vercel kamu (dan `localhost` sudah default).
- Firestore Database -> buat database -> Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 2. Supabase (storage gambar saja)
SQL Editor -> run:

```sql
insert into storage.buckets (id, name, public) values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "chat-images public read" on storage.objects
  for select using (bucket_id = 'chat-images');

create policy "chat-images anon upload" on storage.objects
  for insert to anon with check (bucket_id = 'chat-images');
```

### 3. Key AI
Buka `settings.html` -> isi Groq key (console.groq.com) -> Simpan -> tombol Tes.
Nama model bisa diganti di settings kalau model lama dipensiunkan.

## Struktur
```
index.html     login/daftar/Google/reset password
chat.html      chat realtime (Firestore) + kirim gambar (Supabase)
settings.html  key, model, system prompt, tes Groq/Google/Supabase/Firestore
js/config.js   config Firebase + Supabase + penyimpanan settings (localStorage)
js/icons.js    icon SVG
js/memory.js   ingatan lintas sesi
js/vision.js   preset OCR dan pola
js/firebase.js init Firebase + Supabase client + guard login
js/ai.js       Groq (OpenAI-compatible, vision, web search)
js/ui.js       helper (escape, markdown mini, kompres gambar)
style.css
```

Data: `users/{uid}/chats/{chatId}` + subcollection `messages`. Gambar: bucket `chat-images/{uid}/{timestamp}.jpg`.

## Update 1
- Ingatan lintas sesi: koleksi `users/{uid}/memory` (rules lama sudah mencakup). Diekstrak otomatis dari obrolan (tombol otak), atau ketik `ingat: ...` / `lupakan semua`. Kelola lewat menu Ingatan di sidebar.
- Gambar: tombol Baca teks (OCR), Cari pola, Jelaskan muncul saat gambar dilampirkan. Pesan lanjutan yang menyebut gambar/foto/screenshot ikut membawa gambar terakhir.
- Internet (tombol globe): memakai `groq/compound-mini` (ganti lewat `groqWebModel` di localStorage `rhf_super_settings_v1`). Dilewati untuk pesan bergambar. Sumber tampil sebagai chip di bawah jawaban.

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

Kalau project Firebase dipakai bersama aplikasi lain, jangan timpa rules lama: tambahkan blok `match /users/{uid}/{document=**}` di atas ke dalam `match /databases/{database}/documents { ... }` yang sudah ada.

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
js/ui.js       helper (escape, markdown lengkap, toast, kompres gambar)
js/code.js     blok kode jadi kartu file, pratinjau, salin, unduh, zip
js/highlight.js pewarna sintaks (html, css, js, py, json, dll)
js/zip.js      pembuat file .zip tanpa library
style.css
```

Data: `users/{uid}/chats/{chatId}` + subcollection `messages`. Gambar: bucket `chat-images/{uid}/{timestamp}.jpg`.

## Update 1
- Ingatan lintas sesi: koleksi `users/{uid}/memory` (rules lama sudah mencakup). Diekstrak otomatis dari obrolan (tombol otak), atau ketik `ingat: ...` / `lupakan semua`. Kelola lewat menu Ingatan di sidebar.
- Gambar: tombol Baca teks (OCR), Cari pola, Jelaskan muncul saat gambar dilampirkan. Pesan lanjutan yang menyebut gambar/foto/screenshot ikut membawa gambar terakhir.
- Model: cukup satu, `openai/gpt-oss-120b`. Tekan "Ambil daftar model" di settings untuk memuat daftar yang benar-benar hidup di akunmu.
- Internet: tombol globe nyala = selalu cari web lewat tool `browser_search` bawaan gpt-oss (tanpa key tambahan). Mati = otomatis cari web hanya kalau pesan memuat kata seperti terbaru, sekarang, harga, versi, rilis, tahun 202x (daftar di `js/recency.js`). Sumber tampil sebagai chip di bawah jawaban.
- Gambar: gpt-oss tidak punya vision, jadi gambar dibaca di perangkat: OCR Tesseract.js (ind+eng, dimuat dari CDN saat pertama dipakai) plus ringkasan warna, simetri, dan peta warna 12x12 untuk membaca pola. Kalau suatu saat ada model vision hidup di daftar model, model itu dipakai otomatis.
- Tanggal dan tahun hari ini selalu masuk ke system prompt, beserta peringatan bahwa pengetahuan model bisa usang.

## Update 2
- Tampilan baru: tema gelap/terang otomatis, gradient, animasi halus, font Inter dan JetBrains Mono, layar sambutan dengan contoh perintah.
- Keluaran kode: kode pendek tampil sebagai blok berwarna dengan tombol Salin (dan Pratinjau untuk html/svg). Kode lebih dari 30 baris atau yang diberi nama file tampil sebagai kartu file dengan tombol Lihat, Salin, Unduh.
- Beberapa file dalam satu jawaban: muncul tombol Unduh semua (.zip).
- Pratinjau: jendela layar penuh dengan nomor baris, tab Kode dan Hasil, pindah antar file, tombol Salin dan Unduh. File html menjalankan css/js saudaranya dari jawaban yang sama di dalam sandbox.
- Prompt Default dan Coder berisi aturan kode lengkap, tanpa komentar, UI modern, satu blok per file dengan format pembuka seperti ```html index.html.
- Batas token jawaban bisa diatur di settings (default 6000). Kalau jawaban terpotong, ketik lanjut.
- Riwayat yang dikirim ke model memadatkan file lama (selain 2 jawaban terakhir) supaya hemat token.

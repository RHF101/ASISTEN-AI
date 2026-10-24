export const VISION_PRESETS = {
  ocr: {
    label: "Baca teks",
    prompt: "Baca semua teks pada gambar ini persis apa adanya (OCR). Pertahankan urutan baris dan tata letak. Tulis [tidak jelas] untuk bagian yang meragukan. Jangan menambah isi."
  },
  pola: {
    label: "Cari pola",
    prompt: "Analisis pola pada gambar ini: bentuk atau warna yang berulang, urutan, simetri, tata letak, dan tren jika ada grafik atau tabel. Jelaskan aturan polanya dan tebak kelanjutannya bila memungkinkan."
  },
  umum: {
    label: "Jelaskan",
    prompt: "Jelaskan isi gambar ini secara rinci: objek, teks yang terlihat, dan konteksnya."
  }
};

let tessP = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessP) {
    tessP = new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      el.onload = () => res(window.Tesseract);
      el.onerror = () => { tessP = null; rej(new Error("gagal memuat OCR")); };
      document.head.appendChild(el);
    });
  }
  return tessP;
}

async function ocr(dataUrl) {
  const T = await loadTesseract();
  const job = T.recognize(dataUrl, "ind+eng").then((r) => (r.data.text || "").trim());
  const limit = new Promise((_, rej) => setTimeout(() => rej(new Error("OCR lebih dari 90 detik")), 90000));
  return Promise.race([job, limit]);
}

function loadImg(dataUrl) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("gambar gagal dibaca"));
    i.src = dataUrl;
  });
}

function pixels(img, n) {
  const c = document.createElement("canvas");
  c.width = n; c.height = n;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, n, n);
  return x.getImageData(0, 0, n, n).data;
}

function colorName(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, d = mx - mn;
  if (l < 0.12) return "hitam";
  if (l > 0.9 && d < 40) return "putih";
  if (d < 28) return l < 0.4 ? "abu tua" : l < 0.7 ? "abu" : "abu muda";
  let h;
  if (mx === r) h = ((g - b) / d + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  const names = [[15, "merah"], [40, "oranye"], [65, "kuning"], [160, "hijau"], [200, "cyan"], [255, "biru"], [290, "ungu"], [340, "pink"], [361, "merah"]];
  const n = names.find(([m]) => h < m)[1];
  return l < 0.3 ? n + " tua" : l > 0.75 ? n + " muda" : n;
}

const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function analyze(img) {
  const P = pixels(img, 48), buckets = new Map();
  for (let i = 0; i < P.length; i += 4) {
    const k = (P[i] >> 6) * 16 + (P[i + 1] >> 6) * 4 + (P[i + 2] >> 6);
    const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += P[i]; b.g += P[i + 1]; b.b += P[i + 2];
    buckets.set(k, b);
  }
  const total = P.length / 4;
  const pal = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 4)
    .map((b, i) => ({ letter: "ABCD"[i], rgb: [b.r / b.n, b.g / b.n, b.b / b.n], pct: Math.round((b.n / total) * 100) }));

  const G = pixels(img, 12), rows = [];
  for (let y = 0; y < 12; y++) {
    let row = "";
    for (let x = 0; x < 12; x++) {
      const o = (y * 12 + x) * 4;
      let best = pal[0], bd = Infinity;
      for (const p of pal) {
        const d = (G[o] - p.rgb[0]) ** 2 + (G[o + 1] - p.rgb[1]) ** 2 + (G[o + 2] - p.rgb[2]) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      row += best.letter;
    }
    rows.push(row);
  }

  const S = pixels(img, 32), gray = (x, y) => { const o = (y * 32 + x) * 4; return (S[o] + S[o + 1] + S[o + 2]) / 3; };
  let lr = 0, tb = 0, br = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    lr += Math.abs(gray(x, y) - gray(31 - x, y));
    tb += Math.abs(gray(x, y) - gray(x, 31 - y));
    br += gray(x, y);
  }
  const n = 1024;
  return {
    pal, rows,
    sym: [Math.round((1 - lr / n / 255) * 100), Math.round((1 - tb / n / 255) * 100)],
    bright: Math.round((br / n / 255) * 100)
  };
}

export async function describeImage(im, ask) {
  const img = await loadImg(im.dataUrl);
  const a = analyze(img);
  const wantOcr = !/(pola|warna|simetri)/i.test(ask || "") || /(teks|baca|ocr|tulis)/i.test(ask || "");
  let text = "";
  if (wantOcr) {
    try { text = await ocr(im.dataUrl); }
    catch (e) { text = "(OCR gagal: " + e.message + ")"; }
  }
  const lines = [
    `Ukuran: ${img.naturalWidth}x${img.naturalHeight}.`,
    "Warna dominan: " + a.pal.map((p) => `${p.letter}=${hex(p.rgb)} (${colorName(...p.rgb)}, ${p.pct}%)`).join(", ") + ".",
    `Kecerahan rata-rata: ${a.bright}%. Simetri kiri-kanan: ${a.sym[0]}%. Simetri atas-bawah: ${a.sym[1]}%.`,
    "Peta warna 12x12 (huruf = warna dominan di atas, baris dari atas ke bawah):",
    ...a.rows
  ];
  if (wantOcr) lines.push("Teks terbaca (OCR):", text ? text.slice(0, 4000) : "(tidak ada teks terdeteksi)");
  return lines.join("\n");
}

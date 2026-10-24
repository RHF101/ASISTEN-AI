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

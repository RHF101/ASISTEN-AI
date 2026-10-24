const RE = /\b(terbaru|terkini|sekarang|saat ini|hari ini|tahun ini|tahun berapa|berita|harga|rilis|versi|update|baru saja|trending|viral|penemuan|teknologi|inovasi|202\d|203\d|latest|current|news|release)\b/i;

export const needsWeb = (t) => RE.test(t || "");

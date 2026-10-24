export const $ = (s, r = document) => r.querySelector(s);
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function md(s) {
  return String(s ?? "").split("```").map((p, i) =>
    i % 2
      ? "<pre><code>" + esc(p.replace(/^[\w+#.-]*\n/, "")) + "</code></pre>"
      : esc(p)
          .replace(/`([^`\n]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
          .replace(/\n/g, "<br>")
  ).join("");
}
export function toast(msg, kind = "") {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.className = "show " + kind; t.textContent = msg;
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3500);
}
// kompres gambar -> jpeg max 1280px, balikin {blob, dataUrl, mime, b64}
export function compressImage(file, max = 1280, q = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((blob) => {
        if (!blob) return reject(new Error("gagal kompres gambar"));
        const r = new FileReader();
        r.onload = () => resolve({ blob, dataUrl: r.result, mime: "image/jpeg", b64: String(r.result).split(",")[1] });
        r.readAsDataURL(blob);
      }, "image/jpeg", q);
    };
    img.onerror = () => reject(new Error("file bukan gambar valid"));
    img.src = u;
  });
}
export async function urlToImg(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("gagal ambil gambar");
  const blob = await r.blob();
  return compressImage(new File([blob], "x.jpg", { type: blob.type || "image/jpeg" }));
}

// Shrinks a plate photo before upload: at most 1600 px on the long side,
// re-encoded as JPEG. Phone photos are often 4000+ px and several MB, which is
// slow on mobile data and more than the AI needs. If the browser can't decode
// the image (HEIC on most non-Apple browsers, say), the original file is sent
// and the server deals with it.

const MAX_SIDE = 1600;
const QUALITY = 0.85;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("can't decode image"));
    };
    img.src = url;
  });
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));

export async function preparePhoto(file) {
  try {
    // Drawing an <img> applies the photo's EXIF rotation, so the JPEG comes
    // out the right way up.
    const img = await loadImage(file);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas);
    if (!blob) return file;
    // A small JPEG that needed no resizing can grow when re-encoded: keep it.
    if (scale === 1 && file.type === "image/jpeg" && file.size <= blob.size) return file;
    const name = `${(file.name || "plate").replace(/\.[^.]*$/, "")}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const SKIP_COMPRESSION_BELOW_BYTES = 400_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

export async function compressImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);

  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return original;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    return original;
  }

  const { width, height } = img;
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION && file.size < SKIP_COMPRESSION_BELOW_BYTES) {
    return original;
  }

  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const compressed = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return compressed.length < original.length ? compressed : original;
}

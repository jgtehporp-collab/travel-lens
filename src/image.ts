import { IMAGE_JPEG_QUALITY, IMAGE_MAX_EDGE } from "../shared/config";

export interface ProcessedImage {
  dataUrl: string; // 업로드/저장용 JPEG
  base64: string; // data: 접두어 제거
  thumb: string; // 기록 목록용 작은 썸네일
}

/**
 * EXIF 방향을 반영해 디코드한다.
 * createImageBitmap의 imageOrientation: "from-image"가 EXIF 회전을 적용하고,
 * 지원하지 않는 브라우저는 <img> 디코드(최신 Safari/Chrome은 자동으로 EXIF 적용)로 폴백.
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* HEIC 등 일부 형식은 폴백 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number): string {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다");
  ctx.fillStyle = "#fff"; // 투명 PNG → JPEG 변환 시 검은 배경 방지
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const src = await decode(file);
  const dataUrl = draw(src, IMAGE_MAX_EDGE, IMAGE_JPEG_QUALITY);
  const thumb = draw(src, 240, 0.7);
  if ("close" in src) src.close();
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1), thumb };
}

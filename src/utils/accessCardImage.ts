/**
 * ── صورُ «بطاقة الدخول»: رمز QR والبطاقة كاملة، وحفظُهما على الجوال والكمبيوتر ──
 *
 * لماذا لم يكن «QR ⬇» في الكرسي يحفظ شيئاً؟ كان يضع رابطَ `data:image/svg+xml` في
 * عنصر `<a download>` غير ملحقٍ بالصفحة ثم يضغطه. سفاري الآيفون لا يحفظ ملف SVG في
 * الصور (ولا يقبله واتساب)، ورابطُ data: من عنصرٍ معلّق يُتجاهل بصمت في بعض المتصفحات —
 * فلا شيء يحدث. والإصلاح هنا:
 *
 *  ١) الصورة PNG دائماً، تُرسم على canvas من مصفوفة الرمز نفسها (بلا تحميل صورة SVG).
 *  ٢) على الجوال (مؤشّر لمس) تُفتح ورقة المشاركة بملف الصورة — ومنها «حفظ الصورة»
 *     في الصور أو إرسالها مباشرة. ويُستدعى `navigator.share` قبل أي انتظار، لأن
 *     سفاري يرفض المشاركة إن انقطعت سلسلة لمسة المستخدم.
 *  ٣) وإلا (أو إن رُفضت المشاركة) تنزيلٌ عاديّ من رابط blob بعنصرٍ ملحقٍ بالصفحة.
 */

export type QrCode = { addData(text: string): void; make(): void; getModuleCount(): number; isDark(row: number, col: number): boolean };
export type QrFactory = (typeNumber: number, level: "L" | "M" | "Q" | "H") => QrCode;

/** المولّد المحلّي، يُحمَّل عند الطلب فلا يثقل الحزمة الأولى. */
export const loadQrFactory = (): Promise<QrFactory> => import("./qrcodeGenerator").then(mod => mod.default as unknown as QrFactory);

export function qrMatrix(factory: QrFactory, text: string): boolean[][] {
  const code = factory(0, "M");
  code.addData(text);
  code.make();
  const n = code.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => code.isDark(r, c)));
}

/** يرسم الوحدات الداكنة داخل مربع (x, y, size)؛ الحدود مقرّبة فلا تظهر خطوط بين الوحدات. */
export function drawQr(ctx: CanvasRenderingContext2D, matrix: boolean[][], x: number, y: number, size: number, ink = "#000000"): void {
  const n = matrix.length;
  if (!n) return;
  ctx.fillStyle = ink;
  for (let r = 0; r < n; r++) {
    const top = Math.round(y + (r * size) / n), bottom = Math.round(y + ((r + 1) * size) / n);
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      const left = Math.round(x + (c * size) / n), right = Math.round(x + ((c + 1) * size) / n);
      ctx.fillRect(left, top, right - left, bottom - top);
    }
  }
}

/** رمزٌ PNG بهامشٍ أبيض (أربع وحدات)؛ متزامن، فيصلح داخل لمسة المستخدم مباشرة. */
export function qrPngDataUrl(matrix: boolean[][], px = 1024, doc: Document = document): string {
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  const n = matrix.length || 1;
  const quiet = (px * 4) / (n + 8);
  drawQr(ctx, matrix, quiet, quiet, px - quiet * 2);
  return canvas.toDataURL("image/png");
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ""] = dataUrl.split(",");
  const type = /data:([^;,]+)/.exec(head)?.[1] || "application/octet-stream";
  if (!head.includes(";base64")) return new Blob([decodeURIComponent(body)], { type });
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type });
}

export type SaveEnv = {
  navigator: Pick<Navigator, "share" | "canShare"> | { share?: Navigator["share"]; canShare?: Navigator["canShare"] };
  document: Document;
  /** جهازُ لمس (جوال/لوحي): المشاركة أولاً. الكمبيوتر: تنزيلٌ مباشر. */
  touch: boolean;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};
export type SaveOutcome = "shared" | "downloaded" | "cancelled";

const browserEnv = (): SaveEnv => ({
  navigator,
  document,
  touch: typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
  createObjectURL: blob => URL.createObjectURL(blob),
  revokeObjectURL: url => URL.revokeObjectURL(url),
});

/**
 * يحفظ صورةً: ورقة المشاركة على الجوال، وإلا تنزيل. يجب أن يُستدعى مباشرةً من الضغطة
 * (لا انتظار قبله) حتى تبقى سلسلة اللمسة حيّة لسفاري.
 */
export async function saveImage(blob: Blob, fileName: string, title: string, env: SaveEnv = browserEnv()): Promise<SaveOutcome> {
  const nav = env.navigator as { share?: Navigator["share"]; canShare?: Navigator["canShare"] };
  if (env.touch && typeof nav.share === "function" && typeof File === "function") {
    const file = new File([blob], fileName, { type: blob.type || "image/png" });
    const data = { files: [file], title };
    if (typeof nav.canShare !== "function" || nav.canShare(data)) {
      try {
        await nav.share(data);
        return "shared";
      } catch (error: any) {
        if (error?.name === "AbortError") return "cancelled";
        /* NotAllowedError وغيره: انقطعت سلسلة اللمسة أو المشاركة ممنوعة — ننزّل بدلها. */
      }
    }
  }
  const href = env.createObjectURL(blob);
  const a = env.document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  env.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => env.revokeObjectURL(href), 30_000);
  return "downloaded";
}

/** نسخٌ إلى الحافظة، وبديلٌ قديم إن رفضتها الصفحة (سياقٌ غير آمن أو متصفح قديم). */
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* نجرّب البديل */ }
  try {
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = doc.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export type CardImageInput = {
  name: string;
  caption: string;
  displayUrl: string;
  hint: string;
  matrix: boolean[][];
  /** علامة SCHEDULE كما رُسمت في البطاقة على الشاشة (بألوانها المحسوبة). */
  mark?: SVGSVGElement | null;
};

/** صورة البطاقة 1200×1080: الرأس الداكن، والاسم، والسطر تحته، والرمز، والموقع. */
export async function renderAccessCardPng(input: CardImageInput, doc: Document = document): Promise<Blob> {
  try {
    await Promise.all([
      doc.fonts.load('400 28px "Plex Arabic"', "دعوة إلى مساحة عملكم"),
      doc.fonts.load('700 80px "Plex Arabic"', "SCHEDULE"),
    ]);
    await doc.fonts.ready;
  } catch { /* الخط الاحتياطي يكفي */ }
  const W = 1200, H = 1080;
  const canvas = doc.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#f4f2eb";
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 28); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, W, H, 28); ctx.clip();
  ctx.fillStyle = "#123e35"; ctx.fillRect(0, 0, W, 350);
  if (input.mark) {
    const source = input.mark;
    const mark = source.cloneNode(true) as SVGSVGElement;
    mark.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    mark.querySelectorAll("rect").forEach((rect, index) => {
      const original = source.querySelectorAll("rect")[index];
      if (!original) return;
      const computed = getComputedStyle(original);
      rect.style.fill = computed.fill;
      rect.style.stroke = computed.stroke;
      rect.style.strokeOpacity = computed.strokeOpacity;
      rect.style.strokeWidth = computed.strokeWidth;
    });
    try {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(mark))}`;
      await image.decode();
      ctx.drawImage(image, 52, 46, 252, 252);
    } catch { /* البطاقة بلا العلامة أفضل من لا بطاقة */ }
  }
  ctx.textAlign = "right"; ctx.direction = "rtl";
  ctx.font = '500 28px "Plex Arabic", sans-serif'; ctx.fillStyle = "#d5bd84"; ctx.fillText("دعوة إلى مساحة عملكم", 1090, 130);
  ctx.font = '700 68px "Plex Arabic", sans-serif'; ctx.fillStyle = "#ffffff"; ctx.fillText("SCHEDULE", 1090, 225);
  ctx.font = '400 28px "Plex Arabic", sans-serif'; ctx.fillStyle = "#e2e8e0"; ctx.fillText("نظام القرار الأكاديمي", 1090, 285);
  ctx.restore();
  const fit = (text: string, weight: number, start: number, min: number, max: number) => {
    let size = start;
    ctx.font = `${weight} ${size}px "Plex Arabic", sans-serif`;
    while (ctx.measureText(text).width > max && size > min) ctx.font = `${weight} ${--size}px "Plex Arabic", sans-serif`;
  };
  ctx.textAlign = "right"; ctx.direction = "rtl";
  ctx.fillStyle = "#123e35"; fit(input.name, 700, 38, 24, 1060); ctx.fillText(input.name, 1090, 465);
  ctx.fillStyle = "#68766e"; fit(input.caption, 400, 26, 18, 1060); ctx.fillText(input.caption, 1090, 525);
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(483, 588, 234, 234, 24); ctx.fill();
  drawQr(ctx, input.matrix, 500, 605, 200);
  ctx.textAlign = "center"; ctx.direction = "ltr";
  fit(input.displayUrl, 700, 40, 19, 1020);
  ctx.fillStyle = "#123e35"; ctx.fillText(input.displayUrl, 600, 900);
  ctx.direction = "rtl"; ctx.font = '400 26px "Plex Arabic", sans-serif'; ctx.fillStyle = "#68766e";
  ctx.fillText(input.hint, 600, 970);
  ctx.fillStyle = "#d5bd84"; ctx.fillRect(520, 1030, 160, 3);
  return dataUrlToBlob(canvas.toDataURL("image/png"));
}

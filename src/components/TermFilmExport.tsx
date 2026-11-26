/**
 * ── تصدير فيلم الفصل ─────────────────────────────────────────────────────────
 *
 * بطاقاتُ مشاركةٍ عمودية (9:16) لكل مشهد بصيغة PNG، وفيديو قصير حين يدعم المتصفّح
 * MediaRecorder وcanvas.captureStream. كلُّه يُرسم في المتصفّح من أرقام الفيلم نفسها
 * (TermFilmData) ولا يُرفع شيءٌ إلى أي خادم: الملفُّ يُنزَّل أو يُشارَك بيد صاحبه.
 */
import React, { useEffect, useRef, useState } from "react";
import { Download, Film, ImageDown, LoaderCircle, Share2, X } from "lucide-react";
import { filmScenes, TERM_FILM_BANDS, type TermFilmData, type TermFilmSceneKey } from "../utils/termFilm";
import "../styles/term-film-export.css";

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");
const BG_TOP = "#143730", BG_BOTTOM = "#0b1d19", BRASS = "#e2bd76", INK = "#f0f3ef", MUTED = "rgba(240,243,239,.66)", JADE = "#5fbfa6", RED = "#e06a55";
const SCENE_NAME: Record<TermFilmSceneKey, string> = { title: "العنوان", build: "بناء الجدول", wishes: "رغبات الأساتذة", clash: "التعارضات", students: "الطلبة", delivery: "التسليم", thanks: "الشكر" };

function fontFamily(): string {
  try { return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif"; } catch { return "system-ui, sans-serif"; }
}

/** يلفّ النص العربي على عرضٍ معلوم ويرسمه في المنتصف. يعيد ارتفاع ما رُسم. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4): number {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]}…`;
  shown.forEach((text, n) => ctx.fillText(text, x, y + n * lineHeight));
  return shown.length * lineHeight;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (ctx as any).roundRect === "function") (ctx as any).roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/** يرسم مشهداً واحداً عمودياً. t من 0 إلى 1 يحرّك العدّادات (1 = الرقم النهائي). */
export function drawShareScene(ctx: CanvasRenderingContext2D, film: TermFilmData, key: TermFilmSceneKey, W: number, H: number, t: number, index: number, total: number) {
  const u = W / 100, family = fontFamily();
  const font = (size: number, weight = 700) => { ctx.font = `${weight} ${Math.round(size * u)}px ${family}`; };
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, BG_TOP); g.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.08, 0, W * 0.8, H * 0.08, W * 0.9);
  glow.addColorStop(0, "rgba(226,189,118,.22)"); glow.addColorStop(1, "rgba(226,189,118,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const cx = W / 2, k = ease(t);

  /* الرأس: كلمة SCHEDULE ورقم المشهد. */
  ctx.fillStyle = BRASS; font(3.4, 800); ctx.direction = "ltr";
  ctx.fillText("SCHEDULE", cx, H * 0.07);
  ctx.direction = "rtl";
  ctx.fillStyle = MUTED; font(3, 600);
  ctx.fillText(`${SCENE_NAME[key]} · ${num(index + 1)} / ${num(total)}`, cx, H * 0.1);

  const eyebrow = (text: string, y = H * 0.24) => { ctx.fillStyle = BRASS; font(4.2, 700); wrap(ctx, text, cx, y, W * 0.84, 6 * u, 3); };
  const caption = (text: string, y: number) => { ctx.fillStyle = MUTED; font(4, 500); wrap(ctx, text, cx, y, W * 0.82, 6.2 * u, 4); };

  if (key === "title") {
    eyebrow(film.title[0], H * 0.36);
    ctx.fillStyle = INK; font(9, 800); wrap(ctx, film.title[1], cx, H * 0.48, W * 0.86, 11 * u, 3);
    if (!film.final) { ctx.fillStyle = BRASS; font(3.6, 600); ctx.fillText("قيد الإعداد · يُروى حتى اليوم", cx, H * 0.7); }
  } else if (key === "build" && film.build) {
    eyebrow(film.build.eyebrow, H * 0.2);
    const peak = Math.max(1, ...film.build.week.flat());
    const cols = 5, rows = TERM_FILM_BANDS.length, cell = W * 0.13, gap = W * 0.025;
    const gw = cols * cell + (cols - 1) * gap, x0 = cx + gw / 2, y0 = H * 0.25;
    for (let d = 0; d < cols; d += 1) for (let s = 0; s < rows; s += 1) {
      const v = film.build.week[d]?.[s] || 0, level = v ? Math.min(3, Math.ceil((v / peak) * 3)) : 0;
      const shown = k >= ((s * 5 + d) % 30) / 30;
      ctx.fillStyle = !shown || !level ? "rgba(255,255,255,.07)" : level === 3 ? BRASS : level === 2 ? JADE : "rgba(95,191,166,.45)";
      const x = x0 - (d + 1) * cell - d * gap, y = y0 + s * (cell * 0.62 + gap);
      ctx.beginPath(); rr(ctx, x, y, cell, cell * 0.62, u * 1.2); ctx.fill();
    }
    ctx.fillStyle = MUTED; font(3.2, 600);
    ["ح", "ن", "ث", "ر", "خ"].forEach((day, d) => ctx.fillText(day, x0 - (d + 0.5) * cell - d * gap, y0 + rows * (cell * 0.62 + gap) + 3.5 * u));
    film.build.trio.forEach((item, n) => {
      const y = H * 0.74 + n * 8.6 * u;
      ctx.fillStyle = INK; font(7, 800); ctx.textAlign = "right";
      ctx.fillText(num(item.value * k), W * 0.86, y);
      ctx.fillStyle = MUTED; font(3.8, 500); ctx.textAlign = "left";
      ctx.fillText(item.label, W * 0.14, y);
      ctx.textAlign = "center";
    });
  } else if (key === "wishes" && film.wishes) {
    eyebrow(film.wishes.eyebrow);
    const r = W * 0.26, cy = H * 0.48;
    ctx.lineWidth = u * 3.2; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = BRASS; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (film.wishes.pct / 100) * k); ctx.stroke();
    ctx.fillStyle = INK; font(14, 800); ctx.fillText(`${num(film.wishes.pct * k)}%`, cx, cy + 5 * u);
    caption(film.wishes.caption, H * 0.72);
  } else if (key === "clash" && film.clash) {
    eyebrow(film.clash.eyebrow);
    const value = film.clash.from + (film.clash.to - film.clash.from) * k;
    ctx.fillStyle = film.clash.to ? BRASS : INK; font(26, 800); ctx.fillText(num(value), cx, H * 0.47);
    const dots = Math.min(48, Math.max(0, film.clash.from)), per = 8, size = W * 0.055;
    for (let i = 0; i < dots; i += 1) {
      const fixed = i < dots - Math.min(dots, film.clash.to) && k >= (i + 1) / (dots + 1);
      ctx.fillStyle = fixed ? JADE : RED;
      const inRow = Math.min(per, dots - Math.floor(i / per) * per);
      const x = cx + ((inRow - 1) / 2 - (i % per)) * size * 1.3, y = H * 0.55 + Math.floor(i / per) * size * 1.3;
      ctx.beginPath(); ctx.arc(x, y, size / 2.4, 0, Math.PI * 2); ctx.fill();
    }
    caption(film.clash.caption, H * 0.74);
  } else if (key === "students" && film.students) {
    eyebrow(film.students.eyebrow);
    ctx.fillStyle = INK; font(26, 800); ctx.fillText(num(film.students.count * k), cx, H * 0.52);
    caption(film.students.caption, H * 0.64);
  } else if (key === "delivery") {
    eyebrow(film.delivery.eyebrow, H * 0.2);
    film.delivery.rows.slice(0, 5).forEach((row, n) => {
      const y = H * 0.3 + n * 11 * u, on = k >= (n + 1) / (film.delivery.rows.length + 1);
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.beginPath(); rr(ctx, W * 0.08, y - 6 * u, W * 0.84, 9 * u, u * 2); ctx.fill();
      ctx.textAlign = "right"; ctx.fillStyle = row.state === "done" && on ? JADE : MUTED; font(3.8, 700);
      ctx.fillText(`${row.state === "done" && on ? "✓ " : ""}${row.label}`, W * 0.89, y);
      ctx.textAlign = "left"; ctx.fillStyle = INK; font(3.4, 500);
      ctx.fillText(row.text.length > 26 ? `${row.text.slice(0, 25)}…` : row.text, W * 0.11, y);
      ctx.textAlign = "center";
    });
    ctx.fillStyle = INK; font(6.4, 800); wrap(ctx, film.delivery.headline, cx, H * 0.68, W * 0.84, 8 * u, 2);
  } else if (key === "thanks") {
    ctx.fillStyle = INK; font(9, 800); wrap(ctx, film.thanks[0], cx, H * 0.42, W * 0.84, 11 * u, 3);
    ctx.fillStyle = BRASS; ctx.fillRect(cx - W * 0.1, H * 0.56, W * 0.2 * k, u * 0.6);
    caption(film.thanks[1], H * 0.63);
  }
  /* التذييل: الفصل والنطاق. */
  ctx.fillStyle = MUTED; font(3.1, 500); ctx.textAlign = "center";
  wrap(ctx, [film.termName, film.scopeName].filter(Boolean).join(" · "), cx, H * 0.95, W * 0.84, 4.4 * u, 1);
}

interface Card { key: TermFilmSceneKey; url: string; blob: Blob; name: string }

const VIDEO_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
function videoType(): string | null {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder === "undefined") return null;
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: unknown };
  if (typeof canvas.captureStream !== "function") return null;
  return VIDEO_TYPES.find(type => { try { return MediaRecorder.isTypeSupported(type); } catch { return false; } }) || null;
}

const slug = (film: TermFilmData) => `term-film-${String(film.termName || "term").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}`;

function canShareFiles(file: File): boolean {
  try { return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); } catch { return false; }
}

export default function TermFilmExport({ film }: { film: TermFilmData }) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState<"" | "cards" | "video">("");
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<{ url: string; blob: Blob; name: string } | null>(null);
  const [error, setError] = useState("");
  const [type] = useState(videoType);
  const urls = useRef<string[]>([]);
  const cancelled = useRef(false);
  useEffect(() => { cancelled.current = false; return () => { cancelled.current = true; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; }; }, []);
  /* فيلمٌ آخر: ما صُدّر من الفيلم السابق لا يبقى. */
  useEffect(() => { setCards([]); setVideo(null); setError(""); }, [film]);

  const scenes = filmScenes(film);
  const keep = (blob: Blob) => { const url = URL.createObjectURL(blob); urls.current.push(url); return url; };

  const makeCards = async () => {
    setBusy("cards"); setError("");
    try {
      await (document as any).fonts?.ready;
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      const out: Card[] = [];
      for (let n = 0; n < scenes.length; n += 1) {
        drawShareScene(ctx, film, scenes[n].key, canvas.width, canvas.height, 1, n, scenes.length);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("no-blob");
        out.push({ key: scenes[n].key, blob, url: keep(blob), name: `${slug(film)}-${n + 1}.png` });
      }
      if (!cancelled.current) setCards(out);
    } catch { setError("تعذّر رسم البطاقات في هذا المتصفّح."); }
    finally { if (!cancelled.current) setBusy(""); }
  };

  const makeVideo = async () => {
    if (!type) return;
    setBusy("video"); setError(""); setProgress(0);
    try {
      await (document as any).fonts?.ready;
      const canvas = document.createElement("canvas") as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream };
      canvas.width = 720; canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      drawShareScene(ctx, film, scenes[0].key, canvas.width, canvas.height, 0, 0, scenes.length);
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      recorder.start(250);
      const per = 1800;
      const started = performance.now();
      await new Promise<void>(resolve => {
        const frame = (now: number) => {
          if (cancelled.current) { resolve(); return; }
          /* طابعُ الإطار قد يسبق لحظة البدء بقليل: لا زمنَ سالباً. */
          const elapsed = Math.max(0, now - started), n = Math.min(scenes.length - 1, Math.floor(elapsed / per));
          drawShareScene(ctx, film, scenes[n].key, canvas.width, canvas.height, (elapsed - n * per) / (per * 0.7), n, scenes.length);
          setProgress(Math.min(1, elapsed / (per * scenes.length)));
          if (elapsed >= per * scenes.length) { resolve(); return; }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();
      stream.getTracks().forEach(track => track.stop());
      await done;
      const mime = type.split(";")[0];
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error("empty");
      if (!cancelled.current) setVideo({ blob, url: keep(blob), name: `${slug(film)}.${mime === "video/mp4" ? "mp4" : "webm"}` });
    } catch { if (!cancelled.current) setError("تعذّر تسجيل الفيديو في هذا المتصفّح؛ البطاقات متاحة."); }
    finally { if (!cancelled.current) setBusy(""); }
  };

  const share = async (blob: Blob, name: string) => {
    const file = new File([blob], name, { type: blob.type });
    try { await navigator.share({ files: [file], title: film.title[0] }); } catch { /* أغلق صاحبه نافذة المشاركة */ }
  };
  const shareOne = (blob: Blob, name: string) => canShareFiles(new File([blob], name, { type: blob.type }));

  if (!open) return (
    <div className="tfx-bar">
      <button type="button" className="tf-copy" onClick={() => setOpen(true)} aria-expanded={false} data-guide-ignore="يفتح تصدير فيلم الفصل إلى بطاقات أو فيديو في المتصفّح؛ لا يرفع شيئاً">
        <Download aria-hidden="true" /><span>تصدير للمشاركة</span>
      </button>
    </div>
  );
  return (
    <section className="tfx" aria-label="تصدير فيلم الفصل">
      <header className="tfx-head">
        <div><b>تصدير للمشاركة</b><small>بطاقات عمودية 9:16 لكل مشهد{type ? "، وفيديو قصير" : ""}. يُرسم كلّه على جهازك ولا يُرفع شيء.</small></div>
        <button type="button" className="tfx-close" onClick={() => setOpen(false)} aria-label="أغلق التصدير" data-guide-ignore="يغلق لوحة تصدير الفيلم؛ لا يغيّر شيئاً"><X aria-hidden="true" /></button>
      </header>
      <div className="tfx-actions">
        <button type="button" className="tf-copy" onClick={() => void makeCards()} disabled={Boolean(busy)} data-guide-ignore="يرسم بطاقات مشاهد الفيلم PNG على الجهاز؛ لا يرفع شيئاً">
          {busy === "cards" ? <LoaderCircle className="tfx-spin" aria-hidden="true" /> : <ImageDown aria-hidden="true" />}<span>{cards.length ? "أعد رسم البطاقات" : "بطاقات المشاهد (PNG)"}</span>
        </button>
        {type ? (
          <button type="button" className="tf-copy" onClick={() => void makeVideo()} disabled={Boolean(busy)} data-guide-ignore="يسجّل فيديو قصيراً من مشاهد الفيلم على الجهاز؛ لا يرفع شيئاً">
            {busy === "video" ? <LoaderCircle className="tfx-spin" aria-hidden="true" /> : <Film aria-hidden="true" />}
            <span>{busy === "video" ? `يسجّل… ${num(progress * 100)}%` : video ? "أعد تسجيل الفيديو" : "فيديو قصير"}</span>
          </button>
        ) : <small className="tfx-note">هذا المتصفّح لا يسجّل الفيديو؛ البطاقات متاحة.</small>}
      </div>
      {error ? <p className="tfx-error" role="alert">{error}</p> : null}
      {video ? (
        <div className="tfx-video">
          <video src={video.url} controls playsInline muted />
          <div className="tfx-file">
            <a className="tf-copy" href={video.url} download={video.name} data-guide-ignore="ينزّل فيديو الفيلم من الجهاز نفسه"><Download aria-hidden="true" /><span>نزّل الفيديو</span></a>
            {shareOne(video.blob, video.name) ? <button type="button" className="tf-copy" onClick={() => void share(video.blob, video.name)} data-guide-ignore="يفتح نافذة المشاركة في الجهاز؛ صاحبه يختار ويرسل بنفسه"><Share2 aria-hidden="true" /><span>شارك</span></button> : null}
          </div>
        </div>
      ) : null}
      {cards.length ? (
        <ol className="tfx-cards" aria-label="بطاقات المشاهد">
          {cards.map((card, n) => (
            <li key={card.key}>
              <img src={card.url} alt={`بطاقة المشهد ${n + 1}: ${SCENE_NAME[card.key]}`} loading="lazy" />
              <div className="tfx-file">
                <a className="tfx-mini" href={card.url} download={card.name} aria-label={`نزّل بطاقة ${SCENE_NAME[card.key]}`} data-guide-ignore="ينزّل بطاقة المشهد من الجهاز نفسه"><Download aria-hidden="true" /></a>
                {shareOne(card.blob, card.name) ? <button type="button" className="tfx-mini" onClick={() => void share(card.blob, card.name)} aria-label={`شارك بطاقة ${SCENE_NAME[card.key]}`} data-guide-ignore="يفتح نافذة المشاركة في الجهاز؛ صاحبه يختار ويرسل بنفسه"><Share2 aria-hidden="true" /></button> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

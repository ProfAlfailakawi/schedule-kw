/**
 * ── مواضع الإعلانات على الشاشات الحقيقية ─────────────────────────────────────────────
 *
 * بدل مخطّطٍ مرسوم: لقطاتٌ حقيقية لـ«مساري» و«تذكرتي» وجدول القسم العام ولوحة الكادر (من الصندوق التجريبي، تُولَّد بأداة
 * `scripts/capture-ad-previews.ts`)، وإحداثياتُ كل موقعٍ كما قاسها المتصفحُ في الصفحة الفعلية. يوضع الإعلانُ التجريبي (أو لونُ امتلاء
 * الموقع) فوق الإحداثيات بمقياس اللقطة، فيُرى كما سيراه الطالب. إن غابت اللقطات يعود المخطّط القديم.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Payload, Slot } from "./shared";
import { SampleAd } from "./SampleAd";
import type { PreviewProps } from "./PlacementMap";

export interface PreviewSurface { image: string; width: number; height: number; title: string; slots: Record<string, { x: number; y: number; w: number; h: number }> }
export interface PreviewManifest { generatedAt: string; surfaces: Record<string, PreviewSurface> }

/** ترتيبُ العرض ووصفُ كل سطحٍ ونوعُه (جوالٌ أم حاسوب). */
const SURFACES: Array<{ key: string; group: "me" | "schedule" | "staff"; phone: boolean; title: string; note: string }> = [
  { key: "me", group: "me", phone: true, title: "«مساري» · الرئيسية", note: "أسفل بطاقاته مباشرة، لكل طلبة الجامعة، ويمكن حصره بكلية أو بمقررات الطالب." },
  { key: "ticket", group: "me", phone: true, title: "«تذكرتي» داخل «مساري»", note: "لحظاتٌ في جدول الطالب: وقت الفراغ، وبين محاضرتين في المبنى نفسه، وبعد آخر محاضرة، وراعي المقرر." },
  { key: "schedule", group: "schedule", phone: false, title: "الجدول العام وجدول الطلبة", note: "أسفل الجدول (روابط الجداول للعرض فقط). لا إعلان في بطاقة الأستاذ ولا الاستبيان." },
  { key: "staff", group: "staff", phone: false, title: "أعضاء هيئة التدريس والإداريين", note: "بطاقةٌ في لوحة الأساتذة والإداريين بعد تسجيل الدخول." },
];

let loading: Promise<PreviewManifest | null> | null = null;
/** يجلب بيان اللقطات مرةً واحدة؛ null إن غاب (فيعود المخطّط المرسوم). */
export function usePreviewManifest(): PreviewManifest | null | undefined {
  const [state, setState] = useState<PreviewManifest | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loading = loading || fetch("/ad-previews/manifest.json", { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : null))
      .then((m: PreviewManifest | null) => (m && m.surfaces && Object.keys(m.surfaces).length ? m : null))
      .catch(() => null);
    void loading.then(m => { if (live) setState(m); });
    return () => { live = false; };
  }, []);
  return state;
}

function SlotTone({ slot }: { slot: Slot }) {
  const cap = slot.exclusive ? 1 : slot.capacity;
  const ratio = slot.live / cap;
  const tone = ratio >= 1 ? "full" : ratio >= 0.6 ? "busy" : "free";
  return (
    <div className={`ad-slotblock ${tone}`} style={{ aspectRatio: `${slot.width}/${slot.height}` }} title={slot.where}>
      <b>{slot.label}</b>
      <small><bdi dir="ltr">{slot.width}×{slot.height}</bdi></small>
      <span className="ad-meter" aria-label={`${slot.live} من ${cap}`}>{Array.from({ length: cap }, (_, i) => <i key={i} className={i < slot.live ? "on" : ""} />)}</span>
    </div>
  );
}

/** هامشُ القصّ حول مواضع الإعلان: فوقها ما يدلّ على مكانها من الصفحة، وتحتها قليلٌ يُظهر أنها آخرُ ما فيها. */
const CROP_ABOVE = 170, CROP_BELOW = 48;

const SurfaceShot: React.FC<{ spec: typeof SURFACES[number]; surface: PreviewSurface; data: Payload; preview?: PreviewProps }> = ({ spec, surface, data, preview }) => {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const ids = Object.keys(surface.slots);
  /* لا تمرير داخل الإطار: يُقصّ حول المواضع نفسها فيُرى مكانُ كل إعلانٍ من الصفحة دون بحثٍ في لقطةٍ طويلة. */
  const top = Math.max(0, Math.min(...ids.map(id => surface.slots[id].y)) - CROP_ABOVE);
  const bottom = Math.min(surface.height, Math.max(...ids.map(id => surface.slots[id].y + surface.slots[id].h)) + CROP_BELOW);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setK(el.clientWidth / surface.width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [surface.width]);

  return (
    <figure className={`ad-surface ad-real-fig${spec.phone ? "" : " wide"}`}>
      <figcaption><b>{spec.title}</b><span>{spec.note}</span></figcaption>
      <div className={`ad-real-frame${spec.phone ? " phone" : ""}`} ref={box} dir="ltr" style={{ aspectRatio: `${surface.width}/${bottom - top}` }}>
        <div className="ad-real" style={{ top: -top * k }}>
          <img src={surface.image} alt={`لقطة حقيقية: ${spec.title}`} width={surface.width} height={surface.height} loading="lazy" decoding="async" />
          {k ? ids.map(id => {
            const slot = data.slots.find(s => s.id === id);
            const r = surface.slots[id];
            if (!slot) return null;
            const hot = preview?.hot === id;
            const number = preview?.numbers?.[id];
            return (
              <div
                key={id} className={`ad-real-slot${hot ? " hot" : ""}`} data-slot={id} dir="rtl" title={slot.where}
                style={{ left: r.x * k, top: r.y * k, width: r.w, transform: `scale(${k})` }}
                onMouseEnter={() => preview?.onHot?.(id)} onMouseLeave={() => preview?.onHot?.("")}
              >
                {preview?.sample ? <SampleAd brand={preview.sample} slot={slot} /> : <SlotTone slot={slot} />}
                {number ? <span className="ad-slotno" aria-hidden="true">{number}</span> : null}
              </div>
            );
          }) : null}
        </div>
      </div>
    </figure>
  );
};

export default function RealScreens({ data, manifest, preview }: { data: Payload; manifest: PreviewManifest; preview?: PreviewProps }) {
  const only = preview?.only;
  return (
    <div className="ad-map ad-real-map">
      {SURFACES.filter(s => manifest.surfaces[s.key] && (!only || s.group === only)).map(s => (
        <SurfaceShot key={s.key} spec={s} surface={manifest.surfaces[s.key]} data={data} preview={preview} />
      ))}
    </div>
  );
}

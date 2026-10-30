import React, { useEffect, useState } from "react";
import {
  ArrowDown, ArrowUp, Disc3, DoorOpen, Gauge, Grid3x3, Handshake, Magnet, Minus, Monitor, MousePointerClick,
  OctagonAlert, PenTool, Pencil, Plus, Repeat, Shuffle, Smartphone, Sparkles, Star, Tablet, TextCursorInput,
} from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import {
  ENTRY_BUCKETS, entryAverageSeconds, entryBlockedShare, normalizeEntryMonth, topEntryHelpers,
  type EntryBucket, type EntryDevice, type EntryMetricsMonth, type EntryMode, type HelperName,
} from "../utils/appointmentMeasure";

/**
 * ── «مقياس الكمال»: كم يأخذ الموعدُ الواحد — لمالك النظام ──────────────────────────
 *
 * لوحةٌ واحدة بلا شرح: متوسطُ الموعد بالثواني هذا الشهر وسهمُه عن الشهر الماضي، وتوزيعُ
 * المدة في خمسة أعمدة، ونسبةُ ما اصطدم بمانع، وأكثرُ الأدوات عوناً، والأجهزة، والجديدُ
 * مقابل التعديل. القياسُ مجهولُ الهوية (src/utils/appointmentMeasure.ts): أعدادٌ لا أسماء.
 * لا أزرار فيها؛ وإن لم يُجب الخادم (حسابٌ غير الرئيسي، أو خادمٌ قديم) لم تظهر أصلاً.
 */

/* المدى أرقاماً (معزولاً من اليسار إلى اليمين) ثم وحدتُه، فيُقرأ من اليمين «30–60ث» كما يُنطق. */
const BUCKET_LABEL: Record<EntryBucket, { range: string; unit: string }> = {
  lt30: { range: "0–30", unit: "ث" }, s30to60: { range: "30–60", unit: "ث" }, s60to120: { range: "1–2", unit: "د" },
  s120to300: { range: "2–5", unit: "د" }, gt300: { range: "5+", unit: "د" },
};
const BUCKET_SPOKEN: Record<EntryBucket, string> = {
  lt30: "أقل من نصف دقيقة", s30to60: "نصف دقيقة إلى دقيقة", s60to120: "دقيقة إلى دقيقتين", s120to300: "دقيقتان إلى خمس", gt300: "أكثر من خمس دقائق",
};
const HELPER_META: Record<HelperName, { label: string; icon: React.ReactNode }> = {
  "suggest-slots": { label: "اقتراح الأوقات", icon: <Sparkles aria-hidden="true" /> },
  usual: { label: "المعتاد", icon: <Repeat aria-hidden="true" /> },
  stick: { label: "لاصق بمحاضرتي", icon: <Magnet aria-hidden="true" /> },
  "room-suggest": { label: "اقتراح القاعة", icon: <DoorOpen aria-hidden="true" /> },
  borrow: { label: "الاستعارة", icon: <Handshake aria-hidden="true" /> },
  alternative: { label: "البديل", icon: <Shuffle aria-hidden="true" /> },
  "week-pick": { label: "نقرة الأسبوع", icon: <MousePointerClick aria-hidden="true" /> },
  "week-draw": { label: "رسم الأسبوع", icon: <PenTool aria-hidden="true" /> },
  "one-line": { label: "السطر الواحد", icon: <TextCursorInput aria-hidden="true" /> },
  pattern: { label: "النمط", icon: <Grid3x3 aria-hidden="true" /> },
  wheel: { label: "العجلة", icon: <Disc3 aria-hidden="true" /> },
  golden: { label: "الخانة الذهبية", icon: <Star aria-hidden="true" /> },
};
const DEVICE_META: Record<EntryDevice, { label: string; icon: React.ReactNode }> = {
  phone: { label: "هاتف", icon: <Smartphone aria-hidden="true" /> },
  tablet: { label: "لوحي", icon: <Tablet aria-hidden="true" /> },
  desktop: { label: "حاسوب", icon: <Monitor aria-hidden="true" /> },
};
const MODE_META: Record<EntryMode, { label: string; icon: React.ReactNode }> = {
  create: { label: "جديد", icon: <Plus aria-hidden="true" /> },
  edit: { label: "تعديل", icon: <Pencil aria-hidden="true" /> },
};

const nf = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
function monthName(month: string): string {
  const [year, index] = month.split("-").map(Number);
  if (!year || !index) return month;
  try {
    return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("ar-KW-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return month;
  }
}

const R = 15;
const C = 2 * Math.PI * R;
function ShareRing({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="entry-measure-ring" aria-hidden="true">
      <svg viewBox="0 0 36 36" focusable="false">
        <circle className="entry-measure-ring-track" cx="18" cy="18" r={R} />
        <circle className="entry-measure-ring-fill" cx="18" cy="18" r={R} strokeDasharray={`${((v / 100) * C).toFixed(2)} ${C.toFixed(2)}`} />
      </svg>
      <b>{nf(v)}%</b>
    </span>
  );
}

/** شريطٌ مقسوم: كلُّ قطعةٍ بنسبتها، وتحتها رمزُها ونسبتُها. */
function SplitBar<K extends string>({ parts, meta, label }: {
  parts: Array<{ key: K; count: number }>;
  meta: Record<K, { label: string; icon: React.ReactNode }>;
  label: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  const spoken = parts.map(part => `${meta[part.key].label} ${nf(percent(part.count, total))}%`).join("، ");
  return (
    <div className="entry-measure-split" role="img" aria-label={`${label}: ${spoken}`}>
      <div className="entry-measure-split-bar" aria-hidden="true">
        {parts.filter(part => part.count > 0).map(part => (
          <i key={part.key} data-part={part.key} style={{ flexGrow: part.count }} />
        ))}
      </div>
      <ul className="entry-measure-split-legend" aria-hidden="true">
        {parts.map(part => (
          <li key={part.key} data-part={part.key} title={meta[part.key].label}>
            {meta[part.key].icon}<b>{nf(percent(part.count, total))}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Load = { status: "loading" } | { status: "hidden" } | { status: "ready"; months: EntryMetricsMonth[] };

export default function AppointmentMeasureCard({ className }: { className?: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    fetch("/api/metrics/appointment-entry", { credentials: "include", cache: "no-store", signal: controller?.signal })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data: any) => {
        if (!alive) return;
        const months = (Array.isArray(data?.months) ? data.months : [])
          .map((row: any) => normalizeEntryMonth(String(row?.month || "").slice(0, 7), row))
          .filter((row: EntryMetricsMonth) => /^\d{4}-\d{2}$/.test(row.month));
        setLoad({ status: "ready", months });
      })
      .catch(() => { if (alive) setLoad({ status: "hidden" }); });
    return () => { alive = false; controller?.abort(); };
  }, []);

  if (load.status === "hidden") return null;
  const classes = `entry-measure-card${className ? ` ${className}` : ""}`;
  const head = (month?: string) => (
    <header className="entry-measure-head">
      <span className="entry-measure-icon" aria-hidden="true"><Gauge /></span>
      <h2>مقياس الكمال</h2>
      {month ? <small>{monthName(month)}</small> : null}
    </header>
  );
  if (load.status === "loading") {
    return <section className={`${classes} is-loading`} aria-busy="true" aria-label="مقياس الكمال">{head()}<div className="entry-measure-skeleton" aria-hidden="true" /></section>;
  }

  const months = load.months;
  const at = months.findIndex(month => month.count > 0);
  if (at < 0) {
    return (
      <section className={`${classes} is-empty`} aria-label="مقياس الكمال">
        {head(months[0]?.month)}
        <p className="entry-measure-empty"><Gauge aria-hidden="true" />لا قياس بعد</p>
      </section>
    );
  }

  const focus = months[at];
  const before = months[at + 1];
  const average = entryAverageSeconds(focus) ?? 0;
  const previous = before && before.count ? entryAverageSeconds(before) : null;
  const delta = previous === null ? null : average - previous;
  const trend = delta === null ? null : delta < 0 ? "faster" : delta > 0 ? "slower" : "same";
  const blocked = entryBlockedShare(focus) ?? 0;
  const helpers = topEntryHelpers(focus, 3);
  const peak = Math.max(1, ...ENTRY_BUCKETS.map(bucket => focus.buckets[bucket]));

  return (
    <section className={classes} aria-label="مقياس الكمال">
      {head(focus.month)}
      <div className="entry-measure-grid">
        <div className="entry-measure-tile entry-measure-hero">
          <p className="entry-measure-number">
            <b aria-hidden="true">{nf(average)}</b><small aria-hidden="true">ث</small>
            <span className="sr-only">{`متوسط الموعد ${countOf(average, AR.second)}`}</span>
          </p>
          {trend ? (
            <p className="entry-measure-trend" data-trend={trend} title={previous !== null && before ? `${monthName(before.month)}: ${nf(previous)}ث` : undefined}>
              {trend === "faster" ? <ArrowDown aria-hidden="true" /> : trend === "slower" ? <ArrowUp aria-hidden="true" /> : <Minus aria-hidden="true" />}
              <span className="sr-only">{trend === "faster" ? "أسرع من الشهر الماضي" : trend === "slower" ? "أبطأ من الشهر الماضي" : "كالشهر الماضي"}</span>
              <b dir="ltr">{nf(Math.abs(delta || 0))}ث</b>
            </p>
          ) : null}
          <small className="entry-measure-count">{countOf(focus.count, AR.appointment)}</small>
        </div>

        <div className="entry-measure-tile entry-measure-durations">
          <ol
            className="entry-measure-histogram"
            role="img"
            aria-label={`توزيع المدة: ${ENTRY_BUCKETS.map(bucket => `${BUCKET_SPOKEN[bucket]} ${nf(focus.buckets[bucket])}`).join("، ")}`}
          >
            {ENTRY_BUCKETS.map(bucket => (
              <li key={bucket} data-bucket={bucket} style={{ ["--bar" as any]: (focus.buckets[bucket] / peak).toFixed(3) }} aria-hidden="true">
                <em>{focus.buckets[bucket] ? nf(focus.buckets[bucket]) : ""}</em>
                <i />
                <small><bdi dir="ltr">{BUCKET_LABEL[bucket].range}</bdi>{BUCKET_LABEL[bucket].unit}</small>
              </li>
            ))}
          </ol>
        </div>

        <div className="entry-measure-tile entry-measure-blocked">
          <ShareRing value={blocked} />
          <p><OctagonAlert aria-hidden="true" /><span>اصطدم بمانع</span></p>
          <span className="sr-only">{`${nf(blocked)}% اصطدم بمانع`}</span>
        </div>

        <div className="entry-measure-tile entry-measure-helpers">
          {helpers.length ? (
            <ol>
              {helpers.map(row => {
                const share = percent(row.count, focus.count);
                return (
                  <li key={row.name} title={HELPER_META[row.name].label}>
                    <span className="entry-measure-helper-icon">{HELPER_META[row.name].icon}</span>
                    <span className="entry-measure-helper-name">{HELPER_META[row.name].label}</span>
                    <span className="entry-measure-helper-bar" aria-hidden="true"><i style={{ inlineSize: `${Math.max(4, share)}%` }} /></span>
                    <b>{nf(share)}%</b>
                  </li>
                );
              })}
            </ol>
          ) : <p className="entry-measure-none"><Sparkles aria-hidden="true" />—</p>}
        </div>

        <div className="entry-measure-tile entry-measure-devices">
          <SplitBar
            label="الأجهزة"
            meta={DEVICE_META}
            parts={(["phone", "tablet", "desktop"] as EntryDevice[]).map(key => ({ key, count: focus.devices[key] }))}
          />
        </div>

        <div className="entry-measure-tile entry-measure-modes">
          <SplitBar
            label="جديد وتعديل"
            meta={MODE_META}
            parts={(["create", "edit"] as EntryMode[]).map(key => ({ key, count: focus.modes[key] }))}
          />
        </div>
      </div>
    </section>
  );
}

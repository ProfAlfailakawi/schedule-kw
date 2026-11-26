/**
 * ── الحرم الحي على الرئيسية ──────────────────────────────────────────────────
 *
 * مباني الكلية من محاضرات اليوم التي تملكها الرئيسية أصلاً: المبنى يتنفّس مع
 * ساعة النهار، والقاعة التي فيها محاضرةٌ الآن تضيء، وعمودٌ أحمر يرتفع فوق مبنى
 * فيه تعارض قاعة (محاضرتان في القاعة نفسها في وقتٍ متداخل).
 *
 * الضغط على مبنى يفتح «الجدول الدراسي» والبحث السريع فيه على رمز المبنى — الطريق
 * نفسه الذي يستعمله «اختر ما يُغلق» (لا منطق تصفيةٍ جديد في المحرّك).
 *
 * المجسّم يُحمَّل كسولاً مع three.js كما يُحمَّل «نبض القاعات». ومن لا يدعم
 * متصفّحه WebGL، أو طلب تقليل الحركة، يرى خريطةً ساكنة بالمعلومات نفسها.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Sun, Moon } from "lucide-react";
import { campusFromToday, daylightAt, daylightLabel, type CampusTodayRow } from "../../utils/campusLive";
import { AR, countOf } from "../../utils/arabicCount";
import { seedScheduleQuickSearch } from "../../utils/actualDemandHandoff";

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduce(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

export default function CampusLiveCard({ today, weekend, canOpenSchedule, onNavigate }: {
  today: CampusTodayRow[];
  /** عطلة: القائمة قائمةُ الأحد، فلا شيء «يجري الآن». */
  weekend?: boolean;
  canOpenSchedule: boolean;
  onNavigate?: (view: string) => void;
}) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  /* الدقيقة تكفي: يُعاد الحساب حين تتغيّر القائمة أو كل دقيقة. */
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick(v => v + 1), 60_000); return () => window.clearInterval(id); }, []);
  const buildings = useMemo(() => campusFromToday(today, weekend ? null : nowMinutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, weekend, tick]);
  const daylight = daylightAt(nowMinutes);
  const reduce = useReducedMotion();
  const [webgl] = useState(() => typeof document !== "undefined" && canUseWebGL());
  const three = webgl && !reduce && buildings.length > 0;
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);

  const open = (code: string) => {
    if (!canOpenSchedule || !onNavigate) return;
    seedScheduleQuickSearch(code);
    onNavigate("schedules");
  };
  const openRef = useRef(open);
  openRef.current = open;

  const signature = buildings.map(b => `${b.code}:${b.halls.map(h => `${h.hall}${h.runningNow ? "*" : ""}${h.conflict ? "!" : ""}`).join(",")}`).join("|");
  useEffect(() => {
    if (!three || failed || !host.current || !canvas.current || !labels.current) return;
    let scene: { dispose: () => void } | null = null;
    let cancelled = false;
    import("./campusScene").then(({ CampusScene }) => {
      if (cancelled || !host.current || !canvas.current || !labels.current) return;
      try {
        scene = new CampusScene({
          canvas: canvas.current, host: host.current, labels: labels.current, buildings, daylight,
          onPick: canOpenSchedule ? code => openRef.current(code) : undefined,
        });
      } catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { cancelled = true; scene?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [three, failed, signature, canOpenSchedule]);

  if (!buildings.length) return null;
  const live = buildings.reduce((sum, b) => sum + b.runningNow, 0);
  const conflicts = buildings.reduce((sum, b) => sum + b.conflicts, 0);
  const night = daylight < 0.3;
  return (
    <section className={`cl-card${night ? " is-night" : ""}`} aria-labelledby="campus-live-title" style={{ ["--cl-day" as any]: daylight.toFixed(2) }}>
      <header className="cl-head">
        <span className="cl-mark" aria-hidden="true"><Building2 /></span>
        <div className="cl-title">
          <strong id="campus-live-title">الحرم الحي</strong>
          <small>{weekend ? "عطلة: مباني محاضرات الأحد" : `${countOf(buildings.length, AR.building)} من محاضرات اليوم`}</small>
        </div>
        <span className="cl-time" title="المباني تتنفّس مع ساعة اليوم">{night ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}{daylightLabel(nowMinutes)}</span>
      </header>
      <ul className="cl-legend" aria-label="مفتاح الحرم الحي">
        <li><i className="cl-dot live" aria-hidden="true" />محاضرة الآن · <b>{num(live)}</b></li>
        <li><i className="cl-dot used" aria-hidden="true" />قاعة فيها محاضرات اليوم</li>
        <li className={conflicts ? "has" : ""}><i className="cl-dot conflict" aria-hidden="true" />تعارض قاعة · <b>{num(conflicts)}</b></li>
      </ul>
      {three && !failed ? (
        <div className="cl-stage" ref={host} role="img" aria-label={`مجسّم الحرم: ${buildings.map(b => `${b.code}: ${countOf(b.halls.length, AR.room)}${b.runningNow ? `، ${num(b.runningNow)} الآن` : ""}${b.conflicts ? `، ${num(b.conflicts)} تعارض` : ""}`).join("؛ ")}`}>
          <canvas ref={canvas} />
          <div className="cl-labels" ref={labels} />
        </div>
      ) : null}
      <div className={`cl-map${three && !failed ? " is-compact" : ""}`} role="list" aria-label="مباني الحرم">
        {buildings.map(building => {
          const label = `مبنى ${building.code}: ${countOf(building.halls.length, AR.room)}، ${countOf(building.lectures, AR.lecture)} اليوم${building.runningNow ? `، ${num(building.runningNow)} الآن` : ""}${building.conflicts ? `، ${num(building.conflicts)} تعارض قاعة` : ""}`;
          const body = <>
            <span className="cl-b-code" dir="ltr">{building.code}</span>
            {building.conflicts ? <span className="cl-b-column" aria-hidden="true" /> : null}
            <span className="cl-b-halls" aria-hidden="true">
              {building.halls.slice(0, 24).map(hall => <i key={hall.key} className={hall.conflict ? "conflict" : hall.runningNow ? "live" : "used"} title={hall.hall} />)}
            </span>
            <span className="cl-b-meta">{countOf(building.lectures, AR.lecture)}{building.runningNow ? <> · <b className="live">{num(building.runningNow)} الآن</b></> : null}</span>
          </>;
          return <div role="listitem" key={building.code} className={`cl-building${building.conflicts ? " has-conflict" : ""}${building.runningNow ? " has-live" : ""}`}>
            {canOpenSchedule && onNavigate
              ? <button type="button" onClick={() => open(building.code)} aria-label={`${label} — افتح الجدول مصفّى على المبنى`} title="افتح الجدول مصفّى على المبنى" data-guide-ignore="مبنى في الحرم الحي يفتح الجدول الدراسي بالبحث السريع على رمزه؛ عرضٌ لا يكتب">{body}</button>
              : <div className="cl-building-static" aria-label={label}>{body}</div>}
          </div>;
        })}
      </div>
    </section>
  );
}

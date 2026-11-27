/**
 * ── «الحرم كله مدينة» ────────────────────────────────────────────────────────
 *
 * للعميد: أقسام الكلية كلها في مشهدٍ واحد، كل قسمٍ حيٌّ بمبانيه وقاعاته، يضيء
 * بحمله في ساعة المشهد. من فوق يُرى أين تختنق الكلية وأين تفرغ، وضغطةٌ على حيٍّ
 * تطير إليه ثم تفتح «نبض القاعات» لذلك القسم.
 *
 * البيانات هي ما تقرؤه بطاقة العميد أصلاً (سجلّ المواقع، وإشغال القاعات، ومواعيد
 * الكلية التي يقصرها الخادم على المعتمدة للعميد، والمقررات)، بلا مسارٍ جديد ولا
 * كتابة. على الهاتف وبلا WebGL خريطةٌ مسطّحة، وتحت المشهد دائماً قائمةٌ تُقرأ
 * وتُستعمل بلوحة المفاتيح وقارئ الشاشة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./hallPulse.css";
import "./campusCity.css";
import { FIT_LABEL, PULSE_DAYS, buildPulseModel, clockText, type FitClass, type PulseCourseInput, type PulseDay, type PulseRegistryInput, type PulseRowInput } from "../../utils/hallPulse";
import {
  DISTRICT_TONES, MOOD_LABEL, buildCampusCity, busiestCityMinute, cityAt, cityCurve, dayIndexOf, districtFocusHall, districtOrder, layoutCampus,
  type CampusDepartment, type CityMoment, type DistrictNow,
} from "../../utils/campusCity";
import { AR, countOf } from "../../utils/arabicCount";
import { isPhoneDevice } from "../../utils/workspaceSize";
import type { CampusScene as CampusSceneType, CampusDistrictVisual, CampusHallVisual } from "./campusScene";

export interface CampusOpen {
  dept: number;
  /** مفتاح القاعة في النبض (id:… أو tx:…)، ورقم سجلّها إن وُجد. */
  hallKey: string;
  roomId?: string;
  buildingCode: string;
  code: string;
  day: number;
  at: number;
}

export interface CampusCityProps {
  collegeId: number;
  termId: number;
  departments: CampusDepartment[];
  /** يُنادى بعد الطيران إلى الحي: الشاشة المضيفة تفتح نبض القسم (لا يكتب شيئاً). */
  onOpenDepartment: (open: CampusOpen) => void;
  heading?: string;
}

const FIT_HEX: Record<FitClass, number> = { pressed: 0xf0674f, full: 0xf0b24a, fit: 0x4fd3a1, wide: 0x6aa9d8, unknown: 0xa8b5af };
const FIT_GLYPH: Record<FitClass, string> = { pressed: "▲", full: "■", fit: "●", wide: "◆", unknown: "?" };
const MOOD_GLYPH = { choke: "▲", busy: "■", calm: "●", idle: "○" } as const;
const hex = (v: number) => `#${v.toString(16).padStart(6, "0")}`;

function prefersReduced(): boolean {
  try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; }
}

function useNarrow(query = "(max-width: 640px)"): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

function skyAt(minute: number, start: number, end: number): { top: string; mid: string } {
  const t = Math.max(0, Math.min(1, (minute - start) / Math.max(1, end - start)));
  const stops: Array<[number, number[], number[]]> = [
    [0, [0x23, 0x45, 0x5c], [0x10, 0x2c, 0x2c]],
    [0.45, [0x1f, 0x5a, 0x4e], [0x0d, 0x26, 0x21]],
    [1, [0x5a, 0x37, 0x3c], [0x14, 0x21, 0x22]],
  ];
  let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, a0, b0] = stops[i], [t1, a1, b1] = stops[i + 1];
  const k = (t - t0) / Math.max(1e-6, t1 - t0);
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(" ")})`;
  return { top: mix(a0, a1), mid: mix(b0, b1) };
}

function todayDefaults(dayStart: number, dayEnd: number): { day: PulseDay; minute: number; live: boolean } {
  const now = new Date();
  const idx = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  if (idx <= 4 && minute >= dayStart && minute < dayEnd) return { day: PULSE_DAYS[idx].key, minute: minute - (minute % 5), live: true };
  return { day: PULSE_DAYS[idx <= 4 ? idx : 0].key, minute: Math.max(dayStart, Math.min(dayEnd - 5, 10 * 60)), live: false };
}

/** سطر الحي المختصر: «▲ مضغوطة 2 · مشغولة 5 من 12». الأرقام قيمٌ بعد عناوينها فلا تُطابَق الصفات. */
function districtLine(d: DistrictNow): string {
  const parts: string[] = [];
  if (d.pressed) parts.push(`▲ مضغوطة ${d.pressed}`);
  parts.push(d.owned ? `مشغولة ${d.inUse} من ${d.owned}` : d.inUse ? `مشغولة ${d.inUse}` : "لا قاعة له");
  return parts.join(" · ");
}

/** نصّ قارئ الشاشة للحي كاملاً. */
function districtSpeech(name: string, d: DistrictNow): string {
  return [
    `${name}: ${MOOD_LABEL[d.mood]}`,
    `القاعات المشغولة الآن ${d.inUse}${d.owned ? ` من ${d.owned}` : ""}`,
    `المضغوطة ${d.pressed}`,
    `الفارغة من قاعاته ${d.empty}`,
  ].join("، ");
}

export default function CampusCity(props: CampusCityProps) {
  const { collegeId, termId } = props;
  const [registry, setRegistry] = useState<(PulseRegistryInput & { rooms?: any[] }) | null>(null);
  const [roomLoad, setRoomLoad] = useState<any>(null);
  const [rows, setRows] = useState<PulseRowInput[]>([]);
  const [courses, setCourses] = useState<PulseCourseInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* ── البيانات: المسارات نفسها التي يقرؤها نبض العميد، على الكلية كلها ── */
  useEffect(() => {
    if (!collegeId || !termId) { setLoading(false); return; }
    const controller = new AbortController();
    const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: "0", termId: String(termId) });
    const get = (url: string) => fetch(url, { credentials: "include", signal: controller.signal }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setLoading(true); setLoadError("");
    const registryRead = get(`/api/location-registry?${q}`);
    const loadRead = registryRead.then(reg => {
      const ids = (Array.isArray(reg?.rooms) ? reg.rooms : []).map((room: any) => String(room?.id || "")).filter(Boolean).slice(0, 400);
      const lq = new URLSearchParams(q);
      if (ids.length) lq.set("roomIds", ids.join(","));
      return get(`/api/reports/room-load?${lq}`);
    });
    Promise.all([
      registryRead, loadRead,
      get(`/api/schedules?${new URLSearchParams({ termId: String(termId), collegeId: String(collegeId) })}`),
      get("/api/courses"),
    ]).then(([reg, load, list, courseList]) => {
      if (controller.signal.aborted) return;
      setRegistry(reg); setRoomLoad(load);
      if (Array.isArray(list)) setRows(list.filter((r: any) => Number(r?.AdCollegeId || collegeId) === collegeId));
      else setLoadError("تعذّرت قراءة مواعيد الكلية.");
      setCourses(Array.isArray(courseList) ? courseList : []);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [collegeId, termId]);

  const deptKey = props.departments.map(d => `${d.id}:${d.name}`).join("|");
  const city = useMemo(() => {
    const model = buildPulseModel({
      rows, courses, registry, roomLoad,
      dayStart: Number(roomLoad?.dayStart) || 8 * 60, dayEnd: Number(roomLoad?.dayEnd) || 20 * 60,
      /* المدينة ترى القاعات الفارغة أيضاً: أين تفرغ الكلية سؤالٌ كأين تختنق. */
      includeUnusedRegistryHalls: true,
    });
    return buildCampusCity({ model, departments: props.departments, registryRooms: Array.isArray(registry?.rooms) ? registry!.rooms as any[] : [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, courses, registry, roomLoad, deptKey]);
  const model = city.model;

  const narrow = useNarrow();
  const phone = useMemo(isPhoneDevice, []);
  /* عرض المكان لا عرض الشاشة: لوحة الدوو المقسومة أو العمود الضيّق خريطةٌ مسطّحة أيضاً. */
  const shellRef = useRef<HTMLDivElement>(null);
  const [cramped, setCramped] = useState(false);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCramped(el.getBoundingClientRect().width < 720));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const reduced = useMemo(prefersReduced, []);
  const [flatChoice, setFlatChoice] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const twoD = phone || narrow || cramped;
  const flat = twoD || flatChoice || sceneFailed;

  const defaults = useMemo(() => todayDefaults(model.dayStart, model.dayEnd), [model.dayStart, model.dayEnd]);
  const [day, setDay] = useState<PulseDay>(defaults.day);
  const [minute, setMinute] = useState(defaults.minute);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [flying, setFlying] = useState<number | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  /* أول فتح: إن كانت الساعة الآن بلا محاضرات، تُفتح المدينة على أزحم لحظةٍ في اليوم بدل مدينةٍ مطفأة. */
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || loading || !model.halls.length) return;
    opened.current = true;
    setDay(defaults.day);
    if (cityAt(city, defaults.day, defaults.minute).total.inUse) { setMinute(defaults.minute); return; }
    const peak = busiestCityMinute(city, defaults.day);
    if (peak != null) { setMinute(peak); return; }
    for (const d of PULSE_DAYS) { const m = busiestCityMinute(city, d.key); if (m != null) { setDay(d.key); setMinute(m); return; } }
  }, [loading, city, model.halls.length, defaults]);

  const moment: CityMoment = useMemo(() => cityAt(city, day, minute), [city, day, minute]);
  const curve = useMemo(() => cityCurve(city, day), [city, day]);
  const order = useMemo(() => districtOrder(city, moment), [city, moment]);
  const toneOf = useCallback((dept: number) => DISTRICT_TONES[(city.districtOf.get(dept)?.tone ?? 0) % DISTRICT_TONES.length], [city]);

  /* ── المشهد ── */
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CampusSceneType | null>(null);
  const openRef = useRef<(dept: number) => void>(() => {});
  const layout = useMemo(() => layoutCampus(city), [city]);
  useEffect(() => {
    if (flat || loading || !model.halls.length) return;
    let alive = true;
    let scene: CampusSceneType | null = null;
    setSceneReady(false);
    import("./campusScene").then(({ CampusScene, campusWebglAvailable }) => {
      if (!alive || !canvasRef.current || !viewRef.current || !labelsRef.current) return;
      if (!campusWebglAvailable()) { setSceneFailed(true); return; }
      try {
        scene = new CampusScene({
          canvas: canvasRef.current, host: viewRef.current, labels: labelsRef.current, layout, reduced,
          hallDept: city.hallOwner, toneOf,
          onHover: dept => setHovered(dept),
          onPick: dept => openRef.current(dept),
        });
        sceneRef.current = scene;
        setSceneReady(true);
      } catch { setSceneFailed(true); }
    }).catch(() => setSceneFailed(true));
    return () => { alive = false; scene?.dispose(); sceneRef.current = null; };
  }, [flat, loading, layout, city, reduced, toneOf, model.halls.length]);

  /* ألوان القاعات وأمزجة الأحياء من اللحظة نفسها التي تُعدّ منها القائمة. */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const halls = new Map<string, CampusHallVisual>();
    for (const [key, h] of moment.halls) halls.set(key, { color: FIT_HEX[h.fit], level: h.level, occupied: h.occupied, pressed: h.fit === "pressed" && h.occupied, dept: city.hallOwner.get(key) || 0 });
    scene.setHalls(halls);
    const districts = new Map<number, CampusDistrictVisual>();
    for (const d of city.districts) {
      const now = moment.districts.get(d.dept.id)!;
      districts.set(d.dept.id, { mood: now.mood, load: now.load, tone: d.tone, label: d.dept.name, sub: `${MOOD_GLYPH[now.mood]} ${districtLine(now)}` });
    }
    scene.setDistricts(districts);
    scene.setTimeOfDay(minute, model.dayStart, model.dayEnd);
  }, [moment, minute, sceneReady, city, model.dayStart, model.dayEnd]);
  useEffect(() => { sceneRef.current?.setHovered(hovered); }, [hovered, sceneReady]);

  /* ── «شغّل اليوم»: الساعة تجري خمس دقائق كل خطوة؛ ومع تقليل الحركة خطوةٌ أبطأ بلا انزلاق ── */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setMinute(m => {
        const next = m + 5;
        if (next >= model.dayEnd - 5) { setPlaying(false); return model.dayEnd - 5; }
        return next;
      });
    }, reduced ? 700 : 190);
    return () => window.clearInterval(id);
  }, [playing, reduced, model.dayEnd]);

  /* ── الفتح: طيرانٌ إلى الحي ثم نبض القسم ── */
  const open = useCallback((dept: number) => {
    const district = city.districtOf.get(dept);
    if (!district || !dept) return;
    const key = districtFocusHall(city, moment, dept);
    const hall = key ? model.hallByKey.get(key) : null;
    const payload: CampusOpen = {
      dept, hallKey: key || "", roomId: hall?.roomId, buildingCode: hall?.buildingCode || "", code: hall?.code || "",
      day: dayIndexOf(day), at: minute,
    };
    setPlaying(false);
    setHovered(dept);
    setFlying(dept);
    const go = () => { setFlying(null); props.onOpenDepartment(payload); };
    if (sceneRef.current && !flat) sceneRef.current.flyTo(dept, go);
    else go();
  }, [city, moment, model.hallByKey, day, minute, flat, props]);
  openRef.current = open;

  const onStageKey = (e: React.KeyboardEvent) => {
    const scene = sceneRef.current;
    if (!scene || e.target !== e.currentTarget) return;
    if (e.key === "ArrowLeft") { scene.orbit(0.12, 0); e.preventDefault(); }
    else if (e.key === "ArrowRight") { scene.orbit(-0.12, 0); e.preventDefault(); }
    else if (e.key === "ArrowUp") { scene.orbit(0, -0.08); e.preventDefault(); }
    else if (e.key === "ArrowDown") { scene.orbit(0, 0.08); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { scene.zoomBy(0.88); e.preventDefault(); }
    else if (e.key === "-") { scene.zoomBy(1.14); e.preventDefault(); }
    else if (e.key === "0") { scene.resetView(); e.preventDefault(); }
  };

  const heading = props.heading || "الحرم كله";
  if (loading) return <div className="hp-shell" aria-busy="true"><div className="hp-skeleton" role="status"><div className="hp-skel-stage"><span className="hp-spinner" aria-hidden="true" /><span>يقرأ أقسام الكلية وقاعاتها…</span></div></div></div>;
  if (loadError) return <div className="hp-shell"><div className="hp-empty"><strong>تعذّر فتح الحرم كله</strong><span>{loadError}</span></div></div>;
  if (!model.halls.length) return (
    <div className="hp-shell"><div className="hp-empty">
      <strong>لا قاعات للكلية في هذا الفصل بعد</strong>
      <span>تظهر الأحياء حين تُسجَّل القاعات في سجل المباني والقاعات أو تُعتمد مواعيد الأقسام.</span>
    </div></div>
  );

  const sky = skyAt(minute, model.dayStart, model.dayEnd);
  const dayLabel = PULSE_DAYS.find(d => d.key === day)!.label;
  const shown = hovered ?? flying;
  const card = shown != null ? (() => {
    const d = city.districtOf.get(shown), now = moment.districts.get(shown);
    if (!d || !now) return null;
    return (
      <div className="cc-card" data-mood={now.mood} aria-hidden="true">
        <strong><i style={{ background: hex(toneOf(shown)) }} />{d.dept.name}</strong>
        <span className="cc-card-mood">{MOOD_GLYPH[now.mood]} {MOOD_LABEL[now.mood]}</span>
        <dl>
          <div><dt>مشغولة الآن</dt><dd>{now.inUse}</dd></div>
          <div data-tone="pressed"><dt>مضغوطة</dt><dd>{now.pressed}</dd></div>
          <div><dt>فارغة</dt><dd>{now.empty}</dd></div>
        </dl>
        <small>{flying === shown ? "يفتح نبض القسم…" : shown ? "اضغط لتنزل إلى نبض القسم" : "قاعاتٌ بلا قسمٍ معروف"}</small>
      </div>
    );
  })() : null;
  const peakBusy = Math.max(1, ...curve.map(p => p.busy));

  return (
    <div className="hp-shell cc-shell" dir="rtl" ref={shellRef}>
      <div className="hp-top">
        <div className="hp-title">
          <h2>{heading}</h2>
          <p>كل قسمٍ حيٌّ بمبانيه وقاعاته، يضيء بحمله في الساعة المختارة: من فوق ترى أين تختنق الكلية وأين تفرغ. اضغط حيّاً لتنزل إلى نبض قسمه. للقراءة فقط.</p>
        </div>
        {!twoD ? (
          <div className="hp-mode" role="group" aria-label="طريقة الرسم">
            <button data-guide-ignore="يبدّل رسم الحرم كله بين المجسّم والمسطّح؛ عرض فقط" type="button" aria-pressed={!flat} disabled={sceneFailed} onClick={() => setFlatChoice(false)} title={sceneFailed ? "تعذّر الرسم ثلاثي الأبعاد على هذا الجهاز" : undefined}>مجسّم</button>
            <button data-guide-ignore="يبدّل رسم الحرم كله بين المجسّم والمسطّح؛ عرض فقط" type="button" aria-pressed={flat} onClick={() => setFlatChoice(true)}>مسطّح</button>
          </div>
        ) : null}
      </div>

      <div className={`hp-stage cc-stage${flat ? " is-flat" : ""}${twoD ? " is-compact" : ""}`} style={{ ["--hp-sky-top" as any]: sky.top, ["--hp-sky-mid" as any]: sky.mid }}>
        <div className={`hp-view cc-view${flat ? " is-flat" : ""}`} ref={viewRef} tabIndex={flat ? -1 : 0} onKeyDown={onStageKey}
          role={flat ? undefined : "application"} aria-label={flat ? undefined : "مجسّم الحرم كله: الأسهم للتدوير، و+ و− للتقريب، و0 للعودة. قائمة الأقسام بجانبه تفتح نبض كل قسم."}>
          {flat ? (
            <CityMap city={city} moment={moment} toneOf={toneOf} onOpen={open} hovered={hovered} onHover={setHovered} />
          ) : (
            <>
              <canvas ref={canvasRef} className={sceneReady ? "is-ready" : ""} aria-hidden="true" />
              <div className="hp-labels cc-labels" ref={labelsRef} aria-hidden="true" />
              {!sceneReady ? <div className="hp-loading"><span className="hp-spinner" aria-hidden="true" /> يبني المدينة…</div> : null}
              <div className="hp-view-tools">
                <button data-guide-ignore="يقرّب مشهد الحرم كله؛ عرض فقط" type="button" className="hp-icon" onClick={() => sceneRef.current?.zoomBy(0.86)} aria-label="تقريب">+</button>
                <button data-guide-ignore="يبعّد مشهد الحرم كله؛ عرض فقط" type="button" className="hp-icon" onClick={() => sceneRef.current?.zoomBy(1.16)} aria-label="تبعيد">−</button>
                <button data-guide-ignore="يعيد مشهد الحرم كله إلى منظره الكامل؛ عرض فقط" type="button" className="hp-icon" onClick={() => { sceneRef.current?.resetView(); setHovered(null); }} aria-label="عودة إلى المنظر الكامل">⟲</button>
              </div>
              {card}
            </>
          )}
        </div>

        <aside className="hp-side cc-side" aria-label="أحياء الكلية الآن">
          <div className="cc-clock">
            <span className="hp-clock-time"><bdi dir="ltr">{clockText(minute)}</bdi></span>
            <small>{dayLabel}{defaults.live && day === defaults.day && Math.abs(minute - defaults.minute) < 5 ? " · الآن" : ""}</small>
          </div>
          <div className="cc-totals" role="status" aria-live={playing ? "off" : "polite"}>
            <span>مشغولة <b>{moment.total.inUse}</b> من {moment.total.halls}</span>
            <span data-tone="pressed">مضغوطة <b>{moment.total.pressed}</b></span>
            <span>فارغة <b>{moment.total.empty}</b></span>
          </div>
          <ol className="cc-list">
            {order.map(d => {
              const now = moment.districts.get(d.dept.id)!;
              const can = d.dept.id > 0;
              return (
                <li key={d.dept.id} data-mood={now.mood} className={hovered === d.dept.id ? "is-lit" : ""}>
                  <button data-guide-ignore="يطير إلى حيّ القسم ثم يفتح نبض قاعاته؛ قراءة فقط" type="button" disabled={!can || flying != null}
                    onClick={() => open(d.dept.id)} onMouseEnter={() => setHovered(d.dept.id)} onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(d.dept.id)} onBlur={() => setHovered(null)}
                    aria-label={`${districtSpeech(d.dept.name, now)}.${can ? " افتح نبض القسم." : ""}`}>
                    <i className="cc-swatch" style={{ background: hex(toneOf(d.dept.id)) }} aria-hidden="true" />
                    <span className="cc-name">{d.dept.name}</span>
                    <span className="cc-mood" aria-hidden="true">{MOOD_GLYPH[now.mood]} {MOOD_LABEL[now.mood]}</span>
                    <span className="cc-bar" aria-hidden="true"><i style={{ width: `${Math.round(now.load * 100)}%` }} /></span>
                    <small aria-hidden="true">{districtLine(now)}{now.empty ? ` · فارغة ${now.empty}` : ""}</small>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="hp-legend cc-legend">
            {(["pressed", "full", "fit", "wide"] as FitClass[]).map(f => <span key={f} data-tone={f}><i aria-hidden="true">{FIT_GLYPH[f]}</i>{FIT_LABEL[f]}</span>)}
            <span data-tone="empty"><i aria-hidden="true">○</i>فارغة</span>
            <small>عدد الطلبة تقدير: سعة المقرر لكل شعبة. المبنى المشترك يُرسم مرةً في حيّ القسم الغالب عليه، بشريطٍ مقسومٍ على أقسامه.</small>
          </div>
        </aside>

        <div className="hp-bar">
          <button data-guide-ignore="يجري ساعة الحرم كله على اليوم أو يوقفها؛ عرض فقط" type="button" className="hp-btn is-main hp-play" aria-pressed={playing}
            onClick={() => { if (playing) { setPlaying(false); return; } if (minute >= model.dayEnd - 10) setMinute(model.dayStart); setPlaying(true); }}>
            <span aria-hidden="true" className="hp-play-glyph">{playing ? "❚❚" : "▶"}</span>{playing ? "أوقف" : "شغّل اليوم"}
          </button>
          <label className="hp-range cc-range">
            <span className="hp-sr">الساعة</span>
            <span className="cc-curve" aria-hidden="true">
              {curve.map(p => <i key={p.minute} style={{ height: `${Math.round((p.busy / peakBusy) * 100)}%` }} data-over={p.pressed > 0 || undefined} />)}
            </span>
            <input data-guide-ignore="يحرّك ساعة الحرم كله؛ عرض فقط" type="range" min={model.dayStart} max={model.dayEnd - 5} step={5} value={minute}
              aria-valuetext={`${clockText(minute)}، القاعات المشغولة ${moment.total.inUse}`}
              onChange={e => { setMinute(Number(e.target.value)); setPlaying(false); }} />
          </label>
          <div className="hp-days" role="group" aria-label="اليوم">
            {PULSE_DAYS.map(d => (
              <button data-guide-ignore="يختار يوم الحرم كله؛ عرض فقط" key={d.key} type="button" aria-pressed={day === d.key} onClick={() => { setPlaying(false); setDay(d.key); }}>{d.short}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** الخريطة المسطّحة (الهاتف، وبلا WebGL، وباختيار القارئ): الأحياء بلاطاتٍ، والقاعات مربّعاتٌ بلون ملاءمتها. */
function CityMap({ city, moment, toneOf, onOpen, hovered, onHover }: {
  city: ReturnType<typeof buildCampusCity>; moment: CityMoment; toneOf: (dept: number) => number;
  onOpen: (dept: number) => void; hovered: number | null; onHover: (dept: number | null) => void;
}) {
  const byCode = new Map(city.buildings.map(b => [b.code, b]));
  return (
    <div className="cc-map">
      {city.districts.map(d => {
        const now = moment.districts.get(d.dept.id)!;
        const can = d.dept.id > 0;
        return (
          <section key={d.dept.id} className={`cc-plot${hovered === d.dept.id ? " is-lit" : ""}`} data-mood={now.mood} style={{ ["--cc-tone" as any]: hex(toneOf(d.dept.id)) }}
            onMouseEnter={() => onHover(d.dept.id)} onMouseLeave={() => onHover(null)} aria-label={d.dept.name}>
            <header>
              <strong>{d.dept.name}</strong>
              <span>{MOOD_GLYPH[now.mood]} {MOOD_LABEL[now.mood]} · {districtLine(now)}{d.buildings.length ? ` · ${countOf(d.buildings.length, AR.building)}` : ""}</span>
            </header>
            {d.buildings.length ? d.buildings.map(code => {
              const b = byCode.get(code)!;
              return (
                <div key={code} className="cc-block" aria-hidden="true">
                  <span className="cc-block-name">{b.label}{b.shared ? " · مشترك" : ""}</span>
                  {b.shared ? <span className="cc-share">{b.shares.map(s => <i key={s.dept} style={{ flex: s.weight, background: hex(toneOf(s.dept)) }} />)}</span> : null}
                  <span className="cc-rooms">
                    {b.halls.map(key => {
                      const h = moment.halls.get(key);
                      return <i key={key} data-tone={h?.occupied ? h.fit : "empty"}>{h?.occupied ? FIT_GLYPH[h.fit] : ""}</i>;
                    })}
                  </span>
                </div>
              );
            }) : <p className="cc-plot-empty">لا مبنى يغلب عليه القسم{d.halls.length ? `؛ ${d.halls.length === 1 ? "قاعته" : "قاعاته"} في مبانٍ مشتركة` : ""}.</p>}
            {can ? <button data-guide-ignore="يفتح نبض قاعات القسم؛ قراءة فقط" type="button" className="hp-btn cc-open" onClick={() => onOpen(d.dept.id)}>نبض القسم</button> : null}
          </section>
        );
      })}
    </div>
  );
}

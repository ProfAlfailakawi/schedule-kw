/**
 * ── «نبض القاعات» ────────────────────────────────────────────────────────────
 *
 * مباني القسم (أو الكلية) طوابقَ من القاعات، كل قاعةٍ تضيء حين تُشغل ولونها
 * يقول هل تناسب شعبتها. ساعةٌ تتحرّك على اليوم، وأيامٌ يُختار منها، وحرارة
 * أسبوع لكل قاعة. ولرئيس لجنة الجدول وحده: اقتراح قاعةٍ أنسب، و«رتّب قاعاتي»
 * ليومٍ كامل بمراجعةٍ واحدة، والاستعارة من القسم المجاور عبر طلب الاستعارة
 * الموجود. والحفظ يمرّ من مسار النقل المعتاد في الورشة (onSaveMoves) لا غيره.
 *
 * يُحمَّل كسولاً (HallPulseLazy): three.js وهذه الشاشة وأنماطها خارج الحزمة الأولى.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./hallPulse.css";
import {
  FIT_LABEL, PULSE_DAYS, applyPlan, buildPulseModel, clockText, fitClass, fitScore, layoutHalls, metrics,
  occupantsAt, foreignAt, originalAssignment, borrowCandidates, buildingLabelOf, planDay, planMoves, suggestHalls, toggleGroup, weeklyHeat, floorOf, slotStats, busiestMinute,
  type Assignment, type DayPlan, type FitClass, type PulseCourseInput, type PulseDay, type PulseHall, type PulseModel,
  type PulseRegistryInput, type PulseRowInput, type PulseSession,
} from "../../utils/hallPulse";
import { AR, countOf, type ArabicNoun } from "../../utils/arabicCount";
import type { HallVisual, InteriorData, PulseScene as PulseSceneType } from "./pulseScene";
import {
  beforeAfter, cinemaLegs, cinemaMinute, cinemaSteps, peakMoment, pressureAt, pressureCurve, seatLayout, soundLevels, worstMoment,
  type CinemaLeg, type HallState, type PressurePoint,
} from "../../utils/hallPulseDay";
import { PulseSound, readSoundChoice, soundAvailable, writeSoundChoice } from "./pulseSound";
import { HOP_FLAG_LABEL, HOP_KIND_LABEL, buildPaths, markerAt, nearerHalls, rankHops, type CohortInput, type Hop, type MovePath } from "../../utils/movementPaths";
import { loadPlanFacts } from "../../utils/planFactsCache";

export interface HallPulseMove {
  row: unknown;
  sessionId: number;
  building: string;
  hall: string;
  roomId?: string;
  buildingId?: string;
}

export interface HallPulseProps {
  context: "workshop" | "report" | "dean";
  collegeId: number;
  sectionId: number;
  termId: number;
  rows?: readonly PulseRowInput[];
  courses?: readonly PulseCourseInput[];
  instructorName?: (id: number) => string;
  /** رئيس لجنة الجدول (الشاشة 7) في الورشة وحده. */
  canSave?: boolean;
  practice?: boolean;
  onSaveMoves?: (moves: HallPulseMove[]) => Promise<boolean>;
  heading?: string;
  /** الهاتف في الورشة: مجسّمٌ للقراءة بلوحةٍ سفلية (قاعدة الهاتف: العروض الواسعة للقراءة). */
  phone?: boolean;
}

const MOVE: ArabicNoun = { one: "نقلة", two: "نقلتان", few: "نقلات", many: "نقلة" };
const FIT_HEX: Record<FitClass, number> = { pressed: 0xf0674f, full: 0xf0b24a, fit: 0x4fd3a1, wide: 0x6aa9d8, unknown: 0xa8b5af };
/** شكلٌ مع كل لون: لا يُعتمد على اللون وحده (عمى الألوان، والوضع الداكن). */
export const FIT_GLYPH: Record<FitClass, string> = { pressed: "▲", full: "■", fit: "●", wide: "◆", unknown: "?" };
const FIT_TOKEN: Record<FitClass, string> = { pressed: "pressed", full: "full", fit: "fit", wide: "wide", unknown: "unknown" };
const HINT_KEY = "hall-pulse-hint-v1";
const n = (v: number) => Math.round(v).toLocaleString("ar-KW-u-nu-latn");
const weekRamp = (t: number) => {
  /* حرارة الأسبوع: من الزجاج الهادئ إلى النحاسي. */
  const a = [0x2a, 0x6b, 0x5c], b = [0xe2, 0xbd, 0x76];
  const k = Math.max(0, Math.min(1, t));
  return (Math.round(a[0] + (b[0] - a[0]) * k) << 16) | (Math.round(a[1] + (b[1] - a[1]) * k) << 8) | Math.round(a[2] + (b[2] - a[2]) * k);
};

/** سماء المسرح تتبع الساعة: فجرٌ أزرق، وظهرٌ أخضر صافٍ، وغروبٌ دافئ — بالرموز الليلية نفسها في الوضعين. */
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

function readHint(): boolean { try { return window.localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } }
function writeHint() { try { window.localStorage.setItem(HINT_KEY, "1"); } catch { /* تصفّحٌ خاص */ } }
const prefersReduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

function todayDefaults(dayStart: number, dayEnd: number): { day: PulseDay; minute: number } {
  const now = new Date();
  const idx = now.getDay(); // 0 الأحد
  const minute = now.getHours() * 60 + now.getMinutes();
  if (idx <= 4 && minute >= dayStart && minute < dayEnd) return { day: PULSE_DAYS[idx].key, minute: minute - (minute % 5) };
  return { day: PULSE_DAYS[idx <= 4 ? idx : 0].key, minute: Math.max(dayStart, Math.min(dayEnd - 5, 10 * 60)) };
}

interface BarterOpportunity {
  id: string; roomId: string; buildingId: string; roomCode: string; roomHall: string; day: string; startTime: string; endTime: string;
  ownerSectionName: string; ownerCollegeName: string; roomType?: string; fit?: { capacity?: number; specialised?: boolean };
}
interface BorrowState {
  sessionId: number;
  stage: "loading" | "pick" | "none" | "form" | "sending" | "sent" | "approved" | "error";
  options: Array<{ roomId: string; buildingId: string; roomCode: string; roomHall: string; capacity: number | null; owner: string; opportunities: BarterOpportunity[] }>;
  others: Array<{ roomId: string; roomCode: string; roomHall: string; capacity: number | null }>;
  pick?: string;
  error?: string;
  requestIds?: string[];
}

const NO_COHORTS: CohortInput[] = [];
const minutesOf = (value: string) => { const [h, m] = String(value || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export default function HallPulse(props: HallPulseProps) {
  const { context, collegeId, sectionId, termId } = props;
  const canSave = Boolean(props.canSave && props.onSaveMoves && context === "workshop");
  const [registry, setRegistry] = useState<PulseRegistryInput | null>(null);
  const [roomLoad, setRoomLoad] = useState<any>(null);
  const [ownRows, setOwnRows] = useState<PulseRowInput[] | null>(null);
  const [ownCourses, setOwnCourses] = useState<PulseCourseInput[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  /* ── البيانات: سجلّ المواقع (السعة والنوع) وإشغال الجهات الأخرى، والصفوف إن لم تُعطَ ── */
  useEffect(() => {
    if (!collegeId || !termId) { setLoading(false); return; }
    const controller = new AbortController();
    const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId || 0), termId: String(termId) });
    const get = (url: string) => fetch(url, { credentials: "include", signal: controller.signal }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setLoading(true); setLoadError("");
    /* السجل أولاً، ثم إشغال قاعاته كلها (لا قاعات النطاق وحدها): قاعةٌ لم يُدرَّس فيها
       القسم بعد قد يشغلها قسمٌ آخر، فلا تُقترح فارغةً قبل أن يُعرف وقتها. */
    const registryRead = get(`/api/location-registry?${q}`);
    const loadRead = registryRead.then(reg => {
      const ids = (Array.isArray(reg?.rooms) ? reg.rooms : []).map((room: any) => String(room?.id || "")).filter(Boolean).slice(0, 400);
      const lq = new URLSearchParams(q);
      if (ids.length) lq.set("roomIds", ids.join(","));
      return get(`/api/reports/room-load?${lq}`);
    });
    Promise.all([
      registryRead,
      loadRead,
      props.rows ? Promise.resolve(null) : get(`/api/schedules?${new URLSearchParams({ termId: String(termId), collegeId: String(collegeId), ...(sectionId ? { sectionId: String(sectionId) } : {}) })}`),
      props.courses ? Promise.resolve(null) : get(sectionId ? `/api/courses?sectionId=${sectionId}` : "/api/courses"),
    ]).then(([reg, load, rows, courses]) => {
      if (controller.signal.aborted) return;
      setRegistry(reg); setRoomLoad(load);
      if (!props.rows) { if (Array.isArray(rows)) setOwnRows(rows); else setLoadError("تعذّرت قراءة مواعيد النطاق."); }
      if (!props.courses) setOwnCourses(Array.isArray(courses) ? courses : []);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeId, sectionId, termId, Boolean(props.rows), Boolean(props.courses)]);

  const rows = props.rows || ownRows || [];
  const courses = props.courses || ownCourses || [];
  const model: PulseModel = useMemo(() => buildPulseModel({
    rows, courses, registry, roomLoad, instructorName: props.instructorName,
    dayStart: Number(roomLoad?.dayStart) || 8 * 60, dayEnd: Number(roomLoad?.dayEnd) || 20 * 60,
    includeUnusedRegistryHalls: Boolean(sectionId),
    requireOccupancyCheck: true,
  }), [rows, courses, registry, roomLoad, props.instructorName, sectionId]);
  const original = useMemo(() => originalAssignment(model), [model]);
  const narrow = useNarrow();
  /* المخطّط المكاني يتبع قائمة القاعات وحدها: حفظُ نقلةٍ يغيّر الألوان لا المباني، فلا يُعاد بناء المشهد. */
  const hallsKey = model.halls.map(h => `${h.key}:${h.floor}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => layoutHalls(model.halls, narrow ? { perRow: 4, cols: 1 } : { perRow: model.halls.length > 60 ? 10 : 6 }), [hallsKey, narrow]);

  const defaults = useMemo(() => todayDefaults(model.dayStart, model.dayEnd), [model.dayStart, model.dayEnd]);
  const [day, setDay] = useState<PulseDay | "week">(defaults.day);
  const [minute, setMinute] = useState(defaults.minute);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ sessionId: number; from: string; to: string } | null>(null);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [planRev, setPlanRev] = useState(0);
  const [planBefore, setPlanBefore] = useState<ReturnType<typeof metrics> | null>(null);
  const [freeGlow, setFreeGlow] = useState(false);
  const [walk, setWalk] = useState(0);
  const [say, setSay] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [borrow, setBorrow] = useState<BorrowState | null>(null);
  const [hintSeen, setHintSeen] = useState(readHint);
  const reduced = useMemo(prefersReduced, []);
  const [flat, setFlat] = useState(reduced);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<"halls" | "paths">("halls");
  const [pathId, setPathId] = useState<string | null>(null);
  const [nearFor, setNearFor] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exploded, setExploded] = useState(false);
  /* «اليوم يمرّ أمامك»: off لا عرض، run يجري، worst واقفٌ عند أشدّ لحظة، end انتهى اليوم. */
  const [cine, setCine] = useState<"off" | "run" | "worst" | "end">("off");
  const cineRef = useRef<{ legs: CinemaLeg[]; leg: number; t0: number; steps: number[]; idx: number; stop: number | null } | null>(null);
  const [soundOn, setSoundOn] = useState(readSoundChoice);
  const soundRef = useRef<PulseSound | null>(null);
  const canSound = useMemo(soundAvailable, []);
  /* «قبل وبعد بسحبة»: موضع الفاصل من يسار المشهد؛ يساره «بعد الترتيب» ويمينه «الآن». */
  const [split, setSplit] = useState(0.5);
  /* «القاعة من الداخل». */
  const [insideKey, setInsideKey] = useState<string | null>(null);
  const viewDay: PulseDay = day === "week" ? defaults.day : day;
  /* مسارات التنقّل لرئيس اللجنة ورئيس القسم (الورشة) وللعميد وحدهم؛ لا تظهر في عدسة التقارير. */
  const pathsAllowed = context === "workshop" || context === "dean";

  const assignment: Assignment = useMemo(() => {
    const a = applyPlan(original, plan);
    if (pending) a.set(pending.sessionId, pending.to);
    return a;
    // planRev: تبديل نقلة داخل الخطة نفسها.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, plan, planRev, pending]);
  const occ = useMemo(() => occupantsAt(model, assignment, viewDay, minute), [model, assignment, viewDay, minute]);
  const heat = useMemo(() => weeklyHeat(model, assignment), [model, assignment]);
  const selHall = selected ? model.hallByKey.get(selected) || null : null;
  const selSession = selected ? occ.get(selected) || null : null;
  const suggestions = useMemo(() => (selSession && !plan && !pending ? suggestHalls(model, assignment, selSession.id) : []), [model, assignment, selSession, plan, pending]);

  /* ── أول ما يُرى: أزحم لحظةٍ في اليوم المختار، لا ساعةٌ فارغة ── */
  const autoDayRef = useRef<string>("");
  useEffect(() => {
    if (day === "week" || !model.sessions.length) return;
    const key = `${day}|${model.sessions.length}`;
    if (autoDayRef.current.startsWith(`${day}|`) ) return;
    autoDayRef.current = key;
    if (occupantsAt(model, original, day, minute).size) return;
    const best = busiestMinute(model, original, day);
    if (best != null) setMinute(best + 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, model]);

  /* ── الساعة تمشي ── */
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      setMinute(m => { const next = m + dt * 36; return next >= model.dayEnd - 5 ? model.dayStart : next; });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, model.dayStart, model.dayEnd]);
  const minuteShown = Math.floor(minute / 5) * 5;

  /* ── «اليوم يمرّ أمامك»: منحنى الضغط، وأشدّ لحظة، وعرضٌ من ثلاثين ثانية يقف عندها ── */
  const curve: PressurePoint[] = useMemo(() => (day === "week" ? [] : pressureCurve(model, assignment, viewDay)), [model, assignment, viewDay, day]);
  const worst = useMemo(() => (day === "week" ? null : worstMoment(model, assignment, viewDay, curve)), [model, assignment, viewDay, day, curve]);
  const peak = useMemo(() => peakMoment(curve), [curve]);
  const nowPoint = useMemo(() => (day === "week" ? null : pressureAt(model, assignment, viewDay, minute)), [model, assignment, viewDay, minute, day]);
  const startCinema = () => {
    if (day === "week") return;
    setPlaying(false); setPending(null); setFreeGlow(false); setInsideKey(null); setSelected(null); setWalk(0);
    cineRef.current = {
      legs: cinemaLegs(model.dayStart, model.dayEnd, worst ? worst.minute : null), leg: 0, t0: performance.now(),
      steps: cinemaSteps(model.dayStart, model.dayEnd, worst ? worst.minute : null), idx: 0, stop: worst ? worst.minute : null,
    };
    setMinute(model.dayStart);
    setCine("run");
    if (soundOn) { soundRef.current = soundRef.current || new PulseSound(); soundRef.current.start(); }
    announce("اليوم يمرّ أمامك في ثلاثين ثانية: الشمس تتحرّك، والقاعات تضيء وتخفت، والعرض يقف عند أشدّ لحظة ضغط.");
  };
  const continueCinema = () => {
    const st = cineRef.current;
    if (!st) return;
    st.leg = Math.min(st.legs.length - 1, 1); st.t0 = performance.now(); st.stop = null;
    setSelected(null);
    setCine("run");
    if (soundOn) { soundRef.current = soundRef.current || new PulseSound(); soundRef.current.start(); }
  };
  const closeCinema = () => {
    setCine("off");
    /* لا يُترك القارئ على آخر اليوم الفارغ: يعود إلى أشدّ لحظة أو ذروة الحضور. */
    const back = worst ? worst.minute : peak ? peak.minute : null;
    if (back != null) setMinute(back + 5);
  };
  useEffect(() => {
    if (cine !== "run") return;
    const st = cineRef.current;
    if (!st) { setCine("off"); return; }
    const arrive = (m: number) => {
      setMinute(m);
      if (st.stop != null && Math.abs(m - st.stop) < 0.01) { setCine("worst"); return true; }
      if (m >= model.dayEnd - 5 - 0.01) { setCine("end"); return true; }
      return false;
    };
    if (reduced) {
      /* تقليل الحركة: خطواتٌ لا انزلاق، ولا حركة كاميرا. */
      const timer = window.setInterval(() => {
        st.idx = Math.min(st.steps.length - 1, st.idx + 1);
        if (arrive(st.steps[st.idx])) window.clearInterval(timer);
      }, 800);
      return () => window.clearInterval(timer);
    }
    let raf = 0;
    const span = Math.max(1, model.dayEnd - 5 - model.dayStart);
    const step = (now: number) => {
      const leg = st.legs[st.leg];
      const elapsed = (now - st.t0) / 1000;
      const done = elapsed >= leg.seconds;
      const m = done ? leg.to : cinemaMinute(leg, elapsed);
      sceneRef.current?.cinema((m - model.dayStart) / span);
      if (done) { arrive(leg.to); return; }
      setMinute(m);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cine, reduced, model.dayStart, model.dayEnd]);
  /* النغمة: تجري مع العرض وحده، وتعلو مع الازدحام؛ تسكت حين يقف أو يُخفى التبويب أو تُغلق الشاشة. */
  useEffect(() => { if (cine !== "run") soundRef.current?.stop(); }, [cine]);
  useEffect(() => {
    if (cine !== "run" || !nowPoint) return;
    const lv = soundLevels(nowPoint, peak ? peak.students : 0);
    soundRef.current?.set(lv.crowd, lv.tension);
  }, [cine, nowPoint, peak]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) { soundRef.current?.stop(); setPlaying(false); setCine(c => (c === "run" ? "off" : c)); } };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); soundRef.current?.dispose(); soundRef.current = null; };
  }, []);
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next); writeSoundChoice(next);
    if (!next) soundRef.current?.stop();
    else if (cine === "run") { soundRef.current = soundRef.current || new PulseSound(); soundRef.current.start(); }
  };

  /* ── الألوان للمشهد ── */
  const glowKeys = useMemo(() => {
    const out = new Set<string>();
    if (freeGlow && day !== "week") for (const h of model.halls) if (!occ.has(h.key) && !foreignAt(model, h.key, viewDay, minuteShown) && h.capacity) out.add(h.key);
    suggestions.forEach(h => out.add(h.key));
    return out;
  }, [freeGlow, model, occ, viewDay, minuteShown, suggestions, day]);
  const manyHalls = model.halls.length > 36;
  /* ── مسارات التنقّل ── */
  const [nameState, setNameState] = useState<{ scope: string; map: Map<number, string> } | null>(null);
  const nameScope = `${collegeId}|${sectionId || 0}|${termId}`;
  const nameMap = nameState && nameState.scope === nameScope ? nameState.map : null;
  /* الدفعات تتبع القسم والفصل المختارين كأسماء الأساتذة: ما جُلب لقسمٍ لا يُعرض لغيره. */
  const [cohortState, setCohortState] = useState<{ scope: string; list: CohortInput[] } | null>(null);
  const cohorts = cohortState && cohortState.scope === nameScope ? cohortState.list : NO_COHORTS;
  useEffect(() => {
    if (mode !== "paths" || props.instructorName || nameMap) return;
    let live = true;
    const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId || 0), termId: String(termId), limit: "60" });
    fetch(`/api/instructors?${q}`, { credentials: "include" }).then(r => (r.ok ? r.json() : [])).then(list => {
      if (!live) return;
      setNameState({ scope: nameScope, map: new Map((Array.isArray(list) ? list : []).map((x: any) => [Number(x.AdInstructorId), String(x.AdInstructorName || "")])) });
    }).catch(() => { if (live) setNameState({ scope: nameScope, map: new Map() }); });
    return () => { live = false; };
  }, [mode, props.instructorName, nameMap, collegeId, sectionId, termId, nameScope]);
  useEffect(() => {
    if (mode !== "paths" || !sectionId || (context !== "workshop" && context !== "dean")) return;
    let live = true;
    const nameOf = new Map(courses.map(c => [Number(c.AdCourseId), String(c.CourseName || "")]));
    /* الورشة تقرأ حقائق الصحيفة بصلاحية الجدول؛ والعميد يقرأ أرقام مقررات كل مستوى وحدها من مساره للقراءة فقط. */
    const groups: Promise<Array<{ courseIds: number[] }>> = context === "workshop"
      ? loadPlanFacts(collegeId, sectionId).then(facts => facts.levelGroups)
      : fetch(`/api/reports/pulse-cohorts?${new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId) })}`, { credentials: "include" })
        .then(r => (r.ok ? r.json() : null)).then(data => (Array.isArray(data?.levelGroups) ? data.levelGroups : [])).catch(() => []);
    void groups.then(levelGroups => {
      if (!live) return;
      setCohortState({ scope: nameScope, list: levelGroups.filter(g => Array.isArray(g.courseIds) && g.courseIds.length >= 2).map((g, i) => {
        const names = g.courseIds.map(id => nameOf.get(Number(id))).filter(Boolean) as string[];
        return { key: String(i), label: `دفعة: ${names.slice(0, 2).join("، ")}${names.length > 2 ? "…" : ""}`, courseIds: new Set(g.courseIds.map(Number)) };
      }) });
    });
    return () => { live = false; };
  }, [mode, collegeId, sectionId, context, courses, nameScope]);
  const teacherName = useCallback((id: number) => props.instructorName?.(id) || nameMap?.get(id) || "", [props.instructorName, nameMap]);
  const paths: MovePath[] = useMemo(() => (mode === "paths" && pathsAllowed && day !== "week"
    ? buildPaths(model, assignment, layout, viewDay, { instructorName: teacherName, cohorts })
    : []), [mode, pathsAllowed, day, model, assignment, layout, viewDay, teacherName, cohorts]);
  const ranked = useMemo(() => rankHops(paths), [paths]);
  const activePath = paths.find(x => x.id === pathId) || null;
  const pathKeys = useMemo(() => new Set(activePath ? activePath.stops.map(st => st.hallKey) : []), [activePath]);
  useEffect(() => {
    sceneRef.current?.setPath(mode === "paths" && activePath ? activePath.stops.map(st => st.hallKey) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activePath?.id, activePath?.stops.map(st => st.hallKey).join("|"), sceneReady]);
  useEffect(() => {
    if (mode === "paths" && activePath) sceneRef.current?.setMarker(markerAt(activePath, minute));
  }, [mode, activePath, minute, sceneReady]);
  const compare = useMemo(() => (plan && day !== "week" ? beforeAfter(model, original, plan, viewDay, minute) : null),
    // planRev: تبديل نقلة داخل الخطة نفسها.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, planRev, day, model, original, viewDay, minute]);
  const visuals = useMemo(() => {
    const out = new Map<string, HallVisual>();
    const order = new Map<string, number[]>();
    if (activePath) activePath.stops.forEach((st, i) => order.set(st.hallKey, [...(order.get(st.hallKey) || []), i + 1]));
    for (const h of model.halls) {
      if (day === "week") {
        const w = heat.get(h.key);
        const t = w ? w.week : 0;
        out.set(h.key, { color: weekRamp(t), level: t, occupied: t > 0.005, label: `${h.code} · ${n(t * 100)}%`, showLabel: !manyHalls || t > 0.6 });
        continue;
      }
      const s = occ.get(h.key);
      const foreign = !s && foreignAt(model, h.key, viewDay, minuteShown);
      if (s) {
        const cls = fitClass(s.students, h.capacity);
        out.set(h.key, {
          color: FIT_HEX[cls], level: cls === "unknown" ? 0.55 : (s.students || 0) / (h.capacity || 1), occupied: true,
          pulse: cls === "pressed", ghost: pending?.to === h.key, label: `${FIT_GLYPH[cls]} ${h.code}`,
          showLabel: !manyHalls || cls === "pressed" || pending?.to === h.key || pending?.from === h.key,
        });
      } else {
        out.set(h.key, {
          color: foreign ? 0x5d6f67 : 0xcfe9df, level: foreign ? 0.5 : 0, occupied: foreign, dim: foreign,
          glow: glowKeys.has(h.key), label: foreign ? `${h.code} · جهة أخرى` : h.code, showLabel: glowKeys.has(h.key) || (!manyHalls && !freeGlow),
        });
      }
    }
    if (compare) for (const key of compare.changed) { const v = out.get(key); if (v) out.set(key, { ...v, showLabel: true }); }
    if (activePath && mode === "paths") {
      for (const [key, v] of out) {
        const nums = order.get(key);
        if (nums) out.set(key, { ...v, dim: false, showLabel: true, label: `${nums.join("، ")} · ${model.hallByKey.get(key)!.code}` });
        else out.set(key, { ...v, dim: true, glow: false, pulse: false, showLabel: false });
      }
    }
    return out;
  }, [model, occ, day, heat, viewDay, minuteShown, glowKeys, pending, manyHalls, freeGlow, activePath, mode, compare]);
  /* القاعات كما هي الآن (قبل الخطة): تُرسم يمين الفاصل بألوان الملاءمة والنوافذ واللافتات نفسها. */
  const beforeVisuals = useMemo(() => {
    if (!compare) return null;
    const out = new Map<string, HallVisual>();
    for (const h of model.halls) out.set(h.key, visualOfState(h, compare.before.get(h.key)!, !manyHalls || compare.changed.has(h.key)));
    return out;
  }, [compare, model, manyHalls]);

  /* ── المشهد ── */
  const viewRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PulseSceneType | null>(null);
  const pickRef = useRef<(key: string | null, nb: boolean) => void>(() => undefined);
  const enterRef = useRef<(key: string) => void>(() => undefined);
  const hasHalls = model.halls.length > 0;
  useEffect(() => {
    if (flat || !hasHalls || !viewRef.current || !labelsRef.current) return;
    let alive = true, scene: PulseSceneType | null = null;
    /* لوحةٌ جديدة لكل مشهد: سياق WebGL المُفرَغ لا يُعاد استعماله. */
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    viewRef.current.prepend(canvas);
    setSceneReady(false);
    import("./pulseScene").then(({ PulseScene, webglAvailable }) => {
      if (!alive || !viewRef.current || !labelsRef.current) return;
      if (!webglAvailable()) { setSceneFailed(true); setFlat(true); return; }
      try {
        scene = new PulseScene({
          canvas, host: viewRef.current, labels: labelsRef.current, layout, reduced, topDown: narrow, ambient: !narrow,
          onPick: (key, nb) => pickRef.current(key, nb), onHover: setHovered,
          onEnter: key => enterRef.current(key), onLeave: () => setInsideKey(null),
        });
        sceneRef.current = scene;
        setSceneReady(true);
        requestAnimationFrame(() => canvas.classList.add("is-ready"));
      } catch { setSceneFailed(true); setFlat(true); }
    }).catch(() => { if (alive) { setSceneFailed(true); setFlat(true); } });
    return () => {
      alive = false;
      scene?.dispose();
      sceneRef.current = null;
      canvas.remove();
      if (labelsRef.current) labelsRef.current.innerHTML = "";
    };
  }, [flat, hasHalls, layout, reduced, narrow]);
  useEffect(() => { sceneRef.current?.setVisuals(visuals, selected); }, [visuals, selected, sceneReady]);
  const splitRef = useRef(split);
  splitRef.current = split;
  /* «قبل وبعد»: الفاصل يظهر مع المراجعة ويزول بزوالها؛ لا كتابة جديدة. */
  const comparing = Boolean(beforeVisuals) && !flat && !insideKey;
  useEffect(() => { sceneRef.current?.setCompare(comparing ? beforeVisuals : null, splitRef.current); }, [comparing, beforeVisuals, sceneReady]);
  useEffect(() => { sceneRef.current?.setSplit(split); }, [split, sceneReady]);
  const hasPlan = Boolean(plan);
  useEffect(() => {
    if (!hasPlan) return;
    /* الفاصل يدخل من اليمين كاشفاً «بعد الترتيب» حتى المنتصف. */
    if (reduced) { setSplit(0.5); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - u, 3);
      setSplit(0.04 + 0.46 * e);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    setSplit(0.04);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hasPlan, reduced]);
  /* العرض والكاميرا: تعود إلى المنظر الكامل حين ينتهي، وتقترب من القاعة عند أشدّ لحظة. */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (cine === "off" || cine === "end") { scene.cinema(null); scene.spotlight(null); }
    else if (cine === "run") scene.spotlight(null);
    else if (cine === "worst" && worst) scene.spotlight(worst.hallKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cine, sceneReady]);
  useEffect(() => {
    if (cine !== "worst" || !worst) return;
    setSelected(worst.hallKey);
    const h = model.hallByKey.get(worst.hallKey);
    if (h) setSay(`أشدّ لحظة في ${PULSE_DAYS.find(x => x.key === viewDay)!.label}: ${clockText(worst.minute)}، ${h.lab ? h.code : `قاعة ${h.code}`} فيها نحو ${countOf(worst.students, AR.student)} في ${countOf(worst.capacity, AR.seat)}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cine]);
  /* القاعة من الداخل: مقاعدها من سعتها، ومن يجلس ومن يقف من شعبتها في هذه اللحظة. */
  const insideHall = insideKey ? model.hallByKey.get(insideKey) || null : null;
  const insideSession = insideKey ? occ.get(insideKey) || null : null;
  const insideLayout = useMemo(() => seatLayout(insideHall?.capacity, insideSession?.students || 0), [insideHall?.capacity, insideSession?.students]);
  const insideData: InteriorData | null = useMemo(() => {
    if (!insideHall || !insideLayout) return null;
    const cls = insideSession ? fitClass(insideSession.students, insideHall.capacity) : null;
    return {
      /* الجالسون بلون الامتلاء حين تفيض القاعة، ليبقى الأحمر للواقفين عند الباب وحدهم. */
      layout: insideLayout, color: cls ? FIT_HEX[cls === "pressed" ? "full" : cls] : 0x7fb3a3,
      standTag: insideLayout.standingReal ? `${FIT_GLYPH.pressed} ${countOf(insideLayout.standingReal, AR.student)} بلا مقعد` : "",
      sun: (minute - model.dayStart) / Math.max(1, model.dayEnd - model.dayStart),
    };
  }, [insideHall, insideLayout, insideSession, minute, model.dayStart, model.dayEnd]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (insideKey && insideData) scene.enter(insideKey, insideData); else scene.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insideKey, sceneReady]);
  useEffect(() => { if (insideKey && insideData) sceneRef.current?.setInterior(insideData); }, [insideKey, insideData]);
  useEffect(() => { if (insideKey && (flat || selected !== insideKey || !model.hallByKey.get(insideKey)?.capacity)) setInsideKey(null); }, [insideKey, flat, selected, model]);
  useEffect(() => {
    if (!insideKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setInsideKey(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [insideKey]);
  useEffect(() => { sceneRef.current?.setTimeOfDay(day === "week" ? (model.dayStart + model.dayEnd) / 2 : minute, model.dayStart, model.dayEnd); }, [minute, day, model.dayStart, model.dayEnd, sceneReady]);
  /* القاعة المختارة في طابقٍ تحته طوابق: تنفرج الطوابق فوقها لتُرى. */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const spot = selected ? layout.spots.get(selected) : null;
    const building = spot ? layout.buildings.find(b => b.code === spot.building) : null;
    const open = Boolean(spot && building && spot.floorIndex < building.floors - 1 && day !== "week" && mode === "halls");
    scene.explode(open ? spot!.building : null, spot ? spot.floorIndex : 0);
    setExploded(open);
  }, [selected, layout, day, mode, sceneReady]);

  /* ── الجار: مبنى القسم المجاور حين لا تتّسع قاعات القسم ── */
  const nb = useMemo(() => {
    if (!borrow || !["pick", "form", "sending", "sent", "approved"].includes(borrow.stage)) return null;
    const halls: PulseHall[] = [...borrow.options.map(o => ({ ...o, free: true })), ...borrow.others.map(o => ({ ...o, free: false }))].map(o => ({
      key: `nb:${o.roomId}`, roomId: o.roomId, buildingCode: o.roomCode, buildingLabel: buildingLabelOf(o.roomCode), code: o.roomHall,
      capacity: o.capacity, type: "", lab: false, floor: floorOf(o.roomHall),
    }));
    const L = layoutHalls(halls, { perRow: 5, offsetX: layout.cx + layout.width / 2 + 6 });
    return { halls, layout: L, free: new Set(borrow.options.map(o => `nb:${o.roomId}`)) };
  }, [borrow, layout]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!nb) { scene.setNeighbour(null, null); scene.showNeighbourView(false); return; }
    const session = borrow ? model.sessionById.get(borrow.sessionId) : null;
    const vis = new Map<string, HallVisual>();
    for (const h of nb.halls) {
      const chosen = borrow?.pick === h.roomId;
      const free = nb.free.has(h.key);
      vis.set(h.key, {
        color: chosen ? FIT_HEX[fitClass(session?.students, h.capacity)] : 0x5d6f67,
        level: chosen ? (session?.students || 0) / (h.capacity || 1) : 0, occupied: chosen, glow: free && !chosen, dim: !free,
        pulse: false, label: h.capacity ? `${h.code} · ${n(h.capacity)}` : h.code, showLabel: free,
      });
    }
    scene.setNeighbour(nb.layout, vis);
    scene.showNeighbourView(true);
  }, [nb, borrow, model, sceneReady]);

  /* ── أفعال ── */
  const announce = (text: string) => setSay(text);
  const stopPlay = () => { setPlaying(false); setCine("off"); };
  const hallTitle = (h: PulseHall) => (h.lab ? h.code : `قاعة ${h.code}`);
  const sessionLine = (s: PulseSession) => [s.courseName, s.sectionCode ? `ش ${s.sectionCode}` : ""].filter(Boolean).join(" · ");

  const selectHall = useCallback((key: string | null) => {
    setSelected(key);
    setNotice(null);
    if (key) setSheetOpen(true);
    if (key) sceneRef.current?.focus(key);
  }, []);

  const startBorrow = useCallback(async (session: PulseSession) => {
    setBorrow({ sessionId: session.id, stage: "loading", options: [], others: [] });
    try {
      const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
      const response = await fetch(`/api/hall-barter?${q}`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "تعذّرت قراءة قاعات الأقسام المجاورة.");
      const board = await response.json();
      const ops: BarterOpportunity[] = Array.isArray(board?.opportunities) ? board.opportunities : [];
      /* السعة والنوع بحكم اقتراح القسم نفسه (borrowCandidates ← typeFits). */
      const { options: found, others: rest } = borrowCandidates(model, session, ops);
      const options: BorrowState["options"] = found.map(o => ({ roomId: o.roomId, buildingId: o.buildingId || "", roomCode: o.roomCode, roomHall: o.roomHall, capacity: o.capacity, owner: o.owner, opportunities: o.opportunities as BarterOpportunity[] }));
      const others: BorrowState["others"] = rest.map(o => ({ roomId: o.roomId, roomCode: o.roomCode, roomHall: o.roomHall, capacity: o.capacity }));
      /* المبنى المجاور الأقرب: مبنى أنسب قاعة، ولا يُرسم غيره. */
      const building = options[0]?.roomCode;
      setBorrow({
        sessionId: session.id, stage: options.length ? "pick" : "none",
        options: options.filter(o => o.roomCode === building).slice(0, 12),
        others: others.filter(o => o.roomCode === building).slice(0, 16), // فارغة في جزءٍ من اليوم فقط: تُرسم باهتة
      });
      if (options.length) announce(`لا قاعة أوسع فارغة في القسم لهذه الشعبة. ظهر ${buildingLabelOf(building)} بقاعاته الفارغة في وقتها كله: اختر واحدة واطلب استعارتها.`);
    } catch (error: any) {
      setBorrow({ sessionId: session.id, stage: "error", options: [], others: [], error: String(error?.message || error) });
    }
  }, [collegeId, sectionId, termId, model]);

  enterRef.current = key => {
    const h = model.hallByKey.get(key);
    if (!h || flat || mode !== "halls" || pending || borrow) return;
    if (!h.capacity) { setSelected(key); announce(`${hallTitle(h)}: السعة غير مسجّلة، فلا مقاعد تُرسم من الداخل.`); return; }
    if (day === "week") setDay(viewDay);
    setSelected(key); setNotice(null); setSheetOpen(true);
    setInsideKey(key);
    if (!hintSeen) { setHintSeen(true); writeHint(); }
    const s = occ.get(key);
    const L = seatLayout(h.capacity, s?.students || 0);
    announce(s && L
      ? `داخل ${hallTitle(h)}: نحو ${countOf(s.students || 0, AR.student)} في ${countOf(h.capacity, AR.seat)}${L.standingReal ? `، و${countOf(L.standingReal, AR.student)} بلا مقعد عند الباب` : ""}. اضغط «اخرج» أو مفتاح Escape للعودة.`
      : `داخل ${hallTitle(h)}: فارغة الآن، ${countOf(h.capacity, AR.seat)}. اضغط «اخرج» أو مفتاح Escape للعودة.`);
  };

  pickRef.current = (key, neighbour) => {
    if (neighbour && key && borrow && (borrow.stage === "pick" || borrow.stage === "form")) {
      const roomId = key.replace(/^nb:/, "");
      if (borrow.options.some(o => o.roomId === roomId)) setBorrow({ ...borrow, stage: "form", pick: roomId });
      return;
    }
    if (pending) return;
    if (borrow && borrow.stage !== "sent" && borrow.stage !== "approved") setBorrow(null);
    selectHall(key);
    if (!hintSeen) { setHintSeen(true); writeHint(); }
  };

  const savedMovesFrom = (list: Array<{ sessionId: number; to: string }>): HallPulseMove[] => list.map(mv => {
    const s = model.sessionById.get(mv.sessionId)!;
    const h = model.hallByKey.get(mv.to)!;
    return { row: s.source, sessionId: s.id, building: h.buildingCode, hall: h.code, roomId: h.roomId, buildingId: h.buildingId };
  });

  const previewMove = (to: PulseHall) => {
    if (!selSession || !selected) return;
    stopPlay();
    setPending({ sessionId: selSession.id, from: selected, to: to.key });
    sceneRef.current?.fly([{ from: selected, to: to.key, color: FIT_HEX[fitClass(selSession.students, to.capacity)] }]);
    setSelected(to.key);
    announce(`معاينة فقط: ظهرت الشعبة في ${hallTitle(to)} ولم يُحفظ شيء. «حفظ» للتأكيد أو «إلغاء» للتراجع.`);
  };
  const previewSessionMove = (sessionId: number, to: PulseHall) => {
    const s = model.sessionById.get(sessionId);
    if (!s) return;
    const from = assignment.get(sessionId) || s.hallKey;
    stopPlay();
    setPending({ sessionId, from, to: to.key });
    sceneRef.current?.fly([{ from, to: to.key, color: FIT_HEX[fitClass(s.students, to.capacity)] }]);
    setNearFor(null);
    announce(`معاينة فقط: ${s.courseName} في ${hallTitle(to)} ولم يُحفظ شيء. «حفظ» للتأكيد أو «إلغاء» للتراجع.`);
  };
  const cancelPending = () => {
    if (!pending) return;
    sceneRef.current?.fly([{ from: pending.to, to: pending.from, color: 0xe2bd76 }]);
    setSelected(pending.from);
    setPending(null);
    announce("رجعت الشعبة إلى قاعتها.");
  };
  const savePending = async () => {
    if (!pending || !props.onSaveMoves) return;
    setSaving(true);
    const ok = await props.onSaveMoves(savedMovesFrom([pending])).catch(() => false);
    setSaving(false);
    if (ok) {
      const to = model.hallByKey.get(pending.to);
      setPending(null);
      setNotice({ tone: "ok", text: `${props.practice ? "نُقلت في التجربة" : "حُفظ النقل"}: الشعبة الآن في ${to ? hallTitle(to) : "القاعة الجديدة"}.` });
      announce("حُفظ النقل بالمسار المعتاد في الورشة، وفُحص التعارض على الخادم.");
    } else {
      setNotice({ tone: "warn", text: "لم يُحفظ النقل: رفضه فحص التعارض أو تغيّر الجدول. ما زالت الشعبة في قاعتها." });
      setPending(null);
    }
  };

  const arrange = () => {
    if (day === "week") { setDay(viewDay); }
    stopPlay(); setPending(null); setFreeGlow(false); setBorrow(null); setNotice(null);
    const p = planDay(model, original, viewDay);
    if (!p.groups.length) {
      setPlan(null);
      announce(p.unsolved.length
        ? `لا نقلة داخل القسم تحسّن هذا اليوم، وبقيت ${countOf(p.unsolved.length, AR.section)} مضغوطة: اضغط قاعتها لتطلب استعارة.`
        : "قاعات هذا اليوم مرتّبة أصلاً: لا نقلة تحسّن شيئاً.");
      return;
    }
    setPlanBefore(metrics(model, original, viewDay));
    setPlan(p); setPlanRev(r => r + 1);
    const firstStart = Math.min(...p.groups.map(g => g.start));
    const slotHas = p.groups.some(g => g.moves.some(mv => { const s = model.sessionById.get(mv.sessionId)!; return minute >= s.start && minute < s.end; }));
    if (!slotHas) setMinute(firstStart + 5);
    const pairs = p.groups.flatMap(g => g.moves.map((mv, k) => ({ from: mv.from, to: mv.to, color: FIT_HEX[fitClass(model.sessionById.get(mv.sessionId)!.students, model.hallByKey.get(mv.to)!.capacity)], delay: k * 0.35 })));
    sceneRef.current?.fly(pairs.slice(0, 24));
    announce("هذه خطة لليوم كله ولم يُحفظ شيء بعد: كل شعبة ذهبت إلى أنسب قاعة فارغة من نوعها، ولا قاعة تستقبل شعبتين في الوقت نفسه. استبعد ما لا تريده ثم احفظ.");
    /* أرقام «قبل/بعد» تُرى فوراً: لوحةٌ مختصرة في الجانب، والمراجعة الكاملة تُجلب إلى العين. */
    window.setTimeout(() => {
      const el = document.querySelector(".hp-review");
      el?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }, reduced ? 0 : 450);
  };
  const cancelPlan = () => {
    if (plan) {
      const pairs = planMoves(plan).map(mv => ({ from: mv.to, to: mv.from, color: 0xe2bd76 }));
      sceneRef.current?.fly(pairs.slice(0, 24));
    }
    setPlan(null);
    announce("أُلغيت الخطة، ورجعت كل شعبة إلى قاعتها.");
  };
  const savePlan = async () => {
    if (!plan || !props.onSaveMoves) return;
    const moves = planMoves(plan);
    if (!moves.length) return;
    const after = metrics(model, assignment, plan.day);
    setSaving(true);
    const ok = await props.onSaveMoves(savedMovesFrom(moves)).catch(() => false);
    setSaving(false);
    if (ok) {
      setPlan(null);
      setNotice({ tone: "ok", text: `حُفظت ${countOf(moves.length, MOVE)}. المضغوطة من ${n(planBefore?.over || 0)} إلى ${n(after.over)}، والتناسب من ${n(planBefore?.pct || 0)}% إلى ${n(after.pct)}%.` });
      announce("حُفظت الخطة دفعةً واحدة عبر مسار النقل المعتاد، وأعاد الخادم فحص كل نقلة.");
    } else {
      setNotice({ tone: "warn", text: "لم تُحفظ الخطة: رفض فحصُ التعارض إحدى النقلات فلم يتغيّر شيء. الخطة باقية لتراجعها." });
    }
  };
  const toggle = (gid: number) => {
    if (!plan) return;
    const g = plan.groups[gid];
    const changed = toggleGroup(plan, gid, !g.on);
    const pairs = changed.flatMap(id => plan.groups[id].moves.map(mv => (plan.groups[id].on ? { from: mv.from, to: mv.to } : { from: mv.to, to: mv.from })))
      .map(p => ({ ...p, color: 0xe2bd76 }));
    sceneRef.current?.fly(pairs);
    setPlanRev(r => r + 1);
  };

  const runWalk = (step: number) => {
    setWalk(step); stopPlay(); setPending(null); setPlan(null); setBorrow(null); setNotice(null); setFreeGlow(false);
    if (!hintSeen) { setHintSeen(true); writeHint(); }
    const d: PulseDay = day === "week" ? defaults.day : day;
    if (day === "week") setDay(d);
    const todays = model.sessions.filter(s => s.days.includes(d));
    const capOf = (s: PulseSession) => model.hallByKey.get(original.get(s.id) || s.hallKey)?.capacity || 0;
    if (step === 1) {
      const worst = todays.filter(s => s.students && capOf(s)).sort((a, b) => b.students! / capOf(b) - a.students! / capOf(a))[0];
      if (!worst || worst.students! / capOf(worst) < 0.9) { announce("لا قاعة مضغوطة ولا ممتلئة في هذا اليوم. جرّب يوماً آخر من الأيام أسفل المشهد."); return; }
      const h = model.hallByKey.get(original.get(worst.id)!)!;
      setMinute(worst.start + 5); selectHall(h.key);
      const cls = fitClass(worst.students, h.capacity);
      announce(`${PULSE_DAYS.find(x => x.key === d)!.label} ${clockText(worst.start)}: ${hallTitle(h)} ${cls === "pressed" ? "حمراء" : "صفراء"} — نحو ${countOf(worst.students!, AR.student)} (تقدير) في ${countOf(h.capacity!, AR.seat)}. اضغطها لترى قاعاتٍ أنسب، أو اطلب استعارة إن لم تجد.`);
    } else if (step === 2) {
      const waste = todays.filter(s => s.students && capOf(s) && s.students / capOf(s) < 0.45).sort((a, b) => (capOf(b) - b.students!) - (capOf(a) - a.students!))[0];
      if (!waste) { announce("لا قاعة واسعة على شعبتها في هذا اليوم: الهدر صفر."); return; }
      const h = model.hallByKey.get(original.get(waste.id)!)!;
      setMinute(waste.start + 5); selectHall(h.key);
      announce(`${hallTitle(h)} زرقاء: تسع ${countOf(h.capacity!, AR.seat)} وفيها نحو ${countOf(waste.students!, AR.student)}. شريط «أسبوع القاعة» في اللوحة يريك إن كانت واسعة كل يوم.`);
    } else if (step === 3) {
      const at = minute;
      const free = model.halls.filter(h => h.capacity && !occupantsAt(model, original, d, at).has(h.key) && !foreignAt(model, h.key, d, at));
      setFreeGlow(true);
      const first = free.find(h => !h.lab) || free[0];
      if (first) selectHall(first.key);
      announce(free.length
        ? `${PULSE_DAYS.find(x => x.key === d)!.label} ${clockText(at - (at % 5))}: ${countOf(free.length, AR.room)} فارغة تضيء بالأخضر. اضغط أي واحدة لتعرف سعتها وإلى متى تبقى فارغة. حرّك الساعة لترى وقتاً آخر.`
        : "لا قاعة فارغة في هذا الوقت. حرّك الساعة لترى وقتاً آخر.");
    } else if (step === 4) {
      arrange();
    }
  };

  /* ── اللوحة ── */
  const freeUntil = (key: string) => {
    let next = model.dayEnd;
    for (const s of model.sessions) {
      if (!s.days.includes(viewDay) || (assignment.get(s.id) || s.hallKey) !== key) continue;
      if (s.start > minuteShown && s.start < next) next = s.start;
    }
    for (const w of model.foreignBusy.get(key) || []) if (w.day === viewDay && w.from > minuteShown && w.from < next) next = w.from;
    return next >= model.dayEnd ? "نهاية اليوم" : clockText(next);
  };
  /* الرأس والقاعات من الإشغال نفسه (slotStats): لا عدّادٌ يخالف ما يُرى. */
  const stats = useMemo(() => slotStats(model, occ), [occ, model]);

  const dayStrip = (key: string) => {
    const cells: React.ReactNode[] = [];
    const hall = model.hallByKey.get(key);
    for (let m = model.dayStart; m < model.dayEnd; m += 30) {
      const s = occupantsAt(model, assignment, viewDay, m + 1).get(key);
      const foreign = !s && foreignAt(model, key, viewDay, m + 1);
      const tone = s ? FIT_TOKEN[fitClass(s.students, hall?.capacity)] : foreign ? "foreign" : "empty";
      cells.push(<i key={m} data-tone={tone} className={minuteShown >= m && minuteShown < m + 30 ? "is-now" : ""} title={`${clockText(m)}${s ? ` · ${s.courseName}` : foreign ? " · جهة أخرى" : " · فارغة"}`} />);
    }
    return cells;
  };

  const planView = plan ? (() => {
    const after = metrics(model, assignment, plan.day);
    const b4 = planBefore || after;
    const on = plan.groups.filter(g => g.on);
    const total = on.reduce((t, g) => t + g.moves.length, 0);
    const starts = Array.from(new Set<number>(plan.groups.map(g => g.start))).sort((a, b) => a - b);
    const metric = (label: string, a: number, b: number, fmt: (v: number) => string, lowerBetter: boolean) => (
      <div className="hp-metric"><span>{label}</span><div><s>{fmt(a)}</s><b className={(lowerBetter ? b > a : b < a) ? "is-worse" : ""}>{fmt(b)}</b></div></div>
    );
    return (
      <section className="hp-review" aria-live="polite" aria-label="خطة ترتيب القاعات">
        <header className="hp-review-head">
          <h3>خطة ترتيب القاعات · {PULSE_DAYS.find(x => x.key === plan.day)!.label}</h3>
          <span><b>{countOf(total, MOVE)}</b> في {countOf(starts.length, { one: "وقت", two: "وقتان", few: "أوقات", many: "وقتاً" })} · لم يُحفظ شيء بعد</span>
        </header>
        <div className="hp-metrics">
          {metric("شعب مضغوطة في اليوم", b4.over, after.over, n, true)}
          {metric("مقاعد مهدرة في قاعات واسعة", b4.waste, after.waste, n, true)}
          {metric("شعب في قاعة تناسبها", b4.pct, after.pct, v => `${n(v)}%`, false)}
        </div>
        <div className="hp-slots" role="group" aria-label="أوقات فيها نقلات">
          {starts.map(st => (
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={st} type="button" aria-current={minuteShown >= st && minuteShown < st + 60} onClick={() => { stopPlay(); setMinute(st + 5); }}>
              <bdi dir="ltr">{clockText(st)}</bdi><i>×{n(plan.groups.filter(g => g.start === st && g.on).reduce((t, g) => t + g.moves.length, 0))}</i>
            </button>
          ))}
        </div>
        <ul className="hp-moves">
          {plan.groups.slice().sort((a, b) => a.start - b.start || a.id - b.id).map(g => (
            <li key={g.id} className={g.on ? "" : "is-off"}>
              <button type="button" data-guide-ignore="يضمّ نقلةً إلى خطة الترتيب أو يستبعدها؛ معاينة لا تحفظ شيئاً" role="switch" className="hp-switch" aria-checked={g.on} aria-label="تضمين هذه النقلة" onClick={() => toggle(g.id)} />
              <button type="button" data-guide-ignore="ينقل الساعة إلى وقت النقلة ويحدّد قاعتها؛ عرض فقط" className="hp-move-what" onClick={() => { stopPlay(); setMinute(g.start + 5); selectHall(g.moves[g.moves.length - 1].to); }}>
                {g.moves.map(mv => {
                  const s = model.sessionById.get(mv.sessionId)!, from = model.hallByKey.get(mv.from)!, to = model.hallByKey.get(mv.to)!;
                  return (
                    <span key={mv.sessionId} className="hp-move-line">
                      <b>{sessionLine(s)}</b> <em>{s.students ? `نحو ${countOf(s.students, AR.student)}` : ""}</em>
                      <span className="hp-move-path">
                        {from.code} <Pill cls={fitClass(s.students, from.capacity)} /> <em aria-hidden="true">←</em> {to.code} <Pill cls={fitClass(s.students, to.capacity)} />
                      </span>
                    </span>
                  );
                })}
                <small>
                  {s0(g, model)}
                  {g.moves.length > 1 ? " · نقلتان مترابطتان: تُفرغ قاعة ثم تملؤها" : ""}
                  {g.deps.length ? " · تعتمد على نقلة قبلها" : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {plan.unsolved.length ? <p className="hp-fine">بقيت {countOf(plan.unsolved.length, AR.section)} مضغوطة لا قاعة لها داخل القسم. بعد الحفظ اضغط قاعتها لتظهر قاعات القسم المجاور الفارغة.</p> : null}
        <footer className="hp-review-foot">
          <span className="hp-fine">كل نقلة مفحوصة هنا على أيام الشعبة كلها: لا قاعة تستقبل شعبتين في الوقت نفسه، ولا تنتقل شعبة إلى قاعة من نوع آخر. ويعيد الخادم الفحص عند الحفظ.</span>
          <div className="hp-row">
            {canSave ? <button type="button" data-guide-ignore="يحفظ نقلات الخطة عبر مسار النقل المعتاد في الورشة" className="hp-btn is-main" disabled={!total || saving || total > 60} onClick={savePlan}>{saving ? "يحفظ…" : `حفظ الكل (${n(total)})`}</button> : null}
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={cancelPlan} disabled={saving}>إلغاء</button>
          </div>
          {total > 60 ? <span className="hp-fine">الحفظ الواحد حتى ستين نقلة: استبعد بعضها ثم احفظ.</span> : null}
        </footer>
      </section>
    );
  })() : null;

  const borrowSession = borrow ? model.sessionById.get(borrow.sessionId) || null : null;
  const sendBorrow = async () => {
    if (!borrow || !borrowSession) return;
    const opt = borrow.options.find(o => o.roomId === borrow.pick);
    if (!opt) return;
    setBorrow({ ...borrow, stage: "sending" });
    const ids: string[] = [];
    try {
      for (const op of opt.opportunities) {
        const r = await fetch("/api/hall-barter/requests", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, opportunityId: op.id }),
        });
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || "تعذّر إرسال الطلب.");
        if (body?.request?.id) ids.push(String(body.request.id));
      }
      setBorrow({ ...borrow, stage: "sent", requestIds: ids });
      announce("أُرسل الطلب عبر «استعارة القاعات». لا تُحجز القاعة قبل موافقة القسم المضيف.");
    } catch (error: any) {
      setBorrow({ ...borrow, stage: ids.length ? "sent" : "form", requestIds: ids, error: String(error?.message || error) });
    }
  };
  const checkBorrow = async () => {
    if (!borrow?.requestIds?.length) return;
    try {
      const q = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
      const board = await fetch(`/api/hall-barter?${q}`, { credentials: "include" }).then(r => r.json());
      const mine = (board?.outgoing || []).filter((x: any) => borrow.requestIds!.includes(String(x.id)));
      if (mine.length && mine.every((x: any) => x.status === "approved")) { setBorrow({ ...borrow, stage: "approved" }); announce("وافق القسم المضيف. احفظ النقل لتنتقل الشعبة."); }
      else if (mine.some((x: any) => x.status === "rejected")) setBorrow({ ...borrow, error: "اعتذر القسم المضيف عن هذا الطلب." });
      else announce("ما زال الطلب بانتظار موافقة القسم المضيف.");
    } catch { /* المحاولة التالية تكفي */ }
  };
  const saveBorrow = async () => {
    if (!borrow || !borrowSession || !props.onSaveMoves) return;
    const opt = borrow.options.find(o => o.roomId === borrow.pick);
    if (!opt) return;
    setSaving(true);
    const ok = await props.onSaveMoves([{ row: borrowSession.source, sessionId: borrowSession.id, building: opt.roomCode, hall: opt.roomHall, roomId: opt.roomId, buildingId: opt.buildingId }]).catch(() => false);
    setSaving(false);
    if (ok) { setBorrow(null); setNotice({ tone: "ok", text: `نُقلت الشعبة إلى ${opt.roomHall} في ${buildingLabelOf(opt.roomCode)} بالاستعارة.` }); }
    else setNotice({ tone: "warn", text: "لم يُحفظ النقل: رفضه فحص التعارض. الاستعارة باقية." });
  };

  const borrowCard = borrow && borrowSession ? (() => {
    const opt = borrow.options.find(o => o.roomId === borrow.pick);
    if (borrow.stage === "loading") return <div className="hp-alert"><span className="hp-spinner" aria-hidden="true" /> يقرأ قاعات الأقسام المجاورة…</div>;
    if (borrow.stage === "error") return <div className="hp-alert is-warn"><strong>تعذّر عرض الاستعارة</strong><span>{borrow.error}</span></div>;
    if (borrow.stage === "none") return <div className="hp-alert is-warn"><strong>لا قاعة مناسبة فارغة في الأقسام المجاورة أيضاً</strong><span>لا قاعة تتّسع لنحو {countOf(borrowSession.students || 0, AR.student)} وتفرغ في أيام الشعبة كلها. جرّب «رتّب قاعاتي».</span></div>;
    if (borrow.stage === "pick") return (
      <div className="hp-alert is-warn">
        <strong>لا قاعة أوسع فارغة في القسم الآن</strong>
        <span>هذه قاعات فارغة في {buildingLabelOf(borrow.options[0]?.roomCode)} طوال وقت الشعبة في أيامها كلها:</span>
        <div className="hp-row">{borrow.options.map(o => (
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={o.roomId} type="button" className="hp-btn" onClick={() => setBorrow({ ...borrow, stage: "form", pick: o.roomId })}>{o.roomHall} · {o.capacity ? countOf(o.capacity, AR.seat) : "سعة غير مسجّلة"}</button>
        ))}</div>
        <small>أو اضغط قاعةً مضيئة في المبنى المجاور.</small>
      </div>
    );
    if (!opt) return null;
    return (
      <div className="hp-request">
        <h4>طلب استعارة قاعة</h4>
        <dl>
          <dt>القاعة</dt><dd>{opt.roomHall} · {opt.capacity ? countOf(opt.capacity, AR.seat) : "سعة غير مسجّلة"} · {buildingLabelOf(opt.roomCode)}</dd>
          <dt>القسم المضيف</dt><dd>{opt.owner}</dd>
          <dt>الوقت</dt><dd>{borrowSession.days.map(d => PULSE_DAYS.find(x => x.key === d)!.label).join(" و")} · <bdi dir="ltr">{clockText(borrowSession.start)}–{clockText(borrowSession.end)}</bdi></dd>
          <dt>الشعبة</dt><dd>{sessionLine(borrowSession)}{borrowSession.students ? ` · نحو ${countOf(borrowSession.students, AR.student)}` : ""}</dd>
          <dt>بعد النقل</dt><dd><Pill cls={fitClass(borrowSession.students, opt.capacity)} /></dd>
        </dl>
        {borrow.error ? <p className="hp-fine is-warn">{borrow.error}</p> : null}
        {borrow.stage === "form" || borrow.stage === "sending" ? (
          <>
            <p className="hp-fine">يُرسل عبر «استعارة القاعات» الموجودة في البرنامج: {countOf(opt.opportunities.length, { one: "طلب", two: "طلبان", few: "طلبات", many: "طلباً" })} (طلب لكل يوم)، ولا يُحجز شيء قبل موافقة القسم المضيف.</p>
            <div className="hp-row">
              <button type="button" data-guide-ignore="يرسل طلب الاستعارة عبر استعارة القاعات الموجودة" className="hp-btn is-main" disabled={borrow.stage === "sending"} onClick={sendBorrow}>{borrow.stage === "sending" ? "يرسل…" : "اطلب استعارة"}</button>
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={() => setBorrow({ ...borrow, stage: "pick", pick: undefined, error: undefined })}>رجوع</button>
            </div>
          </>
        ) : borrow.stage === "sent" ? (
          <>
            <span className="hp-status">بانتظار موافقة القسم المضيف</span>
            <div className="hp-row"><button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={checkBorrow}>تحقّق من الرد</button></div>
          </>
        ) : (
          <>
            <span className="hp-status is-ok">وافق القسم المضيف</span>
            <div className="hp-row">
              <button type="button" data-guide-ignore="يحفظ نقل الشعبة إلى القاعة المستعارة عبر مسار النقل المعتاد" className="hp-btn is-main" disabled={saving} onClick={saveBorrow}>{saving ? "يحفظ…" : "حفظ النقل"}</button>
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={() => setBorrow(null)}>لاحقاً</button>
            </div>
          </>
        )}
      </div>
    );
  })() : null;

  const pendingCard = pending ? (
    <div className="hp-alert is-ok">
      <strong>مراجعة قبل الحفظ</strong>
      {(() => {
        const s = model.sessionById.get(pending.sessionId)!, from = model.hallByKey.get(pending.from)!, to = model.hallByKey.get(pending.to)!;
        return <span>{s.courseName}: من {from.code} إلى {to.code} · نحو {countOf(s.students || 0, AR.student)} في {countOf(to.capacity || 0, AR.seat)} · {FIT_LABEL[fitClass(s.students, to.capacity)]}. تنتقل القاعة في أيام الشعبة كلها.</span>;
      })()}
      <div className="hp-row">
        {canSave ? <button type="button" data-guide-ignore="يحفظ نقل الشعبة عبر مسار النقل المعتاد في الورشة" className="hp-btn is-main" disabled={saving} onClick={savePending}>{saving ? "يحفظ…" : "حفظ"}</button> : null}
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" disabled={saving} onClick={cancelPending}>إلغاء</button>
      </div>
    </div>
  ) : null;

  const planMini = plan && planBefore ? (() => {
    const after = metrics(model, assignment, plan.day);
    return (
      <div className="hp-mini-plan" role="status">
        <strong>الخطة قبل الحفظ</strong>
        <span><i data-tone="pressed">{FIT_GLYPH.pressed}</i> مضغوطة <s>{n(planBefore.over)}</s> <b>{n(after.over)}</b></span>
        <span><i data-tone="fit">{FIT_GLYPH.fit}</i> تناسب <s>{n(planBefore.pct)}%</s> <b>{n(after.pct)}%</b></span>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-link" onClick={() => document.querySelector(".hp-review")?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" })}>راجع النقلات</button>
      </div>
    );
  })() : null;

  const hopLine = (path: MovePath, hop: Hop, ranked = false) => {
    const from = model.hallByKey.get(hop.from.hallKey), to = model.hallByKey.get(hop.to.hallKey);
    const key = `${path.id}|${hop.index}`;
    const nears = nearFor === key ? nearerHalls(model, assignment, layout, hop) : [];
    return (
      <div className={`hp-hop${hop.flags.length ? " is-flagged" : ""}`} key={key}>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-hop-main" onClick={() => { setPathId(path.id); setMinute(Math.max(model.dayStart, hop.from.end - 4)); setPlaying(!reduced); }}>
          {ranked ? <b className="hp-hop-who">{path.label}</b> : null}
          <span className="hp-hop-path"><bdi dir="ltr">{clockText(hop.from.end)}</bdi> {from?.code} <em aria-hidden="true">←</em> {to?.code} <bdi dir="ltr">{clockText(hop.to.start)}</bdi></span>
          <small>{HOP_KIND_LABEL[hop.kind]} · فجوة {countOf(hop.gap, AR.minute)} · مشي نحو {countOf(Math.max(1, Math.round(hop.walk)), AR.minute)} <em className="hp-est">تقدير</em></small>
          {hop.flags.length ? <span className="hp-flags">{hop.flags.map(f => <i key={f} data-flag={f}>{HOP_FLAG_LABEL[f]}</i>)}</span> : null}
        </button>
        {canSave && hop.flags.length && !pending ? (
          nearFor === key ? (
            <div className="hp-row">
              {nears.length ? nears.map(x => (
                <button key={`${x.sessionId}-${x.hall.key}`} data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={() => previewSessionMove(x.sessionId, x.hall)}>
                  {model.sessionById.get(x.sessionId)?.courseName} ← {x.hall.code} · مشي {countOf(Math.max(1, Math.round(x.walk)), AR.minute)}
                </button>
              )) : <span className="hp-fine">لا قاعة أقرب فارغة من النوع نفسه في وقتها.</span>}
            </div>
          ) : <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn hp-btn-small" onClick={() => setNearFor(key)}>اقترح قاعة أقرب</button>
        ) : null}
      </div>
    );
  };

  const pathsPanel = mode === "paths" ? (
    <div className="hp-info">
      {!pathsAllowed ? <p className="hp-fine">مسارات التنقّل لرئيس لجنة الجدول ورئيس القسم والعميد.</p> : day === "week" ? (
        <p className="hp-fine">اختر يوماً لترى مسارات التنقّل فيه.</p>
      ) : (
        <>
          <label className="hp-select">
            <span>مسار من؟</span>
            <select data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" value={pathId || ""} onChange={e => { setPathId(e.target.value || null); setNearFor(null); const pth = paths.find(x => x.id === e.target.value); if (pth) setMinute(Math.max(model.dayStart, pth.stops[0].start - 5)); }}>
              <option value="">اختر أستاذاً أو دفعة…</option>
              {paths.filter(x => x.kind === "teacher").length ? <optgroup label="الأساتذة">{paths.filter(x => x.kind === "teacher").map(x => <option key={x.id} value={x.id}>{x.label}{x.score ? " ⚠" : ""}</option>)}</optgroup> : null}
              {paths.filter(x => x.kind === "cohort").length ? <optgroup label="الدفعات (المستوى نفسه)">{paths.filter(x => x.kind === "cohort").map(x => <option key={x.id} value={x.id}>{x.label}{x.score ? " ⚠" : ""}</option>)}</optgroup> : null}
            </select>
          </label>
          {pendingCard}
          {activePath ? (
            <div className="hp-path-detail">
              <div className="hp-path-head"><strong>{activePath.label}</strong><span>{countOf(activePath.stops.length, AR.lecture)}</span></div>
              {activePath.hops.length ? activePath.hops.map(h => hopLine(activePath, h)) : <p className="hp-fine">لا انتقال بين محاضرتين في هذا اليوم.</p>}
            </div>
          ) : null}
          <div className="hp-ranked">
            <div className="hp-path-head"><strong>أصعب التنقلات اليوم</strong>{ranked.length ? <span>{countOf(ranked.length, { one: "انتقال", two: "انتقالان", few: "انتقالات", many: "انتقالاً" })}</span> : null}</div>
            {ranked.length ? ranked.map(r => hopLine(r.path, r.hop, true)) : <p className="hp-fine">لا انتقال صعب في هذا اليوم: لا مبنى آخر بفجوةٍ ضيّقة، ولا فراغٌ طويل، ولا ذهابٌ وإياب.</p>}
          </div>
          <p className="hp-fine">المشي تقديرٌ من مواضع القاعات في المجسّم (الطابق نفسه، طابقٌ آخر، مبنى آخر)، لا قياسٌ على الأرض.</p>
        </>
      )}
    </div>
  ) : null;

  const panel = (() => {
    if (day === "week") {
      const top = [...heat.entries()].sort((a, b) => b[1].week - a[1].week).slice(0, 6);
      return (
        <div className="hp-info">
          <p className="hp-fine">حرارة الأسبوع: ارتفاع كل قاعة ولونها نسبةُ ساعات اليوم المشغولة على الأيام الخمسة.</p>
          <ol className="hp-toplist">
            {top.map(([key, w]) => {
              const h = model.hallByKey.get(key)!;
              return (
                <li key={key}><button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" onClick={() => selectHall(key)} aria-current={selected === key}>
                  <span>{hallTitle(h)}</span><span className="hp-meter"><i style={{ width: `${Math.round(w.week * 100)}%` }} /></span><b>{n(w.week * 100)}%</b>
                </button></li>
              );
            })}
          </ol>
          {selHall ? <WeekStrip hall={selHall} heat={heat} onDay={d => setDay(d)} /> : null}
        </div>
      );
    }
    if (!selHall) return (
      <div className="hp-info hp-empty-pick">
        <p><b>اضغط قاعة</b> في المجسّم لترى شعبتها، وسعتها، وأين تذهب إن لم تناسبها.</p>
        <label className="hp-select">
          <span>أو اختر من القائمة</span>
          <select data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" value="" onChange={e => selectHall(e.target.value || null)}>
            <option value="">اختر قاعة…</option>
            {model.halls.map(h => <option key={h.key} value={h.key}>{h.buildingLabel} · {h.code}{h.capacity ? ` · ${n(h.capacity)}` : ""}</option>)}
          </select>
        </label>
      </div>
    );
    const cls = selSession ? fitClass(selSession.students, selHall.capacity) : null;
    const foreign = !selSession && foreignAt(model, selHall.key, viewDay, minuteShown);
    const needsBorrow = canSave && selSession && cls === "pressed" && !suggestions.length && !plan && !pending && Boolean(sectionId);
    return (
      <div className="hp-info">
        <div className="hp-hall-head">
          <div>
            <h3>{hallTitle(selHall)}</h3>
            <span>{selHall.buildingLabel}{selHall.type ? ` · ${selHall.type}` : ""}</span>
          </div>
          <b>{selHall.capacity ? countOf(selHall.capacity, AR.seat) : <span className="hp-unknown">السعة غير مسجّلة</span>}</b>
        </div>
        {!flat && sceneReady && mode === "halls" && !pending && !borrow ? (
          insideKey === selHall.key
            ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn hp-enter is-in" onClick={() => setInsideKey(null)}><span aria-hidden="true">↩</span> اخرج من القاعة</button>
            : <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn hp-enter" disabled={!selHall.capacity} title={selHall.capacity ? "أو اضغط القاعة مرتين في المجسّم" : "السعة غير مسجّلة: لا مقاعد تُرسم"} onClick={() => enterRef.current(selHall.key)}><span aria-hidden="true">⤢</span> ادخل القاعة</button>
        ) : null}
        <label className="hp-select is-compact">
          <span className="hp-sr">انتقل إلى قاعة</span>
          <select data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" value={selHall.key} onChange={e => selectHall(e.target.value || null)}>
            {model.halls.map(h => <option key={h.key} value={h.key}>{h.buildingLabel} · {h.code}</option>)}
          </select>
        </label>
        {selSession ? (
          <div className="hp-occupant">
            <div className="hp-course">{sessionLine(selSession)}</div>
            {selSession.instructor ? <div className="hp-fine">{selSession.instructor}</div> : null}
            <div className="hp-fitline">
              <Pill cls={cls!} />
              <span>{selSession.students ? <>نحو <b>{countOf(selSession.students, AR.student)}</b> <em className="hp-est" title="سعة المقرر لكل شعبة، لا عدد المسجّلين">تقدير</em></> : "عدد الطلبة غير مسجّل"}{selHall.capacity ? ` في ${countOf(selHall.capacity, AR.seat)}` : ""}</span>
            </div>
            <div className="hp-fine"><bdi dir="ltr">{clockText(selSession.start)}–{clockText(selSession.end)}</bdi> · {selSession.days.map(d => PULSE_DAYS.find(x => x.key === d)!.label).join(" و")}</div>
          </div>
        ) : (
          <div className="hp-fitline">
            <span className={`hp-pill ${foreign ? "is-foreign" : "is-empty"}`}>{foreign ? "مشغولة من جهة أخرى" : "فارغة"}</span>
            {!foreign ? <span>حتى <bdi dir="ltr">{freeUntil(selHall.key)}</bdi></span> : null}
          </div>
        )}
        <div>
          <div className="hp-fine">يوم القاعة من <bdi dir="ltr">{clockText(model.dayStart)}</bdi> إلى <bdi dir="ltr">{clockText(model.dayEnd)}</bdi></div>
          <div className="hp-strip" aria-hidden="true">{dayStrip(selHall.key)}</div>
        </div>
        <WeekStrip hall={selHall} heat={heat} onDay={d => setDay(d)} />
        {pending ? pendingCard : plan ? (
          <p className="hp-fine">{planNotesFor(plan, selHall.key, model)}</p>
        ) : borrowCard ? borrowCard : suggestions.length ? (
          <div>
            <div className="hp-fine">قاعات أنسب وفارغة في وقت الشعبة كله، من النوع نفسه</div>
            <div className="hp-row">
              {suggestions.map(h => canSave ? (
                <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={h.key} type="button" className="hp-btn" onClick={() => previewMove(h)}>{h.code} · {countOf(h.capacity || 0, AR.seat)}</button>
              ) : (
                <span key={h.key} className="hp-chip">{h.code} · {countOf(h.capacity || 0, AR.seat)}</span>
              ))}
            </div>
            {!canSave ? <p className="hp-fine">للاطلاع: النقل لرئيس لجنة الجدول في ورشة القسم.</p> : null}
            {canSave && cls === "pressed" && sectionId ? <button data-guide-ignore="يعرض قاعات القسم المجاور الفارغة؛ الطلب لا يُرسل إلا بضغطةٍ أخرى" type="button" className="hp-link" onClick={() => startBorrow(selSession!)}>أو اطلب قاعةً من قسمٍ مجاور</button> : null}
          </div>
        ) : needsBorrow ? (
          <div className="hp-alert is-warn">
            <strong>لا قاعة أوسع فارغة في القسم</strong>
            <span>كل قاعات القسم التي تتّسع لهذه الشعبة مشغولة في وقتها.</span>
            <div className="hp-row"><button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-main" onClick={() => startBorrow(selSession!)}>اعرض قاعات القسم المجاور</button></div>
          </div>
        ) : null}
        {notice ? <div className={`hp-alert ${notice.tone === "ok" ? "is-ok" : "is-warn"}`} role="status"><span>{notice.text}</span></div> : null}
      </div>
    );
  })();

  /* ── لوحة المفاتيح على المشهد ── */
  const onStageKey = (e: React.KeyboardEvent) => {
    const scene = sceneRef.current; if (!scene) return;
    if (e.key === "ArrowLeft") { scene.rotateBy(0.12, 0); e.preventDefault(); }
    else if (e.key === "ArrowRight") { scene.rotateBy(-0.12, 0); e.preventDefault(); }
    else if (e.key === "ArrowUp") { scene.rotateBy(0, -0.08); e.preventDefault(); }
    else if (e.key === "ArrowDown") { scene.rotateBy(0, 0.08); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { scene.zoomBy(0.88); e.preventDefault(); }
    else if (e.key === "-") { scene.zoomBy(1.14); e.preventDefault(); }
    else if (e.key === "0") { scene.resetView(); e.preventDefault(); }
  };

  const heading = props.heading || (context === "dean" ? "نبض القاعات في الكلية" : "نبض القاعات");
  const dayLabel = day === "week" ? "الأسبوع كله" : PULSE_DAYS.find(x => x.key === day)!.label;

  if (loading) return <PulseSkeleton label="يقرأ القاعات والمواعيد…" />;
  if (loadError) return <div className="hp-shell"><div className="hp-empty"><strong>تعذّر فتح نبض القاعات</strong><span>{loadError}</span></div></div>;
  if (!hasHalls) return (
    <div className="hp-shell"><div className="hp-empty">
      <strong>لا قاعات لهذا النطاق بعد</strong>
      <span>تظهر القاعات حين تُسجَّل في سجل المباني والقاعات أو تُسند إليها مواعيد في هذا الفصل.</span>
    </div></div>
  );

  return (
    <div className="hp-shell" dir="rtl">
      <div className="hp-top">
        <div className="hp-title">
          <h2>{heading}</h2>
          <p>كل قاعة غرفةٌ تضيء حين تُشغل، ومنسوبها ولونها يقولان هل تتّسع لشعبتها.{context !== "workshop" ? " للقراءة فقط." : ""}</p>
        </div>
        {pathsAllowed ? (
          <div className="hp-mode hp-lens" role="group" aria-label="ما يُعرض">
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={mode === "halls"} onClick={() => { setMode("halls"); setPathId(null); setNearFor(null); }}>القاعات</button>
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={mode === "paths"} onClick={() => { setMode("paths"); setSelected(null); setPlan(null); setFreeGlow(false); setWalk(0); setSay("مسارات التنقّل: اختر أستاذاً أو دفعة، أو اضغط انتقالاً من «أصعب التنقلات اليوم» ليُعرض مساره ويمشي مع الساعة."); setSheetOpen(true); }}>مسارات التنقّل</button>
          </div>
        ) : null}
        <div className="hp-mode" role="group" aria-label="طريقة الرسم">
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={!flat} disabled={sceneFailed} onClick={() => setFlat(false)} title={sceneFailed ? "تعذّر الرسم ثلاثي الأبعاد على هذا الجهاز" : undefined}>مجسّم</button>
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={flat} onClick={() => setFlat(true)}>مسطّح</button>
        </div>
      </div>
      {mode === "halls" ? <div className="hp-walk" role="group" aria-label="أسئلة سريعة">
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 1} onClick={() => runWalk(1)}><i>1</i> أين الضغط الآن؟</button>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 2} onClick={() => runWalk(2)}><i>2</i> أين الهدر؟</button>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 3} onClick={() => runWalk(3)}><i>3</i> أين أضع شعبة جديدة؟</button>
        {canSave ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="is-magic" aria-pressed={walk === 4} onClick={() => runWalk(4)}><i>4</i> رتّب كل شيء بضغطة</button> : null}
      </div> : null}
      <p className="hp-say" aria-live="polite">{say || "ابدأ بسؤالٍ من الأسئلة أعلاه، أو حرّك الساعة واضغط أي قاعة بنفسك."}</p>

      <div className={`hp-stage${narrow ? " is-narrow" : ""}`} style={(() => { const sky = skyAt(day === "week" ? model.dayStart + (model.dayEnd - model.dayStart) * 0.45 : minute, model.dayStart, model.dayEnd); return { ["--hp-sky-top" as any]: sky.top, ["--hp-sky-mid" as any]: sky.mid }; })()}>
        <div className={`hp-view${insideKey ? " is-inside" : ""}${cine !== "off" ? " is-cinema" : ""}`} ref={viewRef} tabIndex={flat ? -1 : 0} onKeyDown={onStageKey}
          aria-label={flat ? undefined : "مجسّم القاعات: الأسهم للتدوير، و+ و− للتقريب، و0 للعودة"} role={flat ? undefined : "application"}>
          {flat ? (
            <FlatBoard model={model} visuals={visuals} selected={selected} onPick={key => pickRef.current(key, false)} day={day} />
          ) : (
            <>
              <div className="hp-labels" ref={labelsRef} aria-hidden="true" />
              {!sceneReady ? <div className="hp-loading"><span className="hp-spinner" aria-hidden="true" /> يجهّز المجسّم…</div> : null}
              <div className="hp-view-tools">
                <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-icon" onClick={() => sceneRef.current?.zoomBy(0.86)} aria-label="تقريب">+</button>
                <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-icon" onClick={() => sceneRef.current?.zoomBy(1.16)} aria-label="تبعيد">−</button>
                <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-icon" onClick={() => sceneRef.current?.resetView()} aria-label="عودة إلى المنظر الكامل">⟲</button>
                {exploded ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-icon hp-icon-wide" onClick={() => setSelected(null)} aria-label="أعد الطوابق إلى أماكنها">كل الطوابق</button> : null}
              </div>
              {hovered && !selected && !insideKey && cine === "off" && model.hallByKey.get(hovered) ? <div className="hp-hover" aria-hidden="true">{hoverText(model, occ, hovered, day, heat)}</div> : null}
              {cine !== "off" && nowPoint ? (
                <div className="hp-hud" role="status" aria-live="off">
                  <span className="hp-hud-clock"><bdi dir="ltr">{clockText(minuteShown)}</bdi><small>{dayLabel}</small></span>
                  <span className="hp-hud-count"><LiveCount value={nowPoint.students} /><small>في القاعات الآن <em className="hp-est">تقدير</em></small></span>
                  <span className="hp-hud-bar" aria-hidden="true"><i style={{ width: `${peak ? Math.min(100, Math.round((nowPoint.students / peak.students) * 100)) : 0}%` }} data-over={nowPoint.over > 0 || undefined} /></span>
                </div>
              ) : null}
              {comparing ? (
                <div className="hp-split-layer"><div className="hp-split" style={{ left: `${(split * 100).toFixed(2)}%` }}>
                  <span className="hp-split-line" aria-hidden="true" />
                  <span className="hp-split-tag is-after" aria-hidden="true">بعد الترتيب</span>
                  <span className="hp-split-tag is-before" aria-hidden="true">الآن</span>
                  <div className="hp-split-grip" role="slider" tabIndex={0} aria-label="فاصل قبل وبعد: يساره القاعات بعد الترتيب ويمينه القاعات كما هي الآن" aria-orientation="horizontal"
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split * 100)} aria-valuetext={`بعد الترتيب ${n(split * 100)}% من المشهد`}
                    onKeyDown={e => {
                      const move = e.key === "ArrowLeft" ? -0.04 : e.key === "ArrowRight" ? 0.04 : e.key === "PageDown" ? -0.2 : e.key === "PageUp" ? 0.2 : 0;
                      if (move) setSplit(v => Math.max(0.04, Math.min(0.96, v + move)));
                      else if (e.key === "Home") setSplit(0.04);
                      else if (e.key === "End") setSplit(0.96);
                      else return;
                      e.preventDefault(); e.stopPropagation();
                    }}
                    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); e.currentTarget.focus(); }}
                    onPointerMove={e => {
                      if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
                      const r = viewRef.current?.getBoundingClientRect();
                      if (r && r.width) setSplit(Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width)));
                    }}>
                    <span aria-hidden="true">‹ ›</span>
                  </div>
                </div></div>
              ) : null}
              {cine === "worst" && worst && !insideKey ? (() => {
                const h = model.hallByKey.get(worst.hallKey)!;
                return (
                  <div className="hp-caption is-worst" role="status">
                    <strong><i aria-hidden="true">{FIT_GLYPH.pressed}</i> أشدّ لحظة في اليوم · <bdi dir="ltr">{clockText(worst.minute)}</bdi></strong>
                    <span>{hallTitle(h)} · {h.buildingLabel}: نحو {countOf(worst.students, AR.student)} في {countOf(worst.capacity, AR.seat)} — <b>{countOf(worst.over, AR.student)} فوق السعة</b> <em className="hp-est">تقدير</em>{worst.pressed > 1 ? ` · ومعها ${countOf(worst.pressed - 1, AR.room)} مضغوطة أخرى` : ""}</span>
                    <div className="hp-row">
                      <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-main" onClick={continueCinema}>أكمل</button>
                      {canSave ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-magic" onClick={arrange} disabled={Boolean(plan) || saving}>✦ رتّب قاعاتي</button> : null}
                    </div>
                  </div>
                );
              })() : null}
              {cine === "end" && !insideKey ? (
                <div className="hp-caption" role="status">
                  <strong>انتهى اليوم</strong>
                  <span>{peak ? <>ذروة الحضور <bdi dir="ltr">{clockText(peak.minute)}</bdi> بنحو {countOf(peak.students, AR.student)} <em className="hp-est">تقدير</em></> : "لا محاضرات في هذا اليوم"}{peak ? (worst ? <> · أشدّ ضغط <bdi dir="ltr">{clockText(worst.minute)}</bdi></> : " · لا قاعة فوق سعتها") : ""}</span>
                  <div className="hp-row">
                    <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-main" onClick={startCinema}>أعد العرض</button>
                    <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" onClick={closeCinema}>إغلاق</button>
                  </div>
                </div>
              ) : null}
              {insideKey && insideHall && insideLayout ? (
                <>
                  <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-exit" onClick={() => setInsideKey(null)}>اخرج <span aria-hidden="true">✕</span></button>
                  <div className="hp-caption is-inside" role="status">
                    <strong>{hallTitle(insideHall)} من الداخل <small>{insideHall.buildingLabel}</small></strong>
                    {insideSession ? (
                      <>
                        <span className="hp-inside-course">{sessionLine(insideSession)} · <bdi dir="ltr">{clockText(insideSession.start)}–{clockText(insideSession.end)}</bdi></span>
                        <span className="hp-fitline"><Pill cls={fitClass(insideSession.students, insideHall.capacity)} /> نحو {countOf(insideSession.students || 0, AR.student)} في {countOf(insideLayout.capacity, AR.seat)} <em className="hp-est" title="سعة المقرر لكل شعبة، لا عدد المسجّلين">تقدير</em></span>
                        {insideLayout.standingReal ? <span className="hp-inside-over"><i aria-hidden="true">{FIT_GLYPH.pressed}</i> {countOf(insideLayout.standingReal, AR.student)} بلا مقعد: يقفون عند الباب{insideLayout.standing < insideLayout.standingReal ? ` (يُرسم منهم ${n(insideLayout.standing)})` : ""}</span> : null}
                      </>
                    ) : <span className="hp-fitline"><span className="hp-pill is-empty">فارغة الآن</span> {countOf(insideLayout.capacity, AR.seat)}</span>}
                    {insideLayout.capped ? <small>القاعة كبيرة: يُرسم {countOf(insideLayout.drawn, AR.seat)} من {n(insideLayout.capacity)} بالنسبة نفسها.</small> : null}
                  </div>
                </>
              ) : null}
            </>
          )}
          {!hintSeen && !flat && cine === "off" && !insideKey ? (
            <div className="hp-hint" role="note">
              <span><b>ابدأ هنا:</b> اضغط قاعة لترى شعبتها، ومرتين لتدخلها · اسحب للتدوير · {narrow ? "قرّب بإصبعين" : "قرّب بالعجلة أو بإصبعين"}</span>
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-hint-close" onClick={() => { setHintSeen(true); writeHint(); }} aria-label="إخفاء التلميح">فهمت <span aria-hidden="true">✕</span></button>
            </div>
          ) : null}
        </div>
        <aside className={`hp-side${narrow ? " hp-sheet" : ""}${narrow && sheetOpen ? " is-open" : ""}`} aria-label="تفاصيل القاعة">
          <div className="hp-clock">
            {narrow ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-sheet-handle" aria-expanded={sheetOpen} onClick={() => setSheetOpen(o => !o)}><span aria-hidden="true" /><b className="hp-sr">{sheetOpen ? "طيّ اللوحة" : "فتح اللوحة"}</b></button> : null}
            <div className="hp-clock-time"><bdi dir="ltr">{day === "week" ? "الأسبوع" : `${clockText(minuteShown)}`}</bdi></div>
            <div className="hp-fine" data-stats={`${stats.busy}|${stats.over}|${stats.wide}`}>{dayLabel}{day !== "week" ? ` · مشغولة ${n(stats.busy)} من ${countOf(model.halls.length, AR.room)} · مضغوطة ${n(stats.over)} · واسعة ${n(stats.wide)}` : ` · ${countOf(model.halls.length, AR.room)}`}</div>
          </div>
          <div className="hp-legend" aria-label="مفتاح الألوان">
            {day === "week" ? (
              <span className="hp-ramp"><i />قليلة الإشغال ← كثيرة الإشغال</span>
            ) : (
              <>
                <span data-tone="fit"><i aria-hidden="true">{FIT_GLYPH.fit}</i>مناسبة</span>
                <span data-tone="full"><i aria-hidden="true">{FIT_GLYPH.full}</i>ممتلئة</span>
                <span data-tone="pressed"><i aria-hidden="true">{FIT_GLYPH.pressed}</i>مضغوطة</span>
                <span data-tone="wide"><i aria-hidden="true">{FIT_GLYPH.wide}</i>واسعة على شعبتها</span>
                <span data-tone="empty"><i aria-hidden="true">○</i>فارغة</span>
                {model.foreignBusy.size ? <span data-tone="foreign">جهة أخرى</span> : null}
              </>
            )}
            <small>عدد الطلبة تقدير: سعة المقرر لكل شعبة، لا المسجّلون فعلاً.</small>
          </div>
          <div className="hp-sheet-body">
            {planMini}
            {mode === "paths" ? pathsPanel : panel}
          </div>
        </aside>
        <div className="hp-bar">
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-main hp-play" disabled={day === "week"} aria-pressed={playing || cine === "run"}
            onClick={() => { if (playing || cine === "run") { stopPlay(); return; } setPending(null); setFreeGlow(false); if (mode === "halls") startCinema(); else setPlaying(true); }}>
            <span aria-hidden="true" className="hp-play-glyph">{playing || cine === "run" ? "❚❚" : "▶"}</span>{playing || cine === "run" ? "أوقف" : "شغّل اليوم"}
          </button>
          {canSound && mode === "halls" ? (
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-sound" aria-pressed={soundOn} onClick={toggleSound} disabled={day === "week"}
              aria-label={soundOn ? "أطفئ النغمة الخافتة مع العرض" : "شغّل نغمةً خافتة مع العرض"} title={soundOn ? "النغمة الخافتة مع العرض: مفعّلة" : "نغمة خافتة مع العرض تعلو مع الازدحام (مطفأة)"}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" fillOpacity=".18" />
                {soundOn ? <><path d="M15.5 9a4.2 4.2 0 0 1 0 6" /><path d="M18 6.5a7.6 7.6 0 0 1 0 11" /></> : <path d="M16 9.5l5 5m0-5l-5 5" />}
              </svg>
            </button>
          ) : null}
          {canSave && mode === "halls" ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-magic" onClick={arrange} disabled={Boolean(plan) || saving || day === "week"}>✦ رتّب قاعاتي</button> : null}
          <label className="hp-range">
            <span className="hp-sr">الساعة</span>
            {day !== "week" && curve.length ? <DayTimeline curve={curve} peak={peak ? peak.students : 0} minute={minute} worst={worst ? worst.minute : null} start={model.dayStart} end={model.dayEnd} /> : null}
            <input data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="range" min={model.dayStart} max={model.dayEnd - 5} step={5} value={minuteShown} disabled={day === "week"}
              aria-valuetext={clockText(minuteShown)}
              onChange={e => { setMinute(Number(e.target.value)); stopPlay(); setPending(null); setFreeGlow(false); }} />
          </label>
          <div className="hp-days" role="group" aria-label="اليوم">
            {PULSE_DAYS.map(d => (
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={d.key} type="button" aria-pressed={day === d.key} onClick={() => { stopPlay(); setDay(d.key); setPlan(null); setPending(null); setBorrow(null); setWalk(0); setSay(""); }}>{d.short}</button>
            ))}
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={day === "week"} onClick={() => { setDay("week"); stopPlay(); setInsideKey(null); setPlan(null); setPending(null); setBorrow(null); setFreeGlow(false); setWalk(0); setSay("الأسبوع كله: ارتفاع كل قاعة ولونها نسبةُ ساعاتها المشغولة. اضغط يوماً تحت القاعة لتنتقل إليه."); }}>الأسبوع</button>
          </div>
        </div>
        {planView}
      </div>
    </div>
  );
}

/** حالة قاعةٍ (قبل الخطة) إلى ما يرسمه المشهد: اللون والمنسوب واللافتة كما في الحالة الأساسية. */
function visualOfState(h: PulseHall, st: HallState, showLabel: boolean): HallVisual {
  if (st.fit === "empty") return { color: 0xcfe9df, level: 0, occupied: false, label: h.code, showLabel };
  if (st.fit === "foreign") return { color: 0x5d6f67, level: 0.5, occupied: true, dim: true, label: `${h.code} · جهة أخرى`, showLabel: false };
  return { color: FIT_HEX[st.fit], level: st.level, occupied: true, pulse: st.fit === "pressed", label: `${FIT_GLYPH[st.fit]} ${h.code}`, showLabel: showLabel || st.fit === "pressed" };
}

/** عدّاد الطلبة الحيّ: يصعد ويهبط بتخفيفٍ إلى القيمة، ويعيد رسم نفسه وحده. */
function LiveCount({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    if (prefersReduced()) { ref.current = value; setShown(value); return; }
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      ref.current += (value - ref.current) * (1 - Math.exp(-dt * 7));
      if (Math.abs(value - ref.current) < 0.5) { ref.current = value; setShown(value); return; }
      setShown(Math.round(ref.current));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b>{shown > 0 ? `نحو ${countOf(shown, AR.student)}` : "لا طلبة"}</b>;
}

/**
 * الخط الزمني النحيل فوق شريط الساعة: منحنى حضور اليوم، وما تحته أحمر حيث قاعةٌ فوق سعتها،
 * وعلامة أشدّ لحظة، ورأس التشغيل. يُقرأ من اليمين إلى اليسار كشريط الساعة تحته.
 */
function DayTimeline({ curve, peak, minute, worst, start, end }: { curve: readonly PressurePoint[]; peak: number; minute: number; worst: number | null; start: number; end: number }) {
  const W = 1000, H = 40, base = 34, top = 5;
  const span = Math.max(1, end - 5 - start);
  const x = (m: number) => W - (Math.max(0, Math.min(span, m - start)) / span) * W;
  const y = (v: number) => base - (peak > 0 ? v / peak : 0) * (base - top);
  const shape = useMemo(() => {
    let area = `M ${x(start).toFixed(1)} ${base}`, line = "";
    curve.forEach((p, i) => {
      const next = curve[i + 1];
      const x0 = x(p.minute).toFixed(1), x1 = x(next ? next.minute : end - 5).toFixed(1), yy = y(p.students).toFixed(1);
      area += ` L ${x0} ${yy} L ${x1} ${yy}`;
      line += `${i ? " L" : "M"} ${x0} ${yy} L ${x1} ${yy}`;
    });
    area += ` L ${x(end - 5).toFixed(1)} ${base} Z`;
    const over: Array<[number, number]> = [];
    curve.forEach((p, i) => {
      if (!p.over) return;
      const to = curve[i + 1] ? curve[i + 1].minute : end - 5;
      const lastSeg = over[over.length - 1];
      if (lastSeg && lastSeg[1] === p.minute) lastSeg[1] = to; else over.push([p.minute, to]);
    });
    return { area, line, over };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, peak, start, end]);
  const hours: number[] = [];
  for (let m = Math.ceil(start / 120) * 120; m < end; m += 120) if (m > start) hours.push(m);
  const head = x(minute);
  return (
    <span className="hp-timeline" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id="hp-tl-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2bd76" stopOpacity=".55" /><stop offset="1" stopColor="#4fd3a1" stopOpacity=".08" /></linearGradient>
        </defs>
        {hours.map(m => <line key={m} x1={x(m)} x2={x(m)} y1={top} y2={base} className="hp-tl-hour" />)}
        <path d={shape.area} fill="url(#hp-tl-fill)" />
        <path d={shape.line} className="hp-tl-line" />
        <line x1={0} x2={W} y1={base + 3} y2={base + 3} className="hp-tl-base" />
        {shape.over.map(([a, b]) => <line key={a} x1={x(a)} x2={x(b)} y1={base + 3} y2={base + 3} className="hp-tl-over" />)}
        {worst != null ? <line x1={x(worst)} x2={x(worst)} y1={top - 3} y2={base + 3} className="hp-tl-worst" /> : null}
        <line x1={head} x2={head} y1={0} y2={H} className="hp-tl-head" />
      </svg>
      <span className="hp-tl-hours">{hours.map(m => <i key={m} style={{ right: `${((m - start) / span) * 100}%` }}>{String(Math.floor(m / 60)).padStart(2, "0")}</i>)}</span>
    </span>
  );
}

/** شاشة الهاتف: مبانٍ في عمود، ولافتاتٌ أقل. */
function useNarrow(): boolean {
  const query = "(max-width: 560px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

function s0(g: { start: number }, _model: PulseModel) { return <bdi dir="ltr">{clockText(g.start)}</bdi>; }

function planNotesFor(plan: DayPlan, key: string, model: PulseModel): string {
  const notes: string[] = [];
  plan.groups.forEach(g => { if (!g.on) return; g.moves.forEach(mv => {
    if (mv.from === key) notes.push(`تنتقل شعبتها ${clockText(model.sessionById.get(mv.sessionId)!.start)} إلى ${model.hallByKey.get(mv.to)!.code}`);
    if (mv.to === key) notes.push(`تستقبل شعبة ${clockText(model.sessionById.get(mv.sessionId)!.start)} من ${model.hallByKey.get(mv.from)!.code}`);
  }); });
  return notes.length ? `في الخطة: ${notes.join("، ")}.` : "لا نقلة تخصّ هذه القاعة في الخطة.";
}

function hoverText(model: PulseModel, occ: Map<string, PulseSession>, key: string, day: PulseDay | "week", heat: ReturnType<typeof weeklyHeat>): string {
  const h = model.hallByKey.get(key)!;
  if (day === "week") return `${h.code} · إشغال الأسبوع ${n((heat.get(key)?.week || 0) * 100)}%`;
  const s = occ.get(key);
  if (!s) return `${h.code} · فارغة${h.capacity ? ` · ${countOf(h.capacity, AR.seat)}` : ""}`;
  return `${h.code} · ${s.courseName} · ${FIT_LABEL[fitClass(s.students, h.capacity)]}`;
}

function Pill({ cls }: { cls: FitClass }) {
  return <span className="hp-pill" data-tone={FIT_TOKEN[cls]}><i aria-hidden="true">{FIT_GLYPH[cls]}</i>{FIT_LABEL[cls]}</span>;
}

function WeekStrip({ hall, heat, onDay }: { hall: PulseHall; heat: ReturnType<typeof weeklyHeat>; onDay: (d: PulseDay) => void }) {
  const w = heat.get(hall.key);
  if (!w) return null;
  return (
    <div className="hp-week">
      <div className="hp-fine">أسبوع القاعة · {n(w.week * 100)}%{w.worst !== "unknown" ? ` · أسوأ حالاتها: ${FIT_LABEL[w.worst]}` : ""}</div>
      <div className="hp-week-cells">
        {PULSE_DAYS.map((d, i) => (
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={d.key} type="button" onClick={() => onDay(d.key)} title={`${d.label}: ${n(w.days[i] * 100)}%`}>
            <i style={{ ["--h" as any]: `${Math.round(w.days[i] * 100)}%` }} />
            <span>{d.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** البديل المسطّح: الطوابق صفوفاً من الأعلى إلى الأرض، والقاعة زرٌّ بمنسوبها. */
function FlatBoard({ model, visuals, selected, onPick, day }: { model: PulseModel; visuals: Map<string, HallVisual>; selected: string | null; onPick: (key: string) => void; day: PulseDay | "week" }) {
  const groups = useMemo(() => {
    const map = new Map<string, PulseHall[]>();
    model.halls.forEach(h => { const k = h.buildingCode || "—"; (map.get(k) || map.set(k, []).get(k)!).push(h); });
    return [...map.entries()].map(([code, halls]) => {
      const floors = [...new Set(halls.map(h => h.floor))].sort((a, b) => b - a);
      return { code, label: halls[0].buildingLabel, floors: floors.map(f => ({ f, halls: halls.filter(h => h.floor === f) })) };
    });
  }, [model]);
  const hex = (v: number) => `#${v.toString(16).padStart(6, "0")}`;
  return (
    <div className="hp-flat">
      {groups.map(g => (
        <section key={g.code} className="hp-flat-building" aria-label={g.label}>
          <h4>{g.label}</h4>
          {g.floors.map(fl => (
            <div key={fl.f} className="hp-flat-floor">
              <span className="hp-flat-floor-no">{fl.f === 0 ? "أرضي" : `ط ${n(fl.f)}`}</span>
              <div className="hp-flat-rooms">
                {fl.halls.map(h => {
                  const v = visuals.get(h.key);
                  const level = v?.occupied ? Math.min(1.1, Math.max(0.08, v.level)) : 0;
                  return (
                    <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={h.key} type="button" className={`hp-flat-room${selected === h.key ? " is-selected" : ""}${v?.glow ? " is-glow" : ""}${v?.pulse ? " is-pulse" : ""}${v?.dim ? " is-dim" : ""}`}
                      aria-pressed={selected === h.key} onClick={() => onPick(h.key)}
                      aria-label={`${h.code}${h.capacity ? `، ${countOf(h.capacity, AR.seat)}` : ""}${day === "week" ? "" : v?.occupied && !v.dim ? "، مشغولة" : "، فارغة"}`}>
                      <i style={{ height: `${Math.min(100, level * 100)}%`, background: v?.occupied ? hex(v.color) : undefined }} />
                      <span>{h.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PulseSkeleton({ label }: { label: string }) {
  return (
    <div className="hp-shell" aria-busy="true">
      <div className="hp-skeleton" role="status">
        <div className="hp-skel-stage"><span className="hp-spinner" aria-hidden="true" /><span>{label}</span></div>
      </div>
    </div>
  );
}

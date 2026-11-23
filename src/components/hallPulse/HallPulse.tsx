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
  occupantsAt, foreignAt, originalAssignment, borrowCandidates, planDay, planMoves, suggestHalls, toggleGroup, weeklyHeat, floorOf,
  type Assignment, type DayPlan, type FitClass, type PulseCourseInput, type PulseDay, type PulseHall, type PulseModel,
  type PulseRegistryInput, type PulseRowInput, type PulseSession,
} from "../../utils/hallPulse";
import { AR, countOf, type ArabicNoun } from "../../utils/arabicCount";
import type { HallVisual, PulseScene as PulseSceneType } from "./pulseScene";

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
}

const MOVE: ArabicNoun = { one: "نقلة", two: "نقلتان", few: "نقلات", many: "نقلة" };
const FIT_HEX: Record<FitClass, number> = { pressed: 0xf0674f, full: 0xf0b24a, fit: 0x4fd3a1, wide: 0x6aa9d8, unknown: 0xa8b5af };
const FIT_TOKEN: Record<FitClass, string> = { pressed: "pressed", full: "full", fit: "fit", wide: "wide", unknown: "unknown" };
const HINT_KEY = "hall-pulse-hint-v1";
const n = (v: number) => Math.round(v).toLocaleString("ar-KW-u-nu-latn");
const weekRamp = (t: number) => {
  /* حرارة الأسبوع: من الزجاج الهادئ إلى النحاسي. */
  const a = [0x2a, 0x6b, 0x5c], b = [0xe2, 0xbd, 0x76];
  const k = Math.max(0, Math.min(1, t));
  return (Math.round(a[0] + (b[0] - a[0]) * k) << 16) | (Math.round(a[1] + (b[1] - a[1]) * k) << 8) | Math.round(a[2] + (b[2] - a[2]) * k);
};

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
  const viewDay: PulseDay = day === "week" ? defaults.day : day;

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

  /* ── الساعة تمشي ── */
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      setMinute(m => { const next = m + dt * 36; return next >= model.dayEnd - 5 ? model.dayStart : next; });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, model.dayStart, model.dayEnd]);
  const minuteShown = Math.floor(minute / 5) * 5;

  /* ── الألوان للمشهد ── */
  const glowKeys = useMemo(() => {
    const out = new Set<string>();
    if (freeGlow && day !== "week") for (const h of model.halls) if (!occ.has(h.key) && !foreignAt(model, h.key, viewDay, minuteShown) && h.capacity) out.add(h.key);
    suggestions.forEach(h => out.add(h.key));
    return out;
  }, [freeGlow, model, occ, viewDay, minuteShown, suggestions, day]);
  const manyHalls = model.halls.length > 36;
  const visuals = useMemo(() => {
    const out = new Map<string, HallVisual>();
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
          pulse: cls === "pressed", ghost: pending?.to === h.key, label: h.code,
          showLabel: !manyHalls || cls === "pressed" || pending?.to === h.key || pending?.from === h.key,
        });
      } else {
        out.set(h.key, {
          color: foreign ? 0x5d6f67 : 0xcfe9df, level: foreign ? 0.5 : 0, occupied: foreign, dim: foreign,
          glow: glowKeys.has(h.key), label: foreign ? `${h.code} · جهة أخرى` : h.code, showLabel: glowKeys.has(h.key) || (!manyHalls && !freeGlow),
        });
      }
    }
    return out;
  }, [model, occ, day, heat, viewDay, minuteShown, glowKeys, pending, manyHalls, freeGlow]);

  /* ── المشهد ── */
  const viewRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PulseSceneType | null>(null);
  const pickRef = useRef<(key: string | null, nb: boolean) => void>(() => undefined);
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
          canvas, host: viewRef.current, labels: labelsRef.current, layout, reduced, topDown: narrow,
          onPick: (key, nb) => pickRef.current(key, nb), onHover: setHovered,
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

  /* ── الجار: مبنى القسم المجاور حين لا تتّسع قاعات القسم ── */
  const nb = useMemo(() => {
    if (!borrow || !["pick", "form", "sending", "sent", "approved"].includes(borrow.stage)) return null;
    const halls: PulseHall[] = [...borrow.options.map(o => ({ ...o, free: true })), ...borrow.others.map(o => ({ ...o, free: false }))].map(o => ({
      key: `nb:${o.roomId}`, roomId: o.roomId, buildingCode: o.roomCode, buildingLabel: `مبنى ${o.roomCode}`, code: o.roomHall,
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
  const stopPlay = () => setPlaying(false);
  const hallTitle = (h: PulseHall) => (h.lab ? h.code : `قاعة ${h.code}`);
  const sessionLine = (s: PulseSession) => [s.courseName, s.sectionCode ? `ش ${s.sectionCode}` : ""].filter(Boolean).join(" · ");

  const selectHall = useCallback((key: string | null) => {
    setSelected(key);
    setNotice(null);
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
      if (options.length) announce(`لا قاعة أوسع فارغة في القسم لهذه الشعبة. ظهر ${options[0].roomCode === building ? `مبنى ${building}` : "المبنى المجاور"} بقاعاته الفارغة في وقتها كله: اختر واحدة واطلب استعارتها.`);
    } catch (error: any) {
      setBorrow({ sessionId: session.id, stage: "error", options: [], others: [], error: String(error?.message || error) });
    }
  }, [collegeId, sectionId, termId, model]);

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
  const stats = useMemo(() => {
    let busy = 0, over = 0, wide = 0;
    for (const h of model.halls) {
      const s = occ.get(h.key); if (!s) continue; busy++;
      const c = fitClass(s.students, h.capacity); if (c === "pressed") over++; else if (c === "wide") wide++;
    }
    return { busy, over, wide };
  }, [occ, model]);

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
    if (ok) { setBorrow(null); setNotice({ tone: "ok", text: `نُقلت الشعبة إلى ${opt.roomHall} في مبنى ${opt.roomCode} بالاستعارة.` }); }
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
        <span>هذه قاعات فارغة في مبنى {borrow.options[0]?.roomCode} طوال وقت الشعبة في أيامها كلها:</span>
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
          <dt>القاعة</dt><dd>{opt.roomHall} · {opt.capacity ? countOf(opt.capacity, AR.seat) : "سعة غير مسجّلة"} · مبنى {opt.roomCode}</dd>
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
        {pending ? (
          <div className="hp-alert is-ok">
            <strong>مراجعة قبل الحفظ</strong>
            {(() => {
              const s = model.sessionById.get(pending.sessionId)!, from = model.hallByKey.get(pending.from)!, to = model.hallByKey.get(pending.to)!;
              return <span>من {from.code} إلى {to.code} · نحو {countOf(s.students || 0, AR.student)} في {countOf(to.capacity || 0, AR.seat)} · {FIT_LABEL[fitClass(s.students, to.capacity)]}. تنتقل القاعة في أيام الشعبة كلها.</span>;
            })()}
            <div className="hp-row">
              <button type="button" data-guide-ignore="يحفظ نقل الشعبة عبر مسار النقل المعتاد في الورشة" className="hp-btn is-main" disabled={saving} onClick={savePending}>{saving ? "يحفظ…" : "حفظ"}</button>
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn" disabled={saving} onClick={cancelPending}>إلغاء</button>
            </div>
          </div>
        ) : plan ? (
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
        <div className="hp-mode" role="group" aria-label="طريقة الرسم">
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={!flat} disabled={sceneFailed} onClick={() => setFlat(false)} title={sceneFailed ? "تعذّر الرسم ثلاثي الأبعاد على هذا الجهاز" : undefined}>مجسّم</button>
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={flat} onClick={() => setFlat(true)}>مسطّح</button>
        </div>
      </div>
      <div className="hp-walk" role="group" aria-label="أسئلة سريعة">
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 1} onClick={() => runWalk(1)}><i>1</i> أين الضغط الآن؟</button>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 2} onClick={() => runWalk(2)}><i>2</i> أين الهدر؟</button>
        <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={walk === 3} onClick={() => runWalk(3)}><i>3</i> أين أضع شعبة جديدة؟</button>
        {canSave ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="is-magic" aria-pressed={walk === 4} onClick={() => runWalk(4)}><i>4</i> رتّب كل شيء بضغطة</button> : null}
      </div>
      <p className="hp-say" aria-live="polite">{say || "ابدأ بسؤالٍ من الأسئلة أعلاه، أو حرّك الساعة واضغط أي قاعة بنفسك."}</p>

      <div className="hp-stage">
        <div className="hp-view" ref={viewRef} tabIndex={flat ? -1 : 0} onKeyDown={onStageKey}
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
              </div>
              {hovered && !selected && model.hallByKey.get(hovered) ? <div className="hp-hover" aria-hidden="true">{hoverText(model, occ, hovered, day, heat)}</div> : null}
            </>
          )}
          {!hintSeen && !flat ? (
            <div className="hp-hint" role="note">
              <span><b>ابدأ هنا:</b> اضغط قاعة لترى شعبتها · اسحب للتدوير · {narrow ? "قرّب بإصبعين" : "قرّب بالعجلة أو بإصبعين"}</span>
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" onClick={() => { setHintSeen(true); writeHint(); }} aria-label="إخفاء التلميح">فهمت</button>
            </div>
          ) : null}
        </div>
        <aside className="hp-side" aria-label="تفاصيل القاعة">
          <div className="hp-clock">
            <div className="hp-clock-time"><bdi dir="ltr">{day === "week" ? "الأسبوع" : `${clockText(minuteShown)}`}</bdi></div>
            <div className="hp-fine">{dayLabel}{day !== "week" ? ` · مشغولة ${n(stats.busy)} من ${countOf(model.halls.length, AR.room)} · مضغوطة ${n(stats.over)} · واسعة ${n(stats.wide)}` : ` · ${countOf(model.halls.length, AR.room)}`}</div>
          </div>
          {panel}
          <div className="hp-legend" aria-label="مفتاح الألوان">
            {day === "week" ? (
              <span className="hp-ramp"><i />قليلة الإشغال ← كثيرة الإشغال</span>
            ) : (
              <>
                <span data-tone="fit">مناسبة</span>
                <span data-tone="full">ممتلئة</span>
                <span data-tone="pressed">مضغوطة</span>
                <span data-tone="wide">واسعة على شعبتها</span>
                <span data-tone="empty">فارغة</span>
                {model.foreignBusy.size ? <span data-tone="foreign">جهة أخرى</span> : null}
              </>
            )}
            <small>عدد الطلبة تقدير: سعة المقرر لكل شعبة، لا المسجّلون فعلاً.</small>
          </div>
        </aside>
        <div className="hp-bar">
          <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-main hp-play" onClick={() => { setPlaying(p => !p); setPending(null); setFreeGlow(false); }} disabled={day === "week"} aria-pressed={playing}>
            {playing ? "أوقف" : "شغّل اليوم"}
          </button>
          {canSave ? <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" className="hp-btn is-magic" onClick={arrange} disabled={Boolean(plan) || saving || day === "week"}>✦ رتّب قاعاتي</button> : null}
          <label className="hp-range">
            <span className="hp-sr">الساعة</span>
            <input data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="range" min={model.dayStart} max={model.dayEnd - 5} step={5} value={minuteShown} disabled={day === "week"}
              aria-valuetext={clockText(minuteShown)}
              onChange={e => { setMinute(Number(e.target.value)); stopPlay(); setPending(null); setFreeGlow(false); }} />
          </label>
          <div className="hp-days" role="group" aria-label="اليوم">
            {PULSE_DAYS.map(d => (
              <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" key={d.key} type="button" aria-pressed={day === d.key} onClick={() => { setDay(d.key); setPlan(null); setPending(null); setBorrow(null); setWalk(0); setSay(""); }}>{d.short}</button>
            ))}
            <button data-guide-ignore="أداة عرضٍ في نبض القاعات: تغيّر ما يُرى أو تفتح مراجعة، والحفظ وحده يكتب عبر مسار النقل المعتاد" type="button" aria-pressed={day === "week"} onClick={() => { setDay("week"); setPlaying(false); setPlan(null); setPending(null); setBorrow(null); setFreeGlow(false); setWalk(0); setSay("الأسبوع كله: ارتفاع كل قاعة ولونها نسبةُ ساعاتها المشغولة. اضغط يوماً تحت القاعة لتنتقل إليه."); }}>الأسبوع</button>
          </div>
        </div>
        {planView}
      </div>
    </div>
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
  return <span className="hp-pill" data-tone={FIT_TOKEN[cls]}>{FIT_LABEL[cls]}</span>;
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

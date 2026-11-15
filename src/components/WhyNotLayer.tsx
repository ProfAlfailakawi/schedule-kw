import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FSchedule } from "../types";
import {
  dayKeysOf, WHY_META, WHY_ORDER, WHY_TIER_LABEL, whyNotCensus, whyNotField, whyNotSpeech,
  type WhyCell, type WhyKind, type WhyNotInput,
} from "../utils/whyNot";
import { whyIconSvg } from "../utils/whyNotIcons";
import { holdClashes, holdDraftFromForm, useScheduleHolds } from "../utils/scheduleHolds";
import { fetchSuggestions, suggestionBody } from "../utils/suggestionClient";
import { fitKeyOf, useFitGrid, type GridTarget } from "./useFitGrid";
import WhyIcon from "./WhyIcon";

/**
 * ── «لماذا لا؟»: طبقةُ التلوين فوق شبكة الأسبوع ─────────────────────────────────────
 *
 * تقرأ موعداً واحداً (المحدَّد في لوحة السياق) وتلوّن كلَّ خانةٍ فارغةٍ بما يمنعه من الجلوس فيها:
 * أخضرُ يتوهّج لما هو حرّ، عنبريٌّ لما يمرّ بملاحظة، أحمرُ لما يمنعه شيء — وأيقونةٌ واحدةٌ مهيمنةٌ في كل خانة.
 * الحقلُ من `whyNotField` (src/utils/whyNot.ts) المبنيّ على محرّك السحب نفسه، فلا تخالف الطبقةُ ما يفعله الإفلات.
 *
 * التلوينُ يُحقن في خانات الشبكة القائمة (`[data-physics-slot]`) بسمات data-* وعنصرٍ مساعد، فلا يُعاد رسمُ الشبكة،
 * ولا يوجد مسارُ نقلٍ ثانٍ: «انقل هنا» يستدعي `commitMove` نفسه بتوقّعه وتأكيده.
 */
export interface WhyNotLayerProps {
  subject: FSchedule | null;
  /** يُفعَّل الزرّ (موعدٌ محدَّد، أو الطبقة تعمل). */
  active: boolean;
  onToggle: () => void;
  days: ReadonlyArray<{ key: string; label: string }>;
  slots: readonly string[];
  gridEnd: number;
  mins: (clock: string) => number;
  buildCandidate: WhyNotInput["buildCandidate"];
  blockers: WhyNotInput["blockers"];
  patternSwitch?: WhyNotInput["patternSwitch"];
  hours?: WhyNotInput["hours"];
  locked?: string | null;
  /** للقراءة فقط (الهاتف أو بلا صلاحية): بلا «انقل هنا». */
  readOnly: boolean;
  /** هويةُ الصفوف: يُعاد الحقل حين تتغيّر لا حين يُعاد رسمُ الأب. */
  rows: readonly FSchedule[];
  scope: { collegeId: number; sectionId: number; termId: number };
  ignoreInstructorIds?: Iterable<number>;
  onMove: (row: FSchedule, day: string, start: string, label: string) => void;
}

const SLOT = "[data-physics-slot][data-physics-day][data-physics-start]";
const keyOf = (el: Element) => `${el.getAttribute("data-physics-day")}:${el.getAttribute("data-physics-start")}`;

export default function WhyNotLayer(props: WhyNotLayerProps) {
  const { subject, active, onToggle, days, slots, gridEnd, mins, patternSwitch: patternIn, hours: hoursIn, locked, readOnly, rows, scope, ignoreInstructorIds, onMove } = props;
  /* الأبُ يمرّر دوالَّ جديدةً في كل رسم؛ تُثبَّت هنا ويُعاد الحقلُ بتغيّر الصفوف والموعد وحدهما. */
  const fns = useRef(props); fns.current = props;
  const buildCandidate = useCallback<WhyNotInput["buildCandidate"]>((row, target) => fns.current.buildCandidate(row, target), []);
  const blockers = useCallback<WhyNotInput["blockers"]>((source, probe) => fns.current.blockers(source, probe), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const patternSwitch = useMemo(() => patternIn ? (day: string) => Boolean(fns.current.patternSwitch?.(day)) : undefined, [Boolean(patternIn), subject?.id, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const hours = useMemo(() => hoursIn || null, [hoursIn?.start, hoursIn?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const on = active && Boolean(subject);
  const [filter, setFilter] = useState<WhyKind | "free" | null>(null);
  const [open, setOpen] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [extra, setExtra] = useState<Record<string, WhyKind>>({});
  const [say, setSay] = useState("");
  const asked = useRef(new Set<string>());
  const roving = useRef("");

  const holdsState = useScheduleHolds({
    enabled: on, termId: scope.termId, collegeId: scope.collegeId, sectionId: scope.sectionId,
    draft: null, editId: subject ? Number(subject.id) : null, ignoreInstructorIds,
  });
  const holdClash = useCallback((candidate: FSchedule) => holdClashes(holdDraftFromForm(candidate as any), holdsState.holds, { ignoreInstructorIds })
    .map(item => ({ name: item.name, on: item.clashOn })), [holdsState.holds, ignoreInstructorIds]);

  const base = useMemo<WhyNotInput | null>(() => subject && on ? {
    subject, days, slots, gridEnd, mins, buildCandidate, blockers, patternSwitch, hours, locked, holdClash,
  } : null, [subject, on, days, slots, gridEnd, mins, buildCandidate, blockers, patternSwitch, hours, locked, holdClash]);

  /* الخريجون: قراءةٌ واحدة لكل الخانات غير الممنوعة (نبض الطلبة)، ثم تُعاد قراءةُ الحقل بها. */
  const firstPass = useMemo(() => base ? whyNotField(base) : new Map<string, WhyCell>(), [base]);
  const fitTargets = useMemo<GridTarget[]>(() => {
    if (!base || !subject) return [];
    const out: GridTarget[] = [];
    for (const cell of firstPass.values()) {
      if (!cell.free) continue;
      const candidate = buildCandidate(subject, { day: cell.day, start: cell.start });
      out.push({ days: dayKeysOf(candidate, days), start: mins(cell.start), end: mins(candidate.fendtime) });
    }
    return out;
  }, [firstPass, base, subject, buildCandidate, days, mins]);
  const fits = useFitGrid({
    enabled: on && Number(subject?.AdCourseId || 0) > 0, collegeId: scope.collegeId, sectionId: scope.sectionId, termId: scope.termId,
    courseId: Number(subject?.AdCourseId || 0), scode: String(subject?.SCode || ""), excludeId: Number(subject?.id || 0),
    version: 0, targets: fitTargets,
  });
  const field = useMemo(() => {
    if (!base || !subject) return new Map<string, WhyCell>();
    const graduates = (day: string, start: string) => {
      const candidate = buildCandidate(subject, { day, start });
      const fit = fits.get(fitKeyOf({ days: dayKeysOf(candidate, days), start: mins(start) }));
      return fit ? { percent: fit.percent, blocked: fit.blocked } : null;
    };
    const next = whyNotField({ ...base, graduates: fits.size ? graduates : undefined });
    for (const [key, kind] of Object.entries(extra) as Array<[string, WhyKind]>) {
      const cell = next.get(key);
      if (!cell || cell.reasons.some(item => item.kind === kind)) continue;
      const reasons = [...cell.reasons, { kind }].sort((a, b) => WHY_ORDER.indexOf(a.kind) - WHY_ORDER.indexOf(b.kind));
      next.set(key, { ...cell, reasons, dominant: reasons[0].kind, tier: cell.tier === "free" ? "caution" : cell.tier });
    }
    return next;
  }, [base, subject, fits, extra, buildCandidate, days, mins]);
  const census = useMemo(() => whyNotCensus(field), [field]);

  useEffect(() => { setFilter(null); setOpen(null); setExtra({}); asked.current.clear(); }, [subject?.id, on]);
  useEffect(() => { if (!on) { setOpen(null); setFilter(null); } }, [on]);

  /* ── التلوين: سماتٌ وعنصرٌ مساعد في كل خانة، ويُعاد بعد أي إعادة رسمٍ للشبكة ─────── */
  const fieldRef = useRef(field); fieldRef.current = field;
  const filterRef = useRef(filter); filterRef.current = filter;
  const dayLabel = useMemo(() => new Map(days.map(day => [day.key, day.label])), [days]);
  const paint = useCallback(() => {
    const current = fieldRef.current, only = filterRef.current;
    document.querySelectorAll<HTMLElement>(SLOT).forEach(el => {
      const cell = current.get(keyOf(el));
      if (!cell) { if (el.hasAttribute("data-wn-tier")) clean(el); return; }
      const sig = `${cell.tier}|${cell.dominant}|${only || ""}`;
      if (el.getAttribute("data-wn-sig") !== sig) {
        el.setAttribute("data-wn-sig", sig);
        el.setAttribute("data-wn-tier", cell.tier);
        el.setAttribute("data-wn-kind", cell.dominant || "free");
        const dim = only && !(only === "free" ? cell.tier === "free" : cell.reasons.some(item => item.kind === only));
        if (dim) el.setAttribute("data-wn-dim", "1"); else el.removeAttribute("data-wn-dim");
        let badge = el.querySelector<HTMLElement>(":scope > .wn-cell");
        if (!badge) { badge = document.createElement("span"); badge.className = "wn-cell"; badge.setAttribute("aria-hidden", "true"); el.appendChild(badge); }
        badge.innerHTML = whyIconSvg(cell.dominant ? WHY_META[cell.dominant].icon : "free");
        el.setAttribute("data-wn-label", whyNotSpeech(cell, dayLabel.get(cell.day) || ""));
      }
      el.setAttribute("aria-label", el.getAttribute("data-wn-label") || "");
      el.setAttribute("tabindex", roving.current ? (roving.current === keyOf(el) ? "0" : "-1") : "-1");
    });
    if (!roving.current || !document.querySelector(`${SLOT}[data-wn-tier][tabindex="0"]`)) {
      const first = document.querySelector<HTMLElement>(`${SLOT}[data-wn-tier]`);
      if (first) { roving.current = keyOf(first); first.setAttribute("tabindex", "0"); }
    }
  }, [dayLabel]);
  const clean = (el: HTMLElement) => {
    ["data-wn-tier", "data-wn-kind", "data-wn-dim", "data-wn-sig", "data-wn-label", "aria-label"].forEach(name => el.removeAttribute(name));
    el.setAttribute("tabindex", "-1");
    el.querySelector(":scope > .wn-cell")?.remove();
  };
  useEffect(() => {
    if (!on) return;
    paint();
    let frame = 0;
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>(SLOT).forEach(clean);
      roving.current = "";
    };
  }, [on, paint]);
  useEffect(() => { if (on) paint(); }, [field, filter, on, paint]);

  /* ── النافذة: نقرٌ أو Enter يفتحها، والأسهمُ تتنقّل، وEsc تغلق ───────────────────── */
  const openCell = useCallback((el: HTMLElement) => {
    const key = keyOf(el);
    setOpen({ key, rect: el.getBoundingClientRect() });
    setSay(el.getAttribute("data-wn-label") || "");
    roving.current = key;
  }, []);
  useEffect(() => {
    if (!on || !subject) return;
    const cellOf = (event: Event) => (event.target as Element | null)?.closest?.(`${SLOT}[data-wn-tier]`) as HTMLElement | null;
    const swallow = (event: Event) => { event.stopPropagation(); };
    const onDown = (event: Event) => { if (cellOf(event)) swallow(event); };
    const onClick = (event: Event) => { const el = cellOf(event); if (el) { swallow(event); event.preventDefault(); openCell(el); } };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(null); return; }
      const el = cellOf(event);
      if (!el) return;
      if (event.key === "Enter" || event.key === " ") { swallow(event); event.preventDefault(); openCell(el); return; }
      const rtl = getComputedStyle(document.documentElement).direction === "rtl" || document.dir === "rtl";
      const delta: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowRight: [rtl ? -1 : 1, 0], ArrowLeft: [rtl ? 1 : -1, 0] };
      const move = delta[event.key];
      if (!move) return;
      event.preventDefault(); swallow(event);
      const dayKey = el.getAttribute("data-physics-day") || "", start = el.getAttribute("data-physics-start") || "";
      const di = days.findIndex(day => day.key === dayKey) + move[0], si = slots.indexOf(start) + move[1];
      if (di < 0 || di >= days.length || si < 0 || si >= slots.length) return;
      const next = document.querySelector<HTMLElement>(`${SLOT}[data-physics-day="${days[di].key}"][data-physics-start="${slots[si]}"]`);
      if (!next) return;
      roving.current = keyOf(next);
      el.setAttribute("tabindex", "-1"); next.setAttribute("tabindex", "0"); next.focus();
      setSay(next.getAttribute("data-wn-label") || "");
      if (open) openCell(next);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [on, subject, open, days, slots, openCell]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    const away = (event: PointerEvent) => { if (!(event.target as Element | null)?.closest?.(".wn-pop, [data-wn-tier]")) close(); };
    document.addEventListener("pointerdown", away, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); document.removeEventListener("pointerdown", away, true); };
  }, [open]);

  /* «لا قاعة شاغرة»: المحرّكُ نفسُه الذي يجيب «اقترح قاعة متاحة»، يُسأل عند فتح خانةٍ لموعدٍ بلا قاعة. */
  const openCellData = open ? field.get(open.key) : undefined;
  useEffect(() => {
    if (!open || !openCellData || !subject || !openCellData.free) return;
    if (subject.AdRoomCode || subject.AdRoomHall || asked.current.has(open.key)) return;
    asked.current.add(open.key);
    const controller = new AbortController();
    const candidate = buildCandidate(subject, { day: openCellData.day, start: openCellData.start });
    fetchSuggestions(suggestionBody({ ...candidate, excludeId: subject.id }, "room"), controller.signal)
      .then(reply => { if (Array.isArray(reply.slots) && reply.slots.length === 0) setExtra(prev => ({ ...prev, [open.key]: "noRoom" })); })
      .catch(() => { /* صامت: لا نختلق سبباً */ });
    return () => controller.abort();
  }, [open?.key, openCellData?.day, openCellData?.start, subject?.id]);

  const legend: Array<{ id: WhyKind | "free"; count: number }> = [
    { id: "free", count: census.free },
    ...WHY_ORDER.filter(kind => census.reasons.get(kind)).map(kind => ({ id: kind as WhyKind | "free", count: census.reasons.get(kind) || 0 })),
  ];
  const title = subject ? String(subject.AdCourseName || "") : "";
  const popTop = open ? Math.min(window.innerHeight - 12, open.rect.bottom + 8) : 0;

  return (
    <>
      <button type="button" className={`wk-tool wn-toggle${on ? " is-on" : ""}`} aria-pressed={on} disabled={!subject && !active}
        onClick={onToggle} data-guide-ignore="يلوّن خانات الأسبوع الفارغة بسبب ما يمنع الموعد المحدَّد منها؛ قراءةٌ فقط، والنقل يمرّ بمساره المعتاد"
        title={subject || active ? "لماذا لا؟ — ما الذي يمنع الموعد المحدَّد من كل خانة" : "حدّد موعداً أولاً"}>
        <WhyIcon name={on ? "caution" : "free"} className="wk-tool-ico" />
        <span>لماذا لا؟</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">{on ? say : ""}</span>
      {on && typeof document !== "undefined" ? createPortal(
        <div className="wn-dock" role="group" aria-label="مفتاح أسباب المنع" data-guide-ignore="مفتاح أسباب «لماذا لا؟»: كل أيقونة مرشّحٌ يعرض خانات سببٍ واحد">
          <span className="wn-dock-who" title={title}><WhyIcon name="move" /><b>{title}</b></span>
          <div className="wn-legend">
            {legend.map(item => (
              <button key={item.id} type="button" className={`wn-chip is-${item.id}${filter === item.id ? " is-on" : ""}`} aria-pressed={filter === item.id}
                title={item.id === "free" ? "المتاحة" : WHY_META[item.id as WhyKind].label}
                aria-label={`${item.id === "free" ? "المتاحة" : WHY_META[item.id as WhyKind].label} ${item.count}`}
                onClick={() => setFilter(filter === item.id ? null : item.id)} data-guide-ignore="مرشّح سببٍ في طبقة «لماذا لا؟»">
                <WhyIcon name={item.id === "free" ? "free" : WHY_META[item.id as WhyKind].icon} /><em>{item.count}</em>
              </button>
            ))}
          </div>
          <button type="button" className="wn-x" onClick={onToggle} aria-label="إغلاق الطبقة" data-guide-ignore="يطفئ طبقة «لماذا لا؟»"><WhyIcon name="close" /></button>
        </div>, document.body) : null}
      {on && open && openCellData && typeof document !== "undefined" ? createPortal(
        <div className={`wn-pop is-${openCellData.tier}`} role="dialog" aria-modal="false" aria-label={whyNotSpeech(openCellData, dayLabel.get(openCellData.day) || "")}
          style={{ top: popTop, insetInlineStart: Math.max(8, Math.min(window.innerWidth - 268, open.rect.left + open.rect.width / 2 - 130)) }}>
          <header>
            <WhyIcon name={openCellData.tier === "free" ? "free" : openCellData.tier === "caution" ? "caution" : "locked"} />
            <b>{dayLabel.get(openCellData.day)} <bdi dir="ltr">{openCellData.start}</bdi></b>
            <i>{WHY_TIER_LABEL[openCellData.tier]}</i>
          </header>
          {openCellData.reasons.length ? (
            <ul>
              {openCellData.reasons.map(item => (
                <li key={item.kind} className={WHY_META[item.kind].hard ? "is-hard" : "is-soft"}>
                  <WhyIcon name={WHY_META[item.kind].icon} /><span>{WHY_META[item.kind].label}</span>
                  {item.detail ? <small>{item.detail}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {!readOnly && openCellData.free && subject ? (
            <button type="button" className="wn-move" data-guide-ignore="ينقل الموعد إلى هذه الخانة عبر مسار النقل المعتاد بتوقّعه وتأكيده"
              onClick={() => { setOpen(null); onMove(subject, openCellData.day, openCellData.start, dayLabel.get(openCellData.day) || ""); }}>
              <WhyIcon name="move" />انقل هنا
            </button>
          ) : null}
        </div>, document.body) : null}
    </>
  );
}

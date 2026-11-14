import IntelligenceScopeSwitch from "./IntelligenceScopeSwitch";
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import type { AdCourse, AdInstructor, AdTerm, FSchedule } from "../types";
import { livingScopeKey, sharedLiving } from "../utils/livingCache";
import { MicroLoader, Notice, useDialogDismiss } from "./ui";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { telemetryApi, telemetryBreadcrumb, telemetryError } from "../utils/clientTelemetry";
import { sortTermsNewest } from "../utils/termSequence";
import { scheduleClockForDisplay } from "../utils/scheduleTime";
import { roomIdentityKey } from "../utils/locationRegistry";
import VisitingBadge from "./VisitingBadge";
import CourseTags from "./CourseTags";
import { useVisitingLookup } from "../hooks/useVisitingLookup";

type DayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
const dayKeys: DayKey[] = [
  "fsunday",
  "fmonday",
  "ftuesday",
  "fwednesday",
  "fthursday",
];
const dayLabels: Record<DayKey, string> = {
  fsunday: "الأحد",
  fmonday: "الاثنين",
  ftuesday: "الثلاثاء",
  fwednesday: "الأربعاء",
  fthursday: "الخميس",
};
const activeDays = (row: Partial<FSchedule>) =>
  dayKeys.filter((day) => Boolean(row[day]));
const roomKey = (row: Partial<FSchedule>) => roomIdentityKey(row);
const rowIdentity = (row: Partial<FSchedule>) =>
  `${row.AdCourseId || 0}:${String(row.SCode || "").trim()}`;
const placement = (row: Partial<FSchedule>) =>
  `${activeDays(row).join(",")}:${row.fstarttime || ""}:${row.fendtime || ""}:${row.AdInstructorId || 0}:${roomKey(row)}`;

/**
 * A reading that always ends.
 *
 * The one-decision panel could spin for ever, and for two reasons that both
 * amount to the same mistake: nothing bounded the request, so a reply that
 * never came left the spinner running until the tab was closed; and the body
 * was parsed as JSON before its status was checked, so a plain-text rejection
 * ("Rate exceeded.") threw a parser error whose English text went to the screen.
 *
 * Every call now carries a ceiling and every failure carries an Arabic reason.
 * A tool that cannot answer must at least be able to say so.
 */
async function fetchJson(url: string, options?: RequestInit, timeoutMs = 35_000) {
  const started = performance.now();
  const method = String(options?.method || "GET").toUpperCase();
  telemetryBreadcrumb(`قرار الآن · ${method} ${url.split("?")[0]}`);
  const controller = new AbortController();
  const externalSignal = options?.signal;
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    telemetryError(`decision-now:${url.split("?")[0]}`, error, performance.now() - started);
    telemetryApi(`decision-now:${url.split("?")[0]}`, performance.now() - started, 0, false);
    // A timeout or a flaky connection on a *background* smart read is not worth a
    // scary banner — it is tagged `soft` so callers can degrade quietly instead
    // of spamming the same message on every schedule change.
    if (error?.name === "AbortError") {
      if (externalSignal?.aborted) throw error;
      const timeoutErr = new Error("استغرقت القراءة وقتاً أطول من المتوقع. حاول مرة أخرى.");
      (timeoutErr as any).soft = true;
      throw timeoutErr;
    }
    const netErr = new Error("تعذر الوصول إلى الخدمة. تحقق من الاتصال.");
    (netErr as any).soft = true;
    throw netErr;
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  telemetryApi(`decision-now:${url.split("?")[0]}`, performance.now() - started, response.status, response.ok);
  if (response.ok) return data;

  if (response.status === 429 || /rate\s*exceeded|too many/i.test(raw)) {
    throw new Error("طلبات كثيرة في وقت قصير. انتظر لحظة ثم أعد المحاولة.");
  }
  if (response.status === 401) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  if (response.status === 403) throw new Error("هذه القراءة خارج صلاحياتك.");
  if (response.status >= 500) throw new Error("الخدمة متوقفة مؤقتاً. حاول بعد قليل.");
  throw new Error(data?.error || "تعذر تحميل القراءة الذكية");
}
function query(collegeId: number, sectionId: number, termId: number) {
  return new URLSearchParams({
    collegeId: String(collegeId),
    sectionId: String(sectionId),
    termId: String(termId),
  }).toString();
}
function ghostSummary(current: FSchedule[], previous: FSchedule[]) {
  const currentByKey = new Map(current.map((row) => [rowIdentity(row), row]));
  let unchanged = 0,
    moved = 0,
    instructor = 0,
    room = 0,
    day = 0,
    missing = 0;
  previous.forEach((old) => {
    const now = currentByKey.get(rowIdentity(old));
    if (!now) {
      missing++;
      return;
    }
    if (placement(old) === placement(now)) {
      unchanged++;
      return;
    }
    moved++;
    if (old.AdInstructorId !== now.AdInstructorId) instructor++;
    if (roomKey(old) !== roomKey(now)) room++;
    if (activeDays(old).join(",") !== activeDays(now).join(",")) day++;
  });
  return { unchanged, moved, instructor, room, day, missing };
}
function strongestRisk(living: any) {
  const fragility = living?.fragility || living?.health?.fragility;
  const risks = [
    ...(fragility?.roomRisk || []),
    ...(fragility?.professorRisk || []),
    ...(fragility?.dayRisk || []),
  ];
  return (
    risks.sort(
      (a: any, b: any) => Number(b.impactPct || 0) - Number(a.impactPct || 0),
    )[0] || null
  );
}
function strengthSentence(living: any) {
  const health = living?.health;
  if (!health) return "";
  const metrics = [
    { label: "الجودة", value: Number(health.quality || 0) },
    { label: "المرونة", value: Number(health.resilience || 0) },
    { label: "العدالة", value: Number(health.fairness || 0) },
  ].sort((a, b) => b.value - a.value);
  return `${metrics[0].label} ${metrics[0].value}/100، ويأتي بعدها ${metrics[1].label} ${metrics[1].value}/100.`;
}

export function useScheduleExperience({
  analysisScope,
  setAnalysisScope,
  rows,
  courses,
  instructors,
  terms,
  collegeId,
  sectionId,
  termId,
  isPowerAdmin,
}: {
  analysisScope: "college" | "department";
  setAnalysisScope: (scope: "college" | "department") => void;
  rows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  terms: AdTerm[];
  collegeId: number;
  sectionId: number;
  termId: number;
  isPowerAdmin: boolean;
}) {
  const [ghostEnabled, setGhostEnabled] = useState(false),
    [ghostRows, setGhostRows] = useState<FSchedule[]>([]),
    [ghostBusy, setGhostBusy] = useState(false),
    [ghostError, setGhostError] = useState("");
  const [living, setLiving] = useState<any>(null),
    [genome, setGenome] = useState<any>(null),
    [constraints, setConstraints] = useState<any[]>([]),
    [insightBusy, setInsightBusy] = useState(false),
    [insightError, setInsightError] = useState("");
  const { isVisiting } = useVisitingLookup(termId);
  const currentTerm = terms.find((t) => t.AdTermId === termId) || null;
  const previousTerm = useMemo(() => {
    const history = Array.isArray(genome?.history) ? genome.history : [];
    const first = history[0];
    if (first)
      return (
        terms.find((t) => t.AdTermId === Number(first.termId)) || {
          AdTermId: Number(first.termId),
          AdTermName: String(first.termName || "الفصل السابق"),
        }
      );
    const ordered = sortTermsNewest(terms);
    const currentIndex = ordered.findIndex(t => Number(t.AdTermId) === Number(termId));
    return (currentIndex >= 0 ? ordered[currentIndex + 1] : ordered.find(t => Number(t.AdTermId) !== Number(termId))) || null;
  }, [genome, terms, termId]);
  const comparison = useMemo(
    () => ghostSummary(rows, ghostRows),
    [rows, ghostRows],
  );
  const risk = useMemo(() => strongestRisk(living), [living]);
  const ready = Boolean(rows.length && living?.health?.readiness === "ready");
  const courseById = useMemo(
    () => new Map(courses.map((c) => [c.AdCourseId, c])),
    [courses],
  );
  const instructorById = useMemo(
    () => new Map(instructors.map((i) => [i.AdInstructorId, i])),
    [instructors],
  );

  useEffect(() => {
    setGhostEnabled(false);
    setGhostRows([]);
    setGhostError("");
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId || !rows.length) {
      setLiving(null);
      setGenome(null);
      setConstraints([]);
      return;
    }
    const controller = new AbortController();
    setInsightBusy(true);
    const loadInsights = async () => {
        setInsightBusy(true);
        setInsightError("");
        try {
          const q = query(collegeId, sectionId, termId);
          const readQuery = `${q}&analysisScope=${analysisScope}`;
          /* The decision deck asks for this same analysis the instant a scope
             appears, and this bundle runs a beat later on idle. If it already
             answered for this exact scope, the server is not asked twice —
             the genome and the constraints are still read normally. */
          const key = livingScopeKey(collegeId, sectionId, termId, analysisScope);
          const [l, g, c] = await Promise.all([
            /* No signal here, deliberately: this read is shared with the
               decision deck, and one layer's abort must never cancel the
               other's. The scope guard after the await still applies. */
            sharedLiving(key, () => fetchJson(`/api/intelligence/living?${readQuery}`)),
            fetchJson(`/api/intelligence/genome?${readQuery}`, {
              signal: controller.signal,
            }),
            fetchJson(`/api/intelligence/constraints?${readQuery}`, {
              signal: controller.signal,
            }),
          ]);
          if (controller.signal.aborted) return;
          setLiving(l);
          setGenome(g);
          setConstraints(Array.isArray(c) ? c : []);
        } catch (e: any) {
          // The smart-reading layer is optional; the schedule is fully usable
          // without it. A timeout or slow-network read (tagged `soft`) degrades
          // silently — keeping the last insights — instead of raising the same
          // banner after every move, which is what made it feel constant.
          if (e?.name !== "AbortError" && !e?.soft)
            setInsightError(String(e?.message || e));
        } finally {
          if (!controller.signal.aborted) setInsightBusy(false);
        }
      };
    const idleApi = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    /* Same dwell discipline as the decision deck, same reason: these three
       reads ride the whole-university hydration, and firing them per hop is
       what let one browsing session pile ten seconds of queue onto the next
       board read. Six seconds staggers this bundle slightly BEHIND the deck's
       five, so the two never land on the server in the same breath. */
    const idleId = idleApi.requestIdleCallback
      ? idleApi.requestIdleCallback(() => { void loadInsights(); }, { timeout: 6000 })
      : window.setTimeout(() => { void loadInsights(); }, 6000);
    return () => {
      if (idleApi.cancelIdleCallback && idleApi.requestIdleCallback) idleApi.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      controller.abort();
    };
  }, [collegeId, sectionId, termId, rows, analysisScope]);

  const toggleGhost = async () => {
    /*
     * The scope needed here is the term, and only the term.
     *
     * The guard also demanded a college and a department, and both are honestly
     * zero whenever the reader has chosen «الكل» — so on the widest, most
     * common view the press returned here in silence: no fetch, no error, no
     * label change, nothing to tell anyone why. The read itself never needed
     * them; `/api/schedules` treats a missing college or section as a wide read,
     * exactly as the board's own loader does.
     */
    if (!termId) return;
    if (ghostEnabled) {
      setGhostEnabled(false);
      return;
    }
    if (!previousTerm) {
      setGhostError("لا يوجد فصل سابق محفوظ لهذا القسم بعد.");
      return;
    }
    setGhostBusy(true);
    setGhostError("");
    try {
      const p = new URLSearchParams({ termId: String(previousTerm.AdTermId) });
      if (collegeId) p.set("collegeId", String(collegeId));
      if (sectionId) p.set("sectionId", String(sectionId));
      const data = await fetchJson(`/api/schedules?${p}`);
      setGhostRows(Array.isArray(data) ? data : []);
      setGhostEnabled(true);
    } catch (e: any) {
      setGhostError(String(e?.message || e));
    } finally {
      setGhostBusy(false);
    }
  };
  const ghostClass = (row: FSchedule) => {
    const now = rows.find((r) => rowIdentity(r) === rowIdentity(row));
    if (!now) return "ghost-removed";
    return placement(now) === placement(row) ? "ghost-same" : "ghost-changed";
  };
  return {
    analysisScope,
    setAnalysisScope,
    ghostEnabled,
    ghostRows,
    ghostBusy,
    ghostError,
    toggleGhost,
    ghostClass,
    comparison,
    previousTerm,
    currentTerm,
    living,
    genome,
    insightBusy,
    insightError,
    ready,
    risk,
    strength: strengthSentence(living),
    courseById,
    instructorById,
    constraints,
    isVisiting,
  };
}

export type ScheduleExperience = ReturnType<typeof useScheduleExperience>;
type Experience = ScheduleExperience;
/**
 * ── ما بقي من طبقة التجربة فوق الجدول ──────────────────────────────────────
 * «القرار الأهم الآن» صار في «مركز الذكاء ← جرّب ← غرفة قرار اللجنة» (بلا اختيار
 * يختار الخادمُ العقدةَ الأعلى أثراً، ومعه «افتح الموعد الأصلي»)، و«بصمة القسم»
 * بطاقتُها في «افهم». يبقى هنا ما يخصّ الجدول: خطأُ القراءة الخلفية إن وقع.
 */
export default function ScheduleExperienceLayer({ experience }: { experience: Experience }) {
  const e = experience;
  return e.ghostError || e.insightError ? <Notice>{e.ghostError || e.insightError}</Notice> : null;
}

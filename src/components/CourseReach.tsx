/**
 * ── «وصلنا ✓ / لم نصل بعد 🔒» وسلسلةُ المتطلبات ─────────────────────────────
 *
 * قطعٌ صغيرة يقرؤها كلُّ مكان يعرض حكم الوصول: لوحةُ حالة الطرح في النشر، و«كل المقررات»،
 * والمقترح الدراسي، ونموذجُ الموعد، ومراجعةُ الاعتماد. الحكمُ نفسه من الخادم
 * (/api/course-reach ← src/server/courseReachShared.ts ← src/utils/courseReach.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { latestScopeGuard, reachChip, type CourseReach, type ReachChainNode, type ReachSheetKind } from "../utils/courseReach";
import { AR, countOf } from "../utils/arabicCount";
import CourseTags from "./CourseTags";
import "../styles/40-course-reach.css";

export type { ReachSheetKind };
export interface ReachPayload {
  known: boolean;
  courses: Record<number, CourseReach & { sheets?: ReachSheetKind[] }>;
  sheets: Array<{ planId: string; kind: ReachSheetKind; name: string; track: string; courseIds: number[] }>;
}

/** يقرأ حكمَ الوصول لقسمٍ في كليته وفصل، ويفتح مقرراً للطرح (أو يعيده للقاعدة). */
export function useCourseReach(collegeId: number, sectionId: number, termId: number) {
  const [data, setData] = useState<ReachPayload | null>(null);
  const [busy, setBusy] = useState(0);
  /* آخرُ طلبٍ يحكم: قراءةُ نطاقٍ سابق تُلغى، وإن وصلت متأخرةً لا تكتب فوق النطاق الجديد. */
  const guard = useRef(latestScopeGuard()).current;
  const inflight = useRef<AbortController | null>(null);
  const scope = `${collegeId}:${sectionId}:${termId}`;
  const load = useCallback(async () => {
    inflight.current?.abort();
    const stamp = guard.begin(scope);
    /* لا يبقى حكمُ النطاق السابق معروضاً تحت النطاق الجديد ولو للحظة. */
    setData(null);
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    inflight.current = controller;
    const response = await fetch(`/api/course-reach?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", signal: controller.signal }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    if (guard.isCurrent(stamp) && !controller.signal.aborted) setData(payload);
  }, [collegeId, sectionId, termId, scope, guard]);
  useEffect(() => { void load(); return () => inflight.current?.abort(); }, [load]);
  const setOpen = useCallback(async (courseId: number, open = true) => {
    setBusy(courseId);
    try {
      const response = await fetch("/api/course-reach/open", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, courseId, open }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "تعذّر الحفظ");
      /* حُفظ على نطاقه؛ ولا يُعرض إلا إن بقي النطاقُ نفسه. */
      if (guard.sameScope(scope)) setData(payload);
      return true;
    } catch { return false; } finally { setBusy(0); }
  }, [collegeId, sectionId, termId, scope, guard]);
  return { data, reload: load, setOpen, busy };
}

export function ReachChip({ reach, compact = false }: { reach: Pick<CourseReach, "state" | "overridden" | "reason"> | null | undefined; compact?: boolean }) {
  const chip = reachChip(reach);
  if (!chip) return null;
  return <span className={`reach-chip is-${chip.tone}`} data-compact={compact || undefined} title={reach?.reason || chip.label}>
    <span aria-hidden="true">{chip.icon}</span>{compact ? null : chip.label}
    {compact ? <span className="sr-only">{chip.label}</span> : null}
  </span>;
}

/* داخل الحلقة: ✓ طُرح · 🔒 المقرر نفسه؛ والناقصةُ بإطارها المتقطّع الأصفر وحده. */
const NODE_ICON: Record<ReachChainNode["state"], string> = { ok: "✓", missing: "", target: "🔒" };
const NODE_WORD: Record<ReachChainNode["state"], string> = { ok: "طُرح", missing: "لم يُطرح", target: "المقرر" };

/** السلسلة مضغوطة: آخرُ ما طُرح ✓ ← الحلقةُ الناقصة ← المقرر 🔒 (والتوأم بـ⇄). */
export function ReachChain({ reach }: { reach: Pick<CourseReach, "chain" | "state" | "level" | "reachedLevel" | "why"> | null | undefined }) {
  if (!reach || reach.state !== "locked") return null;
  if (reach.chain.length > 1) {
    return <ol className="reach-chain" aria-label="سلسلة المتطلبات">
      {reach.chain.map((node, index) => <li key={`${node.courseId}-${index}`} className={`is-${node.state}`}>
        {index ? <span className="reach-link" aria-hidden="true">{reach.chain[index - 1].link === "coreq" ? "⇄" : "←"}</span> : null}
        <b title={NODE_WORD[node.state]}>{NODE_ICON[node.state] ? <span aria-hidden="true">{NODE_ICON[node.state]}</span> : null}<bdi>{node.code}</bdi><span className="sr-only">{NODE_WORD[node.state]}</span></b>
      </li>)}
    </ol>;
  }
  /* بلا مسبقات: شريطُ المستوى — ما وصلناه ✓ والمستوى المطلوب 🔒. */
  return <ol className="reach-chain is-level" aria-label="المستوى">
    {[100, 200, 300, 400].map(level => <li key={level} className={level <= reach.reachedLevel ? "is-ok" : level === reach.level ? "is-target" : "is-off"}>
      <b>{level === reach.level ? <span aria-hidden="true">🔒</span> : level <= reach.reachedLevel ? <span aria-hidden="true">✓</span> : null}{level}</b>
    </li>)}
  </ol>;
}

/**
 * مراجعةُ الاعتماد: ملاحظةٌ (لا تمنع) على شعب المقررات التي «لم نصل بعد» إليها ولم يفتحها القسم.
 * يقرأ حكمَ كلِّ فرعٍ في الصفوف المعروضة (بنين/بنات من العائلة نفسها) من المصدر الواحد.
 */
export function ReachReviewNotes({ rows, termId, courseLabel }: {
  rows: ReadonlyArray<{ AdCollegeId?: number; AdSectionId?: number; AdCourseId?: number; SCode?: unknown }>;
  termId: number;
  courseLabel: (courseId: number) => { code: string; name: string };
}) {
  const scopes = [...new Set(rows.map(row => `${Number(row.AdCollegeId || 0)}:${Number(row.AdSectionId || 0)}`))].filter(key => !key.includes(":0") && !key.startsWith("0:"));
  const [byScope, setByScope] = useState<Record<string, ReachPayload | null>>({});
  const scopeKey = scopes.sort().join("|");
  useEffect(() => {
    if (!termId || !scopes.length) return;
    let alive = true;
    void Promise.all(scopes.map(async key => {
      const [collegeId, sectionId] = key.split(":");
      const response = await fetch(`/api/course-reach?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" }).catch(() => null);
      return [key, response?.ok ? await response.json().catch(() => null) : null] as const;
    })).then(entries => { if (alive) setByScope(Object.fromEntries(entries)); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, termId]);
  const locked = new Map<string, { courseId: number; reach: CourseReach; sections: string[] }>();
  for (const row of rows) {
    const key = `${Number(row.AdCollegeId || 0)}:${Number(row.AdSectionId || 0)}`;
    const reach = byScope[key]?.courses?.[Number(row.AdCourseId || 0)];
    if (!reach || reach.state !== "locked") continue;
    const id = `${key}:${Number(row.AdCourseId)}`;
    const entry = locked.get(id) || { courseId: Number(row.AdCourseId), reach, sections: [] };
    const code = String(row.SCode ?? "").trim();
    if (code && !entry.sections.includes(code)) entry.sections.push(code);
    locked.set(id, entry);
  }
  if (!locked.size) return null;
  /* قليلُها مفتوح؛ وكثيرُها سطرٌ واحد يُفتح عند الطلب (لا يُغرق المراجعة). */
  return <details className="reach-advisory reach-review" aria-label="لم نصل بعد" data-review-reach="" open={locked.size <= 3}>
    <summary className="reach-advisory-head" data-guide-ignore="طيّ ملاحظة «لم نصل بعد» داخل المراجعة — عرض فقط"><span aria-hidden="true">🔒</span><b>لم نصل بعد · {countOf(locked.size, AR.course)}</b><small>ملاحظة · لا تمنع الاعتماد</small></summary>
    <ul>
      {[...locked.values()].map(entry => {
        const label = courseLabel(entry.courseId);
        return <li key={entry.courseId}>
          <header><b><bdi>{label.code}</bdi> {label.name}<CourseTags courseId={entry.courseId} /></b><ReachChain reach={entry.reach} /></header>
          <small>{entry.sections.length ? `شعبة ${entry.sections.join("، ")} · ` : ""}{entry.reach.reason}</small>
        </li>;
      })}
    </ul>
  </details>;
}

/** زرّ «افتحه للطرح» (أو «أعده للقاعدة» لمقررٍ فُتح يدوياً). */
export function ReachOpenButton({ reach, busy, onToggle }: { reach: Pick<CourseReach, "state" | "overridden"> | null | undefined; busy?: boolean; onToggle: (open: boolean) => void; "data-guide-ignore"?: string }) {
  if (!reach || (reach.state !== "locked" && !reach.overridden)) return null;
  const opening = !reach.overridden;
  return <button type="button" className={`reach-open ${opening ? "is-open" : "is-undo"}`} disabled={busy} data-guide-ignore="يفتح المقرر للطرح رغم «لم نصل بعد» أو يعيده للقاعدة — قرارٌ في حالة الطرح لا يكتب في الجدول"
    onClick={() => onToggle(opening)}>
    {opening ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}{busy ? "…" : opening ? "افتحه للطرح" : "أعده للقاعدة"}
  </button>;
}

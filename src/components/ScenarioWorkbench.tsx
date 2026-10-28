/**
 * ── منضدة السيناريو ──
 * ما يراه المستخدم لأي سلّة تغييرات: مؤشّر الأثر، قبل/بعد، المنزلقة الزمنية،
 * الدومينو، أثر مساري، ثم الحفظ والمشاركة والاعتماد الذرّي والاستعادة والنشر
 * للمتأثرين وحدهم. الاعتمادُ يظهر لمن يكتب الجدول فقط، والخادمُ يحرسه أيضاً.
 */
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CircleAlert, Copy, Eye, GitBranch, MessageCircle, Save, Send, Trash2, Undo2 } from "lucide-react";
import type { AdInstructor, FSchedule } from "../types";
import {
  applyChanges, boardOf, compareBoards, dominoOf, driftOf, staleChanges, teacherCards,
  type TmChange, type TmScenarioRecord,
} from "../utils/timeMachine";
import { reachAboutCard } from "../utils/reachInstructor";
import { DeltaStrip, Ico, LevelDot, TimeSlider, postJson, scopeQuery, type IcoName, type LoadedContext } from "./timeMachineShared";

const OP_ICON: Record<TmChange["op"], IcoName> = { move: "move", assign: "assign", remove: "remove", add: "add" };

export function DominoGraph({ changes, problem }: { changes: TmChange[]; problem?: string }) {
  const nodes = dominoOf(changes);
  if (!nodes.length) return null;
  return (
    <ol className="tm-domino" aria-label="تأثير الدومينو">
      {problem ? <li className="tm-domino-root"><Ico n="problem" /><b>{problem}</b></li> : null}
      {nodes.map(node => (
        <li key={node.id} style={{ marginInlineStart: `${Math.min(4, node.depth) * 18}px` }} className={`tm-domino-${node.kind}`}>
          <Ico n={OP_ICON[node.kind]} />
          <b>{node.label}</b>
          {node.why ? <small>{node.why}</small> : null}
        </li>
      ))}
    </ol>
  );
}

interface StudentImpact { helped: number; harmed: number; delta12: number; responders: number; verdict: string; harmedOutside: number }

export default function ScenarioWorkbench({ context, changes, mode, problem, scenario, onScenario, onDiscard, onApplied, defaultName }: {
  context: LoadedContext;
  changes: TmChange[];
  mode: TmScenarioRecord["mode"];
  problem?: string;
  scenario?: TmScenarioRecord | null;
  onScenario?: (record: TmScenarioRecord) => void;
  onDiscard?: () => void;
  onApplied?: () => void;
  defaultName?: string;
}) {
  const live = useMemo(() => boardOf(context), [context]);
  /* بعد الاعتماد: «قبل» من نقطة الاستعادة و«بعد» هو الجدول الحيّ — فيبقى الأثر مرئياً. */
  const point = scenario?.status === "applied" ? scenario.restorePoint : undefined;
  const base = useMemo(() => (point ? beforeFromRestorePoint(live, point) : live), [live, point]);
  const after = useMemo(() => (point ? live : applyChanges(live, changes)), [live, point, changes]);
  const delta = useMemo(() => compareBoards(base, after, context), [base, after, context]);
  const stale = useMemo(() => staleChanges(context.rows, changes), [context, changes]);
  const drift = useMemo(() => (scenario && scenario.status === "draft" ? driftOf(context.rows, scenario.base) : []), [scenario, context]);
  const focus = useMemo(() => new Set(changes.flatMap(change => change.op === "move" ? [change.rowId] : change.op === "add" ? change.rows.map(row => Number(row.id)) : change.rowIds)), [changes]);
  const [name, setName] = useState(scenario?.name || defaultName || "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [students, setStudents] = useState<StudentImpact | null | "none">(null);
  const [published, setPublished] = useState<TmScenarioRecord | null>(scenario?.status === "applied" ? scenario : null);
  useEffect(() => { setName(scenario?.name || defaultName || ""); }, [scenario?.id, defaultName]);
  useEffect(() => { setStudents(null); }, [changes]);

  const save = async (): Promise<TmScenarioRecord | null> => {
    setBusy("save"); setMessage(null);
    try {
      const body = await postJson("/api/time-machine/scenarios", {
        ...context.scope, id: scenario?.status === "draft" ? scenario.id : undefined, revision: scenario?.revision,
        name: name.trim() || defaultName || "سيناريو", mode, problem, changes,
      });
      onScenario?.(body.scenario);
      setMessage({ tone: "ok", text: "حُفظ" });
      return body.scenario;
    } catch (e: any) { setMessage({ tone: "error", text: e.message }); return null; }
    finally { setBusy(""); }
  };

  const apply = async () => {
    const saved = scenario?.status === "draft" && scenario.changes === changes ? scenario : await save();
    if (!saved) return;
    setBusy("apply"); setMessage(null);
    try {
      const body = await postJson(`/api/time-machine/scenarios/${saved.id}/apply`, { revision: saved.revision });
      onScenario?.(body.scenario);
      setPublished(body.scenario);
      setMessage({ tone: "ok", text: "اعتُمد كلُّه دفعةً واحدة" });
      onApplied?.();
    } catch (e: any) {
      const drifted = e.body?.code === "drift";
      setMessage({ tone: "error", text: drifted ? "تغيّر الجدول الحيّ — أعد الفحص" : e.message });
    } finally { setBusy(""); }
  };

  const restore = async () => {
    if (!scenario) return;
    setBusy("restore"); setMessage(null);
    try {
      const body = await postJson(`/api/time-machine/scenarios/${scenario.id}/restore`, {});
      onScenario?.(body.scenario); setPublished(null);
      setMessage({ tone: "ok", text: "عاد الجدول كما كان" });
      onApplied?.();
    } catch (e: any) { setMessage({ tone: "error", text: e.message }); }
    finally { setBusy(""); }
  };

  const share = async () => {
    if (!scenario) return;
    try { const body = await postJson(`/api/time-machine/scenarios/${scenario.id}/share`, { shared: !scenario.shared }); onScenario?.(body.scenario); }
    catch (e: any) { setMessage({ tone: "error", text: e.message }); }
  };
  const copy = async () => {
    if (!scenario) return;
    try { const body = await postJson(`/api/time-machine/scenarios/${scenario.id}/copy`, {}); onScenario?.(body.scenario); }
    catch (e: any) { setMessage({ tone: "error", text: e.message }); }
  };

  const measureStudents = async () => {
    setStudents(null);
    try {
      const body = await postJson("/api/time-machine/students", { ...context.scope, changes });
      setStudents(body.available ? body.impact : "none");
    } catch { setStudents("none"); }
  };

  const applied = scenario?.status === "applied";
  const canWrite = context.canWrite;

  return (
    <section className="tm-bench" aria-label="أثر السيناريو">
      <header className="tm-bench-head">
        <LevelDot level={delta.level} />
        <div className="tm-bench-title">
          <strong className="tm-th">{point ? <><Ico n="applied" className="tm-ok" />مُعتمد · </> : null}{changes.length ? `${changes.length} تغيير` : "لا تغييرات بعد"}</strong>
          <small>{delta.reasons.slice(0, 3).join(" · ") || "بلا أثر يُذكر"}</small>
        </div>
        <ul className="tm-bench-chips">
          <li title="أساتذة متأثرون"><Ico n="teachers" /><b>{delta.teachersAffected.length}</b></li>
          <li title="طلبة متأثرون (من الرادار)"><Ico n="students" /><b>{delta.studentsMoved ?? "—"}</b></li>
          <li title="قاعات تغيّرت"><Ico n="rooms" /><b>{delta.roomsAffected}</b></li>
        </ul>
      </header>

      {drift.length || stale.length ? (
        <p className="tm-alert" role="alert"><CircleAlert aria-hidden="true" />تغيّر الجدول الحيّ بعد هذا السيناريو ({drift.length || stale.length}) — راجعه قبل الاعتماد</p>
      ) : null}

      <DeltaStrip delta={delta} />
      <div className="tm-bench-grid">
        <TimeSlider before={base} after={after} context={context} focus={focus} />
        <div className="tm-bench-side">
          <DominoGraph changes={changes} problem={problem} />
          <div className="tm-masari">
            <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-ghost" onClick={() => void measureStudents()} disabled={!changes.length}><Ico n="masari" />أثره على مساري</button>
            {students === "none" ? <small>لا رادار لهذا الفصل</small> : students ? (
              <ul>
                <li className="tm-delta-better">⬆️ <b>{students.helped}</b><small>تحسّن</small></li>
                <li className="tm-delta-worse">⬇️ <b>{students.harmed + (students.harmedOutside ? 1 : 0)}</b><small>تضرّر</small></li>
                <li><Ico n="reach" /><b><bdi>{students.delta12 > 0 ? `+${students.delta12}` : students.delta12}</bdi></b><small>يبلغ ١٢</small></li>
              </ul>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="tm-bench-actions">
        {canWrite && !applied ? (
          <>
            <input data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" className="tm-name" value={name} onChange={event => setName(event.target.value)} placeholder="اسم السيناريو" aria-label="اسم السيناريو" maxLength={80} />
            <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-secondary" onClick={() => void save()} disabled={!changes.length || Boolean(busy)}><Save aria-hidden="true" />حفظ</button>
            {scenario ? <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-ghost" onClick={() => void share()} title="للعرض لرئيس القسم والعميد"><Eye aria-hidden="true" />{scenario.shared ? "مشارَك" : "شارك للعرض"}</button> : null}
            <button data-guide-feature-id="timeMachine.action.apply" data-guide-target="timeMachine.action.apply" type="button" className="btn btn-primary" onClick={() => void apply()} disabled={!changes.length || Boolean(busy) || delta.level === "red" && delta.after.blocking > delta.before.blocking}>
              <Check aria-hidden="true" />{busy === "apply" ? "يعتمد…" : "اعتمد الكل"}
            </button>
          </>
        ) : null}
        {canWrite && applied ? (
          <button data-guide-feature-id="timeMachine.action.restore" data-guide-target="timeMachine.action.restore" type="button" className="btn btn-secondary" onClick={() => void restore()} disabled={Boolean(busy)}><Undo2 aria-hidden="true" />استعادة بنقرة</button>
        ) : null}
        {canWrite && scenario ? <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-ghost" onClick={() => void copy()}><Copy aria-hidden="true" />نسخة</button> : null}
        {!canWrite ? <span className="tm-readonly"><Eye aria-hidden="true" />عرض ومحاكاة — الاعتماد لمن يكتب الجدول</span> : null}
        {onDiscard && !applied ? <button data-guide-ignore="أداة محاكاة داخل آلة الزمن؛ تعمل على نسخة افتراضية ولا تكتب في الجدول" type="button" className="btn btn-ghost" onClick={onDiscard}><Trash2 aria-hidden="true" />تجاهل</button> : null}
        {message ? <span className={`tm-msg tm-msg-${message.tone}`} role="status">{message.text}</span> : null}
      </footer>

      {applied && published ? <PublishPanel context={context} scenario={published} /> : null}
      {scenario?.history?.length ? (
        <details className="tm-history"><summary><GitBranch aria-hidden="true" />السجلّ ({scenario.history.length})</summary>
          <ol>{scenario.history.slice().reverse().map((entry, i) => <li key={i}><b className="tm-th">{HISTORY_LABEL[entry.action] ? <><Ico n={HISTORY_LABEL[entry.action][0]} />{HISTORY_LABEL[entry.action][1]}</> : entry.action}</b> · {entry.by} <small>{entry.role} · {new Date(entry.at).toLocaleString("ar-KW")}</small></li>)}</ol>
        </details>
      ) : null}
    </section>
  );
}

const HISTORY_LABEL: Record<string, [IcoName, string]> = { created: ["created", "أُنشئ"], saved: ["save", "حُفظ"], copied: ["copied", "نُسخ"], shared: ["shared", "مشاركة"], applied: ["applied", "اعتُمد"], restored: ["restored", "استُعيد"], refused: ["refused", "رُفض"] };

/**
 * ── النشر للمتأثرين وحدهم ──
 * بطاقةٌ شخصية قبل→بعد لكل أستاذٍ تغيّر جدولُه، ورسالةٌ جاهزة برابط بطاقته
 * الشخصية (روابط «النشر» القائمة). المنسّق يضغط الإرسال بنفسه، والبطاقةُ
 * والتقويمُ المشترَك يتحدّثان من أنفسهما.
 */
function beforeFromRestorePoint(now: FSchedule[], point: NonNullable<TmScenarioRecord["restorePoint"]>): FSchedule[] {
  return now.map(row => point.before.find(old => Number(old.id) === Number(row.id)) || row)
    .filter(row => !point.createdIds.includes(Number(row.id)))
    .concat(point.before.filter(old => !now.some(row => Number(row.id) === Number(old.id))));
}

function PublishPanel({ context, scenario }: { context: LoadedContext; scenario: TmScenarioRecord }) {
  const point = scenario.restorePoint;
  const cards = useMemo(() => {
    if (!point) return [];
    const now = boardOf(context);
    return teacherCards(beforeFromRestorePoint(now, point), now, context);
  }, [context, point]);
  const [links, setLinks] = useState<Map<number, string>>(new Map());
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!cards.length) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await (await fetch(`/api/share?${scopeQuery(context)}`, { credentials: "include" })).json();
        const staff = (Array.isArray(list) ? list : []).find((link: any) => link.kind === "staff" && !link.revoked && !Number(link.AdInstructorId || 0));
        if (!staff) { if (!cancelled) setNote("انشر «بطاقات الأساتذة» أولاً من أداة النشر"); return; }
        const body = await postJson(`/api/share/${encodeURIComponent(staff.id)}/personal`, { instructorIds: cards.map(card => card.instructorId) });
        if (!cancelled) setLinks(new Map((body?.links || []).map((row: any) => [Number(row.instructorId), String(row.id)])));
      } catch { if (!cancelled) setNote("تعذّر تجهيز الروابط الشخصية"); }
    })();
    return () => { cancelled = true; };
  }, [cards, context]);
  if (!cards.length) return null;
  return (
    <section className="tm-publish" aria-label="إبلاغ المتأثرين">
      <h4><Send aria-hidden="true" />أبلغ {cards.length} أستاذ فقط <small><CalendarDays aria-hidden="true" />التقويم المشترَك يتحدّث تلقائياً</small></h4>
      {note ? <p className="tm-note">{note}</p> : null}
      <div className="tm-publish-cards">
        {cards.map(card => {
          const id = links.get(card.instructorId);
          const url = id ? `${window.location.origin}/s/${id}` : "";
          const reach = url ? reachAboutCard({ AdInstructorName: card.name, AdInstructorMobile: card.mobile } as AdInstructor, url, "changed", card.after[0] ? `الجديد: ${card.after[0]}` : "") : null;
          return (
            <article key={card.instructorId} className="tm-teacher-card">
              <strong className="tm-th"><Ico n="teachers" />{card.name}</strong>
              <ul>
                {card.before.map(line => <li key={`b${line}`} className="is-before"><s>{line}</s></li>)}
                {card.after.map(line => <li key={`a${line}`} className="is-after">{line}</li>)}
              </ul>
              {reach?.href ? <a className="btn btn-secondary" href={reach.href} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />واتساب</a>
                : <small className="tm-note">{reach?.blocked || (url ? "" : "…")}</small>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

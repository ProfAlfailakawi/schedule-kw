/**
 * ── «لو حذفت؟» — خريطةُ ما يرتبط بالسجل داخل نافذة تأكيد الحذف ─────────────────────
 *
 * كلُّ حذفٍ في الواجهة يمرّ بـ`confirmDeleteWithImpact`: تُفتح نافذةُ التأكيد المعتادة وفي جسدها
 * ملخّصٌ مجمَّع بالأعداد (من الخادم: GET /api/delete-impact/:entity/:id). فإن كان للحذف مانعٌ
 * عُطّل الزرّ وعُرض «لا يمكن الحذف الآن» مع الشاشة التي يُعالَج منها. وإن تعذّرت قراءةُ الخريطة
 * قيل ذلك وبقي التأكيد متاحاً — فالخادمُ يرفض الحذف بنفسه إن كان ممنوعاً (الحارسُ واحد).
 */
import React from "react";
import { AlertTriangle, Link2, ShieldAlert } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { createConfirmGate, visualConfirm, type ConfirmGate } from "./ui";
import {
  DELETE_FIX_PATHS, impactSummaryLine,
  type DeleteBlocker, type DeleteEntity, type DeleteImpact as DeleteImpactData,
} from "../utils/deleteImpact";

type Load =
  | { state: "loading" }
  | { state: "ready"; impact: DeleteImpactData }
  /** رفضٌ من الخادم (نطاقٌ أو لجنة): الحذف نفسُه سيُرفض، فيُعامَل كعقبة. */
  | { state: "refused"; message: string }
  | { state: "failed" };

export async function fetchDeleteImpact(entity: DeleteEntity, id: string | number): Promise<Load> {
  try {
    const response = await fetch(`/api/delete-impact/${entity}/${encodeURIComponent(String(id))}`, { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { state: "ready", impact: data as DeleteImpactData };
    if (response.status === 403 || response.status === 409) return { state: "refused", message: String(data?.error || "هذا الحذف غير متاح لك الآن.") };
    return { state: "failed" };
  } catch {
    return { state: "failed" };
  }
}

/** ينقل إلى الشاشة التي تعالج العقبة (يغلق النافذة أولاً). التطبيق يقرأ المسار من popstate. */
function openFix(gate: ConfirmGate, view: keyof typeof DELETE_FIX_PATHS) {
  gate.set({ close: true });
  window.history.pushState({}, "", DELETE_FIX_PATHS[view]);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Blockers({ blockers, gate }: { blockers: Array<Pick<DeleteBlocker, "code" | "message" | "fix">>; gate: ConfirmGate }) {
  return (
    <div className="delete-impact-blocked" role="alert">
      <strong><ShieldAlert aria-hidden="true" /> لا يمكن الحذف الآن</strong>
      <ul>
        {blockers.map(blocker => (
          <li key={blocker.code}>
            <span>{blocker.message}</span>
            {blocker.fix ? <button type="button" className="btn btn-ghost btn-sm" data-guide-ignore="ينتقل إلى الشاشة التي تعالج مانع الحذف؛ لا يغيّر بيانات" onClick={() => openFix(gate, blocker.fix!.view)}>{blocker.fix.label}</button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** جسدُ النافذة: يحمّل الخريطة ثم يضبط الزرّ بما وجد. */
export function DeleteImpactBody({ entity, id, gate, inUseLabel, onLoaded }: { entity: DeleteEntity; id: string | number; gate: ConfirmGate; inUseLabel?: string; onLoaded?: (load: Load) => void }) {
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  React.useEffect(() => {
    let live = true;
    gate.set({ disabled: true });
    void fetchDeleteImpact(entity, id).then(result => {
      if (!live) return;
      setLoad(result);
      onLoaded?.(result);
      const blocked = result.state === "refused" || (result.state === "ready" && result.impact.blockers.length > 0);
      gate.set({ disabled: blocked, ...(result.state === "ready" && result.impact.requiresConfirm && inUseLabel ? { confirmLabel: inUseLabel } : {}) });
    });
    return () => { live = false; };
  }, [entity, id]);

  return (
    <div className="delete-impact" aria-live="polite" aria-busy={load.state === "loading"}>
      {load.state === "loading" ? <p className="delete-impact-note">جارٍ جمع ما يرتبط بهذا السجل…</p> : null}
      {load.state === "failed" ? <p className="delete-impact-warn" role="status"><AlertTriangle aria-hidden="true" /> تعذّر تحميل خريطة المرتبطات. يمكنك المتابعة، وسيرفض الخادم الحذف إن كان له مانع.</p> : null}
      {load.state === "refused" ? <Blockers gate={gate} blockers={[{ code: "refused", message: load.message }]} /> : null}
      {load.state === "ready" ? (
        <>
          {load.impact.blockers.length ? <Blockers gate={gate} blockers={load.impact.blockers} /> : null}
          {load.impact.groups.length ? (
            <div className="delete-impact-groups">
              <p className="delete-impact-title"><Link2 aria-hidden="true" /> مرتبطٌ بـ«{load.impact.name}»</p>
              {load.impact.groups.map(group => (
                <section key={group.id} className="delete-impact-group">
                  <h4>{group.title}</h4>
                  <ul>{group.items.map(item => <li key={item.id}><b>{countOf(item.count, AR[item.noun] as never)}</b>{item.when ? <span> {item.when}</span> : null}</li>)}</ul>
                </section>
              ))}
              <span className="sr-only">{impactSummaryLine(load.impact.groups)}</span>
            </div>
          ) : <p className="delete-impact-note">لا شيء آخر مرتبط بهذا السجل.</p>}
          {load.impact.warnings.map(warning => <p key={warning.code} className="delete-impact-warn" role="status"><AlertTriangle aria-hidden="true" /> {warning.message}</p>)}
        </>
      ) : null}
    </div>
  );
}

export interface DeleteConfirmResult { confirmed: boolean; impact: DeleteImpactData | null }

/**
 * نافذةُ تأكيد حذفٍ بخريطتها. تُرجع هل أكّد الشخصُ، والخريطةَ إن قُرئت
 * (لقاعةٍ أو مبنى: `impact.requiresConfirm` يحدّد ترويسةَ التأكيد الصريح).
 */
export async function confirmDeleteWithImpact(options: {
  entity: DeleteEntity;
  id: string | number;
  title: string;
  message: string;
  confirmLabel?: string;
  /** نصُّ الزرّ حين تقف مواعيد قائمة (إيقاف القاعة/المبنى بتأكيدٍ صريح). */
  inUseLabel?: string;
}): Promise<DeleteConfirmResult> {
  const gate = createConfirmGate({ disabled: true });
  let impact: DeleteImpactData | null = null;
  const confirmed = await visualConfirm({
    title: options.title,
    message: options.message,
    confirmLabel: options.confirmLabel || "حذف",
    tone: "danger",
    gate,
    body: (
      <>
        <p>{options.message}</p>
        <DeleteImpactBody entity={options.entity} id={options.id} gate={gate} inUseLabel={options.inUseLabel} onLoaded={load => { impact = load.state === "ready" ? load.impact : null; }} />
      </>
    ),
  });
  return { confirmed, impact };
}

/**
 * ── مطابقة ترقيم التسجيل: سطرٌ هادئ في نتيجة الفحص ───────────────────────────
 *
 * بعد فحص ملف التسجيل يطابق الخادمُ تلقائياً رقمَ كل شعبةٍ عُرفت بيقين ومرجعيَّها
 * بما طبعه التسجيل (registrar-numbering)، ثم يُعاد الفحص بالأرقام الجديدة. يُعرض هنا
 * سطرٌ واحد «طابقنا أرقام N شعبة مع التسجيل» ومعه «تراجع». وما لم يُطابَق (ملتبسٌ أو
 * رقمٌ تحمله شعبةٌ أخرى عندنا) يُعرض في «تحتاج نظرك» (NumberingReviewCards).
 */
import React, { useState } from "react";
import { AlertTriangle, Hash, Info, RotateCcw } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import type { NumberingCollision, NumberingSkip } from "../utils/registrarNumbering";
import { applyWithOverwriteConfirm } from "../utils/scopeOverwrite";
import { SecondaryButton, visualConfirm } from "./ui";
import CourseTags from "./CourseTags";

export interface NumberingOutcome {
  changed: number;
  undoVersionId?: string;
  locked?: string;
  skipped: NumberingSkip[];
  collisions: NumberingCollision[];
  /** تراجع القسمُ عنها في هذه الجلسة. */
  undone?: boolean;
}

export function RegistrarNumberingLine({ outcome, onUndone }: { outcome: NumberingOutcome; onUndone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const undo = async () => {
    if (!outcome.undoVersionId || busy) return;
    setBusy(true); setError("");
    try {
      const done = await applyWithOverwriteConfirm("restore", async confirm => {
        const response = await fetch("/api/intelligence/versions/" + encodeURIComponent(outcome.undoVersionId!) + "/restore", { method: "POST", headers: { "x-schedule-confirm": confirm } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(data.error || "تعذّر التراجع"), { data });
        return data;
      }, options => visualConfirm(options));
      if (done !== null) onUndone();
    } catch (reason: any) { setError(String(reason?.message || "تعذّر التراجع")); }
    finally { setBusy(false); }
  };
  if (outcome.undone) return <p className="rnum-line-calm" role="status"><Info aria-hidden="true" />تراجعتم عن مطابقة الترقيم؛ أرقام شعبكم كما كانت.</p>;
  if (outcome.locked && !outcome.changed) return <p className="rnum-line-calm" role="status"><Info aria-hidden="true" />الجدول مقفل الآن، فلم تُطابَق أرقام الشعب: {outcome.locked}</p>;
  if (!outcome.changed) return null;
  return (
    <div className="rnum-line-calm" role="status">
      <Hash aria-hidden="true" />
      <span>طابقنا أرقام {countOf(outcome.changed, AR.section)} مع التسجيل.</span>
      {outcome.undoVersionId ? (
        <SecondaryButton type="button" className="rnum-undo" disabled={busy} data-guide-ignore="يتراجع عن مطابقة أرقام الشعب مع التسجيل بنسخة «قبل مطابقة ترقيم التسجيل» — بتأكيد" onClick={() => void undo()}>
          <RotateCcw aria-hidden="true" /> تراجع
        </SecondaryButton>
      ) : null}
      {error ? <small className="rnum-error"><AlertTriangle aria-hidden="true" />{error}</small> : null}
    </div>
  );
}

/** ما لم يُطابَق رقمه: بطاقاتٌ في «تحتاج نظرك». */
export function NumberingReviewCards({ outcome }: { outcome: NumberingOutcome }) {
  const collisions = [...new Map(outcome.collisions.map(item => [`${item.courseCode}/${item.section}`, item])).values()];
  if (outcome.undone || (!outcome.skipped.length && !collisions.length)) return null;
  return (
    <>
      {collisions.map(item => (
        <li key={`c:${item.courseCode}/${item.section}`} className="rpc-card rpc-card-review" data-kind="numbering">
          <header><div className="rpc-card-id"><strong><bdi dir="ltr">{item.courseCode}</bdi> {item.courseName} <CourseTags courseId={item.courseId} /></strong><small><b>رقمٌ لم يُطابَق</b></small></div></header>
          <p className="rpc-reason"><Info aria-hidden="true" />رقمها عند التسجيل <bdi dir="ltr">{item.section}</bdi> تحمله شعبةٌ أخرى عندكم؛ عدّل إحداهما ثم أعد الفحص.</p>
        </li>
      ))}
      {outcome.skipped.map(item => (
        <li key={`s:${item.ref}`} className="rpc-card rpc-card-review" data-kind="numbering">
          <header><div className="rpc-card-id"><strong><bdi dir="ltr">{item.courseCode}</bdi> {item.courseName} <CourseTags courseId={item.courseId} /></strong><small><b>رقمٌ لم يُطابَق</b><span>ش<bdi dir="ltr">{item.section}</bdi></span></small></div></header>
          <p className="rpc-reason"><Info aria-hidden="true" />{item.reason}</p>
        </li>
      ))}
    </>
  );
}

export const numberingReviewCount = (outcome: NumberingOutcome | null) =>
  !outcome || outcome.undone ? 0 : outcome.skipped.length + new Set(outcome.collisions.map(item => `${item.courseCode}/${item.section}`)).size;

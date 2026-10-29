/**
 * ── 🧪 تجربة بلا حفظ ──
 * فصلٌ فيه جدولٌ كامل: يُقرأ الملف كاملاً بفحوصه، ثم يُرسم الفرقُ عن الجدول الحالي
 * (يُضاف · يُحذف · يتغيّر · كما هو · تعارضات) — ولا يُكتب شيء. «طبّق» خطوتان
 * (طلبٌ ثم تأكيد)، وكتابةٌ واحدة تحفظ قبلها نسخةً للتراجع؛ و«تراجع» يعيدها بنقرة.
 */
import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Equal, FlaskConical, Minus, PenLine, Plus, Undo2, X } from "lucide-react";
import { DIFF_FIELD_LABEL, type ImportDiff } from "../utils/importDiff";
import { AR, countOf } from "../utils/arabicCount";
import { PrimaryButton, SecondaryButton } from "./ui";
import "../styles/39-sections-courses.css";

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export function DryRunOffer({ count, onTry, busy }: { count: number | null; onTry?: () => void; busy?: boolean }) {
  return (
    <div className="dry-offer" role="note">
      <FlaskConical aria-hidden="true" />
      <p><b>هذا الفصل فيه جدول{count ? ` (${countOf(count, AR.appointment)})` : ""}.</b> الاستيراد هنا «تجربة بلا حفظ»: يُقرأ الملف ويُقارن بالجدول الحالي، ولا يُكتب شيء حتى «طبّق».</p>
      {onTry ? <PrimaryButton type="button" onClick={onTry} disabled={busy} data-guide-ignore="قراءة الملف تجربةً بلا حفظ؛ لا تكتب في الجدول"><FlaskConical aria-hidden="true" />جرّب بلا حفظ</PrimaryButton> : null}
    </div>
  );
}

export default function ImportDryRun({ diff, conflicts, ready, checking, busy, applied, onApply, onUndo, onCancel }: {
  diff: ImportDiff;
  conflicts: number;
  /** المعاينة نظيفة (لا ملاحظات تمنع)، وفحص التعارض انتهى. */
  ready: boolean;
  checking: boolean;
  busy: boolean;
  applied: { count: number; undoable: boolean; undone?: boolean } | null;
  onApply: () => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const total = Math.max(1, diff.same + diff.changed.length + diff.added.length + diff.removed.length);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const tiles = [
    { key: "add", icon: <Plus />, value: diff.added.length, label: "يُضاف" },
    { key: "remove", icon: <Minus />, value: diff.removed.length, label: "يُحذف" },
    { key: "change", icon: <PenLine />, value: diff.changed.length, label: "يتغيّر" },
    { key: "same", icon: <Equal />, value: diff.same, label: "كما هو" },
    { key: "conflict", icon: <AlertTriangle />, value: conflicts, label: "تعارض" },
  ];
  return (
    <section className="dry" aria-label="تجربة بلا حفظ">
      <header className="dry-head">
        <span><FlaskConical aria-hidden="true" /></span>
        <div><strong>تجربة بلا حفظ</strong><small>الملف ({countOf(diff.incoming, AR.section)}) مقابل الجدول الحالي ({countOf(diff.current, AR.section)})</small></div>
        <em className="dry-badge">{applied ? (applied.undone ? "تراجعتَ عن التطبيق" : "طُبّق") : "لم يُكتب شيء"}</em>
      </header>
      <ul className="dry-tiles">
        {tiles.map(tile => <li key={tile.key} className={tile.value ? `is-${tile.key}` : ""}>{tile.icon}<b>{num(tile.value)}</b><small>{tile.label}</small></li>)}
      </ul>
      <div className="dry-stack" role="img" aria-label={`كما هو ${diff.same}، يتغيّر ${diff.changed.length}، يُضاف ${diff.added.length}، يُحذف ${diff.removed.length}`}>
        <i className="is-same" style={{ width: pct(diff.same) }} /><i className="is-change" style={{ width: pct(diff.changed.length) }} />
        <i className="is-add" style={{ width: pct(diff.added.length) }} /><i className="is-remove" style={{ width: pct(diff.removed.length) }} />
      </div>
      <div className="dry-lists">
        {diff.added.length ? <details><summary><Plus aria-hidden="true" />يُضاف {num(diff.added.length)}</summary><ul>{diff.added.map(item => <li key={item.key}><b>{item.label}</b></li>)}</ul></details> : null}
        {diff.removed.length ? <details><summary><Minus aria-hidden="true" />يُحذف {num(diff.removed.length)}</summary><ul>{diff.removed.map(item => <li key={item.key}><b>{item.label}</b></li>)}</ul></details> : null}
        {diff.changed.length ? <details open={diff.changed.length <= 6}><summary><PenLine aria-hidden="true" />يتغيّر {num(diff.changed.length)}</summary>
          <ul>{diff.changed.map(item => <li key={item.key}><b>{item.label}</b><em>{(item.fields || []).map(field => DIFF_FIELD_LABEL[field]).join(" · ")}</em></li>)}</ul></details> : null}
      </div>
      <div className="dry-actions">
        {applied ? (
          applied.undone ? <p className="tm-note"><Undo2 aria-hidden="true" /> عاد الجدول كما كان قبل التطبيق.</p> : <>
            <p className="tm-note"><CheckCircle2 aria-hidden="true" /> طُبّق: {countOf(applied.count, AR.appointment)} في الجدول.</p>
            {applied.undoable ? <SecondaryButton type="button" onClick={onUndo} disabled={busy} data-guide-ignore="تراجعٌ عن تطبيق الاستيراد إلى النسخة المحفوظة قبله"><Undo2 aria-hidden="true" />تراجع</SecondaryButton> : null}
          </>
        ) : confirming ? <>
          <p className="tm-note" role="alert">سيُستبدل جدول الفصل ({countOf(diff.current, AR.section)}) بما في الملف ({countOf(diff.incoming, AR.section)}). تُحفظ نسخةٌ قبله للتراجع.</p>
          <PrimaryButton type="button" onClick={() => { setConfirming(false); onApply(); }} disabled={busy} data-guide-ignore="تأكيد استبدال الجدول بالملف؛ كتابةٌ واحدة لها نقطة تراجع">نعم، طبّق</PrimaryButton>
          <SecondaryButton type="button" onClick={() => setConfirming(false)} disabled={busy} data-guide-ignore="إلغاء التأكيد">إلغاء</SecondaryButton>
        </> : <>
          <p className="tm-note">{checking ? "جارٍ فحص التعارض…" : ready ? "لا شيء يُكتب حتى تضغط «طبّق»." : "عالج ملاحظات المعاينة أدناه قبل «طبّق»."}</p>
          <PrimaryButton type="button" onClick={() => setConfirming(true)} disabled={busy || !ready || checking} data-guide-ignore="يطلب تأكيداً قبل استبدال الجدول بالملف">طبّق</PrimaryButton>
          <SecondaryButton type="button" onClick={onCancel} disabled={busy} data-guide-ignore="إغلاق التجربة بلا كتابة"><X aria-hidden="true" />إغلاق</SecondaryButton>
        </>}
      </div>
    </section>
  );
}

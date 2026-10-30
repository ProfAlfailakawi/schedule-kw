/**
 * ── ورقةُ «لم نصل بعد» قبل إرسال كرت الأستاذ ───────────────────────────────────
 *
 * تظهر فوق نافذة النشر حين يكون في النطاق مقرراتٌ مقفلة (src/utils/prepublishReach.ts):
 * رأسٌ بقفلٍ وعدد، وقائمةٌ قصيرة (الرمز + الاسم + سطرُ السبب) بـ«افتحه للطرح» لكلٍّ منها —
 * يُحفظ فوراً ويصير الصفُّ 🔓 في مكانه — ثم «أرسل كما هو» أو «راجع المقررات».
 * أنماطُها في styles/40-course-reach.css (تصل النشرَ مع لوحة حالة الطرح).
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LockOpen, Send, ListChecks } from "lucide-react";
import { markOpened, prepublishGroups, prepublishHeadline, type OfferingSnapshot, type PrepublishRow, type PrepublishSheet } from "../utils/prepublishReach";
import { PrimaryButton, SecondaryButton } from "./ui";
import CourseTags from "./CourseTags";

const SHEET_LABEL: Record<PrepublishSheet, { icon: string; label: string }> = {
  new: { icon: "🆕", label: "الصحيفة الجديدة" },
  old: { icon: "📘", label: "الصحيفة القديمة" },
  only: { icon: "📗", label: "الصحيفة" },
};

export interface PrepublishReachSheetProps {
  rows: PrepublishRow[];
  /** «افتحه للطرح»: يعيد الحكمَ الجديد للنطاق (أو null عند الفشل). */
  onOpenCourse: (courseId: number) => Promise<OfferingSnapshot["reach"] | null>;
  onSend: () => void;
  onReview: (sheet: "new" | "old") => void;
  onCancel: () => void;
}

export function PrepublishReachBody({ rows, busy = 0, failed = 0, onOpen, onSend, onReview }: {
  rows: PrepublishRow[]; busy?: number; failed?: number;
  onOpen: (courseId: number) => void; onSend: () => void; onReview: () => void;
}) {
  const head = prepublishHeadline(rows);
  const groups = prepublishGroups(rows);
  return <>
    <header className="ppr-head">
      <span className="ppr-glyph" data-tone={head.locked ? "lock" : "open"} aria-hidden="true">{head.icon}</span>
      <div>
        <h3 id="ppr-title" data-ppr-count={head.locked}>{head.text}</h3>
        <small>يراها الأستاذ في بطاقته رماديةً ولا يختارها</small>
      </div>
    </header>
    <div className="ppr-scroll">
      {groups.map(group => <section key={group.sheet} className="ppr-group" data-sheet={group.sheet} aria-label={SHEET_LABEL[group.sheet].label}>
        {groups.length > 1 ? <h4><span aria-hidden="true">{SHEET_LABEL[group.sheet].icon}</span>{SHEET_LABEL[group.sheet].label}<b>{group.locked}</b></h4> : null}
        <ul className="ppr-list">
          {group.rows.map(row => <li key={row.courseId} data-course={row.courseId} data-opened={row.opened ? "1" : undefined}>
            <span className="ppr-lock" aria-hidden="true">{row.opened ? "🔓" : "🔒"}</span>
            <div className="ppr-text">
              <b><bdi className="ppr-code">{row.code}</bdi> {row.name}<CourseTags courseId={row.courseId} /></b>
              <small>{row.opened ? "فُتح للطرح · يظهر في البطاقة" : failed === row.courseId ? "⛔ تعذّر الحفظ — أعد المحاولة" : row.reason}</small>
            </div>
            {row.opened
              ? <span className="reach-chip is-open"><span aria-hidden="true">🔓</span>مفتوح</span>
              : <button type="button" className="reach-open is-open" disabled={busy === row.courseId} onClick={() => onOpen(row.courseId)}
                  data-guide-ignore="يفتح المقرر للطرح رغم «لم نصل بعد» من ورقة التأكيد قبل الإرسال — القرار نفسه في حالة الطرح">
                  <LockOpen aria-hidden="true" />{busy === row.courseId ? "…" : "افتحه للطرح"}
                </button>}
          </li>)}
        </ul>
      </section>)}
    </div>
    <footer className="ppr-actions">
      <PrimaryButton type="button" data-ppr-send="" onClick={onSend} data-guide-ignore="يرسل بطاقة الأستاذ كما هي بعد تنبيه «لم نصل بعد» — الإرسال نفسه في النشر">
        <Send aria-hidden="true" />{head.locked ? "أرسل كما هو" : "أرسل"}
      </PrimaryButton>
      <SecondaryButton type="button" data-ppr-review="" onClick={onReview} data-guide-ignore="يغلق التنبيه ويفتح لوحة حالة الطرح على الصحيفة الجديدة — عرض فقط">
        <ListChecks aria-hidden="true" />راجع المقررات
      </SecondaryButton>
    </footer>
  </>;
}

export default function PrepublishReachSheet({ rows: initial, onOpenCourse, onSend, onReview, onCancel }: PrepublishReachSheetProps) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(0);
  const [failed, setFailed] = useState(0);
  const sendRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setRows(initial); }, [initial]);
  useEffect(() => { sendRef.current?.querySelector<HTMLButtonElement>("[data-ppr-send]")?.focus(); }, []);
  const open = async (courseId: number) => {
    setBusy(courseId); setFailed(0);
    const reach = await onOpenCourse(courseId).catch(() => null);
    if (reach) setRows(current => markOpened(current, reach)); else setFailed(courseId);
    setBusy(0);
  };
  const reviewSheet = rows.some(row => row.sheet === "new" && !row.opened) || !rows.some(row => row.sheet === "old") ? "new" : "old";
  return createPortal(
    <div className="ppr-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={sendRef} className="ppr-sheet" role="alertdialog" aria-modal="true" aria-labelledby="ppr-title" data-prepublish-reach=""
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
        <PrepublishReachBody rows={rows} busy={busy} failed={failed} onOpen={id => void open(id)} onSend={onSend} onReview={() => onReview(reviewSheet)} />
      </div>
    </div>,
    document.body,
  );
}

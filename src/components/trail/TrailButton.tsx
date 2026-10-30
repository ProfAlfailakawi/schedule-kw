import React, { Suspense, lazy, useState } from "react";
import "./trail.css";

const TrailSheet = lazy(() => import("./TrailSheet"));

/**
 * «👣» صغيرة تفتح ورقة «الأثر». تُوضع في رأس الفريق، وفي بطاقة الحساب لمن يرى فرقاً غيرَ فريقه
 * (العميد، رئيس القسم، المسجّل العام، عميد التسجيل). والخادمُ يقرّر ما يُرى، لا مكانُ الزر.
 */
export default function TrailButton({ className = "", label = "الأثر: من فعل ماذا" }: { className?: string; label?: string; "data-guide-ignore"?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`trail-open ${className}`.trim()}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        data-guide-ignore="يفتح ورقة «الأثر»: من فعل ماذا في الفريق؛ قراءة فقط"
      >
        <span aria-hidden="true">👣</span>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <TrailSheet onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}

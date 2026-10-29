import React from "react";

/**
 * ── ترويسة الوثيقة الرسمية ─────────────────────────────────────────────────
 *
 * ترويسة التقرير الشامل هي المعتمدة (قرار مالك النظام، 2026-10-29): رمز القسم
 * والقسم يميناً، والعنوان والكلية في الوسط، والفصل وتاريخ الإصدار يساراً.
 * وتقرير تغييرات الجدول يلبسها كما هي بعنوانه هو، فتخرج الوثيقتان من مكتبٍ
 * واحد. مكوّنٌ واحد لهما، لا نسختان تتباعدان مع الوقت.
 */
export default function PrintComprehensiveHead({ title, sectionCode, sectionName, college, allSites = false, approval, termName, issueDate }: {
  title: string;
  sectionCode: string;
  sectionName: string;
  college: string;
  /** وثيقةٌ تضم مواقع القسم كلها. */
  allSites?: boolean;
  /** سطر حال الاعتماد كما يُكتب تحت الكلية؛ غيابه يعني ورقةً بلا ادّعاء. */
  approval?: { line: string; status: string } | null;
  termName: string;
  issueDate: string;
}) {
  return (
    <header className="print-comprehensive-classic-head">
      <div className="print-comprehensive-head-top">
        <div className="print-comprehensive-side print-comprehensive-side-right">
          <div><span>رمز القسم العلمي</span><strong>{sectionCode || "—"}</strong></div>
          <div><span>القسم العلمي</span><strong>{sectionName || "—"}</strong></div>
        </div>
        <div className="print-comprehensive-title-block">
          <h1>{title}</h1>
          <p>الكلية: {college || "—"}{allSites ? " — كل الفروع" : ""}</p>
          {approval ? (
            <p className="print-approval-line" data-status={approval.status}>{approval.line}</p>
          ) : null}
        </div>
        <div className="print-comprehensive-side print-comprehensive-side-left">
          <div><span>الفصل الدراسي</span><strong>{termName || "—"}</strong></div>
          <div><span>تاريخ الإصدار</span><strong><bdi dir="ltr">{issueDate}</bdi></strong></div>
        </div>
      </div>
    </header>
  );
}

/** تاريخ الإصدار كما تكتبه الترويسة: يوم/شهر/سنة. */
export function printIssueDate(issued = new Date()): string {
  return `${String(issued.getDate()).padStart(2, "0")}/${String(issued.getMonth() + 1).padStart(2, "0")}/${issued.getFullYear()}`;
}

import CourseTags from "./CourseTags";
import React from "react";
import { AdCourse, AdInstructor, FSchedule } from "../types";
import VisitingBadge from "./VisitingBadge";
import { displayInstructorText } from "../utils/instructorIdentity";
import { effectiveCourseHours } from "../utils/scheduleRegulations";
import { authorityCourseCode, normalizeAuthoritySectionCode } from "../utils/authorityAcademicCodes";
import { orderAuthorityReportRows } from "../utils/authorityReportOrdering";
import PrintComprehensiveHead, { printIssueDate } from "./PrintComprehensiveHead";
import PrintStamp from "./PrintStamp";

export type AuthorityReportEntry = {
  status: "added" | "deleted" | "changed" | "unchanged";
  /** Imported row whose original PDF identity could not be proven. */
  needsSourceReview?: boolean;
  changedFields: string[];
  referenceNumber: string;
  source: FSchedule | null;
  current: FSchedule | null;
  /** يُملأ فقط في وثيقة تضم مواقع الفرع: اسم موقع هذا الصف. */
  siteLabel?: string;
};

export type AuthorityReport = {
  draftId: string;
  name: string;
  sourceFileName: string;
  sourceBranchCode?: string;
  sourceBranchName?: string;
  counts: { added: number; deleted: number; changed: number; unchanged: number; review?: number };
  rows: AuthorityReportEntry[];
};

interface Props {
  report: AuthorityReport;
  termName: string;
  collegeName: string;
  sectionName: string;
  sectionCode: string;
  courseById: Map<number, AdCourse>;
  /** مفتاح القسم ذو الخانات الأربع لكل قسم — يُكتب منه رقم المقرر السباعي كما تطبعه الهيئة. */
  departmentKeyBySection?: Map<number, string>;
  instructorById: Map<number, AdInstructor>;
  visitingIds: Set<number>;
  /** يحكم على كل صفٍّ بكليته وقسمه هو (وثيقة كل الفروع تجمع صفوف أقسامٍ عدة فلا تصلح لها قائمةٌ واحدة). */
  isVisitingRow?: (row: FSchedule) => boolean;
  /* ── الوثيقة الواحدة عبر مواقع الفرع ──────────────────────────────────────
   * حين يُطلب تقرير التغييرات للقسم كله، يُصيَّر هذا المكوّن مرة لكل موقع داخل
   * وثيقة واحدة. ولأن ترقيم الصفحات يجب أن يقرأ كوثيقة واحدة لا كثلاث وثائق
   * ملتصقة، يستقبل موضعه من الكتاب بدل أن يحسب لنفسه. وإن لم يُمرَّر شيء —
   * وهي الحال في تقرير الموقع الواحد — فالسلوك كما كان تماماً.
   */
  pageOffset?: number;
  pageTotal?: number;
  /** يُطبع مرة واحدة في أول صفحة من الكتاب: شكل القسم كله قبل تفصيله. */
  bookSites?: Array<{ label: string; added: number; deleted: number; changed: number; review?: number }>;
  /** حين تضم الوثيقة مواقع الفرع: عمود «الموقع» يظهر، وصفوف المواقع تتصل. */
  showSite?: boolean;
  /** النسخة نفسها بعمودٍ أخير للرقم المدني بعد اسم المدرس، لكل صف لا للمعدَّل وحده. */
  showCivil?: boolean;
  /** سطر حال الاعتماد في الترويسة، كما في التقرير الشامل. */
  approval?: { line: string; status: string } | null;
  /** ختم الورقة (utils/reportStamp): رمزُ هذه النسخة، وأصلُ رابط التحقق. */
  stampCode?: string | null;
  stampOrigin?: string;
  /** تاريخ الإصدار في الترويسة؛ اليوم إن لم يُمرَّر. */
  issueDate?: string;
}

const pageItems = <T,>(items: T[], size: number): T[][] => {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages.length ? pages : [[]];
};

export default function AuthorityPdfReport({
  report,
  termName,
  collegeName,
  sectionName,
  sectionCode,
  courseById,
  departmentKeyBySection,
  instructorById,
  visitingIds,
  isVisitingRow,
  pageOffset = 0,
  pageTotal,
  bookSites,
  showSite = false,
  showCivil = false,
  approval = null,
  stampCode = null,
  stampOrigin,
  issueDate = printIssueDate(),
}: Props) {
  // Source PDF order is immutable; a renamed or recreated current row may
  // have an entirely different sourceOrder. True new courses print last.
  const entries = orderAuthorityReportRows(report.rows);
  /* ٢٨ صفاً كالتقرير الشامل، وبكثافة صفوفه نفسها (print-comprehensive-dense-rows):
     الصف أقصر بالمليمترات التي كانت تُترك فراغاً أسفل الورقة، والتصميم كما هو. */
  const pages = pageItems(entries, 28);
  const fieldChanged = (entry: AuthorityReportEntry, ...fields: string[]) =>
    entry.status === "changed" && fields.some(field => entry.changedFields.includes(field));
  /**
   * The day numbers of a lecture, written so an Arabic reader reads them in
   * order.
   *
   * The cell is `print-ltr` — the digits are a latin sequence and must stay
   * one unbroken run. Written ascending, «1 3 5» puts Sunday on the LEFT, so a
   * reader coming from the right meets Thursday first and the week reads
   * backwards. The sequence is therefore emitted in reverse — «5 3 1» — which
   * an ltr cell paints with 1 on the right: the first day of the week where
   * the eye starts. Exactly the same convention the time cell already follows
   * by writing `fendtime - fstarttime`.
   */
  const dayNumbers = (row: FSchedule) =>
    [row.fsunday && "1", row.fmonday && "2", row.ftuesday && "3", row.fwednesday && "4", row.fthursday && "5"]
      .filter(Boolean).reverse().join(" ") || "—";

  return (
    <div className={`print-report print-wide print-query-report print-comprehensive print-comprehensive-book print-comprehensive-dense-rows authority-pdf-report${showSite ? " authority-pdf-with-site" : ""}${showCivil ? " authority-pdf-with-civil" : ""}`}>
      <div className="print-comprehensive-pages">
        {pages.map((pageEntries, pageIndex) => (
          <section className="print-comprehensive-page authority-pdf-page" key={`authority-${pageIndex + 1}`}>
            {/* ترويسة التقرير الشامل نفسها — هي المعتمدة — بعنوان هذه الوثيقة. */}
            <PrintComprehensiveHead
              title="تقرير تغييرات الجدول"
              sectionCode={sectionCode}
              sectionName={sectionName}
              college={collegeName}
              approval={approval}
              termName={termName}
              issueDate={issueDate}
            />
            {pageOffset + pageIndex === 0 && bookSites?.length ? (
              <div className="print-comprehensive-sites" role="note">
                <span>مواقع القسم في هذا الفصل:</span>
                {/* ── يُقرأ بلا شرح ────────────────────────────────────────
                    كان السطر يقول «+1 −0 ±1»، وهي رموز يعرفها من كتبها. وما
                    يحتاجه قارئ الوثيقة كلمتان: ماذا أُضيف وماذا حُذف وماذا
                    عُدّل، وما لا تغيير فيه يُقال صراحةً لا بصفرٍ مركون. */}
                {bookSites.map(site => {
                  const parts = [
                    site.added ? `مضاف ${site.added}` : "",
                    site.deleted ? `محذوف ${site.deleted}` : "",
                    site.changed ? `معدّل ${site.changed}` : "",
                    site.review ? `مراجعة المصدر ${site.review}` : "",
                  ].filter(Boolean);
                  return <b key={site.label}>{site.label} · {parts.length ? parts.join(" · ") : "بلا تغيير"}</b>;
                })}
              </div>
            ) : null}

            <div className="print-comprehensive-grid authority-pdf-grid" role="table" aria-label="تقرير تغييرات الجدول">
              <div className="print-comprehensive-grid-row print-comprehensive-grid-head" role="row">
                {/* أعمدة المستند بترتيبها كما تطبعه الهيئة، ثم عمود الرقم المدني في نسخته وحدها. */}
                {[...["رقم المقرر", "الرقم المرجعي", "الشعبة", "مسمى المقرر", "عدد الوحدات", "عدد الساعات", "الحد الأقصى", "القاعة", "المبنى", "الوقت", "الأيام", "المدرس"], ...(showCivil ? ["الرقم المدني"] : [])].map(head => (
                  <div role="columnheader" key={head}>{head}</div>
                ))}
              </div>
              <div className="print-comprehensive-grid-body" role="rowgroup">
                {pageEntries.map((entry, index) => {
                  const row = (entry.current || entry.source) as FSchedule;
                  if (!row) return null;
                  const course = courseById.get(Number(row.AdCourseId));
                  const instructor = instructorById.get(Number(row.AdInstructorId));
                  const cell = (changed: boolean) => changed ? "authority-pdf-cell-changed" : "";
                  const statusLabel = entry.needsSourceReview ? "مراجعة المصدر" : entry.status === "added" ? "مضاف" : entry.status === "deleted" ? "محذوف" : entry.status === "changed" ? "معدّل" : "";
                  return (
                    <div className={`print-comprehensive-grid-row authority-pdf-row authority-pdf-row-${entry.status}${entry.needsSourceReview ? " authority-pdf-row-review" : ""}`} role="row" key={`${pageIndex}-${index}-${row.id || row.sourceOrder || index}-${entry.status}`}>
                      {statusLabel ? <span className="authority-pdf-row-marker" aria-hidden="true">{statusLabel}</span> : null}
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdCourseId"))}`}>{authorityCourseCode(course?.CourseCode || row.CourseCodeSnapshot, departmentKeyBySection?.get(Number(course?.AdSectionId || row.AdSectionId))) || "—"}</div>
                      {/* A genuinely added appointment was absent from the immutable
                          source PDF. Its current reference field may contain an OCR
                          artefact or a number carried forward by an older import.
                          Never present that unverified value as an official CRN.
                          Matched historical rows always print the source CRN. */}
                      {entry.status === "added"
                        ? <div role="cell" className="authority-pdf-reference-number authority-pdf-reference-new">{entry.needsSourceReview ? "—" : "مقرر جديد"}</div>
                        : <div role="cell" className="print-ltr authority-pdf-reference-number">{entry.referenceNumber || "—"}</div>}
                      {/* Section numbering is a system-canonical import convention, not
                          a user edit. Keep the value visible but never paint it yellow. */}
                      <div role="cell" className="print-ltr">{entry.status === "deleted" && Number(normalizeAuthoritySectionCode(entry.source?.sourceSectionText)) >= 500 && Number(normalizeAuthoritySectionCode(entry.source?.sourceSectionText)) <= 999
                        ? normalizeAuthoritySectionCode(entry.source?.sourceSectionText)
                        : String(row.SCode || "").trim() || "—"}</div>
                      {/* الموقع بطاقة صغيرة بجانب اسم المقرر، لا عموداً جديداً:
                          العمود يضيّق الجدول الرسمي كله لأجل كلمة، والبطاقة
                          تقولها حيث ينظر القارئ أصلاً — كما تقولها بطاقة
                          الموعد على الشاشة. */}
                      <div role="cell" className={`print-wrap print-course-name ${cell(fieldChanged(entry, "AdCourseId"))}`}>
                        {course?.CourseName || row.AdCourseName || "—"}<CourseTags courseId={row.AdCourseId} printOnly />
                        {showSite && entry.siteLabel ? <span className="print-site-chip">{entry.siteLabel}</span> : null}
                      </div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.CourseCredit ?? "—"}</div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course ? (effectiveCourseHours(course) || "—") : "—"}</div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.MaxStudent ?? "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdRoomHall"))}`}>{String(row.AdRoomHall || "").trim() || "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdRoomCode"))}`}>{String(row.AdRoomCode || "").trim() || "—"}</div>
                      <div role="cell" className={`print-ltr print-nowrap ${cell(fieldChanged(entry, "fstarttime", "fendtime"))}`}>{row.fstarttime && row.fendtime ? `${row.fendtime} - ${row.fstarttime}` : "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"))}`}>{dayNumbers(row)}</div>
                      {/* ── الاسم يتبدّل، والرقم المدني لا ─────────────────────
                          حين يُغيَّر أستاذ المقرر لا يكفي اسمٌ جديد في خلية
                          صفراء: الأسماء تتشابه في هذه الجامعة — وقد رأينا
                          اسمين متطابقين لشخصين — ومن يوقّع الوثيقة يريد أن
                          يعرف مَن بعينه. فيُكتب رقمه المدني بجانبه من سجل
                          النظام لا من المستند، وفي الصفوف المعدَّلة وحدها
                          حتى لا يمتلئ العمود بأرقام لا تخصّ التغيير. */}
                      <div role="cell" className={`print-wrap print-instructor-name authority-pdf-instructor ${cell(fieldChanged(entry, "AdInstructorId"))}`}>
                        <span>{instructor?.AdInstructorName || displayInstructorText(row.sourceInstructorText) || "—"}</span>
                        {!showCivil && fieldChanged(entry, "AdInstructorId") && instructor?.AdInstructorCivil
                          ? <bdi className="authority-pdf-civil print-ltr">{String(instructor.AdInstructorCivil).trim()}</bdi>
                          : null}
                        {(isVisitingRow ? isVisitingRow(row) : visitingIds.has(Number(row.AdInstructorId))) ? <VisitingBadge compact /> : null}
                      </div>
                      {showCivil ? <div role="cell" className={`print-ltr authority-pdf-civil-cell ${cell(fieldChanged(entry, "AdInstructorId"))}`}>{String(instructor?.AdInstructorCivil || "").trim() || "—"}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className={`print-comprehensive-page-footer authority-pdf-footer${stampCode ? " has-print-stamp" : ""}`}>
              <div className="print-comprehensive-signatures">
                <div><span>توقيع رئيس لجنة الجدول</span><i /></div>
                <div><span>توقيع رئيس القسم العلمي</span><i /></div>
                <div><span>توقيع العميد</span><i /></div>
              </div>
              <div className="print-comprehensive-legend-stack">
                <div className="print-comprehensive-legend authority-pdf-legend">
                  <span className="authority-pdf-key authority-pdf-key-added">مضاف</span>
                  <span className="authority-pdf-key authority-pdf-key-deleted">محذوف</span>
                  <span className="authority-pdf-key authority-pdf-key-changed">معدّل</span>
                </div>
                <div className="print-comprehensive-page-number"><bdi dir="ltr">{pageOffset + pageIndex + 1} / {pageTotal ?? pages.length}</bdi></div>
              </div>
              {/* الختم على كل صفحة، كالتقرير الشامل: صفحةٌ تُفصل من الرزمة تحمل ما يُطابَق به. */}
              {stampCode ? <PrintStamp code={stampCode} origin={stampOrigin} /> : null}
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}

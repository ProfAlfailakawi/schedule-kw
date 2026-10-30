/**
 * ── شبكةُ الأمان: ما النقطة، وماذا يفعل استرجاعُها ─────────────────────────
 *
 * ثلاثة أشياء خالصة يقرؤها الخادمُ والواجهة والاختبارات معاً:
 *
 *  1. `restoreVersionRows` — الصفوف التي يكتبها الاسترجاع. هي صفوفُ النسخة كما
 *     حُفظت: الأستاذ والأيام والوقت والقاعة والشعبة لا تُمسّ. يُطبَّع فقط ما هو
 *     قديمُ الشكل: النطاقُ يُفرض على النسخة نفسها، والمعرّفُ غير الصحيح يُعطى
 *     رقماً سالباً (يحجز له التخزينُ رقماً جديداً)، والساعةُ «9:00» تُكتب «09:00».
 *     كان الاسترجاع يمرّ على `safeDraftRows` — منظِّفِ مسودّات الاستيراد — فيُسقط
 *     حقولاً ليست من المسودة (لقطة رمز المقرر واسمه وخطته، ونوع القاعة المرافقة،
 *     ومصدر آخر تغيير) ويضيف ترتيبَ مصدرٍ لم يكن، فلا يعود الجدولُ كما كان.
 *
 *  2. `restoreImpact` — ماذا سيتغيّر في الجدول الحيّ إن استُرجعت النسخة، بعدٍّ
 *     واحدٍ يُفهم: ما يُحذف وما يعود وما يُعدَّل. يُقارن بالمعنى (المقرر والشعبة
 *     والأستاذ والأيام والوقت والقاعة) لا بالمعرّف، لأن النشر يعطي المواعيد
 *     معرّفاتٍ جديدة وإن لم يتغيّر فيها شيء.
 *
 *  3. `safetyPointKind` — ما هذه النقطة: قبل استيراد، قبل نشر، قبل تراجع، قبل
 *     حذف موعد… من مصدرها واسمها، لتُرسم بأيقونتها ووصفها القصير.
 */
import { rowSignature } from "./scopeFingerprint";
import { normalizeClock } from "./scheduleTime";
import { AR, countOf, oblique } from "./arabicCount";

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** Rows a restore writes: the version's own rows, with only legacy shapes normalised. */
export function restoreVersionRows(input: unknown, collegeId: number, sectionId: number, termId: number): any[] {
  if (!Array.isArray(input)) return [];
  if (input.length > 450) throw new Error("النسخة أكبر من الحد الآمن المسموح");
  return input.map((raw: any, index: number) => {
    const row: any = { ...(raw || {}) };
    /* `rev` belongs to the row that is being replaced, not to the snapshot: a
       restore starts the count again, exactly as before (a stale editor is then
       refused rather than allowed to write over the restored row). */
    delete row.rev;
    row.id = Number.isInteger(Number(raw?.id)) && Number(raw.id) > 0 ? Number(raw.id) : -(index + 1);
    row.AdCollegeId = collegeId; row.AdSectionId = sectionId; row.AdTermId = termId;
    row.AdCourseId = Number(raw?.AdCourseId || 0);
    row.AdCourseName = String(raw?.AdCourseName ?? "");
    row.SCode = String(raw?.SCode ?? "");
    row.AdInstructorId = Number(raw?.AdInstructorId || 0);
    for (const key of DAY_KEYS) row[key] = Boolean(raw?.[key]);
    row.fstarttime = normalizeClock(raw?.fstarttime);
    row.fendtime = normalizeClock(raw?.fendtime);
    row.AdRoomCode = String(raw?.AdRoomCode ?? "");
    row.AdRoomHall = String(raw?.AdRoomHall ?? "");
    row.fdetail = DAY_KEYS.map((key, at) => (raw?.[key] ? String(at + 1) : "")).filter(Boolean).join(",");
    /* Firestore refuses `undefined`; a key the snapshot never had stays absent. */
    for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
    return row;
  });
}

export interface RestoreImpact {
  /** Appointments in the live timetable that the restore removes. */
  removes: number;
  /** Appointments the restore brings back that the live timetable lacks. */
  restores: number;
  /** Same course and section on both sides, but teacher, days, time or room differ. */
  edits: number;
  /** Nothing at all would change. */
  same: boolean;
}

const offeringKey = (row: any) => `${Number(row?.AdCourseId || 0)}|${String(row?.SCode ?? "").trim()}`;

/** Rows of `rows` that `other` has no copy of, counting duplicates. */
function unmatched(rows: any[], other: any[]): any[] {
  const pool = new Map<string, number>();
  for (const row of other || []) { const key = rowSignature(row); pool.set(key, (pool.get(key) || 0) + 1); }
  const left: any[] = [];
  for (const row of rows || []) {
    const key = rowSignature(row);
    const have = pool.get(key) || 0;
    if (have > 0) pool.set(key, have - 1);
    else left.push(row);
  }
  return left;
}

/** What restoring `versionRows` would do to `liveRows`, matched by meaning, not by id. */
export function restoreImpact(liveRows: any[], versionRows: any[]): RestoreImpact {
  const liveLeft = unmatched(liveRows, versionRows);
  const versionLeft = unmatched(versionRows, liveRows);
  /* A leftover on each side for the same course and section is one edit, not a delete plus an add. */
  const offerings = new Map<string, number>();
  for (const row of versionLeft) offerings.set(offeringKey(row), (offerings.get(offeringKey(row)) || 0) + 1);
  let edits = 0;
  for (const row of liveLeft) {
    const key = offeringKey(row);
    const left = offerings.get(key) || 0;
    if (left > 0) { offerings.set(key, left - 1); edits += 1; }
  }
  const removes = liveLeft.length - edits;
  const restores = versionLeft.length - edits;
  return { removes, restores, edits, same: !removes && !restores && !edits };
}

/** One line: «يعدّل 40 موعداً، ويحذف 3 مواعيد، ويعيد موعدين». */
export function describeRestoreImpact(impact: RestoreImpact): string {
  if (impact.same) return "مطابقة للجدول الحالي — لن يتغيّر شيء";
  const parts: string[] = [];
  if (impact.edits) parts.push(`يعدّل ${countOf(impact.edits, oblique(AR.appointment))}`);
  if (impact.removes) parts.push(`يحذف ${countOf(impact.removes, oblique(AR.appointment))}`);
  if (impact.restores) parts.push(`يعيد ${countOf(impact.restores, oblique(AR.appointment))}`);
  return parts.map((part, at) => (at ? `و${part}` : part)).join("، ");
}

export type SafetyPointKind = "import" | "publish" | "undo" | "restore" | "add" | "edit" | "delete" | "approval" | "copy" | "other";

/** What the point was taken before, as a kind and a short Arabic label. */
export function safetyPointKind(label: unknown, source: unknown): { kind: SafetyPointKind; kindLabel: string } {
  const text = String(label || "");
  const src = String(source || "");
  if (/^قبل التراجع/.test(text) || (src === "undo" && !/^قبل استرجاع/.test(text))) return { kind: "undo", kindLabel: "قبل التراجع" };
  if (/^قبل استرجاع/.test(text)) return { kind: "restore", kindLabel: "قبل الاسترجاع" };
  if (/\.pdf\b|\.xlsx?\b|\.csv\b|استيراد|PDF/i.test(text) || src === "import") return { kind: "import", kindLabel: "قبل الاستيراد" };
  if (src === "publish" || /^قبل نشر/.test(text) || /^قبل تثبيت/.test(text)) return { kind: "publish", kindLabel: "قبل النشر" };
  if (src === "copy" || /نسخ/.test(text)) return { kind: "copy", kindLabel: "قبل النسخ" };
  if (/حذف/.test(text)) return { kind: "delete", kindLabel: "قبل الحذف" };
  if (/إضافة/.test(text)) return { kind: "add", kindLabel: "قبل الإضافة" };
  if (/تعديل|نقل|استبدال|تحويل|إسناد/.test(text)) return { kind: "edit", kindLabel: "قبل التعديل" };
  if (/توقيع|إرسال|إرجاع|قبول/.test(text)) return { kind: "approval", kindLabel: "عند الاعتماد" };
  return { kind: "other", kindLabel: "نقطة أمان" };
}

/** The label without the kind it already says: «قبل نشر: ملف.pdf» → «ملف.pdf». */
export function safetyPointTitle(label: unknown): string {
  const text = String(label || "").trim();
  const nested = text.match(/^قبل التراجع عن القرار:\s*(.+)$/);
  if (nested) return `تراجعٌ عن «${nested[1]}»`;
  const restored = text.match(/^قبل استرجاع:\s*(.+)$/);
  if (restored) return `استرجاعُ «${restored[1]}»`;
  const published = text.match(/^قبل نشر:\s*(.+)$/);
  if (published) return published[1];
  return text || "نقطة أمان";
}

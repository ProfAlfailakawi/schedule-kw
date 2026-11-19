/**
 * ── ترقيم الشعب: رقمُ التسجيل، والرقمُ التالي لما نفتحه ─────────────────────
 *
 * قرار المالك (2026-11-19):
 *  ١) التسجيل يطبع لكل شعبةٍ رقماً ثابتاً ورقماً مرجعياً (CRN) لا يغيّرهما بين ملفاته.
 *     بعد كل فحصٍ لملفهم تُطابَق تلقائياً (بلا زرّ) أرقامُ شعبنا ومرجعيّاتها بأرقامهم، لكل شعبةٍ عُرفت بيقين
 *     (بالرقم المرجعي، أو بالمقرر والموعد والأستاذ منفردةً من الطرفين). لا يمسّ الأيام
 *     ولا الأوقات ولا القاعات ولا الأساتذة، ويتخطّى الملتبس، ويرفض أن تحمل شعبتان
 *     عندنا رقماً واحداً.
 *  ٢) الشعبة الجديدة التي نفتحها: رقمُها التالي بعد أكبر رقمٍ للمقرر في الفصل، بلا
 *     ملء فراغ، ولا يعود رقمٌ حُذف في الفصل نفسه (سجلّ الأرقام المستعملة).
 *  ٣) شعبةٌ بلا رقمٍ مرجعي «جديدة · بانتظار رقم التسجيل» حتى يظهر رقمها في ملفٍّ لاحق.
 *
 * دوالُّ نقيّة: لا كتابةَ ولا شبكة.
 */
import type { RegistrarIdentity } from "./registrarCheck";

export const SECTION_NUMBER_FIRST = 501;
export const SECTION_NUMBER_LAST = 999;

/** رقم شعبةٍ في المدى المقبول (501–999)، وإلا null. */
export function sectionNumberOf(value: unknown): number | null {
  const text = String(value ?? "").normalize("NFKC").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
  if (!/^\d{1,4}$/.test(text)) return null;
  const number = Number(text);
  return number >= SECTION_NUMBER_FIRST && number <= SECTION_NUMBER_LAST ? number : null;
}

/**
 * الرقم التالي: بعد أكبر رقمٍ مستعمل (في الجدول، أو في سجلّ الفصل لما حُذف)، بلا ملء فراغ.
 * لا شيء ⇒ 501. وبعد 999 يظهر 1000 كما هو فيُرفض عند الحفظ ولا يُخفى.
 */
export function nextSectionNumber(used: Iterable<unknown>, recordedMax?: unknown): string {
  const numbers = [...used].map(sectionNumberOf).filter((n): n is number => n !== null);
  const recorded = sectionNumberOf(recordedMax);
  return String(Math.max(SECTION_NUMBER_FIRST - 1, ...numbers, ...(recorded !== null ? [recorded] : [])) + 1);
}

/** سجلّ الأرقام: أكبر رقمٍ استُعمل لكل مقرر. */
export type SectionNumberLedger = Record<string, number>;

/** يضمّ أرقام صفوفٍ إلى السجلّ (لا ينقص رقمٌ أبداً). */
export function recordSectionNumbers(ledger: SectionNumberLedger | null | undefined, rows: Iterable<{ AdCourseId?: unknown; SCode?: unknown }>): SectionNumberLedger {
  const out: SectionNumberLedger = { ...(ledger || {}) };
  for (const row of rows) {
    const courseId = Number(row?.AdCourseId || 0), number = sectionNumberOf(row?.SCode);
    if (courseId > 0 && number !== null) out[String(courseId)] = Math.max(Number(out[String(courseId)] || 0), number);
  }
  return out;
}

/** الرقم التالي لمقررٍ في فصل: من صفوف الجدول + سجلّ الفصل. */
export function nextCourseSection(
  rows: Iterable<{ id?: unknown; AdCourseId?: unknown; AdTermId?: unknown; SCode?: unknown }>,
  courseId: number, termId: number, options: { excludeId?: number | null; ledger?: SectionNumberLedger | null } = {},
): string {
  const used: unknown[] = [];
  for (const row of rows) {
    if (options.excludeId && Number(row.id) === Number(options.excludeId)) continue;
    if (Number(row.AdCourseId) !== Number(courseId) || Number(row.AdTermId) !== Number(termId)) continue;
    used.push(row.SCode);
  }
  return nextSectionNumber(used, options.ledger?.[String(courseId)]);
}

/** «جديدة · بانتظار رقم التسجيل»: شعبةٌ بلا رقمٍ مرجعي. */
export function awaitingRegistrarNumber(row: { referenceNumber?: unknown } | null | undefined): boolean {
  return Boolean(row) && !String(row?.referenceNumber ?? "").replace(/\D/g, "");
}

/* ── خطة «مطابقة ترقيم التسجيل» ──────────────────────────────────────────── */

export interface NumberingChange {
  ref: string;
  ids: number[];
  courseId?: number;
  courseCode: string;
  courseName: string;
  from: { section: string; crn: string };
  to: { section: string; crn: string };
  /** شعبةٌ جديدة (بلا رقمٍ مرجعي) ظهرت عندهم. */
  isNew: boolean;
}
export interface NumberingSkip { ref: string; courseId?: number; courseCode: string; courseName: string; section: string; reason: string; how: RegistrarIdentity["how"] }
export interface NumberingCollision { courseId?: number; courseCode: string; courseName: string; section: string; refs: string[] }
export interface NumberingPlan {
  changes: NumberingChange[];
  /** شعبٌ عُرفت بيقين وأرقامها مثل أرقامهم. */
  aligned: number;
  skipped: NumberingSkip[];
  collisions: NumberingCollision[];
  /** في الخطة ما يُكتب (التغييرات المتصادمة أُخرجت إلى collisions ولا تُكتب). */
  writable: boolean;
}

type LiveRow = { id?: unknown; AdCourseId?: unknown; SCode?: unknown; AdCourseName?: unknown };

const sectionText = (value: unknown) => String(value ?? "").trim();

/**
 * الخطة: لكل هويةٍ مؤكدة يختلف رقمها أو مرجعيّها عن ملفهم تغييرٌ واحد. `only` يحصرها
 * في شعبٍ بعينها (اعتمادُ رقم شعبةٍ جديدة ظهرت عندهم). والتصادم يُحسب على الجدول كله:
 * رقمٌ يصير لشعبتين مختلفتين من المقرر نفسه لا يُكتب لأيٍّ منهما.
 */
export function planRegistrarNumbering(
  identities: readonly RegistrarIdentity[], live: readonly LiveRow[], options: { only?: readonly string[] } = {},
): NumberingPlan {
  const only = options.only?.length ? new Set(options.only) : null;
  const changes: NumberingChange[] = [];
  const skipped: NumberingSkip[] = [];
  let aligned = 0;
  for (const identity of identities) {
    if (only && !only.has(identity.ref)) continue;
    const differs = identity.ours.section !== identity.theirs.section || identity.ours.crn !== identity.theirs.crn;
    if (!identity.certain) {
      /* ما عُرف تقريباً (ظهر بخطأ، أو بالمفتاح وحده) بطاقتُه في الفحص نفسه؛ ويُسمّى هنا ما سواه. */
      if (differs && identity.how !== "misplaced" && identity.how !== "key") skipped.push({ ref: identity.ref, courseId: identity.courseId, courseCode: identity.courseCode, courseName: identity.courseName, section: identity.ours.section, reason: identity.reason || "لم تُعرف بيقين.", how: identity.how });
      continue;
    }
    if (!differs) { aligned++; continue; }
    changes.push({
      ref: identity.ref, ids: [...identity.ids], courseId: identity.courseId, courseCode: identity.courseCode, courseName: identity.courseName,
      from: { ...identity.ours }, to: { ...identity.theirs }, isNew: !identity.ours.crn,
    });
  }

  /* الجدول كما سيصير: رقمُ كل صفٍّ بعد التغيير. رقمٌ يصير لشعبتين مختلفتين من المقرر نفسه
     لا يُعتمد: يُخرَج التغييرُ الذي أوصل إليه (ويُسمّى)، ويُعاد الحساب حتى يثبت — فإخراجُ
     تغييرٍ يُبقي رقمه القديم، وقد يصطدم به تغييرٌ آخر. */
  const unchangedRef = new Map<string, string>();
  for (const identity of identities) if (identity.courseId) unchangedRef.set(`${identity.courseId}|${identity.ours.section}`, identity.ref);
  const collisions: NumberingCollision[] = [];
  for (let round = 0; round < 50; round++) {
    const target = new Map<number, { section: string; ref: string }>();
    for (const change of changes) for (const id of change.ids) target.set(id, { section: change.to.section, ref: change.ref });
    const owners = new Map<string, Set<string>>();
    for (const row of live) {
      const id = Number(row.id), courseId = Number(row.AdCourseId || 0);
      if (!(courseId > 0)) continue;
      const moved = target.get(id);
      const section = moved ? moved.section : sectionText(row.SCode);
      if (!section) continue;
      const ref = moved ? moved.ref : unchangedRef.get(`${courseId}|${sectionText(row.SCode)}`) || `${courseId}|${sectionText(row.SCode)}`;
      const key = `${courseId}|${Number(section)}`;
      owners.set(key, new Set([...(owners.get(key) || []), ref]));
    }
    const blocked = new Set<string>();
    for (const [key, refs] of owners) {
      if (refs.size < 2) continue;
      const moving = [...refs].filter(ref => changes.some(change => change.ref === ref));
      if (!moving.length) continue; // تصادمٌ قائمٌ قبل الخطة ليس منها
      for (const ref of moving) {
        const change = changes.find(item => item.ref === ref)!;
        blocked.add(ref);
        collisions.push({ courseId: change.courseId, courseCode: change.courseCode, courseName: change.courseName, section: key.split("|")[1], refs: [...refs] });
      }
    }
    if (!blocked.size) break;
    for (let i = changes.length - 1; i >= 0; i--) if (blocked.has(changes[i].ref)) changes.splice(i, 1);
  }
  return { changes, aligned, skipped, collisions, writable: changes.length > 0 };
}

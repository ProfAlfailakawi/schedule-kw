/**
 * ── فيلم الفصل ──────────────────────────────────────────────────────────────
 *
 * قصةُ جدول الفصل في أقل من دقيقة، بأرقامه الحقيقية: من فصلٍ فارغ إلى جدولٍ
 * معتمد. نسخةٌ للقسم يعرضها رئيس اللجنة أو رئيس القسم في مجلسه، ونسخةٌ للعميد
 * تجمع أقسام الكلية.
 *
 * كل رقمٍ هنا يُحسب مما يملكه النظام فعلاً: صفوف الجدول، وطلبات الأساتذة
 * وقراراتها، ونسخ الجدول المحفوظة، واحتياجات الطلبة الواردة من «مساري»، ودورة
 * الاعتماد بتواريخها. وما لا مصدر له لا يُعرض: يسقط مشهده بدل أن يُخترع رقمه.
 *
 * والفيلم يعمل قبل الاعتماد النهائي أيضاً (قرار المالك): يُروى «حتى الآن»،
 * وتظهر خطوات التسليم الباقية «بانتظار …»، ولا يدّعي العنوان أن الفصل انتهى.
 * فإذا اعتمد التسجيل الجدول أصبح الفيلم نهائياً وبقي في «السجل».
 *
 * لا أسماء قاعات ولا أرقام مدنية ولا أسماء أساتذة: أعدادٌ فقط، فيصلح الرابط
 * لأن يُعرض في مجلس. وخلفية الفيلم شكلُ بصمة القسم مجرّداً من كل نص
 * (`FingerprintShape`): أقواسٌ فقط، ولا تُحمل إلا لمن يرى البصمة أصلاً.
 */
import { effectiveSubmissionDate } from "./approvalWorkflow";
import { finalAcceptance, sealDateLabel } from "./approvalSeal";
import { AR, countOf, nounFor } from "./arabicCount";
import { FINGERPRINT_DAYS, fingerprintClock, type FingerprintShape } from "./deptFingerprint";

/** مدة كل مشهد بالملّي ثانية، بترتيب المشاهد الثمانية. */
export const TERM_FILM_DURATIONS = [3600, 4800, 6400, 5200, 5200, 4800, 6200, 6000] as const;

/** مفاتيح المشاهد بترتيبها. المشهد الذي لا بيانات له يسقط من الفيلم. «thanks» هو الختام. */
export const TERM_FILM_SCENES = ["title", "build", "week", "wishes", "clash", "students", "delivery", "thanks"] as const;
export type TermFilmSceneKey = typeof TERM_FILM_SCENES[number];

/** أشرطة الوقت في شبكة الأسبوع: من الثامنة إلى الثامنة مساءً، ساعتان لكل شريط. */
export const TERM_FILM_BANDS = [480, 600, 720, 840, 960, 1080] as const;
const BAND_MINUTES = 120;
const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface TermFilmRowLike {
  AdCourseId?: number | string;
  SCode?: string;
  AdInstructorId?: number | string;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
  fstarttime?: string;
  fendtime?: string;
}

export interface TermFilmBuild {
  sections: number;
  courses: number;
  teachers: number;
  weeklyHours: number;
  /** خمسة أيام × ستة أشرطة: كم شعبةً تقع في كل خانة. */
  week: number[][];
  /** خريطة الأسبوع ساعةً ساعة، لمشهد «أسبوعك في لقطة». */
  map: TermFilmWeekMap;
}

/**
 * خريطة الأسبوع: خمسة أيام × ساعات المدى، وكم محاضرةً تجري في كل ساعة. لا قاعة
 * فيها ولا مقرر ولا أستاذ: أعدادٌ وأوقات فقط.
 */
export interface TermFilmWeekMap {
  /** أول ساعةٍ وآخر ساعةٍ في الخريطة (بالدقائق من منتصف الليل). */
  from: number;
  to: number;
  hours: number[][];
  /** كم محاضرةً في كل يوم (الموعد المكرّر يُعدّ مرةً واحدة). */
  perDay: number[];
  lectures: number;
  /** بداية أبكر محاضرة ونهاية آخر محاضرة في الأسبوع؛ `null` بلا مواعيد. */
  earliest: number | null;
  latest: number | null;
}

const WEEK_DEFAULT = { from: 480, to: 1200 } as const;

function weekMapFromTimed(timed: ReadonlyArray<{ day: number; start: number; end: number }>): TermFilmWeekMap {
  const earliest = timed.length ? Math.min(...timed.map(t => t.start)) : null;
  const latest = timed.length ? Math.max(...timed.map(t => t.end)) : null;
  const from = earliest == null ? WEEK_DEFAULT.from : Math.min(WEEK_DEFAULT.from, Math.floor(earliest / 60) * 60);
  const to = latest == null ? WEEK_DEFAULT.to : Math.max(from + 360, Math.ceil(latest / 60) * 60);
  const count = Math.max(1, Math.round((to - from) / 60));
  const hours = DAY_KEYS.map(() => Array.from({ length: count }, () => 0));
  const perDay = DAY_KEYS.map(() => 0);
  for (const t of timed) {
    perDay[t.day] += 1;
    for (let h = 0; h < count; h += 1) {
      const at = from + h * 60;
      if (t.start < at + 60 && t.end > at) hours[t.day][h] += 1;
    }
  }
  return { from, to, hours, perDay, lectures: timed.length, earliest, latest };
}

/** خريطة أسبوع القسم من صفوف جدوله. الصف المكرّر (اليوم والوقت والمقرر والشعبة أنفسها) يُعدّ مرةً واحدة. */
export function weekMapFromRows(rows: TermFilmRowLike[]): TermFilmWeekMap {
  const seen = new Set<string>();
  const timed: Array<{ day: number; start: number; end: number }> = [];
  for (const row of rows) {
    const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    DAY_KEYS.forEach((key, day) => {
      if (!row[key]) return;
      const id = `${day}|${start}|${end}|${Number(row.AdCourseId || 0)}|${String(row.SCode || "").trim()}`;
      if (seen.has(id)) return;
      seen.add(id);
      timed.push({ day, start, end });
    });
  }
  return weekMapFromTimed(timed);
}

/** يجمع خرائط أسابيع الأقسام في خريطة الكلية على مدًى واحد. */
export function mergeWeekMaps(maps: TermFilmWeekMap[]): TermFilmWeekMap {
  const live = maps.filter(map => map.lectures > 0);
  if (!live.length) return weekMapFromTimed([]);
  const from = Math.min(...live.map(map => map.from)), to = Math.max(...live.map(map => map.to));
  const count = Math.max(1, Math.round((to - from) / 60));
  const hours = DAY_KEYS.map(() => Array.from({ length: count }, () => 0));
  const perDay = DAY_KEYS.map(() => 0);
  for (const map of live) {
    const offset = Math.round((map.from - from) / 60);
    map.hours.forEach((day, d) => day.forEach((value, h) => { hours[d][h + offset] += Number(value) || 0; }));
    map.perDay.forEach((value, d) => { perDay[d] += Number(value) || 0; });
  }
  return {
    from, to, hours, perDay, lectures: live.reduce((s, map) => s + map.lectures, 0),
    earliest: Math.min(...live.map(map => map.earliest ?? Infinity)), latest: Math.max(...live.map(map => map.latest ?? -Infinity)),
  };
}

/**
 * خلفيةٌ مجرّدة من حِمل الأسبوع وحده، حين لا تُحمل بصمة القسم (نسخة الكلية، أو
 * قسمٌ بلا قاعات): كل حلقةٍ مستوًى من الازدحام، وقوسُها الساعاتُ التي بلغته.
 * لا قاعة فيها أصلاً، فلا اسم يُكشف. حتميّة: الخريطة نفسها تعطي الشكل نفسه.
 */
export function weekContourShape(map: Pick<TermFilmWeekMap, "from" | "to" | "hours">, levels = 7): FingerprintShape {
  const top = Math.max(0, ...map.hours.flat());
  const rings = Math.max(0, Math.min(levels, top));
  const halls: FingerprintShape["halls"] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const threshold = Math.max(1, Math.ceil((top * (ring + 1)) / rings));
    const slots: FingerprintShape["halls"][number]["slots"] = [];
    map.hours.forEach((day, d) => {
      let open = -1;
      for (let h = 0; h <= day.length; h += 1) {
        const inside = h < day.length && day[h] >= threshold;
        if (inside && open < 0) open = h;
        if (!inside && open >= 0) {
          const peak = Math.max(...day.slice(open, h));
          slots.push({ day: d, start: map.from + open * 60, end: map.from + h * 60, fill: Math.round((peak / top) * 100) / 100, over: false });
          open = -1;
        }
      }
    });
    if (slots.length) halls.push({ slots });
  }
  return { halls, span: { from: map.from, to: map.to }, hours: map.hours.map(day => [...day]) };
}

const minutesOf = (value?: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

/** الشعب والمقررات والأساتذة وساعات الأسبوع، وشكلُ الأسبوع. */
export function buildFromRows(rows: TermFilmRowLike[], placeholderInstructorIds: Set<number> = new Set()): TermFilmBuild {
  const sections = new Set<string>(), courses = new Set<number>(), teachers = new Set<number>();
  const week = DAY_KEYS.map(() => TERM_FILM_BANDS.map(() => 0));
  let minutes = 0;
  for (const row of rows) {
    const course = Number(row.AdCourseId || 0);
    if (course) {
      courses.add(course);
      sections.add(`${course}:${String(row.SCode || "").trim()}`);
    }
    const teacher = Number(row.AdInstructorId || 0);
    if (teacher && !placeholderInstructorIds.has(teacher)) teachers.add(teacher);
    const start = minutesOf(row.fstarttime), end = minutesOf(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    DAY_KEYS.forEach((key, day) => {
      if (!row[key]) return;
      minutes += end - start;
      TERM_FILM_BANDS.forEach((band, slot) => {
        if (start < band + BAND_MINUTES && end > band) week[day][slot] += 1;
      });
    });
  }
  return { sections: sections.size, courses: courses.size, teachers: teachers.size, weeklyHours: Math.round(minutes / 60), week, map: weekMapFromRows(rows) };
}

/** يجمع شبكات أسابيع الأقسام في شبكة الكلية. */
export function mergeWeeks(weeks: number[][][]): number[][] {
  const out = DAY_KEYS.map(() => TERM_FILM_BANDS.map(() => 0));
  for (const week of weeks) week.forEach((day, d) => day.forEach((value, s) => { out[d][s] += Number(value) || 0; }));
  return out;
}

export interface TermFilmRequestLike {
  AdInstructorId?: number | string;
  status?: string;
  items?: Array<{ decision?: { state?: string; cancelled?: boolean } }>;
}

export interface TermFilmWishes {
  fixed: number;
  rejected: number;
  /** نسبة ما ثُبّت من البنود التي قُرّر فيها. */
  pct: number;
  asked: number;
  replied: number;
}

/**
 * رغبات الأساتذة: بنود طلباتهم التي قرّر فيها القسم، كم منها ثُبّت كما طُلب.
 * البند المعلّق لا يُعدّ في المقام، والطلب المستبدَل بطلبٍ أحدث لا يُعدّ أصلاً.
 * يعيد `null` حين لا قرار واحداً بعد — فيسقط المشهد.
 */
export function wishesFromRequests(requests: TermFilmRequestLike[]): TermFilmWishes | null {
  const live = requests.filter(request => request.status !== "superseded");
  let fixed = 0, rejected = 0;
  const asked = new Set<number>(), replied = new Set<number>();
  for (const request of live) {
    const who = Number(request.AdInstructorId || 0);
    if (who) asked.add(who);
    if (who && request.status && request.status !== "sent") replied.add(who);
    for (const item of request.items || []) {
      const decision = item.decision;
      if (!decision || decision.cancelled) continue;
      if (decision.state === "fixed") fixed += 1;
      else if (decision.state === "rejected") rejected += 1;
    }
  }
  if (!fixed && !rejected) return null;
  return { fixed, rejected, pct: Math.round((fixed / (fixed + rejected)) * 100), asked: asked.size, replied: replied.size };
}

export function mergeWishes(list: Array<TermFilmWishes | null>): TermFilmWishes | null {
  const present = list.filter(Boolean) as TermFilmWishes[];
  if (!present.length) return null;
  const fixed = present.reduce((s, w) => s + w.fixed, 0), rejected = present.reduce((s, w) => s + w.rejected, 0);
  return {
    fixed, rejected, pct: Math.round((fixed / Math.max(1, fixed + rejected)) * 100),
    asked: present.reduce((s, w) => s + w.asked, 0), replied: present.reduce((s, w) => s + w.replied, 0),
  };
}

export interface TermFilmClash {
  /** أعلى عدد موانع ظهر في نسخ الجدول المحفوظة هذا الفصل (أو الآن إن كان أعلى). */
  peak: number;
  /** ما بقي الآن. */
  now: number;
  versions: number;
}

/** من أعلى عدد موانع في النسخ المحفوظة إلى ما بقي الآن. */
export function clashFromCounts(versionCounts: number[], now: number): TermFilmClash {
  const peak = Math.max(now, 0, ...versionCounts);
  return { peak, now: Math.max(0, now), versions: versionCounts.length };
}

export interface TermFilmApprovalLike {
  status?: string;
  signatures?: Array<{ stage?: string; at?: string }>;
  rounds?: Array<{ number?: number; submittedAt?: string; returnedAt?: string; acceptedAt?: string; amendment?: boolean }>;
  extensionUntil?: string;
}

export interface TermFilmStep {
  label: string;
  state: "done" | "pending";
  text: string;
}

export interface TermFilmDelivery {
  final: boolean;
  steps: TermFilmStep[];
  /** الجملة الكبيرة تحت الخطوات. */
  headline: string;
  /** كم يوماً قبل الموعد كان أول إرسال (سالبٌ للتأخر، و`null` بلا موعد أو بلا إرسال). */
  daysEarly: number | null;
  firstSubmittedAt?: string;
  acceptedAt?: string;
}

const dayOf = (value?: string) => (value ? String(value).slice(0, 10) : "");
const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);

export function shortDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", timeZone: "Asia/Kuwait" }).format(date);
}

const ORDINAL_ROUND = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"];

/** «قبل الموعد بثلاثة أيام» / «في يوم الموعد» / `null` إن تأخّر أو لا موعد. */
export function earlyPhrase(daysEarly: number | null): string | null {
  if (daysEarly == null || daysEarly < 0) return null;
  if (daysEarly === 0) return "في يوم الموعد";
  return `قبل الموعد ${daysEarly === 1 ? "بيوم" : daysEarly === 2 ? "بيومين" : `بـ${countOf(daysEarly, AR.day)}`}`;
}

/**
 * خطوات التسليم كما جرت: توقيع اللجنة، توقيع رئيس القسم، الإرسال، اعتماد
 * التسجيل. ما لم يقع بعد يظهر «بانتظار …»، ولا يُقال «اعتُمد» إلا والحالة
 * «معتمد» فعلاً.
 */
export function deliveryFromApproval(approval: TermFilmApprovalLike | null | undefined, termDeadline?: string): TermFilmDelivery {
  const status = approval?.status || "drafting";
  /* النهائي وتاريخه من المصدر الواحد الذي يقرؤه ختم الاعتماد أيضاً (src/utils/approvalSeal.ts). */
  const acceptance = finalAcceptance(approval);
  const final = acceptance.final;
  const sig = (stage: string) => (approval?.signatures || []).find(item => item.stage === stage);
  const rounds = (approval?.rounds || []).filter(round => !round.amendment);
  const allRounds = approval?.rounds || [];
  const firstSubmittedAt = rounds.find(round => round.submittedAt)?.submittedAt;
  const accepted = acceptance.acceptedAt ? { number: acceptance.round, acceptedAt: acceptance.acceptedAt } : undefined;
  const committee = sig("committee"), head = sig("head");
  const committeeDone = Boolean(committee) || ["committee", "head", "submitted", "returned", "accepted"].includes(status);
  const headDone = Boolean(head) || ["head", "submitted", "returned", "accepted"].includes(status);
  const returnedCount = allRounds.filter(round => round.returnedAt).length;
  const steps: TermFilmStep[] = [
    { label: "لجنة الجدول", state: committeeDone ? "done" : "pending", text: committeeDone ? `وقّعت${committee?.at ? ` · ${shortDate(committee.at)}` : ""}` : "بانتظار التوقيع" },
    { label: "رئيس القسم", state: headDone ? "done" : "pending", text: headDone ? `وقّع${head?.at ? ` · ${shortDate(head.at)}` : ""}` : "بانتظار التوقيع" },
    { label: "الإرسال إلى التسجيل", state: firstSubmittedAt ? "done" : "pending", text: firstSubmittedAt ? `أُرسل · ${shortDate(firstSubmittedAt)}` : "بانتظار الإرسال" },
    {
      label: "التسجيل",
      state: final ? "done" : "pending",
      text: final
        ? (accepted?.number && accepted.number <= 6 && !returnedCount ? `اعتمد من الجولة ${ORDINAL_ROUND[accepted.number]}` : `اعتمد${accepted?.acceptedAt ? ` · ${shortDate(accepted.acceptedAt)}` : ""}`)
        : status === "returned" ? "أعاده بملاحظات" : "بانتظار الاعتماد النهائي",
    },
  ];
  /* الموعدُ الفعلي كما في سير الاعتماد: الأبعدُ من موعد الفصل والتمديد، فلا يقصّر التمديدُ موعداً أُجِّل بعده. */
  const deadline = dayOf(effectiveSubmissionDate(termDeadline, approval?.extensionUntil));
  const daysEarly = deadline && firstSubmittedAt ? daysBetween(dayOf(firstSubmittedAt), deadline) : null;
  const early = earlyPhrase(daysEarly);
  const headline = final
    ? (early ? `سلّمنا ${early}` : "اعتُمد جدولنا نهائياً")
    : "حتى الآن · بانتظار الاعتماد النهائي";
  return { final, steps, headline, daysEarly, firstSubmittedAt, acceptedAt: accepted?.acceptedAt };
}

/* ── الفيلم كما يصل إلى الشاشة ───────────────────────────────────────────── */

export interface TermFilmTrioItem { value: number; label: string }

export interface TermFilmData {
  version: "dept" | "dean";
  final: boolean;
  termName: string;
  scopeName: string;
  collegeName: string;
  title: [string, string];
  build: { eyebrow: string; trio: TermFilmTrioItem[]; week: number[][] } | null;
  /** «أسبوعك في لقطة»: خريطة الأسبوع ساعةً ساعة وأرقامها. يسقط المشهد بلا مواعيد. */
  week: TermFilmWeekScene | null;
  wishes: { eyebrow: string; pct: number; caption: string } | null;
  clash: { eyebrow: string; from: number; to: number; caption: string } | null;
  students: { eyebrow: string; count: number; caption: string } | null;
  delivery: { eyebrow: string; rows: Array<{ label: string; text: string; state: "done" | "pending" }>; headline: string };
  thanks: [string, string];
  /** الختام: اسم القسم (أو الكلية) والفصل وأعداده الحقيقية، تحت شعار بصمته. */
  closing: { name: string; term: string; line: string; counts: TermFilmTrioItem[] };
  /**
   * شكل بصمة القسم مجرّداً من كل نص، خلفيةً للمسرح وشعاراً للختام. لا يُحمل إلا
   * لمن يرى البصمة؛ وغيابه يجعل الشاشة ترسم خلفيةً من حِمل الأسبوع وحده.
   */
  backdrop: FingerprintShape | null;
  /** ختم الاعتماد في الختام (FR-DSH-037): لنسخة القسم حين يعتمد التسجيل جدوله نهائياً، وإلا `null`. */
  seal?: { term: string; date: string } | null;
  generatedAt: string;
}

export interface TermFilmWeekFact { value: string; label: string }
export interface TermFilmWeekScene {
  eyebrow: string;
  from: number;
  to: number;
  hours: number[][];
  perDay: number[];
  days: string[];
  facts: TermFilmWeekFact[];
}

/** مشهد الأسبوع من خريطته: أكثر الأيام ازدحاماً، وبداية أول محاضرة، ونهاية آخر محاضرة. */
export function weekScene(map: TermFilmWeekMap, eyebrow: string): TermFilmWeekScene | null {
  if (!map.lectures || map.earliest == null || map.latest == null) return null;
  const busiest = map.perDay.reduce((best, value, day) => (value > map.perDay[best] ? day : best), 0);
  return {
    eyebrow,
    from: map.from, to: map.to, hours: map.hours, perDay: map.perDay,
    days: [...FINGERPRINT_DAYS],
    facts: [
      { value: FINGERPRINT_DAYS[busiest], label: `أكثر الأيام ازدحاماً · ${countOf(map.perDay[busiest], AR.lecture)}` },
      { value: fingerprintClock(map.earliest), label: "بداية أول محاضرة" },
      { value: fingerprintClock(map.latest), label: "نهاية آخر محاضرة" },
    ],
  };
}

const join = (parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");

export interface DeptFilmInput {
  termName: string;
  sectionName: string;
  collegeName: string;
  build: TermFilmBuild;
  wishes: TermFilmWishes | null;
  clash: TermFilmClash | null;
  students: number;
  delivery: TermFilmDelivery;
  now?: Date;
}

export function deptFilm(input: DeptFilmInput): TermFilmData {
  const { build, wishes, clash, delivery } = input;
  const final = delivery.final;
  const scope = input.sectionName ? `قسم ${input.sectionName.replace(/^قسم\s+/, "")}` : "القسم";
  return {
    version: "dept",
    final,
    termName: input.termName,
    scopeName: scope,
    collegeName: input.collegeName,
    title: [join([input.termName, scope]), final ? "كيف بُني جدولنا" : "كيف يُبنى جدولنا · حتى الآن"],
    build: build.sections ? {
      eyebrow: final ? "من فصلٍ فارغ" : "من فصلٍ فارغ إلى اليوم",
      trio: [
        { value: build.sections, label: nounFor(build.sections, AR.section) },
        ...(build.weeklyHours ? [{ value: build.weeklyHours, label: `${nounFor(build.weeklyHours, AR.hour)} في الأسبوع` }] : []),
        ...(build.teachers ? [{ value: build.teachers, label: nounFor(build.teachers, AR.instructor) }] : []),
      ],
      week: build.week,
    } : null,
    week: weekScene(build.map, "أسبوعك في لقطة"),
    wishes: wishes ? {
      eyebrow: "رغبات الأساتذة",
      pct: wishes.pct,
      caption: join([
        `من الرغبات التي قُرّر فيها ثُبّتت كما طُلبت (${wishes.fixed} من ${wishes.fixed + wishes.rejected})`,
        wishes.asked ? `ردّ ${wishes.replied} من ${countOf(wishes.asked, AR.instructor)}` : null,
      ]),
    } : null,
    clash: clash && (clash.peak || clash.versions) ? {
      eyebrow: "التعارضات المانعة",
      from: clash.peak,
      to: clash.now,
      caption: clash.peak === 0
        ? "لم يظهر تعارضٌ مانع في أيّ نسخةٍ محفوظة من الجدول"
        : clash.now === 0
          ? `أعلى ما ظهر في نسخ الجدول المحفوظة ${countOf(clash.peak, AR.conflict)}، ولم يبقَ منها شيء`
          : clash.now >= clash.peak
            ? `ما بقي حتى الآن: ${countOf(clash.now, AR.conflict)}، ويُعالَج قبل الاعتماد`
            : `أعلى ما ظهر ${countOf(clash.peak, AR.conflict)}، وبقي منها ${countOf(clash.now, AR.conflict)} حتى الآن`,
    } : null,
    students: input.students ? {
      eyebrow: "طلبتنا",
      count: input.students,
      caption: `${nounFor(input.students, AR.student)} أوصلوا احتياجهم إلى القسم عبر «مساري»`,
    } : null,
    delivery: { eyebrow: "التسليم", rows: delivery.steps.map(step => ({ label: step.label, text: step.text, state: step.state })), headline: delivery.headline },
    thanks: [
      final ? "شكراً لكل من بنى هذا الجدول" : "شكراً لكل من يبني هذا الجدول",
      join(["لجنة الجدول", build.teachers ? countOf(build.teachers, AR.instructor) : null, input.students ? countOf(input.students, AR.student) : null]),
    ],
    closing: {
      name: scope,
      term: input.termName,
      line: final ? "شكراً لكل من بنى هذا الجدول" : "شكراً لكل من يبني هذا الجدول",
      counts: [
        ...(build.sections ? [{ value: build.sections, label: nounFor(build.sections, AR.section) }] : []),
        ...(build.teachers ? [{ value: build.teachers, label: nounFor(build.teachers, AR.instructor) }] : []),
        ...(input.students ? [{ value: input.students, label: nounFor(input.students, AR.student) }] : []),
      ],
    },
    backdrop: null,
    seal: final ? { term: input.termName, date: sealDateLabel(delivery.acceptedAt) } : null,
    generatedAt: (input.now || new Date()).toISOString(),
  };
}

export interface DeanDepartmentInput {
  sectionName: string;
  build: TermFilmBuild;
  wishes: TermFilmWishes | null;
  clash: TermFilmClash | null;
  students: number;
  delivery: TermFilmDelivery;
}

export function deanFilm(input: {
  termName: string; collegeName: string; departments: DeanDepartmentInput[]; now?: Date;
  /** طلبةُ الكلية بلا تكرار (اتحادُ بصماتهم): طالبٌ أرسل لقسمين يُعدّ مرةً واحدة. غائبٌ: مجموعُ الأقسام. */
  studentsTotal?: number;
}): TermFilmData {
  const departments = input.departments.filter(dep => dep.build.sections > 0);
  const total = departments.length;
  const acceptedCount = departments.filter(dep => dep.delivery.final).length;
  const final = total > 0 && acceptedCount === total;
  const sum = (pick: (dep: DeanDepartmentInput) => number) => departments.reduce((s, dep) => s + pick(dep), 0);
  const sections = sum(dep => dep.build.sections);
  const teachers = sum(dep => dep.build.teachers);
  const students = input.studentsTotal ?? sum(dep => dep.students);
  const wishes = mergeWishes(departments.map(dep => dep.wishes));
  const clashes = departments.map(dep => dep.clash).filter(Boolean) as TermFilmClash[];
  const peak = clashes.reduce((s, c) => s + c.peak, 0), now = clashes.reduce((s, c) => s + c.now, 0);
  const college = input.collegeName ? `كلية ${input.collegeName.replace(/^كلية\s+/, "")}` : "الكلية";
  const firsts = departments
    .filter(dep => dep.delivery.firstSubmittedAt)
    .sort((a, b) => String(a.delivery.firstSubmittedAt).localeCompare(String(b.delivery.firstSubmittedAt)))
    .slice(0, 3);
  const pendingRows = departments.filter(dep => !dep.delivery.firstSubmittedAt).length;
  return {
    version: "dean",
    final,
    termName: input.termName,
    scopeName: college,
    collegeName: input.collegeName,
    title: [join([input.termName, college]), final ? "كيف بُنيت جداول الكلية" : "كيف تُبنى جداول الكلية · حتى الآن"],
    build: sections ? {
      eyebrow: "من فصلٍ فارغ",
      trio: [
        { value: total, label: nounFor(total, AR.department) },
        { value: sections, label: nounFor(sections, AR.section) },
        ...(teachers ? [{ value: teachers, label: nounFor(teachers, AR.instructor) }] : []),
      ],
      week: mergeWeeks(departments.map(dep => dep.build.week)),
    } : null,
    week: weekScene(mergeWeekMaps(departments.map(dep => dep.build.map)), "أسبوع الكلية في لقطة"),
    wishes: wishes ? {
      eyebrow: "رغبات الأساتذة",
      pct: wishes.pct,
      caption: `من رغبات أساتذة الكلية التي قُرّر فيها ثُبّتت كما طُلبت (${wishes.fixed} من ${wishes.fixed + wishes.rejected})`,
    } : null,
    clash: clashes.length ? {
      eyebrow: "التعارضات المانعة",
      from: peak,
      to: now,
      caption: peak === 0
        ? "لم يظهر تعارضٌ مانع في نسخ جداول الأقسام المحفوظة"
        : now === 0 ? `${countOf(peak, AR.conflict)} في أعلى نسخ الأقسام، ولم يبقَ منها شيء`
          : now >= peak ? `ما بقي في الأقسام حتى الآن: ${countOf(now, AR.conflict)}`
          : `${countOf(peak, AR.conflict)} في أعلى نسخ الأقسام، وبقي منها ${countOf(now, AR.conflict)} حتى الآن`,
    } : null,
    students: students ? {
      eyebrow: "طلبة الكلية",
      count: students,
      caption: `${nounFor(students, AR.student)} أوصلوا احتياجهم إلى أقسامهم عبر «مساري»`,
    } : null,
    delivery: {
      eyebrow: firsts.length ? "أول من سلّم" : "التسليم",
      rows: firsts.length
        ? firsts.map((dep): { label: string; text: string; state: "done" | "pending" } => ({
          label: `قسم ${dep.sectionName.replace(/^قسم\s+/, "")}`,
          text: earlyPhrase(dep.delivery.daysEarly) || `أُرسل · ${shortDate(dep.delivery.firstSubmittedAt)}`,
          state: "done" as const,
        })).concat(pendingRows ? [{ label: "لم يُرسل بعد", text: countOf(pendingRows, AR.department), state: "pending" as const }] : [])
        : [{ label: "الأقسام", text: "لم يُرسل قسمٌ جدوله بعد", state: "pending" as const }],
      headline: final
        ? `${countOf(total, AR.department)} اعتُمدت جداولها`
        : `اعتُمد ${acceptedCount} من ${countOf(total, AR.department)} حتى الآن`,
    },
    thanks: [
      final ? "شكراً لأقسام الكلية ولجانها" : "شكراً لأقسام الكلية ولجانها على ما أنجزت",
      join([countOf(total, AR.department), teachers ? countOf(teachers, AR.instructor) : null, students ? countOf(students, AR.student) : null]),
    ],
    closing: {
      name: college,
      term: input.termName,
      line: final ? "شكراً لأقسام الكلية ولجانها" : "شكراً لأقسام الكلية ولجانها على ما أنجزت",
      counts: [
        ...(total ? [{ value: total, label: nounFor(total, AR.department) }] : []),
        ...(teachers ? [{ value: teachers, label: nounFor(teachers, AR.instructor) }] : []),
        ...(students ? [{ value: students, label: nounFor(students, AR.student) }] : []),
      ],
    },
    backdrop: null,
    generatedAt: (input.now || new Date()).toISOString(),
  };
}

/** المشاهد التي لها بيانات، بترتيبها، مع مدة كلٍّ منها. */
export function filmScenes(film: TermFilmData): Array<{ key: TermFilmSceneKey; duration: number }> {
  return TERM_FILM_SCENES.map((key, index) => ({ key, duration: TERM_FILM_DURATIONS[index] }))
    .filter(scene => scene.key === "title" || scene.key === "delivery" || scene.key === "thanks" || Boolean((film as any)[scene.key]));
}

/** رابط الفيلم الذي ينسخه صاحبه ويرسله بيده. لا يحمل إلا أرقام النطاق. */
export function termFilmPath(params: { version: "dept" | "dean"; collegeId: number; sectionId?: number; termId: number }): string {
  const query = new URLSearchParams({ v: params.version, college: String(params.collegeId), term: String(params.termId) });
  if (params.version === "dept" && params.sectionId) query.set("section", String(params.sectionId));
  return `/FSchedule/TermFilm?${query.toString()}`;
}

/** من يرى الفيلم: أصحاب الجدول (اللجنة ورئيس القسم)، والعميد ومساعده لنسخة الكلية. الأستاذ لا يراه. */
export const TERM_FILM_DEPT_ROLES = ["committeeChair", "departmentHead", "standard"] as const;
export const TERM_FILM_DEAN_ROLES = ["dean", "viceDean"] as const;

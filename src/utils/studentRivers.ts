/**
 * ── حركة الطلبة: من يمشي بين المباني عند تبدّل المحاضرات (نقيّ بلا React ولا three.js) ──
 *
 * يبني على مسارات التنقّل (movementPaths): لكل دفعةٍ (شعب المستوى نفسه في الصحيفة نفسها بالرمز
 * نفسه) ولكل أستاذ، كل انتقالٍ بين محاضرتين متتاليتين تبدأ ثانيتهما خلال نافذةٍ قصيرة بعد انتهاء
 * الأولى. ثم يجمع الانتقالات التي تعبر بين مبنيين (أو بين طابقين في المبنى نفسه) عند الوقت نفسه
 * تقريباً في «نهرٍ» واحد:
 *  - الاتجاه والوقت دقيقان من الجدول (الأساتذة بأعيانهم، والدفعات من صحائف الخطة)؛
 *  - أما السماكة فتقدير: النظام لا يعرف أي طالبٍ في أي شعبة، فيُقدَّر المنتقلون بسعة المقرر
 *    لكل شعبة (التقدير نفسه الذي يستعمله نبض القاعات)، والأصغر من الشعبتين، والواجهة تقول «تقدير».
 *
 * لا هويات طلبة هنا أصلاً (لا توجد في النظام)، ولا يكتب شيئاً.
 */
import { clockText, type Assignment, type PulseDay, type PulseLayout, type PulseModel } from "./hallPulse";
import { buildPaths, type CohortInput, type Hop, type MovePath } from "./movementPaths";
import { AR, countOf } from "./arabicCount";

/* ── العتبات (ثوابت مسمّاة) ── */
/** انتقالٌ يُعدّ «بين محاضرتين» إن بدأت التالية خلال هذا بعد انتهاء السابقة. */
export const RIVER_GAP_MAX_MIN = 30;
/** انتقالاتٌ للزوج نفسه من المباني تنتهي محاضرتها الأولى خلال هذا تُجمع في نهرٍ واحد. */
export const RIVER_CLUSTER_MIN = 15;
/** النهر ينتفخ قبل التبدّل بهذا، ويبلغ أشدّه حتى بدء التالية (بحدٍّ أقصى)، ثم يخبو بعدها بهذا. */
export const SWELL_LEAD_MIN = 3;
export const SWELL_PLATEAU_MAX_MIN = 12;
export const SWELL_TAIL_MIN = 4;
/** أثرٌ خافت للنهر بين التبدّلات: يُرى المجرى ولا يُظنّ أن فيه أحداً. */
export const RIVER_GHOST = 0.07;
/** عددٌ من الطلبة يُعدّ عنده الممرّ مزدحماً (أشدّ لون وأعرض سماكة). */
export const RIVER_CROWDED_STUDENTS = 120;

export type RiverKind = "building" | "floor";
export type RiverWho = "students" | "teachers";

export interface River {
  id: string;
  who: RiverWho;
  kind: RiverKind;
  fromBuilding: string;
  toBuilding: string;
  fromLabel: string;
  toLabel: string;
  /** الطابق الحقيقي من رمز القاعة (للنهر بين طابقين). */
  fromFloor: number;
  toFloor: number;
  /** القاعات التي يخرج منها النهر ويصبّ فيها (المشهد يرسمه من وسطها). */
  fromKeys: string[];
  toKeys: string[];
  /** بدء التبدّل: أول نهايةٍ في المجموعة. */
  at: number;
  /** آخر بدءٍ للمحاضرات التالية في المجموعة. */
  until: number;
  /** الطلبة المنتقلون، تقديراً (0 للأساتذة). */
  students: number;
  /** دفعاتٌ لم تُعرف سعة إحدى شعبتيها فلم تُحسب في التقدير. */
  unknown: number;
  cohorts: number;
  teachers: number;
}

/** تقدير من ينتقل من شعبةٍ إلى شعبة: الأصغر من سعتيهما، وإلا المعروفة منهما، وإلا لا شيء. */
export function moversEstimate(fromStudents: number | null | undefined, toStudents: number | null | undefined): number {
  const a = Number(fromStudents || 0), b = Number(toStudents || 0);
  if (a > 0 && b > 0) return Math.min(a, b);
  return a > 0 ? a : b > 0 ? b : 0;
}

/** نوع الانتقال للنهر: بين مبنيين، أو بين طابقين في المبنى نفسه، وإلا لا نهر. */
export function riverKindOf(model: PulseModel, fromKey: string, toKey: string): RiverKind | null {
  if (fromKey === toKey) return null;
  const a = model.hallByKey.get(fromKey), b = model.hallByKey.get(toKey);
  if (!a || !b) return null;
  if (a.buildingCode !== b.buildingCode) return "building";
  return a.floor !== b.floor ? "floor" : null;
}

interface Crossing { who: RiverWho; kind: RiverKind; hop: Hop; students: number; unknown: boolean }

/**
 * أنهار اليوم من مساراته. `paths` اختياري (مساراتٌ مبنية سلفاً)؛ وإلا تُبنى من الإسناد،
 * فتتبع نقلات «ماذا لو» المعاينة كما تتبعها الألوان.
 */
export function buildRivers(
  model: PulseModel, assignment: Assignment, layout: PulseLayout, day: PulseDay,
  opts: { cohorts?: readonly CohortInput[]; teachers?: boolean; paths?: readonly MovePath[] } = {},
): River[] {
  const paths = opts.paths || buildPaths(model, assignment, layout, day, {
    cohorts: opts.cohorts, instructorName: opts.teachers ? () => "" : undefined,
  });
  const crossings: Crossing[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const who: RiverWho = path.kind === "teacher" ? "teachers" : "students";
    if (who === "teachers" && !opts.teachers) continue;
    for (const hop of path.hops) {
      if (hop.gap < 0 || hop.gap > RIVER_GAP_MAX_MIN) continue;
      const kind = riverKindOf(model, hop.from.hallKey, hop.to.hallKey);
      if (!kind) continue;
      /* شعبتان بعينهما لا تُعدّان مرتين إن وقعتا في دفعتين. */
      const dedupe = `${who}|${hop.from.sessionId}|${hop.to.sessionId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const fromS = model.sessionById.get(hop.from.sessionId)?.students, toS = model.sessionById.get(hop.to.sessionId)?.students;
      const students = who === "students" ? moversEstimate(fromS, toS) : 0;
      crossings.push({ who, kind, hop, students, unknown: who === "students" && !students });
    }
  }
  const groups = new Map<string, Crossing[]>();
  for (const c of crossings) {
    const a = model.hallByKey.get(c.hop.from.hallKey)!, b = model.hallByKey.get(c.hop.to.hallKey)!;
    const key = c.kind === "building"
      ? `${c.who}|b|${a.buildingCode}|${b.buildingCode}`
      : `${c.who}|f|${a.buildingCode}|${a.floor}|${b.floor}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(c);
  }
  const out: River[] = [];
  for (const [key, list] of groups) {
    list.sort((x, y) => x.hop.from.end - y.hop.from.end || x.hop.to.start - y.hop.to.start);
    let cluster: Crossing[] = [];
    const flush = () => {
      if (!cluster.length) return;
      const first = cluster[0];
      const a = model.hallByKey.get(first.hop.from.hallKey)!, b = model.hallByKey.get(first.hop.to.hallKey)!;
      const at = Math.min(...cluster.map(c => c.hop.from.end));
      out.push({
        id: `${key}|${at}`,
        who: first.who, kind: first.kind,
        fromBuilding: a.buildingCode, toBuilding: b.buildingCode,
        fromLabel: a.buildingLabel, toLabel: b.buildingLabel,
        fromFloor: a.floor, toFloor: b.floor,
        fromKeys: [...new Set(cluster.map(c => c.hop.from.hallKey))],
        toKeys: [...new Set(cluster.map(c => c.hop.to.hallKey))],
        at,
        until: Math.max(...cluster.map(c => c.hop.to.start)),
        students: cluster.reduce((s, c) => s + c.students, 0),
        unknown: cluster.filter(c => c.unknown).length,
        cohorts: first.who === "students" ? cluster.length : 0,
        teachers: first.who === "teachers" ? cluster.length : 0,
      });
      cluster = [];
    };
    for (const c of list) {
      if (cluster.length && c.hop.from.end - cluster[0].hop.from.end > RIVER_CLUSTER_MIN) flush();
      cluster.push(c);
    }
    flush();
  }
  return out.sort((x, y) => x.at - y.at || y.students - x.students || x.id.localeCompare(y.id));
}

const smooth = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };

/**
 * شدّة النهر 0–1 عند الدقيقة: يعلو قبل التبدّل، ويبقى في أشدّه حتى بدء التالية (بحدٍّ أقصى)،
 * ثم يخبو. خارج ذلك صفر (والمشهد يرسم أثراً خافتاً RIVER_GHOST).
 */
export function riverSwell(river: Pick<River, "at" | "until">, minute: number): number {
  const rise0 = river.at - SWELL_LEAD_MIN;
  const hold = Math.max(river.at, Math.min(river.until, river.at + SWELL_PLATEAU_MAX_MIN));
  if (minute <= rise0 || minute >= hold + SWELL_TAIL_MIN) return 0;
  if (minute < river.at) return smooth((minute - rise0) / SWELL_LEAD_MIN);
  if (minute <= hold) return 1;
  return 1 - smooth((minute - hold) / SWELL_TAIL_MIN);
}

/** الحمل 0–1: كم يقترب الممرّ من الزحام (اللون من الهادئ إلى المزدحم). */
export function riverLoad(students: number): number {
  return Math.max(0, Math.min(1, Number(students || 0) / RIVER_CROWDED_STUDENTS));
}

/** لون النهر للقائمة المسطّحة (والمشهد يلوّن بالدرجات نفسها): نعناعيٌّ هادئ ← كهرماني ← مرجانيٌّ مزدحم. */
export function riverCss(load: number): string {
  const stops = [[0x6f, 0xf0, 0xd0], [0xff, 0xc8, 0x61], [0xff, 0x6f, 0x61]];
  const t = Math.max(0, Math.min(1, load));
  const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t / 0.5] : [stops[1], stops[2], (t - 0.5) / 0.5];
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

/** نصف قطر النهر في وحدات المشهد (القاعة 2.6): الجذر فلا يبتلع النهر الكبير ما حوله. */
export function riverWidth(river: Pick<River, "who" | "kind" | "students">): number {
  if (river.who === "teachers") return 0.035;
  const w = 0.07 + 0.38 * Math.sqrt(riverLoad(river.students));
  return river.kind === "floor" ? w * 0.6 : w;
}

/**
 * أزحم معبر: بين المباني أولاً (ثم بين الطوابق إن لم يكن غيره). مع الدقيقة: أزحم نهرٍ جارٍ الآن
 * (live)، وإلا أزحم نهر اليوم.
 */
export function busiestCrossing(rivers: readonly River[], minute?: number): { river: River; live: boolean } | null {
  const students = rivers.filter(r => r.who === "students" && r.students > 0);
  const pool = students.some(r => r.kind === "building") ? students.filter(r => r.kind === "building") : students;
  if (!pool.length) return null;
  const top = (list: readonly River[]) => list.reduce((best, r) => (r.students > best.students || (r.students === best.students && r.at < best.at) ? r : best));
  if (minute != null) {
    const live = pool.filter(r => riverSwell(r, minute) > 0.25);
    if (live.length) return { river: top(live), live: true };
  }
  return { river: top(pool), live: false };
}

/** «أزحم الممرات اليوم»: حركة الطلبة الأعرض أولاً. */
export function busiestRivers(rivers: readonly River[], limit = 8): River[] {
  return rivers.filter(r => r.who === "students" && r.students > 0)
    .sort((a, b) => b.students - a.students || a.at - b.at || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export const floorName = (floor: number) => (floor <= 0 ? "الأرضي" : `الطابق ${floor}`);

/** «مبنى 1 ← مبنى 3» أو «مبنى 2: الأرضي ← الطابق 2». */
export function riverRoute(river: Pick<River, "kind" | "fromLabel" | "toLabel" | "fromFloor" | "toFloor">): string {
  return river.kind === "building"
    ? `${river.fromLabel} ← ${river.toLabel}`
    : `${river.fromLabel}: ${floorName(river.fromFloor)} ← ${floorName(river.toFloor)}`;
}

/** «نحو 30 طالباً»؛ والمثنّى بعد «نحو» مجرور: «نحو طالبَين». */
export function aboutStudents(n: number): string {
  return Math.round(n) === 2 ? "نحو طالبَين" : `نحو ${countOf(n, AR.student)}`;
}

/** لافتة المعبر: «نحو 120 طالباً · مبنى 1 ← مبنى 3 · 10:50». */
export function riverLabel(river: River): string {
  return `${aboutStudents(river.students)} · ${riverRoute(river)} · ${clockText(river.at)}`;
}

export interface TagRect { left: number; top: number; width: number; height: number }

/**
 * موضع لافتة المعبر داخل المسرح: المرساة (x, y) قمة القوس، واللافتة فوقها وفي وسطها، ثم تُحصر
 * داخل المسرح بهامش، وتُزاح تحت ما يغطّيها (أزرار التقريب، وشريط العرض، وشريط «ماذا لو») أو بجانبه.
 */
export function clampTagBox(input: {
  x: number; y: number; w: number; h: number; W: number; H: number; margin?: number; avoid?: readonly TagRect[];
}): { left: number; top: number } {
  const m = input.margin ?? 10;
  const clampX = (v: number) => Math.max(m, Math.min(input.W - m - input.w, v));
  const clampY = (v: number) => Math.max(m, Math.min(input.H - m - input.h, v));
  let left = clampX(input.x - input.w / 2), top = clampY(input.y - input.h);
  const hits = (r: TagRect) => left < r.left + r.width + m && left + input.w > r.left - m && top < r.top + r.height + m && top + input.h > r.top - m;
  for (let pass = 0; pass < 3; pass++) {
    const r = (input.avoid || []).find(hits);
    if (!r) break;
    const below = r.top + r.height + m;
    if (below + input.h <= input.H - m) { top = below; continue; }
    /* لا مكان تحته: إلى الجانب الأوسع منه. */
    const leftRoom = r.left - m, rightRoom = input.W - (r.left + r.width) - m;
    left = clampX(rightRoom >= leftRoom ? r.left + r.width + m : r.left - m - input.w);
  }
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * من يرى الأنهار: من يرى مسارات التنقّل نفسها — ورشة القسم (رئيس اللجنة ورئيس القسم) والعميد.
 * لا عدسة التقارير، ولا الأستاذ ولا الطالب.
 */
export const riversAllowed = (context: string | undefined) => context === "workshop" || context === "dean";

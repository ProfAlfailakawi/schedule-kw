/**
 * ── حماية الخريجين: مقرراتُ خريجي البرنامج الواحد لا تتعارض ─────────────────────────
 *
 * تقرير الخريجين (وحدات متبقية 1–30) يقول لكل مقرر: كم خريجاً من كل برنامج (BA-xxxx) يحتاجه.
 * مقرران يحتاجهما خريجو البرنامج نفسه يتعارضان «تعارضاً لا مفرّ منه» حين تتداخل كلُّ شعبةٍ من
 * الأول مع كلّ شعبةٍ من الثاني في المسار نفسه (بنين/بنات): لا جدول يجمعهما للخريج.
 * الأثر = مجموع min(خريجي البرنامج في الأول، في الثاني) على البرامج المشتركة.
 *
 * وقبل الحفظ: يُقرأ الجدولُ بالموعد الجديد مكان القديم، فما ظهر من تعارضٍ جديد يُقال «يمسّ N خريجاً»
 * ملاحظةً لا تمنع (قرار المالك: التنبيهات الليّنة لا تمنع الحفظ أبداً).
 */
import type { DemandMatch, DemandReport } from "./actualDemand";

const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export interface ClashRow {
  id?: number; AdCourseId: number; AdCollegeId: number; SCode: string; fstarttime: string; fendtime: string;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
}
export interface ClashMember { collegeId: number; track: "boys" | "girls" | "" }
export interface GraduateClash {
  a: { code: string; name: string };
  b: { code: string; name: string };
  track: "boys" | "girls" | "";
  graduates: number;
  programs: string[];
}

const minutes = (clock: string) => { const [h, m] = String(clock || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (Number(m) || 0) : NaN; };
const on = (row: ClashRow, day: typeof DAYS[number]) => { const value = (row as any)[day]; return value === true || value === 1 || value === "1" || value === "true"; };
function meetingsOverlap(a: ClashRow, b: ClashRow): boolean {
  const [as, ae, bs, be] = [minutes(a.fstarttime), minutes(a.fendtime), minutes(b.fstarttime), minutes(b.fendtime)];
  if (![as, ae, bs, be].every(Number.isFinite)) return false;
  return DAYS.some(day => on(a, day) && on(b, day)) && as < be && bs < ae;
}

/** شعبُ مقررٍ في مسار: كل شعبة (كلية + رمز) بمواعيدها. */
function sectionsOf(rows: readonly ClashRow[], courseIds: ReadonlySet<number>, colleges: ReadonlySet<number>): ClashRow[][] {
  const map = new Map<string, ClashRow[]>();
  for (const row of rows) {
    if (!courseIds.has(Number(row.AdCourseId)) || !colleges.has(Number(row.AdCollegeId))) continue;
    const key = `${Number(row.AdCollegeId)}|${String(row.SCode || "").trim()}`;
    map.set(key, [...(map.get(key) || []), row]);
  }
  return [...map.values()];
}
const sectionsClash = (x: ClashRow[], y: ClashRow[]) => x.some(a => y.some(b => meetingsOverlap(a, b)));

/** التعارضات التي لا مفرّ منها بين مقررات خريجي البرنامج الواحد، الأكثر أثراً أولاً. */
export function graduateClashes(input: {
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  members: readonly ClashMember[];
  rows: readonly ClashRow[];
}): GraduateClash[] {
  if (!input.graduates) return [];
  const tracked = input.members.some(member => member.track);
  const tracks: Array<"boys" | "girls" | ""> = tracked ? ["boys", "girls"] : [""];
  const courses = input.graduates.courses.filter(course => {
    const match = input.matches.get(course.code);
    return match && match.courseIds.length && (match.status === "matched" || match.status === "linked") && course.programs.length;
  });
  const out: GraduateClash[] = [];
  for (const track of tracks) {
    const colleges = new Set(input.members.filter(member => !tracked || member.track === track).map(member => member.collegeId));
    const side = (value: { boys: number; girls: number; total: number }) => track === "boys" ? value.boys : track === "girls" ? value.girls : value.total;
    const sections = new Map(courses.map(course => [course.code, sectionsOf(input.rows, new Set(input.matches.get(course.code)!.courseIds), colleges)] as const));
    for (let i = 0; i < courses.length; i++) for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i], b = courses[j];
      const sa = sections.get(a.code)!, sb = sections.get(b.code)!;
      if (!sa.length || !sb.length || !sa.every(x => sb.every(y => sectionsClash(x, y)))) continue;
      const byCode = new Map(b.programs.map(program => [program.code, program] as const));
      let graduates = 0;
      const programs: string[] = [];
      for (const program of a.programs) {
        const other = byCode.get(program.code);
        if (!other) continue;
        const shared = Math.min(side(program), side(other));
        if (shared > 0) { graduates += shared; programs.push(program.code); }
      }
      if (graduates > 0) out.push({ a: { code: a.code, name: a.name }, b: { code: b.code, name: b.name }, track, graduates, programs });
    }
  }
  return out.sort((x, y) => y.graduates - x.graduates);
}

const pairKey = (clash: GraduateClash) => `${clash.track}|${[clash.a.code, clash.b.code].sort().join("|")}`;

/**
 * أثرُ حفظ موعدٍ على الخريجين: التعارضاتُ الجديدة التي يصنعها (الموعد المعدَّل مكان أصله).
 * لا يمنع شيئاً؛ يُرجع العدد والمقررات ليقولها المحرّر قبل الحفظ.
 */
export function graduateImpactOf(input: {
  graduates: DemandReport | null;
  matches: ReadonlyMap<string, DemandMatch>;
  members: readonly ClashMember[];
  rows: readonly ClashRow[];
  candidate: ClashRow;
  replaces?: number;
}): { graduates: number; clashes: GraduateClash[] } | null {
  if (!input.graduates) return null;
  const before = graduateClashes(input);
  const after = graduateClashes({ ...input, rows: [...input.rows.filter(row => !input.replaces || Number(row.id) !== Number(input.replaces)), input.candidate] });
  const known = new Set(before.map(pairKey));
  const fresh = after.filter(clash => !known.has(pairKey(clash)));
  if (!fresh.length) return null;
  return { graduates: fresh.reduce((sum, clash) => sum + clash.graduates, 0), clashes: fresh };
}

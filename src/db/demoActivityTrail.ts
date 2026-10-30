/**
 * ── «👣 الأثر» في البيئة التجريبية: أسبوعُ عملٍ محكيّ لكل فريق ───────────────────
 *
 * سطورٌ بالشكل الذي يكتبه الخادم (src/server/activityTrail.ts)، على حسابات الصندوق نفسها:
 * لجنةُ الجدول برئيستها وعضوين، والإرشادُ بعضو، ورئيسُ القسم، ورئيسُ تسجيل الكلية بموظفة،
 * والمسجّلُ العام بموظفة، وموظفُ التسجيل بحسابه. فتُرى ورقةُ «الأثر» لكل صفةٍ كما قرّر المالك:
 * العميد يرى رئيسَ القسم وحده، ورئيسُ القسم يرى اللجنةَ والإرشاد، والمسجّلُ العام يرى رؤساءَ التسجيل…
 *
 * والأسماءُ هنا أسماءٌ أولى وهمية، لا أشخاصَ حقيقيين. وسطرٌ من فصلٍ أقدم من السابق يبقى خارج المدة.
 */
import type { AcademicRole } from "../utils/academicRoles";
import { currentTermId, sortTermsNewest } from "../utils/termSequence";
import { AR, countOf } from "../utils/arabicCount";
import { trailPersonKey, trailPersonTermKey, trailTeamKey, type ActivityTrailEntry, type TrailArea, type TrailKind } from "../utils/activityTrail";

interface DemoRow { id: number; AdCourseName?: string; SCode?: string | number; fstarttime?: string; fendtime?: string; AdRoomCode?: string; AdRoomHall?: string }

type Seed = [hoursAgo: number, u: number, m: string, who: string, kind: TrailKind, area: TrailArea, target: string, side?: { before?: string; after?: string; detail?: string; row?: number }, termShift?: number];

export function demoActivityTrail(input: {
  terms: Array<{ AdTermId?: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number; AdTermClosed?: boolean }>;
  rows: DemoRow[];
  collegeId: number;
  sectionId: number;
  seats: Record<number, { name: string; role: AcademicRole }>;
  now?: number;
}): ActivityTrailEntry[] {
  const now = input.now ?? Date.now();
  const ordered = sortTermsNewest(input.terms);
  const current = currentTermId(input.terms, now);
  const index = ordered.findIndex(term => Number(term.AdTermId) === current);
  const previous = Number(ordered[index + 1]?.AdTermId || 0);
  const older = Number(ordered[index + 2]?.AdTermId || 0);
  const row = (n: number) => input.rows[n] || input.rows[0];
  const label = (r: DemoRow | undefined) => `${r?.AdCourseName || "موعد"} · ش${r?.SCode ?? ""}`;
  const time = (r: DemoRow | undefined) => `${String(r?.fstarttime || "").slice(0, 5)}–${String(r?.fendtime || "").slice(0, 5)}`;
  const room = (r: DemoRow | undefined) => `${r?.AdRoomCode || ""}/${r?.AdRoomHall || ""}`;
  const M = { sara: "demo-m-sara", khaled: "demo-m-khaled", reem: "demo-m-reem", huda: "demo-m-huda", lulwa: "demo-m-lulwa" };
  const seeds: Seed[] = [
    /* لجنة الجدول (16): الرئيسة وعضوان */
    [0.4, 16, "h", "د. منى", "edit", "schedule", label(row(2)), { before: "12:30–13:45", after: time(row(2)), detail: `الوقت 12:30–13:45 ← ${time(row(2))}`, row: row(2).id }],
    [1.6, 16, M.sara, "سارة", "add", "schedule", label(row(5)), { after: `${time(row(5))} · ${room(row(5))}`, row: row(5).id }],
    [3.2, 16, M.khaled, "خالد", "delete", "schedule", label(row(9)), { before: `${time(row(9))} · ${room(row(9))}` }],
    [5.5, 16, M.sara, "سارة", "edit", "schedule", label(row(7)), { before: "901A02/204", after: room(row(7)), detail: `القاعة 901A02/204 ← ${room(row(7))}`, row: row(7).id }],
    [25, 16, "h", "د. منى", "send", "approval", "إرسالٌ إلى التسجيل", { detail: "إرسال جدول القسم إلى التسجيل — الجولة 1" }],
    [26, 16, "h", "د. منى", "approve", "approval", "توقيع الجدول", { detail: "توقيع رئيس لجنة الجدول" }],
    [29, 16, M.khaled, "خالد", "edit", "schedule", label(row(11)), { before: "د. أحمد", after: "د. هند", detail: "الأستاذ د. أحمد ← د. هند", row: row(11).id }],
    [49, 16, M.sara, "سارة", "add", "schedule", label(row(13)), { after: `${time(row(13))} · ${room(row(13))}`, row: row(13).id }],
    [74, 16, M.khaled, "خالد", "edit", "schedule", label(row(15)), { before: "الأحد الثلاثاء", after: "الاثنين الأربعاء", detail: "الأيام الأحد، الثلاثاء ← الاثنين، الأربعاء", row: row(15).id }],
    [98, 16, "h", "د. منى", "add", "team", "عضو في الفريق", { detail: "عضو لجنة جديد: سارة" }],
    [400, 16, "h", "د. منى", "send", "approval", "إرسالٌ إلى التسجيل", { detail: "جدول الفصل السابق — الجولة 2" }, 1],
    /* الإرشاد (19): المرشدة وعضوةٌ معها */
    [2.4, 19, "h", "أ. نورة", "add", "advising", "طلب شعبة · مدخل إلى تكنولوجيا التعليم", { after: `${countOf(18, AR.student)} · صباحي` }],
    [27, 19, M.reem, "ريم", "add", "advising", "مقاعد المرشد · " + label(row(4)), { after: `+${countOf(3, AR.seat)}` }],
    [122, 19, "h", "أ. نورة", "delete", "advising", "طلب شعبة · الحاسوب في التعليم", { detail: "سُحب الطلب" }],
    /* رئيس القسم (15) */
    [24, 15, "h", "د. فهد", "approve", "approval", "توقيع الجدول", { detail: "توقيع رئيس القسم العلمي" }],
    [52, 15, "h", "د. فهد", "add", "approval", "ملاحظة", { detail: "ملاحظة على القاعة — " + label(row(3)) }],
    /* رئيس تسجيل الكلية (22) وموظفته */
    [0.9, 22, "h", "أ. يوسف", "approve", "approval", "قبول الجدول", { detail: "قبول جدول قسم تكنولوجيا التعليم نهائياً — الجولة 1" }],
    [4, 22, M.huda, "هدى", "register", "registration", "كشف التسجيل · " + (row(6).AdCourseName || "مقرر"), { after: "سُجّل" }],
    [8, 22, M.huda, "هدى", "register", "registration", "كشف التسجيل · " + (row(8).AdCourseName || "مقرر"), { after: "رُدّ" }],
    [70, 22, "h", "أ. يوسف", "send", "approval", "إرجاعٌ إلى القسم", { detail: `إرجاع الجدول للقسم مع ${countOf(2, AR.note)}` }],
    /* المسجّل العام (13) وموظفته */
    [6, 13, "h", "أ. بدر", "edit", "approval", "مواعيد الفصل", { before: "—", after: "موعد التسليم بعد أسبوع" }],
    [30, 13, M.lulwa, "لولوة", "register", "registration", "كشف المتبقي", { detail: "رفع كشف المتبقي للفصل" }],
    [96, 13, "h", "أ. بدر", "handover", "team", "تسليم الرئاسة", { detail: "رئيس تسجيل الكلية: أ. يوسف" }],
    /* موظف التسجيل (14) بحسابه */
    [7, 14, "h", "أ. موظف التسجيل", "register", "registration", "كشف التسجيل · " + (row(10).AdCourseName || "مقرر"), { after: "سُجّل" }],
    /* أقدمُ من المدة: لا يظهر لأحد */
    [2400, 16, "h", "د. منى", "edit", "schedule", "موعدٌ قديم", { detail: "من فصلٍ أقدم من السابق" }, 2],
  ];
  return seeds.flatMap(([hoursAgo, u, m, who, kind, area, target, side = {}, termShift = 0], n): ActivityTrailEntry[] => {
    const term = termShift === 2 ? older : termShift === 1 ? previous : current;
    if (!term || !input.seats[u]) return [];
    const person = trailPersonKey(u, m === "h" ? undefined : m);
    const entry: ActivityTrailEntry = {
      id: `demo-trail-${n + 1}`,
      at: new Date(now - hoursAgo * 3_600_000).toISOString(),
      term, team: trailTeamKey(u, term), person: trailPersonTermKey(person, term),
      u, m, dk: m === "h" ? "holder" : "member", who, seat: input.seats[u].name, role: input.seats[u].role,
      kind, area, target, c: input.collegeId, s: input.sectionId,
    };
    if (side.before) entry.before = side.before;
    if (side.after) entry.after = side.after;
    if (side.detail) entry.detail = side.detail;
    if (side.row) entry.row = side.row;
    return [entry];
  }).sort((a, b) => b.at.localeCompare(a.at));
}

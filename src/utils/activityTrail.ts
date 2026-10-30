/**
 * ── «👣 الأثر»: من فعل ماذا (docs/OWNER_FEEDBACK_2026-10-30.md، الملاحظة 9) ──────────
 *
 * سجلٌّ للقراءة فقط بكل ما *غيّر* شيئاً — إضافة، تعديل، حذف، اعتماد، تسجيل، إرسال، تسليم —
 * ولا يُكتب فيه فتحٌ ولا اطّلاع. والمدةُ الفصلُ الجاري والذي قبله.
 *
 * هذا الملف حسابٌ صرف يقرؤه الخادم والواجهة معاً:
 *   ١) أنواعُ الحركة وأيقوناتُها وألوانُها؛
 *   ٢) جدولُ مسارات الكتابة التي تُسجَّل (وما سواها لا يُسجَّل أبداً)؛
 *   ٣) من يرى ماذا — قرارُ المالك بحرفه، مترجَماً إلى الصفات والفرق القائمة؛
 *   ٤) المدة: الفصلُ الجاري والسابق له.
 *
 * والحارسُ الحقيقيّ هو الخادم: الواجهةُ لا تُرسَل إليها إلا الحركاتُ التي يحقّ لها رؤيتها.
 */
import { roleDefinition, type AcademicRole } from "./academicRoles";

/* ── ١) الحركة ─────────────────────────────────────────────────────────── */

export type TrailKind = "add" | "edit" | "delete" | "approve" | "register" | "send" | "handover";
export type TrailArea = "schedule" | "advising" | "registration" | "approval" | "requests" | "team";

export const TRAIL_KINDS: TrailKind[] = ["add", "edit", "delete", "approve", "register", "send", "handover"];

export const TRAIL_KIND_META: Record<TrailKind, { icon: string; label: string; tone: "good" | "info" | "danger" | "accent" | "violet" | "warn" | "teal" }> = {
  add: { icon: "➕", label: "إضافة", tone: "good" },
  edit: { icon: "✏️", label: "تعديل", tone: "info" },
  delete: { icon: "🗑️", label: "حذف", tone: "danger" },
  approve: { icon: "✅", label: "اعتماد", tone: "accent" },
  register: { icon: "📝", label: "تسجيل", tone: "violet" },
  send: { icon: "📤", label: "إرسال", tone: "warn" },
  handover: { icon: "🤝", label: "تسليم", tone: "teal" },
};

export const isTrailKind = (value: unknown): value is TrailKind => typeof value === "string" && (TRAIL_KINDS as string[]).includes(value);

/** من في الجلسة حين وقعت الحركة: رئيسُ الفريق، أو عضوٌ فيه، أو نائبٌ، أو حسابٌ بلا فريق مسجّل. */
export type TrailActorKind = "holder" | "member" | "deputy" | "account";

/**
 * حركةٌ واحدة كما تُحفظ. خفيفةٌ عمداً: سطرٌ لا وثيقة، فلا تُثقل القراءة.
 *
 * مفاتيحُ القراءة ثلاثة، ولكلٍّ فهرسٌ مع `at` (firestore.indexes.json):
 *   team   = `${u}:${term}`        كلُّ ما جرى على حساب الفريق في الفصل (رئيسُه وأعضاؤه)؛
 *   person = `${u}~${m}:${term}`   ما فعله شخصٌ واحد؛
 *   term                          كلُّ شيء في الفصل (مدير النظام وحده).
 * و`row` لبصمة «آخر تعديل» على الموعد.
 */
export interface ActivityTrailEntry {
  id: string;
  at: string;
  /** الفصلُ التشغيلي يوم وقعت الحركة — لا فصلُ ما عُدّل: بناءُ الفصل القادم يجري في الجاري. */
  term: number;
  team: string;
  person: string;
  /** حسابُ من فعل (SystemUserId). */
  u: number;
  /** الفريقُ الذي وقعت فيه الحركة إن كان غيرَ فريق الفاعل: تسليمُ رئاسة فريقٍ أو إضافةُ عضوٍ إليه
   *  بيد مدير النظام أو المسجّل العام تُقرأ في أثر ذلك الفريق نفسه. */
  tu?: number;
  /** العضو: معرّفُه في الفريق؛ و"h" لرئيس الفريق أو لحسابٍ بلا فريق. */
  m: string;
  dk: TrailActorKind;
  who: string;
  seat: string;
  role: AcademicRole | "admin";
  kind: TrailKind;
  area: TrailArea;
  target: string;
  detail?: string;
  before?: string;
  after?: string;
  c?: number;
  s?: number;
  /** فصلُ ما عُدّل، إن عُرف. */
  t?: number;
  row?: number;
}

export const TRAIL_TEXT = { target: 90, detail: 220, side: 90, who: 80, seat: 120 } as const;
export const clipTrail = (value: unknown, max: number): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export const trailPersonKey = (userId: number, memberId?: string) => `${Number(userId)}~${memberId || "h"}`;
export const trailTeamKey = (userId: number, term: number) => `${Number(userId)}:${Number(term)}`;
export const trailPersonTermKey = (personKey: string, term: number) => `${personKey}:${Number(term)}`;

/* ── ٢) ما يُسجَّل ─────────────────────────────────────────────────────────
 *
 * قائمةٌ مغلقة بمسارات الكتابة. ما ليس فيها لا يُسجَّل — فلا يصل السجلَّ «فتحٌ» ولا «اطّلاع»،
 * ولا طلبٌ بـPOST يحسب ولا يكتب (فحصُ التعارض، المعاينة، الاقتراح)، ولا تبديلُ الصفة، ولا
 * تفضيلاتُ الجهاز. المسارُ نسبيٌّ إلى /api كما يراه الوسيط.
 */
export interface TrailRouteRule { method: "POST" | "PUT" | "PATCH" | "DELETE"; path: RegExp; kind: TrailKind; area: TrailArea; label: string }

const ID = "[^/]+";
const rx = (body: string) => new RegExp(`^${body.replace(/:id/g, ID)}$`);
const rule = (method: TrailRouteRule["method"], path: string, kind: TrailKind, area: TrailArea, label: string): TrailRouteRule =>
  ({ method, path: rx(path), kind, area, label });

export const TRAIL_ROUTES: TrailRouteRule[] = [
  /* الجدول */
  rule("POST", "/schedules", "add", "schedule", "موعد"),
  rule("PUT", "/schedules/\\d+", "edit", "schedule", "موعد"),
  rule("DELETE", "/schedules/\\d+", "delete", "schedule", "موعد"),
  rule("POST", "/schedules/apply-proposal", "edit", "schedule", "اقتراحٌ في الجدول"),
  rule("POST", "/schedules/copy", "add", "schedule", "نسخ الجدول"),
  rule("POST", "/schedules/move-batch", "edit", "schedule", "نقل مواعيد"),
  rule("POST", "/schedules/wipe-scope", "delete", "schedule", "مسح الجدول"),
  rule("POST", "/schedules/wipe-scope/restore", "add", "schedule", "إرجاع الجدول"),
  rule("POST", "/schedules/\\d+/exceptions", "edit", "schedule", "استثناء أسبوع"),
  rule("DELETE", "/schedules/\\d+/exceptions/:id", "delete", "schedule", "استثناء أسبوع"),
  rule("POST", "/schedules/(?:replace-instructor|placeholder-action|ta-conversion)", "edit", "schedule", "أستاذ الموعد"),
  rule("POST", "/schedules/import", "add", "schedule", "استيراد الجدول"),
  rule("PUT", "/schedules/section-gap/decisions", "edit", "schedule", "قرار تخطيط"),
  rule("POST", "/section-build/apply", "add", "schedule", "بناء الشعب"),
  rule("POST", "/section-build/review-rows", "edit", "schedule", "بناء الشعب"),
  rule("POST", "/section-build/undo", "delete", "schedule", "بناء الشعب"),
  rule("POST", "/intelligence/drafts/:id/publish", "send", "schedule", "نشر مسوّدة"),
  rule("POST", "/intelligence/versions/:id/restore", "edit", "schedule", "استرجاع نسخة"),
  rule("POST", "/time-machine/scenarios/:id/(?:apply|restore)", "edit", "schedule", "سيناريو آلة الزمن"),
  rule("PUT", "/course-offering", "edit", "schedule", "حالة الطرح"),
  rule("POST", "/course-reach/open", "edit", "schedule", "حالة الطرح"),
  rule("POST", "/ta-phase/(?:allowed|open|close)", "edit", "schedule", "مرحلة التدريب"),
  /* الملاحظات والاعتماد */
  rule("POST", "/schedule-notes", "add", "approval", "ملاحظة"),
  rule("POST", "/schedule-notes/:id/rebut", "edit", "approval", "ردٌّ على ملاحظة"),
  rule("POST", "/schedule-notes/:id/verdict", "approve", "approval", "حكمٌ على ملاحظة"),
  rule("DELETE", "/schedule-notes/:id", "delete", "approval", "ملاحظة"),
  rule("POST", "/approvals/sign", "approve", "approval", "توقيع الجدول"),
  rule("POST", "/approvals/withdraw", "edit", "approval", "سحب توقيع"),
  rule("POST", "/approvals/head-return", "send", "approval", "إرجاعٌ إلى اللجنة"),
  rule("POST", "/approvals/acknowledge-additions", "approve", "approval", "إقرار الإضافات"),
  rule("POST", "/approvals/submit", "send", "approval", "إرسالٌ إلى التسجيل"),
  rule("POST", "/approvals/return", "send", "approval", "إرجاعٌ إلى القسم"),
  rule("POST", "/approvals/accept", "approve", "approval", "قبول الجدول"),
  rule("POST", "/approvals/(?:deadline|student-phases)", "edit", "approval", "مواعيد الفصل"),
  rule("POST", "/approvals/(?:extension|extensions)", "edit", "approval", "تمديد التسليم"),
  rule("POST", "/approvals/extension-request", "send", "approval", "طلب تمديد"),
  rule("POST", "/plan-sheets/publish", "send", "schedule", "نشر الصحائف"),
  rule("POST", "/plan-sheets/unpublish", "edit", "schedule", "إيقاف نشر صحيفة"),
  /* الإرشاد */
  rule("POST", "/section-requests", "add", "advising", "طلب شعبة"),
  rule("POST", "/section-requests/:id/(?:link|unlink)", "edit", "advising", "طلب شعبة"),
  rule("POST", "/section-requests/:id/decline", "edit", "advising", "طلب شعبة"),
  rule("POST", "/section-requests/:id/withdraw", "delete", "advising", "طلب شعبة"),
  rule("POST", "/section-requests/:id/approve", "approve", "advising", "طلب شعبة"),
  rule("POST", "/section-requests/:id/register", "register", "registration", "طلب شعبة"),
  rule("POST", "/advisor-seats/(?:add|exception)", "add", "advising", "مقاعد المرشد"),
  rule("PUT", "/advisor-seats/config", "edit", "advising", "مقاعد المرشد"),
  /* التسجيل */
  rule("POST", "/student-registration/:id/(?:course-state|case-state)", "register", "registration", "كشف التسجيل"),
  rule("PUT", "/registration-stats", "register", "registration", "كشف المتبقي"),
  rule("POST", "/registration-stats/(?:remaining-pdf|remaining-cells)", "register", "registration", "كشف المتبقي"),
  /* طلبات الأساتذة والمقترح الدراسي وتبادل القاعات */
  rule("POST", "/instructor-requests/issue", "send", "requests", "طلبات الأساتذة"),
  rule("POST", "/instructor-requests/:id/decide", "approve", "requests", "طلب أستاذ"),
  rule("POST", "/instructor-requests/:id/apply", "edit", "requests", "طلب أستاذ"),
  rule("POST", "/instructor-requests/:id/reply", "send", "requests", "ردٌّ على أستاذ"),
  rule("POST", "/instructor-requests/exception/revoke", "edit", "requests", "استثناء أستاذ"),
  rule("POST", "/study-proposals", "add", "requests", "مقترح دراسي"),
  rule("PUT", "/study-proposals/:id", "edit", "requests", "مقترح دراسي"),
  rule("POST", "/study-proposals/:id/send", "send", "requests", "مقترح دراسي"),
  rule("POST", "/study-proposals/:id/withdraw", "delete", "requests", "مقترح دراسي"),
  rule("POST", "/study-proposals/:id/commit", "approve", "requests", "مقترح دراسي"),
  rule("POST", "/hall-barter/requests", "add", "schedule", "تبادل قاعة"),
  rule("POST", "/hall-barter/requests/:id/respond", "approve", "schedule", "تبادل قاعة"),
  rule("POST", "/hall-barter/requests/:id/cancel", "delete", "schedule", "تبادل قاعة"),
  /* الفريق: الرئاسة والأعضاء والنائب */
  rule("POST", "/seats/\\d+/holder", "handover", "team", "رئيس الفريق"),
  rule("POST", "/seats/\\d+/handover", "handover", "team", "تسليم الرئاسة"),
  rule("POST", "/seats/\\d+/members", "add", "team", "عضو في الفريق"),
  rule("POST", "/seats/\\d+/members/:id/(?:status|scopes|link)", "edit", "team", "عضو في الفريق"),
  rule("POST", "/seats/\\d+/deputy(?:/end)?", "handover", "team", "نائب الرئيس"),
  rule("POST", "/seats/\\d+/colleges", "edit", "team", "نطاق الفريق"),
  rule("POST", "/seats/(?:college-registrar|college-registrars/all)", "add", "team", "فريق تسجيل"),
];

export function classifyTrailRoute(method: string, path: string): TrailRouteRule | null {
  const verb = String(method || "").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return null;
  const clean = String(path || "").replace(/\/+$/, "") || "/";
  return TRAIL_ROUTES.find(item => item.method === verb && item.path.test(clean)) || null;
}

/* ── ٣) من يرى ماذا ────────────────────────────────────────────────────────
 *
 * قرارُ المالك:
 *   العميد ← العميدُ المساعد ورؤساءُ الأقسام فقط (لا من تحت رئيس القسم)
 *   العميد المساعد ← لا شيء
 *   رئيس القسم ← حركةُ الإرشاد والجدول في قسمه مع فرقهم
 *   رئيس لجنة الجدول / رئيس الإرشاد / رئيس التسجيل ← فريقُه
 *   المسجّل العام ← رؤساءُ التسجيل وكلُّ فرقهم
 *   عميد القبول والتسجيل ← المسجّلُ العام ورؤساءُ التسجيل وفرقُهم
 *   العضو ← حركاتُه هو فقط
 *
 * والترجمة إلى ما في النظام (src/utils/academicRoles.ts وsrc/utils/seats.ts): «الفريق» حسابٌ واحد
 * برئيسه وأعضائه، فرؤيةُ الفريق رؤيةُ كلِّ ما جرى على ذلك الحساب. ورئيسُ الإرشاد هو حسابُ «مرشد القسم»،
 * ورئيسُ التسجيل «رئيس تسجيل الكلية»، وعميدُ القبول والتسجيل «عميد التسجيل».
 */
export interface TrailSeat { userId: number; role: AcademicRole; colleges: number[]; sections: string[] }
export interface TrailViewer {
  userId: number;
  isAdmin: boolean;
  /** صفةُ الحساب نفسه (لا صفةُ العضو العاملة): ما يُسأل عنه هو موضعُ الفريق في الكلية. */
  seatRole: AcademicRole;
  kind: TrailActorKind;
  memberId?: string;
  colleges: number[];
  sections: string[];
}

export type TrailAudience =
  | { mode: "none" }
  | { mode: "all" }
  | { mode: "scoped"; label: "self" | "team" | "department" | "dean" | "registrar"; teams: number[]; holders: number[]; persons: string[]; hideHolder?: number };

const uniq = <T,>(values: T[]) => [...new Set(values)];

export function scopeSets(scopes: ReadonlyArray<{ AdCollegeId: number; AdSectionId: number }>): { colleges: number[]; sections: string[] } {
  const colleges = uniq(scopes.map(row => Number(row.AdCollegeId)).filter(Boolean));
  const sections = uniq(scopes.filter(row => Number(row.AdSectionId) > 0).map(row => `${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`));
  return { colleges, sections };
}

export function trailAudience(viewer: TrailViewer, seats: readonly TrailSeat[]): TrailAudience {
  const audience = baseAudience(viewer, seats);
  /* قرار المالك: النائبُ يرى الفريقَ وحركاتِه هو، ولا يرى حركاتِ الرئيس نفسه. */
  return viewer.kind === "deputy" && audience.mode === "scoped" ? { ...audience, hideHolder: viewer.userId } : audience;
}

function baseAudience(viewer: TrailViewer, seats: readonly TrailSeat[]): TrailAudience {
  if (viewer.isAdmin) return { mode: "all" };
  const self = trailPersonKey(viewer.userId, viewer.kind === "member" || viewer.kind === "deputy" ? viewer.memberId : undefined);
  /* العضو حركاتُه هو فقط، أيّاً كان فريقُه. والنائبُ يعمل بصفة الرئيس فيرى ما يراه — إلا حركاتِ الرئيس (trailAudience). */
  if (viewer.kind === "member") return { mode: "scoped", label: "self", teams: [], holders: [], persons: [self] };
  const role = roleDefinition(viewer.seatRole).id;
  const others = seats.filter(seat => seat.userId !== viewer.userId);
  const ofRole = (...roles: AcademicRole[]) => others.filter(seat => roles.includes(seat.role));
  const viewerColleges = new Set(viewer.colleges);
  const viewerSections = new Set(viewer.sections);
  switch (role) {
    case "viceDean":
      return { mode: "none" };
    case "dean": {
      const inCollege = ofRole("viceDean", "departmentHead").filter(seat => seat.colleges.some(id => viewerColleges.has(id)));
      return { mode: "scoped", label: "dean", teams: [], holders: inCollege.map(seat => seat.userId), persons: [] };
    }
    case "departmentHead": {
      const inDepartment = ofRole("committeeChair", "advisor").filter(seat => seat.sections.some(key => viewerSections.has(key)));
      return { mode: "scoped", label: "department", teams: uniq([viewer.userId, ...inDepartment.map(seat => seat.userId)]), holders: [], persons: [] };
    }
    case "committeeChair":
    case "advisor":
    case "collegeRegistrar":
      return { mode: "scoped", label: "team", teams: [viewer.userId], holders: [], persons: [] };
    case "registrarHead":
      return { mode: "scoped", label: "registrar", teams: uniq([viewer.userId, ...ofRole("collegeRegistrar").map(seat => seat.userId)]), holders: [], persons: [] };
    case "registrarDean":
      return { mode: "scoped", label: "registrar", teams: uniq(ofRole("registrarHead", "collegeRegistrar").map(seat => seat.userId)), holders: [], persons: [] };
    default:
      /* موظفُ التسجيل بحسابٍ مستقل، والمستخدمُ العادي: حركاتُه هو. */
      return { mode: "scoped", label: "self", teams: [], holders: [], persons: [self] };
  }
}

/** هل تقع هذه الحركة في ما يراه هذا القارئ؟ الحكمُ نفسه الذي تُبنى عليه القراءة، يُعاد على كل سطرٍ قبل أن يُرسل. */
export function trailEntryVisible(audience: TrailAudience, entry: Pick<ActivityTrailEntry, "u" | "m" | "dk" | "tu">): boolean {
  if (audience.mode === "all") return true;
  if (audience.mode === "none") return false;
  if (audience.hideHolder && Number(entry.u) === audience.hideHolder && entry.m === "h") return false;
  if (audience.teams.includes(Number(entry.tu || entry.u))) return true;
  if (audience.holders.includes(Number(entry.u)) && (entry.m === "h" || entry.dk === "deputy")) return true;
  return audience.persons.includes(trailPersonKey(entry.u, entry.m === "h" ? undefined : entry.m));
}

/** مفاتيحُ القراءة لقارئٍ في فصلٍ واحد — كلُّ مفتاحٍ سؤالٌ مفهرسٌ واحد. */
export function trailReadKeys(audience: TrailAudience, terms: number[]): Array<{ field: "team" | "person" | "term"; value: string | number }> {
  if (audience.mode === "none") return [];
  if (audience.mode === "all") return terms.map(term => ({ field: "term" as const, value: term }));
  return terms.flatMap(term => [
    ...audience.teams.map(id => ({ field: "team" as const, value: trailTeamKey(id, term) })),
    /* رئيسُ القسم ونائبُه: يُقرأ فريقُه كلُّه (صغيرٌ: بلا أعضاء عادةً) ثم يُصفّى بـtrailEntryVisible —
       فحركةُ النائب، وهي تحت مفتاح عضويته، لا تسقط من أثر العميد. */
    ...audience.holders.map(id => ({ field: "team" as const, value: trailTeamKey(id, term) })),
    ...audience.persons.map(key => ({ field: "person" as const, value: trailPersonTermKey(key, term) })),
  ]);
}

/**
 * مرشّحُ الشخص على الخادم: يُسأل مفتاحُ ذلك الشخص نفسه (لا الصفحةُ الأولى من الفريق)، فلا يغيب عنه
 * ما بعد حدّ الصفحة. ولا يُسأل إلا إن كان الشخصُ في ما يراه القارئ — وإلا فلا مفتاح.
 */
export function trailPersonFilterKeys(audience: TrailAudience, terms: number[], person: string): Array<{ field: "person"; value: string }> {
  const match = /^(\d+)~([^:~]+)$/.exec(String(person || ""));
  if (!match || audience.mode === "none") return [];
  const u = Number(match[1]), m = match[2];
  const reachable = audience.mode === "all"
    || trailEntryVisible(audience, { u, m, dk: m === "h" ? "holder" : "member" })
    || trailEntryVisible(audience, { u, m, dk: "deputy" });
  return reachable ? terms.map(term => ({ field: "person" as const, value: trailPersonTermKey(person, term) })) : [];
}

/* ── ٤) المدة: الفصلُ الجاري والسابق له ───────────────────────────────── */

export function trailPeriod(orderedNewest: ReadonlyArray<{ AdTermId?: number; AdTermName?: string }>, currentId: number): { current: { id: number; name: string } | null; previous: { id: number; name: string } | null } {
  const index = orderedNewest.findIndex(term => Number(term.AdTermId) === Number(currentId));
  if (index < 0) return { current: null, previous: null };
  const pick = (term?: { AdTermId?: number; AdTermName?: string }) => term ? { id: Number(term.AdTermId), name: String(term.AdTermName || "") } : null;
  return { current: pick(orderedNewest[index]), previous: pick(orderedNewest[index + 1]) };
}

/* ── للواجهة: الزمنُ بكلمتين ───────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** «اليوم 10:20»، «أمس 10:20»، «الثلاثاء 10:20»، أو «12 أكتوبر». */
export function trailWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(now)) return `اليوم ${time}`;
  if (dayKey(at) === dayKey(yesterday)) return `أمس ${time}`;
  const days = (now.getTime() - at.getTime()) / 86_400_000;
  if (days > 0 && days < 6) return `${at.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long" })} ${time}`;
  return at.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" });
}

/** الساعةُ وحدها: «10:20» — تحت عنوان يومها في الشريط. */
export function trailClock(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : "";
}

/** عنوانُ اليوم فوق مجموعته في الشريط الزمني. */
export function trailDayLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(now)) return "اليوم";
  if (dayKey(at) === dayKey(yesterday)) return "أمس";
  return at.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
}

/** الحرفُ الأول من الاسم بعد اللقب، للوجه. */
export const trailInitial = (name: string) => String(name || "").trim().replace(/^(د|أ|م)\.\s*/, "").charAt(0) || "؟";

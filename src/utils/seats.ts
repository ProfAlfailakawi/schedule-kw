/**
 * ── الكراسي: الكرسي ثابت والشخص يتبدّل (docs/SEATS.md) ─────────────────────
 *
 * الحساب في هذا النظام كرسيّ — «رئيس لجنة الجدول — قسم الفرنسي» — لا شخص. وهذا
 * الملف يقول من يجلس عليه الآن، ومن معه في فريقه، وماذا جرى عليه عبر السنوات.
 * دوالُّه نقيّة يقرؤها الخادم والواجهة معاً، فلا يفترق ما يُعرض عمّا يُحرس.
 */
import { roleDefinition, roleLabel, type AcademicRole } from "./academicRoles";

export type SeatScope = { AdCollegeId: number; AdSectionId: number };

/** شخصٌ على الكرسي أو في فريقه: الاسمُ، ورقمُه في سجلّ الأساتذة إن كان أستاذاً، وجوالُه. */
export interface SeatPerson {
  name: string;
  instructorId?: number;
  mobile?: string;
}

export interface SeatHolder extends SeatPerson {
  since: string;
  by: string;
}

/**
 * حالةُ العضو:
 *  active — يعمل؛ frozen — جُمّد بتسليم الكرسي حتى يقرّر الشاغلُ الجديد؛ ended — انتهت عضويته.
 * و«الرابط لم يُفتح بعد» ليست حالة: هي عضوٌ active بلا firstEnteredAt.
 */
export type SeatMemberStatus = "active" | "frozen" | "ended";

export interface SeatMember extends SeatPerson {
  id: string;
  status: SeatMemberStatus;
  /** آخر أربعة أرقام من الرقم المدني — للتحقق عند فتح الرابط. لا يُحفظ الرقمُ كاملاً. */
  civilTail?: string;
  /** نطاقُ موظف التسجيل: أقسامٌ أو كلياتٌ كاملة (قسم صفر). عضوُ لجنة الجدول يعمل في نطاق الكرسي فلا نطاق له. */
  scopes?: SeatScope[];
  addedAt: string;
  addedBy: string;
  linkToken?: string;
  linkIssuedAt?: string;
  firstEnteredAt?: string;
  lastEnteredAt?: string;
  frozenAt?: string;
  endedAt?: string;
  /** محاولاتُ تحقّقٍ خاطئة على الرابط الحالي؛ تُصفَّر برابطٍ جديد. */
  failedAttempts?: number;
}

export interface SeatDeputy {
  memberId: string;
  name: string;
  /** YYYY-MM-DD — آخر يومٍ ينوب فيه. */
  until: string;
  setAt: string;
  setBy: string;
}

export type SeatEventKind =
  | "seat-created" | "seat-colleges" | "holder-set" | "handover"
  | "member-added" | "member-continued" | "member-ended" | "member-frozen" | "member-scopes"
  | "link-issued" | "link-locked" | "deputy-set" | "deputy-ended";

export interface SeatEvent {
  at: string;
  kind: SeatEventKind;
  by: string;
  detail: string;
}

export interface SeatLedger {
  id: string;
  userId: number;
  holder?: SeatHolder;
  members: SeatMember[];
  deputy?: SeatDeputy;
  history: SeatEvent[];
  updatedAt: string;
}

export interface SeatMemberLink {
  token: string;
  userId: number;
  memberId: string;
  createdAt: string;
  revokedAt?: string;
}

/** من في الجلسة الآن، كما يُحمل على req.user ويصل الواجهة. */
export interface SeatActor {
  kind: "holder" | "member" | "deputy";
  name: string;
  instructorId?: number;
  memberId?: string;
  /** اسمُ الكرسي نفسه كما في حسابه: «رئيس لجنة الجدول — قسم الفرنسي». */
  seatName: string;
  seatRole: AcademicRole;
  /** للنائب: من ينوب عنه، وحتى متى. */
  onBehalfOf?: string;
  until?: string;
}

export const SEAT_LEDGER_PREFIX = "seat_";
export const seatLedgerId = (userId: number) => `${SEAT_LEDGER_PREFIX}${Number(userId)}`;
export const emptySeatLedger = (userId: number, at = new Date().toISOString()): SeatLedger =>
  ({ id: seatLedgerId(userId), userId: Number(userId), members: [], history: [], updatedAt: at });

/** حدُّ الفريق: لجنةٌ أو مكتبٌ لا يتجاوزهما أحدٌ في الواقع، ويمنع سجلّاً ينتفخ بلا حد. */
export const SEAT_TEAM_LIMIT = 40;
/** محاولاتُ التحقق الخاطئة على رابطٍ واحد قبل أن يُقفل ويحتاج رابطاً جديداً. */
export const SEAT_LINK_MAX_ATTEMPTS = 5;
/** ما يُحفظ من التاريخ لكل كرسي: سنواتٌ من التسليمات والفرق، لا سجلٌّ بلا قاع. */
export const SEAT_HISTORY_LIMIT = 400;

/**
 * ── من له فريق، ومن أين تأتي أسماؤه ─────────────────────────────────────
 *
 * لجنةُ الجدول: أعضاؤها من أساتذة القسم، ويعملون بصفة الكرسي نفسها ولا يوقّعون.
 * المسجّلُ العام ورئيسُ تسجيل الكلية: موظفوهم يُكتبون يدوياً، ويعملون بصفة «موظف التسجيل»
 * في النطاق الذي يُحدَّد لكلٍّ منهم — داخل نطاق من أضافه.
 */
export interface SeatTeamRule {
  memberRole: AcademicRole;
  /** من أين تُختار الأسماء: أساتذةُ القسم، أو كتابةٌ يدوية. */
  source: "department" | "manual";
  /** نطاقُ العضو: نطاقُ الكرسي كما هو، أو يُحدَّد لكلّ عضو داخل الكلية، أو في أي كلية. */
  scope: "seat" | "college" | "any";
  teamLabel: string;
  memberLabel: string;
}

const TEAM_RULES: Partial<Record<AcademicRole, SeatTeamRule>> = {
  committeeChair: { memberRole: "committeeChair", source: "department", scope: "seat", teamLabel: "أعضاء لجنة الجدول", memberLabel: "عضو لجنة" },
  registrarHead: { memberRole: "registrarStaff", source: "manual", scope: "any", teamLabel: "موظفو التسجيل", memberLabel: "موظف تسجيل" },
  collegeRegistrar: { memberRole: "registrarStaff", source: "manual", scope: "college", teamLabel: "موظفو تسجيل الكلية", memberLabel: "موظف تسجيل" },
};

export function seatTeamRule(role: unknown): SeatTeamRule | null {
  return TEAM_RULES[roleDefinition(role).id] || null;
}

/** من أين يُختار الشاغل: أساتذةُ القسم، أو أساتذةُ الكلية، أو كتابةٌ يدوية. */
export function seatHolderSource(role: unknown): "department" | "college" | "manual" {
  const id = roleDefinition(role).id;
  if (id === "committeeChair" || id === "departmentHead" || id === "advisor") return "department";
  if (id === "dean" || id === "viceDean") return "college";
  return "manual";
}

/** «مستخدم عادي» ليس كرسياً: حسابٌ يُعيَّن يدوياً لا منصبٌ يُسلَّم. */
export function isSeatRole(role: unknown): boolean {
  return roleDefinition(role).id !== "standard";
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);

/** النائبُ قائمٌ حتى آخر يوم نهايته، ثم يعود كلُّ شيءٍ إلى الشاغل وحده. */
export function activeDeputy(ledger: SeatLedger | null | undefined, now = new Date()): SeatDeputy | null {
  const deputy = ledger?.deputy;
  if (!deputy || !/^\d{4}-\d{2}-\d{2}$/.test(deputy.until) || deputy.until < today(now)) return null;
  const member = ledger!.members.find(row => row.id === deputy.memberId);
  return member && member.status === "active" ? deputy : null;
}

/**
 * من في الجلسة؟ الشاغلُ إن لم تحمل الجلسةُ عضواً، وإلا العضوُ — بشرط أن يكون
 * عاملاً. `null` لعضوٍ لا يعمل: جلستُه لا تُقرأ.
 */
export function resolveSeatActor(
  user: { Name?: string; Role?: unknown; AdInstructorId?: number },
  ledger: SeatLedger | null | undefined,
  memberId: string | undefined,
  now = new Date(),
): SeatActor | null | undefined {
  const seatName = String(user.Name || "");
  const seatRole = roleDefinition(user.Role).id;
  if (memberId) {
    const member = ledger?.members.find(row => row.id === memberId);
    if (!member || member.status !== "active") return null;
    const deputy = activeDeputy(ledger, now);
    if (deputy && deputy.memberId === member.id) {
      return { kind: "deputy", name: member.name, instructorId: member.instructorId, memberId: member.id, seatName, seatRole, onBehalfOf: ledger?.holder?.name, until: deputy.until };
    }
    return { kind: "member", name: member.name, instructorId: member.instructorId, memberId: member.id, seatName, seatRole };
  }
  if (!ledger?.holder) return undefined;
  return { kind: "holder", name: ledger.holder.name, instructorId: ledger.holder.instructorId || Number(user.AdInstructorId || 0) || undefined, seatName, seatRole };
}

/** الاسمُ الذي يُكتب في السجل والتوقيع والحضور: الكرسيُّ ومن عليه. */
export function seatActorDisplayName(actor: SeatActor): string {
  const who = actor.kind === "deputy" && actor.onBehalfOf ? `${actor.name} (نائباً عن ${actor.onBehalfOf})` : actor.name;
  return actor.seatName ? `${actor.seatName} · ${who}` : who;
}

/** صفةُ العضو كما تعمل: موظفُ التسجيل يعمل بصفة «موظف التسجيل»، والنائبُ بصفة الكرسي كاملة. */
export function seatActorRole(actor: SeatActor): AcademicRole {
  if (actor.kind !== "member") return actor.seatRole;
  return seatTeamRule(actor.seatRole)?.memberRole || actor.seatRole;
}

/** كيف يُقال وصفُ الجالس تحت اسمه: «الشاغل»، «عضو لجنة»، «نائب حتى …». */
export function seatActorCaption(actor: SeatActor): string {
  if (actor.kind === "holder") return roleLabel(actor.seatRole);
  if (actor.kind === "deputy") return `نائبٌ حتى ${actor.until}`;
  return seatTeamRule(actor.seatRole)?.memberLabel || "عضو فريق";
}

/** آخر أربعة أرقامٍ من رقمٍ مدني (أو أي نصٍّ فيه أرقام)، أو "" إن قصر. */
export function civilTailOf(value: unknown): string {
  const digits = String(value ?? "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/** جوالٌ كويتيّ برقمٍ دولي لرابط واتساب: ثمانية أرقام ← 965XXXXXXXX. */
export function whatsappNumber(mobile: unknown): string {
  const digits = String(mobile ?? "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  if (/^965\d{8}$/.test(digits)) return digits;
  if (/^00965\d{8}$/.test(digits)) return digits.slice(2);
  if (/^\d{8}$/.test(digits)) return `965${digits}`;
  return "";
}

/** حالةُ العضو كما تُرسم: عاملٌ دخل، عاملٌ لم يفتح رابطه، مجمَّد، انتهى. */
export type SeatMemberBadge = "active" | "pending" | "frozen" | "ended";
export function seatMemberBadge(member: SeatMember): SeatMemberBadge {
  if (member.status === "ended") return "ended";
  if (member.status === "frozen") return "frozen";
  return member.firstEnteredAt ? "active" : "pending";
}
export const SEAT_MEMBER_BADGE_LABEL: Record<SeatMemberBadge, string> = {
  active: "فعّال",
  pending: "لم يفتح رابطه بعد",
  frozen: "مجمَّد حتى يقرّر الشاغل",
  ended: "انتهت عضويته",
};

/** هل يقع نطاقُ العضو داخل نطاق من يضيفه؟ صفرُ القسم = الكلية كلها. */
export function scopeWithin(wanted: SeatScope, allowed: { allColleges: boolean; colleges: Set<number>; sections: Set<string> }): boolean {
  if (allowed.allColleges) return true;
  if (allowed.colleges.has(Number(wanted.AdCollegeId))) return true;
  return Number(wanted.AdSectionId) > 0 && allowed.sections.has(`${Number(wanted.AdCollegeId)}:${Number(wanted.AdSectionId)}`);
}

/** يضيف حدثاً إلى تاريخ الكرسي ويقصّه من أوله إن طال. */
export function withSeatEvent(ledger: SeatLedger, event: Omit<SeatEvent, "at"> & { at?: string }): SeatLedger {
  const at = event.at || new Date().toISOString();
  const history = [...ledger.history, { ...event, at }];
  return { ...ledger, history: history.slice(-SEAT_HISTORY_LIMIT), updatedAt: at };
}

/** تسليمٌ في سجلٍّ واحد: شاغلٌ جديد، ونائبٌ يسقط، وفريقٌ عاملٌ يُجمَّد حتى يقرّر الجديد. */
export function handOverLedger(ledger: SeatLedger, holder: SeatHolder, by: string): SeatLedger {
  const at = holder.since;
  const previous = ledger.holder?.name;
  const frozen = ledger.members.filter(member => member.status === "active");
  let next: SeatLedger = {
    ...ledger,
    holder,
    deputy: undefined,
    members: ledger.members.map(member => member.status === "active" ? { ...member, status: "frozen" as const, frozenAt: at } : member),
  };
  next = withSeatEvent(next, { at, kind: "handover", by, detail: previous ? `${previous} ← ${holder.name}` : `الشاغل: ${holder.name}` });
  if (frozen.length) next = withSeatEvent(next, { at, kind: "member-frozen", by, detail: `جُمّد ${frozen.length} من الفريق حتى يقرّر الشاغل الجديد` });
  return next;
}

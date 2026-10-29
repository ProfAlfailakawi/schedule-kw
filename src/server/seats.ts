/**
 * ── الكراسي على الخادم: السجلّ، والهوية في الجلسة، وروابط الفرق (docs/SEATS.md) ──
 *
 * ثلاثة أشياء، كلٌّ في مكانه:
 *   ١) سجلُّ الكرسي (seatLedgers): يُقرأ ويُكتب ذرّياً (updateFeatureDoc)، فلا يمحو تسليمٌ عضواً أُضيف في اللحظة نفسها.
 *   ٢) الهويةُ في الجلسة (`seatIdentity`): الحسابُ يبقى الكرسيَّ نفسه — صلاحياتُه ونطاقُه — ويُكتب فوقه
 *      اسمُ من يجلس عليه الآن، فيصل السجلَّ والتوقيعَ والحضورَ بلا أن يُمسّ مسارٌ واحد منها.
 *      وعضوُ الفريق يعمل بصفة فريقه (موظف التسجيل) وفي نطاقه هو، لا بصفة الكرسي كاملةً.
 *   ٣) روابطُ الأعضاء (seatMemberLinks): رمزٌ عشوائي يُبطله رمزٌ أحدث.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Repository } from "../db/repository";
import { roleDefinition } from "../utils/academicRoles";
import {
  emptySeatLedger, resolveSeatActor, seatActorDisplayName, seatActorRole, seatLedgerId,
  type SeatActor, type SeatLedger, type SeatMemberLink, type SeatScope,
} from "../utils/seats";
import { isDemoLinkToken, DEMO_LINK_TOKEN_PREFIX } from "../utils/demoLinkToken";

export async function readSeatLedger(userId: number): Promise<SeatLedger | null> {
  return Repository.getFeatureDoc<SeatLedger>("seatLedgers", seatLedgerId(userId));
}

export async function listSeatLedgers(): Promise<SeatLedger[]> {
  return Repository.listFeatureDocs<SeatLedger>("seatLedgers");
}

/**
 * يكتب السجلَّ ذرّياً. `fn` تأخذ الحاضر (أو سجلاً فارغاً) وتُرجع الجديد، أو `{ refuse }` بسببٍ يُقال.
 * وكلُّ كتابةٍ تبلّغ ذاكرةَ الهويات، فالجلسةُ التالية تقرأ الشاغلَ والفريقَ كما صارا.
 */
export async function updateSeatLedger<R>(
  userId: number,
  fn: (current: SeatLedger) => { next: SeatLedger; result: R } | { refuse: string },
): Promise<{ ok: true; ledger: SeatLedger; result: R } | { ok: false; error: string }> {
  const out = await Repository.updateFeatureDoc<SeatLedger, R | string>("seatLedgers", seatLedgerId(userId), current => {
    const decided = fn(current ? { ...emptySeatLedger(userId), ...current } : emptySeatLedger(userId));
    if ("refuse" in decided) return { refuse: decided.refuse };
    return { next: { ...decided.next, updatedAt: new Date().toISOString() }, result: decided.result };
  });
  Repository.notifyIdentityChanged();
  if (!("next" in out)) return { ok: false, error: String(out.result) };
  return { ok: true, ledger: out.next, result: out.result as R };
}

/* ── ٢) الهويةُ في الجلسة ───────────────────────────────────────────────── */

export interface SeatIdentity {
  user: any;
  scopes: SeatScope[];
  permissions: number[];
}

/**
 * يكتب على الحساب من يجلس عليه. `null` حين تحمل الجلسةُ عضواً لم يعد يعمل
 * (انتهت عضويته، جُمّد بتسليم): جلستُه لا تُقرأ، ويُحذف أثرُها.
 *
 * الكرسيُّ بلا شاغلٍ مسجّل ولا عضوٍ في الجلسة يعود كما هو تماماً — حساباتُ اليوم
 * كلُّها هكذا حتى يُسجَّل شاغلوها، فلا يتغيّر على أحدٍ شيء يوم النشر.
 */
export async function seatIdentity(user: any, memberId: string | undefined, scopes: SeatScope[], permissions: number[]): Promise<SeatIdentity | null> {
  if (!user || user.IsAdminUser) return { user, scopes, permissions };
  const ledger = await readSeatLedger(Number(user.SystemUserId)).catch(() => null);
  const actor = resolveSeatActor(user, ledger, memberId);
  if (actor === null) return null;
  if (!actor) return { user, scopes, permissions };
  return applySeatActor(user, actor, ledger!, scopes, permissions);
}

async function applySeatActor(user: any, actor: SeatActor, ledger: SeatLedger, scopes: SeatScope[], permissions: number[]): Promise<SeatIdentity> {
  const role = seatActorRole(actor);
  const composed: any = {
    ...user,
    Name: seatActorDisplayName(actor),
    SeatName: String(user.Name || ""),
    SeatActor: actor,
    Role: role,
  };
  if (actor.kind === "holder") return { user: composed, scopes, permissions };
  /* العضوُ لا يغيّر كلمةَ سرّ الكرسي ولا يُطلب منه ذلك: البوّابةُ للشاغل وحده. */
  composed.MustChangePassword = false;
  if (actor.kind === "deputy" || role === actor.seatRole) return { user: composed, scopes, permissions };
  /* موظفُ التسجيل: شاشاتُ صفته من شاشات الكرسي، ونطاقُه ما حُدّد له داخل نطاق الكرسي. */
  const allowedForms = new Set(roleDefinition(role).formIds);
  const member = ledger.members.find(row => row.id === actor.memberId);
  return { user: composed, scopes: await expandMemberScopes(member?.scopes || [], actor.seatRole, scopes), permissions: permissions.filter(id => allowedForms.has(id)) };
}

/**
 * نطاقُ العضو يُكتب «كليةً كاملة» بقسم صفر، وصفةُ موظف التسجيل يدويةُ النطاق: الصفرُ
 * لا يُجيز لها قسماً (isScopeAllowed). فتُفرد الكليةُ أقساماً وقت قراءة الجلسة — فيلحق
 * قسمٌ أُنشئ أمس — ويبقى الحكمُ في isScopeAllowed كما هو، لا استثناء فيه.
 */
async function expandMemberScopes(scopes: SeatScope[], seatRole: unknown, seatScopes: SeatScope[]): Promise<SeatScope[]> {
  const out = new Map<string, SeatScope>();
  /* ولا يتّسع نطاقُ الموظف بعد إضافته: إن رُفع حرمٌ عن كرسيّ من أضافه سقط من نطاقه هو أيضاً. */
  const wide = roleDefinition(seatRole).scopeMode === "allColleges";
  const seatColleges = new Set(seatScopes.filter(row => !Number(row.AdSectionId)).map(row => Number(row.AdCollegeId)));
  const seatSections = new Set(seatScopes.filter(row => Number(row.AdSectionId)).map(row => `${row.AdCollegeId}:${row.AdSectionId}`));
  const inside = (row: SeatScope) => wide || seatColleges.has(Number(row.AdCollegeId)) || seatSections.has(`${row.AdCollegeId}:${row.AdSectionId}`);
  const wholeColleges = new Set(scopes.filter(row => !Number(row.AdSectionId)).map(row => Number(row.AdCollegeId)));
  if (wholeColleges.size) {
    const sections = await Repository.getSections();
    for (const section of sections as any[]) {
      if (wholeColleges.has(Number(section.AdCollegeId)) && inside({ AdCollegeId: Number(section.AdCollegeId), AdSectionId: Number(section.AdSectionId) })) out.set(`${section.AdCollegeId}:${section.AdSectionId}`, { AdCollegeId: Number(section.AdCollegeId), AdSectionId: Number(section.AdSectionId) });
    }
  }
  for (const row of scopes) if (Number(row.AdSectionId) && inside(row)) out.set(`${row.AdCollegeId}:${row.AdSectionId}`, { AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId) });
  return [...out.values()];
}

/* ── ٣) روابطُ الأعضاء ─────────────────────────────────────────────────── */

/** رمزٌ جديد لعضو؛ داخل صندوق التجربة يبدأ بـ«demo.» ليُفتح في صندوقه (utils/demoLinkToken). */
export function newSeatLinkToken(): string {
  const raw = randomBytes(24).toString("base64url");
  return Repository.isDemoRequest() ? `${DEMO_LINK_TOKEN_PREFIX}${raw}` : raw;
}

export async function saveSeatLink(link: SeatMemberLink): Promise<void> {
  await Repository.saveFeatureDoc("seatMemberLinks", link.token, link);
}

export async function revokeSeatLink(token: string | undefined): Promise<void> {
  if (!token) return;
  const link = await Repository.getFeatureDoc<SeatMemberLink>("seatMemberLinks", token);
  if (link && !link.revokedAt) await Repository.saveFeatureDoc("seatMemberLinks", token, { ...link, revokedAt: new Date().toISOString() });
}

export async function readSeatLink(token: string): Promise<SeatMemberLink | null> {
  const clean = String(token || "").trim();
  if (!clean || clean.length > 120 || !/^[A-Za-z0-9._-]+$/.test(clean)) return null;
  if (isDemoLinkToken(clean) && !Repository.isDemoRequest()) return null;
  return Repository.getFeatureDoc<SeatMemberLink>("seatMemberLinks", clean);
}

/* «تذكّرني على هذا الجهاز»: مفتاحٌ موقّعٌ مربوطٌ برمز الرابط نفسه — رابطٌ جديد يُسقطه. */
export const SEAT_DEVICE_COOKIE = "seat_dev";
const SEAT_DEVICE_DAYS = 30;
const deviceSignature = (secret: string, token: string, memberId: string, expiresAt: number) =>
  createHmac("sha256", secret).update(`seat-device-v1|${token}|${memberId}|${expiresAt}`).digest("base64url");

export async function issueSeatDeviceKey(token: string, memberId: string): Promise<{ value: string; maxAgeSeconds: number }> {
  const secret = await Repository.getSharedServerSecret();
  const expiresAt = Date.now() + SEAT_DEVICE_DAYS * 86_400_000;
  return { value: `${expiresAt}.${deviceSignature(secret, token, memberId, expiresAt)}`, maxAgeSeconds: SEAT_DEVICE_DAYS * 86_400 };
}

export async function seatDeviceKeyValid(value: string | undefined, token: string, memberId: string): Promise<boolean> {
  const [expires, signature] = String(value || "").split(".");
  const expiresAt = Number(expires);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const secret = await Repository.getSharedServerSecret();
  const expected = Buffer.from(deviceSignature(secret, token, memberId, expiresAt));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * ── إعادةُ تعيين الدخول (قرار المالك 2026-11-06) ────────────────────────────────
 *
 *  R1 الكلمة المؤقتة: عشوائية، 24 ساعة، بصمةٌ بلا نسخةٍ قابلة للفك، وتُلزم بالتغيير.
 *  R2 دخولٌ واحد: السجلُّ يُحسب مرة، ويسقط إن تغيّرت الكلمة، ولا يحمل الكلمة ولا بصمتها.
 *  R3 الصلاحية والمسارات: الرئيس لمدير النظام، والعضو لمن يدير فريقه، وبحدٍّ للتكرار، وبلا سرٍّ في السجل.
 *  R4 العضو: الرابط يسقط بعد 24 ساعة إن لم يُفتح، ويُمحى موعده عند أول دخول.
 *  R5 البطاقة: الكلمة في جزء # وحده.
 *  R6 الحسابات المعلَّمة بلا موعد: الموحّدة تأخذ موعداً عند الدخول، والإنشاء لا يترك الافتراضية بلا موعد.
 *
 * كلماتُ الاختبار تُولَّد عند التشغيل، فلا كلمةَ مكتوبة في المستودع.
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { Repository } from "../src/db/repository";
import { claimPasswordReset, generateInitialPassword, initialPasswordExpired, initialPasswordMark, passwordResetApplies, passwordResetRecord, TEMPORARY_PASSWORD_LENGTH, temporaryPasswordFields } from "../src/server/accountPassword";
import { parseInvitationHash } from "../src/utils/invitationLink";
import { memberCardModel, TEMPORARY_PASSWORD_HOURS, temporaryPasswordCardModel } from "../src/utils/seatAccessCard";

let failed = 0;
function check(ok: unknown, label: string, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) { failed += 1; if (detail !== undefined) console.log(detail); }
}
const read = (path: string) => fs.readFileSync(path, "utf8");
const HOUR = 3_600_000;
const now = Date.parse("2026-11-06T08:00:00Z");
const word = () => randomBytes(9).toString("base64url");

/* ── R1 ── */
{
  check(TEMPORARY_PASSWORD_HOURS === 24, "R1 المدة 24 ساعة");
  const made = new Set(Array.from({ length: 200 }, () => generateInitialPassword(TEMPORARY_PASSWORD_LENGTH)));
  check(made.size === 200 && [...made].every(value => value.length >= 14 && !/^\d+$/.test(value)), "R1 عشوائية، طويلة، وليست أرقاماً");
  const hash = Repository.hashPassword(word());
  const fields = temporaryPasswordFields(hash, now);
  check(fields.SystemUserPass === hash && fields.SystemUserPassVault === "", "R1 البصمة وحدها: لا نسخة قابلة للفك");
  check(fields.MustChangePassword === true, "R1 تُلزم بالتغيير عند الدخول");
  check(!initialPasswordExpired(fields, now + 24 * HOUR - 1) && initialPasswordExpired(fields, now + 24 * HOUR), "R1 تسقط عند تمام 24 ساعة");
}

/* ── R2 ── */
{
  const password = word();
  const hash = Repository.hashPassword(password);
  const record = passwordResetRecord(7, hash, new Date(now + 24 * HOUR).toISOString(), "المدير", now);
  const text = JSON.stringify(record);
  check(!text.includes(password) && !text.includes(hash), "R2 السجلّ لا يحمل الكلمة ولا بصمتها", record);
  check(record.mark === initialPasswordMark(hash) && passwordResetApplies(record, hash), "R2 السجلّ للكلمة الحالية");
  const first = claimPasswordReset(record, hash, now);
  check("next" in first && Boolean(first.next.usedAt), "R2 الدخول الأول يُحسب");
  check("refuse" in claimPasswordReset((first as any).next, hash, now), "R2 الدخول الثاني يُرفض");
  const other = Repository.hashPassword(word());
  check(!passwordResetApplies(record, other) && "refuse" in claimPasswordReset(record, other, now), "R2 إن تغيّرت الكلمة سقط السجل");
  check("refuse" in claimPasswordReset(null, hash, now), "R2 بلا سجل: لا دخول مؤقت");
  const auth = read("src/server/routes/authRoutes.ts");
  const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/change-password"'));
  check(login.indexOf("!Repository.verifyPassword(password") < login.indexOf("claimPasswordReset") && login.indexOf("user.IsDeleted") < login.indexOf("claimPasswordReset"), "R2 يُحسب الدخول بعد التحقق وفحوص الحساب");
  check(login.includes('Repository.updateFeatureDoc<PasswordResetRecord, boolean>("passwordResets"'), "R2 الاحتساب ذرّي");
  check(login.indexOf("initialPasswordExpired(user") < login.indexOf("claimPasswordReset"), "R2 المنتهية لا تُحسب");
}

/* ── R3 ── */
{
  const seats = read("src/server/seatsRoutes.ts");
  const route = (from: string) => { const start = seats.indexOf(from); return seats.slice(start, seats.indexOf("\n});", start)); };
  const head = route('app.post("/api/seats/:id/password-reset"');
  check(/password-reset", requirePowerAdmin, resetLimit/.test(head), "R3 رئيس الفريق: لمدير النظام وبحدّ");
  check(head.includes("deleteOtherSessionsForUser") && head.includes("authCache.clear()"), "R3 تخرج جلساتُ الرئيس");
  check(!/auditChanges[^\n]*password\b/.test(head) && !/detail:[^\n]*\$\{password/.test(head) && !/console\./.test(head), "R3 لا سرّ في السجل");
  check(head.includes('"Cache-Control", "no-store"'), "R3 الجواب لا يُخبَّأ");
  check(!/SystemUserPassVault|decryptPasswordFromVault/.test(head), "R3 لا تُقرأ الكلمة السابقة");
  const member = route('app.post("/api/seats/:id/members/:mid/reset"');
  check(/reset", requireAuth, resetLimit/.test(member) && member.includes("if (!managesSeat(req, seatId))"), "R3 العضو: لمن يدير هذا الفريق وحده");
  check(member.includes("deleteSessionsForUser(seatId, memberId)"), "R3 تخرج جلساتُ العضو وحده");
  check(seats.includes('path.startsWith("/seats/")'), "R3 الحارس يمنع عضو الفريق والنائب من مسارات الكرسي");
  check(/keyGenerator: req => `password-reset:/.test(seats), "R3 الحدّ لكل مسؤول");
}

/* ── R4 ── */
{
  const seats = read("src/server/seatsRoutes.ts");
  check(seats.includes("member.linkExpiresAt && Date.now() >= Date.parse(member.linkExpiresAt)"), "R4 الرابط المنتهي يُرفض في السياق المشترك");
  check(seats.includes("lastEnteredAt: at, linkExpiresAt: undefined"), "R4 أول دخول يمحو الموعد");
  check(seats.includes('if (reset && member.status !== "active")'), "R4 لا إعادة لعضوٍ مجمَّد");
}

/* ── R5 ── */
{
  const secret = word();
  const card = temporaryPasswordCardModel({ origin: "https://schedule-kw.com/", login: "Frenchdept", password: secret, seatName: "قسم الفرنسي", roleLabel: "رئيس لجنة الجدول", holderName: "د. بدر" });
  const [path, fragment] = card.url.split("#");
  check(!path.includes(secret) && Boolean(fragment), "R5 الكلمة في جزء # وحده", card.url);
  check(parseInvitationHash(`#${fragment}`)?.password === secret, "R5 الرابط يملأ شاشة الدخول");
  check(card.message.includes("24 ساعة"), "R5 الرسالة تذكر المدة");
  const member = memberCardModel({ origin: "https://schedule-kw.com", token: "abc", name: "سارة", seatName: "قسم", withTail: true, reset: true });
  check(member.note.includes("24 ساعة") && member.url.endsWith("/k/abc"), "R5 بطاقة العضو تذكر المدة");
}

/* ── R6 ── */
{
  const auth = read("src/server/routes/authRoutes.ts");
  check(auth.includes("!(user as any).InitialPasswordExpiresAt") && auth.includes("InitialPasswordExpiresAt: adminSetPasswordFields(password).InitialPasswordExpiresAt"), "R6 الموحّدة بلا موعد تأخذ موعدها عند الدخول");
  check((read("src/server/sectionUsers.ts").match(/\.\.\.adminSetPasswordFields\(initial\)/g) || []).length === 2, "R6 إنشاء حسابات الأقسام والكليات يختم الموعد");
}

console.log(failed ? `\n${failed} failed` : "\npassword-reset audit passed");
process.exit(failed ? 1 : 0);

/**
 * ── أولُ دخولٍ بالكلمة الأولى: بلا «كلمة السر الحالية» (المالك، 2026-10-30) ──────────
 *
 *  F1 القاعدة (currentPasswordWaived): تُعفى «الحالية» فقط لحسابٍ معلَّمٍ بتغيير كلمته، في جلسةٍ
 *     فُتحت بتلك الكلمة نفسها (أثرُها في سجلّ الجلسة يطابق المحفوظة)، وفي نافذةٍ قصيرة من فتحها.
 *  F2 القرار (decidePasswordChange) كما يجري في الطريق: بلا حاليةٍ يُقبل للجلسة المعفاة، ويُرفض
 *     بـcurrent-password-required في كل ما عداها؛ والحاليةُ الخاطئة تُرفض كما كانت.
 *  F3 لا كلمةَ مكتوبة: سجلُّ الجلسة يحمل أثراً لا الكلمة ولا بصمتها، والطريقُ لا يعيدها.
 *  F4 الشاشة: «اختر كلمة السر»، وعلامة SCHEDULE نفسها، والاسمُ بارز؛ وحقلُ الحالية يغيب حين يُعفى.
 *
 * كلماتُ الاختبار تُولَّد عند التشغيل، فلا كلمةَ مكتوبة في المستودع.
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Repository } from "../src/db/repository";
import { currentPasswordWaived, decidePasswordChange, INITIAL_PASSWORD_WINDOW_MS, initialPasswordMark, LEGACY_SHARED_PASSWORD } from "../src/server/accountPassword";
import ChangePassword from "../src/components/ChangePassword";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const word = () => randomBytes(9).toString("base64url");
const initial = word();
const stored = Repository.hashPassword(initial);
const flagged = { MustChangePassword: true, SystemUserPass: stored };
const now = Date.now();
const fresh = { createdAt: now - 60_000, initialPassMark: initialPasswordMark(stored) };
const decide = (user: any, session: any, current: string, next: string, at = now) => decidePasswordChange({
  user, session, current, next, now: at, verify: Repository.verifyPassword, hash: Repository.hashPassword, vault: (value: string) => `vault:${value.length}`,
});

/* ── F1 ── */
check(currentPasswordWaived(flagged, fresh, now), "F1 حسابٌ معلَّم وجلسةٌ فُتحت للتوّ بكلمته الأولى: تُعفى الحالية");
check(!currentPasswordWaived({ ...flagged, MustChangePassword: false }, fresh, now), "F1 حسابٌ غير معلَّم: لا إعفاء");
check(!currentPasswordWaived(flagged, { createdAt: fresh.createdAt }, now), "F1 جلسةٌ بلا أثر الكلمة الأولى (فُتحت قبل التعليم أو بغير الدخول): لا إعفاء");
check(!currentPasswordWaived(flagged, { ...fresh, createdAt: now - INITIAL_PASSWORD_WINDOW_MS - 1 }, now), "F1 بعد النافذة القصيرة: لا إعفاء");
check(currentPasswordWaived(flagged, { ...fresh, createdAt: now - INITIAL_PASSWORD_WINDOW_MS + 1000 }, now), "F1 قبيل نهاية النافذة: ما زال معفى");
check(!currentPasswordWaived(flagged, { ...fresh, createdAt: now + 60_000 }, now), "F1 جلسةٌ «من المستقبل»: لا إعفاء");
check(!currentPasswordWaived({ ...flagged, SystemUserPass: Repository.hashPassword(word()) }, fresh, now), "F1 غيّر المسؤولُ الكلمةَ بعد الدخول: سقط الإعفاء");
check(!currentPasswordWaived(flagged, { ...fresh, memberId: "m1" }, now), "F1 جلسةُ عضو الفريق برابطه: لا إعفاء أبداً");
check(!currentPasswordWaived(flagged, undefined, now) && !currentPasswordWaived(undefined, fresh, now), "F1 بلا جلسة أو بلا حساب: لا إعفاء");
check(INITIAL_PASSWORD_WINDOW_MS <= 30 * 60 * 1000, "F1 النافذة قصيرة (نصف ساعة على الأكثر)", INITIAL_PASSWORD_WINDOW_MS);

/* ── F2 ── */
{
  const chosen = word();
  const ok = decide(flagged, fresh, "", chosen);
  check(ok.ok === true && Repository.verifyPassword(chosen, (ok as any).hash) && !Repository.verifyPassword(initial, (ok as any).hash), "F2 بلا كلمة حالية: تُقبل للجلسة المعفاة وتُحفظ الجديدة", ok);
  const stale = decide(flagged, { ...fresh, createdAt: now - INITIAL_PASSWORD_WINDOW_MS - 1 }, "", chosen);
  check(!stale.ok && (stale as any).code === "current-password-required", "F2 جلسةٌ قديمة بلا كلمة حالية: تُرفض وتطلبها", stale);
  const plain = decide({ MustChangePassword: false, SystemUserPass: stored }, fresh, "", chosen);
  check(!plain.ok && (plain as any).code === "current-password-required", "F2 حسابٌ غير معلَّم بلا كلمة حالية: تُرفض", plain);
  const noMark = decide(flagged, { createdAt: fresh.createdAt }, "", chosen);
  check(!noMark.ok && (noMark as any).code === "current-password-required", "F2 جلسةٌ لم تُفتح بالكلمة الأولى: تُرفض", noMark);
  const reissued = decide({ ...flagged, SystemUserPass: Repository.hashPassword(word()) }, fresh, "", chosen);
  check(!reissued.ok && (reissued as any).code === "current-password-required", "F2 كلمةٌ أُعيد إصدارها بعد الدخول: تُرفض", reissued);
  const wrong = decide({ MustChangePassword: false, SystemUserPass: stored }, undefined, word(), chosen);
  check(!wrong.ok && (wrong as any).error === "كلمة السر الحالية غير صحيحة", "F2 كلمةٌ حالية خاطئة: تُرفض كما كانت", wrong);
  const right = decide({ MustChangePassword: false, SystemUserPass: stored }, undefined, initial, chosen);
  check(right.ok === true, "F2 بالكلمة الحالية الصحيحة: يُقبل كما كان", right);
  const rightButWaivable = decide(flagged, fresh, word(), chosen);
  check(!rightButWaivable.ok, "F2 كلمةٌ حالية مكتوبة تُفحص ولو كانت الجلسة معفاة", rightButWaivable);
  const same = decide(flagged, fresh, "", initial);
  check(!same.ok && (same as any).error === "اختر كلمة سرٍّ غير الحالية", "F2 الجلسة المعفاة لا تختار الكلمة الأولى نفسها", same);
  const legacy = decide(flagged, fresh, "", LEGACY_SHARED_PASSWORD);
  check(!legacy.ok, "F2 ولا الكلمة الموحّدة القديمة", legacy);
  const short = decide(flagged, fresh, "", "abc");
  check(!short.ok, "F2 ولا القصيرة", short);
}

/* ── F3 ── */
{
  const mark = initialPasswordMark(stored);
  check(/^[0-9a-f]{32}$/.test(mark) && !mark.includes(initial) && !stored.includes(mark) && mark !== stored, "F3 الأثرُ في الجلسة ليس الكلمة ولا بصمتها المحفوظة");
  const sessionId = `sess_${randomBytes(16).toString("hex")}`;
  await Repository.createSession(sessionId, 4242, 60_000, { initialPassMark: mark });
  const back = await Repository.getSession(sessionId);
  check(back?.initialPassMark === mark && currentPasswordWaived(flagged, back, Date.now()), "F3 سجلُّ الجلسة يحفظ الأثر ويُقرأ به القرار", back);
  await Repository.deleteSession(sessionId);

  const auth = fs.readFileSync("src/server/routes/authRoutes.ts", "utf8");
  const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/change-password"'));
  check(/mustChange \? \{ initialPassMark: initialPasswordMark\(user\.SystemUserPass\) \} : \{\}/.test(login) && login.indexOf("MustChangePassword: true") < login.indexOf("initialPassMark"),
    "F3 الدخولُ يكتب الأثر للحساب المعلَّم وحده (وبعد تعليم الكلمة الموحّدة)");
  const change = auth.slice(auth.indexOf('app.post("/api/auth/change-password"'), auth.indexOf('app.post("/api/auth/logout"'));
  check(change.includes("decidePasswordChange({ user, session, current, next") && change.includes("Repository.getSession(sessionId)") && change.includes("res.json({ ok: true })") && !/res\.json\([^)]*(next|current|hash)/.test(change),
    "F3 الطريقُ يحكم بالقرار نفسه ولا يعيد كلمةً ولا بصمة");
}

/* ── F4 ── */
{
  const name = "قسم تكنولوجيا التعليم · د. بدر الخضري";
  const waived = renderToStaticMarkup(<ChangePassword name={name} askCurrent={false} onChanged={() => undefined} onLogout={() => undefined} />);
  check(waived.includes("اختر كلمة السر</strong>") && !waived.includes("اختر كلمة سرّك"), "F4 العنوان «اختر كلمة السر»");
  check(!waived.includes('autoComplete="current-password"') && !/autoComplete="current-password"/i.test(waived) && !waived.includes("كلمة السر الحالية"), "F4 الجلسةُ المعفاة: لا حقل للكلمة الحالية");
  check((waived.match(/autoComplete="new-password"/gi) || []).length === 2, "F4 الجديدة وتأكيدها فقط", waived.match(/<input[^>]*>/g));
  check(waived.includes(`<b>${name}</b>`) && waived.includes("first-login-greeting"), "F4 الاسمُ في التحية بارزٌ بخطٍّ عريض");
  check(waived.includes("first-login-brand") && waived.includes("SCHEDULE") && waived.includes("<rect"), "F4 علامةُ SCHEDULE نفسها (البلاطة) لا الأعمدة وحدها");
  const asked = renderToStaticMarkup(<ChangePassword name={name} askCurrent onChanged={() => undefined} onLogout={() => undefined} />);
  check(asked.includes("كلمة السر الحالية") && /autoComplete="current-password"/i.test(asked), "F4 جلسةٌ غير معفاة: يبقى حقل الحالية");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  check(app.includes("askCurrent={passwordGate.passwordChange?.currentRequired !== false}"), "F4 الشاشة تسأل كما سيحكم الخادم (passwordChange.currentRequired)");
  const screen = fs.readFileSync("src/components/ChangePassword.tsx", "utf8");
  check(screen.includes('data.code === "current-password-required"') && screen.includes("setNeedsCurrent(true)"), "F4 وإن طلبها الخادم ظهر حقلُها");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

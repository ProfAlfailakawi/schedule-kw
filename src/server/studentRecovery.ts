/**
 * ── مساري: استعادةُ الرمز عبر القسم، ومفتاحُ تقويم الطالب ─────────────────────
 *
 * الرقمُ المدنيُّ ليس سرّاً، فمن عرفه أمكنه أن يُنشئ الملفَّ قبل صاحبه برمزٍ يختاره.
 * والعلاجُ بسيط: موظفُ القسم يرى البطاقةَ المدنية بعينه، فيكتب الرقمَ في شاشة «كشف
 * التسجيل» فيظهر له رمزُ استعادةٍ من ستة أرقام (يومٌ واحد، مرةٌ واحدة، والجديدُ يُلغي
 * السابق). يكتبه الطالبُ في «نسيت رمزي ← معي رمزٌ من قسمي» مع رمزٍ شخصيٍّ جديد، فيُستبدل
 * الرمزُ وتسقط كلُّ الجلسات القديمة (نسخةُ الرمز في الجلسة تتغيّر) ويُلغى طلبُ الحذف.
 *
 * لا يُحفظ الرمزُ نفسُه: بصمتُه (HMAC بمفتاح الخادم ومعها بصمةُ الملف ولحظةُ الإصدار)
 * وانتهاؤه ومن أصدره. ولا يرى الموظفُ من الطالب إلا آخرَ ثلاثة أرقام والاسمَ المختوم
 * ليطابقه بالبطاقة — فإن اختلف الاسمُ عرف أن الملفَّ أنشأه غيرُ صاحبه.
 *
 * والمنطقُ هنا بلا مستودعٍ ولا جلسات (تُحقن)، فيُختبر بخادمٍ صغيرٍ ومخزنٍ في الذاكرة
 * (tests/student-recovery-audit.ts)؛ الربطُ في studentRecoveryWiring.ts.
 */
import { createCipheriv, createDecipheriv, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { StudentProfile } from "../types";
import { validateCivilId } from "../utils/civilId";
import { toEnglishDigits } from "../utils/digits";

export const RECOVERY_CODE_LENGTH = 6;
/** يومٌ واحد: يكفي ليعود الطالبُ إلى هاتفه، ولا يبقى رمزٌ منسيٌّ صالحاً. */
export const RECOVERY_TTL_MS = 24 * 3_600_000;
/** أخطاءٌ على رمز الاستعادة نفسِه قبل أن يسقط (فوق قفل الملف ٥ ← ١٥ دقيقة). */
export const RECOVERY_MAX_FAILURES = 5;
/** إصداراتٌ في الساعة لكل موظف: يكفي طابورَ مكتب، ولا يكفي من يدور على الأرقام. */
export const RECOVERY_ISSUES_PER_HOUR = 20;
/** سجلُّ الإصدار على الملف: آخرُ عشرة. */
export const RECOVERY_LOG_MAX = 10;

export type StudentRecovery = NonNullable<StudentProfile["recovery"]>;

const hmac = (key: Buffer, label: string) => createHmac("sha256", key).update(label).digest();

export function newRecoveryCode(): string {
  return String(randomInt(0, 10 ** RECOVERY_CODE_LENGTH)).padStart(RECOVERY_CODE_LENGTH, "0");
}

export function recoveryHash(key: Buffer, fingerprint: string, code: string, issuedAt: string): string {
  return createHmac("sha256", hmac(key, "masari-recovery-v1")).update(`${fingerprint}|${issuedAt}|${code}`).digest("base64url");
}

export type RecoveryReading = "ok" | "none" | "expired" | "wrong";

/** هل هذا هو رمزُ الاستعادة الحيّ لهذا الملف؟ */
export function readRecovery(key: Buffer, profile: Pick<StudentProfile, "fingerprint" | "recovery">, code: string, now: number): RecoveryReading {
  const rec = profile.recovery;
  if (!rec?.hash) return "none";
  if (!(Date.parse(rec.expiresAt) > now)) return "expired";
  const clean = toEnglishDigits(code).replace(/\D/g, "");
  if (clean.length !== RECOVERY_CODE_LENGTH) return "wrong";
  const a = Buffer.from(recoveryHash(key, profile.fingerprint, clean, rec.issuedAt)), b = Buffer.from(rec.hash);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}

export const maskCivil = (civil: string): string => {
  const value = String(civil || "");
  return value ? `${"•".repeat(Math.max(0, value.length - 3))}${value.slice(-3)}` : "";
};

/* ── مفتاحُ اشتراك التقويم ─────────────────────────────────────────────────
   رابطٌ ثابتٌ يقرؤه تطبيقُ التقويم بلا كوكي، فلا بدّ أن يحمل ما يدلّ على الملف — دون
   الرقم المدني ودون البصمة مكشوفةً. البصمةُ تُختم (AES-256-GCM) بمتّجهٍ مشتقٍّ بـHMAC من
   البصمة ونسخة الرمز: الختمُ نفسُه في كل مرة (رابطٌ ثابت)، ولا يُفتح ولا يُزوَّر بلا مفتاح
   الخادم، ويُقارَن متّجهُه عند كل قراءة بنسخة الرمز الحالية — فتغييرُ الرمز أو استعادتُه
   يُبطل الرابطَ القديم، وحذفُ الملف لا يُبقي له شيئاً يقرؤه. */
const calendarKeys = (key: Buffer) => ({ enc: hmac(key, "masari-calendar-enc-v1"), iv: hmac(key, "masari-calendar-iv-v1") });
const calendarIv = (key: Buffer, fingerprint: string, cv: string) =>
  createHmac("sha256", calendarKeys(key).iv).update(`${fingerprint}|${cv}`).digest().subarray(0, 12);
const fingerprintBytes = (fingerprint: string) => (/^[0-9a-f]{32}$/.test(fingerprint) ? Buffer.from(fingerprint, "hex") : Buffer.from(fingerprint, "utf8"));

export function calendarToken(key: Buffer, fingerprint: string, cv: string): string {
  const iv = calendarIv(key, fingerprint, cv);
  const cipher = createCipheriv("aes-256-gcm", calendarKeys(key).enc, iv);
  const sealed = Buffer.concat([cipher.update(fingerprintBytes(fingerprint)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
}

/** البصمةُ التي يحملها المفتاح (أو null إن عُبث به). لا يكفي وحده: `calendarTokenFor` يقارن نسخةَ الرمز. */
export function calendarFingerprint(key: Buffer, token: string): string | null {
  try {
    const raw = Buffer.from(String(token || ""), "base64url");
    if (raw.length < 12 + 16 + 8 || raw.length > 12 + 16 + 120) return null;
    const decipher = createDecipheriv("aes-256-gcm", calendarKeys(key).enc, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return plain.length === 16 ? plain.toString("hex") : plain.toString("utf8");
  } catch { return null; }
}

/** المفتاحُ ما زال صالحاً لهذا الملف بنسخة رمزه الحالية؟ */
export function calendarTokenValid(key: Buffer, token: string, fingerprint: string, cv: string): boolean {
  const a = Buffer.from(String(token || "")), b = Buffer.from(calendarToken(key, fingerprint, cv));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── شاشةُ الموظف: إصدارُ رمز الاستعادة ──────────────────────────────────── */

export interface RecoveryIssuer {
  id: number;
  name: string;
  /** مديرُ النظام: يُصدر لأي قسم. */
  power: boolean;
  scopeAllows: (collegeId: number, sectionId: number) => boolean;
}

export interface StudentRecoveryDeps {
  /** من يطلب؟ null = غير مسموح (مع السبب). */
  issuer: (req: Request) => Promise<RecoveryIssuer | { status: number; error: string }>;
  fingerprint: (civil: string) => Promise<string>;
  identityKey: () => Promise<Buffer>;
  getProfile: (fingerprint: string) => Promise<StudentProfile | undefined>;
  updateProfile: (fingerprint: string, mutate: (current: StudentProfile | undefined) => StudentProfile | undefined | null) => Promise<StudentProfile | undefined | null>;
  openIdentity: (cipher: string | undefined) => Promise<string>;
  sectionName: (sectionId: number) => Promise<string>;
  audit?: (entry: { issuer: RecoveryIssuer; fingerprintTail: string; status: number; action: string }) => Promise<unknown> | void;
  now?: () => number;
}

export function registerStudentRecoveryRoutes(app: Express, deps: StudentRecoveryDeps): void {
  const clock = () => (deps.now ? deps.now() : Date.now());
  const issued = new Map<number, number[]>();
  const fail = (res: Response, status: number, error: string, code: string) => { res.setHeader("Cache-Control", "no-store"); res.status(status).json({ error, code }); };

  app.post("/api/student-recovery/code", async (req: Request, res: Response) => {
    const who = await deps.issuer(req);
    if ("error" in who) { fail(res, who.status, who.error, "forbidden"); return; }
    const civil = toEnglishDigits(req.body?.civil).replace(/\D/g, "");
    if (civil.length !== 12 || !validateCivilId(civil).isValid) { fail(res, 400, "الرقم المدني غير صحيح. راجعه من البطاقة.", "bad-civil"); return; }
    const now = clock();
    const recent = (issued.get(who.id) || []).filter(at => at > now - 3_600_000);
    if (recent.length >= RECOVERY_ISSUES_PER_HOUR) { fail(res, 429, "أصدرت رموزاً كثيرة في ساعة. انتظر قليلاً.", "rate"); return; }
    const fingerprint = await deps.fingerprint(civil);
    const tail = fingerprint.slice(-6);
    const profile = await deps.getProfile(fingerprint);
    if (!profile) { fail(res, 404, "لا ملفّ في مساري لهذا الرقم. يستطيع الطالب إنشاءه بنفسه.", "no-profile"); return; }
    if (profile.AdSectionId > 0 && !who.power && !who.scopeAllows(Number(profile.AdCollegeId), Number(profile.AdSectionId))) {
      await deps.audit?.({ issuer: who, fingerprintTail: tail, status: 403, action: "student-recovery-out-of-scope" });
      fail(res, 403, "ملفُّ هذا الطالب في قسمٍ آخر. يصدر رمزَه قسمُه أو إدارةُ النظام.", "out-of-scope");
      return;
    }
    recent.push(now); issued.set(who.id, recent);
    const code = newRecoveryCode();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + RECOVERY_TTL_MS).toISOString();
    const hash = recoveryHash(await deps.identityKey(), fingerprint, code, issuedAt);
    let replaced = false;
    const saved = await deps.updateProfile(fingerprint, current => {
      if (!current) return undefined;
      replaced = Boolean(current.recovery && Date.parse(current.recovery.expiresAt) > now);
      const log = [...(current.recoveryLog || []), { at: issuedAt, byId: who.id, byName: who.name }].slice(-RECOVERY_LOG_MAX);
      return { ...current, recovery: { hash, issuedAt, expiresAt, issuedById: who.id, issuedByName: who.name, failures: 0 }, recoveryLog: log };
    });
    if (!saved) { fail(res, 404, "لا ملفّ في مساري لهذا الرقم.", "no-profile"); return; }
    await deps.audit?.({ issuer: who, fingerprintTail: tail, status: 200, action: "student-recovery-code" });
    const [name, sectionName] = await Promise.all([
      deps.openIdentity(saved.nameCipher).catch(() => ""),
      saved.AdSectionId > 0 ? deps.sectionName(saved.AdSectionId).catch(() => "") : Promise.resolve(""),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ code, issuedAt, expiresAt, civilMasked: maskCivil(civil), name, sectionName, replaced, createdAt: saved.createdAt });
  });
}

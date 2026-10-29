/**
 * ── التحقّقُ من رمز التوقيع ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { Repository } from "../../db/repository";
import { normalizeCivilId, validateCivilId } from "../../utils/civilId";
import { signatureVerifyPage } from "../signatureVerifyPage";
import { isDemoLinkToken } from "../../utils/demoLinkToken";
import { publicPageNonce } from "../core/publicPages";
import { publicAttemptReserve } from "../core/shareLinks";
import { surveyFingerprint } from "../core/studentIdentity";

/**
 * ── التحقّق من رمز التوقيع ──────────────────────────────────────────────────
 *
 * الرمزُ يُعطى للأستاذ حين يرسل طلبَه ليُطابَق به بعد شهرين ما في ورقةٍ أو رسالة.
 * يُفتح برمزٍ ورقمٍ مدنيّ، فيرى ما وُقّع عليه لحظتَه. والجوابُ واحدٌ حين لا يوجد
 * رمزٌ وحين لا يطابقه الرقم: التفريقُ بينهما يقول لمن يجرّب إن رمزاً ما صحيح.
 */
const rateLimitVerifySignature = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

export function registerVerifyRoutes(app: Express): void {
/* معرّفُ صفحة تحقق الكوبون (٣٢ خانةً ست عشرية صغيرة) يخصّ مسار الإعلانات المسجَّل لاحقاً؛ رمز التوقيع ست خاناتٍ كبيرة،
   فلا تلتقيان. بغير هذا التمرير حجبَ هذا المسارُ صفحةَ التاجر وفتح رابطُ الـQR صفحةَ «التحقّق من توقيعك». */
app.get(["/verify", "/verify/:code"], (req: Request, res: Response, next: NextFunction) => {
  if (/^[0-9a-f]{32}$/.test(String(req.params.code || ""))) { next(); return; }
  res.setHeader("Cache-Control", "no-store");
  res.type("text/html; charset=utf-8").send(signatureVerifyPage(String(req.params.code || ""), String(req.query.t || ""), publicPageNonce(res)));
});
app.post("/api/public/verify", rateLimitVerifySignature, async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const civil = normalizeCivilId(req.body?.civil);
  const code = String(req.body?.code || "").trim().toUpperCase();
  /* الصيغةُ تُردّ قبل أي بحثٍ ولا تُحسب محاولة: خطأُ كتابةٍ لا يُغلق الباب على صاحبه. */
  if (!/^\d{12}$/.test(civil) || !validateCivilId(civil).isValid) {
    res.status(400).json({ error: "الرقم المدني غير مكتمل أو فيه خطأ كتابة. راجعه وأعد المحاولة." });
    return;
  }
  if (code && !/^[0-9A-Z]{6}$/.test(code)) {
    res.status(400).json({ error: "الرمز ستّة أحرف وأرقام. اتركه فارغاً إن لم تتذكّره: يكفي رقمك المدني." });
    return;
  }
  const attempt = publicAttemptReserve("verify-signature", req.ip || "unknown");
  if (!attempt) { res.status(429).json({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." }); return; }
  const lookup = async () => {
    const fingerprint = await surveyFingerprint(civil);
    const found = (await Repository.getInstructorRequestsBySignatureFingerprint(fingerprint))
      .filter(row => row.signature && row.signature.fingerprint === fingerprint)
      .sort((a, b) => Date.parse(String(b.signature?.at || "")) - Date.parse(String(a.signature?.at || "")))
      .slice(0, 20);
    if (!found.length) return null;
    const [instructors, terms] = await Promise.all([Repository.getInstructors(), Repository.getTerms()]);
    const signatures = found.flatMap(row => [...(row.signatureHistory || []), row.signature!].map(signature => {
      const person = (instructors as any[]).find(item => Number(item.AdInstructorId) === Number(row.AdInstructorId));
      const term = (terms as any[]).find(item => Number(item.AdTermId) === Number(row.AdTermId));
      const signed = signature.signedItems;
      return {
        code: String(signature.verifyCode || ""),
        instructorName: String(person?.AdInstructorName || ""),
        termName: String(term?.AdTermName || ""),
        signedAt: signature.at,
        hasItems: Array.isArray(signed),
        items: Array.isArray(signed) ? signed : [],
        keptCount: Number(signature.keptCount || 0),
      };
    }));
    /* الرمزُ إن كُتب وطابق يتقدّم؛ وإن لم يطابق لا يُسقط البابَ: تُعرض توقيعاتُه ويُقال إنه لا يطابق. */
    const hit = code ? signatures.findIndex(item => item.code === code) : -1;
    if (hit > 0) signatures.unshift(...signatures.splice(hit, 1));
    return { count: signatures.length, codeGiven: Boolean(code), matchedCode: hit >= 0 ? code : null, signatures };
  };
  /* رابطُ تجربةٍ يربط البحثَ بصندوقه، كما تفعل روابطُ الأبواب العامة الأخرى. */
  const hint = String(req.body?.hint || "");
  const sandbox = isDemoLinkToken(hint) ? Repository.demoSandboxForLinkToken(hint) : "";
  const result = await new Promise<Awaited<ReturnType<typeof lookup>> | "error">(resolve => {
    const run = () => lookup().then(resolve, () => resolve("error"));
    if (!sandbox || !Repository.runDemoSandbox(sandbox, () => { void run(); })) void run();
  });
  if (result === "error") { res.status(500).json({ error: "تعذّر التحقّق الآن. أعد المحاولة بعد قليل." }); return; }
  /* الجوابُ واحدٌ لرقمٍ لا توقيعَ باسمه ولرقمٍ لا يخصّ أحداً. */
  if (!result) { res.status(404).json({ error: "لا يوجد توقيعٌ مسجَّل بهذا الرقم المدني." }); return; }
  attempt.release();
  res.json(result);
});
}

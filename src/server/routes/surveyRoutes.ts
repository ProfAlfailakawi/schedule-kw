/**
 * ── استبيانُ الطلبة وحالاتُهم (/q /m) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import express, { Request, Response, NextFunction } from "express";
import { Repository, caseRefFor } from "../../db/repository";
import { validateCivilId } from "../../utils/civilId";
import { toEnglishDigits } from "../../utils/digits";
import { byArabic } from "../../utils/sorting";
import type { ScheduleShareLink } from "../../types";
import { isDemoLinkToken } from "../../utils/demoLinkToken";
import { isFullySigned } from "../../utils/approvalWorkflow";
import { isCaseLevelNeed, studentCaseStatus } from "../../utils/studentCaseDecision";
import { droppedCourseLabel } from "../../utils/studentNeedMerge";
import { termWindow } from "../../utils/termSequence";
import { PUBLIC_LIGHT_VARS } from "../publicTheme";
import { readApproval } from "../core/approvals";
import { dataContextCacheKey } from "../core/locations";
import { studentQueueMemo } from "../core/notifications";
import { demoPageHint, publicPageNonce } from "../core/publicPages";
import { publicAttemptKey, publicAttempts, resolveShareToken } from "../core/shareLinks";
import { asciiDigits, graduateProofCore, graduateSubmitCheck, graduateThreshold, graduationCandidatesForSection, graduationRuleFor, issueStudentProof, openStudentIdentity, sealStudentIdentity, surveyActiveCourseIds, surveyCohort, surveyFingerprint, surveyPayloadCache, surveyTermEnded } from "../core/studentIdentity";
import { studentCaseStatusPage } from "../pages/studentCaseStatusPage";
import { studentCaseSurveyPage } from "../pages/surveyPages";

/** الأبواب التي لم تنتقل بعد إلى عدّ الأخطاء وحدها (استبيان الطلبة): كل طلبٍ يُعدّ. */
function staffLookupAllowed(token: string, ip: string): boolean {
  return publicAttempts.consume(publicAttemptKey(token, ip));
}

/**
 * ── رقمُ الحالة هو المفتاح الثاني ───────────────────────────────────────────
 *
 * الرقمُ المدنيُّ ليس سرّاً: يعرفه الزميلُ والقريب، ويُكتب على كل استمارة.
 * فكان من يعرف رقمَ زميلٍ يفتح الاستبيان فيرى اسمه وقسمه، ثم يُرسل باسمه
 * طلباً يمحو طلبه. صار الطلبُ القائمُ لا يُقرأ ولا يُعدَّل ولا تُعاد إليه
 * صحيفةُ التخرج المتحقَّق منها إلا بالرقم المدني **ورقم الحالة** الذي
 * أُعطي لصاحبه عند الإرسال.
 */
const normalizeCaseRef=(value:unknown)=>toEnglishDigits(value).toUpperCase().replace(/[^0-9A-Z]/g,"").slice(0,16);
/** The one stored request of this hand (fingerprint + term + survey department). */
const priorNeedForHand=async(link:any,civil:string)=>{
  const fingerprint=await surveyFingerprint(civil);
  const needs=await Repository.getStudentNeedsByFingerprint(fingerprint,Number(link.AdCollegeId),Number(link.AdTermId));
  return (needs as any[])
    .filter((need:any)=>String(need?.fingerprint||"")===fingerprint
      &&Number(need?.surveySectionId||need?.AdSectionId||0)===Number(link.AdSectionId))
    .sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
};
const caseRefMatches=(need:any,supplied:unknown)=>Boolean(need)&&normalizeCaseRef(supplied)===normalizeCaseRef(caseRefFor(need));
/** Only a first letter leaves the server before the case number is proven. */
const maskedInitial=(name:string)=>{const first=Array.from(String(name||"").trim())[0]||"";return first?`${first}…`:"";};
const CASE_REF_REQUIRED="لهذا الرقم المدني طلبٌ سابق في هذا الاستبيان. أدخل رقم الحالة الذي ظهر لك عند الإرسال لتعديله. فقدت الرقم؟ راجع القسم.";

/** A successful graduation-sheet verification belongs to the student + own
 * section + survey department + term, not to one particular request type. A
 * later request in the same survey therefore reuses the verified facts instead
 * of asking the student to upload the same official sheet again. The current
 * academic rule is re-applied every time; stale eligibility never survives a
 * rule change. */
const reusableGraduateVerification=async(link:any,civil:string,sectionId:number,caseRef:unknown)=>{
  /* A verified sheet is reused only for the holder of the case number too. */
  if(!caseRefMatches(await priorNeedForHand(link,civil),caseRef))return null;
  const fingerprint=await surveyFingerprint(civil);
  const needs=await Repository.getStudentNeedsByFingerprint(fingerprint,Number(link.AdCollegeId),Number(link.AdTermId));
  const prior=(needs as any[]).find((need:any)=>
    String(need?.fingerprint||"")===fingerprint
    &&Number(need?.surveySectionId||need?.AdSectionId||0)===Number(link.AdSectionId)
    &&Number(need?.studentSectionId||need?.AdSectionId||0)===Number(sectionId)
    &&String(need?.eligibility||"")==="eligible"
    &&Number(need?.passedUnits||0)>0
  );
  if(!prior)return null;
  /* The prior sheet proved a plan; its rule is re-read now, never carried. */
  const chosen=graduationRuleFor(await graduationCandidatesForSection(sectionId),prior.curriculumPlanId);
  const rule=chosen?.rule;
  if(!rule||Number(prior.degreeUnits||0)!==Number(rule.degreeUnits))return null;
  const terms=await Repository.getTerms();
  const termName=String(terms.find((row:any)=>Number(row.AdTermId)===Number(link.AdTermId))?.AdTermName||"");
  const requiredUnits=graduateThreshold(rule,termName),passedUnits=Number(prior.passedUnits||0);
  if(!requiredUnits||passedUnits<requiredUnits)return null;
  const proofToken=await issueStudentProof({
    fingerprint,sectionId,passedUnits,requiredUnits,degreeUnits:Number(rule.degreeUnits),curriculumPlanId:chosen?.planId,
    nameMatched:Boolean(prior.proofNameMatched),specializationMatched:true,documentKind:"graduation-sheet",
  });
  return{
    fingerprint,passedUnits,requiredUnits,degreeUnits:Number(rule.degreeUnits),curriculumPlanId:chosen?.planId,
    proofNameMatched:Boolean(prior.proofNameMatched),proofToken,termName,
  };
};

const normalizeStudentIdentityName=(value:unknown)=>String(value||"").normalize("NFKC").replace(/\s+/g," ").trim();

/** A student's basic identity is decided once per survey department + term.
 * Later answers may replace the REQUEST, but never silently rewrite who the
 * request belongs to. The public page remembers this on the student's browser
 * for a read-only repeat visit; this server check is the hard gate that prevents
 * a crafted request from changing the stored name or home section. */
const reusableStudentIdentity=async(link:any,civil:string)=>{
  const fingerprint=await surveyFingerprint(civil);
  const needs=await Repository.getStudentNeedsByFingerprint(fingerprint,Number(link.AdCollegeId),Number(link.AdTermId));
  const prior=(needs as any[]).find((need:any)=>
    String(need?.fingerprint||"")===fingerprint
    &&Number(need?.surveySectionId||need?.AdSectionId||0)===Number(link.AdSectionId)
    &&Boolean(need?.nameCipher)
    &&Boolean(need?.civilCipher)
  );
  if(!prior)return null;
  const [name,storedCivil]=await Promise.all([openStudentIdentity(prior.nameCipher),openStudentIdentity(prior.civilCipher)]);
  const sectionId=Number(prior.studentSectionId||prior.AdSectionId||0);
  if(!name||name.trim().length<3||!sectionId||storedCivil!==civil)return null;
  return{fingerprint,name:name.trim(),civil:storedCivil,sectionId,needId:String(prior.id||"")};
};

function surveyCourseIdsForSection(courses: any[], history: any[], sectionId: number) {
  const taught = new Map<number, number>();
  for (const row of history) {
    if (Number(row.AdSectionId) !== Number(sectionId)) continue;
    taught.set(Number(row.AdCourseId), Math.max(taught.get(Number(row.AdCourseId)) || 0, Number(row.AdTermId) || 0));
  }
  const allowed = new Set<number>();
  for (const course of courses) if (taught.has(Number(course.AdCourseId))) allowed.add(Number(course.AdCourseId));
  return { taught, allowed };
}
const SURVEY_TERM_ENDED = "انتهى هذا الفصل، ولم يعد الاستبيان يستقبل طلبات. تابع طلبك السابق من «حالة طلبي» أو راجع القسم.";
const SURVEY_PAYLOAD_TTL_MS = 10 * 60 * 1000;

/* A sheet over the limit used to fall through to the generic error handler: the
   student saw a raw failure with no hint that the FILE was the problem. The
   limit is one number, told to the page and enforced here with a clear 413. */
const STUDENT_PROOF_MAX_BYTES=14*1024*1024;
const STUDENT_PROOF_TOO_LARGE="حجم الملف أكبر من 14 ميغابايت. صوّر الصفحة الرسمية وحدها أو احفظها PDF بحجمٍ أصغر ثم ارفعها.";
const studentProofBody=express.raw({type:"application/octet-stream",limit:STUDENT_PROOF_MAX_BYTES});
const readStudentProofBody=(req:Request,res:Response,next:NextFunction)=>{
  if(Number(req.get("content-length")||0)>STUDENT_PROOF_MAX_BYTES){res.status(413).json({code:"file-too-large",error:STUDENT_PROOF_TOO_LARGE});return;}
  studentProofBody(req,res,(error?:any)=>{
    if(error&&(error.type==="entity.too.large"||Number(error.status)===413)){res.status(413).json({code:"file-too-large",error:STUDENT_PROOF_TOO_LARGE});return;}
    next(error);
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   «حالة طلبي» — البابُ الذي يُغني عن الوقوف عند المكتب
   ══════════════════════════════════════════════════════════════════════════

   الطالب يعبّئ الاستبيان فيصله رقمُ حالة، ثم يصمت النظام. فيأتي. وأكثرُ
   الزحمة في أسبوع التسجيل ليست عن مقعدٍ ولا عن تعارض: هي سؤالٌ واحد — «وصل
   طلبي أو لا؟» — لا يملك الطالبُ طريقاً إلى جوابه إلا المجيء.

   هذه الصفحةُ هي الجواب. تفتح بالرابط نفسه الذي عبّأ منه، ويتعرّف عليها
   بالرقم المدني كما في بقيّة الأبواب، فيرى ما أرسله ورقمَ حالته وتاريخه.

   وما لا تفعله مقصودٌ كفعلها:

   - **لا تَعِد بما لا تعرفه.** لا تقول «مقعدُك محجوز» ولا «سُجّلت»: النظام
     لا يعرف ذلك، والقسمُ يسلّم التسجيلَ يدوياً إلى اليوم. تقول ما جرى فعلاً:
     وصل الطلب، ومتى، وبأيّ مقرّرات. وادّعاءُ ما بعدها يصنع زحمةً أسوأ حين
     يكتشف الطالبُ أنه غير مسجَّل.

   - **لا تكشف أحداً.** تُقرأ ببصمة الرقم المدني **ورقم الحالة** معاً، فالرقمُ
     المدنيُّ وحده لا يفتح طلبَ أحد، والصفحةُ لا تعرض اسماً. ومن لا طلبَ له —
     أو أخطأ في أحد الرقمين — يُقال له الجوابُ نفسُه، لا «الرقم خطأ»: الفرقُ
     بينهما يكشف من عبّأ ومن لم يعبّئ لمن يجرّب أرقاماً.

   - **ولا تُفتح بالمحاولة.** حدُّ المحاولات نفسُه المفروضُ على بطاقة الأستاذ:
     عشرُ محاولاتٍ في النافذة، ثم انتظار.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ── الحالةُ تعيش بعد باب الإرسال ───────────────────────────────────────────
 *
 * «حالة طلبي» كانت تُقرأ بالرابط نفسه الذي يُرسَل به، فإذا أوقفه القسم أو
 * انتهت صلاحيته — وهو ما يحدث عادةً مع أسبوع السحب والإضافة، قبل أن يقرّر
 * التسجيل — ماتت الحالة معه، ورجع الطالب إلى المكتب ليسأل. فالقراءةُ هنا
 * تبقى مفتوحةً لرابط الاستبيان حتى ثلاثين يوماً بعد نهاية فصله، والإرسالُ
 * يبقى مغلقاً كما هو (يمرّ بـ`resolveShareToken`).
 */
const SURVEY_STATUS_GRACE_MS = 30 * 86400000;
async function resolveSurveyStatusToken(token: string): Promise<{ link: ScheduleShareLink } | { error: string; status: 404 | 410 }> {
  const link = await Repository.getShareLink(String(token || ""));
  if (!link || link.kind !== "survey") return { error: "الرابط غير موجود أو ليس استبياناً", status: 404 };
  const open = !link.revoked && new Date(link.expiresAt).getTime() >= Date.now();
  if (open) return { link };
  const term = (await Repository.getTerms()).find((row: any) => Number(row.AdTermId) === Number(link.AdTermId));
  const window = termWindow(term as any);
  const readableUntil = Math.max(new Date(link.expiresAt).getTime() || 0, window?.to || 0) + SURVEY_STATUS_GRACE_MS;
  if (Date.now() < readableUntil) return { link };
  return { error: "انتهت مدة متابعة الطلبات لهذا الفصل. راجع القسم.", status: 410 };
}

export function registerSurveyRoutes(app: Express): void {

app.get("/api/public/survey/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "survey") { res.status(404).json({ error: "هذا الرابط ليس استبياناً" }); return; }
  const cacheKey = dataContextCacheKey(resolved.link.id);
  /* Asked on every open, outside the payload cache: the term can end while a
     cached payload is still fresh. */
  const linkTerm = (await Repository.getTerms()).find((row: any) => Number(row.AdTermId) === Number(resolved.link.AdTermId));
  if (surveyTermEnded(linkTerm)) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ termEnded: true, message: SURVEY_TERM_ENDED, term: String((linkTerm as any)?.AdTermName || ""), statusUrl: `/m/${encodeURIComponent(resolved.link.id)}` });
    return;
  }
  const cached = surveyPayloadCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SURVEY_PAYLOAD_TTL_MS) {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...cached.payload, expiresAt: resolved.link.expiresAt });
    return;
  }

  const [courses, history, sections, terms, colleges] = await Promise.all([
    Repository.getCourses(), Repository.getSchedules(), Repository.getSections(), Repository.getTerms(), Repository.getColleges(),
  ]);
  /* The courses offered are the ones this section has ACTUALLY taught — read
     from its own history, newest first. A catalogue entry nobody has taught in
     a decade is not something to ask a student about. */
  const scientificSections=sections.filter((row:any)=>Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  const linkTermName=String(terms.find((row:any)=>Number(row.AdTermId)===Number(resolved.link.AdTermId))?.AdTermName||"");
  const sectionOptions=(await Promise.all(scientificSections.map(async(section:any)=>{
    const sid=Number(section.AdSectionId),{taught}=surveyCourseIdsForSection(courses,history,sid);
    /* Graduate proof needs the department's SAVED rule. The page learns it
       here, before the student uploads anything, instead of after OCR. */
    const ruled=(await graduationCandidatesForSection(sid)).flatMap(row=>row.rule?[row.rule]:[]);
    const thresholds=[...new Set(ruled.map(rule=>graduateThreshold(rule,linkTermName)))];
    /* Two plans may ask for two thresholds; the page is only told a number when there is one. */
    const graduateRule=ruled.length?{saved:true,threshold:thresholds.length===1?thresholds[0]:undefined,plans:ruled.length}:{saved:false};
    const operational=await surveyActiveCourseIds(sid);
    const offered=courses.filter((course:any)=>Number(course.AdSectionId)===sid&&operational.has(Number(course.AdCourseId)))
      .map((course:any)=>({id:course.AdCourseId,code:course.CourseCode,name:course.CourseName,lastTaught:taught.get(Number(course.AdCourseId))||0}))
      .sort((a:any,b:any)=>b.lastTaught-a.lastTaught||String(a.code).localeCompare(String(b.code),"ar"));
    return{id:section.AdSectionId,name:section.AdSectionName,courses:offered,graduateRule};
  }))).sort((a:any,b:any)=>byArabic(a.name,b.name));
  const offered=sectionOptions.find((section:any)=>Number(section.id)===Number(resolved.link.AdSectionId))?.courses||[];

  const sectionName = sections.find(row => row.AdSectionId === resolved.link.AdSectionId)?.AdSectionName || "";
  const cohort = surveyCohort(sectionName);
  const payload = {
    section: sectionName,
    college: colleges.find(row => row.AdCollegeId === resolved.link.AdCollegeId)?.AdCollegeName || "",
    term: terms.find(row => row.AdTermId === resolved.link.AdTermId)?.AdTermName || "",
    label: resolved.link.label, expiresAt: resolved.link.expiresAt,
    ...cohort,
    sectionId:resolved.link.AdSectionId,sections:sectionOptions,courses:offered,
  };
  if (surveyPayloadCache.size > 200) surveyPayloadCache.clear();
  surveyPayloadCache.set(cacheKey, { at: Date.now(), payload });
  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
});

app.post("/api/public/survey/:token/identity-status", async (req:Request,res:Response)=>{
  const token=String(req.params.token),resolved=await resolveShareToken(token);
  if("error" in resolved){res.status(resolved.status).json({error:resolved.error});return;}
  if(resolved.link.kind!=="survey"){res.status(404).json({error:"هذا الرابط ليس استبياناً"});return;}
  /* Identity is deliberately CIVIL-FIRST. The browser calls this endpoint only
     after one complete, checksum-valid 12-digit number and never while the
     student is still typing their name/department. That removes the accidental
     burst of lookups that used to trip the public rate limit. */
  if(!staffLookupAllowed(`identity:${token}`,req.ip||"unknown")){res.status(429).json({error:"محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة."});return;}
  const civil=asciiDigits(req.body?.civil).replace(/\D/g,"");
  if(!validateCivilId(civil).isValid){res.status(400).json({error:"الرقم المدني غير صحيح"});return;}
  res.setHeader("Cache-Control","no-store");
  const priorNeed=await priorNeedForHand(resolved.link,civil);
  if(!priorNeed){res.json({exists:false,verified:false});return;}
  const prior=await reusableStudentIdentity(resolved.link,civil);
  const initial=maskedInitial(String(prior?.name||""));
  const suppliedRef=normalizeCaseRef(req.body?.caseRef);
  /* Without the case number: that a request exists, and one masked letter —
     never the decrypted name or department. */
  if(!suppliedRef){res.json({exists:true,verified:false,initial});return;}
  if(!caseRefMatches(priorNeed,suppliedRef)){
    res.status(403).json({exists:true,verified:false,initial,code:"case-ref-mismatch",error:"رقم الحالة لا يطابق الطلب المحفوظ لهذا الرقم المدني. فقدت الرقم؟ راجع القسم."});return;
  }
  const sections=await Repository.getSections();
  const sectionId=Number(prior?.sectionId||priorNeed.studentSectionId||priorNeed.AdSectionId||0);
  const section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  const courses=await Repository.getCourses();
  const courseById=new Map((courses as any[]).map((row:any)=>[Number(row.AdCourseId),row]));
  const stateOf=(id:number)=>(priorNeed.courseStates||[]).find((state:any)=>Number(state.courseId)===Number(id));
  res.json({
    exists:true,verified:true,identityMatched:Boolean(prior),
    name:String(prior?.name||""),
    sectionId:section?Number(sectionId):0,
    sectionName:String((section as any)?.AdSectionName||""),
    /* What the new answer will update, shown before the student replaces it. */
    summary:{
      caseRef:caseRefFor(priorNeed),
      requestType:String(priorNeed.requestType||"new-course"),
      submittedAt:String(priorNeed.createdAt||""),
      updatedAt:String(priorNeed.updatedAt||""),
      graduateReason:String(priorNeed.graduateReason||""),
      caseStatus:isCaseLevelNeed(priorNeed)?studentCaseStatus(priorNeed.caseState):"",
      courses:(priorNeed.courseIds||[]).map((id:any)=>{const course:any=courseById.get(Number(id));const state:any=stateOf(Number(id));
        return{id:Number(id),code:String(course?.CourseCode||""),name:String(course?.CourseName||`مقرر ${id}`),state:String(state?.state||"")};}),
    },
  });
});

app.post("/api/public/survey/:token/proof-status", async (req:Request,res:Response)=>{
  const token=String(req.params.token||""),resolved=await resolveShareToken(token);
  if("error"in resolved){res.status(resolved.status).json({error:resolved.error});return;}
  if(resolved.link.kind!=="survey"){res.status(404).json({error:"هذا الرابط ليس استبياناً"});return;}
  if(!staffLookupAllowed(`${token}:proof-status`,req.ip||"unknown")){res.status(429).json({error:"محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة."});return;}
  const civil=asciiDigits((req.body||{}).civil).replace(/\D/g,""),sectionId=Number((req.body||{}).sectionId||0);
  if(!validateCivilId(civil).isValid||!sectionId){res.status(400).json({error:"أكمل الرقم المدني والقسم العلمي أولاً"});return;}
  const sections=await Repository.getSections();
  const section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  if(!section){res.status(400).json({error:"القسم العلمي غير صالح"});return;}
  const verified=await reusableGraduateVerification(resolved.link,civil,sectionId,(req.body||{}).caseRef);
  res.setHeader("Cache-Control","no-store");
  if(!verified){res.json({verified:false});return;}
  res.json({
    verified:true,eligible:true,passedUnits:verified.passedUnits,requiredUnits:verified.requiredUnits,proofToken:verified.proofToken,
    message:"تم التحقق مسبقًا من صحيفة التخرج، وأنت مجتاز للوحدات المطلوبة. يمكنك متابعة طلبك مباشرة.",
  });
});
app.post("/api/public/survey/:token/proof", readStudentProofBody, async (req:Request,res:Response)=>{
  const token=String(req.params.token||""),resolved=await resolveShareToken(token);
  if("error"in resolved){res.status(resolved.status).json({error:resolved.error});return;}
  if(resolved.link.kind!=="survey"){res.status(404).json({error:"هذا الرابط ليس استبياناً"});return;}
  if(!staffLookupAllowed(`${token}:proof`,req.ip||"unknown")){res.status(429).json({error:"محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة."});return;}
  if(surveyTermEnded((await Repository.getTerms()).find((row:any)=>Number(row.AdTermId)===Number(resolved.link.AdTermId)))){res.status(409).json({error:SURVEY_TERM_ENDED,code:"term-ended"});return;}
  const civil=asciiDigits(decodeURIComponent(String(req.get("x-student-civil")||""))).replace(/\D/g,""),name=decodeURIComponent(String(req.get("x-student-name")||"")).trim(),sectionId=Number(req.get("x-student-section")||0);
  if(!validateCivilId(civil).isValid||name.length<3){res.status(400).json({error:"أكمل الاسم والرقم المدني الصحيح أولاً"});return;}
  await graduateProofCore({collegeId:Number(resolved.link.AdCollegeId),termId:Number(resolved.link.AdTermId),civil,name,sectionId,
    bytes:Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0),mime:String(req.get("x-file-type")||"application/pdf").slice(0,80)},res);
});

app.post("/api/public/survey/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "survey") { res.status(404).json({ error: "هذا الرابط ليس استبياناً" }); return; }
  if (!staffLookupAllowed(token, req.ip || "unknown")) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }
  if (surveyTermEnded((await Repository.getTerms()).find((row: any) => Number(row.AdTermId) === Number(resolved.link.AdTermId)))) {
    res.status(409).json({ error: SURVEY_TERM_ENDED, code: "term-ended" });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const civil = asciiDigits(body.civil).replace(/\D/g, "");
  // The checksum is the whole gate: one person, one answer, and no account.
  if (!validateCivilId(civil).isValid) { res.status(400).json({ error: "الرقم المدني غير صحيح" }); return; }
  /* Replacing an existing request needs its case number, not only a civil ID
     anyone might know. */
  const priorNeed=await priorNeedForHand(resolved.link,civil);
  if(priorNeed&&!caseRefMatches(priorNeed,body.caseRef)){
    res.status(409).json({error:CASE_REF_REQUIRED,code:"case-ref-required"});return;
  }
  const submittedName = String(body.name || "").trim().slice(0, 60);
  const submittedSectionId=Number(body.sectionId||resolved.link.AdSectionId);
  const priorIdentity=await reusableStudentIdentity(resolved.link,civil);
  if(priorIdentity){
    if(submittedName&&normalizeStudentIdentityName(submittedName)!==normalizeStudentIdentityName(priorIdentity.name)){
      res.status(409).json({error:"بياناتك الأساسية متحققة سابقًا؛ لا يمكن تعديل الاسم أو القسم العلمي من هذا الاستبيان."});return;
    }
    if(submittedSectionId&&submittedSectionId!==Number(priorIdentity.sectionId)){
      res.status(409).json({error:"بياناتك الأساسية متحققة سابقًا؛ لا يمكن تعديل الاسم أو القسم العلمي من هذا الاستبيان."});return;
    }
  }
  const name=(priorIdentity?.name||submittedName).slice(0,60);
  if (name.length < 3) { res.status(400).json({ error: "اكتب اسمك كاملاً" }); return; }

  const sectionId=Number(priorIdentity?.sectionId||submittedSectionId),sections=await Repository.getSections();
  const section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId));
  if(!section){res.status(400).json({error:"اختر قسماً علمياً صحيحاً"});return;}
  const requestType=["new-course","course-conflict","graduate"].includes(String(body.requestType))?String(body.requestType) as "new-course"|"course-conflict"|"graduate":"new-course";
  const [courses, history] = await Promise.all([
    Repository.getCourses(),
    Repository.getSchedulesByScope({ sectionId }),
  ]);
  /* GET and POST use the exact same eligibility rule. Previously the page
     showed courses from teaching history while POST checked catalogue ownership;
     a real selection could therefore be rejected as if nothing had been picked. */
  /* The link decides the catalogue, not the section the student is enrolled
     in: someone who opened the Islamic Education form is asking about Islamic
     Education courses. A conflict is the one case that reaches wider, because
     the course being clashed with can belong to any department in the college. */
  const linkSectionId=Number(resolved.link.AdSectionId);
  const { allowed } = surveyCourseIdsForSection(courses, history, linkSectionId);
  const operationalLinkIds=await surveyActiveCourseIds(linkSectionId);
  for(const id of [...allowed])if(!operationalLinkIds.has(Number(id)))allowed.delete(Number(id));
  courses.filter((course:any)=>Number(course.AdSectionId)===linkSectionId&&operationalLinkIds.has(Number(course.AdCourseId)))
    .forEach((course:any)=>allowed.add(Number(course.AdCourseId)));
  if(requestType==="course-conflict"){
    const collegeSectionIds=sections.filter((row:any)=>Number(row.AdCollegeId)===Number(resolved.link.AdCollegeId)).map((row:any)=>Number(row.AdSectionId));
    const operationalBySection=new Map<number,Set<number>>(await Promise.all(collegeSectionIds.map(async sid=>[sid,await surveyActiveCourseIds(sid)] as [number,Set<number>])));
    courses.filter((course:any)=>operationalBySection.get(Number(course.AdSectionId))?.has(Number(course.AdCourseId)))
      .forEach((course:any)=>allowed.add(Number(course.AdCourseId)));
  }
  const courseIds = [...new Set((Array.isArray(body.courseIds) ? body.courseIds : [])
    .map(value => Number(asciiDigits(value))).filter(id => allowed.has(id)))].slice(0, 12);
  if(requestType==="new-course"&&!courseIds.length){res.status(400).json({error:"اختر المقرر الذي تحتاج فتحه"});return;}
  if(requestType==="course-conflict"&&courseIds.length!==2){res.status(400).json({error:"اختر مقررين متعارضين بالضبط"});return;}
  const graduateReasons=["field-conflict","field-prerequisite-conflict"],graduateReason=graduateReasons.includes(String(body.graduateReason))?String(body.graduateReason) as any:undefined;
  /* Graduate requests stay sortable by the approved reason, while the student
     gets one bounded requirement box AFTER choosing that reason. The selected
     reason remains the machine field; details is human context tied to it. */
  const details=requestType==="graduate"
    ?String(body.details||"").normalize("NFKC").replace(/\r\n?/g,"\n").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim().slice(0,600)
    :"";
  let passedUnits:number|undefined,requiredUnits:number|undefined,degreeUnits:number|undefined,graduateNameMatched:boolean|undefined,eligibility:"eligible"|"ineligible"|"not-checked"="not-checked";
  /* The plan a verified graduation sheet proved — the student's own
     curriculum, stronger evidence than which courses they happened to pick. */
  let provenPlanId:string|undefined;
  /* Keep a previously verified graduation sheet alive even when the student
     changes this survey answer to another request type. saveStudentNeed updates
     the record in place with the NEW answer's fields, so without this
     carry-forward the verified fact would disappear and the next graduate
     request would wrongly demand upload. */
  const reusableVerification=await reusableGraduateVerification(resolved.link,civil,sectionId,body.caseRef);
  if(requestType!=="graduate"&&reusableVerification){
    passedUnits=reusableVerification.passedUnits;requiredUnits=reusableVerification.requiredUnits;degreeUnits=reusableVerification.degreeUnits;provenPlanId=reusableVerification.curriculumPlanId;
    graduateNameMatched=reusableVerification.proofNameMatched;eligibility="eligible";
  }
  if(requestType==="graduate"){
    const checked=await graduateSubmitCheck({civil,sectionId,termId:Number(resolved.link.AdTermId),proofToken:String(body.proofToken||""),reusableProofToken:reusableVerification?.proofToken});
    if("error"in checked){res.status(checked.error.status).json(checked.error.body);return;}
    passedUnits=checked.passedUnits;requiredUnits=checked.requiredUnits;degreeUnits=checked.degreeUnits;provenPlanId=checked.provenPlanId;graduateNameMatched=checked.nameMatched;eligibility=checked.eligibility;
    if(!graduateReason){res.status(400).json({error:"اختر نوع طلب الميداني"});return;}
    /* Graduate notes are mandatory, not an optional comment. The approved
       reason is the sortable machine field; these notes are the human reason
       the department needs before it can act on the case. */
    if(details.length<3){res.status(400).json({error:"اكتب ملاحظات الطلب وسبب احتياجك قبل الإرسال"});return;}
  }

  let curriculumPlanId:string|undefined=provenPlanId;
  if(!curriculumPlanId&&courseIds.length){
    const [plans,memberships]=await Promise.all([Repository.getCurriculumPlans(linkSectionId),Repository.getCurriculumPlanCourses(linkSectionId)]);
    const linkCourseIds=courseIds.filter(id=>courses.some((course:any)=>Number(course.AdCourseId)===Number(id)&&Number(course.AdSectionId)===linkSectionId));
    const requestedPlanId=String(body.curriculumPlanId||"");
    const candidates=plans.filter(plan=>plan.status!=="archived"&&linkCourseIds.every(id=>memberships.some(row=>row.planId===plan.id&&Number(row.AdCourseId)===Number(id))));
    const requested=candidates.find(plan=>plan.id===requestedPlanId);
    curriculumPlanId=(requested||candidates.length===1?requested||candidates[0]:undefined)?.id;
  }

  const savedNeed = await Repository.saveStudentNeed({
    fingerprint: await surveyFingerprint(civil),
    AdCollegeId: resolved.link.AdCollegeId,
    // Keep the student's own section for degree-rule context, but separately
    // pin the request to the department whose survey link they actually opened.
    // Previously AdSectionId did both jobs, so answers from students in another
    // section were saved successfully and then disappeared from the target
    // department's dashboard.
    AdSectionId: sectionId,
    studentSectionId: sectionId,
    surveySectionId: linkSectionId,
    surveyLinkId: resolved.link.id,
    AdTermId: resolved.link.AdTermId,
    courseIds,
    requestType,curriculumPlanId,nameCipher:await sealStudentIdentity(name),civilCipher:await sealStudentIdentity(civil),details,
    graduateReason,passedUnits,requiredUnits,degreeUnits,eligibility,proofNameMatched:graduateNameMatched,
  });
  studentQueueMemo.invalidate();
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ name, count: courseIds.length, requestType, caseRef: caseRefFor(savedNeed) });
});

app.post("/api/public/survey/:token/my-case", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  /* القراءةُ تتبع مهلةَ الحالة لا بابَ الإرسال. */
  const resolved = await resolveSurveyStatusToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (!staffLookupAllowed(`mycase:${token}`, req.ip || "unknown")) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." });
    return;
  }

  /* «٢٩٠…» و«۲۹۰…» رقمٌ صحيح كُتب بلوحةٍ عربية، لا خطأ. والتحقق يُقرأ من
     `.isValid`: الدالة تُرجع كائناً، و`!كائن` لا يكون صحيحاً أبداً — فكان
     أيُّ اثني عشر رقماً مخترعاً يمرّ إلى المخزن. */
  const civil = toEnglishDigits(req.body?.civil).replace(/\D/g, "");
  if (civil.length !== 12 || !validateCivilId(civil).isValid) {
    res.status(400).json({ error: "أدخل الرقم المدني من 12 رقماً كما في بطاقتك." });
    return;
  }

  const fingerprint = await surveyFingerprint(civil);
  const [needs, courses, terms] = await Promise.all([
    Repository.getStudentNeedsByFingerprint(fingerprint, Number(resolved.link.AdCollegeId), Number(resolved.link.AdTermId)),
    Repository.getCourses(),
    Repository.getTerms(),
  ]);
  /* بالرقم المدني **ورقم الحالة** معاً: الرقمُ المدنيُّ وحده يعرفه غيرُ
     صاحبه. وخطأُ أيٍّ منهما جوابُه واحد: «لا طلب» — فلا يكشف لمن يجرّب. */
  const mine = (needs as any[]).find(need =>
    String(need?.fingerprint || "") === fingerprint
    && Number(need?.surveySectionId || need?.AdSectionId || 0) === Number(resolved.link.AdSectionId)
    && caseRefMatches(need, req.body?.caseRef));

  res.setHeader("Cache-Control", "no-store");
  if (!mine) {
    /* «لا طلبَ لك» لا «الرقم خطأ»: التفريقُ بينهما يكشف لمن يجرّب أرقاماً من
       عبّأ الاستبيان ومن لم يعبّئه. */
    res.json({ found: false, term: String((terms as any[]).find(row => Number(row.AdTermId) === Number(resolved.link.AdTermId))?.AdTermName || "") });
    return;
  }

  const nameOf = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const codeOf = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseCode || "")]));
  /* «سلّمته للتسجيل» لا يُقال والتسجيلُ لا يرى الكشف أصلاً: التسجيلُ لا يقرأ
     طلباتِ قسمٍ لم يوقّع جدولَه (registrarBlockReason). فما وافقت عليه اللجنة
     وجدولُ قسمه غير موقّع يُقال فيه ما هو: بانتظار اكتمال اعتماد جدول القسم. */
  const signedCache = new Map<number, boolean>();
  const sectionSigned = async (sectionId: number) => {
    if (!signedCache.has(sectionId)) signedCache.set(sectionId,
      isFullySigned(await readApproval(Number(mine.AdCollegeId), sectionId, Number(mine.AdTermId))));
    return Boolean(signedCache.get(sectionId));
  };
  const ownerOf = new Map((courses as any[]).map(row => [Number(row.AdCourseId), Number(row.AdSectionId || 0)]));
  const surveySection = Number(mine.surveySectionId || mine.AdSectionId || 0);
  const handedButUnsigned = async (courseId: number | null) =>
    !(await sectionSigned(courseId === null ? surveySection : (ownerOf.get(courseId) || surveySection)));
  const courseIdsForStudent = [
    ...(Array.isArray(mine.courseIds) ? mine.courseIds : []),
    ...(mine.courseStates || []).filter((entry: any) => entry?.droppedByStudent).map((entry: any) => entry.courseId),
  ].filter((id: any, index: number, all: any[]) => all.map(Number).indexOf(Number(id)) === index);
  const courseRows = await Promise.all(courseIdsForStudent.map(async (id: any) => {
    const state: any = (mine.courseStates || []).find((entry: any) => Number(entry.courseId) === Number(id));
    return {
      code: codeOf.get(Number(id)) || "",
      name: nameOf.get(Number(id)) || `مقرر ${id}`,
      /* ما لم يُقل فيه شيءٌ بعد يبقى بلا حالة، ولا يُسمّى «بانتظار التسجيل»:
         الانتظارُ قولٌ يقوله القسمُ حين يسلّم، لا حالةٌ تُفترض. */
      state: state?.state === "awaiting-registration" && !state?.droppedByStudent && await handedButUnsigned(Number(id))
        ? "awaiting-signatures" : (state?.state || ""),
      reason: state?.reasonCode || "",
      note: state?.note || "",
      dropped: state?.droppedByStudent ? droppedCourseLabel(state) : "",
    };
  }));
  const caseStatus = isCaseLevelNeed(mine) ? studentCaseStatus(mine.caseState) : "";
  res.json({
    found: true,
    /* الرقمُ نفسه الذي أُعطي له لحظةَ الإرسال، مشتقٌّ من معرّف السجلّ لا
       مولَّدٌ من جديد — فلو اختلفا لظنّ أنه أرسل مرّتين. */
    caseRef: caseRefFor(mine),
    submittedAt: String(mine.createdAt || ""),
    requestType: String(mine.requestType || "new-course"),
    term: String((terms as any[]).find(row => Number(row.AdTermId) === Number(mine.AdTermId))?.AdTermName || ""),
    /* طلبُ الخريج لا مقرّرات فيه: قرارُه قرارٌ في الحالة كلها، ويصل الطالبَ
       بسببه وسطره كما تصل قراراتُ المقرّرات. */
    caseLevel: isCaseLevelNeed(mine),
    caseStatus: caseStatus === "approved" && await handedButUnsigned(null) ? "awaiting-signatures" : caseStatus,
    caseDecision: isCaseLevelNeed(mine) ? {
      committee: mine.caseState?.committee ? { state: mine.caseState.committee.state, reason: mine.caseState.committee.reasonCode || "", note: mine.caseState.committee.note || "" } : null,
      registrar: mine.caseState?.registrar ? { state: mine.caseState.registrar.state, reason: mine.caseState.registrar.reasonCode || "", note: mine.caseState.registrar.note || "" } : null,
    } : null,
    courses: courseRows,
  });
});

/** بابُ «حالة طلبي». الرابطُ نفسه الذي عبّأ منه الطالب، بمسارٍ آخر. */
app.get("/m/:token", async (req: Request, res: Response) => {
  const resolved = await resolveSurveyStatusToken(String(req.params.token || ""));
  res.setHeader("Cache-Control", "no-store");
  if ("error" in resolved) {
    const message = resolved.error;
    const status = resolved.status;
    res.status(status).type("text/html; charset=utf-8").send(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الرابط</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png"><style>@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:0 24px;box-sizing:border-box;background:var(--bg);color:var(--ink);font:400 16px/1.7 "Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;text-align:center}.brand{font:600 13px/1 system-ui;letter-spacing:.24em;color:var(--brass);margin-bottom:12px}p{margin:0;font-size:15px;color:var(--muted)}</style></head><body><div><div class="brand">SCHEDULE</div><p>${message}</p></div></body></html>`);
    return;
  }
  res.type("text/html; charset=utf-8").send(studentCaseStatusPage(resolved.link.id, publicPageNonce(res), await demoPageHint(resolved.link, "status")));
});

app.get("/q/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  if ("error" in resolved) {
    res.status(resolved.status).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png"><style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal}p{font-size:15px;color:var(--muted)}</style></head><body><div style="text-align:center"><div style="font:600 13px/1 system-ui;letter-spacing:.24em;color:var(--brass)">SCHEDULE</div><p>${esc(resolved.error)}</p></div></body></html>`);
    return;
  }
  if (resolved.link.kind !== "survey") { res.status(404).send("<!doctype html><html lang=ar dir=rtl><head><meta charset=utf-8><meta name=viewport content=width=device-width,initial-scale=1><title>SCHEDULE</title><link rel=icon href=/schedule-icon.svg type=image/svg+xml><link rel=apple-touch-icon href=/schedule-icon-192.png></head><body><p dir=rtl>هذا الرابط ليس استبياناً.</p></body></html>"); return; }
  /* الاستبيانُ صار «مساري»: الرابطُ القديم (المطبوعُ على لوحاتٍ) يفتح البابَ نفسَه. والتجريبيُّ يبقى على صفحته لأن صندوقه لا يُقرأ من /me. */
  if (!isDemoLinkToken(String(req.params.token))) { res.redirect(302, "/me"); return; }
  res.send(studentCaseSurveyPage(resolved.link.id, esc(resolved.link.label || "استبيان المقررات"), publicPageNonce(res), await demoPageHint(resolved.link, "survey")));
});
}

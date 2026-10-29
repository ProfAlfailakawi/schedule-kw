/**
 * ── هويةُ الطالب وقواعدُ التخرّج وإثباتُه ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { Repository } from "../../db/repository";
import { validateCivilId } from "../../utils/civilId";
import { toEnglishDigits } from "../../utils/digits";
import { termHasEnded } from "../../utils/termSequence";
import type { CurriculumPlan } from "../../types";
import { isViewerOnlyRole } from "../../utils/academicRoles";
import { AR, countOf, oblique } from "../../utils/arabicCount";
import { suggestedDegreeRule, type DegreeRule } from "../../utils/degreeRules";
import { choosePlanForSheet, type PlanRuleCandidate } from "../../utils/graduationPlan";
import { ocrGraduationSheetDocument, graduationSheetFacts } from "../../utils/documentOcr";
import type { AuthenticatedRequest } from "./auth";
import { academicSectionNameMatches } from "./ordering";

/**
 * ── الاستبيان ───────────────────────────────────────────────────────────────
 *
 * A door for students, and the only one in the system. It is scoped to ONE
 * section by the link itself, and that is load-bearing: sections here are
 * already separated by gender, so the link decides which cohort is answering
 * and nobody has to guess anything from a person's name. A boys' survey and a
 * girls' survey are two links, issued the same way as any other.
 *
 * The civil ID is checked against the Kuwaiti checksum — an invented number
 * never reaches the store. It is then kept in two forms: a keyed HMAC
 * fingerprint (the duplicate key, which identifies nobody on its own) AND,
 * together with the name, a field-level AES-256-GCM ciphertext, because the
 * authorised department and registration need to know who a case belongs to.
 * Neither plaintext is logged or sent to anyone outside those screens; an
 * existing case is opened on the public pages only with civil ID + case number.
 */
/* الوعدُ محفوظٌ للعملية كلها، فيُقرأ السرُّ الحقيقيُّ دائماً — خارج صندوق العرض
   (getSharedServerSecret). كان يُقرأ بسياق أوّل طالبٍ يسأله: فإن كان زائراً
   تجريبياً حُفظ مفتاحُ الصندوق المحلي للنسخة كلها، فخُتمت به هوياتُ الطلبة
   الحقيقيين وبصماتُهم بعده — مفتاحٌ لا تعرفه النسخُ الأخرى. */
let studentCaseSecretPromise: Promise<string> | null = null;
const studentCaseSecret = () => studentCaseSecretPromise ||= Repository.getSharedServerSecret();
export const surveyFingerprint = async (civil: string) =>
  createHmac("sha256", await studentCaseSecret()).update(`need|${civil}`).digest("hex").slice(0, 32);

export const studentIdentityKey = async () => createHmac("sha256", await studentCaseSecret()).update("student-case-identity-v1").digest();
export const sealStudentIdentity=async(value:string)=>{
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",await studentIdentityKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]),tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,encrypted]).toString("base64url");
};
export const openStudentIdentity=async(value?:string)=>{
  const raw=String(value||""); if(!raw) return "";
  const decryptWith=async(key:Buffer)=>{const payload=Buffer.from(raw,"base64url"),iv=payload.subarray(0,12),tag=payload.subarray(12,28),encrypted=payload.subarray(28),cipher=createDecipheriv("aes-256-gcm",key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(encrypted),cipher.final()]).toString("utf8")};
  try{return await decryptWith(await studentIdentityKey());}
  catch{
    // One-release bridge for records written before the shared key existed. If
    // CALENDAR_SECRET was configured stably, old cases remain readable and can
    // coexist with new shared-key cases. Per-instance random legacy records are
    // cryptographically unrecoverable once the writing instance disappears.
    const legacyCalendarSecret=String(process.env.CALENDAR_SECRET||"").trim();
    if(!legacyCalendarSecret) return "";
    try{return await decryptWith(createHmac("sha256",legacyCalendarSecret).update("student-case-identity-v1").digest());}catch{return"";}
  }
};

/**
 * ── من يرى اسمَ الطالب ورقمه المدني ─────────────────────────────────────────
 * One rule for the two screens that show them (the intelligence centre's case
 * register and the registration sheet): the department and registration staff
 * who act on a case see who it belongs to; the view-only roles (dean, vice
 * dean, registrar dean) read the same register without the identity.
 */
const canSeeStudentIdentity = (req: AuthenticatedRequest): boolean => !isViewerOnlyRole(req.user?.Role);
export const studentIdentityFor = async (req: AuthenticatedRequest, need: any): Promise<{ name: string; civil: string }> => {
  if (!canSeeStudentIdentity(req)) return { name: "", civil: "" };
  const [name, civil] = await Promise.all([openStudentIdentity(need?.nameCipher), openStudentIdentity(need?.civilCipher)]);
  return { name, civil };
};

/** The name-derived SUGGESTION lives once, in src/utils/degreeRules.ts. It is
 * never a rule a student is measured against until the department saves it. */
export const degreeRuleFromName=suggestedDegreeRule;

/**
 * The rule a department is actually judged by.
 *
 * This is what the graduate case in the student survey measures a transcript
 * against, so it decides whether a real student is told they are eligible. It
 * was inferred from the department NAME by regular expression: a department
 * earned 134 units by containing the word «انجليزي», and every department that
 * matched nothing fell to 130 — a number nobody chose, that no screen showed,
 * and that a rename could change without anyone noticing. A stored rule now
 * wins; the name heuristic remains only as the seed for departments nobody has
 * reviewed yet.
 */
const degreeRuleForSection=async(sectionId:number,sectionName:string):Promise<DegreeRule&{reviewed:boolean}>=>{
  const stored=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===Number(sectionId));
  if(!stored)return{...degreeRuleFromName(sectionName),reviewed:false};
  return{
    degreeUnits:Number(stored.degreeUnits),
    fieldTrainingRequired:Number(stored.fieldTrainingRequired),
    graduateRegularPassed:Number(stored.graduateRegularPassed),
    graduateSummerPassed:Number(stored.graduateSummerPassed),
    reviewed:true,
  };
};

/** Graduate proof is a hard data gate, so it never falls back to the historical
 * name heuristic. The department's saved academic rule must exist. */
export const storedDegreeRuleForSection=async(sectionId:number):Promise<DegreeRule|null>=>{
  const stored=(await Repository.getDegreeRules()).find(row=>Number(row.AdSectionId)===Number(sectionId));
  if(!stored)return null;
  const rule={
    degreeUnits:Number(stored.degreeUnits),
    fieldTrainingRequired:Number(stored.fieldTrainingRequired),
    graduateRegularPassed:Number(stored.graduateRegularPassed),
    graduateSummerPassed:Number(stored.graduateSummerPassed),
  };
  return Object.values(rule).every(value=>Number.isFinite(value)&&value>0)?rule:null;
};

/** A plan's own graduation rule. «الصحيفة السابقة» created before rules moved
 * onto plans carries none; its students are the ones the department's saved
 * rule was written for, so that rule answers for it. */
export const planDegreeRule=(plan:CurriculumPlan,sectionRule:DegreeRule|null):DegreeRule|null=>{
  const own=plan.degreeRule;
  if(own){
    const rule={degreeUnits:Number(own.degreeUnits),fieldTrainingRequired:Number(own.fieldTrainingRequired),graduateRegularPassed:Number(own.graduateRegularPassed),graduateSummerPassed:Number(own.graduateSummerPassed)};
    return Object.values(rule).every(value=>Number.isFinite(value)&&value>0)?rule:null;
  }
  return plan.code==="LEGACY"?sectionRule:null;
};

/**
 * ── قواعد التخرج في المرحلة الانتقالية ─────────────────────────────────────
 * The rules a graduate of this department may be measured against: one per
 * live curriculum plan, or the department's own rule when it has no plans.
 * Every graduate path (survey payload, proof, reuse, submit) asks this one
 * function; `choosePlanForSheet` then picks the student's plan from the sheet.
 */
export const graduationCandidatesForSection=async(sectionId:number):Promise<PlanRuleCandidate[]>=>{
  const [plans,sectionRule]=await Promise.all([Repository.getCurriculumPlans(sectionId),storedDegreeRuleForSection(sectionId)]);
  /* The current plan first, everywhere these are listed. */
  const live=plans.filter(plan=>plan.status!=="archived"&&!plan.virtual).sort((a,b)=>Number(b.status==="active")-Number(a.status==="active"));
  if(!live.length)return[{planName:"قواعد القسم",status:"section",rule:sectionRule}];
  return live.map(plan=>({planId:plan.id,planName:plan.name,status:plan.status==="active"?"active":"transition",rule:planDegreeRule(plan,sectionRule)}));
};
/** The rule a verified sheet was measured against, re-read NOW: a rule edited
 * after the upload applies, a plan archived since then does not. A proof with
 * no plan (issued before plans carried rules) is valid only while one rule stands. */
export const graduationRuleFor=(candidates:PlanRuleCandidate[],planId:unknown):PlanRuleCandidate&{rule:DegreeRule}|null=>{
  const ruled=candidates.filter((row):row is PlanRuleCandidate&{rule:DegreeRule}=>Boolean(row.rule));
  const id=String(planId||"");
  if(id)return ruled.find(row=>row.planId===id)||null;
  return candidates.length===1&&ruled.length===1?ruled[0]:null;
};

/**
 * Which number a graduate case is measured against.
 *
 * A summer term and a regular term do not ask for the same total, and the
 * survey link already knows which term it belongs to — so the threshold follows
 * the term rather than being one figure for the whole year.
 */
export const isSummerTerm=(termName:string)=>/صيفي|صيفى|summer/i.test(String(termName||""));
export const graduateThreshold=(rule:DegreeRule,termName:string)=>
  isSummerTerm(termName)?Number(rule.graduateSummerPassed):Number(rule.graduateRegularPassed);
/** How long a verified graduation sheet stays usable in one page session. */
const STUDENT_PROOF_TTL_MS=20*60_000;
export const issueStudentProof=async(payload:{fingerprint:string;sectionId:number;passedUnits:number;requiredUnits:number;degreeUnits:number;curriculumPlanId?:string;nameMatched:boolean;specializationMatched:boolean;documentKind:"graduation-sheet"})=>{
  const body=Buffer.from(JSON.stringify({...payload,exp:Date.now()+STUDENT_PROOF_TTL_MS})).toString("base64url");
  const signature=createHmac("sha256",await studentIdentityKey()).update(body).digest("base64url");return`${body}.${signature}`;
};
/** A genuine proof whose time ran out — told apart from a missing or forged one
 * so the page can reopen the upload instead of a dead end. */
const studentProofExpired=async(token:string)=>{
  try{const[body,signature]=String(token||"").split("."),expected=createHmac("sha256",await studentIdentityKey()).update(body).digest("base64url");if(!body||signature!==expected)return false;const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));return Number(payload.exp)<=Date.now();}catch{return false;}
};
const verifyStudentProof=async(token:string)=>{
  try{const[body,signature]=String(token||"").split("."),expected=createHmac("sha256",await studentIdentityKey()).update(body).digest("base64url");if(!body||signature!==expected)return null;const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));return Number(payload.exp)>Date.now()?payload:null;}catch{return null;}
};

/* One numeric alphabet: the shared converter, not a second copy of it. */
export const asciiDigits = toEnglishDigits;

export const surveyCohort = (sectionName: string) => {
  const text = String(sectionName || "");
  if (/بنات|طالبات|إناث|اناث/.test(text)) return { cohort: "girls", cohortLabel: "طالبات" };
  if (/بنين|طلاب|ذكور/.test(text)) return { cohort: "boys", cohortLabel: "طلاب" };
  return { cohort: "mixed", cohortLabel: "طلبة القسم" };
};

/**
 * The courses a survey treats as ACTIVE for one department — one rule for the
 * page that lists them (GET), the answer that is checked (POST) and the
 * department's reading of the answers (demand). GET used curriculumOverview,
 * which drops catalogue courses that have no plan membership, while POST and
 * demand used getOperationalCourseIds, which keeps them: a course could be
 * accepted and counted but never offered, or the reverse.
 */
export const surveyActiveCourseIds = (sectionId: number): Promise<Set<number>> => Repository.getOperationalCourseIds(sectionId);

/**
 * انتهى الفصلُ الذي يجمع له الاستبيان: مرّ تاريخُ نهايته، أو أعلن صاحبُ
 * الصلاحية انتهاءه. قاعدةٌ واحدة يسألها إصدارُ الرابط، وقراءتُه، والإرسال.
 */
export const surveyTermEnded = (term: any): boolean => Boolean(term) && (term.AdTermClosed === true || termHasEnded(term));

/* ── قائمةُ مقرّرات الاستبيان تُبنى مرّةً لكل رابط ────────────────────────
 * بناؤها يقرأ أرشيفَ الجداول كلّه (عشر سنوات) وخطةَ كل قسم. وكان يُعاد لكل
 * طالبٍ يفتح الرابط — ومئاتُ الطلبة يفتحونه في اليوم نفسه. والقائمةُ لا تتغيّر
 * بين طالبٍ وآخر، فتُحفظ عشرَ دقائق ويأخذها من بعده فوراً. */
export const surveyPayloadCache = new Map<string, { at: number; payload: any }>();
/* التحقّق من صحيفة التخرّج: واحدٌ للاستبيان القديم ولبابِ «مساري» — القاعدة في موضعٍ واحد. تكتب ردَّها في `res` (أي كائنٍ بـ status().json()). */
type GraduateProofSink={status:(code:number)=>{json:(body:any)=>void};json:(body:any)=>void};
export async function graduateProofCore(a:{collegeId:number;termId:number;civil:string;name:string;sectionId:number;bytes:Buffer;mime:string},res:GraduateProofSink):Promise<void>{
  const{civil,name,sectionId}=a;
  const sections=await Repository.getSections(),section=sections.find((row:any)=>Number(row.AdSectionId)===sectionId&&Number(row.AdCollegeId)===a.collegeId);
  if(!section){res.status(400).json({error:"القسم العلمي غير صالح"});return;}
  /* The saved academic rule is a precondition, checked BEFORE the expensive
     OCR: without it no sheet can be judged, so reading one only burned the
     student's upload and the server's memory to say «no rule» afterwards. */
  const ruleCandidates=await graduationCandidatesForSection(sectionId);
  if(!ruleCandidates.some(row=>row.rule)){res.status(422).json({error:"لا توجد قواعد تخرج أكاديمية معتمدة لهذا القسم في النظام. لا يمكن التحقق من صحيفة التخرج قبل اعتمادها من إدارة القسم.",code:"no-degree-rule"});return;}
  const bytes=a.bytes;if(!bytes.length){res.status(400).json({error:"ارفع صحيفة التخرج PDF أو صورة واضحة"});return;}
  const mime=a.mime;
  let ocr;
  try{ocr=await ocrGraduationSheetDocument(bytes,mime);}
  catch(error:any){/* رسالةُ مكتبةٍ إنجليزية («Invalid PDF structure») لا تُقال للطالب: نصٌّ عربيٌّ واحد. */
    const why=String(error?.message||"");
    res.status(422).json({error:/[\u0621-\u064A]/.test(why)?why:"تعذّرت قراءة الإثبات. ارفع صورة أوضح أو ملف PDF."});return;}
  const facts=graduationSheetFacts(ocr.text);
  const civilCandidates=(Array.isArray(facts.civilCandidates)?facts.civilCandidates:[])
    .map((value:any)=>asciiDigits(value).replace(/\D/g,""))
    .filter((value:string,index:number,array:string[])=>value.length===12&&validateCivilId(value).isValid&&array.indexOf(value)===index);
  /* Exact identity remains the hard gate. Ignore timestamp-like 12-digit OCR
     noise by checksum, then accept the entered civil when it appears either as
     one token or as digit groups on ONE visual line. No digit is repaired or
     guessed. This restores the official Authority screenshot where Tesseract
     may emit «3000 1010 0122» instead of «300010100122». */
  const proofAscii=asciiDigits(String(ocr.text||""));
  const escapedCivil=civil.split("").map(d=>d.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("[ \t\u00a0\u200e\u200f.-]{0,3}");
  const civilVisible=civilCandidates.includes(civil)||new RegExp(`(?:^|[^0-9])${escapedCivil}(?:[^0-9]|$)`).test(proofAscii);
  const hasPassedEvidence=Number(facts.passedUnits)>0||(Array.isArray(facts.passedUnitCandidates)&&facts.passedUnitCandidates.length>0);
  const proofFactsReadable=Boolean(facts.isGraduationSheet&&civilVisible&&Number(facts.passedUnits)>0)
    ||Boolean(facts.isGraduationSheet&&civilVisible&&hasPassedEvidence);
  if(!ocr.legibility.readable&&!proofFactsReadable){res.status(422).json({error:ocr.legibility.reason});return;}
  if(!facts.isGraduationSheet){
    res.status(422).json({error:"الملف المرفوع ليس صحيفة التخرج/الخطة الدراسية المعتمدة. ارفع الصفحة الرسمية التي يظهر فيها البرنامج والوحدات المجتازة."});return;
  }
  if(!civilCandidates.length&&!civilVisible){res.status(422).json({error:"لم أتعرف على الرقم المدني في صحيفة التخرج. ارفع نسخة أوضح يظهر فيها الرقم كاملاً."});return;}
  if(!civilVisible){res.status(422).json({error:"الرقم المدني في الإثبات لا يطابق الرقم المدخل."});return;}
  /* The typed name is for the department's human-facing case card, not a hard
     proof key. Students may enter first + last name while the Authority sheet
     prints the full civil name. Civil ID remains the 100% identity gate. */
  const foldName=(value:string)=>String(value||"").replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z ]/g," ").replace(/\s+/g," ").trim().toLowerCase();
  const documentName=foldName(ocr.text),nameWords=foldName(name).split(" ").filter(word=>word.length>=3),nameMatched=nameWords.length>0&&nameWords.some(word=>documentName.includes(word));
  /* Only the programme row decides the specialization — never words anywhere
     else on the sheet. No readable programme row fails closed. */
  const programmeText=String(facts.programmeText||"");
  if(!programmeText){
    res.status(422).json({code:"programme-unreadable",error:"لم أتعرف على سطر «البرنامج» في صحيفة التخرج. ارفع الصفحة الرسمية كاملة وبوضوح يظهر فيها البرنامج."});return;
  }
  const specializationMatched=academicSectionNameMatches(programmeText,String(section.AdSectionName||""));
  if(!specializationMatched){
    res.status(422).json({error:`التخصص الظاهر في صحيفة التخرج لا يطابق القسم المحدد «${String(section.AdSectionName||"")}». اختر قسمك الصحيح وارفع صحيفتك أنت.`});return;
  }
  /* Required graduation units come from the selected department's reviewed
     academic rule. OCR only has to prove the student's PASSED units. The
     Authority screenshot lays its values in a visual row, so sparse OCR can
     read the label and the number with programme text between them. When the
     immediate label-value pair is missing, resolve only the bounded candidates
     next to «الوحدات المجتازة», anchored by the department's degree total. */
  /* Old or new curriculum: the sheet's own «الوحدات المطلوبة» decides, in
     src/utils/graduationPlan.ts. Never measured against another plan's rule. */
  const planChoice=choosePlanForSheet(ruleCandidates,{requiredUnits:Number(facts.requiredUnits||0),requiredUnitCandidates:facts.requiredUnitCandidates,passedUnits:Number(facts.passedUnits||0)});
  if("error" in planChoice){res.status(422).json({code:planChoice.code,error:planChoice.error});return;}
  const rule=planChoice.candidate.rule,curriculumPlanId=planChoice.candidate.planId;
  const degreeUnits=Number(rule.degreeUnits);
  const resolvePassedUnits=()=>{
    const direct=Number(facts.passedUnits||0);if(direct>0)return direct;
    const near=(Array.isArray(facts.passedUnitCandidates)?facts.passedUnitCandidates:[])
      .map((value:any)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>=60&&value<=degreeUnits);
    const candidates=near.length?near:(Array.isArray(facts.unitCandidates)?facts.unitCandidates:[])
      .map((value:any)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>=60&&value<=degreeUnits);
    if(!candidates.length)return 0;
    if(candidates.length===1)return candidates[0]===degreeUnits?0:candidates[0];
    const remaining=[...candidates];
    const degreeIndex=remaining.indexOf(degreeUnits);
    if(degreeIndex>=0)remaining.splice(degreeIndex,1);
    return remaining.filter(value=>value<=degreeUnits).sort((a,b)=>b-a)[0]||0;
  };
  const passedUnits=resolvePassedUnits();
  if(!passedUnits){res.status(422).json({error:"لم أتعرف على مجموع الوحدات المجتازة في صحيفة التخرج. ارفع الصفحة الرسمية كاملة وبوضوح."});return;}
  const terms=await Repository.getTerms();
  const termName=String(terms.find((row:any)=>Number(row.AdTermId)===a.termId)?.AdTermName||"");
  const required=graduateThreshold(rule,termName),summer=isSummerTerm(termName);
  const eligible=passedUnits>=required;
  if(!eligible){res.status(422).json({error:`لم تُستوفَ وحدات الخريج/المتوقع تخرجه: الصحيفة تظهر اجتياز ${countOf(passedUnits, oblique(AR.unit))}، والمطلوب ${required} في ${summer?"الفصل الصيفي":"الفصل العادي"}${ruleCandidates.length>1?` حسب «${planChoice.candidate.planName}»`:""}.`});return;}
  const proofToken=await issueStudentProof({fingerprint:await surveyFingerprint(civil),sectionId,passedUnits,requiredUnits:required,degreeUnits:Number(rule.degreeUnits),curriculumPlanId,nameMatched,specializationMatched,documentKind:"graduation-sheet"});
  const planNote=ruleCandidates.length>1?` حسب «${planChoice.candidate.planName}»`:" حسب بيانات قسمك";
  res.json({eligible:true,passedUnits,requiredUnits:required,degreeUnits:Number(rule.degreeUnits),termName,summer,planName:ruleCandidates.length>1?planChoice.candidate.planName:undefined,
    message:`تم التحقق من صحيفة التخرج: الرقم المدني والقسم والوحدات المجتازة مطابقة. اجتزت ${countOf(passedUnits, oblique(AR.unit))}، والمطلوب ${required}${planNote}. يمكنك متابعة الطلب.`,
    proofToken,confidence:ocr.confidence});

}

/* ما يُتحقَّق منه عند إرسال طلب الخريج: رمزُ الإثبات حيّ، ولهذا الطالب والقسم، والعتبةُ من القاعدة الحالية لفصل الطلب. واحدةٌ للاستبيان القديم ولـ«مساري». */
export async function graduateSubmitCheck(a:{civil:string;sectionId:number;termId:number;proofToken:string;reusableProofToken?:string}):Promise<
  {error:{status:number;body:any}}|{passedUnits:number;requiredUnits:number;degreeUnits:number;provenPlanId?:string;nameMatched:boolean;eligibility:"eligible"|"ineligible"}>{
  const{civil,sectionId}=a;
  let proof=await verifyStudentProof(a.proofToken);
  if(!proof&&a.reusableProofToken){
    proof=await verifyStudentProof(a.reusableProofToken);
  }
  const ruleCandidates=await graduationCandidatesForSection(sectionId);
  if(!ruleCandidates.some(row=>row.rule))return{error:{status:400,body:{error:"قواعد التخرج الأكاديمية لهذا القسم غير معتمدة في النظام"}}};
  const provenPlan=proof?graduationRuleFor(ruleCandidates,proof.curriculumPlanId):null;
  const currentRule=provenPlan?.rule;
  if(!proof&&await studentProofExpired(a.proofToken)){
    return{error:{status:400,body:{code:"proof-expired",error:"انتهت مهلة التحقق من صحيفة التخرج (20 دقيقة). أعد رفعها للتحقق — ملاحظاتك ونوع طلبك باقيان في الصفحة."}}};
  }
  if(!proof||!currentRule||proof.fingerprint!==await surveyFingerprint(civil)||Number(proof.sectionId)!==sectionId||proof.documentKind!=="graduation-sheet"||proof.specializationMatched!==true||Number(proof.degreeUnits)!==Number(currentRule.degreeUnits)){
    return{error:{status:400,body:{code:"proof-required",error:"ارفع صحيفة التخرج الرسمية وتحقق منها قبل إرسال حالة الخريج"}}};
  }
  /* The threshold is the CURRENT saved rule for the request's term — never the
     figure carried inside the proof token, which was computed for whatever
     term and rule applied when the sheet was read. */
  const termName=String((await Repository.getTerms()).find((row:any)=>Number(row.AdTermId)===Number(a.termId))?.AdTermName||"");
  const passedUnits=Number(proof.passedUnits||0),requiredUnits=graduateThreshold(currentRule,termName);
  const eligibility=requiredUnits>0&&passedUnits>=requiredUnits?"eligible" as const:"ineligible" as const;
  if(eligibility!=="eligible")return{error:{status:400,body:{error:`غير مجتاز للوحدات المطلوبة (${requiredUnits})`}}};
  return{passedUnits,requiredUnits,degreeUnits:Number(currentRule.degreeUnits),provenPlanId:provenPlan?.planId,nameMatched:Boolean(proof.nameMatched),eligibility};
}

/**
 * ── فيلم الفصل: قراءةٌ فقط ──
 *
 * مساران يقرآن ولا يكتبان شيئاً: نسخة القسم لأصحاب جدوله (رئيس اللجنة ورئيس
 * القسم)، ونسخة الكلية للعميد ومساعده. الأستاذ لا يرى الفيلم، ولا يحمل الجواب
 * اسم قاعة ولا اسم أستاذ ولا رقماً مدنياً — أعداداً وتواريخ فقط.
 *
 * والقراءة تعمل قبل الاعتماد النهائي أيضاً: `final` يقول هل اعتمد التسجيل،
 * والشاشة تروي «حتى الآن» حتى يصبح نهائياً. لا رسائل تُرسل من هنا: المشاركة
 * رابطٌ ينسخه صاحبه بيده.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import type { FSchedule } from "../../types";
import { approvalBlockerCount } from "../../utils/scheduleBlockers";
import { isAcademicRole } from "../../utils/academicRoles";
import {
  buildFromRows, clashFromCounts, deanFilm, deliveryFromApproval, deptFilm, wishesFromRequests,
  TERM_FILM_DEAN_ROLES, TERM_FILM_DEPT_ROLES, type DeanDepartmentInput, type TermFilmClash,
} from "../../utils/termFilm";
import { type AuthenticatedRequest, isPowerUser, requireAuth } from "../core/auth";
import { isScopeAllowed } from "../core/scope";
import { approvalBlockerOptions, placeholderInstructorIds } from "../core/smartImport";

const roleOf = (req: AuthenticatedRequest) => {
  const role = req.user?.Role;
  return isAcademicRole(role) ? role : "standard";
};

/** نسخة القسم: لجنة الجدول ورئيس القسم (والحساب القديم بلا صفة إن ملك شاشة الجدول). */
function mayReadDepartmentFilm(req: AuthenticatedRequest): boolean {
  if (isPowerUser(req)) return true;
  const role = roleOf(req);
  if (!(TERM_FILM_DEPT_ROLES as readonly string[]).includes(role)) return false;
  if (role === "standard") return (req.permissions || []).includes(7);
  return true;
}

/** نسخة الكلية: العميد ومساعده. */
function mayReadCollegeFilm(req: AuthenticatedRequest): boolean {
  return isPowerUser(req) || (TERM_FILM_DEAN_ROLES as readonly string[]).includes(roleOf(req));
}

/* قراءةٌ ثقيلة نسبياً (نسخ الجدول وموانعها): تُحفظ دقيقةً لكل نطاق، فلا يعيدها كل فتحٍ للوحة. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(scopeKey: string, read: () => Promise<T>): Promise<T> {
  /* جلسةُ التجربة تقرأ صندوقها وحده: مفتاحُها في المخبأ، فلا يرى زائرُ التجربة بياناتٍ حقيقية ولا صندوقَ غيره. */
  const key = `${Repository.currentDemoSessionId() || "live"}|${scopeKey}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await read();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_MS) cache.delete(k);
  return value;
}

const sameScope = (row: FSchedule, collegeId: number, sectionId: number) =>
  Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId;

/** من أعلى عدد موانع في نسخ الجدول المحفوظة إلى ما بقي الآن — مقيسةً على بقية أقسام الفصل كما هي اليوم. */
async function clashFor(collegeId: number, sectionId: number, termId: number, scopeRows: FSchedule[], termRows: FSchedule[], versionLimit: number): Promise<TermFilmClash | null> {
  try {
    const [options, versions] = await Promise.all([
      approvalBlockerOptions(),
      Repository.getScheduleVersionsWithRows(collegeId, sectionId, termId, versionLimit),
    ]);
    const others = termRows.filter(row => !sameScope(row, collegeId, sectionId));
    const counts = versions
      .filter(version => Array.isArray(version.rows) && version.rows.length)
      .map(version => approvalBlockerCount(version.rows, others.concat(version.rows), options));
    return clashFromCounts(counts, approvalBlockerCount(scopeRows, termRows, options));
  } catch (error) {
    console.error("[term-film] تعذّرت قراءة التعارضات:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** بصماتُ الطلبة الذين أرسلوا احتياجهم للقسم (بلا تكرار): العددُ للقسم، والاتحادُ للكلية. */
async function studentPrintsFor(collegeId: number, sectionId: number, termId: number): Promise<Set<string>> {
  try {
    const needs = await Repository.getStudentNeeds(collegeId, sectionId, termId);
    return new Set(needs.map(need => String(need.fingerprint || "")).filter(Boolean));
  } catch { return new Set(); }
}

async function departmentInput(collegeId: number, sectionId: number, termId: number, termRows: FSchedule[], placeholders: Set<number>, termDeadline: string | undefined, versionLimit: number) {
  const scopeRows = termRows.filter(row => sameScope(row, collegeId, sectionId));
  const [requests, approval, clash, prints] = await Promise.all([
    Repository.getInstructorRequests(collegeId, sectionId, termId).catch(() => []),
    Repository.getScheduleApproval(collegeId, sectionId, termId).catch(() => undefined),
    scopeRows.length ? clashFor(collegeId, sectionId, termId, scopeRows, termRows, versionLimit) : Promise.resolve(null),
    studentPrintsFor(collegeId, sectionId, termId),
  ]);
  return {
    rowCount: scopeRows.length,
    build: buildFromRows(scopeRows, placeholders),
    wishes: wishesFromRequests(requests as any[]),
    clash,
    students: prints.size,
    prints,
    delivery: deliveryFromApproval(approval as any, termDeadline),
  };
}

const ids = (req: AuthenticatedRequest) => ({
  collegeId: Number(req.query.collegeId || 0),
  sectionId: Number(req.query.sectionId || 0),
  termId: Number(req.query.termId || 0),
  brief: String(req.query.brief || "") === "1",
});

export function registerTermFilmRoutes(app: Express): void {

/* نسخة القسم. `brief=1` يكفي بطاقة اللوحة: هل في الفصل جدول، وهل اعتُمد. */
app.get("/api/term-film", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId, brief } = ids(req);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل أولاً." }); return; }
  if (!mayReadDepartmentFilm(req)) { res.status(403).json({ error: "فيلم الفصل لرئيس لجنة الجدول ورئيس القسم." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  try {
    if (brief) {
      const [rows, approval] = await Promise.all([
        Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
        Repository.getScheduleApproval(collegeId, sectionId, termId).catch(() => undefined),
      ]);
      res.json({ available: rows.length > 0, final: approval?.status === "accepted", status: approval?.status || "drafting" });
      return;
    }
    const film = await cached(`dept:${collegeId}:${sectionId}:${termId}`, async () => {
      const [term, sections, colleges, termRows, instructors] = await Promise.all([
        Repository.getTermById(termId), Repository.getSections(), Repository.getColleges(),
        Repository.getSchedulesByScope({ termId }), Repository.getInstructors(),
      ]);
      const section: any = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
      const college: any = (colleges as any[]).find(row => Number(row.AdCollegeId) === collegeId);
      const input = await departmentInput(collegeId, sectionId, termId, termRows as FSchedule[], placeholderInstructorIds(instructors as any),
        (term as any)?.AdTermSubmissionDeadline, 24);
      if (!input.rowCount) return null;
      return deptFilm({
        termName: String((term as any)?.AdTermName || ""), sectionName: String(section?.AdSectionName || ""),
        collegeName: String(college?.AdCollegeName || ""), ...(({ prints, ...rest }) => rest)(input),
      });
    });
    if (!film) { res.status(404).json({ error: "لا جدول لهذا القسم في هذا الفصل بعد." }); return; }
    res.json({ film });
  } catch (error) {
    console.error("[term-film] قسم:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "تعذّر إعداد فيلم الفصل." });
  }
});

/* نسخة العميد: أقسام الكلية كلها التي لها جدول في الفصل. */
app.get("/api/term-film/college", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, termId, brief } = ids(req);
  if (!collegeId || !termId) { res.status(400).json({ error: "اختر الكلية والفصل أولاً." }); return; }
  if (!mayReadCollegeFilm(req)) { res.status(403).json({ error: "نسخة الكلية من فيلم الفصل للعميد ومساعده." }); return; }
  if (!isScopeAllowed(req, collegeId, 0)) { res.status(403).json({ error: "خارج صلاحيات الكليات المسموحة لك" }); return; }
  try {
    if (brief) {
      const [rows, approvals] = await Promise.all([
        Repository.getSchedulesByScope({ collegeId, termId }),
        Repository.getScheduleApprovalsForTerm(termId, collegeId).catch(() => []),
      ]);
      const withRows = new Set((rows as FSchedule[]).map(row => Number(row.AdSectionId)));
      const accepted = (approvals as any[]).filter(row => withRows.has(Number(row.AdSectionId)) && row.status === "accepted").length;
      res.json({ available: withRows.size > 0, final: withRows.size > 0 && accepted === withRows.size, departments: withRows.size, accepted });
      return;
    }
    const film = await cached(`dean:${collegeId}:${termId}`, async () => {
      const [term, sections, colleges, termRows, instructors] = await Promise.all([
        Repository.getTermById(termId), Repository.getSections(), Repository.getColleges(),
        Repository.getSchedulesByScope({ termId }), Repository.getInstructors(),
      ]);
      const placeholders = placeholderInstructorIds(instructors as any);
      const deadline = (term as any)?.AdTermSubmissionDeadline;
      const own = (sections as any[]).filter(row => Number(row.AdCollegeId) === collegeId
        && (termRows as FSchedule[]).some(r => sameScope(r, collegeId, Number(row.AdSectionId))));
      const departments: Array<DeanDepartmentInput & { prints: Set<string> }> = await Promise.all(own.map(async row => {
        const input = await departmentInput(collegeId, Number(row.AdSectionId), termId, termRows as FSchedule[], placeholders, deadline, 8);
        const { prints, ...rest } = input;
        return { sectionName: String(row.AdSectionName || ""), ...rest, prints };
      }));
      if (!departments.length) return null;
      const studentsTotal = new Set(departments.flatMap(dep => [...dep.prints])).size;
      const college: any = (colleges as any[]).find(row => Number(row.AdCollegeId) === collegeId);
      return deanFilm({ termName: String((term as any)?.AdTermName || ""), collegeName: String(college?.AdCollegeName || ""), departments: departments.map(({ prints, ...dep }) => dep), studentsTotal });
    });
    if (!film) { res.status(404).json({ error: "لا جداول لأقسام الكلية في هذا الفصل بعد." }); return; }
    res.json({ film });
  } catch (error) {
    console.error("[term-film] كلية:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "تعذّر إعداد فيلم الفصل." });
  }
});

}

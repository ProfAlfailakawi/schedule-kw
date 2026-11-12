/**
 * ── الطلب الفعلي على الخادم: قراءة PDF التسجيل، وحفظه لعائلة القسم، وقراءته ──
 *
 * • الملف بياناتٌ غير موثوقة: حدٌّ للحجم والصفحات، وpdfjs بلا خطوط ولا أكواد.
 * • يُحفظ لكل (فصل × عائلة القسم): بنين وبنات في كل كلياتها تقريرٌ واحد (src/utils/sectionLabel.ts).
 *   النسختان (عام/خريجون) في وثيقةٍ واحدة، ومعهما سجلّ الرفع (من، متى، بصمة الملف).
 * • الربطُ اليدوي لما لم يُطابَق يُحفظ للعائلة مرةً واحدة ويُقرأ في كل فصل.
 * المطابقة والحساب في src/utils/actualDemand.ts؛ هنا الوصول إلى البيانات وحده.
 */
import { createHash } from "crypto";
import { Repository } from "../db/repository";
import type { AuthenticatedRequest } from "./core/auth";
import { isScopeAllowed } from "./core/scope";
import { departmentFamily, departmentFamilyKey } from "../utils/sectionLabel";
import { authorityCourseCode, authorityDepartmentKeys } from "../utils/authorityAcademicCodes";
import { trackOf } from "../utils/collegeTrack";
import { courseDemandFacts, demandSupply, type SupplyCapacity } from "../utils/actualDemandSupply";
import { capacityContextForSection } from "./core/capacityRules";
import {
  demandAlerts, demandDepartmentMatches, demandStudents, demandTermMatches, matchDemandCourses, parseDemandReport,
  type DemandCatalogueCourse, type DemandLink, type DemandMatch, type DemandMember, type DemandReport, type DemandTextItem, type DemandVariant,
} from "../utils/actualDemand";

export const DEMAND_PDF_MAX_BYTES = 4 * 1024 * 1024;
export const DEMAND_PDF_MAX_PAGES = 60;
const HISTORY_MAX = 30;

export async function extractDemandItems(input: Uint8Array | Buffer): Promise<DemandTextItem[][]> {
  if (input.byteLength > DEMAND_PDF_MAX_BYTES) throw new Error("الملف أكبر من المسموح.");
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(input), disableWorker: true, useSystemFonts: false, isEvalSupported: false });
  try {
    const doc = await task.promise;
    if (doc.numPages > DEMAND_PDF_MAX_PAGES) throw new Error("ملفٌ أطول من تقرير قسم.");
    const pages: DemandTextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push((content.items as any[])
        .filter(item => typeof item.str === "string" && item.str.trim())
        .map(item => ({ str: String(item.str).normalize("NFKC"), x: Number(item.transform[4]), y: Number(item.transform[5]), w: Number(item.width) || 0 })));
    }
    return pages;
  } finally {
    void task.destroy?.();
  }
}

export const isPdf = (body: unknown): body is Buffer => Buffer.isBuffer(body) && body.length > 5 && body.subarray(0, 5).toString("latin1") === "%PDF-";
export const fileHash = (body: Buffer) => createHash("sha256").update(body).digest("hex");

/* ── التخزين ─────────────────────────────────────────────────────────────── */

export interface StoredDemandVariant { report: DemandReport; uploadedAt: string; uploadedBy: string; hash: string }
export interface DemandUpload { variant: DemandVariant; at: string; by: string; hash: string; courses: number; students: number }
export interface StoredDemand {
  termId: number;
  familyKey: string;
  variants: Partial<Record<DemandVariant, StoredDemandVariant>>;
  history: DemandUpload[];
}
const REPORTS = "actualDemandReports" as const;
const LINKS = "actualDemandLinks" as const;
const docId = (termId: number, familyKey: string) => `${Number(termId)}:${familyKey}`;

export const readStoredDemand = (termId: number, familyKey: string) =>
  Repository.getFeatureDoc<StoredDemand>(REPORTS, docId(termId, familyKey));

export async function storeDemandVariant(termId: number, familyKey: string, variant: DemandVariant, entry: StoredDemandVariant): Promise<StoredDemand> {
  const out = await Repository.updateFeatureDoc<StoredDemand, null>(REPORTS, docId(termId, familyKey), current => {
    const base: StoredDemand = current && typeof current === "object" ? current : { termId: Number(termId), familyKey, variants: {}, history: [] };
    const upload: DemandUpload = { variant, at: entry.uploadedAt, by: entry.uploadedBy, hash: entry.hash, courses: entry.report.courses.length, students: demandStudents(entry.report) };
    return { next: { ...base, variants: { ...(base.variants || {}), [variant]: entry }, history: [upload, ...(base.history || [])].slice(0, HISTORY_MAX) }, result: null };
  });
  return (out as any).next as StoredDemand;
}

export async function readDemandLinks(familyKey: string): Promise<Record<string, DemandLink>> {
  const doc = await Repository.getFeatureDoc<{ links?: Record<string, DemandLink> }>(LINKS, familyKey);
  return doc?.links && typeof doc.links === "object" ? doc.links : {};
}

export async function saveDemandLink(familyKey: string, code: string, link: DemandLink | null): Promise<void> {
  await Repository.updateFeatureDoc<{ links: Record<string, DemandLink> }, null>(LINKS, familyKey, current => {
    const links = { ...(current?.links || {}) };
    if (link) links[code] = link; else delete links[code];
    return { next: { links }, result: null };
  });
}

/* ── العائلة ─────────────────────────────────────────────────────────────── */

export interface DemandFamilyMember extends DemandMember { collegeName: string; track: "boys" | "girls" | "" }
export interface DemandFamily { key: string; name: string; members: DemandFamilyMember[] }

/** عائلة القسم المفتوح كما يراها القارئ: أعضاؤها المسموحون له، ومفتاحُ قسم كلٍّ منهم (0109). */
export async function demandFamilyFor(req: AuthenticatedRequest, collegeId: number, sectionId: number): Promise<DemandFamily> {
  const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  const own = (sections as any[]).find(row => Number(row.AdSectionId) === Number(sectionId));
  const keys = authorityDepartmentKeys(sections as any[], colleges as any[]);
  const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const members = departmentFamily(sections as any[], collegeId, sectionId)
    .filter(member => isScopeAllowed(req, member.collegeId, member.sectionId))
    .map(member => {
      const name = collegeName.get(member.collegeId) || "";
      return { ...member, departmentKey: keys.get(member.sectionId) || "", collegeName: name, track: trackOf(name) };
    });
  const key = departmentFamilyKey(own?.AdSectionName) || `${collegeId}:${sectionId}`;
  return { key, name: String(own?.AdSectionName || "").trim(), members };
}

/* ── القراءة ─────────────────────────────────────────────────────────────── */

export interface DemandContext {
  family: DemandFamily;
  stored: StoredDemand | null;
  links: Record<string, DemandLink>;
  catalogue: DemandCatalogueCourse[];
  matches: Map<string, DemandMatch>;
  /** صفوفُ جدول العائلة في الفصل. */
  rows: any[];
  /** م.8 وم.9 لعائلة القسم: نوعُ التخصص والمقرراتُ المستثناة (مقاعدُ الشعبة بلائحتنا). */
  capacity: SupplyCapacity;
}

export async function demandContext(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number): Promise<DemandContext> {
  const family = await demandFamilyFor(req, collegeId, sectionId);
  const [stored, links, courses, memberRows, capacity] = await Promise.all([
    readStoredDemand(termId, family.key),
    readDemandLinks(family.key),
    Repository.getCourses(),
    Promise.all(family.members.map(member => Repository.getSchedulesByScope({ collegeId: member.collegeId, sectionId: member.sectionId, termId }))),
    capacityContextForSection(sectionId),
  ]);
  const memberIds = new Set(family.members.map(member => member.sectionId));
  const catalogue = (courses as any[]).filter(row => memberIds.has(Number(row.AdSectionId))) as DemandCatalogueCourse[];
  const reports = Object.values(stored?.variants || {}).map(entry => entry!.report);
  const codes = [...new Set(reports.flatMap(report => report.courses.map(course => course.code)))].map(code => ({ code }));
  const matches = new Map(matchDemandCourses(codes, catalogue, family.members, links).map(match => [match.code, match] as const));
  return { family, stored, links, catalogue, matches, rows: memberRows.flat(), capacity };
}

/** عدد الشعب (رموزٌ مختلفة) لكل مقرر في صفوف الجدول. */
export function sectionsByCourse(rows: readonly any[]): Map<number, number> {
  const seen = new Map<number, Set<string>>();
  for (const row of rows) {
    const id = Number(row.AdCourseId);
    if (!id) continue;
    if (!seen.has(id)) seen.set(id, new Set());
    seen.get(id)!.add(`${Number(row.AdCollegeId)}|${String(row.SCode || "").trim()}`);
  }
  return new Map([...seen].map(([id, set]) => [id, set.size] as const));
}

/** رقم المقرر بسبع خانات واسمه من الكتالوج إن طوبق، وإلا كما طبعه التقرير. */
function courseFace(context: DemandContext, code: string, fallbackName: string): { code: string; name: string } {
  const id = context.matches.get(code)?.courseIds[0];
  const course = id ? context.catalogue.find(row => Number(row.AdCourseId) === id) : undefined;
  const member = course ? context.family.members.find(item => item.sectionId === Number(course.AdSectionId)) : undefined;
  return course ? { code: authorityCourseCode(course.CourseCode, member?.departmentKey) || code, name: String(course.CourseName || fallbackName) } : { code, name: fallbackName };
}

/** أين تُفتح الشعبة: نسخة المقرر في كل عضوٍ من العائلة، بكليته ومساره. */
function targetsOf(context: DemandContext, courseIds: readonly number[]) {
  return courseIds.map(id => {
    const course = context.catalogue.find(row => Number(row.AdCourseId) === Number(id));
    const member = course ? context.family.members.find(item => item.sectionId === Number(course.AdSectionId)) : undefined;
    return member ? { courseId: Number(id), collegeId: member.collegeId, sectionId: member.sectionId, track: member.track } : null;
  }).filter(Boolean) as Array<{ courseId: number; collegeId: number; sectionId: number; track: string }>;
}

/** العرض مقابل الطلب للعائلة في الفصل: النسبة، والقائمة بالأشد، وحقائق كل مقرر. */
export function demandSupplyOf(context: DemandContext) {
  const general = context.stored?.variants?.general?.report || null;
  const graduates = context.stored?.variants?.graduates?.report || null;
  return demandSupply({ general, graduates, matches: context.matches, catalogue: context.catalogue as any, members: context.family.members, rows: context.rows, capacity: context.capacity });
}

export function demandReading(context: DemandContext) {
  const general = context.stored?.variants?.general?.report || null;
  const graduates = context.stored?.variants?.graduates?.report || null;
  const base = general || graduates;
  const scheduled = sectionsByCourse(context.rows);
  const alerts = demandAlerts({ general, graduates, matches: context.matches, scheduledSections: scheduled })
    .map(alert => ({ ...alert, ...courseFace(context, alert.code, alert.name), targets: targetsOf(context, alert.courseIds) }));
  const seenCodes = new Set<string>();
  const unmatched = [general, graduates].flatMap(report => report?.courses || [])
    .filter(course => context.matches.get(course.code)?.status === "unmatched" && !seenCodes.has(course.code) && seenCodes.add(course.code))
    .map(course => ({ code: course.code, name: course.name, students: course.students.total }))
    .sort((a, b) => b.students - a.students);
  const variant = (key: DemandVariant) => {
    const entry = context.stored?.variants?.[key];
    return entry ? { uploadedAt: entry.uploadedAt, by: entry.uploadedBy, courses: entry.report.courses.length, students: demandStudents(entry.report), termLabel: entry.report.termLabel, department: entry.report.department } : null;
  };
  const members = context.family.members;
  const supply = base ? demandSupplyOf(context) : null;
  return {
    /* «نسبة خدمة الطلب» وقائمة المقررات بالأشد (أقصر من عشرين بنداً تُعرض؛ والمتوازن لا يُعرض). */
    service: supply ? { ...supply.service, byTrack: supply.byTrack } : null,
    /* لكل AdCourseId في العائلة: ما تقرؤه شارةُ المراجعة وحكمُ «حذف مقرر». */
    facts: supply ? courseDemandFacts(supply, context.matches) : {},
    supply: supply ? supply.items.filter(item => item.gap !== 0 || item.unmetGraduates > 0 || item.unmetStudents > 0 || item.move).slice(0, 40)
      .map(item => ({ ...item, ...courseFace(context, item.code, item.name), report: item.code, targets: targetsOf(context, context.matches.get(item.code)?.courseIds || []) })) : [],
    family: { key: context.family.key, name: context.family.name, members: members.map(({ collegeId, sectionId, collegeName, track }) => ({ collegeId, sectionId, collegeName, track })) },
    variants: { general: variant("general"), graduates: variant("graduates") },
    history: (context.stored?.history || []).slice(0, 10),
    matched: base ? base.courses.filter(course => ["matched", "linked"].includes(context.matches.get(course.code)?.status || "")).length : 0,
    alerts,
    unmatched,
    /* ما يُربط به المقرر غير المطابَق: مقررات العائلة بأرقامها السبعة، بلا تكرار البنين والبنات. */
    catalogue: unmatched.length ? [...new Map(context.catalogue.map(course => {
      const member = members.find(item => item.sectionId === Number(course.AdSectionId));
      const code = authorityCourseCode(course.CourseCode, member?.departmentKey);
      return [code, { courseId: Number(course.AdCourseId), code, name: String(course.CourseName || "") }] as const;
    })).values()].sort((a, b) => a.code.localeCompare(b.code)) : [],
  };
}

/** ما يقرؤه الرافع قبل الحفظ: القسم والفصل والأعداد، وما طوبق وما لم يُطابَق. */
export function demandPreview(report: DemandReport, context: DemandContext, termName: string, hash: string, variant: DemandVariant) {
  const matches = matchDemandCourses(report.courses, context.catalogue, context.family.members, context.links);
  return {
    variant,
    termLabel: report.termLabel,
    department: report.department,
    facultyCount: report.facultyCount,
    legalLoad: report.legalLoad,
    courses: report.courses.length,
    students: demandStudents(report),
    matched: matches.filter(match => match.status === "matched" || match.status === "linked").length,
    unmatched: matches.filter(match => match.status === "unmatched").length,
    termMatches: demandTermMatches(report.termLabel, termName),
    departmentMatches: demandDepartmentMatches(report.department, context.family.key),
    duplicate: context.stored?.variants?.[variant]?.hash === hash,
    warnings: report.warnings.slice(0, 6),
  };
}

export { parseDemandReport };

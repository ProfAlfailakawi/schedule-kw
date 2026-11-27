/**
 * ── بصمة القسم: قراءةٌ فقط ──
 *
 * مسارٌ واحد يقرأ ولا يكتب شيئاً: جدول القسم في فصلٍ واحد محلولَ القاعة
 * والمقرر، ومعه الفصول السابقة التي للقسم فيها جدول (للمقارنة).
 *
 * الجواب يحمل أسماء القاعات، فلا يُعطى إلا لمن يرى قاعات القسم أصلاً: رئيس
 * لجنة الجدول ورئيس القسم (والحساب القديم بلا صفة إن ملك شاشة الجدول).
 * الأستاذ لا يراه. ولا اسم أستاذٍ فيه ولا رقم مدني.
 *
 * وختم الاعتماد (FR-DSH-037) يُقرأ من سجل اعتماد الجدول نفسه الذي يرويه «فيلم
 * الفصل»: لكل فصلٍ ختمُه أو لا ختم، ولا يُكتب شيء.
 */
import type { Express } from "express";
import { Response } from "express";
import { Repository } from "../../db/repository";
import type { AdCourse, AdTerm, FSchedule, MasterRoom } from "../../types";
import { isAcademicRole } from "../../utils/academicRoles";
import { approvalSealFrom, type ApprovalSeal } from "../../utils/approvalSeal";
import { buildFingerprint, DEPT_FINGERPRINT_ROLES, type FingerprintRowInput } from "../../utils/deptFingerprint";
import { roomDisplay, roomIdentityKey, roomKeyOf } from "../../utils/locationRegistry";
import { termChronology } from "../../utils/termSequence";
import { orderTimeline, timelineEntry, TIME_MACHINE_MAX_TERMS, type TimelineTerm } from "../../utils/termTimeline";
import { type AuthenticatedRequest, isPowerUser, requireAuth } from "../core/auth";
import { isScopeAllowed } from "../core/scope";

function mayReadFingerprint(req: AuthenticatedRequest): boolean {
  if (isPowerUser(req)) return true;
  const role = isAcademicRole(req.user?.Role) ? req.user!.Role! : "standard";
  if (!(DEPT_FINGERPRINT_ROLES as readonly string[]).includes(role)) return false;
  if (role === "standard") return (req.permissions || []).includes(7);
  return true;
}

/* جدول القسم عبر فصوله كلها قراءةٌ ثقيلة: تُحفظ دقيقةً لكل قسم، فلا تعيدها المقارنة ولا كل فتحٍ للوحة. */
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

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** صفوف الجدول محلولةَ القاعة (اسمها وسعتها من سجل القاعات) والمقرر (رمزه ومقاعده). */
export function fingerprintRows(rows: readonly FSchedule[], courses: readonly AdCourse[], rooms: readonly MasterRoom[]): FingerprintRowInput[] {
  const courseOf = new Map(courses.map(course => [Number(course.AdCourseId), course]));
  const roomOf = new Map<string, MasterRoom>();
  for (const room of rooms) {
    roomOf.set(roomKeyOf(room.id, "", ""), room);
    const legacy = roomKeyOf("", room.buildingCode, room.canonicalCode);
    if (legacy && !roomOf.has(legacy)) roomOf.set(legacy, room);
  }
  const nameOf = (room: MasterRoom | undefined, fallback: string) => room ? [room.buildingCode, room.canonicalCode].filter(Boolean).join("/") : fallback;
  const out: FingerprintRowInput[] = [];
  for (const row of rows) {
    const course = courseOf.get(Number(row.AdCourseId));
    const key = roomIdentityKey(row);
    const room = key ? roomOf.get(key) || roomOf.get(roomKeyOf("", row.AdRoomCode, row.AdRoomHall)) : undefined;
    const base = {
      courseId: Number(row.AdCourseId || 0),
      courseCode: String(row.CourseCodeSnapshot || course?.CourseCode || ""),
      courseName: String(row.CourseNameSnapshot || row.AdCourseName || course?.CourseName || ""),
      section: String(row.SCode || "").trim(),
      seats: Number(course?.MaxStudent) > 0 ? Number(course!.MaxStudent) : null,
      days: DAY_KEYS.map(day => Boolean(row[day])),
      start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
    };
    /* القاعة المرتبطة بالسجل تُعرف بمعرّفها؛ والنصّية القديمة بمفتاحها النصي نفسه في السجل إن وُجد. */
    const hallKey = room ? roomKeyOf(room.id, "", "") : key;
    out.push({ ...base, hallKey, hallName: hallKey ? nameOf(room, roomDisplay(row)) : "", capacity: room?.capacity ?? null });
    const companionId = String(row.companionRoomId || "").trim();
    if (companionId) {
      const companion = roomOf.get(roomKeyOf(companionId, "", ""));
      out.push({ ...base, companion: true, hallKey: roomKeyOf(companionId, "", ""), hallName: nameOf(companion, String(row.companionRoomLabel || "مرفق مصاحب")), capacity: companion?.capacity ?? null });
    }
  }
  return out;
}

/** ختم الفصل من سجل اعتماده، أو `null` قبل الاعتماد النهائي أو إن تعذّرت القراءة. */
async function sealFor(collegeId: number, sectionId: number, termId: number, termName: string): Promise<ApprovalSeal | null> {
  try { return approvalSealFrom(await Repository.getScheduleApproval(collegeId, sectionId, termId) as any, termName); }
  catch { return null; }
}

/** الفصول الأسبق التي للقسم فيها موعدٌ في قاعة، الأحدث أولاً (اثنا عشر على الأكثر). «قارن» و«آلة الزمن» يقرآنها معاً. */
export function earlierTerms(terms: readonly AdTerm[], allRows: readonly FSchedule[], term: AdTerm): Array<{ termId: number; termName: string }> {
  const termId = Number(term.AdTermId);
  const withHalls = new Set(allRows.filter(row => Boolean(roomIdentityKey(row))).map(row => Number(row.AdTermId)));
  const rank = termChronology(term);
  return terms
    .filter(row => Number(row.AdTermId) !== termId && withHalls.has(Number(row.AdTermId)) && termChronology(row) < rank)
    .sort((a, b) => termChronology(b) - termChronology(a) || Number(b.AdTermId) - Number(a.AdTermId))
    .slice(0, 12)
    .map(row => ({ termId: Number(row.AdTermId), termName: String(row.AdTermName || "") }));
}

export function registerDeptFingerprintRoutes(app: Express): void {

/* `brief=1` يكفي بطاقة اللوحة: هل للقسم في هذا الفصل موعدٌ في قاعة. */
app.get("/api/dept-fingerprint", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  const brief = String(req.query.brief || "") === "1";
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل أولاً." }); return; }
  if (!mayReadFingerprint(req)) { res.status(403).json({ error: "بصمة القسم لرئيس لجنة الجدول ورئيس القسم." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  try {
    if (brief) {
      const [rows, term] = await Promise.all([Repository.getSchedulesByScope({ collegeId, sectionId, termId }), Repository.getTermById(termId).catch(() => undefined)]);
      const available = (rows as FSchedule[]).some(row => Boolean(roomIdentityKey(row)));
      /* `viewer` رقم الحساب نفسه: مفتاح «رأى الاحتفال» على هذا الجهاز لكل حساب، لا يكشف شيئاً جديداً. */
      res.json({
        available,
        seal: available ? await sealFor(collegeId, sectionId, termId, String((term as any)?.AdTermName || "")) : null,
        viewer: Number(req.user?.SystemUserId || 0),
      });
      return;
    }
    const answer = await cached(`dept:${collegeId}:${sectionId}:${termId}`, async () => {
      const [terms, sections, colleges, courses, rooms, allRows] = await Promise.all([
        Repository.getTerms(), Repository.getSections(), Repository.getColleges(), Repository.getCourses(),
        Repository.getLocationRooms().catch(() => [] as MasterRoom[]),
        cached(`rows:${collegeId}:${sectionId}`, () => Repository.getSchedulesByScope({ collegeId, sectionId })),
      ]);
      const term = (terms as AdTerm[]).find(row => Number(row.AdTermId) === termId);
      const rows = (allRows as FSchedule[]).filter(row => Number(row.AdTermId) === termId);
      if (!term || !rows.some(row => Boolean(roomIdentityKey(row)))) return null;
      const section: any = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId && Number(row.AdCollegeId) === collegeId);
      const college: any = (colleges as any[]).find(row => Number(row.AdCollegeId) === collegeId);
      const earlier = earlierTerms(terms as AdTerm[], allRows as FSchedule[], term);
      return {
        seal: await sealFor(collegeId, sectionId, termId, String(term.AdTermName || "")),
        fingerprint: buildFingerprint({
          sectionName: String(section?.AdSectionName || ""), termName: String(term.AdTermName || ""), collegeName: String(college?.AdCollegeName || ""),
          rows: fingerprintRows(rows, courses as AdCourse[], rooms as MasterRoom[]),
        }),
        earlier,
      };
    });
    if (!answer) { res.status(404).json({ error: "لا مواعيد في قاعاتٍ لهذا القسم في هذا الفصل بعد." }); return; }
    res.json(answer);
  } catch (error) {
    console.error("[dept-fingerprint]", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "تعذّر إعداد بصمة القسم." });
  }
});

/*
 * ── آلة الزمن (FR-SCH-102): ملخّص فصول القسم على الشريط ──
 * البوابة والنطاق والمخبأ هي بوابة البصمة نفسها، والقراءة نفسها (جدول القسم عبر فصوله). لا صفوف
 * تُرسل: لكل فصلٍ أرقامه (الشعب والساعات والقاعات) ومداه وقاعاته المضغوطة وختمه — والبصمة الكاملة
 * لفصلٍ سابق تُقرأ من المسار أعلاه حين يصل إليه الشريط وحده. لا كتابة.
 */
app.get("/api/dept-fingerprint/timeline", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0), sectionId = Number(req.query.sectionId || 0), termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "اختر الكلية والقسم والفصل أولاً." }); return; }
  if (!mayReadFingerprint(req)) { res.status(403).json({ error: "آلة الزمن لرئيس لجنة الجدول ورئيس القسم." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  try {
    const answer = await cached(`timeline:${collegeId}:${sectionId}:${termId}`, async () => {
      const [terms, courses, rooms, allRows] = await Promise.all([
        Repository.getTerms(), Repository.getCourses(),
        Repository.getLocationRooms().catch(() => [] as MasterRoom[]),
        cached(`rows:${collegeId}:${sectionId}`, () => Repository.getSchedulesByScope({ collegeId, sectionId })),
      ]);
      const term = (terms as AdTerm[]).find(row => Number(row.AdTermId) === termId);
      if (!term) return null;
      const earlier = earlierTerms(terms as AdTerm[], allRows as FSchedule[], term).slice(0, TIME_MACHINE_MAX_TERMS - 1);
      const list = [...earlier.reverse(), { termId, termName: String(term.AdTermName || "") }];
      const entries = await Promise.all(list.map(async item => {
        const rows = (allRows as FSchedule[]).filter(row => Number(row.AdTermId) === item.termId);
        if (!rows.some(row => Boolean(roomIdentityKey(row)))) return null;
        const data = buildFingerprint({ sectionName: "", termName: item.termName, rows: fingerprintRows(rows, courses as AdCourse[], rooms as MasterRoom[]) });
        return timelineEntry(data, { ...item, current: item.termId === termId, seal: await sealFor(collegeId, sectionId, item.termId, item.termName) });
      }));
      return orderTimeline(entries.filter((entry): entry is TimelineTerm => Boolean(entry)));
    });
    if (!answer || answer.length < 2) { res.status(404).json({ error: "لا فصول سابقة للقسم في قاعات بعد." }); return; }
    res.json({ terms: answer });
  } catch (error) {
    console.error("[dept-fingerprint/timeline]", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "تعذّر إعداد آلة الزمن." });
  }
});

}

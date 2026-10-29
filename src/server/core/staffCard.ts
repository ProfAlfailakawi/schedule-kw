/**
 * ── بطاقةُ الأستاذ وسجلُّ الحركة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import type { ScheduleShareLink, InstructorRequest } from "../../types";
import { departmentFamily } from "../../utils/sectionLabel";
import { movementAttribution } from "../../utils/movementAttribution";
import { SHARE_DAY_NAMES, shareDayIndexes } from "./shareLinks";
import { hydrateVersionRows } from "./versions";

/**
 * ── حركةُ جدول الأستاذ: مصدرٌ واحد لبطاقتي ولصفحة الطلب ────────────────────
 *
 * كانت «حركة الجدول» في بطاقتي و«الحركة» في صفحة الطلب شيئين مختلفين: الأولى
 * تقرأ نسخَ الجدول، والثانية بنودَ الطلب وحدها. فيرى الأستاذ في الموضعين
 * قصّتين. فصار لكلٍّ منهما القسمان نفساهما، بالكلمات نفسها:
 *   - طلباتُه: ما طلبه، وقرارُ القسم فيه.
 *   - حركةُ جدوله الرسمية: ما أُضيف ونُقل وحُذف فعلاً.
 */
type MovementEntry = {
  at: string; label: string; tone: "add" | "move" | "room" | "gone"; day: string; text: string;
  source?: "request" | "schedule"; decision?: "fixed" | "rejected" | "pending";
};

const MOVEMENT_REJECT_REASON: Record<string, string> = {
  room: "لا تتوفّر قاعةٌ مناسبة في هذا الوقت", instructor: "يتعارض مع أستاذ آخر", regulation: "مخالفة للائحة",
  cohort: "يتقاطع مع مقرّر يشترك طلبتُه", load: "النصاب التدريسي", department: "قرار القسم", other: "سبب آخر",
};

function requestMovementEntries(requests: InstructorRequest[]): MovementEntry[] {
  const entries: MovementEntry[] = [];
  for (const request of requests) {
    if (request.status === "sent" || !request.submittedAt) continue;
    for (const item of request.items || []) {
      if (item.action === "keep") continue;
      const before = item.before, after = item.after;
      const name = String(after?.courseName || before?.courseName || "مقرر");
      const place = item.action === "add" && after?.collegeName ? ` · ${after.collegeName}` : "";
      const text = item.action === "delete"
        ? `طلبتَ حذف ${name} (${before?.days || ""} ${before?.time || ""})`
        : item.action === "add"
          ? `طلبتَ إضافة ${name}: ${after?.days || ""} ${after?.time || ""}${place}`
          : `طلبتَ نقل ${name} من ${before?.days || ""} ${before?.time || ""} إلى ${after?.days || ""} ${after?.time || ""}`;
      const state = item.decision?.state === "fixed" ? "fixed" : item.decision?.state === "rejected" ? "rejected" : "pending";
      const label = state === "fixed" ? "ثبّته القسم"
        : state === "rejected"
          ? `رفضه القسم${item.decision?.reasonCode ? ` — ${MOVEMENT_REJECT_REASON[item.decision.reasonCode] || ""}` : ""}${item.decision?.note ? ` · ${item.decision.note}` : ""}`
          : "بانتظار قرار القسم";
      entries.push({
        at: String(item.decision?.decidedAt || request.submittedAt),
        label, text: text.replace(/\s+/g, " ").trim(),
        tone: item.action === "delete" ? "gone" : item.action === "add" ? "add" : "move",
        day: "", source: "request", decision: state,
      });
    }
  }
  return entries;
}

/**
 * الأقسامُ التي تُقرأ حركتُه فيها: أقسامُ صفوفه الحالية وحدها كانت تُسقط القسمَ
 * الذي حُذف منه كلُّ ما يدرّسه — فلا يرى «حُذفت من جدولك» أبداً. فتُضاف أقسامُ
 * طلباته في الفصل، والقسمُ الذي أصدر الرابط.
 */
export function movementHistoryScopes(requests: ReadonlyArray<{ AdCollegeId?: number; AdSectionId?: number }>, ...extra: Array<{ collegeId: number; sectionId: number }>) {
  const scopes = new Map<string, { collegeId: number; sectionId: number }>();
  for (const scope of [...extra, ...requests.map(request => ({ collegeId: Number(request.AdCollegeId || 0), sectionId: Number(request.AdSectionId || 0) }))]) {
    if (scope.collegeId && scope.sectionId) scopes.set(`${scope.collegeId}:${scope.sectionId}`, scope);
  }
  return [...scopes.values()];
}

export async function scheduleMovementEntries(instructorId: number, termId: number, rows: any[], courseById: Map<number, any>, options: { withRooms?: boolean; historyScopes?: Array<{ collegeId: number; sectionId: number }> } = {}): Promise<MovementEntry[]> {
  /* صفحةُ الطلب لا تحمل اسمَ قاعةٍ أبداً، ولا تقول إن المكان تغيّر: حركةُ القاعة للقسم وحده. */
  const withRooms = options.withRooms !== false;
  const movementScopeMap = new Map<string, { collegeId: number; sectionId: number }>();
  for (const scope of options.historyScopes || []) movementScopeMap.set(`${scope.collegeId}:${scope.sectionId}`, scope);
  for (const row of rows) {
    const collegeId = Number(row.AdCollegeId || 0), sectionId = Number(row.AdSectionId || 0);
    if (collegeId && sectionId) movementScopeMap.set(`${collegeId}:${sectionId}`, { collegeId, sectionId });
  }
  const movementHistory: MovementEntry[] = [];
  /* أيامُ المحاضرة كلُّها: «الأحد» وحده عن محاضرة الأحد والثلاثاء كان يوحي
     بأن الثلاثاء لم يتغيّر. */
  const movementDay = (row:any) => shareDayIndexes(row).map(index => SHARE_DAY_NAMES[index]).filter(Boolean).join(" · ");
  const movementName = (row:any) => row?.AdCourseName || courseById.get(Number(row?.AdCourseId))?.CourseName || courseById.get(Number(row?.AdCourseId))?.CourseCode || "مقرر";
  const movementRoom = (row:any) => [row?.AdRoomCode,row?.AdRoomHall].filter(Boolean).join("/") || "—";
  const movementShape = (list:any[]) => new Map(list.filter(row => Number(row.AdInstructorId) === instructorId).map(row => [Number(row.id),row]));
  for (const scope of movementScopeMap.values()) {
    const [rawVersions, generation] = await Promise.all([
      Repository.getScheduleVersions(scope.collegeId, scope.sectionId, termId, 100),
      Repository.getInstructorRequestGeneration(scope.collegeId, scope.sectionId, termId),
    ]);
    const currentVersions = generation.startedAt ? rawVersions.filter(version => version.createdAt >= generation.startedAt) : rawVersions;
    const versions = await hydrateVersionRows(currentVersions);
    const ordered = [...versions].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
    const liveSection = rows.filter(row => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId);
    const states = ordered.map(version => ({ at:version.createdAt,label:version.label || "تعديل الجدول",rows:version.rows || [] }));
    states.push({ at:new Date().toISOString(),label:"الجدول الحالي",rows:liveSection });
    for (let i=1;i<states.length;i++) {
      const before=movementShape(states[i-1].rows), after=movementShape(states[i].rows);
      /* ما تغيّر بين لقطتين وقع بعد الأولى، بالفعل الذي أُخذت قبله (movementAttribution). */
      const {at,label}=movementAttribution(states[i-1]);
      for (const [id,now] of after) {
        const was=before.get(id);
        if (!was) { movementHistory.push({at,label,tone:"add",day:movementDay(now),source:"schedule",text:`${movementName(now)} أُضيفت ${now.fstarttime}–${now.fendtime}${withRooms ? ` · ${movementRoom(now)}` : ""}`}); continue; }
        if (String(was.fstarttime)!==String(now.fstarttime) || String(was.fendtime)!==String(now.fendtime) || shareDayIndexes(was).join(",")!==shareDayIndexes(now).join(","))
          movementHistory.push({at,label,tone:"move",day:movementDay(now),source:"schedule",text:`${movementName(now)} تغيّر موعدها من ${was.fstarttime}–${was.fendtime} إلى ${now.fstarttime}–${now.fendtime}`});
        /* صفحةُ الطلب (withRooms=false) لا تعرف أن القاعة تغيّرت أصلاً: لا اسمَ ولا تلميحَ (المالك 2026-10-29). */
        if (withRooms && movementRoom(was)!==movementRoom(now))
          movementHistory.push({at,label,tone:"room",day:movementDay(now),source:"schedule",text:`${movementName(now)} تغيّرت القاعة ${movementRoom(was)} ← ${movementRoom(now)}`});
      }
      for (const [id,was] of before) if (!after.has(id))
        movementHistory.push({at,label,tone:"gone",day:movementDay(was),source:"schedule",text:`${movementName(was)} حُذفت من جدولك`});
    }
  }
  return movementHistory;
}

/* بطاقة الأستاذ تُنشر لعائلة القسم العلمية الواحدة، لا لكل موقع على حدة. */
export async function staffFamilyScopes(collegeId: number, sectionId: number) {
  return departmentFamily(await Repository.getSections(), collegeId, sectionId);
}
export async function staffFamilyShareLinks(collegeId: number, sectionId: number, termId: number): Promise<ScheduleShareLink[]> {
  const family = await staffFamilyScopes(collegeId, sectionId);
  return (await Promise.all(family.map(scope => Repository.getShareLinks(scope.collegeId, scope.sectionId, termId))))
    .flat().filter(link => link.kind === "staff");
}
export const liveStaffPublication = (link: ScheduleShareLink): boolean =>
  link.kind === "staff" && !link.revoked && !Number(link.AdInstructorId || 0)
  && Date.parse(String(link.expiresAt || "")) > Date.now();

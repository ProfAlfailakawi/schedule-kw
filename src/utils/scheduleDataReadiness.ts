import { roomTypeIn } from "./roomTypeForSection";
/**
 * ── بياناتٌ ناقصة في الجدول — إشعارٌ لا مانع، إلا السعة ───────────────────
 *
 * قاعدة المالك (2026-09-27): «التوقيع لا يمنعه إلا تعارض ماديّ». فهذه القائمة
 * تُعرض وتُستكمل، ولا يتوقف عليها توقيعٌ ولا إرسال — باستثناءٍ واحد أضافه
 * المالك: سعة الشعبة. مقررٌ بلا سعةٍ مسجّلة يمنع التوقيع (`capacityGapItems`)
 * لأن اقتراح الشعب وملاءمة القاعات وسقف التسجيل كلُّها تُبنى عليها.
 * وثانيهما (المالك 2026-11-14): الدرجة العلمية. أستاذٌ له مواعيد في الجدول ولا درجةَ له في النصاب
 * يمنع التوقيع (`rankGapItems`) لأن ساعاتِه ونصابَه تُحسب منها. والمنتدبون والمتقاعدون وسجلُّ «هيئة تدريسية»
 * خارج العدّ، ولا يُعدّ شيءٌ إن لم تُعرَّف درجاتٌ في النصاب بعد. والصفوف تُقرأ بعد التطبيع
 * نفسه الذي تُعدّ به الموانع (`normalizeRow`)، فقاعةٌ مكتوبةٌ نصّاً تطابق
 * سجلّ المواقع ليست ناقصة.
 */
import { SCHEDULE_DAYS, timeToMinutes } from "./scheduleIntelligence";
import { isPendingRoom } from "./locationRegistry";
import { AR, countOf } from "./arabicCount";
import { sortByName } from "./sorting";

export interface DataGapItem { kind: string; id: string; label: string; fields: string[]; choices?: Record<string,string[]> }
export interface DataReadinessInput {
  rows: any[];
  courses: any[];
  instructorIds: Set<number>;
  rooms: any[];
  normalizeRow?: (row: any) => any;
  roomTypeOptions?: string[];
  roomTypeScopes?: Record<string, number[]>;
  /** الدرجةُ العلمية لازمة: `hasRanks` درجاتٌ معرَّفة في النصاب، `rankedIds` من لهم درجة، `excludedIds` المنتدبون والمتقاعدون و«هيئة تدريسية». */
  rankGap?: { hasRanks: boolean; rankedIds: Set<number>; excludedIds: Set<number>; nameById: Map<number, string> };
}

export function computeScheduleDataReadiness({ rows, courses, instructorIds, rooms: registryRooms, normalizeRow, roomTypeOptions, roomTypeScopes, rankGap }: DataReadinessInput) {
  const scheduleRows = normalizeRow ? rows.map(row => normalizeRow(row)) : rows;
  const courseById = new Map(courses.map(course => [Number(course.AdCourseId), course]));
  const roomById = new Map(registryRooms.map(room => [String(room.id), room]));
  const registeredRoomTypes=[...new Set((roomTypeOptions?roomTypeOptions:registryRooms.filter(room=>room.active!==false&&room.confidence!=="UNVERIFIED").map(room=>String(room.roomType||""))).map(type=>String(type||"").normalize("NFKC").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
  const missing = new Map<string, DataGapItem>();
  const fitIssues:Array<{kind:"capacity"|"room-type";scheduleId:string;label:string;room:string;detail:string;courseName:string;preferredType?:string;actualType?:string;capacity?:number;requiredSeats?:number}> = [];
  let unknownRoomCapacity=0;
  for (const row of scheduleRows) {
    const courseId = Number(row.AdCourseId || 0), course = courseById.get(courseId);
    const label = `${course?.CourseCode || "موعد"} · ${course?.CourseName || row.AdCourseName || "مقرر"} · شعبة ${row.SCode || "—"}`;
    if (!courseId || !course) {
      missing.set(`course:${row.id}`, { kind: "course", id: String(courseId || row.id), label, fields: ["ربط المقرر برمز صحيح في المكتبة"] });
    }
    if (course) {
      const fields = [
        (!String(course.CourseRoomType || "").normalize("NFKC").trim()||!registeredRoomTypes.includes(String(course.CourseRoomType||"").normalize("NFKC").trim())) && "نوع القاعة المناسب",
        (!String(course.CourseTeachingMode || "").trim()||!(["theoretical","applied","practical","field_training",...(courses.some(item=>item.CourseTeachingMode==="mixed")?["mixed"]:[]) ] as string[]).includes(String(course.CourseTeachingMode||""))) && "طبيعة التدريس",
        !(Number(course.CourseCredit) > 0) && "الوحدات",
        !(Number(course.CourseHours) > 0) && "الساعات",
        !(Number(course.MaxStudent) > 0) && "سعة الشعبة",
        !String(course.CourseCode || "").trim() && "رمز المقرر",
        !String(course.CourseName || "").trim() && "اسم المقرر",
      ].filter(Boolean) as string[];
      if (fields.length) {
        missing.set(`course:${courseId}`, { kind: "course", id: String(courseId), label: `${course.CourseCode || "مقرر"} · ${course.CourseName || courseId}`, fields, choices:{"نوع القاعة المناسب":registeredRoomTypes,"طبيعة التدريس":["theoretical","applied","practical","field_training"]} });
      }
    }
    const rowFields: string[] = [];
    if (!String(row.SCode || "").trim()) rowFields.push("رمز الشعبة");
    if (!Number(row.AdInstructorId) || !instructorIds.has(Number(row.AdInstructorId))) rowFields.push("عضو هيئة التدريس");
    if (!SCHEDULE_DAYS.some(day => Boolean(row[day.key]))) rowFields.push("أيام المحاضرة");
    const start = timeToMinutes(String(row.fstarttime || "")), end = timeToMinutes(String(row.fendtime || ""));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) rowFields.push("وقت بداية ونهاية صحيح");
    if (rowFields.length) missing.set(`schedule:${row.id}`, { kind: "schedule", id: String(row.id), label, fields: rowFields });
    /* أستاذٌ مواعيدُه في الجدول بلا درجةٍ علمية: يُعدّ مرّةً واحدة (لا مرّةً لكل موعد). */
    const rankedId = Number(row.AdInstructorId || 0);
    if (rankGap?.hasRanks && rankedId && instructorIds.has(rankedId) && !rankGap.excludedIds.has(rankedId) && !rankGap.rankedIds.has(rankedId) && !missing.has(`instructor:${rankedId}`)) {
      missing.set(`instructor:${rankedId}`, { kind: "instructor", id: String(rankedId), label: rankGap.nameById.get(rankedId) || `عضو ${rankedId}`, fields: [RANK_GAP_FIELD] });
    }
    const roomId = String(row.roomId || "");
    /* قاعدة الحفظ نفسها في الخادم: مبنى مطلوب، ثم قاعةٌ مثبّتة أو «بانتظار التثبيت» (حالةٌ مقصودة لا نقص). */
    const hasBuilding = Boolean(String(row.buildingId || "").trim());
    if (hasBuilding && isPendingRoom(row)) continue;
    if (!roomId) {
      missing.set(`location:${row.id}`, { kind: "location", id: String(row.id), label, fields: ["ربط الموعد بقاعة معتمدة"] });
    } else {
      const room = roomById.get(roomId);
      if (!room) missing.set(`room:${roomId}`, { kind: "room", id: roomId, label: `قاعة ${row.AdRoomHall || roomId}`, fields: ["تأكيد ربط القاعة في سجل المواقع"] });
      else if(course){
        /* سعة المقرر هي سعة كل شعبة (قرار 1913/2016 م.8: الحدود لأعداد الطلبة في الشعب): لا تُقسم على عدد الشعب. */
        const estimatedSeats=Number(course.MaxStudent)>0?Number(course.MaxStudent):0;
        if(estimatedSeats>0&&Number(room.capacity)>0&&estimatedSeats>Number(room.capacity))fitIssues.push({kind:"capacity",scheduleId:String(row.id),label,room:`${row.AdRoomCode||room.buildingCode}/${row.AdRoomHall||room.canonicalCode}`,capacity:Number(room.capacity),requiredSeats:estimatedSeats,detail:`تقديريًا ${countOf(estimatedSeats,AR.seat)} مقابل سعة ${countOf(Number(room.capacity),AR.seat)}.`,courseName:String(course.CourseName||row.AdCourseName||"")});
        else if(estimatedSeats>0&&!Number(room.capacity))unknownRoomCapacity++;
        const requiredType=String(course.CourseRoomType||"").trim(),actualType=roomTypeIn(room as any,row.AdSectionId,roomTypeScopes);
        if(requiredType&&actualType&&requiredType!==actualType)fitIssues.push({kind:"room-type",scheduleId:String(row.id),label,room:`${row.AdRoomCode||room.buildingCode}/${row.AdRoomHall||room.canonicalCode}`,preferredType:requiredType,actualType,detail:`المقرر يفضّل ${requiredType} والقاعة من نوع ${actualType}.`,courseName:String(course.CourseName||row.AdCourseName||"")});
      }
    }
  }
  const items = [...missing.values()];
  return { ready: items.length === 0, count: items.length, items, roomFit:{count:fitIssues.length,unknownRoomCapacity,items:sortByName(fitIssues, item => item.courseName).slice(0,40)} };
}

/** تسمية حقل السعة كما تكتبها قائمة النواقص أعلاه — مصدرٌ واحد للخادم والواجهة. */
export const CAPACITY_GAP_FIELD = "سعة الشعبة";

/** المقرراتُ التي في الجدول وسعتُها غير مسجّلة — هي وحدها ما يمنع التوقيع من النواقص. */
export function capacityGapItems(items: DataGapItem[] | undefined | null): DataGapItem[] {
  return (items || []).filter(item => item.kind === "course" && item.fields.includes(CAPACITY_GAP_FIELD));
}

/** تسمية حقل الدرجة كما تكتبها قائمة النواقص — مصدرٌ واحد للخادم والواجهة. */
export const RANK_GAP_FIELD = "الدرجة العلمية";

/** الأساتذةُ الذين لهم مواعيد في الجدول ولا درجةَ لهم: يمنعون التوقيع كالسعة (قرار المالك 2026-11-14). */
export function rankGapItems(items: DataGapItem[] | undefined | null): DataGapItem[] {
  return (items || []).filter(item => item.kind === "instructor" && item.fields.includes(RANK_GAP_FIELD));
}

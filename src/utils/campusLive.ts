/**
 * ── الحرم الحي: النموذج (نقيّ بلا React ولا three.js) ─────────────────────────
 *
 * يقرأ صفوف «اليوم» التي تصل إلى الرئيسية أصلاً من /api/dashboard (رمز المبنى،
 * ورقم القاعة، ووقت البدء والانتهاء) ويبني منها:
 *  - المباني وقاعاتها كما تظهر في محاضرات اليوم؛
 *  - القاعات التي فيها محاضرةٌ جارية الآن؛
 *  - تعارض القاعة: محاضرتان في القاعة نفسها يتداخل وقتاهما في اليوم نفسه؛
 *  - «تنفّس» الحرم بحسب ساعة اليوم (صباحٌ مضيء، ومساءٌ أهدأ).
 *
 * لا يكتب شيئاً ولا يطلب شيئاً: قراءةٌ لما في الشاشة فقط.
 */

export interface CampusTodayRow {
  id: number;
  startTime: string;
  endTime: string;
  roomCode: string;
  roomHall: string;
  courseCode?: string;
  courseName?: string;
}

export interface CampusHall {
  key: string;
  hall: string;
  lectures: number;
  runningNow: boolean;
  conflict: boolean;
}

export interface CampusBuilding {
  code: string;
  halls: CampusHall[];
  lectures: number;
  runningNow: number;
  conflicts: number;
}

const minutesOf = (value: string) => {
  const [h, m] = String(value || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ترتيبٌ طبيعي للرموز: «N2» قبل «N10». */
const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

/** عدد أزواج المحاضرات المتداخلة في قاعةٍ واحدة. */
function overlapsIn(rows: CampusTodayRow[]): number {
  const spans = rows.map(row => [minutesOf(row.startTime), Math.max(minutesOf(row.startTime) + 1, minutesOf(row.endTime))] as const)
    .sort((a, b) => a[0] - b[0]);
  let pairs = 0;
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length && spans[j][0] < spans[i][1]; j += 1) pairs += 1;
  }
  return pairs;
}

export function campusFromToday(rows: CampusTodayRow[], nowMinutes: number | null): CampusBuilding[] {
  const byBuilding = new Map<string, Map<string, CampusTodayRow[]>>();
  for (const row of rows || []) {
    const code = String(row.roomCode || "").trim();
    const hall = String(row.roomHall || "").trim();
    if (!code || !hall) continue;
    if (!byBuilding.has(code)) byBuilding.set(code, new Map());
    const halls = byBuilding.get(code)!;
    if (!halls.has(hall)) halls.set(hall, []);
    halls.get(hall)!.push(row);
  }
  return [...byBuilding.entries()].sort((a, b) => natural(a[0], b[0])).map(([code, halls]) => {
    const list: CampusHall[] = [...halls.entries()].sort((a, b) => natural(a[0], b[0])).map(([hall, lectures]) => ({
      key: `${code}/${hall}`,
      hall,
      lectures: lectures.length,
      runningNow: nowMinutes != null && lectures.some(row => minutesOf(row.startTime) <= nowMinutes && minutesOf(row.endTime) > nowMinutes),
      conflict: overlapsIn(lectures) > 0,
    }));
    return {
      code,
      halls: list,
      lectures: list.reduce((sum, hall) => sum + hall.lectures, 0),
      runningNow: list.filter(hall => hall.runningNow).length,
      conflicts: [...halls.values()].reduce((sum, lectures) => sum + overlapsIn(lectures), 0),
    };
  });
}

/**
 * ضوء النهار 0..1 من ساعة اليوم: يعلو من السابعة إلى الظهر ويهبط إلى الثامنة
 * مساءً، وما بعدها ليلٌ هادئ (0.12) لا ظلامٌ تامّ.
 */
export function daylightAt(nowMinutes: number): number {
  const hour = nowMinutes / 60;
  if (hour <= 6 || hour >= 21) return 0.12;
  const t = (hour - 6) / 15; // 0 عند السادسة، 1 عند التاسعة مساءً
  return Math.max(0.12, Math.sin(Math.PI * t));
}

export function daylightLabel(nowMinutes: number): string {
  const hour = nowMinutes / 60;
  if (hour < 6 || hour >= 20) return "ليل";
  if (hour < 11) return "صباح";
  if (hour < 15) return "ظهيرة";
  return "مساء";
}

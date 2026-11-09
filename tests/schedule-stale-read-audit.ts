/**
 * ── بعد الحذف لا يعود النصابُ القديم ────────────────────────────────────────────
 * حُذف موعدٌ ثم دخلت الشاشةُ من جديد فرُسمت من لقطةٍ قديمة (عامل الخدمة + القراءة المسبقة + الرفّ)
 * فبقي النصاب ٦ بدل ٣ ثواني. كل كتابةٍ ناجحة في الجدول تنسى اللقطتين، والرفُّ يتبع ما على الشاشة.
 */
import fs from "node:fs";
import { forgetScheduleReads } from "../src/utils/scheduleReadFreshness";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};

/* ذاكرةٌ مزيّفة بمفتاحين من الجدول وآخر لا يخصّه. */
const store = new Map<string, Set<string>>([
  ["schedule-api-v1", new Set(["https://x.test/api/schedules/workspace?termId=2", "https://x.test/api/schedules?termId=2&instructorId=1", "https://x.test/api/instructors"])],
  ["schedule-shell-v1", new Set(["https://x.test/api/schedules/shell-keep"])],
]);
(globalThis as any).caches = {
  keys: async () => [...store.keys()],
  open: async (name: string) => ({
    keys: async () => [...store.get(name)!].map(url => ({ url })),
    delete: async (request: { url: string }) => store.get(name)!.delete(request.url),
  }),
};
await forgetScheduleReads();
const api = [...store.get("schedule-api-v1")!];
check(api.length === 1 && api[0].endsWith("/api/instructors"), "F1 لقطات /api/schedules تُمحى من ذاكرة API وغيرها يبقى", api);
check(store.get("schedule-shell-v1")!.size === 1, "F2 ذاكرة الهيكل لا تُمسّ");

const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(/res\.ok && mutating && url\.startsWith\("\/api\/schedules"\)\) void forgetScheduleReads\(\)/.test(schedules), "F3 كل كتابةٍ ناجحة في الجدول تنسى اللقطات القديمة");
check(/boardShelf\.set\(key, \{ \.\.\.prior, rows \}\)/.test(schedules) && /if \(practiceMode \|\| rowsLoading/.test(schedules), "F4 رفّ اللوحة يتبع ما على الشاشة (إلا في وضع التجربة)");
const css = fs.readFileSync("src/styles/36-appointment-forms.css", "utf8");
check(/html\[data-schedule-workspace="focus"\] \.week-peek\{z-index:1600\}/.test(css), "F5 نافذة «الجدول الدراسي» فوق قائمة وضع التركيز");

console.log(`\nschedule-stale-read audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

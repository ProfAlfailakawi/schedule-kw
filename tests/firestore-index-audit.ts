/**
 * ── كلُّ سؤالٍ على مجموعةٍ كبيرة له فهرس ──────────────────────────────────
 *
 * The production database is Firestore Enterprise edition. Nothing is indexed
 * on its own there: a filter without an index reads the whole collection, and
 * every document read is billed. Until 2026-10-29 the database had no indexes
 * at all, so asking for one department's courses read all ~4,500 of them —
 * 77,420 times in one week — and the timetable's own lookups read all ~16,000
 * rows each time.
 *
 * Offline: no Firestore client, no data. It reads the code and
 * firestore.indexes.json and asks, for every query on a large collection,
 * whether the field it starts with leads an index. A new query that does not
 * fails here, before it can quietly scan in production; the answer is to add
 * the index to the file AND create it in the console (the file is not
 * deployed — docs/DELIVERY_OPERATIONS.md says how).
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra) : ""); }
};

/* Sizes as Query insights measured them in the week before the indexes. */
const LARGE: Record<string, string> = {
  schedules: "~16,000 rows",
  clientTelemetry: "~29,000 events",
  auditLogs: "~24,500 entries",
  curriculumPlanCourses: "~5,800 plan courses",
  courses: "~4,500 courses",
  scheduleVersions: "~800 versions, each carrying a whole term",
  formSecurity: "~420 permission rows, read with every session",
  userScopes: "~440 scope rows, read with every session",
  curriculumPlans: "~390 plans, the most frequent query in the app",
  instructorRequests: "a few hundred requests a term",
  scheduleDrafts: "drafts that carry their rows",
  scheduleComments: "a term's notes",
};

/* Unindexed on purpose. Each entry says why; an entry whose query has left
   the code fails below, so the list cannot outlive its reasons. */
const DELIBERATE: Record<string, string> = {
  "schedules.id": "getSchedules() reads every row on purpose; an index cannot make a full read smaller",
  "courses.CourseRoomType": "renaming a room type: an administrator's rare edit, cheaper as one scan than as an index written on every course save",
  "courses.CourseCompanionRoomType": "the same rename, for the companion room",
  "curriculumPlanCourses.AdCourseId": "mergeCourses(): merging duplicates by hand, nine at most",
  "instructorRequests.AdInstructorId": "an instructor's own requests: not among the week's top fifty queries",
  "instructorRequests.signature.fingerprint": "the duplicate-signature check on submit: not among the top fifty",
  "scheduleComments.scheduleId": "one row's thread, opened by hand: not among the top fifty",
  "scheduleComments.source": "the staff inbox also filters AdTermId, which the term+createdAt index narrows",
  "scheduleComments.fromInstructorId": "a daily cap on one instructor's notes, sixty at most: not among the top fifty",
};

const spec = JSON.parse(fs.readFileSync("firestore.indexes.json", "utf8"));
const leading = new Map<string, Set<string>>();
for (const index of spec.indexes || []) {
  const set = leading.get(index.collectionGroup) || new Set<string>();
  set.add(index.fields?.[0]?.fieldPath);
  leading.set(index.collectionGroup, set);
}

const files: string[] = ["server.ts"];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
};
walk("src");

/* `collection("x")` followed by its first .where("field") or .orderBy("field"),
   across line breaks. Queries built on a variable (`collection.where(...)`)
   are out of reach; the shape below is how almost every query is written. */
const QUERY = /collection\(\s*"(\w+)"\s*\)\s*\.(where|orderBy)\(\s*(?:"([\w.]+)"|FieldPath\.documentId\(\))/g;
const found = new Map<string, string[]>();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(QUERY)) {
    const key = `${match[1]}.${match[3] || "__name__"}`;
    const line = text.slice(0, match.index).split("\n").length;
    found.set(key, [...(found.get(key) || []), `${file}:${line}`]);
  }
}

check(found.size > 40, "قراءةُ الاستعلامات ما زالت ترى الكود (تغيّر شكلُ الاستعلامات إن فشل هذا)", found.size);

const unindexed: string[] = [];
for (const [key, where] of found) {
  const [collection, ...rest] = key.split(".");
  const field = rest.join(".");
  if (!LARGE[collection]) continue;
  if (leading.get(collection)?.has(field) || DELIBERATE[key]) continue;
  unindexed.push(`${key} (${LARGE[collection]}) at ${where.join(", ")}`);
}
check(unindexed.length === 0, "كلُّ سؤالٍ على مجموعةٍ كبيرة يبدأ بحقلٍ مفهرس، أو له سببٌ مكتوب", unindexed);

const stale = Object.keys(DELIBERATE).filter(key => !found.has(key));
check(stale.length === 0, "ولا سببَ مكتوباً لاستعلامٍ رحل", stale);

const queried = new Set([...found.keys()].map(key => key.split(".").slice(1).join(".")));
const builders = fs.readFileSync("src/db/repository.ts", "utf8");
const orphan = (spec.indexes || [])
  .flatMap((index: any) => index.fields.map((field: any) => `${index.collectionGroup}.${field.fieldPath}`))
  .filter((key: string) => {
    const field = key.split(".").slice(1).join(".");
    return !queried.has(field) && !builders.includes(`"${field}"`);
  });
check(orphan.length === 0, "وكلُّ حقلٍ في الملف اسمُ حقلٍ يُسأل عنه فعلاً (لا خطأَ إملائياً يُبنى فهرسُه بلا فائدة)", orphan);

for (const collection of ["schedules", "courses", "curriculumPlanCourses", "curriculumPlans", "formSecurity", "userScopes"]) {
  check((leading.get(collection)?.size || 0) > 0, `فهارسُ ${collection} في الملف كما في قاعدة الإنتاج`);
}

console.log(`\nFirestore index audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

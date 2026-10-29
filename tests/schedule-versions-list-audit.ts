/**
 * ── قائمةُ النسخ لا تُسقط «قراءة القرار» ────────────────────────────────────
 *
 * الحادثة (سجلّ الإنتاج، المرجع E1FVIW2OB):
 *   GET /api/intelligence/versions?collegeId=6&sectionId=7&termId=107 → 500
 *   «8 RESOURCE_EXHAUSTED: The query failed since it attempted to use 128.29 MiB
 *    when the limit is 128.00 MiB» — ومثلُه على GET /api/schedules/wipe-scope.
 *
 * السببُ سؤالٌ واحد مشترك (Repository.getScheduleVersions): where(scopeKey) +
 * orderBy(createdAt desc) على مجموعةٍ تحمل كلُّ وثيقةٍ فيها نسخةً كاملة من فصل
 * القسم. لم يُستعمل فهرسٌ للترتيب فرتّب Firestore الوثائقَ كاملةً في الذاكرة.
 *
 * يحرس هذا الملف:
 *   ١) لا orderBy على scheduleVersions في أي مكان؛ القائمة select للحقول الخفيفة
 *      والترتيبُ والقصُّ في Node. والنسخُ بلقطاتها تُجلب بالمعرّف (getAll).
 *   ٢) أشكالُ البيانات التي تكسر: rows غائبة أو null، rowCount نصّ، createdAt
 *      Timestamp/رقم/Date/غائب، وثيقةٌ فارغة — لا رمي، ولا NaN، والأحدث أولاً.
 *   ٣) المسارُ يتدهور بلطف: خطأٌ في القراءة ← 200 بقائمةٍ فارغة وX-Reading-Partial،
 *      لا 500؛ والواجهة تعرض أيقونةً صغيرة.
 *   ٤) في الصندوق التجريبي: نسخٌ بمخططاتٍ قديمة تُقرأ دون رمي.
 */
import fs from "node:fs";
import { normalizeVersionMeta, newestVersions, versionCreatedAt, versionListItem, VERSION_META_FIELDS } from "../src/utils/scheduleVersionList";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

console.log("١) السؤال: لا ترتيب في قاعدة البيانات، ولا لقطة في القائمة");
{
  const repo = read("src/db/repository.ts");
  const body = (name: string) => {
    const start = repo.indexOf(`  ${name}: async (`);
    const end = repo.indexOf("\n  },\n", start);
    return start < 0 ? "" : repo.slice(start, end);
  };
  const list = body("getScheduleVersions"), withRows = body("getScheduleVersionsWithRows");
  check(Boolean(list) && Boolean(withRows), "دالتا القائمة موجودتان");
  check(!list.includes(".orderBy(") && !withRows.includes(".orderBy("), "لا orderBy في سؤالَي النسخ (الترتيب في الذاكرة سبب 128 MiB)");
  check(list.includes('.where("scopeKey", "==", scopeKey)') && list.includes(".select(...VERSION_META_FIELDS)"), "القائمة: ترشيحٌ بالنطاق وحقولٌ خفيفة فقط");
  check(list.includes("newestVersions("), "الأحدث أولاً والقصّ في Node");
  check(withRows.includes("getAll(") && withRows.includes("Repository.getScheduleVersions("), "اللقطات تُجلب بالمعرّف بعد اختيار الأحدث من القائمة الخفيفة");
  check(!(VERSION_META_FIELDS as readonly string[]).includes("rows"), "rows ليست من حقول القائمة");
  /* وفي الكود كلّه: أيُّ سؤالٍ على scheduleVersions يرتّب يعيد الحادثة. */
  const offenders: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = `${dir}/${e.name}`; if (e.isDirectory()) walk(f); else if (/\.tsx?$/.test(e.name) && /collection\(\s*"scheduleVersions"\s*\)[^;]*\.orderBy\(/s.test(read(f).replace(/\n\s*/g, " "))) offenders.push(f); } };
  walk("src");
  check(offenders.length === 0, "لا orderBy على scheduleVersions في أي ملف", offenders);
  const spec = JSON.parse(read("firestore.indexes.json"));
  check((spec.indexes || []).some((index: any) => index.collectionGroup === "scheduleVersions" && index.fields?.[0]?.fieldPath === "scopeKey"),
    "فهرسٌ يبدأ بـscopeKey مسجّلٌ للترشيح بالنطاق");
}

console.log("٢) الأشكال التي تكسر");
{
  const ts = { toDate: () => new Date("2026-10-20T08:00:00.000Z") };
  const shapes: any[] = [
    null, undefined, {}, { rows: null }, { rows: "x" }, { rowCount: "41" }, { rowCount: "abc", rows: [{}, {}] },
    { createdAt: ts }, { createdAt: { _seconds: 1761000000 } }, { createdAt: 1761100000000 }, { createdAt: new Date("bad") },
    { id: 7, label: null, source: undefined, AdTermId: "107" },
  ];
  let threw = 0;
  const items = shapes.map((shape, index) => { try { return versionListItem(normalizeVersionMeta(shape, `doc-${index}`)); } catch { threw++; return null; } });
  check(threw === 0, "لا شكلَ يرمي");
  check(items.every(item => item && Number.isFinite(item.rowCount)), "rowCount عددٌ دائماً (لا NaN)", items.map(item => item?.rowCount));
  check(items.every(item => item && !("rows" in item)), "سطرُ القائمة لا يحمل اللقطة");
  check(items[5]!.rowCount === 41 && items[6]!.rowCount === 2, "rowCount النصّي يُقرأ، والفاسد يُستبدل بعدّ الصفوف");
  check(items[0]!.id === "doc-0" && items[11]!.id === "7", "المعرّف من الوثيقة حين يغيب الحقل");
  check(versionCreatedAt(ts) === "2026-10-20T08:00:00.000Z" && versionCreatedAt({ _seconds: 1 }) === "1970-01-01T00:00:01.000Z" && versionCreatedAt(undefined) === "" && versionCreatedAt(new Date("bad")) === "",
    "createdAt: Timestamp وثوانٍ وغائب وتاريخٌ فاسد");
  const sorted = newestVersions([
    { id: "a", createdAt: "2026-10-01T00:00:00.000Z" }, { id: "b" }, { id: "c", createdAt: ts },
    { id: "d", createdAt: 1761100000000 }, { id: "e", createdAt: null },
  ] as any[], 3);
  check(sorted.map(v => v.id).join("") === "cad", "الأحدث أولاً عبر الأنواع، وبلا تاريخ آخراً، ثم القصّ", sorted.map(v => v.id));
  const big = Array.from({ length: 900 }, (_, i) => ({ id: String(i), createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }));
  const top = newestVersions(big, 80);
  check(top.length === 80 && top[0].id === "899" && top[79].id === "820", "٩٠٠ نسخة ← أحدث ٨٠ بالترتيب");
}

console.log("٣) المسار يتدهور بلطف، والواجهة تعرض أيقونة");
{
  const server = readServerSource();
  const start = server.indexOf('app.get("/api/intelligence/versions", ');
  const route = server.slice(start, server.indexOf('app.get("/api/intelligence/versions/compare"', start));
  check(route.includes("try{versions=await Repository.getScheduleVersions(") && route.includes("catch(error"), "خطأُ القراءة يُلتقط في المسار");
  check(route.includes('res.setHeader("X-Reading-Partial","versions")') && route.includes("res.json(items)"), "200 بما وصل، موسومٌ بأنه جزئي — لا 500");
  check(route.includes("versionListItem(") && !route.includes("rows.length)"), "كلُّ سطرٍ يمرّ بالتطبيع، ولا rows.length على لقطةٍ قد تغيب");
  const ui = read("src/components/IntelligenceWorkspace.tsx");
  check(ui.includes('r.headers.get("x-reading-partial")') && ui.includes("intel-partial-chip") && ui.includes("قراءة جزئية"), "الواجهة تقرأ الوسم وتعرض أيقونةً صغيرة بإعادة");
}

console.log("٤) الصندوق التجريبي: نسخٌ بمخططاتٍ قديمة");
{
  const { Repository } = await import("../src/db/repository");
  const session = `demo_versions_list_${Date.now()}`;
  Repository.createDemoSandbox(session, 60_000);
  await Repository.withDemoSandbox(session, async () => {
    /* وثائقُ من مخططاتٍ أقدم: createScheduleVersion يعيد الكائنَ المحفوظ نفسه، فيُشوَّه في مكانه. */
    const base = { SystemUserId: 1, userName: "", AdCollegeId: 6, AdSectionId: 7, AdTermId: 107, source: "manual", rows: [] } as any;
    const noRows: any = await Repository.createScheduleVersion({ ...base, label: "قديمة بلا صفوف" });
    delete noRows.rows; delete noRows.rowCount; noRows.createdAt = "2020-01-01T00:00:00.000Z";
    const noDate: any = await Repository.createScheduleVersion({ ...base, label: "بلا تاريخ" });
    delete noDate.createdAt; noDate.rows = null;
    const stamped: any = await Repository.createScheduleVersion({ ...base, label: "ختمٌ زمني" });
    stamped.createdAt = { _seconds: 1600000000 }; stamped.rowCount = "3";
    const fresh = await Repository.createScheduleVersion({ ...base, label: "حديثة" });
    fresh.createdAt = "2030-01-01T00:00:00.000Z";
    let error: unknown = null, list: any[] = [];
    try { list = (await Repository.getScheduleVersions(6, 7, 107, 80)).map(versionListItem); }
    catch (e) { error = e; }
    check(!error, "القراءة لا ترمي", String(error));
    check(list[0]?.id === fresh.id && list[list.length - 1]?.id === noDate.id, "الأحدث أولاً، وبلا تاريخ آخراً");
    check(list.find(item => item.id === stamped.id)?.rowCount === 3, "rowCount النصّي من مخططٍ قديم");
    check(list.every(item => Number.isFinite(item.rowCount)), "كلُّ سطرٍ بعددٍ صالح");
  });
  Repository.dropDemoSandbox(session);
}

console.log(`\nschedule versions list: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

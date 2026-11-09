/**
 * ── شاشة واحدة للمباني والقاعات ─────────────────────────────────────────────
 * 1) الرمز القديم للقاعة يُسجَّل صيغةً تاريخيةً بصمت (مرة واحدة، بلا تعارض).
 * 2) الحذف لا يُسقط السجل أبداً: القاعة/المبنى يصيران غير فعّالين وتبقى صفوفهما.
 * 3) المبنى يقبل «فعّال» و«الأقسام» من نموذج التعديل نفسه.
 * يعمل على البيئة التجريبية في الذاكرة فقط (DATA_MODE=demo) ولا يلمس أي خدمة حقيقية.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withHistoricalAlias } from "../src/utils/locationAliasHistory";

let passed = 0, failed = 0;
const check = (condition: unknown, name: string) => {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── وحدة نقية ─────────────────────────────────────────────────────────── */
{
  const a1 = withHistoricalAlias([], "F01", "F05");
  check(a1.length === 1 && a1[0].value === "F01" && a1[0].confidence === "CONFIRMED", "الرمز القديم يُسجَّل صيغةً مؤكدة");
  const a2 = withHistoricalAlias(a1, "f01 ", "F06");
  check(a2.length === 1, "لا تكرار للصيغة نفسها بعد التطبيع");
  const a3 = withHistoricalAlias(a1, "F05", "F01");
  check(a3.length === 1 && a3[0].value === "F05", "العودة إلى رمز سابق تُسقطه من الصيغ وتحفظ الجديد القديم");
  check(withHistoricalAlias([], "F01", "f01").length === 0, "لا صيغة تساوي الرمز الجديد");
  check(withHistoricalAlias([], "F01", "F05", ["f01"]).length === 0, "لا صيغة يملكها غيرها في النطاق نفسه");
  check(withHistoricalAlias([], "TBA", "F05").length === 0, "لا تُسجَّل رموز غير صالحة");
  check(withHistoricalAlias(undefined, "", "F05").length === 0, "تعديل بلا تغيير رمز لا يُنشئ صيغة");
}

/* ── بنيوي ──────────────────────────────────────────────────────────────── */
{
  const routes = read("src/server/routes/locationsRoutes.ts");
  const putRoom = routes.split('app.put("/api/admin/location-registry/rooms/:id"')[1]?.split('app.put("/api/admin/location-registry/review/')[0] || "";
  check(putRoom.includes("withHistoricalAlias(") && putRoom.includes("ownedByOtherRooms"), "مسار تعديل القاعة يستعمل مساعد الصيغ التاريخية ويستثني ما يملكه غيرها");
  const delRoom = routes.split('app.delete("/api/admin/location-setup/rooms/:id"')[1]?.split('app.post("/api/admin/location-registry/buildings"')[0] || "";
  check(delRoom.includes("active:false") && !/Repository\.(delete|remove)/.test(delRoom), "حذف القاعة إيقافٌ لا إزالة");
  const delBuilding = routes.split('app.delete("/api/admin/location-setup/buildings/:id"')[1]?.split('app.post("/api/admin/location-setup/rooms"')[0] || "";
  check(delBuilding.includes("archiveLocationBuilding") && !/Repository\.(delete|remove)/.test(delBuilding), "حذف المبنى أرشفةٌ لا إزالة");
  const quick = read("src/components/LocationQuickSetup.tsx");
  check(quick.includes('role="radiogroup" aria-label="حالة المبنى"') && quick.includes("الأقسام: {buildingDeptsLine}"), "نموذج المبنى فيه خياران «فعّال | غير فعّال» وسطر الأقسام المطوي");
  check(!/hall-barter|location-registry\/migration/.test(quick), "الشاشة الموحّدة بلا مهاجرة");
  const admin = read("src/components/AdminUsers.tsx");
  check(!admin.includes('value: "locations"') && !admin.includes("LocationRegistryAdmin"), "تبويب «المباني والقاعات» القديم لم يعد ظاهراً");
}

/* ── HTTP على البيئة التجريبية ────────────────────────────────────────── */
const port = 3491;
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "rooms-one-screen-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });
await import("../server.ts");
for (let attempt = 0; attempt < 150; attempt++) {
  try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* wait */ }
  if (attempt === 149) { console.error("Local HTTP server did not start"); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/api/auth/demo`, { method: "POST" });
assert.ok(login.ok, "demo login");
const cookie = String(login.headers.get("set-cookie") || "").split(";")[0];
const call = async (method: string, url: string, body?: unknown) => {
  const response = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) as any };
};

const setup = await call("GET", "/api/admin/location-setup");
assert.equal(setup.status, 200);
const building = (setup.data.buildings as any[]).find(item => item.active && item.confidence === "CONFIRMED" && item.sectionIds?.length)
  || (setup.data.buildings as any[]).find(item => item.active && item.confidence === "CONFIRMED");
assert.ok(building, "البيئة التجريبية تحمل مبنىً معتمداً");
const sectionId = Number(building.sectionIds?.[0] || (setup.data.sections as any[]).find(item => building.collegeIds.includes(Number(item.AdCollegeId)))?.AdSectionId);
assert.ok(sectionId, "قسم يتبع المبنى");
const codes = ["ZX901", "ZX902", "ZX903"];
const created = await call("POST", "/api/admin/location-setup/rooms", { buildingId: building.id, roomCodes: codes, sectionIds: [sectionId] });
check(created.status === 201 && created.data.created === 3, "إضافة ثلاث قاعات تجريبية");
const roomOf = async (code: string) => ((await call("GET", "/api/admin/location-setup")).data.rooms as any[]).find(r => r.buildingId === building.id && r.canonicalCode === code);
const idOf = (code: string) => `room_${building.officialCode}_${code}`;

// 1) إعادة التسمية تسجّل القديم مرة واحدة
const r1 = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX901")}`, { canonicalCode: "ZX911" });
check(r1.status === 200 && r1.data.aliases?.length === 1 && r1.data.aliases[0].value === "ZX901", "إعادة التسمية سجّلت الرمز القديم صيغةً تاريخية");
const r2 = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX901")}`, { canonicalCode: "ZX911", capacity: 30 });
check(r2.status === 200 && r2.data.aliases.length === 1, "حفظ آخر بلا تغيير رمز لا يكرّر الصيغة");
const r3 = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX901")}`, { canonicalCode: "ZX912" });
check(r3.data.aliases.map((a: any) => a.value).sort().join() === "ZX901,ZX911", "تغيير ثانٍ يضيف الأحدث ويبقي الأقدم");
const r4 = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX901")}`, { canonicalCode: "ZX901" });
check(r4.data.aliases.every((a: any) => a.value !== "ZX901") && r4.data.aliases.some((a: any) => a.value === "ZX912"), "العودة إلى الرمز الأصلي لا تتركه صيغةً لنفسه");

// 2) لا صيغة يملكها غيرها: ZX902 تصير ZX921 (الصيغة ZX902)، ثم ZX903 تأخذ ZX902 وتتغيّر
await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX902")}`, { canonicalCode: "ZX921" });
const taken = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX903")}`, { canonicalCode: "ZX902" });
check(taken.status === 200, "قاعة أخرى تستطيع أخذ رمزٍ هو صيغة تاريخية لغيرها");
const moved = await call("PUT", `/api/admin/location-registry/rooms/${idOf("ZX903")}`, { canonicalCode: "ZX931" });
check(moved.status === 200 && !moved.data.aliases.some((a: any) => a.value === "ZX902"), "لا تُسجَّل صيغةٌ تملكها قاعة أخرى في المبنى");

// 3) الحذف لا يُسقط السجل
const del = await call("DELETE", `/api/admin/location-setup/rooms/${idOf("ZX901")}`);
check(del.status === 200 && del.data.active === false, "حذف القاعة يوقفها");
const after = await roomOf("ZX901");
check(after && after.active === false && after.aliases?.length >= 1, "صف القاعة باقٍ غير فعّال بصيغه التاريخية (لا يُيتَّم سجلٌّ قديم)");

// 4) المبنى: فعّال + أقسام من نموذج واحد
const off = await call("PUT", `/api/admin/location-setup/buildings/${encodeURIComponent(building.id)}`, { siteName: building.siteName, branchName: building.branchName, description: building.description || "", active: false, sectionIds: [sectionId] });
check(off.status === 200 && off.data.active === false && off.data.sectionIds.length === 1, "المبنى يقبل إيقافه وربطه بقسم");
const keep = await call("PUT", `/api/admin/location-setup/buildings/${encodeURIComponent(building.id)}`, { description: "x" });
check(keep.data.active === false, "تعديل بلا ذكر الحالة لا يغيّرها");
const on = await call("PUT", `/api/admin/location-setup/buildings/${encodeURIComponent(building.id)}`, { active: true, sectionIds: [] });
check(on.data.active === true && on.data.sectionIds.length === 0, "إعادة التفعيل وتفريغ الأقسام (= كل الأقسام)");
const delB = await call("DELETE", `/api/admin/location-setup/buildings/${encodeURIComponent(building.id)}`);
const stillThere = ((await call("GET", "/api/admin/location-setup")).data.buildings as any[]).find(item => item.id === building.id);
check(delB.status === 200 && stillThere && stillThere.active === false, "حذف المبنى يؤرشفه ويبقى صفه");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

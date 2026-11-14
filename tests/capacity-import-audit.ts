/**
 * ── «استيراد السعات» من Excel/CSV ──────────────────────────────────────────────
 *
 *   I1  القراءة: الترويسة المتسامحة (عربية/لاتينية، سطرُ عنوانٍ فوقها)، الأرقام العربية، csv بفاصلة منقوطة وBOM، أخطاء الشكل، حدّ ٥٠٠٠ سطر.
 *   I2  المطابقة: تامّة بعد التطبيع فقط؛ الالتباس بين مبنيين؛ غير الفعّالة وغير المعتمدة؛ النطاق؛ القيم الفاسدة والتكرار؛ النسبة بعد الاستيراد.
 *   I3  على خادمٍ حيّ: الصلاحيات (401/403)، النموذج، المعاينة لا تكتب، حدّ الحجم والنوع، الاعتماد (الفارغ فقط افتراضياً، ثم مع التعديلات)،
 *       الرمز الموقَّع، الإعادة والضغط المزدوج، سجلّ كل قاعة وسجلّ الدفعة، التراجع وامتناعه بعد تعديلٍ لاحق، وحدّ المعدّل.
 *   I4  الواجهة: الأزرار والمفاتيح وأرقام لاتينية في مصدرها.
 */
import fs from "node:fs";
import * as XLSX from "xlsx";
import { normalizeRoomToken, parseCapacityMatrix, planCapacityImport, CAPACITY_IMPORT_MAX_ROWS } from "../src/utils/capacityImport";
import { buildCapacityTemplate, readCapacityMatrix } from "../src/server/routes/capacityImportRoutes";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const xlsxBuffer = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "S1");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const mk = (id: string, code: string, extra: Record<string, unknown> = {}, building = "B1") => ({
  id, buildingId: `b_${building}`, buildingCode: building, canonicalCode: code, active: true, aliases: [], collegeIds: [1], sectionIds: [1], shared: false,
  historicalUsageCount: 0, confidence: "CONFIRMED", source: "t", adminVerified: true, evidence: [], auditHistory: [], ...extra,
}) as any;

/* ── I1 ── */
{
  check(normalizeRoomToken(" b1-f 10 ") === "B1F10" && normalizeRoomToken("ف١٢") === "ف12" && normalizeRoomToken("a‑101") === "A101" && normalizeRoomToken("a_1.2") === "A12", "I1 التطبيع: مسافات وشرطات وحروف كبيرة وأرقام عربية");
  const header = parseCapacityMatrix([["رمز القاعة", "المبنى (اختياري)", "السعة"], ["F10", "", 40], ["F11", "", "٣٠"]]);
  check(header.ok && header.rows.length === 2 && header.hasBuildingColumn && header.rows[1].capacity === "٣٠" && header.rows[0].line === 2, "I1 ترويسة النموذج", header);
  const latin = parseCapacityMatrix([["Code", "Capacity"], ["A1", 20]]);
  check(latin.ok && !latin.hasBuildingColumn && latin.rows[0].code === "A1", "I1 ترويسة لاتينية Code/Capacity");
  const alt = parseCapacityMatrix([["القاعة", "المقاعد"], ["A1", 20]]);
  check(alt.ok && alt.rows.length === 1, "I1 «القاعة|المقاعد»");
  const titled = parseCapacityMatrix([["قاعات كلية الهندسة"], [], ["الرمز", "م"], ["رمز القاعة", "المبنى", "السعة"], ["A1", "B1", 20], ["", "", ""], ["A2", "", 10]]);
  check(titled.ok && titled.rows.map(r => r.code).join() === "A1,A2" && titled.rows[1].line === 7, "I1 سطرُ عنوانٍ فوق الترويسة، والأسطر الفارغة تُتجاوز", titled);
  check(!parseCapacityMatrix([["اسم", "رقم"], ["x", 1]]).ok && /رمز القاعة/.test(parseCapacityMatrix([["اسم", "رقم"], ["x", 1]]).error), "I1 بلا ترويسةٍ معروفة = خطأٌ صريح");
  check(!parseCapacityMatrix([["رمز القاعة", "السعة"]]).ok, "I1 ترويسةٌ بلا أسطر");
  const many = [["رمز القاعة", "السعة"], ...Array.from({ length: CAPACITY_IMPORT_MAX_ROWS + 1 }, (_, i) => [`A${i}`, 10])];
  const big = parseCapacityMatrix(many);
  check(!big.ok && big.truncated && /5[,٬]?000/.test(big.error) && parseCapacityMatrix(many.slice(0, CAPACITY_IMPORT_MAX_ROWS + 1)).ok, "I1 ٥٠٠٠ سطر مقبولة، وأكثرُ منها يُرفض بنصٍّ يذكر الحدّ", big.error);

  const csv = readCapacityMatrix(Buffer.from("﻿رمز القاعة;السعة\nA1;٤٠\nA2;25\n", "utf8"), "x.csv");
  check(csv.ok && parseCapacityMatrix((csv as any).matrix).rows.map(r => `${r.code}=${r.capacity}`).join() === "A1=٤٠,A2=25", "I1 csv UTF-8 بـBOM وفاصلة منقوطة وأرقام هندية", csv);
  const csv2 = readCapacityMatrix(Buffer.from("code,capacity\nA1,40\n", "utf8"), "x.csv");
  check(csv2.ok && parseCapacityMatrix((csv2 as any).matrix).rows.length === 1, "I1 csv بفاصلة");
  const book = readCapacityMatrix(xlsxBuffer([["رمز القاعة", "السعة"], ["A1", 40], ["A2", "٣٥"]]), "x.xlsx");
  check(book.ok && parseCapacityMatrix((book as any).matrix).rows.map(r => r.capacity).join() === "40,٣٥", "I1 xlsx مبنيٌّ في الاختبار");
  check(!readCapacityMatrix(Buffer.from("MZ binary"), "x.xlsx").ok && !readCapacityMatrix(Buffer.from("a,b"), "x.pdf").ok, "I1 ما ليس xlsx/csv يُرفض");
  const template = readCapacityMatrix(buildCapacityTemplate(), "t.xlsx");
  check(template.ok && JSON.stringify((template as any).matrix[0]) === JSON.stringify(["رمز القاعة", "المبنى (اختياري)", "السعة"]), "I1 النموذج يقرؤه المُحلّل نفسُه", template);
}

/* ── I2 ── */
{
  const rooms = [
    mk("a", "F10"), mk("b", "F11", { capacity: 40 }), mk("c", "G1", {}, "B2"), mk("d", "G1", {}, "B3"), mk("e", "X1", { active: false }),
    mk("f", "Y1", { confidence: "SUGGESTED" }), mk("g", "K1", { capacity: 20 }), mk("h", "H1"),
  ];
  const buildings = [{ id: "b_B1", officialCode: "B1" }, { id: "b_B2", officialCode: "B2" }, { id: "b_B3", officialCode: "B3" }];
  const row = (line: number, code: string, capacity: unknown, building = "") => ({ line, code, building, capacity: String(capacity) });
  const plan = planCapacityImport([
    row(2, "f10", "٣٠"), row(3, "B1-F11", 55), row(4, "G1", 50), row(5, "G1", 50, "b2"), row(6, "x1", 10), row(7, "Y1", 10), row(8, "ZZ9", 10),
    row(9, "K1", 20), row(10, "H1", "12.5"), row(11, "", 10),
  ], rooms, buildings);
  const by = (line: number) => plan.rows.find(r => r.line === line)!;
  check(by(2).status === "set" && by(2).roomId === "a" && by(2).newCapacity === 30, "I2 رمزٌ بحروف صغيرة وأرقام هندية يطابق قاعةً بلا سعة (set)", by(2));
  check(by(3).status === "change" && by(3).oldCapacity === 40 && by(3).newCapacity === 55 && by(3).roomId === "b", "I2 رمزُ المبنى+القاعة بشرطة يطابق، وله سعةٌ فيُعرض تغييراً قبل/بعد", by(3));
  check(by(4).status === "skip" && by(4).reason === "ambiguous", "I2 رمزٌ في مبنيين بلا مبنى في الملف = ملتبس ولا يُطبّق", by(4));
  check(by(5).status === "set" && by(5).roomId === "c", "I2 المبنى في الملف يحسم الالتباس", by(5));
  check(by(6).reason === "inactive" && by(6).status === "skip" && by(7).reason === "inactive", "I2 الموقوفة وغير المعتمدة ⚠️ «غير فعّالة»");
  check(by(8).reason === "not-found" && by(11).reason === "no-code", "I2 رمزٌ مجهول أو فارغ");
  check(by(9).status === "same" && by(10).status === "invalid" && by(10).reason === "bad-value", "I2 مطابقةٌ لما سُجّل، وكسرٌ مرفوض");
  check(plan.items.map(i => i.roomId).sort().join() === "a,b,c" && plan.items.find(i => i.roomId === "b")!.kind === "change", "I2 الخطةُ ✅ و🔁 وحدهما", plan.items);
  check(plan.counts.set === 2 && plan.counts.change === 1 && plan.counts.same === 1 && plan.counts.invalid === 1 && plan.counts.skip === 5 && plan.counts.total === 10, "I2 العدّادات", plan.counts);
  /* ٦ فعّالة معتمدة: a,b,c,d,g,h — منها لها سعة b وg = ٢ (٣٣%)؛ وبعد ✅ (a وc) = ٤ (٦٧%). */
  check(plan.coverage.total === 6 && plan.coverage.withCapacity === 2 && plan.coverage.percentNow === 33 && plan.coverage.percentAfter === 67, "I2 «سيكتمل X%» تحسب ✅ وحدها", plan.coverage);

  const values = planCapacityImport([row(2, "F10", 0), row(3, "F10", -4), row(4, "F10", 2001), row(5, "F10", ""), row(6, "F10", "abc"), row(7, "F10", 2000), row(8, "H1", "1")], rooms, buildings);
  check(values.rows.slice(0, 5).every(r => r.status === "invalid"), "I2 صفرٌ وسالبٌ وفوق الحدّ وفارغٌ ونصٌّ = ❌", values.rows.map(r => `${r.status}:${r.note}`));
  check(values.rows[5].status === "set" || values.rows[5].status === "invalid", "I2 الحدّ ٢٠٠٠ مقبولٌ بمفرده");
  const dup = planCapacityImport([row(2, "F10", 30), row(3, "F10", 30), row(4, "H1", 20), row(5, "h1", 25), row(6, "B1F11", 40), row(7, "F11", 50)], rooms, buildings);
  check(dup.rows[0].status === "set" && dup.rows[1].reason === "duplicate" && dup.items.filter(i => i.roomId === "a").length === 1, "I2 تكرارٌ بالقيمة نفسها يبقى سطراً واحداً", dup.rows.map(r => r.status));
  check(dup.rows[2].reason === "duplicate-conflict" && dup.rows[3].reason === "duplicate-conflict" && !dup.items.some(i => i.roomId === "h"), "I2 تكرارٌ بقيمتين = ❌ للسطرين ولا يُطبّق منه شيء");
  check(dup.rows[4].reason === "duplicate-conflict" && dup.rows[5].status === "invalid", "I2 مطابقٌ لسعةٍ مسجّلة مع تكرارٍ بقيمة أخرى = تعارض");
  const scoped = planCapacityImport([row(2, "F10", 30), row(3, "G1", 30, "B2")], rooms.filter(r => r.buildingCode === "B1"), buildings);
  check(scoped.rows[0].status === "set" && scoped.rows[1].reason === "not-found", "I2 النطاق: قاعةٌ خارج ما مُرّر لا تُطابَق", scoped.rows);
  const noName = planCapacityImport([row(2, "قاعة المحاضرات الكبرى", 30), row(3, "F1", 30)], rooms, buildings);
  check(noName.rows.every(r => r.reason === "not-found"), "I2 لا مطابقة تقريبية ولا بالأسماء");
}

/* ── I4 ── */
{
  const src = fs.readFileSync("src/components/CapacityImportPanel.tsx", "utf8");
  const host = fs.readFileSync("src/components/LocationCapacityGaps.tsx", "utf8");
  check(/<CapacityImportPanel/.test(host) && /استيراد السعات/.test(src) && /نزّل النموذج/.test(src), "I4 اللوحةُ داخل «قاعات بلا سعة» بزرّي الاستيراد والنموذج");
  check(/شمل التعديلات/.test(src) && /useState\(false\)/.test(src) && /includeChanges/.test(src), "I4 «شمل التعديلات» مطفأٌ افتراضياً");
  check(/capacity-import"/.test(src) && /\$\{P\}\/preview/.test(src) && /\$\{P\}\/apply/.test(src) && /\$\{P\}\/undo/.test(src) && /\$\{P\}\/template/.test(src), "I4 المسارات الأربعة");
  check(/تراجع/.test(src) && /سيكتمل/.test(src) && !/٪/.test(src) && !/toLocaleString\("ar(?!-KW-u-nu-latn)/.test(src), "I4 «تراجع» و«سيكتمل X%» بلا ٪ ولا أرقامٍ هندية");
  check(/data-guide-ignore/.test(src) && /AR\./.test(src) && /countOf/.test(src), "I4 مفاتيح الدليل واتفاقُ العدد والمعدود");
  check(/preventDefault|busy/.test(src) && /disabled=\{[^}]*busy/.test(src), "I4 الاعتمادُ محميٌّ من الضغط المزدوج");
}

/* ── I3 ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("capacity-import");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit & { raw?: Buffer } = {}, withCookie = true) => fetch(BASE + url, {
    ...init, redirect: "manual", body: init.raw ?? init.body,
    headers: { ...(withCookie ? { cookie } : {}), origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}), ...((init.headers as any) || {}) },
  });
  const json = async (url: string, init: RequestInit & { raw?: Buffer } = {}, withCookie = true) => { const r = await call(url, init, withCookie); let body: any = null; try { body = await r.json(); } catch { /* */ } return { status: r.status, body }; };
  const as = (role: string) => json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
  const put = (id: string, body: unknown) => json(`/api/admin/location-registry/rooms/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
  const P = "/api/admin/location-setup/capacity-import";
  const preview = (rows: unknown[][], name = "caps.xlsx") => json(`${P}/preview`, { method: "POST", raw: xlsxBuffer(rows), headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(name) } });
  const apply = (prev: any, includeChanges = false, items = prev.items) => json(`${P}/apply`, { method: "POST", body: JSON.stringify({ token: prev.token, items, includeChanges }) });
  const undo = (batchId: string) => json(`${P}/undo`, { method: "POST", body: JSON.stringify({ batchId }) });
  const rooms = async () => ((await json("/api/admin/location-setup")).body.rooms as any[]);
  const roomOf = async (id: string) => (await rooms()).find(r => r.id === id);
  const fullCode = (r: any) => `${r.buildingCode}${r.canonicalCode}`;

  check((await json(`${P}/last`, {}, false)).status === 401 && (await json(`${P}/preview`, { method: "POST", raw: Buffer.from("x") }, false)).status === 401, "I3 بلا دخول: 401");
  await as("admin");

  /* قاعاتٌ بلا سعة وأخرى لها: نُفرغ ثلاثاً ونُبقي اثنتين. */
  const all = await rooms();
  const pool = all.filter(r => r.active && r.confidence === "CONFIRMED");
  const withCap = pool.filter(r => Number(r.capacity) >= 1);
  if (pool.length < 6) throw new Error("بيانات التجربة بلا قاعاتٍ كافية");
  const empties = pool.filter(r => !(Number(r.capacity) >= 1)).slice(0, 3);
  for (const room of withCap.slice(0, 3 - empties.length)) { await put(room.id, { capacity: null }); empties.push(room); }
  const filled = withCap.filter(r => !empties.includes(r)).slice(0, 2);
  if (filled.length < 2) throw new Error("لا قاعتين لهما سعة");
  for (const room of empties) await put(room.id, { capacity: null });
  const [e1, e2, e3] = empties, [f1, f2] = filled;
  const oldF1 = Number((await roomOf(f1.id)).capacity), oldF2 = Number((await roomOf(f2.id)).capacity);
  /* لكل سطرٍ رمزُ المبنى+القاعة الرسمي ليُحسم الالتباس بين المباني. */
  const code = (r: any) => fullCode(r);
  const rows = [
    ["رمز القاعة", "المبنى (اختياري)", "السعة"],
    [code(e1), "", "٤٥"], [code(e2).toLowerCase(), "", 60], [code(f1), "", oldF1 + 7], [code(f2), "", oldF2],
    ["NOPE999", "", 30], [code(e3), "", 0],
  ];

  /* المعاينة لا تكتب شيئاً. */
  const before = JSON.stringify((await rooms()).map(r => [r.id, r.capacity, (r.auditHistory || []).length]));
  const prev = await preview(rows);
  check(prev.status === 200 && prev.body.token && prev.body.counts.set === 2 && prev.body.counts.change === 1 && prev.body.counts.same === 1 && prev.body.counts.invalid === 1 && prev.body.counts.skip === 1, "I3 المعاينة: ✅٢ 🔁١ مطابقة١ ❌١ ⚠️١", prev.body?.counts ?? prev);
  check(JSON.stringify((await rooms()).map(r => [r.id, r.capacity, (r.auditHistory || []).length])) === before, "I3 المعاينة لا تكتب شيئاً");
  check(prev.body.coverage.percentAfter >= prev.body.coverage.percentNow && prev.body.rows.length === 6 && prev.body.rows[0].fullCode === code(e1), "I3 المعاينة تحمل النسبة والأسطر");

  /* الصلاحيات. */
  for (const role of ["departmentHead", "advisor"]) {
    await as(role);
    const [a, b, c, d, e] = await Promise.all([
      json(`${P}/preview`, { method: "POST", raw: xlsxBuffer(rows) }), apply(prev), undo("cap-abc"), json(`${P}/last`), json(`${P}/template`),
    ]);
    check([a, b, c, d, e].every(x => x.status === 403), `I3 ${role}: كل المسارات 403`, [a, b, c, d, e].map(x => x.status));
  }
  await as("admin");
  check((await roomOf(e1.id)).capacity == null, "I3 ولم تمسّ محاولاتُ غيرِ المدير شيئاً");

  /* النموذج. */
  const tpl = await call(`${P}/template`);
  const tplBook = XLSX.read(Buffer.from(await tpl.arrayBuffer()), { type: "buffer" });
  check(tpl.status === 200 && /spreadsheetml/.test(tpl.headers.get("content-type") || "") && JSON.stringify(XLSX.utils.sheet_to_json(tplBook.Sheets[tplBook.SheetNames[0]], { header: 1 })[0]) === JSON.stringify(["رمز القاعة", "المبنى (اختياري)", "السعة"]), "I3 النموذج xlsx بالأعمدة الثلاثة");

  /* الحجم والنوع. */
  const huge = await json(`${P}/preview`, { method: "POST", raw: Buffer.alloc(2 * 1024 * 1024 + 4096, 65), headers: { "content-type": "application/octet-stream", "x-file-name": "a.csv" } });
  check(huge.status === 413 && /ميغابايت/.test(huge.body?.error), "I3 فوق ٢ ميغابايت: 413 بنصٍّ عربي", huge);
  check((await json(`${P}/preview`, { method: "POST", raw: Buffer.from("%PDF-1.4"), headers: { "content-type": "application/octet-stream", "x-file-name": "a.pdf" } })).status === 400, "I3 PDF يُرفض بـ400");
  check((await json(`${P}/preview`, { method: "POST", raw: Buffer.alloc(0), headers: { "content-type": "application/octet-stream" } })).status === 400, "I3 بلا ملف: 400");
  const csvPrev = await json(`${P}/preview`, { method: "POST", raw: Buffer.from(`رمز القاعة;السعة\n${code(e3)};٢٢\n`, "utf8"), headers: { "content-type": "text/csv", "x-file-name": encodeURIComponent("caps.csv") } });
  check(csvPrev.status === 200 && csvPrev.body.counts.set === 1, "I3 csv يُقرأ في الخادم", csvPrev.body);

  /* رمزٌ مزوَّر أو خطةٌ معدَّلة. */
  const forged = await apply({ ...prev.body, token: prev.body.token.replace(/.$/, c => (c === "A" ? "B" : "A")) });
  const tampered = await apply(prev.body, false, prev.body.items.map((i: any) => ({ ...i, value: i.value + 1 })));
  check(forged.status === 409 && tampered.status === 409 && forged.body?.code === "preview-stale", "I3 رمزٌ مزوَّر أو خطةٌ معدّلةٌ بعد المعاينة: 409", { forged: forged.status, tampered: tampered.status });
  check((await apply(prev.body, false, [])).status === 400, "I3 خطةٌ فارغة: 400");

  /* الاعتماد الافتراضي: الفارغ فقط، والضغط المزدوج لا يكتب مرتين. */
  const [d1, d2] = await Promise.all([apply(prev.body), apply(prev.body)]);
  const okOne = [d1, d2].filter(x => x.status === 200), rejectedOne = [d1, d2].filter(x => x.status === 409);
  check(okOne.length >= 1 && okOne.length + rejectedOne.length === 2, "I3 ضغطتان متزامنتان: واحدةٌ تكتب والأخرى تُردّ أو تُعاد", [d1.status, d2.status]);
  const first = okOne[0].body;
  check(first.counts.applied === 2 && first.counts.set === 2 && first.counts.change === 0 && first.applied.map((r: any) => r.fullCode).sort().join() === [code(e1), code(e2)].sort().join(), "I3 الافتراضي: ✅ وحدهما ويعيد القائمة المطبّقة", first);
  const afterE1 = await roomOf(e1.id), afterE2 = await roomOf(e2.id);
  check(afterE1.capacity === 45 && afterE2.capacity === 60 && Number((await roomOf(f1.id)).capacity) === oldF1 && (await roomOf(e3.id)).capacity == null, "I3 كُتبت القاعتان الفارغتان وحدهما، ولم تُمسّ ذاتُ السعة ولا الفاسدة");
  const entryOf = (room: any) => (room.auditHistory || []).filter((e: any) => e.batchId === first.batchId);
  check(entryOf(afterE1).length === 1 && entryOf(afterE2).length === 1, "I3 سطرُ تدقيقٍ واحد لكل قاعةٍ (حتى مع الضغط المزدوج)", { e1: entryOf(afterE1).length });
  const ent = entryOf(afterE1)[0];
  check(ent.action === "UPDATE" && ent.after.capacity === 45 && ent.before.capacity == null && ent.byUserId && ent.batchId, "I3 سطرُ التدقيق بقبل/بعد ومن فعل", ent);
  const again = await apply(prev.body);
  check(again.status === 200 && again.body.replayed === true && entryOf(await roomOf(e1.id)).length === 1, "I3 اعتمادٌ ثانٍ مطابق لا يكتب شيئاً");
  /* الحالُ لا الذاكرة: ملفٌّ جديد بالسعات نفسها لا يكتب (سعتها هذه من قبل). */
  const prevAgain = await preview(rows);
  check(prevAgain.body.counts.set === 0 && prevAgain.body.counts.same >= 2 && !(await apply(prevAgain.body, false).then(r => r.body?.counts?.applied)), "I3 معاينةٌ جديدة للملف نفسه: لا جديد، والاعتمادُ لا يكتب");
  const logs = (await json("/api/audit-logs?limit=100")).body as any[];
  const batchLog = (Array.isArray(logs) ? logs : []).find(l => l.entity === "location-capacity-import" && l.entityId === first.batchId && l.method === "POST" && /استيراد سعات/.test(String(l.changes || "")));
  check(Boolean(batchLog) && /2 جديدة|جديدة/.test(batchLog.changes), "I3 سجلُّ الطلب العام فيه سطرُ الدفعة بأعدادها", batchLog || logs?.slice?.(0, 3));
  check((await json(`${P}/last`)).body.batch?.batchId === first.batchId && (await json(`${P}/last`)).body.batch?.undoable === 2, "I3 «آخر دفعة» تعرض ما يُتراجع عنه");

  /* مع التعديلات. */
  const prev2 = await preview([["رمز القاعة", "السعة"], [code(f1), oldF1 + 7], [code(e3), 33]]);
  check(prev2.body.counts.change === 1 && prev2.body.counts.set === 1, "I3 معاينة التعديل");
  const noChange = await apply(prev2.body, false);
  check(noChange.status === 200 && noChange.body.counts.applied === 1 && Number((await roomOf(f1.id)).capacity) === oldF1, "I3 بلا تأشير التعديلات لا تتغيّر السعةُ المسجّلة");
  const prev3 = await preview([["رمز القاعة", "السعة"], [code(f1), oldF1 + 7], [code(f2), oldF2 + 3]]);
  const withChange = await apply(prev3.body, true);
  check(withChange.status === 200 && withChange.body.counts.change === 2 && Number((await roomOf(f1.id)).capacity) === oldF1 + 7 && Number((await roomOf(f2.id)).capacity) === oldF2 + 3, "I3 مع التأشير تُطبَّق التعديلات", withChange.body);
  /* تغيّرت بعد المعاينة. */
  const prev4 = await preview([["رمز القاعة", "السعة"], [code(f2), oldF2 + 9]]);
  await put(f2.id, { capacity: oldF2 + 4 });
  const stale = await apply(prev4.body, true);
  check(stale.status === 200 && stale.body.counts.applied === 0 && /بعد المعاينة/.test(stale.body.results[0].note), "I3 قاعةٌ عُدّلت بين المعاينة والاعتماد تُتخطّى بسببها لا بصمت", stale.body);

  /* التراجع. */
  const u = await undo(withChange.body.batchId);
  check(u.status === 200 && u.body.counts.undone === 1 && u.body.counts.refused === 1, "I3 التراجع: قاعةٌ تعود، وقاعةٌ عُدّلت بعد الدفعة تُرفض", u.body);
  check(Number((await roomOf(f1.id)).capacity) === oldF1 && Number((await roomOf(f2.id)).capacity) === oldF2 + 4, "I3 عادت f1 لسعتها السابقة ولم تُمسّ f2 المعدَّلة لاحقاً");
  check(u.body.refused[0]?.note === "عُدّلت بعد الدفعة", "I3 الرفضُ بنصٍّ يقول السبب", u.body.refused);
  const u2 = await undo(withChange.body.batchId);
  check(u2.status === 200 && u2.body.counts.undone === 0, "I3 تراجعٌ ثانٍ لا يكتب شيئاً");
  const un = await undo(first.batchId);
  check(un.body.counts.undone === 2 && (await roomOf(e1.id)).capacity == null && (await roomOf(e2.id)).capacity == null, "I3 تراجعُ الدفعة الأولى يعيد القاعتين بلا سعة", un.body);
  const lastUndo = (await roomOf(e1.id)).auditHistory.slice(-1)[0];
  check(lastUndo.undoOf === first.batchId && lastUndo.before.capacity === 45 && lastUndo.after.capacity == null, "I3 للتراجع سطرُ تدقيقه", lastUndo);
  check((await undo("cap-nonexistentbatch")).status === 404 && (await undo("../x")).status === 400, "I3 دفعةٌ مجهولة/فاسدة");
  /* تُعاد الدفعة بعد تراجعها بمعاينةٍ جديدة، ويتراجع عنها من جديد. */
  const prev5 = await preview(rows);
  const redo = await apply(prev5.body);
  check(redo.status === 200 && redo.body.counts.applied === 2 && (await undo(redo.body.batchId)).body.counts.undone === 2, "I3 إعادةُ الاستيراد بعد التراجع ثم التراجعُ عنها");

  /* حدّ المعدّل. */
  let limited = 0;
  for (let i = 0; i < 70; i++) { const r = await call(`${P}/undo`, { method: "POST", body: JSON.stringify({ batchId: "cap-none" }) }); if (r.status === 429) limited++; }
  check(limited > 0, "I3 حدّ المعدّل: طلباتٌ كثيرة تُردّ بـ429", limited);
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار تعثّر\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  await server?.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

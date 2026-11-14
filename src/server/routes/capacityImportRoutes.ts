/**
 * ── «استيراد السعات» من Excel/CSV داخل لوحة «قاعات بلا سعة» (FR-LOC-038…) ──────────
 * حساب الإدارة الرئيسي وحده (401/403 كبقية لوحة السعات). أربعة مسارات:
 *   POST …/capacity-import/preview  الملف خامًا؛ يُقرأ في الخادم ولا يُكتب شيء. يردّ جدولَ القرارات ورمزًا موقَّعًا.
 *   POST …/capacity-import/apply    الخطةُ المعاينة + الرمز: يُعاد التحقق من كل قاعة على حالها الآن، ثم كتابةٌ واحدة.
 *   POST …/capacity-import/undo     يعيد ما كتبته تلك الدفعةُ بعينه؛ ويرفض قاعةً عُدّلت بعدها.
 *   GET  …/capacity-import/last     آخر دفعةٍ وما بقي قابلاً للتراجع (لا يضيع زرُّ التراجع بإعادة التحميل).
 *   GET  …/capacity-import/template النموذج .xlsx.
 *
 * الكتابة بصيغة سجلّ التعديل نفسه في مسار حفظ القاعة (UPDATE بقبل/بعد) ومعه رمزُ الدفعة، فهو سجلُّ التراجع أيضاً
 * (لا مخزنَ ثانياً): سجلٌّ واحد لكل قاعة، وسجلُّ الطلب العام يحمل سطرَ الدفعة بأعدادها (auditChanges).
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import * as XLSX from "xlsx";
import { Repository } from "../../db/repository";
import type { LocationAuditRecord, MasterRoom } from "../../types";
import { AR, countOf } from "../../utils/arabicCount";
import {
  CAPACITY_IMPORT_MAX_APPLY, CAPACITY_IMPORT_MAX_BYTES, CAPACITY_IMPORT_MAX_ROWS, CAPACITY_TEMPLATE_HEADERS,
  parseCapacityMatrix, planCapacityImport, type CapacityPlanItem,
} from "../../utils/capacityImport";
import { hasRegisteredCapacity } from "../../utils/roomCapacityGaps";
import { type AuthenticatedRequest, requirePermission, requireRootAdmin } from "../core/auth";
import { invalidateLocationRegistry, readLocationRegistry } from "../core/locations";

const BASE = "/api/admin/location-setup/capacity-import";
const TOKEN_TTL_MS = 30 * 60_000;
const KEY_LABEL = "capacity-import-v1";

const macOf = (secret: string, userId: number, expires: number, items: readonly CapacityPlanItem[]) =>
  createHmac("sha256", createHmac("sha256", secret).update(KEY_LABEL).digest("hex"))
    .update(`${userId}|${expires}|${items.map(item => `${item.roomId}:${item.kind}:${item.old ?? ""}:${item.value}`).join(";")}`).digest("base64url");

async function signPlan(userId: number, items: readonly CapacityPlanItem[]): Promise<string> {
  const expires = Date.now() + TOKEN_TTL_MS;
  return `${expires}.${macOf(await Repository.getSharedServerSecret(), userId, expires, items)}`;
}
async function verifyPlan(token: unknown, userId: number, items: readonly CapacityPlanItem[]): Promise<boolean> {
  const [expiresText, mac] = String(token || "").split(".");
  const expires = Number(expiresText);
  if (!mac || !Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(macOf(await Repository.getSharedServerSecret(), userId, expires, items));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
const batchIdOf = (token: string) => `cap-${String(token).split(".")[1]?.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || randomUUID().slice(0, 12)}`;

/** يقرأ الملفَّ مصفوفةً من أول ورقة. xlsx بتوقيع zip، وغيره csv نصٌّ UTF-8 (مع BOM أو بدونه). */
export function readCapacityMatrix(buffer: Buffer, fileName: string): { ok: true; matrix: unknown[][] } | { ok: false; error: string } {
  const name = String(fileName || "").toLowerCase();
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isCsv = /\.(csv|txt)$/.test(name);
  if (!isZip && !isCsv) return { ok: false, error: "الملف ليس .xlsx ولا .csv." };
  if (isZip && /\.(csv|txt)$/.test(name)) return { ok: false, error: "امتدادُ الملف csv ومحتواه xlsx. احفظه بصيغته الصحيحة." };
  try {
    const book = isZip
      ? XLSX.read(buffer, { type: "buffer", sheetRows: CAPACITY_IMPORT_MAX_ROWS + 20, cellFormula: false, cellHTML: false })
      : XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""), { type: "string", sheetRows: CAPACITY_IMPORT_MAX_ROWS + 20 });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) return { ok: false, error: "الملف بلا ورقة." };
    return { ok: true, matrix: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false }) };
  } catch {
    return { ok: false, error: "تعذّرت قراءة الملف. تأكد أنه غير تالف." };
  }
}

export function buildCapacityTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([[...CAPACITY_TEMPLATE_HEADERS]]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 10 }];
  sheet["!views"] = [{ rightToLeft: true }];
  const help = XLSX.utils.aoa_to_sheet([
    ["تعليمات"],
    ["رمز القاعة: كما في النظام، مثل A101 أو رمز المبنى معها."],
    ["المبنى: اختياري، يلزم فقط إن تكرّر رمز القاعة في أكثر من مبنى."],
    [`السعة: عدد صحيح من 1 إلى 2000. أقصى ${countOf(CAPACITY_IMPORT_MAX_ROWS, AR.row)}.`],
    ["تُقرأ الورقة الأولى وحدها."],
  ]);
  help["!cols"] = [{ wch: 70 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "السعات");
  XLSX.utils.book_append_sheet(book, help, "تعليمات");
  book.Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const capacityOf = (room: Pick<MasterRoom, "capacity">): number | null => (hasRegisteredCapacity(room) ? Number(room.capacity) : null);
const isEligible = (room: MasterRoom) => room.active && room.confidence === "CONFIRMED";
const lastEntryOf = (room: MasterRoom): LocationAuditRecord | undefined => (room.auditHistory || [])[(room.auditHistory || []).length - 1];

/** أحدثُ سطرِ كتابةٍ للدفعة في سجلّ القاعة (قد تُعاد الدفعةُ بعد تراجعها فيتكرر). */
const latestBatchEntry = (room: MasterRoom, batchId: string) => [...(room.auditHistory || [])].reverse().find(entry => entry.batchId === batchId);

export interface CapacityApplyResult { roomId: string; fullCode: string; status: "applied" | "skipped" | "undone" | "refused"; old: number | null; value: number | null; note: string }

/* حمايةٌ من الضغط المزدوج: دفعةٌ واحدة لكل حساب في آنٍ واحد، وما اكتمل يُعاد بنتيجته لا بكتابةٍ ثانية. */
const inFlight = new Set<string>();
const finished = new Map<string, { at: number; body: any }>();
const remember = (key: string, body: any) => {
  const now = Date.now();
  for (const [k, v] of finished) if (now - v.at > TOKEN_TTL_MS) finished.delete(k);
  if (finished.size > 200) finished.clear();
  finished.set(key, { at: now, body });
};

export function registerCapacityImportRoutes(app: Express): void {
  const limiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: "طلباتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." } });
  const guard = [requirePermission(7), requireRootAdmin] as const;
  const tooLarge = (error: any, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === "entity.too.large" || error?.status === 413) { res.status(413).json({ error: `الملف أكبر من ${CAPACITY_IMPORT_MAX_BYTES / 1024 / 1024} ميغابايت.` }); return; }
    next(error);
  };
  const uploadedName = (req: Request) => { try { return decodeURIComponent(String(req.get("x-file-name") || "")); } catch { return String(req.get("x-file-name") || ""); } };

  app.get(`${BASE}/template`, ...guard, (_req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=capacity-template.xlsx; filename*=UTF-8''${encodeURIComponent("نموذج-السعات.xlsx")}`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buildCapacityTemplate());
  });

  app.post(`${BASE}/preview`, limiter, ...guard, express.raw({ type: () => true, limit: CAPACITY_IMPORT_MAX_BYTES }), tooLarge, async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) { res.status(400).json({ error: "لم يصل ملف." }); return; }
    if (body.length > CAPACITY_IMPORT_MAX_BYTES) { res.status(413).json({ error: `الملف أكبر من ${CAPACITY_IMPORT_MAX_BYTES / 1024 / 1024} ميغابايت.` }); return; }
    const read = readCapacityMatrix(body, uploadedName(req));
    if ("error" in read) { res.status(400).json({ error: read.error }); return; }
    const parsed = parseCapacityMatrix(read.matrix);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const registry = await readLocationRegistry();
    const plan = planCapacityImport(parsed.rows, registry.rooms, registry.buildings);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      token: await signPlan(req.user!.SystemUserId, plan.items),
      fileName: uploadedName(req).slice(0, 120), hasBuildingColumn: parsed.hasBuildingColumn,
      counts: plan.counts, coverage: plan.coverage, items: plan.items, maxApply: CAPACITY_IMPORT_MAX_APPLY,
      rows: plan.rows.map(row => ({ line: row.line, status: row.status, reason: row.reason, note: row.note, code: row.inputCode, fullCode: row.fullCode, old: row.oldCapacity, value: row.newCapacity })),
    });
  });

  app.post(`${BASE}/apply`, limiter, ...guard, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.SystemUserId;
    const items: CapacityPlanItem[] = Array.isArray(req.body?.items) ? req.body.items.map((item: any) => ({
      roomId: String(item?.roomId || ""), kind: item?.kind === "change" ? "change" : "set", old: item?.old == null ? null : Number(item.old), value: Number(item?.value),
    })) : [];
    if (!items.length || items.some(item => !item.roomId || !Number.isInteger(item.value))) { res.status(400).json({ error: "لا خطة معاينة لاعتمادها." }); return; }
    if (!(await verifyPlan(req.body?.token, userId, items))) { res.status(409).json({ error: "انتهت صلاحية المعاينة أو تغيّرت. ارفع الملف من جديد.", code: "preview-stale" }); return; }
    const includeChanges = req.body?.includeChanges === true;
    const chosen = items.filter(item => item.kind === "set" || includeChanges);
    if (!chosen.length) { res.status(400).json({ error: "لا شيء للاعتماد: لا قاعة بلا سعة في الملف. أشّر «شمل التعديلات» لتغيير سعاتٍ مسجّلة." }); return; }
    if (chosen.length > CAPACITY_IMPORT_MAX_APPLY) { res.status(400).json({ error: `الاعتماد الواحد حتى ${countOf(CAPACITY_IMPORT_MAX_APPLY, AR.room)}. قسّم الملف.` }); return; }
    const token = String(req.body.token);
    const batchId = batchIdOf(token);
    const replayKey = `${userId}|${token}|${includeChanges ? 1 : 0}`;
    const held = finished.get(replayKey);
    if (held) { res.json({ ...held.body, replayed: true }); return; }
    const lockKey = `${userId}|${token}`;
    if (inFlight.has(lockKey)) { res.status(409).json({ error: "الاعتماد جارٍ الآن. انتظر انتهاءه.", code: "in-flight" }); return; }
    inFlight.add(lockKey);
    try {
      const registry = await readLocationRegistry(true);
      const byId = new Map(registry.rooms.map(room => [room.id, room]));
      const codeOf = new Map(registry.buildings.map(building => [building.id, building.officialCode]));
      const fullOf = (room: MasterRoom) => `${room.buildingCode || codeOf.get(room.buildingId) || ""}${room.canonicalCode}`;
      const now = new Date().toISOString();
      const results: CapacityApplyResult[] = [];
      const writes: MasterRoom[] = [];
      const originals: MasterRoom[] = [];
      for (const item of chosen) {
        const room = byId.get(item.roomId);
        if (!room) { results.push({ roomId: item.roomId, fullCode: "", status: "skipped", old: item.old, value: item.value, note: "القاعة لم تعد في السجل" }); continue; }
        const current = capacityOf(room);
        const base = { roomId: room.id, fullCode: fullOf(room), old: current, value: item.value };
        if (!isEligible(room)) { results.push({ ...base, status: "skipped", note: "غير فعّالة" }); continue; }
        if (current === item.value) { results.push({ ...base, status: "skipped", note: "سعتها هذه من قبل" }); continue; }
        if (current !== item.old) { results.push({ ...base, status: "skipped", note: "تغيّرت سعتها بعد المعاينة" }); continue; }
        const audit: LocationAuditRecord = { id: randomUUID(), at: now, byUserId: userId, action: "UPDATE", before: { capacity: current }, after: { capacity: item.value }, note: "استيراد سعات من ملف", batchId };
        writes.push({ ...room, capacity: item.value, updatedAt: now, auditHistory: [...(room.auditHistory || []), audit] });
        originals.push(room);
        results.push({ ...base, status: "applied", note: item.kind === "change" ? "تعديل" : "جديدة" });
      }
      if (writes.length) {
        try { await Repository.upsertLocationRooms(writes); }
        catch (error) {
          try { await Repository.upsertLocationRooms(originals); } catch { /* نحاول الإرجاع فحسب */ }
          invalidateLocationRegistry();
          console.error("capacity import apply failed", error);
          res.status(500).json({ error: "تعذّر الحفظ. لم يُعتمد شيء، أعد المحاولة.", applied: [], results: results.map(row => row.status === "applied" ? { ...row, status: "skipped", note: "لم تُكتب" } : row) });
          return;
        }
        invalidateLocationRegistry();
      }
      const applied = results.filter(row => row.status === "applied");
      const sets = applied.filter(row => row.old == null).length;
      const body = { batchId, applied, results, counts: { applied: applied.length, set: sets, change: applied.length - sets, skipped: results.length - applied.length } };
      res.locals.auditEntity = "location-capacity-import";
      res.locals.auditEntityId = batchId;
      res.locals.auditChanges = `استيراد سعات من ملف: ${countOf(applied.length, AR.room)}؛ جديدة: ${sets}، تعديل: ${applied.length - sets}، متخطّاة: ${results.length - applied.length}.`;
      if (applied.length) remember(replayKey, body);
      res.json(body);
    } finally { inFlight.delete(lockKey); }
  });

  app.post(`${BASE}/undo`, limiter, ...guard, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.SystemUserId;
    const batchId = String(req.body?.batchId || "");
    if (!/^cap-[A-Za-z0-9]{1,24}$/.test(batchId)) { res.status(400).json({ error: "دفعةٌ غير معروفة." }); return; }
    const lockKey = `undo|${batchId}`;
    if (inFlight.has(lockKey)) { res.status(409).json({ error: "التراجع جارٍ الآن. انتظر انتهاءه.", code: "in-flight" }); return; }
    inFlight.add(lockKey);
    try {
      const registry = await readLocationRegistry(true);
      const codeOf = new Map(registry.buildings.map(building => [building.id, building.officialCode]));
      const fullOf = (room: MasterRoom) => `${room.buildingCode || codeOf.get(room.buildingId) || ""}${room.canonicalCode}`;
      const touched = registry.rooms.filter(room => latestBatchEntry(room, batchId));
      if (!touched.length) { res.status(404).json({ error: "لا دفعةَ بهذا الرمز." }); return; }
      const now = new Date().toISOString();
      const results: CapacityApplyResult[] = [];
      const writes: MasterRoom[] = [], originals: MasterRoom[] = [];
      for (const room of touched) {
        const entry = latestBatchEntry(room, batchId)!;
        const before = entry.before?.capacity == null ? null : Number(entry.before.capacity);
        const after = entry.after?.capacity == null ? null : Number(entry.after.capacity);
        const base = { roomId: room.id, fullCode: fullOf(room), old: after, value: before };
        const last = lastEntryOf(room);
        if (last?.undoOf === batchId) { results.push({ ...base, status: "skipped", note: "تراجعت من قبل" }); continue; }
        if (last?.id !== entry.id) { results.push({ ...base, status: "refused", note: "عُدّلت بعد الدفعة" }); continue; }
        if (capacityOf(room) !== after) { results.push({ ...base, status: "refused", note: "عُدّلت بعد الدفعة" }); continue; }
        const audit: LocationAuditRecord = { id: randomUUID(), at: now, byUserId: userId, action: "UPDATE", before: { capacity: after }, after: { capacity: before }, note: "تراجع عن استيراد السعات", undoOf: batchId };
        writes.push({ ...room, capacity: before, updatedAt: now, auditHistory: [...(room.auditHistory || []), audit] });
        originals.push(room);
        results.push({ ...base, status: "undone", note: before == null ? "عادت بلا سعة" : "عادت إلى سعتها السابقة" });
      }
      if (writes.length) {
        try { await Repository.upsertLocationRooms(writes); }
        catch (error) {
          try { await Repository.upsertLocationRooms(originals); } catch { /* نحاول الإرجاع فحسب */ }
          invalidateLocationRegistry();
          console.error("capacity import undo failed", error);
          res.status(500).json({ error: "تعذّر التراجع. لم يتغيّر شيء، أعد المحاولة.", undone: [], results: [] });
          return;
        }
        invalidateLocationRegistry();
      }
      const undone = results.filter(row => row.status === "undone");
      const refused = results.filter(row => row.status === "refused");
      res.locals.auditEntity = "location-capacity-import";
      res.locals.auditEntityId = batchId;
      res.locals.auditChanges = `تراجع عن استيراد سعات: أُعيدت ${countOf(undone.length, AR.room)}؛ مرفوضة لتعديلها بعد الدفعة: ${refused.length}.`;
      for (const [key, value] of finished) if (value.body?.batchId === batchId) finished.delete(key);
      res.json({ batchId, undone, refused, results, counts: { undone: undone.length, refused: refused.length, skipped: results.length - undone.length - refused.length } });
    } finally { inFlight.delete(lockKey); }
  });

  app.get(`${BASE}/last`, ...guard, async (_req: AuthenticatedRequest, res: Response) => {
    const registry = await readLocationRegistry();
    const batches = new Map<string, { at: string; rooms: MasterRoom[] }>();
    for (const room of registry.rooms) for (const entry of room.auditHistory || []) {
      if (!entry.batchId) continue;
      const held = batches.get(entry.batchId) || { at: entry.at, rooms: [] };
      held.rooms.push(room); if (entry.at > held.at) held.at = entry.at; batches.set(entry.batchId, held);
    }
    res.setHeader("Cache-Control", "no-store");
    const latest = [...batches].sort(([, a], [, b]) => b.at.localeCompare(a.at))[0];
    if (!latest) { res.json({ batch: null }); return; }
    const [batchId, info] = latest;
    const undoable = info.rooms.filter(room => {
      const entry = latestBatchEntry(room, batchId);
      return Boolean(entry && lastEntryOf(room)?.id === entry.id);
    }).length;
    res.json({ batch: undoable ? { batchId, at: info.at, rooms: info.rooms.length, undoable } : null });
  });
}

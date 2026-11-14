/**
 * ── «استيراد السعات» من ملف Excel/CSV: القواعد الخالصة ────────────────────────────
 * الخادمُ يقرأ الملف ويطبّق هذه الدوالّ، والواجهةُ تقرأ أنواعَها وحدها. لا شيء هنا يكتب.
 *
 *   • التطبيعُ: إزالة المسافات والشرطات، الحروف كبيرة، الأرقام العربية/الهندية → لاتينية.
 *   • المطابقةُ برمز القاعة الرسمي فقط (القاعة أو المبنى+القاعة)، تامّةً بعد التطبيع — لا اسمَ ولا تقريب.
 *     رمزٌ في أكثر من مبنى ولا مبنى في الملف = ⚠️ ملتبس ولا يُطبَّق. القاعةُ غير الفعّالة/غير المعتمدة لا تُمسّ.
 *   • القرارُ لكل سطر: set (قاعةٌ بلا سعة ← تُملأ) · change (لها سعة ← تغيير لا يُطبَّق إلا بتأشير) · same (مطابقة لما سُجّل)
 *     · skip (⚠️ سببٌ قصير) · invalid (❌ قيمةٌ غير صالحة أو مكرّرةٌ بقيمتين).
 */
import type { MasterBuilding, MasterRoom } from "../types";
import { AR, countOf } from "./arabicCount";
import { capacityPercent, CAPACITY_GAP_MAX, CAPACITY_GAP_MIN, hasRegisteredCapacity, parseGapCapacity } from "./roomCapacityGaps";

export const CAPACITY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const CAPACITY_IMPORT_MAX_ROWS = 5000;
/** أقصى ما يُكتب في اعتمادٍ واحد: حدُّ دفعة Firestore الذرّية. */
export const CAPACITY_IMPORT_MAX_APPLY = 400;
export const CAPACITY_TEMPLATE_HEADERS = ["رمز القاعة", "المبنى (اختياري)", "السعة"] as const;

const LATIN_DIGITS = (text: string) => text
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

/** رمزٌ للمقارنة: NFKC، أرقامٌ لاتينية، بلا مسافات ولا شرطات ولا شُرطات سفلية ولا نقاط، حروفٌ كبيرة. */
export const normalizeRoomToken = (value: unknown): string => LATIN_DIGITS(String(value ?? "").normalize("NFKC"))
  .replace(/[\s‎‏‪-‮ _.\-‐‑‒–—―ـ]+/g, "").toUpperCase();

/** نصُّ الترويسة للمطابقة: بلا تشكيل ولا مسافات زائدة ولا أقواس «(اختياري)». */
const headerKey = (value: unknown) => LATIN_DIGITS(String(value ?? "").normalize("NFKC")).toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/\(.*?\)|（.*?）|\[.*?\]/g, " ").replace(/[\s_\-.:]+/g, " ").trim();

const CODE_HEADERS = /^(رمز القاعه|رمز قاعه|القاعه|قاعه|رقم القاعه|كود القاعه|code|room|room code|room no|hall|hall code)$/;
const BUILDING_HEADERS = /^(المبني|مبني|رمز المبني|كود المبني|building|building code|bldg)$/;
const CAPACITY_HEADERS = /^(السعه|سعه|سعه القاعه|المقاعد|مقاعد|عدد المقاعد|capacity|seats|seat count)$/;

export interface ParsedCapacityRow { line: number; code: string; building: string; capacity: string }
export interface ParsedCapacitySheet { ok: boolean; error: string; rows: ParsedCapacityRow[]; hasBuildingColumn: boolean; truncated: boolean }

/** يحدّد أعمدة الترويسة في أول ١٠ أسطر (تسامحٌ مع سطر عنوان فوقها). */
export function parseCapacityMatrix(matrix: readonly (readonly unknown[])[]): ParsedCapacitySheet {
  const fail = (error: string): ParsedCapacitySheet => ({ ok: false, error, rows: [], hasBuildingColumn: false, truncated: false });
  let headerAt = -1, codeCol = -1, buildingCol = -1, capacityCol = -1;
  for (let r = 0; r < Math.min(10, matrix.length); r++) {
    const keys = (matrix[r] || []).map(headerKey);
    const code = keys.findIndex(key => CODE_HEADERS.test(key));
    const capacity = keys.findIndex(key => CAPACITY_HEADERS.test(key));
    if (code >= 0 && capacity >= 0 && code !== capacity) { headerAt = r; codeCol = code; capacityCol = capacity; buildingCol = keys.findIndex(key => BUILDING_HEADERS.test(key)); break; }
  }
  if (headerAt < 0) return fail("لم أجد عمودَي «رمز القاعة» و«السعة». نزّل النموذج واملأه.");
  const rows: ParsedCapacityRow[] = [];
  let truncated = false;
  for (let r = headerAt + 1; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    const code = String(cells[codeCol] ?? "").trim(), capacity = String(cells[capacityCol] ?? "").trim();
    const building = buildingCol >= 0 ? String(cells[buildingCol] ?? "").trim() : "";
    if (!code && !capacity && !building) continue;
    if (rows.length >= CAPACITY_IMPORT_MAX_ROWS) { truncated = true; break; }
    rows.push({ line: r + 1, code, building, capacity });
  }
  if (truncated) return { ok: false, error: `الملف يتجاوز ${countOf(CAPACITY_IMPORT_MAX_ROWS, AR.row)}. قسّمه إلى ملفين.`, rows: [], hasBuildingColumn: buildingCol >= 0, truncated: true };
  if (!rows.length) return fail("الملف بلا أسطر تحت الترويسة.");
  return { ok: true, error: "", rows, hasBuildingColumn: buildingCol >= 0, truncated: false };
}

export type CapacityRowStatus = "set" | "change" | "same" | "skip" | "invalid";
export type CapacityRowReason =
  | "" | "no-code" | "not-found" | "ambiguous" | "inactive" | "same" | "empty-value" | "bad-value" | "duplicate-conflict" | "duplicate";

export interface CapacityRowDecision {
  line: number;
  status: CapacityRowStatus;
  reason: CapacityRowReason;
  /** النصُّ القصير الذي يُعرض بجانب السطر. */
  note: string;
  inputCode: string;
  roomId: string;
  fullCode: string;
  oldCapacity: number | null;
  newCapacity: number | null;
}

export interface CapacityPlanItem { roomId: string; kind: "set" | "change"; old: number | null; value: number }

export interface CapacityImportPlan {
  rows: CapacityRowDecision[];
  items: CapacityPlanItem[];
  counts: { total: number; set: number; change: number; same: number; skip: number; invalid: number };
  /** قاعاتُ السجل الفعّالة المعتمدة ومنها ما له سعة، ونسبتا الاكتمال الآن وبعد ✅ وحدها. */
  coverage: { total: number; withCapacity: number; percentNow: number | null; percentAfter: number | null };
}

const fullCodeOf = (room: Pick<MasterRoom, "buildingCode" | "canonicalCode">) => `${room.buildingCode || ""}${room.canonicalCode}`;
const eligible = (room: MasterRoom) => room.active && room.confidence === "CONFIRMED";

export function planCapacityImport(parsed: readonly ParsedCapacityRow[], rooms: readonly MasterRoom[], buildings: readonly Pick<MasterBuilding, "id" | "officialCode">[] = []): CapacityImportPlan {
  const buildingCodeOf = new Map(buildings.map(building => [building.id, String(building.officialCode || "")]));
  const codeOfRoom = (room: MasterRoom) => String(room.buildingCode || buildingCodeOf.get(room.buildingId) || "");
  const byToken = new Map<string, MasterRoom[]>();
  const put = (token: string, room: MasterRoom) => { if (!token) return; const list = byToken.get(token) || []; if (!list.includes(room)) list.push(room); byToken.set(token, list); };
  for (const room of rooms) {
    put(normalizeRoomToken(room.canonicalCode), room);
    put(normalizeRoomToken(`${codeOfRoom(room)}${room.canonicalCode}`), room);
  }
  const mk = (row: ParsedCapacityRow, patch: Partial<CapacityRowDecision>): CapacityRowDecision => ({
    line: row.line, status: "skip", reason: "", note: "", inputCode: row.code, roomId: "", fullCode: "", oldCapacity: null, newCapacity: null, ...patch,
  });
  const decisions: CapacityRowDecision[] = parsed.map(row => {
    const token = normalizeRoomToken(row.code);
    if (!token) return mk(row, { reason: "no-code", note: "بلا رمز قاعة" });
    let candidates = byToken.get(token) || [];
    const buildingToken = normalizeRoomToken(row.building);
    if (buildingToken && candidates.length) candidates = candidates.filter(room => normalizeRoomToken(codeOfRoom(room)) === buildingToken);
    if (!candidates.length) return mk(row, { reason: "not-found", note: "الرمز غير موجود في السجل" });
    if (candidates.length > 1) return mk(row, { reason: "ambiguous", note: `الرمز في ${countOf(candidates.length, AR.building)}${buildingToken ? "" : ". أضف المبنى"}` });
    const room = candidates[0];
    const base = { roomId: room.id, fullCode: fullCodeOf({ buildingCode: codeOfRoom(room), canonicalCode: room.canonicalCode }), oldCapacity: hasRegisteredCapacity(room) ? Number(room.capacity) : null };
    if (!eligible(room)) return mk(row, { ...base, reason: "inactive", note: "غير فعّالة" });
    const value = parseGapCapacity(row.capacity);
    if (!value.ok) {
      const empty = !String(row.capacity).trim();
      return mk(row, { ...base, status: "invalid", reason: empty ? "empty-value" : "bad-value", note: empty ? "السعة فارغة" : /تتجاوز/.test(value.error) ? `أكثر من ${CAPACITY_GAP_MAX}` : Number(LATIN_DIGITS(String(row.capacity).trim())) < CAPACITY_GAP_MIN && /^\d+$/.test(LATIN_DIGITS(String(row.capacity).trim())) ? "أقل من مقعد" : "ليست عدداً صحيحاً" });
    }
    if (base.oldCapacity === value.value) return mk(row, { ...base, status: "same", reason: "same", note: "مطابقة للمسجّلة", newCapacity: value.value });
    return mk(row, { ...base, status: base.oldCapacity == null ? "set" : "change", newCapacity: value.value });
  });

  /* التكرار: القاعةُ الواحدة مرتين. بالقيمة نفسها يبقى سطرٌ واحد؛ بقيمتين تسقط كلتاهما ❌. */
  const groups = new Map<string, CapacityRowDecision[]>();
  for (const decision of decisions) if (decision.roomId && decision.newCapacity != null) groups.set(decision.roomId, [...(groups.get(decision.roomId) || []), decision]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const values = new Set(group.map(item => item.newCapacity));
    if (values.size > 1) group.forEach(item => { item.status = "invalid"; item.reason = "duplicate-conflict"; item.note = "مكرّرة بقيمتين مختلفتين"; });
    else group.slice(1).forEach(item => { item.status = "skip"; item.reason = "duplicate"; item.note = "مكرّرة بالقيمة نفسها"; });
  }
  /* سطرٌ لقاعةٍ رُدّ من أحد مكرّريها ❌ لا يُطبَّق منه شيء حتى لو سلم آخر. */
  const items: CapacityPlanItem[] = decisions.filter(item => item.status === "set" || item.status === "change")
    .map(item => ({ roomId: item.roomId, kind: item.status as "set" | "change", old: item.oldCapacity, value: item.newCapacity as number }));
  const counts = { total: decisions.length, set: 0, change: 0, same: 0, skip: 0, invalid: 0 };
  decisions.forEach(item => { counts[item.status]++; });
  const counted = rooms.filter(eligible);
  const withCapacity = counted.filter(hasRegisteredCapacity).length;
  return {
    rows: decisions, items, counts,
    coverage: { total: counted.length, withCapacity, percentNow: capacityPercent(counted.length, withCapacity), percentAfter: capacityPercent(counted.length, withCapacity + counts.set) },
  };
}

/**
 * ── حكمٌ واحد لكل نموذج موعد ────────────────────────────────────────────────
 *
 * كان شريط «صحّح قبل الحفظ» يقرأ مصدراً، ولوحة «فحص موانع الحفظ» تقرأ آخر،
 * وزرّ الحفظ ثالثاً — فيقول الشريط «صحّح» واللوحة «صالح للحفظ» في الشاشة نفسها.
 * هذا الملف هو المصدر الوحيد: يأخذ ما قاله الخادم (التعارضات + موانع الحمولة)
 * وما يعرفه النموذج (الحقول المختارة)، ويُخرج:
 *   • قائمة الموانع (يقرؤها الشريط وزرّ الحفظ واللوحة معاً)،
 *   • ست بطاقات فحص بأيقونة وحالة وكلمة واحدة (👤 🏫 🧩 🖥️ 🕐 🏢).
 *
 * والقاعدة: لا يُفحص حقلٌ لم يُختر. تعارضُ أستاذ قبل اختيار أستاذ، أو نطاقُ
 * قاعة قبل اختيار قاعة، بقايا موعد سابق — لا حقيقة عن هذا الموعد.
 */
import { isBlockingConflict } from "./scheduleIntelligence";

export type CheckKind = "teacher" | "room" | "section" | "facility" | "time" | "college";
export type CheckState = "ok" | "warn" | "block" | "idle";

export interface VerdictDetail {
  id: string;
  text: string;
  detail?: string;
  blocks: boolean;
  /** التعارض الخام من الخادم إن وُجد، ليعرض البطاقة التفصيلية أو يطلب بديلاً. */
  conflict?: any;
}

export interface VerdictCheck {
  kind: CheckKind;
  label: string;
  state: CheckState;
  /** كلمة واحدة: متاح · تنبيه · تعارض · — */
  word: string;
  details: VerdictDetail[];
}

export interface AppointmentVerdict {
  /** checking: الخادم لم يُجب بعد عن هذه القيم بالضبط. */
  state: "empty" | "checking" | "blocked" | "notes" | "ready";
  blockers: VerdictDetail[];
  notes: VerdictDetail[];
  checks: VerdictCheck[];
  okCount: number;
  canSave: boolean;
}

export interface VerdictForm {
  AdCourseId?: unknown;
  AdInstructorId?: unknown;
  buildingId?: unknown;
  roomId?: unknown;
  AdRoomCode?: unknown;
  AdRoomHall?: unknown;
  locationStatus?: unknown;
  companionRoomId?: unknown;
  fstarttime?: unknown;
  fendtime?: unknown;
  fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown;
}

export interface VerdictInput {
  form: VerdictForm;
  validationIssues: readonly string[];
  conflicts: readonly any[];
  checking?: boolean;
  /** المقرر يتطلب مرفقاً مرافقاً (استوديو…). */
  companionRequired?: boolean;
  /** هل يطابق الموعد نمطاً معتمداً؟ off → تنبيه ⚠️ لا يمنع. */
  regulation?: "fits" | "off" | "unknown";
  regulationNote?: string;
  /** ملاحظات لا تمنع الحفظ من مصادر أخرى (مراجعة اللائحة، السجل التاريخي). */
  notes?: ReadonlyArray<{ kind: CheckKind; text: string; detail?: string }>;
}

export const CHECK_LABELS: Record<CheckKind, string> = {
  teacher: "الأستاذ",
  room: "القاعة",
  section: "الشعبة",
  facility: "المرفق",
  time: "الوقت",
  college: "النطاق",
};

const ORDER: CheckKind[] = ["teacher", "room", "section", "facility", "time", "college"];

/** أين يقع نصُّ مانعٍ قاله الخادم. */
export function issueKind(text: string): CheckKind {
  const value = String(text || "");
  if (/مرفق|الاستوديو|استوديو/.test(value)) return "facility";
  if (/الكلية|نطاق|خارج صلاحيات/.test(value)) return "college";
  if (/القاعة|المبنى|قاعة/.test(value)) return "room";
  if (/ساعات هذا المقرر|الشعبة|المقرر/.test(value) && !/وقت|يوم/.test(value)) return "section";
  return "time";
}

/** أين يقع تعارضٌ قاله محرّك التعارض. */
export function conflictKind(conflict: any): CheckKind {
  switch (String(conflict?.type || "")) {
    case "instructor": return "teacher";
    case "room": case "hallBarter": case "hallBarterWindow": case "doorway": return "room";
    case "roomScope": case "travel": return "college";
    case "duplicate": case "sectionTwice": case "cohort": return "section";
    default: return "time";
  }
}

const filled = (value: unknown) => String(value ?? "").trim() !== "" && String(value) !== "0";
const anyDay = (form: VerdictForm) => ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].some(key => Boolean((form as any)[key]));

/** ما اختاره المستخدم فعلاً في النموذج — وحده يُفحص. */
export function chosenFields(form: VerdictForm, companionRequired = false): Record<CheckKind, boolean> {
  const room = filled(form.roomId) || (filled(form.AdRoomCode) && filled(form.AdRoomHall)) || form.locationStatus === "PENDING_ROOM";
  const time = anyDay(form) && filled(form.fstarttime) && filled(form.fendtime);
  return {
    teacher: filled(form.AdInstructorId),
    room,
    section: filled(form.AdCourseId),
    facility: companionRequired && filled(form.buildingId),
    time,
    college: room || filled(form.AdInstructorId),
  };
}

/** يُسقط ما يخص حقلاً لم يُختر بعد (بقايا موعد سابق أو فحص سابق لأوانه). */
export function relevantConflicts(conflicts: readonly any[], form: VerdictForm, companionRequired = false): any[] {
  const chosen = chosenFields(form, companionRequired);
  return conflicts.filter(conflict => {
    const kind = conflictKind(conflict);
    if (kind === "teacher") return chosen.teacher;
    if (kind === "room") return chosen.room;
    if (kind === "college") return String(conflict?.type) === "travel" ? chosen.room && chosen.teacher : chosen.room;
    return true;
  });
}

export function relevantIssues(issues: readonly string[], form: VerdictForm, companionRequired = false): string[] {
  const chosen = chosenFields(form, companionRequired);
  return [...new Set(issues.map(String).filter(Boolean))].filter(text => {
    /* «اختر يوماً» ليس مانعاً بل حقل لم يُملأ بعد: زرّ الحفظ ينتظره وحده. */
    if (/يجب اختيار يوم/.test(text)) return false;
    const kind = issueKind(text);
    if (kind === "facility") return chosen.facility;
    if (kind === "room" || kind === "college") return chosen.room;
    return true;
  });
}

const conflictText = (conflict: any) => String(conflict?.message || "تعارض").trim();

export function appointmentVerdict(input: VerdictInput): AppointmentVerdict {
  const { form, companionRequired = false } = input;
  const chosen = chosenFields(form, companionRequired);
  const issues = relevantIssues(input.validationIssues, form, companionRequired);
  const conflicts = relevantConflicts(input.conflicts, form, companionRequired);
  const byKind = new Map<CheckKind, VerdictDetail[]>(ORDER.map(kind => [kind, []]));
  issues.forEach((text, index) => byKind.get(issueKind(text))!.push({ id: `issue-${index}`, text, blocks: true }));
  conflicts.forEach((conflict, index) => byKind.get(conflictKind(conflict))!.push({
    id: `conflict-${conflict?.type || "x"}-${conflict?.rowId || conflict?.otherId || index}-${index}`,
    text: conflictText(conflict),
    detail: String(conflict?.detail || "").replace(/\s+/g, " ").trim() || undefined,
    blocks: isBlockingConflict(conflict),
    conflict,
  }));
  (input.notes || []).forEach((note, index) => {
    if (!chosen[note.kind] && note.kind !== "time") return;
    byKind.get(note.kind)!.push({ id: `note-${index}`, text: note.text, detail: note.detail, blocks: false });
  });
  if (input.regulation === "off" && chosen.time) {
    byKind.get("time")!.push({ id: "regulation", text: input.regulationNote || "خارج نمط اللائحة", blocks: false });
  }
  const checks: VerdictCheck[] = ORDER
    .filter(kind => kind !== "facility" || companionRequired)
    .map(kind => {
      const details = byKind.get(kind)!;
      const isChosen = chosen[kind];
      const state: CheckState = details.some(item => item.blocks) ? "block"
        : details.length ? "warn"
          : isChosen ? "ok" : "idle";
      const word = state === "block" ? "تعارض" : state === "warn" ? "تنبيه" : state === "ok" ? "سليم" : "—";
      return { kind, label: CHECK_LABELS[kind], state, word, details };
    });
  const all = checks.flatMap(check => check.details);
  const blockers = all.filter(item => item.blocks);
  const notes = all.filter(item => !item.blocks);
  const anyChosen = ORDER.some(kind => chosen[kind]);
  const state: AppointmentVerdict["state"] = input.checking ? "checking"
    : blockers.length ? "blocked"
      : !anyChosen ? "empty"
        : notes.length ? "notes" : "ready";
  return {
    state,
    blockers,
    notes,
    checks,
    okCount: checks.filter(check => check.state === "ok").length,
    canSave: !input.checking && !blockers.length,
  };
}

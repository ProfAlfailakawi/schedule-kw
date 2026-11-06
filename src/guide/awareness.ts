/**
 * ── وعي المرشد بالموقف ──
 *
 * يجمع ما يعرفه البرنامج أصلاً: الشاشة، والنافذة المفتوحة، والمحاضرة المحددة،
 * وحالة شريط الاستيراد، وآخر الأفعال، وخطوات الجولة التي تمت. كله في المتصفح:
 * لا يُرسل شيء، ولا يُحفظ اسم ولا قاعة؛ معرّفات ثابتة وعلامات فقط.
 */
import type { GuideFeature, GuideProfile } from "./smartGuide";
import { predictedNextFeature } from "./smartGuide";

export type GuideDialog = "editor" | "import" | "review" | "other" | null;
export type ImportState = "checking" | "blocked" | "baseline-failed" | "unverified" | "ready" | "applied" | null;
export type Situation = {
  view: string;
  scheduleView?: string;
  dialog: GuideDialog;
  importState: ImportState;
  selectedId: number;
  selectionConflict: boolean;
  unsaved: boolean;
  /** مانع اعتماد معروض في الرئيسية؛ علامة فقط بلا تفاصيل. */
  blocker: boolean;
  recent: string[];
};
export type DomProbe = { query: (selector: string) => { getAttribute: (name: string) => string | null } | null };

export function readSituation(view: string, context: any, recent: string[], dom: DomProbe): Situation {
  const bar = dom.query("[data-import-bar]");
  const importState = (bar?.getAttribute("data-state") || null) as ImportState;
  const dialog: GuideDialog = bar ? "import"
    : dom.query("[data-guide-editor-field]") ? "editor"
    : dom.query(".review-sheet") ? "review"
    : dom.query("[role='dialog']:not(.guide-panel)") ? "other" : null;
  const current = String(context?.currentFeatureId || "");
  const scheduleView = current === "schedule.view.rooms" ? "rooms" : current === "schedule.view.week" ? "week" : current === "schedule.view.list" ? "list" : undefined;
  return {
    view, scheduleView, dialog, importState,
    selectedId: Number(context?.selected?.id || 0),
    selectionConflict: Boolean(context?.selected?.conflict),
    unsaved: Boolean(context?.unsaved),
    blocker: Boolean(dom.query("[data-guide-blocker]")),
    recent,
  };
}

/** جواب يصنعه الموقف لا السؤال: يظهر قبل الاقتراحات العادية، ويُسأل عنه بـ«ماذا الآن». */
export type SituationAnswer = { key: string; title: string; steps: string[]; featureId?: string };

export function situationAnswer(s: Situation): SituationAnswer | null {
  if (s.importState === "blocked") return { key: "import-blocked", title: "الاستيراد متوقف عند ملاحظات", featureId: "schedule.tool.data", steps: ["اضغط «انتقل إلى الملاحظة» في الشريط السفلي.", "صحّح الصف في المعاينة أو في ملفك ثم ارفعه.", "يعيد الفحص نفسه تلقائياً، ولا يُكتب شيء قبل النشر."] };
  if (s.importState === "baseline-failed") return { key: "import-baseline", title: "تعذّرت قراءة جدول الفصل الحالي", featureId: "schedule.tool.data", steps: ["اضغط «أعد المحاولة» في الشريط السفلي.", "تحقق من الاتصال ومن الفصل المختار.", "لم يُكتب شيء من الملف."] };
  if (s.importState === "unverified") return { key: "import-unverified", title: "تعذّر فحص الاستيراد مسبقاً", featureId: "schedule.tool.data", steps: ["اضغط «أعد الفحص» في الشريط السفلي.", "إن استمر، يفحص الخادم الجدول عند النشر ويرفض ما يتعارض."] };
  if (s.importState === "ready") return { key: "import-ready", title: "اكتمل فحص الاستيراد", featureId: "schedule.tool.data", steps: ["راجع المعاينة مرة أخيرة.", "اضغط زر النشر في الشريط السفلي."] };
  if (s.selectedId && s.selectionConflict) return { key: "selection-conflict", title: "المحاضرة المحددة فيها تعارض", featureId: "schedule.tool.review", steps: ["افتح مراجعة الاعتماد لقراءة سبب التعارض.", "غيّر الوقت أو القاعة أو الأستاذ.", "راجع النتيجة قبل الحفظ."] };
  return null;
}

const SCREEN_DEFAULTS: Record<string, string[]> = {
  schedules: ["schedule.action.move-room", "schedule.tool.review", "schedule.tool.data"],
  dashboard: ["page.schedules", "page.instructorRequests", "page.reportDepartment"],
  intelligence: ["intelligence.scene.understand", "intelligence.scene.try", "intelligence.ask-table"],
  scheduleChanges: ["changes.action.note", "changes.action.return", "changes.action.accept"],
  instructorRequests: ["proposal-start", "requests.action.fix", "requests.action.reject"],
  studentRegistration: ["registration.action.state", "page.reportDepartment"],
  timeMachine: ["timeMachine.action.apply", "timeMachine.action.restore"],
  searchInstructor: ["page.reportInstructor", "page.searchRoomTime"],
  searchRoom: ["page.searchRoomTime", "page.reportRoom"],
  users: ["page.permissions", "page.scopes"],
};
const SELECTION_SUGGESTIONS = ["schedule.action.change-time", "schedule.action.move-room", "schedule.action.change-instructor"];
const EDITOR_SUGGESTIONS = ["schedule.action.quick-fill", "schedule.undo", "schedule.action.find-room"];

/** ثلاثة اقتراحات هادئة على الأكثر، من الموقف ثم العادة ثم الشاشة، بلا ما سبق إكماله الآن. */
export function suggestFor(s: Situation, allowed: Map<string, GuideFeature>, profile: GuideProfile, finished: Set<string> = new Set()): GuideFeature[] {
  const ids: string[] = [];
  if (s.blocker) ids.push("schedule.tool.review");
  if (s.dialog === "editor") ids.push(...EDITOR_SUGGESTIONS);
  else if (s.selectedId) ids.push(...SELECTION_SUGGESTIONS);
  const last = s.recent[s.recent.length - 1];
  const predicted = last ? predictedNextFeature(profile, last) : predictedNextFeature(profile, `page.${s.view}`);
  if (predicted) ids.push(predicted.id);
  ids.push(...(SCREEN_DEFAULTS[s.view] || []), `page.${s.view}`);
  const out: GuideFeature[] = [];
  for (const id of ids) {
    const feature = allowed.get(id);
    // المانع قائم ما لم يُعالَج، فلا تُخفيه جولة أُنهيت من قبل.
    const urgent = s.blocker && id === "schedule.tool.review";
    if (!feature || out.includes(feature) || (!urgent && (finished.has(id) || s.recent.slice(-1)[0] === id))) continue;
    out.push(feature);
    if (out.length === 3) break;
  }
  return out;
}

export function greetingFor(s: Situation): string {
  if (s.dialog === "import") return "أنت داخل الاستيراد الآن.";
  if (s.dialog === "editor") return "أنت في محرر الموعد.";
  if (s.selectedId) return "لديك محاضرة محددة.";
  return "اسأل عمّا تريد إنجازه.";
}

/* تقدم الجولات: معرّف الميزة ورقم الخطوة لا غير. */
const progressKey = (userId: number) => `schedule-guide-tours-v1:${Number(userId) || 0}`;
export type TourProgress = Record<string, { step: number; total: number; at: number; done?: boolean }>;
const DAY = 24 * 60 * 60 * 1000;
export function loadTourProgress(userId: number, storage: Pick<Storage, "getItem"> | null = safeStorage()): TourProgress {
  try { return JSON.parse(storage?.getItem(progressKey(userId)) || "{}") || {}; } catch { return {}; }
}
export function saveTourProgress(userId: number, featureId: string, entry: { step: number; total: number; done?: boolean }, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()) {
  const all = loadTourProgress(userId, storage);
  all[featureId] = { ...entry, at: Date.now() };
  const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 40));
  try { storage?.setItem(progressKey(userId), JSON.stringify(trimmed)); } catch { /* التخزين غائب */ }
}
/** جولة تُركت في منتصفها خلال اليوم: تُستكمل من مكانها بدل البدء من أولها. */
export function unfinishedTour(progress: TourProgress, featureId?: string): { featureId: string; step: number; total: number } | null {
  const rows = Object.entries(progress).filter(([id, row]) => (!featureId || id === featureId) && !row.done && row.step > 0 && row.step < row.total && Date.now() - row.at < DAY).sort((a, b) => b[1].at - a[1].at);
  return rows[0] ? { featureId: rows[0][0], step: rows[0][1].step, total: rows[0][1].total } : null;
}
export const finishedTours = (progress: TourProgress) => new Set(Object.entries(progress).filter(([, row]) => row.done && Date.now() - row.at < 7 * DAY).map(([id]) => id));
function safeStorage(): Storage | null { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } }

/** ينظّف السؤال قبل تسجيله: لا أسماء بعد الألقاب، ولا أرقام، ولا طول. */
export function anonymizeQuestion(value: string): string {
  return String(value || "")
    .replace(/(?:^|\s)(?:د\.?|دكتور(?:ة|ه)?|الدكتور(?:ة|ه)?|أستاذ(?:ة|ه)?|الأستاذ(?:ة|ه)?|استاذ(?:ة|ه)?|الاستاذ(?:ة|ه)?|Dr\.?|Prof\.?|Mr\.?|Mrs\.?)\s+\S+(?:\s+\S+)?/gi, " أستاذ")
    .replace(/\S+@\S+/g, " ")
    .replace(/[\d٠-٩]+/g, "#")
    .replace(/\s+/g, " ").trim().slice(0, 90);
}

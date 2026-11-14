/**
 * ── مسارات الجولات ──
 *
 * تُبنى الجولة من تعريف الميزة نفسه في السجل، فلا تنشأ نسخة ثانية تنحرف عنه.
 * يضيف البناء ما كان ناقصاً: خطوة الوصول من القائمة، وفتح «المزيد» بنفسه،
 * وتبديل عرض الجدول، وخطوة انتظار الاختيار. وما تحقق فعلاً يُحذف فلا يُكرَّر.
 */
import type { GuideCommand, GuideFeature } from "../smartGuide";
import { GUIDE_BANK } from "../bank";

export type TourNeed = "selection";
export type TourStepSpec = {
  id: string;
  text: string;
  target?: string;
  selector?: string;
  /** أمر للشاشة قبل البحث عن العنصر. */
  command?: GuideCommand;
  /** الانتقال إلى شاشة عند الضغط على «التالي». */
  navigate?: string;
  /** عنصر في القائمة الجانبية: يُفتح درجها ومجموعتها أولاً. */
  sidebar?: boolean;
  /** خطوة تنتظر فعلاً من المستخدم. */
  needs?: TourNeed;
  /** يضغط المرشد العنصر عند «التالي»: تبويب لا يغيّر بيانات. */
  press?: boolean;
  /** إن لم يوجد العنصر تُتجاوز الخطوة بلا إزعاج. */
  optional?: boolean;
};
export type TourEnv = {
  activeView: string;
  /** العرض الحالي داخل الجدول: list أو week أو rooms. */
  scheduleView?: string;
  selectedId?: number;
  selectedCourse?: string;
  phone?: boolean;
  /** الجدول على الهاتف قائمة للقراءة: لا أسبوع ولا قاعات ولا محرر. */
  phoneReadOnly?: boolean;
  /** وجهات الشريط السفلي الظاهرة الآن: الطريق الظاهر أولى من فتح الدرج. */
  dock?: string[];
};
export type TourPlan = { steps: TourStepSpec[]; note?: string };

const IN_MORE = new Set(["schedule.tool.review", "schedule.tool.data", "schedule.tool.focus", "schedule.practice"]);
/** النشر يسكن نافذة أدوات الجدول، فتُفتح أولاً. */
const IN_TRANSFER = new Set(["schedule.publish", "schedule.publish.requests"]);
const EDIT_FIELD: Record<string, { task: string; field: string; ask: string }> = {
  "schedule.action.change-time": { task: "time", field: "[data-guide-editor-field='time']", ask: "اختر المحاضرة التي تريد تعديل وقتها، وسأكمل تلقائياً." },
  "schedule.action.change-course": { task: "course", field: "[data-guide-editor-field='course-name']", ask: "اختر الموعد الذي تريد تغيير مقرره، وسأكمل تلقائياً." },
  "schedule.action.change-instructor": { task: "instructor", field: "[data-guide-editor-field='instructor']", ask: "اختر المحاضرة التي تريد تغيير أستاذها، وسأكمل تلقائياً." },
};
const SELECTOR_VIEW: Array<[RegExp, string]> = [[/rooms-|schedule\.rooms/, "rooms"], [/week-|schedule\.week/, "week"]];
const changeView = (value: string): GuideCommand => ({ scope: "schedule", type: "changeView", value });

const viewOfStep = (step: { target?: string; selector?: string }) => {
  const key = `${step.target || ""} ${step.selector || ""}`;
  return SELECTOR_VIEW.find(([pattern]) => pattern.test(key))?.[1] || "";
};

function coreSteps(feature: GuideFeature, env: TourEnv): TourStepSpec[] {
  const bank = GUIDE_BANK[feature.id];
  const edit = EDIT_FIELD[feature.id];
  if (edit) {
    const selected = Boolean(env.selectedId);
    return [
      ...(selected ? [] : [{ id: "pick", selector: "[data-row-id]", needs: "selection" as const, text: edit.ask }]),
      { id: "field", selector: edit.field, command: { scope: "schedule", type: "openEditSelected", task: edit.task, featureId: feature.id }, text: feature.steps?.[1]?.text || bank.s[bank.s.length - 1] },
    ];
  }
  if (feature.id === "schedule.action.move-room" || feature.id === "schedule.action.find-room") {
    const verb = feature.id === "schedule.action.move-room" ? "نقلها" : "البحث عن بديل لها";
    return [
      { id: "view", target: "schedule.view.rooms", command: changeView("rooms"), text: "هذا عرض «المباني والقاعات»؛ منه يتم النقل." },
      env.selectedId
        ? { id: "card", selector: `[data-row-id="${Number(env.selectedId)}"]`, command: changeView("rooms"), text: feature.id === "schedule.action.move-room" ? "هذه محاضرتك المحددة؛ أمسكها من هنا." : "هذه محاضرتك المحددة." }
        : { id: "pick", selector: ".rooms-card", command: changeView("rooms"), needs: "selection", text: `اختر بطاقة المحاضرة التي تريد ${verb}، وسأكمل تلقائياً.` },
      { id: "track", selector: ".rooms-track", command: changeView("rooms"), text: feature.id === "schedule.action.move-room" ? "اسحبها إلى القاعة أو الوقت المطلوب. لا يُعتمد تغيير غير مسموح به." : "قارن هنا القاعات والأوقات المتاحة قبل أي نقل." },
    ];
  }
  if (IN_TRANSFER.has(feature.id)) {
    const rest = (feature.steps || []).filter(step => step.target !== "schedule.tool.more").map((step, index) => ({ id: `s${index}`, target: step.target, text: step.text }));
    return [{ id: "tab", selector: '[data-guide-tab="publish"]', command: { scope: "schedule", type: "openTransfer" }, press: true, text: "هذا تبويب «نشر» في أدوات الجدول؛ سأفتحه لك." }, ...rest];
  }
  const authored = (feature.steps || []).filter(step => step.target !== "schedule.tool.more");
  const raw: TourStepSpec[] = authored.map((step, index) => ({ id: `s${index}`, target: step.target, selector: step.selector, command: step.command, text: step.text }));
  if (!raw.length && feature.target) raw.push({ id: "target", target: feature.target, text: feature.summary });
  if (!raw.length && feature.view) {
    // الجواب والجولة مصدر واحد: كل سطر بعد «افتح…» خطوة على الشاشة.
    const lines = (bank?.s || []).filter(line => !/^افتح/.test(line));
    (lines.length ? lines : [feature.summary]).forEach((text, index) => raw.push({ id: `screen${index}`, selector: ".content-frame", text }));
  }
  return raw.map(step => {
    const key = step.target || "";
    if (!step.command && (IN_MORE.has(key) || IN_MORE.has(feature.id))) return { ...step, command: { scope: "schedule", type: "showTarget", target: key || feature.id } };
    const view = viewOfStep(step);
    if (!step.command && view) return { ...step, command: changeView(view) };
    return step;
  });
}

export function buildTour(feature: GuideFeature, env: TourEnv): TourPlan {
  const needsWide = Boolean(feature.view === "schedules" && env.phoneReadOnly && (EDIT_FIELD[feature.id] || feature.id === "schedule.action.move-room" || feature.id === "schedule.action.find-room" || feature.id === "schedule.action.quick-fill"));
  const steps: TourStepSpec[] = [];
  if (feature.view && feature.view !== env.activeView) {
    const dockLabel = DOCK_LABELS[feature.view];
    steps.push(dockLabel && env.dock?.includes(feature.view)
      ? { id: "nav", selector: `[data-guide-dock="${feature.view}"]`, navigate: feature.view, optional: true, text: `اضغط «${dockLabel}» في الشريط السفلي.` }
      : { id: "nav", target: `page.${feature.view}`, sidebar: true, navigate: feature.view, optional: true, text: `افتح «${navTitle(feature)}» من القائمة.` });
  }
  if (needsWide) return { steps, note: "هذه العملية تحتاج شاشة أوسع: الجدول على الهاتف قائمة للقراءة. افتحه من حاسوب لإكمالها." };
  let core = coreSteps(feature, env);
  // ما تحقق لا يُعاد: أنت على عرض القاعات، فلا خطوة لفتحه.
  if (feature.view === env.activeView && env.scheduleView) {
    core = core.filter((step, index) => !(index === 0 && core.length > 1 && step.target && step.command?.type === "changeView" && step.command.value === env.scheduleView));
  }
  return { steps: [...steps, ...core] };
}

/** ما يقرؤه الجواب هو ما تمشيه الجولة، فلا يختلف العدد أبداً. */
export const answerSteps = (plan: TourPlan) => [...plan.steps.map(step => step.text), ...(plan.note ? [plan.note] : [])];

const DOCK_LABELS: Record<string, string> = { dashboard: "الرئيسية", schedules: "الجدول" };
function navTitle(feature: GuideFeature) {
  if (feature.id.startsWith("page.")) return feature.title;
  return VIEW_TITLES[feature.view || ""] || feature.title;
}
const VIEW_TITLES: Record<string, string> = {
  schedules: "الجدول الدراسي", intelligence: "مركز الذكاء", scheduleChanges: "تغييرات الجدول",
  instructorRequests: "رغبات الأساتذة", studentRegistration: "كشف التسجيل", timeMachine: "آلة الزمن", sectionHours: "أوقات دوام الأقسام",
};

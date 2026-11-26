/**
 * ── نبض القاعات: «وضع المجلس» (نقيّ بلا React ولا three.js) ─────────────────
 *
 * جولةٌ تلقائية لاجتماع القسم بلا تحضير: يوم القسم في لقطة، ثم الضغط (أشدّ لحظة
 * من hallPulseDay)، ثم الهدر (القاعات الواسعة على شعبها وتبعثر المساء)، ثم الحلول
 * المقترحة (خطة «رتّب قاعاتي» و«ضمّ المساء» أرقاماً قبل وبعد)، ثم الختام باسم القسم
 * وبصمته من فيلم الفصل إن حُمل. كل خطوةٍ تعليقٌ مكتوب ولحظةٌ في اليوم وقاعةٌ تُبرَز
 * وخطةٌ تُعاين (لا تُحفظ). القراءة وحدها: لا يكتب هذا الملف شيئاً، ولا يذكر مقرراً
 * ولا أستاذاً — القاعات والأعداد وحدها.
 */
import { AR, countOf, nounFor, type ArabicNoun } from "./arabicCount";
import { applyPlan, clockText, fitClass, metrics, planDay, planMoves, type Assignment, type DayPlan, type PulseDay, type PulseHall, type PulseModel } from "./hallPulse";
import { peakMoment, pressureCurve, worstMoment } from "./hallPulseDay";
import { busiestEveningMinute, eveningFootprint, eveningSummary, floorsAfterPreposition, planEvening, CLOSES, EVENING_START, type EveningPlan } from "./hallPulseEvening";

export const MOVE: ArabicNoun = { one: "نقلة", two: "نقلتان", few: "نقلات", many: "نقلة" };
const n = (v: number) => Math.round(v).toLocaleString("ar-KW-u-nu-latn");
/* النسبة معزولةً اتجاهياً داخل الجملة العربية: «54%» لا «%54». */
const pct = (v: number) => `\u2066${n(v)}%\u2069`;

export type CouncilKind = "day" | "pressure" | "waste" | "scatter" | "arrange" | "evening" | "close";
export interface CouncilFigure { value: string; label: string; tone?: "pressed" | "fit" | "wide" | "brass" | "calm" }
export interface CouncilStep {
  kind: CouncilKind;
  eyebrow: string;
  title: string;
  lines: string[];
  figures: CouncilFigure[];
  /** لحظة اليوم التي يقف عليها المشهد. */
  minute: number;
  /** القاعة التي تقترب منها الكاميرا وتُبرَز، أو null للمنظر الكامل. */
  focus: string | null;
  /** الخطة التي تُعاين في المشهد (بلا حفظ). */
  plan: "none" | "arrange" | "evening";
  /** مدّة الخطوة في الجولة التلقائية. */
  seconds: number;
}
export interface CouncilClosing { name: string; term: string; line: string; counts: Array<{ value: number; label: string }> }
export interface CouncilTour {
  day: PulseDay;
  steps: CouncilStep[];
  arrange: DayPlan | null;
  evening: EveningPlan;
}

export const COUNCIL_SECONDS = 9;

const hallName = (h: PulseHall) => (h.lab ? h.code : `قاعة ${h.code}`);

/**
 * الجولة كلها من النموذج والجدول الأصلي ليومٍ واحد. خطوةٌ لا رقم لها تسقط (لا مساء = لا خطوة
 * تبعثر)، ولا يُخترع ضغطٌ ولا هدر: اليوم المرتّب يقول ذلك صراحةً.
 */
export function councilTour(model: PulseModel, base: Assignment, day: PulseDay, opts: { dayLabel: string; closing?: CouncilClosing | null; scopeName?: string; college?: boolean }): CouncilTour {
  const steps: CouncilStep[] = [];
  const curve = pressureCurve(model, base, day);
  const worst = worstMoment(model, base, day, curve);
  const peak = peakMoment(curve);
  const m0 = metrics(model, base, day);
  const today = model.sessions.filter(s => s.days.includes(day));
  const usedHalls = new Set(today.map(s => base.get(s.id) || s.hallKey));
  const mid = Math.round((model.dayStart + model.dayEnd) / 2 / 5) * 5;

  /* ١ — اليوم في لقطة */
  steps.push({
    kind: "day", eyebrow: `${opts.college ? "مجلس الكلية" : "مجلس القسم"} · نبض القاعات · ${opts.dayLabel}`,
    title: today.length ? `${countOf(today.length, AR.section)} في ${countOf(usedHalls.size, AR.room)}` : `لا محاضرات يوم ${opts.dayLabel}`,
    lines: [
      peak ? `ذروة الحضور ${clockText(peak.minute)} بنحو ${countOf(peak.students, AR.student)} في القاعات معاً (تقدير من سعة كل مقرر).` : "المباني هادئة طوال اليوم.",
      ...(opts.scopeName ? [opts.scopeName] : []),
    ],
    figures: today.length ? [
      { value: `${n(m0.pct)}%`, label: "من الشعب في قاعة تناسبها", tone: "fit" },
      { value: n(m0.over), label: `${nounFor(m0.over, AR.section)} مضغوطة`, tone: "pressed" },
      { value: n(m0.wide), label: `${nounFor(m0.wide, AR.section)} في قاعة واسعة`, tone: "wide" },
    ] : [],
    minute: peak ? peak.minute + 5 : mid, focus: null, plan: "none", seconds: COUNCIL_SECONDS,
  });
  if (!today.length) return { day, steps, arrange: null, evening: planEvening(model, base, day) };

  /* ٢ — الضغط */
  if (worst) {
    const h = model.hallByKey.get(worst.hallKey)!;
    steps.push({
      kind: "pressure", eyebrow: "الضغط", title: `أشدّ لحظة: ${clockText(worst.minute)}`,
      lines: [
        `${hallName(h)} فيها نحو ${countOf(worst.students, AR.student)} في ${countOf(worst.capacity, AR.seat)}: ${countOf(worst.over, AR.student)} بلا مقعد.`,
        worst.pressed > 1 ? `ومعها في اللحظة نفسها ${countOf(worst.pressed - 1, AR.room)} مضغوطة أخرى.` : "وهي وحدها فوق سعتها في تلك اللحظة.",
      ],
      figures: [
        { value: n(worst.totalOver), label: `${nounFor(worst.totalOver, AR.student)} فوق السعة في تلك اللحظة`, tone: "pressed" },
        { value: n(m0.over), label: `${nounFor(m0.over, AR.section)} مضغوطة في اليوم`, tone: "pressed" },
      ],
      minute: worst.minute + 5, focus: worst.hallKey, plan: "none", seconds: COUNCIL_SECONDS,
    });
  } else {
    steps.push({
      kind: "pressure", eyebrow: "الضغط", title: "لا قاعة فوق سعتها اليوم",
      lines: [m0.full ? `أقصى ما بلغه اليوم ${countOf(m0.full, AR.section)} ممتلئة تماماً.` : "كل شعبةٍ تجد مقعداً لكل طالب."],
      figures: [], minute: peak ? peak.minute + 5 : mid, focus: null, plan: "none", seconds: COUNCIL_SECONDS,
    });
  }

  /* ٣ — الهدر: أوسع قاعةٍ على شعبتها، ثم تبعثر المساء */
  const capOf = (key: string) => model.hallByKey.get(key)?.capacity || 0;
  const waste = today
    .filter(s => s.students && capOf(base.get(s.id) || s.hallKey) && fitClass(s.students, capOf(base.get(s.id) || s.hallKey)) === "wide")
    .sort((a, b) => (capOf(base.get(b.id) || b.hallKey) - b.students!) - (capOf(base.get(a.id) || a.hallKey) - a.students!) || a.start - b.start)[0];
  if (waste) {
    const h = model.hallByKey.get(base.get(waste.id) || waste.hallKey)!;
    steps.push({
      kind: "waste", eyebrow: "الهدر", title: `${countOf(m0.waste, AR.seat)} فارغة في قاعات واسعة`,
      lines: [`أوضحها ${hallName(h)}: تسع ${countOf(h.capacity!, AR.seat)} وفيها نحو ${countOf(waste.students!, AR.student)} عند ${clockText(waste.start)}.`],
      figures: [{ value: n(m0.wide), label: `${nounFor(m0.wide, AR.section)} في قاعة أوسع من حاجتها`, tone: "wide" }],
      minute: waste.start + 5, focus: h.key, plan: "none", seconds: COUNCIL_SECONDS,
    });
  }
  const evening = planEvening(model, base, day);
  const eveningAt = busiestEveningMinute(model, day);
  if (evening.before.sessions && evening.before.floors > 1) {
    steps.push({
      kind: "scatter", eyebrow: "الهدر · بعد الثانية ظهراً",
      title: `${countOf(evening.before.sessions, AR.section)} على ${floorsAfterPreposition(evening.before.floors)}`,
      lines: [`بعد الثانية تبقى ${countOf(evening.before.halls, AR.room)} مضاءة في ${floorsAfterPreposition(evening.before.floors)} لشعبٍ قليلة.`],
      figures: [
        { value: n(evening.before.halls), label: "القاعات المضاءة مساءً", tone: "brass" },
        { value: n(evening.before.floors), label: "الطوابق المضاءة مساءً", tone: "brass" },
      ],
      minute: (eveningAt ?? EVENING_START) + 5, focus: null, plan: "none", seconds: COUNCIL_SECONDS,
    });
  }

  /* ٤ — الحلول المقترحة: معاينة فقط */
  const arrange = planDay(model, base, day);
  const hasArrange = arrange.groups.length > 0;
  if (hasArrange) {
    const after = metrics(model, applyPlan(base, arrange), day);
    const moves = planMoves(arrange).length;
    const inPlan = worst && arrange.groups.some(g => g.moves.some(mv => mv.sessionId === worst.sessionId));
    steps.push({
      kind: "arrange", eyebrow: "الحل المقترح · رتّب القاعات",
      title: `${countOf(moves, MOVE)} داخل القسم`,
      lines: [
        `المضغوطة من ${n(m0.over)} إلى ${n(after.over)}، والتناسب من ${pct(m0.pct)} إلى ${pct(after.pct)}.`,
        "يسار الفاصل بعد الترتيب، ويمينه القاعات كما هي الآن. اقتراحٌ للنقاش: لم يُحفظ شيء.",
      ],
      figures: [
        { value: `${n(m0.over)} ← ${n(after.over)}`, label: "الشعب المضغوطة", tone: "pressed" },
        { value: `${n(m0.pct)}% ← ${n(after.pct)}%`, label: "نسبة الشعب في قاعة تناسبها", tone: "fit" },
      ],
      minute: (inPlan && worst ? worst.minute : Math.min(...arrange.groups.map(g => g.start))) + 5,
      focus: null, plan: "arrange", seconds: COUNCIL_SECONDS + 2,
    });
  }
  if (evening.plan) {
    steps.push({
      kind: "evening", eyebrow: "الحل المقترح · ضمّ المساء",
      title: eveningSummary(evening.closed, evening.after.floors, evening.before.floors),
      lines: [
        `${countOf(planMoves(evening.plan).length, MOVE)} تجمع شعب المساء، كلٌّ في قاعةٍ من نوعها تتّسع لها، فتنطفئ بقية الطوابق بعد الثانية.`,
        "اقتراحٌ للنقاش: لم يُحفظ شيء.",
      ],
      figures: [
        { value: n(evening.closed), label: `${nounFor(evening.closed, AR.room)} ${nounFor(evening.closed, CLOSES)} مساءً`, tone: "calm" },
        { value: `${n(evening.before.floors)} ← ${n(evening.after.floors)}`, label: "الطوابق المضاءة مساءً", tone: "calm" },
      ],
      minute: (eveningAt ?? EVENING_START) + 5, focus: null, plan: "evening", seconds: COUNCIL_SECONDS + 2,
    });
  }
  if (!hasArrange && !evening.plan) {
    steps.push({
      kind: "arrange", eyebrow: "الحلول المقترحة", title: "لا نقلة تحسّن هذا اليوم",
      lines: [arrange.unsolved.length
        ? `بقيت ${countOf(arrange.unsolved.length, AR.section)} مضغوطة لا قاعة لها داخل القسم: بابها الاستعارة من قسمٍ مجاور.`
        : "القاعات مرتّبة، والمساء مجموعٌ أصلاً."],
      figures: [], minute: worst ? worst.minute + 5 : peak ? peak.minute + 5 : mid, focus: null, plan: "none", seconds: COUNCIL_SECONDS,
    });
  }

  /* ٥ — الختام */
  const c = opts.closing;
  const proposals = [
    hasArrange ? `${countOf(planMoves(arrange).length, MOVE)} ترتّب القاعات` : "",
    evening.plan ? `${countOf(evening.closed, AR.room)} ${nounFor(evening.closed, CLOSES)} مساءً` : "",
  ].filter(Boolean);
  steps.push({
    kind: "close", eyebrow: c ? c.term : "الخلاصة", title: c ? c.name : "خلاصة الجولة",
    lines: [proposals.length ? `على الطاولة: ${proposals.join("، و")}. القرار للقسم، والحفظ من الورشة.` : "لا اقتراح على الطاولة: اليوم كما يجب.", ...(c?.line ? [c.line] : [])],
    figures: c ? c.counts.slice(0, 3).map(x => ({ value: n(x.value), label: x.label, tone: "brass" as const })) : [],
    minute: peak ? peak.minute + 5 : mid, focus: null, plan: "none", seconds: COUNCIL_SECONDS + 1,
  });
  return { day, steps, arrange: hasArrange ? arrange : null, evening };
}

/** الخطوة التالية والسابقة بحدود الجولة؛ ما بعد الأخيرة يُنهيها (null). */
export function councilNext(index: number, total: number, dir: 1 | -1): number | null {
  const next = index + dir;
  if (next < 0) return 0;
  if (next >= total) return null;
  return next;
}

/** مفاتيح المجلس: الأسهم والمسافة للتنقّل، وEscape للخروج. اليسار «التالي» لأن القراءة من اليمين. */
export function councilKey(key: string): "next" | "prev" | "exit" | "pause" | null {
  if (key === "ArrowLeft" || key === " " || key === "Spacebar" || key === "PageDown" || key === "Enter") return "next";
  if (key === "ArrowRight" || key === "PageUp" || key === "Backspace") return "prev";
  if (key === "Escape" || key === "Esc") return "exit";
  if (key === "p" || key === "P") return "pause";
  return null;
}

/** للمشهد: أي طوابق المساء ينطفئ بعد الخطة، وأيها يبقى مضاءً. */
export function eveningMood(model: PulseModel, base: Assignment, planned: Assignment, day: PulseDay): { off: Set<string>; keep: Set<string> } {
  const a = eveningFootprint(model, base, day), b = eveningFootprint(model, planned, day);
  return { off: new Set([...a.floors].filter(f => !b.floors.has(f))), keep: b.floors };
}

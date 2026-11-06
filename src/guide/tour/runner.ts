/**
 * ── محرك الجولة ──
 *
 * آلة حالات لا تعرف React، فتُختبر بلا متصفح. قاعدتها الوحيدة: لا تختفي الجولة
 * صامتة. كل خطوة تنتهي إلى إحدى ثلاث: ظهر العنصر، أو ننتظر فعل المستخدم، أو
 * نقول بوضوح إننا لم نجده ونعرض ما يمكن فعله. لا تنتهي إلا بيد المستخدم.
 *
 * أصل عطل «أنتقل إلى الشاشة المطلوبة» القديم: كان الإرشاد ينتظر حدث
 * `schedule-view-ready`، ولا أحد في البرنامج يطلقه، فتبقى الجولة معلقة حتى
 * يغلقها مؤقت الاثنتي عشرة ثانية. هنا لا حدث يُنتظر: ننتقل ثم نبحث عن العنصر.
 */
import type { TourStepSpec } from "./tours";

export type TourStatus = "seeking" | "showing" | "waiting" | "missing" | "done";
export type TourSnapshot = { status: TourStatus; index: number; total: number; step: TourStepSpec | null };
export type TourHost<E> = {
  find: (step: TourStepSpec) => E | null;
  command: (step: TourStepSpec) => void;
  reveal: (step: TourStepSpec) => void;
  navigate: (view: string) => void;
  /** جلب العنصر إلى منتصف الشاشة. */
  bring: (element: E) => void;
  press?: (element: E) => void;
  selection: () => number;
  /** مؤقت قابل للحقن: الاختبار يديره يدوياً. */
  later: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  onChange: (state: TourSnapshot, element: E | null) => void;
  onProgress?: (index: number, step: TourStepSpec) => void;
  onFinish?: (completed: boolean, index: number) => void;
};
export const TOUR_SEEK_MS = 7000;
/** الشاشة المنتقَل إليها قد لا تكون استمعت بعد: يُعاد الأمر الآمن أثناء البحث. */
const RESEND_EVERY = 8;
export const TOUR_OPTIONAL_MS = 1200;
const POLL_MS = 120;

export class TourRunner<E> {
  private steps: TourStepSpec[] = [];
  private index = 0;
  private generation = 0;
  private timer: unknown = null;
  private element: E | null = null;
  status: TourStatus = "done";
  constructor(private host: TourHost<E>) {}

  start(steps: TourStepSpec[], at = 0) {
    this.steps = steps;
    this.go(Math.min(Math.max(0, at), Math.max(0, steps.length - 1)));
  }
  snapshot(): TourSnapshot {
    return { status: this.status, index: this.index, total: this.steps.length, step: this.steps[this.index] || null };
  }
  private emit() { this.host.onChange(this.snapshot(), this.element); }
  private clear() { if (this.timer != null) this.host.cancel(this.timer); this.timer = null; }

  private go(index: number) {
    this.clear();
    this.generation += 1;
    this.index = index;
    this.element = null;
    this.status = "seeking";
    const step = this.steps[index];
    if (!step) { this.finish(true); return; }
    this.emit();
    this.host.onProgress?.(index, step);
    if (step.needs === "selection" && this.host.selection()) { this.next(); return; }
    if (step.sidebar) this.host.reveal(step);
    if (step.command) this.host.command(step);
    this.seek(this.generation, 0, step.optional ? TOUR_OPTIONAL_MS : TOUR_SEEK_MS);
  }

  private seek(generation: number, elapsed: number, budget: number) {
    if (generation !== this.generation) return;
    const step = this.steps[this.index];
    const element = this.host.find(step);
    if (element) {
      this.element = element;
      this.host.bring(element);
      // ظهر العنصر قبل أن تستمع الشاشة الجديدة أحياناً: الأمر الآمن يُكرر مرتين ولا يضر.
      if (step.command && step.command.type !== "openEditSelected" && step.command.type !== "openTransfer") for (const ms of [500, 1400]) this.host.later(() => { if (generation === this.generation) this.host.command(step); }, ms);
      this.status = step.needs ? "waiting" : "showing";
      this.emit();
      if (step.needs) this.watch(generation, this.host.selection());
      return;
    }
    const round = Math.round(elapsed / POLL_MS);
    if (step.command && step.command.type !== "openEditSelected" && round > 0 && round % RESEND_EVERY === 0) this.host.command(step);
    if (elapsed >= budget) {
      if (step.optional) { this.advanceFrom(step); return; }
      this.status = "missing";
      this.emit();
      // قد يظهر العنصر متأخراً: نواصل النظر بهدوء دون سحب البطاقة من يد المستخدم.
      this.timer = this.host.later(() => this.seek(generation, elapsed, budget), 800);
      return;
    }
    this.timer = this.host.later(() => this.seek(generation, elapsed + POLL_MS, budget), POLL_MS);
  }

  private watch(generation: number, startedWith: number) {
    if (generation !== this.generation) return;
    const current = this.host.selection();
    if (current && current !== startedWith) { this.next(); return; }
    this.timer = this.host.later(() => this.watch(generation, startedWith), 200);
  }

  private advanceFrom(step: TourStepSpec) {
    if (step.navigate) this.host.navigate(step.navigate);
    if (step.press && this.element) this.host.press?.(this.element);
    if (this.index >= this.steps.length - 1) { this.finish(true); return; }
    this.go(this.index + 1);
  }

  /** ضغط المستخدم العنصر المضاء بنفسه: الفعل تم، فلا يُعاد الانتقال ولا الضغط. */
  targetClicked() {
    const step = this.steps[this.index];
    if (!step || this.status !== "showing") return;
    if (this.index >= this.steps.length - 1) { this.finish(true); return; }
    this.go(this.index + 1);
  }
  next() { const step = this.steps[this.index]; if (step) this.advanceFrom(step); }
  back() { if (this.index > 0) this.go(this.index - 1); }
  /** يتخطى خطوة لم يجدها إلى ما بعدها. */
  skipStep() { const step = this.steps[this.index]; if (step) this.advanceFrom({ ...step, navigate: step.navigate }); }
  retry() { this.go(this.index); }
  /** فقد العنصر مكانه بعد ظهوره: نبحث عنه من جديد بدل رسم فراغ. */
  relocate() { if (this.status === "showing" || this.status === "waiting") this.go(this.index); }
  stop() { this.finish(false); }
  private finish(completed: boolean) {
    const index = this.index;
    this.clear();
    this.generation += 1;
    this.status = "done";
    this.element = null;
    this.emit();
    this.host.onFinish?.(completed, index);
  }
}

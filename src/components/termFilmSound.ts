/**
 * ── موسيقى «فيلم الفصل» ─────────────────────────────────────────────────────
 *
 * فرشةٌ هادئة تُولَّد في المتصفح (Web Audio) ونقرةُ جرسٍ خافتة عند تبدّل المشهد.
 * لا ملف صوت ولا مكتبة. مطفأةٌ ما لم يشغّلها صاحبها، واختياره يُحفظ في جهازه.
 *
 * قاعدتها الواحدة: لا يُنشأ سياق الصوت إلا من نقرة (`unlock` تُنادى من معالج
 * نقرٍ فقط)، فلا يخرج صوتٌ بلا نقرة. وحيث لا يوجد AudioContext (بعض نوافذ
 * التطبيق) تسكت الدوالّ كلها بلا خطأ.
 */

const SOUND_KEY = "schedule:term-film:sound";

export function readFilmSoundChoice(): boolean {
  try { return window.localStorage.getItem(SOUND_KEY) === "1"; } catch { return false; }
}

export function writeFilmSoundChoice(on: boolean): void {
  try { window.localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch { /* الحفظ مغلق في هذا المتصفح: يبقى الاختيار لهذه الجلسة */ }
}

type AudioCtor = typeof AudioContext;
const audioCtor = (): AudioCtor | null => {
  if (typeof window === "undefined") return null;
  return (window.AudioContext || (window as any).webkitAudioContext || null) as AudioCtor | null;
};

export const filmSoundSupported = (): boolean => Boolean(audioCtor());

/* ري كبير بتاسعته: ري، لا، مي، فا دييز — وترٌ مفتوح لا يشدّ ولا يحزن. */
const BED = [146.83, 220.0, 329.63, 369.99];
/* سلّمٌ خماسي على ري لجرس المشاهد، يصعد مع الفيلم. */
const CHIME = [587.33, 659.25, 739.99, 880.0, 987.77, 880.0, 1174.66, 1174.66];
const LEVEL = 0.5;

class FilmSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private send: GainNode | null = null;
  private sleep = 0;

  /** من معالج نقرٍ فقط: ينشئ السياق (مرةً) ويوقظه. يعيد false حيث لا صوت. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const Ctor = audioCtor();
        if (!Ctor) return false;
        this.ctx = new Ctor();
        this.build(this.ctx);
      }
      void this.ctx.resume?.().catch(() => undefined);
      return true;
    } catch { this.ctx = null; this.master = null; this.send = null; return false; }
  }

  private build(ctx: AudioContext) {
    const out = ctx.createGain();
    out.gain.value = LEVEL;
    out.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(out);
    /* صدًى قصير يليّن الجرس ويملأ الفرشة. */
    const send = ctx.createGain();
    send.gain.value = 0.32;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass"; damp.frequency.value = 1800;
    send.connect(delay); delay.connect(damp); damp.connect(feedback); feedback.connect(delay); damp.connect(master);

    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass"; soft.frequency.value = 1100; soft.Q.value = 0.3;
    soft.connect(master); soft.connect(send);
    BED.forEach((frequency, n) => {
      const voice = ctx.createGain();
      voice.gain.value = n === 0 ? 0.075 : 0.045;
      voice.connect(soft);
      /* نَفَسٌ بطيء لكل صوتٍ بإيقاعه، فلا تثبت الفرشة على حال. */
      const breath = ctx.createOscillator();
      breath.frequency.value = 0.045 + n * 0.017;
      const depth = ctx.createGain();
      depth.gain.value = n === 0 ? 0.03 : 0.028;
      breath.connect(depth); depth.connect(voice.gain); breath.start();
      [-4, 4].forEach(cents => {
        const osc = ctx.createOscillator();
        osc.type = "sine"; osc.frequency.value = frequency; osc.detune.value = cents;
        osc.connect(voice); osc.start();
      });
    });
    this.master = master; this.send = send;
  }

  get unlocked(): boolean { return Boolean(this.ctx && this.master); }

  /** يرفع الفرشة بهدوء. لا يفعل شيئاً قبل `unlock`. */
  play(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    try {
      window.clearTimeout(this.sleep);
      void ctx.resume?.().catch(() => undefined);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(1, now + 1.4);
    } catch { /* صامت */ }
  }

  /** يُسكت الفرشة ثم يُنيم السياق. */
  hush(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.3);
      window.clearTimeout(this.sleep);
      this.sleep = window.setTimeout(() => { void ctx.suspend?.().catch(() => undefined); }, 420);
    } catch { /* صامت */ }
  }

  /** جرسٌ خافت للمشهد `step`؛ والمشهد الأخير نغمتان. */
  chime(step: number, last = false): void {
    const { ctx, master, send } = this;
    if (!ctx || !master || !send || ctx.state !== "running") return;
    try {
      const notes = last ? [587.33, 880.0, 1174.66] : [CHIME[Math.max(0, step) % CHIME.length]];
      notes.forEach((frequency, n) => {
        const at = ctx.currentTime + 0.02 + n * 0.16;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, at);
        env.gain.exponentialRampToValueAtTime(last ? 0.075 : 0.085, at + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);
        env.connect(master); env.connect(send);
        [[1, 1], [2, 0.22], [3.01, 0.06]].forEach(([ratio, level]) => {
          const osc = ctx.createOscillator();
          const part = ctx.createGain();
          part.gain.value = level;
          osc.type = "sine"; osc.frequency.value = frequency * ratio;
          osc.connect(part); part.connect(env);
          osc.start(at); osc.stop(at + 2);
        });
      });
    } catch { /* صامت */ }
  }
}

export const filmSound = new FilmSound();

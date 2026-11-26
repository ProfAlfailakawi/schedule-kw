/**
 * ── نغمة «اليوم يمرّ أمامك» ──────────────────────────────────────────────────
 *
 * نغمةٌ محيطة خافتة تُركَّب بـWeb Audio وحده (لا ملف صوت ولا تبعية): وترٌ هادئ من
 * ثلاثة مذبذبات يمرّ بمرشّح، يعلو وينفتح مع الازدحام ويهدأ مع الفراغ، ونبضٌ خفيف
 * يظهر حين تفيض قاعة. مطفأةٌ افتراضاً، ولا تبدأ إلا من ضغطة المستخدم، وتسكت
 * بصمتٍ تام حيث لا AudioContext (مثل بعض نوافذ التطبيقات).
 */
const KEY = "hall-pulse-sound-v1";

type Ctx = AudioContext;
const ctor = (): (new () => Ctx) | null => {
  try {
    const w = window as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx };
    return w.AudioContext || w.webkitAudioContext || null;
  } catch { return null; }
};

export const soundAvailable = () => ctor() != null;
export function readSoundChoice(): boolean { try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function writeSoundChoice(on: boolean) { try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* تصفّحٌ خاص */ } }

export class PulseSound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private high: GainNode | null = null;
  private throb: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private running = false;

  /** يبدأ من ضغطة المستخدم وحدها. يعيد false بصمتٍ إن تعذّر الصوت. */
  start(): boolean {
    if (this.running) return true;
    try {
      const C = ctor();
      if (!C) return false;
      const ctx = this.ctx || new C();
      this.ctx = ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(0.03, now + 1.2);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass"; filter.frequency.setValueAtTime(320, now); filter.Q.setValueAtTime(0.6, now);
      const high = ctx.createGain(); high.gain.setValueAtTime(0, now);
      const throb = ctx.createGain(); throb.gain.setValueAtTime(0, now);
      /* وترٌ مفتوح (ري–لا–ري) هادئ، ونغمةٌ أعلى تدخل مع الازدحام. */
      const voice = (freq: number, type: OscillatorType, gain: number, detune: number, into: AudioNode) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now); o.detune.setValueAtTime(detune, now);
        const g = ctx.createGain(); g.gain.setValueAtTime(gain, now);
        o.connect(g); g.connect(into); o.start(now);
        this.oscillators.push(o);
      };
      voice(146.83, "sine", 0.9, -4, filter);
      voice(220, "triangle", 0.45, 5, filter);
      voice(293.66, "sine", 0.35, 0, filter);
      voice(440, "sine", 0.5, 3, high);
      voice(587.33, "sine", 0.28, -3, high);
      high.connect(filter);
      /* نبضٌ بطيء على الصوت كله: عمقه من الضغط. */
      const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.setValueAtTime(0.5, now);
      lfo.connect(throb); throb.connect(master.gain); lfo.start(now);
      filter.connect(master); master.connect(ctx.destination);
      this.master = master; this.filter = filter; this.high = high; this.throb = throb; this.lfo = lfo;
      this.running = true;
      return true;
    } catch { this.silence(); return false; }
  }

  /** الازدحام 0–1 يفتح المرشّح ويرفع الصوت قليلاً؛ والتوتّر 0–1 يُدخل النبض. */
  set(crowd: number, tension: number) {
    if (!this.running || !this.ctx || !this.master || !this.filter || !this.high || !this.throb || !this.lfo) return;
    try {
      const t = this.ctx.currentTime, c = Math.max(0, Math.min(1, crowd)), x = Math.max(0, Math.min(1, tension));
      this.master.gain.setTargetAtTime(0.022 + 0.04 * c, t, 0.5);
      this.filter.frequency.setTargetAtTime(300 + 1500 * c * c + 500 * x, t, 0.45);
      this.high.gain.setTargetAtTime(0.55 * c, t, 0.6);
      this.throb.gain.setTargetAtTime(0.012 * x, t, 0.4);
      this.lfo.frequency.setTargetAtTime(0.5 + 2.2 * x, t, 0.6);
    } catch { /* الصوت زينة: لا يُسقط العرض */ }
  }

  /** يخفت ثم يسكت. */
  stop() {
    if (!this.running) return;
    this.running = false;
    const ctx = this.ctx, master = this.master, oscillators = [...this.oscillators, ...(this.lfo ? [this.lfo] : [])];
    this.oscillators = []; this.master = null; this.filter = null; this.high = null; this.throb = null; this.lfo = null;
    try {
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(0.0001, t, 0.12);
        oscillators.forEach(o => { try { o.stop(t + 0.7); } catch { /* توقّف من قبل */ } });
        window.setTimeout(() => { try { master.disconnect(); } catch { /* مفصول */ } }, 900);
      }
    } catch { /* لا شيء */ }
  }

  private silence() {
    this.running = false;
    this.oscillators.forEach(o => { try { o.stop(); } catch { /* لم يبدأ */ } });
    this.oscillators = []; this.master = null; this.filter = null; this.high = null; this.throb = null; this.lfo = null;
  }

  dispose() {
    this.stop();
    const ctx = this.ctx; this.ctx = null;
    if (ctx) window.setTimeout(() => { try { void ctx.close().catch(() => undefined); } catch { /* مغلق */ } }, 950);
  }
}

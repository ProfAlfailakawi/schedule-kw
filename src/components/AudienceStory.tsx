/**
 * ── وضع القصة: عرضُ الجمهور شرائحَ بملء الشاشة ─────────────────────────────────────
 *
 * يتقدّم وحده كل ٨ ثوانٍ، وللمشاهد أن يوقفه (WCAG 2.2.2) أو يتنقّل بالأسهم واللمس والنقاط. لمن يفضّل قلّة الحركة يبدأ موقوفاً
 * ويتنقّل يدوياً. أرقامُه هي أرقامُ اللوحة نفسها (headlineTotals وغيرها) فلا يختلف رقمٌ بين الشاشتين.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { headlineTotals, type AudienceStats } from "../utils/audienceStats";
import { AUDIENCE_BASELINE } from "../utils/audienceBaseline";
import { hourAr, peakSummary } from "../utils/adInsights";
import { TRIAL_DAYS, activeSlots } from "../utils/adsEngine";
import { STORY_MS, STORY_SLIDES, keyDirection, stepStory, storyAutoplays, swipeDirection } from "../utils/audienceStory";

const nf = new Intl.NumberFormat("ar-KW-u-nu-latn");
const fmt = (n: number) => nf.format(Math.round(n));
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export default function AudienceStory({ stats, onClose }: { stats: AudienceStats; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reducedMotion());
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const head = useMemo(() => headlineTotals(stats), [stats]);
  const peak = useMemo(() => (stats.visits.days > 0 ? peakSummary(stats.visits.heat) : null), [stats]);
  const total = STORY_SLIDES.length;

  const go = useCallback((dir: 1 | -1) => setIndex(i => stepStory(i, dir, total)), [total]);
  const close = useCallback(() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); onClose(); }, [onClose]);

  useEffect(() => { root.current?.focus(); void root.current?.requestFullscreen?.().catch(() => undefined); }, []);
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) onClose(); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [onClose]);
  useEffect(() => {
    if (!storyAutoplays({ paused, reducedMotion: reducedMotion(), index, total })) return;
    const id = window.setTimeout(() => go(1), STORY_MS);
    return () => window.clearTimeout(id);
  }, [paused, index, total, go]);

  const onKey = (e: React.KeyboardEvent) => {
    const dir = keyDirection(e.key);
    if (dir) { e.preventDefault(); go(dir); }
    else if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); setPaused(p => !p); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Home") { e.preventDefault(); setIndex(0); }
    else if (e.key === "End") { e.preventDefault(); setIndex(total - 1); }
  };

  const id = STORY_SLIDES[index];
  const slots = activeSlots().filter(s => s.id !== "sponsor");
  const demand = stats.demand.top.slice(0, 6);
  const demandMax = Math.max(1, ...demand.map(d => d.students));
  const hours = peak?.hourTotals || [];
  const hoursMax = Math.max(1, ...hours);

  return (
    <div
      ref={root} className="pt-story" role="dialog" aria-modal="true" aria-label="عرض الجمهور" tabIndex={-1} onKeyDown={onKey}
      onPointerDown={e => { touch.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={e => { const t = touch.current; touch.current = null; if (!t) return; const d = swipeDirection(e.clientX - t.x, e.clientY - t.y); if (d) go(d); }}
    >
      <header className="pt-story-top">
        <span>SCHEDULE · نظام القرار الأكاديمي</span>
        <span className="pt-story-tools">
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? "تشغيل العرض" : "إيقاف العرض"}>{paused ? <Play aria-hidden="true" size={18} /> : <Pause aria-hidden="true" size={18} />}</button>
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={close} aria-label="إغلاق العرض"><X aria-hidden="true" size={18} /></button>
        </span>
      </header>

      <section key={id} className="pt-story-slide" aria-live="polite">
        {id === "size" ? <>
          <h2>جمهورٌ حقيقي يفتح البرنامج بنفسه</h2>
          <p className="pt-story-sub">منذ {AUDIENCE_BASELINE.since}، فصلاً بعد فصل</p>
          <div className="pt-story-grid">
            <div><b><em>حوالي</em> {fmt(head.students)}</b><span>إجمالي الطلبة المستفيدين</span></div>
            <div><b><em>حوالي</em> {fmt(head.visits)}</b><span>إجمالي دخول الطلبة</span></div>
            <div><b><em>حوالي</em> {fmt(AUDIENCE_BASELINE.instructors)}</b><span>أعضاء هيئة التدريس</span></div>
            <div><b><em>حوالي</em> {fmt(head.instructorOpens)}</b><span>إجمالي دخول أعضاء هيئة التدريس</span></div>
          </div>
        </> : null}

        {id === "peak" ? <>
          <h2>متى يفتح الطلبة البرنامج؟</h2>
          {peak && peak.window ? <>
            <p className="pt-story-big">{hourAr(peak.window.from)} – {hourAr(peak.window.to)}</p>
            <p className="pt-story-sub">أنشط الأيام: {peak.topDays.map(d => d.name).join("، ")}</p>
            <div className="pt-story-hours" role="img" aria-label="الزيارات حسب الساعة">
              {hours.map((v, h) => <i key={h} className={peak.window && h >= peak.window.from && h < peak.window.to ? "on" : ""} style={{ blockSize: `${Math.max(4, Math.round((v / hoursMax) * 100))}%` }} title={hourAr(h)} />)}
            </div>
          </> : <p className="pt-story-sub">القياس يتراكم؛ تظهر الذروة بعد أيامٍ من الزيارات.</p>}
        </> : null}

        {id === "demand" ? <>
          <h2>ما يبحث عنه الطلبة هذا الفصل</h2>
          {demand.length ? <div className="pt-story-bars">
            {demand.map(d => <div key={d.code}><span>{d.name}</span><em><i style={{ inlineSize: `${(d.students / demandMax) * 100}%` }} /></em><b>{fmt(d.students)}</b></div>)}
          </div> : <p className="pt-story-sub">لا مقرر بلغ حدّ الخصوصية بعد.</p>}
          <p className="pt-story-note">أعدادٌ مجمّعة بلا أسماء.</p>
        </> : null}

        {id === "slots" ? <>
          <h2>أين يظهر إعلانك</h2>
          <div className="pt-story-slots">
            {slots.map(s => {
              const perf = stats.adsBySlot.find(x => x.slot === s.id);
              return <div key={s.id}><b>{s.label}</b><small>{s.hint}</small><span><bdi dir="ltr">{s.width}×{s.height}</bdi>{perf ? ` · نقر ${new Intl.NumberFormat("ar-KW-u-nu-latn", { maximumFractionDigits: 1 }).format(perf.ctr)}%` : ""}</span></div>;
            })}
          </div>
        </> : null}

        {id === "next" ? <>
          <h2>خطوتك التالية</h2>
          <p className="pt-story-big">جرّب {countOf(TRIAL_DAYS, AR.day)} مجاناً</p>
          <ol className="pt-story-steps">
            <li><b>١</b><span>اختر الموقع والموسم</span></li>
            <li><b>٢</b><span>نجهّز حملتك ونعتمدها</span></li>
            <li><b>٣</b><span>تتابع نتائجك حيّةً في تقريرك</span></li>
          </ol>
        </> : null}
      </section>

      <footer className="pt-story-nav">
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="الشريحة السابقة"><ChevronRight aria-hidden="true" size={22} /></button>
        <span className="pt-story-dots" role="group" aria-label="الشرائح">
          {STORY_SLIDES.map((s, i) => <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={s} type="button" className={i === index ? "on" : ""} aria-label={`الشريحة ${i + 1} من ${total}`} aria-current={i === index} onClick={() => setIndex(i)} />)}
        </span>
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" onClick={() => go(1)} disabled={index === total - 1} aria-label="الشريحة التالية"><ChevronLeft aria-hidden="true" size={22} /></button>
      </footer>
    </div>
  );
}

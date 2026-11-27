import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  markSealSeen, readSealSeen, sealMomentDue, sealMomentKey, sealMomentLine, sealMomentMode, sealRosette, sealTextArc,
  SEAL_MOMENT_MS, SEAL_STILL_MS, type ApprovalSeal, type SealMomentMode,
} from "../utils/approvalSeal";
import "../styles/approval-seal.css";

/**
 * ── ختم الاعتماد (FR-DSH-032 · FR-DSH-037) ──────────────────────────────────
 *
 * ثلاثة أشياء من رسمٍ واحد:
 *  - `SealMark`: الختم الذهبي نفسه، SVG بخصائص مكتوبة لا أصناف CSS، فيُنزَّل مع
 *    ملصق البصمة كما يُرى.
 *  - `ApprovalSealMoment`: لحظة الرئيسية — يُضغط الختم على الشاشة ثم ينسحب.
 *  - `usePulseSealMoment`: لحظة «نبض القاعات» — غسلةٌ ذهبية فوق المشهد ونوافذه.
 *
 * اللحظتان لا تحجبان شيئاً: الطبقة لا تلتقط المؤشر، وأيّ ضغطةٍ أو مفتاحٍ (ومنه
 * Esc) أو تمريرٍ يسحبها فوراً. لا تُطبعان، ومن يفضّل حركةً أقل يرى الإطار الساكن.
 */

const FONT = '"Plex Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif';
const r1 = (value: number) => Math.round(value * 10) / 10;

/** الختم الذهبي حول نقطة (cx, cy) بنصف قطر r، مائلاً قليلاً كختمٍ ضُغط باليد. */
export function SealMark({ seal, cx, cy, r, tilt = -9 }: { seal: Pick<ApprovalSeal, "termName" | "date">; cx: number; cy: number; r: number; tilt?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ink = "#5a3a08", light = "#fff4cf";
  const star = (x: number, y: number, size: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? size * 0.42 : size;
      pts.push(`${r1(x + rr * Math.cos(a))},${r1(y + rr * Math.sin(a))}`);
    }
    return pts.join(" ");
  };
  return <g transform={`rotate(${tilt} ${cx} ${cy})`} direction="rtl" fontFamily={FONT}>
    <defs>
      <linearGradient id={`${uid}body`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fbe7a2" /><stop offset=".45" stopColor="#e2b452" /><stop offset="1" stopColor="#a9741d" />
      </linearGradient>
      <radialGradient id={`${uid}core`} cx="42%" cy="36%" r="70%">
        <stop offset="0" stopColor="#fff0bd" /><stop offset=".6" stopColor="#ebc366" /><stop offset="1" stopColor="#c08a2a" />
      </radialGradient>
      <filter id={`${uid}shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy={r1(r * 0.035)} stdDeviation={r1(r * 0.05)} floodColor="#3b2603" floodOpacity=".38" />
      </filter>
      <path id={`${uid}top`} d={sealTextArc(cx, cy, r * 0.64, "top")} />
      <path id={`${uid}bottom`} d={sealTextArc(cx, cy, r * 0.765, "bottom")} />
    </defs>
    <path d={sealRosette(cx, cy, r)} fill={`url(#${uid}body)`} stroke={ink} strokeOpacity=".35" strokeWidth={r1(r * 0.012)} filter={`url(#${uid}shadow)`} />
    <circle cx={cx} cy={cy} r={r1(r * 0.87)} fill="none" stroke={ink} strokeOpacity=".72" strokeWidth={r1(r * 0.02)} />
    <circle cx={cx} cy={cy} r={r1(r * 0.835)} fill="none" stroke={light} strokeOpacity=".55" strokeWidth={r1(r * 0.01)} />
    <circle cx={cx} cy={cy} r={r1(r * 0.545)} fill={`url(#${uid}core)`} stroke={ink} strokeOpacity=".7" strokeWidth={r1(r * 0.018)} />
    <circle cx={cx} cy={cy} r={r1(r * 0.505)} fill="none" stroke={ink} strokeOpacity=".3" strokeWidth={r1(r * 0.008)} />
    <g fill={ink} fontWeight="700">
      <text fontSize={r1(r * 0.15)} textAnchor="middle"><textPath href={`#${uid}top`} startOffset="50%">اعتماد التسجيل</textPath></text>
      {seal.termName ? <text fontSize={r1(r * 0.118)} fontWeight="500" textAnchor="middle"><textPath href={`#${uid}bottom`} startOffset="50%">{seal.termName}</textPath></text> : null}
      <polygon points={star(cx - r * 0.705, cy, r * 0.05)} />
      <polygon points={star(cx + r * 0.705, cy, r * 0.05)} />
    </g>
    <g textAnchor="middle" fill={ink}>
      <polygon points={star(cx, cy - r * 0.3, r * 0.075)} fillOpacity=".85" />
      <text x={cx} y={r1(cy + (seal.date ? r * 0.08 : r * 0.12))} fontSize={r1(r * 0.27)} fontWeight="700">معتمد</text>
      {seal.date ? <text x={cx} y={r1(cy + r * 0.3)} fontSize={r1(r * 0.102)} fontWeight="500">{seal.date}</text> : null}
    </g>
  </g>;
}

/** الختم في SVG مستقلٍّ مربّع (للحظتين وللبطاقة). */
export function SealBadge({ seal, size, className }: { seal: Pick<ApprovalSeal, "termName" | "date">; size?: number; className?: string }) {
  return <svg className={className} viewBox="0 0 220 220" width={size} height={size} aria-hidden="true" focusable="false">
    <SealMark seal={seal} cx={110} cy={110} r={100} />
  </svg>;
}

/** يسحب الطبقة مع أيّ ضغطةٍ أو مفتاحٍ أو تمريرٍ أو طباعة؛ والفعل يصل إلى ما تحتها. */
function useSkip(onSkip: () => void, active: boolean) {
  const ref = useRef(onSkip);
  ref.current = onSkip;
  useEffect(() => {
    if (!active) return;
    const skip = () => ref.current();
    const opts = { capture: true, passive: true } as const;
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach(name => window.addEventListener(name, skip, opts));
    window.addEventListener("beforeprint", skip);
    return () => {
      events.forEach(name => window.removeEventListener(name, skip, opts));
      window.removeEventListener("beforeprint", skip);
    };
  }, [active]);
}

/** لحظة الرئيسية: يُضغط الختم على الشاشة، ثم سطر «اعتُمد جدول القسم · التاريخ»، ثم تنسحب. */
export default function ApprovalSealMoment({ seal, mode, onDone }: { seal: ApprovalSeal; mode: Exclude<SealMomentMode, "none">; onDone: () => void }) {
  const still = mode === "still";
  const [phase, setPhase] = useState<"on" | "out">("on");
  const done = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const withdraw = useRef<() => void>(() => undefined);
  withdraw.current = () => {
    if (done.current) return;
    done.current = true;
    if (still) { doneRef.current(); return; }
    setPhase("out");
    window.setTimeout(() => doneRef.current(), 480);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => withdraw.current(), still ? SEAL_STILL_MS : SEAL_MOMENT_MS - 480);
    return () => window.clearTimeout(timer);
  }, [still]);
  useSkip(() => withdraw.current(), true);
  const line = sealMomentLine(seal);
  /* في جسم الصفحة مباشرةً: حركة دخول اللوحة (تحويلٌ وشفافية) لا تحمل الطبقة معها. */
  return createPortal(<div className={`asm asm-${phase}${still ? " is-still" : ""}`} role="status" aria-live="polite" aria-label={line}>
    <div className="asm-veil" aria-hidden="true" />
    <div className="asm-stage" aria-hidden="true">
      <div className="asm-seal">
        <i className="asm-ripple" />
        <i className="asm-ripple asm-ripple-2" />
        <SealBadge seal={seal} className="asm-mark" />
      </div>
      <p className="asm-line">{line}</p>
      {seal.termName ? <p className="asm-sub">{seal.termName} · بصمة القسم مختومةٌ لهذا الفصل</p> : null}
    </div>
    <div className="asm-foot" aria-hidden="true">اضغط أي مكان للمتابعة</div>
  </div>, document.body);
}

/* ── «نبض القاعات»: تُقرأ البصمة المختصرة للقسم، فإن كان الاعتماد جديداً على هذا الجهاز احتُفل به ── */

interface SealBrief { available?: boolean; seal?: ApprovalSeal | null; viewer?: number }

/**
 * لحظة النبض: تضيء نوافذ القاعات كلها معاً بغسلةٍ ذهبية (عبر `celebrate` من
 * المشهد)، ثم تهدأ. حارس من يراها هو حارس بصمة القسم نفسه في الخادم: من لا يرى
 * البصمة يأتيه 403 فلا احتفال. تعيد طبقة الغسلة والسطر، أو `null`.
 */
export function usePulseSealMoment({ collegeId, sectionId, termId, enabled, ready, still, celebrate }: {
  collegeId: number; sectionId: number; termId: number;
  /** نبض قسمٍ واحد لمن يرى بصمته (لا نسخة العميد ولا «كل الأقسام»). */
  enabled: boolean;
  /** المشهد جاهز (أو الرسم المسطّح قائم): لا لحظة قبل أن يُرى ما تضيئه. */
  ready: boolean;
  /** حركةٌ أقل أو رسمٌ مسطّح: الإطار الساكن. */
  still: boolean;
  celebrate: (ms: number) => void;
}): React.ReactElement | null {
  const [brief, setBrief] = useState<SealBrief | null>(null);
  const [moment, setMoment] = useState<{ seal: ApprovalSeal; mode: Exclude<SealMomentMode, "none"> } | null>(null);
  const [phase, setPhase] = useState<"on" | "out">("on");
  const asked = useRef("");
  const celebrateRef = useRef(celebrate);
  celebrateRef.current = celebrate;

  useEffect(() => {
    setBrief(null);
    if (!enabled || !collegeId || !sectionId || !termId) return;
    let alive = true;
    const query = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId), brief: "1" });
    fetch(`/api/dept-fingerprint?${query}`).then(r => (r.ok ? r.json() : null)).then(body => { if (alive) setBrief(body); }).catch(() => undefined);
    return () => { alive = false; };
  }, [enabled, collegeId, sectionId, termId]);

  useEffect(() => {
    if (!ready || !brief?.seal) return;
    const key = sealMomentKey({ viewer: Number(brief.viewer || 0), collegeId, sectionId, termId, acceptedAt: brief.seal.acceptedAt });
    if (asked.current === key) return;
    asked.current = key;
    let print = false;
    try { print = Boolean(window.matchMedia?.("print").matches); } catch { /* لا شيء */ }
    const mode = sealMomentMode(sealMomentDue({ allowed: Boolean(brief.viewer), seal: brief.seal, key, seen: readSealSeen(), print }), still);
    if (mode === "none") return;
    markSealSeen(key);
    setPhase("on");
    setMoment({ seal: brief.seal, mode });
    if (mode === "full") celebrateRef.current(SEAL_MOMENT_MS);
  }, [ready, brief, still, collegeId, sectionId, termId]);

  const finish = useRef<() => void>(() => undefined);
  finish.current = () => {
    if (!moment || phase === "out") return;
    celebrateRef.current(0);
    if (moment.mode === "still") { setMoment(null); return; }
    setPhase("out");
    window.setTimeout(() => setMoment(null), 420);
  };
  useEffect(() => {
    if (!moment) return;
    const timer = window.setTimeout(() => finish.current(), moment.mode === "still" ? SEAL_STILL_MS : SEAL_MOMENT_MS - 420);
    return () => window.clearTimeout(timer);
  }, [moment]);
  useSkip(() => finish.current(), Boolean(moment));

  if (!moment) return null;
  const line = sealMomentLine(moment.seal);
  return <div className={`hp-seal-moment is-${phase}${moment.mode === "still" ? " is-still" : ""}`} role="status" aria-live="polite" aria-label={line}>
    <i className="hp-seal-wash" aria-hidden="true" />
    <div className="hp-seal-chip" aria-hidden="true">
      <SealBadge seal={moment.seal} className="hp-seal-mark" />
      <span>{line}</span>
    </div>
  </div>;
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, DoorOpen, GraduationCap, KeyRound, MailCheck, RefreshCw, Rocket, Share2 } from "lucide-react";
import { MicroLoader } from "./ui";
import { FEATURE_REFRESH_MS, type FeaturePayload, type FeatureTileId } from "../utils/featureHealth";
import { TONE_WORD, tileView, type TileView } from "../utils/featureHealthView";

/* «سلامة الميزات الجديدة»: ست بطاقاتٍ صغيرة داخل «سلامة النظام». المنطقُ في src/utils/featureHealth.ts ونموذجُ العرض في
   src/utils/featureHealthView.ts؛ هنا الرسمُ فقط. أعدادٌ مجمَّعة، لا هويةَ ولا نصَّ رسالة. */

const ICONS: Record<FeatureTileId, React.ReactNode> = {
  push: <BellRing />, share: <Share2 />, recovery: <KeyRound />, rooms: <DoorOpen />, cards: <MailCheck />, masari: <GraduationCap />,
};

function Ring({ percent, label }: { percent: number; label: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg className="fh-ring" viewBox="0 0 64 64" role="img" aria-label={label}>
      <circle className="fh-ring-track" cx="32" cy="32" r={r} />
      <circle className="fh-ring-fill" cx="32" cy="32" r={r} strokeDasharray={`${(c * percent) / 100} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle">{label}</text>
    </svg>
  );
}

const Tile: React.FC<{ view: TileView; onRetry: () => void; busy: boolean }> = ({ view, onRetry, busy }) => {
  const inert = view.tone === "idle" || view.tone === "empty";
  return (
    <li className={`fh-tile t-${view.tone}`} data-feature-tile={view.id}>
      <div className="fh-head">
        <span className="fh-icon" aria-hidden="true">{ICONS[view.id]}</span>
        <h3>{view.title}</h3>
        {view.attention ? <span className="fh-flag" role="img" aria-label={TONE_WORD.warn}><AlertTriangle aria-hidden="true" /></span> : null}
      </div>
      {view.tone === "unknown" ? (
        <div className="fh-body">
          <p className="fh-note">{view.note}</p>
          <button type="button" className="fh-retry" onClick={onRetry} disabled={busy} data-guide-ignore="إعادة قراءة بطاقةٍ تعذّرت — قراءةٌ حيّة فقط">
            <RefreshCw aria-hidden="true" /><span>إعادة المحاولة</span>
          </button>
        </div>
      ) : (
        <div className="fh-body">
          {view.big !== null ? (
            <div className="fh-main">
              {view.ring !== null ? <Ring percent={view.ring} label={view.ringLabel} /> : null}
              <p className={`fh-big${view.big === "0" ? " is-zero" : ""}`} aria-label={`${view.title}: ${view.big} ${view.bigLabel}`}>
                <b>{view.big}</b><span>{view.bigLabel}</span>
              </p>
            </div>
          ) : null}
          {view.note ? <p className={`fh-note${inert ? " is-inert" : ""}`}>{view.note}</p> : null}
          {view.hint ? <p className="fh-hint">{view.hint}</p> : null}
          {view.attentionLine ? <p className="fh-attn">{view.attentionLine}</p> : null}
          {view.bars.length ? (
            <ul className="fh-bars">
              {view.bars.map(bar => (
                <li key={bar.key} className={bar.zero ? "is-zero" : undefined}>
                  <span className="fh-bar-label">{bar.label}</span>
                  <span className="fh-bar-track" aria-hidden="true"><i style={{ inlineSize: `${Math.min(100, (bar.value / bar.max) * 100)}%` }} /></span>
                  <b>{bar.value}</b>
                </li>
              ))}
            </ul>
          ) : null}
          {view.chips.length ? (
            <ul className="fh-chips">
              {view.chips.map(chip => <li key={chip.key} className={chip.zero ? "is-zero" : undefined}><b>{chip.value}</b><span>{chip.label}</span></li>)}
            </ul>
          ) : null}
        </div>
      )}
    </li>
  );
};

export default function FeatureHealth() {
  const [data, setData] = useState<FeaturePayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  /** «تحديث» (fresh) يتجاوز التخبئة؛ والإنعاش الدوري يقرأ من الذاكرة. */
  const load = useCallback(async (fresh = false) => {
    setBusy(true);
    try {
      const response = await fetch(fresh ? "/api/system-health/features?fresh=1" : "/api/system-health/features", { credentials: "include" });
      if (!response.ok) throw new Error(String(response.status));
      const next = await response.json() as FeaturePayload;
      if (alive.current) { setData(next); setFailed(false); }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, FEATURE_REFRESH_MS);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [load]);

  const stamp = data ? new Date(data.generatedAt).toLocaleTimeString("ar-KW-u-nu-latn", { hour: "2-digit", minute: "2-digit" }) : "";
  const status = busy ? "جاري التحديث…" : failed ? "تعذّر التحديث" : data ? `آخر تحديث ${stamp}` : "";

  return (
    <section className="fh-card" aria-labelledby="fh-title" data-feature-health>
      <div className="fh-top">
        <span className="fh-top-icon" aria-hidden="true"><Rocket /></span>
        <h2 id="fh-title">سلامة الميزات الجديدة</h2>
        <span className="fh-status" role="status" aria-live="polite">{status}</span>
        <button type="button" className="fh-refresh" onClick={() => void load(true)} disabled={busy} data-guide-ignore="تحديث: قراءةٌ حيّة لأعدادٍ مجمَّعة فقط — لا يكتب شيئاً">
          <RefreshCw className={busy ? "spin" : undefined} aria-hidden="true" /><span>تحديث</span>
        </button>
      </div>
      {!data && !failed ? <MicroLoader label="جاري القراءة…" /> : null}
      {failed && !data ? <p className="fh-note">تعذّرت القراءة. جرّب «تحديث».</p> : null}
      {data ? (
        <ul className="fh-grid" aria-label="بطاقات الميزات">
          {data.tiles.map(tile => <Tile key={tile.id} view={tileView(tile)} onRetry={() => void load(true)} busy={busy} />)}
        </ul>
      ) : null}
    </section>
  );
}

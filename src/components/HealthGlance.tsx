import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, HeartPulse, HelpCircle } from "lucide-react";
import { HEALTH_CARD_TITLES, attentionCards, type HealthPayload, type HealthState } from "../utils/systemHealth";

/**
 * ملخّصُ الصباح للحساب الرئيسي: سطرٌ واحد في أعلى الرئيسية. «كل شيء سليم» أو أسماءُ ما يحتاج انتباهاً (بالأسوأ أولاً)
 * وزرٌّ إلى «سلامة النظام». يقرأ المسارَ نفسه (GET /api/system-health) مرةً عند الفتح ثم كل دقيقة والتبويبُ ظاهر.
 * فشلُ القراءة لا يُظهر شيئاً ولا يمسّ الرئيسية: الملخّصُ زيادةٌ لا شرط.
 */
const REFRESH_MS = 60_000;
const Dot = ({ state }: { state: HealthState }) => state === "unknown" ? <HelpCircle aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />;

export default function HealthGlance({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/system-health", { credentials: "include" });
        if (!response.ok) return;
        const next = await response.json() as HealthPayload;
        if (alive) setData(next);
      } catch { /* لا شيء: الملخّص اختياري */ }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  if (!data) return null;
  const needs = attentionCards(data);
  const overall: HealthState = needs.length ? (needs.some(card => card.state === "bad") ? "bad" : "warn") : "ok";
  return (
    <section className={`hg-strip s-${overall}`} aria-label="ملخّص سلامة النظام">
      <span className="hg-icon" aria-hidden="true">{overall === "ok" ? <CheckCircle2 /> : <HeartPulse />}</span>
      {needs.length === 0 ? <strong>كل شيء سليم</strong> : (
        <ul className="hg-list">
          {needs.map(card => (
            <li key={card.id} className={`s-${card.state}`}><Dot state={card.state} />{HEALTH_CARD_TITLES[card.id]}</li>
          ))}
        </ul>
      )}
      <button type="button" className="hg-go" onClick={onOpen} data-guide-ignore="تنقّلٌ إلى «سلامة النظام» — لا يكتب شيئاً">
        سلامة النظام<ArrowLeft aria-hidden="true" />
      </button>
    </section>
  );
}

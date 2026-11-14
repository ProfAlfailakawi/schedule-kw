import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, DatabaseBackup, DoorOpen, HeartPulse, HelpCircle, KeyRound, Lock, RefreshCw } from "lucide-react";
import { MicroLoader, Notice } from "./ui";
import FeatureHealth from "./FeatureHealth";
import { AR, nounFor, type ArabicNoun } from "../utils/arabicCount";
import { HEALTH_CARD_TITLES, HEALTH_REFRESH_MS, type HealthCard, type HealthPayload, type HealthState } from "../utils/systemHealth";

/* «سلامة النظام»: لمحةٌ واحدة بخمس بطاقات. المنطقُ كلّه في src/utils/systemHealth.ts؛ هنا العرضُ فقط. */

const CARD_META: Record<HealthCard["id"], { title: string; icon: React.ReactNode }> = {
  backup: { title: HEALTH_CARD_TITLES.backup, icon: <DatabaseBackup /> },
  vault: { title: HEALTH_CARD_TITLES.vault, icon: <Lock /> },
  gate: { title: HEALTH_CARD_TITLES.gate, icon: <DoorOpen /> },
  identity: { title: HEALTH_CARD_TITLES.identity, icon: <KeyRound /> },
  term: { title: HEALTH_CARD_TITLES.term, icon: <CalendarClock /> },
};
const STATE_WORD: Record<HealthState, string> = { ok: "سليم", warn: "انتباه", bad: "خلل", unknown: "تعذّرت القراءة" };
const KIND_WORD: Record<string, string> = { import: "استيراد", reset: "تصفير", undo: "تراجع" };
const UNIT_NOUN: Partial<Record<HealthCard["unit"], ArabicNoun>> = { day: AR.day, second: AR.second, hour: AR.hour };

/** الرقمُ الكبير ثم كلمتُه القصيرة؛ لكل رمزِ حالةٍ كلمةٌ واحدة. */
function cardText(card: HealthCard): { big: string; unit?: string; small?: string } {
  const n = card.value ?? 0;
  const noun = UNIT_NOUN[card.unit];
  const counted = noun ? { big: n.toLocaleString("ar-KW-u-nu-latn"), unit: nounFor(n, noun) } : null;
  switch (`${card.id}:${card.code}`) {
    case "backup:none": return { big: "لا نسخة" };
    case "backup:today": return { big: "اليوم" };
    case "backup:age": return { ...counted!, small: "منذ آخر نسخة" };
    case "vault:idle": return { big: "هادئة" };
    case "vault:open": return { big: `${n}%`, small: `${KIND_WORD[String(card.detail).split(":")[0]] || ""} جارٍ` };
    case "vault:stale": return { big: `${n}%`, small: "قفلٌ عالق" };
    case "vault:failed": return { big: "متوقفة", small: KIND_WORD[String(card.detail).split(":")[0]] };
    case "vault:failedTouched": return { big: "فشلت", small: "بعد لمس البيانات" };
    case "gate:open": return { big: "الكتابة متاحة" };
    case "gate:closed": return { big: "الكتابة موقوفة", small: "صيانة نسخٍ احتياطي" };
    case "identity:unreadable": return { big: "تعذّرت القراءة" };
    case "identity:local": return { big: "محلية" };
    case "identity:checked": return { ...counted!, small: "منذ آخر فحص" };
    case "term:noTerm": return { big: "لا فصل جارٍ" };
    case "term:frozen": return { big: "مجمّد" };
    case "term:open": return { big: "مفتوح" };
    case "term:radarFresh": return { big: "مفتوح", small: `الرادار منذ ${counted!.big} ${counted!.unit}` };
    case "term:radarStale": return { big: "مفتوح", small: `الرادار قديم · ${counted!.big} ${counted!.unit}` };
    default: return { big: "تعذّرت القراءة" };
  }
}

const StateIcon = ({ state }: { state: HealthState }) =>
  state === "ok" ? <CheckCircle2 aria-hidden="true" /> : state === "unknown" ? <HelpCircle aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />;

export default function SystemHealth({ header, onOpenVault }: { header?: React.ReactNode; onOpenVault?: () => void }) {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  /** «تحقق الآن» (fresh) يتجاوز التخبئة؛ والإنعاش الدوري يقرأ من الذاكرة. */
  const load = useCallback(async (fresh = false) => {
    setBusy(true);
    try {
      const response = await fetch(fresh ? "/api/system-health?fresh=1" : "/api/system-health", { credentials: "include" });
      if (!response.ok) throw new Error(String(response.status));
      const next = await response.json() as HealthPayload;
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
    /* تنعش كل ثلاثين ثانية والتبويبُ ظاهر فقط. */
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, HEALTH_REFRESH_MS);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [load]);

  const overall: HealthState = data?.overall ?? "unknown";
  const bannerWord = !data ? "…" : overall === "ok" ? "كل شيء سليم" : "يحتاج انتباهاً";
  const stamp = data ? new Date(data.generatedAt).toLocaleTimeString("ar-KW-u-nu-latn", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="content-stack admin-page sh-page">
      {header}
      <div className={`sh-banner s-${overall}`} role="status" aria-live="polite">
        <HeartPulse aria-hidden="true" />
        <strong>{bannerWord}</strong>
        {data?.demo ? <em className="sh-demo">تجريبي · للقراءة</em> : null}
        <span className="sh-stamp">{stamp}</span>
        <button type="button" className="sh-refresh" onClick={() => void load(true)} disabled={busy} data-guide-ignore="تحقق الآن: قراءةٌ حيّة فقط — لا يكتب شيئاً">
          <RefreshCw className={busy ? "spin" : undefined} aria-hidden="true" /><span>تحقق الآن</span>
        </button>
      </div>
      {failed && !data ? <Notice>تعذّرت قراءة الحالة.</Notice> : null}
      {!data && !failed ? <MicroLoader label="جاري القراءة…" /> : null}
      {data ? (
        <ul className="sh-grid" aria-label="بطاقات السلامة">
          {data.cards.map(card => {
            const meta = CARD_META[card.id];
            const text = cardText(card);
            const needsVault = card.id === "backup" || card.id === "vault";
            return (
              <li key={card.id} className={`sh-card s-${card.state}`}>
                <div className="sh-card-head">
                  <span className="sh-icon" aria-hidden="true">{meta.icon}</span>
                  <h2>{meta.title}</h2>
                  <span className="sh-dot" role="img" aria-label={STATE_WORD[card.state]}><StateIcon state={card.state} /></span>
                </div>
                <p className="sh-value" aria-label={`${meta.title}: ${text.big} ${text.unit || ""} ${text.small || ""}`.replace(/\s+/g, " ").trim()}>
                  <b>{text.big}</b>{text.unit ? <span>{text.unit}</span> : null}
                </p>
                {text.small ? <p className="sh-small">{text.small}</p> : null}
                {needsVault && onOpenVault ? (
                  <button type="button" className="sh-go" onClick={onOpenVault} data-guide-ignore="تنقّلٌ إلى شاشة الخزنة — لا يكتب شيئاً">
                    {card.id === "backup" ? "نسخة الآن" : "افتح الخزنة"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <FeatureHealth />
    </div>
  );
}

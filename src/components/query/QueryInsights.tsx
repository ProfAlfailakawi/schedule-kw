import { AR, countOf } from "../../utils/arabicCount";
import { Clock3, DoorOpen, UserRound } from "lucide-react";
import type { ReportInsights } from "../../utils/reportInsights";

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

/** الجواب السريع: ثلاث بطاقات بأيقونة وقيمة؛ الشرح في التلميح لا على الشاشة. */
export default function QueryInsights({ insights, onHeaviest, onBusiest, onFree }: {
  insights: ReportInsights; onHeaviest: () => void; onBusiest: () => void; onFree: () => void;
}) {
  const { heaviest, busiest, freeNow } = insights;
  return (
    <div className="query-insights no-print" role="list" aria-label="الجواب السريع">
      {heaviest ? (
        <button type="button" role="listitem" data-guide-ignore="فتح مواعيد الأستاذ الأثقل؛ يغيّر العرض فقط" onClick={onHeaviest}
          title={`أثقل نصاباً: ${heaviest.name} — ${countOf(heaviest.hours, AR.hour)} معتمدة`}>
          <span className="qi-icon"><UserRound aria-hidden="true" /></span>
          <span className="qi-body"><b>{heaviest.name}</b><small>{n(heaviest.hours)} س.م · {n(heaviest.lectures)}</small></span>
        </button>
      ) : null}
      {busiest ? (
        <button type="button" role="listitem" data-guide-ignore="فتح مواعيد أزحم ساعة؛ يغيّر العرض فقط" onClick={onBusiest}
          title={`أزحم ساعة: ${busiest.dayLabel} ${busiest.label} — ${countOf(busiest.lectures, AR.lecture)}`}>
          <span className="qi-icon"><Clock3 aria-hidden="true" /></span>
          <span className="qi-body"><b>{busiest.dayLabel} <bdi dir="ltr">{busiest.label}</bdi></b><small>{n(busiest.lectures)} معاً</small></span>
        </button>
      ) : null}
      {freeNow ? (
        freeNow.state === "open" ? (
          <button type="button" role="listitem" data-guide-ignore="فتح إشغال القاعات اليوم؛ يغيّر العرض فقط" onClick={onFree}
            title={`فارغة الآن (${freeNow.dayLabel} ${freeNow.clock}): ${freeNow.free.slice(0, 8).join("، ")}`}>
            <span className="qi-icon"><DoorOpen aria-hidden="true" /></span>
            <span className="qi-body"><b>{n(freeNow.free.length)} / {n(freeNow.total)}</b><small>فارغة الآن</small></span>
          </button>
        ) : (
          <span role="listitem" className="query-insight-quiet" title={freeNow.reason}>
            <span className="qi-icon"><DoorOpen aria-hidden="true" /></span>
            <span className="qi-body"><b>—</b><small>خارج الدوام</small></span>
          </span>
        )
      ) : null}
    </div>
  );
}

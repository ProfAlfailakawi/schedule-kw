/**
 * ── سجلُّ الإرسال في «نشر ← الروابط» ────────────────────────────────────────
 * كلُّ إرسالٍ سطرٌ يُضاف فوق ما قبله ولا يمحوه: متى، ومن أرسل، وبأي صفة، ولمن، وإلى أي موعد.
 * للقراءة فقط؛ والمصدرُ الخادم (/api/instructor-requests/send-log) لا ذاكرةُ المتصفح،
 * فيبقى السجلُّ بعد إغلاق النافذة. نتيجةُ الإرسال الأخير تبقى مستقلةً فوقه.
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { LINK_MODES } from "../utils/linkMode";
import { AR, countOf } from "../utils/arabicCount";

interface SendLogEntry { at: string; mode: string; closesAt: string; audience: "all" | "picked" | "exception" | "ta"; count: number; names: string[]; by?: string; fresh?: number; renewed?: number; kept?: number; replaced?: boolean; skipped?: number }

const AUDIENCE: Record<SendLogEntry["audience"], string> = { all: "الكل", picked: "أساتذة محددون", exception: "استثناء", ta: "مرحلة التدريب" };
const when = (value: string) => new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuwait" }).format(new Date(value));
const NAMES_SHOWN = 3;
/* ما حدث لأصحاب البطاقات في هذا الإرسال، بكلماتٍ قليلة: جديد · جُدّد · بُدّل · تُخطّي. */
const outcomeOf = (row: SendLogEntry) => [
  row.fresh ? `${row.fresh.toLocaleString("ar-KW-u-nu-latn")} جديد` : "",
  row.renewed ? `${row.renewed.toLocaleString("ar-KW-u-nu-latn")} ${row.replaced ? "بُدّل رابطهم" : "جُدّد"}` : "",
  row.skipped ? `${row.skipped.toLocaleString("ar-KW-u-nu-latn")} تُخطّي` : "",
].filter(Boolean).join(" · ");

export default function PublishSendLog({ collegeId, sectionId, termId, active, stamp }: {
  collegeId: number; sectionId: number; termId: number; active: boolean; stamp: number;
}) {
  const [rows, setRows] = useState<SendLogEntry[]>([]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetch(`/api/instructor-requests/send-log?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" })
      .then(response => (response.ok ? response.json() : []))
      .then(data => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active, stamp, collegeId, sectionId, termId]);

  if (!rows.length) return null;
  return (
    <section className="publish-send-log" aria-label="سجل الإرسال">
      <header><History aria-hidden="true" /><strong>سجل الإرسال</strong><small>{countOf(rows.length, AR.message)}</small></header>
      <ol>
        {rows.map((row, index) => {
          const mode = LINK_MODES.find(item => item.id === row.mode);
          const shown = row.names.slice(0, NAMES_SHOWN).join("، ");
          const rest = row.names.length - NAMES_SHOWN;
          return (
            <li key={`${row.at}-${index}`}>
              <span className="publish-send-log-mode" title={mode?.label} aria-hidden="true">{mode?.icon}</span>
              <div>
                <b>{row.audience === "all" ? `الكل · ${countOf(row.count, AR.instructor)}` : `${AUDIENCE[row.audience]} · ${shown || countOf(row.count, AR.instructor)}${rest > 0 ? ` · و${countOf(rest, AR.instructor)}` : ""}`}</b>
                <small>{[outcomeOf(row), row.by ? `أرسله ${row.by}` : "", mode?.label, row.mode !== "view" && row.closesAt ? `حتى ${when(row.closesAt)}` : ""].filter(Boolean).join(" · ")}</small>
              </div>
              <time dateTime={row.at}>{when(row.at)}</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

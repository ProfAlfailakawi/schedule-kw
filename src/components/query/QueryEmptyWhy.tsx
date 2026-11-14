import { SearchX, X } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyWhyItem { key: string; label: string; icon: ReactNode; count: number; clear: () => void }

/**
 * ── لماذا لا نتائج؟ ──────────────────────────────────────────────────────────
 * بدل «خفّف المرشحات»: كل مرشّحٍ فعّال شريحةٌ بأيقونته، ومعها كم موعداً يظهر لو أُزيل وحده.
 * أنفعُها (أكثرها نتائج) تُبرز. ضغطةٌ واحدة تُزيله.
 */
export default function QueryEmptyWhy({ items, onResetAll }: { items: EmptyWhyItem[]; onResetAll: () => void }) {
  const best = items.reduce((top, item) => (item.count > top ? item.count : top), 0);
  return (
    <div className="query-why" role="status">
      <SearchX aria-hidden="true" className="query-why-mark" />
      <strong>لا نتائج</strong>
      {items.length ? (
        <div className="query-why-chips" aria-label="أزل مرشّحاً لترى النتائج">
          {items.map(item => (
            <button key={item.key} type="button" className={item.count && item.count === best ? "is-best" : ""} disabled={!item.count}
              data-guide-ignore="إزالة مرشّحٍ واحد من الاستعلام؛ يغيّر العرض فقط" onClick={item.clear}
              title={item.count ? `بإزالته: ${item.count}` : "وحده لا يكفي"}>
              {item.icon}<span>{item.label}</span>
              <b>{item.count ? `+${item.count.toLocaleString("ar-KW-u-nu-latn")}` : "·"}</b>
              <X aria-hidden="true" className="query-why-x" />
            </button>
          ))}
        </div>
      ) : null}
      {items.length > 1 ? (
        <button type="button" className="query-why-reset" data-guide-ignore="مسح كل المرشحات الإضافية؛ يغيّر العرض فقط" onClick={onResetAll}>مسح الكل</button>
      ) : null}
    </div>
  );
}

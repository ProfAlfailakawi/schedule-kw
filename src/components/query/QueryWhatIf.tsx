import { ArrowLeft, CalendarPlus, Check, Clock3, DoorOpen, Layers, UserRound, X } from "lucide-react";
import type { WhatIfMatch } from "../../utils/queryWhatIf";
import { DAY_LABELS } from "../../utils/naturalQuery";

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * ── «لو نقلتُ…»: بطاقةٌ بأيقوناتٍ وأرقام ────────────────────────────────────
 * لكل شعبةٍ سطرٌ واحد: أخضر ✓ لا تعارض، أو شرائح حمراء (🚪 القاعة، 👤 الأستاذ، 🏢 حجزٌ خارج قسمك، 🕒 خارج الدوام)
 * بعددها. قراءةٌ فقط؛ و«افتحه في الجدول» يأخذ صاحبَه إلى الورشة ليقرّر هناك.
 */
export interface WhatIfRow extends WhatIfMatch { name: string; code: string }

export default function QueryWhatIf({ title, rows, missing, onClose, onOpen }: {
  title: string; rows: WhatIfRow[]; missing: boolean; onClose: () => void; onOpen?: (row: WhatIfRow) => void;
}) {
  return (
    <section className="query-whatif no-print" aria-label="لو نُقل">
      <header>
        <span className="qw-mark"><Layers aria-hidden="true" /></span>
        <b dir="auto">{title}</b>
        <button type="button" className="qw-x" data-guide-ignore="إغلاق بطاقة «لو نقلت»" aria-label="إغلاق" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      {missing ? <p className="qw-none" role="status">لا مقرر بهذا الرقم في القسم</p> : (
        <ul>
          {rows.map(item => {
            const room = item.conflicts.filter(c => c.kind === "room"), teacher = item.conflicts.filter(c => c.kind === "instructor"), external = item.conflicts.filter(c => c.kind === "external");
            const clean = !item.conflicts.length && !item.outsideHours;
            return (
              <li key={item.row.id} data-clean={clean ? "1" : undefined}>
                <span className="qw-name"><strong>{item.name}</strong><small>ش{item.row.SCode || "—"}</small></span>
                <span className="qw-move" dir="ltr"><bdi>{clock(item.from)}</bdi><ArrowLeft aria-hidden="true" /><bdi>{item.newDays.map(day => DAY_LABELS[day].replace(/^ال/, "")).join("·")}</bdi></span>
                <span className="qw-chips">
                  {item.unchanged ? <i className="qw-same" title="هي الخانة نفسها"><Check aria-hidden="true" />=</i> : null}
                  {clean && !item.unchanged ? <i className="qw-ok" title="لا تعارض"><Check aria-hidden="true" /></i> : null}
                  {room.length ? <i className="qw-bad" title={`قاعةٌ محجوزة: ${room.map(c => c.withLabel).join("، ")}`}><DoorOpen aria-hidden="true" /><b>{n(room.length)}</b></i> : null}
                  {teacher.length ? <i className="qw-bad" title={`الأستاذ مشغول: ${teacher.map(c => c.withLabel).join("، ")}`}><UserRound aria-hidden="true" /><b>{n(teacher.length)}</b></i> : null}
                  {external.length ? <i className="qw-bad" title="القاعة محجوزة من خارج قسمك"><DoorOpen aria-hidden="true" /><b>↗</b></i> : null}
                  {item.outsideHours ? <i className="qw-warn" title="خارج ساعات الدوام"><Clock3 aria-hidden="true" /></i> : null}
                </span>
                {onOpen ? <button type="button" className="qw-open" data-guide-ignore="يفتح الجدول على هذه الشعبة؛ لا يكتب شيئاً" aria-label="افتحه في الجدول" title="افتحه في الجدول" onClick={() => onOpen(item)}><CalendarPlus aria-hidden="true" /></button> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import React, { useState } from "react";
import { CalendarPlus, CalendarX, ChevronDown, Pencil } from "lucide-react";
import { AR, countOf, nounFor, type ArabicNoun } from "../utils/arabicCount";
import { groupOverwriteChanges, type OverwriteKind } from "../utils/scopeOverwriteGroups";

const KIND_ICON = { added: CalendarPlus, modified: Pencil, removed: CalendarX } as const;
const KIND_LABEL: Record<OverwriteKind, string> = { added: "أُضيفت", modified: "عُدّلت", removed: "حُذفت" };
const SHOWN = 4;
/* الفعلُ يتبع المعدود: «تغيير واحد سيُمحى»، «تغييران سيُمحيان»، «40 تغييراً ستُمحى». */
const ERASED_VERB: ArabicNoun = { one: "سيُمحى", two: "سيُمحيان", few: "ستُمحى", many: "ستُمحى" };

/** Body of the «تغيّر الجدول بعد هذه النسخة» dialog: big count, one row per course. */
export function ScopeOverwriteBody({ changes, total = changes.length }: { changes: string[]; total?: number }) {
  const [all, setAll] = useState(false);
  const groups = groupOverwriteChanges(changes);
  const shown = all ? groups : groups.slice(0, SHOWN);
  const hidden = groups.length - shown.length;
  /* The count is the server's whole count, read from the live timetable; the
     list below may be cut at forty lines, the number never is. */
  const count = Math.max(changes.length, Number(total) || 0);
  return (
    <div className="so-body">
      <div className="so-count" aria-label={`${countOf(count, AR.change)} ${nounFor(count, ERASED_VERB)}`}>
        <b>{count}</b>
        <span><Pencil aria-hidden="true" /> {nounFor(count, AR.change)} {nounFor(count, ERASED_VERB)}</span>
      </div>
      <ul className="so-courses">
        {shown.map(group => (
          <li key={group.course} className="so-course">
            <strong>{group.course}</strong>
            <span className="so-chips">
              {group.sections.map(item => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <span className="so-chip" data-kind={item.kind} key={`${item.kind}:${item.section}`} title={KIND_LABEL[item.kind]}>
                    <Icon aria-hidden="true" />{item.section ? <bdi>{item.section}</bdi> : null}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="so-more" data-guide-ignore="توسيع قائمة المقررات داخل حوار التأكيد" onClick={() => setAll(true)}>
          +{hidden} أخرى <ChevronDown aria-hidden="true" />
        </button>
      ) : null}
      {count > changes.length ? <p className="so-cut">تظهر هنا أول {countOf(changes.length, AR.change)} من {count}.</p> : null}
      <p className="so-warn">ستُمحى إن تابعت · لم يُكتب شيء بعد</p>
    </div>
  );
}

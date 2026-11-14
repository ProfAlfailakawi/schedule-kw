import React, { useEffect, useRef } from "react";
import { Check, Droplet, Printer } from "lucide-react";
import type { ReportChoice } from "../utils/reportChoices";

interface Props<Id extends string> {
  /** اسم التقرير، يُقرأ لقارئ الشاشة عنواناً للقائمة. */
  title: string;
  choices: readonly ReportChoice<Id>[];
  active: ReportChoice<Id>;
  onChoose: (id: Id) => void;
  onPrint: (id: Id) => void;
  /** إن مُرِّر ظهر زرّ «موفّر الحبر» بجانب الطباعة؛ يضبط الوضع ثم يطبع. */
  onInk?: (on: boolean) => void;
}

/**
 * قائمة أوراق التقرير: سطرٌ لكل ورقة، واختيارٌ واحد، وطباعةٌ واحدة.
 * الأسهم تتنقّل (في RTL اليسار هو التالي)، وEnter يطبع، وEscape يغلق ويعيد
 * التركيز إلى زر التقرير.
 */
export default function ReportChoicePanel<Id extends string>({ title, choices, active, onChoose, onPrint, onInk }: Props<Id>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    /* على الجوال قد يقع زر التقرير أسفل الشاشة: اللوحة كلها تظهر فوق الشريط السفلي. */
    panelRef.current?.scrollIntoView({ block: "nearest" });
    return () => { if (opener?.isConnected) opener.focus(); };
  // التركيز يُنقل مرةً واحدة عند الفتح.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = (index: number) => {
    onChoose(choices[index].id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = choices.length - 1;
    if (event.key === "Enter") { event.preventDefault(); onPrint(choices[index].id); return; }
    let target: number;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = last;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") target = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowRight") target = index === 0 ? last : index - 1;
    else return;
    event.preventDefault();
    moveTo(target);
  };

  return (
    <div ref={panelRef} className="query-scope-menu report-choice">
      <div ref={listRef} className="report-choice-list" role="radiogroup" aria-label={`أوراق ${title}`}>
        {choices.map((choice, index) => {
          const selected = choice.id === active.id;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-guide-ignore="اختيار ورقة التقرير قبل طباعتها؛ لا يغيّر بيانات الجدول"
              onClick={() => onChoose(choice.id)}
              onKeyDown={event => onKeyDown(event, index)}
            >
              <span>{choice.label}</span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <p className="report-choice-note">{active.note}</p>
      <div className="report-choice-actions">
        <button
          type="button"
          className="report-choice-print"
          data-guide-ignore="طباعة الورقة المختارة؛ قراءة فقط ولا تغيّر بيانات الجدول"
          onClick={() => { onInk?.(false); onPrint(active.id); }}
        >
          <Printer aria-hidden="true" />طباعة
        </button>
        {onInk ? (
          <button
            type="button"
            className="report-choice-print report-choice-ink"
            data-guide-ignore="طباعة الورقة المختارة موفّرةً للحبر: الورقة نفسها بالرمادي؛ قراءة فقط"
            onClick={() => { onInk(true); onPrint(active.id); }}
          >
            <Droplet aria-hidden="true" />موفّر الحبر
          </button>
        ) : null}
      </div>
    </div>
  );
}

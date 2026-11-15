/**
 * شريطُ معلومات الموعد: يظهر عند الضغط على كتلةٍ هادئةٍ في أسبوع القاعة. فيه التفاصيلُ في سطرين،
 * ثم ثلاثةُ إجراءات: «التفاصيل» (لوحة السياق)، «انقل إلى قاعة…» (قائمةٌ تُري أي القاعات حرّةٌ في هذا الوقت
 * وتمرّ بمسار النقل نفسه: التنبؤ والتأكيد والتراجع)، «تراجع» إن كان لهذا الموعد نقلٌ حديث.
 */
import React, { useState } from "react";
import { ArrowLeftRight, FileText, Undo2, X } from "lucide-react";
import RoomsDropdown, { type RxOption } from "./RoomsDropdown";

export interface RxMoveOption { key: string; label: string; free: boolean; current: boolean; reason: string }

interface Props {
  title: string;
  code: string;
  who: string;
  when: string;
  place: string;
  canMove: boolean;
  undo: { label: string; run: () => void } | null;
  onDetails: () => void;
  onClose: () => void;
  moveOptions: () => RxMoveOption[];
  onMove: (key: string) => void;
}

export default function RoomsInfoBar({ title, code, who, when, place, canMove, undo, onDetails, onClose, moveOptions, onMove }: Props) {
  const [armed, setArmed] = useState(false);
  const options: RxOption[] = armed
    ? moveOptions().map(option => ({
        key: option.key,
        disabled: !option.free || option.current,
        aria: option.current ? `${option.label}، القاعة الحالية` : option.free ? `${option.label}، حرّة في هذا الوقت` : `${option.label}، غير متاحة: ${option.reason}`,
        node: (
          <>
            <i className={`rx-dot ${option.free && !option.current ? "is-free" : ""}`} aria-hidden="true" />
            <b dir="ltr">{option.label}</b>
            <small>{option.current ? "الحالية" : option.free ? "حرّة" : option.reason}</small>
          </>
        ),
      }))
    : [];
  options.sort((a, b) => Number(Boolean(a.disabled)) - Number(Boolean(b.disabled)));
  return (
    <div className="rx-info" role="region" aria-label="تفاصيل الموعد المحدد" aria-live="polite">
      <div className="rx-info-text">
        <b>{title} <em dir="ltr">{code}</em></b>
        <small>{who} · {when} · {place}</small>
      </div>
      <div className="rx-info-actions">
        <button type="button" className="rx-btn" data-guide-ignore="فتح لوحة تفاصيل الموعد من شريط المعلومات" onClick={onDetails}>
          <FileText aria-hidden="true" />التفاصيل
        </button>
        {canMove ? (
          <div onPointerDownCapture={() => setArmed(true)} onFocusCapture={() => setArmed(true)}>
            <RoomsDropdown
              label="انقل الموعد إلى قاعة أخرى"
              compact
              className="rx-move"
              button={<><ArrowLeftRight aria-hidden="true" /><span>انقل إلى قاعة…</span></>}
              options={options}
              selectedKey={null}
              onSelect={onMove}
              empty="لا قاعات أخرى في هذا المبنى."
            />
          </div>
        ) : null}
        {undo ? (
          <button type="button" className="rx-btn" data-guide-target="schedule.undo" onClick={undo.run} title={undo.label}>
            <Undo2 aria-hidden="true" />تراجع
          </button>
        ) : null}
        <button type="button" className="rx-x" aria-label="إغلاق شريط المعلومات" data-guide-ignore="إغلاق شريط معلومات الموعد" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

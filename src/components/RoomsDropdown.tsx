/**
 * قائمةٌ منسدلةٌ للمباني والقاعات: زرٌّ يحمل الاختيارَ الحالي، ولوحةٌ role=listbox فيها خياراتٌ role=option،
 * ومعها (اختيارياً) حقلُ بحثٍ داخل اللوحة. لوحةُ المفاتيح كاملة: الأسهم والبداية/النهاية وEnter وEsc،
 * وتعود البؤرةُ إلى الزرّ عند الإغلاق.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface RxOption { key: string; node: React.ReactNode; aria: string; disabled?: boolean }

interface Props {
  label: string;
  button: React.ReactNode;
  options: RxOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  guideReason: string;
  search?: { value: string; onChange: (value: string) => void; placeholder: string; label: string; chip?: React.ReactNode };
  empty?: string;
  className?: string;
  compact?: boolean;
}

export default function RoomsDropdown({ label, button, options, selectedKey, onSelect, guideReason, search, empty, className = "", compact }: Props) {
  const uid = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const enabled = useMemo(() => options.filter(option => !option.disabled), [options]);

  const close = (focus = true) => { setOpen(false); if (focus) requestAnimationFrame(() => trigger.current?.focus()); };

  useEffect(() => {
    if (!open) return;
    const first = Math.max(0, options.findIndex(option => option.key === selectedKey));
    setActive(first);
    requestAnimationFrame(() => (input.current || panel.current)?.focus({ preventScroll: true }));
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { if (open && active >= options.length) setActive(Math.max(0, options.length - 1)); }, [options.length, open, active]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(`#${uid}-o${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, uid]);

  const move = (step: number) => {
    if (!enabled.length) return;
    let next = active;
    for (let guard = 0; guard < options.length; guard++) {
      next = (next + step + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActive(Math.max(0, options.findIndex(option => !option.disabled))); }
    else if (event.key === "End") { event.preventDefault(); for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActive(i); break; } }
    else if (event.key === "Enter") {
      const target = options[active];
      if (target && !target.disabled) { event.preventDefault(); onSelect(target.key); close(); }
    } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div className={`rx-dd ${compact ? "is-compact" : ""} ${className}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="rx-dd-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        aria-label={label}
        data-guide-ignore={guideReason}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => { if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) { event.preventDefault(); setOpen(true); } }}
      >
        {button}
        <ChevronDown className="rx-dd-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="rx-dd-panel" id={`${uid}-panel`}>
          {search ? (
            <div className="rx-dd-search">
              <Search aria-hidden="true" />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={options[active] ? `${uid}-o${active}` : undefined}
                aria-label={search.label}
                placeholder={search.placeholder}
                value={search.value}
                autoComplete="off"
                spellCheck={false}
                data-guide-ignore="بحث داخل قائمة القاعات؛ يضيّق القائمة فقط ولا يغيّر بيانات الجدول"
                onChange={event => { search.onChange(event.target.value); setActive(0); }}
                onKeyDown={onKey}
              />
              {search.value ? (
                <button type="button" className="rx-dd-clear" aria-label="مسح البحث" data-guide-ignore="مسح نص البحث داخل القائمة" onClick={() => { search.onChange(""); input.current?.focus(); }}>
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
          {search?.chip ? <div className="rx-dd-need">{search.chip}</div> : null}
          <div
            ref={panel}
            id={`${uid}-list`}
            className="rx-dd-list"
            role="listbox"
            aria-label={label}
            tabIndex={search ? -1 : 0}
            aria-activedescendant={!search && options[active] ? `${uid}-o${active}` : undefined}
            onKeyDown={onKey}
          >
            {options.map((option, index) => (
              <div
                key={option.key}
                id={`${uid}-o${index}`}
                role="option"
                aria-selected={option.key === selectedKey}
                aria-disabled={option.disabled || undefined}
                aria-label={option.aria}
                className={`rx-opt ${index === active ? "is-active" : ""} ${option.key === selectedKey ? "is-selected" : ""}`}
                onPointerEnter={() => { if (!option.disabled) setActive(index); }}
                onClick={() => { if (option.disabled) return; onSelect(option.key); close(); }}
              >
                {option.node}
              </div>
            ))}
            {!options.length ? <p className="rx-dd-empty">{empty || "لا نتائج."}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

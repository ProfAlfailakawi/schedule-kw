import { Bell, BellRing, Bookmark, Check, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SavedReport } from "../../utils/reportShare";

/**
 * ── تقاريري والرابط: زرّان صغيران بدل صفٍّ كامل ─────────────────────────────
 * 🔖 يفتح قائمةً قصيرة: كل سطرٍ أيقونةٌ واسم (👥 للقسم، 🔔 إن كان يراقب تغيّر نتائجه، ونقطةٌ إن تغيّرت)،
 * وفي أسفلها حقلٌ واحدٌ للحفظ بمفتاحين: 👥 للقسم، 🔔 نبّهني. 🔗 ينسخ الرابط ويصير ✓ لحظة.
 */
export default function QuerySaved({ reports, changed, canShare, problem, onOpen, onDelete, onSave, onCopyLink }: {
  reports: SavedReport[]; changed: ReadonlySet<string>; canShare: boolean; problem: string;
  onOpen: (item: SavedReport) => void; onDelete: (id: string) => void;
  onSave: (name: string, shared: boolean, watch: boolean) => Promise<boolean>; onCopyLink: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [watch, setWatch] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOpen(false); return; }
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", close, true); };
  }, [open]);

  const anyChanged = changed.size > 0;
  return (
    <div className="query-saved" ref={box}>
      <button type="button" className="query-icon-btn" data-guide-ignore="فتح تقاريري المحفوظة؛ يغيّر العرض فقط" aria-expanded={open} aria-haspopup="dialog" aria-label="تقاريري" title="تقاريري" onClick={() => setOpen(value => !value)}>
        <Bookmark aria-hidden="true" />
        {reports.length ? <b className="tool-count">{reports.length}</b> : null}
        {anyChanged ? <i className="query-dot" aria-label="تغيّر ما تراقبه" /> : null}
      </button>
      <button type="button" className="query-icon-btn" data-guide-ignore="نسخ رابط الاستعلام الحالي؛ لا يمنح صلاحية" aria-label="انسخ الرابط" title="انسخ الرابط"
        onClick={async () => { if (await onCopyLink()) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } }}>
        {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      </button>
      {open ? (
        <div className="query-saved-pop" role="dialog" aria-modal="false" aria-label="تقاريري">
          {reports.length ? (
            <ul>
              {reports.map(item => (
                <li key={item.id}>
                  <button type="button" data-guide-ignore="فتح استعلام محفوظ يغيّر العرض والمرشحات فقط" onClick={() => { onOpen(item); setOpen(false); }}>
                    {item.shared ? <Users aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                    <span>{item.name}</span>
                    {item.watch ? (changed.has(item.id) ? <BellRing aria-label="تغيّر" className="is-changed" /> : <Bell aria-label="يراقب" />) : null}
                    {!item.mine && item.ownerName ? <small>{item.ownerName}</small> : null}
                  </button>
                  {item.mine ? <button type="button" className="query-saved-del" data-guide-ignore="حذف استعلام محفوظ" aria-label={`حذف «${item.name}»`} title="حذف" onClick={() => onDelete(item.id)}><Trash2 aria-hidden="true" /></button> : null}
                </li>
              ))}
            </ul>
          ) : <p className="query-saved-empty"><Bookmark aria-hidden="true" /></p>}
          <form onSubmit={async event => { event.preventDefault(); if (!name.trim()) return; if (await onSave(name, shared, watch)) { setName(""); setShared(false); setWatch(false); } }}>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="سمِّ هذا الاستعلام" aria-label="اسم الاستعلام" maxLength={60} />
            <button type="button" className={shared ? "is-on" : ""} aria-pressed={shared} disabled={!canShare} data-guide-ignore="مشاركة الاستعلام مع القسم" aria-label="شارك مع القسم" title={canShare ? "شارك مع القسم" : "اختر القسم أولاً"} onClick={() => setShared(value => !value)}><Users aria-hidden="true" /></button>
            <button type="button" className={watch ? "is-on" : ""} aria-pressed={watch} data-guide-ignore="مراقبة تغيّر نتائج الاستعلام" aria-label="نبّهني إن تغيّر" title="نبّهني إن تغيّر" onClick={() => setWatch(value => !value)}><Bell aria-hidden="true" /></button>
            <button type="submit" className="is-save" disabled={!name.trim()} data-guide-ignore="حفظ الاستعلام" aria-label="حفظ" title="حفظ"><Plus aria-hidden="true" /></button>
          </form>
          {problem ? <p className="query-saved-problem" role="alert"><X aria-hidden="true" />{problem}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

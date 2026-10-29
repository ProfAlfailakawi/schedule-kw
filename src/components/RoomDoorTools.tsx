import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, DoorOpen, ExternalLink, Printer, QrCode, X } from "lucide-react";
import { SecondaryButton, useDialogDismiss } from "./ui";
import { roomDoorStickerSheet, type DoorStickerRoom } from "../utils/roomDoorStickers";
import "./room-door.css";

/**
 * ── أدواتُ الأبواب في شاشة المباني والقاعات ─────────────────────────────────
 *
 * لكل مبنى: «🖨️ ملصقات الأبواب» — ورقةُ A4 فيها أربعةُ ملصقاتٍ برمز QR لكل قاعة —
 * و«🖥️ شاشة الممر» تُفتح على تلفاز الممر. ولكل قاعة زرُّ QR يعرض رمزها ويطبع
 * ملصقها وحده. الروابطُ من الخادم (رمزٌ مشتقٌّ لا يموت بنشرٍ ولا بتدوير سرّ)، والرمزُ
 * يُرسم في المتصفّح بالمولّد المحلّي كما في «مساري» (يُحمَّل عند الطلب) — لا خدمةَ
 * خارجية. كلُّها قراءةٌ وطباعة، فتعمل في البيئة التجريبية كما في الحقيقية.
 */
type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => { addData(s: string): void; make(): void; createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string };

export interface RoomDoorLinks {
  building: { id: string; code: string; number: string; name: string; site: string; board: string; screen: string };
  rooms: Array<{ id: string; code: string; floor: string; url: string; screen: string }>;
  demo?: boolean;
}

/** روابطُ المبنى المختار: تُجلب حين يتغيّر المبنى، ولا شيء لمبنىً غير فعّال. */
export function useRoomDoorLinks(buildingId?: string): RoomDoorLinks | null {
  const [links, setLinks] = useState<RoomDoorLinks | null>(null);
  useEffect(() => {
    setLinks(null);
    if (!buildingId) return;
    let alive = true;
    fetch(`/api/room-door/links?buildingId=${encodeURIComponent(buildingId)}`, { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (alive && data?.building) setLinks(data as RoomDoorLinks); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [buildingId]);
  return links;
}

const absolute = (path: string) => `${window.location.origin}${path}`;

async function qrSvg(url: string): Promise<string> {
  const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
  const code = factory(0, "M");
  code.addData(url);
  code.make();
  return code.createSvgTag({ scalable: true, margin: 2 });
}

/**
 * نافذةُ الطباعة تُفتح فوراً داخل الضغطة (فلا يحجبها المتصفّح)، ثم تُكتب فيها
 * الورقةُ حين تُرسم الرموز، وتُطبع بعد أن تُحمَّل الخطوط.
 */
async function printStickers(links: RoomDoorLinks, rooms: RoomDoorLinks["rooms"]): Promise<string | null> {
  const win = window.open("", "_blank");
  if (!win) return "سمح المتصفّح بالنوافذ المنبثقة لهذه الصفحة ثم أعد المحاولة.";
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصقات الأبواب</title></head><body style="font-family:Tahoma,sans-serif;display:grid;place-items:center;min-height:90vh;color:#5b6660">جارٍ تجهيز الملصقات…</body></html>`);
  try {
    const stickers: DoorStickerRoom[] = [];
    for (const room of rooms) {
      const url = absolute(room.url);
      stickers.push({ code: room.code, floor: room.floor, url, qrSvg: await qrSvg(url) });
    }
    const html = roomDoorStickerSheet({ building: links.building, rooms: stickers, origin: window.location.origin });
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    const ready = (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    Promise.resolve(ready).then(() => win.setTimeout(() => win.print(), 200), () => win.print());
    return null;
  } catch (error: any) {
    win.close();
    return error?.message || "تعذّر تجهيز الملصقات.";
  }
}

export function RoomDoorBuildingActions({ links }: { links: RoomDoorLinks | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!links || !links.rooms.length) return null;
  const print = async () => {
    setBusy(true); setError(null);
    const problem = await printStickers(links, links.rooms);
    if (problem) setError(problem);
    setBusy(false);
  };
  return (
    <div className="room-door-strip">
      <span className="room-door-strip-label"><DoorOpen aria-hidden="true" />أبواب المبنى<small>{`QR · ${links.building.number ? `مبنى ${links.building.number}` : links.building.code}`}</small></span>
      <span className="room-door-actions">
        <SecondaryButton type="button" onClick={() => void print()} disabled={busy} aria-busy={busy}
          data-guide-ignore="طباعة ملصقات الأبواب: ورقة قراءة وطباعة لا تكتب في السجل">
          🖨️ ملصقات الأبواب
        </SecondaryButton>
        <a className="btn btn-secondary room-door-screen-link" href={links.building.screen} target="_blank" rel="noopener" title="افتحها على تلفاز الممر">
          🖥️ شاشة الممر <ExternalLink aria-hidden="true" />
        </a>
        <a className="btn btn-ghost room-door-screen-link" href={links.building.board} target="_blank" rel="noopener">
          🏢 لوحة المبنى <ExternalLink aria-hidden="true" />
        </a>
      </span>
      {error ? <small className="room-door-error" role="alert">{error}</small> : null}
    </div>
  );
}

export function RoomDoorQr({ links, roomId }: { links: RoomDoorLinks | null; roomId: string }) {
  const room = links?.rooms.find(item => item.id === roomId);
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => setOpen(false);
  useDialogDismiss(open, close);
  if (!links || !room) return null;
  const url = absolute(room.url);
  const show = async () => {
    setOpen(true); setError(null); setCopied(false);
    try { setSvg(await qrSvg(url)); } catch (e: any) { setError(e?.message || "تعذّر توليد رمز QR"); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* نسخٌ يدوي من الحقل */ }
  };
  const print = async () => {
    const problem = await printStickers(links, [room]);
    if (problem) setError(problem);
  };
  return (
    <>
      <SecondaryButton type="button" className="room-door-qr-btn" onClick={() => void show()} aria-haspopup="dialog" aria-label={`رمز QR لباب القاعة ${room.code}`} title="رمز QR لباب القاعة"
        data-guide-ignore="رمز QR لباب قاعة واحدة: عرض وطباعة لا يكتبان في السجل">
        <QrCode aria-hidden="true" />
      </SecondaryButton>
      {open ? createPortal(
        <div className="student-qr-backdrop" onClick={close}>
          <div className="student-qr-sheet room-door-sheet" role="dialog" aria-modal="true" aria-label={`رمز QR لباب القاعة ${room.code}`} onClick={event => event.stopPropagation()}>
            <header>
              <strong>باب القاعة <bdi dir="ltr">{room.code}</bdi></strong>
              <button type="button" className="student-qr-close" onClick={close} aria-label="إغلاق" data-guide-ignore="إغلاق نافذة رمز باب القاعة"><X aria-hidden="true" /></button>
            </header>
            <div className="room-door-plate"><small>{links.building.number ? `مبنى ${links.building.number}` : links.building.code}{room.floor ? ` · ${room.floor}` : ""}</small><b dir="ltr">{room.code}</b></div>
            {error ? <p className="student-qr-error" role="alert">{error}</p> : null}
            {svg ? <div className="student-qr-code" role="img" aria-label={`رمز QR لصفحة القاعة ${room.code}`} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="student-qr-lede">يُولَّد الرمز…</p>}
            <p className="room-door-scan">📱 امسح لتعرف القاعة الآن</p>
            <input className="student-qr-url" readOnly value={url} dir="ltr" aria-label="رابط صفحة القاعة" onFocus={event => event.currentTarget.select()} />
            <div className="student-qr-actions">
              <SecondaryButton type="button" onClick={() => void print()} data-guide-ignore="طباعة ملصق باب قاعة واحدة"><Printer aria-hidden="true" /> طباعة الملصق</SecondaryButton>
              <a className="btn btn-secondary" href={room.url} target="_blank" rel="noopener"><ExternalLink aria-hidden="true" /> فتح الصفحة</a>
              <a className="btn btn-secondary" href={room.screen} target="_blank" rel="noopener">🖥️ شاشة القاعة</a>
              <SecondaryButton type="button" onClick={() => void copy()} data-guide-ignore="نسخ رابط صفحة باب القاعة"><Copy aria-hidden="true" /> {copied ? "نُسخ" : "نسخ الرابط"}</SecondaryButton>
            </div>
            {links.demo ? <p className="student-qr-lede">بيئة تجريبية: يعمل الرمز ما دامت جلسةُ التجربة هذه قائمة.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

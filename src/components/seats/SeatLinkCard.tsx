import React, { useEffect, useState } from "react";
import { Check, Copy, Download, KeyRound, MessageCircle, QrCode } from "lucide-react";
import { whatsappNumber } from "../../utils/seats";

/**
 * ── بطاقةُ رابطٍ شخصي: QR، ونسخ، وواتساب ─────────────────────────────────────
 *
 * تُعرض حين يُصدر رابطٌ لعضو فريق، وحين يُسلَّم كرسيٌّ (فتحمل اسمَ الدخول والكلمة الأولى
 * مرة واحدة). الرابطُ يُكتب في رسالة واتساب جاهزة إلى جوال صاحبه إن عُرف.
 */
export default function SeatLinkCard({ title, subtitle, url, mobile, message, credentials, onDone }: {
  title: string;
  subtitle?: string;
  url: string;
  mobile?: string;
  message: string;
  credentials?: { login: string; password: string };
  onDone?: () => void;
}) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<"link" | "message" | "">("");
  useEffect(() => {
    let cancelled = false;
    void import("../../utils/qrcodeGenerator").then(({ default: factory }: any) => {
      const code = factory(0, "M"); code.addData(url); code.make();
      const svg = String(code.createSvgTag({ cellSize: 6, margin: 2 }));
      if (!cancelled) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'))}`);
    }).catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [url]);
  const wa = whatsappNumber(mobile);
  const waHref = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  const copy = async (what: "link" | "message") => {
    try { await navigator.clipboard.writeText(what === "link" ? url : message); setCopied(what); window.setTimeout(() => setCopied(""), 2200); }
    catch { setCopied(""); }
  };
  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr; a.download = "SCHEDULE-link.svg"; a.click();
  };
  return (
    <section className="seat-link-card" aria-label={title}>
      <div className="seat-link-qr">
        {qr ? <img src={qr} alt={`رمز QR: ${title}`} /> : <QrCode aria-hidden="true" />}
      </div>
      <div className="seat-link-body">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
        {credentials ? (
          <dl className="seat-credentials">
            <div><dt>اسم الدخول</dt><dd dir="ltr">{credentials.login}</dd></div>
            <div><dt><KeyRound aria-hidden="true" /> الكلمة الأولى</dt><dd dir="ltr" className="seat-secret">{credentials.password}</dd></div>
            <p>تظهر هذه الكلمة الآن فقط، ويختار صاحبها كلمته الخاصة عند أول دخول.</p>
          </dl>
        ) : null}
        <code className="seat-link-url" dir="ltr">{url.replace(/^https?:\/\//, "")}</code>
        <div className="seat-link-actions">
          {wa ? (
            <a className="btn btn-primary" href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" /> أرسل في واتساب</a>
          ) : null}
          <button data-guide-ignore="نسخ رابط شخصي أو إرساله أو حفظ رمزه؛ لا يغيّر بيانات" type="button" className={`btn ${wa ? "btn-secondary" : "btn-primary"}`} onClick={() => void copy("message")}>
            {copied === "message" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied === "message" ? "نُسخت الرسالة" : "انسخ الرسالة"}
          </button>
          <button data-guide-ignore="نسخ رابط شخصي أو إرساله أو حفظ رمزه؛ لا يغيّر بيانات" type="button" className="btn btn-ghost" onClick={() => void copy("link")}>
            {copied === "link" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied === "link" ? "نُسخ" : "الرابط"}
          </button>
          <button data-guide-ignore="نسخ رابط شخصي أو إرساله أو حفظ رمزه؛ لا يغيّر بيانات" type="button" className="btn btn-ghost" onClick={downloadQr} disabled={!qr}><Download aria-hidden="true" /> QR</button>
        </div>
        {onDone ? <button data-guide-ignore="نسخ رابط شخصي أو إرساله أو حفظ رمزه؛ لا يغيّر بيانات" type="button" className="seat-link-done" onClick={onDone}>تم</button> : null}
      </div>
    </section>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, ImageDown, Link2, MessageCircle, QrCode } from "lucide-react";
import BrandMark from "./BrandMark";
import { copyText, dataUrlToBlob, loadQrFactory, qrMatrix, qrPngDataUrl, renderAccessCardPng, saveImage, type QrFactory, type SaveOutcome } from "../utils/accessCardImage";

/**
 * ── «بطاقة الدخول»: البطاقة الواحدة لكل من يُدعى ─────────────────────────────
 *
 * تُعرض في «المستخدمون» (دعوة باسم القسم) وفي «الكراسي» (عضو الفريق وشاغل الكرسي):
 * رأس SCHEDULE، والاسم وسطرٌ تحته (الصفة · الكرسي)، ورمز QR للرابط الشخصي، والموقع.
 * وأزرارها الأربعة تعمل على الجوال والكمبيوتر: نسخ الرسالة، ونسخ الرابط، وحفظ البطاقة
 * صورة، وحفظ الرمز صورة (utils/accessCardImage).
 *
 * الأنماط في account-invitation.css، يستوردها من يعرض البطاقة.
 */
export const ACCESS_CARD_GREETING = "أهلًا بكم، هنا تبدأ خطوتكم القادمة";
export const ACCESS_CARD_HINT = "اضغط مطولاً على QR Code لفتح الموقع";

export type AccessCardProps = {
  /** العنوان الكبير: القسم أو الشخص. */
  name: string;
  /** السطر تحته، مثل «عضو لجنة · قسم تكنولوجيا التعليم». */
  caption?: string;
  /** الرابط الشخصي: في الرمز، وفي الموقع المعروض، وفي «انسخ الرابط». */
  url: string;
  message: string;
  /** ما يُكتب ظاهراً تحت الرمز. */
  displayUrl?: string;
  /** لا مشاركة قبل اكتمال ما يلزم (كلمة المرور مثلاً). */
  ready?: boolean;
  whatsappHref?: string;
  /** اسم الملفات المحفوظة بلا امتداد. */
  fileStem?: string;
  /** بين البطاقة والأزرار: كلمة المرور، أو بيانات الدخول، أو ملاحظة. */
  children?: React.ReactNode;
};

type Busy = "" | "card" | "qr";

export default function AccessCard({
  name, caption = ACCESS_CARD_GREETING, url, message, displayUrl = "schedule-kw.com", ready = true, whatsappHref, fileStem = "SCHEDULE-access",
  children,
}: AccessCardProps) {
  const [factory, setFactory] = useState<QrFactory | null>(null);
  const [previewQr, setPreviewQr] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<Busy>("");
  const cardRef = useRef<HTMLDivElement>(null);
  /* صورة البطاقة تُجهَّز مسبقاً: سفاري الآيفون لا يفتح المشاركة إن سبقها انتظارٌ طويل بعد اللمسة. */
  const prepared = useRef<{ key: string; blob: Blob } | null>(null);
  const cardKey = `${name}\n${caption}\n${url}\n${displayUrl}`;
  const currentKey = useRef(cardKey);
  currentKey.current = cardKey;

  useEffect(() => {
    let alive = true;
    void loadQrFactory().then(next => { if (alive) setFactory(() => next); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!factory) return;
    try { setPreviewQr(qrPngDataUrl(qrMatrix(factory, url), 448)); } catch { setPreviewQr(""); }
  }, [factory, url]);
  useEffect(() => { setStatus(""); }, [url]);

  const renderCard = () => renderAccessCardPng({
    name, caption, displayUrl, hint: ACCESS_CARD_HINT, matrix: qrMatrix(factory!, url),
    mark: cardRef.current?.querySelector<SVGSVGElement>("header svg") || null,
  });
  useEffect(() => {
    if (!factory || !ready) return;
    const key = cardKey;
    const timer = window.setTimeout(() => {
      void renderCard().then(blob => { if (key === currentKey.current) prepared.current = { key, blob }; }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, ready, cardKey]);

  const done = (what: "card" | "qr", outcome: SaveOutcome) => {
    const tail = "أرسل معها الرسالة ليُفتح الرابط بلمسة.";
    if (outcome === "cancelled") setStatus("");
    else if (outcome === "shared") setStatus(what === "card" ? `البطاقة جاهزة: احفظها في الصور أو أرسلها من ورقة المشاركة. ${tail}` : "رمز QR جاهز: احفظه في الصور أو أرسله من ورقة المشاركة.");
    else setStatus(what === "card" ? `حُفظت البطاقة صورةً في التنزيلات. ${tail}` : "حُفظ رمز QR صورةً في التنزيلات.");
  };
  const failed = () => setStatus("تعذّر حفظ الصورة. اضغط مطولاً على رمز QR في البطاقة واحفظه، أو انسخ الرسالة.");

  const saveCard = () => {
    if (!factory) return;
    const blob = prepared.current?.key === cardKey ? prepared.current.blob : null;
    setStatus("");
    if (blob) {
      /* بلا انتظار قبل المشاركة: ما زالت اللمسة حيّة. */
      void saveImage(blob, `${fileStem}.png`, name).then(outcome => done("card", outcome)).catch(failed);
      return;
    }
    setBusy("card");
    void renderCard()
      .then(fresh => { prepared.current = { key: cardKey, blob: fresh }; return saveImage(fresh, `${fileStem}.png`, name); })
      .then(outcome => done("card", outcome))
      .catch(failed)
      .finally(() => setBusy(""));
  };
  const saveQr = () => {
    if (!factory) return;
    setStatus("");
    try {
      const blob = dataUrlToBlob(qrPngDataUrl(qrMatrix(factory, url)));
      void saveImage(blob, `${fileStem}-QR.png`, `QR · ${name}`).then(outcome => done("qr", outcome)).catch(failed);
    } catch { failed(); }
  };
  const copy = async (what: "message" | "link") => {
    const ok = await copyText(what === "message" ? message : url);
    setStatus(ok ? (what === "message" ? "نُسخت الرسالة، جاهزة للصق في واتساب." : "نُسخ الرابط.") : "تعذّر النسخ. حاول مرة أخرى من متصفح يدعم الحافظة.");
  };

  return (
    <div className="access-card">
      <div className="invitation-card" dir="rtl" ref={cardRef}>
        <header><BrandMark variant="tile" /><div><small>دعوة إلى مساحة عملكم</small><b>SCHEDULE</b><span>نظام القرار الأكاديمي</span></div></header>
        <div className="invitation-card-content"><h3>{name}</h3><p>{caption}</p>
          <footer>
            {previewQr ? <img className="invitation-card-qr" src={previewQr} alt="رمز QR لفتح رابط الدخول الخاص" /> : <span className="invitation-card-qr is-empty" aria-hidden="true"><QrCode /></span>}
            <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" title="فتح رابط الدخول الخاص">{displayUrl}</a>
            <small>{ACCESS_CARD_HINT}</small>
          </footer>
        </div>
      </div>
      {children}
      {whatsappHref && ready ? (
        <a className="access-card-whatsapp" href={whatsappHref} target="_blank" rel="noopener noreferrer" data-guide-ignore="أدوات مشاركة بطاقة الدخول (نسخ وحفظ صورة)؛ لا تغيّر بيانات ولا كلمة مرور"><MessageCircle aria-hidden="true" /> أرسل الرسالة في واتساب</a>
      ) : null}
      <div className={`invitation-actions access-card-actions${whatsappHref && ready ? " has-whatsapp" : ""}`}>
        <button type="button" data-guide-ignore="أدوات مشاركة بطاقة الدخول (نسخ وحفظ صورة)؛ لا تغيّر بيانات ولا كلمة مرور" data-action="copy-message" disabled={!ready} onClick={() => void copy("message")}><Copy aria-hidden="true" /> انسخ الرسالة</button>
        <button type="button" data-guide-ignore="أدوات مشاركة بطاقة الدخول (نسخ وحفظ صورة)؛ لا تغيّر بيانات ولا كلمة مرور" data-action="copy-link" disabled={!ready} onClick={() => void copy("link")}><Link2 aria-hidden="true" /> انسخ الرابط</button>
        <button type="button" data-guide-ignore="أدوات مشاركة بطاقة الدخول (نسخ وحفظ صورة)؛ لا تغيّر بيانات ولا كلمة مرور" data-action="save-card" disabled={!ready || !factory || busy === "card"} onClick={saveCard}><ImageDown aria-hidden="true" /> {busy === "card" ? "جارٍ تجهيز الصورة…" : "حفظ البطاقة كصورة"}</button>
        <button type="button" data-guide-ignore="أدوات مشاركة بطاقة الدخول (نسخ وحفظ صورة)؛ لا تغيّر بيانات ولا كلمة مرور" data-action="save-qr" disabled={!ready || !factory} onClick={saveQr}><QrCode aria-hidden="true" /> حفظ QR</button>
      </div>
      {status ? <p className="invitation-feedback" role="status"><Check aria-hidden="true" />{status}</p> : null}
    </div>
  );
}

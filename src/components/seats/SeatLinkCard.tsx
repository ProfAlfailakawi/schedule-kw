import React, { useState } from "react";
import { Info, KeyRound } from "lucide-react";
import AccessCard from "../AccessCard";
import { whatsappNumber } from "../../utils/seats";
import { holderCardModel } from "../../utils/seatAccessCard";

/**
 * ── «بطاقة الدخول» في الكراسي ────────────────────────────────────────────────
 *
 * البطاقةُ نفسها التي في «المستخدمون» (AccessCard): لعضو الفريق برابطه الشخصي، وللشاغل
 * حين يُسلَّم الكرسي أو يُنشأ (فتحمل اسمَ الدخول والكلمة الأولى مرة واحدة)، ولشاغلٍ قائم
 * من زر «البطاقة» (SeatHolderCard). والرسالةُ تُرسل في واتساب إلى جوال صاحبها إن عُرف.
 */

export default function SeatLinkCard({ title, subtitle, url, mobile, message, credentials, note, fileStem, onDone, children }: {
  title: string;
  subtitle?: string;
  url: string;
  mobile?: string;
  message: string;
  credentials?: { login: string; password: string };
  note?: string;
  fileStem?: string;
  onDone?: () => void;
  children?: React.ReactNode;
}) {
  const wa = whatsappNumber(mobile);
  return (
    <section className="seat-access" aria-label={`بطاقة الدخول: ${title}`}>
      <AccessCard name={title} caption={subtitle} url={url} message={message} fileStem={fileStem}
        whatsappHref={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : undefined}>
        {credentials ? (
          <dl className="seat-credentials">
            <div><dt>اسم الدخول</dt><dd dir="ltr">{credentials.login}</dd></div>
            <div><dt><KeyRound aria-hidden="true" /> الكلمة الأولى</dt><dd dir="ltr" className="seat-secret">{credentials.password}</dd></div>
            <p>تظهر هذه الكلمة الآن فقط، ويختار صاحبها كلمته الخاصة عند أول دخول.</p>
          </dl>
        ) : null}
        {children}
        {note ? <p className="seat-access-note"><Info aria-hidden="true" />{note}</p> : null}
      </AccessCard>
      {onDone ? <button data-guide-ignore="يغلق بطاقة الدخول؛ لا يغيّر بيانات" type="button" className="seat-link-done" onClick={onDone}>تم</button> : null}
    </section>
  );
}

/** بطاقة شاغلٍ قائم: لا كلمة من الخادم؛ وإن كان ينتظر اختيار كلمته يكتب المسؤول الأولى إن كانت معه. */
export function SeatHolderCard({ origin, seat, holder, onDone }: {
  origin: string;
  seat: { login: string; name: string; roleLabel: string; mustChangePassword: boolean };
  holder: { name: string; mobile?: string };
  onDone?: () => void;
}) {
  const [password, setPassword] = useState("");
  const model = holderCardModel({ origin, login: seat.login, seatName: seat.name, roleLabel: seat.roleLabel, holderName: holder.name, mustChangePassword: seat.mustChangePassword, password });
  return (
    <SeatLinkCard title={holder.name} subtitle={model.caption} url={model.url} mobile={holder.mobile} message={model.message} note={model.note} fileStem={model.fileStem} onDone={onDone}>
      {seat.mustChangePassword ? (
        <label className="invitation-password seat-access-password">
          <span><KeyRound aria-hidden="true" /> الكلمة الأولى (اختياري)</span>
          <input dir="ltr" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" maxLength={128} aria-label="الكلمة الأولى" />
          <small>البطاقة لا تغيّر كلمة المرور، ولا تُقرأ الكلمة من الخادم.</small>
        </label>
      ) : null}
    </SeatLinkCard>
  );
}

import React, { useEffect, useState } from "react";
import { KeyRound, Link, Send, X } from "lucide-react";
import AccessCard from "./AccessCard";
import "./account-invitation.css";
import { invitationHref } from "../utils/invitationLink";

type Props = { name: string; login: string; active: boolean; hasPassword?: boolean };
const SITE = "https://schedule-kw.com/";

export default function AccountInvitation({ name, login, active, hasPassword }: Props) {
  const [open, setOpen] = useState(false);
  /* لا كلمة افتراضية: يكتب المسؤول كلمة هذا الحساب (الأولى التي ظهرت عند إنشائه، أو التي عيّنها له). */
  const [temporaryPassword, setTemporaryPassword] = useState("");
  useEffect(() => {
    setOpen(false);
    setTemporaryPassword("");
  }, [login]);
  /* الكلمة في جزء # من الرابط، فلا تصل إلى الخادم؛ ولا رابط قصير بكلمةٍ موحّدة يُخمَّن. */
  const url = invitationHref(SITE, login, temporaryPassword);
  const displayUrl = "schedule-kw.com";
  const message = `أهلًا بـ${name}\n\nدعوتكم إلى *SCHEDULE*\nنظام القرار الأكاديمي\n\nاضغطوا رابط الدخول لتجهيز بيانات الحساب تلقائيًا:\n${url}\n\nاسم المستخدم: ${login}\n\nاحتفظوا بالرابط لدى المسؤول عن الحساب.`;
  const ready = active && hasPassword !== false && Boolean(temporaryPassword.trim());

  return <section className="account-invitation" aria-label="مشاركة بيانات الدخول">
    <button type="button" className="invitation-launch" data-guide-ignore="تجهيز بطاقة دخول للمستخدم المحدد دون تغيير حسابه" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="invitation-launch-icon"><Send aria-hidden="true" /></span><span><strong>بطاقة الدخول</strong><small>دعوة باسم القسم · صورة ورسالة جاهزة</small></span>{open ? <X aria-hidden="true" /> : <Link aria-hidden="true" />}
    </button>
    {open && <div className="invitation-body">
      <AccessCard name={name} url={url} displayUrl={displayUrl} message={message} ready={ready} fileStem="SCHEDULE-invitation">
        <label className="invitation-password"><span><KeyRound aria-hidden="true" /> كلمة المرور التي ستُرسل</span><input dir="ltr" value={temporaryPassword} onChange={e => setTemporaryPassword(e.target.value)} autoComplete="off" maxLength={128} /><small>اكتب كلمة هذا الحساب: الأولى التي ظهرت عند إنشائه، أو التي عيّنتها له من شاشة المستخدمين. إعداد البطاقة لا يغيّر كلمة المرور.</small></label>
        {!active || hasPassword === false ? <p className="invitation-feedback" role="status">فعّل الحساب واضبط كلمة مروره أولًا قبل تجهيز الدعوة.</p> : null}
      </AccessCard>
    </div>}
  </section>;
}

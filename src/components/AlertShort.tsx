/**
 * ── التنبيهُ مختصراً بأيقونة ─────────────────────────────────────────────────
 *
 * نصوصُ الفاحص واللائحة كما هي تُعرض في شاشة القسم بأيقونةٍ وكلماتٍ قليلة، والنصُّ الأصلي كاملاً تحت «التفاصيل».
 * عرضٌ فقط: لا يُغيّر حكماً ولا نصّاً نظامياً. وهي الجملُ نفسها التي تختصرها صفحةُ الأستاذ (requestVisual.ts).
 */
import React from "react";
import {
  AlertTriangle, CalendarDays, Clock3, DoorOpen, Layers, Lock, Scale, ShieldAlert, Sunrise, Sunset, UserX, Users,
} from "lucide-react";

type Icon = React.ComponentType<{ "aria-hidden"?: boolean | "true" }>;
const CATALOG: Array<[RegExp, Icon, string]> = [
  [/^انتهت مدّة استقبال/, Lock, "انتهت مدة الطلبات"],
  [/^اختر يوماً واحداً/, CalendarDays, "اختر يوماً"],
  [/^اكتب وقت البداية/, Clock3, "اكتب وقت البداية"],
  [/^تبدأ المحاضرة قبل بداية/, Sunrise, "قبل بداية الدوام"],
  [/^تتجاوز المحاضرة نهاية/, Sunset, "بعد نهاية الدوام"],
  [/^لا يُخلط بين أيام/, Layers, "خلط 50 و80 دقيقة غير معتمد"],
  [/لا يغطّيها/, CalendarDays, "الأيام لا تغطي ساعات المقرر"],
  [/^تتابع مرتفع على الأستاذ/, Layers, "محاضرات متتالية كثيرة"],
  [/^تكرار شعب المقرر في نفس الوقت/, Layers, "شعبة أخرى بالوقت نفسه"],
  [/^التدوير غير محقق/, Sunrise, "كلها في فترة واحدة"],
  [/^داخل وقت اجتماع القسم/, CalendarDays, "وقت اجتماع القسم"],
  [/^خارج المعتاد تاريخياً/, Clock3, "وقت غير معتاد"],
  [/^بيانات غير مكتملة/, AlertTriangle, "بيانات ناقصة"],
  [/^يتقاطع هذا الوقت مع مقرّرٍ يشترك فيه طلبت/, Users, "يتعارض مع مقرّر الطلبة"],
  [/طلبة|الطلبة المشتركين/, Users, "تعارض طلبة مشتركين"],
  [/^لا تتوفّر قاعةٌ في هذا الوقت/, DoorOpen, "لا قاعة في هذا الوقت"],
  [/^القاعة .+ مشغولة/, DoorOpen, "القاعة مشغولة"],
  [/^يتجاوز هذا نصاب/, Scale, "يتجاوز النصاب"],
  [/^لديك محاضرةٌ أخرى في هذا الوقت/, UserX, "تعارض مع محاضرة للأستاذ"],
  [/^الأستاذ .+ لديه محاضرة متداخلة/, UserX, "تعارض مع محاضرة للأستاذ"],
];

/** جملةٌ قصيرة بأيقونة، وشارةُ المادة أو بطاقةُ الموعد المتعارض إن وُجدت، والأصلُ تحت «التفاصيل». */
export default function AlertShort({ text, detail, fallbackIcon = AlertTriangle }: { text: string; detail?: string; fallbackIcon?: Icon }) {
  const full = String(text || "");
  const hit = CATALOG.find(([pattern]) => pattern.test(full));
  const article = / — (م\.[^ ].*)$/.exec(full)?.[1];
  const regulation = !hit ? /^(.+?) — (.+)$/.exec(full) : null;
  const IconOf = hit ? hit[1] : regulation ? ShieldAlert : fallbackIcon;
  const short = hit ? hit[2] : regulation ? regulation[1].replace(/\s*\([^)]*\)\s*$/, "") : full;
  const clash = /^لديك محاضرةٌ أخرى في هذا الوقت: (.+?) — (\S*)\s*(\d\d?:\d\d)[–-](\d\d?:\d\d)/.exec(full);
  const load = /^يتجاوز هذا نصاب\S*: (\d+)\s*(.*?) مقابل (.+?) مسجّلة/.exec(full);
  const chip = article || regulation?.[2];
  const shortened = short !== full || Boolean(detail);
  const plainDetail = String(detail || "").replace(/[\u2066-\u2069\u200e\u200f]/g, "");
  const detailClash = /^(.+?) — (\d\d?:\d\d)\s*[–-]\s*(\d\d?:\d\d)/.exec(plainDetail);
  const rhythm = /مدة محاضرات (\S+) في قسمك (\d+) دقيقة، ومدة هذا الموعد (\d+) دقيقة/.exec(plainDetail);
  return (
    <span className="alert-short">
      <b className="as-head"><IconOf aria-hidden="true" />{short}</b>
      {clash ? (
        <span className="as-card"><b>{clash[1]}</b><span className="as-row">{clash[2] ? <u>{clash[2]}</u> : null}<bdi dir="ltr">{clash[3]} – {clash[4]}</bdi></span></span>
      ) : null}
      {load ? (
        <span className="as-stat"><b>{load[1]}</b><em>{load[2]}</em><i aria-hidden="true">/</i><small>{load[3]}<br />النصاب</small></span>
      ) : null}
      {chip && !clash && !load ? <span className="as-chip"><ShieldAlert aria-hidden="true" />{chip}</span> : null}
      {detailClash ? (
        <span className="as-card"><b>{detailClash[1]}</b><span className="as-row"><Clock3 aria-hidden="true" /><bdi dir="ltr">{detailClash[2]} – {detailClash[3]}</bdi></span></span>
      ) : rhythm ? (
        <span className="as-stat"><u className="as-day">{rhythm[1]}</u><small>المعتاد</small><b>{rhythm[2]}</b><i aria-hidden="true">←</i><small>هذا</small><b>{rhythm[3]}</b><small>د</small></span>
      ) : detail ? <small className="as-detail">{detail}</small> : null}
      {shortened ? <details className="as-why"><summary>التفاصيل</summary><p>{full}{detail ? <><br />{detail}</> : null}</p></details> : null}
    </span>
  );
}

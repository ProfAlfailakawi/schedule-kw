/**
 * ── معاينة المواضع بإعلانٍ تجريبي (للإدارة الرئيسية) ────────────────────────────
 *
 * يعرض الأدمنُ على شركةٍ مرتقبة أين سيظهر إعلانُها في كل مكان: يختار شركةً مثالاً (أو يكتب اسمها)
 * فيُوضَع إعلانٌ تجريبي في كل موقعٍ على مخطّط الصفحات الثلاث بمقاسه الحقيقي، وبجانبه قائمةُ المواقع
 * بمقاسها وجمهورها وما تبقّى فيها من سعةٍ اليوم، وزرُّ «ابدأ حملة هنا» يفتح معالج الحملة على الموقع.
 *
 * كلُّه رسمٌ في المتصفح (SampleAd): لا يُحفظ ولا يمرّ بالخادم ولا يراه إلا حسابُ الإدارة في هذه الشاشة.
 * السعةُ والتوفّر من بيانات المواقع الحقيقية نفسها (`data.slots`)، فما تقوله المعاينةُ هو ما سيقبله النظام.
 */
import React, { useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";
import { PlacementMap } from "./PlacementMap";
import { SAMPLE_BRANDS, SAMPLE_NAME_MAX, customBrand, type SampleBrand } from "./SampleAd";
import { AR, countOf } from "../../utils/arabicCount";
import { dateShort, fmt, type Payload, type Slot } from "./shared";

type Surface = "all" | "me" | "schedule" | "staff";
const SURFACES: Array<{ id: Surface; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "me", label: "«مساري» (الجوال)" },
  { id: "schedule", label: "الجدول العام" },
  { id: "staff", label: "لوحة الكادر" },
];
/** السطحُ الذي يقع فيه كلُّ موقع، ليُسلَّط الضوء على سطحه حين يُختار. */
const SURFACE_OF: Record<string, Surface> = { sponsor: "me", me: "me", break: "me", afterclass: "me", nearby: "me", schedule: "schedule", dashboard: "staff" };
/** ترتيبُ المواقع في القائمة كما يمرّ بها الطالب: الراعي أولاً ثم «مساري» ثم الفراغ ثم الجدول ثم الكادر. */
const ORDER = ["sponsor", "me", "break", "nearby", "afterclass", "schedule", "dashboard"];

/** ما تبقّى في الموقع اليوم، من بيانات المواقع الحقيقية. */
export function slotAvailability(slot: Slot): { free: number; cap: number; text: string; full: boolean } {
  const cap = slot.exclusive ? 1 : slot.capacity;
  const free = Math.max(0, cap - slot.live);
  if (free > 0) return { free, cap, full: false, text: slot.exclusive ? "متاح — حصريٌّ لحملةٍ واحدة" : `متاح ${fmt(free)} من ${fmt(cap)}` };
  return { free, cap, full: true, text: slot.nextFree ? `ممتلئ — أقرب خلوٍّ بعد ${dateShort(slot.nextFree)}` : "ممتلئ الآن" };
}

export default function PlacementPreview({ data, onStart }: { data: Payload; onStart: (slotId: string, company: string) => void }) {
  const [brandId, setBrandId] = useState<string>(SAMPLE_BRANDS[0].id);
  const [typed, setTyped] = useState("");
  const [surface, setSurface] = useState<Surface>("all");
  const [hot, setHot] = useState("");

  const custom = useMemo(() => customBrand(typed), [typed]);
  /* الاسمُ المكتوب يغلب الاختيارَ المسبق: كتب الأدمنُ اسمَ الشركة التي أمامه فيراها. */
  const brand: SampleBrand = custom || SAMPLE_BRANDS.find(item => item.id === brandId) || SAMPLE_BRANDS[0];
  const slots = useMemo(
    () => ORDER.map(id => data.slots.find(slot => slot.id === id)).filter((slot): slot is Slot => Boolean(slot)),
    [data.slots],
  );
  const numbers = useMemo(() => Object.fromEntries(slots.map((slot, index) => [slot.id, index + 1])), [slots]);
  const only = surface === "all" ? undefined : surface;
  const visible = only ? slots.filter(slot => SURFACE_OF[slot.id] === only || (slot.id === "sponsor" && only !== "staff")) : slots;
  const openCount = slots.filter(slot => !slotAvailability(slot).full).length;

  return (
    <div className="ad-preview">
      <div className="ad-prev-bar" role="group" aria-label="الشركة التجريبية">
        <div className="ad-prev-brands">
          {SAMPLE_BRANDS.map(item => (
            <button
              key={item.id} type="button" className={!custom && brand.id === item.id ? "on" : ""} aria-pressed={!custom && brand.id === item.id}
              data-guide-ignore="معاينةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد"
              onClick={() => { setBrandId(item.id); setTyped(""); }}
            >{item.name}</button>
          ))}
        </div>
        <label className="ad-prev-name">
          <span>أو اكتب اسم الشركة</span>
          <input
            type="text" value={typed} maxLength={SAMPLE_NAME_MAX} placeholder="مثال: شركة الأفق"
            data-guide-ignore="معاينةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد"
            onChange={event => setTyped(event.target.value)}
          />
        </label>
      </div>

      <div className="ad-prev-tabs" role="group" aria-label="الصفحة المعروضة">
        {SURFACES.map(item => (
          <button
            key={item.id} type="button" className={surface === item.id ? "on" : ""} aria-pressed={surface === item.id}
            data-guide-ignore="معاينةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد"
            onClick={() => setSurface(item.id)}
          >{item.label}</button>
        ))}
      </div>

      <p className="ad-prev-note" role="note">
        <Eye aria-hidden="true" size={15} />
        <span>معاينةٌ لك وحدك: إعلانُ «{brand.name}» التجريبي موضوعٌ في كل موقع بمقاسه الحقيقي. لا يُحفظ ولا يظهر لأحد، ويحمل وسم «تجريبي».</span>
      </p>

      <PlacementMap data={data} preview={{ sample: brand, hot, onHot: setHot, numbers, only }} />

      <div className="ad-sech">
        <h3>المواقع التي سيظهر فيها</h3>
        <p>المتاح لحملةٍ جديدة اليوم: {fmt(openCount)} من {countOf(slots.length, AR.site)}. مرّر على موقعٍ ليُضاء في المخطّط.</p>
      </div>
      <ol className="ad-prev-legend">
        {visible.map(slot => {
          const avail = slotAvailability(slot);
          return (
            <li
              key={slot.id} className={hot === slot.id ? "hot" : ""} data-slot={slot.id}
              onMouseEnter={() => setHot(slot.id)} onMouseLeave={() => setHot("")}
              onFocus={() => setHot(slot.id)} onBlur={() => setHot("")}
            >
              <span className="ad-prev-no" aria-hidden="true">{numbers[slot.id]}</span>
              <div className="ad-prev-info">
                <b>{slot.label}</b>
                <span>{slot.where}</span>
                <small>
                  <bdi dir="ltr">{slot.width}×{slot.height}</bdi> · {slot.audience === "staff" ? "الأساتذة والإداريون" : "الطلبة"}{slot.wholeUniversity ? " · كل الجامعة" : ""}
                </small>
              </div>
              <span className={`ad-prev-avail ${avail.full ? "full" : "free"}`}>{avail.text}</span>
              <button
                type="button" className="btn btn-secondary ad-prev-start" disabled={avail.full}
                data-guide-ignore="معاينةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد"
                title={avail.full ? "الموقع ممتلئ الآن" : `ابدأ حملةً في ${slot.label}`}
                onClick={() => onStart(slot.id, custom ? custom.name : "")}
              ><Plus aria-hidden="true" size={14} /> ابدأ حملة هنا</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

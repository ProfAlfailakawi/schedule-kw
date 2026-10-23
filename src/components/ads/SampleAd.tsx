/**
 * ── إعلانٌ تجريبي للمعاينة ────────────────────────────────────────────────────
 *
 * يُرسم في المتصفح وحده داخل شاشة الإعلانات (لحساب الإدارة الرئيسي) ليرى الأدمنُ والشريكُ أين سيظهر
 * إعلانُه في كل موقع وبمقاسه الحقيقي. لا يُحفظ في أي مكان، ولا يمرّ بالخادم، ولا يصل إلى طالبٍ ولا
 * أستاذ، وعلى وجهه وسمُ «تجريبي» دائماً حتى لا يُلتبس بإعلانٍ حقيقي. أسماءُ الشركات هنا نصٌّ فقط:
 * لا شعاراتَ ولا علاماتٍ تجارية، واللونُ من هوية المعاينة لا من هوية الشركة.
 */
import React from "react";

export interface SampleBrand {
  id: string;
  name: string;
  tagline: string;
  cta: string;
  /** درجةُ اللون (0–359)؛ `neutral` رماديٌّ فحمي بلا لون. */
  hue: number;
  neutral?: boolean;
}

export const SAMPLE_BRANDS: readonly SampleBrand[] = [
  { id: "generic", name: "مساحة إعلانية", tagline: "إعلانك هنا بمقاسه الحقيقي", cta: "اعرف أكثر", hue: 0, neutral: true },
  { id: "cafe", name: "كافيه الجامعة", tagline: "قهوتك بين المحاضرات", cta: "اطلب الآن", hue: 28 },
  { id: "bank", name: "بنك المستقبل", tagline: "حسابٌ مجاني لكل طالب", cta: "افتح حسابك", hue: 165 },
] as const;

export const SAMPLE_NAME_MAX = 30;

/** لونٌ ثابتٌ من اسم الشركة المكتوب: نفسُ الاسم يعطي نفسَ اللون في كل معاينة (كما في `Avatar`). */
export function customBrand(rawName: string): SampleBrand | null {
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, SAMPLE_NAME_MAX);
  if (!name) return null;
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return { id: "custom", name, tagline: "إعلانك هنا — مثالٌ توضيحي", cta: "اعرف أكثر", hue };
}

export function sampleBackground(brand: SampleBrand): string {
  return brand.neutral
    ? "linear-gradient(135deg,#202023,#4a4a52)"
    : `linear-gradient(135deg,hsl(${brand.hue} 55% 27%),hsl(${(brand.hue + 35) % 360} 60% 41%))`;
}

export function SampleAd({ brand, slot }: { brand: SampleBrand; slot: { id: string; label: string; width: number; height: number } }) {
  const sponsor = slot.id === "sponsor";
  return (
    <div
      className={`ad-sample${sponsor ? " is-sponsor" : ""}`}
      style={{ aspectRatio: `${slot.width}/${slot.height}`, background: sampleBackground(brand) }}
      role="img"
      aria-label={`إعلان تجريبي لشركة ${brand.name} في موقع ${slot.label}`}
    >
      <span className="ad-sample-tag">{sponsor ? "برعاية" : "إعلان"}</span>
      <span className="ad-sample-demo">تجريبي</span>
      <div className="ad-sample-body">
        {sponsor
          ? <b>{brand.name}</b>
          : <><span className="ad-sample-text"><b>{brand.name}</b><small>{brand.tagline}</small></span><em>{brand.cta}</em></>}
      </div>
    </div>
  );
}

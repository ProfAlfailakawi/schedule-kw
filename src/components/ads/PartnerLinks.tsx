/**
 * ── روابط ملف الشراكة: رابطٌ لكل شركة ────────────────────────────────────────────
 *
 * تنشئ الإدارةُ رابطاً باسم الشركة (ولها مدةُ صلاحيةٍ اختيارية)، وتراه هنا: كم مرةً فُتح ومتى آخر مرة. الإيقافُ لرابطٍ بعينه
 * لا يمسّ غيره. فتحُ الإدارة نفسها من هذه الشاشة (`?preview=1`) لا يُحسب.
 */
import React, { useState } from "react";
import { Ban, Copy, ExternalLink, Link2 } from "lucide-react";
import { fmt, type Payload, type PartnerLinkRow } from "./shared";

const when = (iso: string) => {
  if (!iso) return "لم يُفتح بعد";
  try { return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuwait" }).format(new Date(iso)); } catch { return iso; }
};
const STATE: Record<PartnerLinkRow["state"], { label: string; tone: string }> = {
  active: { label: "فاعل", tone: "live" }, expired: { label: "منتهٍ", tone: "off" }, revoked: { label: "موقوف", tone: "pause" },
};

export default function PartnerLinks({ data, busy, onCreate, onRevoke, onCopy }: {
  data: Payload; busy: string;
  onCreate: (company: string, days: number, category: string, seasons: string[]) => Promise<void>;
  onRevoke: (id: string) => void;
  onCopy: (url: string) => void;
}) {
  const [company, setCompany] = useState("");
  const [days, setDays] = useState("0");
  const [category, setCategory] = useState("");
  const [seasons, setSeasons] = useState<string[]>([]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (company.trim().length < 2) return;
    await onCreate(company.trim(), Number(days), category, seasons);
    setCompany(""); setCategory(""); setSeasons([]);
  };
  return (
    <div className="ad-plinks">
      <form className="ad-plink-new" onSubmit={e => void submit(e)}>
        <label><span>اسم الشركة</span><input value={company} maxLength={80} required minLength={2} onChange={e => setCompany(e.target.value)} /></label>
        <label><span>فئة الشركة <small>(اختياري)</small></span>
          <select value={category} onChange={e => setCategory(e.target.value)}><option value="">—</option>{data.categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label><span>صلاحية الرابط</span>
          <select value={days} onChange={e => setDays(e.target.value)}>
            <option value="0">بلا انتهاء</option><option value="7">٧ أيام</option><option value="14">١٤ يوماً</option><option value="30">٣٠ يوماً</option><option value="90">٩٠ يوماً</option>
          </select>
        </label>
        <div className="ad-plink-seasons" role="group" aria-label="مواسم الشركة"><span>مواسمها <small>(اختياري)</small></span>
          {data.seasons.map(se => <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={se.id} type="button" className={`ad-chip${seasons.includes(se.id) ? " on" : ""}`} aria-pressed={seasons.includes(se.id)} onClick={() => setSeasons(list => (list.includes(se.id) ? list.filter(x => x !== se.id) : [...list, se.id]))}>{se.label}</button>)}
        </div>
        <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="submit" className="btn btn-primary" disabled={busy === "plink"}><Link2 aria-hidden="true" size={16} /> إنشاء رابط</button>
      </form>
      {data.partnerLinks.length ? (
        <div className="ad-plink-list" role="table" aria-label="روابط الشركات">
          <div role="row" className="ad-plink-head"><span>الشركة</span><span>الفتحات</span><span>آخر فتح</span><span>الحالة</span><span /></div>
          {data.partnerLinks.map(l => (
            <div role="row" key={l.id} className={`ad-plink-row${l.state === "active" ? "" : " off"}`}>
              <span><b>{l.company}</b><small>{[l.category, ...l.seasons.map(id => data.seasons.find(s => s.id === id)?.label || id)].filter(Boolean).join(" · ")}</small><small>{l.expiresAt && l.state === "active" ? `ينتهي ${when(l.expiresAt)}` : `أُنشئ ${when(l.createdAt)}`}</small></span>
              <span><b>{fmt(l.opens)}</b><small>{l.firstOpenAt ? `أول فتح ${when(l.firstOpenAt)}` : ""}</small></span>
              <span>{when(l.lastOpenAt)}</span>
              <span><span className={`ad-pill ad-pill-${STATE[l.state].tone}`}><i aria-hidden="true" />{STATE[l.state].label}</span></span>
              <span className="ad-plink-acts">
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" disabled={l.state !== "active"} onClick={() => onCopy(l.url)}><Copy aria-hidden="true" size={15} /> نسخ</button>
                <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" disabled={l.state !== "active"} onClick={() => window.open(`${l.url}?preview=1`, "_blank", "noopener")}><ExternalLink aria-hidden="true" size={15} /> فتح</button>
                {l.state === "active" ? <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-secondary" disabled={busy === `revoke-${l.id}`} onClick={() => { if (window.confirm(`إيقاف رابط «${l.company}»؟ لن يعمل بعد الآن.`)) onRevoke(l.id); }}><Ban aria-hidden="true" size={15} /> إيقاف</button> : null}
              </span>
            </div>
          ))}
        </div>
      ) : <p className="ad-note">لا روابط بعد. أنشئ رابطاً باسم أول شركة.</p>}
    </div>
  );
}

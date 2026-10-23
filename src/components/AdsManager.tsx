/**
 * ── شاشة الإعلانات ───────────────────────────────────────────────────────────────
 *
 * رأسٌ بالأرقام، وخمسةُ تبويبات (الحملات · الطلبات · المواقع والمواسم · معاينة للشركات · ملف الشراكة). القائمة مضغوطة، وتفاصيل الحملة
 * وإجراءاتها في درجٍ جانبي، و«حملة جديدة» معالجٌ من أربع خطوات في درج. لا أسعار هنا؛ الشاشة للتتبع.
 * الشروط تُفرض في الخادم (مقاس، وزن، جودة، رابط، سعة، فئة منافس) وتُشرح هنا قبل أن تُرفض الحملة.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, Plus, Send, ShieldCheck, TrendingUp } from "lucide-react";
import { MicroLoader, Notice, PageTitle } from "./ui";
import CampaignList from "./ads/CampaignList";
import CampaignDrawer, { type DrawerActions } from "./ads/CampaignDrawer";
import CampaignWizard, { blankForm, formOf, type WizardForm } from "./ads/CampaignWizard";
import { PlacementMap, SeasonTimeline } from "./ads/PlacementMap";
import PlacementPreview from "./ads/PlacementPreview";
import AttentionList, { attentionItems } from "./ads/AttentionList";
import LeadsPanel from "./ads/LeadsPanel";
import PartnerLinks from "./ads/PartnerLinks";
import { api, fmt, pct1, type Payload } from "./ads/shared";

type Tab = "campaigns" | "leads" | "placements" | "preview" | "kit";

export default function AdsManager() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("campaigns");
  const [openId, setOpenId] = useState("");
  const [wizard, setWizard] = useState<{ form: WizardForm; step: number } | null>(null);
  const toastTimer = useRef(0);

  const load = useCallback(async () => {
    try { setData(await api<Payload>("/api/admin/ads")); setError(""); }
    catch (e: any) { setError(String(e.message || e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!msg) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setMsg(""), 6000);
    return () => window.clearTimeout(toastTimer.current);
  }, [msg]);

  const act = useCallback(async (key: string, run: () => Promise<unknown>, ok = "") => {
    setBusy(key); setMsg(""); setError("");
    try { await run(); if (ok) setMsg(ok); await load(); }
    catch (e: any) { setError([e.message, ...(e.problems || []).slice(1)].filter(Boolean).join(" · ")); }
    finally { setBusy(""); }
  }, [load]);

  const copy = useCallback(async (text: string) => {
    const full = new URL(text, location.origin).toString();
    try { await navigator.clipboard.writeText(full); setMsg("نُسخ الرابط."); }
    catch { setMsg("انسخ الرابط يدوياً: " + full); }
  }, []);

  /* الرفع: فحصُ الجودة قد يرفض الصورة بـ٤٢٢؛ تُعرض الأسباب وللإدارة أن ترفعها رغم ذلك بقرارٍ صريح يُسجَّل. */
  const upload = useCallback(async (campaignId: string, file: File) => {
    const send = (override: boolean) => api(`/api/admin/ads/campaigns/${campaignId}/creatives`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-Label": encodeURIComponent(file.name.replace(/\.[^.]+$/, "").slice(0, 40)), ...(override ? { "X-Quality-Override": "1" } : {}) },
      body: file,
    });
    await act(`up-${campaignId}`, async () => {
      try { await send(false); }
      catch (e: any) {
        if (e?.code === "quality" && window.confirm(`فحص الجودة وجد:\n\n• ${(e.problems || [e.message]).join("\n• ")}\n\nهل ترفع الصورة رغم ذلك؟`)) await send(true);
        else throw e;
      }
    }, "رُفعت الصورة.");
  }, [act]);

  const stats = useMemo(() => {
    if (!data) return null;
    const live = data.campaigns.filter(c => c.phase === "live");
    const week = data.campaigns.reduce((s, c) => s + (c.weekly?.thisWeek.impressions || 0), 0);
    const impressions = data.campaigns.reduce((s, c) => s + c.totals.impressions, 0);
    const clicks = data.campaigns.reduce((s, c) => s + c.totals.clicks, 0);
    const capacity = data.slots.reduce((s, x) => s + (x.exclusive ? 1 : x.capacity), 0);
    return { live: live.length, capacity, week, ctr: impressions ? (clicks / impressions) * 100 : 0, soon: data.campaigns.filter(c => c.endingSoon).length, drafts: data.campaigns.filter(c => c.phase === "draft").length };
  }, [data]);

  if (!data || !stats) return <div className="pt-page">{error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يجهّز الإعلانات…" />}</div>;

  /* تنقّلُ التبويبات بلوحة المفاتيح (WAI-ARIA): في الصفحة العربية السهمُ الأيسر للتالي والأيمن للسابق، وHome/End للطرفين. */
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ids: Tab[] = ["campaigns", "leads", "placements", "preview", "kit"];
    const at = ids.indexOf(tab);
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const step = e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowRight" ? (rtl ? -1 : 1) : 0;
    const next = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : step ? (at + step + ids.length) % ids.length : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(ids[next]);
    requestAnimationFrame(() => document.getElementById(`ad-tab-${ids[next]}`)?.focus());
  };
  const open = data.campaigns.find(c => c.id === openId);
  const actions: DrawerActions = {
    busy, act, api, copy, upload, setMsg,
    edit: (c, step) => { setOpenId(""); setWizard({ form: formOf(c), step }); },
  };
  const newCampaign = () => { setOpenId(""); setWizard({ form: blankForm(data), step: 1 }); };
  /* من المعاينة: الموقعُ المختار يُحجز في المعالج، واسمُ الشركة إن كتبه الأدمن. */
  const startAt = (slot: string, company: string) => { setOpenId(""); setWizard({ form: { ...blankForm(data), slot, company }, step: 1 }); };

  return (
    <div className="pt-page ad-page">
      <PageTitle
        eyebrow="للإدارة الرئيسية"
        subtitle="حملات الشركات ومواقعها وأرقامها، بشروطنا وحدنا."
        action={<button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" type="button" className="btn btn-primary" onClick={newCampaign}><Plus aria-hidden="true" size={16} /> حملة جديدة</button>}
      >الإعلانات</PageTitle>

      {error ? <Notice type="error" onDismiss={() => setError("")}>{error}</Notice> : null}
      {msg ? <Notice type="success" onDismiss={() => setMsg("")}>{msg}</Notice> : null}

      <section className="ad-hero" aria-label="لمحة">
        <div className="ad-hero-kpi"><span className="ic"><Megaphone aria-hidden="true" /></span><b>{fmt(stats.live)}<small> / {fmt(stats.capacity)}</small></b><span>الحملات العاملة الآن من سعة المواقع</span></div>
        <div className="ad-hero-kpi"><span className="ic"><TrendingUp aria-hidden="true" /></span><b>{fmt(stats.week)}</b><span>ظهور مرئي آخر ٧ أيام</span></div>
        <div className="ad-hero-kpi"><span className="ic"><ShieldCheck aria-hidden="true" /></span><b>{pct1(stats.ctr)}</b><span>نسبة النقر الإجمالية</span></div>
        <div className={`ad-hero-kpi${stats.soon ? " warn" : ""}`}><span className="ic"><Send aria-hidden="true" /></span><b>{fmt(stats.soon)}</b><span>{stats.soon ? "تنتهي خلال ٧ أيام: تواصل للتجديد" : "لا حملة تنتهي هذا الأسبوع"}</span></div>
      </section>

      <div className="ad-tabs" role="tablist" aria-label="أقسام الإعلانات" onKeyDown={onTabKey}>
        {([["campaigns", "الحملات", data.campaigns.length], ["leads", "الطلبات", data.leads.filter(l => l.status === "new").length], ["placements", "المواقع والمواسم", 0], ["preview", "معاينة للشركات", 0], ["kit", "ملف الشراكة", 0]] as Array<[Tab, string, number]>).map(([id, label, n]) => (
          <button data-guide-ignore="شاشةٌ لحساب الإدارة الرئيسي وحده؛ لا يحتاجها المرشد لأحد" key={id} type="button" role="tab" id={`ad-tab-${id}`} aria-selected={tab === id} aria-controls={`ad-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}{n ? <em>{fmt(n)}</em> : null}
          </button>
        ))}
      </div>

      {tab === "campaigns" ? (
        <section id="ad-panel-campaigns" role="tabpanel" aria-labelledby="ad-tab-campaigns">
          <AttentionList items={attentionItems(data)} onCampaign={setOpenId} onTab={setTab} />
          <CampaignList data={data} onOpen={c => setOpenId(c.id)} onNew={newCampaign} />
        </section>
      ) : null}

      {tab === "leads" ? (
        <section id="ad-panel-leads" role="tabpanel" aria-labelledby="ad-tab-leads" className="ad-sec">
          <div className="ad-sech"><h3>طلبات الحملات</h3><p>شركاتٌ ضغطت «حملة جديدة» في رابطها. تواصل معها ثم اضغط «تم التواصل».</p></div>
          <LeadsPanel data={data} busy={busy} onContacted={id => void act(`lead-${id}`, () => api(`/api/admin/ads/leads/${id}/contacted`, { method: "POST" }), "سُجّل التواصل.")} />
        </section>
      ) : null}

      {tab === "placements" ? (
        <section id="ad-panel-placements" role="tabpanel" aria-labelledby="ad-tab-placements" className="ad-sec">
          <div className="ad-sech"><h3>أين تظهر الإعلانات</h3><p>مخططاتٌ مبسّطة للصفحات الثلاث؛ اللون يدل على امتلاء كل موقع (أخضر متاح، كهرماني قارب الامتلاء، أحمر ممتلئ).</p></div>
          <PlacementMap data={data} />
          <div className="ad-sech"><h3>تقويم المواسم</h3><p>متى يكون الطلبة في موسم التسجيل أو بدء الفصل أو نهايته، لتختار كل شركةٍ موسم منتجها.</p></div>
          <SeasonTimeline data={data} />
        </section>
      ) : null}

      {tab === "preview" ? (
        <section id="ad-panel-preview" role="tabpanel" aria-labelledby="ad-tab-preview" className="ad-sec">
          <div className="ad-sech"><h3>معاينةٌ للشركات: أين سيظهر إعلانك؟</h3><p>اعرض على الشركة شكلَ إعلانها في كل مكان قبل الاتفاق. إعلانٌ تجريبي (مثل «آبل» أو أيُّ اسمٍ تكتبه) يوضع في كل موقع بمقاسه الحقيقي، ولا يراه غيرك.</p></div>
          <PlacementPreview data={data} onStart={startAt} />
        </section>
      ) : null}

      {tab === "kit" ? (
        <section id="ad-panel-kit" role="tabpanel" aria-labelledby="ad-tab-kit" className="ad-sec">
          <div className="ad-kit">
            <div className="ad-kit-main">
              <h3>ملف الشراكة للشركات</h3>
              <p>صفحةٌ واحدة ترسل رابطها للشركة: حجم الجمهور بأرقامٍ تقريبية، وما يبحث عنه الطلبة، وتقويم المواسم، والمواقع ومقاساتها وتوفرها، وشروطنا. تتحدث وحدها ولا تكشف أي اسم.</p>
              <ol className="ad-steps3">
                <li><b>١</b><span>أنشئ رابطاً باسم الشركة</span></li>
                <li><b>٢</b><span>أرسله لها، وتابع هنا كم مرةً فتحته</span></li>
                <li><b>٣</b><span>أضف حملتها وأرسل لها رابط تقريرها الحي</span></li>
              </ol>
              <PartnerLinks data={data} busy={busy}
                onCreate={(company, days) => act("plink", () => api("/api/admin/ads/partner-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, days }) }), `أُنشئ رابط «${company}».`)}
                onRevoke={id => void act(`revoke-${id}`, () => api(`/api/admin/ads/partner-links/${id}/revoke`, { method: "POST" }), "أُوقف الرابط.")}
                onCopy={url => void copy(url)} />
            </div>
            <aside className="ad-kit-rules">
              <h4>شروط الإعلان</h4>
              <ul>{data.rules.map(r => <li key={r}>{r}</li>)}</ul>
            </aside>
          </div>
        </section>
      ) : null}

      {open ? <CampaignDrawer campaign={open} data={data} onClose={() => setOpenId("")} actions={actions} /> : null}
      {wizard ? (
        <CampaignWizard
          data={data} initial={wizard.form} startStep={wizard.step} actions={actions}
          onClose={() => { setWizard(null); void load(); }}
          onSaved={async () => { await load(); }}
        />
      ) : null}
    </div>
  );
}

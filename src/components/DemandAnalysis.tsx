/**
 * ── «تحليل الطلب» في كشف التسجيل ────────────────────────────────────────────
 *
 * ما قاله الطلاب في الاستبيان، مقروءاً لمن يبني الجدول (الشاشة ٧): باب الاستبيان
 * (إصدارٌ ونسخٌ ورمزٌ وطباعةٌ وإيقاف)، والتوقّع من الفصل السابق، والجدد والعائدون،
 * والأرقام الأربعة، و«كم شعبة نفتح» بخاناتها، والنقلات والتبديلات بأثرها،
 * والمقررات الأكثر طلباً، والتقاطعات، وتسلسل المقررات.
 *
 * كانت بطاقةً في مركز التحليلات، وانتقلت إلى الشاشة التي تقرأ الطلبات نفسها.
 * والسجلُّ («رحلة الطلب» وجدول الحالات) لا يُكرَّر هنا: كشفُ التسجيل يرسمه أصلاً.
 *
 * ما يُفتح في النسخة التجريبية (شعبةٌ مقترحة، أو معاينةُ نقلة) يُسلَّم إلى مركز
 * التحليلات بتسليمٍ صريح (handOffToTwin) ثم يُفتح محرّرُ النسخة. وما يُكتب مباشرةً
 * («اعتمد في الجدول») يمرّ بـApplyProposal نفسه: معاينة الأثر، وسؤال اللائحة، والخادم حاكم.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Ban, BarChart3, Link2, Plus, Printer, QrCode, Sparkles, UsersRound, WandSparkles } from "lucide-react";
import CourseTags from "./CourseTags";
import VisitingBadge, { withVisitingSuffix } from "./VisitingBadge";
import { useVisitingLookup } from "../hooks/useVisitingLookup";
import ApplyProposal, { postScheduleProposal, postWhatIf } from "./ApplyProposal";
import IntelligenceScopeSwitch from "./IntelligenceScopeSwitch";
import { GhostButton, MicroLoader, Notice, Num, PrimaryButton, SecondaryButton, StatCard, visualConfirm } from "./ui";
import { AR, countOf, nounFor, oblique, studentNounsFor } from "../utils/arabicCount";
import { formatScheduleTimeRange, scheduleClockForDisplay } from "../utils/scheduleTime";
import { termIsArchive } from "../utils/termSequence";
import { departmentFamily } from "../utils/sectionLabel";
import { mergeDemandReadings, type IntelligenceScope, type ScopedReading } from "../utils/intelligenceReadingScope";
import { handOffToTwin } from "../utils/intelligenceLink";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
import { usePageAwake } from "../utils/pageAwake";
import type { AdTerm } from "../types";

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  terms: AdTerm[];
  collegeName: string;
  scopes: Array<{ AdCollegeId: number; AdSectionId: number; AdCollegeName?: string; AdSectionName?: string }>;
  powerAdmin?: boolean;
}

/* المدد نفسها التي تعرضها روابط الأستاذ والقسم. */
const SURVEY_DAY_CHOICES = [7, 30, 90, 180];
const surveyUrl = (id: string) => `${window.location.origin}/q/${id}`;

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, credentials: "include" });
  const text = await response.text();
  let data: any = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); }
  }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
}

export default function DemandAnalysis({ collegeId, sectionId, termId, terms, collegeName, scopes, powerAdmin = false }: Props) {
  const [open, setOpen] = useState(false);
  const [demand, setDemand] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<"college" | "department">("college");
  const [catalog, setCatalog] = useState<{ sections: any[]; colleges: any[] } | null>(null);
  const [surveyQr, setSurveyQr] = useState<{ id: string; svg: string } | null>(null);
  const [surveyDays, setSurveyDays] = useState(30);
  const [surveyCopied, setSurveyCopied] = useState<string | null>(null);
  const pageAwake = usePageAwake();
  const { isVisiting } = useVisitingLookup(termId);
  const serial = useRef(0);

  const studentWords = studentNounsFor(collegeName);
  const ownScope: IntelligenceScope = { collegeId, sectionId, collegeName };

  /* عائلة القسم عبر الكليات — قراءةٌ تحليلية فقط، وبنطاق الحساب نفسه الذي يحكم به الخادم. */
  useEffect(() => {
    if (!open || catalog) return;
    void Promise.all([fetchJson("/api/sections"), fetchJson("/api/colleges")]).then(([sections, colleges]) => setCatalog({
      sections: Array.isArray(sections) ? sections : (sections?.sections || []),
      colleges: Array.isArray(colleges) ? colleges : (colleges?.colleges || []),
    })).catch(() => setCatalog({ sections: [], colleges: [] }));
  }, [open, catalog]);
  const family = useMemo<IntelligenceScope[]>(() => {
    if (!catalog || !collegeId || !sectionId) return [ownScope];
    const nameOf = (id: number) => catalog.colleges.find((c: any) => Number(c.AdCollegeId) === id)?.AdCollegeName
      || scopes.find(s => Number(s.AdCollegeId) === id)?.AdCollegeName || "";
    return departmentFamily(catalog.sections, collegeId, sectionId)
      .filter(member => powerAdmin || scopes.some(scope => Number(scope.AdCollegeId) === member.collegeId
        && (Number(scope.AdSectionId) === member.sectionId || Number(scope.AdSectionId) === 0)))
      .map(member => ({ ...member, collegeName: member.collegeId === collegeId ? collegeName || nameOf(member.collegeId) : nameOf(member.collegeId) }));
  }, [catalog, collegeId, sectionId, collegeName, scopes, powerAdmin]);
  const hasMultipleDepartmentColleges = new Set(family.map(member => member.collegeId)).size > 1;
  const readingMode = hasMultipleDepartmentColleges ? analysisScope : "college";

  const readDemand = useCallback(async () => {
    const members = readingMode === "department" && family.length ? family : [ownScope];
    const settled = await Promise.allSettled(members.map(async scope => ({ scope, data: await fetchJson(`/api/schedules/demand?${new URLSearchParams({ collegeId: String(scope.collegeId), sectionId: String(scope.sectionId), termId: String(termId) })}`) })));
    const readings = settled.filter((item): item is PromiseFulfilledResult<ScopedReading> => item.status === "fulfilled").map(item => item.value);
    if (!readings.length) throw (settled[0] as PromiseRejectedResult)?.reason || new Error("تعذّرت قراءة الطلب");
    return mergeDemandReadings(readings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingMode, family, collegeId, sectionId, termId, collegeName]);

  const reload = useCallback(async () => {
    const mine = ++serial.current;
    try {
      const fresh = await readDemand();
      if (mine === serial.current) { setDemand(fresh); setLoadError(null); }
    } catch (e: any) {
      if (mine === serial.current) setLoadError(e?.message || "تعذّرت قراءة الطلب");
    }
  }, [readDemand]);

  useEffect(() => { setDemand(null); setLoadError(null); setSurveyQr(null); }, [collegeId, sectionId, termId, readingMode]);
  useEffect(() => {
    if (!open || !collegeId || !sectionId || !termId || !pageAwake) return;
    void reload();
    const timer = window.setInterval(() => { if (!document.hidden) void reload(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [open, collegeId, sectionId, termId, pageAwake, reload]);

  const answered = Number(demand?.totalRespondents || demand?.totalCases || demand?.cases?.length || demand?.respondents || 0);
  const scopeLabel = (item: any) => readingMode === "department" ? item?.readingScope?.collegeName || "" : "";
  const sourceScope = (item: any): IntelligenceScope => item?.readingScope || {
    collegeId: Number(item?.AdCollegeId || collegeId), sectionId: Number(item?.AdSectionId || sectionId),
    collegeName: family.find(member => member.collegeId === Number(item?.AdCollegeId || collegeId))?.collegeName || collegeName,
  };
  const visitingAt = (instructorId: unknown, item: any) => {
    const source = sourceScope(item);
    return isVisiting(instructorId, source.collegeId, source.sectionId);
  };

  /* ── النسخة التجريبية: تُفتح في مركز التحليلات بتسليمٍ صريح. ── */
  const openSectionDraft = (item: any, slot: any) => {
    const source = sourceScope(item);
    handOffToTwin({ kind: "opening", item, extra: slot, collegeId: source.collegeId, sectionId: source.sectionId, termId });
  };
  const openRepair = (fix: any) => {
    const source = sourceScope(fix);
    handOffToTwin({ kind: "repair", item: fix, collegeId: source.collegeId, sectionId: source.sectionId, termId });
  };

  /* ── باب الطلاب ── */
  const stopSurvey = async (id: string) => {
    const ok = await visualConfirm({
      title: "إيقاف رابط الاستبيان",
      message: "يتوقف استقبال الطلبات من هذا الرابط فوراً. الحالات المرسلة تبقى محفوظة، ويبقى أصحابها قادرين على متابعة «حالة طلبي» بالرابط نفسه حتى 30 يوماً بعد نهاية الفصل. يمكنك إصدار رابط جديد متى شئت.",
      confirmLabel: "أوقف الرابط",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await fetchJson(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessage("أُوقف استقبال الطلبات من هذا الرابط. متابعة «حالة طلبي» تبقى متاحة لمن أرسل حتى 30 يوماً بعد نهاية الفصل.");
      await reload();
    } catch (e: any) { setError(e?.message || "تعذّر إيقاف الرابط"); }
    finally { setBusy(false); }
  };

  const issueSurvey = async () => {
    setBusy(true); setError(null);
    try {
      /* لقسمٍ واحد: رابط البنين ورابط البنات رابطان على قسمين، ولا يُخمَّن الجنس من اسم. */
      await fetchJson("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, kind: "survey", days: surveyDays }),
      });
      setMessage(`صدر رابط الاستبيان لهذا القسم — صالح ${countOf(surveyDays, AR.day)}. انسخه أو اعرض رمز QR وعلّقه للطلاب.`);
      await reload();
    } catch (e: any) { setError(e?.message || "تعذّر إصدار الرابط"); }
    finally { setBusy(false); }
  };

  const showSurveyQr = async (id: string) => {
    if (surveyQr?.id === id) { setSurveyQr(null); return; }
    try {
      type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => {
        addData(s: string): void; make(): void;
        createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
      };
      const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
      const code = factory(0, "M");
      code.addData(surveyUrl(id));
      code.make();
      setSurveyQr({ id, svg: code.createSvgTag({ scalable: true, margin: 1 }) });
    } catch { setError("تعذّر توليد رمز QR."); }
  };

  const copySurvey = async (id: string) => {
    const url = surveyUrl(id);
    try { await navigator.clipboard.writeText(url); }
    catch {
      const field = document.createElement("input");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setSurveyCopied(id);
    window.setTimeout(() => setSurveyCopied(current => (current === id ? null : current)), 1800);
  };

  const archived = termIsArchive(terms.find(row => Number(row.AdTermId) === Number(termId)), terms);

  return (
    <details className="surface demand-analysis" style={{ padding: "10px 14px" }} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary><BarChart3 aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px" }} /> تحليل الطلب</summary>
      {!open ? null : <div className="demand-reading">
        {hasMultipleDepartmentColleges ? <IntelligenceScopeSwitch value={analysisScope} onChange={setAnalysisScope} /> : null}
        {message ? <Notice type="success" onDismiss={() => setMessage(null)}>{message}</Notice> : null}
        {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}
        {!demand ? (loadError
          ? <Notice type="error" action={<SecondaryButton type="button" onClick={() => void reload()} data-guide-ignore="يعيد قراءة تحليل الطلب — لا يكتب شيئاً">أعد المحاولة</SecondaryButton>}>{loadError}</Notice>
          : <MicroLoader label="يقرأ الطلب…" />) : <>
        <div className="surface-head">
          <div>
            <span className="surface-kicker">ما قاله الطلاب</span>
            <h2>كم شعبة نفتح، وأين نضعها</h2>
            <span className={`demand-cohort cohort-${demand.cohort || "mixed"}`}>
              <i aria-hidden="true" />
              {demand.cohortLabel || "طلبة القسم"}
              {demand.sectionName ? ` · ${demand.sectionName}` : ""}
            </span>
          </div>
          <UsersRound />
        </div>

        {/* ── باب الطلاب: الرابط ورمزه في الصفحة التي تقرأ إجاباتهم. ── */}
        {archived ? null : <div className="demand-door">
          {(demand.survey || []).length ? (
            (demand.survey || []).map((link: any) => (
              <article key={link.id} className="demand-door-card">
                <div className="demand-door-copy">
                  <span className="surface-kicker">رابط الاستبيان</span>
                  <strong>{link.label}</strong>{scopeLabel(link) ? <small>{scopeLabel(link)}</small> : null}
                  <small>
                    ينتهي {new Date(link.expiresAt).toLocaleDateString("ar-KW-u-nu-latn")} ·
                    فُتح <Num value={link.views} /> {nounFor(link.views, AR.visit)}
                  </small>
                  <code dir="ltr" className="demand-door-url">{surveyUrl(link.id)}</code>
                  <div className="demand-actions">
                    <SecondaryButton type="button" data-guide-ignore="نسخ رابط الاستبيان إلى الحافظة — لا يكتب شيئاً" onClick={() => void copySurvey(link.id)}>
                      <Link2 /> {surveyCopied === link.id ? "نُسخ" : "انسخ الرابط"}
                    </SecondaryButton>
                    <SecondaryButton type="button" data-guide-ignore="عرض رمز QR للرابط محلياً — لا يكتب شيئاً" onClick={() => void showSurveyQr(link.id)}>
                      <QrCode /> {surveyQr?.id === link.id ? "أخفِ الرمز" : "رمز QR"}
                    </SecondaryButton>
                    {surveyQr?.id === link.id ? (
                      <GhostButton type="button" data-guide-ignore="طباعة رمز QR للرابط العام — لا تغيّر الجدول" onClick={() => { if (!showPwaPrintHelp()) window.print(); }}>
                        <Printer /> اطبع الرمز
                      </GhostButton>
                    ) : null}
                    <GhostButton
                      type="button"
                      className="danger-action"
                      data-guide-ignore="إيقاف رابط عام له تأكيد صريح ولا يمسّ الجدول"
                      onClick={() => void stopSurvey(link.id)}
                      disabled={busy}
                      title="إيقاف الرابط فوراً"
                    >
                      <Ban /> أوقف الرابط
                    </GhostButton>
                  </div>
                </div>
                {surveyQr?.id === link.id ? (
                  <figure className="demand-qr" dangerouslySetInnerHTML={{ __html: surveyQr.svg }} aria-label="رمز الاستبيان" />
                ) : null}
              </article>
            ))
          ) : (
            <article className="demand-door-card empty">
              <div className="demand-door-copy">
                <span className="surface-kicker">باب الطلاب</span>
                <strong>لا يوجد رابط استبيان لهذا القسم بعد</strong>
                <small>
                  يبدأ الطالب باسمه ورقمه المدني وقسمه، ثم يختار نوع الحالة. تُحفظ الهوية
                  مشفّرة ولا تظهر إلا للمسؤول المخوّل.
                </small>
                <div className="share-days" role="group" aria-label="مدة صلاحية رابط الاستبيان">
                  {SURVEY_DAY_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      data-guide-ignore="اختيار مدة محلي لا يصدر الرابط بنفسه"
                      className={surveyDays === choice ? "active" : ""}
                      onClick={() => setSurveyDays(choice)}
                      aria-pressed={surveyDays === choice}
                    >
                      {choice}
                      <small>يوم</small>
                    </button>
                  ))}
                </div>
                <div className="demand-actions">
                  <PrimaryButton type="button" data-guide-ignore="إصدار رابط استبيان عام له صلاحية محددة ولا يعدّل الجدول" onClick={() => void issueSurvey()} disabled={busy}>
                    <QrCode /> أصدر رابط الاستبيان · {countOf(surveyDays, AR.day)}
                    {readingMode === "department" ? <small>{ownScope.collegeName}</small> : null}
                  </PrimaryButton>
                </div>
              </div>
            </article>
          )}
        </div>}

        {/* ── التوقّع: فصلٌ بلا إجابات يرث توقُّعاً من الفصل قبله، ويسقط عند أول إجابة. ── */}
        {!demand.respondents && demand.prediction?.courses?.length ? (
          <div className="demand-forecast">
            <p className="demand-headline forecast">
              <Sparkles aria-hidden="true" /> {demand.prediction.headline}
            </p>
            <div className="demand-bars">
              {demand.prediction.courses.slice(0, 8).map((course: any) => (
                <article key={`${course.readingScope?.collegeId || collegeId}:${course.courseId}`}>
                  <span className="demand-course-label" title={course.because}>
                    <b>{course.name}<CourseTags courseId={course.courseId} /></b>{scopeLabel(course) ? <small>{scopeLabel(course)}</small> : null}
                    <small dir="ltr">{course.code || course.courseId}</small>
                  </span>
                  <i><b style={{ width: `${Math.min(100, Math.max(6, Math.round((course.expected / Math.max(1, course.predictionFrom ?? demand.prediction.from)) * 100)))}%` }} /></i>
                  <strong dir="ltr">~{course.expected}/{course.predictionFrom ?? demand.prediction.from}</strong>
                </article>
              ))}
            </div>
            {demand.prediction.pairs?.length ? (
              <ul className="demand-stuck">
                {demand.prediction.pairs.slice(0, 5).map((pair: any, index: number) => (
                  <li key={index}>
                    يُتوقَّع أن يحتاج «{pair.nameA}» و«{pair.nameB}» معاً
                    نحو <b>{countOf(pair.expected, AR.student)}</b> — ضعهما في وقتين مختلفين من الآن.
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* من جديد ومن عائد. */}
        {demand.turnover?.total ? (
          <p className="demand-turnover">
            <UsersRound aria-hidden="true" /> {demand.turnover.headline}
          </p>
        ) : null}

        {/* الأرقام الأربعة. */}
        <div className="stat-tiles demand-figures">
          <div className="stat-tone" data-tone={answered ? "accent" : "quiet"}>
            <StatCard
              icon={<UsersRound aria-hidden="true" />}
              value={<Num value={answered} />}
              label={answered ? (readingMode === "department" ? "إجابات عبر الكليات" : `${nounFor(answered, studentWords.student)} ${nounFor(answered, studentWords.answered)}`) : "لم يُجب أحدٌ بعد"}
              detail={demand.cohortLabel || "طلبة القسم"}
            />
          </div>
          <div className="stat-tone" data-tone="info">
            <StatCard icon={<BarChart3 aria-hidden="true" />} value={<Num value={demand.courses?.length || 0} />} label="مقررات مطلوبة" detail="من إجاباتهم" />
          </div>
          <div className="stat-tone" data-tone={demand.pairs?.length ? "warning" : "quiet"}>
            <StatCard icon={<ArrowLeftRight aria-hidden="true" />} value={<Num value={demand.pairs?.length || 0} />} label="لا يجوز أن تتقاطع" detail={nounFor(demand.pairs?.length || 0, AR.pair)} />
          </div>
          <div className="stat-tone" data-tone={demand.repairs?.length ? "success" : "quiet"}>
            <StatCard icon={<WandSparkles aria-hidden="true" />} value={<Num value={demand.repairs?.length || 0} />} label="نقلات جاهزة" detail="بلا أثر جانبي" />
          </div>
        </div>

        {/* ── كم شعبة نفتح: الطلب مقابل السعة، ثم مكانٌ نظيف لكل شعبة. ── */}
        {demand.openings?.proposals?.length ? (
          <div className="demand-openings">
            <p className="demand-headline">{demand.openings.headline}</p>
            {demand.openings.proposals.map((item: any) => (
              <article key={`${item.readingScope?.collegeId || collegeId}:${item.courseId}`} className="opening-card">
                <header>
                  <div>
                    <b>{item.courseName}<CourseTags courseId={item.courseId} /></b>{scopeLabel(item) ? <small>{scopeLabel(item)}</small> : null}
                    <span>{item.courseCode}{item.predicted ? " · توقُّع" : ""}</span>
                  </div>
                  <strong className="opening-need">
                    +<Num value={item.needed} /> {nounFor(item.needed, AR.section)}
                  </strong>
                </header>

                <div className="opening-math">
                  <span><small>طلبوه</small><b><Num value={item.demand} /></b></span>
                  <em>÷</em>
                  <span><small>سعة الشعبة</small><b><Num value={item.capacity} /></b></span>
                  <em>−</em>
                  <span><small>المفتوح</small><b><Num value={item.openSections} /></b></span>
                  <em>=</em>
                  <span className="opening-gap">
                    <small>بلا مقعد</small><b><Num value={item.shortfall} /></b>
                  </span>
                </div>

                {item.simulationImpact ? <p className="demand-why">
                  بعد إضافة الشعب المقترحة وإعادة محاكاة {countOf(item.simulationImpact.respondents, AR.student)} من أصحاب الرغبات الحالية، يرتفع القادرون على بلوغ 12 وحدة بمقدار <b>{countOf(item.simulationImpact.delta12, AR.student)}</b>، وبلوغ 15 وحدة بمقدار <b>{countOf(item.simulationImpact.delta15, AR.student)}</b>. وتقل حالات تعارض المقررات في الخطط من <b>{countOf(item.simulationImpact.conflictsBefore, AR.course)}</b> إلى <b>{countOf(item.simulationImpact.conflictsAfter, AR.course)}</b>. المقاعد افتراضية؛ هذه معاينة بلا حفظ.
                </p> : item.predicted ? <p className="opening-note">هذا توقع من بيانات سابقة؛ لم يُخلط مع الرغبات الحالية ولم يُعرض كتحسن مؤكد.</p> : null}

                {item.placements.length ? (
                  <div className="opening-slots">
                    {item.placements.map((slot: any) => (
                      <div key={slot.index} className="opening-slot">
                        <span className="opening-slot-day">{slot.dayLabel}</span>
                        <b dir="ltr">{formatScheduleTimeRange(slot.start, slot.end)}</b>
                        <span className="opening-slot-room">
                          {slot.roomCode}{slot.roomHall ? `/${slot.roomHall}` : ""}
                        </span>
                        <span className={`opening-slot-who${slot.instructorId ? "" : " vacant"}`}>
                          {slot.instructorName || "بلا أستاذ"}
                          {slot.instructorId && visitingAt(slot.instructorId, item) ? <> <VisitingBadge compact /></> : null}
                        </span>
                        <SecondaryButton type="button" data-guide-ignore="يفتح الشعبة المقترحة في النسخة التجريبية دون حفظ" onClick={() => openSectionDraft(item, slot)}>
                          <Plus /> افتحها في النسخة التجريبية
                        </SecondaryButton>
                        {slot.instructorId ? (
                          <ApplyProposal
                            compact
                            lines={[`شعبة ${slot.sectionCode} لـ«${item.courseName}» · ${slot.dayLabel} ${formatScheduleTimeRange(slot.start, slot.end)} · ${slot.roomCode}${slot.roomHall ? `/${slot.roomHall}` : ""} · ${withVisitingSuffix(String(slot.instructorName || ""), visitingAt(slot.instructorId, item))}`]}
                            why={`تخدم ${countOf(item.shortfall, AR.student)} بلا مقعدٍ اليوم.`}
                            preview={() => { const source = sourceScope(item); return postWhatIf({ kind: "opening", collegeId: source.collegeId, sectionId: source.sectionId, termId, courseId: item.courseId, placement: slot }); }}
                            run={async () => {
                              const source = sourceScope(item);
                              const result = await postScheduleProposal({
                                kind: "opening", collegeId: source.collegeId, sectionId: source.sectionId, termId, courseId: item.courseId, placement: slot,
                                origin: { kind: "intelligence", refId: `course:${item.courseId}`, note: `فتح شعبة لـ«${item.courseName}» (طلبه ${item.demand})` },
                              });
                              return { summary: `فُتحت شعبة ${result.applied[0].row.SCode} لـ«${item.courseName}» في الجدول`, amendment: Boolean(result.amendment) };
                            }}
                            onApplied={() => { void reload(); }}
                          />
                        ) : <small className="ap-why-not">يلزم أستاذٌ: اختره من النسخة التجريبية ثم احفظ.</small>}
                        {slot.note ? <small className="opening-note">{slot.note}</small> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="opening-note">
                    لم أجد وقتاً يخلو من كل التعارضات — كل ساعة يستخدمها قسمك مشغولة
                    بأستاذٍ أو قاعة، أو تتقاطع مع مقرر يحتاجه هؤلاء الطلاب أنفسهم.
                  </p>
                )}
              </article>
            ))}
            {demand.openings.noCeiling?.length ? (
              <p className="opening-note">
                {demand.openings.noCeiling.length} من المقررات المطلوبة بلا «الحد الأعلى للطلبة» —
                سجّله في شاشة المقررات ليُحسب عدد الشعب.
              </p>
            ) : null}
          </div>
        ) : null}
        {!demand.openings?.proposals?.length && demand.openings?.simulationTested ? <p className="demand-headline">
          أُعيدت محاكاة {countOf(demand.openings.simulationTested, AR.section)} لفتح شعب على رغبات المشاركين؛ لم يثبت تحسن صافٍ في بلوغ 12 أو 15 وحدة دون الإضرار بطالب آخر، لذلك لا توجد توصية مؤكدة.
        </p> : null}

        {/* ── النقلات والتبديلات: كلٌّ منها جُرّب على الأسبوع الحقيقي. ── */}
        {demand.repairs?.length ? (
          <div className="demand-repairs">
            <p className="demand-headline">{demand.headline}</p>
            {demand.repairs.map((fix: any) => (
              <article key={`${fix.rowId}-${fix.to.day}-${fix.to.start}`} className="demand-repair">
                <header>
                  <b>{fix.swapWith ? "تبديل موعدي شعبتين" : <>{fix.courseName}<CourseTags courseId={fix.courseId} /></>}</b>
                  <span>شعبة {fix.sectionCode}{fix.room ? ` · ${fix.room}` : ""}</span>
                </header>
                <div className="demand-move" dir="rtl">
                  <span className="demand-from">
                    <small>{fix.courseName} · {fix.from.dayLabel}</small>
                    <b dir="ltr">{scheduleClockForDisplay(fix.from.start)}</b>
                  </span>
                  <ArrowLeftRight aria-hidden="true" />
                  <span className="demand-to">
                    <small>{fix.to.dayLabel}</small>
                    <b dir="ltr">{scheduleClockForDisplay(fix.to.start)}</b>
                  </span>
                </div>
                {fix.swapWith ? <div className="demand-move" dir="rtl">
                  <span className="demand-from"><small>{fix.swapWith.courseName} · {fix.swapWith.from.dayLabel}</small><b dir="ltr">{scheduleClockForDisplay(fix.swapWith.from.start)}</b></span>
                  <ArrowLeftRight aria-hidden="true" />
                  <span className="demand-to"><small>{fix.swapWith.to.dayLabel}</small><b dir="ltr">{scheduleClockForDisplay(fix.swapWith.to.start)}</b></span>
                </div> : null}
                <p className="demand-why">
                  بعد إعادة المحاكاة، يرتفع القادرون على بلوغ 12 وحدة من <b>{countOf((fix.simulationImpact?.before.canReach15 || 0) + (fix.simulationImpact?.before.canReach12To14 || 0), AR.student)}</b> إلى{" "}
                  <b>{countOf((fix.simulationImpact?.after.canReach15 || 0) + (fix.simulationImpact?.after.canReach12To14 || 0), AR.student)}</b> من أصل {countOf(fix.simulationImpact?.respondents || 0, AR.student)} مشاركاً؛ وبلوغ 15 وحدة يتحسن بمقدار{" "}
                  <b>{countOf(fix.simulationImpact?.delta15 || 0, AR.student)}</b>. وتقل تعارضات الخطط من <b>{countOf(fix.simulationImpact?.conflictsBefore || 0, AR.course)}</b> إلى <b>{countOf(fix.simulationImpact?.conflictsAfter || 0, AR.course)}</b> بتغيير {countOf(fix.simulationImpact?.scheduleChanges || 1, AR.schedule)}. المقاعد افتراضية، والنتيجة للرغبات المرسلة فقط.
                </p>
                <div className="demand-actions">
                  <SecondaryButton type="button" onClick={() => openRepair(fix)} data-guide-ignore="معاينة نقل الجدول داخل نسخة محلية لا تحفظ التعديل">
                    <WandSparkles /> معاينة التأثير
                  </SecondaryButton>
                  <ApplyProposal
                    compact
                    icon="check"
                    label={fix.swapWith ? "اعتمد التبديل في الجدول" : "اعتمد النقل في الجدول"}
                    lines={[
                      `${fix.courseName} · شعبة ${fix.sectionCode}: من ${fix.from.dayLabel} ${scheduleClockForDisplay(fix.from.start)} إلى ${fix.to.dayLabel} ${scheduleClockForDisplay(fix.to.start)}`,
                      ...(fix.swapWith ? [`${fix.swapWith.courseName} · شعبة ${fix.swapWith.sectionCode}: من ${fix.swapWith.from.dayLabel} ${scheduleClockForDisplay(fix.swapWith.from.start)} إلى ${fix.swapWith.to.dayLabel} ${scheduleClockForDisplay(fix.swapWith.to.start)}`] : []),
                    ]}
                    why={fix.simulationImpact ? `بعد إعادة المحاكاة: ${countOf(fix.simulationImpact.delta15 || 0, AR.student)} إضافي يبلغ 15 وحدة، وتعارضات الخطط من ${fix.simulationImpact.conflictsBefore || 0} إلى ${fix.simulationImpact.conflictsAfter || 0}.` : undefined}
                    preview={() => postWhatIf({ kind: fix.swapWith ? "swap" : "move", termId, moves: [{ rowId: fix.rowId, to: fix.to }, ...(fix.swapWith ? [{ rowId: fix.swapWith.rowId, to: fix.swapWith.to }] : [])] })}
                    run={async () => {
                      const source = sourceScope(fix);
                      const moves = [fix, ...(fix.swapWith ? [fix.swapWith] : [])].map((move: any, index: number) => ({
                        rowId: index === 0 ? fix.rowId : fix.swapWith.rowId, from: move.from, to: move.to,
                      }));
                      const result = await postScheduleProposal({
                        kind: fix.swapWith ? "swap" : "move", collegeId: source.collegeId, sectionId: source.sectionId, termId, moves,
                        origin: { kind: "intelligence", refId: `row:${fix.rowId}`, note: `${fix.swapWith ? "تبديل" : "نقل"} «${fix.courseName}» لتخفيف تعارض الطلبة` },
                      });
                      return { summary: `${fix.swapWith ? "بُدّل موعدا" : "نُقل موعد"} «${fix.courseName}» في الجدول`, amendment: Boolean(result.amendment) };
                    }}
                    onApplied={() => { void reload(); }}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : demand.repairSimulationReady && demand.repairCandidates ? (
          <p className="demand-headline">
            اختُبر <Num value={demand.repairCandidates} /> اقتراح نقل في محاكاة التسجيل، ولم تثبت نقلةٌ تحسّن بلوغ 12 أو 15 وحدة دون الإضرار بالنتيجة الحالية.
          </p>
        ) : demand.unsolved?.length ? (
          <p className="demand-headline">{demand.headline}</p>
        ) : demand.pairs?.length ? (
          <p className="demand-headline">
            لا يوجد تقاطع فعلي على الطلاب في هذا الفصل — الأزواج المشتركة كلها في أوقات مختلفة.
          </p>
        ) : null}

        {/* المقررات الأكثر طلباً. */}
        {demand.courses?.length ? (
          <section className="demand-chart" aria-label="المقررات الأكثر طلباً">
            <header>
              <strong><BarChart3 aria-hidden="true" /> المقررات الأكثر طلباً</strong>
              <small>{readingMode === "department" ? `${demand.respondents} إجابات عبر الكليات` : `من ${countOf(demand.respondents, oblique(studentWords.student))}`}</small>
            </header>
            <ol className="demand-bars">
              {demand.courses.slice(0, 8).map((course: any, index: number) => (
                <li key={`${course.readingScope?.collegeId || collegeId}:${course.courseId}`}>
                  <b className="demand-rank" aria-hidden="true">{index + 1}</b>
                  <span className="demand-course-label">
                    <b>{course.name}<CourseTags courseId={course.courseId} /></b>{scopeLabel(course) ? <small>{scopeLabel(course)}</small> : null}
                    <small dir="ltr">{course.code || course.courseId}</small>
                  </span>
                  <i role="img" aria-label={`${course.share}%`}><b style={{ width: `${Math.max(4, course.share)}%` }} /></i>
                  <strong dir="ltr">{course.students}/{demand.respondents} <small>{course.share}%</small></strong>
                </li>
              ))}
            </ol>
            {demand.courses.length > 8 ? <p className="demand-chart-more">و{countOf(demand.courses.length - 8, AR.course)} {nounFor(demand.courses.length - 8, AR.otherAdj)} في الكشف أدناه.</p> : null}
          </section>
        ) : null}

        {demand.unsolved?.length ? (
          <details className="insight-disclosure">
            <summary>تقاطعات بلا حلٍّ نظيف ({demand.unsolved.length})</summary>
            <ul className="demand-stuck">
              {demand.unsolved.map((item: any, index: number) => (
                <li key={index}>
                  «{item.a}» و«{item.b}» — {countOf(item.shared, AR.student)}.
                  كل نقلة مُتاحة تُنشئ تعارضاً آخر؛ الأمر يحتاج قراراً بشرياً.
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {demand.succession?.links?.length ? (
          <details className="insight-disclosure">
            <summary>تسلسل المقررات — ما الذي يأتي بعد ماذا ({demand.succession.links.length})</summary>
            <p className="insight-method">{demand.succession.headline}</p>
            <ul className="demand-sequence">
              {demand.succession.links.map((link: any) => (
                <li key={`${link.from}-${link.to}`}>
                  <b>{link.fromName}</b>
                  <ArrowLeftRight aria-hidden="true" />
                  <b>{link.toName}</b>
                  <em dir="ltr">{link.students}/{link.base}</em>
                </li>
              ))}
            </ul>
            <p className="insight-method">
              مقروءة من طلابٍ أجابوا في أكثر من فصل. لا تُعرَض علاقة أقل من ثلاثة
              طلاب — لا لأن الرقم صغير، بل لأنه عندها يصف مسار شخصٍ بعينه.
              ولا يُحفظ اسم ولا رقم مدني في أي مرحلة.
            </p>
          </details>
        ) : null}

        <details className="insight-disclosure">
          <summary>كيف وصلنا إلى هذه النقلات؟</summary>
          <p className="insight-method">فحصنا أسبوع الفصل كاملًا واخترنا النقلات التي تزيل التقاطع دون إنشاء تعارض جديد.</p>
        </details>
        </>}
      </div>}
    </details>
  );
}

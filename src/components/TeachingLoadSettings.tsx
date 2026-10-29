import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GraduationCap, GripVertical, Plus, Save, Search, Trash2, UserCog } from "lucide-react";
import { Notice, PageTitle, PrimaryButton, SecondaryButton, Surface, GhostButton } from "./ui";
import { ExceptionBadge, HoursInput, LoadExceptionEditor, LoadMeter } from "./LoadException";
import { evaluateTeachingLoad, emptyTeachingLoadConfig, hasLoadOverride, hoursLabel, loadTermContext, MAX_ACADEMIC_RANKS, MAX_OVERTIME_HOURS, teachingLoadProblem } from "../utils/teachingLoad";
import { compareArabic } from "../utils/arabicText";
import type { AcademicRank, TeachingLoadAssignment, TeachingLoadConfig } from "../types";

type Member = { id: number; name: string; retired: boolean; hours: number };
type TermOption = { id: number; name: string };

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn", { maximumFractionDigits: 2 });
const newRankId = () => `rank-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** نقلُ عنصرٍ من موضعه إلى موضعٍ آخر (للأسهم وللسحب). */
function moved<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * ── إدارة النصاب التدريسي ─ للمسؤول المخوّل ──────────────────────────────────
 *
 * ميزةٌ اختيارية: مفتاحٌ واحدٌ يفعّلها، وما دام مطفأً لا يظهر للمخطّط شيء. الدرجاتُ مرتّبةٌ كما يرتّبها المسؤول
 * (أسهمٌ، وسحبٌ على الحاسوب) بنصابها الأدنى والأعلى و«الإضافي» — ساعاتٌ صحيحة. ثم لكل عضوٍ درجتُه، واستثناءٌ
 * إن لزم (حدودٌ خاصّة بسببها وفصل انتهائها). والعبءُ المعروض من ساعات مقررات الفصل المختار نفسها التي يقرؤها
 * المخطّط، فما يراه هنا هو ما سيُنبَّه به هناك.
 */
export default function TeachingLoadSettings({ header, demoReadOnly = false }: { header?: React.ReactNode; demoReadOnly?: boolean }) {
  const [config, setConfig] = useState<TeachingLoadConfig>(emptyTeachingLoadConfig());
  const [saved, setSaved] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);
  /* تلميحُ التقريب تحت صفّ الدرجة التي كُتب فيها الكسر، لا في آخر البطاقة. */
  const [roundHint, setRoundHint] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [dragId, setDragId] = useState("");
  /* السحبُ يبدأ من المقبض وحده، فلا يتحوّل تحديدُ نصٍّ في خانةٍ إلى سحبٍ للصفّ. */
  const [armed, setArmed] = useState("");
  const hintTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  const load = async (requestedTerm = 0) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/teaching-load${requestedTerm ? `?termId=${requestedTerm}` : ""}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر تحميل إعدادات النصاب");
      setConfig(data.config);
      setSaved(JSON.stringify(data.config));
      setMembers((data.instructors || []).map((row: any) => ({ id: row.id, name: row.name, retired: Boolean(row.retired), hours: Number(row.hours || 0) })));
      setTerms(data.terms || []);
      setTermId(Number(data.term?.id || 0));
    } catch (error: any) {
      setNotice({ text: error.message || "تعذّر تحميل إعدادات النصاب", type: "error" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = JSON.stringify(config) !== saved;
  const problem = teachingLoadProblem(config);
  const termContext = useMemo(() => loadTermContext(terms.map(term => ({ AdTermId: term.id, AdTermName: term.name })), termId), [terms, termId]);
  const rounded = (id: string) => (to: number) => {
    setRoundHint({ id, text: `النصاب بالساعات الصحيحة فقط — قُرّبت إلى ${num(to)}.` });
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setRoundHint(null), 4200);
  };
  const patchRank = (id: string, patch: Partial<AcademicRank>) => setConfig(current => ({ ...current, ranks: current.ranks.map(rank => (rank.id === id ? { ...rank, ...patch } : rank)) }));
  const moveRank = (id: string, to: number) => setConfig(current => ({ ...current, ranks: moved(current.ranks, current.ranks.findIndex(rank => rank.id === id), to) }));
  const addRank = () => setConfig(current => (current.ranks.length >= MAX_ACADEMIC_RANKS ? current : { ...current, ranks: [...current.ranks, { id: newRankId(), name: "", minHours: 9, maxHours: 12, overtimeHours: 0 }] }));
  const removeRank = (id: string) => setConfig(current => ({
    ...current,
    ranks: current.ranks.filter(rank => rank.id !== id),
    // عضوٌ كانت درجتُه المحذوفة مصدرَ نصابه يعود غيرَ مضبوط، ويبقى استثناؤه إن كان.
    assignments: Object.fromEntries((Object.entries(current.assignments) as Array<[string, TeachingLoadAssignment]>).map(([key, value]) => [key, value.rankId === id ? { ...value, rankId: undefined } : value])),
  }));
  const setAssignment = (id: number, next: TeachingLoadAssignment | null) => setConfig(current => {
    const assignments = { ...current.assignments };
    const clean = next ? Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== "")) as TeachingLoadAssignment : {};
    if (Object.keys(clean).length) assignments[String(id)] = clean; else delete assignments[String(id)];
    return { ...current, assignments };
  });
  const patchAssignment = (id: number, patch: Partial<TeachingLoadAssignment>) => setAssignment(id, { ...(config.assignments[String(id)] || {}), ...patch });

  const save = async () => {
    if (demoReadOnly || busy || problem) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/teaching-load", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذّر حفظ إعدادات النصاب");
      setConfig(data.config);
      setSaved(JSON.stringify(data.config));
      setNotice({ text: "حُفظت إعدادات النصاب.", type: "success" });
    } catch (error: any) {
      setNotice({ text: error.message || "تعذّر حفظ إعدادات النصاب", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => members
    .filter(member => !query.trim() || member.name.includes(query.trim()))
    .filter(member => !onlyAssigned || config.assignments[String(member.id)])
    .filter(member => !member.retired || config.assignments[String(member.id)] || member.hours > 0)
    .sort((a, b) => compareArabic(a.name, b.name)), [members, query, onlyAssigned, config.assignments]);
  const statuses = useMemo(() => new Map(members.map(member => [member.id, evaluateTeachingLoad(config, member.id, member.hours, termContext)])), [members, config, termContext]);
  const overCount = [...statuses.values()].filter(status => status.state === "over").length;
  const exceptionCount = [...statuses.values()].filter(status => status.exception).length;

  return (
    <div className="content-stack admin-page teaching-load">
      {header}
      <PageTitle eyebrow="إدارة النظام · للمدير الرئيسي فقط" subtitle="اختيارية: درجاتٌ بنصابها وإضافيّها، واستثناءٌ لمن يلزم، وتنبيهٌ هادئ عند التجاوز — لا تمنع التعديل.">النصاب التدريسي</PageTitle>
      {notice ? <Notice type={notice.type}>{notice.text}</Notice> : null}
      {demoReadOnly ? <Notice type="info">الإعدادات للعرض في الديمو، والحفظ معطّل.</Notice> : null}

      <Surface className="tl-switch">
        <span className="tl-mark"><GraduationCap aria-hidden="true" /></span>
        <div className="tl-switch-copy">
          <strong>إدارة النصاب التدريسي</strong>
          <small>{config.enabled ? "مفعّلة: يظهر للمخطّط تنبيهٌ صغير عند تجاوز عضوٍ سقفه." : "معطّلة: لا يُحسب شيءٌ ولا يظهر أي تنبيه."}</small>
        </div>
        <label className="tl-toggle" data-guide-ignore="مفتاحُ تفعيل ميزة النصاب في شاشة إعدادها؛ لا يغيّر جدولاً">
          <input type="checkbox" role="switch" checked={config.enabled} disabled={demoReadOnly || loading} onChange={event => setConfig(current => ({ ...current, enabled: event.target.checked }))} aria-label="تفعيل إدارة النصاب التدريسي" />
          <i aria-hidden="true" />
        </label>
      </Surface>

      <Surface className="tl-card">
        <header className="tl-head">
          <div><strong>الدرجات العلمية</strong><small>الأدنى والأعلى والإضافي بالساعات الصحيحة في الفصل · رتّبها كما تشاء</small></div>
          <SecondaryButton type="button" data-guide-ignore="إضافة صفّ درجةٍ علمية في إعدادات النصاب؛ لا يحفظ حتى الضغط على «حفظ»" disabled={demoReadOnly || config.ranks.length >= MAX_ACADEMIC_RANKS} onClick={addRank}><Plus aria-hidden="true" /> إضافة درجة</SecondaryButton>
        </header>
        <div className="tl-legend" aria-hidden="true">
          <span><i className="is-band" />النصاب</span><span><i className="is-extra" />الإضافي</span><span><i className="is-over" />تجاوز</span>
        </div>
        {config.ranks.length ? (
          <ul className="tl-ranks">
            <li className="tl-ranks-head" aria-hidden="true"><span /><span>الدرجة</span><span>الأدنى</span><span>الأعلى</span><span>الإضافي</span><span>السقف</span><span /></li>
            {config.ranks.map((rank, index) => (
              <li key={rank.id} data-dragging={dragId === rank.id || undefined}
                draggable={!demoReadOnly && armed === rank.id}
                onDragStart={event => { setDragId(rank.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", rank.id); }}
                onDragOver={event => { if (!dragId || dragId === rank.id) return; event.preventDefault(); moveRank(dragId, index); }}
                onDragEnd={() => { setDragId(""); setArmed(""); }} onDrop={event => { event.preventDefault(); setDragId(""); setArmed(""); }}>
                <span className="tl-grip" aria-hidden="true" title="اسحب لتغيير الترتيب" onPointerDown={() => setArmed(rank.id)} onPointerUp={() => setArmed("")}><GripVertical /></span>
                <input type="text" value={rank.name} placeholder="اسم الدرجة" aria-label="اسم الدرجة العلمية" maxLength={60} disabled={demoReadOnly} onChange={event => patchRank(rank.id, { name: event.target.value })} />
                <HoursInput value={rank.minHours} label={`الحد الأدنى لنصاب ${rank.name || "الدرجة"}`} disabled={demoReadOnly} onRounded={rounded(rank.id)} onChange={value => patchRank(rank.id, { minHours: value ?? 0 })} />
                <HoursInput value={rank.maxHours} label={`الحد الأعلى لنصاب ${rank.name || "الدرجة"}`} disabled={demoReadOnly} onRounded={rounded(rank.id)} onChange={value => patchRank(rank.id, { maxHours: value ?? 0 })} />
                <HoursInput value={rank.overtimeHours ?? 0} max={MAX_OVERTIME_HOURS} label={`الإضافي لـ${rank.name || "الدرجة"}`} disabled={demoReadOnly} onRounded={rounded(rank.id)} onChange={value => patchRank(rank.id, { overtimeHours: value ?? 0 })} />
                <span className="tl-ceiling" title="السقف = الأعلى + الإضافي" dir="ltr">{num(Number(rank.maxHours || 0) + Number(rank.overtimeHours || 0))}</span>
                <span className="tl-rank-tools">
                  <GhostButton type="button" className="tl-move" aria-label={`رفع ${rank.name || "الدرجة"}`} title="أعلى" disabled={demoReadOnly || index === 0} data-guide-ignore="تغيير ترتيب الدرجات العلمية؛ لا يحفظ حتى «حفظ»" onClick={() => moveRank(rank.id, index - 1)}><ArrowUp aria-hidden="true" /></GhostButton>
                  <GhostButton type="button" className="tl-move" aria-label={`خفض ${rank.name || "الدرجة"}`} title="أسفل" disabled={demoReadOnly || index === config.ranks.length - 1} data-guide-ignore="تغيير ترتيب الدرجات العلمية؛ لا يحفظ حتى «حفظ»" onClick={() => moveRank(rank.id, index + 1)}><ArrowDown aria-hidden="true" /></GhostButton>
                  <GhostButton type="button" className="tl-del" data-guide-ignore="حذف صفّ درجةٍ علمية من إعدادات النصاب؛ يبقى حتى الحفظ" aria-label={`حذف الدرجة ${rank.name || ""}`} title="حذف الدرجة" disabled={demoReadOnly} onClick={() => removeRank(rank.id)}><Trash2 aria-hidden="true" /></GhostButton>
                </span>
                {roundHint?.id === rank.id ? <p className="tl-round-hint tl-rank-hint" role="status">{roundHint.text}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="tl-empty">لا درجاتٍ بعد. أضف درجةً وحدّد نصابها، ثم اختر درجةَ كل عضو.</p>}
      </Surface>

      <Surface className="tl-card">
        <header className="tl-head">
          <div>
            <strong>أعضاء هيئة التدريس</strong>
            <small>
              العبءُ من ساعات المقررات المسجّلة للعضو في الفصل
              {overCount ? ` · ${overCount.toLocaleString("ar-KW-u-nu-latn")} متجاوزاً` : ""}
              {exceptionCount ? ` · ${exceptionCount.toLocaleString("ar-KW-u-nu-latn")} باستثناء` : ""}
            </small>
          </div>
          <label className="tl-term">
            <span>الفصل</span>
            <select value={termId || ""} onChange={event => void load(Number(event.target.value))} aria-label="الفصل المحسوب عليه العبء">
              {terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
        </header>
        <div className="tl-filter">
          <label className="tl-search"><Search aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم العضو" aria-label="بحث عن عضو هيئة تدريس" /></label>
          <label className="tl-check"><input type="checkbox" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)} /> المضبوط نصابهم فقط</label>
        </div>
        {loading ? <p role="status" className="tl-empty">يجري التحميل…</p> : rows.length ? (
          <div className="tl-members" role="table" aria-label="نصاب أعضاء هيئة التدريس">
            <div className="tl-row tl-row-head" role="row" aria-hidden="true"><span>العضو</span><span>الدرجة</span><span>العبء</span><span /></div>
            {rows.map(member => {
              const entry = config.assignments[String(member.id)] || {};
              const status = statuses.get(member.id) || evaluateTeachingLoad(config, member.id, member.hours, termContext);
              const untilName = terms.find(term => term.id === status.exception?.untilTermId)?.name;
              return (
                <div className="tl-row" role="row" key={member.id} data-state={status.state}>
                  <span className="tl-name" role="cell">
                    <span>{member.name}{status.exception ? <ExceptionBadge reason={status.exception.reason} untilName={untilName} /> : null}</span>
                    {member.retired ? <small>غير نشط</small> : null}
                  </span>
                  <select role="cell" value={entry.rankId || ""} aria-label={`درجة ${member.name}`} disabled={demoReadOnly} onChange={event => patchAssignment(member.id, { rankId: event.target.value || undefined })}>
                    <option value="">بلا درجة</option>
                    {config.ranks.map(rank => <option key={rank.id} value={rank.id}>{rank.name || "(بلا اسم)"}</option>)}
                  </select>
                  <span className="tl-load" role="cell">
                    <LoadMeter hours={status.hours} min={status.min} max={status.max} overtime={status.extra} state={status.state} />
                    <span className="tl-load-line">
                      <b>{num(member.hours)}</b>
                      {status.max !== null ? <small dir="ltr">/ {num(status.max)}{status.extra ? `+${num(status.extra)}` : ""}</small> : <small>—</small>}
                      <em className={`tl-chip tl-chip-${status.state}`}>
                        {status.state === "over" ? `تجاوز ${hoursLabel(status.excess)}` : status.state === "overtime" ? `إضافي ${hoursLabel(status.overtimeUsed)}` : status.state === "within" ? "ضمن النصاب" : status.state === "under" ? "دون الأدنى" : "غير مضبوط"}
                      </em>
                    </span>
                  </span>
                  <GhostButton role="cell" type="button" className={`tl-ex-btn${hasLoadOverride(entry) ? " is-on" : ""}`} data-guide-ignore="يفتح محرّر استثناء نصاب العضو؛ لا يحفظ حتى «حفظ»"
                    aria-label={`استثناء نصاب ${member.name}`} title="استثناء النصاب" onClick={() => setEditing(member)}>
                    <UserCog aria-hidden="true" /><span>استثناء</span>
                  </GhostButton>
                </div>
              );
            })}
          </div>
        ) : <p className="tl-empty">لا أعضاء مطابقين.</p>}
      </Surface>

      {editing ? (
        <LoadExceptionEditor name={editing.name} ranks={config.ranks} value={config.assignments[String(editing.id)] || {}} terms={terms} hours={editing.hours}
          readOnly={demoReadOnly} onApply={next => { setAssignment(editing.id, next); setEditing(null); }} onClose={() => setEditing(null)} />
      ) : null}

      <div className="tl-save">
        {problem ? <span className="tl-problem" role="alert">{problem}</span> : <span className="tl-hint">{dirty ? "تغييراتٌ لم تُحفظ." : "كل شيءٍ محفوظ."}</span>}
        <PrimaryButton type="button" data-guide-ignore="حفظ إعدادات النصاب التدريسي (الدرجات وترتيبها والإسناد والاستثناءات)؛ لا يغيّر جدولاً ولا يمنع تعديلاً" disabled={busy || demoReadOnly || !dirty || Boolean(problem)} onClick={() => void save()}><Save aria-hidden="true" /> {busy ? "جارٍ الحفظ…" : "حفظ"}</PrimaryButton>
      </div>
    </div>
  );
}

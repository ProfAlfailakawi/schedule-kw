/**
 * ── «طلبات الشعب» في كشف التسجيل ────────────────────────────────────────────
 *
 * الشاشةُ التي يفتحها الأطرافُ الثلاثة أصلاً (الإرشاد، ولجنة الجدول، والتسجيل)، فلا شاشةَ جديدة:
 * بطاقةٌ لكل طلب بخطٍّ زمنيٍّ واحد يراه الجميع، وزرٌّ رئيسيٌّ واحد لكل طرف بحسب ما ينتظره:
 *   الإرشاد ← «طلب شعبة» · اللجنة ← «افتح الشعبة» ثم «اعتمد الطلبة» · التسجيل ← «سجّل الطلبة».
 * القواعدُ في src/utils/sectionRequests.ts، والصلاحياتُ يقولها الخادم لكل بطاقة.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, CheckCheck, ClipboardPaste, GraduationCap, Layers, Link2, Send, Target, Undo2, Unlink, UserCheck, Users, X } from "lucide-react";
import CampusChip from "../CampusChip";
import SearchableSelect from "../SearchableSelect";
import { Notice, PrimaryButton, SecondaryButton } from "../ui";
import { AR, countOf, nounFor } from "../../utils/arabicCount";
import { onLiveSignal } from "../../utils/livePulse";
import { ColleagueWorkNotice } from "../ColleagueHoldNotice";
import { errorWithCode, useStaleWrite } from "../StaleWriteToast";
import { useTeamPeers, useTeamWork } from "../../hooks/useTeamWork";
import { workClashes, type TeamPeer } from "../../utils/teamWork";
import { putSectionRequestHandoff } from "../../utils/sectionRequestHandoff";
import {
  PERIOD_ICON, PERIOD_LABEL, SECTION_REQUEST_PERIODS, STAGE_LABEL, parsePastedStudents, registrationChanges,
  type SectionRequestCounts, type SectionRequestPeriod, type SectionRequestStage, type TimelineStep,
} from "../../utils/sectionRequests";
import "./section-requests.css";

interface StudentRow { id: string; source: "masari" | "paste"; name: string; civilTail: string; approved?: boolean; registered: boolean }
interface RequestRow {
  id: string; termId: number;
  /** ختمُ الإصدار: تحمله كلُّ كتابة، فلا تُكتب فوق انتقالٍ لم يُرَ (src/utils/staleWrite.ts). */
  rev: number; collegeId: number; collegeName: string; sectionId: number; sectionName: string;
  fromSectionId: number; fromSectionName: string; courseId: number; courseCode: string; courseName: string;
  period: SectionRequestPeriod; count: number; note: string; stage: SectionRequestStage; timeline: TimelineStep[]; counts: SectionRequestCounts;
  sectionsNeeded: number; maxStudent: number; closedNote: string; createdAt: string; createdBy: string; createdByRole: string;
  sections: Array<{ scheduleId: number; sectionCode: string; capacity?: number }>;
  students: StudentRow[];
  powers: { advising: boolean; committee: boolean; registration: boolean };
  available: Array<{ scheduleId: number; sectionCode: string; when: string; matchesPeriod: boolean }>;
}

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  collegeName?: string;
  /** يفتح الورشة على محرّر الموعد (للجنة). */
  onNavigate?: (view: string) => void;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("ar-KW-u-nu-latn");

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); }
  if (!response.ok) throw errorWithCode(data.error || "تعذّر التنفيذ.", data.code);
  return data;
}

/* ── الخطُّ الزمني ─────────────────────────────────────────────────────────── */
function Timeline({ steps, stage }: { steps: TimelineStep[]; stage: SectionRequestStage }) {
  const closed = stage === "withdrawn" || stage === "declined";
  return (
    <ol className={`srq-line${closed ? " is-closed" : ""}`} aria-label="مسار الطلب">
      {steps.map(step => (
        <li key={step.key} className={`${step.done ? "done" : ""}${step.current ? " current" : ""}`}>
          <span className="srq-dot" aria-hidden="true">{step.done ? <Check /> : null}</span>
          <b>{step.label}</b>
          {step.detail ? <small>{step.detail}</small> : null}
        </li>
      ))}
    </ol>
  );
}

/* ── اختيارُ طلبة: للاعتماد وللتسجيل ─────────────────────────────────────── */
function StudentPicker({ students, initial, verb, allLabel, busy, onSubmit, onCancel, allowEmpty = false }: {
  students: StudentRow[]; initial: string[]; verb: string; allLabel: string; busy: boolean;
  /** التسجيل: اختيارٌ فارغ يعني «لم يُسجَّل أحد» — تصحيحُ «سُجّلوا كلهم» الخاطئ. */
  allowEmpty?: boolean;
  onSubmit: (ids: string[], all: boolean) => void; onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const every = students.length > 0 && students.every(row => picked.has(row.id));
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="srq-pick" role="group" aria-label={verb}>
      <label className="srq-pick-all">
        <input type="checkbox" checked={every} onChange={() => setPicked(every ? new Set() : new Set(students.map(row => row.id)))} />
        <span>الكل</span><em>{fmt(picked.size)} / {fmt(students.length)}</em>
      </label>
      <ul>
        {students.map((row, index) => (
          <li key={row.id} className={picked.has(row.id) ? "on" : ""}>
            <label>
              <input type="checkbox" checked={picked.has(row.id)} onChange={() => toggle(row.id)} />
              <span className="srq-num">{fmt(index + 1)}</span>
              <span className="srq-name">{row.name || "طالب"}</span>
              {row.civilTail ? <small className="srq-tail" title="آخر أربعة أرقام من الرقم المدني">{row.civilTail}</small> : null}
              {row.source === "masari" ? <i className="srq-src" title="من طلبات «مساري»">🎯</i> : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="srq-pick-actions">
        <PrimaryButton type="button" disabled={busy || (!allowEmpty && !picked.size)} onClick={() => onSubmit([...picked], false)} data-guide-ignore="يكتب قرار الطرف في الطلبة المحددين من طلب الشعبة">
          <Check aria-hidden="true" /> {verb} ({fmt(picked.size)})
        </PrimaryButton>
        <SecondaryButton type="button" disabled={busy} onClick={() => onSubmit(students.map(row => row.id), true)} data-guide-ignore="اختصارٌ يكتب القرار في كل طلبة طلب الشعبة دفعة واحدة">
          <CheckCheck aria-hidden="true" /> {allLabel}
        </SecondaryButton>
        <button type="button" className="srq-link" disabled={busy} onClick={onCancel} data-guide-ignore="يغلق قائمة الاختيار دون أي كتابة">تراجع</button>
      </div>
    </div>
  );
}

/* ── بطاقةُ الطلب ─────────────────────────────────────────────────────────── */
function RequestCard({ row, onChanged, onNavigate, peers, onStale }: {
  key?: React.Key; row: RequestRow; onChanged: () => void; onNavigate?: (view: string) => void;
  /** زملاءُ الفريق: من يعمل الآن على هذا الطلب نفسه يُقال على البطاقة. */
  peers: readonly TeamPeer[];
  /** «حدّث ثم أعد»: كتب زميلٌ في الطلب قبلي. يُعيد true إن كان الخطأُ ذاك. */
  onStale: (error: unknown) => boolean;
}) {
  const [mode, setMode] = useState<"" | "approve" | "register" | "decline">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const { powers, stage, counts } = row;
  const open = stage === "sent" || stage === "opened";
  const decides = powers.committee || powers.registration;
  const approvedRows = row.students.filter(student => student.approved === true);

  /* ما أفتحه في البطاقة (اعتماد، تسجيل، اعتذار) أو أكتبه الآن: هذا الطلب ما أعمل عليه. */
  useTeamWork(mode || busy ? { kind: "sectionRequest", id: row.id, label: row.courseName.slice(0, 40) } : null);
  const clashes = workClashes(peers, { kind: "sectionRequest", id: row.id });
  /* كلُّ كتابةٍ تحمل ختمَ ما رأيتُه؛ والكتابةُ الثانية في سلسلةٍ واحدة تحمل ختمَ الأولى. */
  const act = async (path: string, body: Record<string, unknown>, rev = row.rev): Promise<number | null> => {
    setBusy(true); setError("");
    try {
      const out = await call(`/api/section-requests/${encodeURIComponent(row.id)}/${path}`, { method: "POST", body: JSON.stringify({ ...body, rev }) });
      setMode(""); onChanged();
      return Number(out?.rev ?? rev + 1);
    }
    catch (e: any) { if (!onStale(e)) setError(e?.message || "تعذّر التنفيذ."); return null; }
    finally { setBusy(false); }
  };
  const openInWorkspace = () => {
    putSectionRequestHandoff({ requestId: row.id, courseId: row.courseId, collegeId: row.collegeId, sectionId: row.sectionId, termId: row.termId, period: row.period, count: row.count, courseName: row.courseName });
    onNavigate?.("schedules");
  };

  /* الزرُّ الرئيسيُّ الواحد لكل طرف، بحسب ما ينتظره الطلب منه الآن. */
  let primary: React.ReactNode = null;
  if (powers.committee && stage === "sent" && onNavigate) {
    primary = <PrimaryButton type="button" onClick={openInWorkspace} data-guide-ignore="يفتح محرّر الموعد في الورشة مملوءاً بمقرر الطلب وحرمه وفصله؛ لا يكتب قبل الحفظ هناك"><CalendarPlus aria-hidden="true" /> افتح الشعبة</PrimaryButton>;
  } else if (decides && stage === "opened" && mode !== "approve") {
    primary = <PrimaryButton type="button" disabled={busy} onClick={() => row.students.length ? setMode("approve") : void act("approve", { all: true })} data-guide-ignore="يفتح قائمة طلبة الطلب لاعتمادهم كلهم أو بعضهم"><UserCheck aria-hidden="true" /> اعتمد الطلبة</PrimaryButton>;
  } else if (powers.registration && stage === "registered" && approvedRows.length && mode !== "register") {
    /* اكتمل التسجيل: يبقى بابُ التصحيح مفتوحاً لمن علّم «سُجّلوا كلهم» خطأً. */
    primary = <SecondaryButton type="button" disabled={busy} onClick={() => setMode("register")} data-guide-ignore="يفتح قائمة المعتمدين ليصحّح التسجيلُ من علّمه مسجَّلاً"><GraduationCap aria-hidden="true" /> عدّل التسجيل</SecondaryButton>;
  } else if (powers.registration && (stage === "approved" || stage === "registering") && approvedRows.length && mode !== "register") {
    primary = <PrimaryButton type="button" disabled={busy} onClick={() => setMode("register")} data-guide-ignore="يفتح قائمة المعتمدين ليعلّم التسجيلُ من سُجّل منهم"><GraduationCap aria-hidden="true" /> سجّل الطلبة</PrimaryButton>;
  }

  return (
    <article className="srq-card" data-stage={stage}>
      <header className="srq-card-head">
        <div className="srq-course">
          <b>{row.courseName}</b>
          <small>{[row.courseCode, row.sectionName].filter(Boolean).join(" · ")}</small>
        </div>
        <div className="srq-count" title="عدد الطلبة المحتاجين">
          <b>{fmt(row.count)}</b><small>{nounFor(row.count, AR.student)}</small>
        </div>
      </header>

      <div className="srq-chips">
        <CampusChip collegeName={row.collegeName} />
        <span className="srq-chip" data-period={row.period}><span aria-hidden="true">{PERIOD_ICON[row.period]}</span>{PERIOD_LABEL[row.period]}</span>
        {row.sectionsNeeded ? <span className="srq-chip" title={`سعة الشعبة ${fmt(row.maxStudent)}`}><Layers aria-hidden="true" />≈ {countOf(row.sectionsNeeded, AR.section)}</span> : null}
        <span className="srq-chip muted" title={`${row.createdByRole} · ${row.createdBy}`}><Send aria-hidden="true" />{row.fromSectionName || "الإرشاد"}</span>
        {/* الخطُّ الزمني يقول المرحلة؛ والوسمُ لما لا يقوله: طلبٌ سُحب أو اعتذرت عنه اللجنة. */}
        {stage === "withdrawn" || stage === "declined" ? <span className={`srq-stage is-${stage}`}>{STAGE_LABEL[stage]}</span> : null}
      </div>

      <Timeline steps={row.timeline} stage={stage} />

      <ColleagueWorkNotice clashes={clashes} className="srq-colleague" />

      {row.note ? <p className="srq-note">💬 {row.note}</p> : null}
      {stage === "declined" && row.closedNote ? <p className="srq-note is-declined">↩️ {row.closedNote}</p> : null}

      {row.sections.length ? (
        <div className="srq-sections" aria-label="الشعب المربوطة">
          {row.sections.map(section => (
            <span key={section.sectionCode} className="srq-section">
              <Link2 aria-hidden="true" /> شعبة {section.sectionCode}{section.capacity ? <small>سعة {fmt(section.capacity)}</small> : null}
              {powers.committee && open ? (
                <button type="button" aria-label={`فك الشعبة ${section.sectionCode}`} disabled={busy} onClick={() => void act("unlink", { sectionCode: section.sectionCode })} data-guide-ignore="يفك ربط شعبة بطلب الإرشاد قبل الاعتماد؛ لا يحذفها من الجدول"><Unlink aria-hidden="true" /></button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {powers.committee && open && row.available.length ? (
        <div className="srq-available">
          <small>شعبٌ قائمة لهذا المقرر — اربطها بلمسة</small>
          <div>
            {row.available.slice(0, 6).map(item => (
              <button key={item.sectionCode} type="button" className={item.matchesPeriod ? "fits" : ""} disabled={busy} onClick={() => void act("link", { scheduleIds: [item.scheduleId] })}
                data-guide-ignore="يربط شعبةً قائمة في الجدول بطلب الإرشاد؛ لا يغيّر الموعد">
                <Link2 aria-hidden="true" /><b>{item.sectionCode}</b><span>{item.when}</span>{item.matchesPeriod ? <i aria-label="توافق الفترة المفضلة">✓</i> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "approve" ? (
        <StudentPicker students={row.students} initial={row.students.filter(s => s.approved !== false).map(s => s.id)} verb="اعتمد المحدَّدين" allLabel="اعتمد الكل" busy={busy}
          onSubmit={(ids, all) => void act("approve", all ? { all: true } : { studentIds: ids })} onCancel={() => setMode("")} />
      ) : null}
      {mode === "register" ? (
        <StudentPicker students={approvedRows} initial={approvedRows.filter(s => s.registered).map(s => s.id)} verb="سُجّل المحدَّدون" allLabel="سُجّلوا كلهم" busy={busy} allowEmpty
          onSubmit={(ids, all) => {
            if (all) { void act("register", { all: true }); return; }
            const { add, drop } = registrationChanges(approvedRows.filter(s => s.registered).map(s => s.id), ids);
            void (async () => {
              let rev: number | null = row.rev;
              if (add.length) rev = await act("register", { studentIds: add, registered: true }, rev);
              if (drop.length && rev !== null) await act("register", { studentIds: drop, registered: false }, rev);
              if (!add.length && !drop.length) setMode("");
            })();
          }} onCancel={() => setMode("")} />
      ) : null}
      {mode === "decline" ? (
        <div className="srq-decline">
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="سطرٌ يصل الإرشاد: لماذا لا تُفتح الشعبة؟" aria-label="سبب الاعتذار" />
          <SecondaryButton type="button" disabled={busy || !note.trim()} onClick={() => void act("decline", { note })} data-guide-ignore="يكتب اعتذار اللجنة عن طلب الشعبة ويصل الإرشاد">أرسل الاعتذار</SecondaryButton>
          <button type="button" className="srq-link" onClick={() => setMode("")} data-guide-ignore="يغلق حقل الاعتذار دون كتابة">تراجع</button>
        </div>
      ) : null}

      {error ? <Notice type="error" inline onDismiss={() => setError("")}>{error}</Notice> : null}

      <footer className="srq-card-foot">
        {primary}
        {powers.committee && stage === "opened" && onNavigate && mode === "" ? (
          <SecondaryButton type="button" onClick={openInWorkspace} data-guide-ignore="يفتح محرّر الموعد لشعبةٍ إضافية لطلب الإرشاد"><CalendarPlus aria-hidden="true" /> شعبة أخرى</SecondaryButton>
        ) : null}
        {powers.committee && open && mode === "" ? (
          <button type="button" className="srq-link" onClick={() => setMode("decline")} data-guide-ignore="يفتح حقل سبب الاعتذار عن طلب الشعبة">اعتذار</button>
        ) : null}
        {powers.advising && !powers.committee && open ? (
          <button type="button" className="srq-link" disabled={busy} onClick={() => void act("withdraw", {})} data-guide-ignore="يسحب الإرشادُ طلب الشعبة قبل الاعتماد"><Undo2 aria-hidden="true" /> اسحب الطلب</button>
        ) : null}
        {powers.advising && !powers.committee && row.timeline[2]?.done ? <span className="srq-approved-badge"><CheckCheck aria-hidden="true" /> تم الاعتماد · {fmt(counts.approved)} من {fmt(counts.listed)}</span> : null}
      </footer>

      {row.students.length ? (
        <details className="srq-roster" open={powers.advising && !powers.committee && Boolean(row.timeline[2]?.done)}>
          <summary>
            <Users aria-hidden="true" /> الكشف <b>{fmt(counts.listed)}</b>
            {row.timeline[2]?.done ? <span className="srq-tally"><em className="ok">✅ {fmt(counts.approved)}</em><em className="no">⛔ {fmt(counts.notApproved)}</em><em className="reg">📝 {fmt(counts.registered)}</em></span> : null}
          </summary>
          <ul>
            {row.students.map((student, index) => (
              <li key={student.id} data-state={student.registered ? "registered" : student.approved === true ? "approved" : student.approved === false ? "not" : "open"}>
                <span className="srq-num">{fmt(index + 1)}</span>
                <span className="srq-name">{student.name || "طالب"}</span>
                {student.civilTail ? <small className="srq-tail" title="آخر أربعة أرقام من الرقم المدني">{student.civilTail}</small> : null}
                <em>{student.registered ? "📝 سُجّل" : student.approved === true ? "✅ اعتُمد" : student.approved === false ? "⛔ لم يُعتمد" : "⏳"}</em>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}


/* ── نموذجُ الإرشاد ───────────────────────────────────────────────────────── */
interface ComposeCourse { id: number; code: string; name: string; sectionId: number; maxStudent: number; masari: number }

function Compose({ collegeId, sectionId, termId, collegeName, onSent, onCancel }: { collegeId: number; sectionId: number; termId: number; collegeName?: string; onSent: () => void; onCancel: () => void }) {
  const [courses, setCourses] = useState<ComposeCourse[] | null>(null);
  const [courseId, setCourseId] = useState(0);
  const [period, setPeriod] = useState<SectionRequestPeriod>("any");
  const [candidates, setCandidates] = useState<Array<{ needId: string; name: string; civilTail: string }>>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pasted, setPasted] = useState("");
  const [count, setCount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void call(`/api/section-requests/compose?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(data => setCourses(data.courses || [])).catch((e: any) => { setError(e.message); setCourses([]); });
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    setCandidates([]); setPicked(new Set());
    if (!courseId) return;
    void call(`/api/section-requests/candidates?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}&courseId=${courseId}`)
      .then(data => { const rows = data.rows || []; setCandidates(rows); setPicked(new Set(rows.map((row: any) => row.needId))); })
      .catch(() => setCandidates([]));
  }, [collegeId, sectionId, termId, courseId]);

  const pastedRows = useMemo(() => parsePastedStudents(pasted), [pasted]);
  const listed = picked.size + pastedRows.length;
  const total = Math.max(listed, count || 0);
  const course = courses?.find(row => row.id === courseId);
  const options = useMemo(() => (courses || []).map(row => ({
    value: row.id, label: row.name, hint: row.code, keywords: row.code,
    badge: row.masari ? `🎯 ${fmt(row.masari)}` : undefined,
  })), [courses]);

  const send = async () => {
    setBusy(true); setError("");
    try {
      await call("/api/section-requests", { method: "POST", body: JSON.stringify({ collegeId, fromSectionId: sectionId, termId, courseId, period, count: total, needIds: [...picked], pasted, note }) });
      onSent();
    } catch (e: any) { setError(e?.message || "تعذّر الإرسال."); }
    finally { setBusy(false); }
  };

  return (
    <form className="srq-compose" onSubmit={event => { event.preventDefault(); if (courseId && total) void send(); }} aria-label="طلب شعبة جديد">
      <div className="srq-step">
        <span className="srq-step-n">١</span>
        <div className="srq-step-body">
          <b>المقرر</b>
          <SearchableSelect value={courseId || ""} onChange={value => setCourseId(Number(value) || 0)} options={options}
            placeholder={courses ? "اختر المقرر" : "يقرأ المقررات…"} disabled={!courses} ariaLabel="المقرر" searchPlaceholder="اسم المقرر أو رمزه"
            guideIgnore="اختيار مقرر طلب الشعبة؛ لا يكتب شيئاً" />
          <div className="srq-chips">
            <CampusChip collegeName={collegeName} />
            {course?.maxStudent ? <span className="srq-chip"><Layers aria-hidden="true" />سعة الشعبة {fmt(course.maxStudent)}</span> : null}
          </div>
        </div>
      </div>

      <div className="srq-step">
        <span className="srq-step-n">٢</span>
        <div className="srq-step-body">
          <b>الفترة المفضلة</b>
          <div className="srq-periods" role="radiogroup" aria-label="الفترة المفضلة">
            {SECTION_REQUEST_PERIODS.map(value => (
              <button key={value} type="button" role="radio" aria-checked={period === value} className={period === value ? "on" : ""} onClick={() => setPeriod(value)}
                data-guide-ignore="اختيار الفترة المفضلة لطلب الشعبة؛ لا يكتب شيئاً">
                <span aria-hidden="true">{PERIOD_ICON[value]}</span>{PERIOD_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="srq-step">
        <span className="srq-step-n">٣</span>
        <div className="srq-step-body">
          <b>الطلبة</b>
          {candidates.length ? (
            <div className="srq-masari">
              <label className="srq-masari-head">
                <input type="checkbox" checked={picked.size === candidates.length} onChange={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map(row => row.needId)))} />
                <Target aria-hidden="true" /> <span>طلبه من «مساري»</span> <b>{fmt(candidates.length)}</b>
              </label>
              <details>
                <summary>اختر منهم</summary>
                <ul>
                  {candidates.map(row => (
                    <li key={row.needId}><label>
                      <input type="checkbox" checked={picked.has(row.needId)} onChange={() => setPicked(current => { const next = new Set(current); if (next.has(row.needId)) next.delete(row.needId); else next.add(row.needId); return next; })} />
                      <span>{row.name || "طالب"}</span>{row.civilTail ? <small className="srq-tail" title="آخر أربعة أرقام من الرقم المدني">{row.civilTail}</small> : null}
                    </label></li>
                  ))}
                </ul>
              </details>
            </div>
          ) : courseId ? <small className="srq-hint">لا طلبات من «مساري» لهذا المقرر بعد.</small> : null}
          <label className="srq-paste">
            <span><ClipboardPaste aria-hidden="true" /> الصق القائمة {pastedRows.length ? <em>{countOf(pastedRows.length, AR.student)}</em> : null}</span>
            <textarea value={pasted} onChange={event => setPasted(event.target.value)} rows={3} placeholder="سطرٌ لكل طالب: الاسم أو الرقم المدني أو كلاهما" />
          </label>
          <label className="srq-total">
            <span>العدد الكلي</span>
            <input type="number" min={listed} max={1000} value={total || ""} onChange={event => setCount(Math.max(0, Number(event.target.value) || 0))} placeholder="0" />
            <small>{listed ? `منهم ${fmt(listed)} في القائمة` : "العدد وحده يكفي إن لم تكن القائمة جاهزة"}</small>
          </label>
          <input className="srq-note-input" value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="ملاحظة للجنة (اختياري)" aria-label="ملاحظة للجنة" />
        </div>
      </div>

      {error ? <Notice type="error" inline onDismiss={() => setError("")}>{error}</Notice> : null}
      <footer className="srq-compose-foot">
        <span className="srq-summary">{course ? <>«{course.name}» · {countOf(total, AR.student)} · {PERIOD_LABEL[period]}</> : "اختر المقرر"}</span>
        <PrimaryButton type="submit" disabled={busy || !courseId || !total} data-guide-ignore="يرسل طلب الشعبة إلى لجنة جدول قسم المقرر"><Send aria-hidden="true" /> أرسل إلى لجنة الجدول</PrimaryButton>
        <button type="button" className="srq-link" onClick={onCancel} data-guide-ignore="يغلق نموذج طلب الشعبة دون إرسال"><X aria-hidden="true" /> إلغاء</button>
      </footer>
    </form>
  );
}

/* ── اللوحة ───────────────────────────────────────────────────────────────── */
export default function SectionRequestsPanel({ collegeId, sectionId, termId, collegeName, onNavigate }: Props) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [canCompose, setCanCompose] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!termId) { setRows([]); return; }
    try { const data = await call(`/api/section-requests?termId=${termId}`); setRows(data.rows || []); }
    catch (e: any) { setError(e.message); setRows([]); }
  }, [termId]);
  useEffect(() => { void load(); }, [load]);
  /* «work»: حفظُ زميلٍ في الكلية والفصل نفسيهما يصل في نبضته التالية، بلا إعادة تحميل. */
  useEffect(() => onLiveSignal(["notify", "work"], () => void load()), [load]);
  const { peers } = useTeamPeers();
  const { staleToast, catchStale } = useStaleWrite(() => load());
  /* «طلب شعبة» للإرشاد وحده: الخادمُ يقول إن كان هذا الحساب يرسل من نطاق القسم المختار. */
  useEffect(() => {
    setCanCompose(false);
    if (!collegeId || !sectionId || !termId) return;
    void fetch(`/api/section-requests/compose?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", method: "GET" })
      .then(response => setCanCompose(response.ok)).catch(() => setCanCompose(false));
  }, [collegeId, sectionId, termId]);

  /* ما يخصّ النطاق المختار: طلبٌ لمقررات هذا القسم أو من إرشاده، وفي الحرم المختار. */
  const shown = useMemo(() => (rows || []).filter(row =>
    (!collegeId || row.collegeId === collegeId) && (!sectionId || row.sectionId === sectionId || row.fromSectionId === sectionId)), [rows, collegeId, sectionId]);
  const tally = useMemo(() => ({
    waiting: shown.filter(row => row.stage === "sent").length,
    opened: shown.filter(row => row.stage === "opened").length,
    approved: shown.filter(row => row.stage === "approved" || row.stage === "registering").length,
    registered: shown.filter(row => row.stage === "registered").length,
  }), [shown]);

  if (!rows) return null;
  if (!shown.length && !canCompose) return null;

  return (
    <section className="srq" aria-label="طلبات الشعب">
      <header className="srq-head">
        <div className="srq-title">
          <span className="srq-ic" aria-hidden="true"><Layers /></span>
          <div><h3>طلبات الشعب</h3><small>الإرشاد ← لجنة الجدول ← التسجيل</small></div>
        </div>
        {shown.length ? (
          <ul className="srq-tiles" aria-label="أين وصلت الطلبات">
            <li data-k="sent"><b>{fmt(tally.waiting)}</b><span>بانتظار الشعبة</span></li>
            <li data-k="opened"><b>{fmt(tally.opened)}</b><span>فُتحت الشعبة</span></li>
            <li data-k="approved"><b>{fmt(tally.approved)}</b><span>للتسجيل</span></li>
            <li data-k="registered"><b>{fmt(tally.registered)}</b><span>سُجّلوا</span></li>
          </ul>
        ) : null}
        {canCompose && !composing ? (
          <PrimaryButton type="button" onClick={() => { setComposing(true); setSent(false); }} data-guide-ignore="يفتح نموذج طلب شعبة من الإرشاد إلى لجنة الجدول؛ لا يرسل قبل التأكيد">
            <Send aria-hidden="true" /> طلب شعبة
          </PrimaryButton>
        ) : null}
      </header>
      {error ? <Notice type="error" inline onDismiss={() => setError("")}>{error}</Notice> : null}
      {sent ? <Notice type="success" inline onDismiss={() => setSent(false)}>وصل الطلبُ لجنةَ الجدول، ويصلك إشعارٌ عند الاعتماد.</Notice> : null}
      {composing ? <Compose collegeId={collegeId} sectionId={sectionId} termId={termId} collegeName={collegeName} onCancel={() => setComposing(false)} onSent={() => { setComposing(false); setSent(true); void load(); }} /> : null}
      {shown.length ? (
        <div className="srq-list">{shown.map(row => <RequestCard key={row.id} row={row} onChanged={() => void load()} onNavigate={onNavigate} peers={peers} onStale={catchStale} />)}</div>
      ) : !composing ? <p className="srq-empty">لا طلبات شعبٍ بعد. طلبٌ واحد يكفي: المقرر، والفترة، والطلبة.</p> : null}
      {staleToast}
    </section>
  );
}

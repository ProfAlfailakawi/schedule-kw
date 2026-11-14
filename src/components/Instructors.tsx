import React, { useEffect, useMemo, useState } from "react";
import { Archive, BookOpenCheck, Trash2, UserRound, GraduationCap, UsersRound } from "lucide-react";
import { validateCivilId } from "../utils/civilId";
import { numericText } from "../utils/digits";
import { sortByName } from "../utils/sorting";
import VisitingConversionPanel from "./VisitingConversionPanel";
import VisitingBadge from "./VisitingBadge";
import { ExceptionBadge, InstructorLoadPanel } from "./LoadException";
import { isFacultyPlaceholder } from "../utils/placeholderInstructor";
import { ROSTER_GROUPS, rosterGroupOf, type RosterGroup } from "../utils/rosterGroups";
import { INSTRUCTOR_LOAD_MAX, readInstructorLoad } from "../utils/academicGuards";
import { arrowChoice } from "../utils/arrowChoice";
import {
  AddButton,
  EmbeddedAction,
  EmptyState,
  Field,
  FormActions,
  ListToolbar,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  SkeletonDeck,
  Surface,
  CatalogFormDrawer,
  visualConfirm,
} from "./ui";
type Mode = "index" | "create" | "edit";
/** `embedded` means the academic console already supplies the page identity.
 *  `loadAdmin` (المدير الرئيسي): بطاقةُ النصاب واستثناءُ العضو من اسمه في التفاصيل. */
export default function Instructors({ embedded = false, actionSlot = null, loadAdmin = false, demoReadOnly = false, onCount }: { embedded?: boolean; actionSlot?: HTMLElement | null; loadAdmin?: boolean; demoReadOnly?: boolean; onCount?: (count: number) => void }) {
  const [items, setItems] = useState<any[]>([]),
    [loadFailed, setLoadFailed] = useState(false),
    [initial, setInitial] = useState(""),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [civil, setCivil] = useState(""),
    [name, setName] = useState(""),
    [mobile, setMobile] = useState(""),
    [teachingLoad, setTeachingLoad] = useState(""),
    [query, setQuery] = useState(""),
    [group, setGroup] = useState<RosterGroup>("faculty"),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160),
    // Note 2: retired / sabbatical status. Note 1: which instructors are delegates.
    [status, setStatus] = useState<"" | "retired" | "sabbatical">(""),
    [category, setCategory] = useState<"" | "ta">(""),
    [delegateIds, setDelegateIds] = useState<Set<number>>(new Set());
  type Affiliation = { collegeId: number; sectionId: number; section: string; college: string };
  const [affiliations, setAffiliations] = useState<Record<string, { delegate: Affiliation[]; teaching: Affiliation[] }>>({});
  type ScopeDetail = Affiliation & { rows?: number; terms?: string[] };
  const [detail, setDetail] = useState<{ instructorId: number; teaching: ScopeDetail[]; delegate: ScopeDetail[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/instructors");
      if (!r.ok) throw 0;
      const data = await r.json();
      setItems(data);
      setLoadFailed(false);
      /* العدد كما تعرضه القائمة: الأشخاص الحقيقيون، بلا سجلات «هيئة تدريسية». */
      onCount?.(data.filter((x: any) => !isFacultyPlaceholder(x)).length);
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdInstructorId === v)
          ? v
          : data[0]?.AdInstructorId || null,
      );
    } catch {
      setLoadFailed(true);
      setError("فشل تحميل بيانات أستاذ المقرر");
    } finally {
      setLoading(false);
    }
  };
  /* الانتداب والنسب: يُقرآن عند الفتح، ويُعادان بعد تحويل منتدب ⇄ معيّن فلا يبقى الوسم قديماً. */
  const loadAffiliations = () => {
    fetch("/api/delegates")
      .then(r => (r.ok ? r.json() : { instructorIds: [] }))
      .then(d => setDelegateIds(new Set((d.instructorIds || []).map(Number))))
      .catch(() => undefined);
    /* «منتدب» بلا نسب اسمٌ معلّق. النسبة تُقرأ من دليل كل قسم ومن جدول الفصل
       الأحدث، فيُعرف لكل شخص من ضمّه وأين يدرّس فعلاً. */
    fetch("/api/instructor-affiliations")
      .then(r => (r.ok ? r.json() : { affiliations: {} }))
      .then(d => setAffiliations(d?.affiliations && typeof d.affiliations === "object" ? d.affiliations : {}))
      .catch(() => undefined);
  };
  const [detailVersion, setDetailVersion] = useState(0);
  useEffect(() => {
    void load();
    loadAffiliations();
  }, []);
  const back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      setEditId(null);
      setCivil("");
      setName("");
      setMobile("");
      setStatus("");
      setCategory("");
      setTeachingLoad("");
      setInitial(JSON.stringify(["", "", "", "", "", ""]));
      setMode("create");
      setError(null);
    },
    edit = (x: any) => {
      setEditId(x.AdInstructorId);
      setCivil(x.AdInstructorCivil || "");
      setName(x.AdInstructorName || "");
      setMobile(x.AdInstructorMobile || "");
      setStatus(x.AdInstructorStatus === "retired" || x.AdInstructorStatus === "sabbatical" ? x.AdInstructorStatus : "");
      setCategory(x.AdInstructorCategory === "ta" ? "ta" : "");
      setTeachingLoad(Number(x.AdInstructorLoad) > 0 ? String(x.AdInstructorLoad) : "");
      setInitial(JSON.stringify([
        x.AdInstructorCivil || "", x.AdInstructorName || "", x.AdInstructorMobile || "",
        x.AdInstructorStatus === "retired" || x.AdInstructorStatus === "sabbatical" ? x.AdInstructorStatus : "",
        x.AdInstructorCategory === "ta" ? "ta" : "", Number(x.AdInstructorLoad) > 0 ? String(x.AdInstructorLoad) : "",
      ]));
      setMode("edit");
      setError(null);
    };
  const dirty = mode !== "index" && JSON.stringify([civil, name, mobile, status, category, teachingLoad]) !== initial;
  const onCivil = (value: string) => {
      setCivil(numericText(value).slice(0, 12));
      setError(null);
    },
    validateCivil = () => {
      if (!civil) return;
      const v = validateCivilId(civil);
      if (!v.isValid) {
        // The typed value stays: a reader correcting a civil ID needs to see
        // the digits they entered, not an empty box and a warning.
        setError(
          v.message ||
            "الرقم المدني المدخل لأستاذ المقرر غير صحيح وفقاً لبيانات البطاقة المدنية",
        );
        return;
      }
      if (
        items.some(
          (x) =>
            String(x.AdInstructorCivil || "") === civil &&
            x.AdInstructorId !== editId,
        )
      ) {
        setError("تم التسجيل من قبل");
      }
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!civil || !name.trim()) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    const v = validateCivilId(civil);
    if (!v.isValid) {
      setError(v.message);
      return;
    }
    /* حدُّ النصاب نفسه الذي يرفض به الخادم (academicGuards): يُقال هنا بدل أن يُمحى النصاب. */
    const loadCheck = readInstructorLoad(teachingLoad);
    if ("error" in loadCheck) {
      setError(loadCheck.error);
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(
          mode === "edit" ? `/api/instructors/${editId}` : "/api/instructors",
          {
            method: mode === "edit" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              AdInstructorCivil: civil,
              AdInstructorName: name.trim(),
              AdInstructorMobile: mobile.trim(),
              AdInstructorStatus: status || null,
              AdInstructorCategory: category || null,
              AdInstructorLoad: teachingLoad.trim() ? Number(teachingLoad) : null,
            }),
          },
        ),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حفظ بيانات أستاذ المقرر");
        return;
      }
      await load();
      back();
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };
  const remove = async (person: any) => {
    if (submitting) return;
    const id = Number(person.AdInstructorId);
    if (!(await visualConfirm({ title: `حذف «${person.AdInstructorName}»`, message: `سيُحذف سجل «${person.AdInstructorName}» من النظام. إن كان له أي موعد في الجدول في أي فصل فلن يُحذف — اجعله «متقاعداً» بدلاً من ذلك ليختفي من الإسناد وتبقى بياناته.`, confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/instructors/${id}`, { method: "DELETE" }),
        d = await r.json();
      if (!r.ok) {
        setError(d.error || "فشل حذف بيانات أستاذ المقرر");
        return;
      }
      setSelectedId(null);
      await load();
    } catch {
      setError("تعذّر الاتصال بالخادم، تحقّق من الشبكة وحاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => setVisibleLimit(160), [query]);
  const affiliationOf = (id: number) => affiliations[String(id)] || { delegate: [], teaching: [] };
  /* البطاقة تكتفي بالفصل الأحدث لتبقى القائمة خفيفة، أما البطاقة المفتوحة
     فتسأل عن سجل هذا الشخص كله باستعلام واحد على معرّفه. */
  const scopeText = (items: ScopeDetail[]) =>
    items.map(item => [item.section, item.college].filter(Boolean).join(" · ")).filter(Boolean);
  const affiliationLabel = (items: Affiliation[]) =>
    items.map(item => [item.section, item.college].filter(Boolean).join(" · ")).filter(Boolean);
  /* القسم الذي ضمّه يُكتب بجانب الوسم لا في شاشة أخرى: من يقرأ السطر يعرف
     تبعية الاسم فوراً، ومن لا انتساب له يُقال عنه ذلك صراحةً. */
  const homeLabel = (id: number) => {
    const { delegate, teaching } = affiliationOf(id);
    const teach = affiliationLabel(teaching), sent = affiliationLabel(delegate);
    if (teach.length) return `يدرّس في ${teach.join(" ، ")}`;
    if (sent.length) return `منتدب لدى ${sent.join(" ، ")}`;
    return "";
  };
  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      // Only real people belong in the instructors directory. Placeholders
      // remain available in the section's schedule picker, never with civil IDs.
      const realInstructors = items.filter(x => !isFacultyPlaceholder(x));
      /* البحثُ يعبر المجموعات كلَّها: المتقاعدُ مخفيٌّ من القائمة لا من السجل. */
      const base = q
        ? realInstructors.filter((x) =>
            [
              x.AdInstructorCivil,
              x.AdInstructorName,
              x.AdInstructorMobile,
            ].some((v) =>
              String(v || "")
                .toLowerCase()
                .includes(q),
            ),
          )
        : realInstructors.filter(x => rosterGroupOf(x) === group);
      return sortByName(base, (x: any) => x.AdInstructorName);
    }, [items, query, group]),
    groupCounts = useMemo(() => {
      const counts: Record<RosterGroup, number> = { faculty: 0, ta: 0, sabbatical: 0, retired: 0 };
      for (const x of items) if (!isFacultyPlaceholder(x)) counts[rosterGroupOf(x)]++;
      return counts;
    }, [items]),
    selected =
      filtered.find((x) => x.AdInstructorId === selectedId) || filtered[0] || null,
    activeId = selected?.AdInstructorId ?? null;
  /* سجلُّ الشخص المعروض فعلاً (activeId) لا المحفوظ في الاختيار: بعد تبديل المجموعة
     أو البحث قد يُعرض غيرُه، فكانت البطاقة تقول عن شخصٍ ما يخصّ آخر. */
  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    const controller = new AbortController();
    setDetailLoading(true);
    fetch(`/api/instructors/${activeId}/affiliation`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setDetail({ instructorId: Number(d.instructorId), teaching: d.teaching || [], delegate: d.delegate || [] }); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [activeId, detailVersion]);
  const editorDrawer = mode !== "index" ? (
      <CatalogFormDrawer onClose={back} dirty={dirty} label={mode === "create" ? "إنشاء أستاذ جديد" : "تعديل بيانات الأستاذ"}>
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="تحقق الرقم المدني فعّال"
        >
          {mode === "create" ? "تسجيل أستاذ مقرر جديد" : "تعديل بيانات الأستاذ"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <UserRound />
            </span>
            <div>
              <strong>هوية أستاذ المقرر</strong>
              <p>الرقم المدني للتحقق والبحث</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="الرقم المدني" required>
                <input
                  inputMode="numeric"
                  maxLength={12}
                  value={civil}
                  onChange={(e) => onCivil(e.target.value)}
                  onBlur={validateCivil}
                  placeholder="12 رقمًا"
                  aria-label="الرقم المدني"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </Field>
              <Field label="أستاذ المقرر" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="اسم أستاذ المقرر"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="رقم الهاتف">
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={mobile}
                  aria-label="رقم الهاتف"
                  autoComplete="tel"
                  onChange={(e) => {
                    setMobile(numericText(e.target.value).slice(0, 8));
                  }}
                />
              </Field>
              {/* ── النصاب ──────────────────────────────────────────────────
                  الساعاتُ التي يُتوقّع أن يحملها هذا الأستاذ في الفصل. وهو
                  القيدُ الذي كان غائباً حين صار الأستاذُ يطلب مقرّراً بنفسه:
                  لا شيء كان يقول «هذا يتجاوز نصابك» قبل أن يُرسل الطلب.

                  ويبقى اختيارياً: أستاذٌ بلا نصابٍ مسجّل لا يُفرض عليه رقمٌ
                  مخترع، ويُترك القيدُ صامتاً كما كان. */}
              <Field label="النصاب" hint={`اختياري — ساعاتٌ معتمدة حتى ${INSTRUCTOR_LOAD_MAX}. يُترك فارغاً فلا يُقيَّد به أحد.`}>
                <input
                  inputMode="numeric"
                  aria-label="النصاب"
                  value={teachingLoad}
                  placeholder="مثال: 12"
                  onChange={(e) => setTeachingLoad(numericText(e.target.value).slice(0, 2))}
                />
              </Field>
              <Field label="الصفة" hint="تصنيف يدوي، لا يغيّر المواعيد السابقة.">
                <div className="status-choice" role="radiogroup" aria-label="الصفة الأكاديمية" onKeyDown={arrowChoice}>
                  <button type="button" role="radio" data-guide-ignore="تعيين صفة الأستاذ من داخل نموذج تحرير بطاقته فقط" aria-checked={!category} className={!category ? "on" : ""} onClick={() => setCategory("")}>عضو تدريس</button>
                  <button type="button" role="radio" data-guide-ignore="تعيين صفة الأستاذ من داخل نموذج تحرير بطاقته فقط" aria-checked={category === "ta"} className={category === "ta" ? "on" : ""} onClick={() => setCategory("ta")}><GraduationCap aria-hidden="true" /> هيئة تدريب · TA</button>
                </div>
              </Field>
              <Field label="الحالة">
                <div className="status-choice" role="radiogroup" aria-label="حالة الأستاذ" onKeyDown={arrowChoice}>
                  {[
                    { value: "", label: "نشط" },
                    { value: "sabbatical", label: "متفرّغ" },
                    { value: "retired", label: "متقاعد" },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.value || "active"}
                      role="radio"
                      aria-checked={status === opt.value}
                      className={status === opt.value ? "on" : ""}
                      onClick={() => setStatus(opt.value as "" | "retired" | "sabbatical")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            {status ? (
              <p className="smart-term-hint">
                <UserRound aria-hidden="true" />
                {status === "retired" ? "متقاعد" : "متفرّغ"}: يبقى في السجل ويحتفظ بمواعيده السابقة، لكن لا يظهر عند إسناد مواعيد جديدة.{status === "retired" ? ` ${mode === "create" ? "ويُحفظ" : "ويُنقل بعد الحفظ"} في تبويب «المتقاعدون»، وبياناته باقية.` : ""}
              </p>
            ) : null}
            {mode === "edit" && editId ? <VisitingConversionPanel instructorId={Number(editId)} onChanged={() => { loadAffiliations(); setDetailVersion(n => n + 1); }} /> : null}
            <FormActions
              onBack={back}
              loading={loading || submitting}
              submitLabel={mode === "create" ? "إضافة الأستاذ" : "حفظ التعديلات"}
            />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  return (
    <div className={`content-stack library-page catalog-inspector-page visual-minimal ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={create}>إضافة أستاذ</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="الدليل الأكاديمي"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={create}>إضافة أستاذ</AddButton>}
        >
          أساتذة المقررات
        </PageTitle>
      )}
      {error && mode === "index" ? <Notice action={loadFailed ? <SecondaryButton data-guide-ignore="يعيد قراءة القائمة بعد تعذّرها؛ لا يكتب شيئاً" onClick={() => { setError(null); void load(); }}>إعادة المحاولة</SecondaryButton> : undefined}>{error}</Notice> : null}
      <div className="catalog-workspace" aria-busy={loading}>
        <Surface className="catalog-master">
          <h2 className="sr-only">قائمة أساتذة المقررات</h2>
          <div className="roster-tabs" role="tablist" aria-label="مجموعات الأساتذة" onKeyDown={arrowChoice}>
            {ROSTER_GROUPS.map(entry => {
              const Icon = { faculty: UsersRound, ta: GraduationCap, sabbatical: BookOpenCheck, retired: Archive }[entry.id];
              return (
                <button key={entry.id} type="button" role="tab" aria-selected={group === entry.id} tabIndex={group === entry.id ? 0 : -1} className={group === entry.id ? "on" : ""}
                  onClick={() => setGroup(entry.id)} data-guide-ignore="تصفية قائمة الأساتذة بالمجموعة — لا يغيّر بياناً">
                  <Icon aria-hidden="true" />{entry.label}<b>{groupCounts[entry.id].toLocaleString("ar-KW-u-nu-latn")}</b>
                </button>
              );
            })}
          </div>
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="ابحث بالاسم أو الرقم المدني أو الهاتف"
          />
          {loading ? (
            <SkeletonDeck count={6} />
          ) : filtered.length ? (
            <RecordDeck>
              {filtered.slice(0, visibleLimit).map((x) => (
                <RecordCard
                  key={x.AdInstructorId}
                  onClick={() => setSelectedId(x.AdInstructorId)}
                  className={activeId === x.AdInstructorId ? "selected" : ""}
                  icon={<UserRound />}
                  title={(
                    <>
                      {x.AdInstructorName}
                      {x.AdInstructorCategory === "ta" ? <span className="staff-badge ta-category-badge">TA · هيئة تدريب</span> : null}
                      {x.AdInstructorStatus === "retired" ? <span className="staff-badge is-retired">متقاعد</span>
                        : x.AdInstructorStatus === "sabbatical" ? <span className="staff-badge is-sabbatical">متفرّغ</span> : null}
                      {x.LoadPolicy?.exception ? <ExceptionBadge reason={x.LoadPolicy.exception.reason} /> : null}
                      {delegateIds.has(x.AdInstructorId) ? <span className="instructor-delegate-mark" title={affiliationLabel(affiliationOf(x.AdInstructorId).delegate).join(" ، ") || "قسم الانتداب غير مسجّل"}><VisitingBadge compact /></span> : null}
                      {activeId === x.AdInstructorId ? <span className="sr-only">، محدد</span> : null}
                    </>
                  )}
                  subtitle={homeLabel(x.AdInstructorId) ? <span className="record-home-line" title={homeLabel(x.AdInstructorId)}>{homeLabel(x.AdInstructorId)}</span> : undefined}
                  meta={
                    <>
                      <MetaPill
                        label="رقم الهاتف"
                        value={x.AdInstructorMobile || "لا يوجد رقم هاتف مسجل"}
                        dir={x.AdInstructorMobile ? "ltr" : undefined}
                      />
                      <MetaPill
                        label="الرقم المدني"
                        value={x.AdInstructorCivil}
                        dir="ltr"
                      />
                    </>
                  }
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title={loadFailed ? "تعذّر تحميل الأساتذة" : query ? "لا يوجد أستاذ مطابق" : "لا يوجد أساتذة بعد"}
              detail={loadFailed ? "لم تصل القائمة من الخادم؛ هذا لا يعني أنها فارغة." : query ? "جرّب الاسم أو الرقم المدني أو امسح البحث." : "أضف الأستاذ الأول ليصبح متاحًا عند بناء الجدول."}
              action={loadFailed ? <SecondaryButton data-guide-ignore="يعيد قراءة القائمة بعد تعذّرها؛ لا يكتب شيئاً" onClick={() => { setError(null); void load(); }}>إعادة المحاولة</SecondaryButton> : query ? <SecondaryButton onClick={() => setQuery("")}>مسح البحث</SecondaryButton> : undefined}
            />
          )}
          {filtered.length > visibleLimit ? (
            <div className="catalog-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 160)}>
                عرض المزيد ·{" "}
                {(filtered.length - visibleLimit).toLocaleString("ar-KW-u-nu-latn")} متبقٍ
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
        <aside className="academic-inspector" aria-label="تفاصيل الأستاذ المحدد" aria-live="polite">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <UserRound />
              </div>
              <span className="surface-kicker">تفاصيل الأستاذ</span>
              <h2>{selected.AdInstructorName}{delegateIds.has(selected.AdInstructorId) ? <VisitingBadge compact /> : null}{selected.AdInstructorCategory === "ta" ? <span className="staff-badge ta-category-badge">TA · هيئة تدريب</span> : null}</h2>
              <p>يظهر في الجدول والتقارير.</p>
              <div className="inspector-facts inspector-facts-pairs">
                <article>
                  <span>الرقم المدني</span>
                  <b dir="ltr">{selected.AdInstructorCivil || "—"}</b>
                </article>
                <article>
                  <span>رقم الهاتف</span>
                  <b dir="ltr">{selected.AdInstructorMobile || "—"}</b>
                </article>
                <article>
                  <span>الأقسام التي درّس فيها</span>
                  <b>{detailLoading && detail?.instructorId !== selected.AdInstructorId
                    ? "جارٍ القراءة…"
                    : (scopeText(detail?.instructorId === selected.AdInstructorId ? detail.teaching : []).join(" ، ")
                      || affiliationLabel(affiliationOf(selected.AdInstructorId).teaching).join(" ، ")
                      || "لا جدول مسجّل في أي فصل")}</b>
                </article>
                <article>
                  <span>منتدب لدى</span>
                  <b>{scopeText(detail?.instructorId === selected.AdInstructorId ? detail.delegate : []).join(" ، ")
                    || affiliationLabel(affiliationOf(selected.AdInstructorId).delegate).join(" ، ")
                    || "لا انتداب مسجّل"}</b>
                </article>
              </div>
              {loadAdmin ? <InstructorLoadPanel instructorId={Number(selected.AdInstructorId)} name={selected.AdInstructorName} demoReadOnly={demoReadOnly} onChanged={() => void load()} /> : null}
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                  className="danger-action"
                  onClick={() => remove(selected)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <UserRound />
              <strong>اختر أستاذاً</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
      {editorDrawer}
    </div>
  );
}

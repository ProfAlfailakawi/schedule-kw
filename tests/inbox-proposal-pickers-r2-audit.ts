/**
 * ── منتقيات «وارد رغبات الأساتذة» والمقترح الدراسي (ملاحظات المالك r2) ─────────
 *
 *   P  منتقي الأستاذ: الشخصُ مرّةً واحدة باسمه وحده (وسمُ «منتدب» باقٍ)، وطلباته كلُّها معه.
 *   S  اختيارُه يفتح صورته الكاملة: جدوله في البنين والبنات (سجلّاه يُدمجان بالهوية)،
 *      ووسمُ الموقع على كل موعد، ولا يُعدَّل موعدُ سجلّه الآخر من هذا الطلب.
 *   C  منتقي «شعبة جديدة»: المقررُ مرّةً واحدة (الموقعُ وسمٌ مستقل)، والإملاءان لرقمٍ واحد
 *      سطرٌ واحد، ورقمان مختلفان سطران، و«🆕 صحيفة جديدة» بجانب مقرر الصحيفة الجديدة.
 *   W  الشاشاتُ تبني من هذه القواعد (الوارد، النشر، المساحة، البطاقة السريعة، النموذج الكامل).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-pickers-r2-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false" });

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500)); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

const { proposalLauncherChoices, instructorPickerPeople, personRecordIds } = await import("../src/utils/instructorPickerChoices");
const { campusChips, campusChipOf } = await import("../src/utils/campusChip");
const { foldInstructorText } = await import("../src/utils/instructorIdentity");
const { proposalCourseChoices, proposalCourseScopes, mergedUsedCodes, sameCourseIn, NEW_SHEET_BADGE } = await import("../src/utils/proposalCourseChoices");

const BOYS = "كلية التربية الأساسية - بنين", GIRLS = "كلية التربية الأساسية - بنات";

/* ── P: الشخصُ مرّةً واحدة ─────────────────────────────────────────────── */
{
  const dept = "قسم تكنولوجيا التعليم";
  const rows = [
    { id: "ahmad-g", AdInstructorId: 11, instructorName: "د. أحمد الفيلكاوي", AdCollegeId: 2, AdSectionId: 20, sectionName: dept, requestCollegeName: GIRLS, changedCount: 0 },
    { id: "ahmad-b", AdInstructorId: 12, instructorName: "د. أحمد الفيلكاوي", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS, changedCount: 3 },
    { id: "anwar-g", AdInstructorId: 21, instructorName: "د. أنور عيسى عبدالرحمن الشعيب", AdCollegeId: 2, AdSectionId: 20, sectionName: dept, requestCollegeName: GIRLS },
    { id: "anwar-b", AdInstructorId: 21, instructorName: "د. أنور عيسى عبدالرحمن الشعيب", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS },
    { id: "jaber-g", AdInstructorId: 31, instructorName: "د. جابر المنيفي", AdCollegeId: 2, AdSectionId: 20, sectionName: dept, requestCollegeName: GIRLS },
    { id: "jaber-b", AdInstructorId: 32, instructorName: "د. جابر المنيفى", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS },
    { id: "khaled-g", AdInstructorId: 41, instructorName: "د. خالد الكندري", AdCollegeId: 2, AdSectionId: 20, sectionName: dept, requestCollegeName: GIRLS },
    { id: "khaled-b", AdInstructorId: 41, instructorName: "د. خالد الكندري", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS },
    { id: "haidar-g", AdInstructorId: 51, instructorName: "حيدر فاضل محمد الأمير", AdCollegeId: 2, AdSectionId: 20, sectionName: dept, requestCollegeName: GIRLS, visiting: true },
    { id: "haidar-b", AdInstructorId: 51, instructorName: "حيدر فاضل محمد الأمير", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS, visiting: true },
    { id: "fahad", AdInstructorId: 61, instructorName: "أ. فهد البناي", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS },
    { id: "ph", AdInstructorId: 900, instructorName: "هيئة تدريسية", AdCollegeId: 1, AdSectionId: 10, sectionName: dept, requestCollegeName: BOYS },
  ];
  const choices = proposalLauncherChoices(rows, 1);
  const names = choices.map(choice => choice.name);
  check(choices.length === 6, "P1 ستة أشخاص = ستة أسطر (لا سطرَ لكل كلية، ولا «هيئة تدريسية»)", names);
  const folded = names.map(name => foldInstructorText(name));
  const once = ["أحمد الفيلكاوي", "الشعيب", "المنيفي", "الكندري", "حيدر"].every(part => folded.filter(name => name.includes(foldInstructorText(part))).length === 1);
  check(once, "P2 الفيلكاوي والشعيب والمنيفي والكندري وحيدر: كلٌّ مرّةً واحدة", names);
  check(choices.every(choice => choice.hint === "" && !/قسم|كلية|بنين|بنات|·/.test(choice.name)), "P3 السطرُ اسمُ الشخص وحده — بلا قسمٍ ولا كليةٍ ولا «بنين/بنات»", choices.map(c => [c.name, c.hint]));
  const ahmad = choices.find(choice => choice.name === "د. أحمد الفيلكاوي")!;
  check(ahmad.requests.length === 2 && ahmad.value === "ahmad-b", "P4 سجلّاه (بنين وبنات) طلبان معه، ويُفتح أولاً طلبُ كلية الشاشة", ahmad);
  check(ahmad.requests.map(r => r.campus).sort().join() === ["بنات", "بنين"].sort().join(), "P5 لكل طلبٍ وسمُ موقعه («بنين»/«بنات») — يُرسم داخل المساحة لا في المنتقي", ahmad.requests);
  check(proposalLauncherChoices(rows, 2).find(choice => choice.name === "د. أحمد الفيلكاوي")!.value === "ahmad-g", "P6 ومن شاشة كلية البنات يُفتح طلبُ البنات أولاً");
  const haidar = choices.find(choice => choice.name.startsWith("حيدر"))!;
  check(haidar.visiting === true && haidar.requests.length === 2, "P7 وسمُ «منتدب» باقٍ على خياره");
  check(proposalLauncherChoices([5, 6].map(n => ({ id: `t${n}`, AdInstructorId: n, instructorName: `عضو هيئة تدريس تجريبي ${n}`, AdCollegeId: 1, AdSectionId: 1 }))).length === 2,
    "P8 اسمان يختلفان برقمٍ فقط شخصان");
  const people = instructorPickerPeople([
    { AdInstructorId: 11, AdInstructorName: "د. أحمد الفيلكاوي", AdInstructorMobile: "99001234" },
    { AdInstructorId: 12, AdInstructorName: "د. أحمد الفيلكاوي", AdInstructorMobile: "66005678" },
    { AdInstructorId: 41, AdInstructorName: "د. خالد الكندري" },
  ]);
  check(people.length === 2 && people[0].ids.length + people[1].ids.length === 3 && people.every(p => !/جوال|سجل رقم/.test(p.label)),
    "P9 منتقي «استثناء لأستاذ» في النشر: الشخصُ مرّةً واحدة باسمه، ومعه معرّفاته", people);
  const registry = [
    { AdInstructorId: 11, AdInstructorName: "د. أحمد الفيلكاوي" }, { AdInstructorId: 12, AdInstructorName: "أحمد  الفيلكاوى" },
    { AdInstructorId: 13, AdInstructorName: "د. أحمد الكندري" }, { AdInstructorId: 900, AdInstructorName: "هيئة تدريسية" },
  ];
  check([...personRecordIds(registry, 11)].sort().join() === "11,12", "P10 سجلّاتُ الشخص بالهوية: لا يُضمّ غيرُه ولا «هيئة تدريسية»", [...personRecordIds(registry, 11)]);
  check([...personRecordIds(registry, 900)].join() === "900", "P11 «هيئة تدريسية» لا تُدمج بشيء");
}

/* ── وسمُ الموقع ─────────────────────────────────────────────────────── */
{
  const two = campusChips([BOYS, GIRLS, BOYS]);
  check(two.get(BOYS) === "بنين" && two.get(GIRLS) === "بنات", "K1 «بنين»/«بنات» حين يكفيان", [...two]);
  check(campusChips([BOYS, BOYS]).size === 0, "K2 كليةٌ واحدة: لا وسم يُرسم");
  const three = campusChips([GIRLS, "كلية التربية الأساسية - بنات - الجهراء", "كلية الدراسات التجارية - بنين"]);
  check(new Set(three.values()).size === 3, "K3 موقعان للبنات وكليةٌ أخرى: وسومٌ متمايزة", [...three]);
  check(campusChipOf(BOYS) === "بنين", "K4 وسمُ الاسم الواحد");
}

/* ── C: منتقي «شعبة جديدة» ─────────────────────────────────────────── */
{
  const course = (id: number, code: string, name: string, collegeId: number, sectionId: number, sheet: any) =>
    ({ id, code, name, hours: 3, collegeId, collegeName: collegeId === 1 ? BOYS : GIRLS, sectionId, sheet });
  const catalog = [
    course(1, "108", "أخلاقيات استخدام التكنولوجيا", 1, 10, "old"), course(2, "0109108", "أخلاقيات استخدام التكنولوجيا", 1, 10, "new"),
    course(3, "108", "أخلاقيات استخدام التكنولوجيا", 2, 20, "old"), course(4, "0109108", "أخلاقيات استخدام التكنولوجيا", 2, 20, "new"),
    course(5, "453", "إدارة مراكز مصادر التعلم", 1, 10, "old"), course(6, "0109453", "ادارة مراكز مصادر التعلم", 1, 10, "old"),
    course(7, "458", "اداره مراكز مصادر التعلم", 1, 10, "new"), course(8, "458", "اداره مراكز مصادر التعلم", 2, 20, "new"),
    course(9, "275", "أساليب تقويم التقنيات", 1, 10, null),
  ];
  const before = catalog.map(c => `${c.code.slice(-3)} · ${c.name}`);
  check(before.filter(line => line.startsWith("108")).length === 4, "C0 (الحال قبل) «108» أربع مرّات في الكتالوج الخام");
  const scopes = proposalCourseScopes(catalog, { collegeId: 2, sectionId: 20 });
  check(scopes.length === 2 && scopes[0].collegeId === 2 && scopes.map(s => s.label).join() === "بنات,بنين", "C1 الموقعان وسمان، وموقعُ الطلب أولاً", scopes);
  const boys = proposalCourseChoices(catalog, { collegeId: 1, sectionId: 10 }, { "1": [501, 502], "2": [] });
  const lines = boys.map(choice => `${choice.code} · ${choice.name}`);
  check(new Set(lines).size === lines.length && boys.length === 4, "C2 كلُّ مقررٍ مرّةً واحدة في الموقع", lines);
  check(boys.filter(c => c.code === "108").length === 1 && boys.filter(c => c.code === "453").length === 1 && boys.filter(c => c.code === "458").length === 1,
    "C3 «108» مرّة، و«453 إدارة…» و«458 اداره…» رقمان مختلفان: كلٌّ مرّةً واحدة", lines);
  const ethics = boys.find(c => c.code === "108")!;
  check(ethics.id === 1 && ethics.memberIds.join() === "1,2", "C4 الممثِّل ما نزلت منه شعبُ الفصل، وسجلّاه معه", ethics);
  check(boys.find(c => c.code === "458")!.isNew === true && !ethics.isNew && !boys.find(c => c.code === "453")!.isNew && !boys.find(c => c.code === "275")!.isNew,
    "C5 «🆕 صحيفة جديدة» لمقرر الصحيفة الجديدة وحدها", boys.map(c => [c.code, c.isNew]));
  check(NEW_SHEET_BADGE === "🆕 صحيفة جديدة", "C6 نصُّ الوسم كما طلبه المالك");
  const merged = mergedUsedCodes(boys, { "1": [501], "2": [502] });
  check(merged["1"].sort().join() === "501,502", "C7 رقمُ الشعبة المقترح يقرأ شعبَ السجلّين معاً", merged);
  check(sameCourseIn(catalog, 2, { collegeId: 2, sectionId: 20 }) === 4 || sameCourseIn(catalog, 2, { collegeId: 2, sectionId: 20 }) === 3,
    "C8 تبديلُ الموقع يُبقي المقرر نفسه في الموقع الآخر");
  const girls = proposalCourseChoices(catalog, { collegeId: 2, sectionId: 20 });
  check(girls.length === 2 && girls.every(c => c.memberIds.every(id => catalog.find(x => x.id === id)!.collegeId === 2)), "C9 موقعُ البنات بمقرراته وحدها", girls);
}

/* ── S: الصورة الكاملة على المستودع (وضع التجربة، قاعدة مؤقتة) ─────────── */
{
  const { initDatabase, Repository } = await import("../src/db/repository");
  const { loadWorld, evaluateProposal, gridItem, keyOfRow, ofPerson } = await import("../src/server/studyProposalEngine");
  await initDatabase();
  const boys = await Repository.createCollege("TB2", BOYS);
  const girls = await Repository.createCollege("TG2", GIRLS);
  const sb = await Repository.createSection(Number(boys.AdCollegeId), "R2T", "تكنولوجيا التعليم");
  const sg = await Repository.createSection(Number(girls.AdCollegeId), "R2T", "تكنولوجيا التعليم");
  const term = (await Repository.getTerms())[0] || await Repository.createTerm("فصل اختبار");
  const a = await Repository.createInstructor("300010100122", "د. اختبار الفيلكاوي", "99000001");
  const b = await Repository.createInstructor("300123100006", "د. اختبار الفيلكاوى", "99000002");
  /* أرقامٌ مدنية وهمية معلنة (tests/student-journey-audit.ts)، والثالث غيرُ صالحٍ عمداً. */
  const other = await Repository.createInstructor("300000000003", "د. اختبار الكندري", "99000003");
  const cb = await Repository.createCourse(Number(boys.AdCollegeId), Number(sb.AdSectionId), "0109108", "أخلاقيات استخدام التكنولوجيا", 3, 3, 30, false);
  const cg = await Repository.createCourse(Number(girls.AdCollegeId), Number(sg.AdSectionId), "0109108", "أخلاقيات استخدام التكنولوجيا", 3, 3, 30, false);
  const row = (collegeId: number, sectionId: number, courseId: number, instructorId: number, day: string, start: string, end: string, scode: string) => Repository.createSchedule({
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: Number(term.AdTermId), AdCourseId: courseId, SCode: scode, AdInstructorId: instructorId,
    fsunday: day === "fsunday", fmonday: day === "fmonday", ftuesday: day === "ftuesday", fwednesday: day === "fwednesday", fthursday: day === "fthursday",
    fstarttime: start, fendtime: end, AdRoomCode: "", AdRoomHall: "",
  } as any);
  const rb = await row(Number(boys.AdCollegeId), Number(sb.AdSectionId), Number(cb.AdCourseId), Number(a.AdInstructorId), "fsunday", "08:00", "08:50", "901");
  const rg = await row(Number(girls.AdCollegeId), Number(sg.AdSectionId), Number(cg.AdCourseId), Number(b.AdInstructorId), "fmonday", "10:00", "10:50", "902");
  const ro = await row(Number(girls.AdCollegeId), Number(sg.AdSectionId), Number(cg.AdCourseId), Number(other.AdInstructorId), "fmonday", "12:00", "12:50", "903");
  const world = await loadWorld(Number(term.AdTermId), Number(a.AdInstructorId));
  check(world.personIds.has(Number(a.AdInstructorId)) && world.personIds.has(Number(b.AdInstructorId)) && !world.personIds.has(Number(other.AdInstructorId)),
    "S1 سجلّا الشخص (بنين وبنات) يُدمجان بالهوية، وغيرُه لا", [...world.personIds]);
  const mine = world.termRows.filter(r => ofPerson(world, r)).map(r => Number(r.id));
  check(mine.includes(Number(rb.id)) && mine.includes(Number(rg.id)) && !mine.includes(Number(ro.id)), "S2 جدولُه الكامل: موعدُ البنين وموعدُ البنات معاً", mine);
  const deps = { scheduleConflicts: async () => [], scheduleLockRefusal: async () => null, canWrite: () => true, canSee: () => true } as any;
  const twinItem = gridItem(rg as any, world, deps, null, { state: "current", key: keyOfRow(Number(rg.id)) });
  const ownItem = gridItem(rb as any, world, deps, null, { state: "current", key: keyOfRow(Number(rb.id)) });
  check(twinItem.twin === true && !ownItem.twin && twinItem.collegeName === GIRLS && ownItem.collegeName === BOYS,
    "S3 موعدُ سجلّه الآخر يحمل وسمَ الموقع ولا يُعدَّل من هذا الطلب", { twinItem, ownItem });
  const evaluation = await evaluateProposal(deps, null, {
    instructorId: Number(a.AdInstructorId), termId: Number(term.AdTermId), collegeId: Number(boys.AdCollegeId), sectionId: Number(sb.AdSectionId),
    ops: [{ id: "op1", kind: "create", target: {
      AdCollegeId: Number(boys.AdCollegeId), AdSectionId: Number(sb.AdSectionId), AdCourseId: Number(cb.AdCourseId), courseName: "أخلاقيات استخدام التكنولوجيا",
      courseCode: "108", SCode: "911", days: ["fmonday"], fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "", AdRoomHall: "", locationStatus: "PENDING_ROOM", buildingId: "09",
    } } as any],
  }, world);
  const keys = evaluation.before.items.map(item => item.key);
  check(keys.includes(keyOfRow(Number(rb.id))) && keys.includes(keyOfRow(Number(rg.id))), "S4 الفحصُ يرسم جدوله الكامل قبل المقترح وبعده", keys);
  check(evaluation.findings.some(f => f.code === "person-twin"), "S5 محاضرةٌ جديدة في وقت موعده بالبنات تُقال للمراجعة", { codes: evaluation.findings.map(f => f.code), why: evaluation.incompleteReasons, issues: evaluation.opIssues, after: evaluation.after.items.map(i => i.key) });
  /* موعدُه الآخر في قسمٍ خارج نطاق المستخدم: التداخلُ يُقال، بلا مقرّرٍ ولا شعبةٍ ولا كلية. */
  const narrowDeps = { ...deps, canSee: (_req: unknown, collegeId: number) => collegeId === Number(boys.AdCollegeId) };
  const narrow = await evaluateProposal(narrowDeps, null, {
    instructorId: Number(a.AdInstructorId), termId: Number(term.AdTermId), collegeId: Number(boys.AdCollegeId), sectionId: Number(sb.AdSectionId),
    ops: [{ id: "op1", kind: "create", target: {
      AdCollegeId: Number(boys.AdCollegeId), AdSectionId: Number(sb.AdSectionId), AdCourseId: Number(cb.AdCourseId), courseName: "أخلاقيات استخدام التكنولوجيا",
      courseCode: "108", SCode: "911", days: ["fmonday"], fstarttime: "10:00", fendtime: "10:50", AdRoomCode: "", AdRoomHall: "", locationStatus: "PENDING_ROOM", buildingId: "09",
    } } as any],
  }, world);
  const hidden = narrow.findings.find(f => f.code === "person-twin");
  check(hidden && !/أخلاقيات|902|بنات|كلية/.test(`${hidden.title} ${hidden.detail}`),
    "S5b خارج النطاق: التداخلُ يُقال بلا اسم المقرر ولا الشعبة ولا الكلية", hidden);
  check(evaluation.before.metrics.sections === 2, "S6 النصابُ وعددُ الشعب للشخص كلّه", evaluation.before.metrics);
}

/* ── W: الشاشاتُ تبني من هذه القواعد ─────────────────────────────────── */
{
  const parts = read("src/components/proposal/ProposalInboxParts.tsx");
  /* الخيارُ اسمُ الشخص ثم وسماه الموحّدان (PersonChips): «منتدب» ثم «🎓 تدريب» — لا قسمَ ولا كليةَ ولا جوال. */
  check(/label: choice\.name, keywords: withPersonSuffix\(choice\.name, choice\.visiting, choice\.trainee\), chips: <PersonChips visiting=\{choice\.visiting\} trainee=\{choice\.trainee\} \/>/.test(parts) && !/choice\.hint \?/.test(parts), "W1 خيارُ المنتقي: الاسمُ ووسما المنتدب والتدريب فقط");
  check(/siblings: person && person\.requests\.length > 1/.test(parts), "W2 اختيارُه يُرفق طلباته كلَّها بالمساحة");
  const inbox = read("src/components/InstructorInbox.tsx");
  check(/proposalLauncherChoices\(launcherRows, collegeId\)/.test(inbox) && /siblings=\{workspace\.siblings\}/.test(inbox) && /key=\{workspace\.requestId\}/.test(inbox),
    "W3 الوارد: المصدرُ نفسه للمنتقي ولبطاقة الطلب، والمساحةُ تتنقّل بين طلباته");
  const header = read("src/components/proposal/ProposalHeader.tsx");
  check(/className="sp-person-requests"/.test(header) && /entry\.campus/.test(header), "W4 رأسُ المساحة: وسمٌ لكل طلبٍ من طلباته");
  const grid = read("src/components/proposal/ProposalWeekGrid.tsx");
  check((grid.match(/<CampusChip item=\{/g) || []).length >= 3, "W5 وسمُ الموقع على كل موعد (الأسبوع واليوم والتفاصيل)");
  const ws = read("src/components/proposal/StudyProposalWorkspace.tsx"), form = read("src/components/proposal/ProposalOpForm.tsx");
  check(/!item\.twin && item\.rowId > 0/.test(ws) && /!item\.outside && !item\.twin/.test(form), "W6 موعدُ سجلّه الآخر لا يُعدَّل ولا يُستبدل من هنا");
  const routes = read("src/server/studyProposalRoutes.ts");
  check(/const instructorRows = world\.termRows\.filter\(row => ofPerson\(world, row\)\)/.test(routes) && /sheet: sheetTagOf\(/.test(routes), "W7 سياقُ المساحة: جدولُه الكامل ووسمُ الصحيفة لكل مقرر");
  const quick = read("src/components/proposal/ProposalQuickCard.tsx");
  check(/<ProposalCoursePicker ws=\{ws\}/.test(quick) && !/courses\.map\(c => <option/.test(quick), "W8 البطاقة السريعة: منتقي المقرر بلا تكرار");
  check(/<ProposalCoursePicker ws=\{ws\}/.test(form) && !/courses\.map\(c => <option/.test(form), "W9 والنموذج الكامل كذلك");
  const publish = read("src/components/SchedulePublish.tsx");
  check(/instructorPickerPeople\(manageFaculty\)/.test(publish) && /for \(const id of personIds\)/.test(publish), "W10 النشر: الاستثناءُ يقع على كل سجلّات الشخص");
}

console.log(`\ninbox-proposal-pickers-r2 audit: ${passed} passed, ${failed} failed`);
fs.rmSync(privateDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

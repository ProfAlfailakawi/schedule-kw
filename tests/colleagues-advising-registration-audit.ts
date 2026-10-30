/**
 * ── «زميلان يعملان الآن» للإرشاد والتسجيل (src/utils/teamWork.ts · src/server/teamPresence.ts) ──
 *
 *  P1  بلا خادم: «أعمل على…» يُقرأ بحذر، والتقاءُ اثنين على الشيء نفسه لكل نوع (طلب شعبة،
 *      مقاعد مقرر، حالة طالب)، وما يصل من الخادم يُنظَّف ويُرتَّب بالأحدث نشاطاً.
 *  P2  بلا خادم: الحضورُ محصورٌ في الفريق والنطاق — فريقٌ آخر، قسمٌ آخر، فصلٌ آخر، صندوقُ عرضٍ آخر
 *      لا يُرى؛ وأنا لا أرى نفسي؛ ولسانان لشخصٍ واحد واحد؛ وعضوا فريقٍ بحسابٍ مشترك اثنان.
 *  P3  بلا خادم: سبعةُ زملاء معاً يُذكرون كلُّهم بالأحدث نشاطاً، و«أعمل على…» ينتهي بعد دقيقتين
 *      بلا لمسة، والغائبُ عن شاشته يُعلَّم.
 *  P4  بلا خادم: «ينام حين يكون وحده» — النبضةُ وحيداً كما كانت، وأسرعُ مع رفقة، ولا شيء نائماً.
 *  P5  بلا خادم: ساعةُ التغيير لكل كليةٍ وفصل، والصندوقُ يسمع الحقيقيَّ وما يخصّه.
 *  P6  بلا خادم: ختمُ الإصدار يُقرأ بحذر، وختمُ قرار الحالة كلها.
 *  P7  الشارةُ نفسها لكل الفرق: حتى خمسة وجوه ثم «+٢»، والقائمةُ بالجميع وما يعمل عليه كلٌّ منهم.
 *  H1–H5 خادمٌ حيّ (تجربة): الزميلُ يُرى في فريقه ونطاقه وحدهما، والكتابةُ القديمة تُردّ بـ«حدّث ثم أعد»
 *      في طلبات الشعب ومقاعد المرشد وقرارات الكشف، والحفظُ يُعلَن في نبضة النطاق.
 *  S1  ساكن: الشاشاتُ موصولة، والنبضةُ بلا قاعدة بيانات، والتنبيهُ بلا أزرار.
 */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import {
  orderPeers, parseWorkMark, readPeers, workClashes, workText, TEAM_HOLD_TTL_MS, type TeamPeer,
} from "../src/utils/teamWork";
import {
  createScopedClock, peerIdOf, sweepTeamEntries, teamCompany, teamOf, teamRoster, teamScopeKey, touchTeamEntry, type TeamEntry,
} from "../src/server/teamPresence";
import { pulseDelay } from "../src/utils/livePulse";
import { caseStampOf, configAfterLoad, expectedRev, expectedStamp, isStaleWrite, STALE_WRITE_CODE } from "../src/utils/staleWrite";
import { ColleagueFaces, ColleaguePresenceChip, MAX_FACES, TeamPresenceChip } from "../src/components/ColleagueFaces";
import { ColleagueWorkNotice } from "../src/components/ColleagueHoldNotice";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};

const now = 1_000_000;
const peer = (over: Partial<TeamPeer>): TeamPeer => ({
  id: "p1", name: "أ. منى", team: "advising", screen: "registration", work: null,
  since: now - 10_000, activeAt: now - 1_000, expiresAt: 0, away: false, ...over,
});

/* ── P1 ── */
{
  check(JSON.stringify(parseWorkMark("sectionRequest", "1:abc12", " إدارة   مراكز ")) === JSON.stringify({ kind: "sectionRequest", id: "1:abc12", label: "إدارة مراكز" }), "P1 «أعمل على…» صحيح: نوعٌ ومعرّفٌ ووصفٌ مطويّ المسافات");
  check(parseWorkMark("schedule", "1", "") === null && parseWorkMark("studentCase", "a b", "") === null && parseWorkMark("studentCase", "<x>", "") === null
    && parseWorkMark("advisorSeats", "x".repeat(81), "") === null && parseWorkMark("advisorSeats", "", "") === null, "P1 نوعٌ مجهول أو معرّفٌ بحروفٍ غير آمنة أو طويل أو فارغ: لا شيء");
  check(parseWorkMark("studentCase", "n1", "ح".repeat(90))!.label.length === 40 && !/[‮]/.test(parseWorkMark("studentCase", "n1", "a‮b")!.label), "P1 الوصفُ أربعون حرفاً بلا محارف اتجاهٍ خفية");

  const working = (kind: any, id: string, over: Partial<TeamPeer> = {}) => peer({ id: `p-${kind}-${id}`, work: { kind, id, label: "" }, expiresAt: now + 60_000, ...over });
  const list = [
    working("sectionRequest", "1:aa"), working("sectionRequest", "1:bb"),
    working("advisorSeats", "44"), working("advisorSeats", "45"),
    working("studentCase", "need-7"), working("studentCase", "need-8"),
    working("studentCase", "need-9", { expiresAt: now - 1 }),
    peer({ id: "screen-only" }),
  ];
  check(workClashes(list, { kind: "sectionRequest", id: "1:aa" }, now).map(p => p.id).join() === "p-sectionRequest-1:aa", "P1 طلبُ الشعبة نفسه يلتقي، وطلبٌ آخر لا");
  check(workClashes(list, { kind: "advisorSeats", id: "44" }, now).map(p => p.id).join() === "p-advisorSeats-44", "P1 مقاعدُ المقرر نفسه تلتقي، ومقرّرٌ آخر لا");
  check(workClashes(list, { kind: "studentCase", id: "need-7" }, now).map(p => p.id).join() === "p-studentCase-need-7", "P1 الطالبُ نفسه يلتقي، وطالبٌ آخر لا");
  check(workClashes(list, { kind: "studentCase", id: "need-9" }, now).length === 0, "P1 «أعمل على…» انتهى: لا التقاء");
  check(workClashes(list, { kind: "advisorSeats", id: "1:aa" }, now).length === 0 && workClashes(list, null, now).length === 0 && workClashes(null, { kind: "studentCase", id: "x" }, now).length === 0,
    "P1 المعرّفُ نفسه في نوعٍ آخر ليس التقاءً، ولا شيء بلا هدف أو بلا زملاء");
  check(workText({ kind: "sectionRequest", id: "1", label: "112" }).text === "طلب شعبة 112" && workText({ kind: "sectionRequest", id: "1", label: "112" }).icon === "📝"
    && workText(null, "radar").text === "رادار التسجيل" && workText(null).text === "كشف التسجيل", "P1 «📝 طلب شعبة 112»، ومن بلا عمل يُقال بشاشته");

  const raw = [
    { id: "a", name: "أ. سارة", team: "advising", screen: "radar", work: { kind: "studentCase", id: "n1", label: "AB12" }, since: 5, activeAt: 900, expiresAt: 2000, away: false, holder: "19", connId: "x" },
    { id: "b", name: "  أ.   خالد ", team: "evil", screen: "elsewhere", work: { kind: "nope", id: "1" }, since: 1, activeAt: 950, expiresAt: 3000 },
    { name: "بلا معرّف" }, "junk", null,
  ];
  const read = readPeers(raw, 100);
  check(read.length === 2 && read[0].id === "b" && read[1].id === "a", "P1 ما يصل يُرتَّب بالأحدث نشاطاً، وما لا معرّفَ له يُسقط", read);
  check(read[1].expiresAt === 1900 && read[1].activeAt === 800 && read[0].name === "أ. خالد" && read[0].team === "committee" && read[0].screen === "registration" && read[0].work === null && read[0].expiresAt === 0,
    "P1 الوقتُ بساعة المتصفّح، والفريقُ والشاشةُ والعملُ المجهولة تُحمل على الآمن", read);
  check(!("holder" in (read[1] as any)) && !("connId" in (read[1] as any)), "P1 حقولٌ معروفة وحدها: لا holder ولا connId");
}

/* ── P2 ── */
const entries = new Map<string, TeamEntry>();
const key = (team: any, c = 1, s = 1, t = 1, demo = "") => teamScopeKey(demo, team, c, s, t);
const touch = (connId: string, holder: string, name: string, team: any, scopeKey: string, work: any = null, active = true, at = now) =>
  touchTeamEntry(entries, { connId, holder, name, team, scopeKey, screen: "registration", work, active }, at);
{
  check(teamOf({ Role: "registrarStaff" }) === "registration" && teamOf({ Role: "collegeRegistrar" }) === "registration" && teamOf({ Role: "advisor" }) === "advising"
    && teamOf({ Role: "committeeChair" }) === "committee" && teamOf({ IsAdminUser: true }) === "committee", "P2 الفريقُ من الصفة: التسجيل، والإرشاد، ولجنةُ القسم");
  touch("c1", "19", "أ. مرشد", "advising", key("advising"));
  touch("c2", "21", "أ. الإرشاد العام", "advising", key("advising"), { kind: "sectionRequest", id: "1:aa", label: "112" });
  touch("c3", "14", "أ. موظف التسجيل", "registration", key("registration"));
  touch("c4", "30", "أ. مرشد قسمٍ آخر", "advising", key("advising", 1, 2));
  touch("c5", "31", "أ. مرشد فصلٍ آخر", "advising", key("advising", 1, 1, 2));
  touch("c6", "32", "زائر عرض", "advising", key("advising", 1, 1, 1, "sandbox-x"));
  touch("c7", "21", "أ. الإرشاد العام", "advising", key("advising"), null, true, now - 5_000);
  touch("c8", "40:m1", "عضو أول", "advising", key("advising"));
  touch("c9", "40:m2", "عضو ثانٍ", "advising", key("advising"));
  const seen = teamRoster(entries.values(), key("advising"), "19", now);
  const names = seen.map(p => p.name);
  check(!names.includes("أ. موظف التسجيل"), "P2 فريقُ التسجيل لا يظهر للإرشاد", names);
  check(!names.includes("أ. مرشد قسمٍ آخر") && !names.includes("أ. مرشد فصلٍ آخر") && !names.includes("زائر عرض"), "P2 قسمٌ آخر وفصلٌ آخر وصندوقُ عرضٍ آخر: لا يُرون", names);
  check(!names.includes("أ. مرشد"), "P2 لا أرى نفسي", names);
  check(names.filter(n => n === "أ. الإرشاد العام").length === 1 && seen.find(p => p.name === "أ. الإرشاد العام")?.work?.id === "1:aa", "P2 لسانان لشخصٍ واحد: واحد، بأحدثهما نشاطاً وعمله", seen);
  check(names.includes("عضو أول") && names.includes("عضو ثانٍ"), "P2 عضوا فريقٍ بحسابٍ مشترك: شخصان", names);
  check(seen.every(p => /^p[A-Za-z0-9_-]{12}$/.test(p.id) && !p.id.includes("19") && !("holder" in p)) && peerIdOf("19") === peerIdOf("19") && peerIdOf("19") !== peerIdOf("21"), "P2 معرّفٌ ثابت لا يكشف رقم الحساب", seen.map(p => p.id));
  check(teamRoster(entries.values(), key("registration"), "14", now).length === 0 && teamRoster(entries.values(), key("registration"), "99", now).map(p => p.name).join() === "أ. موظف التسجيل",
    "P2 والتسجيلُ يرى فريقه وحده");
  check(teamRoster(entries.values(), "", "x", now).length === 0, "P2 بلا نطاق: لا أحد");
}

/* ── P3 ── */
{
  const seven = new Map<string, TeamEntry>();
  const names = ["أ. منى", "أ. خالد", "أ. سارة", "أ. فهد", "أ. نورة", "أ. علي", "أ. هيا"];
  names.forEach((name, i) => touchTeamEntry(seven, {
    connId: `k${i}`, holder: `${100 + i}`, name, team: "advising", scopeKey: key("advising"), screen: "registration",
    work: i % 2 ? { kind: "sectionRequest", id: `1:r${i}`, label: `طلب ${i}` } : null, active: true,
  }, now - (7 - i) * 1000));
  const roster = teamRoster(seven.values(), key("advising"), "999", now);
  check(roster.length === 7 && roster.map(p => p.name).join() === [...names].reverse().join(), "P3 سبعةُ زملاء معاً: كلُّهم، الأحدثُ نشاطاً أولاً", roster.map(p => p.name));
  check(teamCompany(roster) === 7, "P3 والرفقةُ سبعة");
  const later = teamRoster(seven.values(), key("advising"), "999", now + TEAM_HOLD_TTL_MS);
  check(later.every(p => p.work === null && p.expiresAt === 0), "P3 «أعمل على…» بلا لمسةٍ دقيقتين: ينتهي، ويبقى الحضور", later.map(p => p.work));
  touchTeamEntry(seven, { connId: "k1", holder: "101", name: "أ. خالد", team: "advising", scopeKey: key("advising"), screen: "registration", work: { kind: "sectionRequest", id: "1:r1", label: "طلب 1" }, active: false }, now + 1000);
  const away = teamRoster(seven.values(), key("advising"), "999", now + 1000).find(p => p.name === "أ. خالد")!;
  check(away.away === true && away.expiresAt === now - 6000 + TEAM_HOLD_TTL_MS, "P3 لسانٌ في الخلفية: غائبٌ عن شاشته، وعدّادُ عمله لا يتجدّد", away);
  const firstSince = seven.get("k3")!.since;
  touchTeamEntry(seven, { connId: "k3", holder: "103", name: "أ. فهد", team: "advising", scopeKey: key("advising"), screen: "registration", work: { kind: "sectionRequest", id: "1:r3", label: "طلب 3" }, active: true }, now + 2000);
  check(seven.get("k3")!.since === firstSince && seven.get("k3")!.workAt === now + 2000, "P3 العملُ نفسه: بدايتُه ثابتة وعدّادُه يتجدّد");
  touchTeamEntry(seven, { connId: "k3", holder: "103", name: "أ. فهد", team: "advising", scopeKey: key("advising"), screen: "registration", work: { kind: "studentCase", id: "n9", label: "" }, active: true }, now + 3000);
  check(seven.get("k3")!.since === now + 3000, "P3 عملٌ جديد يبدأ من الآن");
  sweepTeamEntries(seven, now + 200_000);
  check(seven.size === 0, "P3 من توقّف عن السؤال يُنسى");
}

/* ── P4 ── */
{
  check(pulseDelay("asleep", 3, true) === null && pulseDelay("asleep", 0, false) === null, "P4 لسانٌ نائم لا يسأل أبداً");
  check(pulseDelay("awake", 0, true) === 15_000 && pulseDelay("awake", 0, false) === 15_000, "P4 وحيداً: كل خمس عشرة ثانية كما كان (#280)");
  check(pulseDelay("awake", 2, false) === 15_000, "P4 لوحُ الجدول لا يتغيّر بالرفقة (بثُّه يتولّاها)");
  check(pulseDelay("awake", 2, true) === 8_000, "P4 فريقٌ معه أحد: أسرع، ليظهر «زميلك يعمل الآن» في ثوانٍ");
  check(pulseDelay("drowsy", 5, true) === 60_000, "P4 شاشةٌ بلا لمسة: كل دقيقة مهما كانت الرفقة");
}

/* ── P5 ── */
{
  const clock = createScopedClock(500);
  check(clock.read("", 1, 1) === 500 && clock.read("s1", 1, 1) === 500, "P5 يبدأ من لحظة التشغيل");
  clock.bump("", 1, 1, 900);
  clock.bump("s1", 1, 1, 1200);
  clock.bump("", 2, 1, 2000);
  check(clock.read("", 1, 1) === 900 && clock.read("s1", 1, 1) === 1200 && clock.read("s2", 1, 1) === 900, "P5 الصندوقُ يسمع الحقيقيَّ وما يخصّه، وغيرُه لا يسمعه");
  check(clock.read("", 1, 2) === 500 && clock.read("", 2, 1) === 2000, "P5 كليةٌ أخرى أو فصلٌ آخر: ساعتُه وحدها");
  clock.bump("", 1, 1, 100);
  check(clock.read("", 1, 1) === 900, "P5 وقتٌ أقدم لا يرجع الساعة");
}

/* ── P6 ── */
{
  check(expectedRev(3) === 3 && expectedRev("4") === 4 && expectedRev(0) === 0, "P6 الختمُ رقمٌ أو نصُّ أرقام");
  check(expectedRev(undefined) === null && expectedRev("") === null && expectedRev(-1) === null && expectedRev(1.5) === null && expectedRev("1e3") === null && expectedRev({}) === null, "P6 وما سواه: بلا ختم");
  check(expectedStamp("") === "" && expectedStamp("2026-10-30T10:00:00.000Z") === "2026-10-30T10:00:00.000Z" && expectedStamp(5) === null && expectedStamp("x".repeat(121)) === null, "P6 ختمُ القرار نصٌّ قصير، و\"\" «لم يُقرَّر بعد»");
  check(caseStampOf({ committee: { at: "a" }, registrar: { at: "b" } }) === "a|b" && caseStampOf(null) === "|", "P6 ختمُ الحالة كلها: قرارا اللجنة والتسجيل");
  check(isStaleWrite({ code: STALE_WRITE_CODE }) && !isStaleWrite({ code: "stale" }) && !isStaleWrite(null), "P6 «حدّث ثم أعد» برمزه وحده");
}

/* ── P7 ── */
{
  const people = Array.from({ length: 7 }, (_, i) => ({ id: `id${i}`, name: `أ. زميل ${i}`, icon: "📝", text: `طلب شعبة ${110 + i}`, activeAt: i }));
  const html = renderToStaticMarkup(React.createElement(ColleagueFaces, { people, teamHue: 178, teamLabel: "فريق الإرشاد" }));
  const faces = (html.match(/<i [^>]*style="--hold-hue/g) || []).length;
  check(MAX_FACES === 5 && faces === 5 && /\+2<\/bdi>/.test(html), "P7 سبعةُ زملاء: خمسةُ وجوهٍ ثم «+٢»", { faces });
  check(/7 زملاء/.test(html) && /يعملون الآن/.test(html) && /aria-expanded="false"/.test(html), "P7 «٧ زملاء يعملون الآن»، والقائمةُ مطويةٌ حتى اللمس");
  check(html.indexOf("ز</i>") > -1 && html.indexOf(">أ. زميل 6<") === -1, "P7 الأسماءُ لا تُرسم قبل فتح القائمة (العنوانُ يحملها)");
  check(/title="أ. زميل 6، أ. زميل 5، أ. زميل 4/.test(html), "P7 والترتيبُ بالأحدث نشاطاً");
  const holds = Array.from({ length: 7 }, (_, i) => ({ id: `h${i}`, name: `د. عضو ${i}`, collegeId: 1, sectionId: 1, days: ["fsunday"] as any, start: "10:00", end: "11:15", roomCode: "12", roomHall: String(i), instructorId: 0, courseId: 0, sectionCode: "", editId: 0, expiresAt: now + i }));
  const schedule = renderToStaticMarkup(React.createElement(ColleaguePresenceChip, { holds, collegeId: 1, sectionId: 1 }));
  check((schedule.match(/<i [^>]*style="--hold-hue/g) || []).length === 5 && /\+2<\/bdi>/.test(schedule) && /7 زملاء/.test(schedule), "P7 لجنةُ الجدول تلبس الشارةَ نفسها: خمسةٌ ثم «+٢»");
  const team = renderToStaticMarkup(React.createElement(TeamPresenceChip, { peers: [peer({}), peer({ id: "p2", name: "أ. خالد" })], team: "registration" }));
  check(/--team-hue:262/.test(team) && /زميلان/.test(team) && /يعملان الآن/.test(team), "P7 الإرشادُ والتسجيل: الشارةُ نفسها بلون الفريق");
  check(renderToStaticMarkup(React.createElement(TeamPresenceChip, { peers: [], team: "advising" })) === "", "P7 لا أحد: لا شارة");
  const notice = renderToStaticMarkup(React.createElement(ColleagueWorkNotice, { clashes: [peer({ work: { kind: "studentCase", id: "n1", label: "AB12CD34" }, expiresAt: Date.now() + 90_000 })] }));
  check(/زميلك أ. منى<\/b> يعمل الآن على/.test(notice) && /حالة AB12CD34/.test(notice) && /colleague-hold-ring/.test(notice) && !/<button/.test(notice), "P7 «زميلك أ. منى يعمل الآن على 🎓 حالة …» بالعدّاد، بلا أزرار", notice.slice(0, 300));
}

/* ── D1: التحديثُ الحيّ لا يمحو مسوّدةً لم تُحفظ ── */
{
  const server = { global: 9, fairSplit: true, rev: 4 };
  const draft = { global: 2, fairSplit: false, rev: 3 };
  check(configAfterLoad(draft, server, true) === draft, "D1 مسوّدةُ إعدادٍ عُدّلت: حفظُ زميلٍ وصل حيّاً لا يمحوها، وتبقى بختمها الأصلي (3)");
  check(configAfterLoad(draft, server, false) === server && configAfterLoad(null, server, true) === server, "D1 بلا تعديل (أو أولُ قراءة): ما على الخادم");
  const seats = fs.readFileSync("src/components/AdvisorSeatsPanel.tsx", "utf8");
  check(/setCfg\(current => configAfterLoad\(current, payload\.config, cfgDirty\.current\)\)/.test(seats) && !/setCfg\(\{ \.\.\.cfg/.test(seats) && (seats.match(/editCfg\(\{ \.\.\.cfg/g) || []).length === 4,
    "D1 القراءةُ تمرّ بالقاعدة، وكلُّ تعديلٍ في النموذج يعلّم المسوّدة");
  check(/rev: cfg\.rev \?\? 0/.test(seats) && /draftStale\.current = true; catchStale/.test(seats), "D1 حفظُ المسوّدة يحمل ختمَها هي لا ختمَ آخر قراءة، و«حدّث» بعد ردّها يأخذ ما حفظه الزميل");
  const requests = fs.readFileSync("src/components/sectionRequests/SectionRequestsPanel.tsx", "utf8");
  check(/setModeRev\(current => current \?\? row\.rev\)/.test(requests) && /rev = seenRev/.test(requests) && /let rev: number \| null = seenRev;/.test(requests),
    "D1 قائمةُ الاعتماد أو التسجيل المفتوحة تكتب بختم ما رأيتُه حين فتحتُها، لا بختم البطاقة بعد التحديث الحيّ");
}

/* ── H1–H5: خادمٌ حيّ ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("colleagues-team");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}) => { const r = await call(url, init); let body: any = null; try { body = await r.json(); } catch { /* html */ } return { status: r.status, body }; };
  const as = async (role: string) => (await json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).body?.user?.SystemUserId as number;
  const post = (url: string, body: unknown, method = "POST") => json(url, { method, body: JSON.stringify(body) });
  const pulse = (conn: string, extra = "") => json(`/api/schedules/pulse?conn=${conn}&active=1&college=1&section=1&term=1&team=1&screen=registration${extra}`);

  /* H1 الحضور في الفريق والنطاق */
  await as("committeeChair");
  const first = await pulse("conn-chair", "&workKind=sectionRequest&workId=1:demo&workLabel=112");
  check(first.status === 200 && first.body?.team === "committee" && Array.isArray(first.body?.peers) && first.body.peers.length === 0 && first.body.company === 0, "H1 أولُ من في الفريق: لا أحد معه", first.body);
  await as("standard");
  const second = await pulse("conn-standard");
  const chair = second.body?.peers?.find((p: any) => /رئيس لجنة/.test(p.name));
  check(second.body?.team === "committee" && chair && chair.work?.kind === "sectionRequest" && chair.work?.id === "1:demo" && chair.work?.label === "112" && chair.expiresAt > Date.now() + 100_000,
    "H1 زميلُ الفريق والنطاق يُرى باسمه وبما يعمل عليه، وعدّادُه دقيقتان", second.body);
  check(!("holder" in chair) && !("connId" in chair) && !JSON.stringify(second.body).includes("conn-chair") && second.body.company === 1, "H1 بلا رقم حسابٍ ولا معرّف لسان، والرفقةُ واحد");
  await as("advisor");
  const advising = await pulse("conn-advisor");
  check(advising.body?.team === "advising" && !advising.body?.peers?.some((p: any) => /رئيس لجنة|مستخدم عادي/.test(p.name)), "H1 الإرشادُ لا يرى لجنةَ القسم: فريقٌ آخر", advising.body);
  await as("advisorGeneral");
  const general = await pulse("conn-general", "&workKind=studentCase&workId=need-1&workLabel=AB12");
  check(general.body?.team === "advising" && general.body?.peers?.some((p: any) => /مرشد قسم/.test(p.name)), "H1 مرشدان في القسم والفصل نفسيهما يرى أحدُهما الآخر", general.body);
  await as("registrarStaff");
  const registrar = await pulse("conn-reg");
  check(registrar.body?.team === "registration" && registrar.body?.peers?.length === 0, "H1 التسجيلُ لا يرى الإرشادَ ولا اللجنة", registrar.body);
  const board = await json(`/api/schedules/pulse?conn=conn-board&active=1&college=1&section=1&term=1`);
  check(board.status === 200 && !("peers" in board.body) && !("team" in board.body), "H1 لوحُ الجدول (بلا team) يُجاب كما كان", board.body);

  /* H2 طلبات الشعب: ختمُ الإصدار */
  await as("committeeChair");
  const before = (await pulse("conn-chair")).body?.workedAt;
  const list = await json("/api/section-requests?termId=1");
  const open = (list.body?.rows || []).find((row: any) => row.powers?.committee && (row.stage === "sent" || row.stage === "opened"));
  check(Boolean(open) && Number.isInteger(open.rev), "H2 الطلبُ يُقرأ بختم إصداره", list.body?.rows?.map((r: any) => [r.stage, r.rev, r.powers]));
  if (open) {
    const stale = await post(`/api/section-requests/${encodeURIComponent(open.id)}/decline`, { note: "لا قاعة", rev: open.rev + 7 });
    check(stale.status === 409 && stale.body?.code === STALE_WRITE_CODE && /حدّث ثم أعد/.test(stale.body?.error || ""), "H2 ختمٌ قديم: «حدّث ثم أعد» (409) ولا كتابة", stale.body);
    const still = (await json("/api/section-requests?termId=1")).body?.rows?.find((row: any) => row.id === open.id);
    check(still?.stage === open.stage && still?.rev === open.rev, "H2 والطلبُ كما كان", still?.stage);
    const ok = await post(`/api/section-requests/${encodeURIComponent(open.id)}/decline`, { note: "لا قاعة", rev: open.rev });
    check(ok.status === 200 && ok.body?.rev === open.rev + 1, "H2 الختمُ الصحيح يكتب، والإصدارُ يزيد واحداً", ok.body);
    const again = await post(`/api/section-requests/${encodeURIComponent(open.id)}/withdraw`, { rev: open.rev });
    check(again.status === 409 || again.status === 403, "H2 كتابةٌ ثانية بالختم القديم لا تمرّ", again);
    const after = (await pulse("conn-chair")).body?.workedAt;
    check(Number(after) > Number(before), "H5 الحفظُ يُعلَن في نبضة النطاق (workedAt يزيد)", { before, after });
  }

  /* H3 مقاعد المرشد: ختمُ الإعداد وختمُ الشعبة */
  const seats = await json("/api/advisor-seats?collegeId=1&sectionId=1&termId=1");
  check(seats.status === 200 && Array.isArray(seats.body?.sections), "H3 مقاعدُ المرشد تُقرأ", seats.status);
  const configRev = Number(seats.body?.config?.rev || 0);
  const saved = await post("/api/advisor-seats/config", { collegeId: 1, sectionId: 1, termId: 1, config: { ...seats.body.config, capacityDefault: 30, global: 5 }, rev: configRev }, "PUT");
  check(saved.status === 200 && saved.body?.rev === configRev + 1, "H3 حفظُ الإعداد بختمه يزيد الإصدار", saved.body);
  const staleConfig = await post("/api/advisor-seats/config", { collegeId: 1, sectionId: 1, termId: 1, config: { ...seats.body.config, global: 1 }, rev: configRev }, "PUT");
  check(staleConfig.status === 409 && staleConfig.body?.code === STALE_WRITE_CODE, "H3 إعدادٌ بنسخةٍ قديمة: «حدّث ثم أعد»", staleConfig.body);
  let fresh = await json("/api/advisor-seats?collegeId=1&sectionId=1&termId=1");
  check(fresh.body?.config?.global === 5, "H3 والإعدادُ كما حفظه الأول", fresh.body?.config);
  /* المسؤولُ يعدّل مسوّدةً من نسخةٍ قرأها؛ زميلٌ يحفظ قبله (يصل التحديثُ حيّاً فلا يمسّ المسوّدة)؛
     ثم يحفظ المسؤولُ بختم مسوّدته: يُردّ، ويبقى ما حفظه الزميل. */
  const draftBase = fresh.body.config;
  const colleague = await post("/api/advisor-seats/config", { collegeId: 1, sectionId: 1, termId: 1, config: { ...draftBase, global: 6 }, rev: draftBase.rev }, "PUT");
  const draftSave = await post("/api/advisor-seats/config", { collegeId: 1, sectionId: 1, termId: 1, config: { ...configAfterLoad({ ...draftBase, global: 12 }, colleague.body, true) }, rev: draftBase.rev }, "PUT");
  fresh = await json("/api/advisor-seats?collegeId=1&sectionId=1&termId=1");
  check(colleague.status === 200 && draftSave.status === 409 && draftSave.body?.code === STALE_WRITE_CODE && fresh.body?.config?.global === 6,
    "H3 مسوّدةٌ بقيت بعد حفظ زميل: حفظُها بختمها الأصلي يُردّ بـ«حدّث ثم أعد»، وما حفظه الزميل باقٍ", { colleague: colleague.status, draft: draftSave.body, now: fresh.body?.config });
  const target = (fresh.body?.sections || []).find((s: any) => s.state?.capacity > 0 && s.state?.remaining > 1);
  if (target) {
    const added = await post("/api/advisor-seats/add", { collegeId: 1, sectionId: 1, termId: 1, key: target.key, count: 1, rev: target.rev });
    check(added.status === 200 && added.body?.ok === true && added.body?.rev === target.rev + 1, "H3 «+1» بختمه يُضاف", added.body);
    const staleAdd = await post("/api/advisor-seats/add", { collegeId: 1, sectionId: 1, termId: 1, key: target.key, count: 1, rev: target.rev });
    check(staleAdd.status === 409 && staleAdd.body?.code === STALE_WRITE_CODE, "H3 «+1» على رقمٍ قديم: «حدّث ثم أعد» لا «أضفت»", staleAdd.body);
  } else check(false, "H3 شعبةٌ لها سعة", fresh.body?.sections?.slice(0, 3));

  /* H4 قرارات كشف التسجيل */
  const sheet = await json("/api/student-registration?collegeId=1&sectionId=1&termId=1");
  const row = (sheet.body?.rows || []).find((r: any) => !r.caseLevel && r.courses?.some((c: any) => !c.readOnly && !c.settled && !c.droppedByStudent));
  const course = row?.courses?.find((c: any) => !c.readOnly && !c.settled && !c.droppedByStudent);
  check(Boolean(row && course), "H4 في الكشف مقرّرٌ ينتظر اللجنة", sheet.status);
  if (row && course) {
    const staleState = await post(`/api/student-registration/${row.id}/course-state`, { courseId: course.id, state: "awaiting-registration", expectedAt: "2020-01-01T00:00:00.000Z" });
    check(staleState.status === 409 && staleState.body?.code === STALE_WRITE_CODE, "H4 قرارٌ على حالةٍ لم أرها: «حدّث ثم أعد»", staleState.body);
    const okState = await post(`/api/student-registration/${row.id}/course-state`, { courseId: course.id, state: "awaiting-registration", expectedAt: course.at || "" });
    check(okState.status === 200 && okState.body?.ok === true, "H4 الختمُ الصحيح يكتب", okState.body);
    const late = await post(`/api/student-registration/${row.id}/course-state`, { courseId: course.id, state: "committee-rejected", reasonCode: "other", expectedAt: course.at || "" });
    check(late.status === 409 && late.body?.code === STALE_WRITE_CODE, "H4 زميلٌ قرّر قبلي بختمي القديم: يُردّ ولا يُكتب فوقه", late.body);
    const legacy = await post(`/api/student-registration/${row.id}/course-state`, { courseId: course.id, state: "awaiting-registration" });
    check(legacy.status === 200, "H4 نداءٌ بلا ختم (لسانٌ قديم) يمضي كما كان", legacy.body);
  }
  const graduate = (sheet.body?.rows || []).find((r: any) => r.caseLevel && (r.caseStatus === "pending" || !r.caseStatus));
  if (graduate) {
    const staleCase = await post(`/api/student-registration/${graduate.id}/case-state`, { side: "committee", decision: "approved", expectedStamp: "x|y" });
    check(staleCase.status === 409 && staleCase.body?.code === STALE_WRITE_CODE, "H4 قرارُ الحالة كلها على ختمٍ قديم: «حدّث ثم أعد»", staleCase.body);
    const okCase = await post(`/api/student-registration/${graduate.id}/case-state`, { side: "committee", decision: "approved", expectedStamp: caseStampOf(graduate.caseState) });
    check(okCase.status === 200, "H4 وبختمه الصحيح يكتب", okCase.body);
  }
} catch (error) {
  check(false, "H الخادمُ الحيّ تعثّر", error instanceof Error ? error.stack : error);
} finally {
  await server?.stop();
}

/* ── S1 ── */
{
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const live = read("src/server/routes/scheduleLiveRoutes.ts");
  const pulseRoute = live.slice(live.indexOf('app.get("/api/schedules/pulse"'), live.indexOf('app.post("/api/schedules/pulse"'));
  check(/teamOf\(req\.user\)/.test(pulseRoute) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(pulseRoute) && !/await |Repository\./.test(pulseRoute), "S1 الفريقُ من الصفة، والنطاقُ بالجدار نفسه، والجوابُ من الذاكرة");
  const registration = read("src/components/StudentRegistration.tsx");
  check(/useTeamPlace\(/.test(registration) && /<TeamPresenceChip/.test(registration) && /onLiveSignal\(\["notify", "work"\]/.test(registration) && /expectedAt: course\.at \|\| ""/.test(registration) && /expectedStamp: caseStampOf/.test(registration) && /\{staleToast\}/.test(registration),
    "S1 كشفُ التسجيل: الشارة، والنبضة، والختم، و«حدّث ثم أعد»");
  const requests = read("src/components/sectionRequests/SectionRequestsPanel.tsx");
  check(/<ColleagueWorkNotice clashes=\{clashes\}/.test(requests) && /kind: "sectionRequest"/.test(requests) && /rev \}\)/.test(requests) && /onLiveSignal\(\["notify", "work"\]/.test(requests), "S1 طلباتُ الشعب: التنبيه، والختم، والتحديث الحيّ");
  const seats = read("src/components/AdvisorSeatsPanel.tsx");
  check(/kind: "advisorSeats"/.test(seats) && /rev: seen\?\.rev/.test(seats) && /onLiveSignal\(\["work"\]/.test(seats), "S1 مقاعدُ المرشد: التنبيه، والختم، والتحديث الحيّ");
  const radar = read("src/components/RegistrationRehearsal.tsx");
  check(/screen: "radar"/.test(radar) && /<TeamPresenceChip/.test(radar), "S1 الرادار: الشارة");
  const notice = read("src/components/ColleagueHoldNotice.tsx");
  const faces = read("src/components/ColleagueFaces.tsx");
  check(!/<button\b/.test(notice) && (faces.match(/<button\b/g) || []).length === 1 && /aria-expanded=\{open\}/.test(faces), "S1 التنبيهُ بلا أزرار، والشارةُ زرٌّ واحد يفتح القائمة");
}

console.log(`\n${passed} نجح، ${failed} فشل`);
if (failed) process.exit(1);

/**
 * ── «بطاقة الدخول» في الكراسي (ملاحظتا المالك 5 و6، 2026-10-30) ──────────────
 *
 *  C1  بطاقةٌ واحدة: «المستخدمون» و«الكراسي» يعرضان AccessCard نفسها، لا نسخة ثانية.
 *  C2  عضو الفريق: رابطه ‎/k/…‎ بلا كلمة مرور، وسطرُ «عضو لجنة · القسم»، وملاحظة الأرقام الأربعة.
 *  C3  الشاغل: زر «البطاقة» على «يجلس على الكرسي»؛ اختار كلمته ← الرابط باسم الدخول وحده
 *      والبطاقة تقول ذلك؛ ينتظر اختيارها ← الكلمة الأولى إن كتبها المسؤول، في جزء # فقط.
 *  C4  لا زرّ ميت: الأزرار الأربعة معروضة ولكلٍّ منها معالجه.
 *  C5  الحفظ: ورقة المشاركة على الجوال بملف PNG تُستدعى قبل أي انتظار؛ والكمبيوتر تنزيل؛
 *      والمشاركة المرفوضة تنزل إلى التنزيل؛ والإلغاء لا يُعدّ فشلاً. ولا SVG يُنزَّل بعد اليوم.
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AccessCard from "../src/components/AccessCard";
import SeatLinkCard, { SeatHolderCard } from "../src/components/seats/SeatLinkCard";
import { dataUrlToBlob, drawQr, qrMatrix, saveImage, type QrFactory, type SaveEnv } from "../src/utils/accessCardImage";
import { holderCardModel, memberCardModel, seatCaption } from "../src/utils/seatAccessCard";
import { parseInvitationHash } from "../src/utils/invitationLink";
import qrcode from "../src/utils/qrcodeGenerator";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── C1 ── */
{
  const invitation = read("src/components/AccountInvitation.tsx");
  const link = read("src/components/seats/SeatLinkCard.tsx");
  const panel = read("src/components/seats/SeatPanel.tsx");
  check(invitation.includes('import AccessCard from "./AccessCard"') && invitation.includes("<AccessCard "), "C1 «المستخدمون» تعرض AccessCard");
  check(link.includes('import AccessCard from "../AccessCard"') && link.includes("<AccessCard "), "C1 «الكراسي» تعرض AccessCard نفسها");
  check(!link.includes("seat-link-qr") && !link.includes("qrcodeGenerator"), "C1 لا نافذة QR ثانية في الكراسي");
  check(panel.includes('import "../account-invitation.css"') && read("src/components/seats/SeatsAdmin.tsx").includes('import "../account-invitation.css"'), "C1 أنماط البطاقة تصل الكراسي");
}

/* ── C2 ── */
{
  const card = memberCardModel({ origin: "https://schedule-kw.com/", token: "Tok_en-1", name: "د. شيماء", memberLabel: "عضو لجنة", teamLabel: "لجنة الجدول", seatName: "قسم تكنولوجيا التعليم", withTail: true });
  check(card.url === "https://schedule-kw.com/k/Tok_en-1", "C2 رابط العضو ‎/k/…‎", card.url);
  check(card.caption === "عضو لجنة · قسم تكنولوجيا التعليم", "C2 السطر تحت الاسم: الصفة · الكرسي", card.caption);
  check(card.message.includes(card.url) && card.message.includes("آخر أربعة أرقام") && !/كلمة (المرور|السر)/.test(card.message), "C2 الرسالة: الرابط والأرقام الأربعة، بلا كلمة مرور", card.message);
  check(card.note.includes("لا كلمة مرور") && card.note.includes("آخر أربعة أرقام"), "C2 البطاقة تقول إنها بلا كلمة مرور");
  const html = renderToStaticMarkup(<SeatLinkCard title="د. شيماء" subtitle={card.caption} url={card.url} message={card.message} note={card.note} mobile="99887766" onDone={() => undefined} />);
  check(html.includes("invitation-card") && html.includes("SCHEDULE") && html.includes("د. شيماء") && html.includes("عضو لجنة · قسم تكنولوجيا التعليم"), "C2 بطاقة العضو تُرسم: الرأس والاسم والصفة");
  check(html.includes(`href="${card.url}"`) && html.includes("schedule-kw.com"), "C2 الموقع المعروض يفتح رابطه الشخصي");
  check(html.includes("https://wa.me/96599887766?text="), "C2 جوالٌ معروف: زر واتساب بالرسالة");
  check(html.includes(">تم</button>"), "C2 زر «تم» يغلق");
  check(seatCaption("رئيس تسجيل الكلية", "رئيس تسجيل الكلية — كلية التربية الأساسية") === "رئيس تسجيل الكلية — كلية التربية الأساسية", "C2 الصفة لا تتكرر إن حملها اسم الكرسي");
}

/* ── C3 ── */
{
  const base = { origin: "https://schedule-kw.com", login: "techdept", seatName: "قسم تكنولوجيا التعليم", roleLabel: "رئيس لجنة الجدول", holderName: "د. بدر" };
  /* كلماتُ الاختبار تُولَّد عند التشغيل، فلا كلمةَ مكتوبة في المستودع. */
  const ignored = randomBytes(9).toString("base64url");
  const chosen = holderCardModel({ ...base, mustChangePassword: false, password: ignored });
  check(chosen.url === "https://schedule-kw.com/i/techdept" && !chosen.url.includes("#") && !chosen.message.includes(ignored), "C3 اختار كلمته: الرابط باسم الدخول وحده، وكلمةٌ مكتوبة تُهمَل", chosen);
  check(chosen.note.includes("اختار د. بدر كلمة سرّه بنفسه") && chosen.note.includes("لا تحملها البطاقة"), "C3 البطاقة تقول إنها بلا كلمة مرور ولماذا", chosen.note);
  check(chosen.caption === "رئيس لجنة الجدول · قسم تكنولوجيا التعليم" && chosen.message.includes("اسم الدخول: techdept"), "C3 صفة الشاغل واسم الدخول", chosen);
  const typed = `${randomBytes(9).toString("base64url")}#&`;
  const pending = holderCardModel({ ...base, mustChangePassword: true, password: ` ${typed} ` });
  const hash = new URL(pending.url).hash;
  const parsed = parseInvitationHash(hash);
  check(parsed?.username === base.login && parsed?.password === typed, "C3 ينتظر اختيار كلمته: الأولى في جزء # وحده", pending.url);
  check(new URL(pending.url).pathname === "/" && !new URL(pending.url).search, "C3 الكلمة لا تصل الخادم (لا مسار ولا استعلام)");
  const pendingBlank = holderCardModel({ ...base, mustChangePassword: true });
  check(pendingBlank.url.endsWith("/i/techdept") && pendingBlank.note.includes("ينتظر أن يختار كلمة سرّه"), "C3 بلا كلمة مكتوبة: اسم الدخول وحده، والبطاقة تشرح", pendingBlank);
  const panel = read("src/components/seats/SeatPanel.tsx");
  const holderLine = panel.split("\n").find(line => line.includes('setSheet({ kind: "holderCard" })')) || "";
  check(holderLine.includes('detail.canManage && source === "seat" && detail.holder ? <button') && holderLine.includes('<IdCard aria-hidden="true" /> البطاقة</button>')
    && panel.indexOf(holderLine) > panel.indexOf('className="seat-holder-actions"'), "C3 زر «البطاقة» على «يجلس على الكرسي» لمدير النظام", holderLine);
  check(panel.includes('sheet.kind === "holderCard" && detail.holder ? (') && panel.includes("<SeatHolderCard origin={origin()} seat={detail.seat} holder={detail.holder}"), "C3 الزر يفتح بطاقة الشاغل");
  const seat = { login: "techdept", name: "قسم تكنولوجيا التعليم", roleLabel: "رئيس لجنة الجدول" };
  const htmlChosen = renderToStaticMarkup(<SeatHolderCard origin="https://schedule-kw.com" seat={{ ...seat, mustChangePassword: false }} holder={{ name: "د. بدر" }} />);
  check(htmlChosen.includes("د. بدر") && htmlChosen.includes("رئيس لجنة الجدول · قسم تكنولوجيا التعليم") && htmlChosen.includes("كلمة سرّه بنفسه") && !htmlChosen.includes("<input"), "C3 بطاقة الشاغل تُرسم؛ اختار كلمته: لا حقل كلمة");
  const htmlPending = renderToStaticMarkup(<SeatHolderCard origin="https://schedule-kw.com" seat={{ ...seat, mustChangePassword: true }} holder={{ name: "د. بدر" }} />);
  check(htmlPending.includes("<input") && htmlPending.includes("الكلمة الأولى (اختياري)") && htmlPending.includes("ينتظر أن يختار كلمة سرّه"), "C3 ينتظر اختيار كلمته: حقلٌ اختياري للكلمة الأولى");
  check(!read("src/server/seatsRoutes.ts").match(/holderCard|seat-card-password/), "C3 لا طريق جديد يقرأ كلمة من الخادم");
}

/* ── الفريق لا يُرسم كرسياً (المالك، 2026-10-30): أيقونةُ فريقٍ في التبويب وزرّ «فريقي» والقوائم والشارات ── */
{
  const teamFiles = ["src/components/seats/SeatPanel.tsx", "src/components/seats/SeatsAdmin.tsx", "src/components/seats/SeatDrawer.tsx", "src/components/AdminUsers.tsx", "src/App.tsx"];
  const chairs = teamFiles.filter(file => /\bArmchair\b/.test(read(file)));
  check(chairs.length === 0, "C6 لا أيقونة كرسي (Armchair) في شاشات الفرق", chairs);
  check(/value: "seats", label: "الفرق", icon: <UsersRound \/>/.test(read("src/components/AdminUsers.tsx")), "C6 تبويب «الفرق» بأيقونة فريق");
}

/* ── C4 ── */
{
  const html = renderToStaticMarkup(<AccessCard name="قسم تكنولوجيا التعليم" url="https://schedule-kw.com/#invite=x" message="m" />);
  const actions = ["copy-message", "copy-link", "save-card", "save-qr"];
  check(actions.every(action => html.includes(`data-action="${action}"`)), "C4 الأزرار الأربعة معروضة", html.match(/data-action="[^"]+"/g));
  check(["انسخ الرسالة", "انسخ الرابط", "حفظ البطاقة كصورة", "حفظ QR"].every(label => html.includes(label)), "C4 بأسمائها");
  check(html.includes("أهلًا بكم، هنا تبدأ خطوتكم القادمة") && html.includes("اضغط مطولاً على QR Code لفتح الموقع"), "C4 البطاقة كما في «المستخدمون»");
  const source = read("src/components/AccessCard.tsx");
  const wired: Record<string, RegExp> = {
    "copy-message": /data-action="copy-message"[^>]*onClick=\{\(\) => void copy\("message"\)\}/,
    "copy-link": /data-action="copy-link"[^>]*onClick=\{\(\) => void copy\("link"\)\}/,
    "save-card": /data-action="save-card"[^>]*onClick=\{saveCard\}/,
    "save-qr": /data-action="save-qr"[^>]*onClick=\{saveQr\}/,
  };
  for (const [action, pattern] of Object.entries(wired)) check(pattern.test(source), `C4 «${action}» له معالجه`);
  check(source.includes("saveImage(blob, `${fileStem}.png`") && source.includes("saveImage(blob, `${fileStem}-QR.png`"), "C4 الحفظان يمرّان بـsaveImage");
  check(!/onClick=\{\(\) => (undefined|null)\}/.test(source), "C4 لا معالج فارغ");
  const off = renderToStaticMarkup(<AccessCard name="س" url="https://schedule-kw.com/#invite=x" message="m" ready={false} />);
  check((off.match(/disabled=""/g) || []).length === 4, "C4 قبل اكتمال البيانات: الأربعة معطّلة لا ميتة");
}

/* ── C5 ── */
{
  const png = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
  check(png.type === "image/png" && png.size === 8, "C5 تحويل data: إلى ملف PNG", { type: png.type, size: png.size });

  const fakeEnv = (opts: { touch: boolean; share?: (data: any) => Promise<void>; canShare?: boolean }) => {
    const log: string[] = [];
    const anchors: any[] = [];
    const doc = {
      createElement: (tag: string) => { const el: any = { tag, style: {}, click: () => log.push(`click:${el.download}`), remove: () => log.push("remove") }; anchors.push(el); return el; },
      body: { appendChild: (el: any) => log.push(`append:${el.tag}`) },
    } as unknown as Document;
    const env: SaveEnv = {
      navigator: { share: opts.share as any, canShare: opts.share ? (() => opts.canShare !== false) as any : undefined },
      document: doc, touch: opts.touch,
      createObjectURL: () => { log.push("blob-url"); return "blob:fake"; },
      revokeObjectURL: () => undefined,
    };
    return { env, log, anchors };
  };

  {
    const shared: any[] = [];
    const { env, log } = fakeEnv({ touch: true, share: async data => { shared.push(data); } });
    const pending = saveImage(png, "SCHEDULE-member.png", "د. شيماء", env);
    check(shared.length === 1, "C5 الجوال: ورقة المشاركة تُفتح قبل أي انتظار (اللمسة حيّة)");
    const outcome = await pending;
    const file = shared[0]?.files?.[0];
    check(outcome === "shared" && file instanceof File && file.type === "image/png" && file.name === "SCHEDULE-member.png" && !log.length, "C5 الجوال: ملف PNG في ورقة المشاركة، بلا تنزيل", { outcome, log });
  }
  {
    const { env, log, anchors } = fakeEnv({ touch: false, share: async () => { throw new Error("لا يُستدعى"); } });
    const outcome = await saveImage(png, "SCHEDULE-seat.png", "x", env);
    check(outcome === "downloaded" && log.join(",") === "blob-url,append:a,click:SCHEDULE-seat.png,remove" && anchors[0].href === "blob:fake", "C5 الكمبيوتر: تنزيل PNG من عنصرٍ ملحقٍ بالصفحة", log);
  }
  {
    const { env, log } = fakeEnv({ touch: true, share: async () => { const e = new Error("x"); (e as any).name = "NotAllowedError"; throw e; } });
    check(await saveImage(png, "a.png", "x", env) === "downloaded" && log.includes("click:a.png"), "C5 مشاركة مرفوضة: تنزيلٌ بدلها", log);
  }
  {
    const { env, log } = fakeEnv({ touch: true, share: async () => { const e = new Error("x"); (e as any).name = "AbortError"; throw e; } });
    check(await saveImage(png, "a.png", "x", env) === "cancelled" && !log.length, "C5 أغلق ورقة المشاركة: لا تنزيل ولا خطأ", log);
  }
  {
    const { env, log } = fakeEnv({ touch: true, share: async () => undefined, canShare: false });
    check(await saveImage(png, "a.png", "x", env) === "downloaded" && log.includes("click:a.png"), "C5 متصفحٌ لا يشارك الملفات: تنزيل", log);
  }
  {
    const matrix = qrMatrix(qrcode as unknown as QrFactory, "https://schedule-kw.com/k/Tok_en-1");
    const rects: number[][] = [];
    drawQr({ set fillStyle(_: string) { /* */ }, fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]) } as unknown as CanvasRenderingContext2D, matrix, 500, 605, 200);
    const dark = matrix.flat().filter(Boolean).length;
    check(matrix.length >= 21 && rects.length === dark && rects.every(([x, y, w, h]) => x >= 500 && y >= 605 && x + w <= 700 && y + h <= 805), "C5 الرمز يُرسم من مصفوفته داخل مربعه في البطاقة", { n: matrix.length, dark, rects: rects.length });
  }
  const seatsDir = ["SeatLinkCard.tsx", "SeatPanel.tsx", "SeatsAdmin.tsx"].map(f => read(`src/components/seats/${f}`)).join("\n") + read("src/components/AccessCard.tsx");
  check(!seatsDir.includes("SCHEDULE-link.svg") && !/a\.href = qr\b/.test(seatsDir), "C5 لا تنزيل SVG معلّق (سبب «QR ⬇» الذي لا يعمل)");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

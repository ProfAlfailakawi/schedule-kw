/**
 * ── ملف Excel لكل عدسة ───────────────────────────────────────────────────────
 *
 * زرّ Excel كان يُنزّل قائمة المواعيد نفسها أيّاً كانت العدسة: من يقرأ ميزان
 * الأقسام أو عدالة الحمل يحصل على ملفٍّ لا يشبه ما أمامه. فالعدسات التي تُجيب
 * بشيءٍ غير «قائمة مواعيد» تُخرج جوابها هي: سطرٌ لكل قسم، أو لكل أستاذ، أو لكل قاعة.
 * والقائمة والأسبوع والمصفوفة يبقون على ملف الخادم (بمرشّحات الشاشة وقارئ الطلب).
 *
 * يُبنى الملف على الجهاز من البيانات المعروضة، ولا يحمل رقماً مدنياً.
 */
export type ExportCell = string | number;
export interface ExportSheet { name: string; rows: Array<Record<string, ExportCell>> }

/** اسمُ ملفٍّ مقروء: ما فيه، ثم النطاق، ثم تاريخ الإخراج — بلا حروفٍ يرفضها نظام الملفات. */
export function exportFileName(parts: ReadonlyArray<string | undefined | null>, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${[...parts, day].map(part => String(part || "").trim()).filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 150)}.xlsx`;
}

/** ورقةٌ لا يزيد اسمها عن 31 حرفاً ولا يحمل ما يرفضه Excel. */
export const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "التقرير";

export async function downloadSheets(fileName: string, sheets: ExportSheet[]): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  (workbook as any).Workbook = { Views: [{ RTL: true }] };
  for (const sheet of sheets) {
    const rows = sheet.rows.length ? sheet.rows : [{ "—": "لا بيانات" }];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const headers = Object.keys(rows[0]);
    worksheet["!cols"] = headers.map(header => ({ wch: Math.min(40, Math.max(10, header.length + 4, ...rows.map(row => String(row[header] ?? "").length + 2))) }));
    if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName(sheet.name));
  }
  XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });
}

/* ── أشكال الأوراق: دوالٌّ صرفة تُختبر بلا متصفح ── */

export function balanceSheet(departments: ReadonlyArray<any>, approvalLabel: (sectionId: number) => string): ExportSheet {
  return {
    name: "ميزان الأقسام",
    rows: departments.map(item => ({
      "القسم العلمي": String(item.sectionName || ""),
      "الكلية": String(item.collegeName || ""),
      "الاعتماد": approvalLabel(Number(item.sectionId)),
      "المواعيد": Number(item.rows || 0),
      "الأساتذة": Number(item.instructors || 0),
      "القاعات": Number(item.rooms || 0),
      "القاعات الموثقة": Number(item.verifiedRooms || 0),
      "الصباحي %": Number(item.morningPct || 0),
      "المسائي %": Number(item.eveningPct || 0),
      "العدالة": Number(item.fairness || 0),
      "الجودة": Number(item.quality || 0),
      "الموانع": Number(item.conflicts || 0),
    })),
  };
}

export function fairnessSheet(fairness: { score: number; average: number; rows: ReadonlyArray<{ name: string; hours: number; delta: number }> }): ExportSheet {
  return {
    name: "عدالة الحمل",
    rows: fairness.rows.map(row => ({
      "الأستاذ": row.name,
      "النصاب (ساعات معتمدة)": row.hours,
      "الفرق عن المتوسط": Math.round(row.delta * 10) / 10,
      "متوسط القسم": Math.round(fairness.average * 10) / 10,
      "مؤشر العدالة": fairness.score,
    })),
  };
}

export function instructorSheet(groups: ReadonlyArray<{ name: string; count: number; teaching: number; days: number }>): ExportSheet {
  return { name: "الأساتذة", rows: groups.map(group => ({ "الأستاذ": group.name, "المواعيد": group.count, "النصاب (ساعات معتمدة)": group.teaching, "أيام الحضور": group.days })) };
}

export function timeSheet(slots: ReadonlyArray<{ key: string; count: number; courses: number; instructors: number; rooms: string[]; days: number }>): ExportSheet {
  return { name: "الأوقات", rows: slots.map(slot => ({ "ساعة البداية": slot.key, "المواعيد": slot.count, "المقررات": slot.courses, "الأساتذة": slot.instructors, "الأيام": slot.days, "القاعات": slot.rooms.join("، ") })) };
}

export function roomLoadSheet(rooms: ReadonlyArray<{ name: string; rate: number; usedHours: number; windows: ReadonlyArray<{ day: number; from: number; to: number }> }>, dayLabel: (day: number) => string, clock: (minutes: number) => string): ExportSheet {
  return {
    name: "إشغال القاعات",
    rows: rooms.map(room => ({
      "القاعة": room.name,
      "نسبة الإشغال %": room.rate,
      "ساعات مشغولة": room.usedHours,
      "الفترات المتاحة": room.windows.map(window => `${dayLabel(window.day)} ${clock(window.from)}–${clock(window.to)}`).join("، "),
    })),
  };
}

export function occupancySheet(heat: { days: ReadonlyArray<{ label: string; rate: number; cells: ReadonlyArray<{ hour: number; count: number; rooms: number }> }> }, clock: (minutes: number) => string): ExportSheet {
  return {
    name: "نسبة الإشغال",
    rows: heat.days.flatMap(day => day.cells.map(cell => ({ "اليوم": day.label, "الساعة": `${clock(cell.hour)}–${clock(cell.hour + 60)}`, "المحاضرات": cell.count, "القاعات المشغولة": cell.rooms, "إشغال اليوم %": day.rate }))),
  };
}

export function directorySheets(index: { rooms: ReadonlyArray<{ building: string; hall: string; teachers: ReadonlyMap<number, string> }>; teachers: ReadonlyArray<{ name: string; rooms: ReadonlyMap<string, { building: string; hall: string }> }> }): ExportSheet[] {
  return [
    { name: "حسب القاعة", rows: index.rooms.map(room => ({ "المبنى": room.building, "القاعة": room.hall, "الأساتذة": [...room.teachers.values()].join("، "), "العدد": room.teachers.size })) },
    { name: "حسب الأستاذ", rows: index.teachers.map(teacher => ({ "الأستاذ": teacher.name, "القاعات": [...teacher.rooms.values()].map(room => `${room.building}/${room.hall}`).join("، "), "العدد": teacher.rooms.size })) },
  ];
}

export function courseRoomSheet(items: ReadonlyArray<{ course: string; code: string; section: string; room: string; wanted: string; actual: string; teacher: string }>): ExportSheet {
  return { name: "المقررات × القاعات", rows: items.map(item => ({ "رمز المقرر": item.code, "المقرر": item.course, "الشعبة": item.section, "القاعة": item.room, "نوع المقرر": item.wanted, "نوع القاعة": item.actual, "الأستاذ": item.teacher })) };
}

export function visitingSheet(groups: ReadonlyArray<{ name: string; courses: number; sections: number; hours: number; places: string }>): ExportSheet {
  return { name: "المنتدبون", rows: groups.map(group => ({ "المنتدب": group.name, "المقررات": group.courses, "الشعب": group.sections, "الساعات الأسبوعية": group.hours, "مواقع التدريس": group.places })) };
}

export function visitingHistorySheet(terms: ReadonlyArray<{ termId: number; termName: string }>, people: ReadonlyArray<{ name: string; times: number; sections: number; listedNow?: boolean; terms: ReadonlyArray<{ termId: number; sections?: number }> }>): ExportSheet {
  return {
    name: "المنتدبون عبر الفصول",
    rows: people.map(person => {
      const byTerm = new Map(person.terms.map(term => [Number(term.termId), Number(term.sections || 0)]));
      const row: Record<string, ExportCell> = { "المنتدب": person.name, "فصول الانتداب": person.times, "إجمالي الشعب": person.sections, "في دليل القسم الآن": person.listedNow === false ? "لا" : "نعم" };
      for (const term of terms) row[term.termName] = byTerm.get(Number(term.termId)) || 0;
      return row;
    }),
  };
}

export function courseLoadSheet(people: ReadonlyArray<{ instructorName: string; courseCount: number; sectionCount: number; sites: ReadonlyArray<{ siteName: string; courseCount: number; sectionCount: number }> }>): ExportSheet {
  return { name: "المواد × المواقع", rows: people.flatMap(person => person.sites.map(site => ({ "الأستاذ": person.instructorName, "الموقع": site.siteName, "المواد في الموقع": site.courseCount, "الشعب في الموقع": site.sectionCount, "مجموع المواد": person.courseCount, "مجموع الشعب": person.sectionCount }))) };
}

# قواعد ثابتة لمن يعمل على هذا المشروع

اقرأ README.md أولاً. وهذه قواعد قرّرها مالك النظام، ولا تُغيَّر إلا بطلبه الصريح.

## رقم المقرر: سبع خانات فقط

- ⚠️ رقم المقرر المعتمد هو رقم الهيئة الكامل بسبع خانات: الكلية (2) ثم القسم (2) ثم المقرر نفسه (3).
  مثال: `01` + `09` + `105` = `0109105`.
- الكتالوج يحفظ غالباً الخانات الثلاث وحدها (`105`). فلا تعرض `CourseCode` ولا `CourseCodeSnapshot` مباشرةً في تقرير أو استعلام أو ملف Excel، ولا تعرض `AdCourseId` أبداً، فهو رقم داخلي للنظام.
- ابنِ الرقم دائماً بـ `authorityCourseCode(الرمز المخزَّن, authorityDepartmentCode(AdCollegeCode, AdSectionCode))` من `src/utils/authorityAcademicCodes.ts`. وفي شاشة الاستعلامات استعمل `courseNumberOf`.
- يحرس القاعدة `npm run test:course-number-seven-digit`.

## التقارير المطبوعة

- تصميم التقارير المطبوعة لا يُمسّ. الإصلاح يكون في البيانات والقيم المعروضة، لا في الشكل.
- تعديلٌ بصري لا بد منه يُقاس على PDF مطبوع من Chrome (A4 أفقي) قبل الدمج.

---

# Standing rules for anyone working on this project

- **Course numbers are 7 digits only**: college (2) + department (2) + course (3), e.g. `0109105`. The catalogue usually stores only the last 3 digits, so never render `CourseCode`/`CourseCodeSnapshot` directly and never render `AdCourseId`. Use `authorityCourseCode()` with the department key from `authorityDepartmentCode()`. Guarded by `npm run test:course-number-seven-digit`.
- **Printed reports keep their design**: fix data, not layout; measure any unavoidable layout change on a Chrome-printed A4 landscape PDF before merging.

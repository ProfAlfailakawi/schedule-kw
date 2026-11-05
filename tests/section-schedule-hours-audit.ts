import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/SectionScheduleHours.tsx", "utf8");
assert(source.includes("const loadCollege=async(id:number,preserveSelection=false)"), "reload can preserve the selected departments");
assert(source.includes("if(!preserveSelection){setSelected([]);setStartTime(SCHEDULE_DAY_START_TIME);setEndTime(SCHEDULE_DAY_END_TIME);}"), "initial load still clears old selection and uses the default window");
assert(source.includes("await loadCollege(collegeId,true)"), "save reloads with the edited departments selected");
assert(source.includes("setSections(data.sections||[])"), "the selected fields are refreshed from the saved server values");
console.log("✓ saving department hours keeps the departments selected and displays the saved values");

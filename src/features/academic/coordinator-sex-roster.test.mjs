import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "@babel/parser";

const source = readFileSync(new URL("./live-academic-data.js", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module" });
const projection = ast.program.body.find((node) =>
  node.type === "FunctionDeclaration" && node.id.name === "projectStudentsFromAuthorizedRosters");
assert.ok(projection, "Coordinator authorized roster projector exists");

test("Coordinator roster carries only supported sex values from its protected snapshot", () => {
  const map = runInNewContext(`(${source.slice(projection.start, projection.end)})`, {
    displayYear: (year) => `${year} Year`,
  });
  const blocks = [{ id: "block-one", program_code: "BSIT", curriculum_code: "P8F26-BSIT-V1", year_level: 3 }];
  const students = map([{ blockId: "block-one", students: [
    { student_id: "1", student_number: "26-50001", full_name: "Juan Miguel Santos Jr.", sex: "Male" },
    { student_id: "2", student_number: "26-50002", full_name: "Maria Luisa Reyes", sex: "Female" },
    { student_id: "3", student_number: "26-50003", full_name: "Ana Gabriela Cruz", sex: null },
    { student_id: "4", student_number: "26-50004", full_name: "Nina Mercado", sex: "Unknown" },
  ] }], blocks);
  assert.equal(students[0].sex, "Male");
  assert.equal(students[1].sex, "Female");
  assert.equal(students[2].sex, null);
  assert.equal(students[3].sex, null);
  const ui = readFileSync(new URL("../../components/academic-coordinator/AcademicCoordinatorSectionsSchedules.js", import.meta.url), "utf8");
  assert.match(ui, /studentOf\(item\)\?\.sex \|\| "Not available"/);
  assert.match(source, /sex: person\.sex/);
  assert.doesNotMatch(source, /from\("app_users"\)/);
});

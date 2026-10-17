import { supabase } from "@/lib/supabase/client";
import { getLiveSession } from "@/lib/auth/live-auth";

// Only the Coordinator explicitly opted into this database-backed synthetic
// preview. Never merge these fictional people and approvals into official data.
const GROUPS = [
  "academicCoordinatorCatalog.departments",
  "academicCoordinatorCatalog.programs",
  "academicCoordinatorCatalog.subjects",
  "academicCoordinatorCatalog.sections",
  "academicCoordinatorCurricula",
  "blockPlanning.terms",
  "blockPlanning.colleges",
  "blockPlanning.programs",
  "blockPlanning.curricula",
  "blockPlanning.subjects",
  "blockPlanning.blockSections",
  "blockPlanning.students",
  "blockPlanning.assignments",
  "blockPlanning.subjectClasses",
  "blockPlanning.classMeetings",
  "blockPlanning.professors",
  "blockPlanning.rooms",
];
const PAGE_LIMIT = 500;
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const SEMESTERS = ["First Semester", "Second Semester"];

async function fetchGroup(group) {
  const output = [];
  let after = "";
  while (true) {
    const { data, error } = await supabase.rpc("coordinator_synthetic_fixture_page", {
      p_group: group,
      p_after_key: after,
      p_limit: PAGE_LIMIT,
    });
    if (error) throw new Error(`Unable to retrieve the protected demo dataset (${group}).`);
    if (!Array.isArray(data)) throw new Error("Synthetic dataset response is invalid.");
    output.push(...data.map((row) => row.source_payload));
    if (data.length < PAGE_LIMIT) break;
    const lastKey = data[data.length - 1]?.source_key;
    if (!lastKey || lastKey <= after) throw new Error("Synthetic dataset pagination failed.");
    after = lastKey;
  }
  return output;
}

async function fetchSupplemental(group) {
  const { data, error } = await supabase.rpc("coordinator_synthetic_supplemental", {
    p_group: group,
  });
  if (error || !Array.isArray(data)) {
    throw new Error(`Unable to retrieve original supplemental demo records (${group}).`);
  }
  return data.map((row) => row.source_payload);
}

export async function loadSupabaseAcademicDemo() {
  const identity = await getLiveSession();
  if (identity?.role !== "academic-coordinator") {
    throw new Error("Academic Coordinator authentication is required.");
  }
  const values = await Promise.all(GROUPS.map(fetchGroup));
  const [enrollments, history, offerings] = await Promise.all([
    fetchSupplemental("registrar.enrollments"),
    fetchSupplemental("academicCoordinator.history"),
    fetchSupplemental("academicCoordinator.offerings"),
  ]);
  const source = Object.fromEntries(GROUPS.map((key, index) => [key, values[index]]));
  const catalog = {
    departments: source["academicCoordinatorCatalog.departments"],
    programs: source["academicCoordinatorCatalog.programs"],
    subjects: source["academicCoordinatorCatalog.subjects"],
    sections: source["academicCoordinatorCatalog.sections"],
  };
  const subjectMap = new Map(catalog.subjects.map((subject) => [subject.code, subject]));
  const curricula = source.academicCoordinatorCurricula.map((curriculum) => {
    const assigned = curriculum.assignments || [];
    const units = assigned.reduce((sum, placement) =>
      sum + Number(subjectMap.get(placement.subjectCode)?.units || 0), 0);
    return {
      ...curriculum,
      assignedSubjects: assigned.length,
      totalUnits: units,
      semesters: curriculum.semesters || YEARS.flatMap((yearLevel) =>
        SEMESTERS.map((semester) => ({
          yearLevel,
          semester,
          subjects: assigned.filter((item) =>
            item.yearLevel === yearLevel && item.semester === semester),
        }))),
    };
  });
  const blockKeys = ["terms", "colleges", "programs", "curricula", "subjects",
    "blockSections", "students", "assignments", "subjectClasses",
    "classMeetings", "professors", "rooms"];
  const plan = Object.fromEntries(blockKeys.map((key) => [
    key, source[`blockPlanning.${key}`],
  ]));
  const term = plan.terms.find((row) => row.status === "CURRENT") ||
    plan.terms[0] || { label: "No academic term", status: "Closed" };

  return {
    isSyntheticDemo: true,
    catalog,
    academicCoordinatorData: {
      curricula,
      offerings,
      prerequisiteRules: [],
      history,
    },
    blockPlanning: { ...plan, history: [] },
    registrar: { enrollments, students: [] },
    student: { profile: {}, term, enrollment: {}, academicResults: [] },
    notifications: { "academic-coordinator": [] },
    term,
  };
}

import "server-only";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const COHORT = "PLP_PROJECT_600_2026_1";
const TERM = "TERM-2026-1";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function checked(result, label) {
  if (result.error) throw new Error(`Authorized Registrar ${label} read failed.`);
  return result.data || [];
}

async function byIds(admin, table, column, ids, fields) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = [];
  for (let offset = 0; offset < unique.length; offset += 80) {
    result.push(...checked(await admin.from(table).select(fields)
      .in(column, unique.slice(offset, offset + 80)), table));
  }
  return result;
}

// Everything returned is a narrowly scoped read-only classroom roster.
// The server checks Registrar authority before using a protected service read.
export async function loadRegistrarProjectRoster() {
  await requireRole("registrar");
  try {
    const admin = createAdminClient();
    const [profiles, placements, accounts, term, window] = await Promise.all([
      admin.from("student_profiles")
        .select("id,user_id,student_number,student_type,record_kind,project_cohort_id")
        .eq("record_kind", "PROJECT_ONLY").eq("project_cohort_id", COHORT),
      admin.from("project_student_academic_placements")
        .select("student_id,term_id,program_code,curriculum_code,year_level,academic_classification,progression_status,home_block_id,project_cohort_id")
        .eq("project_cohort_id", COHORT).eq("term_id", TERM),
      admin.from("app_users")
        .select("id,full_name,role_code,is_synthetic_demo,project_cohort_id")
        .eq("project_cohort_id", COHORT).eq("role_code", "student"),
      admin.from("academic_terms").select("id,label,short_label,semester")
        .eq("id", TERM).maybeSingle(),
      admin.from("project_phase8_demo_enrollment_window")
        .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
        .eq("project_cohort_id", COHORT).maybeSingle(),
    ]);
    const studentRows = checked(profiles, "project students");
    const placementRows = checked(placements, "academic placements");
    const accountRows = checked(accounts, "application identities");
    if (term.error || window.error || !term.data || !window.data ||
        window.data.term_id !== TERM || window.data.source_type !== "PROJECT_ONLY_FICTIONAL" ||
        window.data.verified_institutionally !== false ||
        studentRows.length !== 600 || placementRows.length !== 600 || accountRows.length !== 600) {
      throw new Error("Registrar project roster identity or scope mismatch.");
    }

    const profileIds = new Set(studentRows.map((row) => row.id));
    const placementByStudent = new Map(placementRows.map((row) => [row.student_id, row]));
    const accountById = new Map(accountRows.map((row) => [row.id, row]));
    if (profileIds.size !== 600 || placementByStudent.size !== 600 || accountById.size !== 600) {
      throw new Error("Registrar project roster is not unique.");
    }
    const blocks = await byIds(admin, "block_sections", "id",
      placementRows.map((row) => row.home_block_id),
      "id,term_id,code,program_code,curriculum_code,year_level,capacity,planning_status");
    const blockById = new Map(blocks.map((row) => [row.id, row]));
    const occupancy = new Map();
    const students = studentRows.map((row) => {
      const placement = placementByStudent.get(row.id);
      const account = accountById.get(row.user_id);
      const block = blockById.get(placement?.home_block_id);
      if (!placement || !account || account.is_synthetic_demo !== true ||
          !row.student_number || !account.full_name ||
          (block && (block.term_id !== TERM || block.program_code !== placement.program_code ||
            block.curriculum_code !== placement.curriculum_code))) {
        throw new Error("Registrar project student placement could not be authenticated.");
      }
      if (block) occupancy.set(block.id, (occupancy.get(block.id) || 0) + 1);
      return {
        studentNumber: row.student_number, fullName: account.full_name,
        studentType: row.student_type, program: placement.program_code,
        yearLevel: placement.year_level, curriculum: placement.curriculum_code,
        classification: placement.academic_classification,
        progression: placement.progression_status,
        blockSection: block?.code || null, homeBlockId: placement.home_block_id || null,
      };
    });
    const sections = blocks.map((row) => ({
      id: row.id, code: row.code, programCode: row.program_code,
      yearLevel: row.year_level, semester: term.data.semester,
      capacity: row.capacity, proposed: occupancy.get(row.id) || 0,
      confirmed: 0, planStatus: row.planning_status,
    }));
    const connections = await byIds(admin, "block_subject_sections", "block_id",
      blocks.map((row) => row.id), "block_id,section_id");
    const classSections = await byIds(admin, "sections", "id",
      connections.map((row) => row.section_id), "id,section_code,subject_code,schedule_status");
    const meetings = await byIds(admin, "section_meetings", "section_id",
      classSections.map((row) => row.id), "id,section_id,day_of_week,start_time,end_time,room_id,meeting_status");
    const rooms = await byIds(admin, "rooms", "id",
      meetings.map((row) => row.room_id), "id,room_code");
    const professors = await byIds(admin, "section_instructors", "section_id",
      classSections.map((row) => row.id), "section_id,instructor_id,assignment_role");
    const instructors = await byIds(admin, "instructors", "id",
      professors.map((row) => row.instructor_id), "id,display_name");
    const roomById = new Map(rooms.map((row) => [row.id, row.room_code]));
    const instructorById = new Map(instructors.map((row) => [row.id, row.display_name]));
    const sectionById = new Map(classSections.map((row) => [row.id, row]));
    const meetingsBySection = new Map();
    for (const meeting of meetings) {
      if (meeting.meeting_status === "CANCELLED") continue;
      const list = meetingsBySection.get(meeting.section_id) || [];
      list.push(meeting);
      meetingsBySection.set(meeting.section_id, list);
    }
    const schedules = connections.flatMap((connection) => {
      const section = sectionById.get(connection.section_id);
      const block = blockById.get(connection.block_id);
      if (!section || !block) return [];
      const professor = professors.find((row) => row.section_id === section.id && row.assignment_role === "PRIMARY");
      return (meetingsBySection.get(section.id) || []).map((meeting) => ({
        id: `${connection.block_id}:${meeting.id}`, sectionId: connection.block_id,
        code: block.code, subjectCode: section.subject_code,
        subject: section.subject_code, professor: professor ? instructorById.get(professor.instructor_id) || "Unassigned" : "Unassigned",
        schedule: `${DAY_NAMES[(meeting.day_of_week || 1) - 1]} ${String(meeting.start_time).slice(0, 5)} to ${String(meeting.end_time).slice(0, 5)}`,
        room: roomById.get(meeting.room_id) || "Unassigned", status: section.schedule_status,
      }));
    });
    // The displayed academic catalog is derived from the cohort's assigned
    // curriculum identifiers, rather than unrelated browser demo fixtures.
    const curriculaCodes = [...new Set(placementRows.map((row) => row.curriculum_code))];
    const programCodes = [...new Set(placementRows.map((row) => row.program_code))];
    const [curriculumRows, programRows, mappingRows, ruleRows] = await Promise.all([
      byIds(admin, "curricula", "code", curriculaCodes,
        "code,name,program_code,version_label,status"),
      byIds(admin, "programs", "code", programCodes,
        "code,name,organizational_unit_code,status"),
      byIds(admin, "curriculum_subjects", "curriculum_code", curriculaCodes,
        "curriculum_code,subject_code,year_level,semester"),
      byIds(admin, "subject_prerequisites", "curriculum_code", curriculaCodes,
        "curriculum_code,subject_code,prerequisite_subject_code,is_active"),
    ]);
    if (curriculumRows.length !== curriculaCodes.length ||
        programRows.length !== programCodes.length) {
      throw new Error("Registrar curriculum references are incomplete.");
    }
    const [subjectRows, departmentRows] = await Promise.all([
      byIds(admin, "subjects", "code", mappingRows.map((row) => row.subject_code),
        "code,name,units,status"),
      byIds(admin, "organizational_units", "code",
        programRows.map((row) => row.organizational_unit_code), "code,name"),
    ]);
    const departmentName = new Map(departmentRows.map((row) => [row.code, row.name]));
    const subjectPlacement = new Map(mappingRows.map((row) => [row.subject_code, row]));
    const academic = {
      programs: programRows.map((row) => ({
        ...row, department: departmentName.get(row.organizational_unit_code) || row.organizational_unit_code,
      })),
      curricula: curriculumRows.map((row) => ({
        code: row.code, name: row.name, program: row.program_code,
        version: row.version_label || row.name, status: row.status,
      })),
      subjects: subjectRows.map((row) => {
        const placement = subjectPlacement.get(row.code);
        return {
          code: row.code, name: row.name, units: row.units, status: row.status,
          yearLevel: placement?.year_level, semester: placement?.semester,
          prerequisites: [...new Set(ruleRows.filter((rule) =>
            rule.subject_code === row.code && rule.is_active).map((rule) => rule.prerequisite_subject_code))],
        };
      }),
    };
    return { kind: "ready", students, sections, schedules, academic,
      term: term.data, demoWindow: window.data };
  } catch (error) {
    console.error("Registrar project roster unavailable:", error?.message || "Unknown failure");
    return { kind: "unavailable", students: [], sections: [], schedules: [],
      message: "The authorized project roster could not be loaded." };
  }
}

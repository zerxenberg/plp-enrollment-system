// Verified department/program names; curricula and subjects are illustrative demo fixtures.
export const DEPARTMENTS = [
  { id: "CCS", code: "CCS", name: "College of Computer Studies" },
  { id: "CBA", code: "CBA", name: "College of Business and Accountancy" },
  { id: "CAS", code: "CAS", name: "College of Arts and Sciences" },
  { id: "COE_EDUCATION", code: "COE", name: "College of Education" },
  { id: "COE_ENGINEERING", code: "COE", name: "College of Engineering" },
  { id: "CON", code: "CON", name: "College of Nursing" },
  { id: "CIHM", code: "CIHM", name: "College of International Hospitality Management" },
];

export const PROGRAMS = [
  { code: "BSIT", name: "Bachelor of Science in Information Technology", department: "CCS" },
  { code: "BSCS", name: "Bachelor of Science in Computer Science", department: "CCS" },
  { code: "BSA", name: "Bachelor of Science in Accountancy", department: "CBA" },
  { code: "BSBA", name: "Bachelor of Science in Business Administration", department: "CBA", majors: ["Marketing Management", "Entrepreneurship", "Human Resource Management"] },
  { code: "BSP", name: "Bachelor of Science in Psychology", department: "CAS" },
  { code: "BPA", name: "Bachelor of Public Administration", department: "CAS" },
  { code: "BEED", name: "Bachelor of Elementary Education", department: "COE_EDUCATION" },
  { code: "BSED", name: "Bachelor of Secondary Education", department: "COE_EDUCATION", majors: ["English", "Filipino", "Mathematics", "Science"] },
  { code: "BSECE", name: "Bachelor of Science in Electronics Engineering", department: "COE_ENGINEERING" },
  { code: "BSN", name: "Bachelor of Science in Nursing", department: "CON" },
  { code: "BSHM", name: "Bachelor of Science in Hospitality Management", department: "CIHM" },
].map((program) => ({
  ...program, id: `program-${program.code.toLowerCase()}`,
  departmentId: program.department, majors: program.majors || [], status: "Active", reference: "Verified Program",
}));

export const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
export const SEMESTERS = ["First Semester", "Second Semester"];
export const MOCK_ACADEMIC_YEARS = ["2024 to 2025", "2025 to 2026", "2026 to 2027"];
export const DEFAULT_DEMO_FEE_PER_UNIT = 100;

const PROGRAM_TRACKS = [
  ["BSIT", "", "IT", ["Programming Fundamentals", "Computing Essentials", "Object Oriented Programming", "Discrete Structures", "Data Structures", "Database Fundamentals", "Web Systems", "Computer Networks", "Systems Analysis", "Information Assurance", "Server Administration", "Mobile Application Development", "Information Systems Integration", "Cloud Computing", "Capstone Project 1", "Capstone Project 2"]],
  ["BSCS", "", "CS", ["Computer Science Fundamentals", "Mathematical Logic", "Computer Programming", "Discrete Mathematics", "Data Structures", "Digital Logic", "Algorithm Analysis", "Computer Organization", "Operating Systems", "Automata Theory", "Programming Languages", "Computer Architecture", "Software Engineering", "Machine Learning Foundations", "Research Project 1", "Research Project 2"]],
  ["BSA", "", "ACC", ["Fundamentals of Accounting", "Business Mathematics", "Financial Accounting 1", "Managerial Economics", "Financial Accounting 2", "Business Law", "Cost Accounting", "Taxation 1", "Accounting Information Systems", "Auditing Principles", "Taxation 2", "Advanced Financial Accounting", "Auditing Practice", "Management Advisory Services", "Accounting Research", "Accounting Integration"]],
  ["BSBA", "Marketing Management", "BAM", ["Foundations of Business", "Principles of Marketing", "Business Communication", "Consumer Behavior", "Market Research", "Brand Management", "Marketing Analytics", "Digital Marketing", "Retail Management", "Pricing Strategy", "Services Marketing", "Integrated Marketing", "Sales Management", "International Marketing", "Marketing Research Project", "Marketing Practicum"]],
  ["BSBA", "Entrepreneurship", "BAE", ["Foundations of Business", "Entrepreneurial Mindset", "Small Business Management", "Business Model Design", "Opportunity Assessment", "Financial Planning", "Product Development", "Startup Operations", "Social Entrepreneurship", "Innovation Management", "Venture Finance", "Business Negotiation", "Enterprise Risk", "Growth Strategy", "Venture Research", "Business Incubation"]],
  ["BSBA", "Human Resource Management", "BAH", ["Foundations of Business", "Human Resource Foundations", "Organizational Behavior", "Staffing and Recruitment", "Compensation Administration", "Training and Development", "Labor Relations", "HR Analytics", "Performance Management", "Employment Law", "Talent Management", "Organizational Development", "Strategic HR Management", "Workforce Planning", "HR Research", "HR Practicum"]],
  ["BSP", "", "PSY", ["Introduction to Psychology", "Biological Psychology", "Developmental Psychology", "Social Psychology", "Personality Theories", "Statistics in Psychology", "Abnormal Psychology", "Experimental Psychology", "Psychological Assessment 1", "Research Methods", "Psychological Assessment 2", "Counseling Foundations", "Industrial Psychology", "Clinical Psychology", "Psychology Research", "Psychology Practicum"]],
  ["BPA", "", "PA", ["Introduction to Public Administration", "Philippine Governance", "Administrative Theory", "Public Sector Ethics", "Public Policy", "Local Government", "Public Financial Management", "Public Personnel Administration", "Government Budgeting", "Public Service Delivery", "Policy Analysis", "Administrative Law", "Program Evaluation", "Public Sector Leadership", "Governance Research", "Public Administration Practicum"]],
  ["BEED", "", "EED", ["Foundations of Education", "Child Development", "Teaching and Learning Principles", "Educational Psychology", "Literacy Instruction", "Teaching Mathematics", "Science for Elementary Learners", "Classroom Management", "Curriculum Development", "Assessment of Learning", "Inclusive Education", "Instructional Materials", "Educational Technology", "Teaching Strategies", "Field Study", "Teaching Internship"]],
  ["BSED", "English", "EEN", ["Foundations of Education", "English Grammar", "Teaching and Learning Principles", "World Literature", "English Linguistics", "Language Acquisition", "Teaching Reading", "Classroom Management", "Curriculum Planning", "Language Assessment", "Creative Writing", "Teaching Literature", "Educational Technology", "English Language Research", "Field Study", "Teaching Internship"]],
  ["BSED", "Filipino", "EFI", ["Foundations of Education", "Wikang Filipino", "Teaching and Learning Principles", "Panitikang Pilipino", "Gramatikang Filipino", "Wika at Kultura", "Pagtuturo ng Pagbasa", "Classroom Management", "Curriculum Planning", "Pagtataya ng Pagkatuto", "Retorika", "Pagtuturo ng Panitikan", "Educational Technology", "Pananaliksik sa Filipino", "Field Study", "Teaching Internship"]],
  ["BSED", "Mathematics", "EMA", ["Foundations of Education", "College Algebra", "Teaching and Learning Principles", "Geometry", "Trigonometry", "Calculus", "Probability", "Classroom Management", "Curriculum Planning", "Statistics", "Linear Algebra", "Mathematics Assessment", "Educational Technology", "Mathematics Research", "Field Study", "Teaching Internship"]],
  ["BSED", "Science", "ESC", ["Foundations of Education", "General Biology", "Teaching and Learning Principles", "General Chemistry", "Physics", "Earth Science", "Ecology", "Classroom Management", "Curriculum Planning", "Laboratory Methods", "Environmental Science", "Science Assessment", "Educational Technology", "Science Education Research", "Field Study", "Teaching Internship"]],
  ["BSECE", "", "ECE", ["Engineering Mathematics 1", "Engineering Drawing", "Engineering Mathematics 2", "Physics for Engineers", "Circuit Analysis 1", "Computer Aided Design", "Circuit Analysis 2", "Digital Electronics", "Electronic Devices", "Signals and Systems", "Microprocessors", "Communication Systems", "Control Systems", "Electronics Design", "Engineering Design 1", "Engineering Design 2"]],
  ["BSN", "", "NUR", ["Anatomy and Physiology", "Introduction to Nursing", "Biochemistry for Nursing", "Health Assessment", "Nursing Fundamentals", "Microbiology", "Community Health Nursing", "Nutrition and Diet Therapy", "Maternal and Child Nursing", "Pharmacology", "Medical Surgical Nursing 1", "Mental Health Nursing", "Medical Surgical Nursing 2", "Nursing Leadership", "Nursing Research", "Clinical Practice"]],
  ["BSHM", "", "HM", ["Introduction to Hospitality", "Food Safety", "Culinary Fundamentals", "Hospitality Communication", "Food Preparation", "Front Office Operations", "Housekeeping Operations", "Tourism Foundations", "Food and Beverage Service", "Hospitality Accounting", "Event Management", "Hospitality Marketing", "Hospitality Law", "Service Quality Management", "Hospitality Research", "Hospitality Practicum"]],
];

const GENERAL_EDUCATION = [
  ["GE101", "Purposive Communication"], ["GE102", "Understanding the Self"],
  ["GE103", "Mathematics in the Modern World"], ["GE104", "Science Technology and Society"],
  ["GE105", "Readings in Philippine History"], ["GE106", "Ethics"],
  ["GE107", "The Contemporary World"], ["GE108", "Art Appreciation"],
];

// Illustrative common degree courses. A single master is reused by every
// specialization of the same degree; the specialist courses in PROGRAM_TRACKS
// remain distinct. This gives each semester two degree courses, two
// specialization courses and one shared GE course.
const PROGRAM_COMMON = {
  BSIT: ["Digital Literacy and Productivity", "Fundamentals of Information Systems", "Computer Hardware Servicing", "Web Design Principles", "Database Design", "Information Management", "Network Fundamentals", "Human Computer Interaction", "Object Oriented Design", "Project Management for IT", "Systems Integration Methods", "Software Quality Assurance", "IT Governance", "Information Technology Research Methods", "IT Internship Preparation", "Professional Practice in IT"],
  BSCS: ["Computational Thinking", "Scientific Computing Foundations", "Linear Algebra for Computing", "Introduction to Algorithms", "Computer Systems Lab", "Programming Paradigms", "Algorithmic Problem Solving", "Numerical Methods", "Formal Languages", "Concurrent Programming", "Computer Graphics", "Data Science Fundamentals", "Advanced Algorithms", "Research Methods in Computing", "Computer Science Seminar", "Computer Science Professional Practice"],
  BSA: ["Business Foundations for Accountants", "Applied Business Statistics", "Accounting Cycle Workshop", "Corporate Finance", "Spreadsheet Modeling for Accounting", "Intermediate Accounting Lab", "Business Regulation", "Financial Reporting Standards", "Accounting Analytics", "Internal Controls", "Accounting Ethics", "Governance and Compliance", "Forensic Accounting", "Strategic Financial Analysis", "Accounting Case Studies", "Professional Accounting Practice"],
  BSBA: ["Introduction to Management", "Fundamentals of Economics", "Business Statistics", "Business Finance", "Business Writing", "Operations Management", "Quantitative Business Analysis", "Business Information Systems", "Supply Chain Fundamentals", "Corporate Social Responsibility", "Business Strategy", "Research Methods in Business", "Organizational Leadership", "Business Process Improvement", "Strategic Management Seminar", "Business Practicum Preparation"],
  BSP: ["Academic Writing for Psychology", "Human Behavior Foundations", "Psychology of Learning", "Cognitive Psychology", "Psychology Laboratory Methods", "Psychology of Emotion", "Cross Cultural Psychology", "Psychological Measurement", "Psychology of Groups", "Behavioral Research Design", "Ethics in Psychology", "Health Psychology", "Applied Psychology Seminar", "Advanced Statistics for Psychology", "Psychology Thesis Preparation", "Professional Practice in Psychology"],
  BPA: ["Introduction to Political Science", "Academic Writing for Public Service", "Public Administration Foundations Lab", "Public Communication", "Philippine Constitution", "Public Sector Management", "Public Sector Statistics", "Public Organization Behavior", "Citizen Engagement", "Research Methods in Public Service", "Public Sector Accountability", "Intergovernmental Relations", "Governance Innovation", "Public Project Management", "Public Administration Seminar", "Professional Public Service Practice"],
  BEED: ["Education and Society", "Communication for Educators", "Learner Diversity", "Teaching Approaches", "Learning Resources Development", "Educational Research Foundations", "Teaching Social Studies", "Education Law and Policy", "School Community Partnership", "Educational Measurement", "Teaching Arts and Movement", "Child Welfare in Schools", "Instructional Design", "Practice Teaching Preparation", "Professional Ethics for Teachers", "Elementary Education Portfolio"],
  BSED: ["Education and Society", "Communication for Educators", "Learner Diversity", "Teaching Approaches", "Learning Resources Development", "Educational Research Foundations", "Adolescent Development", "Education Law and Policy", "School Community Partnership", "Educational Measurement", "Teaching Methods Seminar", "Education Leadership", "Instructional Design", "Practice Teaching Preparation", "Professional Ethics for Teachers", "Secondary Education Portfolio"],
  BSECE: ["Engineering Orientation", "Engineering Chemistry", "Calculus for Electronics", "Engineering Mechanics", "Differential Equations", "Engineering Materials", "Engineering Statistics", "Electronics Laboratory 1", "Electromagnetic Fields", "Electronics Laboratory 2", "Digital Communications", "Electronic Instrumentation", "Embedded Systems", "Engineering Research Methods", "Professional Engineering Ethics", "Engineering Internship Preparation"],
  BSN: ["Human Biology", "Medical Terminology", "Patient Care Fundamentals", "Nursing Skills Laboratory 1", "Pathophysiology", "Nursing Skills Laboratory 2", "Healthcare Communication", "Evidence Based Nursing", "Nursing Care Planning", "Nursing Informatics", "Health Promotion", "Nursing Ethics and Law", "Nursing Research Methods", "Emergency Nursing", "Nursing Internship Preparation", "Professional Nursing Practice"],
  BSHM: ["Hospitality Industry Orientation", "Guest Relations", "Hospitality Mathematics", "Culinary Skills Laboratory", "Hospitality Cost Control", "Accommodation Management", "Hospitality Information Systems", "Service Operations", "Restaurant Operations", "Hospitality Entrepreneurship", "Sustainable Tourism", "Hospitality Human Resources", "Hospitality Strategic Planning", "Research Methods in Hospitality", "Hospitality Internship Preparation", "Professional Hospitality Practice"],
};

const COMMON_PREFIX = {
  BSIT: "ITC", BSCS: "CSC", BSA: "AC", BSBA: "BAC", BSP: "PSC",
  BPA: "PAC", BEED: "EEC", BSED: "EDC", BSECE: "ECC", BSN: "NC", BSHM: "HMC",
};

const academicTermIndex = ({ yearLevel, semester }) => {
  const yearIndex = YEARS.indexOf(yearLevel);
  const semesterIndex = SEMESTERS.indexOf(semester);
  return yearIndex < 0 || semesterIndex < 0 ? -1 : yearIndex * SEMESTERS.length + semesterIndex;
};

export function buildMockAcademicReferences(existingSubjects = [], existingPrograms = []) {
  const programs = PROGRAMS.map((program) => ({
    ...program,
    enrolled: existingPrograms.find((entry) => entry.code === program.code)?.enrolled || 0,
  }));
  const initiallyOffered = new Set(existingSubjects.map((entry) => entry.code));
  const subjects = existingSubjects.map((subject) => ({
    ...subject,
    id: `subject-${subject.code.toLowerCase()}`,
    status: subject.status || "Active",
    program: subject.program || "BSIT",
    programs: subject.programs || [subject.program || "BSIT"],
    department: subject.department || "CCS",
    departmentId: subject.department || "CCS",
    feePerUnit: subject.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT,
    availableInStudentDemo: true,
    reference: "Demo Academic Data",
  }));
  const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const subjectByName = new Map(subjects
    .filter((subject) => typeof subject.name === "string")
    .map((subject) => [`${subject.department}|${subject.name.trim().toLowerCase()}`, subject]));
  const addSubject = (subject) => {
    // Reuse the same subject master for common courses across specializations
    // and degree programs. Curriculum assignment prerequisites remain local
    // to the individual version.
    const nameKey = `${subject.department}|${subject.name.trim().toLowerCase()}`;
    const existing = subjectByCode.get(subject.code) || subjectByName.get(nameKey);
    if (existing) {
      existing.programs = [...new Set([...(existing.programs || []), ...(subject.programs || [])])];
      if (existing.major !== subject.major) existing.major = "";
      // A preexisting student demo GE course can carry the student's CCS
      // department metadata. The shared academic master must remain available
      // to every department that uses that same GE course.
      if (subject.department === "SHARED") {
        existing.department = "SHARED";
        existing.departmentId = "SHARED";
        subjectByName.set(nameKey, existing);
      }
      return existing;
    } else {
      const normalized = {
        ...subject,
        id: `subject-${subject.code.toLowerCase()}`,
        departmentId: subject.department,
        availableInStudentDemo: initiallyOffered.has(subject.code),
        category: "Other Eligible",
        eligibility: "NOT_OFFERED",
        restrictionReason: "No demo section is offered for this subject.",
      };
      subjectByCode.set(subject.code, normalized);
      subjectByName.set(nameKey, normalized);
      subjects.push(normalized);
      return normalized;
    }
  };
  GENERAL_EDUCATION.forEach(([code, name], semesterIndex) => addSubject({
    code, name, units: 3, department: "SHARED", programs: programs.map((program) => program.code),
    yearLevel: YEARS[Math.floor(semesterIndex / 2)], semester: SEMESTERS[semesterIndex % 2],
    status: "Active", prerequisites: [], description: "Illustrative shared general education subject.",
    feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT, reference: "Demo Academic Data",
  }));

  const curricula = PROGRAM_TRACKS.map(([program, major, prefix, topics]) => {
    const department = programs.find((entry) => entry.code === program).department;
    const assignments = [];
    const trackCodes = [];
    topics.forEach((name, index) => {
      const semesterIndex = Math.floor(index / 2);
      const yearLevel = YEARS[Math.floor(semesterIndex / 2)];
      const semester = SEMESTERS[semesterIndex % 2];
      const code = `${prefix}${String(index + 1).padStart(3, "0")}`;
      const prerequisites = index >= 2 ? [trackCodes[index - 2]] : [];
      const actual = addSubject({
        code, name, units: index >= 14 ? 4 : index % 5 === 0 ? 2 : 3,
        department, program, programs: [program], major, yearLevel, semester, status: "Active",
        prerequisites, description: "Illustrative subject for mock curriculum demonstration.",
        feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT, reference: "Demo Academic Data",
      });
      trackCodes.push(actual.code);
      assignments.push({ subjectCode: actual.code, yearLevel, semester, prerequisites, feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT });
    });
    const commonCodes = [];
    PROGRAM_COMMON[program].forEach((name, index) => {
      const semesterIndex = Math.floor(index / 2);
      const yearLevel = YEARS[Math.floor(semesterIndex / 2)];
      const semester = SEMESTERS[semesterIndex % 2];
      const code = `${COMMON_PREFIX[program]}${String(index + 1).padStart(3, "0")}`;
      const prerequisites = index >= 2 ? [commonCodes[index - 2]] : [];
      const actual = addSubject({
        code, name, units: index >= 14 ? 2 : 3,
        department, program, programs: [program], major: "", yearLevel, semester,
        status: "Active", prerequisites,
        description: "Illustrative common degree subject for mock curriculum demonstration.",
        feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT, reference: "Demo Academic Data",
      });
      commonCodes.push(actual.code);
      assignments.push({ subjectCode: actual.code, yearLevel, semester, prerequisites, feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT });
    });
    GENERAL_EDUCATION.forEach(([code], semesterIndex) => assignments.push({
      subjectCode: code, yearLevel: YEARS[Math.floor(semesterIndex / 2)],
      semester: SEMESTERS[semesterIndex % 2], prerequisites: [], feePerUnit: DEFAULT_DEMO_FEE_PER_UNIT,
    }));
    const semesters = YEARS.flatMap((yearLevel) => SEMESTERS.map((semester) => ({
      yearLevel, semester,
      subjects: assignments.filter((entry) => entry.yearLevel === yearLevel && entry.semester === semester)
        .map((entry) => ({ ...entry })),
    })));
    const metrics = summarizeCurriculum(assignments, subjects);
    return {
      id: `CUR-DEMO-${prefix}-2026`, version: `${program}${major ? ` (${major})` : ""} Curriculum 2026`,
      department, departmentId: department, program, programId: `program-${program.toLowerCase()}`,
      major, effectiveAcademicYear: "2026 to 2027",
      status: "Active", assignments, semesters, assignedSubjects: assignments.length,
      totalUnits: metrics.total.units, totalFee: metrics.total.tuition,
      totalFeeDisplay: formatDemoPeso(metrics.total.tuition), reference: "Demo Academic Data",
    };
  });
  for (const subject of subjects) {
    subject.programIds = (subject.programs || []).map((code) => `program-${code.toLowerCase()}`);
    subject.fee = Number(subject.units) * Number(subject.feePerUnit);
    subject.feeDisplay = formatDemoPeso(subject.fee);
  }
  return { departments: DEPARTMENTS, programs, subjects, curricula };
}

export const departmentName = (department, departments = DEPARTMENTS) =>
  departments.find((item) => item.id === department || item.name === department)?.name || department || "Unassigned";

export const formatDemoPeso = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(Number(value) || 0);

export function summarizeCurriculum(assignments = [], subjects = [], yearLevel = null, semester = null) {
  const lookup = new Map(subjects.map((subject) => [subject.code, subject]));
  const selected = assignments.filter((item) =>
    (!yearLevel || item.yearLevel === yearLevel) && (!semester || item.semester === semester));
  const totals = (items) => items.reduce((total, item) => {
    const subject = lookup.get(item.subjectCode);
    if (!subject) return total;
    const units = Number(subject.units) || 0;
    const feePerUnit = Number(item.feePerUnit ?? subject.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT);
    return { subjects: total.subjects + 1, units: total.units + units, tuition: total.tuition + units * feePerUnit };
  }, { subjects: 0, units: 0, tuition: 0 });
  return { total: totals(assignments), selected: totals(selected) };
}

export function validatePrerequisiteGraph(subjects, targetCode, prerequisites = []) {
  if (new Set(prerequisites).size !== prerequisites.length) return "Duplicate prerequisites are not allowed.";
  if (prerequisites.includes(targetCode)) return "A subject cannot require itself.";
  const byCode = new Map(subjects.map((subject) => [subject.code, subject]));
  for (const code of prerequisites) {
    if (!byCode.has(code)) return `Prerequisite ${code} does not exist.`;
    const visited = new Set();
    const reachable = (current) => {
      if (current === targetCode) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      return (current === targetCode ? prerequisites : byCode.get(current)?.prerequisites || []).some(reachable);
    };
    if (reachable(code)) return "This prerequisite creates a circular dependency.";
  }
  return null;
}

export function validateCurriculumRecord(record, catalog) {
  const errors = [];
  const program = catalog.programs.find((item) => item.code === record.program);
  if (!program || (record.department && program.department !== record.department) ||
    (record.departmentId && program.departmentId !== record.departmentId))
    errors.push("The selected program does not belong to the curriculum department.");
  if (record.major && !program?.majors?.includes(record.major)) errors.push("The selected major is not supported by this program.");
  if (program?.majors?.length && !record.major)
    errors.push("Select a major for this degree program.");
  if (!record.version?.trim() || !record.effectiveAcademicYear?.trim()) errors.push("Curriculum version and effective academic year are required.");
  // An empty curriculum is a valid Draft. Only activation requires content.
  const assignments = Array.isArray(record.assignments) ? record.assignments : [];
  const byCode = new Map(catalog.subjects.map((item) => [item.code, item]));
  const assigned = new Map(assignments.map((item) => [item.subjectCode, item]));
  const graph = catalog.subjects.map((subject) => ({
    ...subject,
    prerequisites: assigned.get(subject.code)?.prerequisites ?? subject.prerequisites ?? [],
  }));
  const seen = new Set();
  for (const assignment of assignments) {
    const subject = byCode.get(assignment.subjectCode);
    if (!subject) { errors.push(`Subject ${assignment.subjectCode} is missing from the catalog.`); continue; }
    if (seen.has(assignment.subjectCode)) errors.push(`Subject ${assignment.subjectCode} is assigned more than once.`);
    seen.add(assignment.subjectCode);
    const termIndex = academicTermIndex(assignment);
    if (termIndex < 0)
      errors.push(`Subject ${assignment.subjectCode} has an invalid year or semester.`);
    if (subject.status === "Inactive")
      errors.push(`Subject ${assignment.subjectCode} is inactive.`);
    if (!(subject.programs || [subject.program]).includes(record.program))
      errors.push(`Subject ${assignment.subjectCode} is unavailable for the selected program.`);
    if (subject.major && subject.major !== (record.major || ""))
      errors.push(`Subject ${assignment.subjectCode} belongs to a different specialization.`);
    if (subject.department !== "SHARED" && program && subject.departmentId !== program.departmentId)
      errors.push(`Subject ${assignment.subjectCode} belongs to a different department.`);
    if (!Number.isFinite(Number(subject.units)) || Number(subject.units) <= 0)
      errors.push(`Subject ${assignment.subjectCode} must have valid positive units.`);
    const rate = Number(assignment.feePerUnit ?? subject.feePerUnit ?? DEFAULT_DEMO_FEE_PER_UNIT);
    if (!Number.isFinite(rate) || rate < 0) errors.push(`Subject ${assignment.subjectCode} has an invalid demo fee.`);
    const prereqs = assignment.prerequisites ?? subject.prerequisites ?? [];
    const invalid = validatePrerequisiteGraph(graph, assignment.subjectCode, prereqs);
    if (invalid) errors.push(`${assignment.subjectCode}: ${invalid}`);
    for (const prerequisite of prereqs) {
      const requiredAssignment = assigned.get(prerequisite);
      if (!requiredAssignment)
        errors.push(`${assignment.subjectCode}: prerequisite ${prerequisite} is missing from this curriculum.`);
      else if (termIndex >= 0 && academicTermIndex(requiredAssignment) >= termIndex)
        errors.push(`${assignment.subjectCode} requires ${prerequisite} in an earlier semester.`);
    }
  }
  return errors;
}

// IDs distinguish the two departments whose display code is COE. Program
// selection must be matched against the selected department's stable ID.
export function getAcademicSubjectOptions(catalog, { departmentId, programId, yearLevel, semester, major } = {}) {
  const program = catalog.programs.find((entry) => entry.id === programId);
  if (programId && !program) return [];
  if (departmentId && !catalog.departments.some((entry) => entry.id === departmentId)) return [];
  if (departmentId && program && program.departmentId !== departmentId) return [];
  return catalog.subjects.filter((subject) =>
    subject.status !== "Inactive" &&
    (!departmentId || subject.departmentId === departmentId || subject.department === "SHARED") &&
    (!program || (subject.programIds?.includes(program.id) ||
      (subject.programs || [subject.program]).includes(program.code))) &&
    (!subject.major || subject.major === major) &&
    (!yearLevel || subject.yearLevel === yearLevel) &&
    (!semester || subject.semester === semester));
}

// The demonstration's five to seven courses per semester is illustrative,
// not institutional policy. Display these as recommendations only.
export function getCurriculumLoadAdvisories(record, { minSubjects = 5, maxSubjects = 7 } = {}) {
  return YEARS.flatMap((yearLevel) => SEMESTERS.flatMap((semester) => {
    const count = (record.assignments || []).filter((item) =>
      item.yearLevel === yearLevel && item.semester === semester).length;
    return count >= minSubjects && count <= maxSubjects ? [] :
      [`${yearLevel}, ${semester} has ${count} subjects; the illustrative demo range is ${minSubjects} to ${maxSubjects}.`];
  }));
}

// Candidate subjects must be compatible with the target's program/major and
// come from a strictly earlier term. Valid selected rules remain available for
// editing, but circular and duplicate rules are never offered.
export function getPrerequisiteCandidates(
  catalog,
  { code, department, programs, major, yearLevel, semester, prerequisites = [] } = {},
) {
  const target = catalog.subjects.find((subject) => subject.code === code);
  // New unsaved subjects do not yet exist in the catalog. Their editor
  // department, program, major, and term provide the candidate context.
  const targetIndex = academicTermIndex({ yearLevel: yearLevel ?? target?.yearLevel, semester: semester ?? target?.semester });
  if (targetIndex < 0) return [];
  const targetDepartment = department || target?.departmentId || target?.department;
  const allowedPrograms = Array.isArray(programs) && programs.length ? programs : (target?.programs || [target?.program]).filter(Boolean);
  if (!targetDepartment || !allowedPrograms.length) return [];
  const scopedPrograms = targetDepartment === "SHARED" ? allowedPrograms : allowedPrograms.filter((value) =>
    catalog.programs.some((program) => program.code === value && program.departmentId === targetDepartment));
  if (!scopedPrograms.length) return [];
  const rules = [...new Set(prerequisites)];
  return catalog.subjects.filter((candidate) => {
    if (candidate.code === code || candidate.status === "Inactive") return false;
    if (targetDepartment === "SHARED"
      ? candidate.department !== "SHARED"
      : candidate.department !== "SHARED" && candidate.departmentId !== targetDepartment) return false;
    if (!(candidate.programs || [candidate.program]).some((value) => scopedPrograms.includes(value))) return false;
    if (candidate.major && candidate.major !== (major ?? target?.major ?? "")) return false;
    if (academicTermIndex(candidate) < 0 || academicTermIndex(candidate) >= targetIndex) return false;
    const proposed = [...rules.filter((item) => item !== candidate.code), candidate.code];
    return !validatePrerequisiteGraph(catalog.subjects, code, proposed);
  });
}

export function validateCurriculumActivation(record, catalog) {
  const errors = validateCurriculumRecord(record, catalog);
  for (const yearLevel of YEARS) {
    for (const semester of SEMESTERS) {
      if (!(record.assignments || []).some((item) =>
        item.yearLevel === yearLevel && item.semester === semester)) {
        errors.push(`${yearLevel}, ${semester} must include at least one subject before activation.`);
      }
    }
  }
  return errors;
}

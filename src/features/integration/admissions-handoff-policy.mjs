const PROGRAM_MAPPINGS = Object.freeze([
  {
    aliases: ["bs information technology","bachelor of science in information technology","bsit"],
    programCode: "BSIT", trackCode: null, curriculumCode: "P8F26-BSIT-V1",
  },
  {
    aliases: ["bs computer science","bachelor of science in computer science","bscs"],
    programCode: "BSCS", trackCode: null, curriculumCode: "P8F26-BSCS-V1",
  },
  {
    aliases: ["bs accountancy","bachelor of science in accountancy","bsa"],
    programCode: "BSA", trackCode: null, curriculumCode: "P8F26-BSA-V1",
  },
  {
    aliases: ["bs entrepreneurship","bachelor of science in entrepreneurship","entrepreneurship",
      "bs business administration major in entrepreneurship",
      "bachelor of science in business administration major in entrepreneurship",
      "bsba entrepreneurship"],
    programCode: "BSBA", trackCode: "BSBAENT", curriculumCode: "P8F26-BSBAENT-V1",
  },
  {
    aliases: ["bs business administration major in human resource management",
      "bachelor of science in business administration major in human resource management",
      "bsba human resource management","bsba hrm"],
    programCode: "BSBA", trackCode: "BSBAHR", curriculumCode: "P8F26-BSBAHR-V1",
  },
  {
    aliases: ["bs business administration major in marketing management",
      "bachelor of science in business administration major in marketing management",
      "bsba marketing management","bsba marketing"],
    programCode: "BSBA", trackCode: "BSBAMM", curriculumCode: "P8F26-BSBAMM-V1",
  },
  {
    aliases: ["ab psychology","ba psychology","bs psychology",
      "bachelor of science in psychology","bachelor of arts in psychology","psychology"],
    programCode: "BSP", trackCode: null, curriculumCode: "P8F26-BSP-V1",
  },
  {
    aliases: ["bsed english","bachelor of secondary education major in english","secondary education english"],
    programCode: "BSED", trackCode: "BSEDENG", curriculumCode: "P8F26-BSEDENG-V1",
  },
  {
    aliases: ["bsed filipino","bachelor of secondary education major in filipino","secondary education filipino"],
    programCode: "BSED", trackCode: "BSEDFIL", curriculumCode: "P8F26-BSEDFIL-V1",
  },
  {
    aliases: ["bsed mathematics","bsed math","bachelor of secondary education major in mathematics","secondary education mathematics"],
    programCode: "BSED", trackCode: "BSEDMATH", curriculumCode: "P8F26-BSEDMATH-V1",
  },
  {
    aliases: ["bsed science","bachelor of secondary education major in science","secondary education science"],
    programCode: "BSED", trackCode: "BSEDSCI", curriculumCode: "P8F26-BSEDSCI-V1",
  },
  { aliases: ["bachelor of elementary education","beed"], programCode: "BEED", trackCode: null, curriculumCode: "P8F26-BEED-V1" },
  { aliases: ["bachelor of public administration","bs public administration","bpa"], programCode: "BPA", trackCode: null, curriculumCode: "P8F26-BPA-V1" },
  { aliases: ["bs electronics engineering","bachelor of science in electronics engineering","bsece"], programCode: "BSECE", trackCode: null, curriculumCode: "P8F26-BSECE-V1" },
  { aliases: ["bs hospitality management","bachelor of science in hospitality management","bshm"], programCode: "BSHM", trackCode: null, curriculumCode: "P8F26-BSHM-V1" },
  { aliases: ["bs nursing","bachelor of science in nursing","bsn"], programCode: "BSN", trackCode: null, curriculumCode: "P8F26-BSN-V1" },
]);

function clean(value) { return String(value ?? "").trim(); }
function normalizeComparable(value) {
  return clean(value).toLowerCase().replace(/&/g," and ").replace(/[()]/g," ")
    .replace(/[.,/\\_-]+/g," ").replace(/\s+/g," ").trim();
}
export function normalizeAdmissionsSchoolYear(value) {
  const match=/^(\d{4})\s*(?:-|to)\s*(\d{4})$/i.exec(clean(value));
  if(!match) return null;
  const start=Number(match[1]), end=Number(match[2]);
  if(!Number.isInteger(start)||end!==start+1) return null;
  return {source:`${start}-${end}`,enrollment:`${start} to ${end}`,studentNumberPrefix:String(start).slice(-2)};
}
export function mapAdmissionsApplicantType(value) {
  const type=normalizeComparable(value);
  if(type==="freshman") return {status:"mapped",studentType:"NEW_STUDENT"};
  if(type==="transferee") return {status:"mapped",studentType:"TRANSFEREE"};
  if(type==="foreign") return {status:"review",reason:"Foreign applicants require academic classification review before Enrollment provisioning."};
  return {status:"review",reason:"Applicant type is not recognized by the Enrollment System."};
}
export function mapAdmissionsProgram(value) {
  const normalized=normalizeComparable(value);
  const match=PROGRAM_MAPPINGS.find((entry)=>entry.aliases.some((alias)=>normalizeComparable(alias)===normalized));
  if(!match) return {status:"review",reason:"The admitted program does not have an approved Enrollment mapping.",sourceProgram:clean(value)};
  return {status:"mapped",sourceProgram:clean(value),programCode:match.programCode,trackCode:match.trackCode,curriculumCode:match.curriculumCode};
}
function requiredText(payload,field,label=field){
  const value=clean(payload?.[field]);
  if(!value) throw new Error(`${label} is required.`);
  if(value.length>320) throw new Error(`${label} is too long.`);
  return value;
}
export function normalizeAdmissionsHandoffPayload(payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload)) throw new Error("A JSON admission handoff object is required.");
  const applicantId=requiredText(payload,"applicant_id","Admissions applicant ID");
  const userId=requiredText(payload,"user_id","Admissions user ID");
  const schoolYear=normalizeAdmissionsSchoolYear(payload.school_year);
  if(!schoolYear) throw new Error("School year must use YYYY-YYYY or YYYY to YYYY.");
  const overallStatus=normalizeComparable(payload.overall_status);
  const admissionResult=normalizeComparable(payload.admission_result??payload.result);
  const enrollmentIntent=normalizeComparable(payload.enrollment_intent);
  const applicantType=mapAdmissionsApplicantType(payload.applicant_type);
  if(applicantType.status!=="mapped") return {eligible:false,reviewRequired:true,reviewReason:applicantType.reason,applicantReference:`ADMISSIONS:${schoolYear.source}:${applicantId}`,schoolYear};
  const program=mapAdmissionsProgram(payload.course_applied??payload.approved_program);
  if(program.status!=="mapped") return {eligible:false,reviewRequired:true,reviewReason:program.reason,applicantReference:`ADMISSIONS:${schoolYear.source}:${applicantId}`,schoolYear,applicantType};
  if(overallStatus!=="released"||admissionResult!=="accepted"||enrollmentIntent!=="confirmed")
    return {eligible:false,reviewRequired:false,reviewReason:"Applicant is not yet eligible for Enrollment handoff.",applicantReference:`ADMISSIONS:${schoolYear.source}:${applicantId}`,schoolYear,applicantType,program};
  const firstName=requiredText(payload,"first_name","First name");
  const lastName=requiredText(payload,"last_name","Last name");
  const middleName=clean(payload.middle_name)||null, suffix=clean(payload.suffix)||null;
  const fullName=clean(payload.name)||[firstName,middleName,lastName,suffix].filter(Boolean).join(" ");
  const email=requiredText(payload,"email","Email").toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid applicant email is required.");
  const releasedAt=requiredText(payload,"released_at","Admission release timestamp");
  const releasedDate=/^\d{4}-\d{2}-\d{2}/.exec(releasedAt)?.[0];
  if(!releasedDate) throw new Error("Admission release timestamp is invalid.");
  return {
    eligible:true,reviewRequired:false,
    applicantReference:`ADMISSIONS:${schoolYear.source}:${applicantId}`,
    sourceAccountKey:`ADMISSIONS:${schoolYear.source}:${applicantId}`,
    externalUserReference:`ADMISSIONS_USER:${userId}`,
    applicantId,userId,schoolYear,studentType:applicantType.studentType,
    programCode:program.programCode,trackCode:program.trackCode,curriculumCode:program.curriculumCode,
    fullName,firstName,middleName,lastName,email,
    phone:clean(payload.phone)||null,address:clean(payload.address)||null,
    admissionDate:releasedDate,sourceProgram:program.sourceProgram,sourceApplicantType:clean(payload.applicant_type),
  };
}

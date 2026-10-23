import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";

function Notice({children}){return <div className="notice" role="note">{children}</div>;}
function NotificationCard({unread}){
  return <Card className="section-card span-6">
    <div className="section-header"><div><h2>Notifications</h2><p>{unread.length} unread notifications</p></div>
      <Link className="section-link" href="/student/notifications">View All</Link></div>
    {unread.length?<div className="list-stack">{unread.slice(0,3).map((item)=>
      <div className="list-item" key={item.id}><strong>{item.title}</strong><p>{item.message}</p></div>)}</div>
      :<Notice>No unread notifications for this account.</Notice>}
  </Card>;
}
function projectNextAction(data){
  const current=data.simulation?.status;
  if(current==="CONFIRMED_SIMULATION") return {title:"Review your demonstration enrollment",description:"The Registrar confirmed your classroom enrollment demonstration.",label:"View Registration Demonstration",href:"/student/enrollment"};
  if(["SUBMITTED","VALIDATED"].includes(current)) return {title:"Track Registrar enrollment review",description:"Your demonstration submission is read only while the Registrar processes it.",label:"View Enrollment Status",href:"/student/enrollment"};
  if(current==="RETURNED") return {title:"Review returned enrollment",description:"Check the prepared subjects and Registrar instructions before resubmitting.",label:"Review Returned Enrollment",href:"/student/enrollment"};
  if(data.canSubmit) return {title:"Review prepared subjects and submit",description:"Your compatible demonstration timetable and eligible subjects are ready for review.",label:"Review Enrollment",href:"/student/enrollment"};
  return {title:"Check enrollment requirements",description:data.blockingReasons?.[0]||"Enrollment requires an open period and completed academic preparation.",label:"View Enrollment Requirements",href:"/student/enrollment"};
}
function institutionalNextAction(data){
  const status=data.enrollment?.status;
  if(status==="CONFIRMED") return {title:"Enrollment confirmed",description:"Your official registration is confirmed. You can review your class schedule and registration details.",label:"View Class Schedule",href:"/student/class-schedule"};
  if(["SUBMITTED","FOR_VALIDATION","VALIDATED","NEEDS_ACADEMIC_REVIEW"].includes(status))
    return {title:"Enrollment is being processed",description:"Your submitted enrollment is now with the authorized PLP staff for review.",label:"Track Enrollment",href:"/student/enrollment"};
  if(status==="REQUIRES_CORRECTION") return {title:"Enrollment requires your attention",description:data.enrollment?.correctionReason||"Review the Registrar's correction request before continuing.",label:"Review Enrollment",href:"/student/enrollment"};
  if(status==="IN_PROGRESS") return {title:"Complete your subject selection",description:"Choose from your cleared subjects and finalized class sections, then submit for Registrar processing.",label:"Continue Enrollment",href:"/student/enrollment"};
  if(data.canStart) return {title:"Start your enrollment",description:"Your Admission handoff and academic preparation are ready for the current enrollment period.",label:"Start Enrollment",href:"/student/enrollment"};
  return {title:"Enrollment preparation is in progress",description:data.blockingReasons?.[0]||"Your PLP enrollment record is being prepared.",label:"View Enrollment Status",href:"/student/enrollment"};
}
function ProjectDashboard({data,unread}){
  const action=projectNextAction(data);
  const deficient=(data.previousResults||[]).filter((r)=>["FAILED","INCOMPLETE"].includes(r.result)).length;
  return <>
    <Card className="hero-card">
      <h2>Welcome, {data.student.name}</h2>
      <p>{data.student.number} · {data.student.program} · Year {data.student.yearLevel} · {String(data.student.type||"").replaceAll("_"," ")}</p>
      <div className="hero-meta">
        <span className="hero-chip">{data.term.label}</span>
        <span className="hero-chip">{displayCurriculumCode(data.student.curriculum)}</span>
        <span className="hero-chip">Classroom demonstration</span>
      </div>
      <p style={{marginTop:12}}>This classroom account uses demonstration academic records and is kept separate from institutional enrollment.</p>
      <Link className="portal-button portal-button-secondary" href="/student/student-profile">View Profile</Link>
    </Card>
    <div className="content-grid" style={{marginTop:16}}>
      <Card className="section-card span-7">
        <div className="section-header"><div><h2>Next Required Action</h2><p>{data.student.classification} · {data.student.progression?.replaceAll("_"," ")}</p></div></div>
        <Notice><strong>{action.title}</strong><p>{action.description}</p></Notice>
        <div className="action-row" style={{marginTop:12}}><Link className="portal-button portal-button-primary" href={action.href}>{action.label}</Link></div>
      </Card>
      <Card className="section-card span-5">
        <div className="section-header"><h2>Enrollment and Eligibility</h2></div>
        <div className="detail-list">
          <div className="detail-row"><span>Enrollment Review</span><StatusBadge value={data.simulation?.status||"NOT_STARTED"} /></div>
          <div className="detail-row"><span>Academic Classification</span><StatusBadge value={data.student.classification} /></div>
          <div className="detail-row"><span>Recorded Deficiencies</span><strong>{deficient}</strong></div>
          <div className="detail-row"><span>Enrollment Window</span><strong>{data.term.enrollmentStart} to {data.term.enrollmentEnd}</strong></div>
        </div>
      </Card>
      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Prepared Registration</h2><p>Classroom academic preparation</p></div>
          <Link className="section-link" href="/student/enrollment">View Subjects</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Prepared Home Block</span><strong>{data.homeBlock||"Not assigned"}</strong></div>
          <div className="info-item"><span>Eligible Subjects</span><strong>{data.proposedSubjects.length}</strong></div>
          <div className="info-item"><span>Prepared Units</span><strong>{data.proposedUnits}</strong></div>
        </div>
      </Card>
      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Academic Records</h2><p>Demonstration history and curriculum progress</p></div>
          <Link className="section-link" href="/student/academic-records">Open Academic Records</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Demonstration Results</span><strong>{data.previousResults.length}</strong></div>
          <div className="info-item"><span>Transfer Evaluations</span><strong>{data.transferCredits.length}</strong></div>
        </div>
      </Card>
      <NotificationCard unread={unread}/>
    </div>
  </>;
}
function InstitutionalDashboard({data,unread}){
  const action=institutionalNextAction(data);
  const selected=data.selectedSubjects?.length||0;
  const eligible=data.subjects?.filter((item)=>["ELIGIBLE","RETAKE"].includes(item.eligibility)).length||0;
  return <>
    <Card className="hero-card">
      <h2>Welcome, {data.student.name}</h2>
      <p>{data.student.number} · {data.student.program||"Program pending"} · {String(data.student.type||"").replaceAll("_"," ")}</p>
      <div className="hero-meta">
        <span className="hero-chip">{data.term?.label||"Academic term pending"}</span>
        <span className="hero-chip">{displayCurriculumCode(data.student.curriculum)||"Curriculum pending"}</span>
        <span className="hero-chip">{String(data.student.status||"Preparing").replaceAll("_"," ")}</span>
      </div>
      <p style={{marginTop:12}}>{data.admission?.status==="COMPLETED"
        ?"Your PLP Admissions handoff has been received by the Enrollment System."
        :"Your institutional student record is being prepared."}</p>
      <Link className="portal-button portal-button-secondary" href="/student/student-profile">View Profile</Link>
    </Card>
    <div className="content-grid" style={{marginTop:16}}>
      <Card className="section-card span-7">
        <div className="section-header"><div><h2>Next Required Action</h2><p>Official enrollment workflow</p></div></div>
        <Notice><strong>{action.title}</strong><p>{action.description}</p></Notice>
        <div className="action-row" style={{marginTop:12}}><Link className="portal-button portal-button-primary" href={action.href}>{action.label}</Link></div>
      </Card>
      <Card className="section-card span-5">
        <div className="section-header"><h2>Enrollment Status</h2></div>
        <div className="detail-list">
          <div className="detail-row"><span>Admission</span><StatusBadge value={data.admission?.status||"PENDING"} /></div>
          <div className="detail-row"><span>Student Record</span><StatusBadge value={data.student.status||"ADMITTED"} /></div>
          <div className="detail-row"><span>Enrollment</span><StatusBadge value={data.enrollment?.status||"NOT_STARTED"} /></div>
          <div className="detail-row"><span>Current Eligible Subjects</span><strong>{eligible}</strong></div>
          <div className="detail-row"><span>Selected Subjects</span><strong>{selected}</strong></div>
        </div>
      </Card>
      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Admission & Academic Preparation</h2><p>Enrollment-side preparation after Admissions handoff</p></div>
          <Link className="section-link" href="/student/student-profile">View Details</Link></div>
        <div className="info-grid">
          <div className="info-item"><span>Approved Program</span><strong>{data.admission?.program||data.student.program||"Pending"}</strong></div>
          <div className="info-item"><span>Academic Classification</span><strong>{data.student.classification||"Pending"}</strong></div>
          <div className="info-item"><span>Year Level</span><strong>{data.student.yearLevel||"Pending"}</strong></div>
        </div>
      </Card>
      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Academic Records</h2><p>Official PLP grades and approved transfer credits</p></div>
          <Link className="section-link" href="/student/academic-records">Open Academic Records</Link></div>
        <Notice>{data.student.type==="NEW_STUDENT"
          ?"New students may have no previous PLP academic results yet."
          :"Approved transfer credits and official PLP results appear here when available."}</Notice>
      </Card>
      <Card className="section-card span-6">
        <div className="section-header"><div><h2>Class Schedule</h2><p>Released after official Registrar confirmation</p></div>
          <Link className="section-link" href="/student/class-schedule">View Schedule</Link></div>
        <Notice>{data.enrollment?.status==="CONFIRMED"?"Your confirmed class schedule is available.":"Your official class schedule will appear after Registrar confirmation."}</Notice>
      </Card>
      <NotificationCard unread={unread}/>
    </div>
  </>;
}
export default function StudentDashboardLive({enrollment,notices}){
  if(enrollment.kind!=="ready") return <>
    <PageHeader title="Student Dashboard" description="Your academic and enrollment overview"/>
    <Card><Notice>Your authenticated student record is not available. Contact the System Administrator if your account was already activated.</Notice></Card>
  </>;
  const unread=notices.kind==="ready"?notices.items.filter((item)=>!item.read):[];
  return <>
    <PageHeader title="Student Dashboard" description="Your academic identity, enrollment condition, and next required action."/>
    {enrollment.mode==="institutional"
      ?<InstitutionalDashboard data={enrollment} unread={unread}/>
      :<ProjectDashboard data={enrollment} unread={unread}/>}
  </>;
}

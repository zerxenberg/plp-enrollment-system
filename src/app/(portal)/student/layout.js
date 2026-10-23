import PortalLayout from "@/components/layout/PortalLayout";
import { redirect } from "next/navigation";
import { getProjectOnlyInitialPasswordState } from "@/lib/auth/project-only-first-login-server";
import ProjectOnlyStudentModuleBoundary from "@/components/student/ProjectOnlyStudentModuleBoundary";
import { getStudentContext } from "@/features/students/student-context-server";
import { loadStudentNotifications } from "@/features/students/student-notifications-server";

export default async function StudentPortalLayout({children}){
  const state=await getProjectOnlyInitialPasswordState().catch(()=>({kind:"denied"}));
  if(state.kind==="required") redirect("/student/change-password");
  if(state.kind==="anonymous"||state.kind==="denied"||
      (state.kind==="legacy"&&state.account.role_code!=="student")) redirect("/");

  const context=await getStudentContext();
  if(!["project","institutional"].includes(context.kind)) redirect("/");

  let term=null,notifications=[];
  const accountDisplay={full_name:context.account.full_name,source_account_key:context.studentNumber};

  try{
    if(context.kind==="project"){
      const [termResult,notificationResult,windowResult]=await Promise.all([
        context.admin.from("academic_terms")
          .select("short_label,enrollment_start,enrollment_end").eq("id","TERM-2026-1").maybeSingle(),
        loadStudentNotifications({limit:5}),
        context.admin.from("project_phase8_demo_enrollment_window")
          .select("project_cohort_id,term_id,start_date,end_date,status,source_type,verified_institutionally")
          .eq("project_cohort_id","PLP_PROJECT_600_2026_1").maybeSingle(),
      ]);
      if(!termResult.error&&termResult.data){
        const demo=!windowResult.error&&windowResult.data?.term_id==="TERM-2026-1"&&
          windowResult.data?.source_type==="PROJECT_ONLY_FICTIONAL"&&
          windowResult.data?.verified_institutionally===false?windowResult.data:null;
        term={
          shortLabel:termResult.data.short_label||"TERM-2026-1",
          enrollmentStart:demo?.start_date||termResult.data.enrollment_start,
          enrollmentEnd:demo?.end_date||termResult.data.enrollment_end,
          isDemonstration:Boolean(demo),
        };
      }
      notifications=notificationResult.kind==="ready"?notificationResult.items.map((item)=>({
        ...item,date:item.date?new Date(item.date).toLocaleString("en-PH"):"",
      })):[];
    }else{
      const [termResult,notificationResult]=await Promise.all([
        context.profile.current_term_id
          ?context.admin.from("academic_terms")
              .select("short_label,label,enrollment_start,enrollment_end")
              .eq("id",context.profile.current_term_id).maybeSingle()
          :Promise.resolve({data:null,error:null}),
        loadStudentNotifications({limit:5}),
      ]);
      if(!termResult.error&&termResult.data){
        term={
          shortLabel:termResult.data.short_label||termResult.data.label,
          enrollmentStart:termResult.data.enrollment_start,
          enrollmentEnd:termResult.data.enrollment_end,
          isDemonstration:false,
        };
      }
      notifications=notificationResult.kind==="ready"?notificationResult.items.map((item)=>({
        ...item,date:item.date?new Date(item.date).toLocaleString("en-PH"):"",
      })):[];
    }
  }catch(error){
    console.error("[Student Portal][Layout][ERROR]",{
      mode:context.kind,message:error instanceof Error?error.message:String(error),
    });
  }

  return <PortalLayout role="student" projectOnly={context.kind==="project"}
    authUser={accountDisplay} portalTerm={term} portalNotifications={notifications}>
    <ProjectOnlyStudentModuleBoundary authenticatedProfile={{mode:context.kind}}>
      {children}
    </ProjectOnlyStudentModuleBoundary>
  </PortalLayout>;
}

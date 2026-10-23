"use client";

import { useState, useTransition } from "react";
import { Button, Card, Modal, PageHeader, StatusBadge } from "@/components/ui/PortalUI";
import { displayCurriculumCode } from "@/features/academic/project-academic-display-aliases.mjs";
import {
  changeStudentProfilePassword,
  saveStudentContact,
  uploadStudentPhoto,
  removeStudentPhoto,
} from "@/features/students/student-profile-actions";

function Detail({label,value}){
  return <div className="detail-row"><span>{label}</span><strong>{value||"Not available"}</strong></div>;
}

export default function StudentProfile({mode="unavailable",profile}){
  const [pending,startTransition]=useTransition();
  const [dialog,setDialog]=useState(null),[feedback,setFeedback]=useState("");
  const [contact,setContact]=useState(profile?.contact||{contactNumber:"",alternateContactNumber:"",address:""});
  const [draft,setDraft]=useState(contact);
  const [photoUrl,setPhotoUrl]=useState(profile?.photoUrl||null);
  const [photo,setPhoto]=useState(null);
  const [password,setPassword]=useState({currentPassword:"",newPassword:"",confirmation:""});

  if(!profile||!["project","live"].includes(mode)) return <>
    <PageHeader title="Student Profile" description="View your student account information."/>
    <Card><div className="notice">Student Profile is temporarily unavailable. Please sign in again or contact the System Administrator.</div></Card>
  </>;

  const isProject=mode==="project";
  function run(action,onSuccess){
    startTransition(async()=>{
      const result=await action().catch((error)=>({ok:false,message:error?.message||"The action could not be completed."}));
      setFeedback(result.message||"");
      if(result.ok) onSuccess?.(result);
    });
  }

  return <>
    <PageHeader title="Student Profile"
      description="Review your student identity, contact details, academic information, admission record and account security."/>
    {isProject?<div className="notice" style={{marginBottom:16}}>
      Classroom demonstration. This fictional student identity is kept separate from institutional PLP student records.
    </div>:null}
    {feedback?<div className="notice" role="status" style={{marginBottom:16}}>{feedback}</div>:null}

    <div className="content-grid">
      <Card className="section-card span-4">
        <div style={{textAlign:"center"}}>
          {photoUrl?<img src={photoUrl} alt="Student profile" style={{width:120,height:120,borderRadius:"50%",objectFit:"cover"}}/>
            :<div style={{width:120,height:120,borderRadius:"50%",margin:"0 auto",display:"grid",placeItems:"center",background:"#eef4ef",fontSize:34}}>👤</div>}
          <h2 style={{marginTop:12}}>{profile.fullName}</h2>
          <p>{profile.studentNumber}</p>
          <div className="action-row" style={{justifyContent:"center",marginTop:10}}>
            <Button variant="secondary" onClick={()=>setDialog("photo")}>{photoUrl?"Change Photo":"Upload Photo"}</Button>
          </div>
        </div>
      </Card>

      <Card className="section-card span-8">
        <div className="section-header"><h2>Academic Information</h2></div>
        <div className="detail-list">
          <Detail label="Program" value={profile.program}/>
          <Detail label="Year Level" value={profile.yearLevel}/>
          <Detail label="Student Type" value={String(profile.studentType||"").replaceAll("_"," ")}/>
          <Detail label="Curriculum" value={displayCurriculumCode(profile.curriculum)}/>
          <Detail label="Academic Classification" value={profile.academicClassification}/>
          <Detail label="Enrollment Eligibility" value={profile.enrollmentEligibility}/>
          <div className="detail-row"><span>Student Status</span><StatusBadge value={profile.studentStatus||"ACTIVE"}/></div>
          <div className="detail-row"><span>Enrollment Status</span><StatusBadge value={profile.officialEnrollmentStatus||profile.projectEnrollmentStatus||"NOT_STARTED"}/></div>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><h2>Contact Information</h2>
          <Button variant="ghost" onClick={()=>{setDraft(contact);setDialog("contact");}}>Edit</Button></div>
        <div className="detail-list">
          <Detail label="Registered Email" value={profile.email}/>
          <Detail label="Mobile Number" value={contact.contactNumber}/>
          <Detail label="Alternate Contact" value={contact.alternateContactNumber}/>
          <Detail label="Address" value={contact.address}/>
        </div>
      </Card>

      <Card className="section-card span-6">
        <div className="section-header"><h2>Admission Record</h2></div>
        {isProject?<div className="notice">This classroom account has no institutional Admission approval.</div>
          :profile.admission?<div className="detail-list">
            <Detail label="Admission Source" value={profile.admission.source}/>
            <Detail label="Admission Decision" value={profile.admission.decision}/>
            <Detail label="Applicant Type" value={String(profile.admission.type||"").replaceAll("_"," ")}/>
            <Detail label="Approved Program" value={profile.admission.program}/>
            <Detail label="Admission Date" value={profile.admission.date}/>
          </div>:<div className="notice">No verified PLP Admissions handoff is linked to this student record.</div>}
      </Card>

      <Card className="section-card span-12">
        <div className="section-header"><h2>Account & Security</h2></div>
        <div className="detail-list">
          <Detail label="Registered Email" value={profile.email}/>
          <Detail label="Account Status" value={profile.accountStatus}/>
        </div>
        <div className="action-row" style={{marginTop:12}}>
          <Button variant="secondary" onClick={()=>setDialog("password")}>Change Password</Button>
        </div>
      </Card>
    </div>

    <Modal open={dialog==="contact"} title="Edit Contact Information" onClose={()=>!pending&&setDialog(null)}
      footer={<><Button variant="ghost" disabled={pending} onClick={()=>setDialog(null)}>Cancel</Button>
        <Button disabled={pending} onClick={()=>run(()=>saveStudentContact(draft),(result)=>{
          setContact(result.contact);setDialog(null);
        })}>{pending?"Saving...":"Save Changes"}</Button></>}>
      <div className="form-grid">
        <label className="field"><span>Mobile Number</span><input value={draft.contactNumber}
          onChange={(e)=>setDraft({...draft,contactNumber:e.target.value})}/></label>
        <label className="field"><span>Alternate Contact Number</span><input value={draft.alternateContactNumber}
          onChange={(e)=>setDraft({...draft,alternateContactNumber:e.target.value})}/></label>
        <label className="field full"><span>Address</span><textarea rows={3} value={draft.address}
          onChange={(e)=>setDraft({...draft,address:e.target.value})}/></label>
      </div>
    </Modal>

    <Modal open={dialog==="photo"} title="Profile Photo" onClose={()=>!pending&&setDialog(null)}
      footer={<><Button variant="ghost" disabled={pending} onClick={()=>setDialog(null)}>Cancel</Button>
        {photoUrl?<Button variant="secondary" disabled={pending} onClick={()=>run(removeStudentPhoto,(result)=>{
          setPhotoUrl(result.photoUrl);setDialog(null);
        })}>Remove Photo</Button>:null}
        <Button disabled={pending||!photo} onClick={()=>{
          const form=new FormData();form.set("photo",photo);
          run(()=>uploadStudentPhoto(form),(result)=>{setPhotoUrl(result.photoUrl);setDialog(null);setPhoto(null);});
        }}>{pending?"Uploading...":"Save Photo"}</Button></>}>
      <label className="field full"><span>Choose JPG, PNG or WebP (max 2 MB)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>setPhoto(e.target.files?.[0]||null)}/></label>
    </Modal>

    <Modal open={dialog==="password"} title="Change Password" onClose={()=>!pending&&setDialog(null)}
      footer={<><Button variant="ghost" disabled={pending} onClick={()=>setDialog(null)}>Cancel</Button>
        <Button disabled={pending} onClick={()=>run(()=>changeStudentProfilePassword(password),()=>{
          setPassword({currentPassword:"",newPassword:"",confirmation:""});setDialog(null);
        })}>{pending?"Updating...":"Change Password"}</Button></>}>
      <div className="form-grid">
        <label className="field full"><span>Current Password</span><input type="password" value={password.currentPassword}
          onChange={(e)=>setPassword({...password,currentPassword:e.target.value})}/></label>
        <label className="field full"><span>New Password</span><input type="password" value={password.newPassword}
          onChange={(e)=>setPassword({...password,newPassword:e.target.value})}/></label>
        <label className="field full"><span>Confirm New Password</span><input type="password" value={password.confirmation}
          onChange={(e)=>setPassword({...password,confirmation:e.target.value})}/></label>
      </div>
    </Modal>
  </>;
}

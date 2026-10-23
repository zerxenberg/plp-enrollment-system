"use server";

import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getStudentContext } from "@/features/students/student-context-server";
import { isOwnStudentPhotoPath } from "./student-profile-photo-path.mjs";

const BUCKET="student-profile-photos";
const PROFILE_PATH="/student/student-profile";
const MAX_IMAGE_BYTES=2*1024*1024;

function denied(){return {ok:false,message:"Your Student account could not be verified. Please sign in again."};}
function validContext(ctx){return ["project","institutional"].includes(ctx?.kind);}
function cleanText(value,limit,field){
  if(typeof value!=="string"||value.length>limit*2) throw new Error(`Invalid ${field}.`);
  const text=value.trim();
  if(text.length>limit||/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`Invalid ${field}.`);
  return text||null;
}
function cleanPhone(value,field){
  const phone=cleanText(value,24,field);
  if(phone&&!/^[+()\d .-]{5,24}$/.test(phone)) throw new Error(`Use a valid ${field.toLowerCase()}.`);
  return phone;
}

export async function saveStudentContact(values){
  const ctx=await getStudentContext();
  if(!validContext(ctx)) return denied();
  let update;
  try{
    update={
      contact_number:cleanPhone(values?.contactNumber,"Mobile number"),
      alternate_contact_number:cleanPhone(values?.alternateContactNumber,"Alternate contact number"),
      address:cleanText(values?.address,240,"address"),
    };
  }catch(error){return {ok:false,message:error.message};}

  const {data,error}=await ctx.client.from("student_profiles")
    .update(update).eq("id",ctx.studentId).eq("user_id",ctx.appUserId)
    .select("contact_number,alternate_contact_number,address").single();
  if(error||!data){
    console.error("[Student Portal][Profile Contact][ERROR]",{message:error?.message||"No updated profile returned"});
    return {ok:false,message:"Unable to save contact information. Please try again."};
  }
  revalidatePath(PROFILE_PATH);
  return {ok:true,message:"Contact information saved.",contact:{
    contactNumber:data.contact_number||"",alternateContactNumber:data.alternate_contact_number||"",
    address:data.address||"",
  }};
}

function imageFormat(buffer){
  if(buffer.length>24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&
      buffer.toString("ascii",12,16)==="IHDR"&&buffer.readUInt32BE(16)>0&&buffer.readUInt32BE(20)>0)
    return {type:"image/png",ext:"png"};
  if(buffer.length>8&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff&&
      buffer.at(-2)===0xff&&buffer.at(-1)===0xd9) return {type:"image/jpeg",ext:"jpg"};
  if(buffer.length>16&&buffer.toString("ascii",0,4)==="RIFF"&&
      buffer.toString("ascii",8,12)==="WEBP"&&["VP8 ","VP8L","VP8X"].includes(buffer.toString("ascii",12,16)))
    return {type:"image/webp",ext:"webp"};
  return null;
}

export async function uploadStudentPhoto(formData){
  const ctx=await getStudentContext();
  if(!validContext(ctx)) return denied();
  const file=formData?.get?.("photo");
  if(!file||typeof file.arrayBuffer!=="function"||file.size<24||file.size>MAX_IMAGE_BYTES)
    return {ok:false,message:"Choose a JPG, PNG or WebP image smaller than 2 MB."};

  let contents;
  try{contents=Buffer.from(await file.arrayBuffer());}
  catch{return {ok:false,message:"Could not read the selected photo."};}
  if(contents.length!==file.size||contents.length>MAX_IMAGE_BYTES)
    return {ok:false,message:"Image exceeds the 2 MB limit."};
  const format=imageFormat(contents);
  if(!format||format.type!==file.type)
    return {ok:false,message:"The selected file is not a valid JPG, PNG or WebP image."};

  const {data:existing,error:readError}=await ctx.admin.from("student_profile_photos")
    .select("object_path").eq("student_id",ctx.studentId).maybeSingle();
  if(readError) return {ok:false,message:"Photo storage is unavailable. Please try again."};
  if(existing?.object_path&&!isOwnStudentPhotoPath(existing.object_path,ctx.authUser.id))
    return {ok:false,message:"Saved photo information is invalid. Contact the System Administrator."};

  const path=`${ctx.authUser.id}/${randomUUID()}.${format.ext}`;
  if(!isOwnStudentPhotoPath(path,ctx.authUser.id)) return denied();

  const bucket=ctx.admin.storage.from(BUCKET);
  const {error:uploadError}=await bucket.upload(path,contents,{
    contentType:format.type,cacheControl:"60",upsert:false,
  });
  if(uploadError){
    console.error("[Student Portal][Profile Photo][UPLOAD][ERROR]",{message:uploadError.message});
    return {ok:false,message:"Unable to upload this photo."};
  }

  const {error:saveError}=await ctx.admin.from("student_profile_photos").upsert({
    student_id:ctx.studentId,auth_user_id:ctx.authUser.id,object_path:path,
    updated_at:new Date().toISOString(),
  },{onConflict:"student_id"});
  if(saveError){
    await bucket.remove([path]).catch(()=>null);
    console.error("[Student Portal][Profile Photo][SAVE][ERROR]",{message:saveError.message});
    return {ok:false,message:"Unable to save the new profile photo."};
  }

  if(existing?.object_path&&existing.object_path!==path){
    const {error:cleanupError}=await bucket.remove([existing.object_path]);
    if(cleanupError) console.warn("[Student Portal][Profile Photo][CLEANUP][WARN]",{message:cleanupError.message});
  }
  const {data:signed}=await bucket.createSignedUrl(path,900);
  revalidatePath(PROFILE_PATH);
  return {ok:true,message:"Profile photo updated.",photoUrl:signed?.signedUrl||null};
}

export async function removeStudentPhoto(){
  const ctx=await getStudentContext();
  if(!validContext(ctx)) return denied();
  const {data:existing,error:lookupError}=await ctx.admin.from("student_profile_photos")
    .select("object_path").eq("student_id",ctx.studentId).maybeSingle();
  if(lookupError) return {ok:false,message:"Unable to check the saved photo."};
  if(!existing) return {ok:true,message:"No profile photo to remove.",photoUrl:null};
  if(!isOwnStudentPhotoPath(existing.object_path,ctx.authUser.id))
    return {ok:false,message:"Saved photo information is invalid. Contact the System Administrator."};

  const {error}=await ctx.admin.from("student_profile_photos")
    .delete().eq("student_id",ctx.studentId).eq("auth_user_id",ctx.authUser.id);
  if(error) return {ok:false,message:"Unable to remove profile photo."};
  const {error:cleanupError}=await ctx.admin.storage.from(BUCKET).remove([existing.object_path]);
  if(cleanupError) console.warn("[Student Portal][Profile Photo][REMOVE FILE][WARN]",{message:cleanupError.message});
  revalidatePath(PROFILE_PATH);
  return {ok:true,message:"Profile photo removed.",photoUrl:null};
}

export async function changeStudentProfilePassword(values){
  const ctx=await getStudentContext();
  if(!validContext(ctx)||!ctx.authUser.email) return denied();
  const current=values?.currentPassword,password=values?.newPassword,confirm=values?.confirmation;
  if(typeof current!=="string"||current.length<1||typeof password!=="string"||
      password.length<14||password.length>128||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||
      !/[0-9]/.test(password)||!/[^A-Za-z0-9]/.test(password)||password!==confirm||password===current)
    return {ok:false,message:"Enter your current password and a different new password of 14 to 128 characters with uppercase, lowercase, number and symbol. Confirm it exactly."};

  const reauthClient=createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},
  );
  const {data:verified,error:verifyError}=await reauthClient.auth.signInWithPassword({
    email:ctx.authUser.email,password:current,
  });
  if(verifyError||verified?.user?.id!==ctx.authUser.id)
    return {ok:false,message:"Current password is incorrect or could not be verified."};

  const {error}=await ctx.client.auth.updateUser({password});
  if(error){
    console.error("[Student Portal][Password][ERROR]",{message:error.message});
    return {ok:false,message:"Unable to update your password. Please try again."};
  }
  return {ok:true,message:"Password changed successfully."};
}

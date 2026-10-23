import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOwnStudentPhotoPath } from "../src/features/students/student-profile-photo-path.mjs";

const sql = readFileSync(new URL(
  "../supabase/migrations/20261023080100_student_profile_contact_and_private_photos.sql",
  import.meta.url), "utf8");
const actions = readFileSync(new URL(
  "../src/features/students/student-profile-actions.js", import.meta.url), "utf8");
const loader = readFileSync(new URL(
  "../src/features/students/student-profile-server.js", import.meta.url), "utf8");
const context = readFileSync(new URL(
  "../src/features/students/student-context-server.js", import.meta.url), "utf8");
const projectGuard = readFileSync(new URL(
  "../supabase/migrations/20261020074600_project_only_initial_password_rotation.sql",
  import.meta.url), "utf8");

const owner = "2b46e1dd-ffab-48af-8b00-1a0b02d7a98a";
const other = "c3bcad5e-f0eb-4f02-ab0f-ddd91fa7f993";
const photo = "927442a9-003d-4cc7-97d6-44ce044d92ab";

test("only one canonical UUID image directly below the signed-in owner's folder is permitted", () => {
  for (const extension of ["jpg", "png", "webp"]) {
    assert.equal(isOwnStudentPhotoPath(`${owner}/${photo}.${extension}`, owner), true);
  }
  for (const invalid of [
    `${other}/${photo}.jpg`, `${owner}/nested/${photo}.jpg`,
    `${owner}/${photo}.jpg/another`, `${owner}/${photo}.jpg.exe`,
    `${owner}/${photo}.jpeg`, `${owner}/${photo}.JPG`,
    `${owner}/${photo.replaceAll("-", "")}.jpg`,
    `${owner}/zzzzzzzz-003d-4cc7-97d6-44ce044d92ab.jpg`,
    `${owner}/../${photo}.jpg`, `${owner}//${photo}.jpg`,
  ]) assert.equal(isOwnStudentPhotoPath(invalid, owner), false, invalid);
  assert.equal(isOwnStudentPhotoPath(`${owner}/${photo}.jpg`, "NOT-A-UUID"), false);
});

test("SQL metadata path constraint enforces canonical UUID and literal extension dot", () => {
  const check = sql.match(/CONSTRAINT student_profile_photo_path CHECK\s*\(\s*object_path ~ \('\^' \|\| auth_user_id::text \|\|\s*'([^']+)'\)\s*\)/s);
  assert.ok(check, "missing SQL owner-anchored path constraint");
  const regexp = new RegExp(`^${owner}${check[1]}`);
  assert.ok(regexp.test(`${owner}/${photo}.png`));
  assert.equal(regexp.test(`${owner}/${photo}.png.exe`), false);
  assert.equal(regexp.test(`${owner}/nested/${photo}.png`), false);
  assert.equal(regexp.test(`${other}/${photo}.png`), false);
  assert.equal(regexp.test(`${owner}/${photo.replaceAll("-", "")}.png`), false);
});

test("storage.objects is left under existing RLS; no postgres-owned policies attempted", () => {
  assert.doesNotMatch(sql, /\bCREATE\s+POLICY\s+\w+\s+ON\s+storage\.objects\b/i);
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\s+storage\.objects\b/i);
  assert.match(sql, /storage\.buckets\(id,name,public,file_size_limit,allowed_mime_types\)/);
  assert.match(sql, /'student-profile-photos','student-profile-photos',false,2097152/);
  assert.match(sql, /c\.relname='objects' AND c\.relrowsecurity/);
  assert.match(sql, /schemaname='storage' AND tablename='objects'/);
  assert.match(sql, /ALTER TABLE public\.student_profile_photos ENABLE ROW LEVEL SECURITY/);
  for (const operation of ["read", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`CREATE POLICY student_profile_photos_${operation}\\b`));
  }
  assert.match(sql, /public\.project_auth_can_view_self_v1\(s\.user_id\)/);
});

test("all privileged Storage operations are behind server-only, rotated PROJECT_ONLY context", () => {
  assert.match(context, /state\.kind !== "complete"/);
  assert.match(context, /link\.state !== "ACTIVE"/);
  assert.match(context, /!link\.initial_password_changed_at/);
  assert.match(projectGuard, /l\.state='ACTIVE' AND l\.auth_user_id=auth\.uid\(\)/);
  assert.match(projectGuard, /l\.initial_password_changed_at IS NOT NULL/);
  assert.match(loader, /getStudentContext\(\)/);
  assert.match(loader, /isOwnStudentPhotoPath\(photo\.object_path, ctx\.authUser\.id\)/);
  assert.match(loader, /ctx\.admin\.storage/);
  for (const action of ["uploadStudentPhoto", "removeStudentPhoto"]) {
    assert.match(actions, new RegExp(`export async function ${action}\\([^)]*\\) \\{\\s*const ctx = await getStudentContext\\(\\)`));
  }
  assert.match(actions, /ctx\.admin\.storage\.from\(BUCKET\)/);
  assert.doesNotMatch(actions, /ctx\.client\.storage/);
  assert.doesNotMatch(loader, /ctx\.client\.storage/);
  assert.match(actions, /isOwnStudentPhotoPath\(existing\.object_path, ctx\.authUser\.id\)/);
  assert.match(actions, /isOwnStudentPhotoPath\(path, ctx\.authUser\.id\)/);
  assert.match(actions, /onConflict: "student_id"/);
});

test("photo replacement commits owner metadata before removing the old private object", () => {
  const upload = actions.match(/export async function uploadStudentPhoto\(formData\) \{([\s\S]*?)\n\}\n\nexport async function removeStudentPhoto/);
  assert.ok(upload);
  const text = upload[1];
  const uploaded = text.indexOf("await bucket.upload(path, contents");
  const metadataSaved = text.indexOf(".upsert({ student_id: ctx.studentId");
  const previousDeleted = text.indexOf("await bucket.remove([existing.object_path])");
  const rollback = text.indexOf("await bucket.remove([path])");
  assert.ok(uploaded >= 0 && metadataSaved > uploaded && previousDeleted > metadataSaved);
  assert.ok(rollback > metadataSaved && rollback < previousDeleted);
  assert.match(text, /priorCleanupFailed = Boolean\(cleanupError\)/);
  assert.match(text, /cleanupError\s*\? "Photo save failed\. Uploaded file cleanup requires administrator attention\./);
});

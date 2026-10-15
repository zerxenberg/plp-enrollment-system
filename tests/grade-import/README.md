# Official Grades Import Test Workbooks

Use these synthetic data files to demonstrate spreadsheet upload and validation in the Registrar's Official Grades Import UI. No real student records or official university grade decisions are represented.

Generate the workbooks with:

```powershell
node scripts/generate-grade-test-files.cjs
```

The generator requires the `xlsx` npm dependency.

## Run the demo

Start the existing application with `npm run dev`. Sign in using the existing Registrar demo account, open **Students → Official Grades Import → Upload Grades**, enter a **Demo Source Verification Reference**, and choose one of the generated Excel files. The academic year, semester, program, subject, and section are fixed to the sample historical offering so spreadsheet rows can be reconciled to the explicitly created synthetic confirmed attempts.

Choose **Parse & Preview File**, **Create Import Batch**, and **Run Validation**. The invalid workbook should block publication. The valid workbook will pass technical validation with a nonblocking historical-term warning. For the valid workbook, confirm **Simulated Verification** before using **Publish Demo Results** and the final confirmation dialog.

After publication, log out of the Registrar demo account and sign in as Juan Dela Cruz using ID `2024-00123` and the project's demo Student password. Open **Academic Records → Subject History** and find IT204, 1.75, COMPLETED. Katrina Mendoza (`2026-01896`) and Dencie Aquino (`2026-00108`) use the same demo Student password and receive their own 5.00 FAILED and INC INCOMPLETE results, respectively. These are simulated results and have no institutional authority.

## Testing and isolated reset

Run `node scripts/test-grade-import.mjs` for parsing, blocking validation, publication, revision and persistence checks. Run `node scripts/test-grade-import-browser.cjs` while a locally accessible Next.js server is running. For a different URL, set the `PLP_TEST_ORIGIN` environment variable before running the browser test; the test uses a separate headless Chrome profile.

To reset imports in the development build, open the browser Developer Tools console in any portal and run `window.plpGradeDemoReset()`, then refresh. This clears only the grade import feature's simulated batches, publications, revisions and related notifications. It does not delete existing mock student accounts or enrollment records. This developer control is omitted from production builds.

The grade import state is saved in the same browser origin's localStorage. Grade records update between tabs through storage notifications but the currently selected mock login is also browser scoped. For simultaneous access as different demo roles, use separate browser profiles. These role checks are demonstrations rather than real authorization.

| Workbook | Content |
| --- | --- |
| `PLP_Official_Grades_Import_Template.xlsx` | Exact header row, ready for data entry |
| `PLP_Mock_Official_Student_Grades_Valid.xlsx` | Three synthetic confirmed historical attempts in one batch |
| `PLP_Mock_Official_Student_Grades_Invalid.xlsx` | Seven data rows covering six deliberate validation failures |

Every workbook uses the same ten columns in this exact order:

```text
student_number,student_full_name,subject_code,academic_year,semester,section_code,grade_value,completion_status,source_record_reference,Subject_name
```

The valid batch uses subject `IT204` (`Object Oriented Programming`), academic year `2025 to 2026`, `Second Semester`, and block section `BSIT-2A`.

| Student | Student number | Grade | Completion status |
| --- | --- | --- | --- |
| Juan Dela Cruz | `2024-00123` | `1.75` | `COMPLETED` |
| Katrina Mendoza | `2026-01896` | `5.00` | `FAILED` |
| Dencie Aquino | `2026-00108` | `INC` | `INCOMPLETE` |

The invalid file deliberately contains:

| Excel row | Expected reason |
| --- | --- |
| 2 | Unknown student number `2099-99999` |
| 3 | Wrong subject code `IT999` |
| 4 | Wrong semester `First Semester` |
| 5 and 6 | Duplicate student, subject, term, and section attempt |
| 7 | Unsupported completion status `PASSED` |
| 8 | Missing required `section_code` |

The spreadsheet values for student numbers, grade values, and source record references are stored as text. Every supplied source record reference is unique, including the deliberate duplicate attempt pair.

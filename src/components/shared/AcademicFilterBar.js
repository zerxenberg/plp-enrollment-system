"use client";

import { Button, FilterControl } from "@/components/ui/PortalUI";
import { ALL_ACADEMIC_FILTERS, academicFilterSummary, getAcademicFilterOptions } from "@/features/students/academic-student-filters";

export default function AcademicFilterBar({
  records, enrollments = [], programs, departments, value, onChange, matchingCount,
  label = "Academic record filters", showSection = true,
}) {
  const choices = getAcademicFilterOptions(records, value, enrollments, programs, departments);
  const active = academicFilterSummary(value);
  return (
    <section aria-label={label}>
      <div className="toolbar">
        <FilterControl label="College Department" value={value.department} onChange={(next) => onChange("department", next)} options={choices.department} />
        <FilterControl label="Program" value={value.program} onChange={(next) => onChange("program", next)} options={choices.program} />
        {choices.major.length > 1 ? <FilterControl label="Major / Specialization" value={value.major} onChange={(next) => onChange("major", next)} options={choices.major} /> : null}
        <FilterControl label="Academic Year" value={value.academicYear} onChange={(next) => onChange("academicYear", next)} options={choices.academicYear} />
        <FilterControl label="Semester" value={value.semester} onChange={(next) => onChange("semester", next)} options={choices.semester} />
        {choices.yearLevel.length > 1 ? (
          <FilterControl label="Year Level" value={value.yearLevel} onChange={(next) => onChange("yearLevel", next)} options={choices.yearLevel} />
        ) : (
          <label className="control-field select-field">
            <span>Year Level (not recorded)</span>
            <select aria-label="Year level unavailable in demo records" value="ALL" disabled><option value="ALL">All Year Levels</option></select>
          </label>
        )}
        {showSection ? <FilterControl label="Class Section" value={value.section} onChange={(next) => onChange("section", next)} options={choices.section} /> : null}
        {active.length ? <Button type="button" variant="ghost" onClick={() => onChange(null, ALL_ACADEMIC_FILTERS)}>Clear Academic Filters</Button> : null}
      </div>
      <div className="summary-strip" role="status" aria-live="polite" style={{ marginBottom: 14 }}>
        <span><strong>{matchingCount}</strong> of {records.length} records match</span>
        <span>{active.length ? active.join(" · ") : "All academic filters"}</span>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Button, DataTable, FilterControl, InternalTabs, PageHeader, StatusBadge } from "@/components/ui/PortalUI";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function StudentClassSchedule() {
  const { student } = useDemoData();
  const [view, setView] = useState("Weekly Schedule");
  const [dayFilter, setDayFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const schedule = student.confirmedSchedule;
  const filteredItems = schedule.items.filter((item) =>
    (dayFilter === "ALL" || item.day === dayFilter) &&
    (subjectFilter === "ALL" || item.code === subjectFilter)
  );
  const visibleDays = dayFilter === "ALL" ? DAYS : DAYS.filter((day) => day === dayFilter);

  return (
    <>
      <PageHeader
        title="Class Schedule"
        description="View your confirmed personal class schedule and print a copy for reference."
        actions={<Button variant="secondary" onClick={() => window.print()}>Print Schedule</Button>}
      />

      {student.enrollment.status !== "CONFIRMED" ? (
        <div className="notice warning" style={{ marginBottom: 16 }}>
          Your active term enrollment is not yet confirmed. The schedule below is your latest confirmed schedule. Preview current proposed sections inside Enrollment.
        </div>
      ) : null}

      <InternalTabs
        items={["Weekly Schedule", "List View"].map((item) => ({ value: item, label: item }))}
        selected={view}
        onSelect={setView}
        label="Class schedule views"
        panelCard
      >
        <div className="section-header">
          <div>
            <h2>{schedule.term}</h2>
            <p>Confirmed schedule record</p>
          </div>
          <StatusBadge value="CONFIRMED" />
        </div>
        <div className="toolbar">
          <FilterControl
            label="Day"
            value={dayFilter}
            onChange={setDayFilter}
            options={[
              { value: "ALL", label: "All days" },
              ...DAYS.map((day) => ({ value: day, label: day })),
            ]}
          />
          <FilterControl
            label="Subject"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={[
              { value: "ALL", label: "All subjects" },
              ...schedule.items.map((item) => ({ value: item.code, label: `${item.code} • ${item.name}` })),
            ]}
          />
        </div>

        {view === "Weekly Schedule" ? (
          <div className="schedule-grid" style={{ gridTemplateColumns: `70px repeat(${visibleDays.length}, minmax(120px, 1fr))` }}>
            <div className="schedule-cell header">Time</div>
            {visibleDays.map((day) => <div className="schedule-cell header" key={day}>{day}</div>)}
            <div className="schedule-cell header">Classes</div>
            {visibleDays.map((day) => {
              const items = filteredItems.filter((item) => item.day === day);
              return (
                <div className="schedule-cell" key={day}>
                  {items.length ? items.map((item) => (
                    <div className="schedule-event" key={`${item.code}-${item.section}`}>
                      {item.code}<br />{item.start} to {item.end}<br />{item.room}
                    </div>
                  )) : "No class"}
                </div>
              );
            })}
          </div>
        ) : (
          <DataTable
            rowKey={(row) => `${row.code}-${row.section}`}
            rows={filteredItems}
            columns={[
              { key: "code", label: "Subject Code" },
              { key: "name", label: "Subject Name" },
              { key: "section", label: "Section" },
              { key: "day", label: "Day" },
              { key: "time", label: "Time", render: (row) => `${row.start} to ${row.end}` },
              { key: "room", label: "Room" },
              { key: "instructor", label: "Instructor" },
            ]}
          />
        )}
      </InternalTabs>
    </>
  );
}

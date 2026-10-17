
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Button,
  FilterControl,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import {
  Feedback,
  Panel,
} from "@/components/registrar/RegistrarShared";
import {
  markAllSystemAdministratorNotifications,
  markSystemAdministratorNotification,
} from "@/features/system-administration/system-admin-actions";

export default function SystemAdministratorNotifications({
  notifications,
}) {
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [feedback, setFeedback] = useState("");
  const [feedbackWarning, setFeedbackWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(
    () => [...new Set(notifications.map((item) => item.category).filter(Boolean))],
    [notifications],
  );

  const visible = notifications.filter((item) => {
    const searchable = `${item.title} ${item.message} ${item.category}`.toLowerCase();
    return (
      searchable.includes(search.toLowerCase()) &&
      (readFilter === "ALL" ||
        (readFilter === "UNREAD" ? !item.read : item.read)) &&
      (categoryFilter === "ALL" ||
        item.category === categoryFilter)
    );
  });

  function runAction(action) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result.message);
      setFeedbackWarning(!result.ok);
    });
  }

  return (
    <>
      <PageHeader
        title="Technical Alerts"
        description="Live System Administrator notifications stored in Supabase."
        actions={
          <Button
            variant="secondary"
            disabled={
              isPending || !notifications.some((item) => !item.read)
            }
            onClick={() =>
              runAction(markAllSystemAdministratorNotifications)
            }
          >
            Mark All as Read
          </Button>
        }
      />

      <Panel
        title="System Administrator Notifications"
        subtitle={`${notifications.filter((item) => !item.read).length} unread technical alerts.`}
      >
        <Feedback message={feedback} warning={feedbackWarning} />

        <div className="toolbar">
          <SearchControl
            value={search}
            onChange={setSearch}
            label="Search technical alerts"
            placeholder="Search title, message, or category"
          />
          <FilterControl
            label="Read Status"
            value={readFilter}
            onChange={setReadFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "UNREAD", label: "Unread" },
              { value: "READ", label: "Read" },
            ]}
          />
          <FilterControl
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "All Categories" },
              ...categories.map((item) => ({
                value: item,
                label: item,
              })),
            ]}
          />
          {(search ||
            readFilter !== "ALL" ||
            categoryFilter !== "ALL") ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setReadFilter("ALL");
                setCategoryFilter("ALL");
              }}
            >
              Clear Filters
            </Button>
          ) : null}
        </div>

        <div className="list-stack">
          {visible.map((item) => (
            <article className="list-item" key={item.id}>
              <div className="list-item-header">
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.date} · {item.category}
                  </p>
                </div>
                <StatusBadge
                  value={item.read ? "READ" : "UNREAD"}
                  label={item.read ? "Read" : "Unread"}
                />
              </div>

              <p>{item.message}</p>

              <div className="action-row" style={{ marginTop: 10 }}>
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    runAction(() =>
                      markSystemAdministratorNotification(
                        item.id,
                        !item.read,
                      ),
                    )
                  }
                >
                  Mark as {item.read ? "Unread" : "Read"}
                </Button>

                {item.relatedHref ? (
                  <Link
                    className="portal-button portal-button-secondary"
                    href={item.relatedHref}
                    onClick={() => {
                      if (!item.read) {
                        void markSystemAdministratorNotification(
                          item.id,
                          true,
                        );
                      }
                    }}
                  >
                    Open Related Module
                  </Link>
                ) : null}
              </div>
            </article>
          ))}

          {!visible.length ? (
            <div className="notice">
              No technical alerts match the selected filters.
            </div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

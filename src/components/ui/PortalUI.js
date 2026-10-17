"use client";

import { useContext, useEffect, useId, useRef } from "react";
import AppIcon from "@/components/ui/AppIcon";
import { getStatusLabel } from "@/constants/statuses";
import Topbar from "@/components/layout/Topbar";
import { PortalHeaderContext } from "@/components/layout/PortalHeaderContext";

export function Card({ children, className = "", as: Tag = "section" }) {
  return <Tag className={`portal-card ${className}`}>{children}</Tag>;
}

export function PageHeader({ title, description, actions }) {
  const portalHeader = useContext(PortalHeaderContext);
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions || portalHeader ? (
        <div className="page-header-utilities">
          {actions ? <div className="page-header-actions">{actions}</div> : null}
          {portalHeader ? <Topbar {...portalHeader} /> : null}
        </div>
      ) : null}
    </header>
  );
}

export function StatusBadge({ value, label }) {
  const normalized = String(value || "unknown").trim().toLowerCase().replaceAll(/\s+/g, "_");
  let tone = "neutral";
  if (/correct|warning/.test(normalized)) tone = "correction";
  else if (/review/.test(normalized)) tone = "review";
  else if (/not_eligible|fail|reject|restrict|error|^full$|^blocked$/.test(normalized)) tone = "danger";
  else if (/^inactive$|cancel|archive|^disabled$/.test(normalized)) tone = "muted";
  else if (/^in_progress$|process|synchroniz|^syncing$/.test(normalized)) tone = "progress";
  else if (/pending|waiting|clarification|^submitted$|^for_validation$|near|incomplete|^uploaded$/.test(normalized)) tone = "warning";
  else if (/confirm|complet|publish|^applied$|^graduated$|^credited$/.test(normalized)) tone = "info";
  else if (/^active$|^open$|^available$|^approved$|^passed$|^eligible$|^eligible_normal$|^validated$|^connected$|^regular$/.test(normalized)) tone = "positive";
  return <span className={`status-badge status-${tone}`}>{label || getStatusLabel(value)}</span>;
}

export function Button({ children, variant = "primary", className = "", type = "button", ...props }) {
  return <button type={type} className={`portal-button portal-button-${variant} ${className}`} {...props}>{children}</button>;
}

// One accessible pagination layout for data tables across all authenticated portals.
// The owning screen controls page state so its filters can reset pagination.
export function TablePagination({ page, pageSize, total, onPageChange, label = "Table pagination" }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);
  return (
    <nav className="portal-table-pagination" aria-label={label}>
      <Button variant="secondary" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</Button>
      <span className="portal-table-pagination-summary" role="status" aria-live="polite">
        Page {currentPage} of {totalPages} · Showing {start} to {end} of {total}
      </span>
      <Button variant="secondary" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</Button>
    </nav>
  );
}

// Shared content tabs for authenticated portals. Workflow steps and filter groups
// retain their own semantics because they are not tab panels.
export function InternalTabs({ items, selected, onSelect, label, children, className = "", panelCard = false }) {
  const id = useId();
  const tabRefs = useRef([]);
  const previousSelected = useRef(selected);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const panelId = `${id}-panel`;

  useEffect(() => {
    // When an action inside a panel opens another tab, its focused button may
    // unmount. Return focus to the newly selected tab in that case.
    if (previousSelected.current !== selected && document.activeElement === document.body) {
      tabRefs.current[selectedIndex]?.focus();
    }
    previousSelected.current = selected;
  }, [selected, selectedIndex]);

  function handleTabKeyDown(event, index) {
    if (!items.length) return;
    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;

    event.preventDefault();
    onSelect(items[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <>
      <div className={`tabs ${className}`.trim()} role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const isSelected = selected === item.value;
          return (
            <button
              key={item.value}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`${id}-tab-${index}`}
              className={`tab-button ${isSelected ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected || (selectedIndex < 0 && index === 0) ? 0 : -1}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => onSelect(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className={`tab-panel${panelCard ? " portal-card section-card" : ""}`} id={panelId} role="tabpanel" aria-labelledby={`${id}-tab-${Math.max(0, selectedIndex)}`} tabIndex={0}>
        {children}
      </div>
    </>
  );
}

export function SearchControl({ label = "Search", value, onChange, placeholder }) {
  return (
    <label className="control-field search-field">
      <span className="sr-only">{label}</span>
      <AppIcon name="search" className="control-icon" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || label} />
    </label>
  );
}

export function FilterControl({ label, value, onChange, options }) {
  return (
    <label className="control-field select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

const TABLE_ACTION_DEFAULT_ICONS = Object.freeze({
  view: "eye",
  edit: "edit",
  schedule: "calendar",
  create: "add",
  approve: "approve",
  review: "review",
  history: "history",
  danger: "delete",
});

// Supports native buttons and existing navigation Links without changing handlers or routes.
export function TableActionButton({ children, tone = "view", icon, as: Element = "button", type = "button", className = "", ...props }) {
  const iconName = icon || TABLE_ACTION_DEFAULT_ICONS[tone] || "eye";
  return (
    <Element className={`table-action table-action-${tone} ${className}`.trim()} {...(Element === "button" ? { type } : {})} {...props}>
      <AppIcon name={iconName} size={15} strokeWidth={2} />
      <span>{children}</span>
    </Element>
  );
}

export function TableActions({ children, className = "" }) {
  return <div className={`cell-actions ${className}`.trim()}>{children}</div>;
}

export function DataTable({
  columns,
  rows,
  rowKey,
  emptyMessage = "No records found.",
  onRowClick,
  rowTitle = "Click to view details",
  getRowAriaLabel,
  rowClassName,
}) {
  if (!rows.length) return <EmptyState title={emptyMessage} />;

  const isInteractive = typeof onRowClick === "function";
  const shouldIgnoreRowActivation = (target) =>
    Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-stop-row-click='true']"));

  const activateRow = (event, row) => {
    if (!isInteractive || shouldIgnoreRowActivation(event.target)) return;
    onRowClick(row);
  };

  const handleRowKeyDown = (event, row) => {
    if (!isInteractive || shouldIgnoreRowActivation(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onRowClick(row);
  };

  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Scrollable table region">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const key = typeof rowKey === "function" ? rowKey(row) : row[rowKey] || index;
            const customClassName = typeof rowClassName === "function" ? rowClassName(row) : rowClassName;
            const ariaLabel = typeof getRowAriaLabel === "function" ? getRowAriaLabel(row) : undefined;

            return (
              <tr
                key={key}
                className={`${isInteractive ? "is-clickable" : ""} ${customClassName || ""}`.trim() || undefined}
                tabIndex={isInteractive ? 0 : undefined}
                title={isInteractive ? rowTitle : undefined}
                aria-label={isInteractive ? ariaLabel : undefined}
                onClick={isInteractive ? (event) => activateRow(event, row) : undefined}
                onKeyDown={isInteractive ? (event) => handleRowKeyDown(event, row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    className={column.key === "actions" || (column.key === "action" && column.render) ? "table-actions-cell" : undefined}
                    key={column.key}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return <div className="empty-state"><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>;
}

export function LoadingState({ label = "Loading portal..." }) {
  return <div className="portal-loading" role="status"><span className="loading-spinner" aria-hidden="true" />{label}</div>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  className = "",
}) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;

    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll(
          [
            'button:not([disabled])',
            'a[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
          ].join(","),
        ) || [],
      ).filter(
        (element) =>
          element instanceof HTMLElement &&
          !element.hidden &&
          element.offsetParent !== null,
      );

    // Wait until the modal is mounted before moving focus.
    requestAnimationFrame(() => {
      closeRef.current?.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable();

      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (
          activeElement === first ||
          !dialogRef.current?.contains(activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else if (
        activeElement === last ||
        !dialogRef.current?.contains(activeElement)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current?.();
        }
      }}
    >
      <section
        ref={dialogRef}
        className={`portal-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-modal-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="portal-modal-title">{title}</h2>

          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            onClick={() => onCloseRef.current?.()}
            aria-label="Close dialog"
          >
            <AppIcon name="close" />
          </button>
        </header>

        <div className="modal-body">
          {children}
        </div>

        {footer ? (
          <footer className="modal-footer">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

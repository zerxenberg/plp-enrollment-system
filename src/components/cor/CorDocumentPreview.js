"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui/PortalUI";
import styles from "./CorDocumentPreview.module.css";
import { corFilenameFromDisposition } from "@/features/cor/cor-filename.mjs";

// The PDF response is the document. Preview, browser PDF printing, and saved
// download all resolve through the same authenticated renderer and page size.
export default function CorDocumentPreview({ open, onClose, documentUrl, project = false }) {
  if (!open) return null;
  // Unmounting the document reader on close discards its PDF URL and any
  // previously loaded student document before another registration is opened.
  return <OpenCorDocumentPreview
    key={documentUrl || "unavailable"}
    onClose={onClose} documentUrl={documentUrl} project={project} />;
}

function OpenCorDocumentPreview({ onClose, documentUrl, project }) {
  const viewer = useRef(null);
  const [document, setDocument] = useState({ state: "loading", url: null, error: null });

  useEffect(() => {
    if (!documentUrl) return undefined;
    const controller = new AbortController();
    let objectUrl = null;

    async function loadPdf() {
      try {
        const response = await fetch(`${documentUrl}?view=1`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/pdf" },
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error ||
            "The registration document could not be loaded. Please reopen the confirmed enrollment.");
        }
        const filename = corFilenameFromDisposition(response.headers.get("content-disposition"));
        if (!filename) {
          throw new Error("The verified registration PDF filename is missing.");
        }
        const blob = await response.blob();
        if (!blob.size || await blob.slice(0, 5).text() !== "%PDF-") {
          throw new Error("The registration document response is not a valid PDF.");
        }
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setDocument({ state: "ready", url: objectUrl, filename, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setDocument({
            state: "error", url: null,
            error: error?.message || "The registration PDF is currently unavailable.",
          });
        }
      }
    }
    void loadPdf();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentUrl]);

  function printDocument() {
    if (document.state !== "ready" || !document.url) return;
    try {
      // Browsers that expose the native PDF viewer through the iframe open
      // the print dialog for precisely the embedded PDF, not the portal page.
      viewer.current?.contentWindow?.focus();
      viewer.current?.contentWindow?.print();
    } catch {
      window.open(document.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Modal
      open
      title={project ? "Certificate of Registration (Demonstration)" : "Certificate of Registration"}
      onClose={onClose}
      className={styles.modal}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {document.state === "ready" && document.url ? <>
          <a className="portal-button portal-button-secondary" href={`${documentUrl}?view=1`} target="_blank"
            rel="noopener noreferrer">Open PDF</a>
          <Button variant="secondary" onClick={printDocument}>Print</Button>
          <a className="portal-button portal-button-primary" href={document.url}
            download={document.filename}>Download PDF</a>
        </> : null}
      </>}
    >
      <div className={styles.viewer} role="region" aria-label="A4 certificate of registration preview">
        {document.state === "ready" && document.url ? (
          <iframe ref={viewer} src={`${documentUrl}?view=1`}
            title="Certificate of Registration A4 PDF preview" className={styles.frame} />
        ) : documentUrl && document.state === "loading" ? (
          <div className={styles.message} role="status">Loading verified registration PDF…</div>
        ) : (
          <div className={styles.message} role="alert">
            <strong>Certificate of Registration unavailable</strong>
            <p>{document.error || "A confirmed and verified registration is required."}</p>
            {document.error?.includes("sign in") ? (
              <p>Student and Registrar accounts should use separate browser profiles because they share the same website session.</p>
            ) : null}
          </div>
        )}
      </div>
      {project ? <p className={styles.disclaimer}>
        PROJECT_ONLY classroom demonstration. This document is not an official university registration or tuition assessment.
      </p> : null}
    </Modal>
  );
}

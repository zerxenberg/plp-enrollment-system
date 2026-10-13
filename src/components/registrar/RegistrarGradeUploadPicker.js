"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AppIcon from "@/components/ui/AppIcon";
import { Button, Modal } from "@/components/ui/PortalUI";
import { GRADE_IMPORT_MAX_FILE_BYTES } from "@/features/grade-import/grade-import-service";
import styles from "./RegistrarGradeUploadPicker.module.css";

const ACCEPTED_FORMATS = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PERMITTED_MIME_TYPES = new Set([
  "", "application/octet-stream", "application/zip", "application/x-zip-compressed",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/comma-separated-values", "text/plain", "application/csv",
]);

function validateSelection(files) {
  if (!files || files.length === 0) return "Please select an XLSX or CSV file.";
  if (files.length !== 1) return "Please upload one grade file at a time.";
  const [file] = files;
  if (!file || typeof file.name !== "string" || typeof file.size !== "number")
    return "The selected file could not be read. Please try again.";
  if (!/\.(xlsx|csv)$/i.test(file.name) || (file.type && !PERMITTED_MIME_TYPES.has(file.type.toLowerCase())))
    return "Unsupported file format. Please upload an XLSX or CSV file.";
  if (file.size === 0) return "The selected file is empty. Choose a grade file containing records.";
  if (file.size > GRADE_IMPORT_MAX_FILE_BYTES) return "The demo grade file limit is 2 MB.";
  return null;
}

export default function RegistrarGradeUploadPicker({ file, onFileSelected, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const pickerRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const preventFileNavigation = (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setDragging(false);
    setError("");
    dragDepth.current = 0;
  }, []);

  function openPicker() {
    setError("");
    setOpen(true);
  }

  function receiveFiles(files) {
    const selections = Array.from(files || []);
    const problem = validateSelection(selections);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    onFileSelected(selections[0]);
    close();
  }

  function handleBrowse(event) {
    if (event.target.files?.length) receiveFiles(event.target.files);
    // Make choosing the same file again trigger onChange.
    event.target.value = "";
  }

  function onDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    receiveFiles(event.dataTransfer?.files);
  }

  return (
    <>
      <div className={styles.fileField}>
        <span className={styles.fieldLabel} id="registrar-grade-file-label">Sample Grade File (XLSX or CSV)</span>
        <div className={styles.fileRow} aria-labelledby="registrar-grade-file-label">
          <button type="button" className={styles.chooseButton} onClick={openPicker} disabled={disabled} aria-haspopup="dialog">
            Choose File
          </button>
          <span className={styles.filename} title={file?.name || "No file chosen"} aria-live="polite">
            {file?.name || "No file chosen"}
          </span>
        </div>
      </div>
      {open && createPortal(
        <div className={styles.modalScope}>
          <Modal open={open} title="Upload Grade File" onClose={close} footer={<div className={styles.modalFooter}><Button type="button" variant="secondary" onClick={close}>Cancel</Button></div>}>
            <p className={styles.description}>Upload an XLSX or CSV file to import student grades.</p>
            <div
              className={`${styles.dropZone} ${dragging ? styles.dragging : ""} ${error ? styles.invalid : ""}`}
              onDragEnter={onDragEnter}
              onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; }}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              role="group"
              aria-label="Drop an XLSX or CSV grade file here, or use Browse Files"
            >
              <AppIcon name="cloudUpload" size={62} strokeWidth={1.8} className={styles.uploadIcon} />
              <p className={styles.dropTitle}>Drag and drop your file here</p>
              <div className={styles.orDivider}><span>or</span></div>
              <Button type="button" className={styles.browseButton} onClick={() => pickerRef.current?.click()}>
                <AppIcon name="fileUp" size={19} /> Browse Files
              </Button>
              <input hidden tabIndex={-1} aria-hidden="true" ref={pickerRef} type="file" accept={ACCEPTED_FORMATS} onChange={handleBrowse} />
              <p className={styles.supported}>Supported formats: XLSX, CSV.</p>
            </div>
            {error ? <p role="alert" className={styles.errorMessage}>{error}</p> : null}
          </Modal>
        </div>,
        document.body,
      )}
    </>
  );
}

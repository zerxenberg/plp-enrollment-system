"use client";

import CorDocumentPreview from "@/components/cor/CorDocumentPreview";
import { buildVerifiedCorDocument } from "@/features/cor/cor-document.mjs";

export default function RegistrarCORModal({ open, cor, isProject = false, onClose }) {
  let url = null;
  if (open && cor) {
    try {
      // The server PDF route independently performs these checks again under
      // the currently signed-in Registrar session.
      buildVerifiedCorDocument(cor);
      if (isProject && cor.simulation_only === true && cor.simulation_id) {
        url = `/api/registrar/project-cor/${encodeURIComponent(cor.simulation_id)}`;
      } else if (!isProject && cor.official === true && cor.enrollment_id) {
        url = `/api/registrar/official-cor/${encodeURIComponent(cor.enrollment_id)}`;
      }
    } catch {
      url = null;
    }
  }
  return <CorDocumentPreview open={open} onClose={onClose}
    documentUrl={url} project={isProject} />;
}

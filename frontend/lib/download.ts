import { buildApiUrl } from "./api-config";

/**
 * Cleanly extracts a readable document/image name from an attachment URL,
 * stripping uploaded timestamp prefixes (e.g. "1794462527545_filename.docx" -> "filename.docx").
 */
export function getCleanFileName(url?: string | null, fallback = "Document"): string {
  if (!url) return fallback;
  try {
    const raw = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "");
    const clean = raw.replace(/^\d+_/, "");
    return clean || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Returns professional file category styling and badge info based on extension.
 */
export function getFileBadgeInfo(fileName?: string | null, attachmentType?: string | null) {
  if (attachmentType === "LINK") {
    return {
      label: "Web Link",
      colorClass: "bg-indigo-50 text-indigo-600 border-indigo-200/80",
    };
  }

  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";

  if (["doc", "docx", "odt", "rtf"].includes(ext)) {
    return {
      label: "Word Document",
      colorClass: "bg-blue-50 text-blue-600 border-blue-200/80",
    };
  }

  if (["xls", "xlsx", "csv", "ods"].includes(ext)) {
    return {
      label: "Excel Spreadsheet",
      colorClass: "bg-emerald-50 text-emerald-600 border-emerald-200/80",
    };
  }

  if (["pdf"].includes(ext)) {
    return {
      label: "PDF Document",
      colorClass: "bg-rose-50 text-rose-600 border-rose-200/80",
    };
  }

  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return {
      label: "Archive File",
      colorClass: "bg-amber-50 text-amber-600 border-amber-200/80",
    };
  }

  if (["ppt", "pptx"].includes(ext)) {
    return {
      label: "Presentation",
      colorClass: "bg-amber-50 text-amber-700 border-amber-200/80",
    };
  }

  return {
    label: ext ? `${ext.toUpperCase()} File` : "Document",
    colorClass: "bg-slate-100 text-slate-700 border-slate-200/80",
  };
}

/**
 * Downloads a file directly to the user's PC using in-memory blob streaming.
 * This completely avoids browser security blocks (such as Chrome's "Insecure download blocked"
 * or "Mixed Content Download" warning with "Keep >" buttons) by downloading the stream in-memory
 * and creating a trusted local blob URL.
 */
export async function downloadFileDirectly(fileUrl: string, explicitFileName?: string): Promise<void> {
  if (!fileUrl) return;

  const cleanName = explicitFileName || getCleanFileName(fileUrl);

  // Upgrade http to https if current page is secure to avoid mixed-content fetch blocks
  let fetchUrl = fileUrl;
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    try {
      const parsed = new URL(fileUrl, window.location.origin);
      if (
        parsed.protocol === "http:" &&
        (parsed.hostname === window.location.hostname || parsed.hostname.includes("infograins.com"))
      ) {
        parsed.protocol = "https:";
        fetchUrl = parsed.toString();
      }
    } catch {
      // ignore
    }
  }

  // 1. Try direct in-memory Blob download (100% bypasses Chrome's Insecure Download Warning)
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Direct fetch failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 2000);
    return;
  } catch (err) {
    console.warn("Direct blob download attempt failed, attempting dedicated download endpoint:", err);
  }

  // 2. Try backend dedicated /api/download endpoint
  try {
    const rawFileName = fileUrl.split("/").pop()?.split("?")[0] || "";
    if (rawFileName) {
      const downloadEndpoint = buildApiUrl(`/api/download?file=${encodeURIComponent(rawFileName)}`);
      const dlResponse = await fetch(downloadEndpoint);
      if (dlResponse.ok) {
        const blob = await dlResponse.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = cleanName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 2000);
        return;
      }
    }
  } catch (dlErr) {
    console.warn("Dedicated download endpoint failed, using anchor fallback:", dlErr);
  }

  // 3. Fallback: standard anchor navigation
  const fallbackLink = document.createElement("a");
  fallbackLink.href = fetchUrl;
  fallbackLink.download = cleanName;
  fallbackLink.target = "_blank";
  fallbackLink.rel = "noreferrer";
  document.body.appendChild(fallbackLink);
  fallbackLink.click();
  document.body.removeChild(fallbackLink);
}


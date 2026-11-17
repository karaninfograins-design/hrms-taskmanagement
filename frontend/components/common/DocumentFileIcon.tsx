import React from "react";

interface DocumentFileIconProps {
  ext?: string;
  className?: string;
}

export function DocumentFileIcon({ ext, className = "" }: DocumentFileIconProps) {
  const cleanExt = (ext || "DOC").toUpperCase().replace(/^\./, "").slice(0, 4);

  // Pick badge color matching file category
  let badgeColor = "#2563EB"; // Default Word / doc blue
  if (["PDF"].includes(cleanExt)) {
    badgeColor = "#E11D48"; // Red for PDF
  } else if (["XLS", "XLSX", "CSV", "ODS"].includes(cleanExt)) {
    badgeColor = "#16A34A"; // Green for spreadsheet
  } else if (["PPT", "PPTX"].includes(cleanExt)) {
    badgeColor = "#EA580C"; // Orange for presentation
  } else if (["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(cleanExt)) {
    badgeColor = "#D97706"; // Amber for archives
  } else if (["TXT", "RTF", "LOG", "MD"].includes(cleanExt)) {
    badgeColor = "#64748B"; // Slate for plain text
  }

  return (
    <div className={`relative w-8.5 h-10 shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 34 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xs"
      >
        {/* Soft dog-eared paper body */}
        <path
          d="M3 0C1.34315 0 0 1.34315 0 3V37C0 38.6569 1.34315 40 3 40H31C32.6569 40 34 38.6569 34 37V11L23 0H3Z"
          fill="#E2E8F0"
        />
        {/* Folded top-right flap */}
        <path
          d="M23 0V11H34L23 0Z"
          fill="#CBD5E1"
        />
        {/* File extension badge */}
        <rect x="2.5" y="21" width="29" height="15" rx="3" fill={badgeColor} />
        <text
          x="17"
          y="32"
          fill="#FFFFFF"
          fontSize="9"
          fontWeight="700"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          letterSpacing="0.4"
        >
          {cleanExt}
        </text>
      </svg>
    </div>
  );
}


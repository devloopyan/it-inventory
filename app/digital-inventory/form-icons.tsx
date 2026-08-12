"use client";

import type { ReactNode } from "react";

// Field and method glyphs for the Access & Accounts form. Stroke-only so they
// inherit whatever ink the surrounding label uses in either theme.
const GLYPHS: Record<string, ReactNode> = {
  app: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1.2" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2.6 4.6L8 8.6l5.4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="7" width="10" height="6.5" rx="1.6" />
      <path d="M5.6 7V5.1a2.4 2.4 0 0 1 4.8 0V7" />
    </>
  ),
  recovery: (
    <>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.7-3.8" />
      <path d="M13.4 2.4v2.9h-2.9" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="5.4" r="2.5" />
      <path d="M3.2 13.4c0-2.5 2.2-3.9 4.8-3.9s4.8 1.4 4.8 3.9" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.4" r="2.2" />
      <path d="M1.9 13.4c0-2.2 1.9-3.6 4.1-3.6s4.1 1.4 4.1 3.6" />
      <path d="M10.9 3.6a2.2 2.2 0 0 1 0 4.3" />
      <path d="M12.1 10c1.3.5 2 1.6 2 3.4" />
    </>
  ),
  device: (
    <>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.6" />
      <path d="M7 12.4h2" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.6" />
      <path d="M2.5 6.6h11M5.4 2.1v2.8M10.6 2.1v2.8" />
    </>
  ),
  status: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  note: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.6" />
      <path d="M5.2 6h5.6M5.2 8.6h5.6M5.2 11.2h3.2" />
    </>
  ),
  // MFA methods
  ban: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 4.1l7.8 7.8" />
    </>
  ),
  sms: (
    <path d="M2.6 4.2A1.6 1.6 0 0 1 4.2 2.6h7.6a1.6 1.6 0 0 1 1.6 1.6v4.9a1.6 1.6 0 0 1-1.6 1.6H6.6L3.6 13.2v-2.5h.6a1.6 1.6 0 0 1-1.6-1.6z" />
  ),
  key: (
    <>
      <circle cx="5" cy="8" r="2.5" />
      <path d="M7.5 8h6M11.4 8v2.4M13.4 8v1.9" />
    </>
  ),
  hash: <path d="M6 2.6L4.4 13.4M11.4 2.6L9.8 13.4M2.6 5.7h10.8M2.2 10.3h10.8" />,
};

export type GlyphName = keyof typeof GLYPHS;

export default function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg
      className="acct-glyph"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}

"use client";

import nextDynamic from "next/dynamic";

// Single-page, scroll-driven experience (igloo-style): the villa drafts itself
// together, then the camera moves through survey / detail / hero beats.
// Shared by the root route (/) and the /showcase alias.
const ShowcaseSite = nextDynamic(
  () => import("@/components/showcase/ShowcaseSite"),
  { ssr: false }
);

export default function ShowcasePrePage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#070f1f",
        overflow: "hidden",
      }}
    >
      <ShowcaseSite />
      {/* always-available entry into the pipeline app (lives at /app) */}
      <a
        href="/app"
        style={{
          position: "fixed",
          top: 20,
          right: 24,
          zIndex: 10,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 12,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(200,228,255,0.85)",
          textDecoration: "none",
          border: "1px solid rgba(150,210,255,0.3)",
          borderRadius: 999,
          padding: "8px 16px",
          background: "rgba(8,15,30,0.45)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        Enter the pipeline →
      </a>
    </main>
  );
}

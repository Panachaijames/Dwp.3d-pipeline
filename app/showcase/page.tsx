"use client";

import ShowcasePrePage from "@/components/showcase/ShowcasePrePage";

export const dynamic = "force-dynamic";

// Alias of the root pre-page, kept so any previously-shared /showcase links
// still resolve. The canonical entry is now the bare root (/).
export default function ShowcasePage() {
  return <ShowcasePrePage />;
}

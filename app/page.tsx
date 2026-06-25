"use client";

import ShowcasePrePage from "@/components/showcase/ShowcasePrePage";

export const dynamic = "force-dynamic";

// The bare root is the public, scroll-driven pre-page. The pipeline app itself
// (auth + workspace) now lives at /app — see app/app/page.tsx.
export default function Home() {
  return <ShowcasePrePage />;
}

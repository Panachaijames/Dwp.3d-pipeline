"use client";

import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

const Gallery = nextDynamic(() => import("@/components/showcase/Gallery"), {
  ssr: false,
});

export default function GalleryPage() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <Gallery />
    </main>
  );
}

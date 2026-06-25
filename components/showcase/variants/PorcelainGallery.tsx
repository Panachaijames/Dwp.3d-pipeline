"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Porcelain · Gallery",
  blurb: "A single matte-white sculptural form in deep negative space — quiet, expensive, museum-still.",
  family: "Porcelain",
};

/* ----------------------------------------------------------------------------
   GALLERY — the purest editorial-minimal treatment of the Porcelain direction.
   One smooth matte-white form. A soft warm key, a huge soft fill, a barely-there
   contact shadow, and deep negative space. Post is near-zero: a faint, very-high-
   threshold bloom only. No aberration, no vignette, no fog. Restraint is the point.
---------------------------------------------------------------------------- */

/* ---------- The hero: a single calm, smoothly-swollen form ---------- */
function GalleryForm() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // One quiet sculptural mass. A high-res sphere with a single slow, low-frequency
  // swell — no busy ridges, no second harmonic. The silhouette must read as "still".
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.3, 16);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.copy(v).normalize();
      // A single gentle asymmetry — an egg-like lean, not a lumpy potato.
      const swell =
        Math.sin(n.y * 1.15 + 0.4) * 0.085 +
        Math.cos(n.x * 0.9 - n.z * 0.7) * 0.05;
      v.addScaledVector(n, swell);
      // Subtle vertical taper for an upright, presented posture.
      v.y *= 1.08;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Glacially slow turn. Scroll adds barely a quarter-rotation reveal.
    ref.current.rotation.y = t * 0.045 + scroll.offset * Math.PI * 0.45;
    // A near-imperceptible breathing tilt — the only sign it is alive.
    ref.current.rotation.x = 0.06 + Math.sin(t * 0.1) * 0.025;
    // Hold near a presentation height; sink ever so slightly toward the shadow on scroll.
    ref.current.position.y = 0.18 - scroll.offset * 0.12;
  });

  return (
    <mesh ref={ref} geometry={geometry} castShadow position={[0, 0.18, 0]}>
      {/* Matte bisque porcelain: high roughness, no metal, the faintest sheen
          so the warm key kisses the top edge without ever turning glossy. */}
      <meshPhysicalMaterial
        color="#f4efe7"
        roughness={0.78}
        metalness={0}
        clearcoat={0.06}
        clearcoatRoughness={0.85}
        sheen={0.45}
        sheenColor="#fff6ec"
        sheenRoughness={0.8}
        envMapIntensity={0.55}
      />
    </mesh>
  );
}

/* ---------- Gallery light: one soft warm key, one enormous soft fill ---------- */
function GalleryEnvironment() {
  return (
    <Environment resolution={256}>
      {/* Soft warm key, high and to the left — the directional shape-giver. */}
      <Lightformer
        form="rect"
        intensity={1.5}
        color="#fff6ea"
        position={[-3, 4, 4]}
        scale={[6, 8, 1]}
        rotation={[0, Math.PI / 6, 0]}
      />
      {/* Huge, gentle fill on the right — lifts the shadow side, keeps it museum-even. */}
      <Lightformer
        form="rect"
        intensity={0.85}
        color="#f1ece4"
        position={[5, 0, 3]}
        scale={[12, 12, 1]}
        rotation={[0, -Math.PI / 7, 0]}
      />
      {/* A broad overhead wash for the soft top rim. */}
      <Lightformer
        form="circle"
        intensity={0.9}
        color="#fffdf8"
        position={[0, 6, 0]}
        scale={7}
      />
    </Environment>
  );
}

export default function PorcelainGallery() {
  return (
    <>
      {/* A warm, near-white gallery wall. Deep negative space — nothing competes. */}
      <color attach="background" args={["#f1ece4"]} />

      {/* Soft, diffuse studio lighting — no harsh speculars, no rim drama. */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[-3, 5, 4]} intensity={0.85} color="#fff5e8" />
      <directionalLight position={[5, 1, 2]} intensity={0.3} color="#ece4d8" />

      <GalleryEnvironment />
      <GalleryForm />

      {/* The barely-there contact shadow — the single anchor to the floor.
          Soft, pale, generous blur. It says "this object has weight" and nothing more. */}
      <ContactShadows
        position={[0, -1.35, 0]}
        scale={7}
        far={3}
        blur={3.2}
        opacity={0.32}
        color="#c9bfae"
        resolution={512}
      />

      {/* Near-zero post: a faint, very-high-threshold bloom that only catches the
          brightest top edge. No aberration. No vignette. The quiet is intentional. */}
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.16} luminanceThreshold={0.9} luminanceSmoothing={0.4} />
      </EffectComposer>
    </>
  );
}

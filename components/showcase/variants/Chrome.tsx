"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  useScroll,
  Float,
  Sparkles,
  Environment,
  Lightformer,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Chrome",
  blurb:
    "A liquid mirror-metal blob in a hot-pink and electric-blue neon studio — fashion-glossy, punchy bloom.",
};

/* ---------- Liquid chrome hero: a high-detail sphere with a vertex wobble ---------- */
function ChromeBlob() {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const scroll = useScroll();

  // Capture base positions once so the wobble is non-cumulative.
  const base = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.35, 48);
    const arr = (g.attributes.position.array as Float32Array).slice();
    return { geometry: g, positions: arr };
  }, []);

  // Reusable scratch vector — avoid per-frame allocations.
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;

    const geo = ref.current.geometry as THREE.IcosahedronGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const src = base.positions;

    // Scroll thickens the liquid surface: subtle at top, molten on scroll.
    const amp = 0.06 + scroll.offset * 0.16;

    for (let i = 0; i < pos.count; i++) {
      const ix = i * 3;
      v.set(src[ix], src[ix + 1], src[ix + 2]);
      const len = v.length();
      const n = v.clone().normalize();
      // Layered trig "noise" — deterministic, SSR-safe (no Math.random).
      const wob =
        Math.sin(n.x * 3.2 + t * 0.9) * 0.55 +
        Math.sin(n.y * 4.1 - t * 0.7) * 0.3 +
        Math.sin(n.z * 5.3 + t * 1.1) * 0.15;
      const d = len + wob * amp;
      pos.setXYZ(i, n.x * d, n.y * d, n.z * d);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Slow premium tumble + scroll-driven roll.
    ref.current.rotation.y += 0.0016;
    ref.current.rotation.x = 0.12 + scroll.offset * Math.PI * 0.4;

    // Reflections get glossier as you scroll deeper.
    if (mat.current) {
      mat.current.roughness = 0.045 - scroll.offset * 0.02;
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.9}>
      <mesh ref={ref} geometry={base.geometry}>
        <meshStandardMaterial
          ref={mat}
          color="#f4f6ff"
          metalness={1}
          roughness={0.03}
          envMapIntensity={1.8}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Neon studio: bright colored Lightformers for vivid reflections ---------- */
function NeonStudio() {
  return (
    <Environment resolution={256}>
      {/* Hot pink key from the left */}
      <Lightformer
        form="rect"
        intensity={6}
        color="#ff2d8f"
        position={[-4, 1.5, 3]}
        scale={[6, 8, 1]}
        rotation={[0, Math.PI / 4, 0]}
      />
      {/* Electric blue rim from the right */}
      <Lightformer
        form="rect"
        intensity={6}
        color="#1b6bff"
        position={[4, -1, 3]}
        scale={[6, 8, 1]}
        rotation={[0, -Math.PI / 4, 0]}
      />
      {/* Crisp white top streak for highlight bands */}
      <Lightformer
        form="rect"
        intensity={8}
        color="#ffffff"
        position={[0, 5, 1]}
        scale={[10, 0.6, 1]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {/* Magenta back-glow to wrap the silhouette */}
      <Lightformer
        form="circle"
        intensity={3}
        color="#d040ff"
        position={[0, 0, -5]}
        scale={5}
      />
      {/* Cyan accent low-left */}
      <Lightformer
        form="circle"
        intensity={2.4}
        color="#22e0ff"
        position={[-3, -3, -1]}
        scale={3}
      />
    </Environment>
  );
}

export default function Chrome() {
  const scroll = useScroll();

  return (
    <>
      <color attach="background" args={["#06040a"]} />
      <fog attach="fog" args={["#06040a", 8, 18]} />

      <ambientLight intensity={0.18} />
      <pointLight position={[-4, 2, 4]} intensity={40} color="#ff2d8f" distance={18} />
      <pointLight position={[4, -1, 4]} intensity={40} color="#1b6bff" distance={18} />

      <NeonStudio />
      <ChromeBlob />

      <Sparkles
        count={220}
        scale={[12, 7, 7]}
        size={2.6}
        speed={0.22}
        opacity={0.6}
        color="#ff8fd0"
        noise={1.2}
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.25}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.18}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0012, 0.0016)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.22} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

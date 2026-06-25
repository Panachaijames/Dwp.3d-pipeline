"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Sparkles, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Obsidian",
  blurb: "A black glossy faceted monolith with magenta + cyan rim light and drifting silver embers.",
};

/* ---------- Hero: a sharply faceted near-black crystal monolith ---------- */
function Monolith() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // Faceted, severe geometry — low-subdivision icosahedron flat-shaded.
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1.5, 1);
    // Deterministic ridge displacement for a hand-cut, irregular obsidian feel.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const ridge =
        0.12 * Math.sin(n.x * 5.0 + n.y * 3.0) +
        0.08 * Math.cos(n.z * 6.0 - n.x * 2.0);
      v.addScaledVector(n, ridge);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame((state, dt) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y += dt * 0.12;
    ref.current.rotation.x = 0.15 + Math.sin(t * 0.18) * 0.08 + scroll.offset * Math.PI * 0.4;
    const s = 1 + scroll.offset * 0.22;
    ref.current.scale.setScalar(s);
  });

  return (
    <Float speed={1.0} rotationIntensity={0.35} floatIntensity={0.8}>
      <mesh ref={ref} geometry={geometry}>
        <meshPhysicalMaterial
          color="#050507"
          metalness={0.92}
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.06}
          envMapIntensity={1.6}
          reflectivity={1}
          flatShading
        />
      </mesh>
    </Float>
  );
}

/* ---------- Faceted environment: deep black with magenta + cyan rim ---------- */
function ObsidianEnvironment() {
  return (
    <Environment resolution={256}>
      {/* base darkness */}
      <Lightformer
        form="rect"
        intensity={0.15}
        color="#0a0a12"
        position={[0, 0, -5]}
        scale={[12, 12, 1]}
      />
      {/* magenta rim — left/top */}
      <Lightformer
        form="rect"
        intensity={5}
        color="#ff2d8e"
        position={[-4, 3, 1]}
        scale={[6, 2, 1]}
        rotation={[0, Math.PI / 3, 0]}
      />
      {/* cyan rim — right/bottom */}
      <Lightformer
        form="rect"
        intensity={5}
        color="#1fe0ff"
        position={[4, -2.5, 1]}
        scale={[6, 2, 1]}
        rotation={[0, -Math.PI / 3, 0]}
      />
      {/* sharp white key for glossy specular glints */}
      <Lightformer
        form="circle"
        intensity={2.4}
        color="#ffffff"
        position={[0, 5, 2]}
        scale={1.6}
      />
    </Environment>
  );
}

export default function Obsidian() {
  const magenta = useRef<THREE.PointLight>(null!);
  const cyan = useRef<THREE.PointLight>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Slow breathing of the rim lights for a living, severe luxe pulse.
    if (magenta.current) magenta.current.intensity = 14 + Math.sin(t * 0.5) * 4;
    if (cyan.current) cyan.current.intensity = 14 + Math.cos(t * 0.4) * 4;
  });

  return (
    <>
      <color attach="background" args={["#020203"]} />
      <fog attach="fog" args={["#020203", 8, 20]} />

      <ambientLight intensity={0.08} />
      <pointLight ref={magenta} position={[-4, 3, 3]} color="#ff2d8e" distance={18} intensity={14} />
      <pointLight ref={cyan} position={[4, -3, 3]} color="#1fe0ff" distance={18} intensity={14} />
      <directionalLight position={[0, 6, 5]} intensity={0.6} color="#ffffff" />

      <ObsidianEnvironment />
      <Monolith />

      {/* sparse drifting white/silver embers */}
      <Sparkles
        count={120}
        scale={[10, 7, 6]}
        size={2.2}
        speed={0.18}
        opacity={0.65}
        color="#eef2ff"
        noise={1.0}
      />

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.65} luminanceSmoothing={0.18} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0011, 0.0014)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.2} darkness={0.95} />
      </EffectComposer>
    </>
  );
}

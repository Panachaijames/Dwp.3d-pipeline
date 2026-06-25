"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  useScroll,
  Float,
  Sparkles,
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
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
  name: "Nebula · Ringed Giant",
  blurb:
    "A translucent blue-violet gas giant girdled by a real tilted ring of orbiting ice particles, grazed by a distant warm sun.",
  family: "Nebula",
};

/* Shared tilt for the whole ringed-giant system — a Saturn-esque lean. */
const RING_TILT = 0.46; // radians, about the X axis

/* ---------- Hero: the translucent gas-giant orb with a luminous core ---------- */
function GiantOrb() {
  const shell = useRef<THREE.Mesh>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (shell.current) {
      // slow, stately rotation befitting a giant world
      shell.current.rotation.y = t * 0.05;
    }
    if (core.current) {
      core.current.rotation.y = -t * 0.08;
      const pulse = 0.92 + Math.sin(t * 0.4) * 0.03;
      core.current.scale.setScalar(pulse);
    }
    if (halo.current) {
      const hp = 1.32 + Math.sin(t * 0.3) * 0.02 + off * 0.05;
      halo.current.scale.setScalar(hp);
      (halo.current.material as THREE.MeshBasicMaterial).opacity =
        0.16 + Math.sin(t * 0.3) * 0.03;
    }
  });

  return (
    <>
      {/* atmospheric rim glow (additive) */}
      <mesh ref={halo}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          color="#5e7bff"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* luminous inner core — banded gas-giant heart */}
      <mesh ref={core}>
        <sphereGeometry args={[0.96, 48, 48]} />
        <meshStandardMaterial
          color="#9db4ff"
          emissive="#3a52d6"
          emissiveIntensity={1.3}
          roughness={0.55}
          metalness={0}
        />
      </mesh>

      {/* translucent transmission shell — the planet's skin */}
      <mesh ref={shell}>
        <sphereGeometry args={[1.15, 64, 64]} />
        <MeshTransmissionMaterial
          resolution={256}
          samples={8}
          transmission={1}
          thickness={1.4}
          roughness={0.16}
          ior={1.28}
          chromaticAberration={0.32}
          anisotropicBlur={0.5}
          distortion={0.3}
          distortionScale={0.3}
          temporalDistortion={0.05}
          color="#b9c8ff"
          attenuationColor="#4258ff"
          attenuationDistance={1.6}
        />
      </mesh>
    </>
  );
}

/* ---------- The tilted particle ring system (instanced sprites in a flat annulus) ---------- */
function ParticleRing() {
  const points = useRef<THREE.Points>(null!);

  // Build a flat annulus of particles with banded density (Saturn-style gaps).
  const { geometry, material } = useMemo(() => {
    const COUNT = 2600;
    const inner = 1.55;
    const outer = 2.45;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const cIce = new THREE.Color("#dfe7ff");
    const cBlue = new THREE.Color("#7e9bff");
    const cViolet = new THREE.Color("#9a7bff");

    // Cassini-like gap profile: a couple of low-density bands.
    const bandDensity = (r: number) => {
      const u = (r - inner) / (outer - inner); // 0..1
      const gap1 = 1 - Math.exp(-((u - 0.42) ** 2) / 0.0009);
      const gap2 = 1 - Math.exp(-((u - 0.72) ** 2) / 0.0006);
      return Math.max(0.08, gap1 * gap2);
    };

    let placed = 0;
    let seed = 0;
    // deterministic pseudo-random via trig hashing (SSR-safe, no Math.random)
    const rand = () => {
      seed += 1;
      const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    while (placed < COUNT) {
      const r = inner + rand() * (outer - inner);
      // rejection-sample against the band density for visible gaps
      if (rand() > bandDensity(r)) continue;
      const a = rand() * Math.PI * 2;
      // slight vertical thickness so the ring reads as a real disc
      const y = (rand() - 0.5) * 0.03 * (1 + (r - inner));
      const i3 = placed * 3;
      positions[i3] = Math.cos(a) * r;
      positions[i3 + 1] = y;
      positions[i3 + 2] = Math.sin(a) * r;

      // color shifts inner→outer: warm-ice → blue → violet
      const u = (r - inner) / (outer - inner);
      const col = new THREE.Color();
      if (u < 0.5) col.copy(cIce).lerp(cBlue, u * 2);
      else col.copy(cBlue).lerp(cViolet, (u - 0.5) * 2);
      // subtle per-particle brightness variation
      const b = 0.75 + rand() * 0.45;
      colors[i3] = col.r * b;
      colors[i3 + 1] = col.g * b;
      colors[i3 + 2] = col.b * b;

      sizes[placed] = 0.012 + rand() * 0.03;
      placed += 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    // round, soft, additive sprite via a tiny canvas-free shader on PointsMaterial
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aSize;"
        )
        .replace(
          "gl_PointSize = size;",
          "gl_PointSize = size * aSize * 60.0;"
        );
      // carve points into soft round dots
      s.fragmentShader = s.fragmentShader.replace(
        "#include <premultiplied_alpha_fragment>",
        "float d = length(gl_PointCoord - vec2(0.5));\nif (d > 0.5) discard;\nfloat soft = smoothstep(0.5, 0.05, d);\ngl_FragColor.a *= soft;\n#include <premultiplied_alpha_fragment>"
      );
    };

    return { geometry: geo, material: mat };
  }, []);

  useFrame((state) => {
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.07;
  });

  return <points ref={points} geometry={geometry} material={material} />;
}

/* ---------- A faint solid ring disc behind the particles for body/shadow read ---------- */
function RingHaze() {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (mesh.current) mesh.current.rotation.z = state.clock.elapsedTime * 0.02;
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.5, 2.5, 96, 1]} />
      <meshBasicMaterial
        color="#5566cc"
        transparent
        opacity={0.07}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ---------- Cosmic lighting: cool ambient + a distant WARM sun rim ---------- */
function CosmicEnvironment() {
  return (
    <Environment resolution={256}>
      {/* cool fill from the nebula */}
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#5066ff"
        position={[-4, 1, 3]}
        scale={5}
      />
      {/* the distant warm sun — small, bright, grazing */}
      <Lightformer
        form="circle"
        intensity={6}
        color="#ffd9a8"
        position={[6, 1.5, 2]}
        scale={2}
      />
      <Lightformer
        form="rect"
        intensity={0.9}
        color="#8a6bff"
        position={[0, -3, -4]}
        scale={[8, 3, 1]}
      />
    </Environment>
  );
}

export default function NebulaRing() {
  const scroll = useScroll();
  const system = useRef<THREE.Group>(null!);
  const stars = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const off = scroll.offset;
    // the whole ringed system holds its tilt; scroll nudges the lean slightly
    if (system.current) {
      system.current.rotation.x = RING_TILT + off * 0.18;
      system.current.rotation.z = -0.08 + off * 0.05;
    }
    if (stars.current) {
      stars.current.rotation.y =
        state.clock.elapsedTime * 0.006 + off * 0.25;
    }
  });

  return (
    <>
      <color attach="background" args={["#05030f"]} />
      <fog attach="fog" args={["#080420", 10, 24]} />

      <ambientLight intensity={0.18} color="#6a7bff" />
      {/* warm distant sun as a real grazing rim light from the right */}
      <directionalLight position={[7, 2.5, 3]} intensity={2.2} color="#ffcf9e" />
      {/* cool back-fill so the dark limb still reads */}
      <pointLight position={[-5, -2, -4]} intensity={16} color="#3247ff" distance={18} />
      {/* gentle core glow */}
      <pointLight position={[0, 0, 0]} intensity={4} color="#5e7bff" distance={6} />

      <CosmicEnvironment />

      {/* The ringed giant: orb + tilted ring share one tilted group for an iconic silhouette */}
      <Float speed={0.5} rotationIntensity={0.08} floatIntensity={0.4}>
        <group ref={system}>
          <GiantOrb />
          <RingHaze />
          <ParticleRing />
        </group>
      </Float>

      {/* deep starfield, two layers, total <= 300 */}
      <group ref={stars}>
        <Sparkles
          count={200}
          scale={[20, 14, 14]}
          size={1.4}
          speed={0.08}
          opacity={0.8}
          color="#dfe7ff"
          noise={0.5}
        />
        <Sparkles
          count={80}
          scale={[15, 10, 10]}
          size={2.8}
          speed={0.05}
          opacity={0.6}
          color="#aebfff"
          noise={0.4}
        />
      </group>

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.25}
          luminanceThreshold={0.22}
          luminanceSmoothing={0.4}
          radius={0.8}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0009, 0.0012)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.32} darkness={0.94} />
      </EffectComposer>
    </>
  );
}

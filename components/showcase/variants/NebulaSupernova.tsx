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
  name: "Nebula · Supernova",
  blurb:
    "A brilliant erupting core throwing light through dense swirling magenta-gold-teal gas, ringed by a thick twinkling starfield and pulsing bloom.",
  family: "Nebula",
};

/* ---------- Hero: a hot brilliant core that pulses and erupts light ---------- */
function SupernovaCore() {
  const core = useRef<THREE.Mesh>(null!);
  const shell = useRef<THREE.Mesh>(null!);
  const corona = useRef<THREE.Mesh>(null!);
  const flare = useRef<THREE.Mesh>(null!);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null!);
  const scroll = useScroll();

  // pulse waveform: a sharp eruption every few seconds layered on a steady throb
  const pulseAt = (t: number) => {
    const throb = Math.sin(t * 1.6) * 0.5 + 0.5; // 0..1 steady breathing
    // periodic bright eruption — quick attack, slow decay
    const phase = (t * 0.45) % 1;
    const burst = Math.pow(Math.max(0, 1 - phase * 1.6), 2.2);
    return 0.55 + throb * 0.25 + burst * 1.0;
  };

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    const p = pulseAt(t);

    if (core.current) {
      const s = 0.92 + p * 0.16;
      core.current.scale.setScalar(s);
      core.current.rotation.y = t * 0.18;
      core.current.rotation.x = t * 0.07 + off * 0.5;
    }
    if (coreMat.current) {
      coreMat.current.emissiveIntensity = 3.0 + p * 5.5;
    }
    if (shell.current) {
      shell.current.rotation.y = -t * 0.12;
      shell.current.rotation.z = t * 0.05;
      const ss = 1.0 + p * 0.06;
      shell.current.scale.setScalar(ss);
      (shell.current.material as THREE.MeshBasicMaterial).opacity =
        0.22 + p * 0.18;
    }
    if (corona.current) {
      const cs = 1.7 + p * 0.5;
      corona.current.scale.setScalar(cs);
      corona.current.rotation.z = t * 0.2;
      (corona.current.material as THREE.MeshBasicMaterial).opacity =
        0.1 + p * 0.16;
    }
    if (flare.current) {
      // a wide thin light-burst disk that flashes with each eruption
      const fs = 2.4 + p * 1.6;
      flare.current.scale.set(fs, fs, 1);
      flare.current.rotation.z = t * 0.6;
      (flare.current.material as THREE.MeshBasicMaterial).opacity =
        0.04 + p * 0.22;
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.2} floatIntensity={0.5}>
      {/* wide light-burst disk — the dramatic flash plane */}
      <mesh ref={flare} rotation={[0, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#ffd36b"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* outer corona glow */}
      <mesh ref={corona}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#ff5db0"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* turbulent emissive shell wrapping the core */}
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.3, 6]} />
        <meshBasicMaterial
          color="#ff9e3d"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          wireframe
        />
      </mesh>

      {/* the hot brilliant core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.0, 5]} />
        <meshStandardMaterial
          ref={coreMat}
          color="#fff3d0"
          emissive="#ffb14a"
          emissiveIntensity={4.0}
          roughness={0.25}
          metalness={0}
          toneMapped={false}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Dense swirling gas: stacked warm+cool additive planes ---------- */
function SwirlingGas() {
  const group = useRef<THREE.Group>(null!);
  const meshes = useRef<THREE.Mesh[]>([]);
  const scroll = useScroll();

  const planes = useMemo(() => {
    // alternating magenta / gold / teal, fanned out in a swirling shell
    const palette = [
      "#ff3d9a", // magenta
      "#ffc24b", // gold
      "#2ad1c4", // teal
      "#ff6bd0", // hot pink
      "#ffd86b", // warm gold
      "#3ce0d0", // bright teal
    ];
    const N = 14;
    return new Array(N).fill(0).map((_, i) => {
      const a = (i / N) * Math.PI * 2 + i * 0.6;
      const r = 1.9 + (i % 4) * 0.5;
      return {
        pos: [
          Math.cos(a) * r,
          Math.sin(a * 0.8) * (1.4 + (i % 3) * 0.5),
          -1.5 - (i % 5) * 0.9,
        ] as [number, number, number],
        rot: [Math.sin(i) * 0.5, Math.cos(i) * 0.4, a] as [
          number,
          number,
          number
        ],
        scale: 3.4 + (i % 4) * 1.3,
        color: palette[i % palette.length],
        opacity: 0.1 + (i % 3) * 0.04,
        spin: (i % 2 === 0 ? 1 : -1) * (0.04 + (i % 3) * 0.015),
      };
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (group.current) {
      group.current.rotation.z = t * 0.03 + off * 0.4;
      group.current.rotation.x = 0.1 + off * 0.25;
    }
    // gentle individual swirl of each gas sheet
    meshes.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.z += planes[i].spin * 0.02;
      const breathe = 1 + Math.sin(t * 0.5 + i) * 0.04;
      m.scale.setScalar(planes[i].scale * breathe);
    });
  });

  return (
    <group ref={group}>
      {planes.map((p, i) => (
        <mesh
          key={i}
          position={p.pos}
          rotation={p.rot}
          ref={(el) => {
            if (el) meshes.current[i] = el;
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={p.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Cosmic lighting environment (warm + cool kicks) ---------- */
function SupernovaEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="circle"
        intensity={4}
        color="#ffce6b"
        position={[0, 0, 4]}
        scale={6}
      />
      <Lightformer
        form="circle"
        intensity={3}
        color="#ff4d9e"
        position={[-4, 2, 2]}
        scale={5}
      />
      <Lightformer
        form="rect"
        intensity={2.2}
        color="#2ad1c4"
        position={[4, -2, 1]}
        scale={[6, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.6}
        color="#ff9e3d"
        position={[0, 4, -3]}
        scale={[8, 2, 1]}
      />
    </Environment>
  );
}

export default function NebulaSupernova() {
  const scroll = useScroll();
  const starGroup = useRef<THREE.Group>(null!);
  const burstLight = useRef<THREE.PointLight>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (starGroup.current) {
      starGroup.current.rotation.y = t * 0.01 + scroll.offset * 0.35;
      starGroup.current.rotation.x = scroll.offset * 0.15;
    }
    if (burstLight.current) {
      // central light pulses in time with the core eruption
      const phase = (t * 0.45) % 1;
      const burst = Math.pow(Math.max(0, 1 - phase * 1.6), 2.2);
      const throb = Math.sin(t * 1.6) * 0.5 + 0.5;
      burstLight.current.intensity = 18 + throb * 10 + burst * 55;
    }
  });

  return (
    <>
      <color attach="background" args={["#0b0210"]} />
      <fog attach="fog" args={["#160418", 10, 24]} />

      <ambientLight intensity={0.25} color="#ff9ed0" />
      {/* central eruption light */}
      <pointLight
        ref={burstLight}
        position={[0, 0, 0]}
        intensity={24}
        color="#ffce6b"
        distance={14}
      />
      {/* warm and cool rim kicks */}
      <pointLight
        position={[-5, 3, -3]}
        intensity={22}
        color="#ff3d9a"
        distance={20}
      />
      <pointLight
        position={[5, -3, -2]}
        intensity={20}
        color="#2ad1c4"
        distance={20}
      />
      <directionalLight position={[3, 5, 4]} intensity={0.6} color="#fff2d6" />

      <SupernovaEnvironment />
      <SwirlingGas />
      <SupernovaCore />

      {/* thick twinkling starfield — three layers, total <= 300 */}
      <group ref={starGroup}>
        <Sparkles
          count={150}
          scale={[20, 14, 14]}
          size={1.4}
          speed={0.18}
          opacity={0.9}
          color="#fff4dd"
          noise={0.7}
        />
        <Sparkles
          count={90}
          scale={[16, 11, 11]}
          size={2.6}
          speed={0.12}
          opacity={0.85}
          color="#ffd9a6"
          noise={0.5}
        />
        <Sparkles
          count={50}
          scale={[13, 9, 9]}
          size={4.0}
          speed={0.08}
          opacity={0.8}
          color="#a6f0ff"
          noise={0.4}
        />
      </group>

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={2.4}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.35}
          radius={0.92}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0018, 0.0022)}
          radialModulation={true}
          modulationOffset={0.3}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.96} />
      </EffectComposer>
    </>
  );
}

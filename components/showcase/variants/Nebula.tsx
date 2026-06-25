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
  name: "Nebula",
  blurb:
    "A softly glowing translucent crystal-orb adrift in deep space, wrapped in a purple-to-blue nebula and a dense starfield.",
};

/* ---------- Hero: a glowing translucent orb with a luminous inner core ---------- */
function NebulaOrb() {
  const shell = useRef<THREE.Mesh>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (shell.current) {
      shell.current.rotation.y = t * 0.06;
      shell.current.rotation.x = 0.12 + off * 0.6;
    }
    if (core.current) {
      // slow breathing of the inner core
      const pulse = 0.78 + Math.sin(t * 0.5) * 0.05;
      core.current.scale.setScalar(pulse);
      core.current.rotation.y = -t * 0.1;
    }
    if (halo.current) {
      const hp = 1.9 + Math.sin(t * 0.35) * 0.06;
      halo.current.scale.setScalar(hp);
      (halo.current.material as THREE.MeshBasicMaterial).opacity =
        0.10 + Math.sin(t * 0.35) * 0.03;
    }
  });

  return (
    <Float speed={0.8} rotationIntensity={0.25} floatIntensity={0.7}>
      {/* faint outer halo to suggest atmospheric glow (additive) */}
      <mesh ref={halo}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#7d5cff"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* luminous inner core — the heart of the orb */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.0, 4]} />
        <meshStandardMaterial
          color="#b89bff"
          emissive="#6a4bff"
          emissiveIntensity={2.4}
          roughness={0.4}
          metalness={0}
        />
      </mesh>

      {/* translucent transmission shell */}
      <mesh ref={shell}>
        <sphereGeometry args={[1.35, 64, 64]} />
        <MeshTransmissionMaterial
          resolution={256}
          samples={8}
          transmission={1}
          thickness={1.6}
          roughness={0.12}
          ior={1.32}
          chromaticAberration={0.45}
          anisotropicBlur={0.4}
          distortion={0.4}
          distortionScale={0.4}
          temporalDistortion={0.08}
          color="#cdb8ff"
          attenuationColor="#5a78ff"
          attenuationDistance={2.0}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Nebula cloud: a few large, soft, additive billboards as colored gas ---------- */
function NebulaClouds() {
  const group = useRef<THREE.Group>(null!);
  useFrame((state) => {
    if (group.current) group.current.rotation.z = state.clock.elapsedTime * 0.01;
  });

  const clouds = useMemo(() => {
    const colors = ["#5a2b9e", "#2b4bbd", "#7d3cff", "#243a8f", "#9a4bd6"];
    return new Array(5).fill(0).map((_, i) => {
      const a = (i / 5) * Math.PI * 2 + i;
      return {
        pos: [
          Math.cos(a) * 4.5,
          Math.sin(a * 0.7) * 2.6,
          -4 - (i % 3) * 1.5,
        ] as [number, number, number],
        scale: 4.5 + (i % 3) * 1.8,
        color: colors[i],
        opacity: 0.14 + (i % 2) * 0.04,
      };
    });
  }, []);

  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.pos}>
          <planeGeometry args={[c.scale, c.scale]} />
          <meshBasicMaterial
            color={c.color}
            transparent
            opacity={c.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Cosmic lighting environment ---------- */
function CosmicEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="circle"
        intensity={3}
        color="#9a7bff"
        position={[-3, 2, 3]}
        scale={5}
      />
      <Lightformer
        form="circle"
        intensity={2.4}
        color="#4f6bff"
        position={[3, -1, 2]}
        scale={4}
      />
      <Lightformer
        form="rect"
        intensity={1.4}
        color="#ff9ed8"
        position={[0, 3, -4]}
        scale={[6, 2, 1]}
      />
    </Environment>
  );
}

export default function Nebula() {
  const scroll = useScroll();
  const starGroup = useRef<THREE.Group>(null!);

  useFrame((state) => {
    // very slow parallax drift of the starfield, nudged by scroll
    if (starGroup.current) {
      starGroup.current.rotation.y =
        state.clock.elapsedTime * 0.008 + scroll.offset * 0.3;
    }
  });

  return (
    <>
      <color attach="background" args={["#070314"]} />
      <fog attach="fog" args={["#0a0524", 9, 22]} />

      <ambientLight intensity={0.2} color="#7d6bff" />
      <pointLight
        position={[0, 0, 0]}
        intensity={14}
        color="#7d5cff"
        distance={10}
      />
      <directionalLight
        position={[4, 5, 3]}
        intensity={0.8}
        color="#bcd0ff"
      />
      <pointLight
        position={[-5, -3, -4]}
        intensity={20}
        color="#3b56ff"
        distance={18}
      />

      <CosmicEnvironment />
      <NebulaClouds />
      <NebulaOrb />

      {/* dense starfield — two layers for depth, total <= 300 */}
      <group ref={starGroup}>
        <Sparkles
          count={200}
          scale={[18, 12, 12]}
          size={1.6}
          speed={0.12}
          opacity={0.85}
          color="#e8e2ff"
          noise={0.6}
        />
        <Sparkles
          count={90}
          scale={[14, 9, 9]}
          size={3.2}
          speed={0.08}
          opacity={0.7}
          color="#bcd0ff"
          noise={0.4}
        />
      </group>

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.4}
          luminanceThreshold={0.25}
          luminanceSmoothing={0.4}
          radius={0.85}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0011, 0.0014)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

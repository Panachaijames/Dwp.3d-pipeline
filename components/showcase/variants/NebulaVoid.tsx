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
  name: "Nebula · Void",
  blurb:
    "A single luminous translucent core orb circled by a thin glowing accretion ring, adrift in a near-empty indigo void.",
  family: "Nebula",
};

/* ---------- Hero: a lone translucent orb with a luminous core + thin accretion ring ---------- */
function VoidOrb() {
  const shell = useRef<THREE.Mesh>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const glow = useRef<THREE.Mesh>(null!);
  const ring = useRef<THREE.Group>(null!);
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;

    // slow, majestic rotation of the glass shell
    if (shell.current) {
      shell.current.rotation.y = t * 0.05;
      shell.current.rotation.x = 0.1 + off * 0.4;
    }
    // gentle counter-rotation + faint breathing of the inner core
    if (core.current) {
      core.current.rotation.y = -t * 0.08;
      const pulse = 0.7 + Math.sin(t * 0.4) * 0.025;
      core.current.scale.setScalar(pulse);
    }
    // soft additive corona that subtly swells
    if (glow.current) {
      const g = 1.0 + Math.sin(t * 0.3) * 0.04;
      glow.current.scale.setScalar(g);
      (glow.current.material as THREE.MeshBasicMaterial).opacity =
        0.07 + Math.sin(t * 0.3) * 0.02;
    }
    // the accretion ring rotates in its own slow plane, tilt eased by scroll
    if (ring.current) {
      ring.current.rotation.z = t * 0.12;
      ring.current.rotation.x = -1.15 + off * 0.5;
    }
  });

  return (
    <Float speed={0.6} rotationIntensity={0.15} floatIntensity={0.5}>
      {/* faint outer corona — cyan-tinted breath of light */}
      <mesh ref={glow} scale={1}>
        <sphereGeometry args={[1.7, 32, 32]} />
        <meshBasicMaterial
          color="#5fd4ff"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* luminous inner core — cool indigo heart */}
      <mesh ref={core}>
        <icosahedronGeometry args={[0.95, 3]} />
        <meshStandardMaterial
          color="#acd8ff"
          emissive="#3f6bff"
          emissiveIntensity={2.0}
          roughness={0.35}
          metalness={0}
        />
      </mesh>

      {/* translucent transmission shell — the orb body */}
      <mesh ref={shell}>
        <sphereGeometry args={[1.4, 64, 64]} />
        <MeshTransmissionMaterial
          resolution={256}
          samples={10}
          transmission={1}
          thickness={1.4}
          roughness={0.08}
          ior={1.28}
          chromaticAberration={0.32}
          anisotropicBlur={0.3}
          distortion={0.25}
          distortionScale={0.3}
          temporalDistortion={0.05}
          color="#cfe6ff"
          attenuationColor="#3a6bff"
          attenuationDistance={2.4}
        />
      </mesh>

      {/* thin glowing accretion ring — a single graceful band of light */}
      <group ref={ring}>
        <mesh>
          <torusGeometry args={[2.15, 0.012, 16, 220]} />
          <meshBasicMaterial
            color="#9fe4ff"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* soft halo flanking the ring to bloom gently */}
        <mesh>
          <torusGeometry args={[2.15, 0.06, 16, 220]} />
          <meshBasicMaterial
            color="#4f8bff"
            transparent
            opacity={0.18}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </Float>
  );
}

/* ---------- Minimal cool lighting — just enough to shape the glass ---------- */
function VoidEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="circle"
        intensity={2.2}
        color="#7fb4ff"
        position={[-3, 2, 3]}
        scale={4}
      />
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#3f6bff"
        position={[3, -1, 2]}
        scale={3.5}
      />
      <Lightformer
        form="rect"
        intensity={0.9}
        color="#bfe8ff"
        position={[0, 3, -4]}
        scale={[5, 1.5, 1]}
      />
    </Environment>
  );
}

export default function NebulaVoid() {
  const scroll = useScroll();
  const stars = useRef<THREE.Group>(null!);

  useFrame((state) => {
    // barely-there parallax drift of the sparse starfield
    if (stars.current) {
      stars.current.rotation.y =
        state.clock.elapsedTime * 0.005 + scroll.offset * 0.18;
    }
  });

  return (
    <>
      <color attach="background" args={["#04030f"]} />
      <fog attach="fog" args={["#05041a", 10, 26]} />

      <ambientLight intensity={0.14} color="#6f8bff" />
      <pointLight
        position={[0, 0, 0]}
        intensity={9}
        color="#4f7bff"
        distance={9}
      />
      <directionalLight position={[4, 5, 3]} intensity={0.5} color="#cfe2ff" />
      <pointLight
        position={[-5, -2, -4]}
        intensity={12}
        color="#2b46cc"
        distance={16}
      />

      <VoidEnvironment />
      <VoidOrb />

      {/* sparse distant stars — restraint, lots of empty dark space */}
      <group ref={stars}>
        <Sparkles
          count={70}
          scale={[22, 14, 14]}
          size={1.4}
          speed={0.06}
          opacity={0.7}
          color="#dce8ff"
          noise={0.5}
        />
        <Sparkles
          count={24}
          scale={[16, 10, 10]}
          size={2.6}
          speed={0.04}
          opacity={0.55}
          color="#9fc4ff"
          noise={0.3}
        />
      </group>

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={0.85}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.3}
          radius={0.7}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0007, 0.0009)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.96} />
      </EffectComposer>
    </>
  );
}

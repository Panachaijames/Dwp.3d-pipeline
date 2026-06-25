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
  name: "Verdant",
  blurb:
    "A living crystal with a soft subsurface green glow, drifting pollen, and god-ray bloom in a mossy dark-green void.",
};

/* ---------- The hero: a faceted crystal with an inner green life-glow ---------- */
function LivingCrystal() {
  const ref = useRef<THREE.Mesh>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null!);
  const scroll = useScroll();

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.y += dt * 0.1;
      ref.current.rotation.x = 0.15 + scroll.offset * Math.PI * 0.45;
      const s = 1 + scroll.offset * 0.3;
      ref.current.scale.setScalar(s);
    }
    if (core.current && coreMat.current) {
      // breathing inner glow — slow, organic, alive
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
      const pulse = 0.35 + 0.65 * Math.pow(breathe, 1.6);
      core.current.scale.setScalar(0.62 + pulse * 0.16);
      core.current.rotation.y -= dt * 0.22;
      core.current.rotation.z += dt * 0.12;
      coreMat.current.opacity = 0.55 + pulse * 0.4;
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.4} floatIntensity={1.1}>
      {/* glowing inner seed — the "life" inside the crystal */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={coreMat}
          color="#7cf59a"
          transparent
          opacity={0.8}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* outer transmission shell with green attenuation = subsurface look */}
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.3, 0]} />
        <MeshTransmissionMaterial
          resolution={256}
          samples={8}
          transmission={1}
          thickness={1.6}
          roughness={0.12}
          ior={1.45}
          chromaticAberration={0.35}
          anisotropicBlur={0.4}
          distortion={0.35}
          distortionScale={0.4}
          temporalDistortion={0.08}
          color={"#c9f7d4"}
          attenuationColor={"#1f7a45"}
          attenuationDistance={0.9}
          emissive={"#0f3d22"}
          emissiveIntensity={0.6}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Floating leaf-shard accents orbiting the crystal ---------- */
function Leaflets() {
  const group = useRef<THREE.Group>(null!);
  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.05;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((c, i) => {
      c.position.y += Math.sin(t * 0.6 + i) * dt * 0.12;
    });
  });
  const leaves = useMemo(
    () =>
      new Array(9).fill(0).map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const radius = 2.3 + (i % 3) * 0.28;
        return {
          pos: [
            Math.cos(a) * radius,
            Math.sin(a * 1.7) * 1.0,
            Math.sin(a) * radius,
          ] as [number, number, number],
          rot: [a * 1.3, a, a * 0.5] as [number, number, number],
          r: 0.08 + (i % 4) * 0.03,
        };
      }),
    []
  );
  return (
    <group ref={group}>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot}>
          <tetrahedronGeometry args={[l.r, 0]} />
          <meshStandardMaterial
            color="#3fae6a"
            roughness={0.35}
            metalness={0.0}
            emissive="#1c6b38"
            emissiveIntensity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Botanical light environment: warm-green canopy lighting ---------- */
function CanopyEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3.2}
        color="#9bf5b0"
        position={[-3, 3, 2]}
        scale={[5, 6, 1]}
        rotation={[0, Math.PI / 4, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.8}
        color="#d8ffd0"
        position={[3, 1, 2]}
        scale={[4, 5, 1]}
        rotation={[0, -Math.PI / 4, 0]}
      />
      <Lightformer
        form="circle"
        intensity={2.4}
        color="#eafff0"
        position={[0, 5, -2]}
        scale={3}
      />
      <Lightformer
        form="rect"
        intensity={1.2}
        color="#1f6b3a"
        position={[0, -4, 1]}
        scale={[6, 3, 1]}
      />
    </Environment>
  );
}

export default function Verdant() {
  const scroll = useScroll();
  const rays = useRef<THREE.PointLight>(null!);

  useFrame((state) => {
    if (rays.current) {
      const t = state.clock.elapsedTime;
      rays.current.intensity = 18 + Math.sin(t * 0.7) * 6 + scroll.offset * 10;
    }
  });

  return (
    <>
      <color attach="background" args={["#04130b"]} />
      <fog attach="fog" args={["#04130b", 7, 18]} />

      <ambientLight intensity={0.3} color="#bfffce" />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.1}
        color="#e8ffe2"
      />
      <pointLight
        ref={rays}
        position={[0, 0, 0]}
        intensity={20}
        color="#5ef08a"
        distance={9}
        decay={2}
      />
      <pointLight
        position={[-4, -2, -3]}
        intensity={14}
        color="#0f7a44"
        distance={14}
      />

      <CanopyEnvironment />
      <LivingCrystal />
      <Leaflets />

      {/* glowing spores / pollen drifting through the scene */}
      <Sparkles
        count={220}
        scale={[10, 7, 7]}
        size={3}
        speed={0.18}
        opacity={0.7}
        color="#bcf7c4"
        noise={1.5}
      />
      {/* finer, brighter pollen close to the crystal */}
      <Sparkles
        count={70}
        scale={[4, 4, 4]}
        size={5}
        speed={0.12}
        opacity={0.9}
        color="#eafff0"
        noise={0.8}
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.15}
          luminanceThreshold={0.4}
          luminanceSmoothing={0.25}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0008, 0.0011)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Sparkles, Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Aurora",
  blurb:
    "Iridescent thin-film crystal shifting teal→violet→rose with view angle, adrift in soft flowing ribbons.",
};

/* ---------- Hero: a slow-turning iridescent crystal (thin-film physical material) ---------- */
function IridescentCrystal() {
  const ref = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (ref.current) {
      ref.current.rotation.y = t * 0.12 + off * Math.PI;
      ref.current.rotation.x = 0.2 + Math.sin(t * 0.18) * 0.12 + off * 0.5;
      const s = 1 + off * 0.28;
      ref.current.scale.setScalar(s);
    }
    if (matRef.current) {
      // breathe the thin-film thickness so the iridescent hue drifts on its own
      matRef.current.iridescenceThicknessRange = [
        180 + Math.sin(t * 0.35) * 60,
        560 + Math.cos(t * 0.27) * 120,
      ];
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.4} floatIntensity={0.9}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshPhysicalMaterial
          ref={matRef}
          color="#0b3a3f"
          roughness={0.12}
          metalness={0.25}
          clearcoat={1}
          clearcoatRoughness={0.08}
          iridescence={1}
          iridescenceIOR={1.6}
          iridescenceThicknessRange={[180, 560]}
          sheen={1}
          sheenColor="#ff8fcf"
          sheenRoughness={0.4}
          envMapIntensity={2.4}
          transmission={0.18}
          thickness={1.1}
          attenuationColor="#3fd9c9"
          attenuationDistance={2.2}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Flowing particle ribbons: thin instanced quads drifting on sine currents ---------- */
function Ribbons() {
  const COUNT = 64;
  const ref = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const seeds = useMemo(
    () =>
      new Array(COUNT).fill(0).map((_, i) => {
        // index-driven deterministic placement (no Math.random at module/render)
        const a = (i / COUNT) * Math.PI * 2;
        const ring = 1.9 + (i % 5) * 0.42;
        return {
          a,
          ring,
          y: Math.sin(i * 1.3) * 1.3,
          speed: 0.18 + (i % 4) * 0.05,
          phase: i * 0.7,
          len: 0.5 + (i % 3) * 0.22,
          hue: (i / COUNT) * 0.5 + 0.45, // teal→violet→rose band
        };
      }),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      const ang = s.a + t * s.speed;
      const r = s.ring + Math.sin(t * 0.4 + s.phase) * 0.35;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const y = s.y + Math.sin(t * 0.5 + s.phase) * 0.6;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, -ang + Math.PI / 2, Math.sin(t * 0.6 + s.phase) * 0.5);
      dummy.scale.set(0.03, s.len, 1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);

      // hue cycles slowly through teal/violet/rose
      color.setHSL((s.hue + t * 0.02) % 1, 0.7, 0.62);
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/* ---------- Aurora environment: teal / violet / rose lightformers for the iridescence to catch ---------- */
function AuroraEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3}
        color="#3fe0d2"
        position={[-3, 2, 2]}
        scale={[6, 5, 1]}
        rotation={[0, Math.PI / 4, 0]}
      />
      <Lightformer
        form="rect"
        intensity={2.6}
        color="#9a6bff"
        position={[3, 0, 2]}
        scale={[5, 6, 1]}
        rotation={[0, -Math.PI / 4, 0]}
      />
      <Lightformer
        form="circle"
        intensity={2.2}
        color="#ff8fcf"
        position={[0, -3, 1]}
        scale={4}
      />
      <Lightformer
        form="circle"
        intensity={2.8}
        color="#dffaf5"
        position={[0, 4, -3]}
        scale={3}
      />
    </Environment>
  );
}

export default function Aurora() {
  return (
    <>
      <color attach="background" args={["#03171a"]} />
      <fog attach="fog" args={["#03171a", 7, 18]} />

      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 5, 4]} intensity={1.1} color="#a8fff2" />
      <pointLight position={[-4, -1, -3]} intensity={26} color="#9a6bff" distance={16} />
      <pointLight position={[3, 2, 4]} intensity={16} color="#ff8fcf" distance={14} />

      <AuroraEnvironment />
      <IridescentCrystal />
      <Ribbons />

      <Sparkles
        count={180}
        scale={[12, 7, 7]}
        size={2.2}
        speed={0.18}
        opacity={0.6}
        color="#bff7ee"
        noise={1.4}
      />

      <EffectComposer>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.4} luminanceSmoothing={0.28} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0011, 0.0014)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.82} />
      </EffectComposer>
    </>
  );
}

"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Sparkles, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Porcelain",
  blurb: "Soft matte-white sculptural form in a warm gallery light — calm, editorial, expensive-minimal.",
};

/* ---------- The hero: a smooth, high-detail porcelain form ---------- */
function PorcelainForm() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // A gently warped icosphere — sculptural but soft, never busy.
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.35, 12);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      // Layered low-frequency trig swells — organic, hand-thrown feel.
      const swell =
        Math.sin(n.x * 2.1 + n.y * 1.3) * 0.11 +
        Math.cos(n.y * 1.7 - n.z * 2.0) * 0.09 +
        Math.sin(n.z * 2.4 + n.x * 1.1) * 0.06;
      v.addScaledVector(n, swell);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Slow, premium rotation; scroll adds a gentle reveal turn.
    ref.current.rotation.y = t * 0.08 + scroll.offset * Math.PI * 0.6;
    ref.current.rotation.x = 0.12 + Math.sin(t * 0.15) * 0.05;
    const s = 1 + scroll.offset * 0.12;
    ref.current.scale.setScalar(s);
  });

  return (
    <Float speed={0.9} rotationIntensity={0.18} floatIntensity={0.5}>
      <mesh ref={ref} geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#f6f1ea"
          roughness={0.62}
          metalness={0}
          clearcoat={0.18}
          clearcoatRoughness={0.55}
          sheen={0.7}
          sheenColor="#fff7ee"
          sheenRoughness={0.6}
          envMapIntensity={0.7}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Soft studio light: large warm softboxes, gallery-like ---------- */
function StudioEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={1.6}
        color="#fffaf2"
        position={[-3.5, 3, 3]}
        scale={[7, 7, 1]}
        rotation={[0, Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.0}
        color="#f3ece2"
        position={[4, -1, 2]}
        scale={[6, 6, 1]}
        rotation={[0, -Math.PI / 5, 0]}
      />
      <Lightformer
        form="circle"
        intensity={1.4}
        color="#ffffff"
        position={[0, 5, -2]}
        scale={5}
      />
    </Environment>
  );
}

export default function Porcelain() {
  return (
    <>
      <color attach="background" args={["#efe9e0"]} />
      <fog attach="fog" args={["#efe9e0", 9, 20]} />

      {/* Gentle, diffuse key + warm fill — no harsh speculars */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} color="#fff6ea" />
      <directionalLight position={[-5, -1, -2]} intensity={0.35} color="#e6ddd0" />

      <StudioEnvironment />
      <PorcelainForm />

      {/* Faint motes of dust drifting in the light — barely there */}
      <Sparkles
        count={90}
        scale={[8, 5, 5]}
        size={1.4}
        speed={0.12}
        opacity={0.28}
        color="#fff7ec"
        noise={0.6}
      />

      <EffectComposer>
        {/* Very light bloom — just a soft glow on the highlights */}
        <Bloom mipmapBlur intensity={0.28} luminanceThreshold={0.82} luminanceSmoothing={0.32} />
        {/* Faint, warm vignette to frame the form */}
        <Vignette eskil={false} offset={0.32} darkness={0.42} />
      </EffectComposer>
    </>
  );
}

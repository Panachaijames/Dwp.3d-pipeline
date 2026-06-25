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
  name: "Prism",
  blurb:
    "A colorless high-dispersion glass prism splitting white key-light into rainbow on a near-black field.",
};

/* ---------- The hero: a triangular optical prism in transmission glass ---------- */
function PrismHero() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // A clean triangular prism: cylinder with 3 radial segments, laid on its side.
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.35, 1.35, 2.4, 3, 1, false);
    // tip a flat face toward the viewer for a crisp specular read
    g.rotateZ(Math.PI / 2);
    g.rotateY(Math.PI / 6);
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    // slow continuous turn + scroll adds a full reveal pass
    ref.current.rotation.y = t * 0.18 + off * Math.PI * 1.5;
    ref.current.rotation.x = Math.sin(t * 0.25) * 0.08 + off * 0.5;
  });

  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.7}>
      <mesh ref={ref} geometry={geometry}>
        <MeshTransmissionMaterial
          resolution={256}
          samples={10}
          transmission={1}
          thickness={2.2}
          roughness={0.02}
          ior={1.52}
          chromaticAberration={1.0}
          anisotropicBlur={0.1}
          distortion={0.05}
          distortionScale={0.2}
          temporalDistortion={0.05}
          clearcoat={1}
          clearcoatRoughness={0.02}
          color={"#ffffff"}
          attenuationColor={"#ffffff"}
          attenuationDistance={4}
        />
      </mesh>
    </Float>
  );
}

/* ---------- A faint refracted "spectrum" wedge cast behind the glass ---------- */
function SpectrumGlow() {
  const ref = useRef<THREE.Mesh>(null!);
  // vertical rainbow gradient drawn procedurally onto a plane (additive, soft)
  const texture = useMemo(() => {
    const w = 4;
    const h = 256;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const f = y / (h - 1);
      // hue sweep across the visible spectrum, eased to fade at the ends
      const hue = 0.0 + f * 0.78; // red -> violet
      const col = new THREE.Color().setHSL(hue, 1.0, 0.55);
      const edge = Math.sin(f * Math.PI); // 0 at edges, 1 in middle
      const a = Math.pow(edge, 0.6);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i + 0] = col.r * 255;
        data[i + 1] = col.g * 255;
        data[i + 2] = col.b * 255;
        data[i + 3] = a * 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const scroll = useScroll();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.28 + Math.sin(t * 0.6) * 0.06 + scroll.offset * 0.18;
  });

  return (
    <mesh ref={ref} position={[1.9, 0, -1.6]} rotation={[0, 0, -0.5]}>
      <planeGeometry args={[2.6, 3.4]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.3}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ---------- Optical studio: dark room with bright white beam Lightformers ---------- */
function OpticalEnvironment() {
  return (
    <Environment resolution={256} background={false}>
      {/* hard white key beam entering from upper-left (the incoming ray) */}
      <Lightformer
        form="rect"
        intensity={8}
        color="#ffffff"
        position={[-4, 2.5, 1]}
        scale={[0.6, 6, 1]}
        rotation={[0, Math.PI / 5, Math.PI / 10]}
      />
      {/* second crisp white beam, lower angle */}
      <Lightformer
        form="rect"
        intensity={6}
        color="#ffffff"
        position={[-3.5, -2, 1.5]}
        scale={[0.5, 4, 1]}
        rotation={[0, Math.PI / 4, -Math.PI / 12]}
      />
      {/* soft cool fill from the right to give the glass body */}
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#cfe0ff"
        position={[4, 1, -2]}
        scale={4}
      />
      {/* faint warm rim from below-back */}
      <Lightformer
        form="circle"
        intensity={0.9}
        color="#ffe9cf"
        position={[0, -4, -3]}
        scale={3}
      />
    </Environment>
  );
}

export default function Prism() {
  const scroll = useScroll();
  void scroll; // scroll consumed by children; kept available per contract

  return (
    <>
      <color attach="background" args={["#04040a"]} />
      <fog attach="fog" args={["#04040a", 8, 18]} />

      <ambientLight intensity={0.12} />
      {/* a tight white spot acting as the incoming light ray */}
      <spotLight
        position={[-5, 4, 3]}
        angle={0.3}
        penumbra={0.6}
        intensity={120}
        distance={20}
        color="#ffffff"
      />
      <pointLight position={[4, -1, 2]} intensity={10} color="#9fc0ff" distance={14} />

      <OpticalEnvironment />

      <SpectrumGlow />
      <PrismHero />

      {/* dust catching the beams — sparse, jewel-cold */}
      <Sparkles
        count={120}
        scale={[10, 7, 5]}
        size={2}
        speed={0.18}
        opacity={0.55}
        color="#ffffff"
        noise={1}
      />

      <EffectComposer enableNormalPass={false}>
        <Bloom
          mipmapBlur
          intensity={1.15}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.18}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0016, 0.0014)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

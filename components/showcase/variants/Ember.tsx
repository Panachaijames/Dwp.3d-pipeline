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
  Noise,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Ember",
  blurb:
    "A dark crystalline shard with a molten glowing core and emissive cracks, rising sparks and warm heat-haze.",
};

/* ---------- Molten inner core: a small displaced sphere that pulses ---------- */
function MoltenCore() {
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const scroll = useScroll();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // a slow, breathing pulse — the core "alive"
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    const flicker = 0.85 + 0.15 * Math.sin(t * 7.3 + Math.cos(t * 3.1));
    if (mat.current) {
      mat.current.emissiveIntensity = (3.4 + pulse * 3.6) * flicker;
    }
    if (ref.current) {
      const s = 0.92 + pulse * 0.06 + scroll.offset * 0.08;
      ref.current.scale.setScalar(s);
      ref.current.rotation.y = t * 0.25;
      ref.current.rotation.x = t * 0.13;
    }
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.72, 2]} />
      <meshStandardMaterial
        ref={mat}
        color="#ff5a18"
        emissive="#ff7a1a"
        emissiveIntensity={5}
        roughness={0.35}
        metalness={0}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------- The crystalline shell: cold dark rock with glowing crack veins ---------- */
function CrystalShell() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // Emissive crack veins are injected via onBeforeCompile: world-space ridges
  // that glow hot orange in the crevices of the faceted rock.
  const onBeforeCompile = useMemo(() => {
    return (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = { value: 0 };
      // expose so useFrame can drive it
      (onBeforeCompile as unknown as { _u?: typeof shader.uniforms })._u =
        shader.uniforms;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec3 vLocalPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vLocalPos = position;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         varying vec3 vLocalPos;
         // cheap 3d-ish ridged value via stacked sines -> sharp crack lines
         float crackField(vec3 p){
           float a = sin(p.x*5.3 + p.y*3.1) + sin(p.y*4.7 - p.z*4.2) + sin(p.z*5.9 + p.x*2.4);
           a = abs(a) * 0.333;
           return a;
         }`
      );

      // Add hot emissive in the seams, modulated by a slow heat pulse
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float cf = crackField(vLocalPos * 1.6 + vec3(0.0, uTime * 0.05, 0.0));
         // narrow, bright cracks: invert + sharpen
         float vein = smoothstep(0.18, 0.0, cf);
         float beat = 0.7 + 0.3 * sin(uTime * 1.6);
         vec3 hot = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.12), vein);
         totalEmissiveRadiance += hot * vein * (2.6 * beat);`
      );
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const u = (onBeforeCompile as unknown as { _u?: { uTime: { value: number } } })._u;
    if (u) u.uTime.value = t;
    if (ref.current) {
      ref.current.rotation.y = t * 0.12;
      ref.current.rotation.x = 0.2 + scroll.offset * Math.PI * 0.4;
      const s = 1 + scroll.offset * 0.22;
      ref.current.scale.setScalar(s);
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.35} floatIntensity={0.7}>
      <mesh ref={ref}>
        <dodecahedronGeometry args={[1.55, 0]} />
        <meshStandardMaterial
          color="#0b0705"
          roughness={0.62}
          metalness={0.55}
          emissive="#000000"
          flatShading
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Warm rim/key environment ---------- */
function ForgeEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={2.4}
        color="#ff8a3c"
        position={[-3, 1.5, 2]}
        scale={[5, 5, 1]}
        rotation={[0, Math.PI / 4, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.1}
        color="#3a1c0a"
        position={[3, -1, 2]}
        scale={[4, 4, 1]}
        rotation={[0, -Math.PI / 4, 0]}
      />
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#ffb066"
        position={[0, 3.5, -3]}
        scale={3}
      />
    </Environment>
  );
}

export default function Ember() {
  const scroll = useScroll();
  const coreLight = useRef<THREE.PointLight>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (coreLight.current) {
      const flicker = 0.85 + 0.15 * Math.sin(t * 9.0 + Math.sin(t * 4.0));
      coreLight.current.intensity = (14 + 8 * Math.sin(t * 1.6)) * flicker;
    }
  });

  return (
    <>
      <color attach="background" args={["#0a0503"]} />
      <fog attach="fog" args={["#0a0503", 6, 18]} />

      <ambientLight intensity={0.12} color="#ff8a4a" />
      {/* the molten core acts as the dominant warm light source */}
      <pointLight
        ref={coreLight}
        position={[0, 0, 0]}
        intensity={18}
        color="#ff6a1e"
        distance={12}
        decay={2}
      />
      <directionalLight
        position={[4, 5, 3]}
        intensity={0.35}
        color="#5a3a28"
      />

      <ForgeEnvironment />

      <CrystalShell />
      <MoltenCore />

      {/* rising sparks — drift upward, hot and bright */}
      <Sparkles
        count={220}
        scale={[7, 8, 7]}
        size={3.2}
        speed={0.6}
        opacity={0.9}
        color="#ff9a44"
        noise={2.2}
      />
      {/* faint deep-ember dust, slow and low */}
      <Sparkles
        count={70}
        scale={[10, 6, 10]}
        size={1.6}
        speed={0.15}
        opacity={0.45}
        color="#ff4810"
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={1.6}
          luminanceThreshold={0.42}
          luminanceSmoothing={0.25}
        />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0011, 0.0016)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
        <Vignette eskil={false} offset={0.22} darkness={0.95} />
      </EffectComposer>
    </>
  );
}

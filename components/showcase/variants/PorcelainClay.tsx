"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Sparkles, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Porcelain · Clay",
  blurb: "A soft rounded clay form with hand-pressed microtexture under warm terracotta light — tactile, human, earthy-minimal.",
  family: "Porcelain",
};

/* ---------- The hero: a warm, hand-thrown clay form ---------- */
function ClayForm() {
  const ref = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const timeRef = useRef({ value: 0 });
  const scroll = useScroll();

  // A softly bulged organic body — rounder and heavier than porcelain,
  // with broad low-frequency swells that read as pinched-by-hand clay.
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.3, 14);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      // Big soft lobes (hand-formed mass) + a slight downward settle (gravity-pulled clay).
      const lobes =
        Math.sin(n.x * 1.6 + n.y * 0.9) * 0.16 +
        Math.cos(n.y * 1.2 - n.z * 1.5) * 0.13 +
        Math.sin(n.z * 1.9 + n.x * 0.8) * 0.09;
      const settle = -Math.max(0, -n.y) * 0.08; // gentle flatten/heaviness at the base
      v.addScaledVector(n, lobes + settle);
      // Mid-frequency plaster ripple — the tactile "pressed surface" cue.
      const ripple =
        (Math.sin(n.x * 9.0) * Math.cos(n.y * 8.0) +
          Math.sin(n.z * 10.0 + n.y * 6.0)) *
        0.012;
      v.addScaledVector(n, ripple);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Procedural clay microtexture: fine grain perturbs the surface normals so
  // the matte material catches the faintest grazing sheen like real plaster.
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = timeRef.current;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vClayPos;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vClayPos = position;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uTime;
           varying vec3 vClayPos;
           // cheap value-noise hash for fine clay grain
           float clayHash(vec3 p){
             p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
             p *= 17.0;
             return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
           }
           float clayNoise(vec3 p){
             vec3 i = floor(p); vec3 f = fract(p);
             f = f * f * (3.0 - 2.0 * f);
             float n = mix(
               mix(mix(clayHash(i + vec3(0,0,0)), clayHash(i + vec3(1,0,0)), f.x),
                   mix(clayHash(i + vec3(0,1,0)), clayHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(clayHash(i + vec3(0,0,1)), clayHash(i + vec3(1,0,1)), f.x),
                   mix(clayHash(i + vec3(0,1,1)), clayHash(i + vec3(1,1,1)), f.x), f.y), f.z);
             return n;
           }`
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
           // Layered grain → tiny normal jitter for a pressed-clay micro-surface.
           float g1 = clayNoise(vClayPos * 38.0);
           float g2 = clayNoise(vClayPos * 96.0);
           float grain = (g1 - 0.5) * 0.6 + (g2 - 0.5) * 0.4;
           vec3 jitter = vec3(
             clayNoise(vClayPos * 64.0 + 11.0) - 0.5,
             clayNoise(vClayPos * 64.0 + 23.0) - 0.5,
             clayNoise(vClayPos * 64.0 + 37.0) - 0.5
           );
           normal = normalize(normal + jitter * 0.14);`
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
           // Grain breaks up the matte roughness so light grazes unevenly.
           roughnessFactor = clamp(roughnessFactor + grain * 0.10, 0.45, 1.0);`
        );
    },
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    timeRef.current.value = t;
    if (!ref.current) return;
    // Slow, weighty turn — clay has mass; scroll nudges a calm reveal.
    ref.current.rotation.y = t * 0.06 + scroll.offset * Math.PI * 0.5;
    ref.current.rotation.x = 0.1 + Math.sin(t * 0.12) * 0.04;
    const s = 1 + scroll.offset * 0.1;
    ref.current.scale.setScalar(s);
  });

  return (
    <Float speed={0.7} rotationIntensity={0.14} floatIntensity={0.4}>
      <mesh ref={ref} geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={matRef}
          color="#d99a78"
          roughness={0.86}
          metalness={0}
          clearcoat={0.06}
          clearcoatRoughness={0.9}
          sheen={0.35}
          sheenColor="#ffd9b8"
          sheenRoughness={0.85}
          envMapIntensity={0.55}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Warm terracotta studio light: low sun-warmed softboxes ---------- */
function ClayEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={1.5}
        color="#ffd6a8"
        position={[-3.2, 2.6, 3]}
        scale={[7, 7, 1]}
        rotation={[0, Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.9}
        color="#e8a07a"
        position={[4, -1, 2]}
        scale={[6, 6, 1]}
        rotation={[0, -Math.PI / 5, 0]}
      />
      <Lightformer
        form="circle"
        intensity={1.2}
        color="#fff1dc"
        position={[0, 4.5, -2]}
        scale={5}
      />
    </Environment>
  );
}

export default function PorcelainClay() {
  return (
    <>
      <color attach="background" args={["#e9d4c0"]} />
      <fog attach="fog" args={["#e9d4c0", 9, 20]} />

      {/* Warm diffuse key + earthy fill — soft, sun-through-linen */}
      <ambientLight intensity={0.5} color="#ffe9d4" />
      <directionalLight position={[4, 6, 5]} intensity={1.05} color="#ffd8ad" />
      <directionalLight position={[-5, -1, -2]} intensity={0.32} color="#c98c66" />

      <ClayEnvironment />
      <ClayForm />

      {/* Fine clay dust adrift in the warm light — barely there */}
      <Sparkles
        count={80}
        scale={[8, 5, 5]}
        size={1.3}
        speed={0.1}
        opacity={0.24}
        color="#ffdcb0"
        noise={0.7}
      />

      <EffectComposer>
        {/* Soft warm bloom on the highlights only */}
        <Bloom mipmapBlur intensity={0.24} luminanceThreshold={0.84} luminanceSmoothing={0.34} />
        {/* Earthy vignette to frame the form */}
        <Vignette eskil={false} offset={0.3} darkness={0.46} />
      </EffectComposer>
    </>
  );
}

"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Sparkles, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Porcelain · Marble",
  blurb: "Polished white marble with subtle procedural grey veining under cool gallery light — solid, luxe, museum-grade stone.",
  family: "Porcelain",
};

/* ---------------------------------------------------------------------------
   GLSL helpers injected into the standard physical material.
   A compact value-noise + 3-octave fBm drives a refined vein field: thin,
   high-contrast grey filaments laid into a warm-white stone, never busy.
--------------------------------------------------------------------------- */
const VEIN_PARS = /* glsl */ `
  varying vec3 vMarblePos;

  vec3 vHash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  // Gradient noise (Perlin-ish), smooth and tileable enough for stone.
  float gnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(dot(vHash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
            dot(vHash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
        mix(dot(vHash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
            dot(vHash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(
        mix(dot(vHash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
            dot(vHash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
        mix(dot(vHash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
            dot(vHash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
      u.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * gnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  // Marble veins: warp the domain, then take ridged turbulence so the
  // iso-contours read as thin grey filaments running through the stone.
  float marbleVein(vec3 p) {
    vec3 q = vec3(fbm(p * 1.1), fbm(p * 1.1 + 5.2), fbm(p * 1.1 + 9.7));
    float n = fbm(p * 1.7 + q * 2.4);
    float vein = 1.0 - abs(n);          // ridges
    vein = pow(vein, 6.0);              // tighten into filaments
    float secondary = pow(1.0 - abs(fbm(p * 3.3 + q)), 9.0) * 0.5;
    return clamp(vein + secondary, 0.0, 1.0);
  }
`;

function MarbleForm() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();

  // A solid, gently faceted-then-smoothed boulder of stone. Slightly more
  // mass and stillness than the airy porcelain icosphere.
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.4, 14);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      // Broad, weighty swells — a carved block, not a thrown vessel.
      const swell =
        Math.sin(n.x * 1.6 + n.y * 1.1) * 0.10 +
        Math.cos(n.y * 1.9 - n.z * 1.4) * 0.07 +
        Math.sin(n.z * 1.3 + n.x * 1.7) * 0.05;
      v.addScaledVector(n, swell);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Inject veining into a polished physical material via onBeforeCompile.
  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#f4f2ee"),
      roughness: 0.22,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.18,
      reflectivity: 0.45,
      envMapIntensity: 1.1,
    });

    mat.onBeforeCompile = (shader) => {
      // model-space position for stable veins as the block rotates
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vMarblePos;"
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvMarblePos = position;"
        );

      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + VEIN_PARS)
        .replace(
          "#include <color_fragment>",
          /* glsl */ `
          #include <color_fragment>
          float veinAmt = marbleVein(vMarblePos * 1.55);
          // cool charcoal-grey veins drawn into warm white stone
          vec3 stone = vec3(0.955, 0.945, 0.930);
          vec3 vein  = vec3(0.345, 0.355, 0.380);
          // faint warm cloudiness in the body for depth
          float cloud = marbleVein(vMarblePos * 0.7) * 0.10;
          vec3 body = mix(stone, stone * vec3(1.01, 1.0, 0.985), cloud);
          diffuseColor.rgb = mix(body, vein, veinAmt * 0.9);
          `
        )
        // veins sit very slightly rougher than the polished field —
        // reads as the natural matte of mineral inclusions.
        .replace(
          "#include <roughnessmap_fragment>",
          /* glsl */ `
          #include <roughnessmap_fragment>
          float vR = marbleVein(vMarblePos * 1.55);
          roughnessFactor = mix(roughnessFactor, roughnessFactor + 0.18, vR * 0.7);
          `
        );
    };

    return mat;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // Very slow, weighty turn — stone doesn't hurry.
    ref.current.rotation.y = t * 0.05 + scroll.offset * Math.PI * 0.5;
    ref.current.rotation.x = 0.1 + Math.sin(t * 0.1) * 0.035;
    const s = 1 + scroll.offset * 0.08;
    ref.current.scale.setScalar(s);
  });

  return (
    <Float speed={0.6} rotationIntensity={0.1} floatIntensity={0.3}>
      <mesh ref={ref} geometry={geometry} material={material} castShadow receiveShadow />
    </Float>
  );
}

/* ---------- Cool neutral gallery light: crisp softboxes, no warmth ---------- */
function GalleryEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={2.0}
        color="#f4f6f8"
        position={[-3.5, 3.2, 3]}
        scale={[7, 8, 1]}
        rotation={[0, Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.15}
        color="#e8ecf1"
        position={[4, -0.5, 2.5]}
        scale={[6, 6, 1]}
        rotation={[0, -Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.3}
        color="#ffffff"
        position={[0, 4.8, -1.5]}
        scale={[5, 3, 1]}
      />
      {/* tight rim to crisp the polished edge */}
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#dfe5ec"
        position={[2.5, 1, -3]}
        scale={2.5}
      />
    </Environment>
  );
}

export default function PorcelainMarble() {
  return (
    <>
      <color attach="background" args={["#e7e8ea"]} />
      <fog attach="fog" args={["#e7e8ea", 10, 22]} />

      {/* Cool, even gallery wash — neutral, no golden cast */}
      <ambientLight intensity={0.5} color="#eef1f4" />
      <directionalLight position={[4, 6, 5]} intensity={1.0} color="#f4f7fb" castShadow />
      <directionalLight position={[-5, -1, -2]} intensity={0.3} color="#d6dce3" />

      <GalleryEnvironment />
      <MarbleForm />

      {/* Cool dust motes drifting in the gallery light — barely there */}
      <Sparkles
        count={70}
        scale={[8, 5, 5]}
        size={1.2}
        speed={0.1}
        opacity={0.22}
        color="#eef3f8"
        noise={0.5}
      />

      <EffectComposer>
        {/* Tight specular bloom on the polished highlights */}
        <Bloom mipmapBlur intensity={0.32} luminanceThreshold={0.85} luminanceSmoothing={0.28} />
        {/* Cool, restrained vignette to seat the block */}
        <Vignette eskil={false} offset={0.3} darkness={0.46} />
      </EffectComposer>
    </>
  );
}

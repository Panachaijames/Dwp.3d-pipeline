"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ScrollControls,
  useScroll,
  Scroll,
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

/* ---------- The hero crystal: faceted ice with transmission glass ---------- */
function Crystal() {
  const ref = useRef<THREE.Mesh>(null!);
  const scroll = useScroll();
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.14;
    ref.current.rotation.x = 0.18 + scroll.offset * Math.PI * 0.55;
    const s = 1 + scroll.offset * 0.35;
    ref.current.scale.setScalar(s);
  });
  return (
    <Float speed={1.3} rotationIntensity={0.5} floatIntensity={1.0}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[1.25, 0]} />
        <MeshTransmissionMaterial
          resolution={256}
          samples={8}
          transmission={1}
          thickness={1.3}
          roughness={0.06}
          ior={1.42}
          chromaticAberration={0.55}
          anisotropicBlur={0.3}
          distortion={0.3}
          distortionScale={0.35}
          temporalDistortion={0.1}
          color={"#bfe4ff"}
          attenuationColor={"#6fa8ff"}
          attenuationDistance={1.4}
        />
      </mesh>
    </Float>
  );
}

/* ---------- Small frost shards orbiting the crystal ---------- */
function Shards() {
  const group = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y -= dt * 0.07;
  });
  const shards = useMemo(
    () =>
      new Array(7).fill(0).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return {
          pos: [
            Math.cos(a) * 2.7,
            Math.sin(a * 1.4) * 0.9,
            Math.sin(a) * 2.7,
          ] as [number, number, number],
          r: 0.1 + (i % 3) * 0.05,
        };
      }),
    []
  );
  return (
    <group ref={group}>
      {shards.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[i, i * 0.7, 0]}>
          <octahedronGeometry args={[s.r, 0]} />
          <meshStandardMaterial
            color="#cfeaff"
            roughness={0.18}
            metalness={0.1}
            emissive="#1c3e7a"
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Cinematic camera: scroll dolly + mouse parallax ---------- */
function CameraRig() {
  const { camera, pointer } = useThree();
  const scroll = useScroll();
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  useFrame(() => {
    const off = scroll.offset;
    const px = pointer.x * 0.7;
    const py = pointer.y * 0.45;
    camera.position.x += (px - camera.position.x) * 0.05;
    camera.position.y += (py + off * 0.5 - camera.position.y) * 0.05;
    camera.position.z += (6 - off * 1.4 - camera.position.z) * 0.05;
    camera.lookAt(target);
  });
  return null;
}

/* ---------- Self-contained studio environment (no external HDRI) ---------- */
function StudioEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3}
        color="#aee0ff"
        position={[-3, 2, 2]}
        scale={[5, 5, 1]}
        rotation={[0, Math.PI / 4, 0]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#ffd9a8"
        position={[3, -1, 2]}
        scale={[4, 4, 1]}
        rotation={[0, -Math.PI / 4, 0]}
      />
      <Lightformer
        form="circle"
        intensity={2.6}
        color="#ffffff"
        position={[0, 4, -3]}
        scale={3}
      />
    </Environment>
  );
}

function Scene({ fx = true }: { fx?: boolean }) {
  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#05070d", 7, 17]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} color="#cfe6ff" />
      <pointLight position={[-4, -2, -3]} intensity={28} color="#3b6fff" distance={16} />

      <StudioEnvironment />
      <Crystal />
      <Shards />
      <Sparkles
        count={140}
        scale={[11, 6, 6]}
        size={2.4}
        speed={0.25}
        opacity={0.7}
        color="#bfe0ff"
        noise={1.3}
      />
      <CameraRig />

      {fx && (
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.95}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.2}
          />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new THREE.Vector2(0.0009, 0.0012)}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.25} darkness={0.85} />
        </EffectComposer>
      )}
    </>
  );
}

/* ---------- DOM overlay (kept in HTML for accessibility / SEO) ---------- */
const ui = {
  kicker: {
    fontSize: 13,
    letterSpacing: "0.42em",
    textTransform: "uppercase" as const,
    color: "rgba(190,224,255,0.75)",
    fontWeight: 500,
    margin: 0,
  },
  h1: {
    fontSize: "clamp(48px, 11vw, 132px)",
    lineHeight: 0.92,
    fontWeight: 300,
    letterSpacing: "-0.02em",
    color: "#eef6ff",
    margin: "18px 0 0",
    textShadow: "0 8px 60px rgba(59,111,255,0.35)",
  },
  sub: {
    maxWidth: 440,
    fontSize: 16,
    lineHeight: 1.7,
    color: "rgba(220,235,255,0.66)",
    fontWeight: 400,
    margin: "22px 0 0",
  },
  cue: {
    position: "absolute" as const,
    bottom: 44,
    fontSize: 12,
    letterSpacing: "0.3em",
    textTransform: "uppercase" as const,
    color: "rgba(190,224,255,0.6)",
  },
};

function Overlay() {
  return (
    <Scroll html style={{ width: "100vw" }}>
      <section
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "0 24px",
        }}
      >
        <p style={ui.kicker}>DWP · 3D Pipeline</p>
        <h1 style={ui.h1}>Crystalline</h1>
        <p style={ui.sub}>
          A real-time WebGL experiment — procedural ice, transmission glass, and
          a scroll-driven camera, built inside the DWP pipeline.
        </p>
        <div style={ui.cue}>Scroll ↓</div>
      </section>

      <section
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 520,
          padding: "0 8vw",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(28px, 5vw, 56px)",
            fontWeight: 300,
            color: "#eef6ff",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Form, frozen in motion.
        </h2>
        <p style={{ ...ui.sub, maxWidth: 520 }}>
          The crystal refracts its environment in real time and reacts to the
          cursor. Everything you see is rendered on the GPU — no video, no
          pre-baked frames.
        </p>
      </section>

      <section style={{ height: "100vh" }} />
    </Scroll>
  );
}

export default function HeroExperience() {
  // ?diag=1 disables antialias + post-FX so headless pixel readback works.
  const diag =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("diag") === "1";
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: !diag, preserveDrawingBuffer: true }}
      camera={{ position: [0, 0, 6], fov: 35 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <ScrollControls pages={3} damping={0.3}>
        <Scene fx={!diag} />
        <Overlay />
      </ScrollControls>
    </Canvas>
  );
}

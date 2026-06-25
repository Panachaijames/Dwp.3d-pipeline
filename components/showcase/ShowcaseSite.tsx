"use client";

import React, { useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollControls, useScroll, Scroll } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import {
  VillaModel,
  PlanGrid,
  DimensionTicks,
  ReferenceDots,
} from "@/components/showcase/variants/HouseBlueprint";
import { FurnitureStage } from "@/components/showcase/Furniture";
import { RealVilla } from "@/components/showcase/RealVilla";

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SZ = -20; // showroom / finale stage z

type Key = { p: number; pos: [number, number, number]; look: [number, number, number] };
const KEYS: Key[] = [
  { p: 0.0, pos: [0, 1.8, 10.0], look: [0, 0.2, 0] }, // villa reveal
  { p: 0.1, pos: [0.3, 0.7, 8.2], look: [0, 0.1, 0] }, // villa settled
  { p: 0.22, pos: [5.5, 1.1, 5.5], look: [0, 0.3, 0] }, // villa 3/4
  { p: 0.34, pos: [-4.6, -0.2, 6.6], look: [0, 0.3, 0] }, // villa hero
  { p: 0.43, pos: [0, 0.8, 1.6], look: [0, 0.3, -10] }, // turn down corridor
  { p: 0.5, pos: [0, 0.5, SZ + 4.6], look: [0, 0.1, SZ] }, // chair
  { p: 0.62, pos: [2.7, 0.4, SZ + 4.4], look: [0, 0.1, SZ] }, // sofa
  { p: 0.74, pos: [-2.3, 0.6, SZ + 4.6], look: [0, 0.1, SZ] }, // table
  { p: 0.87, pos: [0, 0.8, SZ + 8.5], look: [0, -0.1, SZ] }, // cloud re-forming the villa
  { p: 1.0, pos: [0, 1.4, SZ + 10.2], look: [0, -0.1, SZ] }, // realistic colored villa hero
];

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function CameraDirector() {
  const { camera, pointer } = useThree();
  const scroll = useScroll();
  const tPos = useMemo(() => new THREE.Vector3(), []);
  const tLook = useMemo(() => new THREE.Vector3(), []);
  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const al = useMemo(() => new THREE.Vector3(), []);
  const bl = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const p = scroll.offset;
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const t = smoothstep(k0.p, k1.p, p);
    a.set(...k0.pos);
    b.set(...k1.pos);
    al.set(...k0.look);
    bl.set(...k1.look);
    tPos.lerpVectors(a, b, t);
    tLook.lerpVectors(al, bl, t);
    tPos.x += pointer.x * 0.3;
    tPos.y += pointer.y * 0.2;
    camera.position.lerp(tPos, 0.06);
    camera.lookAt(tLook);
  });
  return null;
}

/* warm the void toward dusk as the realistic villa resolves */
function BackgroundFade() {
  const { scene } = useThree();
  const scroll = useScroll();
  const navy = useMemo(() => new THREE.Color("#070f1f"), []);
  const dusk = useMemo(() => new THREE.Color("#21304a"), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const m = smoothstep(0.86, 1.0, scroll.offset);
    c.copy(navy).lerp(dusk, m);
    const bg = scene.background as THREE.Color | null;
    if (bg && (bg as THREE.Color).isColor) bg.copy(c);
    const fog = scene.fog as THREE.Fog | null;
    if (fog) fog.color.copy(c);
  });
  return null;
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#070f1f"]} />
      <fog attach="fog" args={["#081326", 14, 42]} />
      <ambientLight intensity={0.6} />

      <VillaModel assembleStart={0} assembleEnd={0.1} scrollSpin={0} idleSpin={0.025} />
      <PlanGrid />
      <DimensionTicks />
      <ReferenceDots />

      <FurnitureStage position={[0, 0, SZ]} />
      <RealVilla position={[0, 0, SZ]} assembleStart={0.8} assembleEnd={0.98} />

      <BackgroundFade />
      <CameraDirector />

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.72} luminanceThreshold={0.25} luminanceSmoothing={0.3} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0006, 0.0006)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.9} />
      </EffectComposer>
    </>
  );
}

const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.42em", textTransform: "uppercase", color: "rgba(150,210,255,0.8)", fontWeight: 500, margin: 0 };
const h1: React.CSSProperties = { fontSize: "clamp(40px, 8vw, 92px)", lineHeight: 0.98, fontWeight: 300, letterSpacing: "-0.02em", color: "#eaf6ff", marginTop: 16, textShadow: "0 6px 50px rgba(0,0,0,0.7)" };
const h2: React.CSSProperties = { fontSize: "clamp(26px, 5vw, 56px)", fontWeight: 300, letterSpacing: "-0.01em", color: "#eaf6ff", margin: 0, textShadow: "0 4px 40px rgba(0,0,0,0.85)" };
const sub: React.CSSProperties = { maxWidth: 380, fontSize: 15.5, lineHeight: 1.7, color: "rgba(210,235,255,0.7)", marginTop: 16, textShadow: "0 2px 20px rgba(0,0,0,0.9)" };

function sec(extra: React.CSSProperties): React.CSSProperties {
  return { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", fontFamily: FONT, padding: "0 9vw", boxSizing: "border-box", ...extra };
}

function Overlay() {
  return (
    <Scroll html style={{ width: "100vw" }}>
      <section style={sec({ alignItems: "center", textAlign: "center" })}>
        <p style={kicker}>DWP · 3D Visualization Pipeline</p>
        <h1 style={h1}>Every project begins as parts.</h1>
        <p style={{ ...sub, maxWidth: 520, textAlign: "center" }}>Scroll — and watch a building draft itself into being, line by line.</p>
        <div style={{ position: "absolute", bottom: 44, fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(150,210,255,0.6)" }}>Scroll ↓</div>
      </section>

      <section style={sec({ alignItems: "flex-start" })}>
        <p style={kicker}>01 · Survey</p>
        <h2 style={h2}>Drafted with precision.</h2>
        <p style={sub}>Measured, surveyed, exact — every line accounted for before a wall is ever built.</p>
      </section>

      <section style={sec({ alignItems: "flex-end", textAlign: "right" })}>
        <p style={kicker}>02 · Realize</p>
        <h2 style={h2}>From blueprint to building.</h2>
        <p style={{ ...sub, marginLeft: "auto" }}>The structure resolved — now we bring the inside to life.</p>
      </section>

      <section style={sec({ alignItems: "flex-start" })}>
        <p style={kicker}>Interiors · Seating</p>
        <h2 style={h2}>The chair.</h2>
        <p style={sub}>Ergonomics and proportion, resolved in 3D long before a single piece is cut.</p>
      </section>

      <section style={sec({ alignItems: "flex-end", textAlign: "right" })}>
        <p style={kicker}>Interiors · Lounge</p>
        <h2 style={h2}>The sofa.</h2>
        <p style={{ ...sub, marginLeft: "auto" }}>Comfort and scale, visualized in the room before it's ordered.</p>
      </section>

      <section style={sec({ alignItems: "flex-start" })}>
        <p style={kicker}>Interiors · Surfaces</p>
        <h2 style={h2}>The table.</h2>
        <p style={sub}>Where the room comes together — and where the day happens.</p>
      </section>

      <section style={sec({ alignItems: "center", textAlign: "center" })}>
        <p style={kicker}>And then —</p>
        <h2 style={h2}>It comes together — in colour.</h2>
        <p style={{ ...sub, maxWidth: 520, textAlign: "center" }}>Piece by piece, the home falls into place.</p>
      </section>

      <section style={sec({ alignItems: "center", textAlign: "center" })}>
        <p style={kicker}>Realize</p>
        <h1 style={{ ...h1, fontSize: "clamp(44px, 9vw, 104px)" }}>Welcome home.</h1>
        <p style={{ ...sub, maxWidth: 520, textAlign: "center" }}>DWP — architecture and interiors, visualized from first line to finished home.</p>
        <a
          href="/pipeline"
          style={{ marginTop: 26, padding: "13px 30px", border: "1px solid rgba(150,210,255,0.55)", borderRadius: 999, color: "#eaf6ff", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", display: "inline-block", textDecoration: "none", background: "rgba(150,210,255,0.08)", cursor: "pointer", transition: "all 0.2s ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(150,210,255,0.92)"; e.currentTarget.style.color = "#06101f"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(150,210,255,0.08)"; e.currentTarget.style.color = "#eaf6ff"; }}
        >
          Start a project →
        </a>
      </section>
    </Scroll>
  );
}

export default function ShowcaseSite() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [0, 1.8, 10], fov: 35 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <ScrollControls pages={8} damping={0.35}>
        <Scene />
        <Overlay />
      </ScrollControls>
    </Canvas>
  );
}

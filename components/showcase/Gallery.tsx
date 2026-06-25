"use client";

import React, { useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollControls, useScroll } from "@react-three/drei";
import * as THREE from "three";

import Obsidian, { meta as mObsidian } from "@/components/showcase/variants/Obsidian";
import Aurora, { meta as mAurora } from "@/components/showcase/variants/Aurora";
import Ember, { meta as mEmber } from "@/components/showcase/variants/Ember";
import Chrome, { meta as mChrome } from "@/components/showcase/variants/Chrome";
import Prism, { meta as mPrism } from "@/components/showcase/variants/Prism";
import Verdant, { meta as mVerdant } from "@/components/showcase/variants/Verdant";
import Nebula, { meta as mNebula } from "@/components/showcase/variants/Nebula";
import Circuit, { meta as mCircuit } from "@/components/showcase/variants/Circuit";
import Porcelain, { meta as mPorcelain } from "@/components/showcase/variants/Porcelain";
import NebulaVoid, { meta as mNebulaVoid } from "@/components/showcase/variants/NebulaVoid";
import NebulaSupernova, { meta as mNebulaSupernova } from "@/components/showcase/variants/NebulaSupernova";
import NebulaRing, { meta as mNebulaRing } from "@/components/showcase/variants/NebulaRing";
import CircuitBlueprint, { meta as mCircuitBlueprint } from "@/components/showcase/variants/CircuitBlueprint";
import CircuitHologram, { meta as mCircuitHologram } from "@/components/showcase/variants/CircuitHologram";
import CircuitStorm, { meta as mCircuitStorm } from "@/components/showcase/variants/CircuitStorm";
import PorcelainGallery, { meta as mPorcelainGallery } from "@/components/showcase/variants/PorcelainGallery";
import PorcelainClay, { meta as mPorcelainClay } from "@/components/showcase/variants/PorcelainClay";
import PorcelainMarble, { meta as mPorcelainMarble } from "@/components/showcase/variants/PorcelainMarble";
import AssembleIgloo, { meta as mAssembleIgloo } from "@/components/showcase/variants/AssembleIgloo";
import AssembleArch, { meta as mAssembleArch } from "@/components/showcase/variants/AssembleArch";
import AssembleShards, { meta as mAssembleShards } from "@/components/showcase/variants/AssembleShards";
import AssembleMonolith, { meta as mAssembleMonolith } from "@/components/showcase/variants/AssembleMonolith";
import HouseBlueprint, { meta as mHouseBlueprint } from "@/components/showcase/variants/HouseBlueprint";

type Meta = { name: string; blurb: string };
type Item = { key: string; label: string; C: React.ComponentType; meta: Meta };
type Family = { family: string; note: string; items: Item[] };

const FAMILIES: Family[] = [
  {
    family: "★ Chosen",
    note: "fused direction — a modern villa drafting itself together as a living blueprint",
    items: [
      { key: "HouseBlueprint", label: "Villa Blueprint", C: HouseBlueprint, meta: mHouseBlueprint },
    ],
  },
  {
    family: "Assemble",
    note: "components coming together — scroll to build",
    items: [
      { key: "AssembleIgloo", label: "Igloo", C: AssembleIgloo, meta: mAssembleIgloo },
      { key: "AssembleArch", label: "Pavilion", C: AssembleArch, meta: mAssembleArch },
      { key: "AssembleShards", label: "Reassembly", C: AssembleShards, meta: mAssembleShards },
      { key: "AssembleMonolith", label: "Voxel Build", C: AssembleMonolith, meta: mAssembleMonolith },
    ],
  },
  {
    family: "Nebula",
    note: "cosmic translucent orb",
    items: [
      { key: "Nebula", label: "Original", C: Nebula, meta: mNebula },
      { key: "NebulaVoid", label: "Void", C: NebulaVoid, meta: mNebulaVoid },
      { key: "NebulaSupernova", label: "Supernova", C: NebulaSupernova, meta: mNebulaSupernova },
      { key: "NebulaRing", label: "Ringed Giant", C: NebulaRing, meta: mNebulaRing },
    ],
  },
  {
    family: "Circuit",
    note: "blueprint / techno-architectural",
    items: [
      { key: "Circuit", label: "Original", C: Circuit, meta: mCircuit },
      { key: "CircuitBlueprint", label: "Blueprint", C: CircuitBlueprint, meta: mCircuitBlueprint },
      { key: "CircuitHologram", label: "Hologram", C: CircuitHologram, meta: mCircuitHologram },
      { key: "CircuitStorm", label: "Data Storm", C: CircuitStorm, meta: mCircuitStorm },
    ],
  },
  {
    family: "Porcelain",
    note: "matte sculptural minimal",
    items: [
      { key: "Porcelain", label: "Original", C: Porcelain, meta: mPorcelain },
      { key: "PorcelainGallery", label: "Gallery", C: PorcelainGallery, meta: mPorcelainGallery },
      { key: "PorcelainClay", label: "Clay", C: PorcelainClay, meta: mPorcelainClay },
      { key: "PorcelainMarble", label: "Marble", C: PorcelainMarble, meta: mPorcelainMarble },
    ],
  },
  {
    family: "More",
    note: "the other first-round directions",
    items: [
      { key: "Obsidian", label: "Obsidian", C: Obsidian, meta: mObsidian },
      { key: "Aurora", label: "Aurora", C: Aurora, meta: mAurora },
      { key: "Ember", label: "Ember", C: Ember, meta: mEmber },
      { key: "Chrome", label: "Chrome", C: Chrome, meta: mChrome },
      { key: "Prism", label: "Prism", C: Prism, meta: mPrism },
      { key: "Verdant", label: "Verdant", C: Verdant, meta: mVerdant },
    ],
  },
];

const ALL: Item[] = FAMILIES.flatMap((f) => f.items);
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* Shared cinematic camera: scroll dolly + mouse parallax. */
function CameraRig() {
  const { camera, pointer } = useThree();
  const scroll = useScroll();
  const target = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  useFrame(() => {
    const off = scroll.offset;
    camera.position.x += (pointer.x * 0.55 - camera.position.x) * 0.05;
    camera.position.y += (pointer.y * 0.35 + off * 0.35 - camera.position.y) * 0.05;
    camera.position.z += (7.8 - off * 0.8 - camera.position.z) * 0.05;
    camera.lookAt(target);
  });
  return null;
}

function pill(on: boolean): React.CSSProperties {
  return {
    cursor: "pointer",
    padding: "8px 15px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    color: on ? "#0b0e16" : "rgba(255,255,255,0.82)",
    background: on ? "#ffffff" : "rgba(20,24,34,0.5)",
    border: `1px solid ${on ? "#ffffff" : "rgba(255,255,255,0.16)"}`,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    transition: "all 0.18s ease",
  };
}

export default function Gallery() {
  const [fi, setFi] = useState(0);
  const [key, setKey] = useState(FAMILIES[0].items[0].key);
  const active = ALL.find((it) => it.key === key) ?? ALL[0];
  const Active = active.C;
  const family = FAMILIES[fi];

  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 0, 7.8], fov: 35 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ScrollControls pages={3} damping={0.3}>
          <CameraRig />
          <Active key={key} />
        </ScrollControls>
      </Canvas>

      {/* Active caption */}
      <div style={{ position: "fixed", top: 26, left: 0, right: 0, textAlign: "center", pointerEvents: "none", fontFamily: FONT, padding: "0 24px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.4em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
          DWP · Hero Concepts
        </div>
        <div style={{ fontSize: 28, fontWeight: 300, color: "#fff", letterSpacing: "-0.01em", marginTop: 7, textShadow: "0 2px 24px rgba(0,0,0,0.65)" }}>
          {active.meta.name}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.72)", maxWidth: 540, margin: "9px auto 0", textShadow: "0 2px 18px rgba(0,0,0,0.75)" }}>
          {active.meta.blurb}
        </div>
      </div>

      {/* Picker: family tabs + variant pills */}
      <div style={{ position: "fixed", bottom: 24, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: FONT, padding: "0 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
          {FAMILIES.map((f, i) => {
            const on = i === fi;
            return (
              <button
                key={f.family}
                onClick={() => { setFi(i); setKey(f.items[0].key); }}
                style={{
                  cursor: "pointer",
                  padding: "6px 13px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: on ? "#fff" : "rgba(255,255,255,0.5)",
                  background: "transparent",
                  border: `1px solid ${on ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)"}`,
                  transition: "all 0.18s ease",
                }}
              >
                {f.family}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {family.items.map((it) => (
            <button key={it.key} onClick={() => setKey(it.key)} style={pill(it.key === key)}>
              {it.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
          {family.note} · scroll to move / build
        </div>
      </div>
    </>
  );
}

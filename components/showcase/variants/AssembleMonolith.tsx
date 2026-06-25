"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Assemble · Voxel Build",
  blurb:
    "A grid of electric-blue cubes rains down and stacks bottom-up into a stepped monolith, each layer cladding from hot emissive to dark solid as it locks into place.",
  family: "Assemble",
};

/* ---------- Palette ---------- */
const VOID = "#05070d"; // near-black background
const VOID_FOG = "#070a12";
const ELECTRIC = new THREE.Color("#3aa0ff"); // hot arrival blue
const ELECTRIC_HOT = new THREE.Color("#9ad4ff"); // brightest leading edge
const SOLID = new THREE.Color("#0c1626"); // settled dark monolith
const GRID = "#1b3a5c"; // faint floor grid

/* smoothstep — eased local progress per component */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const CUBE = 0.34; // edge length of one voxel
const GAP = 0.04; // seam between voxels
const STEP = CUBE + GAP; // grid pitch

/* ============================================================
   Voxel monolith — a stepped dome silhouette built from a grid
   of small cubes. Each cube has an ASSEMBLED target (its slot in
   the form) and a DISPERSED start (scattered + raised high above).
   On scroll, layers arrive bottom-up: per-layer stagger means the
   base locks first, then the structure climbs. Each cube clads
   from hot emissive electric-blue to a dark solid as it settles.
   InstancedMesh keeps the whole build to a single draw call.
   ============================================================ */
function VoxelMonolith() {
  const inst = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const scroll = useScroll();

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  /* Build the voxel set: a stepped pyramid/dome. Footprint shrinks
     as layers rise, giving a ziggurat monolith silhouette. We also
     precompute deterministic dispersed START transforms (index+trig,
     no Math.random) so pieces fly in from scattered points above. */
  const voxels = useMemo(() => {
    type Voxel = {
      // assembled target
      tx: number;
      ty: number;
      tz: number;
      // dispersed start
      sx: number;
      sy: number;
      sz: number;
      srx: number;
      sry: number;
      srz: number;
      layer: number;
      layerCount: number;
    };
    const list: Voxel[] = [];

    // Layer footprints (half-width in voxel cells) — shrinks upward.
    const layers = [4, 4, 3, 3, 2, 2, 1, 1]; // half-extent per layer
    const totalLayers = layers.length;

    for (let ly = 0; ly < totalLayers; ly++) {
      const half = layers[ly];
      const cy = (ly - (totalLayers - 1) / 2) * STEP + STEP * 0.5;
      // Number of cells per side for this layer (centered grid).
      const cells: { gx: number; gz: number }[] = [];
      for (let gx = -half; gx <= half; gx++) {
        for (let gz = -half; gz <= half; gz++) {
          // Round the footprint slightly for a dome-ish read on lower
          // wide layers; keep upper layers solid blocks.
          if (half >= 4) {
            const rr = Math.hypot(gx, gz);
            if (rr > half + 0.25) continue;
          }
          cells.push({ gx, gz });
        }
      }
      const layerCount = cells.length;
      for (let i = 0; i < cells.length; i++) {
        const { gx, gz } = cells[i];
        const tx = gx * STEP;
        const tz = gz * STEP;
        const ty = cy;

        // Deterministic dispersed start: scatter on a wide ring far
        // above, angle from a hash of position so it looks random but
        // is stable. Pieces are RAISED (high +y) so they descend in.
        const seed = ly * 31 + i * 7.13;
        const ang = seed * 2.39996; // golden-angle-ish spread
        const radius = 3.4 + ((ly * 13 + i * 5) % 11) * 0.28;
        const sx = Math.cos(ang) * radius + Math.sin(seed) * 0.6;
        const sz = Math.sin(ang) * radius + Math.cos(seed * 1.7) * 0.6;
        // Raised high, with higher layers starting even higher so the
        // descent reads as a top-down rain into the form.
        const sy = 4.2 + ly * 0.9 + (Math.sin(seed * 0.9) + 1) * 1.1;

        list.push({
          tx,
          ty,
          tz,
          sx,
          sy,
          sz,
          srx: Math.sin(seed) * Math.PI,
          sry: Math.cos(seed * 1.3) * Math.PI,
          srz: Math.sin(seed * 0.7) * Math.PI,
          layer: ly,
          layerCount,
        });
      }
    }
    return { list, totalLayers };
  }, []);

  const count = voxels.list.length;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    const mesh = inst.current;
    if (!mesh) return;

    const { list, totalLayers } = voxels;

    for (let i = 0; i < count; i++) {
      const v = list[i];

      /* Per-layer stagger: the build climbs bottom-up. Each layer is
         allotted a window of the scroll range; within that window the
         layer's cubes ease in. We leave a little overlap so the build
         flows continuously rather than stepping rigidly. */
      const layerSpan = 0.62 / totalLayers; // each layer's arrival window
      const layerStart = (v.layer / totalLayers) * 0.62;
      // Tiny intra-layer offset so cubes within a layer don't snap
      // perfectly in unison — a subtle shimmer of settling.
      const intra = (i % 9) * 0.012;
      const p = smoothstep(
        layerStart + intra,
        layerStart + layerSpan + intra,
        off
      );

      // Position: lerp from dispersed start to assembled target.
      // A small downward overshoot easing makes the descent feel like
      // it "drops" the last bit into place.
      const drop = 1 - Math.pow(1 - p, 3); // ease-out for the landing
      const px = THREE.MathUtils.lerp(v.sx, v.tx, p);
      const py = THREE.MathUtils.lerp(v.sy, v.ty, drop);
      const pz = THREE.MathUtils.lerp(v.sz, v.tz, p);

      // Rotation: tumbling while dispersed, snapping to axis-aligned
      // as it locks in.
      const rx = THREE.MathUtils.lerp(v.srx, 0, drop);
      const ry = THREE.MathUtils.lerp(v.sry, 0, drop);
      const rz = THREE.MathUtils.lerp(v.srz, 0, drop);

      // Scale: faint & small while far, full once assembled.
      const sc = THREE.MathUtils.lerp(0.45, 1, smoothstep(0, 0.6, p));

      dummy.position.set(px, py, pz);
      dummy.rotation.set(rx, ry, rz);
      dummy.scale.setScalar(sc * CUBE);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      /* Cladding: a cube arrives HOT electric-blue and cools to the
         dark settled solid as it locks. The leading edge of arrival
         (p ~ 0.6..0.95) glows brightest, then settles. */
      const arrival = smoothstep(0.45, 1.0, p); // 0 hot -> 1 settled
      // Hot->electric->solid blend.
      tmpColor.copy(ELECTRIC_HOT);
      tmpColor.lerp(ELECTRIC, smoothstep(0.0, 0.5, arrival));
      tmpColor.lerp(SOLID, smoothstep(0.5, 1.0, arrival));
      // A pulse of brightness right as it lands (catch the eye).
      const land = (1 - Math.abs(p - 0.82) / 0.18) * (p > 0.64 ? 1 : 0);
      if (land > 0) {
        tmpColor.lerp(ELECTRIC_HOT, Math.max(0, land) * 0.5);
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    /* Idle life on the assembled form: once mostly built, a gentle
       turntable rotation + breathing float. Rotation scales with
       assembly so a dispersed cloud doesn't spin distractingly. */
    if (group.current) {
      const built = smoothstep(0.55, 1, off);
      group.current.rotation.y = t * 0.12 * built + off * 0.5;
      group.current.position.y = Math.sin(t * 0.5) * 0.04 * built;
    }
  });

  return (
    <group ref={group}>
      <instancedMesh
        ref={inst}
        args={[undefined as any, undefined as any, count]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        {/* Emissive standard material: instanceColor drives both base
            and (via vertexColors emissive trick) the electric glow.
            We keep emissiveIntensity high so the hot blue blooms. */}
        <meshStandardMaterial
          vertexColors
          metalness={0.35}
          roughness={0.35}
          emissive={ELECTRIC}
          emissiveIntensity={0.85}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ============================================================
   Faint architectural floor grid — gives the descent a ground to
   build upon, reinforcing the bottom-up read. Sits just under the
   monolith base. Two overlaid grids (fine + coarse) for a precise,
   technical feel.
   ============================================================ */
function GridFloor() {
  const baseY = -((8 - 1) / 2) * STEP - STEP; // a touch below lowest layer
  const fine = useMemo(() => {
    const g = new THREE.GridHelper(20, 60, GRID, GRID);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.1;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);
  const coarse = useMemo(() => {
    const g = new THREE.GridHelper(20, 12, "#2e5d8c", GRID);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.22;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);
  return (
    <group position={[0, baseY, 0]}>
      <primitive object={fine} />
      <primitive object={coarse} />
    </group>
  );
}

/* ============================================================
   Dust motes — a sparse field of faint blue points drifting in the
   void, catching the bloom. Pure atmosphere; deterministic layout.
   ============================================================ */
function Motes() {
  const ref = useRef<THREE.Points>(null!);
  const count = 160;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996;
      const r = 3.2 + (i % 7) * 0.5;
      const y = Math.sin(i * 0.47) * 4.0 + Math.cos(i * 0.19) * 1.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.015;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={"#5ab0ff"}
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.4}
        toneMapped={false}
        depthWrite={false}
      />
    </points>
  );
}

/* ============================================================
   Post — bloom to let the hot arriving cubes glow like molten ingots
   of light, tight vignette to focus the build in the void.
   ============================================================ */
function Post() {
  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        intensity={0.85}
        luminanceThreshold={0.35}
        luminanceSmoothing={0.25}
      />
      <Vignette eskil={false} offset={0.3} darkness={0.92} />
    </EffectComposer>
  );
}

export default function AssembleMonolith() {
  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID_FOG, 9, 22]} />

      {/* Cool key light from above-front to rake the descending cubes,
          a dim cyan fill, and a low rim to catch settled edges. */}
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={1.1}
        color={"#cfe8ff"}
      />
      <pointLight
        position={[-5, 3, 4]}
        intensity={14}
        color={"#3aa0ff"}
        distance={24}
      />
      <pointLight
        position={[0, -3, 3]}
        intensity={6}
        color={"#1d4f8c"}
        distance={18}
      />

      <Environment resolution={128}>
        <Lightformer
          form="rect"
          intensity={1.4}
          color={"#9ad4ff"}
          position={[-3, 5, 3]}
          scale={[7, 7, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          color={"#2e5d8c"}
          position={[4, -2, 2]}
          scale={[5, 5, 1]}
        />
      </Environment>

      <VoxelMonolith />
      <GridFloor />
      <Motes />

      <Post />
    </>
  );
}

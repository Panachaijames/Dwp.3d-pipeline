"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Circuit · Blueprint",
  blurb:
    "A living architectural blueprint: crisp cyan & white wireframe massing on deep navy, with a measured ground grid, drifting dimension ticks and a slow orthographic survey.",
  family: "Circuit",
};

/* ---------- Palette ---------- */
const NAVY = "#070f1f"; // deep blueprint navy
const NAVY_FOG = "#081326";
const CYAN = "#7fd6ff"; // technical-drawing cyan
const CYAN_HOT = "#bfeaff"; // near-white highlight cyan
const PAPER = "#eaf6ff"; // chalk-white linework

/* ============================================================
   Hero — architectural massing, rendered as a blueprint:
   a primary tower volume with offset slabs and a podium,
   every edge a clean line, vertices marked with small node
   crosses. Slow, exact rotation reads like a survey turntable.
   ============================================================ */
function MassingModel() {
  const group = useRef<THREE.Group>(null!);
  const primaryEdges = useRef<THREE.LineBasicMaterial>(null!);
  const accentEdges = useRef<THREE.LineBasicMaterial>(null!);
  const scroll = useScroll();

  /* Box-shaped volumes that compose the building. Each is a unit
     box scaled/placed; we build clean EdgesGeometry per volume so
     only true silhouette/structural lines draw (no diagonals). */
  const volumes = useMemo(() => {
    type Vol = {
      pos: [number, number, number];
      scale: [number, number, number];
      accent?: boolean;
    };
    const list: Vol[] = [
      // podium base
      { pos: [0, -1.55, 0], scale: [2.4, 0.5, 2.0] },
      // main tower core
      { pos: [-0.15, 0.05, 0], scale: [1.05, 2.7, 1.05] },
      // offset glazed wing (accent)
      { pos: [0.85, -0.25, 0.1], scale: [0.7, 1.7, 0.85], accent: true },
      // cantilever slab
      { pos: [0.2, 0.75, -0.05], scale: [1.9, 0.16, 1.35] },
      // crown / mechanical box
      { pos: [-0.15, 1.55, 0], scale: [0.7, 0.55, 0.7], accent: true },
    ];
    return list.map((v) => {
      const box = new THREE.BoxGeometry(v.scale[0], v.scale[1], v.scale[2]);
      const edges = new THREE.EdgesGeometry(box, 1);
      box.dispose();
      return { edges, pos: v.pos, scale: v.scale, accent: !!v.accent };
    });
  }, []);

  /* Faint solid fills (navy) so the model has volume and the far
     edges read as "behind" the near ones — that subtle occlusion
     is what sells a blueprint as a real object, not a tangle. */
  const fillGeos = useMemo(
    () => volumes.map((v) => ({ pos: v.pos, scale: v.scale })),
    [volumes]
  );

  /* Vertex node crosses — small white markers at structural corners
     of the tower core, like survey reference points. */
  const nodes = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const hx = 1.05 / 2;
    const hy = 2.7 / 2;
    const hz = 1.05 / 2;
    const cy = 0.05;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1])
          pts.push(new THREE.Vector3(-0.15 + sx * hx, cy + sy * hy, sz * hz));
    return pts;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const nodeInst = useRef<THREE.InstancedMesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (group.current) {
      // Slow survey turntable; scroll nudges the viewing azimuth.
      group.current.rotation.y = t * 0.12 + off * Math.PI * 0.9;
      // A barely-there tilt breathing — keeps it orthographic-calm.
      group.current.rotation.x = 0.06 + Math.sin(t * 0.18) * 0.03;
    }

    // Linework "draws in" — opacity sweeps gently like a refreshing plot.
    if (primaryEdges.current) {
      primaryEdges.current.opacity = 0.78 + 0.14 * Math.sin(t * 0.6);
    }
    if (accentEdges.current) {
      accentEdges.current.opacity = 0.85 + 0.12 * Math.sin(t * 0.6 + 1.2);
    }

    // Node markers pulse subtly in sequence (a measured scan).
    if (nodeInst.current) {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.8);
        const s = 0.05 + pulse * 0.03;
        dummy.position.copy(n);
        dummy.scale.setScalar(s);
        dummy.rotation.set(0, t * 0.3 + i, Math.PI / 4);
        dummy.updateMatrix();
        nodeInst.current.setMatrixAt(i, dummy.matrix);
      }
      nodeInst.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      {/* Faint navy solids for depth/occlusion */}
      {fillGeos.map((f, i) => (
        <mesh key={`fill-${i}`} position={f.pos}>
          <boxGeometry args={f.scale} />
          <meshBasicMaterial
            color={NAVY}
            transparent
            opacity={0.55}
            depthWrite
          />
        </mesh>
      ))}

      {/* Clean structural edges */}
      {volumes.map((v, i) => (
        <lineSegments key={`edge-${i}`} geometry={v.edges} position={v.pos}>
          {v.accent ? (
            <lineBasicMaterial
              ref={i === 2 ? accentEdges : undefined}
              color={CYAN_HOT}
              transparent
              opacity={0.9}
              toneMapped={false}
              depthWrite={false}
            />
          ) : (
            <lineBasicMaterial
              ref={i === 1 ? primaryEdges : undefined}
              color={CYAN}
              transparent
              opacity={0.82}
              toneMapped={false}
              depthWrite={false}
            />
          )}
        </lineSegments>
      ))}

      {/* Survey node markers (small white octahedra read as cross-ticks) */}
      <instancedMesh
        ref={nodeInst}
        args={[undefined as any, undefined as any, nodes.length]}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          color={PAPER}
          toneMapped={false}
          transparent
          opacity={0.95}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ============================================================
   Measured ground grid — a fine + coarse blueprint plan grid,
   sitting under the model. Two overlaid grids give the
   millimeter/meter feel of real drafting paper.
   ============================================================ */
function PlanGrid() {
  const fine = useMemo(() => {
    const g = new THREE.GridHelper(24, 48, CYAN, CYAN);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.08;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);
  const coarse = useMemo(() => {
    const g = new THREE.GridHelper(24, 12, CYAN_HOT, CYAN);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.16;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);
  return (
    <group position={[0, -1.82, 0]}>
      <primitive object={fine} />
      <primitive object={coarse} />
    </group>
  );
}

/* ============================================================
   Dimension ticks — thin radial guide lines and small end-cap
   markers orbiting the model at a fixed survey radius, like
   extension/dimension lines on a drawing. Deterministic layout.
   ============================================================ */
function DimensionTicks() {
  const ringRef = useRef<THREE.Group>(null!);
  const scroll = useScroll();

  const segments = useMemo(() => {
    const COUNT = 18;
    const items: { angle: number; r: number; len: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      // Alternate longer "major" ticks and shorter "minor" ticks.
      const major = i % 3 === 0;
      items.push({
        angle,
        r: 2.6,
        len: major ? 0.34 : 0.16,
      });
    }
    return items;
  }, []);

  // A single thin circle as the dimension baseline.
  const ringGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const SEG = 96;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // Per-tick small line geometries (radial extension lines).
  const tickGeos = useMemo(() => {
    return segments.map((s) => {
      const x = Math.cos(s.angle);
      const z = Math.sin(s.angle);
      const inner = new THREE.Vector3(x * s.r, 0, z * s.r);
      const outer = new THREE.Vector3(
        x * (s.r + s.len),
        0,
        z * (s.r + s.len)
      );
      return new THREE.BufferGeometry().setFromPoints([inner, outer]);
    });
  }, [segments]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      // Counter-rotate slowly vs. the model — measured survey sweep.
      ringRef.current.rotation.y = -t * 0.05 - scroll.offset * Math.PI * 0.4;
    }
  });

  return (
    <group ref={ringRef} position={[0, -1.0, 0]} rotation={[0.14, 0, 0]}>
      <lineLoop geometry={ringGeo}>
        <lineBasicMaterial
          color={CYAN}
          transparent
          opacity={0.22}
          toneMapped={false}
          depthWrite={false}
        />
      </lineLoop>
      {tickGeos.map((g, i) => (
        <lineSegments key={`tick-${i}`} geometry={g}>
          <lineBasicMaterial
            color={i % 3 === 0 ? CYAN_HOT : CYAN}
            transparent
            opacity={i % 3 === 0 ? 0.6 : 0.32}
            toneMapped={false}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

/* ============================================================
   Reference points — a sparse, calm field of plotted coordinate
   dots floating in the navy, like survey stars on the sheet.
   Deterministic golden-angle placement, gentle drift only.
   ============================================================ */
function ReferenceDots() {
  const ref = useRef<THREE.Points>(null!);
  const count = 220;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996; // golden angle
      const r = 3.4 + (i % 9) * 0.42;
      const y = Math.sin(i * 0.53) * 3.6 + Math.cos(i * 0.21) * 0.6;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={CYAN}
        size={0.02}
        sizeAttenuation
        transparent
        opacity={0.45}
        toneMapped={false}
        depthWrite={false}
      />
    </points>
  );
}

/* ============================================================
   Post — restrained and precise. Soft bloom to let the linework
   glow like backlit cyan ink, a whisper of chromatic aberration
   (NO glitch animation — held constant and tiny), tight vignette.
   ============================================================ */
function Post() {
  const offset = useMemo(() => new THREE.Vector2(0.0005, 0.0005), []);
  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        intensity={0.7}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.3}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.32} darkness={0.9} />
    </EffectComposer>
  );
}

export default function CircuitBlueprint() {
  return (
    <>
      <color attach="background" args={[NAVY]} />
      <fog attach="fog" args={[NAVY_FOG, 9, 24]} />

      {/* Cool, even lighting — a draughtsman's lightbox, not drama */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 4]} intensity={0.6} color={CYAN_HOT} />
      <pointLight
        position={[-4, 2, 3]}
        intensity={10}
        color={CYAN}
        distance={20}
      />

      <Environment resolution={128}>
        <Lightformer
          form="rect"
          intensity={1.1}
          color={CYAN}
          position={[-3, 3, 3]}
          scale={[6, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.7}
          color={PAPER}
          position={[3, -1, 2]}
          scale={[4, 4, 1]}
        />
      </Environment>

      <MassingModel />
      <PlanGrid />
      <DimensionTicks />
      <ReferenceDots />

      <Post />
    </>
  );
}

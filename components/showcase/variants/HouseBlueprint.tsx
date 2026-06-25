"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Villa · Blueprint",
  blurb:
    "A modern flat-roof villa drafts itself together — two offset volumes, floating roof and floor slabs, a cantilever on pilotis, big glazing and a terrace deck descend and lock as cyan linework on the survey grid.",
  family: "Chosen",
};

const NAVY = "#070f1f";
const NAVY_FOG = "#081326";
const CYAN = new THREE.Color("#7fd6ff");
const CYAN_HOT = new THREE.Color("#bfeaff");

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export type VillaPart = {
  geo: THREE.BufferGeometry;
  tPos: THREE.Vector3;
  sPos: THREE.Vector3;
  sRot: THREE.Euler;
  order: number;
  accent: boolean;
  kind: string; // slab | wall | roof | column | glass | door | detail
};
type Part = VillaPart;

/* ---------- build a modern flat-roof villa from clean rectilinear parts ----------
   exported so the finale (point cloud + solid realistic build) reuses the EXACT
   same massing as the opening blueprint. */
export function buildVilla(): Part[] {
  const base = -1.6;
  const wallT = 0.08;

  // lower volume (ground floor), offset to -x
  const lw = 2.6, ld = 2.4, lh = 1.3, xL = -0.35;
  const lvY = base + lh / 2;
  const lowerTopY = base + lh;

  // upper volume (first floor), wider + offset to +x → cantilevers over the terrace
  const uw = 3.3, ud = 1.9, uh = 1.2, xU = 0.3;
  const uvY = lowerTopY + uh / 2;
  const upperTopY = lowerTopY + uh;

  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  type Spec = { geo: THREE.BufferGeometry; pos: [number, number, number]; order: number; accent?: boolean; kind: string };
  const s: Spec[] = [];

  s.push({ geo: box(4.8, 0.14, 3.0), pos: [0.1, base - 0.05, 0], order: 0.0, kind: "slab" }); // terrace deck
  s.push({ geo: box(lw, lh, ld), pos: [xL, lvY, 0], order: 0.12, kind: "wall" }); // lower volume
  s.push({ geo: box(lw + 0.6, 0.1, ld + 0.6), pos: [xL, lowerTopY, 0], order: 0.3, accent: true, kind: "slab" }); // floor/roof plane
  s.push({ geo: box(0.1, 0.32, 2.8), pos: [2.35, base + 0.12, 0], order: 0.34, kind: "detail" }); // parapet
  s.push({ geo: box(0.1, lh, 0.1), pos: [1.55, lvY, 0.7], order: 0.46, kind: "column" }); // pilotis
  s.push({ geo: box(0.1, lh, 0.1), pos: [1.55, lvY, -0.7], order: 0.48, kind: "column" });
  s.push({ geo: box(uw, uh, ud), pos: [xU, uvY, 0], order: 0.42, kind: "wall" }); // upper volume
  s.push({ geo: box(uw + 0.6, 0.1, ud + 0.6), pos: [xU, upperTopY + 0.05, 0], order: 0.62, accent: true, kind: "roof" }); // flat roof
  s.push({ geo: box(1.5, 0.07, 0.72), pos: [xL, base + 1.02, ld / 2 + 0.35], order: 0.7, accent: true, kind: "roof" }); // canopy
  s.push({ geo: box(0.62, 1.02, wallT * 1.6), pos: [xL + 0.2, base + 0.53, ld / 2 + 0.03], order: 0.74, accent: true, kind: "door" });
  s.push({ geo: box(0.05, lh * 0.78, 0.05), pos: [xL - 0.7, lvY, ld / 2 + 0.02], order: 0.8, accent: true, kind: "detail" });
  s.push({ geo: box(0.05, lh * 0.78, 0.05), pos: [xL, lvY, ld / 2 + 0.02], order: 0.81, accent: true, kind: "detail" });
  s.push({ geo: box(0.05, lh * 0.78, 0.05), pos: [xL + 0.7, lvY, ld / 2 + 0.02], order: 0.82, accent: true, kind: "detail" });
  s.push({ geo: box(uw * 0.82, 0.42, 0.05), pos: [xU, uvY + 0.08, ud / 2 + 0.02], order: 0.86, accent: true, kind: "glass" }); // ribbon window
  s.push({ geo: box(0.05, 0.42, 0.06), pos: [xU - 0.8, uvY + 0.08, ud / 2 + 0.02], order: 0.88, accent: true, kind: "detail" });
  s.push({ geo: box(0.05, 0.42, 0.06), pos: [xU + 0.8, uvY + 0.08, ud / 2 + 0.02], order: 0.89, accent: true, kind: "detail" });
  s.push({ geo: box(0.06, lh * 0.7, ld * 0.7), pos: [xL - lw / 2 - 0.02, lvY, 0], order: 0.92, accent: true, kind: "glass" }); // side glazing
  s.push({ geo: box(0.06, 0.42, ud * 0.7), pos: [xU + uw / 2 + 0.02, uvY + 0.08, 0], order: 0.95, accent: true, kind: "glass" });

  return s.map((spec, i) => {
    const a = i * 2.3999632;
    const radius = 2.8 + (i % 4) * 0.5;
    return {
      geo: spec.geo,
      tPos: new THREE.Vector3(spec.pos[0], spec.pos[1], spec.pos[2]),
      sPos: new THREE.Vector3(
        Math.cos(a) * radius,
        3.6 + ((i * 29) % 100) / 100 * 2.6,
        Math.sin(a) * radius
      ),
      sRot: new THREE.Euler(Math.sin(a) * 0.55, a * 0.4, Math.cos(a * 1.3) * 0.55),
      order: spec.order,
      accent: !!spec.accent,
      kind: spec.kind,
    };
  });
}

/* ---------- the assembling, self-drafting villa ----------
   assembleStart/End map the build to a sub-range of scroll (so a multi-section
   page can finish the build early); scrollSpin/idleSpin control rotation. */
export function VillaModel({
  assembleStart = 0,
  assembleEnd = 1,
  scrollSpin = 0.12,
  idleSpin = 0.05,
}: {
  assembleStart?: number;
  assembleEnd?: number;
  scrollSpin?: number;
  idleSpin?: number;
} = {}) {
  const scroll = useScroll();
  const spin = useRef<THREE.Group>(null!);

  const { root, parts } = useMemo(() => {
    const root = new THREE.Group();
    const villa = buildVilla();
    const parts = villa.map((p) => {
      const g = new THREE.Group();
      const fillMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(NAVY),
        transparent: true,
        opacity: 0.1,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      const fill = new THREE.Mesh(p.geo, fillMat);
      const baseCol = (p.accent ? CYAN_HOT : CYAN).clone();
      const lineMat = new THREE.LineBasicMaterial({
        color: baseCol.clone(),
        transparent: true,
        opacity: 0.1,
        toneMapped: false,
        depthWrite: false,
      });
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(p.geo, 1), lineMat);
      g.add(fill);
      g.add(line);
      root.add(g);
      return { p, g, fillMat, lineMat, baseCol };
    });
    return { root, parts };
  }, []);

  const vPos = useMemo(() => new THREE.Vector3(), []);
  const qS = useMemo(() => new THREE.Quaternion(), []);
  const qT = useMemo(() => new THREE.Quaternion(), []);
  const qO = useMemo(() => new THREE.Quaternion(), []);
  const qZero = useMemo(() => new THREE.Quaternion(), []);
  const cTmp = useMemo(() => new THREE.Color(), []);

  const stagger = 0.5;

  useFrame((state, delta) => {
    const off = scroll.offset;
    const t = state.clock.elapsedTime;
    const a = smoothstep(assembleStart, assembleEnd, off); // assembly progress
    const built = smoothstep(0.7, 1, a);

    if (spin.current) {
      spin.current.rotation.y = THREE.MathUtils.damp(
        spin.current.rotation.y,
        t * idleSpin * built + off * Math.PI * scrollSpin,
        2,
        delta
      );
      spin.current.rotation.x = 0.04 + Math.sin(t * 0.16) * 0.02;
      spin.current.position.y = Math.sin(t * 0.4) * 0.02 * built;
    }

    const span = 1 - stagger;
    for (let i = 0; i < parts.length; i++) {
      const { p, g, fillMat, lineMat, baseCol } = parts[i];
      const start = p.order * span;
      const local = smoothstep(start, start + stagger, a);

      vPos.lerpVectors(p.sPos, p.tPos, local);
      qS.setFromEuler(p.sRot);
      qO.copy(qS).slerp(qZero, local); // settle to axis-aligned (modern = orthogonal)
      const sc = 0.45 + local * 0.55;
      g.position.copy(vPos);
      g.quaternion.copy(qO);
      g.scale.setScalar(sc);

      const lock = smoothstep(0.78, 1, local);
      lineMat.opacity = 0.1 + local * 0.72 + lock * 0.16;
      cTmp.copy(baseCol).lerp(CYAN_HOT, lock);
      lineMat.color.copy(cTmp);
      fillMat.opacity = 0.05 + local * 0.34;
    }
    void qT;
  });

  return (
    <group ref={spin}>
      <primitive object={root} />
    </group>
  );
}

/* ---------- measured plan grid ---------- */
export function PlanGrid() {
  const fine = useMemo(() => {
    const g = new THREE.GridHelper(30, 60, CYAN.getHex(), CYAN.getHex());
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true; m.opacity = 0.07; m.toneMapped = false; m.depthWrite = false;
    return g;
  }, []);
  const coarse = useMemo(() => {
    const g = new THREE.GridHelper(30, 15, CYAN_HOT.getHex(), CYAN.getHex());
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true; m.opacity = 0.15; m.toneMapped = false; m.depthWrite = false;
    return g;
  }, []);
  return (
    <group position={[0, -1.78, 0]}>
      <primitive object={fine} />
      <primitive object={coarse} />
    </group>
  );
}

/* ---------- dimension ticks orbiting the footprint ---------- */
export function DimensionTicks() {
  const ring = useRef<THREE.Group>(null!);
  const scroll = useScroll();
  const R = 3.4;
  const ringGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  const tickGeos = useMemo(() => {
    const arr: { geo: THREE.BufferGeometry; major: boolean }[] = [];
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const major = i % 4 === 0;
      const len = major ? 0.38 : 0.18;
      const x = Math.cos(angle), z = Math.sin(angle);
      arr.push({
        geo: new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x * R, 0, z * R),
          new THREE.Vector3(x * (R + len), 0, z * (R + len)),
        ]),
        major,
      });
    }
    return arr;
  }, []);
  useFrame((state) => {
    if (ring.current) ring.current.rotation.y = -state.clock.elapsedTime * 0.05 - scroll.offset * Math.PI * 0.4;
  });
  return (
    <group ref={ring} position={[0, -1.72, 0]} rotation={[0.1, 0, 0]}>
      <lineLoop geometry={ringGeo}>
        <lineBasicMaterial color={CYAN.getHex()} transparent opacity={0.22} toneMapped={false} depthWrite={false} />
      </lineLoop>
      {tickGeos.map((tk, i) => (
        <lineSegments key={i} geometry={tk.geo}>
          <lineBasicMaterial color={tk.major ? CYAN_HOT.getHex() : CYAN.getHex()} transparent opacity={tk.major ? 0.6 : 0.32} toneMapped={false} depthWrite={false} />
        </lineSegments>
      ))}
    </group>
  );
}

/* ---------- sparse plotted reference dots ---------- */
export function ReferenceDots() {
  const ref = useRef<THREE.Points>(null!);
  const count = 180;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996;
      const r = 4.0 + (i % 9) * 0.42;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(i * 0.53) * 3.8 + Math.cos(i * 0.21) * 0.6;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => { if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color={CYAN.getHex()} size={0.02} sizeAttenuation transparent opacity={0.4} toneMapped={false} depthWrite={false} />
    </points>
  );
}

export default function HouseBlueprint() {
  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);
  return (
    <>
      <color attach="background" args={[NAVY]} />
      <fog attach="fog" args={[NAVY_FOG, 11, 28]} />
      <ambientLight intensity={0.6} />

      <VillaModel />
      <PlanGrid />
      <DimensionTicks />
      <ReferenceDots />

      <EffectComposer>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.25} luminanceSmoothing={0.3} />
        <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={caOffset} radialModulation={false} modulationOffset={0} />
        <Vignette eskil={false} offset={0.3} darkness={0.9} />
      </EffectComposer>
    </>
  );
}

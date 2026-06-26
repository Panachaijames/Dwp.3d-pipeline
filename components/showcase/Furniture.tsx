"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// each box: [w, h, d, x, y, z]
type Box = [number, number, number, number, number, number];

const CHAIR: Box[] = [
  [0.95, 0.12, 0.95, 0, 0, 0],
  [0.95, 0.95, 0.1, 0, 0.5, -0.42],
  [0.09, 0.6, 0.09, 0.4, -0.36, 0.4],
  [0.09, 0.6, 0.09, -0.4, -0.36, 0.4],
  [0.09, 0.6, 0.09, 0.4, -0.36, -0.4],
  [0.09, 0.6, 0.09, -0.4, -0.36, -0.4],
];

const SOFA: Box[] = [
  [2.3, 0.4, 1.0, 0, 0, 0],
  [2.3, 0.75, 0.2, 0, 0.5, -0.4],
  [0.24, 0.6, 1.0, -1.05, 0.3, 0],
  [0.24, 0.6, 1.0, 1.05, 0.3, 0],
  [1.0, 0.18, 0.85, -0.55, 0.3, 0.05],
  [1.0, 0.18, 0.85, 0.55, 0.3, 0.05],
  [1.0, 0.55, 0.16, -0.55, 0.55, -0.3],
  [1.0, 0.55, 0.16, 0.55, 0.55, -0.3],
];

const TABLE: Box[] = [
  [1.9, 0.1, 1.05, 0, 0.55, 0],
  [0.11, 1.05, 0.11, 0.8, 0, 0.43],
  [0.11, 1.05, 0.11, -0.8, 0, 0.43],
  [0.11, 1.05, 0.11, 0.8, 0, -0.43],
  [0.11, 1.05, 0.11, -0.8, 0, -0.43],
  [1.55, 0.06, 0.06, 0, -0.1, 0],
];

function makeSolid(boxes: Box[], color: string, rough: number, metal: number) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: metal,
    transparent: true,
    opacity: 0,
  });
  // centre the piece vertically so it presents nicely while floating
  let lo = Infinity, hi = -Infinity;
  for (const b of boxes) {
    lo = Math.min(lo, b[4] - b[1] / 2);
    hi = Math.max(hi, b[4] + b[1] / 2);
  }
  const cy = (lo + hi) / 2;
  for (const [w, h, d, x, y, z] of boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y - cy, z);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, mat };
}

/* Each interior piece presented individually: it floats in (centred, gently
   turning) in front of the room across its own scroll window — chair → sofa →
   table — then dissolves as the next arrives. */
export function FurnitureStage({ position = [0, 0, -20] as [number, number, number] }) {
  const scroll = useScroll();

  const pieces = useMemo(
    () => [
      { ...makeSolid(CHAIR, "#8d9a92", 0.9, 0.0), range: [0.52, 0.56, 0.63, 0.66] as const, scale: 1.25, spin: 0.5 },
      { ...makeSolid(SOFA, "#b9b2a2", 0.95, 0.0), range: [0.64, 0.67, 0.74, 0.77] as const, scale: 0.95, spin: 0.4 },
      { ...makeSolid(TABLE, "#6e4a2d", 0.5, 0.0), range: [0.75, 0.78, 0.85, 0.88] as const, scale: 1.1, spin: 0.45 },
    ],
    []
  );

  // presentation spot, local to `position` → floats just inside the front of the room
  const PX = 0, PY = -0.1, PZ = 3;

  useFrame((state, dt) => {
    const off = scroll.offset;
    const t = state.clock.elapsedTime;
    for (const p of pieces) {
      const [i0, i1, o0, o1] = p.range;
      const e = smoothstep(i0, i1, off) * (1 - smoothstep(o0, o1, off));
      p.group.visible = e > 0.01;
      if (!p.group.visible) continue;
      p.group.position.set(PX, PY + Math.sin(t * 0.6) * 0.07, PZ);
      p.group.rotation.y += dt * p.spin;
      p.group.scale.setScalar(p.scale * (0.92 + e * 0.08));
      p.mat.opacity = e;
    }
  });

  return (
    <group position={position}>
      {pieces.map((p, i) => (
        <primitive key={i} object={p.group} />
      ))}
      {/* a soft key light on the presentation spot so pieces read even as the room fades in */}
      <directionalLight position={[3, 4, 6]} intensity={0.85} color="#fff4e6" />
    </group>
  );
}

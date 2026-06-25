"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

const CYAN = new THREE.Color("#7fd6ff");
const CYAN_HOT = new THREE.Color("#bfeaff");
const NAVY = new THREE.Color("#070f1f");

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// each box: [w, h, d, x, y, z]
type Box = [number, number, number, number, number, number];

const CHAIR: Box[] = [
  [0.95, 0.12, 0.95, 0, 0, 0], // seat
  [0.95, 0.95, 0.1, 0, 0.5, -0.42], // back
  [0.09, 0.6, 0.09, 0.4, -0.36, 0.4],
  [0.09, 0.6, 0.09, -0.4, -0.36, 0.4],
  [0.09, 0.6, 0.09, 0.4, -0.36, -0.4],
  [0.09, 0.6, 0.09, -0.4, -0.36, -0.4],
];

const SOFA: Box[] = [
  [2.3, 0.4, 1.0, 0, 0, 0], // base
  [2.3, 0.75, 0.2, 0, 0.5, -0.4], // back
  [0.24, 0.6, 1.0, -1.05, 0.3, 0], // arm L
  [0.24, 0.6, 1.0, 1.05, 0.3, 0], // arm R
  [1.0, 0.18, 0.85, -0.55, 0.3, 0.05], // seat cushion L
  [1.0, 0.18, 0.85, 0.55, 0.3, 0.05], // seat cushion R
  [1.0, 0.55, 0.16, -0.55, 0.55, -0.3], // back cushion L
  [1.0, 0.55, 0.16, 0.55, 0.55, -0.3], // back cushion R
];

const TABLE: Box[] = [
  [1.9, 0.1, 1.05, 0, 0.55, 0], // top
  [0.11, 1.05, 0.11, 0.8, 0, 0.43],
  [0.11, 1.05, 0.11, -0.8, 0, 0.43],
  [0.11, 1.05, 0.11, 0.8, 0, -0.43],
  [0.11, 1.05, 0.11, -0.8, 0, -0.43],
  [1.55, 0.06, 0.06, 0, -0.1, 0], // stretcher
];

function makePiece(boxes: Box[]) {
  const group = new THREE.Group();
  const mats: { line: THREE.LineBasicMaterial; fill: THREE.MeshBasicMaterial }[] = [];
  for (const [w, h, d, x, y, z] of boxes) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const fill = new THREE.MeshBasicMaterial({ color: NAVY.clone(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, fill);
    mesh.position.set(x, y, z);
    const line = new THREE.LineBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const ls = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), line);
    ls.position.set(x, y, z);
    group.add(mesh);
    group.add(ls);
    mats.push({ line, fill });
  }
  return { group, mats };
}

/* A small showroom further down the scene: three furniture pieces, each
   spinning, fading in/out across its own scroll window (chair → sofa → table). */
export function FurnitureStage({ position = [0, 0, -20] as [number, number, number] }) {
  const scroll = useScroll();

  const pieces = useMemo(() => {
    return [
      { node: makePiece(CHAIR), range: [0.36, 0.4, 0.5, 0.54] as const, scale: 1.15 },
      { node: makePiece(SOFA), range: [0.5, 0.54, 0.63, 0.67] as const, scale: 0.95 },
      { node: makePiece(TABLE), range: [0.63, 0.67, 0.77, 0.81] as const, scale: 1.05 },
    ];
  }, []);

  const pad = useMemo(() => {
    const g = new THREE.GridHelper(9, 18, CYAN_HOT.getHex(), CYAN.getHex());
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.12;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);

  useFrame((_, dt) => {
    const off = scroll.offset;
    for (const p of pieces) {
      const [i0, i1, o0, o1] = p.range;
      const e = smoothstep(i0, i1, off) * (1 - smoothstep(o0, o1, off));
      const g = p.node.group;
      g.visible = e > 0.01;
      if (!g.visible) continue;
      g.rotation.y += dt * 0.5;
      g.scale.setScalar((0.85 + e * 0.15) * p.scale);
      for (const m of p.node.mats) {
        m.line.opacity = e * 0.92;
        m.fill.opacity = e * 0.26;
      }
    }
  });

  return (
    <group position={position}>
      {pieces.map((p, i) => (
        <primitive key={i} object={p.node.group} />
      ))}
      <primitive object={pad} position={[0, -1.0, 0]} />
    </group>
  );
}

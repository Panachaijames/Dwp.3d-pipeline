"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";
import { buildVilla } from "@/components/showcase/variants/HouseBlueprint";

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// point colours per villa part kind (brightened a touch so they read on navy)
const KCOL: Record<string, string> = {
  slab: "#cfcabf",
  wall: "#e4dbc7",
  roof: "#828893",
  column: "#6c727b",
  glass: "#a7cdda",
  door: "#9a6a3c",
  detail: "#6c727b",
};

const CLOUD_R = 3.6;
const CLOUD_RGB: [number, number, number] = [0.75, 0.88, 1.0]; // blueprint cyan/white

function build(N: number) {
  const parts = buildVilla();
  const rand = mulberry32(20260624);
  const vols = parts.map((p) => {
    const pr = (p.geo as THREE.BoxGeometry).parameters;
    return pr.width * pr.height * pr.depth;
  });
  const total = vols.reduce((a, b) => a + b, 0);

  const house = new Float32Array(N * 3);
  const houseCol = new Float32Array(N * 3);
  const cloud = new Float32Array(N * 3);

  let i = 0;
  for (let pi = 0; pi < parts.length && i < N; pi++) {
    const p = parts[pi];
    const pr = (p.geo as THREE.BoxGeometry).parameters;
    const col = new THREE.Color(KCOL[p.kind] || "#cfe6ff");
    const count = pi === parts.length - 1 ? N - i : Math.max(1, Math.round((vols[pi] / total) * N));
    for (let k = 0; k < count && i < N; k++, i++) {
      house[i * 3] = p.tPos.x + (rand() - 0.5) * pr.width;
      house[i * 3 + 1] = p.tPos.y + (rand() - 0.5) * pr.height;
      house[i * 3 + 2] = p.tPos.z + (rand() - 0.5) * pr.depth;
      houseCol[i * 3] = col.r;
      houseCol[i * 3 + 1] = col.g;
      houseCol[i * 3 + 2] = col.b;
      const u = rand(), v = rand(), rr = CLOUD_R * Math.cbrt(rand());
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      cloud[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      cloud[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th) - 0.2;
      cloud[i * 3 + 2] = rr * Math.cos(ph);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(cloud.slice(), 3));
  const colInit = new Float32Array(N * 3);
  for (let j = 0; j < N; j++) {
    colInit[j * 3] = CLOUD_RGB[0];
    colInit[j * 3 + 1] = CLOUD_RGB[1];
    colInit[j * 3 + 2] = CLOUD_RGB[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colInit, 3));
  return { geo, house, houseCol, cloud, N };
}

/* Finale transition: interiors disperse into a cloud that re-forms the villa,
   then fades out as the solid, colored RealVilla takes its place. */
export function FinaleCloud({
  position = [0, 0, -20] as [number, number, number],
  appearStart = 0.74,
  morphStart = 0.78,
  morphEnd = 0.92,
  fadeOutStart = 0.93,
}) {
  const scroll = useScroll();
  const pts = useRef<THREE.Points>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const { geo, house, houseCol, cloud, N } = useMemo(() => build(6500), []);

  useFrame((state) => {
    const off = scroll.offset;
    const appear = smoothstep(appearStart, appearStart + 0.05, off) * (1 - smoothstep(fadeOutStart, 1.0, off));
    if (mat.current) mat.current.opacity = appear;
    if (!pts.current) return;
    pts.current.visible = appear > 0.01;
    if (!pts.current.visible) return;

    const ease = smoothstep(morphStart, morphEnd, off);
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const ang = t * 0.18 + i * 0.0007;
      const cx = cloud[i3], cz = cloud[i3 + 2];
      const fromX = cx * Math.cos(ang) - cz * Math.sin(ang);
      const fromZ = cx * Math.sin(ang) + cz * Math.cos(ang);
      const fromY = cloud[i3 + 1] + Math.sin(t * 0.5 + i) * 0.05;

      pos[i3] = fromX + (house[i3] - fromX) * ease;
      pos[i3 + 1] = fromY + (house[i3 + 1] - fromY) * ease;
      pos[i3 + 2] = fromZ + (house[i3 + 2] - fromZ) * ease;

      col[i3] = CLOUD_RGB[0] + (houseCol[i3] - CLOUD_RGB[0]) * ease;
      col[i3 + 1] = CLOUD_RGB[1] + (houseCol[i3 + 1] - CLOUD_RGB[1]) * ease;
      col[i3 + 2] = CLOUD_RGB[2] + (houseCol[i3 + 2] - CLOUD_RGB[2]) * ease;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={pts} position={position} geometry={geo}>
      <pointsMaterial ref={mat} vertexColors size={0.045} sizeAttenuation transparent opacity={0} depthWrite={false} toneMapped={false} />
    </points>
  );
}

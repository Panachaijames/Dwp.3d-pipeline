"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const CYAN = new THREE.Color("#7fd6ff");
const CYAN_HOT = new THREE.Color("#bfeaff");

type Seg = [number, number, number, number]; // x1,z1,x2,z2 (drawn flat on XZ)

const EXT = 0.26; // exterior wall thickness
const INT = 0.15; // interior wall thickness

// a wall = a closed thin rectangle (double line) along a segment
function wall(x1: number, z1: number, x2: number, z2: number, t: number): Seg[] {
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1;
  const px = (-dz / L) * (t / 2), pz = (dx / L) * (t / 2);
  return [
    [x1 + px, z1 + pz, x2 + px, z2 + pz],
    [x2 + px, z2 + pz, x2 - px, z2 - pz],
    [x2 - px, z2 - pz, x1 - px, z1 - pz],
    [x1 - px, z1 - pz, x1 + px, z1 + pz],
  ];
}
function rectSegs(cx: number, cz: number, w: number, d: number): Seg[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  return [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
}
function arc(cx: number, cz: number, r: number, a0: number, a1: number, steps = 14): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < steps; i++) {
    const t0 = a0 + ((a1 - a0) * i) / steps;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
    out.push([cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r]);
  }
  return out;
}
// window glazing: three thin parallel lines across an axis-aligned opening
function glazing(x1: number, z1: number, x2: number, z2: number): Seg[] {
  const o = 0.07;
  if (Math.abs(z1 - z2) < 1e-6) return [[x1, z1, x2, z2], [x1, z1 - o, x2, z2 - o], [x1, z1 + o, x2, z2 + o]];
  return [[x1, z1, x2, z2], [x1 - o, z1, x2 - o, z2], [x1 + o, z1, x2 + o, z2]];
}

/* A measured top-down floor plan of the villa's ground floor, in cyan linework:
   double-line walls, an open living/dining/kitchen, a bedroom + bathroom wing,
   stairs, door swings, window glazing and dimension lines. The camera looks
   straight down, then descends into the living room. Lies flat on the XZ plane. */
export function FloorPlan({
  position = [0, -1.5, -20] as [number, number, number],
  appearStart = 0.28,
  appearEnd = 0.34,
  fadeStart = 0.48,
  fadeEnd = 0.54,
}) {
  const scroll = useScroll();
  const group = useRef<THREE.Group>(null!);

  const { root, tracked } = useMemo(() => {
    const root = new THREE.Group();
    const tracked: { mat: THREE.LineBasicMaterial; base: number }[] = [];

    const W: Seg[] = []; // walls
    const G: Seg[] = []; // glazing
    const F: Seg[] = []; // fixtures + stairs
    const U: Seg[] = []; // living-room furniture footprints (the floating pieces)
    const D: Seg[] = []; // door swings
    const M: Seg[] = []; // dimensions

    // ---- exterior walls (footprint x[-4.5,4.5] z[-3.5,3.5]) with openings ----
    // front (z = -3.5): living glazing + entry door gap
    W.push(...wall(-4.5, -3.5, -4.0, -3.5, EXT), ...wall(-1.5, -3.5, -0.6, -3.5, EXT), ...wall(0.2, -3.5, 4.5, -3.5, EXT));
    G.push(...glazing(-4.0, -3.5, -1.5, -3.5));
    // back (z = 3.5): kitchen + bedroom windows
    W.push(...wall(-4.5, 3.5, -4.0, 3.5, EXT), ...wall(-2.0, 3.5, 1.5, 3.5, EXT), ...wall(3.5, 3.5, 4.5, 3.5, EXT));
    G.push(...glazing(-4.0, 3.5, -2.0, 3.5), ...glazing(1.5, 3.5, 3.5, 3.5));
    // left (x = -4.5): living window
    W.push(...wall(-4.5, -3.5, -4.5, -2.0, EXT), ...wall(-4.5, 0.5, -4.5, 3.5, EXT));
    G.push(...glazing(-4.5, -2.0, -4.5, 0.5));
    // right (x = 4.5): bedroom window
    W.push(...wall(4.5, -3.5, 4.5, 1.0, EXT), ...wall(4.5, 2.8, 4.5, 3.5, EXT));
    G.push(...glazing(4.5, 1.0, 4.5, 2.8));

    // ---- interior partitions (with door gaps) ----
    W.push(...wall(0.3, -3.5, 0.3, -0.5, INT), ...wall(0.3, 0.2, 0.3, 3.5, INT)); // open zone | private wing
    W.push(...wall(0.3, 0.2, 2.4, 0.2, INT), ...wall(3.1, 0.2, 4.5, 0.2, INT)); // bedroom | bathroom

    // ---- door swings ----
    D.push(...arc(-0.6, -3.5, 0.8, Math.PI / 2, Math.PI), [-0.6, -3.5, -0.6, -2.7]); // entry
    D.push(...arc(0.3, 0.2, 0.7, Math.PI / 2, Math.PI), [0.3, 0.2, -0.4, 0.2]); // into living
    D.push(...arc(2.4, 0.2, 0.7, 0, Math.PI / 2), [2.4, 0.2, 2.4, 0.9]); // bedroom

    // ---- stairs (open zone, against the partition) ----
    {
      const x0 = -0.5, x1 = 0.2, z0 = 1.5, z1 = 3.3, n = 7, cx = (x0 + x1) / 2;
      F.push([x0, z0, x0, z1], [x1, z0, x1, z1]);
      for (let i = 0; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / n;
        F.push([x0, z, x1, z]);
      }
      F.push([cx, z0 + 0.2, cx, z1 - 0.2], [cx, z1 - 0.2, cx - 0.12, z1 - 0.45], [cx, z1 - 0.2, cx + 0.12, z1 - 0.45]);
    }

    // ---- kitchen (back-left) ----
    F.push(...rectSegs(-2.8, 3.15, 2.4, 0.5)); // counter run
    F.push(...rectSegs(-3.5, 3.15, 0.42, 0.3)); // sink
    F.push(...rectSegs(-2.6, 2.1, 1.3, 0.6)); // island

    // ---- dining (mid-left) ----
    F.push(...rectSegs(-3.2, 1.0, 1.3, 0.8)); // table
    F.push(...rectSegs(-3.95, 1.0, 0.34, 0.5), ...rectSegs(-2.45, 1.0, 0.34, 0.5)); // chairs

    // ---- living-room furniture footprints (these are the pieces that float in) ----
    U.push(...rectSegs(-2.8, -2.5, 2.2, 0.9)); // sofa
    U.push(...rectSegs(-2.8, -1.4, 1.6, 0.9)); // coffee table
    U.push(...rectSegs(-1.1, -2.1, 0.85, 0.85)); // chair

    // ---- bedroom (back-right) ----
    F.push(...rectSegs(2.6, 2.3, 1.7, 1.9)); // bed
    F.push(...rectSegs(2.2, 3.0, 0.66, 0.4), ...rectSegs(3.0, 3.0, 0.66, 0.4)); // pillows
    F.push([1.75, 3.27, 3.45, 3.27]); // headboard
    F.push(...rectSegs(4.05, 1.1, 0.45, 1.5)); // wardrobe

    // ---- bathroom (front-right) ----
    F.push(...rectSegs(1.2, -2.7, 1.5, 0.78), ...rectSegs(1.2, -2.7, 1.22, 0.52)); // tub + basin recess
    F.push(...rectSegs(3.1, -3.0, 0.42, 0.55)); // wc
    F.push(...rectSegs(3.5, -1.6, 0.6, 0.4)); // basin

    // ---- dimension lines ----
    const dz = -4.1, dx = -5.1;
    M.push([-4.5, dz, 4.5, dz], [-4.5, -3.5, -4.5, dz], [4.5, -3.5, 4.5, dz]);
    M.push([-4.5, dz - 0.12, -4.5, dz + 0.12], [4.5, dz - 0.12, 4.5, dz + 0.12], [0.3, dz - 0.1, 0.3, dz + 0.1]);
    M.push([dx, -3.5, dx, 3.5], [-4.5, -3.5, dx, -3.5], [-4.5, 3.5, dx, 3.5]);
    M.push([dx - 0.12, -3.5, dx + 0.12, -3.5], [dx - 0.12, 3.5, dx + 0.12, 3.5], [dx - 0.1, 0.2, dx + 0.1, 0.2]);

    const layer = (segs: Seg[], color: THREE.Color, base: number) => {
      const pts: THREE.Vector3[] = [];
      for (const [x1, z1, x2, z2] of segs) pts.push(new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: color.clone(), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      root.add(new THREE.LineSegments(geo, mat));
      tracked.push({ mat, base });
    };

    layer(W, CYAN_HOT, 0.9); // walls — brightest
    layer(G, CYAN_HOT, 0.55); // glazing
    layer(F, CYAN, 0.55); // fixtures + stairs
    layer(U, CYAN_HOT, 0.45); // living furniture footprints
    layer(D, CYAN, 0.42); // door swings
    layer(M, CYAN, 0.3); // dimensions

    return { root, tracked };
  }, []);

  useFrame(() => {
    const off = scroll.offset;
    const appear = smoothstep(appearStart, appearEnd, off) * (1 - smoothstep(fadeStart, fadeEnd, off));
    if (group.current) group.current.visible = appear > 0.01;
    if (appear <= 0.01) return;
    for (const t of tracked) t.mat.opacity = t.base * appear;
  });

  return (
    <group ref={group} position={position}>
      <primitive object={root} />
    </group>
  );
}

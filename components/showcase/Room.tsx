"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const FLOOR_Y = -1.6;

type MatSpec = { color: string; rough: number; metal: number; opacity?: number };

/* An empty, warmly-lit room — the backdrop the furniture floats in front of.
   Fades in as we descend from the floor plan, out as the finale villa takes over. */
export function Room({
  position = [0, 0, -20] as [number, number, number],
  appearStart = 0.5,
  appearEnd = 0.56,
  fadeStart = 0.87,
  fadeEnd = 0.91,
}) {
  const scroll = useScroll();
  const group = useRef<THREE.Group>(null!);

  const { root, tracked } = useMemo(() => {
    const root = new THREE.Group();
    const tracked: { mat: THREE.Material & { opacity: number }; base: number }[] = [];

    const mk = (spec: MatSpec) => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.color),
        roughness: spec.rough,
        metalness: spec.metal,
        transparent: true,
        opacity: 0,
      });
      tracked.push({ mat: m, base: spec.opacity ?? 1 });
      return m;
    };

    const MAT = {
      wall: mk({ color: "#efeae0", rough: 0.96, metal: 0 }),
      floor: mk({ color: "#c4a275", rough: 0.7, metal: 0 }),
      wood: mk({ color: "#6e4a2d", rough: 0.5, metal: 0 }),
      metal: mk({ color: "#33373e", rough: 0.4, metal: 0.7 }),
      rug: mk({ color: "#9a5f54", rough: 1, metal: 0 }),
    };
    const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fdf3df"), transparent: true, opacity: 0, toneMapped: false });
    tracked.push({ mat: windowMat, base: 1 });
    const shadeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe6b8"), transparent: true, opacity: 0, toneMapped: false });
    tracked.push({ mat: shadeMat, base: 0.92 });

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      root.add(mesh);
    };

    // shell: floor + back wall + left wall (front + right open toward the camera)
    addBox(11, 0.3, 9, 0, FLOOR_Y - 0.15, -0.5, MAT.floor);
    addBox(11, 3.6, 0.25, 0, FLOOR_Y + 1.8, -4.6, MAT.wall);
    addBox(0.25, 3.6, 9, -5.4, FLOOR_Y + 1.8, -0.5, MAT.wall);
    // window on the back wall (glow + slim frame)
    addBox(2.6, 1.8, 0.06, -1.6, FLOOR_Y + 2.05, -4.45, windowMat);
    addBox(2.9, 0.08, 0.12, -1.6, FLOOR_Y + 2.98, -4.42, MAT.wood);
    addBox(2.9, 0.08, 0.12, -1.6, FLOOR_Y + 1.12, -4.42, MAT.wood);
    // rug marking the seating area
    addBox(4.4, 0.05, 3.0, 0.2, FLOOR_Y + 0.04, -1.6, MAT.rug);
    // floor lamp in the back-left corner
    addBox(0.07, 2.4, 0.07, -4.3, FLOOR_Y + 1.2, -3.7, MAT.metal);
    addBox(0.36, 0.04, 0.36, -4.3, FLOOR_Y + 0.04, -3.7, MAT.metal);
    addBox(0.62, 0.5, 0.62, -4.3, FLOOR_Y + 2.55, -3.7, shadeMat);

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

      <ambientLight intensity={0.45} />
      <directionalLight position={[-2, 4.5, 1]} intensity={1.4} color="#fff2dd" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[4, 2.5, 4]} intensity={0.4} color="#bcd0ec" />
      <pointLight position={[-4.3, FLOOR_Y + 2.4, -3.7]} intensity={4} distance={7} decay={2} color="#ffd9a0" />
    </group>
  );
}

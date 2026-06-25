"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Environment, Lightformer, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { buildVilla } from "@/components/showcase/variants/HouseBlueprint";

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// realistic material per part kind
const MATS: Record<string, { color: string; rough: number; metal: number; opacity: number }> = {
  slab: { color: "#cfcabf", rough: 0.85, metal: 0.0, opacity: 1 },
  wall: { color: "#e4dbc7", rough: 0.8, metal: 0.0, opacity: 1 },
  roof: { color: "#3f444c", rough: 0.65, metal: 0.15, opacity: 1 },
  column: { color: "#33373e", rough: 0.35, metal: 0.75, opacity: 1 },
  glass: { color: "#a7cdda", rough: 0.05, metal: 0.1, opacity: 0.5 },
  door: { color: "#6e4a2d", rough: 0.6, metal: 0.0, opacity: 1 },
  detail: { color: "#2c3038", rough: 0.5, metal: 0.25, opacity: 1 },
};

/* The opening villa, now SOLID + colored + realistic — and it ASSEMBLES from
   falling components exactly like the blueprint did, just in full colour.
   Same massing, same staggered choreography, no cross-fade cut. */
export function RealVilla({
  position = [0, 0, -20] as [number, number, number],
  assembleStart = 0.8,
  assembleEnd = 0.98,
}) {
  const scroll = useScroll();
  const group = useRef<THREE.Group>(null!);

  const { root, mats, items } = useMemo(() => {
    const root = new THREE.Group();
    const matMap: Record<string, THREE.MeshStandardMaterial> = {};
    for (const k of Object.keys(MATS)) {
      const m = MATS[k];
      matMap[k] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color),
        roughness: m.rough,
        metalness: m.metal,
        transparent: true,
        opacity: 0,
        envMapIntensity: k === "glass" || k === "column" ? 1.7 : 0.85,
      });
    }
    const items = buildVilla().map((p) => {
      const mesh = new THREE.Mesh(p.geo, matMap[p.kind] || matMap.wall);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return { p, mesh };
    });
    return { root, mats: matMap, items };
  }, []);

  const vPos = useMemo(() => new THREE.Vector3(), []);
  const qS = useMemo(() => new THREE.Quaternion(), []);
  const qId = useMemo(() => new THREE.Quaternion(), []);
  const stagger = 0.5;

  useFrame(() => {
    const off = scroll.offset;
    // quick global fade-in so nothing pops, then the pieces fall into place
    const fade = smoothstep(assembleStart - 0.02, assembleStart + 0.05, off);
    if (group.current) group.current.visible = fade > 0.01;
    for (const k of Object.keys(mats)) mats[k].opacity = MATS[k].opacity * fade;
    if (fade <= 0.01) return;

    const a = smoothstep(assembleStart, assembleEnd, off); // 0..1 across the finale
    const span = 1 - stagger;
    for (const { p, mesh } of items) {
      const start = p.order * span;
      const local = smoothstep(start, start + stagger, a);
      vPos.lerpVectors(p.sPos, p.tPos, local);
      qS.setFromEuler(p.sRot);
      mesh.position.copy(vPos);
      mesh.quaternion.copy(qS).slerp(qId, local); // settle to axis-aligned
      mesh.scale.setScalar(0.5 + local * 0.5);
    }
  });

  return (
    <group ref={group} position={position}>
      <primitive object={root} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 9, 5]} intensity={1.8} color="#fff2dd" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, -4]} intensity={0.4} color="#bcd0ec" />

      <Environment resolution={128} background={false}>
        <Lightformer form="rect" intensity={2.2} color="#eaf2ff" position={[0, 6, 2]} scale={[10, 10, 1]} rotation={[-Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe6c4" position={[6, 2, 3]} scale={[5, 5, 1]} rotation={[0, -Math.PI / 4, 0]} />
        <Lightformer form="rect" intensity={1.0} color="#bcd0ec" position={[-6, 1, 2]} scale={[5, 5, 1]} rotation={[0, Math.PI / 4, 0]} />
      </Environment>

      <ContactShadows position={[0, -1.74, 0]} scale={9} blur={2.6} opacity={0.55} far={5} color="#0a1018" resolution={1024} />
    </group>
  );
}

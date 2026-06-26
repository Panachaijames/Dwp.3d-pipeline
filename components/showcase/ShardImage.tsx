"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import * as THREE from "three";

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

/* A friendly placeholder so the section renders something before you add a real
   render. Drop your nano-banana image at public/prepage/house.png and it swaps in. */
function makeFallbackTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 400;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, "#1b2740");
  g.addColorStop(1, "#36465f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = "#2a3850";
  ctx.fillRect(0, 310, 640, 90);
  // simple villa silhouette
  ctx.fillStyle = "#cdd9ec";
  ctx.fillRect(180, 180, 250, 130);
  ctx.fillRect(420, 140, 90, 170);
  ctx.fillStyle = "#9fc6da";
  ctx.fillRect(215, 215, 70, 60);
  ctx.fillRect(320, 215, 70, 60);
  ctx.fillRect(438, 175, 56, 70);
  ctx.fillStyle = "rgba(200,228,255,0.9)";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("drop your nano-banana render here", 320, 58);
  ctx.font = "15px sans-serif";
  ctx.fillStyle = "rgba(200,228,255,0.6)";
  ctx.fillText("public/prepage/house.png", 320, 88);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* A flat image (your realistic render) fractured into a grid of tiles that fly
   in from scattered positions and assemble into the full picture as you scroll,
   then dissolve as the camera pushes through into the interior. */
export function ShardImage({
  src = "/prepage/house.png",
  position = [0, 0.45, -6] as [number, number, number],
  width = 8,
  height = 5,
  cols = 14,
  rows = 9,
  assembleStart = 0.3,
  assembleEnd = 0.42,
  fadeStart = 0.44,
  fadeEnd = 0.49,
}) {
  const scroll = useScroll();
  const group = useRef<THREE.Group>(null!);

  const { root, tiles, materials } = useMemo(() => {
    const root = new THREE.Group();
    const fallback = makeFallbackTexture();
    const rand = mulberry32(99887766);
    const tileW = width / cols;
    const tileH = height / rows;
    const maxD = Math.hypot(width / 2, height / 2);
    const tiles: {
      mesh: THREE.Mesh;
      tPos: THREE.Vector3;
      sPos: THREE.Vector3;
      sRot: THREE.Euler;
      order: number;
    }[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const geo = new THREE.PlaneGeometry(tileW * 0.985, tileH * 0.985);
        // remap this tile's UVs to its sub-rectangle of the full image
        const u0 = col / cols;
        const u1 = (col + 1) / cols;
        const v0 = 1 - (row + 1) / rows;
        const v1 = 1 - row / rows;
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        uv.setXY(0, u0, v1);
        uv.setXY(1, u1, v1);
        uv.setXY(2, u0, v0);
        uv.setXY(3, u1, v0);
        uv.needsUpdate = true;

        const mat = new THREE.MeshBasicMaterial({
          map: fallback,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);

        const tx = -width / 2 + (col + 0.5) * tileW;
        const ty = height / 2 - (row + 0.5) * tileH;
        const tPos = new THREE.Vector3(tx, ty, 0);

        const a = rand() * Math.PI * 2;
        const rad = 2 + rand() * 5;
        const sPos = new THREE.Vector3(
          tx + Math.cos(a) * rad * 0.6,
          ty + (rand() - 0.5) * height * 1.4,
          (rand() - 0.5) * 7 + 3
        );
        const sRot = new THREE.Euler(
          (rand() - 0.5) * 2.2,
          (rand() - 0.5) * 2.2,
          (rand() - 0.5) * 2.2
        );
        const order = Math.hypot(tx, ty) / maxD; // radial: centre assembles first

        mesh.position.copy(sPos);
        root.add(mesh);
        tiles.push({ mesh, tPos, sPos, sRot, order });
        materials.push(mat);
      }
    }
    return { root, tiles, materials };
  }, [width, height, cols, rows]);

  // load the real render and swap it onto every tile when it arrives
  useEffect(() => {
    let cancelled = false;
    new THREE.TextureLoader().load(
      src,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        for (const m of materials) {
          m.map = tex;
          m.needsUpdate = true;
        }
      },
      undefined,
      () => {
        /* image not present yet — keep the placeholder */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [src, materials]);

  const vPos = useMemo(() => new THREE.Vector3(), []);
  const qS = useMemo(() => new THREE.Quaternion(), []);
  const qId = useMemo(() => new THREE.Quaternion(), []);
  const stagger = 0.5;

  useFrame(() => {
    const off = scroll.offset;
    const a = smoothstep(assembleStart, assembleEnd, off);
    const fade = 1 - smoothstep(fadeStart, fadeEnd, off);
    const appear = smoothstep(assembleStart - 0.04, assembleStart + 0.02, off) * fade;
    if (group.current) group.current.visible = appear > 0.005;
    if (appear <= 0.005) return;

    const span = 1 - stagger;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const start = t.order * span;
      const local = smoothstep(start, start + stagger, a);
      vPos.lerpVectors(t.sPos, t.tPos, local);
      qS.setFromEuler(t.sRot);
      t.mesh.position.copy(vPos);
      t.mesh.quaternion.copy(qS).slerp(qId, local);
      t.mesh.scale.setScalar(0.2 + local * 0.8);
      materials[i].opacity = local * fade;
    }
  });

  return (
    <group ref={group} position={position}>
      <primitive object={root} />
    </group>
  );
}

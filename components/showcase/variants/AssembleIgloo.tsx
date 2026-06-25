"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  useScroll,
  Environment,
  Lightformer,
  Sparkles,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Assemble · Igloo",
  blurb:
    "Trapezoidal ice blocks descend and spiral into stacked rings, building a frosted dome from the ground up to its capstone — an igloo assembling itself on scroll.",
  family: "Assemble",
};

/* ---------------- Palette ---------------- */
const NIGHT = "#070d16";
const ICE = new THREE.Color("#cfe4f5");
const ICE_DEEP = new THREE.Color("#9fc4e8");
const RIM = new THREE.Color("#bfe6ff");
const FROST = new THREE.Color("#eaf6ff");

/* ---------------- Geometry plan ----------------
   A dome built from stacked rings of trapezoidal blocks. Rings rise and
   shrink toward a capstone. A short entrance tunnel of a few blocks sits
   at the front (+Z). Each block carries: target transform (assembled),
   a deterministic dispersed start (raised + scattered + tumbled), and an
   "order" value 0..1 so the build staggers bottom-ring-first up to the cap,
   tunnel last. */

const DOME_R = 2.35; // dome radius
const RINGS = 6; // dome rings (not counting capstone)
const TUNNEL_BLOCKS = 6;

type Block = {
  // assembled
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  // dispersed start
  startPos: THREE.Vector3;
  startQuat: THREE.Quaternion;
  // choreography
  order: number; // 0..1 arrival order (0 = first)
  spin: number; // extra spiral spin while descending
};

function buildIgloo() {
  const blocks: Block[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();

  // Determine per-ring block counts & elevation angles first so we can
  // normalize the arrival order across the whole structure.
  const ringDefs: { phi: number; count: number }[] = [];
  for (let r = 0; r < RINGS; r++) {
    // elevation angle from horizon (0) toward zenith (PI/2)
    const phi = (r / RINGS) * (Math.PI * 0.5) * 0.92;
    const ringR = Math.cos(phi) * DOME_R;
    const circ = 2 * Math.PI * ringR;
    const count = Math.max(6, Math.round(circ / 0.62));
    ringDefs.push({ phi, count });
  }
  const domeTotal = ringDefs.reduce((s, d) => s + d.count, 0);
  const grandTotal = domeTotal + 1 /*cap*/ + TUNNEL_BLOCKS;

  let placed = 0;
  const pushOrder = () => placed / (grandTotal - 1);

  // Helper: orient a block so its "up" follows the dome normal and its width
  // wraps tangentially around the ring.
  const orientOnDome = (theta: number, phi: number) => {
    const normal = new THREE.Vector3(
      Math.cos(phi) * Math.sin(theta),
      Math.sin(phi),
      Math.cos(phi) * Math.cos(theta)
    ).normalize();
    // tangent around the ring (horizontal)
    const tangent = new THREE.Vector3(
      Math.cos(theta),
      0,
      -Math.sin(theta)
    ).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    // columns: x = tangent (block width), y = bitangent (block height up the dome), z = normal (thickness)
    m.makeBasis(tangent, bitangent, normal);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  };

  const startFor = (i: number, target: THREE.Vector3) => {
    // Deterministic dispersed start: raised high above, scattered outward,
    // arranged on a wide spiral so blocks read as floating apart.
    const ga = i * 2.39996; // golden angle
    const ring = 3.4 + ((i * 0.37) % 2.6);
    const sx = Math.cos(ga) * ring + Math.sin(i * 1.7) * 0.4;
    const sz = Math.sin(ga) * ring + Math.cos(i * 2.3) * 0.4;
    const sy = 4.2 + ((i * 0.53) % 3.4) + Math.sin(i * 0.9) * 0.6;
    const startPos = new THREE.Vector3(
      sx,
      sy + target.y * 0.2,
      sz
    );
    const startQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        Math.sin(i * 1.3) * 1.6,
        i * 0.7,
        Math.cos(i * 1.1) * 1.6
      )
    );
    return { startPos, startQuat };
  };

  let gi = 0;

  // ---- Dome rings ----
  for (let r = 0; r < RINGS; r++) {
    const { phi, count } = ringDefs[r];
    const ringR = Math.cos(phi) * DOME_R;
    const y = Math.sin(phi) * DOME_R;
    // taper block width as the ring shrinks; height grows slightly upward
    const blockW = (2 * Math.PI * ringR) / count;
    const blockH = (DOME_R * (Math.PI * 0.5)) / RINGS;
    for (let b = 0; b < count; b++) {
      const theta = (b / count) * Math.PI * 2 + r * 0.18; // stagger seams per ring
      const pos = new THREE.Vector3(
        Math.cos(phi) * Math.sin(theta) * DOME_R,
        y,
        Math.cos(phi) * Math.cos(theta) * DOME_R
      );
      const quat = orientOnDome(theta, phi);
      const scale = new THREE.Vector3(blockW * 0.94, blockH * 1.02, 0.34);
      const { startPos, startQuat } = startFor(gi, pos);
      // order: lower rings arrive first; within a ring, sweep around so it
      // spirals shut rather than snapping all at once.
      const ringFrac = r / RINGS;
      const withinRing = (b / count) * 0.9;
      const order = THREE.MathUtils.clamp(
        ringFrac + withinRing / RINGS,
        0,
        0.999
      );
      blocks.push({
        pos,
        quat,
        scale,
        startPos,
        startQuat,
        order,
        spin: (b % 2 === 0 ? 1 : -1) * (Math.PI * 1.3),
      });
      placed++;
      gi++;
    }
  }

  // ---- Capstone (single block sealing the top) ----
  {
    const pos = new THREE.Vector3(0, DOME_R, 0);
    const quat = new THREE.Quaternion(); // flat, facing up
    const scale = new THREE.Vector3(0.62, 0.62, 0.34);
    const { startPos, startQuat } = startFor(gi, pos);
    blocks.push({
      pos,
      quat,
      scale,
      startPos,
      startQuat,
      order: 0.88,
      spin: Math.PI * 2,
    });
    placed++;
    gi++;
  }

  // ---- Entrance tunnel (short arch extending out the front, +Z) ----
  {
    const tunnelR = 0.66;
    const baseZ = DOME_R * 0.92; // start just outside the dome wall
    for (let k = 0; k < TUNNEL_BLOCKS; k++) {
      // distribute across an arch (left, top, right) repeated along 2 segments
      const seg = Math.floor(k / 3); // 0 or 1 (depth segments)
      const arch = k % 3; // 0 left, 1 top, 2 right
      const z = baseZ + 0.55 + seg * 0.62;
      let pos: THREE.Vector3;
      let quat: THREE.Quaternion;
      if (arch === 1) {
        // top of tunnel
        pos = new THREE.Vector3(0, tunnelR, z);
        quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.PI * 0.5, 0, 0)
        );
      } else {
        const side = arch === 0 ? -1 : 1;
        pos = new THREE.Vector3(side * tunnelR, tunnelR * 0.5, z);
        quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, 0, side * Math.PI * 0.5)
        );
      }
      const scale = new THREE.Vector3(0.5, 0.5, 0.3);
      const { startPos, startQuat } = startFor(gi, pos);
      blocks.push({
        pos,
        quat,
        scale,
        startPos,
        startQuat,
        order: 0.9 + (k / TUNNEL_BLOCKS) * 0.1, // tunnel finishes last
        spin: (k % 2 === 0 ? 1 : -1) * Math.PI,
      });
      placed++;
      gi++;
    }
  }

  return blocks;
}

/* smoothstep */
function smooth(e0: number, e1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ---------------- The assembling igloo ---------------- */
function Igloo() {
  const scroll = useScroll();
  const inst = useRef<THREE.InstancedMesh>(null!);
  const group = useRef<THREE.Group>(null!);
  const glints = useRef<THREE.InstancedMesh>(null!);

  const blocks = useMemo(() => buildIgloo(), []);
  const count = blocks.length;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const spiralQ = useMemo(() => new THREE.Quaternion(), []);
  const axisUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const col = useMemo(() => new THREE.Color(), []);

  // per-instance base tint (subtle variation between deep + light ice)
  const tints = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(0.5 + 0.5 * Math.sin(i * 1.7));
    }
    return arr;
  }, [count]);

  // The stagger window: each block's local progress ramps within a slice of
  // the global scroll, ordered by block.order.
  const SPAN = 0.34; // how much of scroll each block's descent spans

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;

    if (!inst.current) return;

    for (let i = 0; i < count; i++) {
      const blk = blocks[i];
      // global driver shifted by this block's arrival order
      const start = blk.order * (1 - SPAN);
      const local = smooth(start, start + SPAN, off);

      // position: descend + spiral from dispersed start to target
      p.copy(blk.startPos).lerp(blk.pos, local);
      // add a little settle overshoot bounce near the end
      const settle = Math.sin(local * Math.PI) * (1 - local) * 0.12;
      p.y += settle;

      // rotation: spiral spin that resolves to the target orientation
      spiralQ.setFromAxisAngle(axisUp, blk.spin * (1 - local));
      q.copy(blk.startQuat).slerp(blk.quat, local);
      q.premultiply(spiralQ);

      // scale: tiny/faint when dispersed, full when locked
      const sc = THREE.MathUtils.lerp(0.45, 1, local);
      s.copy(blk.scale).multiplyScalar(sc);

      dummy.position.copy(p);
      dummy.quaternion.copy(q);
      dummy.scale.copy(s);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);

      // frost glint: bright flash right as the block locks (local near 1)
      const lockFlash = Math.pow(smooth(0.82, 1.0, local), 2);
      // color: deep ice when descending → bright frost as it locks
      col.copy(tints[i] > 0.55 ? ICE : ICE_DEEP);
      col.lerp(FROST, lockFlash * 0.6);
      inst.current.setColorAt(i, col);

      // glint sprite scaling on lock
      if (glints.current) {
        dummy.position.copy(blk.pos);
        const g = lockFlash * (0.5 + 0.5 * Math.sin(t * 8 + i));
        dummy.scale.setScalar(g * 0.5);
        dummy.quaternion.identity();
        dummy.updateMatrix();
        glints.current.setMatrixAt(i, dummy.matrix);
      }
    }
    inst.current.instanceMatrix.needsUpdate = true;
    if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true;
    if (glints.current) glints.current.instanceMatrix.needsUpdate = true;

    // Idle life: gentle slow rotation + a touch of float once assembled.
    if (group.current) {
      const assembled = smooth(0.6, 1, off);
      group.current.rotation.y += delta * (0.05 + assembled * 0.06);
      group.current.position.y =
        -0.6 + Math.sin(t * 0.4) * 0.04 * assembled;
    }
  });

  return (
    <group ref={group} position={[0, -0.6, 0]}>
      {/* ICE BLOCKS — single instanced mesh, frosted translucent ice */}
      <instancedMesh
        ref={inst}
        args={[undefined as any, undefined as any, count]}
        castShadow
        receiveShadow
      >
        {/* slightly beveled-feeling block via a box; trapezoidal read comes
            from the tangential taper + dome orientation */}
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial
          vertexColors
          color={ICE}
          roughness={0.42}
          metalness={0}
          transmission={0.55}
          thickness={0.7}
          ior={1.31}
          clearcoat={0.6}
          clearcoatRoughness={0.45}
          attenuationColor={ICE_DEEP}
          attenuationDistance={2.4}
          envMapIntensity={1.1}
          emissive={RIM}
          emissiveIntensity={0.12}
        />
      </instancedMesh>

      {/* FROST GLINTS — additive sprites that flash as each block locks */}
      <instancedMesh
        ref={glints}
        args={[undefined as any, undefined as any, count]}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={FROST}
          transparent
          opacity={0.9}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

/* ---------------- Cold studio environment ---------------- */
function IceEnv() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3.2}
        color={"#dff1ff"}
        position={[0, 5, 2]}
        scale={[8, 4, 1]}
        rotation={[-Math.PI / 2.4, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={2.0}
        color={"#9fc4e8"}
        position={[-5, 1, -3]}
        scale={[5, 6, 1]}
        rotation={[0, Math.PI / 3, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.6}
        color={"#bfe6ff"}
        position={[5, 0, -2]}
        scale={[5, 6, 1]}
        rotation={[0, -Math.PI / 3, 0]}
      />
      <Lightformer
        form="circle"
        intensity={1.2}
        color={"#ffffff"}
        position={[0, -4, 3]}
        scale={[4, 4, 1]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </Environment>
  );
}

export default function AssembleIgloo() {
  return (
    <>
      <color attach="background" args={[NIGHT]} />
      <fog attach="fog" args={[NIGHT, 9, 22]} />

      <ambientLight intensity={0.25} color={"#bcd6f0"} />
      {/* soft key */}
      <directionalLight
        position={[4, 7, 5]}
        intensity={1.8}
        color={"#eaf6ff"}
      />
      {/* cold rim light */}
      <directionalLight
        position={[-5, 2, -4]}
        intensity={1.4}
        color={RIM}
      />
      <pointLight position={[0, 4, 4]} intensity={14} color={"#dff1ff"} distance={18} />

      <IceEnv />

      <Igloo />

      {/* drifting cold dust / snow motes */}
      <Sparkles
        count={120}
        scale={[10, 7, 10]}
        size={2.2}
        speed={0.3}
        opacity={0.5}
        color={"#dff1ff"}
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={0.9}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.2}
        />
        <Vignette eskil={false} offset={0.3} darkness={0.9} />
      </EffectComposer>
    </>
  );
}

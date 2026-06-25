"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  useScroll,
  Environment,
  Lightformer,
  ContactShadows,
  MeshTransmissionMaterial,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Assemble · Pavilion",
  blurb:
    "Concrete and glass panels descend and slide into place, cladding a stepped pavilion top-down as you scroll.",
  family: "Assemble",
};

/* ---------- smoothstep easing ---------- */
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/* ---------- Panel layout: a stepped, faceted pavilion ----------
   We build the assembled form deterministically as a set of slabs:
   - a stack of receding floor "trays" (stepped volume)
   - vertical cladding panels wrapping each tier
   Each panel gets a target transform + a deterministic dispersed start
   transform (raised above & scattered, derived from index + trig).
   Components arrive bottom-up by tier, then by ring index.
------------------------------------------------------------------ */

type Panel = {
  // target (assembled)
  tPos: THREE.Vector3;
  tRot: THREE.Euler;
  tScale: THREE.Vector3;
  // start (dispersed) — raised above, scattered
  sPos: THREE.Vector3;
  sRot: THREE.Euler;
  sScale: THREE.Vector3;
  // staggered arrival order 0..1
  order: number;
  glass: boolean;
};

function buildPanels(): Panel[] {
  const panels: Panel[] = [];

  const tiers = 4; // stepped volume tiers
  const baseHalf = 2.05; // half-width of widest (bottom) tier footprint
  const tierH = 0.62; // height of each tier band
  const inset = 0.34; // how much each tier steps inward
  const yBottom = -1.15; // ground-ish base

  // total panels counter for global ordering normalization
  const records: {
    tPos: THREE.Vector3;
    tRot: THREE.Euler;
    tScale: THREE.Vector3;
    tier: number;
    ring: number;
    glass: boolean;
  }[] = [];

  for (let tier = 0; tier < tiers; tier++) {
    const half = baseHalf - tier * inset;
    const yMid = yBottom + tier * tierH + tierH / 2;

    // 1) the horizontal "tray" slab (floor plate of this tier)
    records.push({
      tPos: new THREE.Vector3(0, yBottom + tier * tierH, 0),
      tRot: new THREE.Euler(0, 0, 0),
      tScale: new THREE.Vector3(half * 2, 0.12, half * 2),
      tier,
      ring: -1,
      glass: false,
    });

    // 2) vertical cladding panels around the 4 faces of this tier.
    // panels per face scales slightly down on upper tiers.
    const perFace = 3;
    const faceW = (half * 2) / perFace;
    for (let face = 0; face < 4; face++) {
      // face 0:+Z, 1:+X, 2:-Z, 3:-X
      for (let k = 0; k < perFace; k++) {
        const along = -half + faceW * (k + 0.5);
        let pos: THREE.Vector3;
        let rotY: number;
        // every 3rd panel on the front-ish faces is glass
        const glass = (tier + face + k) % 3 === 0 && tier > 0;

        if (face === 0) {
          pos = new THREE.Vector3(along, yMid, half);
          rotY = 0;
        } else if (face === 1) {
          pos = new THREE.Vector3(half, yMid, -along);
          rotY = Math.PI / 2;
        } else if (face === 2) {
          pos = new THREE.Vector3(-along, yMid, -half);
          rotY = Math.PI;
        } else {
          pos = new THREE.Vector3(-half, yMid, along);
          rotY = -Math.PI / 2;
        }

        records.push({
          tPos: pos,
          tRot: new THREE.Euler(0, rotY, 0),
          tScale: new THREE.Vector3(faceW * 0.94, tierH * 0.94, 0.1),
          tier,
          ring: face * perFace + k,
          glass,
        });
      }
    }
  }

  // a crowning roof slab on top
  const topHalf = baseHalf - (tiers - 1) * inset - 0.05;
  records.push({
    tPos: new THREE.Vector3(0, yBottom + tiers * tierH, 0),
    tRot: new THREE.Euler(0, 0, 0),
    tScale: new THREE.Vector3(topHalf * 2 + 0.2, 0.14, topHalf * 2 + 0.2),
    tier: tiers,
    ring: -1,
    glass: false,
  });

  const total = records.length;
  records.forEach((r, i) => {
    // arrival order: bottom tiers first, trays slightly before their cladding.
    // weight primarily by tier, secondarily by index → choreographed build.
    const tierFrac = r.tier / tiers;
    const within = i / total;
    const order = THREE.MathUtils.clamp(tierFrac * 0.78 + within * 0.22, 0, 1);

    // deterministic dispersed start — raised above & scattered outward.
    const a = i * 2.3999632; // golden-angle-ish spread, deterministic
    const radius = 4.2 + (i % 5) * 0.55;
    const sx = Math.cos(a) * radius;
    const sz = Math.sin(a) * radius;
    const sy = 3.4 + ((i * 37) % 100) / 100 * 3.2; // high above, varied

    panels.push({
      tPos: r.tPos,
      tRot: r.tRot,
      tScale: r.tScale,
      sPos: new THREE.Vector3(sx, sy, sz),
      sRot: new THREE.Euler(
        Math.sin(a) * 0.9,
        a * 0.5,
        Math.cos(a * 1.3) * 0.9
      ),
      sScale: r.tScale.clone().multiplyScalar(0.4),
      order,
      glass: r.glass,
    });
  });

  return panels;
}

/* ---------- Concrete (matte) instanced panels ---------- */
function PanelGroup() {
  const concreteRef = useRef<THREE.InstancedMesh>(null!);
  const glassRef = useRef<THREE.Group>(null!);
  const groupRef = useRef<THREE.Group>(null!);
  const scroll = useScroll();

  const panels = useMemo(() => buildPanels(), []);
  const concrete = useMemo(() => panels.filter((p) => !p.glass), [panels]);
  const glass = useMemo(() => panels.filter((p) => p.glass), [panels]);

  // scratch objects
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const vPos = useMemo(() => new THREE.Vector3(), []);
  const vScale = useMemo(() => new THREE.Vector3(), []);
  const qStart = useMemo(() => new THREE.Quaternion(), []);
  const qTarget = useMemo(() => new THREE.Quaternion(), []);
  const qOut = useMemo(() => new THREE.Quaternion(), []);

  const stagger = 0.55; // each component's local ramp width (in offset space)

  useFrame((state, delta) => {
    const off = scroll.offset;
    const t = state.clock.elapsedTime;

    // idle life: gentle settle-rotation of the whole assembly once built
    if (groupRef.current) {
      const built = smoothstep(0.7, 1, off);
      groupRef.current.rotation.y = THREE.MathUtils.damp(
        groupRef.current.rotation.y,
        t * 0.05 * built + off * 0.25,
        2,
        delta
      );
      groupRef.current.position.y = Math.sin(t * 0.4) * 0.03 * built;
    }

    // ---- concrete instances ----
    if (concreteRef.current) {
      for (let i = 0; i < concrete.length; i++) {
        const p = concrete[i];
        const span = 1 - stagger;
        const start = p.order * span;
        const local = smoothstep(start, start + stagger, off);

        vPos.lerpVectors(p.sPos, p.tPos, local);
        qStart.setFromEuler(p.sRot);
        qTarget.setFromEuler(p.tRot);
        qOut.copy(qStart).slerp(qTarget, local);
        vScale.lerpVectors(p.sScale, p.tScale, local);

        dummy.position.copy(vPos);
        dummy.quaternion.copy(qOut);
        dummy.scale.copy(vScale);
        dummy.updateMatrix();
        concreteRef.current.setMatrixAt(i, dummy.matrix);
      }
      concreteRef.current.instanceMatrix.needsUpdate = true;
    }

    // ---- glass panels (real meshes for transmission) ----
    if (glassRef.current) {
      for (let i = 0; i < glass.length; i++) {
        const p = glass[i];
        const child = glassRef.current.children[i] as THREE.Mesh;
        if (!child) continue;
        const span = 1 - stagger;
        const start = p.order * span;
        const local = smoothstep(start, start + stagger, off);

        vPos.lerpVectors(p.sPos, p.tPos, local);
        qStart.setFromEuler(p.sRot);
        qTarget.setFromEuler(p.tRot);
        qOut.copy(qStart).slerp(qTarget, local);
        vScale.lerpVectors(p.sScale, p.tScale, local);

        child.position.copy(vPos);
        child.quaternion.copy(qOut);
        child.scale.copy(vScale);
        const mat = child.material as THREE.Material;
        mat.opacity = 0.25 + local * 0.6;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={concreteRef}
        args={[undefined, undefined, concrete.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#d8d4cc"
          roughness={0.88}
          metalness={0.02}
          envMapIntensity={0.55}
        />
      </instancedMesh>

      <group ref={glassRef}>
        {glass.map((_, i) => (
          <mesh key={i} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <MeshTransmissionMaterial
              transparent
              transmission={1}
              thickness={0.4}
              roughness={0.08}
              ior={1.3}
              chromaticAberration={0.02}
              color="#dfeaf2"
              attenuationColor="#cfe0ec"
              attenuationDistance={2}
              backside={false}
              resolution={128}
              samples={6}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ---------- Cool neutral daylight studio ---------- */
function DaylightEnvironment() {
  return (
    <Environment resolution={256} background={false}>
      <Lightformer
        form="rect"
        intensity={2.2}
        color="#eef3fb"
        position={[-4, 5, 3]}
        scale={[8, 8, 1]}
        rotation={[0, Math.PI / 6, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.1}
        color="#dfe6f0"
        position={[5, 1, 2]}
        scale={[6, 6, 1]}
        rotation={[0, -Math.PI / 6, 0]}
      />
      <Lightformer
        form="circle"
        intensity={1.6}
        color="#ffffff"
        position={[0, 6, -3]}
        scale={6}
      />
    </Environment>
  );
}

export default function AssembleArch() {
  const scroll = useScroll();
  void scroll; // consumed by children per contract

  return (
    <>
      <color attach="background" args={["#e7e9ee"]} />
      <fog attach="fog" args={["#e7e9ee", 11, 24]} />

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.6}
        color="#f4f7ff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 2, -3]} intensity={0.4} color="#d6deea" />

      <DaylightEnvironment />

      <PanelGroup />

      {/* soft contact shadow grounding the pavilion */}
      <ContactShadows
        position={[0, -1.18, 0]}
        scale={9}
        resolution={1024}
        blur={2.4}
        opacity={0.5}
        far={6}
        color="#4a4e57"
      />

      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={0.32}
          luminanceThreshold={0.85}
          luminanceSmoothing={0.3}
        />
        <Vignette eskil={false} offset={0.32} darkness={0.55} />
      </EffectComposer>
    </>
  );
}

"use client";
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  useScroll,
  Environment,
  Lightformer,
  Sparkles,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Assemble · Reassembly",
  blurb:
    "A shattered transmission-glass ice crystal whose shards descend and converge on scroll, seams flaring as they lock.",
  family: "Assemble",
};

/* ---------- helpers (deterministic, SSR-safe) ---------- */
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// cheap deterministic pseudo-random from an integer seed
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

const SHARD_COUNT = 64;

type Shard = {
  // assembled (target) transform — shards tile a faceted crystal silhouette
  target: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  scale: number;
  // dispersed (start) transform — raised above, scattered, tumbling
  start: THREE.Vector3;
  startQuat: THREE.Quaternion;
  spin: THREE.Vector3; // idle tumble axis*speed while dispersed
  // per-shard stagger window over scroll.offset
  delay: number;
  span: number;
  geomIndex: number;
};

export default function AssembleShards() {
  const scroll = useScroll();

  // shard geometries: a few thin faceted tetra/wedge shapes reused across instances
  const geometries = useMemo(() => {
    const g0 = new THREE.TetrahedronGeometry(0.42, 0);
    const g1 = new THREE.ConeGeometry(0.32, 0.9, 4, 1);
    const g2 = new THREE.OctahedronGeometry(0.34, 0);
    const g3 = new THREE.TetrahedronGeometry(0.3, 0);
    [g0, g1, g2, g3].forEach((g) => g.computeVertexNormals());
    return [g0, g1, g2, g3];
  }, []);

  // build the assembled crystal silhouette: shards arranged on a tapered
  // bipyramid (vertical spindle) so the whole reads as one faceted ice crystal.
  const shards = useMemo<Shard[]>(() => {
    const list: Shard[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < SHARD_COUNT; i++) {
      const h0 = hash(i);
      const h1 = hash(i + 100);
      const h2 = hash(i + 200);
      const h3 = hash(i + 300);

      // vertical position along the spindle, biased so bottom fills first
      const v = i / (SHARD_COUNT - 1); // 0..1 bottom->top
      const y = (v - 0.5) * 4.4; // crystal ~4.4 tall
      // radius profile: bipyramid — wide at middle, tapering to points
      const taper = Math.sin(v * Math.PI); // 0 at tips, 1 at waist
      const radius = 0.25 + taper * 1.7;

      // distribute around the ring; golden-angle for even facet coverage
      const ang = i * 2.399963 + h0 * 0.6;
      const tx = Math.cos(ang) * radius;
      const tz = Math.sin(ang) * radius;
      const target = new THREE.Vector3(tx, y, tz);

      // orient each shard so a face points outward from the axis, tipped by height
      const outward = new THREE.Vector3(tx, y * 0.35, tz).normalize();
      const targetQuat = new THREE.Quaternion().setFromUnitVectors(up, outward);
      // small deterministic twist for facet variety
      targetQuat.multiply(
        new THREE.Quaternion().setFromAxisAngle(up, h1 * Math.PI * 2)
      );

      const scale = 0.7 + taper * 0.9 + h2 * 0.3;

      // dispersed start: raised high above + flung outward on a wide sphere
      const sAng = ang + h3 * 1.4;
      const sRad = 3.2 + h1 * 2.6;
      const start = new THREE.Vector3(
        Math.cos(sAng) * sRad,
        3.5 + h0 * 3.5 + v * 1.5, // RAISED — clearly above the form
        Math.sin(sAng) * sRad - 0.5
      );
      const startQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(h0 * 6.28, h1 * 6.28, h2 * 6.28)
      );

      const spin = new THREE.Vector3(
        (h0 - 0.5) * 1.2,
        (h1 - 0.5) * 1.2,
        (h2 - 0.5) * 1.2
      );

      // stagger: bottom shards (low v) lock first -> upward build
      const delay = v * 0.55 + h2 * 0.06;
      const span = 0.42;

      list.push({
        target,
        targetQuat,
        scale,
        start,
        startQuat,
        spin,
        delay,
        span,
        geomIndex: i % geometries.length,
      });
    }
    return list;
  }, [geometries.length]);

  // one InstancedMesh per geometry to keep mesh count low
  const meshRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  // map each shard to (geomIndex, localInstanceIndex)
  const buckets = useMemo(() => {
    const b: number[][] = geometries.map(() => []);
    shards.forEach((s, i) => b[s.geomIndex].push(i));
    return b;
  }, [shards, geometries]);

  // reusable scratch objects
  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scl: new THREE.Vector3(),
      mat: new THREE.Matrix4(),
      qa: new THREE.Quaternion(),
    }),
    []
  );

  // seam glow core whose emissive flares with assembly
  const coreRef = useRef<THREE.Mesh>(null!);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state, dt) => {
    const off = scroll.offset; // 0 dispersed -> 1 assembled
    const t = state.clock.elapsedTime;

    // gentle idle rotation of the whole assembly (secondary to scroll)
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.12 + off * 0.4;
      groupRef.current.position.y = Math.sin(t * 0.5) * 0.05 * off;
    }

    const { pos, quat, scl, mat, qa } = scratch;

    for (let gi = 0; gi < geometries.length; gi++) {
      const im = meshRefs.current[gi];
      if (!im) continue;
      const bucket = buckets[gi];
      for (let li = 0; li < bucket.length; li++) {
        const s = shards[bucket[li]];

        // per-shard eased + staggered progress
        const p = smoothstep(s.delay, s.delay + s.span, off);

        // descent has a slight overshoot-free ease; lerp position
        pos.lerpVectors(s.start, s.target, p);
        // while dispersed, add idle tumble drift to the still-flying shards
        if (p < 0.999) {
          const drift = (1 - p) * 0.25;
          pos.x += Math.sin(t * 0.7 + bucket[li]) * drift;
          pos.z += Math.cos(t * 0.6 + bucket[li]) * drift;
        }

        // rotation: tumble while flying, settle to target as it locks
        qa.copy(s.startQuat);
        // apply ongoing tumble before lock
        const tumble = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(s.spin.x, s.spin.y, s.spin.z).normalize(),
          t * (1 - p) * 0.8
        );
        qa.multiply(tumble);
        quat.copy(qa).slerp(s.targetQuat, p);

        // scale up as it arrives (faint/small when dispersed)
        const sc = (0.35 + 0.65 * p) * s.scale;
        scl.set(sc, sc, sc);

        mat.compose(pos, quat, scl);
        im.setMatrixAt(li, mat);
      }
      im.instanceMatrix.needsUpdate = true;
    }

    // seam glow: peaks while shards are mid-locking, settles to a cold inner light
    if (coreRef.current) {
      const m = coreRef.current.material as THREE.MeshStandardMaterial;
      // flare tracks the "action" — derivative-like bump around mid assembly
      const flare = Math.sin(Math.min(1, off) * Math.PI); // 0 at ends, 1 mid
      m.emissiveIntensity = 0.4 + flare * 3.2 + off * 0.8;
      const cs = 0.2 + off * 0.55;
      coreRef.current.scale.setScalar(cs);
      coreRef.current.rotation.y = t * 0.3;
    }
  });

  return (
    <>
      <color attach="background" args={["#03060f"]} />
      <fog attach="fog" args={["#03060f", 9, 20]} />

      <ambientLight intensity={0.18} color="#8fb6ff" />
      <directionalLight position={[3, 6, 4]} intensity={1.4} color="#cfe2ff" />
      <pointLight position={[-4, -2, 3]} intensity={14} color="#3f7bff" distance={16} />

      {/* cold studio environment for crisp transmission read */}
      <Environment resolution={256} background={false}>
        <Lightformer
          form="rect"
          intensity={6}
          color="#dcebff"
          position={[0, 5, 2]}
          scale={[5, 0.7, 1]}
          rotation={[Math.PI / 2.2, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={4}
          color="#9fc0ff"
          position={[-4, 1, 1]}
          scale={[0.6, 5, 1]}
          rotation={[0, Math.PI / 4, 0]}
        />
        <Lightformer
          form="circle"
          intensity={2}
          color="#6f9cff"
          position={[4, 0, -2]}
          scale={4}
        />
      </Environment>

      <group ref={groupRef}>
        {/* inner seam-glow core — the "light locking in" as shards close */}
        <mesh ref={coreRef}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#bcdcff"
            emissive="#5fa0ff"
            emissiveIntensity={1}
            transparent
            opacity={0.55}
            roughness={0.25}
            metalness={0}
            toneMapped={false}
          />
        </mesh>

        {/* the shards — instanced transmission glass, descending into the form */}
        {geometries.map((geo, gi) => (
          <instancedMesh
            key={gi}
            ref={(el) => {
              meshRefs.current[gi] = el;
            }}
            args={[geo, undefined as unknown as THREE.Material, buckets[gi].length]}
          >
            {/* physical glass — transmissive read without per-instance render-target
               passes (keeps the gallery's capture/perf path light) */}
            <meshPhysicalMaterial
              transmission={0.92}
              thickness={1.1}
              roughness={0.08}
              metalness={0}
              ior={1.4}
              clearcoat={1}
              clearcoatRoughness={0.06}
              color="#dceaff"
              attenuationColor={new THREE.Color("#7fb0ff")}
              attenuationDistance={3}
              emissive={new THREE.Color("#2a5bbf")}
              emissiveIntensity={0.25}
              transparent
              opacity={0.96}
            />
          </instancedMesh>
        ))}
      </group>

      {/* cold dust catching the light */}
      <Sparkles
        count={90}
        scale={[11, 9, 6]}
        size={2}
        speed={0.15}
        opacity={0.45}
        color="#bcd8ff"
        noise={1}
      />

      <EffectComposer>
        <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.55} luminanceSmoothing={0.2} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0014, 0.0012)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  Scanline,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Circuit · Data Storm",
  blurb:
    "A firing wireframe lattice with glowing data packets streaming along its edges in electric blue & acid green, punctuated by glitchy chromatic pulses and scanline jitter.",
  family: "Circuit",
};

/* Palette */
const NEAR_BLACK = "#02050a";
const ELECTRIC = new THREE.Color("#22c8ff");
const ACID = new THREE.Color("#a6ff3c");
const HOT = new THREE.Color("#d8fbff");

/* Number of packets riding the edges (kept inside the 300-particle budget). */
const PACKET_COUNT = 264;

/* ---------- Edge extraction: build a clean list of unique edges ---------- */
function useLattice() {
  return useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1.75, 1);

    // Wireframe for the glowing lattice itself.
    const wireGeo = new THREE.WireframeGeometry(base);

    // Derive unique edges (start/end) from the wireframe position attribute.
    const wp = wireGeo.getAttribute("position") as THREE.BufferAttribute;
    const edgeSet = new Map<string, [THREE.Vector3, THREE.Vector3]>();
    for (let i = 0; i < wp.count; i += 2) {
      const a = new THREE.Vector3(wp.getX(i), wp.getY(i), wp.getZ(i));
      const b = new THREE.Vector3(
        wp.getX(i + 1),
        wp.getY(i + 1),
        wp.getZ(i + 1)
      );
      const ka = `${a.x.toFixed(3)}|${a.y.toFixed(3)}|${a.z.toFixed(3)}`;
      const kb = `${b.x.toFixed(3)}|${b.y.toFixed(3)}|${b.z.toFixed(3)}`;
      const key = ka < kb ? `${ka}__${kb}` : `${kb}__${ka}`;
      if (!edgeSet.has(key)) edgeSet.set(key, [a, b]);
    }
    const edges = Array.from(edgeSet.values());

    // Unique vertices → firing nodes.
    const posAttr = base.getAttribute("position") as THREE.BufferAttribute;
    const seen = new Set<string>();
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push(new THREE.Vector3(x, y, z));
    }

    base.dispose();
    return { wireGeo, edges, nodes };
  }, []);
}

/* ---------- Hero: firing lattice + streaming data packets ---------- */
function StormLattice({
  glitchRef,
}: {
  glitchRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null!);
  const matWire = useRef<THREE.LineBasicMaterial>(null!);
  const inst = useRef<THREE.InstancedMesh>(null!);
  const packets = useRef<THREE.Points>(null!);
  const scroll = useScroll();

  const { wireGeo, edges, nodes } = useLattice();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-packet assignment: which edge it rides, its speed, phase, and channel.
  const packetData = useMemo(() => {
    const edgeIdx = new Int32Array(PACKET_COUNT);
    const speed = new Float32Array(PACKET_COUNT);
    const phase = new Float32Array(PACKET_COUNT);
    const channel = new Float32Array(PACKET_COUNT); // 0 = electric, 1 = acid
    for (let i = 0; i < PACKET_COUNT; i++) {
      edgeIdx[i] = edges.length ? i % edges.length : 0;
      // Deterministic pseudo-variation via trig (SSR-safe, no Math.random).
      speed[i] = 0.22 + (0.5 + 0.5 * Math.sin(i * 12.9898)) * 0.55;
      phase[i] = (0.5 + 0.5 * Math.sin(i * 78.233)) % 1;
      channel[i] = (i * 2.39996) % 1 > 0.5 ? 1 : 0;
    }
    return { edgeIdx, speed, phase, channel };
  }, [edges.length]);

  // Packet geometry: positions + per-vertex color we animate each frame.
  const packetGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(PACKET_COUNT * 3), 3)
    );
    const col = new Float32Array(PACKET_COUNT * 3);
    for (let i = 0; i < PACKET_COUNT; i++) {
      const c = packetData.channel[i] === 1 ? ACID : ELECTRIC;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [packetData]);

  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;

    if (group.current) {
      // Faster, more aggressive tumble than the calm original.
      group.current.rotation.y = t * 0.32 + off * Math.PI * 1.8;
      group.current.rotation.x =
        0.2 + Math.sin(t * 0.5) * 0.22 + off * 0.9;
    }

    // Wireframe glow flickers hard, like an overdriven circuit.
    if (matWire.current) {
      const base = 0.5 + 0.5 * Math.sin(t * 3.4);
      const flick = Math.pow(0.5 + 0.5 * Math.sin(t * 17.0), 4) * 0.5;
      matWire.current.opacity = 0.45 + base * 0.35 + flick;
    }

    // Firing nodes: sharp staccato pulses, scaling up violently then decaying.
    if (inst.current) {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const fire = Math.pow(
          0.5 + 0.5 * Math.sin(t * 4.5 + i * 1.7 + n.y * 3.0),
          6
        );
        const s = 0.05 + fire * 0.16;
        dummy.position.copy(n);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.current.setMatrixAt(i, dummy.matrix);
      }
      inst.current.instanceMatrix.needsUpdate = true;
    }

    // Data packets travel ALONG their assigned edges, looping start→end.
    if (packets.current && edges.length) {
      const posAttr = packets.current.geometry.getAttribute(
        "position"
      ) as THREE.BufferAttribute;
      const colAttr = packets.current.geometry.getAttribute(
        "color"
      ) as THREE.BufferAttribute;
      for (let i = 0; i < PACKET_COUNT; i++) {
        const e = edges[packetData.edgeIdx[i]];
        // Loop progress 0..1 along the edge.
        let p = (t * packetData.speed[i] + packetData.phase[i]) % 1;
        if (p < 0) p += 1;
        tmpA.copy(e[0]);
        tmpB.copy(e[1]);
        tmpA.lerp(tmpB, p);
        posAttr.setXYZ(i, tmpA.x, tmpA.y, tmpA.z);

        // Brighten packets toward the leading edge of their run (comet head).
        const head = Math.pow(p, 0.5); // brighter as it nears the node
        const baseC = packetData.channel[i] === 1 ? ACID : ELECTRIC;
        const r = THREE.MathUtils.lerp(baseC.r, HOT.r, head * 0.7);
        const g = THREE.MathUtils.lerp(baseC.g, HOT.g, head * 0.7);
        const b = THREE.MathUtils.lerp(baseC.b, HOT.b, head * 0.7);
        colAttr.setXYZ(i, r, g, b);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    // Glitch driver: dense, energetic, with frequent spikes + scroll velocity.
    const burst = Math.pow(0.5 + 0.5 * Math.sin(t * 1.7), 8); // recurring spike
    const stutter =
      Math.max(0, Math.sin(t * 31.0)) *
      Math.pow(0.5 + 0.5 * Math.sin(t * 0.8), 14); // staccato bursts
    const scrollKick = Math.min(1, Math.abs((scroll as any).delta ?? 0) * 80);
    glitchRef.current = Math.min(
      1,
      0.12 + burst * 0.7 + stutter + scrollKick * 1.0
    );
  });

  return (
    <Float speed={1.6} rotationIntensity={0.4} floatIntensity={1.0}>
      <group ref={group}>
        {/* Glowing lattice edges */}
        <lineSegments geometry={wireGeo}>
          <lineBasicMaterial
            ref={matWire}
            color={ELECTRIC}
            transparent
            opacity={0.8}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>

        {/* Dark inner volume for depth / silhouette */}
        <mesh>
          <icosahedronGeometry args={[1.72, 1]} />
          <meshBasicMaterial
            color={NEAR_BLACK}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>

        {/* Firing acid-green vertex nodes */}
        <instancedMesh
          ref={inst}
          args={[undefined as any, undefined as any, nodes.length]}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial
            color={ACID}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </instancedMesh>

        {/* Data packets streaming along the edges */}
        <points ref={packets} geometry={packetGeo}>
          <pointsMaterial
            vertexColors
            size={0.08}
            sizeAttenuation
            transparent
            opacity={0.95}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>
    </Float>
  );
}

/* ---------- Ambient data dust drifting around the storm ---------- */
function DataDust() {
  const ref = useRef<THREE.Points>(null!);
  const count = 200;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996; // golden angle
      const r = 2.6 + (i % 13) * 0.42;
      const y = Math.sin(i * 0.9) * 3.4;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = i % 3 === 0 ? ACID : ELECTRIC;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = -state.clock.elapsedTime * 0.06;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        vertexColors
        size={0.03}
        sizeAttenuation
        transparent
        opacity={0.5}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ---------- Glitch-reactive post stack ---------- */
function Post({ glitchRef }: { glitchRef: React.MutableRefObject<number> }) {
  const caRef = useRef<any>(null!);
  const scanRef = useRef<any>(null!);
  const offset = useMemo(() => new THREE.Vector2(0.001, 0.001), []);

  useFrame(() => {
    const g = glitchRef.current;

    // Chromatic aberration: subtle base, violent horizontal tear on glitch.
    const x = 0.0011 + g * 0.0042;
    const y = 0.0009 + g * 0.0016;
    offset.set(x, y);
    if (caRef.current && caRef.current.offset) {
      caRef.current.offset.copy(offset);
    }

    // Scanline density jitters with the glitch for a CRT stutter feel.
    if (scanRef.current) {
      const dens = 1.25 + g * 1.6;
      if ("density" in scanRef.current) scanRef.current.density = dens;
      const u = scanRef.current.uniforms;
      if (u && u.get && u.get("density")) u.get("density").value = dens;
    }
  });

  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        intensity={1.45}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.22}
      />
      <ChromaticAberration
        ref={caRef}
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
        radialModulation={false}
        modulationOffset={0}
      />
      <Scanline
        ref={scanRef}
        blendFunction={BlendFunction.OVERLAY}
        density={1.25}
        opacity={0.22}
      />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.18} />
      <Vignette eskil={false} offset={0.28} darkness={0.95} />
    </EffectComposer>
  );
}

export default function CircuitStorm() {
  const glitchRef = useRef(0);
  return (
    <>
      <color attach="background" args={[NEAR_BLACK]} />
      <fog attach="fog" args={[NEAR_BLACK, 7, 20]} />

      <ambientLight intensity={0.35} />
      <pointLight
        position={[4, 4, 5]}
        intensity={26}
        color={"#22c8ff"}
        distance={22}
      />
      <pointLight
        position={[-5, -2, -2]}
        intensity={18}
        color={"#a6ff3c"}
        distance={20}
      />

      <StormLattice glitchRef={glitchRef} />
      <DataDust />

      <Post glitchRef={glitchRef} />
    </>
  );
}

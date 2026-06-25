"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float, Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Circuit",
  blurb:
    "Blueprint crystal: glowing wireframe + instanced nodes in electric blue & acid green over near-black, with a perspective grid floor and glitchy CA pulses.",
};

/* Palette */
const NEAR_BLACK = "#03060a";
const ELECTRIC = "#2bd6ff";
const ACID = "#9cff4a";

/* ---------- Hero: structural wireframe crystal ---------- */
function StructuralCrystal({
  glitchRef,
}: {
  glitchRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null!);
  const matWire = useRef<THREE.LineBasicMaterial>(null!);
  const scroll = useScroll();

  // Build a low-poly icosahedron and derive its wireframe + vertex node set.
  const { wireGeo, nodes } = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1.6, 1);
    const wireGeo = new THREE.WireframeGeometry(base);
    // Unique-ish node positions from base vertices.
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
    return { wireGeo, nodes };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const inst = useRef<THREE.InstancedMesh>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    if (group.current) {
      group.current.rotation.y = t * 0.16 + off * Math.PI * 1.2;
      group.current.rotation.x = 0.18 + Math.sin(t * 0.25) * 0.12 + off * 0.6;
    }
    // Pulse the wireframe glow.
    if (matWire.current) {
      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6));
      matWire.current.opacity = pulse;
    }
    // Animate node scale: each node "fires" on a traveling sine wave.
    if (inst.current) {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const fire = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.9 + n.y * 2.0);
        const s = 0.045 + fire * 0.07;
        dummy.position.copy(n);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.current.setMatrixAt(i, dummy.matrix);
      }
      inst.current.instanceMatrix.needsUpdate = true;
    }

    // Glitch driver: rare time-based spikes + a scroll-velocity kick.
    const burst = Math.pow(0.5 + 0.5 * Math.sin(t * 0.9), 12); // sharp occasional spike
    const flick = Math.max(0, Math.sin(t * 23.0)) * Math.pow(0.5 + 0.5 * Math.sin(t * 0.45), 30);
    const scrollKick = Math.min(1, Math.abs((scroll as any).delta ?? 0) * 60);
    glitchRef.current = Math.min(1, burst * 0.8 + flick + scrollKick * 0.9);
  });

  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.8}>
      <group ref={group}>
        {/* Glowing wireframe edges */}
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

        {/* Faint inner solid for depth/occlusion volume */}
        <mesh>
          <icosahedronGeometry args={[1.58, 1]} />
          <meshBasicMaterial
            color={NEAR_BLACK}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>

        {/* Instanced acid-green vertex nodes */}
        <instancedMesh
          ref={inst}
          args={[undefined as any, undefined as any, nodes.length]}
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial
            color={ACID}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    </Float>
  );
}

/* ---------- Perspective blueprint grid floor ---------- */
function GridFloor() {
  const ref = useRef<THREE.GridHelper>(null!);
  const scroll = useScroll();
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(40, 40, ELECTRIC, ELECTRIC);
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.18;
    m.toneMapped = false;
    m.depthWrite = false;
    return g;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      // Scroll grid toward camera for a flythrough feel.
      const z = ((t * 0.6 + scroll.offset * 8) % 1) * 1;
      ref.current.position.set(0, -2.4, z - 0.5);
    }
  });
  return <primitive ref={ref} object={grid} position={[0, -2.4, 0]} />;
}

/* ---------- Blueprint particle field (data points) ---------- */
function DataPoints() {
  const ref = useRef<THREE.Points>(null!);
  const count = 280;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Deterministic placement via trig — no Math.random at module level.
      const a = i * 2.39996; // golden angle
      const r = 3 + (i % 11) * 0.55;
      const y = Math.sin(i * 0.7) * 3.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.04;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={ELECTRIC}
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.6}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ---------- Post stack with glitch-reactive chromatic aberration ---------- */
function Post({ glitchRef }: { glitchRef: React.MutableRefObject<number> }) {
  const caRef = useRef<any>(null!);
  const offset = useMemo(() => new THREE.Vector2(0.0008, 0.0008), []);
  useFrame(() => {
    const g = glitchRef.current;
    // Base subtle CA, spiking on glitch.
    const amt = 0.0009 + g * 0.0011;
    offset.set(amt, amt * (0.6 + g * 1.2));
    if (caRef.current && caRef.current.offset) {
      caRef.current.offset.copy(offset);
    }
  });
  return (
    <EffectComposer>
      <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.2} luminanceSmoothing={0.25} />
      <ChromaticAberration
        ref={caRef}
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.3} darkness={0.92} />
    </EffectComposer>
  );
}

export default function Circuit() {
  const glitchRef = useRef(0);
  return (
    <>
      <color attach="background" args={[NEAR_BLACK]} />
      <fog attach="fog" args={[NEAR_BLACK, 8, 22]} />

      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={20} color={ELECTRIC} distance={20} />
      <pointLight position={[-4, -2, -2]} intensity={14} color={ACID} distance={18} />

      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.5} color={ELECTRIC} position={[-3, 2, 2]} scale={[5, 5, 1]} />
        <Lightformer form="rect" intensity={1.0} color={ACID} position={[3, -1, 2]} scale={[4, 4, 1]} />
      </Environment>

      <StructuralCrystal glitchRef={glitchRef} />
      <GridFloor />
      <DataPoints />

      <Post glitchRef={glitchRef} />
    </>
  );
}

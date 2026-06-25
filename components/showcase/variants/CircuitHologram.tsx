"use client";

import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useScroll, Float } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Scanline,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

export const meta = {
  name: "Circuit · Hologram",
  blurb:
    "A slowly rotating wireframe crystal projected as a flickering cyan-green hologram above a bright projector disc, with scanlines and an upward volumetric light cone.",
  family: "Circuit",
};

/* Palette */
const VOID = "#02060a";
const CYAN = "#39f0ff";
const GREEN = "#7dffc4";
const PROJECTOR = "#bdfcff";

/* ----------------------------------------------------------------------------
   Holographic flicker: a deterministic, slightly nervous emission multiplier.
   Mostly ~1.0 with occasional dips/spikes — feels like an unstable projection.
---------------------------------------------------------------------------- */
function holoFlicker(t: number) {
  const slow = 0.5 + 0.5 * Math.sin(t * 0.7);
  const fast = Math.sin(t * 41.0) * 0.5 + 0.5;
  const jitter = Math.sin(t * 13.0 + Math.sin(t * 7.0) * 3.0);
  const dropout = Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + 1.3), 18); // rare deep dip
  const base = 0.82 + slow * 0.12 + fast * 0.06 + jitter * 0.04;
  return Math.max(0.35, base - dropout * 0.55);
}

/* ----------------------------------------------------------------------------
   Hero: a wireframe crystal projection.
   - Glowing edges (cyan), additive
   - Acid-green vertex nodes that "fire"
   - A second, larger, fainter shell for layered-projection depth
   - Whole thing flickers + rises/settles on scroll
---------------------------------------------------------------------------- */
function ProjectedCrystal({
  emitRef,
}: {
  emitRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null!);
  const wireMat = useRef<THREE.LineBasicMaterial>(null!);
  const shellMat = useRef<THREE.LineBasicMaterial>(null!);
  const nodeMat = useRef<THREE.MeshBasicMaterial>(null!);
  const inst = useRef<THREE.InstancedMesh>(null!);
  const scroll = useScroll();

  const { wireGeo, shellGeo, nodes } = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1.5, 1);
    const wireGeo = new THREE.WireframeGeometry(base);

    const shellBase = new THREE.IcosahedronGeometry(2.05, 0);
    const shellGeo = new THREE.WireframeGeometry(shellBase);

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
    shellBase.dispose();
    return { wireGeo, shellGeo, nodes };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const off = scroll.offset;
    const flick = holoFlicker(t);
    emitRef.current = flick;

    if (group.current) {
      // Slow, stately rotation. Scroll nudges the tilt + lift.
      group.current.rotation.y = t * 0.22 + off * Math.PI * 0.9;
      group.current.rotation.x = 0.12 + Math.sin(t * 0.3) * 0.08;
      // Float the projection a touch higher; settle as you scroll.
      group.current.position.y = 0.25 + Math.sin(t * 0.6) * 0.05 - off * 0.2;
    }

    if (wireMat.current) wireMat.current.opacity = 0.55 * flick + 0.35;
    if (shellMat.current) shellMat.current.opacity = 0.12 * flick + 0.05;
    if (nodeMat.current) nodeMat.current.opacity = 0.7 * flick + 0.25;

    if (inst.current) {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const fire = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.1 + n.y * 2.0);
        const s = (0.05 + fire * 0.075) * (0.7 + flick * 0.4);
        dummy.position.copy(n);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.current.setMatrixAt(i, dummy.matrix);
      }
      inst.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.5}>
      <group ref={group}>
        {/* Outer faint projection shell */}
        <lineSegments geometry={shellGeo}>
          <lineBasicMaterial
            ref={shellMat}
            color={GREEN}
            transparent
            opacity={0.12}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>

        {/* Core glowing wireframe */}
        <lineSegments geometry={wireGeo}>
          <lineBasicMaterial
            ref={wireMat}
            color={CYAN}
            transparent
            opacity={0.85}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>

        {/* Faint inner solid for projected-volume occlusion */}
        <mesh>
          <icosahedronGeometry args={[1.48, 1]} />
          <meshBasicMaterial
            color={CYAN}
            transparent
            opacity={0.06}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        {/* Firing vertex nodes */}
        <instancedMesh
          ref={inst}
          args={[undefined as any, undefined as any, nodes.length]}
        >
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial
            ref={nodeMat}
            color={GREEN}
            transparent
            opacity={0.85}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    </Float>
  );
}

/* ----------------------------------------------------------------------------
   Projector base disc: a bright emitter at the bottom with concentric rings.
   This is the "source" the hologram emanates from.
---------------------------------------------------------------------------- */
function ProjectorBase({
  emitRef,
}: {
  emitRef: React.MutableRefObject<number>;
}) {
  const core = useRef<THREE.MeshBasicMaterial>(null!);
  const ringA = useRef<THREE.MeshBasicMaterial>(null!);
  const ringB = useRef<THREE.MeshBasicMaterial>(null!);
  const ringGroup = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flick = emitRef.current;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    if (core.current) core.current.opacity = (0.85 + pulse * 0.15) * flick;
    if (ringA.current) ringA.current.opacity = 0.4 * flick;
    if (ringB.current) ringB.current.opacity = (0.2 + pulse * 0.2) * flick;
    if (ringGroup.current) ringGroup.current.rotation.z = t * 0.3;
  });

  return (
    <group position={[0, -2.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Bright core disc */}
      <mesh>
        <circleGeometry args={[0.85, 64]} />
        <meshBasicMaterial
          ref={core}
          color={PROJECTOR}
          transparent
          opacity={0.95}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Concentric emitter rings */}
      <group ref={ringGroup}>
        <mesh>
          <ringGeometry args={[0.95, 1.05, 64]} />
          <meshBasicMaterial
            ref={ringA}
            color={CYAN}
            transparent
            opacity={0.4}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <ringGeometry args={[1.2, 1.27, 64]} />
          <meshBasicMaterial
            ref={ringB}
            color={GREEN}
            transparent
            opacity={0.25}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ----------------------------------------------------------------------------
   Volumetric-ish light cone: a translucent additive cone widening upward from
   the projector, with a soft vertical falloff baked via vertex colors.
---------------------------------------------------------------------------- */
function LightCone({ emitRef }: { emitRef: React.MutableRefObject<number> }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const group = useRef<THREE.Group>(null!);

  const geo = useMemo(() => {
    // Open cone, apex at projector, widening as it rises.
    const g = new THREE.CylinderGeometry(1.7, 0.25, 4.0, 48, 1, true);
    // Vertical alpha falloff via vertex colors (white at base, dark at top).
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); // -2..2
      const f = THREE.MathUtils.clamp((2.0 - y) / 4.0, 0, 1); // bright at bottom
      const v = 0.15 + f * 0.85;
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flick = emitRef.current;
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.8);
    if (mat.current) mat.current.opacity = (0.05 + breathe * 0.05) * flick;
    if (group.current) group.current.rotation.y = t * 0.1;
  });

  // Cone center placed so its base sits on the projector and it rises upward.
  return (
    <group ref={group} position={[0, 0.0, 0]}>
      <mesh geometry={geo}>
        <meshBasicMaterial
          ref={mat}
          color={CYAN}
          vertexColors
          transparent
          opacity={0.08}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------------------------------
   Drifting motes rising inside the cone — dust caught in the projection beam.
---------------------------------------------------------------------------- */
function BeamMotes() {
  const ref = useRef<THREE.Points>(null!);
  const count = 220;

  const { geo, speeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996; // golden angle
      // Radius shrinks toward bottom to keep motes within the cone.
      const yNorm = (i % 37) / 37; // 0..1 up the cone
      const y = -2.0 + yNorm * 4.0;
      const maxR = 0.25 + yNorm * 1.45;
      const r = maxR * (0.3 + (i % 7) / 7 * 0.7);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.1 + ((i % 13) / 13) * 0.25;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo: g, speeds };
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + speeds[i] * delta;
      if (y > 2.0) y = -2.0; // recycle to base
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    ref.current.rotation.y = state.clock.elapsedTime * 0.05;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={PROJECTOR}
        size={0.025}
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

/* ----------------------------------------------------------------------------
   Post: bloom for luminous glow, hologram scanlines, a touch of CA fringing
   that spikes on flicker dropouts, and a deep vignette.
---------------------------------------------------------------------------- */
function Post({ emitRef }: { emitRef: React.MutableRefObject<number> }) {
  const caRef = useRef<any>(null!);
  const offset = useMemo(() => new THREE.Vector2(0.0008, 0.0012), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flick = emitRef.current;
    // When the projection dips (flick low), fringing jumps — instability.
    const instab = THREE.MathUtils.clamp(1.0 - flick, 0, 1);
    const wobble = 0.5 + 0.5 * Math.sin(t * 30.0);
    const amt = 0.0007 + instab * 0.0035 * wobble;
    offset.set(amt, amt * 1.4 + 0.0006);
    if (caRef.current && caRef.current.offset) {
      caRef.current.offset.copy(offset);
    }
  });

  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        intensity={1.5}
        luminanceThreshold={0.15}
        luminanceSmoothing={0.3}
      />
      <Scanline
        blendFunction={BlendFunction.OVERLAY}
        density={1.6}
        opacity={0.28}
      />
      <ChromaticAberration
        ref={caRef}
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.28} darkness={0.95} />
    </EffectComposer>
  );
}

export default function CircuitHologram() {
  const emitRef = useRef(1);
  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 7, 20]} />

      <ambientLight intensity={0.25} />
      <pointLight
        position={[0, -1.5, 1]}
        intensity={14}
        color={PROJECTOR}
        distance={12}
      />
      <pointLight
        position={[3, 3, 3]}
        intensity={8}
        color={CYAN}
        distance={18}
      />

      <ProjectedCrystal emitRef={emitRef} />
      <LightCone emitRef={emitRef} />
      <ProjectorBase emitRef={emitRef} />
      <BeamMotes />

      <Post emitRef={emitRef} />
    </>
  );
}

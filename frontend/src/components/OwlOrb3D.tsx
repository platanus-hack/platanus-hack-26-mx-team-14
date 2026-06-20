import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbState } from '../types';
import owlImg from '../assets/owl-logo.png';

const STATE_COLOR: Record<OrbState, string> = {
  idle:      '#1e6bff',
  listening: '#22c55e',
  thinking:  '#8b5cf6',
  speaking:  '#06b6d4',
};

function useCircleAlpha(): THREE.CanvasTexture {
  return useMemo(() => {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, half * 0.55, half, half, half * 0.92);
    g.addColorStop(0,    'white');
    g.addColorStop(0.80, 'white');
    g.addColorStop(1.0,  'black');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }, []);
}

function OwlScene({ state }: { state: OrbState }) {
  const outerRef   = useRef<THREE.Group>(null!);
  const owlRef     = useRef<THREE.Mesh>(null!);
  const shimRef    = useRef<THREE.Mesh>(null!);
  const rimRef     = useRef<THREE.Mesh>(null!);
  const orbitLtRef = useRef<THREE.PointLight>(null!);
  const fillLtRef  = useRef<THREE.PointLight>(null!);

  const { mouse, camera } = useThree();

  const owlTex = useTexture(owlImg);
  owlTex.colorSpace  = THREE.SRGBColorSpace;
  owlTex.needsUpdate = true;

  const alphaMask = useCircleAlpha();
  const colorObj  = useMemo(() => new THREE.Color(STATE_COLOR[state]), [state]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const outer = outerRef.current;
    const owl   = owlRef.current;
    const shim  = shimRef.current;
    if (!outer || !owl) return;

    // Keep owl layers always facing camera
    owl.lookAt(camera.position);
    if (shim) shim.lookAt(camera.position);
    if (rimRef.current) rimRef.current.lookAt(camera.position);

    // Orbit the key light
    if (orbitLtRef.current) {
      orbitLtRef.current.position.set(
        Math.sin(t * 0.65) * 3.2,
        Math.cos(t * 0.45) * 2.0,
        Math.cos(t * 0.65) * 2.5 + 3.2,
      );
      orbitLtRef.current.color.lerp(colorObj, 0.06);
    }
    if (fillLtRef.current) {
      fillLtRef.current.color.lerp(colorObj, 0.06);
    }

    switch (state) {
      case 'idle':
        outer.rotation.x += ((-mouse.y * 0.38) - outer.rotation.x) * 0.055;
        outer.rotation.y += (( mouse.x * 0.38) - outer.rotation.y) * 0.055;
        outer.position.y  = Math.sin(t * 0.85) * 0.12;
        break;
      case 'listening':
        outer.rotation.x += ((-mouse.y * 0.38) - outer.rotation.x) * 0.055;
        outer.rotation.y += (( mouse.x * 0.38) - outer.rotation.y) * 0.055;
        outer.scale.setScalar(1 + Math.sin(t * 9.5) * 0.048);
        break;
      case 'thinking':
        outer.rotation.x = Math.sin(t * 0.7) * 0.10;
        outer.rotation.y = Math.sin(t * 0.4) * 0.08;
        outer.scale.setScalar(1);
        break;
      case 'speaking':
        outer.rotation.x += ((-mouse.y * 0.38) - outer.rotation.x) * 0.055;
        outer.rotation.y += (( mouse.x * 0.38) - outer.rotation.y) * 0.055;
        outer.position.y  = Math.sin(t * 6.2) * 0.07;
        outer.scale.setScalar(1 + Math.sin(t * 6.2) * 0.055);
        break;
    }
  });

  return (
    <group ref={outerRef}>

      {/* L0 — background glow disc */}
      <mesh position={[0, 0, -0.80]}>
        <circleGeometry args={[1.30, 64]} />
        <meshBasicMaterial
          color={STATE_COLOR[state]}
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* L1 — owl image (unlit, always full colour) */}
      <mesh ref={owlRef} position={[0, 0, 0]}>
        <planeGeometry args={[2.30, 2.30]} />
        <meshBasicMaterial
          map={owlTex}
          alphaMap={alphaMask}
          transparent
          alphaTest={0.02}
          depthWrite={false}
        />
      </mesh>

      {/* L2 — additive shimmer tinted by state colour */}
      <mesh ref={shimRef} position={[0, 0, 0.10]}>
        <planeGeometry args={[2.30, 2.30]} />
        <meshBasicMaterial
          map={owlTex}
          alphaMap={alphaMask}
          color={STATE_COLOR[state]}
          transparent
          opacity={0.20}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* L3 — coloured rim ring */}
      <mesh ref={rimRef} position={[0, 0, 0.18]}>
        <ringGeometry args={[0.91, 1.11, 64]} />
        <meshBasicMaterial
          color={STATE_COLOR[state]}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <pointLight ref={orbitLtRef} color={STATE_COLOR[state]} intensity={5} distance={9} decay={2} />
      <pointLight
        ref={fillLtRef}
        position={[-2.5, 1.5, 4]}
        color={STATE_COLOR[state]}
        intensity={1.4}
        distance={8}
        decay={2}
      />
      <directionalLight position={[1, 2, 5]} intensity={1.2} />
      <ambientLight intensity={0.70} />
    </group>
  );
}

interface OwlOrb3DProps {
  state: OrbState;
  size?: number;
}

export default function OwlOrb3D({ state, size = 280 }: OwlOrb3DProps) {
  // Canvas is 1.5× the layout size so the halo has room to bleed outside the
  // square boundary. Camera is pulled back proportionally so the owl stays the
  // same perceived pixel width (≈ size px).
  const canvasSize = size * 1.5;
  return (
    <div style={{ width: size, height: size, position: 'relative', overflow: 'visible' }}>
      <div style={{
        position: 'absolute',
        width: canvasSize,
        height: canvasSize,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}>
        <Canvas
          camera={{ position: [0, 0, 5.0], fov: 38 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent', pointerEvents: 'auto' }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <OwlScene state={state} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

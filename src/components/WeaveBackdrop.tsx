import { useEffect, useRef } from "react";
import useReducedMotion from "./SchedulePhysics/useReducedMotion";

/**
 * The Temporal Weave: a quiet, decorative 3D backdrop for the sign-in screen.
 * Fifteen silk ribbons — one per working hour of the week, one brass for the
 * decided lecture — drift in disorder, then settle into straight, parallel
 * lanes. It is the product's argument in six seconds: the schedule stops being
 * a tangle and becomes a decision.
 *
 * Rules this layer lives by:
 *  - It reads no data and sends nothing anywhere. Pure geometry.
 *  - It loads lazily (three.js is its own chunk) and only after the page is idle.
 *  - It never mounts on weak devices (few cores, low memory, data-saver),
 *    without WebGL, or while the tab is hidden.
 *  - Under prefers-reduced-motion it draws one settled frame and stops.
 *  - It is aria-hidden, ignores the pointer and disappears from print.
 */

const RIBBONS = 15;
const BRASS_INDEX = 7;

const capable = () => {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return false;
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
    if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency < 4) return false;
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default function WeaveBackdrop() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !capable()) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      const [THREE, { RoomEnvironment }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ]);
      if (disposed || !hostRef.current) return;

      const dark = document.documentElement.dataset.theme === "dark";
      const palette = dark
        ? { jade: "#5fbfa6", alt: "#c9d3d8", brass: "#c79b5f" }
        : { jade: "#1f6b5c", alt: "#46524d", brass: "#b8873f" };

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = dark ? 1 : 0.9;
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = dark ? 0.9 : 0.75;
      const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
      key.position.set(6, -8, 8);
      const rim = new THREE.DirectionalLight(0x9fd8e8, 1.6);
      rim.position.set(-9, 6, 4);
      scene.add(key, rim);

      const stageGroup = new THREE.Group();
      scene.add(stageGroup);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
      camera.up.set(0, 0, 1);

      const small = window.innerWidth < 720;
      const segments = small ? 110 : 190;
      const materials = [
        new THREE.MeshStandardMaterial({ color: palette.jade, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: palette.alt, metalness: 0.9, roughness: 0.24, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: palette.brass, metalness: 1, roughness: 0.22, side: THREE.DoubleSide }),
      ];
      const ribbons = Array.from({ length: RIBBONS }, (_, r) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segments * 2 * 3), 3));
        const index: number[] = [];
        for (let i = 0; i < segments - 1; i++) {
          const a = i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        geo.setIndex(index);
        const mesh = new THREE.Mesh(geo, materials[r === BRASS_INDEX ? 2 : r % 2 === 0 ? 0 : 1]);
        mesh.frustumCulled = false;
        stageGroup.add(mesh);
        return mesh;
      });

      const shape = (t: number) => {
        const conv = smooth(1.4, 6.4, t);
        ribbons.forEach((mesh, r) => {
          const pos = mesh.geometry.getAttribute("position") as import("three").BufferAttribute;
          const phase = r * 0.85;
          const lane = (r - (RIBBONS - 1) / 2) * 0.4;
          const width = 0.065 + 0.018 * Math.sin(r);
          const amp = (1 - conv) * (1.5 + 0.25 * Math.sin(r));
          for (let i = 0; i < segments; i++) {
            const x = (i / (segments - 1) - 0.5) * 17;
            let z = lane * (1 + (1 - conv) * 1.3) + amp * Math.sin(0.9 * x + t * 0.9 + phase);
            const y = (1 - conv) * (2.4 * Math.cos(0.55 * x + phase + t * 0.7) + (r - 7) * 0.32);
            z += 0.04 * Math.sin(1.3 * x + t * 1.2 + phase) * conv;
            const th = (1 - conv) * (0.9 * x + phase + t * 1.1);
            const dy = Math.sin(th) * width;
            const dz = Math.cos(th) * width;
            pos.setXYZ(i * 2, x, y + dy, z + dz);
            pos.setXYZ(i * 2 + 1, x, y - dy, z - dz);
          }
          pos.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        });
        const dolly = smooth(0, 7, t);
        const far = camera.aspect < 1 ? 1 : Math.min(1.8, Math.max(1, 1.45 / camera.aspect));
        camera.position.set((-8 + 9.5 * dolly) * far, (-26 + 5.5 * dolly) * far, 6.5 - 3.6 * dolly + Math.sin(t * 0.25) * 0.12);
        camera.lookAt(0, 0, 0);
      };

      const resize = () => {
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75));
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        /* On a tall screen the ribbons run top to bottom, so they fill it. */
        stageGroup.rotation.y = camera.aspect < 1 ? Math.PI / 2 : 0;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(host);

      let raf = 0;
      let t0 = performance.now();
      const frame = (now: number) => {
        shape((now - t0) / 1000);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      const onVisibility = () => {
        cancelAnimationFrame(raf);
        if (document.hidden) return;
        t0 = performance.now() - 7000;
        raf = requestAnimationFrame(frame);
      };

      if (reduced) {
        shape(8);
        renderer.render(scene, camera);
      } else {
        raf = requestAnimationFrame(frame);
        document.addEventListener("visibilitychange", onVisibility);
      }
      host.dataset.ready = "true";

      cleanup = () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        ribbons.forEach(mesh => mesh.geometry.dispose());
        materials.forEach(m => m.dispose());
        scene.environment?.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        delete host.dataset.ready;
      };
      if (disposed) cleanup();
    };

    const schedule = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const timer = schedule ? schedule(() => { void start().catch(() => undefined); }, { timeout: 1500 }) : window.setTimeout(() => { void start().catch(() => undefined); }, 400);

    return () => {
      disposed = true;
      if (schedule) (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(timer);
      else window.clearTimeout(timer);
      cleanup?.();
    };
  }, [reduced]);

  return <div ref={hostRef} className="weave-backdrop" aria-hidden="true" data-guide-ignore="خلفية زخرفية لا تحتوي أي عنصر تفاعلي" />;
}

/**
 * ── مشهد نبض القاعات (three.js) ──────────────────────────────────────────────
 *
 * كائنٌ أمريّ يملك المشهد والكاميرا وحلقة الرسم، وتقوده الواجهة بثلاث رسائل:
 * «هذه ألوان القاعات الآن» (setVisuals)، و«انقل هذه الشعب» (fly)، و«أظهر مبنى
 * الجار» (setNeighbour). لا يعرف شيئاً عن الجدول ولا يكتب شيئاً.
 *
 * يُحمَّل كسولاً مع الميزة كلها، ويُفرغ كل ما أنشأه على الـGPU عند الإغلاق.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FLOOR_H, HALL_D, HALL_H, HALL_W, type PulseLayout } from "../../utils/hallPulse";

export interface HallVisual {
  color: number;
  /** ارتفاع «منسوب» الطلبة داخل القاعة: 0 فارغة، 1 ملأى، وفوق 1 تفيض. */
  level: number;
  occupied: boolean;
  pulse?: boolean;
  dim?: boolean;
  /** إطارٌ أخضر يتنفّس: قاعةٌ فارغة تصلح (أين أضع شعبة؟ / قاعات الجار). */
  glow?: boolean;
  /** قاعةٌ في معاينة النقل. */
  ghost?: boolean;
  label: string;
  showLabel?: boolean;
}

export interface FlightPair { from: string; to: string; color: number; delay?: number }

interface RoomRig {
  key: string;
  group: THREE.Group;
  shell: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  tag: HTMLDivElement;
  target: HallVisual;
  level: number;
  color: THREE.Color;
  base: THREE.Vector3;
  flashAt: number;
}

const GLASS = new THREE.Color(0xcfe9df);
const BRASS = new THREE.Color(0xe2bd76);
const CALM = new THREE.Color(0x4fd3a1);
const EDGE = new THREE.Color(0x7fb3a3);

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, "rgba(64,140,120,0.55)");
  r.addColorStop(0.55, "rgba(30,80,70,0.28)");
  r.addColorStop(1, "rgba(10,30,26,0)");
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PulseScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600);
  private rooms = new Map<string, RoomRig>();
  private nbRooms = new Map<string, RoomRig>();
  private nbGroup = new THREE.Group();
  private nbAlpha = 0;
  private nbWanted = 0;
  private nbLayout: PulseLayout | null = null;
  private buildingTags: Array<{ el: HTMLDivElement; pos: THREE.Vector3 }> = [];
  private nbBuildingTags: Array<{ el: HTMLDivElement; pos: THREE.Vector3 }> = [];
  private disposables: Array<{ dispose: () => void }> = [];
  private shellGeo: THREE.BufferGeometry;
  private fillGeo: THREE.BufferGeometry;
  private edgeGeo: THREE.BufferGeometry;
  private ghostGeo: THREE.BufferGeometry;
  private flights: Array<{ curve: THREE.QuadraticBezierCurve3; line: THREE.Line; mesh: THREE.Mesh; start: number; end: number; color: THREE.Color; to: string }> = [];
  private hold = new Map<string, number>();
  private raf = 0;
  private last = performance.now();
  private az = 0.38; private pol = 1.08; private radius = 40;
  private azT = 0.38; private polT = 1.08; private radiusT = 40;
  private target = new THREE.Vector3(); private targetT = new THREE.Vector3();
  private fitRadius = 40; private home = new THREE.Vector3();
  private drag: { x: number; y: number; moved: number; id: number } | null = null;
  private pinch: { d: number; r: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private hovered: string | null = null;
  private selected: string | null = null;
  private W = 1; private H = 1;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visible = true;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private v3 = new THREE.Vector3();
  private tmp = new THREE.Color();
  private disposed = false;
  private sized = false;
  private homePol = 1.08;

  constructor(private opts: {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    labels: HTMLElement;
    layout: PulseLayout;
    reduced: boolean;
    /** الهاتف: المباني في عمود، والكاميرا من أعلى ليظهر كل مبنى. */
    topDown?: boolean;
    onPick: (key: string | null, neighbour: boolean) => void;
    onHover?: (key: string | null) => void;
  }) {
    const renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.Fog(0x0b1f1b, 70, 220);
    this.scene.add(new THREE.HemisphereLight(0xe4f6ee, 0x0b1d19, 1.15));
    const key = new THREE.DirectionalLight(0xfff4e2, 1.25);
    key.position.set(-14, 26, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd6ff, 0.45);
    rim.position.set(18, 10, -20);
    this.scene.add(rim);

    this.shellGeo = new RoundedBoxGeometry(HALL_W, HALL_H, HALL_D, 3, 0.16);
    this.fillGeo = new RoundedBoxGeometry(HALL_W * 0.86, 1, HALL_D * 0.86, 2, 0.1);
    this.fillGeo.translate(0, 0.5, 0);
    this.edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(HALL_W * 0.985, HALL_H * 0.985, HALL_D * 0.985));
    this.ghostGeo = new RoundedBoxGeometry(HALL_W * 0.78, HALL_H * 0.72, HALL_D * 0.78, 2, 0.12);
    this.disposables.push(this.shellGeo, this.fillGeo, this.edgeGeo, this.ghostGeo);

    this.build(opts.layout);
    this.scene.add(this.nbGroup);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.host);
    this.io = new IntersectionObserver(entries => { this.visible = entries.some(e => e.isIntersecting); if (this.visible) this.kick(); });
    this.io.observe(opts.host);
    document.addEventListener("visibilitychange", this.onVisibility);

    const c = opts.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onCancel);
    c.addEventListener("pointerleave", this.onLeave);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("dblclick", this.onDouble);
    this.kick();
  }

  /* ── البناء ─────────────────────────────────────────────────────────────── */
  private build(layout: PulseLayout) {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(layout.width, layout.depth) * 0.9 + 18, 72),
      new THREE.MeshStandardMaterial({ color: 0x143a33, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(layout.cx, -0.16, layout.cz);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const haloTex = groundTexture();
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.scale.setScalar(Math.max(layout.width, layout.depth) * 1.5 + 14);
    halo.position.set(layout.cx, -0.14, layout.cz);
    this.scene.add(halo);
    this.disposables.push(ground.geometry, ground.material as THREE.Material, halo.geometry, halo.material as THREE.Material, haloTex);
    this.buildBlock(layout, this.scene, this.rooms, this.buildingTags, false);
    this.home.set(layout.cx, Math.min(layout.height, 6) * 0.1 - 0.8, layout.cz);
    this.target.copy(this.home); this.targetT.copy(this.home);
  }

  private buildBlock(layout: PulseLayout, parent: THREE.Object3D, into: Map<string, RoomRig>, tags: Array<{ el: HTMLDivElement; pos: THREE.Vector3 }>, neighbour: boolean) {
    const slabMat = new THREE.MeshStandardMaterial({ color: neighbour ? 0x24473f : 0x1d4a41, roughness: 0.85, metalness: 0.05, transparent: neighbour, opacity: neighbour ? 0 : 1 });
    this.disposables.push(slabMat);
    for (const b of layout.buildings) {
      const slabGeo = new RoundedBoxGeometry(b.w + 0.5, 0.16, b.d + 0.5, 2, 0.07);
      this.disposables.push(slabGeo);
      for (let f = 0; f < b.floors; f++) {
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(b.cx, f * FLOOR_H - 0.06, b.cz);
        slab.receiveShadow = true; slab.castShadow = !neighbour;
        parent.add(slab);
      }
      const el = document.createElement("div");
      el.className = `hp-tag hp-tag-building${neighbour ? " is-neighbour" : ""}`;
      el.textContent = b.label;
      this.opts.labels.appendChild(el);
      /* اسم المبنى على عتبته الأمامية فوق الأرض، لا فوق سطحه حيث يغطّي مبنى خلفه. */
      tags.push({ el, pos: new THREE.Vector3(b.cx, -0.1, b.cz + b.d / 2 + 0.75) });
    }
    for (const spot of layout.spots.values()) {
      const group = new THREE.Group();
      group.position.set(spot.x, spot.y, spot.z);
      const shell = new THREE.Mesh(this.shellGeo, new THREE.MeshPhysicalMaterial({
        color: GLASS, roughness: 0.32, metalness: 0, transmission: 0, transparent: true, opacity: neighbour ? 0 : 0.16,
        clearcoat: 0.6, clearcoatRoughness: 0.4, depthWrite: false,
      }));
      const fill = new THREE.Mesh(this.fillGeo, new THREE.MeshStandardMaterial({ color: CALM, roughness: 0.45, metalness: 0.05, emissive: CALM, emissiveIntensity: 0.25, transparent: true, opacity: 0 }));
      fill.position.y = -HALL_H * 0.43;
      fill.scale.y = 0.001;
      fill.castShadow = !neighbour;
      const edges = new THREE.LineSegments(this.edgeGeo, new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: neighbour ? 0 : 0.55 }));
      shell.userData.key = spot.key; shell.userData.neighbour = neighbour;
      group.add(fill, shell, edges);
      parent.add(group);
      const tag = document.createElement("div");
      tag.className = `hp-tag${neighbour ? " is-neighbour" : ""}`;
      tag.hidden = true;
      this.opts.labels.appendChild(tag);
      into.set(spot.key, {
        key: spot.key, group, shell, fill, edges, tag,
        target: { color: 0xcfe9df, level: 0, occupied: false, label: "" },
        level: 0, color: new THREE.Color(GLASS), base: group.position.clone(), flashAt: 0,
      });
    }
  }

  /* ── الحالة ────────────────────────────────────────────────────────────── */
  setVisuals(visuals: Map<string, HallVisual>, selected: string | null) {
    for (const [key, rig] of this.rooms) {
      const v = visuals.get(key);
      if (v) rig.target = v;
      if (rig.tag.textContent !== rig.target.label) rig.tag.textContent = rig.target.label;
    }
    if (selected !== this.selected) this.selected = selected;
    this.kick();
  }

  setNeighbour(layout: PulseLayout | null, visuals: Map<string, HallVisual> | null) {
    if (layout && layout !== this.nbLayout) {
      this.clearNeighbour();
      this.nbLayout = layout;
      this.buildBlock(layout, this.nbGroup, this.nbRooms, this.nbBuildingTags, true);
    }
    this.nbWanted = layout ? 1 : 0;
    if (visuals) for (const [key, rig] of this.nbRooms) {
      const v = visuals.get(key);
      if (v) { rig.target = v; if (rig.tag.textContent !== v.label) rig.tag.textContent = v.label; }
    }
    this.kick();
  }

  private clearNeighbour() {
    for (const rig of this.nbRooms.values()) { rig.shell.material.dispose(); rig.fill.material.dispose(); rig.edges.material.dispose(); rig.tag.remove(); }
    this.nbRooms.clear();
    this.nbBuildingTags.forEach(t => t.el.remove());
    this.nbBuildingTags = [];
    this.nbGroup.clear();
    this.nbLayout = null;
  }

  /** يقترب بلطف من قاعة ويبقيها في الوسط. */
  focus(key: string | null) {
    const rig = key ? this.rooms.get(key) || this.nbRooms.get(key) : null;
    if (!rig) return;
    const p = rig.group.getWorldPosition(new THREE.Vector3());
    /* انحيازٌ لطيف نحو القاعة دون تقريبٍ يُخرج بقية المباني من الإطار. */
    this.targetT.lerpVectors(this.home, p, 0.3);
    this.kick();
  }

  resetView() {
    this.azT = this.homePol < 1 ? 0.22 : 0.38; this.polT = this.homePol; this.radiusT = this.fitRadius;
    this.targetT.copy(this.home);
    if (this.nbWanted && this.nbLayout) this.includeNeighbour();
    this.kick();
  }

  private includeNeighbour() {
    if (!this.nbLayout) return;
    const minX = Math.min(this.opts.layout.cx - this.opts.layout.width / 2, this.nbLayout.cx - this.nbLayout.width / 2);
    const maxX = Math.max(this.opts.layout.cx + this.opts.layout.width / 2, this.nbLayout.cx + this.nbLayout.width / 2);
    this.targetT.set((minX + maxX) / 2, this.home.y, this.home.z);
    this.radiusT = this.radiusFor(maxX - minX, Math.max(this.opts.layout.depth, this.nbLayout.depth), this.opts.layout.height);
  }

  showNeighbourView(on: boolean) {
    if (on) this.includeNeighbour();
    else { this.targetT.copy(this.home); this.radiusT = this.fitRadius; }
    this.kick();
  }

  fly(pairs: FlightPair[]) {
    if (this.opts.reduced || !pairs.length) return;
    const t0 = performance.now();
    pairs.forEach((p, k) => {
      const a = this.rooms.get(p.from), b = this.rooms.get(p.to) || this.nbRooms.get(p.to);
      if (!a || !b) return;
      const from = a.group.getWorldPosition(new THREE.Vector3());
      const to = b.group.getWorldPosition(new THREE.Vector3());
      const dist = from.distanceTo(to);
      const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 2.4 + dist * 0.16, 1.2));
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(56)),
        new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0, depthWrite: false }));
      const mesh = new THREE.Mesh(this.ghostGeo, new THREE.MeshStandardMaterial({ color: BRASS, emissive: BRASS, emissiveIntensity: 0.8, transparent: true, opacity: 0.94, depthWrite: false }));
      mesh.visible = false;
      this.scene.add(line, mesh);
      const start = t0 + ((p.delay || 0) + k * 0.12) * 1000, end = start + 1150;
      this.hold.set(p.from, start);
      this.hold.set(p.to, Math.max(this.hold.get(p.to) || 0, end));
      this.flights.push({ curve, line, mesh, start, end, color: new THREE.Color(p.color), to: p.to });
    });
    this.kick();
  }

  /* ── الكاميرا والإدخال ─────────────────────────────────────────────────── */
  private radiusFor(width: number, depth: number, height: number) {
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const span = Math.max(width + 4, depth * 0.8 + 4);
    const byW = span / 2 / Math.tan(hfov / 2);
    /* الشاشة الطويلة تنظر من أعلى (pol أصغر)، فيدخل عمق المباني في الارتفاع كله. */
    const byH = (height + depth * (this.homePol < 1 ? 0.95 : 0.5) + 4) / 2 / Math.tan(vfov / 2);
    return Math.max(14, Math.max(byW, byH) * 1.12);
  }

  private resize() {
    const r = this.opts.host.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    const L = this.opts.layout;
    const first = !this.sized;
    if (first && (this.opts.topDown || this.camera.aspect < 0.9)) { this.homePol = 0.72; this.pol = this.polT = 0.72; this.az = this.azT = 0.22; }
    const ratio = this.radiusT / this.fitRadius;
    this.fitRadius = this.radiusFor(L.width, L.depth, L.height);
    /* أول قياسٍ يضع الكاميرا مباشرةً؛ وما بعده يحفظ نسبة التقريب التي اختارها القارئ. */
    this.radiusT = first ? this.fitRadius : this.fitRadius * ratio;
    if (first) { this.radius = this.radiusT; this.sized = true; }
    if (this.nbWanted) this.includeNeighbour();
    this.kick();
  }

  private pick(clientX: number, clientY: number): { key: string; neighbour: boolean } | null {
    const r = this.opts.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const meshes: THREE.Object3D[] = [...this.rooms.values()].map(x => x.shell);
    if (this.nbAlpha > 0.5) this.nbRooms.forEach(x => meshes.push(x.shell));
    const hit = this.ray.intersectObjects(meshes, false)[0];
    return hit ? { key: hit.object.userData.key, neighbour: Boolean(hit.object.userData.neighbour) } : null;
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.radiusT };
      this.drag = null;
    } else this.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  };
  private onMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.radiusT = THREE.MathUtils.clamp(this.pinch.r * (this.pinch.d / Math.max(1, d)), this.fitRadius * 0.45, this.fitRadius * 1.8);
      this.kick();
      return;
    }
    if (this.drag && this.drag.id === e.pointerId) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (this.drag.moved > 6) {
        if (e.pointerType !== "mouse") e.preventDefault();
        this.opts.canvas.setPointerCapture?.(e.pointerId);
        this.azT = THREE.MathUtils.clamp(this.azT - dx * 0.0065, -1.25, 1.25);
        this.polT = THREE.MathUtils.clamp(this.polT - dy * 0.005, 0.62, 1.42);
        this.kick();
      }
      return;
    }
    if (e.pointerType === "mouse") {
      const hit = this.pick(e.clientX, e.clientY);
      const key = hit ? hit.key : null;
      if (key !== this.hovered) {
        this.hovered = key;
        this.opts.canvas.style.cursor = key ? "pointer" : "grab";
        this.opts.onHover?.(key);
        this.kick();
      }
    }
  };
  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
    const d = this.drag; this.drag = null;
    if (!d || d.moved > 8) return;
    const hit = this.pick(e.clientX, e.clientY);
    this.opts.onPick(hit ? hit.key : null, hit ? hit.neighbour : false);
  };
  private onCancel = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.drag = null; this.pinch = null; };
  private onLeave = () => { if (this.hovered) { this.hovered = null; this.opts.onHover?.(null); this.kick(); } };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.radiusT = THREE.MathUtils.clamp(this.radiusT * Math.exp(e.deltaY * 0.0012), this.fitRadius * 0.45, this.fitRadius * 1.8);
    this.kick();
  };
  private onDouble = () => this.resetView();
  private onVisibility = () => { if (!document.hidden) this.kick(); };

  /** يوقظ حلقة الرسم؛ وتنام وحدها حين يسكن كل شيء. */
  kick() {
    if (this.disposed || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  rotateBy(dAz: number, dPol: number) {
    this.azT = THREE.MathUtils.clamp(this.azT + dAz, -1.25, 1.25);
    this.polT = THREE.MathUtils.clamp(this.polT + dPol, 0.62, 1.42);
    this.kick();
  }
  zoomBy(f: number) {
    this.radiusT = THREE.MathUtils.clamp(this.radiusT * f, this.fitRadius * 0.45, this.fitRadius * 1.8);
    this.kick();
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const reduced = this.opts.reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let busy = false;

    /* الكاميرا: تخميدٌ ناعم نحو الهدف. */
    this.az += (this.azT - this.az) * k; this.pol += (this.polT - this.pol) * k; this.radius += (this.radiusT - this.radius) * k;
    this.target.lerp(this.targetT, k);
    if (Math.abs(this.azT - this.az) + Math.abs(this.polT - this.pol) + Math.abs(this.radiusT - this.radius) * 0.05 + this.target.distanceTo(this.targetT) > 0.002) busy = true;
    const s = Math.sin(this.pol);
    this.camera.position.set(this.target.x + this.radius * s * Math.sin(this.az), this.target.y + this.radius * Math.cos(this.pol), this.target.z + this.radius * s * Math.cos(this.az));
    this.camera.lookAt(this.target);

    this.nbAlpha += (this.nbWanted - this.nbAlpha) * (reduced ? 1 : 1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.nbWanted - this.nbAlpha) > 0.003) busy = true;
    this.nbGroup.visible = this.nbAlpha > 0.01;

    const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 340);
    const tick = (rig: RoomRig, fade: number, neighbour: boolean) => {
      const v = rig.target, held = (this.hold.get(rig.key) || 0) > now && !neighbour;
      const sel = rig.key === this.selected, hov = rig.key === this.hovered;
      const wantLevel = held ? rig.level : (v.occupied ? Math.min(1.12, Math.max(0.08, v.level)) : 0);
      const ck = reduced ? 1 : 1 - Math.exp(-dt * 6);
      if (!held) {
        /* القاعة التي تفرغ يهبط منسوبها بلونه الأخير، لا يبيضّ. */
        if (v.occupied) { this.tmp.setHex(v.color); rig.color.lerp(this.tmp, ck); }
        rig.level += (wantLevel - rig.level) * ck;
        if (Math.abs(wantLevel - rig.level) > 0.002) busy = true;
      }
      const fillMat = rig.fill.material;
      fillMat.color.copy(rig.color);
      fillMat.emissive.copy(rig.color);
      const pulse = v.pulse ? breathe : 0;
      fillMat.emissiveIntensity = 0.18 + pulse * 0.55 + (sel ? 0.25 : 0) + (hov ? 0.12 : 0);
      fillMat.opacity = (v.dim ? 0.35 : 0.95) * fade * (rig.level > 0.01 ? 1 : 0);
      rig.fill.scale.y = Math.max(0.001, rig.level * HALL_H * 0.86);
      const shell = rig.shell.material;
      shell.color.copy(v.occupied ? rig.color : (v.glow ? CALM : GLASS));
      shell.opacity = fade * (v.ghost ? 0.5 : v.glow ? 0.16 + 0.22 * breathe : v.occupied ? (v.dim ? 0.1 : 0.2) : v.dim ? 0.05 : 0.12);
      const flash = now - rig.flashAt < 700;
      const ec = flash ? 0xffffff : sel ? BRASS.getHex() : v.glow ? CALM.getHex() : hov ? 0xe9f5f0 : EDGE.getHex();
      rig.edges.material.color.setHex(ec);
      rig.edges.material.opacity = fade * (sel || flash ? 1 : v.glow ? 0.55 + 0.45 * breathe : hov ? 0.9 : v.dim ? 0.18 : 0.5);
      /* الاختيار يرفع القاعة قليلاً، كمن يُخرج درجاً. */
      const lift = sel ? 0.22 : hov ? 0.08 : 0;
      const y = rig.base.y + lift;
      if (Math.abs(rig.group.position.y - y) > 0.001) { rig.group.position.y += (y - rig.group.position.y) * ck; busy = true; }
      if (v.pulse || v.glow || flash) busy = true;
    };
    for (const rig of this.rooms.values()) tick(rig, 1, false);
    for (const rig of this.nbRooms.values()) tick(rig, this.nbAlpha, true);

    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i], p = (now - f.start) / (f.end - f.start);
      busy = true;
      const lm = f.line.material as THREE.LineBasicMaterial, mm = f.mesh.material as THREE.MeshStandardMaterial;
      if (p < 0) { f.mesh.visible = false; lm.opacity = Math.max(0, 0.5 + p * 2) * 0.6; continue; }
      if (p <= 1) {
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        f.mesh.visible = true;
        f.mesh.position.copy(f.curve.getPoint(e));
        const sc = 0.72 + 0.28 * Math.sin(Math.PI * p);
        f.mesh.scale.setScalar(sc);
        this.tmp.copy(BRASS).lerp(f.color, e);
        mm.color.copy(this.tmp); mm.emissive.copy(this.tmp);
        lm.opacity = 0.85;
      } else {
        if (f.mesh.parent) {
          this.scene.remove(f.mesh); mm.dispose();
          const rig = this.rooms.get(f.to) || this.nbRooms.get(f.to);
          if (rig) rig.flashAt = now;
        }
        const fade = 1 - (p - 1) * 1.6;
        lm.opacity = Math.max(0, 0.85 * fade);
        if (fade <= 0) { this.scene.remove(f.line); f.line.geometry.dispose(); lm.dispose(); this.flights.splice(i, 1); }
      }
    }

    /* اللافتات: إسقاطٌ من العالم إلى الشاشة. */
    const place = (el: HTMLElement, pos: THREE.Vector3, centred = false) => {
      this.v3.copy(pos).project(this.camera);
      const x = (this.v3.x * 0.5 + 0.5) * this.W, y = (-this.v3.y * 0.5 + 0.5) * this.H;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${centred ? "-50%" : "-100%"})`;
      return this.v3.z < 1;
    };
    const tagFor = (rig: RoomRig, fade: number) => {
      const v = rig.target, sel = rig.key === this.selected, hov = rig.key === this.hovered;
      /* على الشاشة الضيّقة: لافتة المختارة والمضغوطة والمضيئة وحدها. */
      const roomy = this.W >= 560;
      const show = fade > 0.6 && (sel || hov || (Boolean(v.showLabel) && (roomy || Boolean(v.pulse || v.glow))));
      rig.tag.hidden = !show;
      if (!show) return;
      rig.tag.classList.toggle("is-selected", sel);
      rig.tag.classList.toggle("is-glow", Boolean(v.glow));
      rig.group.getWorldPosition(this.v3);
      /* اللافتة على الواجهة الأمامية للقاعة لا فوق سقفها: فلا تغطّي لافتةُ الأرضي قاعةَ الطابق الذي فوقه. */
      this.v3.y -= HALL_H * 0.08;
      this.v3.z += HALL_D / 2 + 0.04;
      place(rig.tag, this.v3.clone(), true);
    };
    this.rooms.forEach(rig => tagFor(rig, 1));
    this.nbRooms.forEach(rig => tagFor(rig, this.nbAlpha));
    this.buildingTags.forEach(t => place(t.el, t.pos, true));
    this.nbBuildingTags.forEach(t => { t.el.hidden = this.nbAlpha < 0.6; if (!t.el.hidden) place(t.el, t.pos, true); });

    this.renderer.render(this.scene, this.camera);
    if ((busy || this.drag || this.pinch) && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect(); this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    const c = this.opts.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("dblclick", this.onDouble);
    for (const f of this.flights) { f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose(); (f.mesh.material as THREE.Material).dispose(); }
    this.flights = [];
    this.clearNeighbour();
    for (const rig of this.rooms.values()) { rig.shell.material.dispose(); rig.fill.material.dispose(); rig.edges.material.dispose(); rig.tag.remove(); }
    this.rooms.clear();
    this.buildingTags.forEach(t => t.el.remove());
    this.disposables.forEach(d => d.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/** هل يرسم هذا الجهاز WebGL أصلاً؟ */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

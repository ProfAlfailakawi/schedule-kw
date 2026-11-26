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
import { HallInterior, type InteriorData } from "./pulseInterior";

export type { InteriorData } from "./pulseInterior";

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
  /** طبقة التسجيل: لونٌ هادئ يتنفّس في الإطار والوهج (ثابتٌ مع تقليل الحركة) — فيها فرقٌ مع ملف التسجيل. */
  mark?: number;
  /** شارةٌ بجانب اللافتة: عدد الفروق. */
  badge?: string;
  label: string;
  showLabel?: boolean;
}

export interface FlightPair { from: string; to: string; color: number; delay?: number }

/** علامة مسار التنقّل: عند محطةٍ (hop = null) أو بين محطتين بنسبةٍ من الطريق. */
export interface PathMarker { stop: number; hop: number | null; progress: number }

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
  /** نافذةٌ أمامية تضيء حين تُشغل القاعة. */
  win: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** وهجٌ رخيص (sprite إضافي) فوق المضغوطة والمختارة، بدل معالجةٍ لاحقة ثقيلة. */
  halo: THREE.Sprite;
  building: string;
  floorIndex: number;
  /** الطوابق المنفرجة: ارتفاعٌ إضافي وشفافية للطوابق فوق الطابق المختار. */
  liftY: number;
  liftWant: number;
  fadeK: number;
  fadeWant: number;
  /** شفافية النافذة والوهج بعد التخفيف (تُحفظ هنا لا في المادة: المادة تُرسم بحالتين عند «قبل وبعد»). */
  winO: number;
  haloO: number;
  /** «قبل وبعد»: حالة القاعة على الجانب الآخر من الفاصل، بتخفيفها الخاص. */
  alt: HallVisual | null;
  altLevel: number;
  altColor: THREE.Color;
  altWinO: number;
  altHaloO: number;
}

interface SlabRig {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; building: string; floorIndex: number; baseY: number; liftY: number; fadeK: number;
  /** «ضمّ المساء»: 1 طابقٌ يبقى مضاءً، و-1 طابقٌ ينطفئ، و0 كما هو؛ وmoodK تخفيفه. */
  mood: number; moodK: number;
}
/** «ضمّ المساء»: الطابق الذي يبقى مضاءً يتوهّج، والذي ينطفئ يعتم. المفتاح «المبنى|ترتيب الطابق». */
export type FloorMood = Map<string, "off" | "keep">;

/** نسبة ما تملؤه المباني من اللوحة عند الإطار الآلي. */
const FRAME_FILL = 0.74;

const GLASS = new THREE.Color(0xcfe9df);
const BRASS = new THREE.Color(0xe2bd76);
const CALM = new THREE.Color(0x4fd3a1);
const EDGE = new THREE.Color(0x7fb3a3);
const WINDOW_WARM = new THREE.Color(0xffe2a8);
const PATH_GLOW = new THREE.Color(0x7fe0ff);
const SLAB = new THREE.Color(0x1d4a41), SLAB_KEEP = new THREE.Color(0x2f7f6a), SLAB_OFF = new THREE.Color(0x0b1a17);

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.25, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** ألوان الشمس على مدار اليوم الدراسي: صباحٌ دافئ، وظهرٌ أبيض، ومساءٌ برتقالي. */
const SUN_MORNING = new THREE.Color(0xffd2a0), SUN_NOON = new THREE.Color(0xfff6e6), SUN_EVENING = new THREE.Color(0xff9a62);
const SKY_MORNING = new THREE.Color(0xd8ecff), SKY_NOON = new THREE.Color(0xeefaf4), SKY_EVENING = new THREE.Color(0xffc9a6);

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
  private winGeo: THREE.BufferGeometry;
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
  /** لون طبقة التسجيل للقاعة التي تُرسم الآن (لا يُنشأ لونٌ في كل إطار). */
  private markColor = new THREE.Color();
  private disposed = false;
  private sized = false;
  private slabs: SlabRig[] = [];
  private keyLight!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private glowTex!: THREE.CanvasTexture;
  private sunT = 0.3;
  private sunWant = 0.3;
  private explodeOf: { building: string; floor: number } | null = null;
  private pathGroup = new THREE.Group();
  private pathCurves: Array<THREE.Curve<THREE.Vector3> | null> = [];
  private pathStops: THREE.Vector3[] = [];
  private pathMarker: THREE.Mesh | null = null;
  private pathHalo: THREE.Sprite | null = null;
  private pathMats: THREE.Material[] = [];
  private pathGeos: THREE.BufferGeometry[] = [];
  private markerState: PathMarker | null = null;
  private markerPos = new THREE.Vector3();
  private markerHas = false;
  private trees: THREE.InstancedMesh | null = null;
  private lastInput = 0;
  private homePol = 1.08;
  /** «قبل وبعد»: موضع الفاصل 0–1 من يسار اللوحة؛ يساره «بعد» ويمينه «قبل». null = لا فاصل. */
  private split: number | null = null;
  /** «ضمّ المساء»: لافتة «يبقى مضاءً» على كل طابقٍ يبقى، ومزاج الطوابق مفعّل أم لا. */
  private floorTags = new Map<string, { el: HTMLDivElement; pos: THREE.Vector3 }>();
  private moodOn = false;
  /** «اليوم يمرّ أمامك»: الكاميرا تدور ببطء مع الشمس ما لم يمسك القارئ المشهد. */
  private cineOn = false;
  private cineFree = false;
  private spot = false;
  private lastTap: { key: string; t: number; x: number; y: number } | null = null;
  /** «القاعة من الداخل». */
  private interior: HallInterior | null = null;
  private mode: "campus" | "entering" | "inside" | "leaving" = "campus";
  private modeAt = -1e9;
  private pendingInterior: InteriorData | null = null;
  private savedView: { az: number; pol: number; radius: number; target: THREE.Vector3 } | null = null;
  private veil: HTMLDivElement;

  constructor(private opts: {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    labels: HTMLElement;
    layout: PulseLayout;
    reduced: boolean;
    /** الهاتف: المباني في عمود، والكاميرا من أعلى ليظهر كل مبنى. */
    topDown?: boolean;
    /** حركةٌ محيطة هادئة (دورانٌ بطيء جداً) على الشاشات الواسعة، لا مع تقليل الحركة. */
    ambient?: boolean;
    onPick: (key: string | null, neighbour: boolean) => void;
    onHover?: (key: string | null) => void;
    /** ضغطتان على قاعة: ادخلها. */
    onEnter?: (key: string) => void;
    /** ضغطتان داخل القاعة: اخرج. */
    onLeave?: () => void;
  }) {
    const renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.Fog(0x0b1f1b, 70, 220);
    this.hemi = new THREE.HemisphereLight(0xe4f6ee, 0x0b1d19, 1.1);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xfff4e2, 1.25);
    key.position.set(-14, 26, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(opts.topDown ? 1024 : 2048, opts.topDown ? 1024 : 2048);
    key.shadow.radius = 8;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.keyLight = key;
    this.scene.add(key, key.target);
    this.glowTex = glowTexture();
    this.disposables.push(this.glowTex);
    const rim = new THREE.DirectionalLight(0x8fd6ff, 0.45);
    rim.position.set(18, 10, -20);
    this.scene.add(rim);

    this.shellGeo = new RoundedBoxGeometry(HALL_W, HALL_H, HALL_D, 3, 0.16);
    this.fillGeo = new RoundedBoxGeometry(HALL_W * 0.86, 1, HALL_D * 0.86, 2, 0.1);
    this.fillGeo.translate(0, 0.5, 0);
    this.edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(HALL_W * 0.985, HALL_H * 0.985, HALL_D * 0.985));
    this.ghostGeo = new RoundedBoxGeometry(HALL_W * 0.78, HALL_H * 0.72, HALL_D * 0.78, 2, 0.12);
    this.winGeo = new THREE.PlaneGeometry(HALL_W * 0.72, HALL_H * 0.3);
    this.disposables.push(this.shellGeo, this.fillGeo, this.edgeGeo, this.ghostGeo, this.winGeo);

    /* ستارٌ يعتم لحظة العبور إلى داخل القاعة والخروج منها. */
    this.veil = document.createElement("div");
    this.veil.className = "hp-veil";
    this.veil.setAttribute("aria-hidden", "true");
    opts.host.appendChild(this.veil);
    this.build(opts.layout);
    this.scene.add(this.nbGroup, this.pathGroup);

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
    /* منظرٌ هادئ: أشجارٌ قليلة منخفضة الكلفة (InstancedMesh) حول المباني. */
    const treeGeo = new THREE.ConeGeometry(0.55, 1.5, 7);
    treeGeo.translate(0, 0.75, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f58, roughness: 0.9, flatShading: true });
    const span = Math.max(layout.width, layout.depth) * 0.5 + 5;
    const count = Math.min(46, 18 + Math.round(span * 1.2));
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    let seed = 17;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.25;
      const r = span + 1.5 + rnd() * 5;
      const h = 0.7 + rnd() * 0.9;
      pos.set(layout.cx + Math.cos(a) * r * 1.05, -0.16, layout.cz + Math.sin(a) * r * 0.85);
      sc.set(h, h * (0.9 + rnd() * 0.5), h);
      m4.compose(pos, q, sc);
      trees.setMatrixAt(i, m4);
    }
    trees.castShadow = true; trees.receiveShadow = true;
    this.trees = trees;
    this.scene.add(trees);
    this.disposables.push(treeGeo, treeMat);
    const sh = this.keyLight.shadow.camera as THREE.OrthographicCamera;
    const ext = span + 8;
    sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 1; sh.far = 160;
    sh.updateProjectionMatrix();
    this.keyLight.target.position.set(layout.cx, 0, layout.cz);
    this.buildBlock(layout, this.scene, this.rooms, this.buildingTags, false);
    /* الهدف في منتصف حجم المباني: فيقع الإطار الآلي عليها لا على الأرض أمامها. */
    this.home.set(layout.cx, layout.height * 0.4, layout.cz);
    this.target.copy(this.home); this.targetT.copy(this.home);
  }

  private buildBlock(layout: PulseLayout, parent: THREE.Object3D, into: Map<string, RoomRig>, tags: Array<{ el: HTMLDivElement; pos: THREE.Vector3 }>, neighbour: boolean) {
    const slabMat = new THREE.MeshStandardMaterial({ color: neighbour ? 0x24473f : 0x1d4a41, roughness: 0.85, metalness: 0.05, transparent: neighbour, opacity: neighbour ? 0 : 1 });
    this.disposables.push(slabMat);
    for (const b of layout.buildings) {
      const slabGeo = new RoundedBoxGeometry(b.w + 0.5, 0.16, b.d + 0.5, 2, 0.07);
      this.disposables.push(slabGeo);
      for (let f = 0; f < b.floors; f++) {
        const mat = neighbour ? slabMat : slabMat.clone();
        if (!neighbour) { mat.transparent = true; this.disposables.push(mat); }
        const slab = new THREE.Mesh(slabGeo, mat);
        slab.position.set(b.cx, f * FLOOR_H - 0.06, b.cz);
        slab.receiveShadow = true; slab.castShadow = !neighbour;
        parent.add(slab);
        if (!neighbour) this.slabs.push({ mesh: slab, building: b.code, floorIndex: f, baseY: slab.position.y, liftY: 0, fadeK: 1, mood: 0, moodK: 0 });
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
      /* نافذةٌ على الواجهة الأمامية: تضيء دافئةً حين تُشغل القاعة. */
      const win = new THREE.Mesh(this.winGeo, new THREE.MeshBasicMaterial({ color: WINDOW_WARM, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      win.position.set(0, HALL_H * 0.12, HALL_D / 2 + 0.012);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xf0674f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(HALL_W * 2.2, HALL_W * 2.2, 1);
      halo.position.set(0, HALL_H * 0.2, 0);
      group.add(fill, shell, edges, win, halo);
      parent.add(group);
      const tag = document.createElement("div");
      tag.className = `hp-tag${neighbour ? " is-neighbour" : ""}`;
      tag.hidden = true;
      this.opts.labels.appendChild(tag);
      into.set(spot.key, {
        key: spot.key, group, shell, fill, edges, tag, win, halo,
        target: { color: 0xcfe9df, level: 0, occupied: false, label: "" },
        level: 0, color: new THREE.Color(GLASS), base: group.position.clone(), flashAt: 0,
        building: spot.building, floorIndex: spot.floorIndex, liftY: 0, liftWant: 0, fadeK: 1, fadeWant: 1,
        winO: 0, haloO: 0, alt: null, altLevel: 0, altColor: new THREE.Color(GLASS), altWinO: 0, altHaloO: 0,
      });
    }
  }

  /* ── الحالة ────────────────────────────────────────────────────────────── */
  setVisuals(visuals: Map<string, HallVisual>, selected: string | null) {
    for (const [key, rig] of this.rooms) {
      const v = visuals.get(key);
      if (v) rig.target = v;
    }
    if (selected !== this.selected) this.selected = selected;
    this.kick();
  }

  /**
   * «قبل وبعد بسحبة»: حالةٌ ثانية للقاعات تُرسم يمين الفاصل (القاعات كما هي الآن)، والحالة
   * الأساسية يساره (بعد الترتيب) — مشهدٌ واحد يُرسم مرتين بالمقصّ، لا سياق WebGL ثانٍ.
   */
  setCompare(visuals: Map<string, HallVisual> | null, split = 0.5) {
    for (const [key, rig] of this.rooms) {
      const v = visuals ? visuals.get(key) || null : null;
      if (v && !rig.alt) {
        /* أول ظهور: بالحالة كاملةً، لا صعوداً من الفراغ. */
        rig.altLevel = v.occupied ? Math.min(1.12, Math.max(0.08, v.level)) : 0;
        rig.altColor.setHex(v.occupied ? v.color : GLASS.getHex());
        rig.altWinO = v.occupied && !v.dim ? 0.7 : 0;
        rig.altHaloO = 0;
      }
      rig.alt = v;
    }
    this.split = visuals ? THREE.MathUtils.clamp(split, 0, 1) : null;
    this.kick();
  }
  setSplit(split: number) {
    if (this.split == null) return;
    this.split = THREE.MathUtils.clamp(split, 0, 1);
    this.kick();
  }

  /**
   * «ضمّ المساء»: الطوابق التي تنطفئ تعتم، والتي تبقى تتوهّج بلافتة «يبقى مضاءً مساءً».
   * null يعيد الطوابق كما هي. (جانب «الآن» من الفاصل يُرسم بطوابقه المعتادة.)
   */
  setFloorMood(mood: FloorMood | null) {
    this.moodOn = Boolean(mood && mood.size);
    for (const sl of this.slabs) {
      const m = mood?.get(`${sl.building}|${sl.floorIndex}`);
      sl.mood = m === "keep" ? 1 : m === "off" ? -1 : 0;
    }
    const wanted = new Set<string>();
    if (mood) for (const [key, m] of mood) if (m === "keep") wanted.add(key);
    for (const [key, t] of this.floorTags) if (!wanted.has(key)) { t.el.remove(); this.floorTags.delete(key); }
    for (const key of wanted) {
      if (this.floorTags.has(key)) continue;
      const [code, idx] = [key.slice(0, key.lastIndexOf("|")), Number(key.slice(key.lastIndexOf("|") + 1))];
      const b = this.opts.layout.buildings.find(x => x.code === code);
      if (!b) continue;
      const el = document.createElement("div");
      el.className = "hp-tag hp-tag-floor";
      el.textContent = "☾ يبقى مضاءً مساءً";
      this.opts.labels.appendChild(el);
      /* على الحافة الأمامية للطابق، تحت قاعاته: لا تغطّي لافتات القاعات. */
      this.floorTags.set(key, { el, pos: new THREE.Vector3(b.cx, idx * FLOOR_H - 0.1, b.cz + b.d / 2 + 1.05) });
    }
    this.kick();
  }

  /** دوران العرض: 0 أول اليوم و1 آخره؛ null ينهيه ويعيد المنظر. */
  cinema(progress: number | null) {
    if (progress == null) {
      if (this.cineOn && !this.cineFree && !this.spot) this.azT = this.homePol < 1 ? 0.22 : 0.38;
      this.cineOn = false; this.cineFree = false;
      this.kick();
      return;
    }
    if (!this.cineOn) { this.cineOn = true; this.cineFree = false; }
    if (!this.cineFree && !this.opts.reduced && !this.spot) {
      const sweep = this.homePol < 1 ? 0.26 : 0.52;
      this.azT = sweep - 2 * sweep * THREE.MathUtils.clamp(progress, 0, 1);
    }
    this.kick();
  }

  /** يقترب من قاعةٍ بعينها (أشدّ لحظة)، و null يعيد المنظر الكامل. */
  spotlight(key: string | null) {
    const rig = key ? this.rooms.get(key) : null;
    if (!rig) {
      if (this.spot) { this.spot = false; this.targetT.copy(this.home); this.radiusT = this.fitRadius; this.kick(); }
      return;
    }
    if (this.opts.reduced) return;
    this.spot = true;
    this.targetT.lerpVectors(this.home, rig.group.getWorldPosition(new THREE.Vector3()), 0.82);
    this.radiusT = Math.max(this.fitRadius * 0.58, 16);
    this.kick();
  }

  /* ── القاعة من الداخل ─────────────────────────────────────────────────── */
  get inside() { return this.mode === "inside" || this.mode === "entering"; }

  enter(key: string, data: InteriorData) {
    const rig = this.rooms.get(key);
    if (!rig || this.mode === "entering" || this.mode === "inside") { if (this.interior) this.interior.apply(data); return; }
    this.pendingInterior = data;
    this.veil.style.setProperty("--hp-veil-c", `#${data.color.toString(16).padStart(6, "0")}`);
    if (!this.savedView) this.savedView = { az: this.azT, pol: this.polT, radius: this.radiusT, target: this.targetT.clone() };
    this.drag = null; this.pinch = null;
    if (this.opts.reduced) { this.openInterior(); this.mode = "inside"; this.modeAt = -1e9; this.kick(); return; }
    this.mode = "entering"; this.modeAt = performance.now();
    this.targetT.copy(rig.group.getWorldPosition(new THREE.Vector3()));
    this.radiusT = Math.max(3.6, this.fitRadius * 0.14);
    this.kick();
  }

  setInterior(data: InteriorData) {
    this.pendingInterior = data;
    this.interior?.apply(data);
    this.kick();
  }

  leave() {
    if (this.mode === "campus" || this.mode === "leaving") return;
    if (this.mode === "entering" || this.opts.reduced) { this.closeInterior(); this.mode = "campus"; this.modeAt = this.opts.reduced ? -1e9 : performance.now(); this.kick(); return; }
    this.mode = "leaving"; this.modeAt = performance.now();
    this.kick();
  }

  private openInterior() {
    this.interior?.dispose();
    this.interior = new HallInterior(this.pendingInterior!, { labels: this.opts.labels, reduced: this.opts.reduced });
    this.interior.frameFor(this.W / this.H, true);
    this.opts.labels.classList.add("is-inside");
  }

  private closeInterior() {
    this.interior?.dispose();
    this.interior = null;
    this.opts.labels.classList.remove("is-inside");
    const v = this.savedView; this.savedView = null;
    if (v) { this.azT = v.az; this.polT = v.pol; this.radiusT = v.radius; this.targetT.copy(v.target); }
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
    for (const rig of this.nbRooms.values()) { rig.shell.material.dispose(); rig.fill.material.dispose(); rig.edges.material.dispose(); rig.win.material.dispose(); rig.halo.material.dispose(); rig.tag.remove(); }
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
    if (this.interior && this.mode === "inside") { this.interior.reset(); this.kick(); return; }
    this.spot = false;
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
    const depth = Math.max(this.opts.layout.depth, this.nbLayout.depth);
    this.radiusT = this.fitExact(minX, maxX, this.home.z - depth / 2, this.home.z + depth / 2, this.opts.layout.height, this.targetT);
  }

  showNeighbourView(on: boolean) {
    if (on) this.includeNeighbour();
    else { this.targetT.copy(this.home); this.radiusT = this.fitRadius; }
    this.kick();
  }

  /** الشمس تتبع ساعة المشهد: زاويتها ولونها وشدّتها، والسماء معها. */
  setTimeOfDay(minute: number, dayStart: number, dayEnd: number) {
    this.sunWant = THREE.MathUtils.clamp((minute - dayStart) / Math.max(1, dayEnd - dayStart), 0, 1);
    if (this.opts.reduced) this.sunT = this.sunWant;
    this.kick();
  }

  /** الطوابق المنفرجة: ما فوق الطابق المختار من المبنى نفسه يرتفع ويشفّ؛ null يعيدها. */
  explode(building: string | null, floor: number) {
    const next = building == null ? null : { building, floor };
    if (JSON.stringify(next) === JSON.stringify(this.explodeOf)) return;
    this.explodeOf = next;
    for (const rig of this.rooms.values()) {
      const above = next && rig.building === next.building && rig.floorIndex > next.floor;
      rig.liftWant = above ? 1.9 + (rig.floorIndex - next!.floor) * 0.9 : 0;
      rig.fadeWant = above ? 0.12 : 1;
    }
    this.kick();
  }
  get exploded() { return this.explodeOf != null; }

  /** مسار التنقّل: أنبوبٌ متوهّج من قاعة إلى قاعة بترتيب المحاضرات. null يمحوه. */
  setPath(keys: string[] | null) {
    this.clearPath();
    if (!keys || keys.length < 1) { this.kick(); return; }
    const stops = keys.map(key => {
      const rig = this.rooms.get(key);
      const p = rig ? rig.group.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
      p.y += HALL_H * 0.62;
      return p;
    });
    this.pathStops = stops;
    const core = new THREE.MeshBasicMaterial({ color: PATH_GLOW, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.MeshBasicMaterial({ color: PATH_GLOW, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pathMats.push(core, glow);
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i], b = stops[i + 1];
      const d = a.distanceTo(b);
      if (d < 0.05) { this.pathCurves.push(null); continue; }
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4 + d * 0.22, 0));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      this.pathCurves.push(curve);
      const g1 = new THREE.TubeGeometry(curve, 48, 0.07, 8, false);
      const g2 = new THREE.TubeGeometry(curve, 48, 0.22, 8, false);
      this.pathGeos.push(g1, g2);
      this.pathGroup.add(new THREE.Mesh(g1, core), new THREE.Mesh(g2, glow));
    }
    /* حلقةٌ عند كل محطة. */
    const ringGeo = new THREE.TorusGeometry(0.55, 0.05, 8, 40);
    ringGeo.rotateX(Math.PI / 2);
    this.pathGeos.push(ringGeo);
    stops.forEach(p => { const ring = new THREE.Mesh(ringGeo, core); ring.position.copy(p); ring.position.y -= 0.05; this.pathGroup.add(ring); });
    const markerGeo = new THREE.SphereGeometry(0.26, 20, 14);
    this.pathGeos.push(markerGeo);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const haloMat = new THREE.SpriteMaterial({ map: this.glowTex, color: PATH_GLOW, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pathMats.push(markerMat, haloMat);
    this.pathMarker = new THREE.Mesh(markerGeo, markerMat);
    this.pathHalo = new THREE.Sprite(haloMat);
    this.pathHalo.scale.set(2.2, 2.2, 1);
    this.pathGroup.add(this.pathMarker, this.pathHalo);
    this.markerHas = false;
    this.kick();
  }

  setMarker(state: PathMarker | null) {
    this.markerState = state;
    this.kick();
  }

  private clearPath() {
    this.pathGroup.clear();
    this.pathGeos.forEach(g => g.dispose());
    this.pathMats.forEach(m => m.dispose());
    this.pathGeos = []; this.pathMats = []; this.pathCurves = []; this.pathStops = [];
    this.pathMarker = null; this.pathHalo = null; this.markerState = null; this.markerHas = false;
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

  /** الإطار الآلي: أقرب بُعدٍ تملأ فيه حدودُ المباني FRAME_FILL من اللوحة من زاوية النظر الحالية. */
  private fitExact(minX: number, maxX: number, minZ: number, maxZ: number, height: number, target: THREE.Vector3) {
    const corners: THREE.Vector3[] = [];
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of [-0.2, height]) corners.push(new THREE.Vector3(x, y, z));
    const cam = this.camera.clone();
    const az = this.azT, pol = this.polT;
    const fits = (r: number) => {
      const s = Math.sin(pol);
      cam.position.set(target.x + r * s * Math.sin(az), target.y + r * Math.cos(pol), target.z + r * s * Math.cos(az));
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let m = 0;
      for (const c of corners) { const p = c.clone().project(cam); if (p.z > 1) return false; m = Math.max(m, Math.abs(p.x), Math.abs(p.y)); }
      return m <= FRAME_FILL;
    };
    let lo = 4, hi = 400;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
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
    this.fitRadius = this.fitExact(L.cx - L.width / 2 - 0.4, L.cx + L.width / 2 + 0.4, L.cz - L.depth / 2 - 0.4, L.cz + L.depth / 2 + 0.4, L.height, this.home);
    /* اللافتات تكبر مع اللوحة: مقروءةٌ على الحاسوب الكبير، ولا تزحم الهاتف. */
    this.opts.labels.style.setProperty("--hp-tag-size", `${THREE.MathUtils.clamp(Math.round(this.W / 82), 11, 16)}px`);
    /* أول قياسٍ يضع الكاميرا مباشرةً؛ وما بعده يحفظ نسبة التقريب التي اختارها القارئ. */
    this.radiusT = first ? this.fitRadius : this.fitRadius * ratio;
    if (first) { this.radius = this.radiusT; this.sized = true; }
    if (this.nbWanted) this.includeNeighbour();
    this.interior?.frameFor(this.camera.aspect, false);
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
    this.lastInput = performance.now();
    if (this.mode === "entering" || this.mode === "leaving") return;
    if (this.cineOn) this.cineFree = true;
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
      if (this.interior && this.mode === "inside") { this.interior.zoom(this.pinch.d / Math.max(1, d)); this.pinch.d = d; this.kick(); return; }
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
        if (this.interior && this.mode === "inside") this.interior.orbit(-dx * 0.0065, -dy * 0.005);
        else {
          this.azT = THREE.MathUtils.clamp(this.azT - dx * 0.0065, -1.25, 1.25);
          this.polT = THREE.MathUtils.clamp(this.polT - dy * 0.005, 0.62, 1.42);
        }
        this.kick();
      }
      return;
    }
    if (e.pointerType === "mouse" && this.mode === "campus") {
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
    const t = performance.now();
    const twice = (key: string) => {
      const last = this.lastTap;
      const again = Boolean(last && last.key === key && t - last.t < 420 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 28);
      this.lastTap = again ? null : { key, t, x: e.clientX, y: e.clientY };
      return again;
    };
    /* داخل القاعة: ضغطتان متتاليتان تخرجان منها. */
    if (this.mode !== "campus") { if (this.mode === "inside" && twice("@inside")) this.opts.onLeave?.(); return; }
    const hit = this.pick(e.clientX, e.clientY);
    /* ضغطتان على القاعة نفسها: ادخلها (والأولى اختارتها). */
    if (hit && !hit.neighbour && twice(hit.key)) { this.opts.onEnter?.(hit.key); return; }
    if (!hit || hit.neighbour) this.lastTap = null;
    this.opts.onPick(hit ? hit.key : null, hit ? hit.neighbour : false);
  };
  private onCancel = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.drag = null; this.pinch = null; };
  private onLeave = () => { if (this.hovered) { this.hovered = null; this.opts.onHover?.(null); this.kick(); } };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.lastInput = performance.now();
    if (this.mode === "entering" || this.mode === "leaving") return;
    if (this.interior && this.mode === "inside") { this.interior.zoom(Math.exp(e.deltaY * 0.0012)); this.kick(); return; }
    this.radiusT = THREE.MathUtils.clamp(this.radiusT * Math.exp(e.deltaY * 0.0012), this.fitRadius * 0.45, this.fitRadius * 1.8);
    this.kick();
  };
  /* ضغطتان على الأرض الفارغة تعيدان المنظر؛ وعلى قاعةٍ تدخلانها (من onUp). */
  private onDouble = (e: MouseEvent) => { if (this.mode === "campus" && !this.pick(e.clientX, e.clientY)) this.resetView(); };
  private onVisibility = () => { if (!document.hidden) this.kick(); };

  /** يوقظ حلقة الرسم؛ وتنام وحدها حين يسكن كل شيء. */
  kick() {
    if (this.disposed || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  rotateBy(dAz: number, dPol: number) {
    if (this.interior && this.mode === "inside") { this.interior.orbit(dAz, dPol); this.kick(); return; }
    if (this.cineOn) this.cineFree = true;
    this.azT = THREE.MathUtils.clamp(this.azT + dAz, -1.25, 1.25);
    this.polT = THREE.MathUtils.clamp(this.polT + dPol, 0.62, 1.42);
    this.kick();
  }
  zoomBy(f: number) {
    if (this.interior && this.mode === "inside") { this.interior.zoom(f); this.kick(); return; }
    this.radiusT = THREE.MathUtils.clamp(this.radiusT * f, this.fitRadius * 0.45, this.fitRadius * 1.8);
    this.kick();
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    /* وقت الإطار قد يسبق لحظة الإيقاظ على جهازٍ مثقل: لا زمن سالب، وإلا انقلب التخفيف تباعداً. */
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now;
    const reduced = this.opts.reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let busy = false;

    /* الشمس: من الشرق صباحاً إلى الغرب مساءً، ولونها يدفأ في الطرفين. */
    this.sunT += (this.sunWant - this.sunT) * (reduced ? 1 : 1 - Math.exp(-dt * 2.5));
    if (Math.abs(this.sunWant - this.sunT) > 0.0005) busy = true;
    {
      const t = this.sunT, L = this.opts.layout;
      const ang = Math.PI * (0.12 + 0.76 * t), elev = Math.sin(Math.PI * (0.15 + 0.7 * t));
      const R = Math.max(30, L.width + L.depth);
      this.keyLight.position.set(L.cx + Math.cos(ang) * R * 0.9, 8 + elev * R * 0.75, L.cz + R * 0.55);
      const c1 = t < 0.5 ? SUN_MORNING : SUN_NOON, c2 = t < 0.5 ? SUN_NOON : SUN_EVENING, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      this.keyLight.color.copy(c1).lerp(c2, f);
      this.keyLight.intensity = 0.6 + 0.65 * elev;
      const s1 = t < 0.5 ? SKY_MORNING : SKY_NOON, s2 = t < 0.5 ? SKY_NOON : SKY_EVENING;
      this.hemi.color.copy(s1).lerp(s2, f);
      /* السماء تلوّن الضوء ولا تغسل الألوان: شدّةٌ معتدلة لتبقى ألوان الملاءمة مشبعة. */
      this.hemi.intensity = 0.55 + 0.25 * elev;
    }

    /* حركةٌ محيطة: انجرافٌ بطيءٌ جداً حين لا يلمس أحدٌ المشهد. */
    const drifting = Boolean(this.opts.ambient) && !reduced && now - this.lastInput > 6000 && !this.drag && !this.pinch && !this.cineOn && this.mode === "campus";
    if (drifting) { this.azT = THREE.MathUtils.clamp(this.azT + dt * 0.012 * Math.sin(now / 14000 + 1), -1.25, 1.25); busy = true; }

    /* الكاميرا: تخميدٌ ناعم نحو الهدف. */
    /* العبور إلى الداخل والاقتراب من أشدّ لحظة أهدأ من سحب اليد. */
    const slow = this.mode !== "campus" || this.spot || now - this.modeAt < 1400;
    const kc = reduced ? 1 : slow ? 1 - Math.exp(-dt * 3.6) : k;
    this.az += (this.azT - this.az) * (this.cineOn && !this.cineFree && !reduced ? 1 - Math.exp(-dt * 2.2) : k); this.pol += (this.polT - this.pol) * k; this.radius += (this.radiusT - this.radius) * kc;
    this.target.lerp(this.targetT, kc);
    if (Math.abs(this.azT - this.az) + Math.abs(this.polT - this.pol) + Math.abs(this.radiusT - this.radius) * 0.05 + this.target.distanceTo(this.targetT) > 0.002) busy = true;
    const s = Math.sin(this.pol);
    this.camera.position.set(this.target.x + this.radius * s * Math.sin(this.az), this.target.y + this.radius * Math.cos(this.pol), this.target.z + this.radius * s * Math.cos(this.az));
    this.camera.lookAt(this.target);

    this.nbAlpha += (this.nbWanted - this.nbAlpha) * (reduced ? 1 : 1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.nbWanted - this.nbAlpha) > 0.003) busy = true;
    this.nbGroup.visible = this.nbAlpha > 0.01;

    const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 340);
    /* يلوّن موادّ القاعة من حالةٍ بعينها: الأساسية كل إطار، والأخرى قبل رسم جانبها من الفاصل. */
    const paint = (rig: RoomRig, v: HallVisual, level: number, color: THREE.Color, winO: number, haloO: number, fade: number, flash: boolean) => {
      const sel = rig.key === this.selected, hov = rig.key === this.hovered, fk = rig.fadeK;
      const fillMat = rig.fill.material;
      const mark = v.mark != null ? this.markColor.setHex(v.mark) : null;
      fillMat.color.copy(color);
      /* طبقة التسجيل: منسوب القاعة يميل إلى البنفسجي فتُقرأ القاعة كلها، لا إطارها وحده. */
      if (mark) fillMat.color.lerp(mark, 0.78);
      fillMat.emissive.copy(fillMat.color);
      fillMat.emissiveIntensity = 0.34 + (v.pulse || mark ? breathe : 0) * 0.55 + (sel ? 0.25 : 0) + (hov ? 0.12 : 0);
      fillMat.opacity = (v.dim ? 0.35 : 0.95) * fade * fk * (level > 0.01 ? 1 : 0);
      rig.fill.scale.y = Math.max(0.001, level * HALL_H * 0.86);
      const shell = rig.shell.material;
      if (mark) shell.color.copy(v.occupied ? color : GLASS).lerp(mark, 0.78);
      else shell.color.copy(v.occupied ? color : (v.glow ? CALM : GLASS));
      shell.opacity = fade * fk * (v.ghost ? 0.5 : mark ? 0.34 + 0.22 * breathe : v.glow ? 0.16 + 0.22 * breathe : v.occupied ? (v.dim ? 0.1 : 0.2) : v.dim ? 0.05 : 0.12);
      const ec = flash ? 0xffffff : sel ? BRASS.getHex() : mark ? v.mark! : v.glow ? CALM.getHex() : hov ? 0xe9f5f0 : EDGE.getHex();
      rig.edges.material.color.setHex(ec);
      rig.edges.material.opacity = fade * fk * (sel || flash ? 1 : mark ? 0.6 + 0.4 * breathe : v.glow ? 0.55 + 0.45 * breathe : hov ? 0.9 : v.dim ? 0.18 : 0.5);
      /* النافذة تضيء بلونٍ دافئ يميل إلى لون الملاءمة، والوهج فوق المضغوطة والمختارة. */
      rig.win.material.color.copy(color).lerp(WINDOW_WARM, 0.45);
      rig.win.material.opacity = winO;
      rig.halo.material.color.copy(mark && !sel ? mark : sel && !v.pulse ? BRASS : color);
      rig.halo.material.opacity = haloO;
      rig.halo.visible = haloO > 0.01;
    };
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
      /* الطوابق المنفرجة: ترتفع وتشفّ بتخفيفٍ ناعم. */
      const ek = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
      rig.liftY += (rig.liftWant - rig.liftY) * ek;
      rig.fadeK += (rig.fadeWant - rig.fadeK) * ek;
      if (Math.abs(rig.liftWant - rig.liftY) + Math.abs(rig.fadeWant - rig.fadeK) > 0.002) busy = true;
      const flash = now - rig.flashAt < 700;
      rig.winO += (((v.occupied && !v.dim ? 0.7 : 0) * fade * rig.fadeK) - rig.winO) * ck;
      rig.haloO += (((v.mark != null ? 0.5 + 0.4 * breathe : v.pulse ? 0.35 + 0.35 * breathe : sel ? 0.28 : 0) * fade * rig.fadeK) - rig.haloO) * ck;
      paint(rig, v, rig.level, rig.color, rig.winO, rig.haloO, fade, flash);
      /* «قبل وبعد»: الحالة الأخرى تتبع الساعة بتخفيفها هي. */
      const a = rig.alt;
      if (a && !neighbour) {
        const want = a.occupied ? Math.min(1.12, Math.max(0.08, a.level)) : 0;
        if (a.occupied) { this.tmp.setHex(a.color); rig.altColor.lerp(this.tmp, ck); }
        rig.altLevel += (want - rig.altLevel) * ck;
        rig.altWinO += (((a.occupied && !a.dim ? 0.7 : 0) * rig.fadeK) - rig.altWinO) * ck;
        rig.altHaloO += (((a.pulse ? 0.35 + 0.35 * breathe : sel ? 0.28 : 0) * rig.fadeK) - rig.altHaloO) * ck;
        if (Math.abs(want - rig.altLevel) > 0.002 || a.pulse || a.glow) busy = true;
      }
      /* الاختيار يرفع القاعة قليلاً، كمن يُخرج درجاً. */
      const lift = (sel ? 0.22 : hov ? 0.08 : 0) + rig.liftY;
      const y = rig.base.y + lift;
      if (Math.abs(rig.group.position.y - y) > 0.001) { rig.group.position.y += (y - rig.group.position.y) * ck; busy = true; }
      if (v.pulse || v.glow || v.mark != null || flash || held) busy = true;
    };
    for (const rig of this.rooms.values()) tick(rig, 1, false);
    for (const rig of this.nbRooms.values()) tick(rig, this.nbAlpha, true);
    {
      const ek = reduced ? 1 : 1 - Math.exp(-dt * 4.5);
      for (const sl of this.slabs) {
        const ex = this.explodeOf;
        /* سقف الطابق المختار (أي أرضية الطابق الذي فوقه) يرتفع مع ما فوقه. */
        const above = ex && sl.building === ex.building && sl.floorIndex > ex.floor;
        const lw = above ? 1.9 + (sl.floorIndex - ex!.floor) * 0.9 : 0, fw = above ? 0.1 : 1;
        sl.liftY += (lw - sl.liftY) * ek; sl.fadeK += (fw - sl.fadeK) * ek;
        if (Math.abs(lw - sl.liftY) + Math.abs(fw - sl.fadeK) > 0.002) busy = true;
        sl.mesh.position.y = sl.baseY + sl.liftY;
        /* «ضمّ المساء»: يتوهّج الطابق الباقي ويتنفّس (ثابتٌ مع تقليل الحركة)، ويعتم المنطفئ. */
        sl.moodK += (sl.mood - sl.moodK) * ek;
        if (Math.abs(sl.mood - sl.moodK) > 0.002) busy = true;
        const mat = sl.mesh.material;
        if (sl.moodK >= 0) {
          mat.color.copy(SLAB).lerp(SLAB_KEEP, sl.moodK);
          mat.emissive.copy(CALM);
          mat.emissiveIntensity = sl.moodK * (0.22 + 0.2 * breathe);
          if (sl.mood > 0 && !reduced) busy = true;
        } else {
          mat.color.copy(SLAB).lerp(SLAB_OFF, -sl.moodK);
          mat.emissiveIntensity = 0;
        }
        mat.opacity = sl.fadeK * (1 + Math.min(0, sl.moodK) * 0.35);
        sl.mesh.castShadow = sl.fadeK > 0.5;
      }
    }

    /* مسار التنقّل: العلامة تمشي على الأنبوب، وتنبض عند المحطة. */
    if (this.pathMarker && this.pathHalo && this.pathStops.length) {
      const st = this.markerState;
      const want = new THREE.Vector3();
      if (!st) want.copy(this.pathStops[0]);
      else if (st.hop != null && this.pathCurves[st.hop]) {
        const p = THREE.MathUtils.clamp(st.progress, 0, 1);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        want.copy(this.pathCurves[st.hop]!.getPoint(e));
      } else want.copy(this.pathStops[Math.min(this.pathStops.length - 1, st.stop)] || this.pathStops[0]);
      const bob = reduced ? 0 : Math.sin(now / 280) * 0.08;
      if (!this.markerHas) { this.markerPos.copy(want); this.markerHas = true; }
      this.markerPos.lerp(want, reduced ? 1 : 1 - Math.exp(-dt * 9));
      this.pathMarker.position.copy(this.markerPos); this.pathMarker.position.y += 0.25 + bob;
      this.pathHalo.position.copy(this.pathMarker.position);
      const pm = this.pathHalo.material as THREE.SpriteMaterial;
      pm.opacity = 0.65 + (reduced ? 0 : 0.3 * Math.sin(now / 220));
      if (!reduced) busy = true;
    }

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
      const sel = rig.key === this.selected, hov = rig.key === this.hovered;
      rig.group.getWorldPosition(this.v3);
      /* اللافتة على الواجهة الأمامية للقاعة لا فوق سقفها: فلا تغطّي لافتةُ الأرضي قاعةَ الطابق الذي فوقه. */
      this.v3.y -= HALL_H * 0.08;
      this.v3.z += HALL_D / 2 + 0.04;
      const at = this.v3.clone();
      /* «قبل وبعد»: اللافتة تقول حالة الجانب الذي تقع فيه من الفاصل. */
      let v = rig.target;
      if (rig.alt && this.split != null) {
        this.v3.project(this.camera);
        if ((this.v3.x * 0.5 + 0.5) > this.split) v = rig.alt;
      }
      /* على الشاشة الضيّقة: لافتة المختارة والمضغوطة والمضيئة وحدها. */
      const roomy = this.W >= 560;
      const show = fade > 0.6 && rig.fadeK > 0.5 && (sel || hov || (Boolean(v.showLabel) && (roomy || Boolean(v.pulse || v.glow || v.mark != null))));
      rig.tag.hidden = !show;
      if (!show) return;
      const tagKey = `${v.badge || ""}\u0000${v.label}`;
      if (rig.tag.dataset.k !== tagKey) {
        rig.tag.dataset.k = tagKey;
        rig.tag.textContent = v.label;
        if (v.badge) { const b = document.createElement("b"); b.className = "hp-tag-badge"; b.textContent = v.badge; rig.tag.prepend(b); }
      }
      rig.tag.classList.toggle("is-selected", sel);
      rig.tag.classList.toggle("is-glow", Boolean(v.glow));
      rig.tag.classList.toggle("is-mark", v.mark != null);
      place(rig.tag, at, true);
    };
    this.rooms.forEach(rig => tagFor(rig, 1));
    this.nbRooms.forEach(rig => tagFor(rig, this.nbAlpha));
    this.buildingTags.forEach(t => place(t.el, t.pos, true));
    this.floorTags.forEach(t => { t.el.hidden = this.mode !== "campus"; if (!t.el.hidden) place(t.el, t.pos, true); });
    this.nbBuildingTags.forEach(t => { t.el.hidden = this.nbAlpha < 0.6; if (!t.el.hidden) place(t.el, t.pos, true); });

    /* العبور إلى داخل القاعة: اقترابٌ ثم ستارٌ يعتم، ثم القاعة من الداخل تنكشف. */
    const smooth = (u: number) => { const t = THREE.MathUtils.clamp(u, 0, 1); return t * t * (3 - 2 * t); };
    let veil = 0;
    if (this.mode === "entering") {
      const u = (now - this.modeAt) / 720;
      veil = smooth((u - 0.38) / 0.62);
      busy = true;
      if (u >= 1) { this.openInterior(); this.mode = "inside"; this.modeAt = now; veil = 1; }
    } else if (this.mode === "leaving") {
      const u = (now - this.modeAt) / 340;
      veil = smooth(u);
      busy = true;
      if (u >= 1) { this.closeInterior(); this.mode = "campus"; this.modeAt = now; veil = 1; }
    } else if (now - this.modeAt < 520) { veil = 1 - smooth((now - this.modeAt) / 500); busy = true; }
    this.veil.style.opacity = veil < 0.004 ? "0" : veil.toFixed(3);

    if (this.interior && (this.mode === "inside" || this.mode === "leaving")) {
      if (this.interior.tick(dt, now, this.W, this.H)) busy = true;
      this.renderer.render(this.interior.scene, this.interior.camera);
    } else if (this.split != null) {
      /* «قبل وبعد»: المشهد نفسه مرتين بالمقصّ — يسار الفاصل «بعد» (الحالة الأساسية)، ويمينه «قبل». */
      const x = Math.round(this.split * this.W);
      this.renderer.setScissorTest(true);
      if (x > 0) { this.renderer.setScissor(0, 0, x, this.H); this.renderer.render(this.scene, this.camera); }
      if (x < this.W) {
        for (const rig of this.rooms.values()) if (rig.alt) paint(rig, rig.alt, rig.altLevel, rig.altColor, rig.altWinO, rig.altHaloO, 1, false);
        /* جانب «الآن»: الطوابق كما هي، بلا توهّج المساء ولا عتمته. */
        if (this.moodOn) for (const sl of this.slabs) { sl.mesh.material.color.copy(SLAB); sl.mesh.material.emissiveIntensity = 0; sl.mesh.material.opacity = sl.fadeK; }
        this.renderer.setScissor(x, 0, this.W - x, this.H);
        this.renderer.render(this.scene, this.camera);
      }
      this.renderer.setScissorTest(false);
    } else this.renderer.render(this.scene, this.camera);
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
    this.interior?.dispose(); this.interior = null;
    this.opts.labels.classList.remove("is-inside");
    this.veil.remove();
    for (const rig of this.rooms.values()) { rig.shell.material.dispose(); rig.fill.material.dispose(); rig.edges.material.dispose(); rig.win.material.dispose(); rig.halo.material.dispose(); rig.tag.remove(); }
    this.clearPath();
    this.rooms.clear();
    this.buildingTags.forEach(t => t.el.remove());
    this.floorTags.forEach(t => t.el.remove()); this.floorTags.clear();
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

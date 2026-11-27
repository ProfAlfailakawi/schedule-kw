/**
 * ── مشهد «الحرم كله مدينة» (three.js) ────────────────────────────────────────
 *
 * عالم «نبض القاعات» نفسه مبتعداً: السماء والشمس تتبعان الساعة، والقاعات زجاجٌ
 * يمتلئ بلون ملاءمته وتضيء نوافذه، وفوق كل مضغوطةٍ مثلّثٌ أحمر (▲ علامة النبض).
 * الجديد أن كل قسمٍ حيٌّ على أرضٍ بلونه، يتوهّج تحته مزاجه في اللحظة (يختنق/مزدحم/
 * هادئ/خالٍ)، والمبنى المشترك يُرسم مرةً بشريطٍ مقسومٍ على أقسامه.
 *
 * الرسم كله دفعاتٌ قليلة: القاعات ثلاثة InstancedMesh (زجاج، ومنسوب، ونافذة)
 * ومثلّثات الضغط رابعٌ، فتبقى مئات القاعات خفيفة. يرسم عند الحاجة وحدها، ويقف
 * حين يخرج من الشاشة، ويُفرغ كل ما أنشأه عند الإغلاق. لا يعرف الجدول ولا يكتب شيئاً.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FLOOR_H, HALL_D, HALL_H, HALL_W } from "../../utils/hallPulse";
import type { CampusLayout, DistrictMood } from "../../utils/campusCity";

export interface CampusHallVisual { color: number; level: number; occupied: boolean; pressed: boolean; dept: number }
export interface CampusDistrictVisual { mood: DistrictMood; load: number; tone: number; label: string; sub: string }

const GLASS = new THREE.Color(0xcfe9df);
const BRASS = new THREE.Color(0xe2bd76);
const WINDOW_WARM = new THREE.Color(0xffe2a8);
const DARK = new THREE.Color(0x000000);
const MOOD_HEX: Record<DistrictMood, number> = { choke: 0xf0674f, busy: 0xf0b24a, calm: 0x4fd3a1, idle: 0x3d6f8f };
const SUN_MORNING = new THREE.Color(0xffd2a0), SUN_NOON = new THREE.Color(0xfff6e6), SUN_EVENING = new THREE.Color(0xff9a62);
const SKY_MORNING = new THREE.Color(0xd8ecff), SKY_NOON = new THREE.Color(0xeefaf4), SKY_EVENING = new THREE.Color(0xffc9a6);
const FILL = 0.9;
const EDGE = new THREE.Color(0x7fb3a3);

function radialTexture(stops: Array<[number, string]>) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) r.addColorStop(at, color);
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface PlateRig {
  dept: number;
  plate: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  rim: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  tag: HTMLDivElement;
  tagPos: THREE.Vector3;
  want: CampusDistrictVisual | null;
  glowO: number;
  glowC: THREE.Color;
}

export class CampusScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 900);
  private disposables: Array<{ dispose: () => void }> = [];
  private plates: PlateRig[] = [];
  private plateByDept = new Map<number, PlateRig>();
  private hallKeys: string[];
  private hallIndex = new Map<string, number>();
  private shells!: THREE.InstancedMesh;
  private fills!: THREE.InstancedMesh;
  private wins!: THREE.InstancedMesh;
  private beacons!: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh | null = null;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  private buildingTags: Array<{ el: HTMLDivElement; pos: THREE.Vector3 }> = [];
  private hallState: Array<{ visual: CampusHallVisual; level: number; color: THREE.Color; win: number }> = [];
  private keyLight!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sunT = 0.35; private sunWant = 0.35;
  private raf = 0; private last = performance.now();
  private az = 0.2; private pol = 0.78; private radius = 120;
  private azT = 0.2; private polT = 0.78; private radiusT = 120;
  private target = new THREE.Vector3(); private targetT = new THREE.Vector3();
  private home = new THREE.Vector3(); private homeRadius = 120;
  private drag: { x: number; y: number; moved: number; id: number } | null = null;
  private hovered: number | null = null;
  private focusDept: number | null = null;
  private flight: { dept: number; at: number; done: () => void } | null = null;
  private W = 1; private H = 1;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visible = true;
  private disposed = false;
  private lastInput = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private tmp = new THREE.Color();
  private hasChoke = false;
  private edgeMat: THREE.LineBasicMaterial | null = null;
  private roofOf = new Map<string, number>();

  constructor(private opts: {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    labels: HTMLElement;
    layout: CampusLayout;
    reduced: boolean;
    /** القسم صاحب كل قاعة: الضغط على قاعةٍ يختار حيّها. */
    hallDept: Map<string, number>;
    /** لون أرض كل حي (من DISTRICT_TONES). */
    toneOf: (dept: number) => number;
    onHover: (dept: number | null) => void;
    onPick: (dept: number) => void;
  }) {
    const renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hallKeys = [...opts.layout.spots.keys()];
    this.hallKeys.forEach((k, i) => this.hallIndex.set(k, i));
    this.build();
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
    this.kick();
  }

  /* ── البناء ─────────────────────────────────────────────────────────────── */
  private build() {
    const L = this.opts.layout;
    const span = Math.max(L.width, L.depth);
    this.scene.fog = new THREE.Fog(0x0b1f1b, span * 1.2 + 60, span * 3 + 220);
    this.hemi = new THREE.HemisphereLight(0xe4f6ee, 0x0b1d19, 0.7);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xfff4e2, 1.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    const sh = key.shadow.camera as THREE.OrthographicCamera;
    const ext = span * 0.62 + 10;
    sh.left = -ext; sh.right = ext; sh.top = ext; sh.bottom = -ext; sh.near = 1; sh.far = span * 3 + 200;
    key.target.position.set(L.cx, 0, L.cz);
    this.keyLight = key;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8fd6ff, 0.4);
    rim.position.set(L.cx + span, 30, L.cz - span);
    this.scene.add(rim);

    /* الأرض: دائرةٌ داكنة كأرض النبض، وهالةٌ خضراء خافتة تحت المدينة. */
    const groundGeo = new THREE.CircleGeometry(span * 1.1 + 60, 96);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x123630, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(L.cx, -0.32, L.cz);
    ground.receiveShadow = true;
    const haloTex = radialTexture([[0, "rgba(64,140,120,0.5)"], [0.55, "rgba(30,80,70,0.24)"], [1, "rgba(10,30,26,0)"]]);
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.scale.setScalar(span * 1.7 + 30);
    halo.position.set(L.cx, -0.3, L.cz);
    this.scene.add(ground, halo);
    this.disposables.push(groundGeo, groundMat, haloTex, haloGeo, haloMat);

    /* الأحياء: أرضٌ بلون القسم، وحافةٌ رفيعة، ووهج المزاج تحتها. */
    const glowTex = radialTexture([[0, "rgba(255,255,255,0.85)"], [0.4, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]);
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(glowTex, glowGeo);
    for (const d of L.districts) {
      const tone = new THREE.Color(this.opts.toneOf(d.dept));
      /* حيٌّ بلا مبنى أرضٌ داكنة تحفظ مكانه، لا لوحةٌ ملوّنة كبيرة. */
      const bare = d.top <= 0;
      const plateGeo = new RoundedBoxGeometry(d.w, 0.34, d.d, 2, 0.3);
      const plateMat = new THREE.MeshStandardMaterial({ color: bare ? new THREE.Color(0x173630) : tone.clone().lerp(new THREE.Color(0x0f2a24), 0.74), roughness: 0.92, metalness: 0.04, emissive: tone, emissiveIntensity: 0.05 });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(d.cx, -0.17, d.cz);
      plate.receiveShadow = true;
      plate.userData.dept = d.dept;
      const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w - 0.2, 0.34, d.d - 0.2));
      const rimMat = new THREE.LineBasicMaterial({ color: tone, transparent: true, opacity: 0.55 });
      const rim = new THREE.LineSegments(rimGeo, rimMat);
      rim.position.copy(plate.position);
      const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: MOOD_HEX.idle, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.scale.set(d.w * 1.5, d.d * 1.5, 1);
      glow.position.set(d.cx, 0.02, d.cz);
      glow.renderOrder = 1;
      this.scene.add(plate, rim, glow);
      this.disposables.push(plateGeo, plateMat, rimGeo, rimMat, glowMat);
      const tag = document.createElement("div");
      tag.className = "cc-tag";
      this.opts.labels.appendChild(tag);
      const rig: PlateRig = { dept: d.dept, plate, rim, glow, tag, tagPos: bare ? new THREE.Vector3(d.cx, 0.2, d.cz) : new THREE.Vector3(d.cx, 0.1, d.z0 + 2.4), want: null, glowO: 0, glowC: new THREE.Color(MOOD_HEX.idle) };
      this.plates.push(rig);
      this.plateByDept.set(d.dept, rig);
    }

    /* المباني: بلاطة لكل طابق، والمبنى المشترك بشريطٍ أمامي مقسومٍ على أقسامه. */
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x1d4a41, roughness: 0.85, metalness: 0.05 });
    this.disposables.push(slabMat);
    for (const b of L.buildings) {
      this.roofOf.set(b.code, (b.floors - 1) * FLOOR_H + HALL_H + 0.1);
      const slabGeo = new RoundedBoxGeometry(b.w + 0.5, 0.16, b.d + 0.5, 2, 0.07);
      this.disposables.push(slabGeo);
      for (let f = 0; f < b.floors; f++) {
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(b.cx, f * FLOOR_H - 0.06, b.cz);
        slab.receiveShadow = true; slab.castShadow = true;
        this.scene.add(slab);
      }
      const total = b.shares.reduce((s, x) => s + x.weight, 0);
      if (b.shared && total > 0) {
        let x0 = b.cx - (b.w + 0.5) / 2;
        for (const share of b.shares) {
          const w = ((b.w + 0.5) * share.weight) / total;
          const geo = new THREE.BoxGeometry(Math.max(0.05, w - 0.06), 0.22, 0.32);
          const mat = new THREE.MeshStandardMaterial({ color: this.opts.toneOf(share.dept), emissive: this.opts.toneOf(share.dept), emissiveIntensity: 0.5, roughness: 0.6 });
          const bar = new THREE.Mesh(geo, mat);
          bar.position.set(x0 + w / 2, 0.02, b.cz + b.d / 2 + 0.55);
          this.scene.add(bar);
          this.disposables.push(geo, mat);
          x0 += w;
        }
      }
      const el = document.createElement("div");
      el.className = "cc-tag cc-tag-building";
      el.textContent = b.shared ? `${b.label} · مشترك` : b.label;
      this.opts.labels.appendChild(el);
      this.buildingTags.push({ el, pos: new THREE.Vector3(b.cx, -0.1, b.cz + b.d / 2 + 1.25) });
    }

    /* القاعات: ثلاث دفعاتٍ لكل القاعات. */
    const n = Math.max(1, this.hallKeys.length);
    const shellGeo = new RoundedBoxGeometry(HALL_W, HALL_H, HALL_D, 2, 0.16);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.24, depthWrite: false, emissive: 0x0d2a24, emissiveIntensity: 0.4 });
    const fillGeo = new RoundedBoxGeometry(HALL_W * 0.86, 1, HALL_D * 0.86, 2, 0.1);
    fillGeo.translate(0, 0.5, 0);
    const fillMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.05 });
    /* المنسوب يضيء بلونه هو: إضاءةٌ ذاتية تأخذ لون الدفعة لا لوناً واحداً للمادة. */
    fillMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor.rgb * 0.42;\n#endif",
      );
    };
    const winGeo = new THREE.PlaneGeometry(HALL_W * 0.74, HALL_H * 0.34);
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const beaconGeo = new THREE.ConeGeometry(0.62, 1.15, 3);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf0674f, toneMapped: false });
    this.disposables.push(shellGeo, shellMat, fillGeo, fillMat, winGeo, winMat, beaconGeo, beaconMat);
    this.shells = new THREE.InstancedMesh(shellGeo, shellMat, n);
    this.fills = new THREE.InstancedMesh(fillGeo, fillMat, n);
    this.wins = new THREE.InstancedMesh(winGeo, winMat, n);
    this.beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, n);
    this.fills.castShadow = true;
    this.shells.renderOrder = 2;
    this.wins.renderOrder = 3;
    for (const mesh of [this.shells, this.fills, this.wins, this.beacons]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    this.hallKeys.forEach((key, i) => {
      const s = L.spots.get(key)!;
      this.m4.makeTranslation(s.x, s.y, s.z);
      this.shells.setMatrixAt(i, this.m4);
      this.shells.setColorAt(i, GLASS);
      this.m4.makeTranslation(s.x, s.y + HALL_H * 0.12, s.z + HALL_D / 2 + 0.014);
      this.wins.setMatrixAt(i, this.m4);
      this.wins.setColorAt(i, DARK);
      this.m4.makeScale(0, 0, 0);
      this.fills.setMatrixAt(i, this.m4);
      this.fills.setColorAt(i, GLASS);
      this.beacons.setMatrixAt(i, this.m4);
      this.hallState.push({ visual: { color: GLASS.getHex(), level: 0, occupied: false, pressed: false, dept: this.opts.hallDept.get(key) || 0 }, level: 0, color: GLASS.clone(), win: 0 });
    });
    this.scene.add(this.fills, this.shells, this.wins, this.beacons);

    /* حواف الزجاج كلها هندسةٌ واحدة مدموجة: القاعات لا تتحرّك، فرسمةٌ واحدة تكفي. */
    if (this.hallKeys.length) {
      const one = new THREE.EdgesGeometry(new THREE.BoxGeometry(HALL_W * 0.985, HALL_H * 0.985, HALL_D * 0.985));
      const src = one.getAttribute("position").array as Float32Array;
      const all = new Float32Array(src.length * this.hallKeys.length);
      this.hallKeys.forEach((key, i) => {
        const sp = L.spots.get(key)!;
        for (let j = 0; j < src.length; j += 3) {
          all[i * src.length + j] = src[j] + sp.x; all[i * src.length + j + 1] = src[j + 1] + sp.y; all[i * src.length + j + 2] = src[j + 2] + sp.z;
        }
      });
      one.dispose();
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(all, 3));
      this.edgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.5 });
      const edges = new THREE.LineSegments(edgeGeo, this.edgeMat);
      edges.frustumCulled = false;
      this.scene.add(edges);
      this.disposables.push(edgeGeo, this.edgeMat);
    }

    /* أشجارٌ منخفضة الكلفة حول المدينة وعلى أطراف الشوارع، كما في النبض. */
    {
      const treeGeo = new THREE.ConeGeometry(0.6, 1.7, 7);
      treeGeo.translate(0, 0.85, 0);
      const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f6f58, roughness: 0.9, flatShading: true });
      const spotsT: Array<[number, number, number]> = [];
      let seed = 23;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const ring = Math.max(L.width, L.depth) * 0.56 + 8;
      const around = Math.min(90, 30 + Math.round(ring * 1.4));
      for (let i = 0; i < around; i++) {
        const a = (i / around) * Math.PI * 2 + rnd() * 0.2, r = ring + rnd() * 7;
        spotsT.push([L.cx + Math.cos(a) * r * 1.08, L.cz + Math.sin(a) * r * 0.9, 0.7 + rnd() * 0.9]);
      }
      for (const d of L.districts) {
        for (let x = d.x0 + 1.5; x < d.x0 + d.w - 1; x += 3.4 + rnd() * 2) spotsT.push([x, d.z0 - d.d - 2.6 - rnd() * 1.2, 0.55 + rnd() * 0.5]);
        for (let z = d.z0 - 1.5; z > d.z0 - d.d + 1; z -= 3.6 + rnd() * 2) spotsT.push([d.x0 + d.w + 2.4 + rnd(), z, 0.5 + rnd() * 0.5]);
      }
      const trees = new THREE.InstancedMesh(treeGeo, treeMat, spotsT.length);
      spotsT.forEach(([x, z, h], i) => {
        this.v3.set(x, -0.3, z); this.sc.set(h, h * (0.9 + rnd() * 0.5), h);
        this.m4.compose(this.v3, this.q.identity(), this.sc);
        trees.setMatrixAt(i, this.m4);
      });
      trees.castShadow = true; trees.receiveShadow = true;
      this.scene.add(trees);
      this.disposables.push(treeGeo, treeMat, trees);
    }

    /* مصابيح الشوارع: نقاطٌ دافئة على حواف الأحياء تشتدّ مع المساء. */
    const lampSpots: THREE.Vector3[] = [];
    for (const d of L.districts) {
      const stepX = Math.max(3.2, d.w / Math.max(2, Math.round(d.w / 4.5)));
      for (let x = d.x0 + 0.6; x <= d.x0 + d.w - 0.5; x += stepX) { lampSpots.push(new THREE.Vector3(x, 0.32, d.z0 + 0.9)); lampSpots.push(new THREE.Vector3(x, 0.32, d.z0 - d.d - 0.9)); }
    }
    if (lampSpots.length) {
      const lampGeo = new THREE.SphereGeometry(0.17, 8, 6);
      this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, toneMapped: false });
      this.lamps = new THREE.InstancedMesh(lampGeo, this.lampMat, lampSpots.length);
      lampSpots.forEach((p, i) => { this.m4.makeTranslation(p.x, p.y, p.z); this.lamps!.setMatrixAt(i, this.m4); });
      this.scene.add(this.lamps);
      this.disposables.push(lampGeo, this.lampMat);
    }

    this.home.set(L.cx, L.height * 0.25, L.cz);
    this.target.copy(this.home); this.targetT.copy(this.home);
  }

  /* ── الحالة ────────────────────────────────────────────────────────────── */
  setHalls(visuals: Map<string, CampusHallVisual>) {
    let choke = false;
    for (const [key, v] of visuals) {
      const i = this.hallIndex.get(key);
      if (i == null) continue;
      this.hallState[i].visual = v;
      if (v.pressed) choke = true;
    }
    this.hasChoke = choke;
    this.kick();
  }

  setDistricts(visuals: Map<number, CampusDistrictVisual>) {
    for (const rig of this.plates) {
      const v = visuals.get(rig.dept) || null;
      rig.want = v;
      if (v) {
        rig.tag.dataset.mood = v.mood;
        rig.tag.replaceChildren();
        const strong = document.createElement("strong");
        strong.textContent = v.label;
        const small = document.createElement("small");
        small.textContent = v.sub;
        rig.tag.append(strong, small);
      }
    }
    this.kick();
  }

  setHovered(dept: number | null) {
    if (dept === this.hovered) return;
    this.hovered = dept;
    this.kick();
  }

  setTimeOfDay(minute: number, dayStart: number, dayEnd: number) {
    this.sunWant = THREE.MathUtils.clamp((minute - dayStart) / Math.max(1, dayEnd - dayStart), 0, 1);
    if (this.opts.reduced) this.sunT = this.sunWant;
    this.kick();
  }

  /** يطير إلى الحي ثم يُبلغ (فوراً مع تقليل الحركة). */
  flyTo(dept: number, done: () => void) {
    const d = this.opts.layout.districts.find(x => x.dept === dept);
    if (!d) { done(); return; }
    this.focusDept = dept;
    this.targetT.set(d.cx, Math.max(0.6, d.top * 0.3), d.cz);
    this.polT = 0.78;
    this.radiusT = Math.max(14, Math.max(d.w, d.d) * 1.15 + d.top);
    if (this.opts.reduced) { done(); return; }
    this.flight = { dept, at: performance.now(), done };
    this.kick();
  }

  resetView() {
    this.focusDept = null; this.flight = null;
    this.targetT.copy(this.home); this.radiusT = this.homeRadius; this.polT = 0.78; this.azT = 0.2;
    this.kick();
  }
  zoomBy(f: number) { this.radiusT = THREE.MathUtils.clamp(this.radiusT * f, 10, this.homeRadius * 2.2); this.lastInput = performance.now(); this.kick(); }
  orbit(dAz: number, dPol: number) {
    this.azT = THREE.MathUtils.clamp(this.azT + dAz, -1.4, 1.4);
    this.polT = THREE.MathUtils.clamp(this.polT + dPol, 0.35, 1.25);
    this.lastInput = performance.now();
    this.kick();
  }

  /* ── الإدخال ───────────────────────────────────────────────────────────── */
  private pickAt(x: number, y: number): number | null {
    const r = this.opts.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects([this.shells, ...this.plates.map(p => p.plate)], false)[0];
    if (!hit) return null;
    if (hit.object === this.shells && hit.instanceId != null) {
      const dept = this.opts.hallDept.get(this.hallKeys[hit.instanceId]);
      return dept != null && this.plateByDept.has(dept) ? dept : null;
    }
    const dept = hit.object.userData.dept;
    return typeof dept === "number" ? dept : null;
  }
  private onDown = (e: PointerEvent) => {
    this.opts.canvas.setPointerCapture?.(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    this.lastInput = performance.now();
  };
  private onMove = (e: PointerEvent) => {
    if (this.drag && this.drag.id === e.pointerId) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved > 4) this.orbit(-dx * 0.006, -dy * 0.005);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const dept = this.pickAt(e.clientX, e.clientY);
    this.opts.canvas.style.cursor = dept != null ? "pointer" : "grab";
    if (dept !== this.hovered) { this.hovered = dept; this.opts.onHover(dept); this.kick(); }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved > 6) return;
    const dept = this.pickAt(e.clientX, e.clientY);
    if (dept != null) this.opts.onPick(dept);
  };
  private onCancel = () => { this.drag = null; };
  private onLeave = () => { if (this.hovered != null) { this.hovered = null; this.opts.onHover(null); this.kick(); } };
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.08 : 0.92); };
  private onVisibility = () => { if (!document.hidden) this.kick(); };

  /* ── الإطار ────────────────────────────────────────────────────────────── */
  private fitRadius() {
    const L = this.opts.layout;
    const cam = this.camera.clone();
    cam.aspect = this.W / this.H; cam.updateProjectionMatrix();
    const corners: THREE.Vector3[] = [];
    const minX = L.cx - L.width / 2, maxX = L.cx + L.width / 2, minZ = L.cz - L.depth / 2, maxZ = L.cz + L.depth / 2 + 3;
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of [-0.3, L.height]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (r: number) => {
      const s = Math.sin(this.polT);
      cam.position.set(this.home.x + r * s * Math.sin(this.azT), this.home.y + r * Math.cos(this.polT), this.home.z + r * s * Math.cos(this.azT));
      cam.lookAt(this.home); cam.updateMatrixWorld();
      let m = 0;
      for (const c of corners) { const p = c.clone().project(cam); if (p.z > 1) return false; m = Math.max(m, Math.abs(p.x), Math.abs(p.y)); }
      return m <= FILL;
    };
    let lo = 6, hi = 800;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  private resize() {
    const r = this.opts.host.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.W, this.H, false);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    const first = this.homeRadius === 120 && this.radius === 120;
    this.homeRadius = this.fitRadius();
    if (first || this.focusDept == null) { this.radiusT = this.homeRadius; if (first) this.radius = this.homeRadius * 1.25; }
    this.kick();
  }

  private kick() {
    if (this.disposed || this.raf || !this.visible || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now;
    const reduced = this.opts.reduced;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
    let busy = false;

    /* الشمس والسماء: كما في النبض. */
    this.sunT += (this.sunWant - this.sunT) * (reduced ? 1 : 1 - Math.exp(-dt * 2.5));
    if (Math.abs(this.sunWant - this.sunT) > 0.0005) busy = true;
    const L = this.opts.layout, t = this.sunT;
    {
      const ang = Math.PI * (0.12 + 0.76 * t), elev = Math.sin(Math.PI * (0.15 + 0.7 * t));
      const R = Math.max(40, L.width + L.depth);
      this.keyLight.position.set(L.cx + Math.cos(ang) * R * 0.9, 10 + elev * R * 0.8, L.cz + R * 0.55);
      const c1 = t < 0.5 ? SUN_MORNING : SUN_NOON, c2 = t < 0.5 ? SUN_NOON : SUN_EVENING, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      this.keyLight.color.copy(c1).lerp(c2, f);
      this.keyLight.intensity = 0.55 + 0.7 * elev;
      this.hemi.color.copy(t < 0.5 ? SKY_MORNING : SKY_NOON).lerp(t < 0.5 ? SKY_NOON : SKY_EVENING, f);
      this.hemi.intensity = 0.62 + 0.28 * elev;
      if (this.lampMat) this.lampMat.opacity = 0.2 + Math.max(0, (t - 0.55) / 0.45) * 0.75;
    }

    const drifting = Boolean(!reduced && now - this.lastInput > 7000 && !this.drag && this.focusDept == null);
    if (drifting) { this.azT = THREE.MathUtils.clamp(this.azT + dt * 0.01 * Math.sin(now / 16000 + 1), -1.2, 1.2); busy = true; }

    const kc = reduced ? 1 : this.flight ? 1 - Math.exp(-dt * 3.2) : k;
    this.az += (this.azT - this.az) * k; this.pol += (this.polT - this.pol) * kc; this.radius += (this.radiusT - this.radius) * kc;
    this.target.lerp(this.targetT, kc);
    if (Math.abs(this.azT - this.az) + Math.abs(this.polT - this.pol) + Math.abs(this.radiusT - this.radius) * 0.02 + this.target.distanceTo(this.targetT) > 0.002) busy = true;
    const s = Math.sin(this.pol);
    this.camera.position.set(this.target.x + this.radius * s * Math.sin(this.az), this.target.y + this.radius * Math.cos(this.pol), this.target.z + this.radius * s * Math.cos(this.az));
    this.camera.lookAt(this.target);
    if (this.flight) {
      const close = Math.abs(this.radiusT - this.radius) < Math.max(0.6, this.radiusT * 0.05) && this.target.distanceTo(this.targetT) < 0.6;
      if (close || now - this.flight.at > 1600) { const done = this.flight.done; this.flight = null; done(); }
      else busy = true;
    }

    /* الأحياء: وهج المزاج يتنفّس في الحي المختنق، والمختار والمحوَّم يعلوان. */
    const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 420);
    for (const rig of this.plates) {
      const v = rig.want;
      const lit = rig.dept === this.hovered || rig.dept === this.focusDept;
      const goal = !v ? 0 : v.mood === "choke" ? 0.62 + 0.3 * breathe : v.mood === "busy" ? 0.46 : v.mood === "calm" ? 0.24 + 0.2 * v.load : 0.06;
      rig.glowO += (goal + (lit ? 0.12 : 0) - rig.glowO) * k;
      rig.glowC.lerp(this.tmp.setHex(v ? MOOD_HEX[v.mood] : MOOD_HEX.idle), k);
      rig.glow.material.color.copy(rig.glowC);
      rig.glow.material.opacity = rig.glowO;
      rig.plate.material.emissiveIntensity = lit ? 0.26 : 0.05;
      rig.rim.material.opacity = lit ? 1 : 0.5;
      rig.rim.material.color.setHex(lit ? BRASS.getHex() : this.opts.toneOf(rig.dept));
      rig.tag.classList.toggle("is-lit", lit);
    }

    if (this.edgeMat) this.edgeMat.opacity = this.hovered != null || this.focusDept != null ? 0.28 : 0.5;
    /* القاعات: المنسوب يصعد بلونه، والنافذة تضيء، والمضغوطة يعلوها ▲ يتنفّس. */
    let dirty = false;
    for (let i = 0; i < this.hallKeys.length; i++) {
      const st = this.hallState[i], v = st.visual;
      const spot = L.spots.get(this.hallKeys[i])!;
      const wantLevel = v.occupied ? Math.min(1.12, Math.max(0.08, v.level)) : 0;
      const wantWin = v.occupied ? 1 : 0;
      const lvl = st.level + (wantLevel - st.level) * k;
      const win = st.win + (wantWin - st.win) * k;
      this.tmp.setHex(v.occupied ? v.color : GLASS.getHex());
      const changed = Math.abs(lvl - st.level) > 0.0008 || Math.abs(win - st.win) > 0.002 || !st.color.equals(this.tmp);
      st.color.lerp(this.tmp, k);
      if (Math.abs(st.color.r - this.tmp.r) + Math.abs(st.color.g - this.tmp.g) + Math.abs(st.color.b - this.tmp.b) < 0.004) st.color.copy(this.tmp);
      st.level = lvl; st.win = win;
      if (changed) busy = true;
      const lit = v.dept === this.hovered || v.dept === this.focusDept;
      const dim = (this.hovered != null || this.focusDept != null) && !lit;
      /* الزجاج: نحاسيٌّ لقاعات الحي المختار، ويخفت ما سواه. */
      this.tmp.copy(lit ? BRASS : v.occupied ? st.color : GLASS);
      if (dim) this.tmp.multiplyScalar(0.45);
      this.shells.setColorAt(i, this.tmp);
      this.sc.set(1, Math.max(0.001, st.level * HALL_H * 0.86), 1);
      this.v3.set(spot.x, spot.y - HALL_H * 0.43, spot.z);
      this.m4.compose(this.v3, this.q.identity(), st.level > 0.004 ? this.sc : this.sc.set(0, 0, 0));
      this.fills.setMatrixAt(i, this.m4);
      this.tmp.copy(st.color);
      if (dim) this.tmp.multiplyScalar(0.55);
      this.fills.setColorAt(i, this.tmp);
      this.tmp.copy(st.color).lerp(WINDOW_WARM, 0.45).multiplyScalar(st.win * (dim ? 0.35 : 0.9));
      this.wins.setColorAt(i, this.tmp);
      /* ▲ فوق سطح المبنى (لا بين طوابقه) حيث تُرى من فوق. */
      const top = (this.roofOf.get(spot.building) ?? spot.y + HALL_H / 2) + 0.9 + (reduced ? 0 : Math.sin(now / 380 + i) * 0.14);
      const bs = v.pressed ? (reduced ? 1 : 0.9 + 0.18 * breathe) : 0;
      this.v3.set(spot.x, top, spot.z);
      this.q.setFromAxisAngle(this.sc.set(1, 0, 0), Math.PI);
      this.sc.set(bs, bs, bs);
      this.m4.compose(this.v3, this.q, this.sc);
      this.beacons.setMatrixAt(i, this.m4);
      dirty = true;
    }
    if (dirty) {
      for (const mesh of [this.shells, this.fills, this.wins, this.beacons]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    if (this.hasChoke && !reduced) busy = true;

    this.renderer.render(this.scene, this.camera);
    this.placeTags();
    if (busy) this.kick();
  };

  private placeTags() {
    const place = (el: HTMLElement, pos: THREE.Vector3) => {
      this.v3.copy(pos).project(this.camera);
      const off = this.v3.z > 1 || Math.abs(this.v3.x) > 1.1 || Math.abs(this.v3.y) > 1.1;
      el.style.visibility = off ? "hidden" : "visible";
      if (off) return;
      el.style.transform = `translate(-50%,-50%) translate(${((this.v3.x + 1) / 2) * this.W}px,${((1 - this.v3.y) / 2) * this.H}px)`;
    };
    for (const rig of this.plates) place(rig.tag, rig.tagPos);
    const near = this.radius < this.homeRadius * 0.7;
    for (const t of this.buildingTags) { t.el.hidden = !near; if (near) place(t.el, t.pos); }
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); this.io?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    const c = this.opts.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("wheel", this.onWheel);
    for (const mesh of [this.shells, this.fills, this.wins, this.beacons, this.lamps]) mesh?.dispose();
    for (const d of this.disposables) d.dispose();
    for (const rig of this.plates) rig.tag.remove();
    for (const t of this.buildingTags) t.el.remove();
    this.renderer.dispose();
  }
}

export function campusWebglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

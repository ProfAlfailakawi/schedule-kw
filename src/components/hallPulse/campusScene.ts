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
import { STREET, type CampusLayout, type DistrictMood } from "../../utils/campusCity";

export interface CampusHallVisual { color: number; level: number; occupied: boolean; pressed: boolean; dept: number }
/** sub: شارةٌ قصيرة بجانب الاسم (عدد المضغوطة) أو فارغة؛ التفصيل في القائمة وبطاقة المرور. */
export interface CampusDistrictVisual { mood: DistrictMood; load: number; tone: number; label: string; sub: string }

const GLASS = new THREE.Color(0xcfe9df);
const BRASS = new THREE.Color(0xe2bd76);
const WINDOW_WARM = new THREE.Color(0xffe2a8);
const DARK = new THREE.Color(0x000000);
const MOOD_HEX: Record<DistrictMood, number> = { choke: 0xf0674f, busy: 0xf0b24a, calm: 0x4fd3a1, idle: 0x3d6f8f };
const SUN_MORNING = new THREE.Color(0xffd2a0), SUN_NOON = new THREE.Color(0xfff6e6), SUN_EVENING = new THREE.Color(0xff9a62);
const SKY_MORNING = new THREE.Color(0xd8ecff), SKY_NOON = new THREE.Color(0xeefaf4), SKY_EVENING = new THREE.Color(0xffc9a6);
/** المدينة تملأ هذا القدر من المستطيل الحرّ على المحور الأضيق (بعد توسيطها فيه). */
const FILL = 0.9;
/** المباني أطول قليلاً من مقياس النبض: من بُعد المدينة تُقرأ أبراجاً بطوابق لا ألواحاً مسطّحة. */
const VERT = 1.32;
/** زاوية المنظر الكامل: أعلى قليلاً من زاوية الحي، فتنبسط الأحياء على عمق اللوحة وتُرى الواجهات معاً. */
const HOME_POL = 0.7;
/** بطاقة المرور (campusCity.css ‏.cc-card): 280 عرضاً ونحو 190 ارتفاعاً، بهامش 14. */
const CARD_W = 280 + 14 + 10, CARD_H = 190 + 14 + 10;
const EDGE = new THREE.Color(0x7fb3a3);
const WINDOW_COOL = new THREE.Color(0x7fb8d4);

interface FrameRect { x: number; y: number; w: number; h: number }

/** واجهة نافذةٍ بألواحٍ رأسية: تُضرب بلون القاعة فتُقرأ نوافذَ مضاءة لا شريطاً واحداً. */
function paneTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 4; i++) {
    const grd = g.createLinearGradient(0, 2, 0, 30);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0.62)");
    g.fillStyle = grd; g.fillRect(2 + i * 15.5, 3, 12.5, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
  /** مقاس اللافتة بالبكسل (يُقاس مرةً بعد تغيّر نصّها) لتفادي التراكب. */
  tagW: number; tagH: number;
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
  private az = 0.2; private pol = HOME_POL; private radius = 120;
  private azT = 0.2; private polT = HOME_POL; private radiusT = 120;
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
  private tmp2 = new THREE.Color();
  private hasChoke = false;
  private edgeMat: THREE.LineBasicMaterial | null = null;
  private roofOf = new Map<string, number>();
  /** مجموعة المباني والقاعات: تُمدّ رأسياً بـ VERT. */
  private city = new THREE.Group();
  /** الإطار: المستطيل الحرّ (ما لا تغطّيه بطاقة المرور) مع توسيط المدينة فيه، وينزلق إلى اللوحة كلها عند الطيران. */
  private homeFrame: FrameRect = { x: 0, y: 0, w: 1, h: 1 };
  private frameNow: FrameRect | null = null;
  private sized = false;

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
    this.city.scale.y = VERT;
    this.scene.add(this.city);
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
      const plateGeo = new RoundedBoxGeometry(d.w, 0.22, d.d, 2, 0.1);
      const plateMat = new THREE.MeshStandardMaterial({ color: bare ? new THREE.Color(0x163430) : tone.clone().lerp(new THREE.Color(0x10302a), 0.82), roughness: 0.95, metalness: 0.02, emissive: tone, emissiveIntensity: 0.04 });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(d.cx, -0.11, d.cz);
      plate.receiveShadow = true;
      plate.userData.dept = d.dept;
      const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.w - 0.1, 0.22, d.d - 0.1));
      const rimMat = new THREE.LineBasicMaterial({ color: tone, transparent: true, opacity: 0.4 });
      const rim = new THREE.LineSegments(rimGeo, rimMat);
      rim.position.copy(plate.position);
      const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: MOOD_HEX.idle, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.scale.set(d.w * 1.35, d.d * 1.35, 1);
      glow.position.set(d.cx, 0.02, d.cz);
      glow.renderOrder = 1;
      this.scene.add(plate, rim, glow);
      this.disposables.push(plateGeo, plateMat, rimGeo, rimMat, glowMat);
      const tag = document.createElement("div");
      tag.className = "cc-tag";
      this.opts.labels.appendChild(tag);
      /* اللافتة فوق أعلى مباني الحي مباشرةً، لا في أرضه الأمامية. */
      const rig: PlateRig = { dept: d.dept, plate, rim, glow, tag, tagPos: new THREE.Vector3(d.cx, bare ? 0.3 : d.top * VERT + 0.5, d.cz), tagW: 0, tagH: 0, want: null, glowO: 0, glowC: new THREE.Color(MOOD_HEX.idle) };
      this.plates.push(rig);
      this.plateByDept.set(d.dept, rig);
    }

    /* المباني: بلاطة لكل طابقٍ بحافةٍ فاتحة تُقرأ خطَّ طابق، وإطار سطحٍ مفتوح (يُرى منه منسوب القاعات
       العليا من فوق)، وأعمدةٌ رفيعة في الأركان. والمبنى المشترك بشريطٍ أمامي مقسومٍ على أقسامه. */
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x2b5d52, roughness: 0.8, metalness: 0.06, emissive: 0x9fd8c4, emissiveIntensity: 0.06 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9cc4b7, roughness: 0.55, metalness: 0.15, emissive: 0x9fd8c4, emissiveIntensity: 0.08 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6f9c8f, roughness: 0.6, metalness: 0.15 });
    this.disposables.push(slabMat, roofMat, postMat);
    for (const b of L.buildings) {
      const roof = (b.floors - 1) * FLOOR_H + HALL_H + 0.1;
      this.roofOf.set(b.code, roof);
      const slabGeo = new RoundedBoxGeometry(b.w + 0.4, 0.18, b.d + 0.4, 2, 0.06);
      const railX = new THREE.BoxGeometry(b.w + 0.5, 0.22, 0.16), railZ = new THREE.BoxGeometry(0.16, 0.22, b.d + 0.5);
      const postGeo = new THREE.BoxGeometry(0.14, roof + 0.1, 0.14);
      postGeo.translate(0, (roof + 0.1) / 2 - 0.1, 0);
      this.disposables.push(slabGeo, railX, railZ, postGeo);
      for (let f = 0; f < b.floors; f++) {
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(b.cx, f * FLOOR_H - 0.06, b.cz);
        slab.receiveShadow = true; slab.castShadow = true;
        this.city.add(slab);
      }
      for (const sz of [-1, 1]) { const rail = new THREE.Mesh(railX, roofMat); rail.position.set(b.cx, roof + 0.11, b.cz + sz * (b.d / 2 + 0.17)); rail.castShadow = true; this.city.add(rail); }
      for (const sx of [-1, 1]) { const rail = new THREE.Mesh(railZ, roofMat); rail.position.set(b.cx + sx * (b.w / 2 + 0.17), roof + 0.11, b.cz); rail.castShadow = true; this.city.add(rail); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(b.cx + sx * (b.w / 2 + 0.08), 0, b.cz + sz * (b.d / 2 + 0.08));
        post.castShadow = true;
        this.city.add(post);
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
          this.city.add(bar);
          this.disposables.push(geo, mat);
          x0 += w;
        }
      }
      const el = document.createElement("div");
      el.className = "cc-tag cc-tag-building";
      el.textContent = b.shared ? `${b.label} · مشترك` : b.label;
      this.opts.labels.appendChild(el);
      this.buildingTags.push({ el, pos: new THREE.Vector3(b.cx, 0.05, b.cz + b.d / 2 + 1) });
    }

    /* القاعات: ثلاث دفعاتٍ لكل القاعات. */
    const n = Math.max(1, this.hallKeys.length);
    const shellGeo = new RoundedBoxGeometry(HALL_W, HALL_H, HALL_D, 2, 0.16);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, emissive: 0x123a32, emissiveIntensity: 0.5 });
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
    const winGeo = new THREE.PlaneGeometry(HALL_W * 0.8, HALL_H * 0.5);
    const paneTex = paneTexture();
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: paneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.disposables.push(paneTex);
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
      this.m4.makeTranslation(s.x, s.y + HALL_H * 0.06, s.z + HALL_D / 2 + 0.014);
      this.wins.setMatrixAt(i, this.m4);
      this.wins.setColorAt(i, DARK);
      this.m4.makeScale(0, 0, 0);
      this.fills.setMatrixAt(i, this.m4);
      this.fills.setColorAt(i, GLASS);
      this.beacons.setMatrixAt(i, this.m4);
      this.hallState.push({ visual: { color: GLASS.getHex(), level: 0, occupied: false, pressed: false, dept: this.opts.hallDept.get(key) || 0 }, level: 0, color: GLASS.clone(), win: 0 });
    });
    this.city.add(this.fills, this.shells, this.wins);
    this.scene.add(this.beacons);

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
      this.city.add(edges);
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
        for (let x = d.x0 + 1.5; x < d.x0 + d.w - 1; x += 3.4 + rnd() * 2) spotsT.push([x, d.z0 - d.d - STREET / 2, 0.42 + rnd() * 0.3]);
        for (let z = d.z0 - 1.5; z > d.z0 - d.d + 1; z -= 3.6 + rnd() * 2) spotsT.push([d.x0 + d.w + STREET / 2, z, 0.4 + rnd() * 0.3]);
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
      for (let x = d.x0 + 0.6; x <= d.x0 + d.w - 0.5; x += stepX) { lampSpots.push(new THREE.Vector3(x, 0.3, d.z0 + 0.6)); lampSpots.push(new THREE.Vector3(x, 0.3, d.z0 - d.d - 0.6)); }
    }
    if (lampSpots.length) {
      const lampGeo = new THREE.SphereGeometry(0.17, 8, 6);
      this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, toneMapped: false });
      this.lamps = new THREE.InstancedMesh(lampGeo, this.lampMat, lampSpots.length);
      lampSpots.forEach((p, i) => { this.m4.makeTranslation(p.x, p.y, p.z); this.lamps!.setMatrixAt(i, this.m4); });
      this.scene.add(this.lamps);
      this.disposables.push(lampGeo, this.lampMat);
    }

    this.home.set(L.cx, L.height * VERT * 0.25, L.cz);
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
        /* لافتةٌ مدمجة: نقطة المزاج بلونه، والاسم، وشارة المضغوطة إن وُجدت. */
        const key = `${v.mood}|${v.label}|${v.sub}`;
        if (rig.tag.dataset.key === key) continue;
        rig.tag.dataset.key = key;
        rig.tag.dataset.mood = v.mood;
        rig.tag.replaceChildren();
        const dot = document.createElement("i");
        const strong = document.createElement("strong");
        strong.textContent = v.label;
        rig.tag.append(dot, strong);
        if (v.sub) { const b = document.createElement("b"); b.textContent = v.sub; rig.tag.append(b); }
        rig.tagW = 0; rig.tagH = 0;
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
    this.radiusT = Math.max(14, Math.max(d.w, d.d) * 1.15 + d.top * VERT);
    if (this.opts.reduced) { done(); return; }
    this.flight = { dept, at: performance.now(), done };
    this.kick();
  }

  resetView() {
    this.focusDept = null; this.flight = null;
    this.targetT.copy(this.home); this.radiusT = this.homeRadius; this.polT = HOME_POL; this.azT = 0.2;
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
  /**
   * الإطار الآلي على حدود المدينة الفعلية: زوايا كل حيٍّ بارتفاع أعلى مبانيه (لا مستطيل المدينة كله
   * بأعلى برجٍ فيها). أقرب بُعدٍ تملأ فيه المدينةُ FILL من المستطيل الحرّ على محوره الأضيق، ثم توسيطٌ
   * لمركزها المرسوم فيه، ثم إزاحتها عن ركن بطاقة المرور (يمنةً أو صعوداً في الفسحة الباقية) أو إبعادها
   * قليلاً حتى لا تغطّي البطاقةُ حيّاً. يُعاد عند كل تغيّرٍ في مقاس اللوحة.
   */
  private fitHome() {
    const W = this.W, H = this.H, top = 34, tools = 58, pad = 12;
    const R: FrameRect = { x: pad, y: top, w: Math.max(120, W - pad - tools), h: Math.max(120, H - top - pad) };
    const card = { x0: 0, x1: Math.min(W, CARD_W), y0: Math.max(0, H - CARD_H), y1: H };
    const groups = this.opts.layout.districts.map(d => {
      const out: THREE.Vector3[] = [];
      for (const x of [d.x0, d.x0 + d.w]) for (const z of [d.z0 - d.d, d.z0]) for (const y of [-0.2, d.top * VERT + 0.6]) out.push(new THREE.Vector3(x, y, z));
      return out;
    });
    const cam = this.camera.clone();
    cam.clearViewOffset();
    cam.aspect = R.w / R.h; cam.updateProjectionMatrix();
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const boxes: Box[] = groups.map(() => ({ x0: 0, x1: 0, y0: 0, y1: 0 }));
    const all: Box = { x0: 0, x1: 0, y0: 0, y1: 0 };
    const measure = (r: number) => {
      const s = Math.sin(this.polT);
      cam.position.set(this.home.x + r * s * Math.sin(this.azT), this.home.y + r * Math.cos(this.polT), this.home.z + r * s * Math.cos(this.azT));
      cam.lookAt(this.home); cam.updateMatrixWorld();
      all.x0 = all.y0 = Infinity; all.x1 = all.y1 = -Infinity;
      for (let i = 0; i < groups.length; i++) {
        const b = boxes[i];
        b.x0 = b.y0 = Infinity; b.x1 = b.y1 = -Infinity;
        for (const c of groups[i]) {
          const p = this.v3.copy(c).project(cam);
          if (p.z > 1) return false;
          b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
        }
        all.x0 = Math.min(all.x0, b.x0); all.x1 = Math.max(all.x1, b.x1); all.y0 = Math.min(all.y0, b.y0); all.y1 = Math.max(all.y1, b.y1);
      }
      return Math.max(all.x1 - all.x0, all.y1 - all.y0) / 2 <= FILL;
    };
    let lo = 6, hi = 800;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (measure(mid)) hi = mid; else lo = mid; }
    /* من إحداثيات صورة المستطيل إلى بكسل اللوحة، بعد إزاحة (dx, dy). */
    const px = (b: Box, dx: number, dy: number): Box => ({
      x0: R.x + dx + ((b.x0 + 1) / 2) * R.w, x1: R.x + dx + ((b.x1 + 1) / 2) * R.w,
      y0: R.y + dy + ((1 - b.y1) / 2) * R.h, y1: R.y + dy + ((1 - b.y0) / 2) * R.h,
    });
    const under = (q: Box) => q.x0 < card.x1 && q.x1 > card.x0 && q.y0 < card.y1 && q.y1 > card.y0;
    const hits = (dx: number, dy: number) => boxes.some(b => under(px(b, dx, dy)));
    let r = hi, dx = 0, dy = 0;
    for (let tries = 0; tries < 24; tries++) {
      measure(r);
      dx = (-(all.x0 + all.x1) / 2) * (R.w / 2); dy = ((all.y0 + all.y1) / 2) * (R.h / 2);
      if (!hits(dx, dy)) break;
      const city = px(all, dx, dy);
      const needX = Math.max(0, ...boxes.map(b => { const q = px(b, dx, dy); return under(q) ? card.x1 - q.x0 : 0; }));
      const needY = Math.max(0, ...boxes.map(b => { const q = px(b, dx, dy); return under(q) ? q.y1 - card.y0 : 0; }));
      const sx = Math.min(Math.max(0, R.x + R.w - city.x1), needX), sy = Math.min(Math.max(0, city.y0 - R.y), needY);
      if (!hits(dx + sx, dy)) { dx += sx; break; }
      if (!hits(dx, dy - sy)) { dy -= sy; break; }
      if (!hits(dx + sx, dy - sy)) { dx += sx; dy -= sy; break; }
      r *= 1.05;
    }
    this.homeRadius = r;
    this.homeFrame = { x: R.x + dx, y: R.y + dy, w: R.w, h: R.h };
  }

  /** الإسقاط من الإطار الجاري: صورة الكاميرا بقياس المستطيل، واللوحة نافذةٌ عليها. */
  private applyFrame() {
    const f = this.frameNow;
    if (!f) { this.camera.aspect = this.W / this.H; this.camera.clearViewOffset(); }
    else { this.camera.aspect = f.w / f.h; this.camera.setViewOffset(Math.max(1, f.w), Math.max(1, f.h), -f.x, -f.y, this.W, this.H); }
    this.camera.updateProjectionMatrix();
  }

  private resize() {
    const r = this.opts.host.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width)); this.H = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.W, this.H, false);
    const ratio = this.sized ? this.radiusT / this.homeRadius : 1;
    this.fitHome();
    if (!this.sized) {
      this.sized = true;
      this.radiusT = this.homeRadius;
      this.radius = this.homeRadius * (this.opts.reduced ? 1 : 1.18);
      this.frameNow = { ...this.homeFrame };
    } else if (this.focusDept == null) this.radiusT = this.homeRadius * ratio;
    if (this.opts.reduced || !this.frameNow) this.frameNow = this.focusDept == null ? { ...this.homeFrame } : { x: 0, y: 0, w: this.W, h: this.H };
    this.applyFrame();
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
    /* الإطار: المستطيل الحرّ في المنظر الكامل، واللوحة كلها حين يُطار إلى حي. */
    if (this.frameNow) {
      const f = this.frameNow, goal = this.focusDept == null ? this.homeFrame : { x: 0, y: 0, w: this.W, h: this.H };
      f.x += (goal.x - f.x) * kc; f.y += (goal.y - f.y) * kc; f.w += (goal.w - f.w) * kc; f.h += (goal.h - f.h) * kc;
      if (Math.abs(goal.x - f.x) + Math.abs(goal.y - f.y) + Math.abs(goal.w - f.w) + Math.abs(goal.h - f.h) > 0.5) busy = true;
      else Object.assign(f, goal);
      this.applyFrame();
    }
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
      /* النافذة: دافئةٌ بلون ملاءمتها حين تُشغل، وزرقاء خافتة حين تفرغ فتبقى الواجهة مقروءة. */
      this.tmp.copy(st.color).lerp(WINDOW_WARM, 0.5).multiplyScalar(st.win * 1.05);
      this.tmp.add(this.tmp2.copy(WINDOW_COOL).multiplyScalar((1 - st.win) * 0.16));
      if (dim) this.tmp.multiplyScalar(0.35);
      this.wins.setColorAt(i, this.tmp);
      /* ▲ فوق سطح المبنى (لا بين طوابقه) حيث تُرى من فوق. */
      const top = (this.roofOf.get(spot.building) ?? spot.y + HALL_H / 2) * VERT + 1 + (reduced ? 0 : Math.sin(now / 380 + i) * 0.14);
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

  /**
   * لافتات الأحياء فوق مبانيها، ولا تتراكب: الأقرب إلى الناظر (الأدنى في اللوحة) يبقى في مكانه،
   * وما يصطدم به يُرفع فوقه بقدر التراكب وحده.
   */
  private placeTags() {
    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const items: Array<{ rig: PlateRig; x: number; y: number }> = [];
    for (const rig of this.plates) {
      this.v3.copy(rig.tagPos).project(this.camera);
      const off = this.v3.z > 1 || Math.abs(this.v3.x) > 1.1 || Math.abs(this.v3.y) > 1.1 || !rig.want;
      rig.tag.style.visibility = off ? "hidden" : "visible";
      if (off) continue;
      if (!rig.tagW) { rig.tagW = rig.tag.offsetWidth; rig.tagH = rig.tag.offsetHeight; }
      items.push({ rig, x: ((this.v3.x + 1) / 2) * this.W, y: ((1 - this.v3.y) / 2) * this.H });
    }
    items.sort((a, b) => b.y - a.y);
    for (const it of items) {
      const w = it.rig.tagW + 6, h = it.rig.tagH + 4;
      const x = THREE.MathUtils.clamp(it.x, w / 2 + 4, this.W - w / 2 - 4);
      let bottom = it.y - 6;
      for (let pass = 0; pass < 8; pass++) {
        const hit = placed.find(r => x - w / 2 < r.x1 && x + w / 2 > r.x0 && bottom - h < r.y1 && bottom > r.y0);
        if (!hit) break;
        bottom = hit.y0;
      }
      bottom = Math.max(bottom, h + 4);
      placed.push({ x0: x - w / 2, x1: x + w / 2, y0: bottom - h, y1: bottom });
      it.rig.tag.style.transform = `translate(-50%,-100%) translate(${Math.round(x)}px,${Math.round(bottom)}px)`;
    }
    const near = this.radius < this.homeRadius * 0.7;
    for (const t of this.buildingTags) {
      t.el.hidden = !near;
      if (!near) continue;
      this.v3.copy(t.pos).project(this.camera);
      const off = this.v3.z > 1 || Math.abs(this.v3.x) > 1.1 || Math.abs(this.v3.y) > 1.1;
      t.el.style.visibility = off ? "hidden" : "visible";
      if (!off) t.el.style.transform = `translate(-50%,-50%) translate(${((this.v3.x + 1) / 2) * this.W}px,${((1 - this.v3.y) / 2) * this.H}px)`;
    }
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

/**
 * ── مشهد الحرم الحي (three.js) ───────────────────────────────────────────────
 *
 * امتدادٌ لفكرة «نبض القاعات»: مبانٍ من قاعات اليوم، تتنفّس مع ضوء النهار، وتضيء
 * القاعة التي فيها محاضرةٌ الآن، ويرتفع عمودٌ أحمر فوق المبنى الذي فيه تعارض.
 * يُحمَّل كسولاً مع three.js، ولا يعرف شيئاً عن الجدول ولا يكتب شيئاً، ويُفرغ
 * كل ما أنشأه على الـGPU عند الإغلاق.
 */
import * as THREE from "three";
import type { CampusBuilding } from "../../utils/campusLive";

const SAND = new THREE.Color(0xe9e2d3);
const JADE = new THREE.Color(0x1f6b5c);
const MARK = new THREE.Color(0x5fbfa6);
const COPPER = new THREE.Color(0xc79b5f);
const RED = new THREE.Color(0xc2412d);

const HALL = 1.25, GAP = 0.18, FLOOR = 1.05;

interface HallRig { mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>; running: boolean; used: boolean; conflict: boolean; phase: number }
interface BuildingRig {
  code: string;
  group: THREE.Group;
  base: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  halls: HallRig[];
  column: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> | null;
  columnHeight: number;
  top: number;
  tag: HTMLSpanElement;
}

export class CampusScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  private rigs: BuildingRig[] = [];
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private raf = 0;
  private start = performance.now();
  private radius = 30;
  private center = new THREE.Vector3();
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private visible = true;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private v3 = new THREE.Vector3();
  private hovered: string | null = null;
  private disposables: Array<{ dispose: () => void }> = [];
  private disposed = false;
  private daylight: number;

  constructor(private opts: {
    canvas: HTMLCanvasElement;
    host: HTMLElement;
    labels: HTMLElement;
    buildings: CampusBuilding[];
    daylight: number;
    onPick?: (code: string) => void;
  }) {
    this.daylight = opts.daylight;
    const renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true });
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.hemi = new THREE.HemisphereLight(0xeef6f2, 0x0b1d19, 0.6 + opts.daylight * 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 0.35 + opts.daylight * 1.1);
    this.sun.position.set(-16, 26, 14);
    this.scene.add(this.sun);

    this.build(opts.buildings);

    opts.canvas.addEventListener("pointermove", this.onMove);
    opts.canvas.addEventListener("pointerleave", this.onLeave);
    opts.canvas.addEventListener("click", this.onClick);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.host);
    this.io = new IntersectionObserver(entries => { this.visible = entries.some(entry => entry.isIntersecting); if (this.visible) this.loop(); }, { threshold: 0.05 });
    this.io.observe(opts.host);
    this.resize();
    this.loop();
  }

  private build(buildings: CampusBuilding[]) {
    const hallGeo = new THREE.BoxGeometry(HALL, FLOOR * 0.86, HALL);
    const baseGeo = new THREE.BoxGeometry(1, 0.3, 1);
    const colGeo = new THREE.CylinderGeometry(0.32, 0.32, 1, 20, 1, true);
    this.disposables.push(hallGeo, baseGeo, colGeo);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x163a33, roughness: 1, transparent: true, opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    this.disposables.push(ground.geometry, ground.material as THREE.Material);
    this.scene.add(ground);

    const perRow = Math.max(1, Math.ceil(Math.sqrt(buildings.length)));
    let spanX = 0, spanZ = 0;
    buildings.forEach((building, index) => {
      const count = Math.max(1, building.halls.length);
      const cols = Math.min(3, Math.ceil(Math.sqrt(count)));
      const floors = Math.ceil(count / (cols * cols)) || 1;
      const footprint = cols * (HALL + GAP);
      const group = new THREE.Group();
      const gx = (index % perRow) * (footprint + 4.5 > 9 ? footprint + 4.5 : 9);
      const gz = Math.floor(index / perRow) * 9;
      group.position.set(gx, 0, gz);
      spanX = Math.max(spanX, gx); spanZ = Math.max(spanZ, gz);

      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x2b4a43, roughness: 0.9 }));
      base.scale.set(footprint + 0.8, 1, footprint + 0.8);
      base.position.y = 0.15;
      this.disposables.push(base.material);
      group.add(base);

      const halls: HallRig[] = [];
      building.halls.forEach((hall, h) => {
        const floor = Math.floor(h / (cols * cols));
        const cell = h % (cols * cols);
        const cx = (cell % cols) - (cols - 1) / 2, cz = Math.floor(cell / cols) - (cols - 1) / 2;
        const material = new THREE.MeshStandardMaterial({ color: SAND.clone(), roughness: 0.55, metalness: 0.05, emissive: new THREE.Color(0x000000) });
        this.disposables.push(material);
        const mesh = new THREE.Mesh(hallGeo, material);
        mesh.position.set(cx * (HALL + GAP), 0.3 + FLOOR * floor + FLOOR / 2, cz * (HALL + GAP));
        mesh.userData.building = building.code;
        group.add(mesh);
        halls.push({ mesh, running: hall.runningNow, used: hall.lectures > 0, conflict: hall.conflict, phase: h * 0.7 });
      });
      const top = 0.3 + FLOOR * floors;

      let column: BuildingRig["column"] = null;
      const columnHeight = building.conflicts ? Math.min(5.5, 2.6 + building.conflicts * 0.8) : 0;
      if (building.conflicts) {
        const material = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.6, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
        this.disposables.push(material);
        column = new THREE.Mesh(colGeo, material);
        column.position.set(0, top, 0);
        column.scale.set(1, 0.001, 1);
        column.userData.building = building.code;
        group.add(column);
      }

      const tag = document.createElement("span");
      tag.className = `cl-tag${building.conflicts ? " has-conflict" : ""}${building.runningNow ? " has-live" : ""}`;
      tag.textContent = building.code;
      tag.setAttribute("aria-hidden", "true");
      tag.addEventListener("click", () => this.opts.onPick?.(building.code));
      this.opts.labels.appendChild(tag);

      this.scene.add(group);
      this.rigs.push({ code: building.code, group, base, halls, column, columnHeight, top, tag });
    });

    this.center.set(spanX / 2, 0, spanZ / 2);
    const extent = Math.max(spanX, spanZ, 8);
    ground.scale.setScalar(extent * 0.9 + 8);
    ground.position.set(this.center.x, 0, this.center.z);
    this.radius = extent * 1.05 + 11;
  }

  private resize() {
    const rect = this.opts.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    /* شاشةٌ ضيّقة: الكاميرا أبعد قليلاً فلا يخرج مبنى عن الإطار. */
    this.camera.fov = w < 520 ? 44 : 34;
    this.camera.updateProjectionMatrix();
  }

  private pick(event: PointerEvent | MouseEvent): string | null {
    const rect = this.opts.canvas.getBoundingClientRect();
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const targets: THREE.Object3D[] = [];
    this.rigs.forEach(rig => { rig.halls.forEach(hall => targets.push(hall.mesh)); if (rig.column) targets.push(rig.column); });
    const hit = this.ray.intersectObjects(targets, false)[0];
    return (hit?.object.userData.building as string) || null;
  }
  private onMove = (event: PointerEvent) => {
    const code = this.pick(event);
    this.hovered = code;
    this.opts.canvas.style.cursor = code && this.opts.onPick ? "pointer" : "";
  };
  private onLeave = () => { this.hovered = null; this.opts.canvas.style.cursor = ""; };
  private onClick = (event: MouseEvent) => {
    const code = this.pick(event);
    if (code) this.opts.onPick?.(code);
  };

  private loop = () => {
    if (this.disposed || !this.visible) return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    const t = (now - this.start) / 1000;
    /* دورانٌ بطيء حول الحرم. */
    const az = 0.55 + t * 0.05;
    this.camera.position.set(this.center.x + Math.sin(az) * this.radius, this.radius * 0.62, this.center.z + Math.cos(az) * this.radius);
    this.camera.lookAt(this.center.x, 2, this.center.z);

    /* التنفّس: نبضٌ بطيء، أوسع في النهار وأهدأ في الليل. */
    const breathe = 1 + Math.sin(t * 0.9) * (0.008 + this.daylight * 0.018);
    this.rigs.forEach(rig => {
      const hovered = this.hovered === rig.code;
      rig.group.scale.set(1, breathe, 1);
      rig.base.material.color.set(hovered ? 0x3b6a60 : 0x2b4a43);
      rig.halls.forEach(hall => {
        const m = hall.mesh.material;
        if (hall.running) {
          const glow = 0.65 + Math.sin(t * 2.2 + hall.phase) * 0.25;
          m.color.copy(MARK);
          m.emissive.copy(JADE).multiplyScalar(glow);
        } else if (hall.conflict) {
          m.color.copy(SAND).lerp(RED, 0.55);
          m.emissive.setRGB(0, 0, 0);
        } else {
          m.color.copy(SAND).lerp(COPPER, hall.used ? 0.22 : 0);
          m.emissive.setRGB(0, 0, 0);
        }
      });
      if (rig.column) {
        const rise = Math.min(1, t / 1.6);
        const eased = 1 - Math.pow(1 - rise, 3);
        const height = Math.max(0.001, rig.columnHeight * eased);
        rig.column.scale.set(1, height, 1);
        rig.column.position.y = rig.top + height / 2;
        rig.column.material.emissiveIntensity = 0.45 + Math.sin(t * 3) * 0.25;
      }
      /* اسم المبنى فوقه (أو فوق عموده). */
      this.v3.set(0, rig.top + (rig.column ? rig.columnHeight : 0) + 0.6, 0).applyMatrix4(rig.group.matrixWorld).project(this.camera);
      const w = this.opts.host.clientWidth, h = this.opts.host.clientHeight;
      rig.tag.style.transform = `translate(-50%,-100%) translate(${((this.v3.x + 1) / 2) * w}px,${Math.max(30, ((1 - this.v3.y) / 2) * h)}px)`;
      rig.tag.classList.toggle("is-hover", hovered);
    });

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.opts.canvas.removeEventListener("pointermove", this.onMove);
    this.opts.canvas.removeEventListener("pointerleave", this.onLeave);
    this.opts.canvas.removeEventListener("click", this.onClick);
    this.rigs.forEach(rig => rig.tag.remove());
    this.disposables.forEach(item => item.dispose());
    this.renderer.dispose();
  }
}

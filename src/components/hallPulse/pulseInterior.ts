/**
 * ── «القاعة من الداخل» (three.js) ───────────────────────────────────────────
 *
 * مجسّمٌ صغير لقاعةٍ واحدة يرسمه المشهد نفسه بالراسم نفسه (لا سياق WebGL ثانٍ):
 * مقاعد صفوفاً مدرّجة من سعة القاعة، والمشغول منها ملوّن وعليه طالب، والفارغ هادئ،
 * ومن زاد على السعة يقف عند الباب بالأحمر. يتبع ساعة المشهد: المقاعد تمتلئ وتفرغ
 * بتخفيفٍ ناعم. كل ما فيه InstancedMesh، ويُفرغ ما أنشأه عند الخروج.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SEAT_PITCH_Z, STAND_DRAW_MAX, type SeatLayout } from "../../utils/hallPulseDay";

export interface InteriorData {
  layout: SeatLayout;
  /** لون ملاءمة القاعة الآن. */
  color: number;
  /** نصّ لافتة الواقفين عند الباب؛ فارغ = لا لافتة. */
  standTag: string;
  /** موضع الشمس 0–1 من ساعة المشهد: يلوّن ضوء النوافذ. */
  sun: number;
}

const TIER = 0.17, ROOM_H = 3.6, FRONT = 3.4, BACK = 2.9, SIDE = 1.7;
const WHITE = new THREE.Color(0xffffff), DOOR_WARM = new THREE.Color(0xffe2a8);
const EMPTY = new THREE.Color(0x2c4d45), BRASS = new THREE.Color(0xe2bd76), OVER = new THREE.Color(0xf0674f);
const WIN_MORNING = new THREE.Color(0xffd9ad), WIN_NOON = new THREE.Color(0xf4fff9), WIN_EVENING = new THREE.Color(0xffa672);

function spillTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0.85)");
  r.addColorStop(0.4, "rgba(255,255,255,0.3)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HallInterior {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  private disposables: Array<{ dispose: () => void }> = [];
  private seats!: THREE.InstancedMesh;
  private people!: THREE.InstancedMesh;
  private standers!: THREE.InstancedMesh;
  private standMat!: THREE.MeshStandardMaterial;
  private teacher!: THREE.Mesh;
  private windows: THREE.MeshBasicMaterial[] = [];
  private sunLight!: THREE.DirectionalLight;
  private doorGlow!: THREE.MeshBasicMaterial;
  private overSpill!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private overHalo!: THREE.Sprite;
  private occ: Float32Array;
  private stand = new Float32Array(STAND_DRAW_MAX);
  private rank: Int32Array;
  private layout: SeatLayout;
  private color = new THREE.Color(0x4fd3a1);
  private colorT = new THREE.Color(0x4fd3a1);
  private data: InteriorData;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private v3 = new THREE.Vector3();
  private az = -0.62; private pol = 1.22; private radius = 10;
  private azT = -0.62; private polT = 0.93; private radiusT = 10;
  private home = 10;
  private target = new THREE.Vector3();
  private aspect = 1;
  private settled = false;
  readonly tag: HTMLDivElement;

  constructor(data: InteriorData, private opts: { labels: HTMLElement; reduced: boolean }) {
    this.data = data;
    this.layout = data.layout;
    const L = data.layout;
    this.occ = new Float32Array(L.drawn);
    this.rank = new Int32Array(L.drawn);
    L.order.forEach((seat, i) => { this.rank[seat] = i; });
    this.color.setHex(data.color); this.colorT.setHex(data.color);
    this.tag = document.createElement("div");
    this.tag.className = "hp-tag hp-tag-inside";
    this.tag.hidden = true;
    opts.labels.appendChild(this.tag);
    this.build();
    this.apply(data, true);
  }

  private keep<T extends { dispose: () => void }>(x: T): T { this.disposables.push(x); return x; }

  private build() {
    const L = this.layout;
    const W = L.width + SIDE * 2, zFront = -FRONT, zBack = L.depth + BACK, D = zBack - zFront;
    const top = (L.rows - 1) * TIER;
    this.target.set(0, 0.9 + top * 0.4, L.depth * 0.42);

    this.scene.add(new THREE.HemisphereLight(0xe6f5ee, 0x0c211c, 0.95));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.15);
    sun.position.set(-W * 0.9, 9, L.depth * 0.3);
    sun.target.position.set(0, 0, L.depth * 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 6; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    const ext = Math.max(W, D) * 0.75;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = 80;
    sc.updateProjectionMatrix();
    this.sunLight = sun;
    this.scene.add(sun, sun.target);
    const board = new THREE.PointLight(0xdff7ee, 0.9, D * 0.9, 1.4);
    board.position.set(0, 2.2, zFront + 1.2);
    this.scene.add(board);

    /* الغرفة: صندوقٌ يُرى من داخله وحده، فالجدار القريب من الكاميرا لا يحجب المقاعد. */
    const roomGeo = this.keep(new THREE.BoxGeometry(W, ROOM_H + top, D));
    const roomMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x1c463d, roughness: 0.92, metalness: 0, side: THREE.BackSide }));
    const room = new THREE.Mesh(roomGeo, roomMat);
    room.position.set(0, (ROOM_H + top) / 2 - 0.02, (zFront + zBack) / 2);
    room.receiveShadow = true;
    this.scene.add(room);
    /* ظلٌّ ناعم تحت القاعة: كأنها مجسّمٌ على طاولة. */
    const tex = this.keep(spillTexture());
    const underGeo = this.keep(new THREE.PlaneGeometry(1, 1));
    const under = new THREE.Mesh(underGeo, this.keep(new THREE.MeshBasicMaterial({ map: tex, color: 0x061412, transparent: true, opacity: 0.55, depthWrite: false })));
    under.rotation.x = -Math.PI / 2;
    under.scale.set(W * 2.1, D * 2.1, 1);
    under.position.set(0, -0.06, (zFront + zBack) / 2);
    this.scene.add(under);

    /* المدرّج: درجةٌ لكل صف، والمنصّة الخلفية للواقفين. */
    const tierGeo = this.keep(new THREE.BoxGeometry(1, 1, 1));
    const tierMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x173a33, roughness: 0.85 }));
    const tiers = new THREE.InstancedMesh(tierGeo, tierMat, L.rows + 1);
    for (let r = 0; r <= L.rows; r++) {
      const last = r === L.rows;
      const h = Math.max(0.02, (last ? top : r * TIER));
      const z0 = last ? L.rows * SEAT_PITCH_Z - 0.65 : r * SEAT_PITCH_Z - 0.65, z1 = last ? zBack : (r + 1) * SEAT_PITCH_Z - 0.65;
      this.p.set(0, h / 2, (z0 + z1) / 2); this.s.set(W - 0.02, h, z1 - z0);
      tiers.setMatrixAt(r, this.m4.compose(this.p, this.q, this.s));
    }
    tiers.receiveShadow = true;
    this.scene.add(tiers);

    /* السبورة: لوحٌ مضيء على الجدار الأمامي، ومنبرٌ صغير. */
    const boardW = Math.min(W * 0.62, 9);
    const boardGeo = this.keep(new THREE.PlaneGeometry(boardW, 1.55));
    const boardMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xd9f3ea, toneMapped: false, transparent: true, opacity: 0.92 }));
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.set(0, 1.95, zFront + 0.03);
    const frameGeo = this.keep(new THREE.PlaneGeometry(boardW + 0.24, 1.79));
    const frame = new THREE.Mesh(frameGeo, this.keep(new THREE.MeshBasicMaterial({ color: 0x0c2a24 })));
    frame.position.set(0, 1.95, zFront + 0.02);
    const lecternGeo = this.keep(new THREE.BoxGeometry(0.8, 1.05, 0.5));
    const lectern = new THREE.Mesh(lecternGeo, this.keep(new THREE.MeshStandardMaterial({ color: 0x24574c, roughness: 0.6 })));
    lectern.position.set(-boardW * 0.32, 0.52, zFront + 1.5);
    lectern.castShadow = true;
    this.scene.add(frame, boardMesh, lectern);

    /* النوافذ على الجدار الأيسر: ضوؤها يتبع ساعة المشهد. */
    const winGeo = this.keep(new THREE.PlaneGeometry(1.5, 1.5));
    const winCount = Math.max(2, Math.min(6, Math.round(D / 3.2)));
    for (let i = 0; i < winCount; i++) {
      const mat = this.keep(new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false, transparent: true, opacity: 0.85 }));
      const w = new THREE.Mesh(winGeo, mat);
      w.rotation.y = Math.PI / 2;
      w.position.set(-W / 2 + 0.03, 2.05 + top * 0.5, zFront + (D * (i + 0.5)) / winCount);
      this.windows.push(mat);
      this.scene.add(w);
    }

    /* الباب في الجدار الأيمن عند آخر القاعة: منه يدخل الضوء، وعنده يقف من لا مقعد له. */
    const doorZ = Math.min(zBack - 0.9, L.door.z + 0.2);
    const doorGeo = this.keep(new THREE.PlaneGeometry(1.25, 2.25));
    this.doorGlow = this.keep(new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false, transparent: true, opacity: 0.9 }));
    const door = new THREE.Mesh(doorGeo, this.doorGlow);
    door.rotation.y = -Math.PI / 2;
    door.position.set(W / 2 - 0.03, top + 1.13, doorZ);
    const doorFrameGeo = this.keep(new THREE.PlaneGeometry(1.5, 2.42));
    const doorFrame = new THREE.Mesh(doorFrameGeo, this.keep(new THREE.MeshBasicMaterial({ color: 0x0c2a24 })));
    doorFrame.rotation.y = -Math.PI / 2;
    doorFrame.position.set(W / 2 - 0.02, top + 1.2, doorZ);
    this.scene.add(doorFrame, door);
    this.overSpill = new THREE.Mesh(underGeo, this.keep(new THREE.MeshBasicMaterial({ map: tex, color: 0xf0674f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.overSpill.rotation.x = -Math.PI / 2;
    this.overSpill.position.set(W / 2 - 2.6, top + 0.02, L.depth + 1.2);
    this.overSpill.scale.set(7, 3.6, 1);
    this.overHalo = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: tex, color: 0xf0674f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.overHalo.scale.set(5.5, 3.4, 1);
    this.overHalo.position.set(W / 2 - 2.4, top + 1.1, L.depth + 1.1);
    this.scene.add(this.overSpill, this.overHalo);

    /* المقعد: قاعدةٌ ومسند في هندسةٍ واحدة. */
    const base = new THREE.BoxGeometry(0.66, 0.1, 0.58); base.translate(0, 0.42, 0);
    const back = new THREE.BoxGeometry(0.66, 0.5, 0.09); back.translate(0, 0.69, 0.29);
    const leg = new THREE.BoxGeometry(0.1, 0.4, 0.1); leg.translate(0, 0.2, 0.05);
    const seatGeo = this.keep(mergeGeometries([base, back, leg])!);
    base.dispose(); back.dispose(); leg.dispose();
    const seatMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 }));
    this.seats = new THREE.InstancedMesh(seatGeo, seatMat, L.drawn);
    this.seats.castShadow = true; this.seats.receiveShadow = true;
    L.seats.forEach((st, i) => {
      this.p.set(st.x, st.row * TIER, st.z); this.s.set(1, 1, 1);
      this.seats.setMatrixAt(i, this.m4.compose(this.p, this.q, this.s));
      this.seats.setColorAt(i, EMPTY);
    });
    this.scene.add(this.seats);

    /* الطالب: جذعٌ ورأس. جالسٌ على المقعد، أو واقفٌ عند الباب. */
    const body = new THREE.CapsuleGeometry(0.19, 0.3, 4, 10); body.translate(0, 0.78, -0.02);
    const head = new THREE.SphereGeometry(0.155, 14, 10); head.translate(0, 1.2, -0.02);
    const personGeo = this.keep(mergeGeometries([body, head])!);
    body.dispose(); head.dispose();
    const personMat = this.keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 }));
    this.people = new THREE.InstancedMesh(personGeo, personMat, L.drawn);
    this.people.castShadow = true;
    this.people.frustumCulled = false;
    this.scene.add(this.people);
    const sBody = new THREE.CapsuleGeometry(0.19, 0.82, 4, 10); sBody.translate(0, 0.6, 0);
    const sHead = new THREE.SphereGeometry(0.16, 14, 10); sHead.translate(0, 1.38, 0);
    const standGeo = this.keep(mergeGeometries([sBody, sHead])!);
    sBody.dispose(); sHead.dispose();
    this.standMat = this.keep(new THREE.MeshStandardMaterial({ color: OVER, emissive: OVER, emissiveIntensity: 0.45, roughness: 0.45 }));
    this.standers = new THREE.InstancedMesh(standGeo, this.standMat, STAND_DRAW_MAX);
    this.standers.castShadow = true;
    this.standers.frustumCulled = false;
    this.scene.add(this.standers);
    this.teacher = new THREE.Mesh(standGeo, this.keep(new THREE.MeshStandardMaterial({ color: BRASS, emissive: BRASS, emissiveIntensity: 0.25, roughness: 0.5 })));
    this.teacher.position.set(boardW * 0.12, 0, zFront + 1.6);
    this.teacher.castShadow = true;
    this.scene.add(this.teacher);
  }

  /** حالة القاعة الآن: من يجلس ومن يقف ولونها وضوء نوافذها. */
  apply(data: InteriorData, instant = false) {
    this.data = data;
    this.colorT.setHex(data.color);
    if (instant) this.color.copy(this.colorT);
    if (this.tag.textContent !== data.standTag) this.tag.textContent = data.standTag;
    const t = THREE.MathUtils.clamp(data.sun, 0, 1);
    const a = t < 0.5 ? WIN_MORNING : WIN_NOON, b = t < 0.5 ? WIN_NOON : WIN_EVENING, f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    this.c.copy(a).lerp(b, f);
    this.windows.forEach(m => m.color.copy(this.c));
    this.sunLight.color.copy(this.c);
    this.sunLight.intensity = 0.75 + 0.5 * Math.sin(Math.PI * (0.15 + 0.7 * t));
    if (instant || this.opts.reduced) {
      const L = data.layout;
      for (let i = 0; i < this.occ.length; i++) this.occ[i] = this.rank[i] < L.occupied ? 1 : 0;
      for (let i = 0; i < STAND_DRAW_MAX; i++) this.stand[i] = i < L.standing ? 1 : 0;
    }
    this.settled = false;
  }

  /** الكاميرا: تبدأ عند مستوى العين قريبةً ثم ترتفع إلى منظرٍ يُري القاعة كلها. */
  frameFor(aspect: number, arrive: boolean) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const L = this.layout;
    const W = L.width + SIDE * 2, D = L.depth + BACK + FRONT;
    const vfov = (this.camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const byW = (Math.hypot(W, D * 0.7) * 0.56) / Math.tan(hfov / 2), byH = (D * 0.62 + 3.2) / Math.tan(vfov / 2) * 0.6;
    this.home = Math.max(9, byW, byH) * 1.04;
    this.radiusT = this.home; this.polT = aspect < 0.9 ? 0.78 : 0.93; this.azT = -0.62;
    if (arrive && !this.opts.reduced) { this.radius = this.home * 0.42; this.pol = 1.3; this.az = -0.95; }
    else if (arrive) { this.radius = this.radiusT; this.pol = this.polT; this.az = this.azT; }
    this.settled = false;
  }

  orbit(dAz: number, dPol: number) {
    this.azT = THREE.MathUtils.clamp(this.azT + dAz, -1.5, 0.9);
    this.polT = THREE.MathUtils.clamp(this.polT + dPol, 0.3, 1.38);
    this.settled = false;
  }
  zoom(f: number) { this.radiusT = THREE.MathUtils.clamp(this.radiusT * f, this.home * 0.4, this.home * 1.5); this.settled = false; }
  reset() { this.frameFor(this.aspect, false); }

  /** يتقدّم إطاراً؛ يعيد true ما دام شيءٌ يتحرّك. */
  tick(dt: number, now: number, W: number, H: number): boolean {
    const reduced = this.opts.reduced;
    let busy = false;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.4);
    this.az += (this.azT - this.az) * k; this.pol += (this.polT - this.pol) * k; this.radius += (this.radiusT - this.radius) * k;
    if (Math.abs(this.azT - this.az) + Math.abs(this.polT - this.pol) + Math.abs(this.radiusT - this.radius) * 0.05 > 0.002) busy = true;
    const sp = Math.sin(this.pol);
    this.camera.position.set(this.target.x + this.radius * sp * Math.sin(this.az), this.target.y + this.radius * Math.cos(this.pol), this.target.z + this.radius * sp * Math.cos(this.az));
    this.camera.lookAt(this.target);

    const L = this.data.layout;
    const ck = reduced ? 1 : 1 - Math.exp(-dt * 5);
    this.color.lerp(this.colorT, ck);
    const top = (L.rows - 1) * TIER;
    if (!this.settled) {
      let moving = false;
      for (let i = 0; i < this.occ.length; i++) {
        const want = this.rank[i] < L.occupied ? 1 : 0;
        /* كل مقعدٍ بسرعته: فيمتلئ الصف موجةً لا دفعةً واحدة. */
        const rate = reduced ? 1 : 1 - Math.exp(-dt * (3 + 5 * ((i * 0.6180339) % 1)));
        const o = this.occ[i] + (want - this.occ[i]) * rate;
        if (Math.abs(want - o) > 0.004) moving = true;
        this.occ[i] = Math.abs(want - o) > 0.004 ? o : want;
        const st = L.seats[i];
        const e = this.occ[i];
        this.p.set(st.x, st.row * TIER + (1 - e) * 0.1, st.z); this.s.setScalar(Math.max(0.0001, e));
        this.people.setMatrixAt(i, this.m4.compose(this.p, this.q, this.s));
        this.c.copy(this.color).lerp(WHITE, 0.18);
        this.people.setColorAt(i, this.c);
        this.c.copy(EMPTY).lerp(this.color, e * 0.62);
        this.seats.setColorAt(i, this.c);
      }
      for (let i = 0; i < STAND_DRAW_MAX; i++) {
        const want = i < L.standing ? 1 : 0;
        const o = this.stand[i] + (want - this.stand[i]) * (reduced ? 1 : 1 - Math.exp(-dt * (4 + (i % 5))));
        if (Math.abs(want - o) > 0.004) moving = true;
        this.stand[i] = Math.abs(want - o) > 0.004 ? o : want;
        const spot = L.stand[i] || L.stand[L.stand.length - 1] || { x: 0, z: 0 };
        this.p.set(spot.x, top, spot.z); this.s.setScalar(Math.max(0.0001, this.stand[i]));
        this.standers.setMatrixAt(i, this.m4.compose(this.p, this.q, this.s));
      }
      this.people.instanceMatrix.needsUpdate = true; this.standers.instanceMatrix.needsUpdate = true;
      if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
      if (this.seats.instanceColor) this.seats.instanceColor.needsUpdate = true;
      if (moving || this.color.getHex() !== this.colorT.getHex()) busy = true; else this.settled = true;
    }
    this.teacher.visible = L.occupied > 0 || L.standing > 0;
    /* الواقفون ينبضون بالأحمر، وضوؤهم على الأرض وعند الباب. */
    const over = L.standing > 0;
    const breathe = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(now / 420);
    this.standMat.emissiveIntensity = 0.35 + 0.4 * breathe;
    const spill = this.overSpill.material, halo = this.overHalo.material as THREE.SpriteMaterial;
    spill.opacity += ((over ? 0.3 + 0.2 * breathe : 0) - spill.opacity) * ck;
    halo.opacity += ((over ? 0.16 + 0.12 * breathe : 0) - halo.opacity) * ck;
    this.doorGlow.color.copy(over ? OVER : DOOR_WARM).lerp(DOOR_WARM, over ? 0.35 : 0);
    if (over && !reduced) busy = true;

    /* لافتة الواقفين فوق رؤوسهم. */
    const show = over && Boolean(this.data.standTag);
    this.tag.hidden = !show;
    if (show) {
      const mid = L.stand[Math.min(L.stand.length - 1, Math.floor(Math.min(L.standing, 6) / 2))];
      this.v3.set(mid.x, top + 2.05, mid.z).project(this.camera);
      const x = (this.v3.x * 0.5 + 0.5) * W, y = (-this.v3.y * 0.5 + 0.5) * H;
      this.tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    return busy;
  }

  dispose() {
    this.tag.remove();
    this.seats.dispose(); this.people.dispose(); this.standers.dispose();
    this.disposables.forEach(d => d.dispose());
    this.scene.clear();
  }
}

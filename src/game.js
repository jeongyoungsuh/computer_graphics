import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const canvas = document.getElementById("game");
const statusEl = document.getElementById("status");
const promptEl = document.getElementById("prompt");

const PERF = {
  pixelRatio: 1.25,
  shadows: false,
  floorTrim: false,
  maxTorchLights: 6,
  maxArrowLights: 4,
  botAnimationDistance: 22,
  uiUpdateInterval: 0.2,
  minimapUpdateInterval: 0.2,
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.pixelRatio));
renderer.shadowMap.enabled = PERF.shadows;
renderer.shadowMap.type = THREE.BasicShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020306);
scene.fog = new THREE.FogExp2(0x020306, 0.032);

const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 160);
const clock = new THREE.Clock();
const keys = new Set();

const CELL = 4;
const PLAYER_RADIUS = 0.45;
const EYE_HEIGHT = 1.65;
const ARROW_SPEED = 24;
const ARROW_COOLDOWN = 0.4;
const MAX_ARROWS = 25;
const GRAVITY = 18;
const PLAYER_DEATH_OVERLAY_DELAY = 0.82;
const LOADING_MIN_SECONDS = 1.2;
const LOADING_FAILSAFE_SECONDS = 6;
const START_ROOM_ID = "1";
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
const REPORT_SHOT = new URLSearchParams(window.location.search).get("shot") || "";
const REPORT_SHOT_MODE = REPORT_SHOT.length > 0;

const map = [
  "########################################",
  "#111111111111#222222222222#333333333333#",
  "#1..F....O..1#2..L....O..2#3##########3#",
  "#1..........1#2..L.......2#3##########3#",
  "#1..P..T..P.1#2..P.R..P..2#3##########3#",
  "#1..........1#2..O...L..O2#3VVVVVVVVVV3#",
  "#1..F...O...1#2.........F2#33VGVGVGVG33#",
  "#111111111111A222222222222B33VGVGVGVG33#",
  "#1..........1#2..O.......2#3VVVVVVVVVV3#",
  "#1..O.......1#2....R.....2#3VVVVVVVVVV3#",
  "#1.....P....1#2..L.P.L...2#3##########3#",
  "#1..........1#2..O.R..O..2#3##########3#",
  "#111111111111#222222222222#333333333333#",
  "########################################",
].map((row) => row.split(""));

const rooms = [
  { id: "1", name: "Room 1: Guard Training Hall", color: 0x6b2f2f, accent: 0xff6b55, x1: 1, y1: 1, x2: 12, y2: 12 },
  { id: "2", name: "Room 2: Rune Library", color: 0x1f5f6d, accent: 0x66e8ef, x1: 14, y1: 1, x2: 25, y2: 12 },
  { id: "3", name: "Room 3: Throne Vault", color: 0x66542c, accent: 0xf3ca5d, x1: 27, y1: 1, x2: 38, y2: 12 },
];

const state = {
  yaw: 0,
  pitch: 0,
  cameraMode: "third",
  skeletonPanelEnabled: false,
  minimapExpanded: false,
  targetHit: false,
  room1PuzzleSolved: false,
  room2PuzzleSolved: false,
  room2RuneAnswer: "",
  room3BridgeComplete: false,
  room3Falling: false,
  room3FallTimer: 0,
  room3FallVelocity: 0,
  gameWon: false,
  puzzleDoorCell: "",
  puzzleModalOpen: false,
  runeReveal: 0,
  fireSignal: 0,
  fireFlash: 0,
  bowDrawing: false,
  bowDraw: 0,
  bowRelease: 0,
  doorMessage: "",
  doorMessageTimer: 0,
  moving: false,
  sprinting: false,
  jumping: false,
  jumpTimer: 0,
  actionLock: 0,
  brightness: 2.7,
  playerHp: 5,
  playerMaxHp: 5,
  playerDead: false,
  playerDeathStarted: false,
  playerDeathTimer: 0,
  playerDeathDuration: 1.2,
  playerHitFlash: 0,
  arrowCooldown: 0,
  arrowsRemaining: MAX_ARROWS,
  gameReady: false,
  loadingStartedAt: performance.now(),
};

const player = {
  pos: tileToWorld(...initialPlayerTile()),
  velY: 0,
};
player.pos.y = 0;

const arrows = [];
const stuckArrows = [];
const colliders = [];
const room1Pillars = [];
const room2RuneClues = [];
const ROOM2_RUNE_SYMBOLS = ["A", "N", "K"];
const room3BridgeTiles = [];
const ROOM3_BRIDGE_STEPS = [30, 32, 34, 36];
const ROOM3_BRIDGE_ROWS = [6, 7];
const ROOM3_SAFE_BRIDGE_ROWS = [6, 7, 6, 7];
const minimapMarkers = [];
const doors = [];
const bots = [];
const worldLights = { hemi: null, moon: null };
const uiTimers = { hud: 0, minimap: 0 };
const renderSize = { width: 0, height: 0 };
let lastSkeletonHelperUpdate = 0;
let lastPromptRoomId = "";
let lastFrameAt = performance.now();
const perf = { fps: 0, ms: 0, accum: 0, frames: 0 };
const MAX_STUCK_ARROW_LIGHTS = 12;
const botAssets = {
  paladin: null,
  paladinReady: false,
  paladinError: "",
  boneNames: [],
  clips: {},
  animationStatus: "waiting",
  animationErrors: [],
};
const mixamo = {
  root: null,
  mixer: null,
  actions: {},
  active: null,
  activeName: "",
  ready: false,
  status: "loading model",
  progress: 0,
  error: "",
  yawOffset: 0,
  footOffset: 0,
  helper: null,
  height: 0,
  scale: 1,
  offset: new THREE.Vector3(),
  skinnedMeshes: [],
  boneNames: [],
  clipTrackNames: {},
  loadedAnimations: 0,
  animationErrors: [],
  bindingCount: 0,
  bones: {},
  modelUrl: `${ASSET_BASE}models/erika-archer.glb`,
  animationBaseUrl: `${ASSET_BASE}mixamo/`,
};

const target = { pos: tileToWorld(4.5, 4.5), mesh: null };
const rune = { pos: tileToWorld(12.5, 4.5), mesh: null };
const statue = { pos: tileToWorld(19.5, 4.5), mesh: null, enabled: false };

function tileToWorld(tx, ty) {
  return new THREE.Vector3((tx - map[0].length / 2) * CELL, 0, (ty - map.length / 2) * CELL);
}

function initialPlayerTile() {
  if (REPORT_SHOT.startsWith("room2") || REPORT_SHOT.includes("paladin") || REPORT_SHOT.includes("rune")) return [18.6, 7.3];
  if (REPORT_SHOT.startsWith("room3") || REPORT_SHOT.includes("glass") || REPORT_SHOT.includes("victory")) return [28.5, 7.5];
  if (REPORT_SHOT.includes("door_prompt") || REPORT_SHOT.includes("door_open")) return [12.2, 7.5];
  if (START_ROOM_ID === "3") return [28.5, 7.5];
  return [3.2, 4.3];
}

function worldToTile(x, z) {
  return {
    tx: Math.floor(x / CELL + map[0].length / 2),
    ty: Math.floor(z / CELL + map.length / 2),
  };
}

function cellAtTile(tx, ty) {
  if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return "#";
  return map[ty][tx];
}

function cellAtWorld(x, z) {
  const { tx, ty } = worldToTile(x, z);
  return cellAtTile(tx, ty);
}

function doorByCell(cell) {
  return doors.find((door) => door.cell === cell) || null;
}

function isDoorCell(cell) {
  return cell === "A" || cell === "B";
}

function isSolidCell(cell) {
  if (["#", "O", "L", "C"].includes(cell)) return true;
  if (isDoorCell(cell)) return !doorByCell(cell)?.open;
  return false;
}

function isSolidWorld(x, z) {
  return isSolidCell(cellAtWorld(x, z));
}

function isHardProjectileCell(cell) {
  if (cell === "#") return true;
  if (isDoorCell(cell)) return !doorByCell(cell)?.open;
  return false;
}

function isHardProjectileWorld(x, z) {
  return isHardProjectileCell(cellAtWorld(x, z));
}

function closestPointOnSegment2D(start, end, x, z) {
  const sx = start.x;
  const sz = start.z;
  const dx = end.x - sx;
  const dz = end.z - sz;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return { t: 0, x: sx, z: sz };
  const t = THREE.MathUtils.clamp(((x - sx) * dx + (z - sz) * dz) / lengthSq, 0, 1);
  return { t, x: sx + dx * t, z: sz + dz * t };
}

function projectileColliderHit(start, end) {
  let best = null;
  for (const collider of colliders) {
    if (collider.kind === "wall") continue;
    const closest = closestPointOnSegment2D(start, end, collider.x, collider.z);
    const y = THREE.MathUtils.lerp(start.y, end.y, closest.t);
    const minY = collider.minY ?? 0;
    const maxY = collider.maxY ?? 3;
    if (y < minY || y > maxY) continue;
    const dx = closest.x - collider.x;
    const dz = closest.z - collider.z;
    if (dx * dx + dz * dz > collider.r * collider.r) continue;
    const point = start.clone().lerp(end, closest.t);
    if (!best || closest.t < best.t) best = { point, t: closest.t, collider };
  }
  return best;
}

function currentRoom() {
  const { tx, ty } = worldToTile(player.pos.x, player.pos.z);
  return rooms.find((room) => tx >= room.x1 && tx <= room.x2 && ty >= room.y1 && ty <= room.y2) || null;
}

function roomObjectiveText(roomId) {
  if (roomId === "1") return "Ignite the three stone pillars with fire arrows. 세 돌 기둥에 불화살로 불을 붙이시오.";
  if (roomId === "2") return "세 명의 경비병들을 죽여 비밀번호를 알아내시오.";
  if (roomId === "3") return "특수강화유리와 그냥 유리를 화살로 확인하여 건너시오.";
  return "방에 들어가면 목표가 표시됩니다.";
}

function nearestDoorWithin(maxDistance = 3.8) {
  return doors
    .map((door) => ({ door, dist: player.pos.distanceTo(door.pos) }))
    .filter((item) => item.dist <= maxDistance)
    .sort((a, b) => a.dist - b.dist)[0]?.door || null;
}

function validateMap() {
  const width = map[0].length;
  map.forEach((row, i) => {
    if (row.length !== width) {
      console.warn("Map row length mismatch", i, row.length, "expected", width);
    }
  });
}

function roomAtWorldPosition(pos) {
  const { tx, ty } = worldToTile(pos.x, pos.z);
  return rooms.find((room) => tx >= room.x1 && tx <= room.x2 && ty >= room.y1 && ty <= room.y2) || null;
}

function getRoomIdAtWorld(pos) {
  return roomAtWorldPosition(pos)?.id || null;
}

function aliveBotsInRoom(roomId) {
  return bots.filter((bot) => !bot.dead && bot.roomId === roomId).length;
}

function activeBotsInCurrentRoom() {
  const room = currentRoom();
  if (!room) return 0;
  return bots.filter((bot) => !bot.dead && bot.roomId === room.id).length;
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0x253142, 0x050302, 0.95);
  hemi.userData.baseIntensity = 0.95;
  scene.add(hemi);
  worldLights.hemi = hemi;

  const moon = new THREE.DirectionalLight(0x6d82a1, 1.1);
  moon.userData.baseIntensity = 1.1;
  moon.position.set(-18, 24, 14);
  moon.castShadow = PERF.shadows;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);
  worldLights.moon = moon;
  applyBrightness();
}

function applyBrightness() {
  const value = state.brightness;
  if (worldLights.hemi) worldLights.hemi.intensity = worldLights.hemi.userData.baseIntensity * value;
  if (worldLights.moon) worldLights.moon.intensity = worldLights.moon.userData.baseIntensity * value;
  scene.fog.density = 0.032 / Math.sqrt(value);
  renderer.toneMappingExposure = value;
}

function adjustBrightness(delta) {
  state.brightness = 2.7;
  applyBrightness();
}
function makeMaterial(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03,
  });
}

const materialCache = new Map();
const textureCache = new Map();

function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function shadeColor(hex, amount) {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, amount);
  return `#${color.getHexString()}`;
}

function finalizeTexture(texture, repeatX = 1, repeatY = 1) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.() || 1, 4);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeCanvasTexture(key, size, draw, repeatX = 1, repeatY = 1) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas2d = document.createElement("canvas");
  canvas2d.width = size;
  canvas2d.height = size;
  const ctx = canvas2d.getContext("2d");
  draw(ctx, size);
  const texture = finalizeTexture(new THREE.CanvasTexture(canvas2d), repeatX, repeatY);
  textureCache.set(key, texture);
  return texture;
}

function makeBrickTexture(key, baseHex, mortarHex, repeatX = 1, repeatY = 1) {
  return makeCanvasTexture(key, 256, (ctx, size) => {
    ctx.fillStyle = mortarHex;
    ctx.fillRect(0, 0, size, size);
    const brickW = 64;
    const brickH = 26;
    const gap = 4;
    let row = 0;
    for (let y = gap; y < size + brickH; y += brickH + gap) {
      const offset = row % 2 === 0 ? -brickW * 0.35 : -brickW * 0.85;
      for (let x = offset; x < size + brickW; x += brickW + gap) {
        const noise = seededNoise((row + 1) * 31 + Math.floor(x + 256) * 7);
        ctx.fillStyle = shadeColor(baseHex, (noise - 0.5) * 0.18);
        ctx.fillRect(x, y, brickW, brickH);
        ctx.fillStyle = `rgba(255,255,255,${0.035 + noise * 0.035})`;
        ctx.fillRect(x + 4, y + 3, brickW - 10, 2);
        ctx.fillStyle = `rgba(0,0,0,${0.09 + noise * 0.08})`;
        ctx.fillRect(x + 3, y + brickH - 4, brickW - 8, 3);
      }
      row += 1;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.24)";
    for (let i = 0; i < 46; i++) {
      const x = seededNoise(i * 13.1) * size;
      const y = seededNoise(i * 29.7) * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + seededNoise(i * 3.7) * 18 - 9, y + seededNoise(i * 5.9) * 14 - 7);
      ctx.stroke();
    }
  }, repeatX, repeatY);
}

function makeStoneFloorTexture(key, baseHex, lineHex, repeatX = 1, repeatY = 1) {
  return makeCanvasTexture(key, 256, (ctx, size) => {
    ctx.fillStyle = lineHex;
    ctx.fillRect(0, 0, size, size);
    const slab = 64;
    for (let y = 0; y < size; y += slab) {
      for (let x = 0; x < size; x += slab) {
        const noise = seededNoise((x + 17) * 0.27 + (y + 31) * 0.41);
        ctx.fillStyle = shadeColor(baseHex, (noise - 0.5) * 0.14);
        ctx.fillRect(x + 3, y + 3, slab - 6, slab - 6);
        ctx.fillStyle = `rgba(255,255,255,${0.035 + noise * 0.025})`;
        ctx.fillRect(x + 7, y + 7, slab - 16, 2);
        ctx.fillStyle = `rgba(0,0,0,${0.08 + noise * 0.05})`;
        ctx.fillRect(x + 5, y + slab - 8, slab - 12, 3);
      }
    }
    for (let i = 0; i < 58; i++) {
      const x = seededNoise(i * 4.81) * size;
      const y = seededNoise(i * 9.17) * size;
      ctx.fillStyle = `rgba(0,0,0,${0.04 + seededNoise(i) * 0.06})`;
      ctx.fillRect(x, y, 2 + seededNoise(i * 2) * 8, 1 + seededNoise(i * 3) * 4);
    }
  }, repeatX, repeatY);
}

function getTexturedMaterial(key, texture, color, roughness = 0.88, metalness = 0.03) {
  if (materialCache.has(key)) return materialCache.get(key);
  const material = new THREE.MeshStandardMaterial({
    color,
    map: texture,
    roughness,
    metalness,
  });
  materialCache.set(key, material);
  return material;
}

function getFloorMaterial(room) {
  const id = room?.id || "corridor";
  const base = room?.color || 0x303642;
  const texture = makeStoneFloorTexture(`floor-${id}`, base, "#101318", 1.8, 1.8);
  return getTexturedMaterial(`floor-${id}`, texture, 0xffffff, 0.94, 0.02);
}

function getWallMaterial() {
  const texture = makeBrickTexture("castle-wall", 0x2b3038, "#11151b", 1.2, 1.8);
  return getTexturedMaterial("castle-wall", texture, 0xffffff, 0.93, 0.02);
}

function getStoneMaterial(kind = "stone") {
  const base = kind === "altar" ? 0x5b5960 : kind === "pillar" ? 0x363b42 : 0x343943;
  const texture = makeBrickTexture(`stone-${kind}`, base, "#171a20", 1.1, 1.1);
  return getTexturedMaterial(`stone-${kind}`, texture, 0xffffff, 0.9, 0.025);
}

function getWoodMaterial() {
  const texture = makeCanvasTexture("aged-wood", 256, (ctx, size) => {
    ctx.fillStyle = "#4f2f1c";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 9) {
      const noise = seededNoise(y * 1.7);
      ctx.fillStyle = `rgba(255,210,145,${0.035 + noise * 0.045})`;
      ctx.fillRect(0, y, size, 2);
      ctx.fillStyle = `rgba(0,0,0,${0.06 + noise * 0.05})`;
      ctx.fillRect(0, y + 5, size, 2);
    }
    for (let i = 0; i < 28; i++) {
      const x = seededNoise(i * 12.3) * size;
      const y = seededNoise(i * 4.9) * size;
      ctx.strokeStyle = "rgba(30,15,8,0.22)";
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + seededNoise(i) * 18, 3 + seededNoise(i * 2) * 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, 1, 2.2);
  return getTexturedMaterial("aged-wood", texture, 0xffffff, 0.78, 0.02);
}

function prepareBotMaterials(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.filter(Boolean).forEach((material) => {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.FrontSide;
    if ("roughness" in material) material.roughness = Math.max(material.roughness ?? 0.75, 0.68);
    if ("metalness" in material) material.metalness = Math.min(material.metalness ?? 0.08, 0.12);
    if (material.color && !material.map && material.color.getHex?.() === 0xffffff) {
      material.color.setHex(0xbfc7d5);
    }
  });
}

function normalizeBotAsset(model, targetHeight = 1.75) {
  model.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scale = rawSize.y > 0 && Number.isFinite(rawSize.y) ? targetHeight / rawSize.y : 1;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
}

function normalizeBotRigNames(model) {
  model.traverse((child) => {
    if (child.name?.startsWith("mixamorig:")) {
      child.name = child.name.replace("mixamorig:", "mixamorig");
    }
  });
}

function collectBotBoneNames(model) {
  const names = [];
  model.traverse((child) => {
    if (child.isBone && child.name && !names.includes(child.name)) names.push(child.name);
  });
  return names;
}

function cacheBotBones(root) {
  const bones = {};
  root.traverse((child) => {
    if (!child.isBone || !child.name) return;
    const suffix = child.name.replace(/^mixamorig:?/, "");
    bones[child.name] = child;
    bones[suffix] = child;
  });
  return bones;
}

function findBotWeaponNode(root) {
  let fallback = null;
  root.traverse((child) => {
    const name = (child.name || "").toLowerCase();
    if (!fallback && (child.isMesh || child.isSkinnedMesh) && /(sword|blade|weapon|prop|shield)/.test(name)) {
      fallback = child;
    }
  });
  return fallback;
}

function botWeaponWorldPosition(bot) {
  const target = new THREE.Vector3();
  const weapon = bot.mesh?.userData?.weaponNode;
  if (weapon) return weapon.getWorldPosition(target);

  const bones = bot.mesh?.userData?.bones || {};
  const hand = bones.RightHand || bones.mixamorigRightHand || bones.RightForeArm || bones.mixamorigRightForeArm;
  if (hand) {
    hand.getWorldPosition(target);
    const forward = new THREE.Vector3();
    bot.mesh.getWorldDirection(forward);
    return target.add(forward.multiplyScalar(bot.boss ? 0.95 : 0.72));
  }

  bot.mesh.getWorldDirection(target);
  return bot.pos.clone().add(new THREE.Vector3(0, bot.boss ? 1.35 : 1.05, 0)).add(target.multiplyScalar(bot.boss ? 1.15 : 0.85));
}

function playerBodyHitPoints() {
  return [
    player.pos.clone().add(new THREE.Vector3(0, 0.65, 0)),
    player.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
    player.pos.clone().add(new THREE.Vector3(0, 1.55, 0)),
  ];
}

function applyBotProceduralMotion(bot, dt) {
  const bones = bot.mesh?.userData?.bones;
  if (!bones || bot.dead || bot.state === "attack") return;
  const moving = bot.state === "chase" || bot.state === "return";
  const hit = bot.state === "hit";
  const time = performance.now() * 0.001;
  const stride = moving ? Math.sin(time * (bot.boss ? 7 : 10) + bot.pos.x * 0.13) : 0;
  const breathe = Math.sin(time * 2.2 + bot.pos.z * 0.07) * 0.035;

  const leftArm = bones.LeftArm || bones.mixamorigLeftArm;
  const rightArm = bones.RightArm || bones.mixamorigRightArm;
  const leftForeArm = bones.LeftForeArm || bones.mixamorigLeftForeArm;
  const rightForeArm = bones.RightForeArm || bones.mixamorigRightForeArm;
  const leftUpLeg = bones.LeftUpLeg || bones.mixamorigLeftUpLeg;
  const rightUpLeg = bones.RightUpLeg || bones.mixamorigRightUpLeg;
  const leftLeg = bones.LeftLeg || bones.mixamorigLeftLeg;
  const rightLeg = bones.RightLeg || bones.mixamorigRightLeg;
  const spine = bones.Spine || bones.mixamorigSpine || bones.Spine1 || bones.mixamorigSpine1;

  if (spine) spine.rotation.x += breathe + (hit ? -0.18 : 0);
  if (leftUpLeg) leftUpLeg.rotation.x += stride * 0.42;
  if (rightUpLeg) rightUpLeg.rotation.x -= stride * 0.42;
  if (leftLeg) leftLeg.rotation.x -= Math.max(0, stride) * 0.28;
  if (rightLeg) rightLeg.rotation.x += Math.min(0, stride) * 0.28;
  if (leftArm) leftArm.rotation.x -= stride * 0.25;
  if (rightArm) rightArm.rotation.x += stride * 0.25;
  if (leftForeArm) leftForeArm.rotation.y += moving ? 0.18 : 0.08;
  if (rightForeArm) rightForeArm.rotation.y += 0.15;
}

function resolveBotBoneName(rawNodeName) {
  if (botAssets.boneNames.includes(rawNodeName)) return rawNodeName;
  const suffix = rawNodeName.replace(/^mixamorig:?/, "");
  return botAssets.boneNames.find((boneName) => boneName.replace(/^mixamorig:?/, "") === suffix) || null;
}

function shouldKeepBotPositionTrack(clipName, targetNodeName, propertyName) {
  if (propertyName !== "position") return false;
  const suffix = targetNodeName.replace(/^mixamorig:?/, "");
  return clipName === "death" && suffix === "Hips";
}

function stabilizeBotRootPositionTrack(positionTrack) {
  const values = positionTrack.values;
  if (!values || values.length < 3) return;
  const baseX = values[0];
  const baseZ = values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] = baseX;
    values[i + 2] = baseZ;
  }
}

function retargetBotClip(sourceClip, name) {
  const tracks = sourceClip.tracks
    .map((track) => {
      const cloned = track.clone();
      const [rawNodeName, propertyName] = cloned.name.split(".");
      const targetNodeName = resolveBotBoneName(rawNodeName);
      if (!targetNodeName || !propertyName) return null;
      if (propertyName === "position" && !shouldKeepBotPositionTrack(name, targetNodeName, propertyName)) return null;
      cloned.name = `${targetNodeName}.${propertyName}`;
      if (propertyName === "position") stabilizeBotRootPositionTrack(cloned);
      return cloned;
    })
    .filter(Boolean);
  const clip = new THREE.AnimationClip(name, sourceClip.duration, tracks);
  clip.optimize();
  return clip;
}

function clonePaladinBotMesh() {
  if (!botAssets.paladin) return null;
  const root = new THREE.Group();
  const clone = cloneSkeleton(botAssets.paladin);
  clone.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
      prepareBotMaterials(child);
    }
  });
  root.add(clone);
  root.userData = { paladinBot: true, model: clone, bones: cacheBotBones(clone), weaponNode: findBotWeaponNode(clone) };
  scene.add(root);
  return root;
}

function loadPaladinBotModel() {
  const loader = new FBXLoader();
  loader.load(
    `${ASSET_BASE}models/Paladin WProp J Nordstrom.fbx`,
    (fbx) => {
      normalizeBotRigNames(fbx);
      fbx.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = true;
          prepareBotMaterials(child);
        }
      });
      normalizeBotAsset(fbx, 1.75);
      botAssets.paladin = fbx;
      botAssets.boneNames = collectBotBoneNames(fbx);
      botAssets.paladinReady = true;
      botAssets.paladinError = "";
      loadPaladinAnimations();
      replaceWeakBotMeshesWithPaladin();
    },
    undefined,
    (error) => {
      botAssets.paladinReady = false;
      botAssets.paladinError = error?.message || "Paladin FBX load failed";
      console.warn("Paladin bot model failed to load.", error);
    }
  );
}

function loadPaladinAnimations() {
  if (!botAssets.boneNames.length) return;
  const files = {
    idle: "sword and shield idle.fbx",
    walk: "sword and shield walk.fbx",
    run: "sword and shield run.fbx",
    attack2: "sword and shield attack (2).fbx",
    attack3: "sword and shield attack (3).fbx",
    attack4: "sword and shield attack (4).fbx",
    impact: "sword and shield impact.fbx",
    death: "sword and shield death.fbx",
  };
  botAssets.clips = {};
  botAssets.animationErrors = [];
  botAssets.animationStatus = "loading";
  const loader = new FBXLoader();
  loader.setPath(`${ASSET_BASE}paladin/`);
  Object.entries(files).forEach(([name, file]) => {
    loader.load(file, (fbx) => {
      normalizeBotRigNames(fbx);
      const sourceClip = fbx.animations?.[0];
      if (!sourceClip) {
        botAssets.animationErrors.push(`${file}: no clip`);
        return;
      }
      const clip = retargetBotClip(sourceClip, name);
      if (!clip.tracks.length) {
        botAssets.animationErrors.push(`${file}: no compatible tracks`);
        return;
      }
      botAssets.clips[name] = clip;
      botAssets.animationStatus = `loaded ${Object.keys(botAssets.clips).length}/6`;
      refreshBotAnimators();
    }, undefined, (error) => {
      botAssets.animationErrors.push(`${file}: ${error?.message || "load failed"}`);
      botAssets.animationStatus = "partial";
    });
  });
}

function setupBotAnimator(bot) {
  if (!bot.mesh?.userData?.paladinBot || !Object.keys(botAssets.clips).length) return;
  if (!bot.mixer) bot.mixer = new THREE.AnimationMixer(bot.mesh);
  if (!bot.actions) bot.actions = {};
  Object.entries(botAssets.clips).forEach(([name, clip]) => {
    if (bot.actions[name]) return;
    const action = bot.mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(0);
    if (name.startsWith("attack") || name === "impact" || name === "death") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    bot.actions[name] = action;
  });
  if (!bot.activeAction && bot.actions.idle) setBotAction(bot, "idle", 0);
}

function refreshBotAnimators() {
  bots.forEach((bot) => {
    if (bot.mesh?.userData?.paladinBot) setupBotAnimator(bot);
  });
}

function setBotAction(bot, name, fade = 0.12) {
  const next = bot.actions?.[name];
  if (!next || bot.activeAction === next) return false;
  if (bot.activeAction) bot.activeAction.fadeOut(fade);
  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  if (fade > 0) next.fadeIn(fade);
  next.play();
  bot.activeAction = next;
  bot.activeActionName = name;
  return true;
}

function botActionDuration(bot, name, fallback = 0.6) {
  return bot.actions?.[name]?.getClip?.().duration || fallback;
}

function availableBotAttackActions(bot) {
  return Object.keys(bot.actions || {}).filter((name) => name.startsWith("attack"));
}

function playBotOneShot(bot, name, duration = null, timeScale = 1) {
  const next = bot.actions?.[name];
  if (!next) return false;
  if (bot.activeAction && bot.activeAction !== next) bot.activeAction.fadeOut(0.05);
  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(timeScale);
  next.setEffectiveWeight(1);
  next.fadeIn(0.05).play();
  bot.activeAction = next;
  bot.activeActionName = name;
  bot.stateLock = Math.max(bot.stateLock || 0, (duration ?? botActionDuration(bot, name)) / Math.max(0.01, timeScale));
  return true;
}

function addFloorTile(pos, room) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), getFloorMaterial(room));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(pos.x, 0, pos.z);
  floor.receiveShadow = true;
  scene.add(floor);

  const lineMat = materialCache.get("floor-line") || makeMaterial(0x0b0e13, 0.95);
  materialCache.set("floor-line", lineMat);
  const lineA = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.025, 0.035), lineMat);
  lineA.position.set(pos.x, 0.022, pos.z - CELL * 0.49);
  const lineB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, CELL), lineMat);
  lineB.position.set(pos.x - CELL * 0.49, 0.024, pos.z);
  scene.add(lineA, lineB);

  if (PERF.floorTrim && room?.accent) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.62, 0.035, 0.055), makeMaterial(room.accent, 0.82));
    trim.position.set(pos.x, 0.035, pos.z + CELL * 0.36);
    scene.add(trim);
  }
}

function addCastleWall(pos) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(CELL, 3.6, CELL), getWallMaterial());
  base.position.y = 1.8;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  for (let y = 0.55; y < 3.35; y += 0.55) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.92, 0.035, 0.055), makeMaterial(0x4a515c, 0.88));
    trim.position.set(0, y, -CELL * 0.505);
    trim.receiveShadow = true;
    group.add(trim);
  }
  scene.add(group);
  colliders.push({ kind: "wall", x: pos.x, z: pos.z, r: CELL * 0.72, minY: 0, maxY: 3.4 });
}

function addStonePillar(pos, room) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const mat = getStoneMaterial("pillar");
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 0.35, 14), mat);
  base.position.y = 0.18;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 2.45, 14), mat);
  shaft.position.y = 1.45;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.54, 0.32, 14), mat);
  cap.position.y = 2.82;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8a35 }));
  flame.position.y = 3.12;
  flame.visible = false;
  const light = new THREE.PointLight(0xff8a35, 0, 9, 1.7);
  light.position.y = 3.18;
  group.add(base, shaft, cap, flame, light);
  group.traverse((obj) => { if (obj.isMesh) { obj.castShadow = obj === shaft || obj === cap; obj.receiveShadow = true; } });
  scene.add(group);
  const collider = { kind: "pillar", x: pos.x, z: pos.z, r: 0.74, minY: 0, maxY: 3.05 };
  colliders.push(collider);
  if (room?.id === "1") {
    const pillar = { group, flame, light, collider, lit: false, seed: Math.random() * 1000 };
    collider.room1Pillar = pillar;
    room1Pillars.push(pillar);
  }
}

function addBookshelf(pos, room) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.85, 2.35, CELL * 0.32), makeMaterial(0x4a2c19, 0.78));
  shelf.position.y = 1.2;
  group.add(shelf);
  const colors = [0x7a2f2f, 0x2f4f7a, 0x6d5a2c, 0x2d6d50];
  for (let i = 0; i < 7; i++) {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72 + (i % 2) * 0.12, 0.08), makeMaterial(colors[i % colors.length], 0.7));
    book.position.set(-1.25 + i * 0.38, 1.25, -CELL * 0.19);
    group.add(book);
  }
  group.rotation.y = room?.id === "2" && pos.x > 0 ? Math.PI / 2 : 0;
  group.traverse((obj) => { if (obj.isMesh) { obj.castShadow = obj === shelf; obj.receiveShadow = true; } });
  scene.add(group);
  colliders.push({ kind: "bookshelf", x: pos.x, z: pos.z, r: CELL * 0.42, minY: 0, maxY: 2.45 });
}

function addStoneAltar(pos, room) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const altarMat = getStoneMaterial("altar");
  const base = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, 0.55, CELL * 0.72), altarMat);
  base.position.y = 0.28;
  const top = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.62, 0.22, CELL * 0.5), altarMat);
  top.position.y = 0.72;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), new THREE.MeshBasicMaterial({ color: room?.accent || 0xf3ca5d }));
  glow.position.y = 0.95;
  group.add(base, top, glow);
  group.traverse((obj) => { if (obj.isMesh && obj !== glow) { obj.castShadow = false; obj.receiveShadow = true; } });
  scene.add(group);
  colliders.push({ kind: "altar", x: pos.x, z: pos.z, r: CELL * 0.42, minY: 0, maxY: 1.05 });
}

function addGlassBridgeTile(pos, tx, ty) {
  const stepIndex = ROOM3_BRIDGE_STEPS.indexOf(tx);
  const safe = ROOM3_SAFE_BRIDGE_ROWS[stepIndex] === ty;
  const material = new THREE.MeshBasicMaterial({
    color: 0x8deaff,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86), material);
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(pos.x, 0.018, pos.z);
  tile.userData = { safe, tx, ty, broken: false };
  scene.add(tile);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(CELL * 0.43, CELL * 0.48, 4),
    new THREE.MeshBasicMaterial({ color: 0xd7fbff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.rotation.z = Math.PI / 4;
  rim.position.set(pos.x, 0.024, pos.z);
  scene.add(rim);
  const bridgeTile = { tx, ty, stepIndex, safe, mesh: tile, rim, broken: false, tested: false };
  tile.userData.bridgeTile = bridgeTile;
  room3BridgeTiles.push(bridgeTile);
}

function addBrazier(tx, ty, room) {
  const pos = tileToWorld(tx, ty);
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const metal = makeMaterial(0x2a2520, 0.58);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 12), metal);
  base.position.y = 0.28;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  bowl.position.y = 0.68;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff9a36 }));
  flame.position.y = 0.96;
  const light = new THREE.PointLight(0xff9a36, 2.2, 12, 1.6);
  light.userData.baseIntensity = 2.2;
  light.position.y = 1.05;
  group.add(base, bowl, flame, light);
  group.traverse((obj) => { if (obj.isMesh && obj !== flame) { obj.castShadow = true; obj.receiveShadow = true; } });
  scene.add(group);
  torches.push({ group, flame, light, baseIntensity: 2.2, seed: Math.random() * 1000 });
  return group;
}

function addDecorativeRune(pos, primary) {
  if (primary) return;
  const runeGeo = new THREE.RingGeometry(0.32, 0.45, 5);
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x45dfea, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(runeGeo, runeMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, 0.04, pos.z);
  scene.add(mesh);
}

function buildMap() {
  let primaryRuneSet = false;
  for (let ty = 0; ty < map.length; ty++) {
    for (let tx = 0; tx < map[0].length; tx++) {
      const cell = map[ty][tx];
      const pos = tileToWorld(tx + 0.5, ty + 0.5);
      const room = rooms.find((r) => tx >= r.x1 && tx <= r.x2 && ty >= r.y1 && ty <= r.y2);

      if (cell !== "#" && cell !== "G" && cell !== "V") addFloorTile(pos, room);
      if (cell === "#") addCastleWall(pos);
      if (cell === "G") addGlassBridgeTile(pos, tx, ty);
      if (cell === "O") addStonePillar(pos, room);
      if (cell === "L") addBookshelf(pos, room);
      if (cell === "C") addStoneAltar(pos, room);
      if (cell === "F") addBrazier(tx + 0.5, ty + 0.5, room);
      if (cell === "T") target.pos.copy(pos);
      if (cell === "R") {
        if (!primaryRuneSet) {
          rune.pos.copy(pos);
          primaryRuneSet = true;
        }
        addDecorativeRune(pos, !primaryRuneSet);
      }
      if (cell === "S") {
        statue.pos.copy(pos);
        statue.enabled = true;
      }
      if (isDoorCell(cell)) addDoor(cell, tx, ty, pos);
    }
  }
}

function addDoor(cell, tx, ty, pos) {
  const connectsEastWest = !isSolidCell(cellAtTile(tx - 1, ty)) || !isSolidCell(cellAtTile(tx + 1, ty));
  const door = {
    cell,
    tx,
    ty,
    pos: pos.clone(),
    open: false,
    mesh: null,
    leftDoor: null,
    rightDoor: null,
    openAmount: 0,
    orientation: connectsEastWest ? "eastWest" : "northSouth",
    required: cell === "A" ? "Solve the Room 1 door puzzle first" : "Reveal Room 2 rune first",
  };

  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);

  const stoneMat = getStoneMaterial("doorFrame");
  const woodMat = getWoodMaterial();
  const ironMat = makeMaterial(0x1b1b1e, 0.48);
  const frameThickness = 0.28;
  const frameDepth = 0.42;

  const makeFrame = (side) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, 2.95, frameDepth), stoneMat);
    frame.position.set(side * CELL * 0.48, 1.48, 0);
    return frame;
  };
  const leftFrame = makeFrame(-1);
  const rightFrame = makeFrame(1);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(CELL * 1.05, 0.3, frameDepth), stoneMat);
  arch.position.set(0, 2.9, 0);
  group.add(leftFrame, rightFrame, arch);

  const makeLeaf = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * CELL * 0.43, 1.35, 0);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.42, 2.45, 0.28), woodMat);
    slab.position.x = -side * CELL * 0.21;
    slab.castShadow = true;
    slab.receiveShadow = true;
    for (let y of [-0.55, 0.1, 0.72]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.36, 0.09, 0.32), ironMat);
      band.position.set(-side * CELL * 0.21, y, -0.03);
      pivot.add(band);
    }
    pivot.add(slab);
    return pivot;
  };

  const leftDoor = makeLeaf(-1);
  const rightDoor = makeLeaf(1);
  group.add(leftDoor, rightDoor);

  if (connectsEastWest) {
    group.rotation.y = Math.PI / 2;
  }

  group.traverse((obj) => { if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; } });

  scene.add(group);
  door.mesh = group;
  door.leftDoor = leftDoor;
  door.rightDoor = rightDoor;
  doors.push(door);
}

function canOpenDoor(door) {
  if (door.cell === "A") return state.room1PuzzleSolved;
  if (door.cell === "B") return state.room2PuzzleSolved;
  return true;
}

function tryOpenDoor() {
  const nearest = doors
    .filter((door) => !door.open)
    .map((door) => ({ door, dist: player.pos.distanceTo(door.pos) }))
    .sort((a, b) => a.dist - b.dist)[0];
  if (!nearest || nearest.dist > 3.2) {
    state.doorMessage = "Move closer to a wooden door";
    state.doorMessageTimer = 2;
    return;
  }
  if (nearest.door.cell === "A" && !state.room1PuzzleSolved) {
    openPuzzleModal("A");
    state.doorMessage = "Ignite the three Room 1 pillars";
    state.doorMessageTimer = 2;
    return;
  }
  if (nearest.door.cell === "B" && !state.room2PuzzleSolved) {
    openPuzzleModal("B");
    state.doorMessage = "Enter the Room 2 rune memory";
    state.doorMessageTimer = 2;
    return;
  }
  if (!canOpenDoor(nearest.door)) {
    state.doorMessage = nearest.door.required;
    state.doorMessageTimer = 2;
    return;
  }
  nearest.door.open = true;
  state.doorMessage = nearest.door.cell === "A" ? "Door to Room 2 opened" : "Door to Room 3 opened";
  state.doorMessageTimer = 2.4;
}

function updateDoors(dt) {
  for (const door of doors) {
    const target = door.open ? 1 : 0;
    door.openAmount += (target - door.openAmount) * Math.min(1, dt * 5);
    if (door.leftDoor && door.rightDoor) {
      const direction = door.orientation === "eastWest" ? -1 : 1;
      door.leftDoor.rotation.y = direction * door.openAmount * Math.PI * 0.45;
      door.rightDoor.rotation.y = -direction * door.openAmount * Math.PI * 0.45;
    } else if (door.mesh) {
      const targetY = door.open ? -1.55 : 1.25;
      door.mesh.position.y += (targetY - door.mesh.position.y) * Math.min(1, dt * 8);
    }
  }
  if (state.doorMessage) {
    state.doorMessageTimer = (state.doorMessageTimer || 0) - dt;
    if (state.doorMessageTimer <= 0) {
      state.doorMessage = "";
      state.doorMessageTimer = 0;
    }
  }
}

function applyStartRoomMode() {
  if (START_ROOM_ID !== "3") return;
  state.room1PuzzleSolved = true;
  state.room2PuzzleSolved = true;
  state.room2RuneAnswer = ROOM2_RUNE_SYMBOLS.join("");
  state.runeReveal = 1;
  state.arrowsRemaining = MAX_ARROWS;
  state.yaw = Math.PI / 2;
  state.pitch = -0.08;
  for (const door of doors) {
    door.open = true;
    door.openAmount = 1;
  }
  state.doorMessage = "Room 3 test start";
  state.doorMessageTimer = 2;
}

function applyReportShotPreset() {
  if (!REPORT_SHOT_MODE) return;
  state.gameReady = true;
  state.loadingStartedAt = performance.now() - 10000;
  state.skeletonPanelEnabled = false;
  state.brightness = 2.7;
  applyBrightness();

  const setPlayer = (tx, ty, yaw = Math.PI / 2, pitch = -0.08) => {
    player.pos.copy(tileToWorld(tx, ty));
    player.pos.y = 0;
    state.yaw = yaw;
    state.pitch = pitch;
  };

  const openDoor = (cell) => {
    const door = doorByCell(cell);
    if (!door) return;
    door.open = true;
    door.openAmount = 1;
  };

  if (REPORT_SHOT.includes("room2") || REPORT_SHOT.includes("paladin") || REPORT_SHOT.includes("rune")) {
    state.room1PuzzleSolved = true;
    openDoor("A");
  }
  if (REPORT_SHOT.includes("room3") || REPORT_SHOT.includes("glass") || REPORT_SHOT.includes("victory")) {
    state.room1PuzzleSolved = true;
    state.room2PuzzleSolved = true;
    openDoor("A");
    openDoor("B");
  }

  if (REPORT_SHOT.includes("pillar_ignite") || REPORT_SHOT.includes("surfel") || REPORT_SHOT.includes("fire")) {
    room1Pillars.slice(0, REPORT_SHOT.includes("three") || REPORT_SHOT.includes("door_open") ? 3 : 1).forEach(lightRoom1Pillar);
  }

  if (REPORT_SHOT.includes("room2") || REPORT_SHOT.includes("rune") || REPORT_SHOT.includes("password")) {
    bots.filter((bot) => bot.roomId === "2").slice(0, 3).forEach((bot, index) => {
      if (REPORT_SHOT.includes("rune") || REPORT_SHOT.includes("password")) {
        bot.dead = true;
        bot.state = "dead";
        bot.pos.copy(tileToWorld(17.5 + index * 2, 6.5 + (index % 2)));
        revealRoom2Rune(bot);
      } else {
        bot.pos.copy(tileToWorld(18.5 + index * 1.2, 6.4 + index * 0.35));
        bot.state = index === 0 && REPORT_SHOT.includes("attack") ? "attack" : "chase";
      }
    });
  }

  if (REPORT_SHOT.includes("password") || REPORT_SHOT.includes("rune_input")) {
    openPuzzleModal("B");
  }

  if (REPORT_SHOT.includes("glass") || REPORT_SHOT.includes("room3")) {
    const firstSafe = room3BridgeTiles.find((tile) => tile.safe);
    const firstWeak = room3BridgeTiles.find((tile) => !tile.safe);
    if (firstSafe && (REPORT_SHOT.includes("arrow_test") || REPORT_SHOT.includes("clear"))) testBridgeTile(firstSafe);
    if (firstWeak && (REPORT_SHOT.includes("break") || REPORT_SHOT.includes("weak") || REPORT_SHOT.includes("fall"))) breakBridgeTile(firstWeak, "Glass shattered");
  }

  if (REPORT_SHOT.includes("death") && !REPORT_SHOT.includes("paladin")) {
    state.playerHp = 0;
    state.playerDead = true;
    state.playerDeathStarted = true;
    state.playerDeathTimer = PLAYER_DEATH_OVERLAY_DELAY + 0.2;
  }

  if (REPORT_SHOT.includes("fall")) {
    setPlayer(30.5, 6.5, Math.PI / 2, -0.16);
    state.room3Falling = true;
    state.room3FallTimer = 0.55;
    player.pos.y = -2.1;
  }

  if (REPORT_SHOT.includes("victory") || REPORT_SHOT.includes("clear")) {
    setPlayer(37.5, 7.5, Math.PI / 2, -0.12);
    completeRoom3Bridge();
  }

  if (REPORT_SHOT.includes("door_prompt")) setPlayer(12.15, 7.5, Math.PI / 2, -0.08);
  if (REPORT_SHOT.includes("door_open")) {
    state.room1PuzzleSolved = true;
    openDoor("A");
    setPlayer(12.15, 7.5, Math.PI / 2, -0.08);
  }
  if (REPORT_SHOT.includes("wall") || REPORT_SHOT.includes("texture")) setPlayer(5.5, 3.5, -0.2, -0.04);
  if (REPORT_SHOT.includes("trajectory") || REPORT_SHOT.includes("collision")) {
    state.bowDrawing = true;
    state.bowDraw = 1;
  }

  updateObjectivePrompt(currentRoom());
  updateDoorPrompt();
  updatePlayerHpHud();
  updateGameOverOverlay();
  updateVictoryOverlay();
  updateLoadingOverlay();
}

function addTorch(tx, ty) {
  const pos = tileToWorld(tx, ty);
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.45, 10), makeMaterial(0x3b2415, 0.78));
  stand.position.y = 0.72;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff9a36 }));
  flame.position.y = 1.52;
  const light = new THREE.PointLight(0xff9a36, 2.0, 11, 1.6);
  light.userData.baseIntensity = 2.0;
  light.position.y = 1.55;
  group.add(stand, flame, light);
  scene.add(group);
  return { group, flame, light, baseIntensity: 2.0, seed: Math.random() * 1000 };
}

const torches = [];

function addTorches() {
  // Braziers are now placed automatically from F tiles in buildMap().
}

function updateTorches(time) {
  updateActiveTorchLights();
  for (const torch of torches) {
    const flicker = 0.85 + Math.sin(time * 7 + torch.seed) * 0.11 + Math.sin(time * 13 + torch.seed) * 0.05;
    torch.light.intensity = torch.light.visible ? (torch.baseIntensity || torch.light.userData.baseIntensity || 1.4) * state.brightness * flicker : 0;
    torch.flame.scale.setScalar(0.85 + flicker * 0.25);
  }
  for (const pillar of room1Pillars) {
    if (!pillar.lit) continue;
    const flicker = 0.9 + Math.sin(time * 8 + pillar.seed) * 0.12 + Math.sin(time * 15 + pillar.seed) * 0.05;
    pillar.light.intensity = 2.6 * state.brightness * flicker;
    pillar.flame.scale.setScalar(0.9 + flicker * 0.3);
  }
}

function updateActiveTorchLights() {
  const sorted = torches
    .map((torch) => ({ torch, dist: torch.group.position.distanceTo(player.pos) }))
    .sort((a, b) => a.dist - b.dist);
  sorted.forEach((entry, index) => {
    const active = index < PERF.maxTorchLights && entry.dist < 24;
    entry.torch.light.visible = active;
    if (!active) entry.torch.light.intensity = 0;
  });
}

function lightRoom1Pillar(pillar) {
  if (!pillar || pillar.lit) return;
  pillar.lit = true;
  pillar.flame.visible = true;
  pillar.light.intensity = 2.6 * state.brightness;
  state.doorMessage = `Pillar flame ${room1Pillars.filter((item) => item.lit).length}/${room1Pillars.length}`;
  state.doorMessageTimer = 1.8;

  if (room1Pillars.length > 0 && room1Pillars.every((item) => item.lit)) {
    state.room1PuzzleSolved = true;
    const doorA = doorByCell("A");
    if (doorA) doorA.open = true;
    state.doorMessage = "Door A opened by the three flames";
    state.doorMessageTimer = 2.6;
    closePuzzleModal();
  }
}

function makeRuneTexture(symbol) {
  const canvas2d = document.createElement("canvas");
  canvas2d.width = 128;
  canvas2d.height = 128;
  const ctx = canvas2d.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(102, 232, 239, 0.9)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "bold 58px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#bffbff";
  ctx.fillText(symbol, 64, 66);
  return new THREE.CanvasTexture(canvas2d);
}

function revealRoom2Rune(bot) {
  if (!bot?.runeSymbol || bot.runeRevealed) return;
  bot.runeRevealed = true;
  const mesh = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRuneTexture(bot.runeSymbol),
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    depthTest: true,
  }));
  mesh.position.copy(bot.pos).add(new THREE.Vector3(0, 2.35, 0));
  mesh.scale.set(1.55, 1.55, 1);
  mesh.userData = { baseY: mesh.position.y, seed: Math.random() * 1000 };
  scene.add(mesh);
  room2RuneClues.push({ symbol: bot.runeSymbol, mesh, pos: bot.pos.clone() });
  state.room2RuneAnswer = room2RuneClues.map((clue) => clue.symbol).join("");
  state.runeReveal = Math.min(1, room2RuneClues.length / ROOM2_RUNE_SYMBOLS.length);
  state.doorMessage = `Rune clue revealed: ${bot.runeSymbol}`;
  state.doorMessageTimer = 1.8;
}
function addRoomLabels() {
  addLabel("ROOM 1", tileToWorld(6.5, 1.35), 0xff6b55);
  addLabel("ROOM 2", tileToWorld(19.5, 1.35), 0x66e8ef);
  addLabel("ROOM 3", tileToWorld(33.0, 1.35), 0xf3ca5d);
}

function addLabel(text, pos, color) {
  const canvas2d = document.createElement("canvas");
  canvas2d.width = 256;
  canvas2d.height = 96;
  const c = canvas2d.getContext("2d");
  c.fillStyle = "rgba(0,0,0,0.75)";
  c.fillRect(0, 0, canvas2d.width, canvas2d.height);
  c.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  c.lineWidth = 5;
  c.strokeRect(6, 6, canvas2d.width - 12, canvas2d.height - 12);
  c.font = "bold 38px Segoe UI, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.fillText(text, 128, 50);

  const texture = new THREE.CanvasTexture(canvas2d);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.set(pos.x, 2.3, pos.z);
  sprite.scale.set(3.4, 1.25, 1);
  scene.add(sprite);
}

function addGoalObjects() {
  const runeGeo = new THREE.RingGeometry(0.5, 0.7, 5);
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x66e8ef, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const runeMesh = new THREE.Mesh(runeGeo, runeMat);
  runeMesh.rotation.x = -Math.PI / 2;
  runeMesh.position.copy(rune.pos).add(new THREE.Vector3(0, 0.035, 0));
  scene.add(runeMesh);
  rune.mesh = runeMesh;

  if (statue.enabled) {
    const statueGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.72, 2.1, 16), makeMaterial(0x93783e, 0.7));
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), makeMaterial(0xd4bc73, 0.64));
    head.position.y = 2.36;
    statueGroup.add(body, head);
    statueGroup.position.copy(statue.pos);
    statueGroup.castShadow = true;
    scene.add(statueGroup);
    statue.mesh = statueGroup;
  }
}

function makeFloorArrowMesh(color = 0xffd45a) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, -0.24);
  shape.lineTo(0.15, -0.24);
  shape.lineTo(0.15, -0.52);
  shape.lineTo(1.3, 0);
  shape.lineTo(0.15, 0.52);
  shape.lineTo(0.15, 0.24);
  shape.lineTo(-1.25, 0.24);
  shape.lineTo(-1.25, -0.24);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(1.15);
  return mesh;
}

function addDoorGuideArrows() {
  const doorA = doorByCell("A");
  if (!doorA) return;
  const arrow = makeFloorArrowMesh(0xffd45a);
  arrow.position.copy(doorA.pos).add(new THREE.Vector3(-CELL * 1.2, 0.045, 0));
  scene.add(arrow);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.86, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.copy(doorA.pos).add(new THREE.Vector3(-CELL * 0.48, 0.05, 0));
  scene.add(glow);
}

function makePlayerMesh() {
  const group = new THREE.Group();

  const cloakMat = makeMaterial(0x263143, 0.72);
  const leatherMat = makeMaterial(0x4e3426, 0.7);
  const skinMat = makeMaterial(0xd2a26f, 0.64);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff923a });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.92, 8, 18), cloakMat);
  body.position.y = 1.06;
  body.castShadow = true;

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.5, 0.22), leatherMat);
  chest.position.set(0, 1.18, -0.2);
  chest.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.34, 18), cloakMat);
  hood.position.y = 1.91;
  hood.rotation.x = 0.08;
  hood.castShadow = true;

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 5, 10), cloakMat);
  leftArm.position.set(-0.42, 1.2, -0.16);
  leftArm.rotation.set(0.15, 0.05, -0.55);
  leftArm.castShadow = true;

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 5, 10), cloakMat);
  rightArm.position.set(0.45, 1.18, -0.22);
  rightArm.rotation.set(0.35, -0.25, 0.75);
  rightArm.castShadow = true;

  const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.68, 12), leatherMat);
  quiver.position.set(-0.33, 1.15, 0.28);
  quiver.rotation.set(0.6, 0.15, -0.35);
  quiver.castShadow = true;

  const bowGroup = makeBowMesh();
  bowGroup.position.set(0.62, 1.24, -0.42);
  bowGroup.rotation.set(-0.08, -0.18, 0.05);

  const loadedArrow = makeArrowMesh(0.54, true);
  loadedArrow.position.set(0.4, 1.18, -0.52);
  loadedArrow.rotation.set(Math.PI / 2, 0, 0);

  const muzzleFlame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), fireMat);
  muzzleFlame.position.set(0.4, 1.18, -0.9);
  muzzleFlame.visible = false;

  group.add(body, chest, head, hood, leftArm, rightArm, quiver, bowGroup, loadedArrow, muzzleFlame);
  group.userData = { leftArm, rightArm, bowGroup, loadedArrow, muzzleFlame };
  scene.add(group);
  return group;
}

const playerMesh = makePlayerMesh();
loadMixamoPlayer();

function hasUsableMixamoPlayer() {
  return mixamo.ready && mixamo.root && mixamo.skinnedMeshes.length > 0;
}

function hasRequiredStartupAssets() {
  return hasUsableMixamoPlayer() && !!mixamo.actions.idle;
}

function loadingElapsedSeconds() {
  return (performance.now() - state.loadingStartedAt) / 1000;
}

function updateGameReadyState() {
  if (state.gameReady) return;
  const waitedLongEnough = loadingElapsedSeconds() >= LOADING_MIN_SECONDS;
  const playerReady = hasRequiredStartupAssets();
  const playerFailed = mixamo.status.includes("model failed") && loadingElapsedSeconds() >= LOADING_FAILSAFE_SECONDS;
  if (waitedLongEnough && (playerReady || playerFailed)) {
    state.gameReady = true;
    clock.getDelta();
    updateLoadingOverlay();
  }
}

function hasPlayerDeathAction() {
  return !!(hasUsableMixamoPlayer() && mixamo.actions.death);
}

function beginPlayerDeath() {
  if (state.playerDeathStarted) return;
  state.playerDeathStarted = true;
  state.playerDeathTimer = 0;
  state.playerDeathDuration = Math.max(1.1, mixamo.actions.death?.getClip?.().duration || 1.2);
  state.bowDrawing = false;
  state.bowDraw = 0;
  state.moving = false;
  state.sprinting = false;
  keys.clear();
  if (mixamo.actions.death) {
    Object.values(mixamo.actions).forEach((action) => {
      if (action !== mixamo.actions.death) action.fadeOut(0.08);
    });
    const death = mixamo.actions.death;
    death.enabled = true;
    death.reset();
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    death.setEffectiveTimeScale(1);
    death.setEffectiveWeight(1);
    death.play();
    mixamo.active = death;
    mixamo.activeName = "death";
  } else {
    if (mixamo.active) mixamo.active.fadeOut(0.12);
    Object.values(mixamo.actions).forEach((action) => {
      action.setEffectiveWeight(0);
      action.enabled = false;
    });
  }
  state.doorMessage = "You were defeated";
  state.doorMessageTimer = 3;
  updateGameOverOverlay();
}

function updatePlayerDeath(dt) {
  if (!state.playerDead) return;
  beginPlayerDeath();
  state.playerDeathTimer = Math.min(1, state.playerDeathTimer + dt / state.playerDeathDuration);
  updateGameOverOverlay();
}

function applyPlayerDeathPose(target) {
  const p = THREE.MathUtils.smoothstep(state.playerDeathTimer, 0, 1);
  target.rotation.z = THREE.MathUtils.lerp(0, Math.PI / 2, p);
  target.rotation.x = THREE.MathUtils.lerp(0, -0.18, p);
  target.position.y += THREE.MathUtils.lerp(0, 0.28, p);
}

function keepObjectOnGround(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.y)) return;
  object.position.y -= box.min.y;
}

function updatePlayerMesh() {
  const useMixamo = hasUsableMixamoPlayer();
  playerMesh.position.copy(player.pos);
  playerMesh.rotation.set(0, state.yaw + Math.PI, 0);
  playerMesh.visible = state.gameReady && state.cameraMode === "third" && !useMixamo;
  const t = performance.now() * 0.006;
  const bob = state.moving ? Math.sin(t * (state.sprinting ? 1.6 : 1)) * 0.06 : Math.sin(t * 0.4) * 0.018;
  playerMesh.position.y = state.playerDead ? 0 : (state.room3Falling ? player.pos.y : bob);
  if (state.playerDead && !hasPlayerDeathAction()) applyPlayerDeathPose(playerMesh);
  const parts = playerMesh.userData;
  parts.leftArm.rotation.z = -0.55 + (state.moving ? Math.sin(t) * 0.16 : 0);
  parts.rightArm.rotation.z = 0.75 + state.fireFlash * 0.55 - (state.moving ? Math.sin(t) * 0.12 : 0);
  parts.bowGroup.rotation.x = -0.08 - state.fireFlash * 0.28;
  parts.loadedArrow.visible = state.fireFlash < 0.72;
  parts.muzzleFlame.visible = state.fireFlash > 0.05;
  parts.muzzleFlame.scale.setScalar(0.8 + state.fireFlash * 2.2);
  state.fireFlash = Math.max(0, state.fireFlash - 0.08);

  if (mixamo.ready && mixamo.root && mixamo.offset) {
    mixamo.root.position.copy(player.pos).add(mixamo.offset);
    mixamo.root.rotation.set(0, state.yaw + mixamo.yawOffset, 0);
    if (state.playerDead && !hasPlayerDeathAction()) applyPlayerDeathPose(mixamo.root);
    if (state.playerDead && !state.room3Falling) keepObjectOnGround(mixamo.root);

    const showMixamo = state.gameReady && state.cameraMode === "third" && hasUsableMixamoPlayer();
    mixamo.root.visible = showMixamo;
    mixamo.root.traverse((obj) => {
      if (obj.isMesh || obj.isSkinnedMesh) {
        obj.visible = showMixamo;
        obj.frustumCulled = false;
      }
    });

    if (mixamo.helper) {
      mixamo.helper.visible = showMixamo && state.skeletonPanelEnabled;
      if (mixamo.helper.visible && typeof mixamo.helper.update === "function" && performance.now() - lastSkeletonHelperUpdate > 250) {
        mixamo.helper.update();
        lastSkeletonHelperUpdate = performance.now();
      }
    }
  }
}

function loadMixamoPlayer() {
  mixamo.status = "loading converted GLB";
  loadMixamoModelFromUrls([mixamo.modelUrl, `${ASSET_BASE}models/erika-archer.glb`], 0);
}

function loadMixamoModelFromUrls(urls, index) {
  const url = urls[index];
  if (!url) {
    mixamo.ready = false;
    mixamo.status = "model failed; procedural fallback";
    mixamo.error = mixamo.error || "all model paths failed";
    console.warn("Mixamo model failed on all paths; procedural playerMesh remains active.");
    return;
  }

  mixamo.status = `loading model ${url}`;
  mixamo.modelUrl = url;
  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    url,
    (gltf) => {
      setupMixamoModel(gltf.scene, gltf.animations || []);
    },
    (event) => {
      if (event.total) mixamo.progress = Math.round((event.loaded / event.total) * 100);
    },
    (error) => {
      const message = error?.message || `failed to load ${url}`;
      mixamo.error = message;
      mixamo.animationErrors.push(`model ${url}: ${message}`);
      console.warn("Mixamo GLB load failed:", url, error);
      loadMixamoModelFromUrls(urls, index + 1);
    }
  );
}

function setupMixamoModel(model, embeddedAnimations = []) {
  mixamo.skinnedMeshes = [];
  mixamo.boneNames = [];
  mixamo.bones = {};

  model.traverse((child) => {
    if (child.name?.startsWith("mixamorig:")) {
      child.name = child.name.replace("mixamorig:", "mixamorig");
    }
    if (child.isSkinnedMesh) {
      mixamo.skinnedMeshes.push(child);
      child.frustumCulled = false;
    }
    if (child.isBone) {
      mixamo.boneNames.push(child.name || "(unnamed bone)");
      mixamo.bones[child.name] = child;
      mixamo.bones[child.name.replace(/^mixamorig:?/, "")] = child;
    }
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      prepareMixamoMaterials(child);
      if (child.skeleton?.bones?.length) {
        child.skeleton.bones.forEach((bone) => {
          if (bone.name && !mixamo.boneNames.includes(bone.name)) mixamo.boneNames.push(bone.name);
        });
      }
    }
  });

  normalizeMixamoModel(model);
  mixamo.helper = new THREE.SkeletonHelper(model);
  mixamo.helper.visible = false;
  scene.add(mixamo.helper);
  scene.add(model);
  mixamo.root = model;
  mixamo.mixer = new THREE.AnimationMixer(model);
  mixamo.ready = true;
  mixamo.error = "";
  mixamo.status = `GLB model loaded (${mixamo.skinnedMeshes.length} skinned mesh)`;

  console.group("Mixamo Model Diagnostic");
  console.log("Model URL:", mixamo.modelUrl);
  console.log("Embedded GLB animations:", embeddedAnimations.length);
  console.log("SkinnedMesh count:", mixamo.skinnedMeshes.length);
  console.log("SkinnedMesh names:", mixamo.skinnedMeshes.map((mesh) => mesh.name));
  console.log("Bone names:", mixamo.boneNames.slice(0, 40));
  console.groupEnd();

  const animLoader = new FBXLoader();
  animLoader.setPath(mixamo.animationBaseUrl);
  loadMixamoAnimations(animLoader, true);
}

function prepareMixamoMaterials(mesh) {
  const fallback = () => new THREE.MeshStandardMaterial({
    color: 0x2a2a32,
    roughness: 0.78,
    metalness: 0.04,
    emissive: 0x09070a,
    emissiveIntensity: 0.18,
  });
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const prepared = materials.map((material) => {
    const target = material || fallback();
    target.transparent = false;
    target.opacity = 1;
    target.alphaTest = 0;
    target.depthWrite = true;
    target.depthTest = true;
    target.side = THREE.DoubleSide;
    target.needsUpdate = true;
    if ("roughness" in target) target.roughness = Math.max(target.roughness ?? 0.78, 0.68);
    if ("metalness" in target) target.metalness = Math.min(target.metalness ?? 0.04, 0.06);
    if ("color" in target && target.color) {
      const hex = target.color.getHex?.() ?? 0xffffff;
      if (!target.map || hex === 0xffffff || hex === 0x000000) target.color.setHex(0x2f3038);
    }
    if ("emissive" in target && target.emissive) {
      target.emissive.setHex(0x0b0809);
      target.emissiveIntensity = Math.max(target.emissiveIntensity ?? 0, 0.16);
    }
    return target;
  });
  mesh.visible = true;
  mesh.frustumCulled = false;
  mesh.material = Array.isArray(mesh.material) ? prepared : prepared[0];
}

function normalizeMixamoModel(model) {
  model.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const targetHeight = 1.85;
  const scale = rawSize.y > 0 && Number.isFinite(rawSize.y) ? targetHeight / rawSize.y : 0.01;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const minY = box.min.y;
  if (!mixamo.offset) mixamo.offset = new THREE.Vector3();
  mixamo.offset.set(-center.x, -minY, -center.z);
  model.position.set(0, 0, 0);
  mixamo.footOffset = 0;
  mixamo.height = targetHeight;
  mixamo.scale = scale;
}
function loadMixamoAnimations(loader, allowRelativeFallback = true) {
  const clips = {
    idle: "standing idle 01.fbx",
    runForward: "standing run forward.fbx",
    runBack: "standing run back.fbx",
    runLeft: "standing run left.fbx",
    runRight: "standing run right.fbx",
    walkForward: "standing walk forward.fbx",
    walkBack: "standing walk back.fbx",
    walkLeft: "standing walk left.fbx",
    walkRight: "standing walk right.fbx",
    jump: "Standing Jump.fbx",
    aimIdle: "Standing Aim Overdraw.fbx",
    aimWalkForward: "Standing Aim Walk Forward.fbx",
    aimWalkBack: "Standing Aim Walk Back.fbx",
    aimWalkLeft: "Standing Aim Walk Left.fbx",
    aimWalkRight: "Standing Aim Walk Right.fbx",
    runningJump: "Standing Jump Running To Run Forward.fbx",
    death: "Standing Death Forward 02.fbx",
  };

  mixamo.loadedAnimations = 0;
  mixamo.animationErrors = [];
  Object.entries(clips).forEach(([name, file]) => loadMixamoAnimationClip(loader, name, file, allowRelativeFallback));

  loadMixamoAnimationCandidates(loader, "shootBow", [
    "archer shooting.fbx",
    "Archer Shooting.fbx",
    "shoot bow.fbx",
    "Shoot Bow.fbx",
    "standing shoot bow.fbx",
    "Standing Shoot Bow.fbx",
    "bow shot.fbx",
    "Bow Shot.fbx"
  ], allowRelativeFallback);
}

function loadMixamoAnimationCandidates(loader, name, files, allowRelativeFallback, index = 0) {
  const file = files[index];
  if (!file) {
    console.info(`${name}: optional animation file not found`);
    return;
  }
  loader.load(file, (fbx) => {
    loadMixamoAnimationFromFbx(name, file, fbx);
  }, undefined, () => {
    loadMixamoAnimationCandidates(loader, name, files, allowRelativeFallback, index + 1);
  });
}

function loadMixamoAnimationFromFbx(name, file, fbx) {
  if (!mixamo.mixer) {
    mixamo.animationErrors.push(`${file}: mixer missing`);
    return;
  }
  const sourceClip = fbx.animations?.[0];
  if (!sourceClip) {
    console.warn("Mixamo animation has no clip:", file);
    mixamo.animationErrors.push(`${file}: no animation clip`);
    return;
  }
  const clip = retargetMixamoClip(sourceClip, name);
  if (!clip.tracks.length) {
    mixamo.animationErrors.push(`${file}: no compatible tracks`);
    return;
  }
  mixamo.clipTrackNames[name] = clip.tracks.map((track) => track.name);
  diagnoseClipCompatibility(name, clip);

  const action = mixamo.mixer.clipAction(clip);
  action.enabled = true;
  action.setEffectiveWeight(name === "idle" ? 1 : 0);
  if (name === "jump" || name === "shootBow" || name === "death") {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  action.play();
  mixamo.actions[name] = action;
  mixamo.loadedAnimations = Object.keys(mixamo.actions).length;
  mixamo.status = `animations ${mixamo.loadedAnimations} loaded`;
  console.log(`Loaded retargeted Mixamo animation ${name}:`, file, mixamo.clipTrackNames[name].slice(0, 8));
  if (!mixamo.active || name === "idle") setMixamoAction(name === "idle" ? "idle" : name, 0);
}

function loadMixamoAnimationClip(loader, name, file, allowRelativeFallback) {
  loader.load(file, (fbx) => {
    loadMixamoAnimationFromFbx(name, file, fbx);
  }, undefined, (error) => {
    const message = `${file}: ${error?.message || "animation load failed"}`;
    mixamo.animationErrors.push(message);
    console.warn("Mixamo animation failed:", `${mixamo.animationBaseUrl}${file}`, error);
    if (allowRelativeFallback && mixamo.animationBaseUrl.startsWith("/")) {
      const fallbackLoader = new FBXLoader();
      fallbackLoader.setPath(`${ASSET_BASE}mixamo/`);
      loadMixamoAnimationClip(fallbackLoader, name, file, false);
    }
  });
}


function shouldKeepMixamoPositionTrack(clipName, targetNodeName, propertyName) {
  if (propertyName !== "position") return false;
  const suffix = targetNodeName.replace(/^mixamorig:?/, "");
  return clipName === "death" && suffix === "Hips";
}

function stabilizeMixamoRootPositionTrack(positionTrack) {
  const values = positionTrack.values;
  if (!values || values.length < 3) return;
  const baseX = values[0];
  const baseZ = values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] = baseX;
    values[i + 2] = baseZ;
  }
}

function retargetMixamoClip(sourceClip, name) {
  const tracks = sourceClip.tracks
    .map((track) => {
      const cloned = track.clone();
      const [rawNodeName, propertyName] = cloned.name.split(".");
      const targetNodeName = resolveMixamoBoneName(rawNodeName);

      if (!targetNodeName || !propertyName) return null;
      if (propertyName === "position" && !shouldKeepMixamoPositionTrack(name, targetNodeName, propertyName)) return null;

      cloned.name = `${targetNodeName}.${propertyName}`;
      if (propertyName === "position") stabilizeMixamoRootPositionTrack(cloned);
      return cloned;
    })
    .filter(Boolean);

  const clip = new THREE.AnimationClip(name, sourceClip.duration, tracks);
  clip.optimize();
  return clip;
}

function resolveMixamoBoneName(rawNodeName) {
  if (mixamo.boneNames.includes(rawNodeName)) return rawNodeName;
  if (rawNodeName.startsWith("mixamorig") && !rawNodeName.startsWith("mixamorig:")) {
    const colonName = `mixamorig:${rawNodeName.slice("mixamorig".length)}`;
    if (mixamo.boneNames.includes(colonName)) return colonName;
  }
  const suffix = rawNodeName.replace(/^mixamorig:?/, "");
  return mixamo.boneNames.find((boneName) => boneName.replace(/^mixamorig:?/, "") === suffix) || null;
}

function stabilizeRootMotion(positionTrack) {
  const values = positionTrack.values;
  if (!values || values.length < 3) return;
  const baseX = values[0];
  const baseZ = values[2];
  for (let i = 0; i < values.length; i += 3) {
    values[i] = baseX;
    values[i + 2] = baseZ;
  }
}
function diagnoseClipCompatibility(name, clip) {
  const trackBoneNames = [...new Set(clip.tracks.map((track) => track.name.split(".")[0]))];
  const matching = trackBoneNames.filter((boneName) => mixamo.boneNames.includes(boneName));
  console.log(`Animation compatibility ${name}: ${matching.length}/${trackBoneNames.length}`, matching.slice(0, 12));
  if (trackBoneNames.length && matching.length / trackBoneNames.length < 0.2) {
    console.warn("Animation may not match model skeleton:", name, trackBoneNames.slice(0, 20));
  }
}

function applyProceduralMixamoIdle(time) {
  if (!mixamo.ready || mixamo.loadedAnimations > 0 || !mixamo.root) return;
  const wanted = ["Spine", "Head", "Neck", "Hips"];
  mixamo.root.traverse((node) => {
    if (!node.isBone || !wanted.some((key) => node.name.includes(key))) return;
    if (node.name.includes("Spine")) node.rotation.z = Math.sin(time * 1.5) * 0.05;
    if (node.name.includes("Head") || node.name.includes("Neck")) node.rotation.y = Math.sin(time * 1.2) * 0.08;
  });
}
function setMixamoAction(name, fade = 0.18) {
  const next = mixamo.actions[name];
  if (!next) return;
  if (mixamo.active === next) {
    next.enabled = true;
    next.setEffectiveWeight(1);
    return;
  }
  if (mixamo.active) mixamo.active.fadeOut(fade);
  next.enabled = true;
  next.reset();
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  if (fade > 0) next.fadeIn(fade);
  next.play();
  mixamo.active = next;
  mixamo.activeName = name;
}

function ensureMixamoAction() {
  if (!mixamo.ready || !mixamo.mixer || mixamo.active) return;
  const fallbackName = mixamo.actions.idle ? "idle" : Object.keys(mixamo.actions)[0];
  if (fallbackName) setMixamoAction(fallbackName, 0);
}

function updateMixamoDiagnostics() {
  if (!mixamo.active) {
    mixamo.bindingCount = 0;
    return;
  }
  mixamo.bindingCount = mixamo.active._propertyBindings?.length || 0;
}
function chooseMixamoAction() {
  if (state.playerDead || !hasUsableMixamoPlayer() || state.actionLock > 0) return;

  const sprint = state.sprinting;
  const forward = state.moveForward || 0;
  const strafe = state.moveStrafe || 0;
  const aiming = state.bowDrawing || state.bowDraw > 0.08;

  if (aiming) {
    if (!state.moving) {
      setMixamoAction(mixamo.actions.aimIdle ? "aimIdle" : "idle");
      return;
    }

    if (sprint) {
      if (Math.abs(forward) >= Math.abs(strafe)) {
        if (forward > 0) setMixamoAction("runForward");
        else setMixamoAction("runBack");
      } else {
        if (strafe < 0) setMixamoAction("runLeft");
        else setMixamoAction("runRight");
      }
      return;
    }

    if (Math.abs(forward) >= Math.abs(strafe)) {
      if (forward > 0) setMixamoAction(mixamo.actions.aimWalkForward ? "aimWalkForward" : "walkForward");
      else setMixamoAction(mixamo.actions.aimWalkBack ? "aimWalkBack" : "walkBack");
    } else {
      if (strafe < 0) setMixamoAction(mixamo.actions.aimWalkLeft ? "aimWalkLeft" : "walkLeft");
      else setMixamoAction(mixamo.actions.aimWalkRight ? "aimWalkRight" : "walkRight");
    }
    return;
  }

  if (!state.moving) {
    setMixamoAction("idle");
    return;
  }

  if (Math.abs(forward) >= Math.abs(strafe)) {
    if (forward > 0) setMixamoAction(sprint ? "runForward" : "walkForward");
    else setMixamoAction(sprint ? "runBack" : "walkBack");
  } else {
    if (strafe < 0) setMixamoAction(sprint ? "runLeft" : "walkLeft");
    else setMixamoAction(sprint ? "runRight" : "walkRight");
  }
}

function makeBowMesh() {
  const group = new THREE.Group();
  const woodMat = makeMaterial(0x8b4f24, 0.52);
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xf3e6ca });
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), woodMat);
  upper.position.y = 0.27;
  upper.rotation.z = -0.32;
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), woodMat);
  lower.position.y = -0.27;
  lower.rotation.z = 0.32;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 10), makeMaterial(0x3b2418, 0.7));
  const string = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.14, 0.62, 0),
      new THREE.Vector3(-0.1, 0, 0),
      new THREE.Vector3(0.14, -0.62, 0),
    ]),
    stringMat
  );
  group.add(upper, lower, grip, string);
  group.rotation.z = Math.PI / 2;
  return group;
}

var arrowAssetCache;

function getArrowAssetCache() {
  if (!arrowAssetCache) {
    arrowAssetCache = {
      shafts: new Map(),
      tip: new THREE.ConeGeometry(0.055, 0.16, 10),
      feather: new THREE.PlaneGeometry(0.12, 0.06),
      flame: new THREE.SphereGeometry(0.075, 10, 8),
      shaftMat: makeMaterial(0x6b4427, 0.55),
      tipMat: makeMaterial(0xcfd5dd, 0.38),
      featherMat: new THREE.MeshBasicMaterial({ color: 0xe9edf2, side: THREE.DoubleSide }),
      flameMat: new THREE.MeshBasicMaterial({ color: 0xff8236 }),
    };
  }
  return arrowAssetCache;
}

function getArrowShaftGeometry(length) {
  const cache = getArrowAssetCache();
  const key = length.toFixed(2);
  if (!cache.shafts.has(key)) {
    cache.shafts.set(key, new THREE.CylinderGeometry(0.018, 0.018, length, 8));
  }
  return cache.shafts.get(key);
}

function makeArrowMesh(length = 0.82, burning = true) {
  const cache = getArrowAssetCache();
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(getArrowShaftGeometry(length), cache.shaftMat);
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(cache.tip, cache.tipMat);
  tip.position.z = -length / 2 - 0.07;
  tip.rotation.x = -Math.PI / 2;
  for (const side of [-1, 1]) {
    const feather = new THREE.Mesh(cache.feather, cache.featherMat);
    feather.position.set(side * 0.035, 0, length / 2 - 0.08);
    feather.rotation.set(0, side * 0.55, 0);
    group.add(feather);
  }
  group.add(shaft, tip);
  if (burning) {
    const flame = new THREE.Mesh(cache.flame, cache.flameMat);
    flame.position.z = -length / 2 - 0.16;
    group.add(flame);
    group.userData.flame = flame;
  }
  return group;
}

function makeBotMesh({ boss = false, color = 0x8f2c2c } = {}) {
  if (!boss) {
    const paladin = clonePaladinBotMesh();
    if (paladin) return paladin;
  }

  const group = new THREE.Group();
  const bodyMat = makeMaterial(color, 0.72);
  const darkMat = makeMaterial(0x171014, 0.84);
  const glowMat = new THREE.MeshBasicMaterial({ color: boss ? 0xffd15a : 0xff4b3d });
  const scale = boss ? 1.65 : 1;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * scale, 0.95 * scale, 8, 14), bodyMat);
  body.position.y = 0.95 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 16, 12), darkMat);
  head.position.y = 1.65 * scale;
  head.castShadow = true;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 8, 6), glowMat);
  eyeL.position.set(-0.08 * scale, 1.68 * scale, -0.2 * scale);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.08 * scale;
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.08 * scale, 0.08 * scale), darkMat);
  claw.position.set(0, 1.05 * scale, -0.36 * scale);
  group.add(body, head, eyeL, eyeR, claw);
  group.userData = { body, head, eyeL, eyeR, claw, baseColor: color, proceduralBot: true };
  scene.add(group);
  return group;
}

function spawnBot(tx, ty, options = {}) {
  const pos = tileToWorld(tx, ty);
  const boss = !!options.boss;
  const roomId = options.roomId || getRoomIdAtWorld(pos);
  const chaseAngle = options.chaseAngle ?? Math.random() * Math.PI * 2;
  const bot = {
    mesh: makeBotMesh({ boss, color: options.color || (boss ? 0x5330a0 : 0x8f2c2c) }),
    pos,
    spawnPos: pos.clone(),
    roomId,
    name: options.name || (boss ? "Room3 Boss" : "Paladin Soldier"),
    state: "chase",
    aggro: true,
    alwaysAggro: true,
    chaseAngle,
    chaseRadius: boss ? 1.7 : 1.05 + Math.random() * 1.45,
    chaseOrbitSpeed: (boss ? 0.45 : 0.75) * (Math.random() < 0.5 ? -1 : 1),
    hp: boss ? 10 : 3,
    maxHp: boss ? 10 : 3,
    speed: boss ? 3.25 : 4.65,
    detectRange: boss ? 30 : 18,
    returnRange: 1.2,
    separationRadius: boss ? 1.7 : 1.1,
    attackRange: boss ? 2.35 : 1.65,
    attackDamage: boss ? 1 : 1,
    attackCooldown: 0,
    attackLookAt: null,
    attackElapsed: 0,
    attackDuration: 0,
    attackHitTime: 0,
    attackHasHit: false,
    attackHitWindowStart: 0,
    attackHitWindowEnd: 0,
    attackLungeSpeed: 0,
    weaponPrevPos: null,
    lastWeaponHitDistance: 999,
    hitFlash: 0,
    stateLock: 0,
    boss,
    dead: false,
    baseScale: null,
    mixer: null,
    actions: {},
    activeAction: null,
    activeActionName: "",
    runeSymbol: options.runeSymbol || "",
    runeRevealed: false,
  };
  bot.mesh.position.copy(pos);
  bot.mesh.rotation.y = chaseAngle;
  bot.baseScale = bot.mesh.scale.clone();
  bots.push(bot);
  setupBotAnimator(bot);
  return bot;
}

function spawnBots() {
  let room2RuneIndex = 0;
  for (let ty = 0; ty < map.length; ty++) {
    for (let tx = 0; tx < map[0].length; tx++) {
      const cell = map[ty][tx];
      const spawnX = tx + 0.5;
      const spawnY = ty + 0.5;
      const pos = tileToWorld(spawnX, spawnY);
      if (cell === "P") {
        const roomId = getRoomIdAtWorld(pos);
        const runeSymbol = roomId === "2" && room2RuneIndex < ROOM2_RUNE_SYMBOLS.length
          ? ROOM2_RUNE_SYMBOLS[room2RuneIndex++]
          : "";
        spawnBot(spawnX, spawnY, { roomId, name: `Room ${roomId} Paladin`, runeSymbol });
      }
    }
  }
}

function damageBot(bot, amount) {
  if (bot.dead) return;
  bot.hp -= amount;
  bot.hitFlash = 1;
  bot.aggro = true;
  if (bot.hp <= 0) {
    bot.dead = true;
    bot.state = "dead";
    const deathDuration = botActionDuration(bot, "death", 1.8);
    bot.stateLock = deathDuration + 0.15;
    if (!playBotOneShot(bot, "death", deathDuration + 0.15)) {
      bot.mesh.rotation.z = Math.PI / 2;
      bot.mesh.position.y = 0.18;
    }
    bot.mesh.traverse((obj) => {
      if (obj.material?.color && !bot.mesh.userData?.paladinBot) obj.material.color.setHex(0x1a1518);
    });
    if (bot.roomId === "2") revealRoom2Rune(bot);
    return;
  }
  bot.state = "hit";
  playBotOneShot(bot, "impact", 0.35);
}

function moveBotToward(bot, targetPos, dt) {
  const toTarget = targetPos.clone().sub(bot.pos);
  toTarget.y = 0;
  const dist = toTarget.length();
  if (dist < 0.05) return;

  const dir = toTarget.normalize();
  const step = bot.speed * dt;
  const nextX = bot.pos.x + dir.x * step;
  const nextZ = bot.pos.z + dir.z * step;

  if (!isSolidWorld(nextX, bot.pos.z)) bot.pos.x = nextX;
  if (!isSolidWorld(bot.pos.x, nextZ)) bot.pos.z = nextZ;
}

function botChaseTarget(bot, dt) {
  bot.chaseAngle += bot.chaseOrbitSpeed * dt;
  const offset = new THREE.Vector3(
    Math.cos(bot.chaseAngle) * bot.chaseRadius,
    0,
    Math.sin(bot.chaseAngle) * bot.chaseRadius
  );
  const targetPos = player.pos.clone().add(offset);
  return isSolidWorld(targetPos.x, targetPos.z) ? player.pos : targetPos;
}

function beginBotAttack(bot) {
  const variants = bot.boss
    ? [
        { speed: 0.92, hit: 0.58, cooldown: 1.15, lunge: 1.6, damage: 1.15 },
        { speed: 1.08, hit: 0.5, cooldown: 0.98, lunge: 2.0, damage: 1 },
        { speed: 1.25, hit: 0.43, cooldown: 0.86, lunge: 2.25, damage: 0.9 },
      ]
    : [
        { speed: 0.95, hit: 0.56, cooldown: 0.82, lunge: 1.45, damage: 1 },
        { speed: 1.18, hit: 0.47, cooldown: 0.68, lunge: 1.8, damage: 0.9 },
        { speed: 1.35, hit: 0.4, cooldown: 0.6, lunge: 2.05, damage: 0.8 },
      ];
  const attackActions = availableBotAttackActions(bot);
  const actionName = attackActions.length ? attackActions[Math.floor(Math.random() * attackActions.length)] : "attack2";
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const baseDuration = botActionDuration(bot, actionName, bot.boss ? 0.78 : 0.48);
  const duration = baseDuration / variant.speed;
  bot.state = "attack";
  bot.aggro = true;
  bot.attackElapsed = 0;
  bot.attackDuration = duration;
  bot.attackHitTime = duration * variant.hit;
  bot.attackHitWindowStart = duration * Math.max(0.18, variant.hit - 0.16);
  bot.attackHitWindowEnd = duration * Math.min(0.88, variant.hit + 0.18);
  bot.attackHasHit = false;
  bot.weaponPrevPos = null;
  bot.lastWeaponHitDistance = 999;
  bot.attackDamageThisSwing = 1;
  bot.attackLungeSpeed = bot.speed * variant.lunge;
  bot.attackLookAt = player.pos.clone();
  bot.attackCooldown = Math.max(variant.cooldown, duration * 0.9);
  if (!playBotOneShot(bot, actionName, baseDuration, variant.speed)) bot.stateLock = duration;
}

function updateBotAttackMovement(bot, dt) {
  if (state.playerDead) return;
  bot.attackElapsed += dt;
  if (!bot.attackLookAt) return;
  const lungeWindow = bot.attackElapsed < bot.attackDuration * 0.45;
  if (lungeWindow) moveBotToward(bot, bot.attackLookAt, dt * (bot.attackLungeSpeed / Math.max(0.01, bot.speed)));
}

function resolveBotWeaponHit(bot, activeRoom) {
  if (state.playerDead) return;
  const weaponPos = botWeaponWorldPosition(bot);
  const prev = bot.weaponPrevPos || weaponPos.clone();
  bot.weaponPrevPos = weaponPos.clone();

  if (bot.attackHasHit || !activeRoom) return;
  if (bot.attackElapsed < bot.attackHitWindowStart || bot.attackElapsed > bot.attackHitWindowEnd) return;

  const toPlayer = player.pos.clone().sub(bot.pos);
  toPlayer.y = 0;
  if (toPlayer.length() > bot.attackRange + (bot.boss ? 0.7 : 0.45)) return;

  const attackDir = (bot.attackLookAt || player.pos).clone().sub(bot.pos);
  attackDir.y = 0;
  if (attackDir.lengthSq() > 0.001 && toPlayer.lengthSq() > 0.001) {
    attackDir.normalize();
    const playerDir = toPlayer.clone().normalize();
    if (attackDir.dot(playerDir) < 0.18) return;
  }

  const hitRadius = bot.boss ? 1.1 : 0.82;
  let closest = Infinity;
  for (const point of playerBodyHitPoints()) {
    closest = Math.min(closest, distancePointToSegment(point, prev, weaponPos));
  }
  bot.lastWeaponHitDistance = closest;
  if (closest > hitRadius) return;

  bot.attackHasHit = true;
  if (state.playerDead) return;
  state.playerHp = Math.max(0, state.playerHp - bot.attackDamageThisSwing);
  state.playerDead = state.playerHp <= 0;
  if (state.playerDead) beginPlayerDeath();
  state.playerHitFlash = 1;
  state.doorMessage = state.playerDead ? "You were defeated" : (bot.boss ? "Boss hit you" : "Paladin soldier hit you");
  state.doorMessageTimer = state.playerDead ? 2.6 : 1.1;
}

function applyBotSeparation(bot, dt) {
  const push = new THREE.Vector3();
  for (const other of bots) {
    if (other === bot || other.dead || other.roomId !== bot.roomId) continue;
    const diff = bot.pos.clone().sub(other.pos);
    diff.y = 0;
    const d = diff.length();
    const minDist = bot.separationRadius || 1.1;
    if (d > 0.001 && d < minDist) {
      push.add(diff.normalize().multiplyScalar((minDist - d) * 0.35));
    }
  }
  if (push.lengthSq() <= 0) return;
  push.multiplyScalar(dt * 5);
  const nextX = bot.pos.x + push.x;
  const nextZ = bot.pos.z + push.z;
  if (!isSolidWorld(nextX, bot.pos.z)) bot.pos.x = nextX;
  if (!isSolidWorld(bot.pos.x, nextZ)) bot.pos.z = nextZ;
}

function updateBotVisual(bot, dt, animateBot = true, visibleBot = true) {
  bot.mesh.position.copy(bot.pos);
  bot.mesh.visible = visibleBot;
  if (!visibleBot) return;
  if (bot.state === "attack" && bot.stateLock > 0 && bot.attackLookAt) {
    bot.mesh.lookAt(bot.attackLookAt.x, bot.mesh.position.y, bot.attackLookAt.z);
  } else if (bot.state === "chase" || bot.state === "attack" || bot.state === "hit") {
    bot.mesh.lookAt(player.pos.x, bot.mesh.position.y, player.pos.z);
  } else if (bot.state === "return") {
    bot.mesh.lookAt(bot.spawnPos.x, bot.mesh.position.y, bot.spawnPos.z);
  }

  if (!bot.dead && bot.stateLock <= 0) {
    if (bot.state === "chase") setBotAction(bot, bot.boss ? "run" : "run");
    else if (bot.state === "return") setBotAction(bot, "walk");
    else if (bot.state === "idle") setBotAction(bot, "idle");
  }

  const pulse = bot.hitFlash > 0 ? 1.35 : 1;
  bot.mesh.scale.copy(bot.baseScale).multiplyScalar(pulse);
  const animateMixer = animateBot && bot.pos.distanceTo(player.pos) < PERF.botAnimationDistance;
  if (bot.mixer && animateMixer) bot.mixer.update(dt);
  applyBotProceduralMotion(bot, dt);
}

function updateBots(dt) {
  state.playerHitFlash = Math.max(0, state.playerHitFlash - dt * 2.4);
  if (!state.gameReady) return;
  const playerRoom = currentRoom();

  for (const bot of bots) {
    if (bot.dead) {
      const deadVisible = !!playerRoom && playerRoom.id === bot.roomId;
      bot.mesh.position.copy(bot.pos);
      bot.mesh.visible = deadVisible;
      bot.stateLock = Math.max(0, bot.stateLock - dt);
      if (deadVisible && bot.mixer && bot.stateLock > 0 && bot.pos.distanceTo(player.pos) < PERF.botAnimationDistance) bot.mixer.update(dt);
      continue;
    }

    if (state.playerDead) {
      bot.aggro = false;
      bot.state = "idle";
      bot.stateLock = 0;
      bot.attackCooldown = Math.max(bot.attackCooldown, 0.6);
      bot.attackHasHit = true;
      bot.attackLookAt = null;
      updateBotVisual(bot, dt, true, !!playerRoom && playerRoom.id === bot.roomId);
      continue;
    }

    bot.attackCooldown = Math.max(0, bot.attackCooldown - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt * 4);
    bot.stateLock = Math.max(0, bot.stateLock - dt);

    const activeRoom = !!playerRoom && playerRoom.id === bot.roomId;
    const toPlayer = player.pos.clone().sub(bot.pos);
    const distToPlayer = toPlayer.length();
    const distToSpawn = bot.pos.distanceTo(bot.spawnPos);

    if (bot.state === "hit" && bot.stateLock > 0) {
      updateBotVisual(bot, dt, activeRoom, activeRoom);
      continue;
    }
    if (bot.state === "attack" && bot.stateLock > 0) {
      updateBotAttackMovement(bot, dt);
      updateBotVisual(bot, dt, activeRoom, activeRoom);
      resolveBotWeaponHit(bot, activeRoom);
      continue;
    }

    if (!activeRoom) {
      bot.aggro = false;
      bot.state = distToSpawn > bot.returnRange ? "return" : "idle";
      if (bot.state === "return") {
        moveBotToward(bot, bot.spawnPos, dt * 0.75);
        if (bot.pos.distanceTo(bot.spawnPos) <= bot.returnRange) bot.aggro = false;
      }
      updateBotVisual(bot, dt, false, false);
      continue;
    } else if (distToPlayer <= bot.attackRange && bot.attackCooldown <= 0) {
      bot.aggro = true;
      bot.state = "attack";
    } else if (bot.alwaysAggro) {
      bot.aggro = true;
      bot.state = "chase";
    } else if (bot.aggro) {
      bot.state = "chase";
    } else {
      bot.state = "idle";
    }

    if (bot.state === "chase") {
      moveBotToward(bot, botChaseTarget(bot, dt), dt);
    } else if (bot.state === "return") {
      moveBotToward(bot, bot.spawnPos, dt * 0.75);
      if (bot.pos.distanceTo(bot.spawnPos) <= bot.returnRange) bot.aggro = false;
    }

    if (bot.state === "attack" && activeRoom && distToPlayer <= bot.attackRange && bot.attackCooldown <= 0) beginBotAttack(bot);

    applyBotSeparation(bot, dt);
    updateBotVisual(bot, dt, activeRoom, activeRoom);
  }
}

function replaceWeakBotMeshesWithPaladin() {
  if (!botAssets.paladin) return;
  for (const bot of bots) {
    if (bot.boss || bot.dead) continue;
    const oldMesh = bot.mesh;
    const replacement = makeBotMesh({ boss: false });
    replacement.position.copy(bot.pos);
    replacement.rotation.copy(oldMesh.rotation);
    scene.remove(oldMesh);
    bot.mesh = replacement;
    bot.baseScale = replacement.scale.clone();
    bot.mixer = null;
    bot.actions = {};
    bot.activeAction = null;
    bot.activeActionName = "";
    setupBotAnimator(bot);
  }
}

function aliveBotCount() {
  return bots.filter((bot) => !bot.dead).length;
}

function makeFirstPersonViewModel() {
  const group = new THREE.Group();
  const skin = makeMaterial(0xd2a26f, 0.62);
  const sleeve = makeMaterial(0x263143, 0.72);

  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), skin);
  leftHand.position.set(-0.34, -0.28, -0.72);
  const leftSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.36, 5, 10), sleeve);
  leftSleeve.position.set(-0.42, -0.34, -0.52);
  leftSleeve.rotation.set(1.1, 0.2, -0.45);

  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), skin);
  rightHand.position.set(0.28, -0.3, -0.42);
  const rightSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 5, 10), sleeve);
  rightSleeve.position.set(0.38, -0.36, -0.24);
  rightSleeve.rotation.set(1.2, -0.25, 0.55);

  const bow = makeBowMesh();
  bow.scale.setScalar(0.75);
  bow.position.set(-0.42, -0.18, -0.82);
  bow.rotation.set(0.15, 0.38, -0.18);

  const arrow = makeArrowMesh(0.72, true);
  arrow.scale.setScalar(0.65);
  arrow.position.set(0.02, -0.26, -0.72);
  arrow.rotation.set(Math.PI / 2, 0, 0);

  group.add(leftHand, leftSleeve, rightHand, rightSleeve, bow, arrow);
  group.userData = { leftHand, rightHand, rightSleeve, bow, arrow };
  camera.add(group);
  scene.add(camera);
  return group;
}

const firstPersonViewModel = null;

function updateFirstPersonViewModel(dt) {
  const targetDraw = state.bowDrawing ? 1 : 0;
  state.bowDraw += (targetDraw - state.bowDraw) * Math.min(1, dt * 12);
  state.bowRelease = Math.max(0, state.bowRelease - dt * 5);

  return;

  const parts = firstPersonViewModel.userData;
  const pull = state.bowDraw;
  const snap = state.bowRelease;
  parts.rightHand.position.set(0.28, -0.3, -0.42 + pull * 0.32 - snap * 0.1);
  parts.rightSleeve.position.set(0.38, -0.36, -0.24 + pull * 0.24 - snap * 0.08);
  parts.arrow.position.set(0.02, -0.26, -0.72 + pull * 0.32 - snap * 0.18);
  parts.bow.rotation.x = 0.15 - pull * 0.08 + snap * 0.12;
  parts.bow.position.z = -0.82 + snap * 0.08;
  parts.arrow.visible = state.bowRelease < 0.72;
}

function releaseBowShot() {
  if (!state.gameReady || state.gameWon || state.room3Falling || state.puzzleModalOpen || state.playerDead) return;
  if (!state.bowDrawing && state.bowDraw < 0.08) return;
  state.bowDrawing = false;
  if (state.arrowCooldown > 0) {
    state.doorMessage = `Arrow ready in ${state.arrowCooldown.toFixed(1)}s`;
    state.doorMessageTimer = 0.55;
    return;
  }
  if (state.arrowsRemaining <= 0) {
    state.doorMessage = "No arrows left";
    state.doorMessageTimer = 1.4;
    return;
  }
  state.bowRelease = 1;
  playOneShotMixamoAction("shootBow", 0.55);
  fireArrow();
}
function directionFromAim() {
  return new THREE.Vector3(
    Math.sin(state.yaw) * Math.cos(state.pitch),
    Math.sin(state.pitch),
    Math.cos(state.yaw) * Math.cos(state.pitch)
  ).normalize();
}

function fireArrow() {
  state.arrowsRemaining = Math.max(0, state.arrowsRemaining - 1);
  const dir = directionFromAim();
  const start = player.pos.clone().add(new THREE.Vector3(0, EYE_HEIGHT - 0.12, 0)).add(dir.clone().multiplyScalar(0.8));
  const mesh = makeArrowMesh(0.92, true);
  mesh.position.copy(start);
  scene.add(mesh);

  const light = new THREE.PointLight(0xff7435, 1.4 * state.brightness, 8, 2);
  light.position.copy(start);
  scene.add(light);

  arrows.push({
    mesh,
    light,
    pos: start,
    vel: dir.multiplyScalar(ARROW_SPEED),
    life: 3,
  });
  state.fireSignal += 1;
  state.fireFlash = 1;
  state.bowRelease = 1;
  state.arrowCooldown = ARROW_COOLDOWN;
}

function prewarmArrowAssets() {
  const mesh = makeArrowMesh(0.92, true);
  mesh.position.copy(player.pos).add(new THREE.Vector3(0, EYE_HEIGHT, 0));
  scene.add(mesh);
  try {
    renderer.compile(scene, camera);
  } finally {
    scene.remove(mesh);
  }
}

function distancePointToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.0001) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(segment, t));
}

function botAimPoint(bot) {
  return bot.pos.clone().add(new THREE.Vector3(0, bot.boss ? 1.35 : 0.95, 0));
}

function removeFlyingArrow(arrow) {
  scene.remove(arrow.mesh, arrow.light);
}

function bridgeTileHitByArrow(start, end) {
  let best = null;
  for (const tile of room3BridgeTiles) {
    if (tile.broken) continue;
    const closest = closestPointOnSegment2D(start, end, tile.mesh.position.x, tile.mesh.position.z);
    const y = THREE.MathUtils.lerp(start.y, end.y, closest.t);
    if (y < -0.15 || y > 1.15) continue;
    const half = CELL * 0.42;
    const point = start.clone().lerp(end, closest.t);
    if (Math.abs(point.x - tile.mesh.position.x) > half || Math.abs(point.z - tile.mesh.position.z) > half) continue;
    if (!best || closest.t < best.t) best = { tile, point, t: closest.t };
  }
  return best;
}

function testBridgeTile(tile) {
  if (!tile || tile.tested) return;
  tile.tested = true;
  if (tile.safe) {
    tile.mesh.material.color.setHex(0x49ffb2);
    tile.mesh.material.opacity = 0.62;
    if (tile.rim?.material) {
      tile.rim.material.color.setHex(0x49ffb2);
      tile.rim.material.opacity = 0.58;
    }
    state.doorMessage = "Tempered glass holds";
    state.doorMessageTimer = 1.4;
    return;
  }
  breakBridgeTile(tile, "Glass shattered");
}

function breakBridgeTile(tile, message = "Glass gives way") {
  if (!tile || tile.broken) return;
  tile.broken = true;
  tile.mesh.visible = false;
  if (tile.rim) {
    tile.rim.material.color.setHex(0xff4a3f);
    tile.rim.material.opacity = 0.85;
  }
  state.doorMessage = message;
  state.doorMessageTimer = 1.8;
}

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i];
    const prev = arrow.pos.clone();
    arrow.vel.y -= GRAVITY * dt;
    arrow.pos.addScaledVector(arrow.vel, dt);
    arrow.life -= dt;

    const arrowRoom = roomAtWorldPosition(arrow.pos);
    const hitBot = bots.find((bot) => {
      if (bot.dead) return false;
      if (arrowRoom && bot.roomId !== arrowRoom.id) return false;
      const radius = bot.boss ? 1.15 : 0.72;
      return distancePointToSegment(botAimPoint(bot), prev, arrow.pos) < radius;
    });
    const hitObject = projectileColliderHit(prev, arrow.pos);
    const hitBridge = bridgeTileHitByArrow(prev, arrow.pos);
    const hitWall = isHardProjectileWorld(arrow.pos.x, arrow.pos.z) || arrow.pos.y < 0.12;
    if (hitBot) {
      damageBot(hitBot, 1);
      removeFlyingArrow(arrow);
      arrows.splice(i, 1);
      continue;
    }
    if (hitObject?.collider?.room1Pillar) {
      lightRoom1Pillar(hitObject.collider.room1Pillar);
    }
    if (hitBridge) {
      testBridgeTile(hitBridge.tile);
      removeFlyingArrow(arrow);
      arrows.splice(i, 1);
      continue;
    }
    if (hitObject || hitWall || arrow.life <= 0) {
      stickArrow(arrow, hitObject?.point || prev, false);
      arrows.splice(i, 1);
      continue;
    }

    arrow.mesh.position.copy(arrow.pos);
    arrow.light.position.copy(arrow.pos);
    alignArrowMesh(arrow.mesh, arrow.vel);
  }

  for (let i = stuckArrows.length - 1; i >= 0; i--) {
    const stuck = stuckArrows[i];
    stuck.life -= dt * 0.18;
    stuck.light.intensity = stuck.light.visible ? Math.max(0, stuck.life / 8) * 2.2 * state.brightness : 0;
    if (stuck.life <= 0) {
      scene.remove(stuck.mesh, stuck.light);
      stuckArrows.splice(i, 1);
    }
  }
  updateStuckArrowLightBudget();
}

function updateStuckArrowLightBudget() {
  stuckArrows.forEach((stuck, i) => {
    const active = i >= stuckArrows.length - PERF.maxArrowLights;
    if (stuck.light) {
      stuck.light.visible = active;
      if (!active) stuck.light.intensity = 0;
    }
  });
}

function stickArrow(arrow, pos, targetHit) {
  arrow.pos.copy(pos);
  arrow.mesh.position.copy(pos);
  alignArrowMesh(arrow.mesh, arrow.vel);
  arrow.light.position.copy(pos);
  arrow.light.intensity = targetHit ? 3.2 : 2.2;
  arrow.light.distance = targetHit ? 12 : 9;
  stuckArrows.push({ mesh: arrow.mesh, light: arrow.light, life: targetHit ? 14 : 9 });
  updateStuckArrowLightBudget();
  while (stuckArrows.length > MAX_STUCK_ARROW_LIGHTS) {
    const removed = stuckArrows.shift();
    if (removed) scene.remove(removed.mesh, removed.light);
  }
}

function alignArrowMesh(mesh, velocity) {
  const dir = velocity.clone().normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
}

function startJump() {
  if (!state.gameReady || state.gameWon || state.room3Falling || state.puzzleModalOpen || state.playerDead || state.jumping || player.pos.y > 0.02) return;
  state.jumping = true;
  state.jumpTimer = 0.45;
  player.velY = 7.2;

  const forward = state.moveForward || 0;
  const runningForward = state.sprinting && forward > 0;
  if (runningForward && mixamo.actions.runningJump) {
    playOneShotMixamoAction("runningJump", 0.82);
  } else {
    playOneShotMixamoAction("jump", 0.78);
  }
}

function updateJump(dt) {
  if (!state.jumping && player.pos.y <= 0) return;
  player.velY -= GRAVITY * dt;
  player.pos.y += player.velY * dt;
  state.jumpTimer = Math.max(0, state.jumpTimer - dt);
  if (player.pos.y <= 0) {
    player.pos.y = 0;
    player.velY = 0;
    state.jumping = false;
    state.jumpTimer = 0;
  }
}

function playOneShotMixamoAction(name, duration = 0.55) {
  if (!mixamo.actions[name]) return false;
  state.actionLock = Math.max(state.actionLock, duration);
  setMixamoAction(name, 0.06);
  return true;
}

function updateActionLock(dt) {
  state.actionLock = Math.max(0, state.actionLock - dt);
}

function updateThirdPersonBowDraw(dt) {
  if (state.playerDead || !mixamo.ready || state.cameraMode !== "third" || mixamo.activeName === "jump") return;
  const draw = state.bowDraw;
  if (draw <= 0.02) return;
  const leftArm = mixamo.bones.LeftArm || mixamo.bones.mixamorigLeftArm;
  const leftForeArm = mixamo.bones.LeftForeArm || mixamo.bones.mixamorigLeftForeArm;
  const rightArm = mixamo.bones.RightArm || mixamo.bones.mixamorigRightArm;
  const rightForeArm = mixamo.bones.RightForeArm || mixamo.bones.mixamorigRightForeArm;
  const spine = mixamo.bones.Spine2 || mixamo.bones.mixamorigSpine2 || mixamo.bones.Spine1;
  if (leftArm) leftArm.rotation.z += draw * 0.32;
  if (leftForeArm) leftForeArm.rotation.y -= draw * 0.38;
  if (rightArm) rightArm.rotation.z -= draw * 0.38;
  if (rightForeArm) rightForeArm.rotation.y += draw * 0.55;
  if (spine) spine.rotation.y += Math.sin(performance.now() * 0.004) * draw * 0.015;
}
function updateMovement(dt) {
  if (!state.gameReady || state.gameWon || state.room3Falling || state.puzzleModalOpen || state.playerDead) {
    state.moveForward = 0;
    state.moveStrafe = 0;
    state.moving = false;
    state.sprinting = false;
    return;
  }
  const down = (...names) => names.some((name) => keys.has(name));
  let forward = 0;
  let strafe = 0;
  if (down("w", "keyw", "arrowup")) forward += 1;
  if (down("s", "keys", "arrowdown")) forward -= 1;
  if (down("a", "keya", "arrowleft")) strafe -= 1;
  if (down("d", "keyd", "arrowright")) strafe += 1;

  state.moveForward = forward;
  state.moveStrafe = strafe;
  state.moving = forward !== 0 || strafe !== 0;
  state.sprinting = state.moving && down("shift", "shiftleft", "shiftright");
  const speed = (state.sprinting ? 8 : 5) * dt;
  const forwardDir = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  const rightDir = new THREE.Vector3(-Math.cos(state.yaw), 0, Math.sin(state.yaw));
  const delta = forwardDir.multiplyScalar(forward).add(rightDir.multiplyScalar(strafe));
  if (delta.lengthSq() > 0) delta.normalize().multiplyScalar(speed);

  const nextX = player.pos.x + delta.x;
  const nextZ = player.pos.z + delta.z;
  if (!isSolidWorld(nextX + Math.sign(delta.x) * PLAYER_RADIUS, player.pos.z)) player.pos.x = nextX;
  if (!isSolidWorld(player.pos.x, nextZ + Math.sign(delta.z) * PLAYER_RADIUS)) player.pos.z = nextZ;
  updateRoom3BridgeTrial();
}

function updateRoom3BridgeTrial() {
  if (state.gameWon || state.playerDead || state.room3Falling) return;
  if (state.jumping || player.pos.y > 0.06) return;
  const { tx, ty } = worldToTile(player.pos.x, player.pos.z);
  const tile = room3BridgeTiles.find((item) => item.tx === tx && item.ty === ty);
  if (!tile) {
    const cell = cellAtTile(tx, ty);
    if (currentRoom()?.id === "3" && cell === "V") {
      failRoom3Bridge("You stepped into the void");
    } else if (currentRoom()?.id === "3" && tx >= 37) {
      completeRoom3Bridge();
    }
    return;
  }
  if (tile.broken || !tile.safe) {
    breakBridgeTile(tile, "Glass gives way");
    failRoom3Bridge("The glass gives way");
    return;
  }
  if (tile.safe) {
    tile.tested = true;
    tile.mesh.material.opacity = 0.58;
    tile.mesh.material.color.setHex(0x49ffb2);
    const stepIndex = tile.stepIndex;
    if (stepIndex >= ROOM3_SAFE_BRIDGE_ROWS.length - 1) {
      completeRoom3Bridge();
    }
    return;
  }
}

function completeRoom3Bridge() {
  if (state.gameWon) return;
  state.room3BridgeComplete = true;
  state.gameWon = true;
  state.bowDrawing = false;
  keys.clear();
  state.doorMessage = "You crossed the glass trial";
  state.doorMessageTimer = 2.4;
  updateVictoryOverlay();
}

function failRoom3Bridge(message) {
  if (state.room3Falling || state.playerDead) return;
  state.room3Falling = true;
  state.room3FallTimer = 0;
  state.room3FallVelocity = -1.2;
  state.bowDrawing = false;
  state.moving = false;
  state.sprinting = false;
  keys.clear();
  state.doorMessage = message;
  state.doorMessageTimer = 2.4;
}

function updateRoom3Fall(dt) {
  if (!state.room3Falling || state.playerDead) return;
  state.room3FallTimer += dt;
  state.room3FallVelocity -= GRAVITY * dt * 0.55;
  player.pos.y += state.room3FallVelocity * dt;
  state.pitch = THREE.MathUtils.clamp(state.pitch - dt * 0.18, -0.68, 0.68);
  if (state.room3FallTimer >= 1.15 || player.pos.y <= -5.5) {
    state.playerHp = 0;
    state.playerDead = true;
    state.doorMessage = "You fell into the abyss";
    state.doorMessageTimer = 2.4;
    beginPlayerDeath();
  }
}

function updateRune(dt) {
  if (rune.mesh) {
    rune.mesh.material.opacity = state.runeReveal;
    rune.mesh.rotation.z += dt * (0.6 + state.runeReveal);
  }
  const time = performance.now() * 0.001;
  for (const clue of room2RuneClues) {
    if (!clue.mesh) continue;
    const seed = clue.mesh.userData.seed || 0;
    clue.mesh.position.y = clue.mesh.userData.baseY + Math.sin(time * 2.2 + seed) * 0.12;
    clue.mesh.material.opacity = 0.82 + Math.sin(time * 3.1 + seed) * 0.12;
    clue.mesh.scale.setScalar(1.5 + Math.sin(time * 2.4 + seed) * 0.08);
  }
  if (statue.mesh) {
    statue.mesh.rotation.y += dt * 0.45;
  }
}

function updateCamera() {
  const lookDir = directionFromAim();
  const yawOnly = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
  const shoulder = new THREE.Vector3(Math.cos(state.yaw) * 0.45, 0, -Math.sin(state.yaw) * 0.45);
  const target = player.pos.clone().add(new THREE.Vector3(0, 1.45 + state.pitch * 0.65, 0));
  const desired = player.pos.clone()
    .add(new THREE.Vector3(0, 2.45, 0))
    .add(yawOnly.multiplyScalar(-6.4))
    .add(shoulder);
  camera.position.lerp(desired, 0.28);
  camera.lookAt(target);
}

function updateTrajectoryPreview() {
  trajectoryDots.forEach((dot) => {
    dot.visible = false;
  });
  const dir = directionFromAim();
  const pos = player.pos.clone().add(new THREE.Vector3(0, EYE_HEIGHT - 0.12, 0)).add(dir.clone().multiplyScalar(0.8));
  const vel = dir.multiplyScalar(ARROW_SPEED);
  for (let i = 0; i < trajectoryDots.length; i++) {
    vel.y -= GRAVITY * 0.055;
    pos.addScaledVector(vel, 0.055);
    if (pos.y < 0.08 || isSolidWorld(pos.x, pos.z)) break;
    const dot = trajectoryDots[i];
    dot.visible = true;
    dot.material.opacity = Math.max(0.18, 0.72 - i * 0.022);
    dot.position.copy(pos);
  }
}

const trajectoryGroup = new THREE.Group();
const trajectoryDotGeometry = new THREE.SphereGeometry(0.055, 8, 6);
const trajectoryDotMaterial = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.7 });
const trajectoryDots = Array.from({ length: 26 }, () => {
  const dot = new THREE.Mesh(trajectoryDotGeometry, trajectoryDotMaterial.clone());
  dot.visible = false;
  trajectoryGroup.add(dot);
  return dot;
});
scene.add(trajectoryGroup);

function drawGameOverOverlay() {
  let overlay = document.getElementById("gameOverOverlay");
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "gameOverOverlay";
  overlay.className = "game-over";
  overlay.innerHTML = `<div><strong>You Died</strong><span>The dungeon claims another archer.</span><button type="button">Regame</button></div>`;
  overlay.querySelector("button").addEventListener("click", () => window.location.reload());
  document.querySelector(".stage").appendChild(overlay);
  updateGameOverOverlay();
}

function drawVictoryOverlay() {
  let overlay = document.getElementById("victoryOverlay");
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "victoryOverlay";
  overlay.className = "victory-screen";
  overlay.innerHTML = `<div><strong>You Won</strong><span>The glass trial is cleared.</span><button type="button">Regame</button></div>`;
  overlay.querySelector("button").addEventListener("click", () => window.location.reload());
  document.querySelector(".stage").appendChild(overlay);
  updateVictoryOverlay();
}

function drawLoadingOverlay() {
  let overlay = document.getElementById("loadingOverlay");
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "loadingOverlay";
  overlay.className = "loading-screen is-visible";
  overlay.innerHTML = `<div><strong>Loading Dungeon</strong><span id="loadingDetail">Preparing archer model...</span></div>`;
  document.querySelector(".stage").appendChild(overlay);
  updateLoadingOverlay();
}

function updateLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  const detail = document.getElementById("loadingDetail");
  if (detail) {
    const elapsed = loadingElapsedSeconds();
    const modelStatus = hasUsableMixamoPlayer() ? "Archer skin ready" : mixamo.status;
    const animStatus = mixamo.actions.idle ? `Animations ${mixamo.loadedAnimations}` : "Loading idle animation";
    detail.textContent = state.gameReady ? "Ready" : `${modelStatus} / ${animStatus} / ${elapsed.toFixed(1)}s`;
  }
  overlay.classList.toggle("is-visible", !state.gameReady);
}

function drawPuzzleModal() {
  let modal = document.getElementById("puzzleModal");
  if (modal) return;
  modal = document.createElement("div");
  modal.id = "puzzleModal";
  modal.className = "puzzle-modal";
  modal.innerHTML = `
    <section>
      <strong id="puzzleTitle"></strong>
      <p id="puzzleText"></p>
      <form id="puzzleAnswerForm">
        <input id="puzzleAnswerInput" type="text" autocomplete="off" spellcheck="false" maxlength="8" placeholder="Rune answer">
        <button type="submit">Submit</button>
      </form>
      <button type="button">Close</button>
    </section>
  `;
  modal.querySelector("section > button").addEventListener("click", closePuzzleModal);
  modal.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitPuzzleAnswer();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePuzzleModal();
  });
  document.querySelector(".stage").appendChild(modal);
  updatePuzzleModal();
}

function openPuzzleModal(doorCell = "A") {
  state.puzzleDoorCell = doorCell;
  state.puzzleModalOpen = true;
  state.bowDrawing = false;
  state.moving = false;
  state.sprinting = false;
  keys.clear();
  updatePuzzleModal();
}

function closePuzzleModal() {
  state.puzzleModalOpen = false;
  updatePuzzleModal();
}

function updatePuzzleModal() {
  const modal = document.getElementById("puzzleModal");
  if (!modal) return;
  const title = document.getElementById("puzzleTitle");
  const text = document.getElementById("puzzleText");
  const form = document.getElementById("puzzleAnswerForm");
  const input = document.getElementById("puzzleAnswerInput");
  if (state.puzzleDoorCell === "B") {
    if (title) title.textContent = "Door B Rune Memory";
    if (text) text.textContent = room2RuneClues.length < ROOM2_RUNE_SYMBOLS.length
      ? `Defeat Room 2 soldiers and remember the runes they leave behind. Clues found: ${room2RuneClues.length}/${ROOM2_RUNE_SYMBOLS.length}.`
      : "Enter the rune letters in the order they appeared when the Room 2 soldiers fell.";
    if (form) form.style.display = "flex";
    if (input) {
      input.value = state.room2PuzzleSolved ? state.room2RuneAnswer : input.value;
      input.placeholder = room2RuneClues.map(() => "?").join("") || "???";
    }
  } else {
    if (title) title.textContent = "Door A Flame Lock";
    if (text) text.textContent = "Ignite the three stone pillars in Room 1 with fire arrows. When all three flames are lit, this door will open.";
    if (form) form.style.display = "none";
  }
  modal.classList.toggle("is-visible", state.puzzleModalOpen);
}

function submitPuzzleAnswer() {
  if (state.puzzleDoorCell !== "B") return;
  const input = document.getElementById("puzzleAnswerInput");
  const answer = (input?.value || "").trim().toUpperCase();
  if (room2RuneClues.length < ROOM2_RUNE_SYMBOLS.length) {
    state.doorMessage = "Find all Room 2 rune clues first";
    state.doorMessageTimer = 2;
    return;
  }
  if (answer !== state.room2RuneAnswer) {
    state.doorMessage = "Wrong rune order";
    state.doorMessageTimer = 2;
    return;
  }
  state.room2PuzzleSolved = true;
  state.runeReveal = 1;
  const doorB = doorByCell("B");
  if (doorB) doorB.open = true;
  state.doorMessage = "Door B opened by the rune memory";
  state.doorMessageTimer = 2.6;
  closePuzzleModal();
}

function updateGameOverOverlay() {
  const overlay = document.getElementById("gameOverOverlay");
  if (!overlay) return;
  overlay.classList.toggle("is-visible", state.playerDead && state.playerDeathTimer >= PLAYER_DEATH_OVERLAY_DELAY);
}

function updateVictoryOverlay() {
  const overlay = document.getElementById("victoryOverlay");
  if (!overlay) return;
  overlay.classList.toggle("is-visible", state.gameWon);
}

function drawPlayerHpHud() {
  let hp = document.getElementById("playerHpHud");
  if (!hp) {
    hp = document.createElement("div");
    hp.id = "playerHpHud";
    hp.className = "player-hp";
    document.querySelector(".stage").appendChild(hp);
  }
  updatePlayerHpHud();
}

function updatePlayerHpHud() {
  const hp = document.getElementById("playerHpHud");
  if (!hp) return;
  const hearts = Array.from({ length: state.playerMaxHp }, (_, i) => {
    const filled = i < state.playerHp;
    return `<span class="hp-heart ${filled ? "is-full" : "is-empty"}"></span>`;
  }).join("");
  hp.innerHTML = `<strong>HP</strong><div>${hearts}</div><span class="arrow-count">Arrows ${state.arrowsRemaining}/${MAX_ARROWS}</span>`;
  hp.classList.toggle("is-hit", state.playerHitFlash > 0.05);
  hp.classList.toggle("is-dead", state.playerDead);
}

function drawDoorPrompt() {
  if (document.getElementById("doorPrompt")) return;
  const prompt = document.createElement("section");
  prompt.id = "doorPrompt";
  prompt.className = "door-prompt";
  prompt.innerHTML = `
    <span class="door-key">F</span>
    <div>
      <strong>Press F to go through</strong>
      <small>Press ESC to unlock mouse before clicking UI</small>
    </div>
  `;
  document.querySelector(".stage").appendChild(prompt);
}

function drawPerfHud() {
  if (document.getElementById("perfHud")) return;
  const hud = document.createElement("section");
  hud.id = "perfHud";
  hud.className = "perf-hud";
  hud.textContent = "FPS --";
  document.querySelector(".stage").appendChild(hud);
}

function updatePerf(dt) {
  const now = performance.now();
  const realMs = now - lastFrameAt;
  lastFrameAt = now;
  perf.accum += realMs;
  perf.frames += 1;
  if (perf.accum >= 500) {
    perf.ms = perf.accum / perf.frames;
    perf.fps = 1000 / Math.max(0.001, perf.ms);
    perf.accum = 0;
    perf.frames = 0;
    const hud = document.getElementById("perfHud");
    if (hud) {
      hud.textContent = `FPS ${Math.round(perf.fps)} / ${perf.ms.toFixed(1)}ms`;
      hud.classList.toggle("is-low", perf.fps < 45);
    }
  }
}

function updateDoorPrompt() {
  const prompt = document.getElementById("doorPrompt");
  if (!prompt) return;
  const door = !state.puzzleModalOpen && !state.playerDead && !state.room3Falling ? nearestDoorWithin() : null;
  prompt.classList.toggle("is-visible", !!door);
}

function updateObjectivePrompt(room) {
  const roomId = room?.id || "corridor";
  if (lastPromptRoomId !== roomId) {
    lastPromptRoomId = roomId;
    promptEl.classList.remove("is-room-enter");
    void promptEl.offsetWidth;
    promptEl.classList.add("is-room-enter");
  }
  promptEl.innerHTML = `<strong>${room ? room.name : "Corridor"}</strong><span>${roomObjectiveText(roomId)}</span>`;
}

function drawMinimap() {
  const existing = document.getElementById("miniMap");
  if (existing) existing.remove();
  const mini = document.createElement("canvas");
  mini.id = "miniMap";
  mini.width = 150;
  mini.height = 96;
  mini.style.position = "absolute";
  mini.style.left = "18px";
  mini.style.bottom = "18px";
  mini.style.zIndex = "5";
  mini.style.border = "1px solid rgba(255,255,255,0.2)";
  mini.style.background = "rgba(0,0,0,0.62)";
  mini.style.borderRadius = "8px";
  mini.style.opacity = "0.78";
  mini.style.pointerEvents = "none";
  document.querySelector(".stage").appendChild(mini);
  minimapMarkers.push(mini);
}

function updateMinimap() {
  const mini = document.getElementById("miniMap");
  if (!mini) return;
  const ctx = mini.getContext("2d");
  const expanded = state.minimapExpanded;
  const scale = expanded ? 7 : 4;
  const width = expanded ? 190 : 112;
  const height = expanded ? 126 : 76;
  if (mini.width !== width || mini.height !== height) {
    mini.width = width;
    mini.height = height;
    mini.style.width = `${width}px`;
    mini.style.height = `${height}px`;
  }
  ctx.clearRect(0, 0, mini.width, mini.height);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, mini.width, mini.height);
  ctx.font = expanded ? "11px Segoe UI, sans-serif" : "10px Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(expanded ? "Map (M)" : "M", 8, 12);
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[0].length; x++) {
      const cell = map[y][x];
      let color = "#10131a";
      if (cell === "#") color = "#46515f";
      if (cell === "O") color = "#22252c";
      if (cell === "L") color = "#7b4b25";
      if (cell === "C") color = "#a8a1a8";
      if (cell === "V") color = "#05070d";
      if (cell === "G") color = "#8deaff";
      if (cell === "F") color = "#ff9a36";
      if (cell === "P") color = "#f06a7a";
      if (cell === "W") color = "#ff4df0";
      if (cell === "1" || cell === "T") color = "#d94d42";
      if (cell === "2" || cell === "R") color = "#35c6d4";
      if (cell === "3" || cell === "S") color = "#d5b14a";
      if (cell === "D") color = "#edf2f7";
      ctx.fillStyle = color;
      ctx.fillRect(8 + x * scale, 18 + y * scale, Math.max(1, scale - 1), Math.max(1, scale - 1));
    }
  }
  const { tx, ty } = worldToTile(player.pos.x, player.pos.z);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(8 + tx * scale + scale / 2, 18 + ty * scale + scale / 2, expanded ? 3.4 : 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function resizeIfNeeded() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (renderSize.width === width && renderSize.height === height) return;
  renderSize.width = width;
  renderSize.height = height;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateHUD() {
  const room = currentRoom();
  statusEl.hidden = true;
  statusEl.innerHTML = "";
  updateObjectivePrompt(room);
  updateDoorPrompt();

  window.labyrinthState = {
    roomId: room?.id || "corridor",
    roomName: room?.name || "Corridor / Doorway",
    skeletonPanelEnabled: state.skeletonPanelEnabled,
    playerMoving: state.moving,
    playerSprinting: state.sprinting,
    playerFireSignal: state.fireSignal,
  };
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  try {
    updatePerf(dt);
    updateGameReadyState();
    state.arrowCooldown = Math.max(0, state.arrowCooldown - dt);
    updateMovement(dt);
    updateJump(dt);
    updateRoom3Fall(dt);
    updatePlayerDeath(dt);
    updateDoors(dt);
    updateTorches(performance.now() * 0.001);
    ensureMixamoAction();
    chooseMixamoAction();
    if (mixamo.mixer) mixamo.mixer.update(dt);
    updateThirdPersonBowDraw(dt);
    updateActionLock(dt);
    updateMixamoDiagnostics();
    applyProceduralMixamoIdle(performance.now() * 0.001);
    updateArrows(dt);
    updateBots(dt);
    updateRune(dt);
    updatePlayerMesh();
    updateCamera();
    updateTrajectoryPreview();
    uiTimers.minimap += dt;
    uiTimers.hud += dt;
    if (uiTimers.minimap >= PERF.minimapUpdateInterval) {
      updateMinimap();
      uiTimers.minimap = 0;
    }
    if (uiTimers.hud >= PERF.uiUpdateInterval) {
      updateLoadingOverlay();
      updateHUD();
      updatePlayerHpHud();
      updateGameOverOverlay();
      updateVictoryOverlay();
      uiTimers.hud = 0;
    }
    renderer.render(scene, camera);
  } catch (error) {
    console.error("Game loop error", error);
    statusEl.innerHTML = `Runtime error:<br>${String(error?.message || error).slice(0, 180)}`;
    try { renderer.render(scene, camera); } catch (_) {}
  }
}
addLights();
validateMap();
buildMap();
applyStartRoomMode();
addRoomLabels();
addTorches();
addGoalObjects();
addDoorGuideArrows();
drawMinimap();
drawPlayerHpHud();
drawDoorPrompt();
drawPerfHud();
drawLoadingOverlay();
drawPuzzleModal();
drawGameOverOverlay();
drawVictoryOverlay();
spawnBots();
loadPaladinBotModel();
applyReportShotPreset();
prewarmArrowAssets();
resizeIfNeeded();
window.addEventListener("resize", resizeIfNeeded);

let mouseLookActive = false;

canvas.addEventListener("click", () => canvas.requestPointerLock?.());
canvas.addEventListener("mousedown", (event) => {
  if (!state.gameReady || state.room3Falling || state.puzzleModalOpen || state.playerDead) return;
  if (event.button !== 0) return;
  canvas.requestPointerLock?.();
  mouseLookActive = true;
  state.bowDrawing = true;
  event.preventDefault();
});
window.addEventListener("mouseup", (event) => {
  if (event.button !== 0) return;
  mouseLookActive = false;
  releaseBowShot();
});
document.addEventListener("mousemove", (event) => {
  if (!state.gameReady || state.puzzleModalOpen) return;
  if (document.pointerLockElement !== canvas && !mouseLookActive) return;
  state.yaw -= event.movementX * 0.0023;
  state.pitch = THREE.MathUtils.clamp(state.pitch - event.movementY * 0.0018, -0.68, 0.68);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const code = event.code.toLowerCase();
  if (!state.gameReady) {
    keys.clear();
    event.preventDefault();
    return;
  }
  if (state.gameWon) {
    if (key === "r") window.location.reload();
    event.preventDefault();
    return;
  }
  if (state.puzzleModalOpen) {
    if (key === "escape") closePuzzleModal();
    if (event.target?.id !== "puzzleAnswerInput") event.preventDefault();
    return;
  }
  if (state.playerDead) {
    if (key === "r") window.location.reload();
    event.preventDefault();
    return;
  }
  keys.add(key);
  keys.add(code);
  if (key === " " && !event.repeat) {
    startJump();
  }
  if ((key === "k" || key === "b") && !event.repeat) state.skeletonPanelEnabled = !state.skeletonPanelEnabled;
  if (key === "m" && !event.repeat) state.minimapExpanded = !state.minimapExpanded;
  if (key === "f" && !event.repeat) tryOpenDoor();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  keys.delete(event.code.toLowerCase());
});
window.addEventListener("blur", () => {
  mouseLookActive = false;
  keys.clear();
});


window.debugMapObjects = function () {
  console.log({
    mapWidth: map[0].length,
    mapHeight: map.length,
    torches: torches.length,
    bots: bots.length,
    doors: doors.length,
    colliders: colliders.length,
  });
};

window.debugBots = function () {
  console.table(bots.map((bot, index) => ({
    index,
    name: bot.name,
    roomId: bot.roomId,
    state: bot.state,
    hp: bot.hp,
    dead: bot.dead,
    aggro: bot.aggro,
    anim: bot.activeActionName || "none",
    stateLock: (bot.stateLock || 0).toFixed(2),
    actions: Object.keys(bot.actions || {}).join(","),
    playerDist: bot.pos.distanceTo(player.pos).toFixed(2),
    attackRange: bot.attackRange.toFixed(2),
    attackElapsed: (bot.attackElapsed || 0).toFixed(2),
    hitWindow: `${(bot.attackHitWindowStart || 0).toFixed(2)}-${(bot.attackHitWindowEnd || 0).toFixed(2)}`,
    weaponDist: Number(bot.lastWeaponHitDistance || 999).toFixed(2),
    x: bot.pos.x.toFixed(2),
    z: bot.pos.z.toFixed(2),
    spawnX: bot.spawnPos?.x.toFixed(2),
    spawnZ: bot.spawnPos?.z.toFixed(2),
  })));
  return bots;
};

window.debugPaladinAnimations = function () {
  const snapshot = {
    paladinReady: botAssets.paladinReady,
    animationStatus: botAssets.animationStatus,
    loadedClips: Object.keys(botAssets.clips),
    animationErrors: botAssets.animationErrors,
    boneCount: botAssets.boneNames.length,
    firstBones: botAssets.boneNames.slice(0, 20),
    botActions: bots.map((bot, index) => ({
      index,
      name: bot.name,
      paladin: !!bot.mesh?.userData?.paladinBot,
      actions: Object.keys(bot.actions || {}),
      durations: Object.fromEntries(Object.entries(bot.actions || {}).map(([key, action]) => [key, Number(action.getClip?.().duration || 0).toFixed(2)])),
      weaponNode: bot.mesh?.userData?.weaponNode?.name || "right-hand fallback",
      active: bot.activeActionName || "none",
      state: bot.state,
      stateLock: Number(bot.stateLock || 0).toFixed(2),
    })),
  };
  console.log(snapshot);
  return snapshot;
};

window.debugPerf = function () {
  let meshCount = 0;
  let lightCount = 0;
  let visibleLightCount = 0;
  let skinnedMeshCount = 0;
  scene.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) meshCount++;
    if (obj.isSkinnedMesh) skinnedMeshCount++;
    if (obj.isLight) {
      lightCount++;
      if (obj.visible && obj.intensity > 0) visibleLightCount++;
    }
  });
  const report = {
    meshCount,
    skinnedMeshCount,
    lightCount,
    visibleLightCount,
    torches: torches.length,
    activeTorchLights: torches.filter((torch) => torch.light.visible && torch.light.intensity > 0).length,
    stuckArrows: stuckArrows.length,
    activeArrowLights: stuckArrows.filter((stuck) => stuck.light?.visible && stuck.light.intensity > 0).length,
    bots: bots.length,
    pixelRatio: renderer.getPixelRatio(),
    shadows: renderer.shadowMap.enabled,
    perf: { fps: Math.round(perf.fps), ms: Number(perf.ms.toFixed(2)) },
    renderInfo: renderer.info.render,
    memoryInfo: renderer.info.memory,
    settings: PERF,
  };
  console.log(report);
  return report;
};

window.debugMixamo = function () {
  const snapshot = {
    ready: mixamo.ready,
    status: mixamo.status,
    error: mixamo.error,
    modelUrl: mixamo.modelUrl,
    skinnedMeshes: mixamo.skinnedMeshes.map((mesh) => mesh.name),
    boneCount: mixamo.boneNames.length,
    boneNames: mixamo.boneNames.slice(0, 50),
    actions: Object.keys(mixamo.actions),
    loadedAnimations: mixamo.loadedAnimations,
    activeName: mixamo.activeName,
    bindingCount: mixamo.bindingCount,
    animationErrors: mixamo.animationErrors,
    clipTrackNames: mixamo.clipTrackNames,
    bots: bots.map((bot) => ({ name: bot.name, roomId: bot.roomId, state: bot.state, boss: bot.boss, hp: bot.hp, dead: bot.dead, anim: bot.activeActionName || "none", model: bot.mesh.userData?.proceduralBot ? "procedural" : "paladin" })),
    paladinReady: botAssets.paladinReady,
    paladinError: botAssets.paladinError,
    paladinAnimationStatus: botAssets.animationStatus,
    paladinAnimationErrors: botAssets.animationErrors,
  };
  console.log(snapshot);
  return snapshot;
};
updateObjectivePrompt(currentRoom());
animate();

























































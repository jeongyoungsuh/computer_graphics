import * as THREE from "three";

const panel = document.getElementById("statuePanel");
const canvas = document.getElementById("threeStatue");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(260, 220, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 260 / 220, 0.1, 30);
camera.position.set(0, 1.0, 5.5);
camera.lookAt(0, 0.55, 0);

scene.add(new THREE.HemisphereLight(0xffe7b3, 0x05070b, 1.05));
const keyLight = new THREE.DirectionalLight(0xffbd66, 2.1);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const rootBone = new THREE.Bone();
rootBone.name = "Root";
rootBone.position.y = -1.05;

const spineBone = new THREE.Bone();
spineBone.name = "Spine";
spineBone.position.y = 1.15;
rootBone.add(spineBone);

const headBone = new THREE.Bone();
headBone.name = "Head";
headBone.position.y = 1.0;
spineBone.add(headBone);

const leftArmBone = new THREE.Bone();
leftArmBone.name = "LeftArm";
leftArmBone.position.set(-0.43, 0.62, 0);
spineBone.add(leftArmBone);

const rightArmBone = new THREE.Bone();
rightArmBone.name = "RightArm";
rightArmBone.position.set(0.43, 0.62, 0);
spineBone.add(rightArmBone);

const geometry = new THREE.CylinderGeometry(0.46, 0.62, 2.2, 16, 10, true);
const position = geometry.attributes.position;
const skinIndices = [];
const skinWeights = [];

for (let i = 0; i < position.count; i++) {
  const y = position.getY(i);
  const upperWeight = THREE.MathUtils.smoothstep(y, -0.35, 0.85);
  const headWeight = THREE.MathUtils.smoothstep(y, 0.72, 1.1);
  skinIndices.push(0, 1, 2, 0);
  skinWeights.push(1 - upperWeight, upperWeight * (1 - headWeight), headWeight, 0);
}

geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));

const material = new THREE.MeshStandardMaterial({
  color: 0xd8bd73,
  roughness: 0.62,
  metalness: 0.08,
  skinning: true,
});

const mesh = new THREE.SkinnedMesh(geometry, material);
const skeleton = new THREE.Skeleton([rootBone, spineBone, headBone, leftArmBone, rightArmBone]);
mesh.add(rootBone);
mesh.bind(skeleton);
scene.add(mesh);

function makeArm(side) {
  const group = new THREE.Group();
  const sleeve = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.09, 0.78, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x5c6b7c, roughness: 0.72 })
  );
  sleeve.rotation.z = side * 0.45;
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(side * 0.36, -0.28, 0.38);
  group.add(sleeve);

  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd2a26f, roughness: 0.65 })
  );
  hand.position.set(side * 0.54, -0.4, 0.72);
  group.add(hand);
  return group;
}

const leftArmMesh = makeArm(-1);
const rightArmMesh = makeArm(1);
leftArmBone.add(leftArmMesh);
rightArmBone.add(rightArmMesh);

const previewBow = new THREE.Group();
const bowMat = new THREE.MeshStandardMaterial({ color: 0x9a5728, roughness: 0.55 });
const stringMat = new THREE.LineBasicMaterial({ color: 0xf3e6ca });
const bowTop = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8), bowMat);
bowTop.position.y = 0.25;
bowTop.rotation.z = -0.32;
const bowBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8), bowMat);
bowBottom.position.y = -0.25;
bowBottom.rotation.z = 0.32;
const bowString = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.12, 0.56, 0),
    new THREE.Vector3(-0.08, 0, 0),
    new THREE.Vector3(0.12, -0.56, 0),
  ]),
  stringMat
);
previewBow.add(bowTop, bowBottom, bowString);
previewBow.position.set(0.68, -0.2, 0.58);
previewBow.rotation.set(Math.PI / 2, 0.1, Math.PI / 2);
rightArmBone.add(previewBow);

const previewArrow = new THREE.Mesh(
  new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8),
  new THREE.MeshBasicMaterial({ color: 0xffd45a })
);
previewArrow.position.set(0.24, -0.18, 0.72);
previewArrow.rotation.x = Math.PI / 2;
rightArmBone.add(previewArrow);

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.82, 0.95, 0.22, 24),
  new THREE.MeshStandardMaterial({ color: 0x4b4130, roughness: 0.8 })
);
base.position.y = -1.18;
scene.add(base);

const helper = new THREE.SkeletonHelper(mesh);
helper.material.linewidth = 2;
helper.visible = true;
scene.add(helper);

const mixer = new THREE.AnimationMixer(mesh);
const idleClip = new THREE.AnimationClip("Idle", 2.0, [
  new THREE.QuaternionKeyframeTrack(
    ".bones[Spine].quaternion",
    [0, 1, 2],
    [
      0, 0, 0, 1,
      0, 0, Math.sin(0.05), Math.cos(0.05),
      0, 0, 0, 1,
    ]
  ),
]);

const runClip = new THREE.AnimationClip("Run", 0.7, [
  new THREE.QuaternionKeyframeTrack(
    ".bones[Spine].quaternion",
    [0, 0.35, 0.7],
    [
      0, 0, Math.sin(-0.08), Math.cos(0.08),
      0, 0, Math.sin(0.08), Math.cos(0.08),
      0, 0, Math.sin(-0.08), Math.cos(0.08),
    ]
  ),
  new THREE.QuaternionKeyframeTrack(
    ".bones[LeftArm].quaternion",
    [0, 0.35, 0.7],
    [
      Math.sin(0.35), 0, 0, Math.cos(0.35),
      Math.sin(-0.35), 0, 0, Math.cos(0.35),
      Math.sin(0.35), 0, 0, Math.cos(0.35),
    ]
  ),
  new THREE.QuaternionKeyframeTrack(
    ".bones[RightArm].quaternion",
    [0, 0.35, 0.7],
    [
      Math.sin(-0.35), 0, 0, Math.cos(0.35),
      Math.sin(0.35), 0, 0, Math.cos(0.35),
      Math.sin(-0.35), 0, 0, Math.cos(0.35),
    ]
  ),
]);

const shootClip = new THREE.AnimationClip("Fire Arrow", 0.42, [
  new THREE.QuaternionKeyframeTrack(
    ".bones[Spine].quaternion",
    [0, 0.18, 0.42],
    [
      0, 0, 0, 1,
      Math.sin(-0.09), 0, 0, Math.cos(0.09),
      0, 0, 0, 1,
    ]
  ),
  new THREE.QuaternionKeyframeTrack(
    ".bones[RightArm].quaternion",
    [0, 0.18, 0.42],
    [
      0, 0, 0, 1,
      Math.sin(-0.85), 0, 0, Math.cos(0.85),
      0, 0, 0, 1,
    ]
  ),
]);

const idleAction = mixer.clipAction(idleClip);
const runAction = mixer.clipAction(runClip);
const shootAction = mixer.clipAction(shootClip);
idleAction.play();
runAction.play();
shootAction.play();
idleAction.weight = 1;
runAction.weight = 0;
shootAction.weight = 0;
shootAction.setLoop(THREE.LoopOnce, 1);
shootAction.clampWhenFinished = true;

const clock = new THREE.Clock();
let lastFireSignal = 0;
let shootWeight = 0;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const state = window.labyrinthState || {};
  const visible = state.debugRigPanel === true;
  panel.classList.toggle("is-visible", visible);

  const runTarget = state.playerMoving ? (state.playerSprinting ? 1 : 0.62) : 0;
  runAction.weight += (runTarget - runAction.weight) * 0.12;
  if ((state.playerFireSignal || 0) !== lastFireSignal) {
    lastFireSignal = state.playerFireSignal || 0;
    shootWeight = 1;
    shootAction.reset().play();
  }
  shootWeight = Math.max(0, shootWeight - dt * 2.4);
  shootAction.weight = shootWeight;
  idleAction.weight = Math.max(0.15, 1 - runAction.weight * 0.72 - shootAction.weight * 0.45);
  mesh.rotation.y = Math.sin(performance.now() * 0.0004) * 0.35;
  helper.visible = visible;

  resize();
  mixer.update(dt);
  renderer.render(scene, camera);
}

animate();


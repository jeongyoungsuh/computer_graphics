import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const imageDir = path.join(root, "images");
const chromeProfile = mkdtempSync(path.join(tmpdir(), "chrome-report-profile-"));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const baseUrl = "http://127.0.0.1:5173/";

const shots = [
  ["01_start_room1.png", "start"],
  ["02_map_overview.png", "map_overview"],
  ["03_room1_objective.png", "room1_objective"],
  ["04_room1_pillar_ignite.png", "room1_pillar_ignite"],
  ["05_room2_combat.png", "room2_combat"],
  ["06_room2_rune_hologram.png", "room2_rune"],
  ["07_room2_password_modal.png", "room2_password"],
  ["08_room3_glass_bridge.png", "room3_bridge"],
  ["09_room3_arrow_test.png", "room3_arrow_test"],
  ["10_room3_glass_break.png", "room3_glass_break"],
  ["11_room3_clear.png", "room3_clear"],
  ["12_wall_floor_texture.png", "wall_texture"],
  ["13_lighting_fire_arrow.png", "room1_pillar_ignite"],
  ["14_animation_paladin_attack.png", "paladin_attack"],
  ["15_collision_arrow_hit.png", "collision_arrow"],
  ["16_ui_interaction.png", "door_prompt"],
  ["17_surfel_gi_stuck_arrow.png", "surfel_after"],
  ["17a_before_surfel_light.png", "surfel_before"],
  ["17b_after_surfel_light.png", "surfel_after"],
  ["18_multiple_surfel_lights.png", "room1_three_pillars"],
  ["19_map_layout.png", "map_overview"],
  ["20_player_hp_arrows.png", "start"],
  ["21_player_death.png", "player_death"],
  ["22_arrow_trajectory.png", "trajectory"],
  ["23_arrow_collision.png", "collision_arrow"],
  ["24_paladin_chase.png", "room2_combat"],
  ["25_paladin_attack.png", "paladin_attack"],
  ["26_paladin_death.png", "room2_rune"],
  ["27_door_prompt.png", "door_prompt"],
  ["28_door_open.png", "door_open"],
  ["29_room1_three_pillars.png", "room1_three_pillars"],
  ["30_room1_door_open.png", "door_open"],
  ["31_room2_hologram_detail.png", "room2_rune"],
  ["32_room2_rune_input.png", "room2_password"],
  ["33_room3_glass_tiles.png", "room3_bridge"],
  ["34_room3_weak_glass.png", "room3_glass_break"],
  ["35_room3_fall.png", "room3_fall"],
  ["36_victory.png", "victory"],
  ["37_web_run.png", "start"],
  ["38_final_overview.png", "map_overview"],
];

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = request(url, { method: "GET" }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode < 500 && body.includes("Arcane GI Labyrinth")) {
            resolve();
          } else if (Date.now() - started > timeoutMs) {
            reject(new Error(`Vite dev server returned unexpected response: ${res.statusCode}`));
          } else {
            setTimeout(tick, 500);
          }
        });
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("Vite dev server did not start in time."));
        else setTimeout(tick, 500);
      });
      req.end();
    };
    tick();
  });
}

if (!existsSync(chromePath)) {
  throw new Error(`Chrome not found at ${chromePath}`);
}

mkdirSync(imageDir, { recursive: true });

const server = spawn(npmCmd, ["run", "dev"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

server.stdout.on("data", (data) => process.stdout.write(data));
server.stderr.on("data", (data) => process.stderr.write(data));

try {
  await waitForServer(baseUrl);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const [file, shot] of shots) {
    const out = path.join(imageDir, file);
    const url = `${baseUrl}?shot=${encodeURIComponent(shot)}`;
    console.log(`Capturing ${file} (${shot})`);
    execFileSync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--window-size=1280,720",
      "--force-device-scale-factor=1",
      `--user-data-dir=${chromeProfile}`,
      "--virtual-time-budget=9000",
      `--screenshot=${out}`,
      url,
    ], { stdio: "ignore" });
  }
} finally {
  server.kill();
  rmSync(chromeProfile, { recursive: true, force: true });
}

console.log(`Captured ${shots.length} report images in ${imageDir}`);

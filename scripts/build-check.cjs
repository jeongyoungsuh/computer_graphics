const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const required = ["index.html", "src/styles.css", "src/game.js", "src/skinned-statue.js"];
for (const file of required) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${file}`);
  if (fs.statSync(full).size === 0) throw new Error(`Empty required file: ${file}`);
}

const html = fs.readFileSync("index.html", "utf8");
if (!html.includes("src/game.js")) throw new Error("index.html must load src/game.js");
if (!html.includes("src/skinned-statue.js")) throw new Error("index.html must load src/skinned-statue.js");
if (!html.includes("src/styles.css")) throw new Error("index.html must load src/styles.css");
if (!html.includes("three")) throw new Error("index.html must define the three import map");

execFileSync(process.execPath, ["--check", "src/game.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "src/skinned-statue.js"], { stdio: "inherit" });

console.log("Build check passed: Three.js module files are present and JavaScript parses.");

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";

// Real backend (SQLite, temp dir) + static admin export, both torn down after the run.
export const SETUP_TOKEN = "e2e-setup-token";
const API = "http://127.0.0.1:18080";
const procs: ChildProcess[] = [];
let web: http.Server | undefined;

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

export default async function globalSetup() {
  try {
    return await start();
  } catch (e) {
    procs.forEach((p) => p.kill());
    web?.close();
    throw e;
  }
}

async function start() {
  const admin = path.resolve(__dirname, "..");
  const backend = path.resolve(admin, "../backend");
  const tmp = mkdtempSync(path.join(tmpdir(), "wallp-e2e-"));
  const env = {
    ...process.env,
    APP_ENV: "development",
    HTTP_ADDR: "127.0.0.1:18080",
    DATABASE_URL: `file:${tmp}/e2e.db`,
    STORAGE_DIR: `${tmp}/storage`,
    CORS_ORIGINS: "http://127.0.0.1:13000",
    SCHEDULER: "off",
    SETUP_TOKEN,
  };
  const bin = path.join(tmp, "wallp");
  execFileSync("go", ["build", "-o", bin, "./cmd/wallp"], { cwd: backend, stdio: "inherit" });
  execFileSync(bin, ["migrate", "up"], { env, stdio: "inherit" });
  // The generator needs approved fonts; the API wants real font assets, so seed rows straight into the temp DB.
  const fonts = [
    ["creepster", "display"],
    ["cinzel-decorative", "display"],
    ["space-grotesk", "clean"],
    ["padauk", "clean"],
    ["fredoka", "handwritten"],
  ];
  const sql = fonts
    .map(([id, cat]) => {
      const data = JSON.stringify({ id, family: id, category: cat, scripts: ["latin"], tags: [cat], license: "OFL-1.1", files: [] });
      return `insert into fonts (id,status,search,data,created_by,updated_by,created_at,updated_at,family,category) values ('${id}','approved','${id}','${data}','e2e','e2e',datetime('now'),datetime('now'),'${id}','${cat}');`;
    })
    .join("\n");
  execFileSync("sqlite3", [`${tmp}/e2e.db`, sql]);
  procs.push(spawn(bin, ["serve"], { env: { ...env, GIN_MODE: "release" }, stdio: "ignore" }));

  execFileSync("pnpm", ["build"], {
    cwd: admin,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_API_URL: API },
  });
  const out = path.join(admin, "out");
  web = http
    .createServer((req, res) => {
      let p = path.join(out, decodeURIComponent(new URL(req.url!, "http://x").pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, "index.html");
      if (!existsSync(p)) {
        res.statusCode = 404;
        return res.end();
      }
      if (p.endsWith(".html")) res.setHeader("content-type", "text/html");
      else if (p.endsWith(".js")) res.setHeader("content-type", "text/javascript");
      else if (p.endsWith(".css")) res.setHeader("content-type", "text/css");
      createReadStream(p).pipe(res);
    })
    .listen(13000, "127.0.0.1");

  await waitFor(`${API}/healthz`);
  return async () => {
    web?.close();
    procs.forEach((p) => p.kill());
  };
}

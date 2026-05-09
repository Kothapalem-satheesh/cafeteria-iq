/**
 * One-shot local stack: in-memory MongoDB (no system mongod) + seed + API + ML + Vite.
 * From backend:  npm run dev:stack
 */
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const BACK = __dirname;
const ROOT = path.join(BACK, "..");
const FRONT = path.join(ROOT, "frontend");
const ML = path.join(BACK, "ml");
const isWin = process.platform === "win32";

function main() {
  // eslint-disable-next-line global-require
  const { MongoMemoryServer } = require("mongodb-memory-server");

  (async () => {
    const mongo = await MongoMemoryServer.create();
    const dbUri = mongo.getUri("cafeteria_iq");
    const env = {
      ...process.env,
      MONGODB_URI: dbUri,
      ML_SERVICE_URL: "http://127.0.0.1:5001",
      PORT: process.env.PORT || "5000",
    };
    // eslint-disable-next-line no-console
    console.log("[dev-stack] In-memory MongoDB:", dbUri);

    const seedPath = path.join(ROOT, "database", "seed_data.js");
    const seed = spawnSync(process.execPath, [seedPath], {
      env,
      stdio: "inherit",
      cwd: BACK,
    });
    if (seed.status !== 0) {
      // eslint-disable-next-line no-console
      console.error("[dev-stack] Seed failed, exit", seed.status);
      await mongo.stop();
      process.exit(seed.status || 1);
    }

    const children = [];
    const onExit = (name) => (code) => {
      // eslint-disable-next-line no-console
      console.log(`[dev-stack] ${name} exited (code ${code})`);
    };

    const c1 = spawn(process.execPath, [path.join(BACK, "src", "server.js")], {
      env,
      stdio: "inherit",
      cwd: BACK,
    });
    c1.on("exit", onExit("api"));
    children.push(c1);

    if (isWin) {
      const c2 = spawn("py", ["-3.11", "app.py"], { env, stdio: "inherit", cwd: ML, shell: true });
      c2.on("exit", onExit("ml"));
      children.push(c2);
    } else {
      const c2 = spawn("python3", ["app.py"], { env, stdio: "inherit", cwd: ML });
      c2.on("exit", onExit("ml"));
      children.push(c2);
    }

    const frontEnv = {
      ...env,
      VITE_API_URL: "http://localhost:5000/api",
      VITE_SOCKET_URL: "http://localhost:5000",
    };
    const c3 = spawn(isWin ? "npm.cmd" : "npm", ["run", "dev"], {
      env: frontEnv,
      stdio: "inherit",
      cwd: FRONT,
      shell: true,
    });
    c3.on("exit", onExit("frontend"));
    children.push(c3);

    const shutdown = async (sig) => {
      // eslint-disable-next-line no-console
      console.log(`[dev-stack] ${sig} — stopping child processes…`);
      for (const c of children) {
        try {
          if (isWin) {
            c.kill("SIGTERM");
            spawn("taskkill", ["/pid", c.pid, "/T", "/F"], { shell: true, stdio: "ignore" });
          } else {
            c.kill("SIGTERM");
          }
        } catch (e) {
          /* ignore */
        }
      }
      await mongo.stop().catch(() => {});
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}

main();

/**
 * One-off seed into a temporary in-memory MongoDB (data is lost when this process exits).
 * For persistent data use a real MONGODB_URI in backend/.env and: npm run seed
 */
const path = require("path");
const { spawnSync } = require("child_process");

async function run() {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri("cafeteria_iq");
  // eslint-disable-next-line no-console
  console.log("[seed-in-memory] Temp Mongo:", uri);
  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, "../database/seed_data.js")],
    {
      env: { ...process.env, MONGODB_URI: uri },
      stdio: "inherit",
      cwd: __dirname,
    }
  );
  if (r.error) throw r.error;
  // eslint-disable-next-line no-console
  console.log(
    "[seed-in-memory] Note: data only existed in RAM. For the app, use a real MONGODB_URI and npm run seed."
  );
  await mongo.stop();
  process.exit(r.status === null ? 1 : r.status);
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

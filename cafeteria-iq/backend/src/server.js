require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const { connectDB } = require("./config/db");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.set("io", io);
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "4mb" }));
app.use(
  rateLimit({ windowMs: 60_000, max: 200 })
);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "CafeIQ API" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/menu", require("./routes/menu"));
app.use("/api/clustering", require("./routes/clustering"));
app.use("/api/reduce", require("./routes/reduction"));
app.use("/api/association", require("./routes/association"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/dashboard", require("./routes/dashboard"));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || "Server error" });
});

io.on("connection", (socket) => {
  socket.emit("connected", { t: Date.now() });
});

const port = process.env.PORT || 5000;

connectDB()
  .then(() => {
    server.listen(port, () => {
      console.log(`CafeIQ API on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    console.error("DB", e);
    process.exit(1);
  });

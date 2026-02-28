require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./logger");

const authRoutes    = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const requestRoutes = require("./routes/requests");
const adviceRoutes  = require("./routes/advice");
const badgeRoutes   = require("./routes/badge");
const chatRoutes    = require("./routes/chat");
const { router: adminRoutes } = require("./routes/admin");
const pulseRoutes = require("./routes/pulse");

const app = express();

/* ================= STARTUP MIGRATION ================= */
// Fix profiles where user_id is NULL
// Iterates every user and matches by email prefix → username
const db = require("./db");
db.query("SELECT id, email FROM users", (err, users) => {
  if (err) { console.error("Migration fetch error:", err.message); return; }
  console.log(`Migration: checking ${users.length} user(s) for null user_id in profiles`);
  users.forEach(u => {
    const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").substring(0, 30);
    db.query(
      "UPDATE profiles SET user_id = ? WHERE (user_id IS NULL OR user_id = 0) AND LOWER(username) = ?",
      [u.id, emailPrefix],
      (err, result) => {
        if (err) console.error(`Migration error for ${u.email}:`, err.message);
        else if (result.affectedRows > 0)
          console.log(`✅ Migration: fixed user_id for username=${emailPrefix} userId=${u.id}`);
      }
    );
  });
});

/* ================= CORS ================= */
app.use(cors({
  origin: [
    "https://adviceme.social",
    "https://www.adviceme.social",
    "https://euphonious-bunny-6005b4.netlify.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

/* ================= REQUEST LOGGING ================= */
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error"
                : res.statusCode >= 400 ? "warn"
                : "info";
    logger[level](`${req.method} ${req.path}`, {
      status:   res.statusCode,
      duration: `${duration}ms`,
      ip:       req.ip
    });
  });
  next();
});

/* ================= ROUTES ================= */
app.use("/api/auth",     authRoutes);
app.use("/api/profile",  profileRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/advice",   adviceRoutes);
app.use("/api/badge",    badgeRoutes);
app.use("/api/chat",     chatRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/pulse",    pulseRoutes);

app.get("/", (req, res) => res.send("Backend is running 🚀"));

/* ================= 404 HANDLER ================= */
app.use((req, res) => {
  logger.warn("Route not found", { method: req.method, path: req.path });
  res.status(404).json({ message: "Route not found" });
});

/* ================= GLOBAL ERROR HANDLER ================= */
app.use((err, req, res, next) => {
  logger.error("Unhandled route error", {
    method:  req.method,
    path:    req.path,
    error:   err.message,
    stack:   err.stack
  });
  res.status(500).json({ message: "Internal server error" });
});

/* ================= CRASH HANDLERS ================= */
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", {
    reason: reason?.message || String(reason),
    stack:  reason?.stack
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — server will exit", {
    error: err.message,
    stack: err.stack
  });
  setTimeout(() => process.exit(1), 500);
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
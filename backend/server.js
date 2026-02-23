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

const app = express();

/* ================= CORS ================= */
app.use(cors({
  origin: [
    "https://adviceme.social",                      // custom domain
    "https://www.adviceme.social",                  // www version
    "https://euphonious-bunny-6005b4.netlify.app",  // Netlify fallback
    "http://localhost:5500",                        // VS Code Live Server
    "http://127.0.0.1:5500",                        // VS Code Live Server alt
    "http://localhost:3000"                         // local backend testing
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
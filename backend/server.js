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

app.use(cors());
app.use(express.json());

/* ================= REQUEST LOGGING ================= */
// Logs every incoming request — method, path, status, duration
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
// Catches any error thrown inside a route with next(err)
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
// Catches async promise rejections that nobody caught (e.g. forgotten await)
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection", {
    reason: reason?.message || String(reason),
    stack:  reason?.stack
  });
});

// Catches synchronous exceptions that escaped all try/catch
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — server will exit", {
    error: err.message,
    stack: err.stack
  });
  // Give logger time to flush, then exit so process manager can restart
  setTimeout(() => process.exit(1), 500);
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
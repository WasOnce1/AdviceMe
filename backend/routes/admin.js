const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

/* ================= BADGE LEVEL HELPER ================= */
function getBadgeLevel(points) {
  if (points >= 2000) return { level: "Legendary Advisor", icon: "👑" };
  if (points >= 1000) return { level: "Elite Advisor",     icon: "💎" };
  if (points >= 500)  return { level: "Expert Advisor",    icon: "🥇" };
  if (points >= 100)  return { level: "Trusted Advisor",   icon: "🥈" };
  if (points >= 10)   return { level: "Beginner Advisor",  icon: "🥉" };
  return                     { level: "Newcomer",          icon: "🌱" };
}

/* ================= ADMIN MIDDLEWARE ================= */
const adminAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "No token provided" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= ADMIN SETUP (run once) ================= */
router.post("/setup", async (req, res) => {
  const { username, password, secretKey } = req.body;

  if (secretKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ message: "Invalid secret key" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO admins (username, password) VALUES (?, ?)",
    [username, hashedPassword],
    (err) => {
      if (err) return res.status(409).json({ message: "Admin already exists" });
      res.json({ message: "Admin created successfully" });
    }
  );
});

/* ================= ADMIN LOGIN ================= */
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM admins WHERE username = ?",
    [username],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const admin = results[0];
      const match = await bcrypt.compare(password, admin.password);

      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

/* ================= DASHBOARD STATS ================= */
router.get("/stats", adminAuth, (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM users WHERE user_type = 'giver') AS total_givers,
      (SELECT COUNT(*) FROM users WHERE user_type = 'taker') AS total_takers,
      (SELECT COUNT(*) FROM user_requests) AS total_requests,
      (SELECT COUNT(*) FROM user_advice) AS total_advice,
      (SELECT COUNT(*) FROM user_advice WHERE chat_status = 'ACTIVE') AS active_chats,
      (SELECT COUNT(*) FROM user_advice WHERE chat_status = 'REPORTED') AS reported_chats,
      (SELECT COUNT(*) FROM user_advice WHERE chat_status = 'ENDED') AS ended_chats
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows[0]);
  });
});

/* ================= GET ALL USERS ================= */
router.get("/users", adminAuth, (req, res) => {
  const sql = `
    SELECT
      u.id, u.email, u.user_type, u.preference, u.created_at,
      u.badge_points, u.badge_level, u.banned,
      p.username, p.bio, p.expertise, p.profile_image_url
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
});

/* ================= BAN USER ================= */
router.put("/users/ban/:userId", adminAuth, (req, res) => {
  const { userId } = req.params;

  db.query(
    "UPDATE users SET banned = 1 WHERE id = ?",
    [userId],
    (err) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "User banned successfully" });
    }
  );
});

/* ================= UNBAN USER ================= */
router.put("/users/unban/:userId", adminAuth, (req, res) => {
  const { userId } = req.params;

  db.query(
    "UPDATE users SET banned = 0 WHERE id = ?",
    [userId],
    (err) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "User unbanned successfully" });
    }
  );
});

/* ================= GET REPORTED CHATS ================= */
router.get("/reports", adminAuth, (req, res) => {
  const sql = `
    SELECT
      ua.id AS advice_id,
      ua.giver_username,
      ur.username AS taker_username,
      ur.category,
      ur.request_text,
      ua.advice_text,
      ua.chat_status,
      ua.created_at
    FROM user_advice ua
    JOIN user_requests ur ON ua.track_id = ur.track_id
    WHERE ua.chat_status = 'REPORTED'
    ORDER BY ua.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
});

/* ================= DISMISS REPORT ================= */
router.put("/reports/dismiss/:adviceId", adminAuth, (req, res) => {
  const { adviceId } = req.params;

  db.query(
    "UPDATE user_advice SET chat_status = 'ENDED' WHERE id = ?",
    [adviceId],
    (err) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Report dismissed" });
    }
  );
});

/* ================= TOP GIVERS LEADERBOARD ================= */
router.get("/leaderboard", adminAuth, (req, res) => {
  const sql = `
    SELECT p.username, p.profile_image_url, u.badge_points, u.badge_level
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.user_type = 'giver'
    ORDER BY u.badge_points DESC
    LIMIT 10
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    const result = rows.map(r => ({
      ...r,
      badge_icon:  getBadgeLevel(r.badge_points || 0).icon,
      badge_level: r.badge_level || "Newcomer"
    }));

    res.json(result);
  });
});

module.exports = { router, adminAuth };
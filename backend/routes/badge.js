const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authmiddleware");

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

/* ================= CALCULATE BADGE POINTS (own) ================= */
router.get("/calculate", authMiddleware, (req, res) => {
  const giverUsername = req.user.username;

  const sumQuery = `
    SELECT COALESCE(SUM(chat_point), 0) AS totalPoints
    FROM user_advice
    WHERE giver_username = ?
  `;

  db.query(sumQuery, [giverUsername], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    const totalPoints = rows[0].totalPoints;
    const badge = getBadgeLevel(totalPoints);

    const updateUser = `
      UPDATE users
      SET badge_points = ?, badge_level = ?
      WHERE id = ?
    `;

    db.query(updateUser, [totalPoints, badge.level, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: "Failed to update badge" });

      res.json({
        badge_points: totalPoints,
        badge_level:  badge.level,
        badge_icon:   badge.icon
      });
    });
  });
});

/* ================= GET BADGE BY USERNAME (for chat popup) ================= */
router.get("/user/:username", authMiddleware, (req, res) => {
  const { username } = req.params;

  const sql = `
    SELECT u.badge_points, u.badge_level
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    WHERE p.username = ?
  `;

  db.query(sql, [username], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const badge = getBadgeLevel(rows[0].badge_points || 0);
    res.json({
      badge_points: rows[0].badge_points || 0,
      badge_level:  badge.level,
      badge_icon:   badge.icon
    });
  });
});

module.exports = router;
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authmiddleware");
const logger = require("../logger");

const router = express.Router();

/* ================= HELPER ================= */
// Anonymous users have no username in profiles.
// We fall back to anon_<userId> so the DB column is never NULL.
function resolveUsername(req) {
  return req.user.username?.trim() || `anon_${req.user.id}`;
}

/* ================= TAKER: CREATE REQUEST ================= */
router.post("/create", authMiddleware, (req, res) => {
  const { category, urgency, request_text } = req.body;

  if (!category || !urgency || !request_text) {
    return res.status(400).json({ message: "All fields required" });
  }

  const username = resolveUsername(req); // ✅ never NULL
  const trackId  = Math.floor(100000 + Math.random() * 900000);

  const sql = `
    INSERT INTO user_requests
    (track_id, username, category, urgency, request_text)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [trackId, username, category.toLowerCase(), urgency.toLowerCase(), request_text],
    (err) => {
      if (err) {
        logger.error("Failed to create request", { username, category, error: err.message });
        return res.status(500).json({ message: "DB error" });
      }
      res.status(201).json({ track_id: trackId });
    }
  );
});

/* ================= GIVER: GET REQUESTS BY CATEGORY ================= */
router.get("/category/:category", authMiddleware, (req, res) => {
  const category = req.params.category.toLowerCase();

  const sql = `
    SELECT track_id, username, category, request_text, urgency
    FROM user_requests
    WHERE category = ?
      AND status = 'PENDING'
    ORDER BY
      FIELD(urgency,'high','medium','low'),
      created_at ASC
  `;

  db.query(sql, [category], (err, results) => {
    if (err) {
      logger.error("Failed to fetch requests by category", { category, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }
    res.json(results);
  });
});

/* ================= GIVER: REMOVE REQUEST ================= */
router.put("/remove/:trackId", authMiddleware, (req, res) => {
  const { trackId } = req.params;

  db.query(
    "UPDATE user_requests SET status='REMOVED' WHERE track_id=?",
    [trackId],
    (err) => {
      if (err) {
        logger.error("Failed to remove request", { trackId, error: err.message });
        return res.status(500).json({ message: "DB error" });
      }
      res.json({ message: "Request removed" });
    }
  );
});

module.exports = router;
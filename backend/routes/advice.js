const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authmiddleware");
const logger = require("../logger");
const { notifyTakerNewAdvice, notifyGiverChatActive } = require("../mailer");

const router = express.Router();

/* ================= HELPER ================= */
// Mirrors the same function in requests.js — never returns NULL
function resolveUsername(req) {
  return req.user.username?.trim() || `anon_${req.user.id}`;
}

/* ================= RESPOND TO REQUEST ================= */
router.post("/respond", authMiddleware, (req, res) => {
  const { track_id, category, advice_text } = req.body;

  if (!track_id || !advice_text) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const giverUsername = resolveUsername(req); // ✅ safe for anonymous givers too

  const sql = `
    INSERT INTO user_advice
    (track_id, giver_username, category, advice_text, chat_status, chat_point)
    VALUES (?, ?, ?, ?, 'PENDING', 0)
  `;

  db.query(sql, [track_id, giverUsername, category, advice_text], err => {
    if (err) {
      logger.error("Failed to submit advice", { track_id, giverUsername, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }

    db.query(
      "UPDATE user_requests SET status='RESPONDED' WHERE track_id=?",
      [track_id],
      (err) => {
        if (err) logger.warn("Failed to update request status", { track_id, error: err.message });
      }
    );

    // ✅ EMAIL: notify taker that their request received advice
    db.query(
      `SELECT u.email, ur.username, ur.category
       FROM user_requests ur
       JOIN users u ON u.username = ur.username
       WHERE ur.track_id = ? LIMIT 1`,
      [track_id],
      (err, rows) => {
        if (!err && rows.length) {
          notifyTakerNewAdvice({
            takerEmail:    rows[0].email,
            takerUsername: rows[0].username,
            giverUsername,
            category:      rows[0].category,
            advicePreview: advice_text
          });
        }
      }
    );

    res.json({ message: "Advice submitted" });
  });
});

/* ================= TAKER: GET MY ADVICE ================= */
router.get("/my", authMiddleware, (req, res) => {
  const username = resolveUsername(req); // ✅ anon_7 for anonymous, real username otherwise

  const sql = `
    SELECT 
      ua.id,
      ur.track_id,
      ur.category,
      ur.request_text,
      ua.advice_text,
      ua.giver_username,
      ua.chat_point,
      ua.chat_status,
      ua.created_at
    FROM user_requests ur
    JOIN user_advice ua ON ur.track_id = ua.track_id
    WHERE ur.username = ?
      AND ua.chat_status = 'PENDING'
    ORDER BY ua.created_at DESC
  `;

  db.query(sql, [username], (err, results) => {
    if (err) {
      logger.error("Failed to fetch advice", { username, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }
    res.json(results);
  });
});

/* ================= CHAT ACTION ================= */
router.post("/action", authMiddleware, (req, res) => {
  const { adviceId, action } = req.body;

  if (!adviceId || !action) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const username = resolveUsername(req); // ✅ consistent with how request was stored

  const checkSql = `
    SELECT ua.id
    FROM user_advice ua
    JOIN user_requests ur ON ua.track_id = ur.track_id
    WHERE ua.id = ?
      AND ur.username = ?
      AND ua.chat_status = 'PENDING'
  `;

  db.query(checkSql, [adviceId, username], (err, rows) => {
    if (err) {
      logger.error("Action ownership check failed", { adviceId, username, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }

    if (rows.length === 0) {
      return res.status(409).json({ message: "Action already applied or unauthorized" });
    }

    let sql;

    if (action === "continue") {
      sql = `UPDATE user_advice SET chat_status = 'ACTIVE', chat_point = chat_point + 1 WHERE id = ?`;
    } else if (action === "end") {
      sql = `UPDATE user_advice SET chat_status = 'ENDED' WHERE id = ?`;
    } else if (action === "report") {
      sql = `UPDATE user_advice SET chat_status = 'REPORTED' WHERE id = ?`;
    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    db.query(sql, [adviceId], err => {
      if (err) {
        logger.error("Failed to apply action", { adviceId, action, error: err.message });
        return res.status(500).json({ message: "DB error" });
      }

      // ✅ EMAIL: if taker clicked continue, notify the giver their chat is active
      if (action === "continue") {
        db.query(
          `SELECT u.email, ua.giver_username, ur.category
           FROM user_advice ua
           JOIN user_requests ur ON ua.track_id = ur.track_id
           JOIN users u ON u.username = ua.giver_username
           WHERE ua.id = ? LIMIT 1`,
          [adviceId],
          (err, rows) => {
            if (!err && rows.length) {
              notifyGiverChatActive({
                giverEmail:    rows[0].email,
                giverUsername: rows[0].giver_username,
                takerUsername: username,
                category:      rows[0].category
              });
            }
          }
        );
      }

      res.json({ message: "Action applied successfully" });
    });
  });
});

module.exports = router;
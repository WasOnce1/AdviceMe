const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authmiddleware");
const logger = require("../logger");

const router = express.Router();

/* ================= HELPER ================= */
function resolveUsername(req) {
  return req.user.username?.trim() || `anon_${req.user.id}`;
}

/* ================= LIST ACTIVE CHATS ================= */
router.get("/list", authMiddleware, (req, res) => {
  const username = resolveUsername(req);

  const sql = `
    SELECT 
      ua.id AS advice_id,
      ua.giver_username AS giver,
      ur.username AS taker,
      gp.profile_image_url AS giver_image,
      tp.profile_image_url AS taker_image
    FROM user_advice ua
    JOIN user_requests ur ON ua.track_id = ur.track_id
    LEFT JOIN profiles gp ON gp.username = ua.giver_username
    LEFT JOIN profiles tp ON tp.username = ur.username
    WHERE ua.chat_status = 'ACTIVE'
      AND (ua.giver_username = ? OR ur.username = ?)
    ORDER BY ua.created_at DESC
  `;

  db.query(sql, [username, username], (err, rows) => {
    if (err) {
      logger.error("Failed to list chats", { username, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }

    const result = rows.map(row => {
      const giver   = row.giver?.trim();
      const taker   = row.taker?.trim();
      const isGiver = username === giver;
      return {
        advice_id:      row.advice_id,
        giver,
        taker,
        other_username: isGiver ? taker : giver,
        other_image:    isGiver ? row.taker_image : row.giver_image
      };
    });

    res.json(result);
  });
});

/* ================= LOAD CHAT ================= */
router.get("/:adviceId", authMiddleware, (req, res) => {
  const { adviceId } = req.params;
  const username = resolveUsername(req);

  const chatSql = `
    SELECT 
      ua.giver_username AS giver,
      ur.username AS taker,
      ur.request_text,
      ua.advice_text,
      gp.profile_image_url AS giver_image,
      tp.profile_image_url AS taker_image
    FROM user_advice ua
    JOIN user_requests ur ON ua.track_id = ur.track_id
    LEFT JOIN profiles gp ON gp.username = ua.giver_username
    LEFT JOIN profiles tp ON tp.username = ur.username
    WHERE ua.id = ?
      AND ua.chat_status = 'ACTIVE'
  `;

  db.query(chatSql, [adviceId], (err, rows) => {
    if (err) {
      logger.error("Failed to load chat", { adviceId, username, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }
    if (!rows.length) {
      logger.warn("Chat not found or inactive", { adviceId, username });
      return res.status(404).json({ message: "Chat not found" });
    }

    const row   = rows[0];
    const giver = row.giver?.trim();
    const taker = row.taker?.trim();

    const isGiver       = username === giver;
    const myUsername    = isGiver ? giver : taker;
    const otherUsername = isGiver ? taker : giver;
    const otherImage    = isGiver ? row.taker_image : row.giver_image;

    const msgSql = `
      SELECT sender, message
      FROM chat_messages
      WHERE advice_id = ?
      ORDER BY created_at ASC
    `;

    db.query(msgSql, [adviceId], (err, messages) => {
      if (err) {
        logger.error("Failed to load messages", { adviceId, error: err.message });
        return res.status(500).json({ message: "DB error" });
      }

      const cleanMessages = messages.map(m => ({
        sender:  m.sender?.trim(),
        message: m.message
      }));

      res.json({
        giver,
        taker,
        myUsername,
        otherUsername,
        otherImage,
        initialMessages: [
          { sender: taker, message: row.request_text },
          { sender: giver, message: row.advice_text }
        ],
        messages: cleanMessages
      });
    });
  });
});

/* ================= SEND MESSAGE ================= */
router.post("/send", authMiddleware, (req, res) => {
  const { adviceId, message } = req.body;

  if (!adviceId || !message)
    return res.status(400).json({ message: "Missing fields" });

  const username = resolveUsername(req);

  const sql = `
    INSERT INTO chat_messages (advice_id, sender, message)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [adviceId, username, message], err => {
    if (err) {
      logger.error("Failed to send message", { adviceId, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }
    res.json({ message: "Message sent" });
  });
});

/* ================= REMOVE RECIPIENT ================= */
router.put("/remove/:adviceId", authMiddleware, (req, res) => {
  const { adviceId } = req.params;
  const username = resolveUsername(req);

  const checkSql = `
    SELECT ua.id
    FROM user_advice ua
    JOIN user_requests ur ON ua.track_id = ur.track_id
    WHERE ua.id = ?
      AND (ua.giver_username = ? OR ur.username = ?)
      AND ua.chat_status = 'ACTIVE'
  `;

  db.query(checkSql, [adviceId, username, username], (err, rows) => {
    if (err) {
      logger.error("Chat remove auth check failed", { adviceId, username, error: err.message });
      return res.status(500).json({ message: "DB error" });
    }
    if (!rows.length) return res.status(403).json({ message: "Unauthorized or chat not found" });

    db.query(
      "UPDATE user_advice SET chat_status = 'REMOVED' WHERE id = ?",
      [adviceId],
      (err) => {
        if (err) {
          logger.error("Failed to remove chat", { adviceId, error: err.message });
          return res.status(500).json({ message: "DB error" });
        }
        res.json({ message: "Recipient removed successfully" });
      }
    );
  });
});

module.exports = router;
  /* ================= MOBILE KEYBOARD FIX ================= */
  // When keyboard opens on mobile, scroll messages to bottom
  // so the last message stays visible above the input bar
  if (window.innerWidth <= 768) {
    messageInput.addEventListener("focus", () => {
      setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }, 300); // wait for keyboard animation
    });

    // Also handle iOS visual viewport resize
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        setTimeout(() => {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
      });
    }
  }
const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authmiddleware");
const { adminAuth } = require("./admin");
const { notifyAnswerLiked, notifyBestAdviceWinner, notifyAllUsersNewPulse } = require("../mailer");

const router = express.Router();

/* ================= RESOLVE USERNAME ================= */
// Works even if user has no profile — uses anon_ID as fallback
function resolveUsername(req) {
  // Try profile username first, then token username, then anon fallback
  return req.user.username?.trim() || `anon_${req.user.id}`;
}

/* GET active question (public — no auth needed) */
router.get("/active", (req, res) => {
  db.query("UPDATE daily_questions SET is_active = 0 WHERE is_active = 1 AND expires_at < NOW()", () => {
    db.query("SELECT * FROM daily_questions WHERE is_active = 1 LIMIT 1", (err, questions) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (!questions.length) return res.json({ question: null, answers: [] });
      const q = questions[0];
      db.query(
        `SELECT da.id, da.username, da.answer_text, da.likes, da.is_best, da.created_at,
                p.profile_image_url
         FROM daily_answers da
         LEFT JOIN profiles p ON p.username = da.username
         WHERE da.question_id = ?
         ORDER BY da.likes DESC, da.created_at ASC`,
        [q.id],
        (err, answers) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ question: q, answers });
        }
      );
    });
  });
});

/* GET archived questions (public) */
router.get("/archive", (req, res) => {
  const sql = `
    SELECT dq.id, dq.question_text, dq.question_slug, dq.created_at, dq.expires_at,
           COUNT(da.id) AS answer_count
    FROM daily_questions dq
    LEFT JOIN daily_answers da ON da.question_id = dq.id
    WHERE dq.is_active = 0
    GROUP BY dq.id
    ORDER BY dq.created_at DESC
    LIMIT 20
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
});

/* GET single archived question by slug (public) */
router.get("/archive/:slug", (req, res) => {
  db.query("SELECT * FROM daily_questions WHERE question_slug = ?", [req.params.slug], (err, questions) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!questions.length) return res.status(404).json({ message: "Not found" });
    const q = questions[0];
    db.query(
      `SELECT da.id, da.username, da.answer_text, da.likes, da.is_best, da.created_at,
              p.profile_image_url
       FROM daily_answers da
       LEFT JOIN profiles p ON p.username = da.username
       WHERE da.question_id = ?
       ORDER BY da.is_best DESC, da.likes DESC, da.created_at ASC`,
      [q.id],
      (err, answers) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ question: q, answers });
      }
    );
  });
});

/* POST answer to active question (auth required) */
router.post("/answer", authMiddleware, (req, res) => {
  const { question_id, answer_text } = req.body;
  if (!question_id || !answer_text?.trim()) return res.status(400).json({ message: "Missing fields" });

  // Use user_id directly as username if no profile username exists
  // This means ANYONE with an account (anonymous or not, profile or not) can answer
  const username = req.user.username?.trim() || `anon_${req.user.id}`;

  db.query(
    "SELECT id FROM daily_answers WHERE question_id = ? AND username = ?",
    [question_id, username],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (rows.length) return res.status(409).json({ message: "You already answered today's question" });

      db.query(
        "INSERT INTO daily_answers (question_id, username, answer_text) VALUES (?, ?, ?)",
        [question_id, username, answer_text.trim()],
        (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ message: "Answer submitted!" });
        }
      );
    }
  );
});

/* POST like/unlike an answer (auth required, toggle) */
router.post("/like/:answerId", authMiddleware, (req, res) => {
  const { answerId } = req.params;
  const username = req.user.username?.trim() || `anon_${req.user.id}`;

  db.query(
    "SELECT id FROM daily_answer_likes WHERE answer_id = ? AND username = ?",
    [answerId, username],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });

      if (rows.length) {
        db.query("DELETE FROM daily_answer_likes WHERE answer_id = ? AND username = ?", [answerId, username], (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          db.query("UPDATE daily_answers SET likes = likes - 1 WHERE id = ? AND likes > 0", [answerId], (err) => {
            if (err) return res.status(500).json({ message: "DB error" });
            res.json({ liked: false });
          });
        });
      } else {
        db.query("INSERT INTO daily_answer_likes (answer_id, username) VALUES (?, ?)", [answerId, username], (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          db.query("UPDATE daily_answers SET likes = likes + 1 WHERE id = ?", [answerId], (err) => {
            if (err) return res.status(500).json({ message: "DB error" });

            // ✅ EMAIL: notify answer author that someone liked their answer
            db.query(
              `SELECT da.username AS author, da.likes,
                      u.email AS author_email,
                      dq.question_text
               FROM daily_answers da
               JOIN daily_questions dq ON dq.id = da.question_id
               LEFT JOIN users u ON u.username = da.username
               WHERE da.id = ? LIMIT 1`,
              [answerId],
              (err, rows) => {
                if (!err && rows.length && rows[0].author_email && rows[0].author !== username) {
                  notifyAnswerLiked({
                    authorEmail:    rows[0].author_email,
                    authorUsername: rows[0].author,
                    likerUsername:  username,
                    questionText:   rows[0].question_text,
                    likeCount:      rows[0].likes
                  });
                }
              }
            );

            res.json({ liked: true });
          });
        });
      }
    }
  );
});

/* GET user's likes for a question (auth required) */
router.get("/mylikes/:questionId", authMiddleware, (req, res) => {
  const username = req.user.username?.trim() || `anon_${req.user.id}`;
  db.query(
    `SELECT dal.answer_id FROM daily_answer_likes dal
     JOIN daily_answers da ON da.id = dal.answer_id
     WHERE da.question_id = ? AND dal.username = ?`,
    [req.params.questionId, username],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json(rows.map(r => r.answer_id));
    }
  );
});

/* ================= ADMIN: DELETE ANSWER ================= */
router.delete("/admin/answer/:answerId", adminAuth, (req, res) => {
  const { answerId } = req.params;
  db.query("DELETE FROM daily_answer_likes WHERE answer_id = ?", [answerId], (err) => {
    if (err) return res.status(500).json({ message: "DB error" });
    db.query("DELETE FROM daily_answers WHERE id = ?", [answerId], (err) => {
      if (err) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Answer removed successfully" });
    });
  });
});

/* ================= ADMIN: DELETE ENTIRE QUESTION ================= */
router.delete("/admin/question/:questionId", adminAuth, (req, res) => {
  const { questionId } = req.params;
  db.query("DELETE dal FROM daily_answer_likes dal JOIN daily_answers da ON da.id = dal.answer_id WHERE da.question_id = ?", [questionId], (err) => {
    if (err) return res.status(500).json({ message: "DB error deleting likes" });
    db.query("DELETE FROM daily_answers WHERE question_id = ?", [questionId], (err) => {
      if (err) return res.status(500).json({ message: "DB error deleting answers" });
      db.query("DELETE FROM daily_questions WHERE id = ? AND is_active = 0", [questionId], (err, result) => {
        if (err) return res.status(500).json({ message: "DB error deleting question" });
        if (result.affectedRows === 0) return res.status(403).json({ message: "Cannot delete an active question" });
        res.json({ message: "Question deleted successfully" });
      });
    });
  });
});

module.exports = router;
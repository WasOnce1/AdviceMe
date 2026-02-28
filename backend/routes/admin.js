const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { notifyBestAdviceWinner, notifyAllUsersNewPulse } = require("../mailer");

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
    if (decoded.role !== "admin") return res.status(403).json({ message: "Admin access only" });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= ADMIN SETUP ================= */
router.post("/setup", async (req, res) => {
  const { username, password, secretKey } = req.body;
  if (secretKey !== process.env.ADMIN_SECRET_KEY) return res.status(403).json({ message: "Invalid secret key" });
  const hashedPassword = await bcrypt.hash(password, 10);
  db.query("INSERT INTO admins (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
    if (err) return res.status(409).json({ message: "Admin already exists" });
    res.json({ message: "Admin created successfully" });
  });
});

/* ================= ADMIN LOGIN ================= */
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.query("SELECT * FROM admins WHERE username = ?", [username], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ message: "Invalid credentials" });
    const admin = results[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ token });
  });
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
    SELECT u.id, u.email, u.user_type, u.preference, u.created_at,
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

/* ================= BAN / UNBAN USER ================= */
router.put("/users/ban/:userId", adminAuth, (req, res) => {
  db.query("UPDATE users SET banned = 1 WHERE id = ?", [req.params.userId], (err) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json({ message: "User banned successfully" });
  });
});

router.put("/users/unban/:userId", adminAuth, (req, res) => {
  db.query("UPDATE users SET banned = 0 WHERE id = ?", [req.params.userId], (err) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json({ message: "User unbanned successfully" });
  });
});

/* ================= REPORTED CHATS ================= */
router.get("/reports", adminAuth, (req, res) => {
  const sql = `
    SELECT ua.id AS advice_id, ua.giver_username, ur.username AS taker_username,
      ur.category, ur.request_text, ua.advice_text, ua.chat_status, ua.created_at
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

router.put("/reports/dismiss/:adviceId", adminAuth, (req, res) => {
  db.query("UPDATE user_advice SET chat_status = 'ENDED' WHERE id = ?", [req.params.adviceId], (err) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json({ message: "Report dismissed" });
  });
});

/* ================= LEADERBOARD ================= */
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
    res.json(rows.map(r => ({ ...r, badge_icon: getBadgeLevel(r.badge_points || 0).icon, badge_level: r.badge_level || "Newcomer" })));
  });
});

/* =======================================================
   DAILY PULSE — ADMIN ROUTES
   ======================================================= */

/* POST new daily question */
router.post("/pulse/post", adminAuth, (req, res) => {
  const { question_text, question_slug } = req.body;
  if (!question_text || !question_slug) return res.status(400).json({ message: "Missing fields" });

  db.query("UPDATE daily_questions SET is_active = 0 WHERE is_active = 1", (err) => {
    if (err) return res.status(500).json({ message: "DB error" });
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
    db.query(
      "INSERT INTO daily_questions (question_text, question_slug, is_active, expires_at) VALUES (?, ?, 1, ?)",
      [question_text, question_slug, expires_at],
      (err, result) => {
        if (err) return res.status(500).json({ message: "DB error: " + err.message });

        // ✅ EMAIL: notify all users about new daily question
        // username lives in profiles table, not users
        db.query(
          `SELECT u.email, COALESCE(p.username, u.email) AS username
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id`,
          (err, users) => {
            if (err) {
              console.error("📧 EMAIL: failed to fetch users for pulse notification", err.message);
              return;
            }
            console.log(`📧 EMAIL: sending Daily Pulse notification to ${users.length} users`);
            if (users.length) {
              notifyAllUsersNewPulse({
                emails: users.map(u => ({ email: u.email, username: u.username })),
                questionText: question_text,
                questionSlug: question_slug
              });
            }
          }
        );

        res.json({ message: "Question posted successfully", id: result.insertId });
      }
    );
  });
});

/* GET active question with answers */
router.get("/pulse/active", adminAuth, (req, res) => {
  db.query("SELECT * FROM daily_questions WHERE is_active = 1 LIMIT 1", (err, questions) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!questions.length) return res.json({ question: null, answers: [] });
    const q = questions[0];
    db.query(
      `SELECT da.*, p.profile_image_url 
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

/* GET all past questions */
router.get("/pulse/history", adminAuth, (req, res) => {
  const sql = `
    SELECT dq.*, COUNT(da.id) AS answer_count
    FROM daily_questions dq
    LEFT JOIN daily_answers da ON da.question_id = dq.id
    GROUP BY dq.id
    ORDER BY dq.created_at DESC
    LIMIT 30
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(rows);
  });
});

/* MARK best answer */
router.put("/pulse/best/:answerId", adminAuth, (req, res) => {
  const { answerId } = req.params;
  db.query("SELECT * FROM daily_answers WHERE id = ?", [answerId], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ message: "Answer not found" });
    const answer = rows[0];
    db.query("UPDATE daily_answers SET is_best = 0 WHERE question_id = ?", [answer.question_id], (err) => {
      if (err) return res.status(500).json({ message: "DB error" });
      db.query("UPDATE daily_answers SET is_best = 1 WHERE id = ?", [answerId], (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        db.query(
          "UPDATE users u JOIN profiles p ON p.user_id = u.id SET u.best_advice_count = u.best_advice_count + 1 WHERE p.username = ?",
          [answer.username],
          (err) => {
            if (err) return res.status(500).json({ message: "DB error" });

            // ✅ EMAIL: notify winner they got Best Advice
            db.query(
              `SELECT u.email, dq.question_text
               FROM daily_answers da
               JOIN daily_questions dq ON dq.id = da.question_id
               JOIN profiles p ON p.username = da.username
               JOIN users u ON u.id = p.user_id
               WHERE da.id = ? LIMIT 1`,
              [answerId],
              (err, rows) => {
                if (err) console.error("📧 EMAIL best advice lookup error:", err.message);
                if (!err && rows.length) {
                  notifyBestAdviceWinner({
                    winnerEmail:    rows[0].email,
                    winnerUsername: answer.username,
                    questionText:   rows[0].question_text
                  });
                }
              }
            );

            res.json({ message: `Best Advice awarded to ${answer.username} 🏆` });
          }
        );
      });
    });
  });
});

/* DELETE entire archived question + all answers + likes */
router.delete("/pulse/question/:questionId", adminAuth, (req, res) => {
  const { questionId } = req.params;

  // Delete in order: likes → answers → question
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

module.exports = { router, adminAuth };
const express    = require("express");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const crypto     = require("crypto");
const nodemailer = require("nodemailer");
const db         = require("../db");

const router = express.Router();

/* ======================
   EMAIL TRANSPORTER
====================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ======================
   JWT AUTH MIDDLEWARE
====================== */
const verifyToken = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, user_type }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ======================
   SIGNUP
====================== */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, user_type, preference } = req.body;

    if (!email || !password || !user_type || !preference) {
      return res.status(400).json({ message: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO users (email, password, user_type, preference)
      VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [email, hashedPassword, user_type, preference], (err) => {
      if (err) {
        return res.status(409).json({ message: "User already exists" });
      }
      res.status(201).json({ message: "Signup successful" });
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================
   LOGIN
====================== */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id:        user.id,
        email:     user.email,
        user_type: user.user_type
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user_type:       user.user_type,
      preference:      user.preference,
      profile_created: user.profile_created
    });
  });
});

/* ======================
   FORGOT PASSWORD
   Step 1 — Send OTP
====================== */
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  db.query("SELECT id FROM users WHERE email = ?", [email], (err, rows) => {
    if (err)         return res.status(500).json({ message: "DB error" });
    if (!rows.length) return res.status(404).json({ message: "No account found with this email" });

    const otp     = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    db.query(
      `UPDATE users SET reset_otp = ?, reset_otp_expires = ? WHERE email = ?`,
      [otp, expires, email],
      async (err) => {
        if (err) return res.status(500).json({ message: "Failed to save OTP" });

        try {
          await transporter.sendMail({
            from:    `"AdviceMe" <${process.env.EMAIL_USER}>`,
            to:      email,
            subject: "Your AdviceMe Password Reset Code",
            html: `
              <div style="font-family:'Segoe UI',sans-serif; max-width:480px; margin:0 auto; background:#0d0118; padding:40px; border-radius:16px; color:#fff;">
                <h2 style="color:#ff2bd6; margin-bottom:8px;">Reset Your Password</h2>
                <p style="color:rgba(255,255,255,0.7); margin-bottom:28px;">Here is your 6-digit reset code. It expires in <strong>10 minutes</strong>.</p>
                <div style="background:rgba(255,43,214,0.12); border:1px solid rgba(255,43,214,0.3); border-radius:12px; padding:24px; text-align:center; margin-bottom:28px;">
                  <span style="font-size:42px; font-weight:700; letter-spacing:12px; color:#ff2bd6;">${otp}</span>
                </div>
                <p style="color:rgba(255,255,255,0.4); font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
                <p style="color:rgba(255,255,255,0.3); font-size:12px; margin-top:24px;">— The AdviceMe Team</p>
              </div>
            `
          });

          res.json({ message: "Reset code sent to your email" });

        } catch (mailErr) {
          console.error("Email send error:", mailErr.message);
          res.status(500).json({ message: "Failed to send email. Check EMAIL_USER and EMAIL_PASS in .env" });
        }
      }
    );
  });
});

/* ======================
   VERIFY OTP
   Step 2 — Check code
====================== */
router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Missing fields" });

  db.query(
    `SELECT reset_otp, reset_otp_expires FROM users WHERE email = ?`,
    [email],
    (err, rows) => {
      if (err)          return res.status(500).json({ message: "DB error" });
      if (!rows.length) return res.status(404).json({ message: "User not found" });

      const { reset_otp, reset_otp_expires } = rows[0];

      if (!reset_otp)
        return res.status(400).json({ message: "No reset code found. Request a new one." });
      if (new Date() > new Date(reset_otp_expires))
        return res.status(400).json({ message: "Code expired. Request a new one." });
      if (reset_otp !== otp)
        return res.status(400).json({ message: "Incorrect code. Try again." });

      // Generate secure reset token valid for 15 min
      const resetToken  = crypto.randomBytes(32).toString("hex");
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

      db.query(
        `UPDATE users 
         SET reset_otp = NULL, reset_otp_expires = NULL,
             reset_token = ?, reset_token_expires = ?
         WHERE email = ?`,
        [resetToken, tokenExpiry, email],
        (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ message: "Code verified", reset_token: resetToken });
        }
      );
    }
  );
});

/* ======================
   RESET PASSWORD
   Step 3 — Save new pw
====================== */
router.post("/reset-password", async (req, res) => {
  const { reset_token, new_password } = req.body;
  if (!reset_token || !new_password)
    return res.status(400).json({ message: "Missing fields" });
  if (new_password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" });

  db.query(
    `SELECT id, reset_token_expires FROM users WHERE reset_token = ?`,
    [reset_token],
    async (err, rows) => {
      if (err)          return res.status(500).json({ message: "DB error" });
      if (!rows.length) return res.status(400).json({ message: "Invalid or expired reset link" });

      if (new Date() > new Date(rows[0].reset_token_expires))
        return res.status(400).json({ message: "Reset session expired. Start over." });

      const hashed = await bcrypt.hash(new_password, 10);

      db.query(
        `UPDATE users
         SET password = ?, reset_token = NULL, reset_token_expires = NULL
         WHERE reset_token = ?`,
        [hashed, reset_token],
        (err) => {
          if (err) return res.status(500).json({ message: "Failed to reset password" });
          res.json({ message: "Password reset successfully" });
        }
      );
    }
  );
});

/* EXPORT MIDDLEWARE */
router.verifyToken = verifyToken;

module.exports = router;
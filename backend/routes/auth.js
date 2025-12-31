const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

/* SIGNUP */
router.post("/signup", async (req, res) => {
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
      return res.status(500).json({ message: "User already exists" });
    }
    res.status(201).json({ message: "User registered successfully" });
  });
});

/* LOGIN */
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
      { id: user.id, role: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user_type: user.user_type,
      preference: user.preference
    });
  });
});

module.exports = router;

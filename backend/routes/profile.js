const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { upload } = require("../config/cloudinary");

const router = express.Router();

/* ================= HELPERS ================= */
function getUserId(req) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) throw new Error("NO_TOKEN");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  } catch (err) {
    console.error("JWT verification error:", err.message);
    throw err;
  }
}

function generateAnonymousUsername(userId) {
  return `anon_${1000 + userId}`;
}

/* ================= CREATE PROFILE ================= */
router.post("/create", upload.single("profilePic"), (req, res) => {
  try {
    const userId = getUserId(req);
    const { username, bio, expertise } = req.body;
    const profileImageUrl = req.file ? req.file.path : null;

    if (!bio || !expertise) {
      return res.status(400).json({ message: "Bio and expertise are required" });
    }

    db.query(
      "SELECT id FROM profiles WHERE user_id = ?",
      [userId],
      (err, rows) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (rows.length) return res.status(409).json({ message: "Profile already exists" });

        db.query(
          "SELECT preference FROM users WHERE id = ?",
          [userId],
          (err, userRows) => {
            if (err) return res.status(500).json({ message: "User fetch error" });
            if (!userRows.length) return res.status(404).json({ message: "User not found" });

            const { preference } = userRows[0];

            let finalUsername = username?.trim();
            if (preference === "anonymous" && !finalUsername) {
              finalUsername = generateAnonymousUsername(userId);
            }

            if (!finalUsername) {
              return res.status(400).json({ message: "Username is required" });
            }

            db.query(
              `INSERT INTO profiles (user_id, username, bio, expertise, profile_image_url)
               VALUES (?, ?, ?, ?, ?)`,
              [userId, finalUsername, bio, expertise, profileImageUrl],
              (err) => {
                if (err) {
                  console.error("PROFILE INSERT ERROR:", err);
                  return res.status(500).json({ message: "Profile creation failed" });
                }
                res.json({ message: "Profile created successfully" });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error("CREATE PROFILE ERROR:", err);
    res.status(401).json({ message: "Invalid or missing token" });
  }
});

/* ================= GET MY PROFILE ================= */
router.get("/me", (req, res) => {
  try {
    const userId = getUserId(req);

    db.query(
      `SELECT u.preference, p.username, p.bio, p.expertise, p.profile_image_url
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [userId],
      (err, rows) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (!rows.length) return res.status(404).json({ message: "User not found" });

        const profile = rows[0];

        if ((!profile.username || profile.username.trim() === "") && profile.preference === "anonymous") {
          const anonUsername = generateAnonymousUsername(userId);
          return db.query(
            `INSERT INTO profiles (user_id, username, bio, expertise) VALUES (?, ?, NULL, NULL)`,
            [userId, anonUsername],
            (insertErr) => {
              if (insertErr) return res.status(500).json({ message: "Failed to create anonymous profile" });
              return res.json({
                preference: "anonymous",
                username: anonUsername,
                bio: null,
                expertise: null,
                profile_image_url: null
              });
            }
          );
        }

        if (!profile.username) {
          return res.status(404).json({ message: "Profile not found" });
        }

        if (profile.preference === "anonymous") {
          profile.bio = null;
          profile.expertise = null;
        }

        res.json(profile);
      }
    );
  } catch (err) {
    console.error("GET MY PROFILE JWT ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

/* ================= VIEW OTHER USER PROFILE ================= */
router.get("/view/:username", (req, res) => {
  const { username } = req.params;

  db.query(
    `SELECT u.user_type, u.preference, p.username, p.bio, p.expertise, p.profile_image_url
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE p.username = ?`,
    [username],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (!rows.length) return res.status(404).json({ message: "User not found" });

      const user = rows[0];

      if (user.preference === "anonymous") {
        return res.json({
          username:          user.username,
          user_type:         user.user_type,
          preference:        "anonymous",
          bio:               null,
          expertise:         null,
          profile_image_url: null
        });
      }

      res.json(user);
    }
  );
});

/* ================= UPDATE PROFILE ================= */
router.put("/update", upload.single("profilePic"), (req, res) => {
  try {
    const userId = getUserId(req);
    const { username, bio, expertise } = req.body;
    const profileImageUrl = req.file ? req.file.path : null;

    if (!bio || !expertise) {
      return res.status(400).json({ message: "Bio and expertise are required" });
    }

    if (profileImageUrl) {
      db.query(
        `UPDATE profiles SET username = ?, bio = ?, expertise = ?, profile_image_url = ? WHERE user_id = ?`,
        [username, bio, expertise, profileImageUrl, userId],
        (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ message: "Profile updated successfully" });
        }
      );
    } else {
      db.query(
        `UPDATE profiles SET username = ?, bio = ?, expertise = ? WHERE user_id = ?`,
        [username, bio, expertise, userId],
        (err) => {
          if (err) return res.status(500).json({ message: "DB error" });
          res.json({ message: "Profile updated successfully" });
        }
      );
    }
  } catch (err) {
    console.error("UPDATE PROFILE JWT ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
});

module.exports = router;
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

/* ================= DB ERROR HELPER ================= */
function handleDbError(err, res) {
  console.error("DB ERROR:", err);
  if (err.code === "ER_DUP_ENTRY") {
    if (err.message.includes("username")) {
      return res.status(409).json({ message: "This username is already taken. Please choose a different one." });
    }
    if (err.message.includes("user_id")) {
      return res.status(409).json({ message: "You already have a profile. Please log in again." });
    }
    return res.status(409).json({ message: "Duplicate entry — this value already exists." });
  }
  if (err.code === "ER_BAD_FIELD_ERROR") {
    return res.status(500).json({ message: "Internal error: bad database field." });
  }
  return res.status(500).json({ message: "Something went wrong. Please try again." });
}

/* ================= CREATE / COMPLETE PROFILE ================= */
// ✅ CHANGED: If profile already exists (auto-created at signup for public users),
// we UPDATE it instead of blocking with 409.
// This allows discuss.html users to complete their profile properly.
router.post("/create", upload.single("profilePic"), (req, res) => {
  try {
    const userId = getUserId(req);
    const { username, bio, expertise } = req.body;
    const profileImageUrl = req.file ? req.file.path : null;

    if (!bio || !expertise) {
      return res.status(400).json({ message: "Bio and expertise are required" });
    }

    db.query("SELECT preference FROM users WHERE id = ?", [userId], (err, userRows) => {
      if (err) return handleDbError(err, res);
      if (!userRows.length) return res.status(404).json({ message: "User not found. Please sign up again." });

      const { preference } = userRows[0];

      let finalUsername = username?.trim();
      if (preference === "anonymous" && !finalUsername) {
        finalUsername = generateAnonymousUsername(userId);
      }
      if (!finalUsername) {
        return res.status(400).json({ message: "Username is required" });
      }

      // Check if profile already exists
      db.query("SELECT id, username FROM profiles WHERE user_id = ?", [userId], (err, existing) => {
        if (err) return handleDbError(err, res);

        if (existing.length) {
          // ✅ Profile exists (auto-created at signup) — UPDATE instead of block
          // Check username not taken by someone else
          db.query(
            "SELECT id FROM profiles WHERE username = ? AND user_id != ?",
            [finalUsername, userId],
            (err, taken) => {
              if (err) return handleDbError(err, res);
              if (taken.length) {
                return res.status(409).json({ message: "This username is already taken. Please choose a different one." });
              }

              const updateSql = profileImageUrl
                ? `UPDATE profiles SET username = ?, bio = ?, expertise = ?, profile_image_url = ? WHERE user_id = ?`
                : `UPDATE profiles SET username = ?, bio = ?, expertise = ? WHERE user_id = ?`;
              const updateParams = profileImageUrl
                ? [finalUsername, bio, expertise, profileImageUrl, userId]
                : [finalUsername, bio, expertise, userId];

              db.query(updateSql, updateParams, (err) => {
                if (err) return handleDbError(err, res);
                res.json({ message: "Profile created successfully" });
              });
            }
          );
        } else {
          // No profile yet — INSERT fresh
          db.query(
            "SELECT id FROM profiles WHERE username = ?",
            [finalUsername],
            (err, usernameRows) => {
              if (err) return handleDbError(err, res);
              if (usernameRows.length) {
                return res.status(409).json({ message: "This username is already taken. Please choose a different one." });
              }

              db.query(
                `INSERT INTO profiles (user_id, username, bio, expertise, profile_image_url)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, finalUsername, bio, expertise, profileImageUrl],
                (err) => {
                  if (err) return handleDbError(err, res);
                  res.json({ message: "Profile created successfully" });
                }
              );
            }
          );
        }
      });
    });
  } catch (err) {
    console.error("CREATE PROFILE ERROR:", err);
    res.status(401).json({ message: "Invalid or missing token. Please log in again." });
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
        if (err) return handleDbError(err, res);
        if (!rows.length) return res.status(404).json({ message: "User not found" });

        const profile = rows[0];

        if ((!profile.username || profile.username.trim() === "") && profile.preference === "anonymous") {
          const anonUsername = generateAnonymousUsername(userId);
          return db.query(
            `INSERT INTO profiles (user_id, username, bio, expertise) VALUES (?, ?, NULL, NULL)`,
            [userId, anonUsername],
            (insertErr) => {
              if (insertErr) return handleDbError(insertErr, res);
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
      if (err) return handleDbError(err, res);
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
          if (err) return handleDbError(err, res);
          res.json({ message: "Profile updated successfully" });
        }
      );
    } else {
      db.query(
        `UPDATE profiles SET username = ?, bio = ?, expertise = ? WHERE user_id = ?`,
        [username, bio, expertise, userId],
        (err) => {
          if (err) return handleDbError(err, res);
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
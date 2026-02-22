const jwt = require("jsonwebtoken");
const db = require("../db");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const sql = `
      SELECT u.id, u.email, u.user_type, u.preference, p.username
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `;

    db.query(sql, [decoded.id], (err, result) => {
      if (err || result.length === 0) {
        return res.status(401).json({ message: "Invalid token" });
      }

      req.user = result[0];
      next();
    });

  } catch (err) {
    return res.status(401).json({ message: "Token expired or invalid" });
  }
};
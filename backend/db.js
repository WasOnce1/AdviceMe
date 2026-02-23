const mysql = require("mysql2");

const db = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,     // ✅ this was missing — Railway uses non-standard port
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

module.exports = db;
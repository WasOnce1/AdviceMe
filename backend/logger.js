/* ================= LOGGER ================= */
// Simple structured logger — use this instead of console.log everywhere
// Levels: info | warn | error

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info:  (msg, meta = {}) => console.log( JSON.stringify({ level: "INFO",  time: timestamp(), msg, ...meta })),
  warn:  (msg, meta = {}) => console.warn( JSON.stringify({ level: "WARN",  time: timestamp(), msg, ...meta })),
  error: (msg, meta = {}) => console.error(JSON.stringify({ level: "ERROR", time: timestamp(), msg, ...meta })),
};

module.exports = logger;
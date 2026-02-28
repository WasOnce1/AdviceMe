const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "AdviceMe <notifications@adviceme.social>";
const BASE_URL = "https://adviceme.social";

/* ============================================================
   EMAIL TEMPLATES
   ============================================================ */

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d0118; font-family: 'Helvetica Neue', Arial, sans-serif; color: #ffffff; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: linear-gradient(135deg, #1a0535 0%, #0d0118 100%); border: 1px solid rgba(255,43,214,0.2); border-radius: 20px; padding: 40px; }
    .logo { font-size: 22px; font-weight: 600; letter-spacing: 1px; color: #ffffff; margin-bottom: 32px; }
    .logo span { color: #ff2bd6; }
    .icon { font-size: 42px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 300; line-height: 1.3; color: #ffffff; margin-bottom: 12px; }
    h1 em { font-style: italic; color: #ff2bd6; }
    .body-text { font-size: 15px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 24px; }
    .quote-box { background: rgba(255,43,214,0.06); border: 1px solid rgba(255,43,214,0.2); border-left: 3px solid #ff2bd6; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.6; font-style: italic; }
    .cta-btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #ff2bd6, #e6008d); color: #ffffff; text-decoration: none; border-radius: 30px; font-size: 14px; font-weight: 600; letter-spacing: 0.5px; }
    .divider { height: 1px; background: rgba(255,255,255,0.06); margin: 28px 0; }
    .footer { font-size: 12px; color: rgba(255,255,255,0.25); line-height: 1.6; margin-top: 24px; text-align: center; }
    .footer a { color: rgba(255,43,214,0.5); text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo">Advice<span>Me</span></div>
      ${content}
    </div>
    <div class="footer">
      <p>You're receiving this because you have an account on <a href="${BASE_URL}">adviceme.social</a></p>
      <p style="margin-top:6px;">© 2026 AdviceMe · Real people. Real advice.</p>
    </div>
  </div>
</body>
</html>`;
}

/* ============================================================
   1. GIVER RESPONDED → notify taker
   ============================================================ */
async function notifyTakerNewAdvice({ takerEmail, takerUsername, giverUsername, category, advicePreview }) {
  if (!takerEmail) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: takerEmail,
      subject: `Someone responded to your ${category} request 💬`,
      html: baseTemplate(`
        <div class="icon">💬</div>
        <h1>You've received <em>new advice</em></h1>
        <p class="body-text">
          Hey ${takerUsername || "there"}, someone just responded to your <strong>${category}</strong> request on AdviceMe.
        </p>
        <div class="quote-box">"${advicePreview?.substring(0, 200)}${advicePreview?.length > 200 ? '...' : ''}"</div>
        <p class="body-text">Head back to your dashboard to read the full advice and decide if you'd like to continue the conversation.</p>
        <a href="${BASE_URL}/taker.html" class="cta-btn">Read Full Advice →</a>
        <div class="divider"></div>
        <p class="body-text" style="font-size:13px;">Remember: you can continue the chat, end it gracefully, or report it if anything feels wrong.</p>
      `)
    });
  } catch(e) {
    console.error("Email error [notifyTakerNewAdvice]:", e.message);
  }
}

/* ============================================================
   2. TAKER CLICKED CONTINUE CHAT → notify giver
   ============================================================ */
async function notifyGiverChatActive({ giverEmail, giverUsername, takerUsername, category }) {
  if (!giverEmail) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: giverEmail,
      subject: `Your chat is now active! Someone accepted your advice 🚀`,
      html: baseTemplate(`
        <div class="icon">🚀</div>
        <h1>Your advice was <em>accepted!</em></h1>
        <p class="body-text">
          Great news, ${giverUsername || "there"}! The person you helped with their <strong>${category}</strong> request has accepted your advice and wants to continue the conversation.
        </p>
        <p class="body-text">Your chat is now active. Head to your dashboard and click the <strong>Chat</strong> button to continue.</p>
        <a href="${BASE_URL}/giver.html" class="cta-btn">Go to Chat →</a>
        <div class="divider"></div>
        <p class="body-text" style="font-size:13px;">This is your chance to make a real difference. Thank you for being a giver 💜</p>
      `)
    });
  } catch(e) {
    console.error("Email error [notifyGiverChatActive]:", e.message);
  }
}

/* ============================================================
   3. BEST ADVICE AWARDED → notify winner
   ============================================================ */
async function notifyBestAdviceWinner({ winnerEmail, winnerUsername, questionText }) {
  if (!winnerEmail) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: winnerEmail,
      subject: `🏆 You won Best Advice of the Day!`,
      html: baseTemplate(`
        <div class="icon">🏆</div>
        <h1>You won <em>Best Advice</em> today!</h1>
        <p class="body-text">
          Congratulations, ${winnerUsername || "there"}! The AdviceMe community recognised your answer as the best advice of the day.
        </p>
        <div class="quote-box">Today's question: "${questionText}"</div>
        <p class="body-text">Your answer stood out and will be featured at the top of the discussion. This is a real achievement — you made someone's day better.</p>
        <a href="${BASE_URL}/discuss.html" class="cta-btn">See Your Answer →</a>
        <div class="divider"></div>
        <p class="body-text" style="font-size:13px;">Keep sharing. Your words matter more than you know 💜</p>
      `)
    });
  } catch(e) {
    console.error("Email error [notifyBestAdviceWinner]:", e.message);
  }
}

/* ============================================================
   4. SOMEONE LIKED YOUR ANSWER → notify author
   ============================================================ */
async function notifyAnswerLiked({ authorEmail, authorUsername, likerUsername, questionText, likeCount }) {
  if (!authorEmail) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: authorEmail,
      subject: `${likerUsername || "Someone"} loved your story ❤️`,
      html: baseTemplate(`
        <div class="icon">❤️</div>
        <h1>Someone <em>loved</em> your story</h1>
        <p class="body-text">
          Hey ${authorUsername || "there"}, your answer on today's Daily Pulse just received a like from <strong>${likerUsername || "a community member"}</strong>.
        </p>
        <div class="quote-box">Question: "${questionText}"</div>
        <p class="body-text">Your answer now has <strong>${likeCount} ${likeCount === 1 ? 'like' : 'likes'}</strong>. Real people are reading your words and finding value in them.</p>
        <a href="${BASE_URL}/discuss.html" class="cta-btn">See the Discussion →</a>
      `)
    });
  } catch(e) {
    console.error("Email error [notifyAnswerLiked]:", e.message);
  }
}

/* ============================================================
   5. NEW DAILY PULSE QUESTION → notify all users
   ============================================================ */
async function notifyAllUsersNewPulse({ emails, questionText, questionSlug }) {
  if (!emails?.length) return;

  // Resend supports batch sending — send in chunks of 50
  const chunks = [];
  for (let i = 0; i < emails.length; i += 50) {
    chunks.push(emails.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const batch = chunk.map(({ email, username }) => ({
        from: FROM,
        to: email,
        subject: `Today's question is live on AdviceMe 🔥`,
        html: baseTemplate(`
          <div class="icon">🔥</div>
          <h1>Today's <em>question</em> is live</h1>
          <p class="body-text">Hey ${username || "there"}, a new Daily Pulse question just dropped on AdviceMe.</p>
          <div class="quote-box">"${questionText}"</div>
          <p class="body-text">Real people are already sharing their stories. Add your voice — your answer might be exactly what someone needs to hear today.</p>
          <a href="${BASE_URL}/discuss.html" class="cta-btn">Answer Today's Question →</a>
          <div class="divider"></div>
          <p class="body-text" style="font-size:13px;">The discussion closes in 24 hours. Don't miss it.</p>
        `)
      }));
      await resend.emails.send(batch);
    } catch(e) {
      console.error("Email error [notifyAllUsersNewPulse]:", e.message);
    }
  }
}

module.exports = {
  notifyTakerNewAdvice,
  notifyGiverChatActive,
  notifyBestAdviceWinner,
  notifyAnswerLiked,
  notifyAllUsersNewPulse
};
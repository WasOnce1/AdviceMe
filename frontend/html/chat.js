document.addEventListener("DOMContentLoaded", async () => {

  const chatList     = document.getElementById("chatList");
  const chatWindow   = document.getElementById("chatWindow");
  const emptyState   = document.getElementById("emptyState");
  const chatMessages = document.getElementById("chatMessages");
  const chatUsername = document.getElementById("chatUsername");
  const chatAvatar   = document.getElementById("chatAvatar");
  const chatHeader   = document.getElementById("chatHeader");
  const sendBtn      = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const backBtn      = document.getElementById("backBtn");
  const chatListPanel = document.getElementById("chatListPanel");

  const profileOverlay     = document.getElementById("profileOverlay");
  const closePopup         = document.getElementById("closePopup");
  const popupImg           = document.getElementById("popupImg");
  const popupUsername      = document.getElementById("popupUsername");
  const popupExpertise     = document.getElementById("popupExpertise");
  const popupBio           = document.getElementById("popupBio");
  const popupBadge         = document.getElementById("popupBadge");
  const removeRecipientBtn = document.getElementById("removeRecipientBtn");

  const enlargeOverlay = document.getElementById("enlargeOverlay");
  const enlargedImg    = document.getElementById("enlargedImg");

  const token = localStorage.getItem("token");
  if (!token) return alert("Not authenticated");

  const params  = new URLSearchParams(window.location.search);
  let adviceId  = params.get("adviceId");

  let myUsername    = null;
  let otherUsername = null;

  /* ================= FETCH MY USERNAME ================= */
  const meRes  = await fetch("adviceme-production.up.railway.app/api/profile/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  myUsername   = meData.username;

  /* ================= MOBILE NAV ================= */
  function openChat() {
    chatListPanel.classList.add("hidden-mobile");
    chatWindow.classList.add("visible-mobile");
  }

  function closeChat() {
    chatListPanel.classList.remove("hidden-mobile");
    chatWindow.classList.remove("visible-mobile");
  }

  backBtn.onclick = closeChat;

  /* ================= LOAD CHAT LIST ================= */
  async function loadChatList() {
    try {
      const res   = await fetch("adviceme-production.up.railway.app/api/chat/list", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed");

      const chats = await res.json();
      chatList.innerHTML = "";

      if (!chats.length) {
        chatList.innerHTML = `
          <div style="padding:24px 22px; text-align:center; color:rgba(255,255,255,0.35);">
            <div style="font-size:32px; margin-bottom:10px;">💭</div>
            <p style="font-size:13px;">No active chats yet</p>
          </div>`;
        return;
      }

      chats.forEach(chat => {
        const div = document.createElement("div");
        div.className = "chat-preview";
        if (chat.advice_id == adviceId) div.classList.add("active");

        div.innerHTML = `
          <img src="${chat.other_image || 'images/default.png'}" class="avatar" />
          <div class="preview-text">
            <h4>${chat.other_username}</h4>
            <p>Active conversation</p>
          </div>
        `;

        div.onclick = () => {
          document.querySelectorAll(".chat-preview").forEach(p => p.classList.remove("active"));
          div.classList.add("active");
          adviceId = chat.advice_id;
          loadChat();
          if (window.innerWidth <= 768) openChat();
        };

        chatList.appendChild(div);
      });

    } catch (err) {
      console.error("Chat list error", err);
    }
  }

  /* ================= LOAD CHAT ================= */
  async function loadChat() {
    if (!adviceId) return;

    try {
      const res = await fetch(`adviceme-production.up.railway.app/api/chat/${adviceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        emptyState.innerText = "Chat not available";
        return;
      }

      const data = await res.json();
      otherUsername = data.otherUsername;

      emptyState.style.display  = "none";
      chatWindow.classList.remove("hidden");
      chatUsername.innerText    = otherUsername;
      chatAvatar.src            = data.otherImage || "images/default.png";

      // Clear messages but keep start label
      chatMessages.innerHTML = `<div class="messages-start-label">Start of conversation</div>`;

      data.initialMessages?.forEach(msg => appendMessage(msg.sender, msg.message));
      data.messages?.forEach(msg => appendMessage(msg.sender, msg.message));

      chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (err) {
      console.error("Load chat error", err);
    }
  }

  /* ================= APPEND MESSAGE ================= */
  function appendMessage(sender, text) {
    const div = document.createElement("div");
    div.className = sender === myUsername ? "message taker" : "message giver";
    div.innerText = text;
    chatMessages.appendChild(div);
  }

  /* ================= SEND MESSAGE ================= */
  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    try {
      const res = await fetch("adviceme-production.up.railway.app/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ adviceId, message: text })
      });

      if (!res.ok) throw new Error("Send failed");

      appendMessage(myUsername, text);
      messageInput.value = "";
      chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (err) {
      alert("Message not sent");
    }
  }

  sendBtn.onclick = sendMessage;

  // Send on Enter key
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ================= VIEW PROFILE (header click) ================= */
  chatHeader.onclick = async (e) => {
    if (e.target === backBtn || backBtn.contains(e.target)) return;
    if (!otherUsername) return;

    try {
      const profileRes = await fetch(`adviceme-production.up.railway.app/api/profile/view/${otherUsername}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!profileRes.ok) return;

      const data = await profileRes.json();

      popupImg.src             = data.profile_image_url || "images/default.png";
      popupUsername.innerText  = data.username || otherUsername;
      popupExpertise.innerText = data.expertise ? `🎯 ${data.expertise}` : "";
      popupBio.innerText       = data.bio || (data.preference === "anonymous" ? "Anonymous user" : "No bio available");

      // Show badge only if the person is a giver (user_type = 'giver')
      if (data.user_type === 'giver') {
        try {
          const badgeRes  = await fetch(`adviceme-production.up.railway.app/api/badge/user/${otherUsername}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const badgeData = badgeRes.ok ? await badgeRes.json() : null;
          if (badgeData) {
            popupBadge.innerHTML     = `<span>${badgeData.badge_icon}</span><span>${badgeData.badge_level}</span>`;
            popupBadge.style.display = "flex";
          } else {
            popupBadge.style.display = "none";
          }
        } catch {
          popupBadge.style.display = "none";
        }
      } else {
        popupBadge.style.display = "none";
      }

      profileOverlay.classList.remove("hidden");

    } catch (err) {
      console.error("Failed to load profile", err);
    }
  };

  /* ================= ENLARGE AVATAR ================= */
  popupImg.onclick = (e) => {
    e.stopPropagation();
    enlargedImg.src = popupImg.src;
    enlargeOverlay.classList.remove("hidden");
  };

  enlargeOverlay.onclick = () => enlargeOverlay.classList.add("hidden");

  /* ================= REMOVE RECIPIENT ================= */
  removeRecipientBtn.onclick = async () => {
    if (!adviceId) return;

    const confirmed = confirm(`Remove ${otherUsername} from this chat? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`adviceme-production.up.railway.app/api/chat/remove/${adviceId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) { alert("Failed to remove recipient"); return; }

      alert("Recipient removed.");
      window.location.href = "chat.html";

    } catch (err) {
      alert("Something went wrong");
    }
  };

  /* ================= CLOSE POPUP ================= */
  closePopup.onclick = () => profileOverlay.classList.add("hidden");

  profileOverlay.onclick = (e) => {
    if (e.target === profileOverlay) profileOverlay.classList.add("hidden");
  };

  /* ================= INIT ================= */
  await loadChatList();
  await loadChat();

  // Auto open on mobile if adviceId in URL
  if (adviceId && window.innerWidth <= 768) openChat();
});
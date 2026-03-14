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

  const meRes  = await fetch("https://api.adviceme.social/api/profile/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  myUsername   = meData.username;

  function openChat() {
    chatListPanel.classList.add("hidden-mobile");
    chatWindow.classList.add("visible-mobile");
  }

  function closeChat() {
    chatListPanel.classList.remove("hidden-mobile");
    chatWindow.classList.remove("visible-mobile");
  }

  backBtn.onclick = closeChat;

  async function loadChatList() {
    try {
      const res   = await fetch("https://api.adviceme.social/api/chat/list", {
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
          if (window.innerWidth <= 768) requestAnimationFrame(() => openChat());
        };

        chatList.appendChild(div);
      });

    } catch (err) {
      console.error("Chat list error", err);
    }
  }

  async function loadChat() {
    if (!adviceId) return;

    try {
      const res = await fetch(`https://api.adviceme.social/api/chat/${adviceId}`, {
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

      chatMessages.innerHTML = `<div class="messages-start-label">Start of conversation</div>`;

      data.initialMessages?.forEach(msg => appendMessage(msg.sender, msg.message));
      data.messages?.forEach(msg => appendMessage(msg.sender, msg.message));

      chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (err) {
      console.error("Load chat error", err);
    }
  }

  function appendMessage(sender, text) {
    const div = document.createElement("div");
    div.className = sender === myUsername ? "message taker" : "message giver";
    div.innerText = text;
    chatMessages.appendChild(div);
  }

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    try {
      const res = await fetch("https://api.adviceme.social/api/chat/send", {
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

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  chatHeader.onclick = async (e) => {
    if (e.target === backBtn || backBtn.contains(e.target)) return;
    if (!otherUsername) return;

    try {
      const profileRes = await fetch(`https://api.adviceme.social/api/profile/view/${otherUsername}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!profileRes.ok) return;

      const data = await profileRes.json();

      popupImg.src             = data.profile_image_url || "images/default.png";
      popupUsername.innerText  = data.username || otherUsername;
      popupExpertise.innerText = data.expertise ? `🎯 ${data.expertise}` : "";
      popupBio.innerText       = data.bio || (data.preference === "anonymous" ? "Anonymous user" : "No bio available");

      if (data.user_type === 'giver') {
        try {
          const badgeRes  = await fetch(`https://api.adviceme.social/api/badge/user/${otherUsername}`, {
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

  popupImg.onclick = (e) => {
    e.stopPropagation();
    enlargedImg.src = popupImg.src;
    enlargeOverlay.classList.remove("hidden");
  };

  enlargeOverlay.onclick = () => enlargeOverlay.classList.add("hidden");

  removeRecipientBtn.onclick = async () => {
    if (!adviceId) return;

    const confirmed = confirm(`Remove ${otherUsername} from this chat? This cannot be undone.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`https://api.adviceme.social/api/chat/remove/${adviceId}`, {
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

  closePopup.onclick = () => profileOverlay.classList.add("hidden");

  profileOverlay.onclick = (e) => {
    if (e.target === profileOverlay) profileOverlay.classList.add("hidden");
  };

  await loadChatList();
  await loadChat();

  if (adviceId && window.innerWidth <= 768) requestAnimationFrame(() => openChat());

  /* ================= ANDROID KEYBOARD FIX ================= */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }
});
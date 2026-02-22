document.addEventListener("DOMContentLoaded", () => {

  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return; }

  const showBtn       = document.getElementById("showPeople");
  const findTxt       = document.getElementById("findTxt");
  const peopleSection = document.getElementById("peopleSection");
  const modal         = document.getElementById("modalOverlay");
  const closeModal    = document.getElementById("closeModal");
  const userMessage   = document.getElementById("userMessage");
  const respondBtn    = document.getElementById("respondBtn");
  const removeBtn     = document.getElementById("removeBtn");
  const responseInput = document.getElementById("responseText");
  const respCharCount = document.getElementById("respCharCount");
  const modalMsg      = document.getElementById("modalMsg");

  const viewProfileBtn = document.getElementById("viewProfileBtn");
  const profileModal   = document.getElementById("profileModal");
  const closeProfile   = document.getElementById("closeProfile");
  const profileContent = profileModal.querySelector(".profile-content");

  const badgeBtn   = document.getElementById("badgeBtn");
  const badgeModal = document.getElementById("badgeModal");
  const badgeValue = document.getElementById("badgeValue");
  const closeBadge = document.getElementById("closeBadge");
  const chatBtn    = document.getElementById("chatBtn");

  let activePerson = null;

  /* ================= CHAR COUNTER ================= */
  if (responseInput && respCharCount) {
    responseInput.addEventListener("input", () => {
      const len = responseInput.value.length;
      respCharCount.textContent = len;
      if (len > 600) responseInput.value = responseInput.value.slice(0, 600);
    });
  }

  /* ================= LOAD GIVER STATS ================= */
  async function loadStats() {
    try {
      const res  = await fetch("adviceme-production.up.railway.app/api/badge/calculate", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const statResponded = document.getElementById("statResponded");
      const statBadge     = document.getElementById("statBadge");
      if (statResponded) statResponded.textContent = data.badge_points || 0;
      if (statBadge)     statBadge.textContent     = data.badge_icon  || "🌱";
    } catch { /* fail silently */ }
  }

  loadStats();

  /* ================= SHOW PEOPLE ================= */
  showBtn.onclick = async () => {
    const category = document.getElementById("category").value;
    if (!category) {
      showBtn.classList.add("shake");
      setTimeout(() => showBtn.classList.remove("shake"), 500);
      return;
    }

    showBtn.disabled = true;
    findTxt.textContent = "Loading...";

    try {
      const res  = await fetch(
        `adviceme-production.up.railway.app/api/requests/category/${encodeURIComponent(category)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      peopleSection.innerHTML = "";

      // Update subtitle
      const subtitle = document.getElementById("queueSubtitle");
      if (subtitle) subtitle.textContent = `Showing requests for: ${category}`;

      if (!data.length) {
        peopleSection.innerHTML = `
          <div class="empty-queue">
            <div class="eq-icon">🔍</div>
            <p>No pending requests</p>
            <span>There are currently no requests in the "${category}" category. Try another one.</span>
          </div>`;
        return;
      }

      data.forEach(req => {
        const div = document.createElement("div");
        div.className = "person";
        div.dataset.msg      = req.request_text;
        div.dataset.track    = req.track_id;
        div.dataset.category = req.category;
        div.dataset.username = req.username;
        div.dataset.urgency  = req.urgency || "low";

        const urgencyLabel = { high: "🔴 High", medium: "🟡 Medium", low: "🟢 Low" }[req.urgency] || "🟢 Low";

        div.innerHTML = `
          <div class="person-header">
            <div class="person-username">👤 ${req.username}</div>
            <div class="person-urgency ${req.urgency || 'low'}">${urgencyLabel}</div>
          </div>
          <div class="person-message">${req.request_text}</div>
          <div class="person-respond-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Click to respond
          </div>`;

        peopleSection.appendChild(div);
      });

    } catch (err) {
      console.error(err);
      peopleSection.innerHTML = `<div class="empty-queue"><div class="eq-icon">⚠️</div><p>Failed to load</p><span>Please try again.</span></div>`;
    } finally {
      showBtn.disabled = false;
      findTxt.textContent = "Browse Queue";
    }
  };

  /* ================= OPEN RESPONSE MODAL ================= */
  peopleSection.addEventListener("click", e => {
    const person = e.target.closest(".person");
    if (!person) return;
    activePerson  = person;
    userMessage.textContent = person.dataset.msg;
    responseInput.value = "";
    if (respCharCount) respCharCount.textContent = "0";
    modalMsg.className = "modal-msg";
    modal.classList.remove("hidden");
  });

  closeModal.onclick = () => { modal.classList.add("hidden"); activePerson = null; };
  modal.onclick = (e) => { if (e.target === modal) { modal.classList.add("hidden"); activePerson = null; } };

  /* ================= SKIP / REMOVE ================= */
  removeBtn.onclick = async () => {
    if (!activePerson) return;
    await fetch(
      `adviceme-production.up.railway.app/api/requests/remove/${activePerson.dataset.track}`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
    );
    activePerson.remove();
    modal.classList.add("hidden");
    activePerson = null;
  };

  /* ================= SEND ADVICE ================= */
  respondBtn.onclick = async () => {
    const text = responseInput.value.trim();
    if (!text) {
      showModalMsg("Please write your advice before sending.", "error");
      return;
    }

    respondBtn.disabled = true;
    respondBtn.innerHTML = `<span>Sending...</span>`;

    try {
      const res = await fetch("adviceme-production.up.railway.app/api/advice/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          track_id:    activePerson.dataset.track,
          category:    activePerson.dataset.category,
          advice_text: text
        })
      });

      if (!res.ok) {
        const d = await res.json();
        showModalMsg(d.message || "Failed to send. Try again.", "error");
        return;
      }

      showModalMsg("✅ Advice sent successfully!", "success");
      activePerson.remove();
      loadStats();

      setTimeout(() => {
        modal.classList.add("hidden");
        activePerson = null;
      }, 1200);

    } catch {
      showModalMsg("Server error. Please try again.", "error");
    } finally {
      respondBtn.disabled = false;
      respondBtn.innerHTML = `Send Advice <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    }
  };

  function showModalMsg(text, type) {
    modalMsg.textContent = text;
    modalMsg.className = "modal-msg " + type;
  }

  /* ================= BADGE HELPERS ================= */
  function getBadgeLevelName(points) {
    if (points >= 2000) return { level: "Legendary Advisor", icon: "👑" };
    if (points >= 1000) return { level: "Elite Advisor",     icon: "💎" };
    if (points >= 500)  return { level: "Expert Advisor",    icon: "🥇" };
    if (points >= 100)  return { level: "Trusted Advisor",   icon: "🥈" };
    if (points >= 10)   return { level: "Beginner Advisor",  icon: "🥉" };
    return                     { level: "Newcomer",          icon: "🌱" };
  }

  function getNextBadge(points) {
    const levels = [
      { min: 10,   label: "Beginner Advisor 🥉" },
      { min: 100,  label: "Trusted Advisor 🥈"  },
      { min: 500,  label: "Expert Advisor 🥇"   },
      { min: 1000, label: "Elite Advisor 💎"     },
      { min: 2000, label: "Legendary Advisor 👑" }
    ];
    return levels.find(l => l.min > points) || null;
  }

  /* ================= PROFILE MODAL ================= */
  viewProfileBtn.onclick = async () => {
    profileModal.classList.remove("hidden");
    profileContent.innerHTML = `<p style="color:rgba(255,255,255,0.6); text-align:center; padding:28px;">Loading...</p>`;

    try {
      const [profileRes, badgeRes] = await Promise.all([
        fetch("adviceme-production.up.railway.app/api/profile/me",      { headers: { Authorization: `Bearer ${token}` } }),
        fetch("adviceme-production.up.railway.app/api/badge/calculate", { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const data      = await profileRes.json();
      const badgeData = await badgeRes.json();

      if (data.preference === "anonymous") {
        profileContent.innerHTML = `
          <div class="profile-view">
            <div style="font-size:56px; margin-bottom:10px;">👤</div>
            <h2>Anonymous Profile</h2>
            <p class="username-tag">@${data.username}</p>
            <div class="profile-badge-row">
              <span>${badgeData.badge_icon}</span>
              <span>${badgeData.badge_level}</span>
              <span style="opacity:0.6;">· ${badgeData.badge_points} pts</span>
            </div>
            <div class="info-item" style="width:100%; text-align:center; margin-top:6px;">
              <div class="info-value" style="opacity:0.65; font-size:13px;">Your identity is hidden.</div>
            </div>
          </div>`;
        return;
      }

      renderProfileView(data, badgeData);
    } catch (err) {
      console.error(err);
      profileContent.innerHTML = `<p style="color:#ff8080; text-align:center;">Failed to load profile.</p>`;
    }
  };

  closeProfile.onclick = () => profileModal.classList.add("hidden");
  profileModal.onclick = (e) => { if (e.target === profileModal) profileModal.classList.add("hidden"); };

  function renderProfileView(data, badgeData) {
    profileContent.innerHTML = `
      <div class="profile-view">
        <div class="profile-avatar-wrap">
          <img src="${data.profile_image_url || 'images/default.png'}" alt="Profile" />
        </div>
        <h2>${data.username || 'Your Profile'}</h2>
        <p class="username-tag">Advice Giver</p>
        <div class="profile-badge-row">
          <span>${badgeData.badge_icon}</span>
          <span>${badgeData.badge_level}</span>
          <span style="opacity:0.6;">· ${badgeData.badge_points} pts</span>
        </div>
        <div class="profile-info-grid">
          <div class="info-item"><div class="info-label">Bio</div><div class="info-value">${data.bio || 'No bio added yet'}</div></div>
          <div class="info-item"><div class="info-label">Expertise</div><div class="info-value">${data.expertise || 'Not specified'}</div></div>
        </div>
        <button class="profile-edit-trigger" id="openEditBtn">✏️ Edit Profile</button>
        <p class="profile-message" id="profileMessage"></p>
      </div>`;
    document.getElementById("openEditBtn").onclick = () => renderProfileEdit(data, badgeData);
  }

  function renderProfileEdit(data, badgeData) {
    let newImageFile = null;
    profileContent.innerHTML = `
      <div class="profile-edit-form">
        <p class="edit-title">Edit Profile</p>
        <div style="display:flex; justify-content:center; margin-bottom:8px;">
          <div class="profile-avatar-wrap" id="avatarWrap" style="cursor:pointer;">
            <img id="editAvatar" src="${data.profile_image_url || 'images/default.png'}" alt="Profile" />
            <div class="avatar-edit-overlay visible">📷</div>
          </div>
        </div>
        <input type="file" id="picInput" accept="image/*" />
        <p style="text-align:center; font-size:12px; opacity:0.5; margin-top:-4px;">Click photo to change</p>
        <div><label class="form-label">Username</label><input type="text" id="editUsername" value="${data.username || ''}" placeholder="Username" /></div>
        <div><label class="form-label">Bio</label><textarea id="editBio" placeholder="Tell us about yourself...">${data.bio || ''}</textarea></div>
        <div><label class="form-label">Expertise</label><input type="text" id="editExpertise" value="${data.expertise || ''}" placeholder="e.g. Career, Finance, Relationships" /></div>
        <div class="edit-actions">
          <button class="btn-cancel-edit" id="cancelEditBtn">Cancel</button>
          <button class="btn-save" id="saveEditBtn">Save Changes</button>
        </div>
        <p class="profile-message" id="profileMessage"></p>
      </div>`;

    document.getElementById("avatarWrap").onclick = () => document.getElementById("picInput").click();
    document.getElementById("picInput").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      newImageFile = file;
      const reader = new FileReader();
      reader.onload = ev => { document.getElementById("editAvatar").src = ev.target.result; };
      reader.readAsDataURL(file);
    };
    document.getElementById("cancelEditBtn").onclick = () => renderProfileView(data, badgeData);
    document.getElementById("saveEditBtn").onclick = async () => {
      const newUsername  = document.getElementById("editUsername").value.trim();
      const newBio       = document.getElementById("editBio").value.trim();
      const newExpertise = document.getElementById("editExpertise").value.trim();
      const messageP     = document.getElementById("profileMessage");
      if (!newBio || !newExpertise) { messageP.textContent = "Bio and expertise are required."; return; }
      const formData = new FormData();
      formData.append("username",  newUsername);
      formData.append("bio",       newBio);
      formData.append("expertise", newExpertise);
      if (newImageFile) formData.append("profilePic", newImageFile);
      const resUpdate = await fetch("adviceme-production.up.railway.app/api/profile/update", {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData
      });
      const updateData = await resUpdate.json();
      if (!resUpdate.ok) { messageP.textContent = updateData.message || "Failed to update."; return; }
      renderProfileView({ ...data, username: newUsername || data.username, bio: newBio, expertise: newExpertise,
        profile_image_url: newImageFile ? document.getElementById("editAvatar").src : data.profile_image_url }, badgeData);
      setTimeout(() => { const msg = document.getElementById("profileMessage"); if (msg) msg.textContent = "✅ Profile updated!"; }, 50);
    };
  }

  /* ================= BADGE MODAL ================= */
  badgeBtn.onclick = async () => {
    badgeModal.classList.remove("hidden");
    badgeValue.innerHTML = `<p style="text-align:center; opacity:0.6; padding:20px;">Loading...</p>`;

    try {
      const res  = await fetch("adviceme-production.up.railway.app/api/badge/calculate", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      const allLevels = [
        { min: 0,    label: "Newcomer",          icon: "🌱" },
        { min: 10,   label: "Beginner Advisor",  icon: "🥉" },
        { min: 100,  label: "Trusted Advisor",   icon: "🥈" },
        { min: 500,  label: "Expert Advisor",    icon: "🥇" },
        { min: 1000, label: "Elite Advisor",     icon: "💎" },
        { min: 2000, label: "Legendary Advisor", icon: "👑" }
      ];

      const currentLevel = getBadgeLevelName(data.badge_points);
      const next         = getNextBadge(data.badge_points);
      const prevMin      = allLevels.slice().reverse().find(l => l.label === currentLevel.level)?.min || 0;
      const progress     = next ? Math.round(((data.badge_points - prevMin) / (next.min - prevMin)) * 100) : 100;

      const levelsHTML = allLevels.map(l => `
        <div class="badge-level-row ${l.label === currentLevel.level ? 'current' : ''}">
          <span>${l.icon}</span>
          <span>${l.label}</span>
          <span style="margin-left:auto; font-size:11px; opacity:0.5;">${l.min}+</span>
        </div>`).join("");

      badgeValue.innerHTML = `
        <div class="badge-big-icon">${data.badge_icon}</div>
        <div class="badge-level-name">${data.badge_level}</div>
        <div class="badge-points-count">${data.badge_points} badge points</div>
        <div class="badge-progress-wrap">
          <div class="badge-progress-label">
            <span>${prevMin} pts</span>
            <span>${next ? next.min + ' pts' : 'Max'}</span>
          </div>
          <div class="badge-progress-bar">
            <div class="badge-progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
        <div class="badge-next-info">${next ? `${next.min - data.badge_points} more points to reach ${next.label}` : '🏆 You have reached the maximum level!'}</div>
        <div class="badge-levels-grid">${levelsHTML}</div>`;

    } catch {
      badgeValue.innerHTML = `<p style="color:#ff8080; text-align:center;">Failed to load badge.</p>`;
    }
  };

  closeBadge.onclick = () => badgeModal.classList.add("hidden");
  badgeModal.onclick = (e) => { if (e.target === badgeModal) badgeModal.classList.add("hidden"); };

  /* ================= CHAT BUTTON ================= */
  if (chatBtn) {
    chatBtn.onclick = async () => {
      try {
        const res   = await fetch("adviceme-production.up.railway.app/api/chat/list", { headers: { Authorization: `Bearer ${token}` } });
        const chats = await res.json();
        if (!chats.length) { alert("No active chats yet."); return; }
        window.location.href = `chat.html?adviceId=${chats[0].advice_id}`;
      } catch { alert("Unable to open chats."); }
    };
  }

});
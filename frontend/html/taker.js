document.addEventListener("DOMContentLoaded", () => {

  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return; }

  const panel          = document.getElementById("profilePanel");
  const viewBtn        = document.getElementById("viewProfileBtn");
  const closeBtn       = document.getElementById("closeProfile");
  const profileContent = document.getElementById("profileContent");

  const PROFILE_API = "https://api.adviceme.social/api/profile";
  const REQUEST_API = "https://api.adviceme.social/api/requests";
  const ADVICE_API  = "https://api.adviceme.social/api/advice";

  const COOLDOWN_MS  = 30 * 60 * 1000;
  const COOLDOWN_KEY = "last_request_time";

  const chatBtn = document.getElementById("chatBtn");
  if (chatBtn) chatBtn.onclick = () => window.location.href = "chat.html";

  const formWrap     = document.getElementById("requestFormWrap");
  const cooldownWrap = document.getElementById("cooldownWrap");
  const cooldownTimer = document.getElementById("cooldownTimer");
  const cooldownBar   = document.getElementById("cooldownBar");
  let countdownInterval = null;

  function getRemainingMs() {
    const last = parseInt(localStorage.getItem(COOLDOWN_KEY) || "0");
    if (!last) return 0;
    const elapsed = Date.now() - last;
    return Math.max(0, COOLDOWN_MS - elapsed);
  }

  function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const secs = (totalSec % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function startCooldownUI(remainingMs) {
    formWrap.classList.add("hidden");
    cooldownWrap.classList.remove("hidden");
    clearInterval(countdownInterval);
    function tick() {
      const rem = getRemainingMs();
      if (rem <= 0) {
        clearInterval(countdownInterval);
        cooldownWrap.classList.add("hidden");
        formWrap.classList.remove("hidden");
        return;
      }
      cooldownTimer.textContent = formatTime(rem);
      const pct = rem / COOLDOWN_MS;
      cooldownBar.style.transform = `scaleX(${pct})`;
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  const remaining = getRemainingMs();
  if (remaining > 0) startCooldownUI(remaining);

  const requestText  = document.getElementById("requestText");
  const reqCharCount = document.getElementById("reqCharCount");
  if (requestText && reqCharCount) {
    requestText.addEventListener("input", () => {
      const len = requestText.value.length;
      reqCharCount.textContent = len;
      if (len > 500) requestText.value = requestText.value.slice(0, 500);
    });
  }

  const submitBtn = document.getElementById("submitRequest");
  const submitTxt = document.getElementById("submitTxt");
  const submitMsg = document.getElementById("submitMsg");

  submitBtn.onclick = async () => {
    const category  = document.getElementById("category").value;
    const urgencyEl = document.querySelector('input[name="urgency"]:checked');
    const urgency   = urgencyEl ? urgencyEl.value : "";
    const text      = requestText.value.trim();
    if (!category || !urgency || !text) {
      showSubmitMsg("Please fill in all fields before submitting.", "error");
      return;
    }
    submitBtn.disabled = true;
    submitTxt.textContent = "Sending...";
    try {
      const res = await fetch(`${REQUEST_API}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, urgency, request_text: text })
      });
      const data = await res.json();
      if (!res.ok) {
        showSubmitMsg(data.message || "Failed to submit request.", "error");
        submitBtn.disabled = false;
        submitTxt.textContent = "Send Request";
        return;
      }
      localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
      startCooldownUI(COOLDOWN_MS);
    } catch {
      showSubmitMsg("Server error. Please try again.", "error");
      submitBtn.disabled = false;
      submitTxt.textContent = "Send Request";
    }
  };

  function showSubmitMsg(text, type) {
    submitMsg.textContent = text;
    submitMsg.className = "submit-msg " + type;
    setTimeout(() => { submitMsg.className = "submit-msg"; }, 4000);
  }

  viewBtn.onclick = async () => {
    panel.classList.remove("hidden");
    profileContent.innerHTML = `<p style="color:rgba(255,255,255,0.6); text-align:center; padding:28px;">Loading...</p>`;
    try {
      const res = await fetch(`${PROFILE_API}/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { profileContent.innerHTML = `<p style="color:#ff8080; text-align:center;">Failed to load profile.</p>`; return; }
      const data = await res.json();
      if (data.preference === "anonymous") {
        profileContent.innerHTML = `<div class="profile-view"><div style="font-size:56px; margin-bottom:10px;">👤</div><h2>Anonymous Profile</h2><p class="username-tag">@${data.username}</p><div class="info-item" style="width:100%; margin-top:10px; text-align:center;"><div class="info-value" style="opacity:0.65; font-size:13px;">Your identity is hidden.</div></div><button class="profile-logout-btn" id="logoutBtn" style="margin-top:14px; width:100%;">🚪 Logout</button></div>`;
        document.getElementById("logoutBtn").onclick = () => { localStorage.removeItem("token"); localStorage.removeItem("user_type"); window.location.href = "login.html"; };
        return;
      }
      renderProfileView(data);
    } catch (err) {
      console.error(err);
      profileContent.innerHTML = `<p style="color:#ff8080; text-align:center;">Failed to load profile.</p>`;
    }
  };

  closeBtn.onclick = () => panel.classList.add("hidden");
  panel.onclick = (e) => { if (e.target === panel) panel.classList.add("hidden"); };

  function renderProfileView(data) {
    profileContent.innerHTML = `
      <div class="profile-view">
        <div class="profile-avatar-wrap">
          <img id="profileAvatar" src="${data.profile_image_url || 'images/default.png'}" alt="Profile" />
        </div>
        <h2>${data.username || 'Your Profile'}</h2>
        <div class="profile-info-grid">
          <div class="info-item">
            <div class="info-label">Bio</div>
            <div class="info-value">${data.bio || 'No bio added yet'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Hobbies</div>
            <div class="info-value">${data.expertise || 'No hobbies added yet'}</div>
          </div>
        </div>
        <button class="profile-edit-trigger" id="openEditBtn">✏️ Edit Profile</button>
        <button class="profile-logout-btn" id="logoutBtn">🚪 Logout</button>
        <p class="profile-message" id="profileMessage"></p>
      </div>`;
    document.getElementById("openEditBtn").onclick = () => renderProfileEdit(data);
    document.getElementById("logoutBtn").onclick = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user_type");
      window.location.href = "login.html";
    };
  }

  function renderProfileEdit(data) {
    let newImageFile = null;
    profileContent.innerHTML = `
      <div class="profile-edit-form">
        <p class="edit-title">Edit Profile</p>
        <div style="display:flex; justify-content:center; margin-bottom:8px;">
          <div class="profile-avatar-wrap" id="avatarWrap" style="cursor:pointer;" title="Click to change photo">
            <img id="editAvatar" src="${data.profile_image_url || 'images/default.png'}" alt="Profile" />
            <div class="avatar-edit-overlay visible">📷</div>
          </div>
        </div>
        <input type="file" id="picInput" accept="image/*" />
        <p style="text-align:center; font-size:12px; opacity:0.5; margin-top:-4px;">Click photo to change</p>
        <div><label class="form-label">Username</label><input type="text" id="editUsername" value="${data.username || ''}" placeholder="Username" /></div>
        <div><label class="form-label">Bio</label><textarea id="editBio" placeholder="Tell us about yourself...">${data.bio || ''}</textarea></div>
        <div><label class="form-label">Hobbies</label><input type="text" id="editHobbies" value="${data.expertise || ''}" placeholder="e.g. Reading, Cooking, Gaming" /></div>
        <div class="edit-actions">
          <button class="btn-cancel-edit" id="cancelEditBtn">Cancel</button>
          <button class="btn-save" id="saveEditBtn">Save Changes</button>
        </div>
        <p class="profile-message" id="profileMessage"></p>
      </div>`;
    document.getElementById("avatarWrap").onclick = () => document.getElementById("picInput").click();
    document.getElementById("picInput").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      newImageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => { document.getElementById("editAvatar").src = ev.target.result; };
      reader.readAsDataURL(file);
    };
    document.getElementById("cancelEditBtn").onclick = () => renderProfileView(data);
    document.getElementById("saveEditBtn").onclick = async () => {
      const newUsername = document.getElementById("editUsername").value.trim();
      const newBio      = document.getElementById("editBio").value.trim();
      const newHobbies  = document.getElementById("editHobbies").value.trim();
      const messageP    = document.getElementById("profileMessage");
      if (!newBio || !newHobbies) { messageP.textContent = "Bio and hobbies are required."; return; }
      const formData = new FormData();
      formData.append("username",  newUsername);
      formData.append("bio",       newBio);
      formData.append("expertise", newHobbies);
      if (newImageFile) formData.append("profilePic", newImageFile);
      const resUpdate = await fetch(`${PROFILE_API}/update`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData
      });
      const updateData = await resUpdate.json();
      if (!resUpdate.ok) { messageP.textContent = updateData.message || "Failed to update."; return; }
      renderProfileView({ ...data, username: newUsername || data.username, bio: newBio, expertise: newHobbies,
        profile_image_url: newImageFile ? document.getElementById("editAvatar").src : data.profile_image_url });
      setTimeout(() => { const msg = document.getElementById("profileMessage"); if (msg) msg.textContent = "✅ Profile updated!"; }, 50);
    };
  }

  const chatContainer = document.getElementById("chatContainer");
  const actionModal   = document.getElementById("actionModal");
  let selectedAdviceId = null;
  let selectedCard     = null;

  async function loadMyAdvice() {
    const res = await fetch(`${ADVICE_API}/my`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    chatContainer.innerHTML = "";
    if (!data.length) {
      chatContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">💭</div><p>No advice yet</p><span>Once someone responds, it will appear here.</span></div>`;
      return;
    }
    data.forEach(item => {
      const card = document.createElement("div");
      card.className = "conversation-card";
      card.innerHTML = `<h4>${item.category.toUpperCase()}</h4><p><strong>You:</strong> ${item.request_text}</p><p><strong>Advice:</strong> ${item.advice_text}</p><span class="giver-name">— ${item.giver_username}</span>`;
      card.onclick = () => { selectedAdviceId = item.id; selectedCard = card; actionModal.classList.remove("hidden"); };
      chatContainer.appendChild(card);
    });
  }

  async function handleAction(action) {
    if (!selectedAdviceId) return;
    if (action !== "cancel") {
      const res = await fetch(`${ADVICE_API}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ adviceId: selectedAdviceId, action })
      });
      if (!res.ok) { alert("Action already applied"); actionModal.classList.add("hidden"); return; }
    }
    if (action !== "cancel" && selectedCard) selectedCard.remove();
    actionModal.classList.add("hidden");
    if (action === "continue") window.location.href = `chat.html?adviceId=${selectedAdviceId}`;
    selectedAdviceId = null; selectedCard = null;
  }

  document.getElementById("reportBtn").onclick   = () => handleAction("report");
  document.getElementById("endBtn").onclick      = () => handleAction("end");
  document.getElementById("continueBtn").onclick = () => handleAction("continue");
  document.getElementById("cancelBtn").onclick   = () => handleAction("cancel");
  actionModal.onclick = (e) => { if (e.target === actionModal) actionModal.classList.add("hidden"); };

  loadMyAdvice();
});
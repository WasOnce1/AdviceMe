const profilePic  = document.getElementById("profilePic");
const avatarRing  = document.getElementById("avatarRing");
const avatarInner = document.getElementById("avatar");
const form        = document.getElementById("profileForm");
const bioInput    = document.getElementById("bio");
const charCount   = document.getElementById("charCount");

// ✅ Check if user came from discuss page
const redirectParam = new URLSearchParams(window.location.search).get("redirect");
const cameFromDiscuss = redirectParam === "discuss";

/* ================= STEP NAVIGATION ================= */
function goToStep(n) {
  document.querySelectorAll('.step-view').forEach(v => v.classList.remove('active'));
  document.getElementById('view' + n).classList.add('active');

  const items = document.querySelectorAll('.step-item');
  items.forEach((item, i) => {
    item.classList.remove('active', 'done');
    if (i + 1 < n)   item.classList.add('done');
    if (i + 1 === n) item.classList.add('active');
  });
}

document.getElementById('toStep2').onclick     = () => goToStep(2);
document.getElementById('skipPhoto').onclick   = () => goToStep(2);
document.getElementById('backToStep1').onclick = () => goToStep(1);

/* ================= AVATAR UPLOAD PREVIEW ================= */
avatarRing.addEventListener("click", () => profilePic.click());

profilePic.addEventListener("change", () => {
  const file = profilePic.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    avatarInner.style.backgroundImage    = `url(${e.target.result})`;
    avatarInner.style.backgroundSize     = "cover";
    avatarInner.style.backgroundPosition = "center";
    avatarInner.innerHTML                = "";
  };
  reader.readAsDataURL(file);
});

/* ================= CHAR COUNTER ================= */
if (bioInput && charCount) {
  bioInput.addEventListener("input", () => {
    const len = bioInput.value.length;
    charCount.textContent = len;
    if (len > 200) bioInput.value = bioInput.value.slice(0, 200);
  });
}

/* ================= CHECK PROFILE ON LOAD ================= */
document.addEventListener("DOMContentLoaded", async () => {
  const token    = localStorage.getItem("token");
  const userType = localStorage.getItem("user_type");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const res = await fetch("https://api.adviceme.social/api/profile/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const profile = await res.json();

      // ✅ If profile is auto-created (no bio/expertise yet), let them complete it
      // Only skip to dashboard if profile is fully completed
      const isComplete = profile.bio && profile.expertise;

      if (isComplete) {
        if (cameFromDiscuss) {
          window.location.href = "discuss.html";
        } else {
          window.location.href = userType === "giver" ? "giver.html" : "taker.html";
        }
        return;
      }

      // Profile exists but incomplete (auto-created) — show the form
      // Pre-fill username field with what we have
      document.body.classList.add("ready");
      setTimeout(() => {
        const unameField = document.getElementById("username");
        if (unameField && profile.username) unameField.value = profile.username;
      }, 100);
      return;
    }

    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "login.html";
      return;
    }

    // 404 = no profile yet → show the page
    document.body.classList.add("ready");

  } catch (err) {
    console.error("Profile check error:", err);
    document.body.classList.add("ready");
  }
});

/* ================= CREATE PROFILE ================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "login.html"; return; }

  const username  = document.getElementById("username").value.trim();
  const bio       = document.getElementById("bio").value.trim();
  const expertise = document.getElementById("expertise").value.trim();
  const file      = profilePic.files[0];

  if (!username || !bio || !expertise) {
    showError("All fields are required.");
    return;
  }

  const btn = document.getElementById("submitBtn");
  const txt = document.getElementById("submitText");
  btn.disabled    = true;
  txt.textContent = "Creating...";

  const formData = new FormData();
  formData.append("username",  username);
  formData.append("bio",       bio);
  formData.append("expertise", expertise);
  if (file) formData.append("profilePic", file);

  try {
    const res = await fetch("https://api.adviceme.social/api/profile/create", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    formData
    });

    const data = await res.json();

    if (res.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "login.html";
      return;
    }

    if (!res.ok) {
      showError(data.message || "Profile creation failed.");
      btn.disabled    = false;
      txt.textContent = "Create Profile ✨";
      return;
    }

    // Mark step 3 done visually
    document.querySelectorAll('.step-item').forEach(i => i.classList.remove('active'));
    document.querySelector('#si3').classList.add('active');

    // ✅ Redirect: back to discuss if came from there, otherwise giver/taker
    const userType = localStorage.getItem("user_type");
    setTimeout(() => {
      if (cameFromDiscuss) {
        window.location.href = "discuss.html";
      } else {
        window.location.href = userType === "giver" ? "giver.html" : "taker.html";
      }
    }, 600);

  } catch (err) {
    console.error("Profile create error:", err);
    showError("Server error. Please try again.");
    btn.disabled    = false;
    txt.textContent = "Create Profile ✨";
  }
});

/* ================= ERROR DISPLAY ================= */
function showError(msg) {
  let el = document.getElementById("formError");
  if (!el) {
    el = document.createElement("p");
    el.id = "formError";
    el.style.cssText = `
      color: #ff9090; font-size: 13px;
      background: rgba(255,60,60,0.12);
      border: 1px solid rgba(255,60,60,0.25);
      border-radius: 10px; padding: 10px 14px;
      margin-top: 10px; text-align: center;
    `;
    document.getElementById("submitBtn").insertAdjacentElement("afterend", el);
  }
  el.textContent = msg;
}
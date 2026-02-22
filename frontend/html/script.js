const container  = document.getElementById('container');
const API        = "adviceme-production.up.railway.app/api/auth";

/* ========== PANEL TOGGLE ========== */
document.getElementById('goSignUp').onclick = () => container.classList.add("active");
document.getElementById('goSignIn').onclick  = () => container.classList.remove("active");

/* ========== MSG HELPER ========== */
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg-box ' + type;
}

function clearMsg(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.className = 'msg-box';
}

/* ========== SIGNUP ========== */
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg('signupMsg');

  const btn = document.getElementById('signupBtn');
  const txt = document.getElementById('signupBtnText');
  btn.disabled = true;
  txt.textContent = 'Creating account...';

  const data = {
    email:      document.getElementById('signupEmail').value,
    password:   document.getElementById('signupPassword').value,
    user_type:  document.getElementById('userType').value,
    preference: document.getElementById('preference').value
  };

  try {
    const res    = await fetch(`${API}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.status === 201) {
      showMsg('signupMsg', '✅ Account created! Signing you in...', 'success');
      setTimeout(() => {
        container.classList.remove("active");
        clearMsg('signupMsg');
        document.getElementById('loginEmail').value = data.email;
      }, 1200);
    } else {
      showMsg('signupMsg', result.message || 'Signup failed.', 'error');
    }
  } catch {
    showMsg('signupMsg', 'Server error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    txt.textContent = 'Create Account';
  }
});

/* ========== LOGIN ========== */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg('loginMsg');

  const btn = document.getElementById('loginBtn');
  const txt = document.getElementById('loginBtnText');
  btn.disabled = true;
  txt.textContent = 'Signing in...';

  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:    document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showMsg('loginMsg', data.message || 'Invalid credentials.', 'error');
      btn.disabled = false;
      txt.textContent = 'Sign In';
      return;
    }

    localStorage.setItem("token",      data.token);
    localStorage.setItem("user_type",  data.user_type);
    localStorage.setItem("preference", data.preference);

    showMsg('loginMsg', '✅ Welcome back!', 'success');

    setTimeout(() => {
      if (data.preference === "anonymous") {
        window.location.href = data.user_type === "giver" ? "giver.html" : "taker.html";
        return;
      }
      if (data.preference === "non_anonymous") {
        if (data.profile_created === 0) {
          window.location.href = "create-profile.html";
        } else {
          window.location.href = data.user_type === "giver" ? "giver.html" : "taker.html";
        }
      }
    }, 800);

  } catch {
    showMsg('loginMsg', 'Server error. Please try again.', 'error');
    btn.disabled = false;
    txt.textContent = 'Sign In';
  }
});
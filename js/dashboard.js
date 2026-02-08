/* Section: js/dashboard.js — Dashboard page UI and logic */



(function(){
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function tr(key, vars){
    // Wrapper around global t()/tr(): prefer t() with vars, no hardcoded fallbacks
    try {
      if (typeof window.t === "function") {
        var v = window.t(key, vars);
        return (v && v !== key) ? v : String(key || "");
      }
      if (typeof window.tr === "function") {
        // window.tr(key, fallback, vars)
        var v2 = window.tr(key, null, vars);
        return (v2 && v2 !== key) ? v2 : String(key || "");
      }
      return String(key || "");
    } catch (_) { return String(key || ""); }
  }

  function setMsg(text, kind){
    const el = qs("#dashMsg");
    if (!el) return;
    el.textContent = String(text || "");
    el.classList.remove("ok","error");
    if (kind) el.classList.add(kind);
    el.style.display = text ? "block" : "none";
  }

  function getAllowedIcons(){
    
    
    const raw = (window.ZIconManifest && Array.isArray(window.ZIconManifest)) ? window.ZIconManifest : null;
    const fb = [];
    fb.push("assets/icons/users/user.svg");
    for (let i=1;i<=10;i++) fb.push("assets/icons/users/user"+i+".svg");

    const list = (raw && raw.length) ? raw : fb;
    const out = [];
    const seen = new Set();
    for (const p of list){
      const s = String(p || "").trim();
      if (!s) continue;
      
      if (!/^assets\/icons\/users\/[a-z0-9._-]+\.(svg|png)$/i.test(s)) continue;
      if (s.includes("..")) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out.length ? out : fb;
  }

  function normalizeLegacyIcon(p){
    const s = String(p || "").trim();
    if (/^assets\/icons\/usre1\.svg$/i.test(s)) return "assets/icons/users/user1.svg";
    
    const m = s.match(/^assets\/icons\/user(\d{1,2})\.svg$/i);
    if (m) return `assets/icons/users/user${m[1]}.svg`;
    if (/^assets\/icons\/user\.svg$/i.test(s)) return "assets/icons/users/user.svg";
    return s;
  }

  function sanitizeIconPath(p){
    const s = normalizeLegacyIcon(p);
    const allowed = getAllowedIcons();
    if (allowed.includes(s)) return s;
    
    if (allowed.includes("assets/icons/users/user1.svg")) return "assets/icons/users/user1.svg";
    return allowed[0] || "assets/icons/users/user1.svg";
  }

  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fmt(v){
    const n = num(v);
    if (n == null) return "—";
    return String(n);
  }

  function ensureRegisteredSession(){
    // Session is NOT trusted alone; require an active non-anonymous Firebase Auth user.
    try { if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase(); } catch (_) {}

    let u = null;
    try {
      if (window.firebase && firebase.auth) u = firebase.auth().currentUser;
    } catch (_) {}
    if (!u || !u.uid || u.isAnonymous) return null;

    const s = (window.ZAuth && ZAuth.readSession) ? ZAuth.readSession() : null;

    // If session is missing/mismatched, rebuild a minimal one aligned to auth.uid.
    if (!s || s.kind !== "registered" || !s.uid || String(s.uid) !== String(u.uid)) {
      try {
        const now = Date.now();
        const icon = (s && s.icon) ? s.icon : "assets/icons/users/user1.svg";
        const nick = (s && s.nickname) ? s.nickname : "";
        if (window.ZAuth && typeof ZAuth.writeSession === "function") {
          ZAuth.writeSession({
            kind: "registered",
            uid: String(u.uid),
            authUid: String(u.uid),
            email: u.email || "",
            nickname: nick,
            icon: icon,
            createdAt: now,
            lastActiveAt: now
          });
        }
      } catch (_) {}
      const s2 = (window.ZAuth && ZAuth.readSession) ? ZAuth.readSession() : null;
      return s2 && s2.kind === "registered" && s2.uid ? s2 : { kind:"registered", uid:String(u.uid), email:(u.email||"") };
    }

    return s;
  }


  function updateTable(stats){
    const s = stats || {};
    
    const total = (num(s.totalGames) != null) ? num(s.totalGames) : num(s.played);
    const points = (num(s.points) != null) ? num(s.points) : null;
    const rank = (num(s.globalRank) != null) ? num(s.globalRank) : (num(s.rank) != null ? num(s.rank) : null);

    
    const humW = num(s.vsHumansWins);
    const humD = num(s.vsHumansDraws);
    const humL = num(s.vsHumansLosses);

    const cpuW = num(s.vsComputerWins);
    const cpuD = num(s.vsComputerDraws);
    const cpuL = num(s.vsComputerLosses);

    qs("#statTotalGames").textContent = fmt(total);
    qs("#statPoints").textContent = fmt(points);
    qs("#statRank").textContent = fmt(rank);

    qs("#statHumWins").textContent = fmt(humW);
    qs("#statHumDraws").textContent = fmt(humD);
    qs("#statHumLosses").textContent = fmt(humL);

    qs("#statCpuWins").textContent = fmt(cpuW);
    qs("#statCpuDraws").textContent = fmt(cpuD);
    qs("#statCpuLosses").textContent = fmt(cpuL);
  }

  
  // GlobalRank computation per spec 3.0.2.8:
  // Order: higher points, higher wins, lower losses, then newer activity as final tie-breaker.
  function _lbNum(v){ return (typeof v === "number" && isFinite(v)) ? v : 0; }
  function _lbPad(n, w){ return String(Math.max(0, Math.floor(n))).padStart(w, "0"); }
  function _lbInv(n, max){ return (max - Math.max(0, Math.floor(n))); }
  function _lbSortKey(uid, points, wins, losses, lastActivity){
    const MAX_P = 999999999;
    const MAX_W = 999999999;
    const MAX_T = 9999999999999;
    const p = Math.min(_lbNum(points), MAX_P);
    const w = Math.min(_lbNum(wins), MAX_W);
    const l = Math.min(_lbNum(losses), 999999999);
    const t = Math.min(Math.max(0, Math.floor(_lbNum(lastActivity))), MAX_T);

    const invP = _lbInv(p, MAX_P);
    const invW = _lbInv(w, MAX_W);
    const invT = _lbInv(t, MAX_T);

    return (
      _lbPad(invP, 9) + "_" +
      _lbPad(invW, 9) + "_" +
      _lbPad(l, 9) + "_" +
      _lbPad(invT, 13) + "_" +
      String(uid)
    );
  }

  async function _ensureLeaderboardAndGlobalRank(db, uid, stats){
    if (!db || !uid) return;

    const s = stats || {};
    const points = _lbNum(s.points);
    const wins = _lbNum(s.wins);
    const losses = _lbNum(s.losses);
    const lastActivity = _lbNum(s.updatedAt) || _lbNum(s.lastActiveAt) || Date.now();
    const sortKey = _lbSortKey(uid, points, wins, losses, lastActivity);

    // Best-effort upsert of leaderboard entry
    try {
      await db.ref("leaderboardV1").child(String(uid)).update({
        points: points,
        wins: wins,
        losses: losses,
        lastActivity: lastActivity,
        sortKey: sortKey,
      });
    } catch (e) {}

    // Compute rank by enumerating ordered leaderboard
    let rank = null;
    try {
      const snap = await db.ref("leaderboardV1").orderByChild("sortKey").once("value");
      let i = 0;
      snap.forEach(function(child){
        i++;
        if (child && child.key === String(uid)) rank = i;
      });
    } catch (e) {}

    if (rank != null) {
      try { qs("#statRank").textContent = fmt(rank); } catch (e) {}
      // Persist for later fast display (optional, per implementation flexibility)
      try { await db.ref("profiles").child(String(uid)).child("stats").child("globalRank").set(rank); } catch (e) {}
    }
  }

async function load(uid){
    setMsg("", "");
    try {
      if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase();
      const db = firebase.database();
      const statsSnap = await db.ref("profiles").child(uid).child("stats").once("value");
      const stats = (statsSnap && statsSnap.val) ? statsSnap.val() : null;
      updateTable(stats || {});
      await _ensureLeaderboardAndGlobalRank(db, uid, stats || {});
    } catch (e) {
      setMsg(tr("auth.msgNetwork"), "error");
    }
  }

  function openEditNickname(session){
    const body = document.createElement("div");
    body.className = "z-form";
    const row = document.createElement("div");
    row.className = "z-form-row";
    const lab = document.createElement("label");
    lab.textContent = tr("auth.nickname");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = "dashNickInput";
    inp.value = session.nickname || "";
    inp.maxLength = 18;
    row.appendChild(lab);
    row.appendChild(inp);
    body.appendChild(row);

    Modal.open({
      title: tr("dashboard.editNick"),
      body,
      focusSelector: "#dashNickInput",
      buttons: [
        { label: tr("auth.save"), className: "primary", onClick: async function(){
            const v = String(inp.value || "").trim();
            if (v.length < 2 || v.length > 18) { setMsg(tr("auth.msgInvalid"), "error"); return; }
            try {
              const uid = session.uid;
              const db = firebase.database();
              await db.ref("profiles").child(uid).update({ nickname: v, updatedAt: Date.now() });
              const next = Object.assign({}, session, { nickname: v, lastActiveAt: Date.now() });
              ZAuth.writeSession(next);
              setMsg(tr("auth.msgSaved"), "ok");
              Modal.close();
            } catch (e) {
              setMsg(tr("auth.msgNetwork"), "error");
            }
        }},
        { label: tr("actions.cancel"), className: "ghost", onClick: function(){ Modal.close(); } }
      ]
    });
  }

  async function reauthPasswordProvider(user, currentPassword){
    const email = user.email || "";
    const cred = firebase.auth.EmailAuthProvider.credential(email, String(currentPassword || ""));
    await user.reauthenticateWithCredential(cred);
  }

  function openEditEmail(session){
    const body = document.createElement("div");
    body.className = "z-form";
    const row1 = document.createElement("div");
    row1.className = "z-form-row";
    const lab1 = document.createElement("label");
    lab1.textContent = tr("auth.email");
    const inpEmail = document.createElement("input");
    inpEmail.type = "email";
    inpEmail.id = "dashEmailInput";
    inpEmail.value = session.email || "";
    row1.appendChild(lab1); row1.appendChild(inpEmail);

    const row2 = document.createElement("div");
    row2.className = "z-form-row";
    const lab2 = document.createElement("label");
    lab2.textContent = tr("auth.password");
    const inpPass = document.createElement("input");
    inpPass.type = "password";
    inpPass.id = "dashCurPass";
    inpPass.placeholder = "••••••••";
    row2.appendChild(lab2); row2.appendChild(inpPass);

    body.appendChild(row1);
    body.appendChild(row2);

    Modal.open({
      title: tr("dashboard.editEmail"),
      body,
      focusSelector: "#dashEmailInput",
      buttons: [
        { label: tr("auth.save"), className: "primary", onClick: async function(){
            const nextEmail = String(inpEmail.value || "").trim();
            if (!nextEmail || !nextEmail.includes("@")) { setMsg(tr("auth.msgInvalid"), "error"); return; }
            try {
              if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase();
              const user = firebase.auth().currentUser;
              if (!user || user.isAnonymous) { location.href = "../index.html"; return; }

              const providerIds = (user.providerData || []).map(p=>p && p.providerId).filter(Boolean);
              if (providerIds.includes("password")) {
                await reauthPasswordProvider(user, inpPass.value || "");
              } else if (providerIds.includes("google.com")) {
                setMsg(tr("auth.msgPopupBlocked"), "error");
                return;
              }

              await user.updateEmail(nextEmail);
              
              await firebase.database().ref("profiles").child(user.uid).update({ email: nextEmail, updatedAt: Date.now() });
              const next = Object.assign({}, session, { email: nextEmail, lastActiveAt: Date.now() });
              ZAuth.writeSession(next);
              setMsg(tr("auth.msgSaved"), "ok");
              Modal.close();
            } catch (e) {
              const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
              if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) setMsg(tr("auth.msgInvalid"), "error");
              else if (code.includes("auth/requires-recent-login")) setMsg(tr("auth.msgPopupBlocked"), "error");
              else setMsg(tr("auth.msgNetwork"), "error");
            }
        }},
        { label: tr("actions.cancel"), className: "ghost", onClick: function(){ Modal.close(); } }
      ]
    });
  }

  function openEditPassword(session){
    const body = document.createElement("div");
    body.className = "z-form";

    const r1 = document.createElement("div"); r1.className="z-form-row";
    const l1 = document.createElement("label"); l1.textContent = tr("dashboard.password.currentLabel");
    const p1 = document.createElement("input"); p1.type="password"; p1.id="dashOldPass"; p1.placeholder="••••••••";
    r1.appendChild(l1); r1.appendChild(p1);

    const r2 = document.createElement("div"); r2.className="z-form-row";
    const l2 = document.createElement("label"); l2.textContent = tr("dashboard.password.newLabel");
    const p2 = document.createElement("input"); p2.type="password"; p2.id="dashNewPass"; p2.placeholder="••••••••";
    r2.appendChild(l2); r2.appendChild(p2);

    const r3 = document.createElement("div"); r3.className="z-form-row";
    const l3 = document.createElement("label"); l3.textContent = tr("auth.password2");
    const p3 = document.createElement("input"); p3.type="password"; p3.id="dashNewPass2"; p3.placeholder="••••••••";
    r3.appendChild(l3); r3.appendChild(p3);

    body.appendChild(r1); body.appendChild(r2); body.appendChild(r3);

    Modal.open({
      title: tr("dashboard.editPass"),
      body,
      focusSelector: "#dashOldPass",
      buttons: [
        { label: tr("auth.save"), className: "primary", onClick: async function(){
            const oldP = String(p1.value||"");
            const newP = String(p2.value||"");
            const newP2 = String(p3.value||"");
            if (newP.length < 6 || newP !== newP2) { setMsg(tr("auth.msgInvalid"), "error"); return; }
            try {
              if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase();
              const user = firebase.auth().currentUser;
              if (!user || user.isAnonymous) { location.href = "../index.html"; return; }

              const providerIds = (user.providerData || []).map(p=>p && p.providerId).filter(Boolean);
              if (!providerIds.includes("password")) {
                setMsg(tr("dashboard.password.googleNotSupported"), "error");
                return;
              }

              await reauthPasswordProvider(user, oldP);
              await user.updatePassword(newP);
              setMsg(tr("auth.msgSaved"), "ok");
              Modal.close();
            } catch (e) {
              const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
              if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) setMsg(tr("dashboard.password.oldWrong"), "error");
              else if (code.includes("auth/weak-password")) setMsg(tr("dashboard.password.weak"), "error");
              else if (code.includes("auth/requires-recent-login")) setMsg(tr("dashboard.password.recentLogin"), "error");
              else setMsg(tr("auth.msgNetwork"), "error");
            }
        }},
        { label: tr("actions.cancel"), className: "ghost", onClick: function(){ Modal.close(); } }
      ]
    });
  }

  function openEditIcon(session){
    const body = document.createElement("div");
    body.className = "z-icon-picker";

    const wrap = document.createElement("div");
    wrap.className = "z-icon-grid";

    const cur = sanitizeIconPath(session.icon);
    const icons = getAllowedIcons();

    icons.forEach(function(p){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "z-icon-item" + (p === cur ? " active" : "");
      btn.setAttribute("data-path", p);
      const img = document.createElement("img");
      img.src = "../" + p;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      btn.appendChild(img);
      btn.addEventListener("click", function(){
        qsa(".z-icon-item", wrap).forEach(function(x){ x.classList.remove("active"); });
        btn.classList.add("active");
      });
      wrap.appendChild(btn);
    });

    body.appendChild(wrap);

    Modal.open({
      title: tr("dashboard.editIcon"),
      body,
      buttons: [
        { label: tr("auth.save"), className: "primary", onClick: async function(){
            const active = qs(".z-icon-item.active", wrap);
            const chosen = sanitizeIconPath(active ? active.getAttribute("data-path") : cur);
            try {
              if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase();
              const user = firebase.auth().currentUser;
              if (!user || user.isAnonymous) { location.href = "../index.html"; return; }
              await firebase.database().ref("profiles").child(user.uid).update({ icon: chosen, updatedAt: Date.now() });
              const next = Object.assign({}, session, { icon: chosen, lastActiveAt: Date.now() });
              ZAuth.writeSession(next);
              setMsg(tr("auth.msgSaved"), "ok");
              Modal.close();
            } catch (e) {
              setMsg(tr("auth.msgNetwork"), "error");
            }
        }},
        { label: tr("actions.cancel"), className: "ghost", onClick: function(){ Modal.close(); } }
      ]
    });
  }


  async function _removeUserData(uid){
    if (!uid) return { ok: true, failed: [] };
    const db = firebase.database();
    const tasks = [
      { path: "profiles", key: uid },
      { path: "leaderboardV1", key: uid },
      { path: "statsMarkersV1", key: uid },
      { path: "players", key: uid },
      { path: "invites", key: uid },
    ];

    const results = await Promise.all(tasks.map(async (t) => {
      try {
        await db.ref(t.path).child(String(t.key)).remove();
        return { path: t.path, ok: true };
      } catch (e) {
        return { path: t.path, ok: false, code: (e && (e.code || e.message)) ? String(e.code || e.message) : "unknown" };
      }
    }));

    const failed = results.filter(r => !r.ok);
    return { ok: failed.length === 0, failed };
  }

  function openDeleteAccount(session){
    const body = document.createElement("div");
    body.className = "z-form";

    const note = document.createElement("div");
    note.style.whiteSpace = "pre-wrap";
    note.style.marginBottom = "10px";
    note.textContent = tr("dashboard.delete.body");
    body.appendChild(note);

    const row = document.createElement("div");
    row.className = "z-form-row";
    const lab = document.createElement("label");
    lab.textContent = tr("dashboard.delete.passwordLabel");
    const inp = document.createElement("input");
    inp.type = "password";
    inp.id = "dashDelPass";
    inp.placeholder = "••••••••";
    row.appendChild(lab);
    row.appendChild(inp);
    body.appendChild(row);

    let busy = false;

    Modal.open({
      title: tr("dashboard.delete.title"),
      body,
      focusSelector: "#dashDelPass",
      buttons: [
        { label: tr("dashboard.delete.confirm"), className: "danger", onClick: async function(){
            if (busy) return;
            const pass = String(inp.value || "");
            if (!pass) { setMsg(tr("dashboard.delete.wrongPassword"), "error"); return; }

            try {
              if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase();
              const user = firebase.auth().currentUser;
              if (!user || user.isAnonymous) { location.href = "../index.html"; return; }

              const providerIds = (user.providerData || []).map(p=>p && p.providerId).filter(Boolean);
              if (!providerIds.includes("password")) {
                setMsg(tr("dashboard.delete.googleNotSupported"), "error");
                return;
              }

              busy = true;
              // Disable buttons while processing
              try { qsa("#modalFooterButtons button").forEach(b => b.disabled = true); } catch (_) {}

              await reauthPasswordProvider(user, pass);

              // Remove user-owned RTDB data first, then delete auth user.
              const delRes = await _removeUserData(user.uid);
              if (!delRes.ok) {
                setMsg(tr("dashboard.delete.failed"), "error");
                try { qsa("#modalFooterButtons button").forEach(b => b.disabled = false); } catch (_) {}
                busy = false;
                return;
              }

              await user.delete();

              try { if (window.ZAuth && typeof ZAuth.clearSession === "function") ZAuth.clearSession(); } catch (_) {}
              setMsg(tr("dashboard.delete.success"), "ok");
              Modal.close();
              location.href = "../index.html";
            } catch (e) {
              const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
              if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) setMsg(tr("dashboard.delete.wrongPassword"), "error");
              else if (code.includes("auth/requires-recent-login")) setMsg(tr("dashboard.delete.recentLogin"), "error");
              else setMsg(tr("auth.msgNetwork"), "error");
              try { qsa("#modalFooterButtons button").forEach(b => b.disabled = false); } catch (_) {}
              busy = false;
            }
        }},
        { label: tr("actions.cancel"), className: "ghost", onClick: function(){ Modal.close(); } }
      ]
    });
  }

  function bind(session){
    const bNick = qs("#btnEditNick");
    const bEmail = qs("#btnEditEmail");
    const bPass = qs("#btnEditPass");
    const bIcon = qs("#btnEditIcon");
    const bDel = qs("#btnDeleteAccount");

    if (bNick) bNick.addEventListener("click", function(){ openEditNickname(session); });
    if (bEmail) bEmail.addEventListener("click", function(){ openEditEmail(session); });
    if (bPass) bPass.addEventListener("click", function(){ openEditPassword(session); });
    if (bIcon) bIcon.addEventListener("click", function(){ openEditIcon(session); });
    if (bDel) bDel.addEventListener("click", function(){ openDeleteAccount(session); });
  }

  function init(){
    const s = ensureRegisteredSession();
    if (!s) { location.href = "../index.html"; return; }
    try { if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase(); } catch (_) {}
    bind(s);
    load(s.uid);

    
    setInterval(function(){ try { load(s.uid); } catch(_){} }, 15000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
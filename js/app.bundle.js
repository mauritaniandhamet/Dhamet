/* Section: js/app.bundle.js — Bundled application scripts */














(function(){
  const out = [
    "assets/icons/users/user.svg",
  ];
  for (let i = 1; i <= 10; i++) out.push(`assets/icons/users/user${i}.svg`);
  window.ZIconManifest = out;
})();




(function () {
  "use strict";

  const SESSION_KEY = "zamat.session.user.v1";
  const PERSIST_KEY = "zamat.session.user.persist.v1";
  const LANG_KEY = "zamat.lang";

const ICON_LS_KEY = "zamat.icon";


const NICK_LS_KEY = "zamat.nick";
const NICK_EXPLICIT_KEY = "zamat.nickExplicit";

const DEFAULT_ICON = "assets/icons/users/user1.svg";
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

  function nowMs(){ return Date.now(); }


function sanitizeUserIconPath(p){
  p = String(p || "").trim();
  if (!p) return DEFAULT_ICON;

  
  
  if (/^assets\/icons\/usre1\.svg$/i.test(p)) p = "assets/icons/user1.svg";
  
  if (/^assets\/icons\/user(\d{1,2})\.svg$/i.test(p)) {
    const m = p.match(/^assets\/icons\/user(\d{1,2})\.svg$/i);
    if (m) p = `assets/icons/users/user${m[1]}.svg`;
  }
  if (/^assets\/icons\/user\.svg$/i.test(p)) p = "assets/icons/users/user.svg";

  
  const m2 = p.match(/^assets\/icons\/users\/([a-z0-9_-]+\.(svg|png))$/i);
  if (!m2) return DEFAULT_ICON;
  return "assets/icons/users/" + m2[1];
}

function persistNickIcon(session){
  try {
    if (session && session.nickname) {
      
      try { sessionStorage.setItem(NICK_LS_KEY, String(session.nickname)); } catch {}
      try { sessionStorage.setItem(NICK_EXPLICIT_KEY, "1"); } catch {}
      
      try { localStorage.removeItem(NICK_LS_KEY); } catch {}
      try { localStorage.removeItem(NICK_EXPLICIT_KEY); } catch {}
    }
  } catch {}
  try {
    const ic = sanitizeUserIconPath(session && session.icon);
    if (ic) localStorage.setItem(ICON_LS_KEY, ic);
  } catch {}
}


  
  function withTimeout(promise, ms, errCode){
    ms = Number(ms || 0);
    if (!ms || ms < 1000) ms = 10000;
    return new Promise(function(resolve, reject){
      var done = false;
      var t = setTimeout(function(){
        if (done) return;
        done = true;
        var e = new Error(errCode || "timeout");
        e.code = errCode || "timeout";
        reject(e);
      }, ms);

      Promise.resolve(promise)
        .then(function(v){
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(v);
        })
        .catch(function(err){
          if (done) return;
          done = true;
          clearTimeout(t);
          reject(err);
        });
    });
  }

  function safeJSONParse(s){
    try { return JSON.parse(s); } catch { return null; }
  }

  function tr(key, fallbackOrVars, varsMaybe){
    // Wrapper around global t() that supports both (key, vars) and legacy (key, fallback, vars)
    var fallback = null;
    var vars = null;

    if (fallbackOrVars && typeof fallbackOrVars === "object" && !Array.isArray(fallbackOrVars)) {
      vars = fallbackOrVars;
    } else {
      fallback = fallbackOrVars;
      vars = varsMaybe;
    }

    try {
      var v = (typeof t === "function" ? t(key, vars) : null);
      if (!v || v === key) return (fallback != null ? fallback : String(key || ""));
      return v;
    } catch {
      return (fallback != null ? fallback : String(key || ""));
    }
  }

  function setDirFromLang(lang){
    const dir = (lang === "ar") ? "rtl" : "ltr";
    try {
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("dir", dir);
    } catch {}
  }

  function getSavedLang(){
    try { return localStorage.getItem(LANG_KEY) || "ar"; } catch { return "ar"; }
  }
  function setSavedLang(lang){
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }

  function readSession(){
    const raw = (function(){
      try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
    })();
    if (!raw) return null;
    const obj = safeJSONParse(raw);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  }

  
function writeSession(s){
  try {
    s = s || {};
    s.lastActiveAt = nowMs();
    
    if (s.icon) s.icon = sanitizeUserIconPath(s.icon);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}

  
  try { persistNickIcon(s); } catch {}
}


  function clearSession(){
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    try { localStorage.removeItem(PERSIST_KEY); } catch (_) {}
  }

  function isRegistered(s){ return s && s.kind === "registered"; }
  function isGuest(s){ return s && s.kind === "guest"; }

  function validateEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||"").trim());
  }

  function normalizeNick(n){
    n = String(n||"").trim();
    
    n = n.replace(/\s+/g, " ");
    return n;
  }
  function validateNick(n){
    n = normalizeNick(n);
    if (!n) return { ok:false, msg: tr("errors.nick.required") };
    if (n.length < 3) return { ok:false, msg: tr("errors.nick.tooShort") };
    if (n.length > 20) return { ok:false, msg: tr("errors.nick.tooLong") };
    if (!/^[\w\u0600-\u06FF][\w\u0600-\u06FF\s.-]*$/.test(n)) return { ok:false, msg: tr("errors.nick.invalid") };
    return { ok:true, nick:n };
  }

  function firebaseReady(){
    return !!(window.firebase && window.firebase.auth && window.firebase.database);
  }

  function initFirebase(){
    try {
      if (!firebaseReady()) return false;
      if (!firebase.apps || !firebase.apps.length) {
        const cfg = (window.firebaseConfig && typeof window.firebaseConfig === "object") ? window.firebaseConfig : null;
        if (!cfg) return false;
        firebase.initializeApp(cfg);
      }
      return true;
    } catch {
      return false;
    }
  }


  function syncSessionUidToAuth(authUid){
    try{
      authUid = String(authUid || "").trim();
      if (!authUid) return;
      const s = readSession();
      if (!s || typeof s !== "object") return;

      // Keep session kind; only align uid/authUid so RTDB paths always match auth.uid
      if (s.uid !== authUid) {
        if (isGuest(s)) {
          if (!s.guestLocalId) s.guestLocalId = s.uid;
          s.uid = authUid;
          s.authUid = authUid;
          s.lastActiveAt = nowMs();
          writeSession(s);
        } else if (isRegistered(s)) {
          s.uid = authUid;
          s.authUid = authUid;
          s.lastActiveAt = nowMs();
          writeSession(s);
        }
      } else if (!s.authUid) {
        s.authUid = authUid;
        s.lastActiveAt = nowMs();
        writeSession(s);
      }
    } catch (_) {}
  }


  async function ensureAnonymousAuth(){
    if (!initFirebase()) return null;
    const auth = firebase.auth();
    if (auth.currentUser) { try { syncSessionUidToAuth(auth.currentUser.uid); } catch (_) {} return auth.currentUser; }
    try {
      const res = await withTimeout(auth.signInAnonymously(), 12000, "auth-timeout");
      const u = (res && res.user) ? res.user : auth.currentUser;
      try { if (u && u.uid) syncSessionUidToAuth(u.uid); } catch (_) {}
      return u;
    } catch {
      return null;
    }
  }

  async function loginEmail(email, pass){
    if (!initFirebase()) throw new Error("firebase-unavailable");
    const auth = firebase.auth();
    const res = await withTimeout(auth.signInWithEmailAndPassword(email, pass), 12000, "auth-timeout");
    return res.user;
  }

  async function loginGoogle(){
    if (!initFirebase()) throw new Error("firebase-unavailable");
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      provider.setCustomParameters({ prompt: "select_account" });
    } catch (_) {}

    try {
      const res = await withTimeout(auth.signInWithPopup(provider), 12000, "auth-timeout");
      return res && res.user ? res.user : auth.currentUser;
    } catch (e) {
      
      try {
        if (typeof auth.signInWithRedirect === "function") {
          await auth.signInWithRedirect(provider);
          return null; 
        }
      } catch (_) {}
      throw e;
    }
  }

  async function consumeGoogleRedirectIfAny(){
    try {
      if (!initFirebase()) return null;
      const auth = firebase.auth();
      if (!auth || typeof auth.getRedirectResult !== "function") return null;
      const res = await withTimeout(auth.getRedirectResult(), 12000, "auth-timeout");
      return (res && res.user) ? res.user : null;
    } catch {
      return null;
    }
  }

  async function upsertProfile(uid, patch){
    try {
      if (!initFirebase()) return;
      const db = firebase.database();
      await withTimeout(db.ref("profiles/" + uid).update(patch || {}), 12000, "db-timeout");
    } catch (_) {}
  }

  async function registerEmail(nick, email, pass){
    if (!initFirebase()) throw new Error("firebase-unavailable");
    const auth = firebase.auth();
    const res = await withTimeout(auth.createUserWithEmailAndPassword(email, pass), 12000, "auth-timeout");
    const user = res.user;
    
    try {
      const uid = user.uid;
      const db = firebase.database();
      const profile = {
        nickname: nick,
        email: email,
        icon: DEFAULT_ICON,
        createdAt: nowMs(),
        lastActiveAt: nowMs()
      };
      await withTimeout(db.ref("profiles/" + uid).update(profile), 12000, "db-timeout");
    } catch {}
    return user;
  }
  async function sendReset(email){
  if (!initFirebase()) throw new Error("firebase-unavailable");
  const auth = firebase.auth();
  try { auth.languageCode = getSavedLang(); } catch (_) {}

  
  try {
    await withTimeout(auth.sendPasswordResetEmail(email), 12000, "auth-timeout");
    return;
  } catch (e) {
    const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
    
    let settings = null;
    try {
      if (location && typeof location.origin === "string" && location.origin.startsWith("http")) {
        settings = { url: location.origin + "/index.html" };
      }
    } catch (_) {}
    if (settings && (code.includes("unauthorized-continue-uri") || code.includes("invalid-continue-uri"))) {
      await withTimeout(auth.sendPasswordResetEmail(email, settings), 12000, "auth-timeout");
      return;
    }
    throw e;
  }
}


  async function logoutAll(){
    try {
      if (firebaseReady() && firebase.auth().currentUser) {
        await firebase.auth().signOut();
      }
    } catch {}
    
    try { _detachStatsListener(); } catch {}
    clearSession();
  }

  function showMsg(el, text, kind){
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("is-error","is-ok","is-show");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "ok") el.classList.add("is-ok");
    if (text) el.classList.add("is-show");
  }

  function setView(root, name){
    qsa("[data-auth-view]", root).forEach(function(v){
      v.style.display = (v.getAttribute("data-auth-view") === name) ? "" : "none";
    });
    root.setAttribute("data-auth-current", name);
  }

  function bindIconPicker(root, session){
    const picker = qs(".z-icon-picker", root);
    if (!picker) return;

    function ensureChoices(){
      let choices = qsa(".z-icon-choice", picker);
      if (choices.length) return choices;

      const list = (window.ZIconManifest && Array.isArray(window.ZIconManifest)) ? window.ZIconManifest : [];
      if (!list.length) return choices;

      const frag = document.createDocumentFragment();
      list.forEach(function(path){
        const safe = sanitizeUserIconPath(path);
        if (!safe) return;

        const div = document.createElement("div");
        div.className = "z-icon-choice";
        div.setAttribute("data-icon", safe);

        const img = document.createElement("img");
        img.src = safe;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");

        const span = document.createElement("span");
        const label = String(safe).split("/").pop().replace(/\.(svg|png)$/i, "");
        span.textContent = label;

        div.appendChild(img);
        div.appendChild(span);
        frag.appendChild(div);
      });

      picker.appendChild(frag);
      return qsa(".z-icon-choice", picker);
    }

    let choices = ensureChoices();
    if (!choices.length) return;

    function setActive(v){
      choices.forEach(function(c){
        c.classList.toggle("is-active", c.getAttribute("data-icon") === v);
      });
    }

    let current = sanitizeUserIconPath((session && session.icon) || DEFAULT_ICON);
    setActive(current);

    choices.forEach(function(c){
      c.addEventListener("click", function(){
        current = sanitizeUserIconPath(c.getAttribute("data-icon"));
        setActive(current);
      });
    });

    return function getIcon(){ return current; };
  }

  async function tryLoadProfileIntoForm(root, session){
    const nickEl = qs("#accNick", root);
    const emailEl = qs("#accEmail", root);

    if (nickEl) nickEl.value = session.nickname || "";
    if (emailEl) emailEl.value = session.email || "";

    
    if (isRegistered(session) && initFirebase()) {
      try {
        const db = firebase.database();
        const snap = await db.ref("profiles/" + session.uid).once("value");
        const p = snap && snap.val ? snap.val() : null;
        if (p && typeof p === "object") {
          if (p.nickname && nickEl) nickEl.value = p.nickname;
          if (p.email && emailEl) emailEl.value = p.email;
        }
      } catch {}
    }
  }

  async function saveProfileFromForm(root, session, getIcon){
    const nickEl = qs("#accNick", root);
    const emailEl = qs("#accEmail", root);

    const nickCheck = validateNick(nickEl ? nickEl.value : session.nickname);
    if (!nickCheck.ok) throw new Error("bad-nick");

    const email = String(emailEl ? emailEl.value : session.email || "").trim();
    if (isRegistered(session) && email && !validateEmail(email)) throw new Error("bad-email");

    const icon = sanitizeUserIconPath(getIcon ? getIcon() : (session.icon || DEFAULT_ICON));

    const next = Object.assign({}, session, {
      nickname: nickCheck.nick,
      email: email || session.email || "",
      icon: icon,
      lastActiveAt: nowMs()
    });

    writeSession(next);

    
    if (isRegistered(next) && initFirebase()) {
      try {
        const db = firebase.database();
        await db.ref("profiles/" + next.uid).update({
          nickname: next.nickname,
          email: next.email || null,
          icon: next.icon || null,
          lastActiveAt: next.lastActiveAt
        });
      } catch {}
    }
    return next;
  }

  
  
  

  let _statsUid = null;
  let _statsRef = null;
  let _statsHandler = null;

  function _detachStatsListener(){
    try {
      if (_statsRef && _statsHandler) {
        _statsRef.off("value", _statsHandler);
      }
    } catch {}
    _statsUid = null;
    _statsRef = null;
    _statsHandler = null;
  }

  function _num(v){
    v = Number(v);
    return Number.isFinite(v) ? v : 0;
  }

  function _renderStats(root, session, stats){
    const el = qs("#accStats", root);
    if (!el) return;

    if (!isRegistered(session)) {
      el.innerHTML = '<div style="opacity:0.8">' + tr("auth.statsGuest") + '</div>';
      return;
    }

    stats = (stats && typeof stats === "object") ? stats : {};
    const played = _num(stats.played);
    const wins = _num(stats.wins);
    const losses = _num(stats.losses);
    const draws = _num(stats.draws);
    const points = _num(stats.points);
    const rank = stats.rank != null ? String(stats.rank) : "—";

    el.innerHTML =
      '<div class="kv"><span>' + tr("auth.stats.played") + '</span><b>' + played + '</b></div>' +
      '<div class="kv"><span>' + tr("auth.stats.wins") + '</span><b>' + wins + '</b></div>' +
      '<div class="kv"><span>' + tr("auth.stats.losses") + '</span><b>' + losses + '</b></div>' +
      '<div class="kv"><span>' + tr("auth.stats.draws") + '</span><b>' + draws + '</b></div>' +
      '<div class="kv"><span>' + tr("auth.stats.points") + '</span><b>' + points + '</b></div>' +
      '<div class="kv"><span>' + tr("auth.stats.rank") + '</span><b>' + rank + '</b></div>';
  }

  function _ensureStatsListener(root, session){
    try {
      if (!isRegistered(session)) {
        _detachStatsListener();
        _renderStats(root, session, null);
        return;
      }
      if (!initFirebase()) {
        
        _detachStatsListener();
        _renderStats(root, session, { played: 0, wins: 0, losses: 0, draws: 0, points: 0, rank: "—" });
        return;
      }

      if (_statsUid === session.uid && _statsRef && _statsHandler) return;
      _detachStatsListener();

      const db = firebase.database();
      _statsUid = session.uid;
      _statsRef = db.ref("profiles/" + session.uid + "/stats");
      _statsHandler = function(snap){
        try {
          _renderStats(root, session, snap && snap.val ? snap.val() : null);
        } catch {}
      };
      _statsRef.on("value", _statsHandler);
    } catch {
      _detachStatsListener();
    }
  }

  function updateStatsUI(root, session){
    const el = qs("#accStats", root);
    if (!el) return;
    el.innerHTML = '<div style="opacity:0.75">' + tr("auth.statsLoading") + '</div>';
    _ensureStatsListener(root, session || {});
  }

  function applyLangToPage(lang){
    setDirFromLang(lang);
    try {
      if (window.ZShell && typeof window.ZShell.setLang === "function") {
        window.ZShell.setLang(lang);
      }
    } catch {}
  }

  function initIndexPage(){
    const root = qs("#authRoot");
    if (!root) return;

    
    const langSel = qs("#authLangSel", root);
    const lang = getSavedLang();
    if (langSel) langSel.value = lang;
    applyLangToPage(lang);

const langBtn = qs("#authLangBtn", root);
const langMenu = qs("#authLangMenu", root);
function closeLangMenu(){
  try { if (langMenu) langMenu.setAttribute("hidden",""); } catch (_) {}
}
if (langBtn && langMenu && !langBtn._z_bound) {
  langBtn._z_bound = true;
  langBtn.addEventListener("click", function(ev){
    ev.preventDefault();
    ev.stopPropagation();
    try {
      if (langMenu.hasAttribute("hidden")) langMenu.removeAttribute("hidden");
      else langMenu.setAttribute("hidden","");
    } catch (_) {}
  });
  langMenu.addEventListener("click", function(ev){
    const t = ev.target;
    if (!t) return;
    const v = t.getAttribute && t.getAttribute("data-lang");
    if (!v) return;
    setSavedLang(v);
    if (langSel) langSel.value = v;
    applyLangToPage(v);
    closeLangMenu();
  });
  document.addEventListener("click", function(){ closeLangMenu(); }, { passive:true });
  window.addEventListener("blur", function(){ closeLangMenu(); }, { passive:true });
}


    if (langSel && !langSel._z_bound) {
      langSel._z_bound = true;
      langSel.addEventListener("change", function(){
        const v = langSel.value || "ar";
        setSavedLang(v);
        applyLangToPage(v);
      });
    }

    const msgEl = qs("#authMsg", root);
   

    async function ensureProfileForUser(user, preferredNick){
      try {
        if (!user || !user.uid || !initFirebase()) return { nickname: preferredNick || "", icon: DEFAULT_ICON };
        const uid = user.uid;
        const db = firebase.database();
        let existing = null;
        try {
          const snap = await withTimeout(db.ref("profiles/" + uid).once("value"), 12000, "db-timeout");
          existing = (snap && snap.val) ? snap.val() : null;
        } catch (_) {}

        const pickedNickRaw = preferredNick || (user.displayName ? normalizeNick(user.displayName) : "");
        const pickedNickCheck = pickedNickRaw ? validateNick(pickedNickRaw) : { ok:false };
        const fallbackNick = tr("players.player") + " " + String(uid).slice(-4);
        const nicknameToUse = (existing && existing.nickname)
          ? String(existing.nickname)
          : (pickedNickCheck.ok ? pickedNickCheck.nick : fallbackNick);

        const iconToUse = sanitizeUserIconPath((existing && existing.icon) ? String(existing.icon) : DEFAULT_ICON);

        const patch = {
          lastActiveAt: nowMs(),
        };
        if (!(existing && existing.nickname)) patch.nickname = nicknameToUse;
        if (user.email) patch.email = user.email;
        if (iconToUse) patch.icon = iconToUse;
        if (!(existing && existing.createdAt)) patch.createdAt = nowMs();

        try { await withTimeout(db.ref("profiles/" + uid).update(patch), 12000, "db-timeout"); } catch (_) {}
        return { nickname: nicknameToUse, icon: sanitizeUserIconPath(iconToUse) };
      } catch {
        return { nickname: preferredNick || "", icon: DEFAULT_ICON };
      }
    }

    async function finalizeRegisteredSession(user, preferredNick){
      const info = await ensureProfileForUser(user, preferredNick);
      const s = {
        kind: "registered",
        uid: user.uid,
        email: user.email || "",
        nickname: info.nickname || preferredNick || "",
        icon: sanitizeUserIconPath(info.icon || DEFAULT_ICON),
        createdAt: nowMs(),
        lastActiveAt: nowMs()
      };
      writeSession(s);

      
      location.href = "pages/dashboard.html";
    }

    function go(view){
      setView(root, view);
      showMsg(msgEl, "", null);
      
    }

    
    
    try {
      consumeGoogleRedirectIfAny().then(function(user){
        if (!user || !user.uid) return;
        finalizeRegisteredSession(user).catch(function(){});
      });
    } catch (_) {}

    
    let session = readSession();
if (session && isGuest(session)) {
  // Guest is always explicit: do not auto-resume from local session.
  clearSession();
  session = null;
}

// Do NOT trust local session for navigation. Require active Firebase Auth.
go("login");

// If a non-anonymous Firebase user is already authenticated (persistence), proceed.
(function(){
  try{
    if (!initFirebase()) return;
    const auth = firebase.auth();
    let done = false;
    let unsub = null;

    const finish = function(u){
      if (done) return;
      done = true;
      try { if (unsub) unsub(); } catch (_) {}
      if (!u || !u.uid) return;

      // Anonymous users must explicitly choose "Continue without login".
      if (u.isAnonymous) {
        try { auth.signOut(); } catch (_) {}
        try { clearSession(); } catch (_) {}
        return;
      }

      finalizeRegisteredSession(u).catch(function(){});
    };

    if (auth.currentUser) { finish(auth.currentUser); return; }
    unsub = auth.onAuthStateChanged(function(u){ finish(u); });
    setTimeout(function(){ finish(auth.currentUser); }, 2500);
  }catch(_){}
})();



qsa("[data-go]", root).forEach(function(a){
      a.addEventListener("click", function(e){
        e.preventDefault();
        const v = a.getAttribute("data-go");
        go(v);
      });
    });

    
    const btnLogin = qs("#btnLogin", root);
    if (btnLogin) btnLogin.addEventListener("click", async function(){
      const email = String(qs("#loginEmail", root)?.value || "").trim();
      const pass  = String(qs("#loginPass", root)?.value || "");
      if (!email || !pass) {
        showMsg(msgEl, tr("auth.msgInvalid"), "error");
        return;
      }
      btnLogin.disabled = true;
      try {
        const user = await loginEmail(email, pass);
        await finalizeRegisteredSession(user);
      } catch (e) {
        const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
        if (code.includes("timeout")) {
          showMsg(msgEl, tr("auth.msgNetwork"), "error");
        } else {
          showMsg(msgEl, tr("auth.msgInvalid"), "error");
        }
      } finally {
        btnLogin.disabled = false;
      }
    });

    
    const btnGuest = qs("#btnGuest", root);
if (btnGuest) btnGuest.addEventListener("click", async function(){
  btnGuest.disabled = true;
  try {
    // If already signed in with a full account, continue as registered.
    try {
      if (initFirebase && initFirebase()) {
        const a = firebase.auth();
        if (a && a.currentUser && !a.currentUser.isAnonymous) {
          location.href = "pages/dashboard.html";
          return;
        }
      }
    } catch (_) {}

    const u = await ensureAnonymousAuth();
    if (!u || !u.uid) {
      showMsg(msgEl, tr("auth.msgNetwork"), "error");
      return;
    }

    // Persist guest session aligned to auth.uid (no local fake id).
    try {
      const s = {
        kind: "guest",
        uid: u.uid,
        authUid: u.uid,
        nickname: "",
        email: "",
        icon: DEFAULT_ICON,
        createdAt: nowMs(),
        lastActiveAt: nowMs()
      };
      writeSession(s);
    } catch (_) {}

    location.href = "pages/mode.html";
  } finally {
    btnGuest.disabled = false;
  }
});


const btnLoginGoogle = qs("#btnLoginGoogle", root);
if (btnLoginGoogle) btnLoginGoogle.addEventListener("click", async function(){
  btnLoginGoogle.disabled = true;
  try {
    const user = await loginGoogle();
    
    if (!user) return;
    await finalizeRegisteredSession(user);
  } catch (e) {
    const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
    if (code.includes("popup-blocked") || code.includes("popup_closed_by_user")) {
      showMsg(msgEl, tr("auth.msgPopupBlocked"), "error");
    } else if (code.includes("timeout")) {
      showMsg(msgEl, tr("auth.msgNetwork"), "error");
    } else {
      showMsg(msgEl, tr("auth.msgNetwork"), "error");
    }
  } finally {
    btnLoginGoogle.disabled = false;
  }
});

const btnRegister = qs("#btnRegister", root);
    if (btnRegister) btnRegister.addEventListener("click", async function(){
      const nick = String(qs("#regNick", root)?.value || "");
      const email = String(qs("#regEmail", root)?.value || "").trim();
      const pass  = String(qs("#regPass", root)?.value || "");
      const pass2 = String(qs("#regPass2", root)?.value || "");

      const nickCheck = validateNick(nick);
      if (!nickCheck.ok || !validateEmail(email) || !pass || pass.length < 6 || pass !== pass2) {
        showMsg(msgEl, tr("auth.msgInvalid"), "error");
        return;
      }

      btnRegister.disabled = true;
      try {
        const user = await registerEmail(nickCheck.nick, email, pass);
        await finalizeRegisteredSession(user, nickCheck.nick);
      } catch (e) {
        const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
        if (code.includes("timeout")) showMsg(msgEl, tr("auth.msgNetwork"), "error");
        else showMsg(msgEl, tr("auth.msgNetwork"), "error");
      } finally {
        btnRegister.disabled = false;
      }
    });

    
    const btnRecover = qs("#btnRecover", root);
    if (btnRecover) btnRecover.addEventListener("click", async function(){
      const email = String(qs("#recEmail", root)?.value || "").trim();
      if (!validateEmail(email)) {
        showMsg(msgEl, tr("auth.msgInvalid"), "error");
        return;
      }
      btnRecover.disabled = true;
      try {
        await sendReset(email);
        showMsg(msgEl, tr("auth.msgSent"), "ok");
      } catch (e) {
  const code = (e && (e.code || e.message)) ? String(e.code || e.message) : "";
  if (code.includes("auth/user-not-found")) showMsg(msgEl, tr("auth.msgResetNoUser"), "error");
  else if (code.includes("auth/invalid-email")) showMsg(msgEl, tr("auth.msgResetInvalidEmail"), "error");
  else if (code.includes("auth/too-many-requests")) showMsg(msgEl, tr("auth.msgResetTooMany"), "error");
  else if (code.includes("auth/operation-not-allowed")) showMsg(msgEl, tr("auth.msgResetNotAllowed"), "error");
  else if (code.includes("auth/unauthorized-continue-uri") || code.includes("auth/invalid-continue-uri")) showMsg(msgEl, tr("auth.msgResetDomain"), "error");
  else showMsg(msgEl, tr("auth.msgNetwork"), "error");
} finally {
        btnRecover.disabled = false;
      }
    });

    
    const s2 = readSession();
    const getIcon = bindIconPicker(root, s2);

    const btnSave = qs("#btnSaveProfile", root);
    if (btnSave) btnSave.addEventListener("click", async function(){
      btnSave.disabled = true;
      try {
        const s = readSession() || {};
        const next = await saveProfileFromForm(root, s, getIcon);
        showMsg(msgEl, tr("auth.msgSaved"), "ok");
        updateStatsUI(root, next);
      } catch (e) {
        showMsg(msgEl, tr("auth.msgInvalid"), "error");
      } finally {
        btnSave.disabled = false;
      }
    });

    const btnStart = qs("#btnStartPlay", root);
    if (btnStart) btnStart.addEventListener("click", function(){
      location.href = "pages/mode.html";
    });

    const btnLogout = qs("#btnLogout", root);
    if (btnLogout) btnLogout.addEventListener("click", async function(){
      const ok = window.Modal ? await Modal.confirm({
        title: tr("topbar.logout"),
        html: "<div>" + tr("topbar.logout") + "</div>",
        okText: tr("topbar.logout"),
        cancelText: tr("modals.cancel")
      }) : true;
      if (!ok) return;
      await logoutAll();
      location.href = "index.html";
    });
  }

  
  window.ZAuth = {
    readSession, writeSession, clearSession, initFirebase,
    ensureAnonymousAuth,
    isRegistered, isGuest,
    logout: logoutAll,
    initIndexPage
  };
})();





/* Auth guard: protected pages require active Firebase Auth (anonymous or registered). */
(function(){
  "use strict";
  function pathLower(){ try{ return String(location.pathname || "").toLowerCase(); }catch(_){ return ""; } }
  function isPagesDir(){ try{ return pathLower().includes("/pages/"); }catch(_){ return false; } }
  function baseHref(){ return isPagesDir() ? ".." : "."; }
  function toIndex(){
    try { location.href = baseHref() + "/index.html"; } catch(_) {}
  }

  function isProtected(){
    const p = pathLower();
    if (!p) return false;
    // Only protect interactive pages.
    if (p.endsWith("/pages/mode.html") || p.endsWith("/mode.html")) return "any";
    if (p.endsWith("/pages/loby.html") || p.endsWith("/loby.html")) return "any";
    if (p.endsWith("/pages/game.html") || p.endsWith("/game.html")) return "any";
    if (p.endsWith("/pages/dashboard.html") || p.endsWith("/dashboard.html")) return "registered";
    return false;
  }

  function waitForAuthUser(timeoutMs){
    return new Promise(function(resolve){
      try{
        if (!(window.ZAuth && typeof ZAuth.initFirebase === "function")) return resolve(null);
        if (!ZAuth.initFirebase()) return resolve(null);
        if (!(window.firebase && firebase.auth)) return resolve(null);

        const auth = firebase.auth();
        if (auth && auth.currentUser) return resolve(auth.currentUser);

        let done = false;
        let unsub = null;

        function finish(u){
          if (done) return;
          done = true;
          try { if (unsub) unsub(); } catch(_) {}
          resolve(u || (auth ? auth.currentUser : null) || null);
        }

        try { unsub = auth.onAuthStateChanged(function(u){ if (u) finish(u); }); } catch(_) {}
        setTimeout(function(){ finish(auth ? auth.currentUser : null); }, Math.max(500, timeoutMs || 8000));
      }catch(_){
        resolve(null);
      }
    });
  }

  async function run(){
    try{
      const need = isProtected();
      if (!need) return;

      const u = await waitForAuthUser(8000);
      if (!u || !u.uid) { toIndex(); return; }
      if (need === "registered" && u.isAnonymous) { toIndex(); return; }

      // Keep session aligned with auth, but session is NOT the source of truth.
      try{
        if (window.ZAuth && typeof ZAuth.writeSession === "function") {
          const now = Date.now();
          const prev = (typeof ZAuth.readSession === "function") ? ZAuth.readSession() : null;
          const icon = (prev && prev.icon) ? prev.icon : "assets/icons/users/user1.svg";
          const nick = (prev && prev.nickname) ? prev.nickname : "";
          if (u.isAnonymous) {
            ZAuth.writeSession({ kind:"guest", uid:u.uid, authUid:u.uid, nickname:nick, email:"", icon:icon, createdAt:now, lastActiveAt:now });
          } else {
            ZAuth.writeSession({ kind:"registered", uid:u.uid, authUid:u.uid, nickname:nick, email:(u.email||""), icon:icon, createdAt:now, lastActiveAt:now });
          }
        }
      }catch(_){}
    }catch(_){}
  }

  try { run(); } catch(_) {}
})();

(function(){
  try { window.ZShell = window.ZShell || {}; } catch(e) {}
  function __z_init_pages_shell(){
    


    (function () {
      "use strict";
    
      function qs(sel, root) { return (root || document).querySelector(sel); }
      function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
    
      function pathLower() { return String(location.pathname || "").toLowerCase(); }
      function isInfoPage() { return pathLower().includes("/pages/"); }
    
      function isGamePage() {
        var p = pathLower();
        if (p.endsWith("/pages/game.html") || p.endsWith("/game.html") || p.endsWith("/pages/game") || p.endsWith("/game")) return true;
        try { return !!(document.body && document.body.classList && document.body.classList.contains("z-game-page")); } catch (_) { return false; }
      }
    
    
      function getBaseHref() { return isInfoPage() ? ".." : "."; }
    
      function isLoginPage() {
        var p = pathLower();
        return (p.endsWith("/index.html") || p === "/" || p.endsWith("/"));
      }
    
      var SESSION_KEY = "zamat.session.user.v1";
      var PERSIST_KEY = "zamat.session.user.persist.v1";
    
      function readSessionAny() {
        try {
          var raw = null;
          try { raw = sessionStorage.getItem(SESSION_KEY); } catch (_) {}
          if (!raw) {
            try { raw = localStorage.getItem(PERSIST_KEY); } catch (_) {}
          }
          if (!raw) return null;
          var obj = JSON.parse(raw);
          if (!obj || typeof obj !== "object") return null;
          return obj;
        } catch (_) {
          return null;
        }
      }
    
      function hasSession() {
        var obj = readSessionAny();
        
        
        return !!(obj && obj.uid && obj.kind === "registered");
      }
    
      var HOME_FIXED_DIR = null;
    
      var AppPref = {
        getLang: function () {
          try {
            var url = new URL(location.href);
            var q = url.searchParams.get("lang");
            if (q) return q;
          } catch (_) {}
          try { return localStorage.getItem("zamat.lang") || "ar"; } catch (_) {}
          return "ar";
        },
        setLang: function (lang) {
          try { localStorage.setItem("zamat.lang", lang); } catch (_) {}
        },
        getTheme: function () {
          try { return localStorage.getItem("zamat.theme") || "light"; } catch (_) {}
          return "light";
        }
      };
    
      


      function deepGet(obj, key) {
        if (!obj || !key) return undefined;
        var segs = String(key).split(".");
        var cur = obj;
        for (var i = 0; i < segs.length; i++) {
          if (!cur || typeof cur !== "object") return undefined;
          cur = cur[segs[i]];
        }
        return cur;
      }
    
      function interpolate(str, vars) {
        if (!vars || typeof str !== "string") return str;
        return str.replace(/\$\{(\w+)\}/g, function (_, k) {
          return vars[k] != null ? String(vars[k]) : "";
        });
      }
    
      function buildTranslator(lang) {
        var tr = (window.translations && window.translations[lang]) ||
                 (window.translations && window.translations.ar) || {};
        var fb = (window.translations && window.translations.ar) || {};
        return function t(key, vars) {
          var out = deepGet(tr, key);
          if (typeof out !== "string") out = deepGet(fb, key);
          if (typeof out !== "string") out = String(key || "");
          return interpolate(out, vars);
        };
      }
    
      


      function applyTheme() {
        var th = AppPref.getTheme();
        var rootEl = document.documentElement;
        if (th === "dark") rootEl.classList.add("dark");
        else rootEl.classList.remove("dark");
      }
    
      function setTopbarDirAndLang(lang) {
        var dir = (lang === "ar") ? "rtl" : "ltr";
        var tb = qs(".z-topbar");
        if (tb) {
          tb.setAttribute("dir", dir);
          tb.setAttribute("lang", lang);
        }
      }
    
      
      
      
      function setModalDirAndLang(lang) {
        var dir = (lang === "ar") ? "rtl" : "ltr";
        try {
          var mb = document.getElementById("modalBackdrop");
          if (mb) {
            mb.setAttribute("dir", dir);
            mb.setAttribute("lang", lang);
            var modal = mb.querySelector && mb.querySelector(".modal");
            if (modal) {
              modal.setAttribute("dir", dir);
              modal.setAttribute("lang", lang);
            }
          }
        } catch (_) {}
      }
    
      function applyShellLanguage(lang) {
        if (!lang) lang = "ar";
        var dir = (lang === "ar") ? "rtl" : "ltr";
    
        document.documentElement.lang = lang;
    
        if (isInfoPage()) {
          document.documentElement.dir = dir;
        } else if (HOME_FIXED_DIR) {
          document.documentElement.dir = HOME_FIXED_DIR;
        }
    
        document.documentElement.classList.remove("lang-ar", "lang-en", "lang-fr");
        document.documentElement.classList.add("lang-" + lang);
    
        setTopbarDirAndLang(lang);
        setModalDirAndLang(lang);
    
        
        setModalDirAndLang(lang);
    
        var t = buildTranslator(lang);
        var scope = isInfoPage() ? document : (qs(".z-topbar") || document);
    
        qsa("[data-i18n]", scope).forEach(function (el) {
          var k = el.getAttribute("data-i18n");
          var val = t(k);
          if (el.tagName === "META") el.setAttribute("content", val);
          else el.textContent = val;
        });
    
        qsa("[data-i18n-aria-label]", scope).forEach(function (el) {
          var k = el.getAttribute("data-i18n-aria-label");
          el.setAttribute("aria-label", t(k));
        });
    
        qsa("[data-i18n-title]", scope).forEach(function (el) {
          var k = el.getAttribute("data-i18n-title");
          el.setAttribute("title", t(k));
        });
    
        ensureMobileNavToggle(qs(".z-topbar"), lang);
      }

      function _navMarkInternal() {
        try { sessionStorage.setItem("zamat.internalNavTs", String(Date.now())); } catch (_) {}
      }

      function _navGetActiveGameId() {
        try { return String(sessionStorage.getItem("zamat.activeGameId") || "").trim(); } catch (_) { return ""; }
      }

      function _navBindGuards(topbarEl, base) {
        if (!topbarEl) return;

        function goToGame() {
          try { location.href = base + "/pages/game.html"; } catch (_) {}
        }

        function shouldResume() {
          return !!_navGetActiveGameId();
        }

        try {
          topbarEl.addEventListener("click", function (e) {
            var a = e && e.target && e.target.closest ? e.target.closest("a") : null;
            if (!a) return;

            var href = String(a.getAttribute("href") || "");
            if (!href) return;

            // Ignore external or new-tab links
            if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return;
            if (a.target && a.target !== "" && a.target !== "_self") return;

            // Mark internal navigation for page lifecycle cleanup logic
            _navMarkInternal();

            // Home/title: go back to active match if present
var cls = a.classList;
var isHome = !!(cls && (cls.contains("z-nav-home") || cls.contains("z-nav-home-title")));
if (isHome && shouldResume()) {
  e.preventDefault();
  e.stopPropagation();
  goToGame();
  return;
}

// While an active match exists on the game page, open info pages (rules/about/privacy/contact)
// inside a modal iframe to keep the PvP session alive in the same tab.
try {
  if (typeof isGamePage === "function" && isGamePage() && shouldResume()) {
    var h = String(href || "").toLowerCase();
    var m = h.match(/(?:^|\/)(rules|about|privacy|contact)\.html$/);
    if (m) {
      e.preventDefault();
      e.stopPropagation();

      var page = m[1];
      var titleKey =
        page === "rules" ? "pages.nav.rules" :
        page === "about" ? "pages.nav.about" :
        page === "privacy" ? "pages.nav.privacy" :
        "pages.nav.contact";

      if (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function") {
        var iframe = document.createElement("iframe");
        iframe.src = href;
        iframe.setAttribute("loading", "lazy");
        iframe.style.width = "100%";
        iframe.style.height = "70vh";
        iframe.style.border = "0";
        iframe.style.borderRadius = "12px";
        iframe.style.background = "transparent";

        var title = (typeof t === "function" ? t(titleKey) : titleKey);
        Modal.open({
          title: title,
          body: iframe,
          buttons: [
            {
              label: (typeof t === "function" ? t("actions.close") : "Close"),
              className: "primary",
              onClick: function () { try { Modal.close(); } catch (_) {} },
            },
          ],
        });
        return;
      }
    }
  }
} catch (_) {}
          }, true);
        } catch (_) {}

        // Also mark internal navigation for non-topbar links on the page
        try {
          if (document && !document._z_internalNavBound) {
            document._z_internalNavBound = true;
            document.addEventListener("click", function (e) {
              var a = e && e.target && e.target.closest ? e.target.closest("a") : null;
              if (!a) return;
              var href = String(a.getAttribute("href") || "");
              if (!href) return;
              if (href[0] === "#") return;
              if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return;
              if (a.target && a.target !== "" && a.target !== "_self") return;
              _navMarkInternal();
            }, true);
          }
        } catch (_) {}
      }


    
      


      function buildTopbar() {
        var base = getBaseHref();
        var wrap = document.createElement("header");
        wrap.className = "z-topbar";
        wrap.innerHTML =
          '<div class="z-topbar-inner">' +
            '<div class="z-topbar-nav">' +
              '<button class="z-nav-toggle" type="button" data-i18n-aria-label="aria.menu" aria-expanded="false">' +
                '<span class="z-hamburger" aria-hidden="true"><span></span></span>' +
              '</button>' +
              '<nav class="z-nav" data-i18n-aria-label="aria.primaryNav">' +
                '<a class="z-nav-home" href="' + base + '/pages/mode.html" data-i18n="pages.nav.home"></a>' +
                '<a href="' + base + '/pages/rules.html" data-i18n="pages.nav.rules"></a>' +
                '<a href="' + base + '/pages/about.html" data-i18n="pages.nav.about"></a>' +
                '<a href="' + base + '/pages/privacy.html" data-i18n="pages.nav.privacy"></a>' +
                '<a href="' + base + '/pages/contact.html" data-i18n="pages.nav.contact"></a>' +
              '</nav>' +
            '</div>' +
            '<div class="z-topbar-title">' +
              '<a class="z-topbar-title-link z-nav-home-title" href="' + base + '/pages/mode.html" data-i18n="game.title"></a>' +
            '</div>' +
            '<div class="z-topbar-right">' +
              '<div class="z-topbar-lang">' +
                '<select id="topLangSel" class="z-lang-select" data-i18n-aria-label="ui.language" data-i18n-title="ui.language">' +
                  '<option value="ar" data-i18n="langs.ar"></option>' +
                  '<option value="en" data-i18n="langs.en"></option>' +
                  '<option value="fr" data-i18n="langs.fr"></option>' +
                '</select>' +
                '<button id="zLangBtn" class="z-lang-btn" type="button" aria-expanded="false" data-i18n-aria-label="ui.language" data-i18n-title="ui.language">' +
                  '<img src="' + base + '/assets/icons/globe.svg" alt="" aria-hidden="true" />' +
                '</button>' +
                '<div class="z-lang-menu" id="zLangMenu" hidden>' +
                  '<button type="button" class="z-lang-item" data-lang="ar" data-i18n="langs.ar"></button>' +
                  '<button type="button" class="z-lang-item" data-lang="en" data-i18n="langs.en"></button>' +
                  '<button type="button" class="z-lang-item" data-lang="fr" data-i18n="langs.fr"></button>' +
                '</div>' +
              '</div>' +
              '<div class="z-topbar-account" id="zAccountArea"></div>' +
            '</div>' +
          '</div>';
    
        var p = pathLower();
        qsa("a", wrap).forEach(function (a) {
          var href = String(a.getAttribute("href") || "").toLowerCase();
          var isActive =
            (p.endsWith("/index.html") && href.endsWith("/index.html")) ||
            (p.endsWith("/pages/rules.html") && href.endsWith("/pages/rules.html")) ||
            (p.endsWith("/pages/about.html") && href.endsWith("/pages/about.html")) ||
            (p.endsWith("/pages/privacy.html") && href.endsWith("/pages/privacy.html")) ||
            (p.endsWith("/pages/contact.html") && href.endsWith("/pages/contact.html"));
          if (isActive) a.classList.add("active");
        });
    
        try { _navBindGuards(wrap, base); } catch (_) {}

        return wrap;
      }
    
      function buildFooter() {
        var wrap = document.createElement("div");
        wrap.className = "z-footer-wrap";
        wrap.innerHTML = '<footer class="z-footer" role="contentinfo" data-i18n="pages.footer.text"></footer>';
        return wrap;
      }
    
      


      function ensureMobileNavToggle(topbarEl, lang) {
        if (!topbarEl) return;
    
        var btn = qs(".z-nav-toggle", topbarEl);
        var nav = qs(".z-nav", topbarEl);
        if (!btn || !nav) return;
    
        function setLabel(l) {
          try { btn.setAttribute("aria-label", tr("aria.menu")); } catch (_) {}
        }
    
        setLabel(lang || AppPref.getLang());
    
        if (btn._z_bound) return;
        btn._z_bound = true;
    
        function close() {
          topbarEl.classList.remove("is-nav-open");
          try { btn.setAttribute("aria-expanded", "false"); } catch (_) {}
        }
    
        function toggle() {
          var open = !topbarEl.classList.contains("is-nav-open");
          if (open) topbarEl.classList.add("is-nav-open");
          else topbarEl.classList.remove("is-nav-open");
          try { btn.setAttribute("aria-expanded", open ? "true" : "false"); } catch (_) {}
        }
    
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        });
    
        qsa("a", nav).forEach(function (a) {
          a.addEventListener("click", function () { close(); });
        });
    
        document.addEventListener("click", function (e) {
          if (!topbarEl.contains(e.target)) close();
        });
    
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape") close();
        });
      }
    
      


      function wrapGameApplyLanguageIfNeeded() {
        if (isInfoPage()) return;
        if (typeof window.applyLanguage !== "function") return;
        if (window.applyLanguage._z_wrapped) return;
    
        var original = window.applyLanguage;
    
        function wrapped(lang) {
          try { AppPref.setLang(lang); } catch (_) {}
          try { original(lang); } catch (_) {}
    
          if (HOME_FIXED_DIR) {
            try { document.documentElement.dir = HOME_FIXED_DIR; } catch (_) {}
          }
    
          try { applyShellLanguage(lang); } catch (_) {}
        }
    
        wrapped._z_wrapped = true;
        wrapped._z_original = original;
        window.applyLanguage = wrapped;
      }
    
      


      
      function updateAccountArea() {
        var area = qs("#zAccountArea");
        if (!area) return;
    
        var loggedIn = hasSession();
        var base = getBaseHref();
    
        if (!loggedIn) {
          
          area.innerHTML =
            '<div class="z-acc-desktop">' +
              '<a class="btn small secondary z-acc-btn" href="' + base + '/index.html" data-i18n="topbar.login"></a>' +
            '</div>' +
            '<div class="z-acc-mobile" data-i18n-aria-label="aria.account">' +
              '<a class="z-ico-btn" href="' + base + '/index.html" id="zAccLoginIcon" data-i18n-title="topbar.login" data-i18n-aria-label="topbar.login">' +
                '<img src="' + base + '/assets/icons/user.svg" alt="" aria-hidden="true" />' +
              '</a>' +
            '</div>';
          try { if (window.ZShell && typeof window.ZShell.applyI18n === "function") window.ZShell.applyI18n(); } catch (_) {}
          return;
        }
    
        
        
        area.innerHTML =
          '<div class="z-acc-desktop">' +
            '<button type="button" class="btn small secondary z-acc-menu-btn" id="zAccMenuBtn" aria-expanded="false" data-i18n-title="topbar.account">' +
              '<span class="z-acc-ico" aria-hidden="true"><img class="z-ico" src="' + base + '/assets/icons/dashboard.svg" alt="" aria-hidden="true" /></span>' +
              '<span class="z-acc-text" data-i18n="topbar.account"></span>' +
            '</button>' +
          '</div>' +
          '<div class="z-acc-mobile" data-i18n-aria-label="aria.account">' +
            '<a class="z-ico-btn" href="' + base + '/pages/dashboard.html" id="zAccDashIcon" data-i18n-title="topbar.account" data-i18n-aria-label="topbar.account">' +
              '<img src="' + base + '/assets/icons/dashboard.svg" alt="" aria-hidden="true" />' +
            '</a>' +
            '<button type="button" class="z-ico-btn danger" id="zAccLogoutIcon" data-i18n-title="topbar.logout" data-i18n-aria-label="topbar.logout">' +
              '<img src="' + base + '/assets/icons/logout.svg" alt="" aria-hidden="true" />' +
            '</button>' +
          '</div>' +
          '<div class="z-acc-menu" id="zAccMenu" hidden>' +
            '<a class="z-acc-item" href="' + base + '/pages/dashboard.html" data-i18n="topbar.account"></a>' +
            '<button type="button" class="z-acc-item danger" id="zAccLogout" data-i18n="topbar.logout"></button>' +
          '</div>';
        var btn = qs("#zAccMenuBtn");
        var menu = qs("#zAccMenu");
        var logout = qs("#zAccLogout");
        var logoutIcon = qs("#zAccLogoutIcon");
    
        function closeMenu(){
          if (!menu) return;
          menu.hidden = true;
          if (btn) btn.setAttribute("aria-expanded","false");
        }
        function toggleMenu(){
          if (!menu) return;
          var open = !!menu.hidden;
          menu.hidden = !open;
          if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
        }
    
        if (btn && !btn._z_bound) {
          btn._z_bound = true;
          btn.addEventListener("click", function(e){
            e.preventDefault();
            toggleMenu();
          });
          document.addEventListener("click", function(e){
            if (!area.contains(e.target)) closeMenu();
          });
        }
        async function doLogout(){
          closeMenu();
          
          try {
            if (window.ZAuth && typeof window.ZAuth.logout === "function") {
              await window.ZAuth.logout();
            }
          } catch (_) {}
          try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
          try { localStorage.removeItem(PERSIST_KEY); } catch (_) {}
          location.href = base + "/index.html";
        }
    
        if (logout && !logout._z_bound) {
          logout._z_bound = true;
          logout.addEventListener("click", function(){
            doLogout();
          });
        }
    
        if (logoutIcon && !logoutIcon._z_bound) {
          logoutIcon._z_bound = true;
          logoutIcon.addEventListener("click", function(e){
            e.preventDefault();
            doLogout();
          });
        }
        try { if (window.ZShell && typeof window.ZShell.applyI18n === "function") window.ZShell.applyI18n(); } catch (_) {}
      }
    
      function ensureShell() {
        applyTheme();
    
        if (document.body && !document.body.classList.contains("z-page-body")) {
          document.body.classList.add("z-page-body");
        }
    
        
        try {
          if (isGamePage()) document.body.classList.add("z-game-page");
          else document.body.classList.remove("z-game-page");
        } catch (_) {}
    
        var hideTopbar = isLoginPage() && !hasSession();
    
        if (!hideTopbar) {
          document.body.classList.add("z-has-topbar");
        } else {
          document.body.classList.remove("z-has-topbar");
        }
        document.body.classList.add(isInfoPage() ? "z-info-page" : "z-home-page");
    
        if (!hideTopbar) {
          if (!qs(".z-topbar")) {
            document.body.insertBefore(buildTopbar(), document.body.firstChild);
          }
          updateAccountArea();
        } else {
          
          var ex = qs(".z-topbar");
          if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
        }
    
        if (!isInfoPage() && !HOME_FIXED_DIR) {
          HOME_FIXED_DIR = document.documentElement.getAttribute("dir") || "rtl";
        }
    
        if (isInfoPage() && !isGamePage() && !qs(".z-footer-wrap")) {
          document.body.appendChild(buildFooter());
        }
    
        
        if (isGamePage()) {
          try {
            var fw = qs(".z-footer-wrap");
            if (fw && fw.parentNode) fw.parentNode.removeChild(fw);
          } catch (_) {}
        }
    
        
        if (isGamePage()) {
          try {
            qsa(".z-footer-wrap").forEach(function (el) {
              if (el && el.parentNode) el.parentNode.removeChild(el);
            });
          } catch (_) {}
        }
    
        wrapGameApplyLanguageIfNeeded();
        setTimeout(wrapGameApplyLanguageIfNeeded, 0);
        setTimeout(wrapGameApplyLanguageIfNeeded, 250);
        setTimeout(wrapGameApplyLanguageIfNeeded, 1000);
    
        var lang = AppPref.getLang();
        var sel = qs("#topLangSel");
        if (sel) sel.value = lang;
    
        applyShellLanguage(lang);
    
        if (sel && !sel._z_bound) {
          sel._z_bound = true;
          sel.addEventListener("change", function () {
            var v = sel.value || "ar";
            AppPref.setLang(v);
    
            if (typeof window.applyLanguage === "function") {
              window.applyLanguage(v);
            } else {
              applyShellLanguage(v);
            }
          });
        }
    
        
        var langBtn = qs("#zLangBtn");
        var langMenu = qs("#zLangMenu");
        var langItems = qsa("#zLangMenu .z-lang-item");
    
        function setLang(v){
          v = v || "ar";
          AppPref.setLang(v);
          if (sel) sel.value = v;
    
          if (typeof window.applyLanguage === "function") {
            window.applyLanguage(v);
          } else {
            applyShellLanguage(v);
          }
    
          try {
            langItems.forEach(function(it){
              it.classList.toggle("is-active", it.getAttribute("data-lang") === v);
            });
          } catch (_) {}
        }
    
        function closeLangMenu(){
          if (!langMenu || langMenu.hidden) return;
          langMenu.hidden = true;
          if (langBtn) langBtn.setAttribute("aria-expanded","false");
        }
        function toggleLangMenu(){
          if (!langMenu) return;
          var open = !!langMenu.hidden;
          langMenu.hidden = !open;
          if (langBtn) langBtn.setAttribute("aria-expanded", open ? "true" : "false");
          if (open) {
            try {
              var current = (sel && sel.value) ? sel.value : AppPref.getLang();
              langItems.forEach(function(it){
                it.classList.toggle("is-active", it.getAttribute("data-lang") === current);
              });
            } catch (_) {}
          }
        }
    
        if (langBtn && !langBtn._z_bound) {
          langBtn._z_bound = true;
          langBtn.addEventListener("click", function(e){
            e.preventDefault();
            e.stopPropagation();
            toggleLangMenu();
          });
          document.addEventListener("click", function(){ closeLangMenu(); });
          document.addEventListener("keydown", function(ev){ if (ev.key === "Escape") closeLangMenu(); });
        }
    
        if (langMenu && !langMenu._z_bound) {
          langMenu._z_bound = true;
          langMenu.addEventListener("click", function(e){ e.stopPropagation(); });
          langItems.forEach(function(it){
            it.addEventListener("click", function(e){
              e.preventDefault();
              var v = it.getAttribute("data-lang") || "ar";
              setLang(v);
              closeLangMenu();
            });
          });
        }
    
        try {
          var currentLang = (sel && sel.value) ? sel.value : AppPref.getLang();
          langItems.forEach(function(it){
            it.classList.toggle("is-active", it.getAttribute("data-lang") === currentLang);
          });
        } catch (_) {}
    
      }
    
    
      
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureShell);
      } else {
        ensureShell();
      }
    
      
      window.ZShell = window.ZShell || {};
      window.ZShell.applyI18n = function () {
        try {
          var lang = (AppPref && typeof AppPref.getLang === "function") ? AppPref.getLang() : "ar";
          if (typeof window.applyLanguage === "function") {
            window.applyLanguage(lang);
          } else {
            applyShellLanguage(lang);
          }
        } catch (_) {}
      };
      window.ZShell.setLang = function (lang) {
        try { AppPref.setLang(lang); } catch (_) {}
        try {
          if (typeof window.applyLanguage === "function") {
            window.applyLanguage(lang);
          } else {
            applyShellLanguage(lang);
          }
        } catch (_) {}
      };
    })();

  }
  try {
    
    
    setTimeout(__z_init_pages_shell, 0);
  } catch (e) {
    try { __z_init_pages_shell(); } catch(_) {}
  }
})();

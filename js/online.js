/* Section: js/online.js — JavaScript module */

(function () {
  
  function tr(key, fallbackOrVars, varsMaybe) {
    // Wrapper around global t() that supports both (key, vars) and legacy (key, fallback, vars)
    let fallback = null;
    let vars = null;

    if (fallbackOrVars && typeof fallbackOrVars === "object" && !Array.isArray(fallbackOrVars)) {
      vars = fallbackOrVars;
    } else {
      fallback = fallbackOrVars;
      vars = varsMaybe;
    }

    try {
      const v = typeof t === "function" ? t(key, vars) : null;
      if (!v || v === key) return fallback != null ? fallback : String(key || "");
      return v;
    } catch {
      return fallback != null ? fallback : String(key || "");
    }
  }

  function formatTpl(s, vars) {
    return (s || "").replace(/\{(\w+)\}/g, (_, k) =>
      vars && vars[k] != null ? vars[k] : ""
    );
  }

  

  function normalizeSouflaFx(fx) {
    try {
      if (!fx || typeof fx !== "object") return null;
      const out = {};

      
      if (Array.isArray(fx.redPaths) && fx.redPaths.length) {
        const rp = [];
        for (const seg of fx.redPaths) {
          if (!seg) continue;
          const from = Number(seg.from);
          const path = Array.isArray(seg.path) ? seg.path.map(Number).filter(Number.isFinite) : null;
          if (!Number.isFinite(from) || !path || !path.length) continue;
          const jumps = Array.isArray(seg.jumps) ? seg.jumps.map(Number).filter(Number.isFinite) : [];
          rp.push({ from, path, jumps });
        }
        if (rp.length) out.redPaths = rp;
      }

      
      if (!out.redPaths && fx.red && fx.red.from != null && fx.red.to != null) {
        const f = Number(fx.red.from);
        const t = Number(fx.red.to);
        if (Number.isFinite(f) && Number.isFinite(t)) out.red = { from: f, to: t };
      }

      
      if (fx.undoArrow) {
  try {
    const f = fx.undoArrow.from != null ? Number(fx.undoArrow.from) : null;
    if (Array.isArray(fx.undoArrow.path) && f != null && Number.isFinite(f)) {
      const path = fx.undoArrow.path.map(Number).filter(Number.isFinite);
      if (path.length) out.undoArrow = { from: f, path };
    } else if (fx.undoArrow.from != null && fx.undoArrow.to != null) {
      const f2 = Number(fx.undoArrow.from);
      const t2 = Number(fx.undoArrow.to);
      if (Number.isFinite(f2) && Number.isFinite(t2)) out.undoArrow = { from: f2, to: t2 };
    }
  } catch {}
}

      
      if (fx.removeIdx != null) {
        const r = Number(fx.removeIdx);
        if (Number.isFinite(r)) out.removeIdx = r;
      }

      
      if (Array.isArray(fx.forcePath) && fx.forcePath.length) {
        const fp = fx.forcePath.map(Number).filter(Number.isFinite);
        if (fp.length) out.forcePath = fp;
      }

      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  }

  
  

  function buildSouflaFxFromDecisionAndPending(decision, pending) {
    try {
      if (!decision || !pending) return null;
      const fx = {};

      
      try {
        const offIdx = decision.offenderIdx;
        const maxLen =
          pending.longestByPiece && pending.longestByPiece.get
            ? pending.longestByPiece.get(offIdx) || 0
            : 0;

        if (
          offIdx != null &&
          maxLen > 0 &&
          pending.turnStartSnapshot &&
          typeof snapshotState === "function" &&
          typeof restoreSnapshotSilent === "function" &&
          typeof longestPathsWithJumpsFrom === "function"
        ) {
          const keep = snapshotState();
          try { if (typeof simEnter === "function") simEnter(); } catch {}
          try {
            restoreSnapshotSilent(pending.turnStartSnapshot);
            const full = longestPathsWithJumpsFrom(offIdx, maxLen) || [];
            full.sort((a, b) => {
              const sa = (a.path || []).join(",") + "|" + (a.jumps || []).join(",");
              const sb = (b.path || []).join(",") + "|" + (b.jumps || []).join(",");
              return sa < sb ? -1 : sa > sb ? 1 : 0;
            });
            const chosen = full[0];
            if (chosen && Array.isArray(chosen.path) && chosen.path.length) {
              fx.redPaths = [
                {
                  from: Number(offIdx),
                  path: chosen.path.slice(),
                  jumps: Array.isArray(chosen.jumps) ? chosen.jumps.slice() : [],
                },
              ];
            }
          } finally {
            try { restoreSnapshotSilent(keep); } catch {}
            try { if (typeof simExit === "function") simExit(); } catch {}
          }
        }
      } catch {}

      if (decision.kind === "remove") {
        fx.removeIdx = decision.offenderIdx;
      } else if (decision.kind === "force") {
        const p = [decision.offenderIdx].concat(Array.isArray(decision.path) ? decision.path : []);
        fx.forcePath = p;
        if (pending.startedFrom != null && pending.lastPieceIdx != null) {
          try {
  if (pending.lastMoveFrom != null && Array.isArray(pending.lastMovePath) && pending.lastMovePath.length) {
    const nodes = [pending.lastMoveFrom].concat(pending.lastMovePath).map((n) => Number(n)).filter(Number.isFinite);
    if (nodes.length >= 2) {
      const rev = nodes.slice().reverse();
      fx.undoArrow = { from: rev[0], path: rev.slice(1) };
    }
  } else if (pending.startedFrom != null && pending.lastPieceIdx != null) {
    fx.undoArrow = { from: pending.lastPieceIdx, to: pending.startedFrom };
  }
} catch {}
        }
      }

      return fx;
    } catch {
      return null;
    }
  }

  function isPermissionDenied(err) {

    const parts = [];
    try { if (err && err.code != null) parts.push(String(err.code)); } catch {}
    try { if (err && err.message) parts.push(String(err.message)); } catch {}
    const msg = parts.join(" | ");
    return /permission[_ -]?denied/i.test(msg);
  }

  

  function handleDbError(err, fallbackMsg) {
    try {
      if (isPermissionDenied(err)) {
        WRITE_DENIED = true;
        if (!WRITE_DENIED_TOASTED) {
          WRITE_DENIED_TOASTED = true;
          safeToast(
          tr("online.permissionDenied")
        );
        }
      } else if (fallbackMsg) {
        safeToast(fallbackMsg);
      }
    } catch {}
    try { console.warn("Firebase transaction error:", err); } catch {}
  }

  let WRITE_DENIED = false;
  let WRITE_DENIED_TOASTED = false;

  

  function guardOnlineWrite() {
    
    try {
      if (window.Online && window.Online.isSpectator) return false;
    } catch {}
    if (!WRITE_DENIED) return true;
    if (!WRITE_DENIED_TOASTED) {
      WRITE_DENIED_TOASTED = true;
      try {
        safeToast(
          tr("online.permissionDenied")
        );
      } catch {}
    }
    return false;
  }


  function getAuthDebug() {
    try {
      const u = (auth && auth.currentUser)
        ? auth.currentUser
        : (firebase && firebase.auth ? firebase.auth().currentUser : null);
      const signedIn = !!(u && u.uid);
      const authUid = signedIn ? String(u.uid) : null;
      return { signedIn, authUid };
    } catch {
      return { signedIn: false, authUid: null };
    }
  }

  function requireAuthUid(expectedUid) {
    const info = getAuthDebug();
    if (!info.signedIn || !info.authUid) return null;
    if (expectedUid != null && String(expectedUid) !== info.authUid) return null;
    return info.authUid;
  }

  function refPathString(ref) {
    try { return (ref && typeof ref.toString === "function") ? ref.toString() : String(ref || ""); } catch { return ""; }
  }

  function logDeniedWrite(meta, err) {
    try {
      const info = getAuthDebug();
      const op = meta && meta.op ? String(meta.op) : "write";
      const path = meta && meta.path ? String(meta.path) : (meta && meta.ref ? refPathString(meta.ref) : "");
      const uid = meta && meta.uid ? String(meta.uid) : "";
      const ctx = meta && meta.ctx ? String(meta.ctx) : "";
      console.warn("[RTDB DENIED]", { op, path, uid, auth: info, ctx });
      try { if (err) console.warn(err); } catch {}
    } catch {}
  }

  async function safeDbWrite(op, ref, data, meta) {
    meta = meta || {};
    meta.op = op;
    meta.ref = ref;

    if (!guardOnlineWrite()) return false;

    if (meta.uid != null) {
      const okUid = requireAuthUid(meta.uid);
      if (!okUid) return false;
    } else {
      const info = getAuthDebug();
      if (!info.signedIn) return false;
    }

    try {
      if (op === "update") { await ref.update(data); return true; }
      if (op === "set") { await ref.set(data); return true; }
      if (op === "remove") { await ref.remove(); return true; }
      if (op === "push") { await ref.push(data); return true; }
      await ref.set(data);
      return true;
    } catch (err) {
      if (isPermissionDenied(err)) {
        logDeniedWrite(meta, err);
        try { if (typeof meta.onDenied === "function") meta.onDenied(err); } catch {}
        if (!meta.suppressGlobalDenied) handleDbError(err);
        return false;
      }
      try { console.warn("[RTDB WRITE FAIL]", meta && meta.path ? meta.path : refPathString(ref), err); } catch {}
      return false;
    }
  }

  function safeDbWriteNoAwait(op, ref, data, meta) {
    meta = meta || {};
    meta.op = op;
    meta.ref = ref;

    if (!guardOnlineWrite()) return false;

    if (meta.uid != null) {
      const okUid = requireAuthUid(meta.uid);
      if (!okUid) return false;
    } else {
      const info = getAuthDebug();
      if (!info.signedIn) return false;
    }

    try {
      let p;
      if (op === "update") p = ref.update(data);
      else if (op === "set") p = ref.set(data);
      else if (op === "remove") p = ref.remove();
      else if (op === "push") p = ref.push(data);
      else p = ref.set(data);

      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          if (isPermissionDenied(err)) {
            logDeniedWrite(meta, err);
            try { if (typeof meta.onDenied === "function") meta.onDenied(err); } catch {}
            if (!meta.suppressGlobalDenied) handleDbError(err);
          } else {
            try { console.warn("[RTDB WRITE FAIL]", meta && meta.path ? meta.path : refPathString(ref), err); } catch {}
          }
        });
      }
      return true;
    } catch (err) {
      if (isPermissionDenied(err)) {
        logDeniedWrite(meta, err);
        try { if (typeof meta.onDenied === "function") meta.onDenied(err); } catch {}
        if (!meta.suppressGlobalDenied) handleDbError(err);
      }
      return false;
    }
  }

  async function safePlayerWrite(ref, uid, data, ctx, onDenied) {
    uid = String(uid || "");
    if (!uid) return false;
    return await safeDbWrite("update", ref, data, { uid, path: "/players/" + uid, ctx, onDenied });
  }
  function safePlayerWriteNoAwait(ref, uid, data, ctx, onDenied) {
    uid = String(uid || "");
    if (!uid) return false;
    return safeDbWriteNoAwait("update", ref, data, { uid, path: "/players/" + uid, ctx, onDenied });
  }

  function isGamePage() {
    try { return !!document.getElementById("board"); } catch { return false; }
  }

  
  function escapeHtml(s) {
    const str = String(s == null ? "" : s);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
const firebaseConfig = (window.firebaseConfig && typeof window.firebaseConfig === "object")
    ? window.firebaseConfig
    : {
        apiKey: "AIzaSyCUBq5oqhh0BbpnWQBMeMD5lDLyhksIKKU",
    authDomain: "dhamet-730e1.firebaseapp.com",
    databaseURL: "https://dhamet-730e1-default-rtdb.firebaseio.com",
    projectId: "dhamet-730e1",
    storageBucket: "dhamet-730e1.firebasestorage.app",
    messagingSenderId: "739113803012",
    appId: "1:739113803012:web:5b06ffae26fb3ebfa08451"
      };

  let db = null;
  let auth = null;

  

  function safeToast(msg, title) {
    
    try {
      if (document.body && document.body.classList && document.body.classList.contains("z-spectator")) return;
    } catch (_) {}
    const titleText = title || tr("modals.notice");
    const safeMsg = String(msg ?? "");
    try {
      if (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function") {
        const div = document.createElement("div");
        div.style.whiteSpace = "pre-wrap";
        div.textContent = safeMsg;
        Modal.open({
          title: titleText,
          body: div,
          buttons: [
            {
              label: tr("modals.ok"),
              className: "primary",
              onClick: () => Modal.close(),
            },
          ],
        });
        return;
      }
    } catch (e) {
      console.warn("Modal failed:", e);
    }
    try {
      alert(safeMsg);
    } catch {}
  }

  

  function ensureFirebase() {
    if (db && auth) return true;
    try {
      if (typeof firebase === "undefined") return false;
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      auth = firebase.auth();
      return true;
    } catch (e) {
      console.warn("Firebase init failed:", e);
      return false;
    }
  }

  

  function nowTs() {
    return firebase && firebase.database
      ? firebase.database.ServerValue.TIMESTAMP
      : Date.now();
  }

  
  

  
  function localNow() {
    return Date.now();
  }



  

  const PERSIST_GAME_ID_KEY = "zamat.activeGameId";
  const PERSIST_GAME_TS_KEY = "zamat.activeGameTs";

  function ssGet(k) {
    try { return sessionStorage.getItem(k); } catch { return null; }
  }
  function ssSet(k, v) {
    try { sessionStorage.setItem(k, v); } catch {}
  }
  function ssRemove(k) {
    try { sessionStorage.removeItem(k); } catch {}
  }
  
  
  


  

  function nickSuffixFromUid(uid) {
    try {
      const s = String(uid || "");
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      
      const n = (h % 9000) + 1000;
      return String(n);
    } catch {
      return String(Math.floor(1000 + Math.random() * 9000));
    }
  }

  

  function defaultNick(uid) {
    const base = tr("players.player");
    return `${base} ${nickSuffixFromUid(uid)}`;
  }

  
  const NICK_KEY = "zamat.nick";
  const NICK_EXPLICIT_KEY = "zamat.nickExplicit";

  
  
  
  
  const PRESENCE_UI_TTL_MS = 20 * 1000;          
  const PRESENCE_HEARTBEAT_MS = 10 * 1000;       
  const GAME_PRESENCE_HEARTBEAT_MS = 10 * 1000;  

  const OPPONENT_ABSENCE_MS = 2 * 60 * 1000;
  const OPPONENT_ABSENCE_CHECK_MS = 5 * 1000;
  function getNickFromSessionUser(){
    try {
      const raw = sessionStorage.getItem("zamat.session.user.v1");
      if (!raw) return "";
      const obj = JSON.parse(raw);
      const n = (obj && obj.nickname) ? String(obj.nickname).trim() : "";
      return n;
    } catch { return ""; }
  }

  function migrateLegacyNickToSession(){
    try {
      const legacy = (localStorage.getItem(NICK_KEY) || "").trim();
      if (legacy) {
        try { sessionStorage.setItem(NICK_KEY, legacy); } catch {}
      }
    } catch {}
    try { localStorage.removeItem(NICK_KEY); } catch {}
    try { localStorage.removeItem(NICK_EXPLICIT_KEY); } catch {}
  }

  function getSavedNick(){
    const fromSessionUser = getNickFromSessionUser();
    if (fromSessionUser) return fromSessionUser;
    try {
      const n = (sessionStorage.getItem(NICK_KEY) || "").trim();
      if (n) return n;
    } catch {}

    
    migrateLegacyNickToSession();
    try { return (sessionStorage.getItem(NICK_KEY) || "").trim(); } catch { return ""; }
  }

  function saveNickSession(nick, explicit){
    try {
      sessionStorage.setItem(NICK_KEY, String(nick || ""));
      if (explicit) sessionStorage.setItem(NICK_EXPLICIT_KEY, "1");
    } catch {}
    
    try { localStorage.removeItem(NICK_KEY); } catch {}
    try { localStorage.removeItem(NICK_EXPLICIT_KEY); } catch {}
  }

  let _authReadyPromise = null;
  async function ensureAuthReady() {
    if (!ensureFirebase()) return false;
    try {
      if (auth && auth.currentUser) return true;
      if (!_authReadyPromise) {
        _authReadyPromise = auth
          .signInAnonymously()
          .catch((e) => {
            console.warn("Anon auth failed:", e);
            return null;
          })
          .then(() => !!(auth && auth.currentUser));
      }
      return await _authReadyPromise;
    } catch {
      return false;
    }
  }

  

  function getSavedNickOrDefault(uid) {
    const saved = getSavedNick();
    const nick = saved || defaultNick(uid);
    
    if (!getNickFromSessionUser()) {
      saveNickSession(nick, !!saved);
    }
    return nick;
  }

  
  
  
  const ALLOWED_USER_ICONS = (function(){
    const a = ["assets/icons/users/user.svg"];
    for (let i=1;i<=10;i++) a.push("assets/icons/users/user"+i+".svg");
    return a;
  })();

  function sanitizeUserIcon(p) {
    p = String(p || "").trim();
    if (!p) return "";
    
    if (/^assets\/icons\/usre1\.svg$/i.test(p)) p = "assets/icons/users/user1.svg";
    
    const m = p.match(/^assets\/icons\/user(\d{1,2})\.svg$/i);
    if (m) p = `assets/icons/users/user${m[1]}.svg`;
    if (/^assets\/icons\/user\.svg$/i.test(p)) p = "assets/icons/users/user.svg";

    if (!/^assets\/icons\/users\/[a-z0-9_-]+\.(svg|png)$/i.test(p)) return "";
    if (!ALLOWED_USER_ICONS.includes(p)) return "";
    return p;
  }

const ASSET_PREFIX = (function(){
  try {
    const p = (location && location.pathname) ? String(location.pathname) : "";
    return p.includes("/pages/") ? "../" : "";
  } catch { return ""; }
})();

function iconSrcForPage(p){
  const ic = sanitizeUserIcon(p) || "assets/icons/users/user1.svg";
  return ASSET_PREFIX + ic;
}

function getSavedIconOrDefault() {

    const def = "assets/icons/users/user1.svg";
    try {
      const raw = sessionStorage.getItem("zamat.session.user.v1");
      if (raw) {
        const obj = JSON.parse(raw);
        const ic = sanitizeUserIcon(obj && obj.icon);
        if (ic) return ic;
      }
    } catch {}

    try {
      const ic = sanitizeUserIcon(localStorage.getItem("zamat.icon"));
      if (ic) return ic;
    } catch {}

    return def;
  }


function askNickname() {
    return new Promise((resolve) => {
      
      const saved = getSavedNick();

      const title = tr("modals.pickOnlineNickTitle");
      const label = tr("modals.pickOnlineNickLabel");
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="modal-field">
          <label style="display:block;margin-bottom:6px;font-weight:600;">${label}</label>
          <input id="nickInput" class="input" type="text" maxlength="18" placeholder="${label}" value="${saved}" />
        </div>
      `;

      Modal.open({
        title,
        body,
        buttons: [
          {
            label: tr("actions.ok"),
            className: "primary",
            onClick: () => {
              let nick =
                (document.getElementById("nickInput")?.value || "").trim();

              if (!nick) {
                
                const uid = (auth && auth.currentUser && auth.currentUser.uid) || "";
                nick = defaultNick(uid);
              }

              saveNickSession(nick, true);
              Modal.close();
              resolve(nick);
            },
          },
          {
            label: tr("actions.cancel"),
            className: "secondary",
            onClick: () => {
              Modal.close();
              
              const uid = (auth && auth.currentUser && auth.currentUser.uid) || "";
              resolve(saved || defaultNick(uid));
            },
          },
        ],
        onOpen: () => {
          setTimeout(() => document.getElementById("nickInput")?.focus(), 50);
        },
      });
    });
  }



function stripUndefined(x) {
  if (x === undefined) return undefined;
  if (x === null) return null;

  if (Array.isArray(x)) {
    return x.map(stripUndefined).filter(v => v !== undefined);
  }
  if (typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x)) {
      const v = stripUndefined(x[k]);
      if (v !== undefined) o[k] = v;
    }
    return o;
  }
  return x;
}



function askRoomName() {
  return new Promise((resolve) => {
    try {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "10px";

      const p = document.createElement("div");
      p.textContent = tr("online.roomNamePrompt");

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 30;
      input.placeholder = tr("online.roomNamePlaceholder");
      input.style.padding = "10px";
      input.style.border = "1px solid #666";
      input.style.borderRadius = "10px";
      input.autocomplete = "off";

      wrap.appendChild(p);
      wrap.appendChild(input);

      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve((v || "").trim());
      };

      const submit = () => {
        const v = (input.value || "").trim();
        if (!v) {
          try { input.focus(); } catch {}
          return;
        }
        
        finish(v);
        try { Modal.close(); } catch {}
      };

      Modal.open({
        title: tr("online.roomNameTitle"),
        body: wrap,
        buttons: [
          {
            label: tr("actions.continue"),
            className: "ok",
            onClick: submit,
          },
          {
            label: tr("actions.cancel"),
            className: "ghost",
            onClick: () => {
              
              finish("");
              try { Modal.close(); } catch {}
            },
          },
        ],
        allowEsc: true,
        onClose: () => finish(""),
      });

      setTimeout(() => {
        try { input.focus(); } catch {}
      }, 0);

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    } catch {
      resolve("");
    }
  });
}



function hasExplicitNick(uid) {
  try {
    const flag = (sessionStorage.getItem(NICK_EXPLICIT_KEY) || "") === "1";
    if (flag) return true;

    const saved = getSavedNick();
    if (!saved) return false;

    const u = uid || (auth && auth.currentUser && auth.currentUser.uid) || "";
    if (!u) return true; 
    const def = defaultNick(u);
    return saved !== def;
  } catch {
    return false;
  }
}


  


  function souflaToPlain(pending) {
    if (!pending) return null;
    const lb = [];
    try {
      pending.longestByPiece &&
        pending.longestByPiece.forEach((v, k) => lb.push([k, v]));
    } catch {}
    return {
      offenders: pending.offenders || [],
      longestByPiece: lb,
      longestGlobal: pending.longestGlobal || 0,
      options: pending.options || [],
     turnStartSnapshot: stripUndefined(pending.turnStartSnapshot) || null,
      lastPieceIdx: pending.lastPieceIdx != null ? pending.lastPieceIdx : null,
      startedFrom: pending.startedFrom != null ? pending.startedFrom : null,
      lastMoveFrom: pending.lastMoveFrom != null ? pending.lastMoveFrom : null,
      lastMovePath: Array.isArray(pending.lastMovePath) ? pending.lastMovePath.slice() : null,
      penalizer: pending.penalizer,
    };
  }

  

  function plainToSoufla(plain) {
    if (!plain) return null;
    const m = new Map();
    (plain.longestByPiece || []).forEach(([k, v]) => m.set(k, v));
    return {
      offenders: plain.offenders || [],
      longestByPiece: m,
      longestGlobal: plain.longestGlobal || 0,
      options: plain.options || [],
      turnStartSnapshot: plain.turnStartSnapshot || null,
      lastPieceIdx: plain.lastPieceIdx != null ? plain.lastPieceIdx : null,
      startedFrom: plain.startedFrom != null ? plain.startedFrom : null,
      lastMoveFrom: plain.lastMoveFrom != null ? plain.lastMoveFrom : null,
      lastMovePath: Array.isArray(plain.lastMovePath) ? plain.lastMovePath.slice() : null,
      penalizer: plain.penalizer,
    };
  }

  const Online = {
    isActive: false,
    myUid: null,
    mySide: null, 
    myNick: "",
    gameId: null,
    gameRef: null,
    playersRef: null,
    invitesRef: null,
    statusRef: null,

    moveIndex: 0, 
    ply: 0, 
    _pendingSteps: [],
    _cachedSouflaPlain: null,
    _isApplyingRemote: false,
    _lastTrainLoggedMoveIndex: 0,

    _awaitingLocalCommit: false,
    _expectedMoveIndex: null,

    _moveRetryTimer: null,
    _moveRetryAttempt: 0,
    _moveRetryArgs: null,
    _moveRetryNotified: false,
    _lobbyUnsub: null,
_viewHooksInstalled: false,
    _lastSeenMoveModal: 0,
    _lastSouflaFXMoveIndex: null,
    _disabledGuardsInstalled: false,

    _undoWaitOpen: false,
    _undoWaitKey: null,
    _undoWaitDismissedKey: null,
    _undoWaitAutoClose: false,


    _presenceInited: false,
    _presenceStatus: "vsComputer",
    _presenceRole: null,
    _presenceRoomId: null,
_lobbyOpenedAt: 0,
    _inviteQuery: null,
    _inviteCleanupInterval: null,
    _inviteCleanupRunning: false,


    presenceRef: null,
_oppOfflineSince: null,
    _oppLeftModalShown: false,
    _oppAbsenceWatchTimer: null,
_oppName: "",
_lastRenderedLogKey: "",
    _wasConnected: true,

    _selfConnected: true,
    _oppOnline: true,

    _presenceUiReady: false,
    _aiStateBackup: null,
    _presenceChipTop: null,
    _presenceChipBot: null,
    _topDisplayName: "",
    _botDisplayName: "",



    


    _installViewHooksOnce: function() {
      if (this._viewHooksInstalled) return;
      this._viewHooksInstalled = true;

      const N = 9;
      const self = this;

      try {
        if (!window.__zamat_orig_toViewRC) window.__zamat_orig_toViewRC = window.toViewRC;
        if (!window.__zamat_orig_fromViewRC) window.__zamat_orig_fromViewRC = window.fromViewRC;
        if (!window.__zamat_orig_drawCoords) window.__zamat_orig_drawCoords = window.drawCoords;
      } catch {}

      window.toViewRC = function (r, c) {
        try {
          if (window.Online && window.Online.isActive && window.Online.mySide === +1) {
            return [N - 1 - r, N - 1 - c];
          }
        } catch {}
        return [r, c];
      };

      window.fromViewRC = function (r, c) {
        try {
          if (window.Online && window.Online.isActive && window.Online.mySide === +1) {
            return [N - 1 - r, N - 1 - c];
          }
        } catch {}
        return [r, c];
      };

      if (typeof window.drawCoords === "function") {
        window.drawCoords = function (ctx, W, H) {
          try {
            ctx.save();
            ctx.fillStyle =
              getComputedStyle(document.documentElement)
                .getPropertyValue("--muted")
                .trim() || "#475569";
            ctx.font = "12px ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const stepX = W / N;
            const stepY = H / N;
            for (let r0 = 0; r0 < N; r0++) {
              for (let c0 = 0; c0 < N; c0++) {
                const [vr, vc] = window.toViewRC(r0, c0);
                const x = vc * stepX + stepX / 2;
                const y = vr * stepY + stepY / 2;
                ctx.fillText(`${vr}.${vc}`, x, y);
              }
            }
            ctx.restore();
          } catch (e) {
            try { (window.__zamat_orig_drawCoords || function(){ })(ctx, W, H); } catch {}
          }
        };
      }
    },
    

    _installDisabledButtonGuardsOnce: function() {
      if (this._disabledGuardsInstalled) return;
      this._disabledGuardsInstalled = true;

      const msg = tr("online.disabledButton");

      
      const handler = (ev) => {

try {
  if (!window.Online || !window.Online.isActive) return;
  const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
  if (!btn) return;

  const id = btn.id || "";

  
  if (id === "btnHint" || id === "btnExportHuman") {
    ev.preventDefault(); ev.stopPropagation();
    safeToast(msg);
    return;
  }
} catch {}
      };

      document.addEventListener("click", handler, true);
      this._disabledBtnsHandler = handler;
    },

    
_setButtonsVisualDisabled: function(on) {
      const disableIds = ["btnHint", "btnExportHuman"];
      disableIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (on) {
          if (el.dataset._oldDisplay == null) el.dataset._oldDisplay = el.style.display || "";
          el.style.display = "none";
        } else {
          el.style.display = el.dataset._oldDisplay || "";
        }
      });
    },

    

    _captureLogHtml: function() {
      try {
        const logEl = document.getElementById("log");
        if (!logEl) return null;
        const items = Array.from(logEl.querySelectorAll(".log-item")).slice(0, 80);
        const wrap = document.createElement("div");
        items.forEach((it) => wrap.appendChild(it.cloneNode(true)));
        return wrap.innerHTML;
      } catch {
        return null;
      }
    },

    
    

    
    start: function() {
      return this.startOnline();
    },



    

    _persistActiveGame: function() {
      try {
        if (!this.gameId) return;
        ssSet(PERSIST_GAME_ID_KEY, String(this.gameId));
        ssSet(PERSIST_GAME_TS_KEY, String(Date.now()));
      } catch {}
    },

    

    _clearPersistedActiveGame: function() {
      try { ssRemove(PERSIST_GAME_ID_KEY); } catch {}
      try { ssRemove(PERSIST_GAME_TS_KEY); } catch {}
    },

    

    _tryResumePersistedGame: async function() {
      try {
        if (this.isActive) return false;
        const gid = String(ssGet(PERSIST_GAME_ID_KEY) || "").trim();
        if (!gid) return false;

        const ok = await ensureAuthReady();
        if (!ok || !auth || !auth.currentUser) {
          this._clearPersistedActiveGame();
          return false;
        }

        const myUid = auth.currentUser.uid;
        const snap = await db.ref("games").child(gid).once("value");
        const g = snap && snap.val ? snap.val() : null;

        if (!g || g.status !== "active" || !g.players) {
          this._clearPersistedActiveGame();
          return false;
        }

        const wUid = g.players.white && g.players.white.uid ? g.players.white.uid : null;
        const bUid = g.players.black && g.players.black.uid ? g.players.black.uid : null;

        const side = wUid === myUid ? -1 : (bUid === myUid ? +1 : null);
        if (side == null) {
          this._clearPersistedActiveGame();
          return false;
        }

        
        this.myUid = myUid;
        if (!this.playersRef) this.playersRef = db.ref("players");
        if (!this.invitesRef) this.invitesRef = db.ref("invites").child(this.myUid);
        if (!this.statusRef) this.statusRef = this.playersRef.child(this.myUid);

        this.myNick = this.myNick || getSavedNickOrDefault(this.myUid);

        this.mySide = side;
        this.isActive = true;
        this.gameId = gid;
        this.gameRef = db.ref("games").child(gid);

        this._setOnlineButtonsState(true);

        try { this._presenceStatus = "inPvP"; this._presenceRole = "player"; this._presenceRoomId = gid; } catch {}
        try {
          await safePlayerWrite(this.statusRef, this.myUid, {
status: "inPvP",
            role: "player",
            roomId: gid,
            nickname: this.myNick,
            updatedAt: nowTs(),
          }, "players.status");
} catch {}

        try {
          Game.settings.starter = "white";
          setupInitialBoard();
          try { Turn.start(); } catch {}
        } catch {}

        this._bindGameListeners();
      try { this._startOpponentAbsenceWatcher(); } catch {}
        return true;
      } catch {
        try { this._clearPersistedActiveGame(); } catch {}
        return false;
      }
    },

    

    _ensurePresenceUi: function() {
      if (this._presenceUiReady) return;
      try {
        const wrap = document.querySelector(".ai-state");
        if (!wrap) return;

        if (!this._aiStateBackup) {
          this._aiStateBackup = {
            html: wrap.innerHTML,
            display: wrap.style.display || "",
            justifyContent: wrap.style.justifyContent || "",
            alignItems: wrap.style.alignItems || "",
            flexDirection: wrap.style.flexDirection || "",
            textAlign: wrap.style.textAlign || "",
            width: wrap.style.width || "",
            marginLeft: wrap.style.marginLeft || "",
            marginRight: wrap.style.marginRight || "",
            alignSelf: wrap.style.alignSelf || "",
          };
        }

        try { wrap.style.setProperty("display", "flex", "important"); } catch { wrap.style.display = "flex"; }

        
        try { wrap.style.setProperty("justify-content", "center", "important"); } catch { wrap.style.justifyContent = "center"; }
        try { wrap.style.setProperty("align-items", "center", "important"); } catch { wrap.style.alignItems = "center"; }
        try { wrap.style.setProperty("flex-direction", "row", "important"); } catch { wrap.style.flexDirection = "row"; }
        try { wrap.style.setProperty("gap", "10px", "important"); } catch { wrap.style.gap = "10px"; }
        try { wrap.style.setProperty("flex-wrap", "nowrap", "important"); } catch { wrap.style.flexWrap = "nowrap"; }
        try { wrap.style.setProperty("text-align", "center", "important"); } catch { wrap.style.textAlign = "center"; }
        try { wrap.style.setProperty("margin-left", "auto", "important"); } catch { wrap.style.marginLeft = "auto"; }
        try { wrap.style.setProperty("margin-right", "auto", "important"); } catch { wrap.style.marginRight = "auto"; }
        try { wrap.style.setProperty("align-self", "center", "important"); } catch { wrap.style.alignSelf = "center"; }
        try { wrap.style.setProperty("width", "100%", "important"); } catch { wrap.style.width = "100%"; }

        const muted = wrap.querySelector(".muted");
        if (muted) {
          try { muted.style.setProperty("display", "none", "important"); } catch { muted.style.display = "none"; }
        }

        const chips = wrap.querySelectorAll(".ai-chip");
        if (!chips || chips.length < 2) return;

        this._presenceChipTop = chips[0];
        this._presenceChipBot = chips[1];

        this._renderPresenceChip(this._presenceChipTop, this._topDisplayName || "");
        this._renderPresenceChip(this._presenceChipBot, this._botDisplayName || "");

        this._presenceUiReady = true;
        this._updatePresenceUi();
      } catch {}
    },

    

    _restoreAiStateUi: function() {
      try {
        if (!this._aiStateBackup) return;
        const wrap = document.querySelector(".ai-state");
        if (!wrap) return;
        wrap.innerHTML = this._aiStateBackup.html;
        wrap.style.display = this._aiStateBackup.display;
        wrap.style.justifyContent = this._aiStateBackup.justifyContent || "";
        wrap.style.alignItems = this._aiStateBackup.alignItems || "";
        wrap.style.flexDirection = this._aiStateBackup.flexDirection || "";
        wrap.style.textAlign = this._aiStateBackup.textAlign || "";
        wrap.style.width = this._aiStateBackup.width || "";
        wrap.style.marginLeft = this._aiStateBackup.marginLeft || "";
        wrap.style.marginRight = this._aiStateBackup.marginRight || "";
        wrap.style.alignSelf = this._aiStateBackup.alignSelf || "";
      } catch {}

      this._presenceUiReady = false;
      this._aiStateBackup = null;
      this._presenceChipTop = null;
      this._presenceChipBot = null;
    },

    

    _renderPresenceChip: function(chipEl, nameText) {
      try {
        if (!chipEl) return;
        chipEl.innerHTML = "";

        chipEl.style.display = "inline-flex";
        chipEl.style.alignItems = "center";
        chipEl.style.gap = "6px";
        chipEl.style.maxWidth = "100%";
        chipEl.style.overflow = "hidden";

        
        chipEl.style.marginLeft = "0";
        chipEl.style.marginRight = "0";
        chipEl.style.flex = "1 1 0";
        chipEl.style.minWidth = "0";

        const dot = document.createElement("span");
        dot.textContent = "●";
        dot.setAttribute("data-presence-dot", "1");
        dot.style.flex = "0 0 auto";

        const nm = document.createElement("span");
        nm.setAttribute("data-presence-name", "1");
        nm.textContent = nameText || "";
        nm.style.flex = "1 1 auto";
        nm.style.minWidth = "0";
        nm.style.overflow = "hidden";
        nm.style.textOverflow = "ellipsis";
        nm.style.whiteSpace = "nowrap";

        chipEl.appendChild(dot);
        chipEl.appendChild(nm);
      } catch {}
    },

    

    _updatePresenceUi: function() {
      if (!this._presenceUiReady) return;

      const setChip = (chipEl, nameText, online) => {
        try {
          if (!chipEl) return;
          const nm = chipEl.querySelector('[data-presence-name="1"]');
          const dot = chipEl.querySelector('[data-presence-dot="1"]');
          if (nm) nm.textContent = nameText || "";
          
          if (dot) dot.style.color = online ? "#22c55e" : "#ef4444";
        } catch {}
      };

      
      setChip(this._presenceChipTop, this._topDisplayName || "", !!this._oppOnline);
      setChip(this._presenceChipBot, this._botDisplayName || "", !!this._selfConnected);
    },

    
    

    


    _endByAbsence: async function() {
      if (!this.gameRef) return;
      try {
        await this.gameRef.transaction((g) => {
          if (!g || g.status !== "active") return g;
          g.status = "ended";
          g.endedAt = nowTs();
          g.endedReason = "opponent_absent";
          g.winner = this.mySide;

          g.log = Array.isArray(g.log) ? g.log : [];
          const who = this.myNick || tr("players.player");
          g.log.push({
            ts: nowTs(),
            type: "ended_absent",
            text: formatTpl(tr("online.log.endedAbsent"), { player: who }),
          });
          if (g.log.length > 200) g.log = g.log.slice(-200);
          return g;
        });
      } catch (e) {
        console.warn("endByAbsence failed:", e);
        safeToast(tr("online.endFail"));
      }
    },
    

    initPresence: async function() {
      if (this._presenceInited) return true;

      const ok = await ensureAuthReady();
      if (!ok) return false;

      try {
        this.myUid = auth.currentUser.uid;
        this.playersRef = db.ref("players");
        this.invitesRef = db.ref("invites").child(this.myUid);
        this.statusRef = this.playersRef.child(this.myUid);

        this.myNick = getSavedNickOrDefault(this.myUid);
        this.myIcon = getSavedIconOrDefault();

        
        this._presenceStatus = "vsComputer";
        this._presenceRole = null;
        this._presenceRoomId = null;

        const serverNow = () => (
          (firebase && firebase.database && firebase.database.ServerValue)
            ? firebase.database.ServerValue.TIMESTAMP
            : nowTs()
        );

        const payload = () => ({
          status: this._presenceStatus || "vsComputer",
          role: this._presenceRole || (
            this._presenceStatus === "inPvP" ? "player" :
            this._presenceStatus === "spectating" ? "spectator" :
            this._presenceStatus === "available" ? "lobby" : null
          ),
          roomId: this._presenceRoomId || null,
          nickname: this.myNick || getSavedNickOrDefault(this.myUid),
          icon: this.myIcon || getSavedIconOrDefault(),
          
          updatedAt: serverNow(),
        });

        
        
        
        try {
          this._presenceConnInfoRef = db.ref(".info/connected");
          this._presenceConnInfoHandler = (s) => {
            const connected = !!(s && s.val && s.val());
            if (!connected) return;

            try { this.statusRef.onDisconnect().remove(); } catch {}
            try {
              const okW = safePlayerWriteNoAwait(this.statusRef, this.myUid, payload(), "players.conn.reconnect", () => {
                try { this._stopPresenceHeartbeat(); } catch {}
              });
              if (okW) { try { this._startPresenceHeartbeat(); } catch {} }
            } catch {}
          };
          this._presenceConnInfoRef.on("value", this._presenceConnInfoHandler);
        } catch {}

        
        try { this.statusRef.onDisconnect().remove(); } catch {}
        try { safePlayerWriteNoAwait(this.statusRef, this.myUid, payload(), "players.initPresence"); } catch {}

        this._presenceInited = true;
        try { this._startPresenceHeartbeat(); } catch {}

        
        try { this._bindLifecycleCleanup(); } catch {}

        
        try { if (typeof isGamePage === "function" && isGamePage()) await this._tryResumePersistedGame(); } catch {}
        return true;
      } catch {
        return false;
      }
    },

    _startPresenceHeartbeat: function() {
      try {
        if (!this.statusRef || !this.myUid) return;
        if (this._presenceHeartbeatTimer) return;
        const tick = () => {
          try {
            
            const ts = (firebase && firebase.database && firebase.database.ServerValue)
              ? firebase.database.ServerValue.TIMESTAMP
              : nowTs();
            // Guarded presence heartbeat update (avoid permission_denied loops)
            if (!requireAuthUid(this.myUid)) { try { this._stopPresenceHeartbeat(); } catch {} return; }
            const hb = {
              updatedAt: ts,
              status: this._presenceStatus || "vsComputer",
              nickname: this.myNick || getSavedNickOrDefault(this.myUid),
            };
            try { if (this._presenceRole) hb.role = this._presenceRole; } catch {}
            try { if (this._presenceRoomId) hb.roomId = String(this._presenceRoomId); } catch {}
            try { hb.icon = this.myIcon || getSavedIconOrDefault(); } catch {}
            safePlayerWriteNoAwait(this.statusRef, this.myUid, hb, "players.heartbeat", () => { try { this._stopPresenceHeartbeat(); } catch {} });
          } catch {}
        };
        tick();
        this._presenceHeartbeatTimer = setInterval(tick, PRESENCE_HEARTBEAT_MS);
      } catch {}
    },

    _stopPresenceHeartbeat: function() {
      try {
        if (this._presenceHeartbeatTimer) clearInterval(this._presenceHeartbeatTimer);
      } catch {}
      this._presenceHeartbeatTimer = null;
    },

    
    _startGamePresenceHeartbeat: function() {
      try {
        if (!this.presenceRef) return;
        if (this._gamePresenceHeartbeatTimer) return;
        const tick = () => {
          try {
            const ts = (firebase && firebase.database && firebase.database.ServerValue)
              ? firebase.database.ServerValue.TIMESTAMP
              : nowTs();
            // Guarded game presence heartbeat update (avoid permission_denied loops)
            if (!requireAuthUid(this.myUid)) { try { this._stopGamePresenceHeartbeat(); } catch {} return; }
            const hb = { updatedAt: ts };
            safeDbWriteNoAwait("update", this.presenceRef, hb, {
              uid: this.myUid,
              path: "/games/" + (this.gameId || "") + "/presence/" + this.myUid,
              ctx: "gamePresence.heartbeat",
              onDenied: () => { try { this._stopGamePresenceHeartbeat(); } catch {} }
            });
          } catch {}
        };
        tick();
        this._gamePresenceHeartbeatTimer = setInterval(tick, GAME_PRESENCE_HEARTBEAT_MS);
      } catch {}
    },

    _stopGamePresenceHeartbeat: function() {
      try {
        if (this._gamePresenceHeartbeatTimer) clearInterval(this._gamePresenceHeartbeatTimer);
      } catch {}
      this._gamePresenceHeartbeatTimer = null;
    },



    _startOpponentAbsenceWatcher: function() {
      try {
        if (this.isSpectator) return;
        if (!this.isActive) return;
        if (this._oppAbsenceWatchTimer) return;
        const tick = () => {
          try { this._checkOpponentAbsence(); } catch {}
        };
        tick();
        this._oppAbsenceWatchTimer = setInterval(tick, OPPONENT_ABSENCE_CHECK_MS);
      } catch {}
    },

    _stopOpponentAbsenceWatcher: function() {
      try {
        if (this._oppAbsenceWatchTimer) clearInterval(this._oppAbsenceWatchTimer);
      } catch {}
      this._oppAbsenceWatchTimer = null;
      try { this._oppOfflineSince = null; } catch {}
      try { this._oppLeftModalShown = false; } catch {}
    },

    _checkOpponentAbsence: function() {
      try {
        if (this.isSpectator) return;
        if (!this.isActive || !this.gameRef) return;

        try {
          const g = this._lastGameData;
          if (g && g.status && g.status !== "active") return;
        } catch {}

        try { if (this._localEndedOnline) return; } catch {}

        const now = nowTs();
        const oppOnline = !!this._oppOnline;

        if (oppOnline) {
          this._oppOfflineSince = null;
          this._oppLeftModalShown = false;
          return;
        }

        if (!this._oppOfflineSince) this._oppOfflineSince = now;

        const dt = now - this._oppOfflineSince;
        if (dt >= OPPONENT_ABSENCE_MS && !this._oppLeftModalShown) {
          this._openOpponentAbsenceModal();
        }
      } catch {}
    },

    _openOpponentAbsenceModal: function() {
      try {
        if (this._oppLeftModalShown) return;
        this._oppLeftModalShown = true;

        let opp = "";
        try { opp = String(this._oppName || "").trim(); } catch {}
        if (!opp) opp = tr("online.opponent", "Opponent");

        const titleText = tr("online.absenceTitle", "Opponent absent");
        const bodyText = formatTpl(
          tr("online.absencePrompt",
            "Player {player} has been offline for two minutes, do you want to wait or end the match?"),
          { player: opp }
        );

        if (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function") {
          const div = document.createElement("div");
          div.style.whiteSpace = "pre-wrap";
          div.textContent = bodyText;

          Modal.open({
            title: titleText,
            body: div,
            buttons: [
              {
                label: tr("actions.wait", "Wait"),
                className: "primary",
                onClick: () => {
                  try { Modal.close(); } catch {}
                  try { this.syncNow(); } catch {}
                },
              },
              {
                label: tr("actions.endMatch", "End match"),
                className: "danger",
                onClick: () => {
                  try { Modal.close(); } catch {}
                  try { this.leaveRoom(); } catch {}
                },
              },
            ],
          });
          return;
        }

        const msg =
          titleText +
          "\n\n" +
          bodyText +
          "\n\n" +
          tr("actions.wait", "Wait") +
          " = OK\n" +
          tr("actions.endMatch", "End match") +
          " = Cancel";

        const ok = confirm(msg);
        if (ok) {
          try { this.syncNow(); } catch {}
        } else {
          try { this.leaveRoom(); } catch {}
        }
      } catch (e) {
        try { console.warn("absence modal failed:", e); } catch {}
      }
    },

    _bindLifecycleCleanup: function() {
      try {
        if (this._lifecycleBound) return;
        this._lifecycleBound = true;

        const cleanup = () => {
          try { this._stopPresenceHeartbeat(); } catch {}
          try { if (this._stopGamePresenceHeartbeat) this._stopGamePresenceHeartbeat(); } catch {}

          // Do not aggressively remove presence/status on same-tab internal navigation while PvP is active.
          // This avoids treating internal navigation (rules/about/etc.) as an explicit PvP exit.
          let internalNav = false;
          try {
            const ts = parseInt(ssGet("zamat.internalNavTs") || "0", 10);
            internalNav = !!(ts && (Date.now() - ts) < 2500);
          } catch {}

          const hasActiveGame = !!(this.gameId || this._presenceRoomId || (ssGet && ssGet(PERSIST_GAME_ID_KEY)));
          const isPvpContext = !!(this.isActive || this._presenceStatus === "inPvP" || this._presenceRole === "player");

          if (internalNav && hasActiveGame && isPvpContext) {
            // Rely on RTDB onDisconnect() to clear presence if the connection truly closes.
            return;
          }

          try { if (this.statusRef) this.statusRef.remove(); } catch {}
          try { if (this.presenceRef) this.presenceRef.remove(); } catch {}
        };

        
        window.addEventListener("pagehide", cleanup, { capture: true });
        window.addEventListener("beforeunload", cleanup, { capture: true });
      } catch {}
    },

    
    
    initInvitesPassive: async function() {
      try {
        if (!window.firebase || !firebase.auth || !firebase.database) return;
        if (!this._presenceInited) {
          await this.initPresence();
        }
        const user = firebase.auth().currentUser;
        if (!user) return;

        this.myUid = user.uid;
        const db = firebase.database();
        if (!this.playersRef) this.playersRef = db.ref("players");
        if (!this.invitesRef) this.invitesRef = db.ref("invites").child(this.myUid);
        if (!this.statusRef && this.playersRef) this.statusRef = this.playersRef.child(this.myUid);

        if (this._invitesPassiveOn) return;
        this._invitesPassiveOn = true;

        if (typeof this._listenInvites === "function") {
          this._listenInvites();
        }
      } catch (e) {
        console.warn("initInvitesPassive failed", e);
      }
    },

    
    
    _listenInvites: function() {
      try {
        this._bindInviteListener();
      } catch {}
    },

    

    _setLobbyStatus: async function(status) {
      try {
        if (!this.statusRef) return;
        this._presenceStatus = status;
        
        this._presenceRole =
          status === "available" ? "lobby" :
          status === "inPvP" ? "player" :
          status === "spectating" ? "spectator" :
          null;
        this._presenceRoomId = null;

        await safePlayerWrite(this.statusRef, this.myUid, {
          status,
          role: this._presenceRole,
          roomId: null,
          nickname: this.myNick,
          icon: this.myIcon || getSavedIconOrDefault(),
          updatedAt: (firebase && firebase.database && firebase.database.ServerValue)
            ? firebase.database.ServerValue.TIMESTAMP
            : nowTs(),
        }, "players.lobbyStatus", () => { try { this._stopPresenceHeartbeat(); } catch {} });
      } catch {}
    },

    
    

    _buildInitialSnapshot: function() {
      try {
        const N = (typeof BOARD_N === "number" && BOARD_N > 0) ? BOARD_N : 9;
        const board = Array.from({ length: N }, () => Array(N).fill(0));

        if (typeof MAN !== "number" || typeof TOP !== "number" || typeof BOT !== "number") {
          return null;
        }

        
        for (let r = 0; r <= 3; r++) {
          for (let c = 0; c < N; c++) board[r][c] = MAN * TOP;
        }
        for (let c = 0; c <= 3; c++) board[4][c] = MAN * TOP;
        board[4][4] = 0;
        for (let c = 5; c < N; c++) board[4][c] = MAN * BOT;
        for (let r = 5; r < N; r++) {
          for (let c = 0; c < N; c++) board[r][c] = MAN * BOT;
        }

        
        const player = BOT;

        return {
          board,
          player,
          inChain: false,
          chainPos: null,
          lastMovedTo: null,
          lastMovedFrom: null,
          lastMoveFrom: null,
          lastMovePath: null,
          moveCount: 0,
          forcedEnabled: true,
          forcedPly: 0,
        };
      } catch {
        return null;
      }
    },

    

    _clearPendingInviteWatcher: function() {
      try {
        if (this._pendingGameWatchRef && this._pendingGameWatchCb) {
          this._pendingGameWatchRef.off("value", this._pendingGameWatchCb);
        }
      } catch {}
      this._pendingGameWatchRef = null;
      this._pendingGameWatchCb = null;
      this._pendingGameId = null;
    },

    

    _watchPendingInvite: function(gameId) {
      try { this._clearPendingInviteWatcher(); } catch {}

      this._pendingGameId = gameId;
      const ref = db.ref("games").child(gameId);
      this._pendingGameWatchRef = ref;

      const cb = async (snap) => {
        const g = snap && snap.val ? snap.val() : null;
        if (!g) {
          try { this._clearPendingInviteWatcher(); } catch {}
          return;
        }

        const st = g.status;

        if (st === "active" || st === "pending") {
          
          const acceptedAt = (g && typeof g.acceptedAt === "number") ? g.acceptedAt : 0;
          if (!acceptedAt) return;

          try {
            const wu = g && g.players && g.players.white && g.players.white.uid;
            if (wu && wu !== this.myUid) return;
          } catch {}
          try { this._clearPendingInviteWatcher(); } catch {}
          if (!isGamePage()) {
            try { this._goToGameAsPlayer(gameId); } catch {}
          } else {
            try { await this._startInviterGame(gameId); } catch {}
          }
          return;
        }

        if (st === "rejected" || st === "ended") {
          try { this._clearPendingInviteWatcher(); } catch {}
          try {
            
            ref.remove();
          } catch {}

          if (st === "rejected") {
            try { safeToast(tr("online.ended.rejected")); } catch {}
          }
          return;
        }
      };

      this._pendingGameWatchCb = cb;
      ref.on("value", cb);
    },

    
    

    _startInviterGame: async function(gameId) {
      this.mySide = -1;
      this.isActive = true;

      try { this._lastTrainLoggedMoveIndex = 0; } catch {}

      try {
        this._pendingSteps = [];
        this._cachedSouflaPlain = null;
        this._awaitingLocalCommit = false;
        this._expectedMoveIndex = null;
      } catch {}

      this._setOnlineButtonsState(true);

      try { this._presenceStatus = "inPvP"; this._presenceRole = "player"; this._presenceRoomId = gameId; } catch {}
      try {
        await safePlayerWrite(this.statusRef, this.myUid, {
status: "inPvP",
          role: "player",
          roomId: gameId,
          nickname: this.myNick,
          icon: this.myIcon || getSavedIconOrDefault(),
          updatedAt: nowTs(),
          }, "players.status");
} catch {}

      try {
        Game.settings.starter = "white";
        setupInitialBoard();
        try { Turn.start(); } catch {}
      } catch {}

      this.gameId = gameId;
      this.gameRef = db.ref("games").child(gameId);


      // Ensure no stale onDisconnect purge is active from a prior match
      try { this._cleanupArmedFor = null; } catch {}
      try { this._cancelRoomPurgeOnDisconnect(); } catch {}

      
      try { db.ref("games").child(gameId).child("status").onDisconnect().cancel(); } catch {}
      try { db.ref("games").child(gameId).child("endedReason").onDisconnect().cancel(); } catch {}
      try { db.ref("games").child(gameId).child("endedAt").onDisconnect().cancel(); } catch {}

      this._bindGameListeners();
      try { await this._initRoomComms(); } catch {}
      try { this._persistActiveGame(); } catch {}
    },



    


    startOnline: async function() {
      const ok = await this.initPresence();
      if (!ok) {
        safeToast(tr("status.onlineInitFail"));
        return;
      }

      this._lobbyOpenedAt = localNow();

      try {
        
        const picked = ((await askNickname()) || "").trim();
        if (picked) this.myNick = picked;
        if (!this.myNick) this.myNick = getSavedNickOrDefault(this.myUid);
      } catch {}

      await this._setLobbyStatus("available");

      this._bindInviteListener();
      this._openLobbyModal();
    },

    

    _bindInviteListener: function() {
      try {
        if (this._inviteQuery) this._inviteQuery.off();
      } catch {}
      try {
        this.invitesRef && this.invitesRef.off();
      } catch {}
      try { this._stopInviteCleanup(); } catch {}

      if (!this.invitesRef) return;

      

      const handler = async (snap) => {
        const inv = snap.val();
        if (!inv || !inv.gameId) return;

        
        try {
          const t = inv && (inv.type || inv.kind);

          if (t === 'match_end') {
            const fromName = inv.fromNick || tr('players.player');
            try { snap.ref.remove(); } catch {}

            
            try {
              if (this.isActive && this.gameId && inv.gameId === this.gameId) {
                
                try {
                  await db.ref('games').child(inv.gameId).update({
                    status: 'ended',
                    endedAt: nowTs(),
                    endedReason: 'ended_by_player',
                    endedBy: { uid: inv.fromUid || null, nickname: fromName },
                  });
                } catch {}

                try { this._localEndedOnline = false; } catch {}
                try { this._enterPostMatch({ reason: 'ended_by_player', byNick: fromName }); } catch {}
              }
            } catch {}
            return;
          }

          if (t === 'rematch_request') {
            
            if (!this.isActive || !this.gameId || inv.gameId !== this.gameId || this.isSpectator) {
              try { snap.ref.remove(); } catch {}
              return;
            }

            const fromName = inv.fromNick || tr('players.player');
            const title = tr('online.rematch.title');
            const body = tr('online.rematch.body', { fromName });

            
const canModal = (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function");
const plainText = (html) => {
  try { return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); } catch (e) { return String(html || ""); }
};

if (!canModal) {
  const ok = window.confirm(String(title || "") + "\n\n" + plainText(body));
  try { snap.ref.remove(); } catch {}
  if (ok) {
    try { await this._acceptRematchInvite(inv, null); } catch {}
  } else {
    try { await this._rejectRematchInvite(inv, null); } catch {}
  }
  return;
}

Modal.open({
              title,
              body: `<div>${body}</div>`,
              buttons: [
                {
                  label: tr('actions.accept'),
                  className: 'ok',
                  onClick: async () => {
                    Modal.close();
                    try { await this._acceptRematchInvite(inv, snap.ref); } catch {}
                  },
                },
                {
                  label: tr('actions.reject'),
                  className: 'ghost',
                  onClick: async () => {
                    Modal.close();
                    try { await this._rejectRematchInvite(inv, snap.ref); } catch {}
                  },
                },
              ],
              
              onClose: async () => {
                try { await this._rejectRematchInvite(inv, snap.ref); } catch {}
              },
            });
            return;
          }

          if (t === 'rematch_accept') {
            try { snap.ref.remove(); } catch {}
            safeToast(tr('online.rematch.accepted'));
            return;
          }

          if (t === 'rematch_reject') {
  try { snap.ref.remove(); } catch {}
  safeToast(tr('online.rematch.rejected'));
  try {
    const gid = inv && inv.gameId;
    if (gid && this.isActive && this.gameId && gid === this.gameId) {
      try { this._schedulePurgeRoom && this._schedulePurgeRoom(gid, 'rematch_rejected', 0); } catch {}
      try { await this.exitToMode(); } catch {}
    }
  } catch {}
  return;
}

        } catch {}

        const name = inv.fromNick || tr("players.player");
        const title = tr("online.newInviteTitle");
        const roomName = (inv.roomName || "").trim();
        const body = roomName
          ? tr("online.newInviteBodyWithRoom", { fromName: name, roomName })
          : tr("online.newInviteBody", { fromName: name });

        
const canModal = (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function");
const plainText = (html) => {
  try { return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); } catch (e) { return String(html || ""); }
};

if (!canModal) {
  const msg = plainText(body);
  const ok = window.confirm(String(title || "") + "\n\n" + String(msg || ""));
  if (ok) {
    
    try {
      const stSnap2 = await db.ref("games").child(inv.gameId).child("status").once("value");
      const st2 = stSnap2 && stSnap2.val ? stSnap2.val() : null;
      if (st2 !== "active" && st2 !== "pending") {
        try { snap.ref.remove(); } catch {}
        safeToast(tr("online.inviteExpired"));
        return;
      }
    } catch {
      safeToast(tr("online.inviteExpired"));
      return;
    }

    if (!isGamePage()) {
      await this._acceptInviteLobby(inv, snap.ref);
    } else {
      await this._joinGame(inv.gameId);
      try { snap.ref.remove(); } catch {}
    }
  } else {
    try {
      if (inv.gameId) {
        await db.ref("games").child(inv.gameId).transaction((g) => {
          if (!g) return g;
          if (g.status !== "active" && g.status !== "pending") return g;
          g.status = "rejected";
          g.endedAt = nowTs();
          g.endedReason = "rejected";
          g.log = Array.isArray(g.log) ? g.log : [];
          const who = this.myNick || tr("players.player");
          g.log.push({
            ts: nowTs(),
            type: "invite_rejected",
            text: formatTpl(tr("online.log.inviteRejected"), { player: who }),
          });
          if (g.log.length > 200) g.log = g.log.slice(-200);
          return g;
        });
      }
    } catch {}
    try { snap.ref.remove(); } catch {}
  }
  return;
}

Modal.open({
          title,
          body: `<div>${body}</div>`,
          buttons: [
            {
              label: tr("actions.accept"),
              className: "ok",
              onClick: async () => {
                Modal.close();

                                try {
                  const uid =
                    this.myUid ||
                    (auth && auth.currentUser && auth.currentUser.uid) ||
                    "";

                  if (!hasExplicitNick(uid)) {
                    const picked = ((await askNickname()) || "").trim();
                    if (picked) this.myNick = picked;
                    if (!this.myNick) this.myNick = getSavedNickOrDefault(uid);
                  } else {
                    const saved = (getSavedNick() || "").trim();
                    if (saved) this.myNick = saved;
                    if (!this.myNick) this.myNick = getSavedNickOrDefault(uid);
                  }

                  try {
                    if (this.statusRef) {
                      const uidForWrite = uid || this.myUid;
                      safePlayerWriteNoAwait(this.statusRef, uidForWrite, {
                        nickname: this.myNick,
                        icon: this.myIcon || getSavedIconOrDefault(),
                        updatedAt: nowTs(),
                      }, "players.nickUpdate", () => { try { this._stopPresenceHeartbeat(); } catch {} });
                    }
                  } catch {}
                } catch {}
                
                try {
                  const stSnap2 = await db.ref("games").child(inv.gameId).child("status").once("value");
                  const st2 = stSnap2 && stSnap2.val ? stSnap2.val() : null;
                  if (st2 !== "active" && st2 !== "pending") {
                    try { snap.ref.remove(); } catch {}
                    safeToast(tr("online.inviteExpired"));
                    return;
                  }
                } catch {
                  safeToast(tr("online.inviteExpired"));
                  return;
                }

                if (!isGamePage()) {
                  await this._acceptInviteLobby(inv, snap.ref);
                } else {
                  await this._joinGame(inv.gameId);
                  try { snap.ref.remove(); } catch {}
                }
              },
            },
            {
              label: tr("actions.reject"),
              className: "ghost",
              onClick: async () => {
                Modal.close();
                try {
                  if (inv.gameId) {
                    await db.ref("games").child(inv.gameId).transaction((g) => {
                      if (!g) return g;
                      if (g.status !== "active" && g.status !== "pending") return g;
                      g.status = "rejected";
                      g.endedAt = nowTs();
                      g.endedReason = "rejected";
                      g.log = Array.isArray(g.log) ? g.log : [];
                      const who = this.myNick || tr("players.player");
                      g.log.push({
                        ts: nowTs(),
                        type: "invite_rejected",
                        text: formatTpl(tr("online.log.inviteRejected"), { player: who }),
                      });
                      if (g.log.length > 200) g.log = g.log.slice(-200);
                      return g;
                    });
                  }
                } catch {}
                try { snap.ref.remove(); } catch {}
              },
            },
          ],
        });
      };

      this.invitesRef.on("child_added", handler);
      this._inviteQuery = this.invitesRef;
      
    },


    
    

    _startInviteCleanup: function() {
      
    },


    

    _stopInviteCleanup: function() {
      try {
        if (this._inviteCleanupInterval) clearInterval(this._inviteCleanupInterval);
      } catch {}
      this._inviteCleanupInterval = null;
      this._inviteCleanupRunning = false;
    },

    

    _cleanupInvitesOnce: async function() {
      
    },

    

    _openLobbyModal: function() {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-weight:700;">${tr("online.playersTitle")}</div>
          <div id="playersList" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>
      `;

      Modal.open({
        title: tr("online.playersTitle"),
        body: wrap,
        buttons: [
          {
            label: tr("modals.close"),
            className: "ghost",
          onClick: () => { Modal.close(); },
          },
        ],
      });

      const listEl = wrap.querySelector("#playersList");
      
      const render = (players) => {
        listEl.innerHTML = "";
        let entries = Object.entries(players || {}).filter(
          ([uid]) => uid !== this.myUid
        );

        
        const NOW = Date.now();
        const MAX_AGE_MS = PRESENCE_UI_TTL_MS; 
        entries = entries.filter(([uid, p]) => {
          const ts = p && typeof p.updatedAt === "number" ? p.updatedAt : 0;
          return ts && (NOW - ts) <= MAX_AGE_MS;
        });

        if (!entries.length) {
          listEl.innerHTML = `<div class="muted">${tr("online.noPlayers")}</div>`;
          return;
        }

        entries.forEach(([uid, p]) => {
          const nick = p && p.nickname ? p.nickname : uid.slice(0, 6);
          const st = p && p.status ? p.status : "available";

          const stLabel =
            st === "available" || st === "lobby"
              ? tr("online.status.available")
              : st === "vsComputer"
              ? tr("online.status.vsComputer")
              : st === "spectating"
              ? tr("online.status.spectating")
              : tr("online.status.inPvP");

          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.justifyContent = "space-between";
          row.style.gap = "10px";
          row.innerHTML = `
            <div style="display:flex; flex-direction:column;">
              <div style="font-weight:700;">${nick}</div>
              <div class="muted" style="font-size:0.9em;">${stLabel}</div>
            </div>
                      <button class="btn ok" ${(() => {
                        const role = (p && p.role) ? String(p.role) : (st === "inPvP" ? "player" : (st === "spectating" ? "spectator" : (st === "available" ? "lobby" : "pvc")));
                        const roomId = (p && p.roomId) ? String(p.roomId).trim() : "";
                        const inMatchAsPlayer = (role === "player" && !!roomId);
                        return inMatchAsPlayer ? "disabled" : "";
                      })()}>${tr("actions.invite")}</button>

          `;

          row.querySelector("button").onclick = async () => {
            Modal.close();
            await this._createGame(uid);
          };

          listEl.appendChild(row);
        });
      };

      this.playersRef.off();

      let gotFirst = false;
      
      const showLoadFail = () => {
        const msg = tr("online.playersLoadFail");
        Modal.open({
          title: tr("modals.errorTitle"),
          body: `<div>${msg}</div>`,
          buttons: [
            {
              label: tr("modals.close"),
              className: "primary",
          onClick: () => { Modal.close(); },
            },
          ],
        });
      };

      const timer = setTimeout(() => {
        if (!gotFirst) showLoadFail();
      }, 8000);

      this.playersRef.on(
        "value",
        (snap) => {
          gotFirst = true;
          clearTimeout(timer);
          render(snap.val() || {});
        },
        (err) => {
          console.warn("Players list load cancelled:", err);
          clearTimeout(timer);
          showLoadFail();
        }
      );

    },

    

    _createGame: async function(opponentUid) {
      
      

      const ok = await this.initPresence();
      if (!ok) {
        safeToast(tr("status.onlineInitFail"));
        return;
      }

      try { this._clearPendingInviteWatcher && this._clearPendingInviteWatcher(); } catch {}

      let opponentNick = "";
      try {
        const ps = await this.playersRef.child(opponentUid).once("value");
        opponentNick = (ps && ps.val && ps.val() && ps.val().nickname) || "";
      } catch {}

      
      const roomName = (await askRoomName()).trim();
      if (!roomName) {
        
        return;
      }

      const initSnap = (typeof this._buildInitialSnapshot === "function")
        ? this._buildInitialSnapshot()
        : null;

      const gameRef = db.ref("games").push();
      const gameId = gameRef.key;

      const gameObj = {
        roomName,
        status: "pending",
        acceptedAt: 0,
        createdAt: nowTs(),
        moveIndex: 0,
        ply: 0,
        turn: initSnap ? initSnap.player : -1,
        starter: "white",
        players: {
          white: { uid: this.myUid, nickname: this.myNick },
          black: { uid: opponentUid, nickname: opponentNick || "" },
        },
        state: {
          snapshot: initSnap,
          deferredPromotion: null,
        },
        states: {
          0: { snapshot: initSnap, deferredPromotion: null },
        },
        lastMove: null,
        soufla: null,
        undoRequest: null,
        log: [
          {
            ts: nowTs(),
            type: "invite_sent",
            text: formatTpl(
              tr("online.log.inviteSent"),
              {
                from: this.myNick || tr("players.player"),
                to: opponentNick || tr("players.player"),
              }
            ),
          },
        ],
      };

      
      const inviteKey = `${this.myUid}_${gameId}`;
      const inviteObj = {
        fromUid: this.myUid,
        toUid: opponentUid,
        fromNick: this.myNick,
        roomName,
        gameId: gameId,
        createdAt: nowTs(),
        status: "pending",
      };

      const updates = {};
      updates[`games/${gameId}`] = gameObj;
      updates[`invites/${opponentUid}/${inviteKey}`] = inviteObj;

      try {
        await db.ref().update(updates);
      } catch (err) {
        handleDbError(err, tr("online.inviteSendFail"));
        return;
      }

      
      


      try { this._watchPendingInvite && this._watchPendingInvite(gameId); } catch {}
    },

    


    _joinGame: async function(gameId) {
      this.mySide = +1;
      this.isActive = true;

      this._setOnlineButtonsState(true);
      await safePlayerWrite(this.statusRef, this.myUid, {
status: "inPvP",
        role: "player",
        roomId: gameId,
        nickname: this.myNick,
        updatedAt: nowTs(),
          }, "players.status");
try { this._presenceStatus = "inPvP"; this._presenceRole = "player"; this._presenceRoomId = gameId; } catch {}
      try {
        this._pendingSteps = [];
        this._cachedSouflaPlain = null;
        this._awaitingLocalCommit = false;
        this._expectedMoveIndex = null;
      } catch {}

      try {
        Game.settings.starter = "white";
        setupInitialBoard();
        try { Visual?.clearCapturedOrder?.(); } catch {}
        try { Visual?.clearSouflaFX?.(); } catch {}
        try { Visual?.setHighlightCells?.([]); } catch {}
        try { Visual?.setHintPath?.(null, null); } catch {}
        try { Visual?.clearForcedOpeningArrow?.(); } catch {}
        try { Visual?.setLastMove?.(null, null); } catch {}
        try { Visual?.setUndoMove?.(null, null); } catch {}
        try { Visual?.draw?.(); } catch {}
        try { Turn.start(); } catch {}
      } catch {}

      this.gameId = gameId;
      this.gameRef = db.ref("games").child(gameId);


      // Ensure no stale onDisconnect purge is active from a prior match
      try { this._cleanupArmedFor = null; } catch {}
      try { this._cancelRoomPurgeOnDisconnect(); } catch {}

      
      try {
        await this.gameRef.transaction((g) => {
          if (!g) return g;
          if (g.status === "ended" || g.status === "rejected") return g;

          g.players = g.players || {};
          g.players.white = g.players.white || {};
          g.players.black = g.players.black || {};

          
          if (g.players.black && g.players.black.uid && g.players.black.uid !== this.myUid) {
            return g;
          }

          g.players.black = { uid: this.myUid, nickname: this.myNick };

          if (g.status === "pending") {
            g.status = "active";
          }

          if (!g.acceptedAt) {
            g.acceptedAt = nowTs();
            g.log = Array.isArray(g.log) ? g.log : [];
            const who = this.myNick || tr("players.player");
            g.log.push({
              ts: nowTs(),
              type: "invite_accepted",
              text: formatTpl(tr("online.log.inviteAccepted"), { player: who }),
            });
            if (g.log.length > 200) g.log = g.log.slice(-200);
          }

          return g;
        });
      } catch (err) {
        handleDbError(err, tr("online.errors.joinFailed"));
      }

      
      try {
        const gv = await this.gameRef.once("value");
        const g = gv && gv.val ? gv.val() : null;
        const blackUid = g && g.players && g.players.black && g.players.black.uid;
        const okStatus = g && (g.status === "active");
        if (!okStatus || (blackUid && blackUid !== this.myUid)) {
          try { this.gameRef.off(); } catch {}
          try { this._cleanupOnline(); } catch {}
          safeToast(tr("online.errors.joinFailed"));
          return;
        }
      } catch {}


      this._bindGameListeners();
      try { await this._initRoomComms(); } catch {}
      try { this._persistActiveGame(); } catch {}
    },
    

    _setOnlineButtonsState: function(on) {
      try { this._installDisabledButtonGuardsOnce(); } catch {}
      try { this._setButtonsVisualDisabled(!!on); } catch {}
      try { document.body.classList.toggle("mode-pvp", !!on); } catch {}

      const btnOnline = document.getElementById("btnOnline");
      const btnEnd = document.getElementById("btnEndOnline");
      if (btnOnline) btnOnline.style.display = on ? "none" : "block";

      
      if (btnEnd) {
        const showEnd = !!on && !this.isSpectator;
        btnEnd.style.display = showEnd ? "block" : "none";
        if (showEnd) btnEnd.onclick = () => this.leaveRoom();
        else btnEnd.onclick = null;
      }

      const btnSync = document.getElementById("btnSync");
      if (btnSync) {
        btnSync.style.display = (on && !this.isSpectator) ? "inline-flex" : "none";
      }

      
      const btnChat = document.getElementById("btnChat");
      const btnResume = document.getElementById("btnResume");
      const btnNew = document.getElementById("btnNew");
      const btnSave = document.getElementById("btnSave");

      if (on) {
        if (btnResume) btnResume.style.display = "none";
        if (btnChat) btnChat.style.display = this.isSpectator ? "none" : "inline-flex";

        
        if (btnNew) btnNew.style.display = "none";
        if (btnSave) btnSave.style.display = "none";
      } else {
        if (btnChat) {
          btnChat.style.display = "none";
          try { delete btnChat.dataset.badge; } catch {}
        }
        if (btnResume) btnResume.style.display = "";

        if (btnNew) btnNew.style.display = "";
        if (btnSave) btnSave.style.display = "";
      }

      
      try {
        const pvpBar = document.getElementById("pvpVoiceBar");
        const specBar = document.getElementById("specBar");
        if (pvpBar) pvpBar.style.display = (on && !this.isSpectator) ? "grid" : "none";
        if (specBar) specBar.style.display = (on && this.isSpectator) ? "flex" : "none";
      } catch {}

      
      try { this._installPvpCompactHandlersOnce(); } catch {}
      try { this._applyPvpCompactLayout(); } catch {}

      if (on) {
        try { this.refreshPvpControls(); } catch {}
      } else {
        try {
          if (typeof applyLanguage === "function") {
            applyLanguage(document.documentElement.lang || "ar");
          }
        } catch {}
      }
    },


    
    _installPvpCompactHandlersOnce: function() {
      if (this._pvpCompactBound) return;
      this._pvpCompactBound = true;
      try {
        window.addEventListener("resize", () => {
          try { this._applyPvpCompactLayout(); } catch {}
        });
      } catch {}
    },

    
    _applyPvpCompactLayout: function() {
      try {
        const isPvp = document.body && document.body.classList && document.body.classList.contains("mode-pvp");
        if (!isPvp || this.isSpectator) {
          try { this._disablePvpCompactRow(); } catch {}
          return;
        }
        const small = window.matchMedia ? window.matchMedia("(max-width: 768px)").matches : (window.innerWidth <= 768);
        if (small) this._enablePvpCompactRow();
        else this._disablePvpCompactRow();
      } catch {}
    },

    _enablePvpCompactRow: function() {
      try {
        const row = document.getElementById("pvpCompactRow");
        const pvpBar = document.getElementById("pvpVoiceBar");
        const grid = document.querySelector(".btn-grid");
        if (!row) return;

        
        ["btnSpk", "btnMic", "btnChat", "btnSync", "btnSettings", "btnUndo"].forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.parentElement !== row) row.appendChild(el);
        });

        try { document.body.classList.add("pvp-compact"); } catch {}
        try { if (row.style) row.style.display = "flex"; } catch {}
        
        try { if (pvpBar && pvpBar.style) pvpBar.style.display = "none"; } catch {}
        try { if (grid && grid.style) grid.style.display = "none"; } catch {}
      } catch {}
    },

    _disablePvpCompactRow: function() {
      try {
        const row = document.getElementById("pvpCompactRow");
        const pvpBar = document.getElementById("pvpVoiceBar");
        const grid = document.querySelector(".btn-grid");
        if (!row) return;

        
        if (pvpBar) {
          ["btnSync", "btnSpk", "btnMic", "btnChat"].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.parentElement !== pvpBar) pvpBar.appendChild(el);
          });
        }

        
        if (grid) {
          const st = document.getElementById("btnSettings");
          const un = document.getElementById("btnUndo");
          const btnNew = document.getElementById("btnNew");
          if (st && st.parentElement !== grid) grid.insertBefore(st, grid.firstChild);
          if (un && un.parentElement !== grid) {
            if (btnNew && btnNew.parentElement === grid) {
              grid.insertBefore(un, btnNew.nextSibling);
            } else {
              grid.appendChild(un);
            }
          }
        }

        try { document.body.classList.remove("pvp-compact"); } catch {}
        try { if (row.style) row.style.display = "none"; } catch {}
        
        try { if (pvpBar && pvpBar.style) pvpBar.style.display = ""; } catch {}
        try { if (grid && grid.style) grid.style.display = ""; } catch {}
      } catch {}
    },


    
endOnline: async function() {
      
      try { this._localEndedOnline = true; } catch {}

      let wrote = false;

      const who = this.myNick || tr("players.player");
      const payload = {
        status: "ended",
        endedAt: nowTs(),
        endedReason: "ended_by_player",
        endedBy: { uid: this.myUid, nickname: who },
      };


      
      let opponentUid = null;
      try {
        const d = this._lastGameData;
        if (d && d.players) {
          const w = d.players.white || {};
          const b = d.players.black || {};
          if (w.uid === this.myUid) opponentUid = b.uid || null;
          else if (b.uid === this.myUid) opponentUid = w.uid || null;
        }
      } catch {}

      if (!opponentUid) {
        try {
          const ps = await this.gameRef.child("players").once("value");
          const pl = ps && ps.val ? ps.val() : null;
          const w = (pl && pl.white) || {};
          const b = (pl && pl.black) || {};
          if (w.uid === this.myUid) opponentUid = b.uid || null;
          else if (b.uid === this.myUid) opponentUid = w.uid || null;
        } catch {}
      }

      try {
        if (opponentUid && db && this.gameId) {
          const endKey = `end_${this.myUid}_${this.gameId}`;
          await db.ref("invites").child(opponentUid).child(endKey).set({
            type: "match_end",
            fromUid: this.myUid,
            toUid: opponentUid,
            fromNick: who,
            roomName: "",
            gameId: this.gameId,
            createdAt: nowTs(),
            status: "match_end",
            reason: "ended_by_player",
          });
        }
      } catch (e) {
        try { handleDbError(e); } catch {}
      }

      
      try {
        if (this.gameRef) {
          const res = await this.gameRef.transaction((g) => {
            if (!g || g.status !== "active") return g;
            g.status = "ended";
            g.endedAt = payload.endedAt;
            g.endedReason = payload.endedReason;
            g.endedBy = payload.endedBy;

            g.log = Array.isArray(g.log) ? g.log : [];
            g.log.push({
              ts: nowTs(),
              type: "ended_by_player",
              byUid: this.myUid,
              byNick: who,
              text: formatTpl(tr("online.log.endedByPlayer"), { player: who }),
            });
            if (g.log.length > 200) g.log = g.log.slice(-200);
            return g;
          });
          wrote = !!(res && res.committed);
        }
      } catch {}

      
      if (!wrote) {
        try {
          if (this.gameRef) {
            await this.gameRef.update(payload);
            wrote = true;
          }
        } catch {}
      }

      
      if (!wrote) {
        try {
          if (this.gameRef) {
            await this.gameRef.child("status").set("ended");
            wrote = true;
          }
        } catch {}
      }

      
      if (!wrote) {
        try {
          if (this.gameRef) {
            await this.gameRef.remove();
            wrote = true;
          }
        } catch {}
      }

      try { this._enterPostMatch({ reason: 'ended_by_player', byUid: this.myUid, byNick: who }); } catch {}
      safeToast(tr("buttons.endOnline"));
    },

    
    _clearPostMatchSession: function() {
      try { SessionGame && SessionGame.clear && SessionGame.clear(); } catch {}
      try { sessionStorage && sessionStorage.clear && sessionStorage.clear(); } catch {}
      try { localStorage.removeItem('zamat.activeGameId'); } catch {}
      try { localStorage.removeItem('zamat.activeGameTs'); } catch {}
    },

    
    _enterPostMatch: function(meta) {
      try { this._clearPostMatchSession(); } catch {}
      this._inPostMatch = true;

      if (this._postMatchShown) return;
      this._postMatchShown = true;

      const reason = (meta && (meta.reason || meta.endedReason)) || null;
      const endedBy = (meta && (meta.endedBy || meta.ended_by)) || null;

      // Stage 6: arm purge for ended/rejected rooms (avoid leaking RTDB room data)
      try {
        const gid = this.gameId;
        const gd = this._lastGameData || null;
        if (gid && gd && gd.status && gd.status !== "active") {
          try { this._archiveAndArmRoomCleanup(gid, reason || gd.endedReason || gd.status, gd); } catch {}
        }
      } catch {}
      const byUid = (meta && meta.byUid) || (endedBy && endedBy.uid) || null;
      let byNick = (meta && meta.byNick) || (endedBy && endedBy.nickname) || "";
      try { byNick = String(byNick || "").trim(); } catch {}
      if (!byNick) byNick = tr("online.opponent", "Opponent");

      let winner = null;
      try {
        const g = this._lastGameData;
        if (g && typeof g.winner !== "undefined") winner = g.winner;
      } catch {}
      try {
        if (winner == null && typeof Game !== "undefined" && typeof Game.winner !== "undefined")
          winner = Game.winner;
      } catch {}
      try { if (winner === 0) winner = null; } catch {}

      // PvP: ended by player -> special modal for the other player
      if (reason === "ended_by_player") {
        // If I am the one who ended, leaveRoom/exitToMode already handles navigation.
        if (byUid && this.myUid && byUid === this.myUid) {
          try { safeToast(tr("buttons.endOnline")); } catch {}
          return;
        }

        const title = tr("online.pvpEndTitle", tr("online.matchEndedTitle", "Match ended"));
        const body = formatTpl(
          tr("online.pvpEndedByPlayer", "Player {player} ended the match."),
          { player: byNick }
        );

        const go = async () => { try { await this.exitToMode(); } catch {} };

        try {
          if (typeof Modal !== "undefined" && Modal && typeof Modal.open === "function") {
            Modal.open({
              title,
              text: body,
              buttons: [
                {
                  label: tr("actions.ok", "OK"),
                  className: "ok",
                  onClick: () => { try { Modal.close(); } catch {}; go(); },
                },
              ],
              onClose: () => { go(); },
            });
            return;
          }
        } catch {}

        try { safeToast(body); } catch {}
        try { go(); } catch {}
        return;
      }

      // Default: show normal Game Over modal (win/lose/draw) using best available winner.
      try {
        if (typeof UI !== "undefined" && UI && typeof UI.showGameOverModal === "function") {
          UI.showGameOverModal(winner == null ? null : winner);
          return;
        }
      } catch {}

      try { safeToast(tr("online.matchEndedTitle")); } catch {}
    },

    _onRematchStarted: function() {
      try { this._inPostMatch = false; } catch {}
      try { this._postMatchShown = false; } catch {}
      try { this._localEndedOnline = false; } catch {}
      try { this._rematchRequestedAt = 0; this._rematchPending = false; } catch {}

      // Rematch reuses the same room id: cancel any pending cleanup scheduled for the previous match.
      try {
        const gid = this.gameId;
        if (gid && this._purgeTimers && this._purgeTimers[gid]) {
          try { clearTimeout(this._purgeTimers[gid]); } catch {}
          try { delete this._purgeTimers[gid]; } catch {}
        }
      } catch {}
      try { this._cleanupArmedFor = null; } catch {}
      try { this._cancelRoomPurgeOnDisconnect(); } catch {}

      
      try { if (typeof Modal !== 'undefined' && Modal && typeof Modal.close === 'function') Modal.close(); } catch {}

      
      try {
        if (typeof setupInitialBoard === 'function') {
          Game.settings = Game.settings || {};
          Game.settings.starter = 'white';
          setupInitialBoard();
          try { Visual && Visual.clearCapturedOrder && Visual.clearCapturedOrder(); } catch {}
          try { Visual && Visual.clearSouflaFX && Visual.clearSouflaFX(); } catch {}
          try { Visual && Visual.setHighlightCells && Visual.setHighlightCells([]); } catch {}
          try { Visual && Visual.setHintPath && Visual.setHintPath(null, null); } catch {}
          try { Visual && Visual.clearForcedOpeningArrow && Visual.clearForcedOpeningArrow(); } catch {}
          try { Visual && Visual.setLastMove && Visual.setLastMove(null, null); } catch {}
          try { Visual && Visual.setUndoMove && Visual.setUndoMove(null, null); } catch {}
          try { Visual && Visual.draw && Visual.draw(); } catch {}
          try { Turn && (Turn.ctx = null); } catch {}
          try { Turn && Turn.start && Turn.start(); } catch {}
          try { UI && UI.updateAll && UI.updateAll(); } catch {}
        }
      } catch {}
    },

    
    _getOpponentInfo: async function() {
      let opponentUid = null;
      let opponentNick = '';
      try {
        const d = this._lastGameData;
        if (d && d.players) {
          const w = d.players.white || {};
          const b = d.players.black || {};
          if (w.uid === this.myUid) { opponentUid = b.uid || null; opponentNick = b.nickname || ''; }
          else if (b.uid === this.myUid) { opponentUid = w.uid || null; opponentNick = w.nickname || ''; }
        }
      } catch {}
      if (!opponentUid && this.gameRef) {
        try {
          const ps = await this.gameRef.child('players').once('value');
          const pl = ps && ps.val ? ps.val() : null;
          const w = (pl && pl.white) || {};
          const b = (pl && pl.black) || {};
          if (w.uid === this.myUid) { opponentUid = b.uid || null; opponentNick = b.nickname || ''; }
          else if (b.uid === this.myUid) { opponentUid = w.uid || null; opponentNick = w.nickname || ''; }
        } catch {}
      }
      return { uid: opponentUid, nick: opponentNick };
    },

    

/* Function: Request a rematch in the current room */
requestRematch: async function() {
  if (!this.isActive || !this.gameId) return;
  if (this.isSpectator) return;

  const now = Date.now();
  if (this._rematchRequestedAt && (now - this._rematchRequestedAt) < 1500) return;
  this._rematchRequestedAt = now;

  let opp = { uid: null, nick: '' };
  try { opp = await this._getOpponentInfo(); } catch {}
  if (!opp.uid) {
    safeToast(tr('online.noOpponent'));
    return;
  }

  const who = this.myNick || tr('players.player');
  const roomNameRaw = (this._lastGameData && this._lastGameData.roomName) || '';
  const roomName = String(roomNameRaw || '').slice(0, 40);
  const key = `rematch_${this.myUid}_${this.gameId}_${now}`;
  try {
    await db.ref('invites').child(opp.uid).child(key).set({
      type: 'rematch_request',
      fromUid: this.myUid,
      toUid: opp.uid,
      fromNick: who,
      roomName: roomName,
      gameId: this.gameId,
      createdAt: now,
      status: 'pending',
    });
    this._rematchPending = true;
    safeToast(tr('online.rematch.sent'));
  } catch (e) {
    try { handleDbError(e); } catch {}

    safeToast(tr('online.rematch.fail'));

    
    
    try {
      const st = this._lastGameData && this._lastGameData.status;
      const ended = !!(this._inPostMatch || this._localEndedOnline || (st && st !== 'active'));
      if (ended) {
        try { this._schedulePurgeRoom && this._schedulePurgeRoom(this.gameId, 'rematch_invite_failed', 0); } catch {}
        try { await this.exitToMode(); } catch {}
        return;
      }
    } catch {}
  }
},

    
    _resetRoomForRematch: async function(gameId, actorNick) {
      const initSnap = (typeof this._buildInitialSnapshot === 'function') ? this._buildInitialSnapshot() : null;
      const ts = nowTs();
      const actor = actorNick || tr('players.player');
      const ref = db.ref('games').child(gameId);
      await ref.transaction((g) => {
        if (!g) return g;
        
        g.status = 'active';
        g.acceptedAt = ts;
        g.createdAt = g.createdAt || ts;
        g.endedAt = 0;
        g.endedReason = null;
        g.endedBy = null;
        g.moveIndex = 0;
        g.ply = 0;
        g.turn = initSnap ? initSnap.player : (g.turn || -1);
        g.state = { snapshot: initSnap, deferredPromotion: null, capturedOrder: [] };
        g.states = { 0: { snapshot: initSnap, deferredPromotion: null, capturedOrder: [] } };
        g.lastMove = null;
        g.soufla = null;
        g.undoRequest = null;
        g.rematchSeq = (g.rematchSeq || 0) + 1;
        g.log = g.log || [];
        g.log.push({
          ts: ts,
          type: 'rematch_started',
          text: formatTpl(tr('online.log.rematchStarted'), { player: actor }),
        });
        if (g.log.length > 200) g.log = g.log.slice(-200);
        return g;
      });
    },

    

    /* Function: Accept a rematch invitation */
    _acceptRematchInvite: async function(inv, snapRef) {
      try { if (snapRef) await snapRef.remove(); } catch {}
      if (!this.isActive || !this.gameId || inv.gameId !== this.gameId) return;
      if (this.isSpectator) return;

      const me = this.myNick || tr('players.player');
      try {
        await this._resetRoomForRematch(this.gameId, me);
      } catch (e) {
        try { handleDbError(e); } catch {}
        safeToast(tr('online.rematch.resetFail'));
        return;
      }

      
      try {
        const fromUid = inv.fromUid;
        if (fromUid) {
          const keyTs = Date.now();
const key = `rematch_accept_${this.myUid}_${this.gameId}_${keyTs}`;
const rnRaw = (inv && inv.roomName) || (this._lastGameData && this._lastGameData.roomName) || '';
const roomName = String(rnRaw || '').slice(0, 40);
await db.ref('invites').child(fromUid).child(key).set({
  type: 'rematch_accept',
  fromUid: this.myUid,
  toUid: fromUid,
  fromNick: me,
  roomName: roomName,
  gameId: this.gameId,
  createdAt: keyTs,
  status: 'accepted',
});
}
      } catch {}

      
      try { this._onRematchStarted(); } catch {}
    },

    

    /* Function: Reject a rematch invitation */
    _rejectRematchInvite: async function(inv, snapRef) {
      try { if (snapRef) await snapRef.remove(); } catch {}
      const me = this.myNick || tr('players.player');
      try {
        const fromUid = inv.fromUid;
        if (fromUid) {
          const keyTs = Date.now();
const gid = String(inv && inv.gameId ? inv.gameId : (this.gameId || '')).trim();
if (!gid) return;
const key = `rematch_reject_${this.myUid}_${gid}_${keyTs}`;
const rnRaw = (inv && inv.roomName) || (this._lastGameData && this._lastGameData.roomName) || '';
const roomName = String(rnRaw || '').slice(0, 40);
await db.ref('invites').child(fromUid).child(key).set({
  type: 'rematch_reject',
  fromUid: this.myUid,
  toUid: fromUid,
  fromNick: me,
  roomName: roomName,
  gameId: gid,
  createdAt: keyTs,
  status: 'rejected',
});
}
      } catch {}
        safeToast(tr('online.rematch.rejected'));
  try {
    const gid = inv && inv.gameId;
    if (gid) {
      try { this._schedulePurgeRoom && this._schedulePurgeRoom(gid, 'rematch_rejected', 0); } catch {}
    }
  } catch {}
  try { await this.exitToMode(); } catch {}
},


    
    exitToMode: async function() {
      try { this._clearPostMatchSession(); } catch {}

      const gid = this.gameId || this._presenceRoomId;
      const uid = this.myUid;

      
      try {
        if (gid && uid && this.isSpectator) {
          await db.ref('spectators').child(gid).child(uid).remove();
        }
      } catch {}

      try { this._teardownRoomComms && this._teardownRoomComms(); } catch {}
      try { this.gameRef && this.gameRef.off && this.gameRef.off(); } catch {}

      try { this._clearPersistedActiveGame && this._clearPersistedActiveGame(); } catch {}

      this.isActive = false;
      this.isSpectator = false;
      this.gameId = null;
      this.gameRef = null;
      this.mySide = null;

      try { document.body.classList.remove('z-spectator'); } catch {}

      
      try { await this._setLobbyStatus('available'); } catch {}

      
      try {
        const inPages = (location.pathname || '').includes('/pages/');
        location.href = inPages ? 'mode.html' : 'pages/mode.html';
      } catch {}
    },

    

    leaveRoom: async function() {
      try {
        const gid = this.gameId || this._presenceRoomId;
        const uid = this.myUid;

        
        if (!gid || !uid) {
          try {
            const back = (location.pathname || "").includes("/pages/") ? "./loby.html" : "pages/loby.html";
            location.href = back;
          } catch {}
          return;
        }

        
        if (this.isSpectator) {
          try { await db.ref("spectators").child(gid).child(uid).remove(); } catch {}
        } else {
          
          
          try { await this.endOnline(); } catch {}
          try { await this.exitToMode(); } catch {}
          return;
        }

        
        try { this._teardownRoomComms(); } catch {}
        try { this.gameRef && this.gameRef.off(); } catch {}

        
        try { this._clearPersistedActiveGame(); } catch {}
        this.isActive = false;
        this.isSpectator = false;
        this.gameId = null;
        this.gameRef = null;
        this.mySide = null;

        try { document.body.classList.remove("z-spectator"); } catch {}
        try { this._setOnlineButtonsState(false); } catch {}

        
        try { this._presenceStatus = "available"; this._presenceRole = "lobby"; this._presenceRoomId = null; } catch {}
        try {
          if (this.statusRef) {
            await safePlayerWrite(this.statusRef, this.myUid, {
              status: "available",
              role: "lobby",
              roomId: null,
              nickname: this.myNick,
              icon: this.myIcon || getSavedIconOrDefault(),
              updatedAt: nowTs(),
            }, "players.leaveToLobby", () => { try { this._stopPresenceHeartbeat(); } catch {} });
          }
        } catch {}

        
        try {
          const back = (location.pathname || "").includes("/pages/") ? "./loby.html" : "pages/loby.html";
          location.href = back;
        } catch {}
      } catch {}
    },

    

    _cleanupOnline: function() {
      try { this._teardownRoomComms(); } catch {}
      try { this._stopOpponentAbsenceWatcher(); } catch {}
      try { this._lastTrainLoggedMoveIndex = 0; } catch {}

      

      try { this._localEndedOnline = false; } catch {}try { this._clearPersistedActiveGame(); } catch {}
      try { this._restoreAiStateUi(); } catch {}
      try { this._selfConnected = true; this._oppOnline = true; } catch {}

      try {
        this.gameRef && this.gameRef.off();
      } catch {}
      try {
        this.playersRef && this.playersRef.off();
      } catch {}
      try {
        this.invitesRef && this.invitesRef.off();
      } catch {}
      try { this._stopInviteCleanup(); } catch {}

      this.isActive = false;
      this.gameId = null;
      this.gameRef = null;
      this.mySide = null;

      this._pendingSteps = [];
      this._cachedSouflaPlain = null;
      this._isApplyingRemote = false;

      
      try { this._awaitingLocalCommit = false; this._expectedMoveIndex = null; } catch {}
try { this._teardownGamePresence(); } catch {}

      this._setOnlineButtonsState(false);

      try {
        setupInitialBoard();
        Turn.start();
      } catch {}

      try { this._presenceStatus = "vsComputer"; this._presenceRole = null; this._presenceRoomId = null; } catch {}

      try {
        safePlayerWriteNoAwait(this.statusRef, this.myUid, {
status: "vsComputer",
            role: null,
            roomId: null,
            nickname: this.myNick,
            updatedAt: nowTs(),
          }, "players.status");
} catch {}
    },



_schedulePurgeRoom: function(gameId, reason, delayMs) {
  try {
    if (!gameId) return;
    if (this.isSpectator) return; 
    if (!this._purgeTimers) this._purgeTimers = {};
    if (this._purgeTimers[gameId]) return;
    const d = (typeof delayMs === "number" && delayMs >= 0) ? delayMs : 1500;
    this._purgeTimers[gameId] = setTimeout(() => {
      try { delete this._purgeTimers[gameId]; } catch {}
      try { this._purgeRoomData(gameId, reason); } catch {}
    }, d);
  } catch {}
},



_archiveAndArmRoomCleanup: function(gameId, reason, gData) {
  try {
    if (!gameId) return;
    if (this.isSpectator) return;
    if (this._cleanupArmedFor === gameId) return;
    this._cleanupArmedFor = gameId;

    // Ensure the room is removed when the tab actually closes after match end.
    try { this._armRoomPurgeOnDisconnect(gameId, reason); } catch {}

    // Also try a timed purge while we're still on the game page (gives UI time).
    try { this._schedulePurgeRoom(gameId, reason || "postmatch", 45000); } catch {}
  } catch {}
},

_archiveRoomData: async function(gameId, reason, gData) {
  // Spec-aligned: do not persist room/match logs (room data is operational and temporary).
  return false;
},

_armRoomPurgeOnDisconnect: function(gameId, reason) {
  try {
    if (!gameId) return;
    if (this.isSpectator) return;
    if (typeof firebase === "undefined" || !firebase || !firebase.database) return;

    if (this._purgeOnDisconnectGameId === gameId) return;

    const db = firebase.database();
    const rootRef = db.ref();

    const updates = {};
    updates["games/" + gameId] = null;
    updates["chats/" + gameId] = null;
    updates["rtc/" + gameId] = null;
    updates["spectators/" + gameId] = null;

    try { rootRef.onDisconnect().update(updates); } catch {}
    this._purgeOnDisconnectGameId = gameId;
  } catch {}
},

_cancelRoomPurgeOnDisconnect: function() {
  try {
    if (typeof firebase === "undefined" || !firebase || !firebase.database) return;
    const db = firebase.database();
    try { db.ref().onDisconnect().cancel(); } catch {}
  } catch {}
  try { this._purgeOnDisconnectGameId = null; } catch {}
},


_purgeRoomData: async function(gameId, reason) {
  try {
    if (!gameId) return;
    if (typeof firebase === "undefined" || !firebase || !firebase.database) return;
    const db = firebase.database();

    
    let g = null;
    try { g = this._lastGameData || null; } catch {}
    if (!g) {
      try {
        const snap = await db.ref("games/" + gameId).once("value");
        g = snap.val();
      } catch {}
    }

    let amPlayer = false;
    let isActiveRoom = false;
    try {
      if (g && g.players) {
        const w = g.players.white && g.players.white.uid;
        const b = g.players.black && g.players.black.uid;
        amPlayer = !!(this.myUid && (this.myUid === w || this.myUid === b));
        isActiveRoom = (g.status === "active" && !g.endedAt);
      } else {
        
        amPlayer = !this.isSpectator;
        isActiveRoom = false;
      }
    } catch {}

    if (!amPlayer) return;
    if (isActiveRoom) return;
    const updates = {};
    updates["games/" + gameId] = null;
    updates["chats/" + gameId] = null;
    updates["rtc/" + gameId] = null;
    updates["spectators/" + gameId] = null;

    await db.ref().update(updates);
    try { console.log("[online] purged room data", gameId, reason || ""); } catch {}
  } catch (e) {
    try { console.warn("[online] purge failed", e); } catch {}
  }
},

    

    _bindGameListeners: function() {
      if (!this.gameRef) return;
      this.gameRef.off();
      try { this._setupGamePresence(); } catch {}
      this.gameRef.on("value", (snap) => {
        const data = snap.val();
        try { this._lastGameData = data; } catch {}

        try {
          const rs = Number((data && data.rematchSeq) || 0);
          if (this._lastRematchSeq == null) this._lastRematchSeq = rs;
          else if (rs !== this._lastRematchSeq) {
            this._lastRematchSeq = rs;
            if (rs > 0) { try { this._onRematchStarted(); } catch {} }
          }
        } catch {}

        
        if (!data) {
          try {
            if (this.isActive) {
              const title = tr('online.matchEndedTitle');
              const body = tr('online.ended.generic');

              const go = async () => { try { await this.exitToMode(); } catch {} };

              if (typeof Modal !== 'undefined' && Modal && typeof Modal.open === 'function') {
                Modal.open({
                  title,
                  body: `<div>${body}</div>`,
                  buttons: [
                    {
                      label: tr('buttons.home'),
                      className: 'ok',
                      onClick: () => { Modal.close(); go(); },
                    },
                  ],
                  onClose: () => { go(); },
                });
              } else {
                try { safeToast(body); } catch {}
                go();
              }
            }
          } catch {}
          return;
        }

        if (data.status && data.status !== "active") {
          
          try { this._enterPostMatch({ reason: data.endedReason || data.status, endedBy: data.endedBy || null }); } catch {}
          return;
        }
        let __skipApply = false;
        try {
          const remoteMi = Number(data.moveIndex || 0);
          if (this._awaitingLocalCommit && Number.isFinite(this._expectedMoveIndex)) {
            if (remoteMi < this._expectedMoveIndex) {
              __skipApply = true;
            } else {
              this._awaitingLocalCommit = false;
              this._expectedMoveIndex = null;
            }
          }
        } catch {}
try {
          const w = data.players && data.players.white ? (data.players.white.nickname || "") : "";
          const b = data.players && data.players.black ? (data.players.black.nickname || "") : "";

          Game.names.bot = w || "";
          Game.names.top = b || "";

          const youTag = tr("online.youTag");
          const whiteName = Game.names.bot || tr("players.white");
          const blackName = Game.names.top || tr("players.black");
          const iAmBlack = this.mySide === +1;

          const pTop = document.getElementById("pTopName");
          const pBot = document.getElementById("pBotName");
          const pTopM = document.getElementById("pTopNameM");
          const pBotM = document.getElementById("pBotNameM");
          const topText = iAmBlack ? whiteName : blackName;
          
          const botText = (iAmBlack ? blackName : whiteName) + youTag;
          if (pTop) pTop.textContent = topText;
          if (pBot) pBot.textContent = botText;
          if (pTopM) pTopM.textContent = topText;
          if (pBotM) pBotM.textContent = botText;

          try {
            this._topDisplayName = topText;
            this._botDisplayName = botText;
            this._ensurePresenceUi();
            this._updatePresenceUi();
          } catch {}
} catch {}

        this.moveIndex = data.moveIndex || 0;
        this.ply = data.ply || 0;

        try { this._renderSharedLog(data.log || []); } catch {}
        try { this._handlePresence(data); } catch {}

        try {
          if (data.soufla && data.soufla.availableFor === this.mySide) {
            Game.availableSouflaForHuman = plainToSoufla(data.soufla.pending);
          } else {
            Game.availableSouflaForHuman = null;
          }
        } catch {}

        this._handleUndoRequest(data);

               
        if (!__skipApply) {
          
          const stateSnap = (data.state && data.state.snapshot) ||
            (data.states && data.ply != null && data.states[data.ply] && data.states[data.ply].snapshot) ||
            null;

          if (stateSnap) {
            
            const dp = (data.state && data.state.deferredPromotion) ||
              (data.states &&
                data.ply != null &&
                data.states[data.ply] &&
                data.states[data.ply].deferredPromotion) ||
              null;

            const patched = Object.assign({}, data, {
              state: Object.assign({}, data.state || {}, {
                snapshot: stateSnap,
                deferredPromotion: dp,
              }),
            });
            this._applyRemoteState(patched);
          } else if (typeof data.turn === "number") {
            try {
              Game.player = data.turn;
              Turn.ctx = null;
              Turn.start();
              UI.updateAll();
            } catch {}
          }
        }

      });

      try { this._installViewHooksOnce(); } catch {}

    },

    

    _applyRemoteState: function(data) {
      try {
        this._isApplyingRemote = true;

        

        
        try {
          const remoteMI = Number(
            (data && (data.moveIndex ?? (data.lastMove && data.lastMove.moveIndex))) ?? 0
          );
          if (this._awaitingLocalCommit && Number.isFinite(this._expectedMoveIndex)) {
            if (remoteMI < this._expectedMoveIndex) {
              return;
            }
            this._awaitingLocalCommit = false;
            this._expectedMoveIndex = null;
          }
        } catch {}
        const snap = data && data.state ? data.state.snapshot : null; data && data.state ? data.state.snapshot : null;
        if (!snap) return;

        try { this._maybeRecordOpponentMoveForTraining(data); } catch {}


restoreSnapshot(snap);

// Visual hint for undo: show the reversed path of the undone move (full chain if available)
try {
  const lm = data && data.lastMove ? data.lastMove : null;
  if (lm && lm.kind === "undo" && typeof Visual !== "undefined" && Visual) {
    const fr = lm.undoneFrom != null ? lm.undoneFrom : null;
    const p = Array.isArray(lm.undonePath) ? lm.undonePath : null;
    if (fr != null && p && p.length && typeof Visual.setUndoMovePath === "function") {
      Visual.setUndoMovePath(fr, p);
    } else if (fr != null && p && p.length && typeof Visual.setUndoMove === "function") {
      Visual.setUndoMove(fr, p[p.length - 1]);
    }
  }
} catch {}

        
        
        
        try {
          if (typeof UI !== "undefined" && UI && typeof UI.updateCounts === "function" && Game && Array.isArray(Game.board)) {
            let top = 0, bot = 0, tKings = 0, bKings = 0;
            for (let r = 0; r < Game.board.length; r++) {
              const row = Game.board[r];
              if (!Array.isArray(row)) continue;
              for (let c = 0; c < row.length; c++) {
                const v = row[c];
                if (!v) continue;
                if (v > 0) {
                  top++;
                  if (Math.abs(v) === 2) tKings++;
                } else if (v < 0) {
                  bot++;
                  if (Math.abs(v) === 2) bKings++;
                }
              }
            }
            UI.updateCounts({ top, bot, tKings, bKings });
          }
        } catch {}

        try {
          Game.deferredPromotion = (data.state && data.state.deferredPromotion) || null;
        } catch {}

        try {
          if (data.state && Array.isArray(data.state.capturedOrder) && typeof TurnFX !== "undefined") {
            TurnFX.capturedOrder = data.state.capturedOrder.slice();
          }
        } catch {}
try {
          Turn.ctx = null;
        } catch {}
        try {
          Turn.start();
        } catch {}

        try {
          if (typeof UI !== "undefined" && UI && typeof UI.updateAll === "function") UI.updateAll();
        } catch {}

        try {
          const lm = data.lastMove;
          const mi = lm && typeof lm.moveIndex === "number" ? lm.moveIndex : 0;
          if (mi && mi > (this._lastSeenMoveModal || 0)) {
            this._lastSeenMoveModal = mi;
            if (lm.kind === "soufla" && lm.decision) {
              
              try {
                if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.rollbackLastMoveBoundary === "function") {
                  if (mi && mi > 0 && !this._lastTrainRollbackEventMI_sf) this._lastTrainRollbackEventMI_sf = 0;
                  if (!mi || mi <= (this._lastTrainRollbackEventMI_sf || 0)) {
                    
                  } else {
                    this._lastTrainRollbackEventMI_sf = mi;
                    const undoneMI = (mi | 0) - 1;
                    try { TrainRecorder.rollbackLastMoveBoundary({ type: "ext_move", moveIndex: undoneMI }); } catch {}
                  }
                }
              } catch {}
              this._showSouflaModalFromLastMove(lm);
            } else if (lm.kind === "undo") {
              
              try {
                if (typeof TrainRecorder !== "undefined" && TrainRecorder && typeof TrainRecorder.rollbackLastMoveBoundary === "function") {
                  if (mi && mi > 0 && !this._lastTrainRollbackEventMI_undo) this._lastTrainRollbackEventMI_undo = 0;
                  if (!mi || mi <= (this._lastTrainRollbackEventMI_undo || 0)) {
                    
                  } else {
                    this._lastTrainRollbackEventMI_undo = mi;
                    const undoneMI = (mi | 0) - 1;
                    let ok = false;
                    try { ok = TrainRecorder.rollbackLastMoveBoundary({ type: "ext_move", moveIndex: undoneMI }); } catch {}
                    if (!ok) { try { TrainRecorder.rollbackLastMoveBoundary(); } catch {} }
                  }
                }
              } catch {}
              safeToast(tr("undo.applied"));
            }
          }


        try {
          const lm2 = data.lastMove;
          const mi2 = lm2 && typeof lm2.moveIndex === "number" ? lm2.moveIndex : 0;

          if (lm2 && lm2.kind === "soufla" && lm2.souflaMeta && lm2.souflaMeta.fx) {
            const fx = lm2.souflaMeta.fx;
            this._lastSouflaFXMoveIndex = mi2 || this._lastSouflaFXMoveIndex;

            try {
              if (typeof Visual !== "undefined" && Visual && Visual.clearSouflaFX) {
                Visual.clearSouflaFX();
              }
            } catch {}

            
try {
  if (fx && Array.isArray(fx.redPaths) && fx.redPaths.length) {
    Visual.setSouflaIgnoredPaths && Visual.setSouflaIgnoredPaths(fx.redPaths);
  } else if (fx && fx.red && fx.red.from != null) {
    Visual.setSouflaIgnoredPaths && Visual.setSouflaIgnoredPaths([{ from: fx.red.from, path: [fx.red.to], jumps: [] }]);
  }
} catch {}

            try {
              if (fx && fx.undoArrow && fx.undoArrow.from != null) {
  if (Array.isArray(fx.undoArrow.path) && fx.undoArrow.path.length) {
    Visual.setSouflaUndoArrow && Visual.setSouflaUndoArrow(fx.undoArrow.from, fx.undoArrow.path);
  } else if (fx.undoArrow.to != null) {
    Visual.setSouflaUndoArrow && Visual.setSouflaUndoArrow(fx.undoArrow.from, fx.undoArrow.to);
  }
}
            } catch {}

            try {
              if (fx && fx.removeIdx != null) {
                Visual.setSouflaRemove && Visual.setSouflaRemove(fx.removeIdx);
              }
            } catch {}

            try {
              if (fx && Array.isArray(fx.forcePath) && fx.forcePath.length) {
                Visual.setSouflaForcePath && Visual.setSouflaForcePath(fx.forcePath);
              }
            } catch {}
          } else if (
            this._lastSouflaFXMoveIndex != null &&
            mi2 &&
            mi2 > this._lastSouflaFXMoveIndex
          ) {
            try {
              if (typeof Visual !== "undefined" && Visual && Visual.clearSouflaFX) {
                Visual.clearSouflaFX();
              }
            } catch {}
            this._lastSouflaFXMoveIndex = null;
          }
        } catch {}

        } catch (e) {
          console.warn("Online modal sync failed:", e);
        }
      } catch (e) {
        console.warn("Online state apply failed:", e);
      } finally {
        this._isApplyingRemote = false;
      }
    },


    


    syncNow: async function() {
      if (!this.isActive || !this.gameRef) return;
      try {
        const snap = await this.gameRef.once("value");
        const data = snap && snap.val ? snap.val() : null;
        if (!data) return;

        try { this._renderSharedLog(data.log || []); } catch {}
        try { this._handlePresence(data); } catch {}

        

        const stateSnap = (data.state && data.state.snapshot) ||
          (data.states && data.ply != null && data.states[data.ply] && data.states[data.ply].snapshot) ||
          null;

        if (stateSnap) {
          
          const dp = (data.state && data.state.deferredPromotion) ||
            (data.states &&
              data.ply != null &&
              data.states[data.ply] &&
              data.states[data.ply].deferredPromotion) ||
            null;

          const patched = Object.assign({}, data, {
            state: Object.assign({}, data.state || {}, {
              snapshot: stateSnap,
              deferredPromotion: dp,
            }),
          });
          this._applyRemoteState(patched);
        } else if (typeof data.turn === "number") {
          try {
            Game.player = data.turn;
            Turn.ctx = null;
            Turn.start();
            UI.updateAll();
          } catch {}
        }
      } catch (e) {
        console.warn("syncNow failed:", e);
        safeToast(tr("online.syncFail"));
      }
    },
    

    _setupGamePresence: function() {
      if (!this.isActive || !this.gameRef) return;
      if (this.presenceRef) return;

      
      
      
      try {
        this._gameConnInfoRef = firebase.database().ref(".info/connected");
      } catch {}

      this.presenceRef = this.gameRef.child("presence").child(this.myUid);

      const serverNow = () => (
        (firebase && firebase.database && firebase.database.ServerValue)
          ? firebase.database.ServerValue.TIMESTAMP
          : nowTs()
      );

      this._gamePresenceDenied = false;

      const write = () => {
        try {
          if (this._gamePresenceDenied) return;
          if (!requireAuthUid(this.myUid)) return;
          safeDbWriteNoAwait("set", this.presenceRef, {
            uid: this.myUid,
            nickname: this.myNick || "",
            side: this.mySide,
            joinedAt: serverNow(),
            updatedAt: serverNow(),
          }, {
            uid: this.myUid,
            path: "/games/" + (this.gameId || "") + "/presence/" + this.myUid,
            ctx: "gamePresence.set",
            suppressGlobalDenied: true,
            onDenied: () => { try { this._gamePresenceDenied = true; this._stopGamePresenceHeartbeat(); } catch {} }
          });
        } catch {}
      };

      try { this.presenceRef.onDisconnect().remove(); } catch {}
      write();

      try { this._startGamePresenceHeartbeat(); } catch {}

      if (this._gameConnInfoRef) {
        this._gameConnInfoHandler = (s) => {
          const connected = !!(s && s.val && s.val());
          if (connected) {
            if (this._gameWasConnected === false) {
              this._gameWasConnected = true;
              try { this.syncNow(); } catch {}
            }
            try { this._selfConnected = true; this._updatePresenceUi(); } catch {}
            try { this.presenceRef.onDisconnect().remove(); } catch {}
            write();
          } else {
            this._gameWasConnected = false;
            try { this._selfConnected = false; this._updatePresenceUi(); } catch {}
            try { UI.status(tr("online.offline")); } catch {}
          }
        };
        try { this._gameConnInfoRef.on("value", this._gameConnInfoHandler); } catch {}
      }
    },

    

    _teardownGamePresence: function() {
      try { this._stopGamePresenceHeartbeat(); } catch {}
      try {
        if (this._gameConnInfoRef && this._gameConnInfoHandler) {
          this._gameConnInfoRef.off("value", this._gameConnInfoHandler);
        }
      } catch {}
      this._gameConnInfoRef = null;
      this._gameConnInfoHandler = null;

      try {
        if (this.presenceRef) this.presenceRef.remove();
      } catch {}
      this.presenceRef = null;

      this._oppOfflineSince = null;
      this._oppLeftModalShown = false;
      try {
        this._oppOnline = false;
        this._updatePresenceUi();
      } catch {}
    },

    

    

    refreshPvpControls: function() {
      
      if (!this.isActive) return;

      const btnSpk = document.getElementById("btnSpk");          
      const btnMic = document.getElementById("btnMic");          
      const btnChat = document.getElementById("btnChat");        
      const btnSpecSpk = document.getElementById("btnSpecSpk");  
      const btnSpecMic = document.getElementById("btnSpecMic");  

      
      const v = this._voice || {};
      const voiceOn = !!v.enabled;
      const micMuted = !!v.micMuted;
      const spkMuted = !!v.speakerMuted;

      const setBtn = (btn, iconFile, label) => {
        if (!btn) return;
        try {
          const img = btn.querySelector("img.btn-ico");
          if (img && iconFile) img.setAttribute("src", "../assets/icons/" + iconFile);
        } catch {}
        try {
          const tEl = btn.querySelector(".btn-text");
          if (tEl) tEl.textContent = String(label || "");
        } catch {}
        try {
          const sr = btn.querySelector(".sr-only");
          if (sr) sr.textContent = String(label || "");
        } catch {}
        try { btn.setAttribute("aria-label", String(label || "")); } catch {}
      };

      if (btnChat) {
        setBtn(btnChat, "chat.svg", tr("pvp.chat.open"));
      }

      setBtn(
        btnSpk,
        spkMuted ? "volume-off.svg" : "volume-on.svg",
        spkMuted ? tr("pvp.voice.spkOff") : tr("pvp.voice.spkOn")
      );

      setBtn(
        btnSpecSpk,
        spkMuted ? "volume-off.svg" : "volume-on.svg",
        spkMuted ? tr("pvp.voice.spkOff") : tr("pvp.voice.spkOn")
      );

      setBtn(
        btnMic,
        micMuted ? "mic-off.svg" : "mic-on.svg",
        micMuted ? tr("pvp.voice.micOff") : tr("pvp.voice.micOn")
      );

      setBtn(
        btnSpecMic,
        micMuted ? "mic-off.svg" : "mic-on.svg",
        micMuted ? tr("pvp.voice.micOff") : tr("pvp.voice.micOn")
      );
    },

    

    toggleSpeaker: async function() {
      try {
        this._voice = this._voice || { enabled: false, speakerMuted: true, micMuted: true, peers: new Map(), remoteAudioEls: new Map() };

        
        try {
          if (!this._voice.enabled) {
            await this._voiceJoin({ noMicPrompt: true });
          }
        } catch {}

        this._voice.speakerMuted = !this._voice.speakerMuted;
        
        try {
          if (this._voice.remoteAudioEls && this._voice.remoteAudioEls.forEach) {
            this._voice.remoteAudioEls.forEach((el) => { try { el.muted = !!this._voice.speakerMuted; } catch {} });
          }
        } catch {}
        
        try { this._voiceKickAudio(); } catch {}
        try { this.refreshPvpControls(); } catch {}
      } catch {}
    },

    

    toggleMic: async function() {
      try {
        this._voice = this._voice || { enabled: false, speakerMuted: true, micMuted: true, peers: new Map(), remoteAudioEls: new Map(), role: this.isSpectator ? "spectator" : "player" };

        const wantUnmute = !!this._voice.micMuted; 

        
        if (!this._voice.enabled) {
          try {
            await this._voiceJoin({ noMicPrompt: !wantUnmute, allowSpectatorMic: this.isSpectator && wantUnmute });
          } catch {}
        } else if (wantUnmute && !this._voice.localStream) {
          
          try { this._voiceLeave(); } catch {}
          try { await this._voiceJoin({ noMicPrompt: false, allowSpectatorMic: !!this.isSpectator }); } catch {}
        }

        
        this._voice.micMuted = !this._voice.micMuted;

        try {
          const s = this._voice.localStream;
          if (s) {
            s.getAudioTracks().forEach((t) => { t.enabled = !this._voice.micMuted; });
          }
        } catch {}

        try {
          if (this._voiceParticipantsRef && this.myUid && requireAuthUid(this.myUid) && this._voice && !this._voice.writeDenied) {
            safeDbWriteNoAwait("update", this._voiceParticipantsRef.child(this.myUid), { micMuted: !!this._voice.micMuted, lastSeen: nowTs() }, {
              uid: this.myUid,
              path: "/rtc/" + (this.gameId || "") + "/participants/" + this.myUid,
              ctx: "rtc.participant.update",
              suppressGlobalDenied: true,
              onDenied: () => { try { if (this._voice) this._voice.writeDenied = true; } catch {} }
            });
          }
        } catch {}
        try { this._voiceKickAudio(); } catch {}
        try { this.refreshPvpControls(); } catch {}
      } catch {}
    },

    
    
    _voiceKickAudio: function() {
      try {
        
        try {
          if (!this._voice) return;
          if (!this._voice._audioCtx && (window.AudioContext || window.webkitAudioContext)) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this._voice._audioCtx = new Ctx();
          }
          if (this._voice._audioCtx && this._voice._audioCtx.state === "suspended") {
            this._voice._audioCtx.resume().catch(() => {});
          }
        } catch {}

        
        if (this._voice && this._voice.remoteAudioEls && this._voice.remoteAudioEls.forEach) {
          this._voice.remoteAudioEls.forEach((el) => {
            try {
              el.muted = !!this._voice.speakerMuted;
              el.volume = 1;
              const p = el.play && el.play();
              if (p && p.catch) p.catch(() => {});
            } catch {}
          });
        }
      } catch {}
    },

    

    toggleVoice: async function() {
      try {
        if (this._voice && this._voice.enabled) {
          this._voiceLeave();
        } else {
          await this._voiceJoin();
        }
        try { this.refreshPvpControls(); } catch {}
      } catch {}
    },

    

    openChatModal: function() {
      try {
        if (!this.isActive) return;
        if (this.isSpectator) {
          
          safeToast(tr("pvp.chatPlayersOnly"));
          return;
        }

        this._chat = this._chat || { messages: [], unread: 0, isOpen: false, lastSendAt: 0 };

        
        try {
          const btnChat = document.getElementById("btnChat");
          if (btnChat) delete btnChat.dataset.badge;
        } catch {}
        this._chat.unread = 0;
        this._chat.isOpen = true;

        const oppName = this._getOpponentNickname(this._lastGameData) || tr("online.opponent");
        const title = `${tr("pvp.chat.title")} — ${oppName}`;

        const wrap = document.createElement("div");
        wrap.className = "pvp-chat";

        const list = document.createElement("div");
        list.className = "pvp-chat-list";
        list.style.maxHeight = "50vh";
        list.style.overflow = "auto";
        list.style.display = "flex";
        list.style.flexDirection = "column";
        list.style.gap = "8px";
        list.style.padding = "8px 2px";

        const form = document.createElement("div");
        form.className = "pvp-chat-form";
        form.style.display = "flex";
        form.style.gap = "8px";
        form.style.marginTop = "10px";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 200;
        input.placeholder = tr("pvp.chat.placeholder");
        input.style.flex = "1";
        input.style.padding = "10px";
        input.style.borderRadius = "10px";
        input.style.border = "1px solid rgba(0,0,0,0.12)";

        const send = document.createElement("button");
        send.className = "btn primary";
        send.textContent = tr("pvp.chat.send");
        send.type = "button";
        send.style.whiteSpace = "nowrap";

        form.appendChild(input);
        form.appendChild(send);

        wrap.appendChild(list);
        wrap.appendChild(form);

        const render = () => {
          try {
            list.innerHTML = "";
            const arr = (this._chat && Array.isArray(this._chat.messages)) ? this._chat.messages : [];
            const last = arr.slice(-50);
            if (!last.length) {
              const empty = document.createElement("div");
              empty.className = "pvp-chat-empty";
              empty.style.textAlign = "center";
              empty.style.opacity = "0.7";
              empty.style.padding = "18px 8px";
              empty.textContent = tr("pvp.chat.empty");
              list.appendChild(empty);
              return;
            }

            last.forEach((m) => {
              const row = document.createElement("div");
              row.style.display = "flex";
              row.style.flexDirection = "column";
              row.style.alignSelf = (m.fromUid === this.myUid) ? "flex-end" : "flex-start";
              row.style.maxWidth = "90%";

              const bubble = document.createElement("div");
              bubble.style.padding = "8px 10px";
              bubble.style.borderRadius = "12px";
              bubble.style.background = (m.fromUid === this.myUid) ? "rgba(16,185,129,0.18)" : "rgba(59,130,246,0.16)";
              bubble.style.wordBreak = "break-word";
              bubble.textContent = m.text || "";

              const meta = document.createElement("div");
              meta.style.fontSize = "12px";
              meta.style.opacity = "0.7";
              meta.style.marginTop = "4px";
              const ts = typeof m.ts === "number" ? m.ts : null;
              meta.textContent = ts ? new Date(ts).toLocaleTimeString("en-GB", { hour12: false }) : "";

              row.appendChild(bubble);
              row.appendChild(meta);
              list.appendChild(row);
            });

            
            list.scrollTop = list.scrollHeight + 9999;
          } catch {}
        };

        const trySend = async () => {
          try {
            const txt = (input.value || "").trim();
            if (!txt) return;
            if (txt.length > 200) {
              safeToast(tr("pvp.chat.tooLong"));
              return;
            }
            const now = Date.now();
            if (now - (this._chat.lastSendAt || 0) < 1200) {
              safeToast(tr("pvp.chat.rateLimit"));
              return;
            }
            this._chat.lastSendAt = now;
            input.value = "";

            const msg = {
              fromUid: this.myUid,
              fromNick: this.myNick || "",
              text: txt,
              ts: nowTs(),
            };

            await this._chatMessagesRef?.push?.(msg);
            
            try { this._pruneChatMessages(50); } catch {}
          } catch (e) {
            safeToast(tr("pvp.chat.failed"));
          }
        };

        send.addEventListener("click", trySend);
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            trySend();
          }
        });

        
        render();
        this._chat._render = render;

        Modal.open({
          title,
          body: wrap,
          buttons: [
            { label: tr("actions.close"), className: "secondary", onClick: () => Modal.close() },
          ],
          onClose: () => {
            try { this._chat.isOpen = false; } catch {}
          },
        });
      } catch {}
    },

    
    
    
    _pruneChatMessages: async function(limit) {
      try {
        limit = Number(limit) || 50;
        if (!this._chatMessagesRef || limit < 1) return;

        
        const keepSnap = await this._chatMessagesRef.orderByKey().limitToLast(limit).once("value");
        const keepVal = keepSnap && keepSnap.val ? keepSnap.val() : null;
        if (!keepVal || typeof keepVal !== "object") return;
        const keepKeys = Object.keys(keepVal).filter(Boolean).sort();
        if (keepKeys.length < limit) return; 

        const oldestKeepKey = keepKeys[0];
        if (!oldestKeepKey) return;

        
        
        for (let i = 0; i < 12; i++) {
          const snap = await this._chatMessagesRef
            .orderByKey()
            .endAt(oldestKeepKey)
            .limitToFirst(400)
            .once("value");

          const v = snap && snap.val ? snap.val() : null;
          if (!v || typeof v !== "object") break;
          const keys = Object.keys(v).filter(Boolean).sort();
          if (keys.length <= 1) break; 

          const updates = {};
          for (const k of keys) {
            if (k !== oldestKeepKey) updates[k] = null;
          }
          if (!Object.keys(updates).length) break;
          await this._chatMessagesRef.update(updates);
        }
      } catch {}
    },

    

    _getOpponentNickname: function(data) {
      try {
        if (!data || !data.players) return "";
        const w = data.players.white || {};
        const b = data.players.black || {};
        if (this.myUid && w.uid && w.uid !== this.myUid) return String(w.nickname || "");
        if (this.myUid && b.uid && b.uid !== this.myUid) return String(b.nickname || "");
        
        return String((w.nickname || "") || (b.nickname || ""));
      } catch {}
      return "";
    },

    

    _initRoomComms: async function() {
      try {
        if (!this.isActive || !this.gameId || !db) return;
        
        if (!this.isSpectator) {
          this._chat = this._chat || { messages: [], unread: 0, isOpen: false, lastSendAt: 0 };

          this._chatRef = db.ref("chats").child(this.gameId);
          this._chatMessagesRef = this._chatRef.child("messages");

        
        const onMsg = (snap) => {
          try {
            const m = snap.val();
            if (!m) return;
            this._chat.messages = Array.isArray(this._chat.messages) ? this._chat.messages : [];
            this._chat.messages.push({
              id: snap.key || "",
              fromUid: m.fromUid || "",
              fromNick: m.fromNick || "",
              text: typeof m.text === "string" ? m.text : String(m.text || ""),
              ts: typeof m.ts === "number" ? m.ts : nowTs(),
            });
            if (this._chat.messages.length > 120) this._chat.messages = this._chat.messages.slice(-80);

            
            if (this._chat.isOpen && this._chat._render) {
              this._chat._render();
            } else if (!this.isSpectator && (m.fromUid || "") !== this.myUid) {
              this._chat.unread = (this._chat.unread || 0) + 1;
              const btn = document.getElementById("btnChat");
              if (btn) {
                btn.dataset.badge = tr("pvp.chat.badge");
              }
            }
          } catch {}
        };

        try {
          
          this._chatMessagesRef.off("child_added", onMsg);
          this._chatMessagesRef.limitToLast(50).on("child_added", onMsg);
          this._chatMsgHandler = onMsg;
          
          try { this._pruneChatMessages(50); } catch {}
        } catch {}

        }

        
        
        if (typeof RTCPeerConnection !== "undefined") {
          try {
            this._voice = this._voice || { enabled: false, speakerMuted: true, micMuted: true, peers: new Map(), remoteAudioEls: new Map(), role: this.isSpectator ? "spectator" : "player" };
            if (this.isSpectator) {
              
              await this._voiceJoin({ noMicPrompt: true });
            }
          } catch {}
        }

        try { this.refreshPvpControls(); } catch {}
      } catch {}
    },

    

    _teardownRoomComms: function() {
      
      try {
        if (this._chatMessagesRef && this._chatMsgHandler) {
          this._chatMessagesRef.off("child_added", this._chatMsgHandler);
        }
      } catch {}
      this._chatMsgHandler = null;
      this._chatRef = null;
      this._chatMessagesRef = null;

      
      try { this._voiceLeave(); } catch {}

      try {
        const btn = document.getElementById("btnChat");
        if (btn) delete btn.dataset.badge;
      } catch {}
    },

    

    _voiceJoin: async function(opts) {
      opts = opts || {};
      if (!this.isActive || !this.gameId || !db) return;

      this._voice = this._voice || { enabled: false, speakerMuted: true, micMuted: true, peers: new Map(), remoteAudioEls: new Map(), role: this.isSpectator ? "spectator" : "player" };
      if (this._voice.enabled) return;

      
      this._rtcRef = db.ref("rtc").child(this.gameId);
      this._voiceParticipantsRef = this._rtcRef.child("participants");
      this._voiceSignalsToMeRef = this._rtcRef.child("signals").child(this.myUid);
      this._voiceKnownParticipants = new Set();
      try { if (this.myUid) this._voiceKnownParticipants.add(this.myUid); } catch {}
       // Create participant node (guarded) before enabling signaling
       this._voiceParticipantsReady = false;
       try {
         if (!requireAuthUid(this.myUid)) return;
         const okP = await safeDbWrite("set", this._voiceParticipantsRef.child(this.myUid), {
uid: this.myUid,
          nickname: this.myNick || "",
          role: this.isSpectator ? "spectator" : "player",
          micMuted: !!this._voice.micMuted,
          joinedAt: nowTs(),
          lastSeen: nowTs(),
         }, {
           uid: this.myUid,
           path: "/rtc/" + this.gameId + "/participants/" + this.myUid,
           ctx: "rtc.participant",
           suppressGlobalDenied: true
         });
         if (okP) {
           this._voiceParticipantsReady = true;
           try { this._voiceParticipantsRef.child(this.myUid).onDisconnect().remove(); } catch {}
         } else {
           // If denied, disable voice sending to avoid loops
           try { if (this._voice) this._voice.writeDenied = true; } catch {}
           return;
         }
       } catch (e) {
         if (isPermissionDenied(e)) {
           logDeniedWrite({ op: "set", path: "/rtc/" + this.gameId + "/participants/" + this.myUid, uid: this.myUid, ctx: "rtc.participant" }, e);
           try { if (this._voice) this._voice.writeDenied = true; } catch {}
           handleDbError(e);
           return;
         }
       }
if (!opts.noMicPrompt && (!this.isSpectator || opts.allowSpectatorMic)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          this._voice.localStream = stream;
          
          try { stream.getAudioTracks().forEach((t) => { t.enabled = !this._voice.micMuted; }); } catch {}
        } catch (e) {
          
          this._voice.localStream = null;
          this._voice.micMuted = true;
          safeToast(tr("pvp.voice.failed"));
        }
      }

      
      try {
        if (!document.getElementById("pvpAudio")) {
          const c = document.createElement("div");
          c.id = "pvpAudio";
          c.style.display = "none";
          document.body.appendChild(c);
        }
      } catch {}

      
      const onPart = (snap) => {
        try {
          const other = snap.val();
          if (!other || !other.uid || other.uid === this.myUid) return;
          const otherUid = String(other.uid);
          try { this._voiceKnownParticipants && this._voiceKnownParticipants.add(otherUid); } catch {}
          this._voiceConnectTo(otherUid);
        } catch {}
      };
      const onPartRemoved = (snap) => {
        try {
          const other = snap.key;
          if (!other) return;
          try { this._voiceKnownParticipants && this._voiceKnownParticipants.delete(String(other)); } catch {}
          this._voiceDropPeer(other);
        } catch {}
      };
      try {
        this._voiceParticipantsRef.off();
        this._voiceParticipantsRef.on("child_added", onPart);
        this._voiceParticipantsRef.on("child_removed", onPartRemoved);
        this._voiceParticipantsHandler = onPart;
        this._voiceParticipantsRemovedHandler = onPartRemoved;
      } catch {}

      
      const attachFromUid = (fromUid) => {
        const ref = this._voiceSignalsToMeRef.child(fromUid);
        const onSig = async (s) => {
          try {
            const msg = s.val();
            if (!msg) return;
            await this._voiceHandleSignal(fromUid, msg);
            try { s.ref.remove(); } catch {}
          } catch {}
        };
        try {
          ref.off();
          ref.on("child_added", onSig);
          this._voiceSignalHandlers = this._voiceSignalHandlers || new Map();
          this._voiceSignalHandlers.set(fromUid, { ref, onSig });
        } catch {}
      };

      const onFromUid = (snap) => {
        try {
          const fromUid = snap.key;
          if (!fromUid) return;
          attachFromUid(fromUid);
        } catch {}
      };

      try {
        this._voiceSignalsToMeRef.off();
        this._voiceSignalsToMeRef.on("child_added", onFromUid);
        this._voiceSignalsRootHandler = onFromUid;
      } catch {}

      this._voice.enabled = true;
      try { this.refreshPvpControls(); } catch {}
    },

    

    _voiceLeave: function() {
      try {
        if (!this._voice) return;
        this._voice.enabled = false;

        
        try {
          if (this._voiceParticipantsRef && this._voiceParticipantsHandler) {
            this._voiceParticipantsRef.off("child_added", this._voiceParticipantsHandler);
          }
          if (this._voiceParticipantsRef && this._voiceParticipantsRemovedHandler) {
            this._voiceParticipantsRef.off("child_removed", this._voiceParticipantsRemovedHandler);
          }
        } catch {}
        this._voiceParticipantsHandler = null;
        this._voiceParticipantsRemovedHandler = null;

        try {
          if (this._voiceSignalsToMeRef && this._voiceSignalsRootHandler) {
            this._voiceSignalsToMeRef.off("child_added", this._voiceSignalsRootHandler);
          }
        } catch {}
        this._voiceSignalsRootHandler = null;

        try {
          if (this._voiceSignalHandlers && this._voiceSignalHandlers.forEach) {
            this._voiceSignalHandlers.forEach((h) => {
              try { h.ref.off("child_added", h.onSig); } catch {}
            });
          }
        } catch {}
        this._voiceSignalHandlers = null;

        
        try {
          if (this._voice.peers && this._voice.peers.forEach) {
            this._voice.peers.forEach((pc, uid) => { try { pc.close(); } catch {} });
          }
        } catch {}
        try { if (this._voice.peers) this._voice.peers.clear(); } catch {}

        
        try {
          if (this._voice.remoteAudioEls && this._voice.remoteAudioEls.forEach) {
            this._voice.remoteAudioEls.forEach((el) => { try { el.remove(); } catch {} });
          }
        } catch {}
        try { if (this._voice.remoteAudioEls) this._voice.remoteAudioEls.clear(); } catch {}

        
        try {
          if (this._voice.localStream) {
            this._voice.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
          }
        } catch {}
        this._voice.localStream = null;

        
        try {
          this._voiceParticipantsRef && this._voiceParticipantsRef.child(this.myUid).remove();
        } catch {}
      } catch {}
    },

    

_voiceSendSignal: function(toUid, payload) {
      try {
        if (!this._rtcRef || !this.gameId) return;
        if (!toUid || !this.myUid) return;
        if (this._voice && this._voice.writeDenied) return;

        // Gate on auth + room join + participants ready
        if (!requireAuthUid(this.myUid)) return;
        if (!this._voiceParticipantsReady) return;
        try {
          if (this._voiceKnownParticipants && !this._voiceKnownParticipants.has(String(toUid))) return;
        } catch {}

        const ref = this._rtcRef.child("signals").child(toUid).child(this.myUid);
        const msg = Object.assign({ ts: Date.now() }, payload || {});
        // Keep rtc.signal payload compatible with RTDB rules: avoid oversize SDP strings by chunking.
        try {
          if (msg && typeof msg.sdp === "string" && msg.sdp.length > 4900) {
            const sdp = msg.sdp;
            try { delete msg.sdp; } catch { msg.sdp = null; }
            const parts = [];
            const CHUNK = 4000;
            for (let i = 0; i < sdp.length; i += CHUNK) parts.push(sdp.slice(i, i + CHUNK));
            msg.sdpParts = parts;
            msg.sdpChunked = true;
          }
        } catch {}
        safeDbWriteNoAwait("push", ref, msg, {
          uid: this.myUid,
          path: "/rtc/" + this.gameId + "/signals/" + String(toUid) + "/" + this.myUid,
          ctx: "rtc.signal",
          suppressGlobalDenied: true,
          onDenied: () => { try { if (this._voice) this._voice.writeDenied = true; } catch {} }
        });
      } catch {}
    },

    

    _voiceEnsurePeer: function(otherUid) {
      this._voice = this._voice || { enabled: false, speakerMuted: true, micMuted: true, peers: new Map(), remoteAudioEls: new Map(), role: this.isSpectator ? "spectator" : "player" };
      if (this._voice.peers && this._voice.peers.has(otherUid)) return this._voice.peers.get(otherUid);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      
      try {
        if (this._voice.localStream) {
          this._voice.localStream.getTracks().forEach((track) => pc.addTrack(track, this._voice.localStream));
        } else {
          try { pc.addTransceiver("audio", { direction: "recvonly" }); } catch {}
        }
      } catch {}

      pc.onicecandidate = (ev) => {
        if (ev.candidate) this._voiceSendSignal(otherUid, { type: "ice", candidate: ev.candidate });
      };

      pc.ontrack = (ev) => {
        try {
          const stream = ev.streams && ev.streams[0] ? ev.streams[0] : null;
          if (!stream) return;

          let el = this._voice.remoteAudioEls.get(otherUid);
          if (!el) {
            el = document.createElement("audio");
            el.autoplay = true;
            el.playsInline = true;
            el.muted = !!this._voice.speakerMuted;
            this._voice.remoteAudioEls.set(otherUid, el);
            const holder = document.getElementById("pvpAudio") || document.body;
            holder.appendChild(el);
          }
          el.srcObject = stream;
          try {
            
            el.volume = 1;
            const p = el.play && el.play();
            if (p && p.catch) p.catch(() => {});
          } catch {}
          try { this._voiceKickAudio(); } catch {}
        } catch {}
      };

      pc.onconnectionstatechange = () => {
        try { this.refreshPvpControls(); } catch {}
      };

      this._voice.peers.set(otherUid, pc);
      return pc;
    },

    

    _voiceConnectTo: async function(otherUid) {
      try {
        if (!this._voice || !this._voice.enabled) return;
        const pc = this._voiceEnsurePeer(otherUid);

        const iOffer = String(this.myUid || "") < String(otherUid || "");
        if (!iOffer) return;

        
        if (pc.signalingState !== "stable") return;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this._voiceSendSignal(otherUid, { type: "offer", sdp: offer.sdp });
      } catch {}
    },

    

    _voiceDropPeer: function(uid) {
      try {
        if (!this._voice) return;
        const pc = this._voice.peers && this._voice.peers.get(uid);
        if (pc) { try { pc.close(); } catch {} }
        try { this._voice.peers && this._voice.peers.delete(uid); } catch {}
        const el = this._voice.remoteAudioEls && this._voice.remoteAudioEls.get(uid);
        if (el) { try { el.remove(); } catch {} }
        try { this._voice.remoteAudioEls && this._voice.remoteAudioEls.delete(uid); } catch {}
      } catch {}
    },

    

    _voiceHandleSignal: async function(fromUid, msg) {
      if (!msg || !fromUid) return;
      const pc = this._voiceEnsurePeer(fromUid);

      try {
        if (!msg.sdp && msg.sdpParts && Array.isArray(msg.sdpParts)) {
          msg.sdp = msg.sdpParts.join("");
        }
      } catch {}

      try {
        if (msg.type === "offer" && msg.sdp) {
          
          const iOffer = String(this.myUid || "") < String(fromUid || "");
          if (iOffer && pc.signalingState !== "stable") return;

          await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          this._voiceSendSignal(fromUid, { type: "answer", sdp: ans.sdp });
          return;
        }

        if (msg.type === "answer" && msg.sdp) {
          await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          return;
        }

        if (msg.type === "ice" && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate); } catch {}
          return;
        }
      } catch {}
    },


    

    _getOpponentUid: function(data) {
      try {
        if (!data || !data.players) return null;
        if (this.mySide === -1) {
          return data.players.black && data.players.black.uid ? data.players.black.uid : null;
        }
        if (this.mySide === +1) {
          return data.players.white && data.players.white.uid ? data.players.white.uid : null;
        }
      } catch {}
      return null;
    },

    

    

    _handlePresence: function(data) {
      if (!data) return;
      const oppUid = this._getOpponentUid(data);
      if (!oppUid) return;

      const pres = data.presence ? data.presence[oppUid] : null;
      const online = !!pres;

      try {
        this._oppOnline = online;
        if (pres && pres.nickname) this._oppName = String(pres.nickname);
        this._updatePresenceUi();
        try {
          if (online) {
            this._oppOfflineSince = null;
            this._oppLeftModalShown = false;
          } else {
            if (!this._oppOfflineSince) this._oppOfflineSince = nowTs();
          }
        } catch {}
      } catch {}
    },

    


    _renderSharedLog: function(logArr) {
      try {
        const arr = Array.isArray(logArr) ? logArr : [];
        const last = arr.length ? arr[arr.length - 1] : null;
        const key = `${arr.length}:${last && last.ts ? last.ts : ""}`;
        if (key === this._lastRenderedLogKey) return;
        this._lastRenderedLogKey = key;

        const logEl = document.getElementById("log");
        if (!logEl) return;

        const slice = arr.slice(-80).reverse();

        logEl.innerHTML = "";
        slice.forEach((it) => {
          const row = document.createElement("div");
          row.className = "log-item";

          const timeEl = document.createElement("span");
          timeEl.className = "time";
          const ts = it && typeof it.ts === "number" ? it.ts : null;
          timeEl.textContent = ts != null ? new Date(ts).toLocaleTimeString("en-GB", { hour12: false }) : "";

          const msgEl = document.createElement("span");
          msgEl.className = "msg";
          msgEl.textContent = it && it.text ? String(it.text) : "";

          row.appendChild(timeEl);
          row.appendChild(document.createTextNode(" "));
          row.appendChild(msgEl);

          logEl.appendChild(row);
        });
      } catch (e) {
        console.warn("renderSharedLog failed:", e);
      }
    },

    

    _endByDisconnect: async function() {
      if (!this.gameRef) return;
      try {
        await this.gameRef.transaction((g) => {
          if (!g || g.status !== "active") return g;
          g.status = "ended";
          g.endedAt = nowTs();
          g.endedReason = "opponent_disconnect";
          g.winner = this.mySide;

          g.log = Array.isArray(g.log) ? g.log : [];
          const who = this.myNick || tr("players.player");
          g.log.push({
            ts: nowTs(),
            type: "ended_disconnect",
            text: formatTpl(tr("online.log.endedDisconnect"), { player: who }),
          });
          if (g.log.length > 200) g.log = g.log.slice(-200);
          return g;
        });
      } catch (e) {
        console.warn("endByDisconnect failed:", e);
        safeToast(tr("online.endFail"));
      }
    },

    

    _showSouflaModalFromLastMove: function(lm) {
      try {
        const mySide = this.mySide;
        const by = lm.by; 
        const decision = lm.decision;
        const meta = lm.souflaMeta || {};
        const offenderIdx = decision.offenderIdx != null ? decision.offenderIdx : meta.offenderIdx;

        const Lmax = meta.longestGlobal != null ? meta.longestGlobal : 0;
        const startedFrom = meta.startedFrom != null ? meta.startedFrom : null;
        const lastPieceIdx = meta.lastPieceIdx != null ? meta.lastPieceIdx : null;

        const title = tr("modals.soufla.header");

        if (mySide === by) {
          const body = document.createElement("div");
          body.innerHTML = `
            <div style="font-weight:700;margin-bottom:6px;">${tr("soufla.applied.self")}</div>
            <div class="muted">${decision.kind === "remove"
              ? tr("soufla.applied.remove")
              : tr("soufla.applied.force")}</div>
          `;
          Modal.open({
            title,
            body,
            buttons: [{ label: tr("modals.close"), className: "primary", onClick: () => Modal.close() }],
          });
          return;
        }

        const body = document.createElement("div");
body.className = "soufla-summary";

const fmtCell = (idx) => (idx != null ? (typeof rcStr === "function" ? rcStr(idx) : "?") : "?");

const offenderCell = fmtCell(offenderIdx);
const undoFrom = (lastPieceIdx != null && startedFrom != null && lastPieceIdx !== startedFrom) ? fmtCell(lastPieceIdx) : null;
const undoTo = (lastPieceIdx != null && startedFrom != null && lastPieceIdx !== startedFrom) ? fmtCell(startedFrom) : null;

const parts = [];
parts.push(`<div style="font-weight:900;margin-bottom:6px;">${tr("soufla.summary.title")}</div>`);
parts.push(`<div>${tr("soufla.summary.reason")}</div>`);
parts.push(`<div style="margin-top:10px;font-weight:800;">${tr("soufla.summary.penaltyTitle")}</div>`);

if (decision.kind === "force") {
  const p = Array.isArray(decision.path) ? decision.path.slice() : [];
  const toIdx = p.length ? p[p.length - 1] : offenderIdx;
  const len = p.length || 0;

  parts.push(
    `<div>${tr("soufla.summary.force", { from: offenderCell, to: fmtCell(toIdx), len })}</div>`
  );

  if (undoFrom && undoTo) {
    parts.push(
      `<div class="muted" style="margin-top:8px;">${tr("soufla.summary.undo", { from: undoFrom, to: undoTo })}</div>`
    );
  }
} else {
  parts.push(
    `<div>${tr("soufla.summary.remove", { cell: offenderCell })}</div>`
  );

  if (undoFrom && undoTo) {
    parts.push(
      `<div class="muted" style="margin-top:8px;">${tr("soufla.summary.undo", { from: undoFrom, to: undoTo })}</div>`
    );
  }
}

body.innerHTML = parts.join("");

Modal.open({
  title,
  body,
  buttons: [{ label: tr("modals.close"), className: "primary", onClick: () => Modal.close() }],
});} catch (e) {
        console.warn("Soufla modal build failed:", e);
      }
    },

    


_maybeRecordOpponentMoveForTraining: function(data) {
  try {
    if (typeof TrainRecorder === "undefined" || !TrainRecorder) return;
    if (typeof TrainRecorder.recordExternalDecision !== "function") return;
    if (typeof TrainRecorder.captureStateForTraining !== "function") return;

    
    if (typeof Game === "undefined" || !Game) return;
    if (typeof cloneBoard !== "function") return;
    if (typeof applyMoveSim !== "function") return;
    if (typeof isSquareCapturableBy !== "function") return;
    if (typeof valueAt !== "function" || typeof pieceKind !== "function") return;
    if (typeof rcStr !== "function") return;
    if (typeof N_CELLS !== "number" || typeof ACTION_ENDCHAIN !== "number") return;
    if (typeof MAN !== "number" || typeof KING !== "number") return;

    const lm = data && data.lastMove ? data.lastMove : null;
    if (!lm || lm.kind !== "move") return;

    
    try { if (data && data.soufla && data.soufla.pending) return; } catch {}

    const mi = Number((lm.moveIndex ?? data.moveIndex) ?? 0) || 0;
    if (!mi) return;

    
    const by = typeof lm.by === "number" ? (lm.by | 0) : 0;
    if (!by || (this.mySide != null && by === (this.mySide | 0))) return;
    if (mi <= (this._lastTrainLoggedMoveIndex || 0)) return;

    const ply = (lm.ply != null ? Number(lm.ply) : Number(data.ply)) || 0;
    const prePly = ply - 1;
    if (prePly < 0) return;

    const states = data.states || null;
    const preState = states && states[String(prePly)] ? states[String(prePly)] : null;
    const preSnap = preState && preState.snapshot ? preState.snapshot : null;
    if (!preSnap || !preSnap.board) return;

    const from0 = Number(lm.from);
    if (!Number.isFinite(from0)) return;

    
    let path = [];
    if (Array.isArray(lm.path) && lm.path.length) path = lm.path.slice();
    else if (Number.isFinite(lm.to)) path = [Number(lm.to)];
    if (!path.length) return;

    
    const simBoard = cloneBoard(preSnap.board);

    
    try { if (TrainRecorder && typeof TrainRecorder.beginMoveBoundary === "function") TrainRecorder.beginMoveBoundary({ type: "ext_move", moveIndex: mi, by }); } catch {}

    const savedBoard = Game.board;
    const savedPlayer = Game.player;
    const savedInChain = Game.inChain;
    const savedChainPos = Game.chainPos;

    let anyCap = false;

    try {
      for (let i = 0; i < path.length; i++) {
        const stepFrom = i === 0 ? from0 : Number(path[i - 1]);
        const stepTo = Number(path[i]);
        if (!Number.isFinite(stepFrom) || !Number.isFinite(stepTo)) continue;

        const preChainPosRaw = Number(preSnap.chainPos);
        const preChainPos = Number.isFinite(preChainPosRaw) && preChainPosRaw >= 0 ? (preChainPosRaw | 0) : null;

        
        Game.board = simBoard;
        Game.player = by;
        Game.inChain = i > 0 ? true : !!preSnap.inChain;
        Game.chainPos = i > 0 ? (stepFrom | 0) : preChainPos;

        const st = TrainRecorder.captureStateForTraining();
        if (!st) break;

        const action = (stepFrom | 0) * N_CELLS + (stepTo | 0);

        
        const beforeV = valueAt(stepFrom | 0);
        const beforeKind = pieceKind(beforeV);
        const res = applyMoveSim(stepFrom | 0, stepTo | 0);
        const cap = res && res.isCap ? 1 : 0;
        if (cap) anyCap = true;

        const afterV = valueAt(stepTo | 0);
        const afterKind = pieceKind(afterV);
        const crown = (beforeKind === MAN && afterKind === KING) ? 1 : 0;

        let trap = 0;
        try { trap = isSquareCapturableBy(-by, stepTo | 0) ? 1 : 0; } catch {}

        try {
          TrainRecorder.recordExternalDecision({
            state: st,
            action,
            actor: by,
            cap,
            crown,
            trap,
            fromStr: rcStr(stepFrom | 0),
            toStr: rcStr(stepTo | 0),
          });
        } catch {}
      }

      
      if (anyCap) {
        const lastTo = Number(path[path.length - 1]);
        if (Number.isFinite(lastTo)) {
          Game.board = simBoard;
          Game.player = by;
          Game.inChain = true;
          Game.chainPos = lastTo | 0;

          const endState = TrainRecorder.captureStateForTraining();
          if (endState) {
            let trapEnd = 0;
            try { trapEnd = isSquareCapturableBy(-by, lastTo | 0) ? 1 : 0; } catch {}
            try {
              TrainRecorder.recordExternalDecision({
                state: endState,
                action: ACTION_ENDCHAIN,
                actor: by,
                cap: 0,
                crown: 0,
                trap: trapEnd,
                fromStr: rcStr(lastTo | 0),
                toStr: "END",
              });
            } catch {}
          }
        }
      }
    } finally {
      Game.board = savedBoard;
      Game.player = savedPlayer;
      Game.inChain = savedInChain;
      Game.chainPos = savedChainPos;
    }

    this._lastTrainLoggedMoveIndex = mi;
  } catch (e) {
    
  }
},


    

    
    recordLocalStep: function(fromIdx, toIdx, isCapture, jumpedIdx) {
      if (!this.isActive || this._isApplyingRemote) return;

      try {
        if (!this._awaitingLocalCommit) {
          this._awaitingLocalCommit = true;
          this._expectedMoveIndex = (this.moveIndex || 0) + 1;
          try { this._clearMoveRetry(); } catch {}
        }
      } catch {}

      if (!this._pendingSteps) this._pendingSteps = [];
      this._pendingSteps.push({
        from: fromIdx,
        to: toIdx,
        capture: !!isCapture,
        jumped: jumpedIdx != null ? jumpedIdx : null,
      });
    },

    
    

    
    clearPendingLocalMove: function() {
      this._pendingSteps = [];
      this._cachedSouflaPlain = null;
      try { this._awaitingLocalCommit = false; this._expectedMoveIndex = null; } catch {}
      try { this._clearMoveRetry(); } catch {}
    },


    


    /* Function: Reset pending move retry state */
    _clearMoveRetry: function() {
      try { if (this._moveRetryTimer) clearTimeout(this._moveRetryTimer); } catch {}
      this._moveRetryTimer = null;
      this._moveRetryAttempt = 0;
      this._moveRetryArgs = null;
      this._moveRetryNotified = false;
      this._moveRetryWarned = false;
      this._moveRetryGaveUp = false;
      this._moveRetryDidResync = false;
    },

    /* Function: Force resync local game state from RTDB (ported from old app for correctness) */
    _forceResync: function() {
      if (!this.isActive || !this.gameRef) return;
      try {
        if (this._resyncInFlight) return;
        this._resyncInFlight = true;
        this.gameRef.once("value")
          .then((snap) => {
            const data = snap && typeof snap.val === "function" ? snap.val() : null;
            if (data) {
              try { this._applyRemoteState(data); } catch {}
            }
          })
          .catch(() => {})
          .finally(() => {
            try { this._resyncInFlight = false; } catch {}
          });
      } catch {
        try { this._resyncInFlight = false; } catch {}
      }
    },


    


    /* Function: Schedule move resend with backoff */
    _scheduleMoveRetry: function(from, to, nextTurn) {
      if (!this.isActive || !this.gameRef) return;

      this._moveRetryArgs = { from: from, to: to, nextTurn: nextTurn };

      try { if (this._moveRetryTimer) clearTimeout(this._moveRetryTimer); } catch {}

      const MAX_MOVE_SEND_RETRIES = 12;
      if (this._moveRetryGaveUp) return;

      const attempt = (this._moveRetryAttempt || 0) + 1;
      this._moveRetryAttempt = attempt;
      if (attempt > MAX_MOVE_SEND_RETRIES) {
        this._moveRetryGaveUp = true;
        return;
      }

      const delay = Math.min(15000, 250 * Math.pow(2, Math.min(6, attempt - 1)));

      this._moveRetryTimer = setTimeout(() => {
        try { this._moveRetryTimer = null; } catch {}
        if (!this.isActive) return;
        if (!this._awaitingLocalCommit) return;
        if (this._moveRetryGaveUp) return;
        try {
          this.sendMoveToFirebase(from, to, nextTurn, attempt);
        } catch {}
      }, delay);
    },


    


    cacheSouflaPending: function(pending) {
      this._cachedSouflaPlain = pending ? souflaToPlain(pending) : null;
    },

    

    logSouflaPressedToFirebase: function() {
      if (!this.isActive || !this.gameRef) return;

      const who = this.myNick || tr("players.player");
      const msg = tr("log.soufla.pressed", { who: who });

try {
        this.gameRef.transaction(
          (g) => {
            if (!g || g.status !== "active") return g;

            g.log = g.log || [];
            g.log.push({ ts: nowTs(), text: `${who}: ${msg}` });
            if (g.log.length > 50) g.log = g.log.slice(-50);

            return g;
          },
          (err) => {
            if (err) handleDbError(err, tr("online.logFailed"));
          }
        );
      } catch (e) {
        handleDbError(e, tr("online.logFailed"));
      }
    },

    


    /* Function: Send a move to Firebase without rolling back local state */
    sendMoveToFirebase: function(_from, _to, nextTurn, _attempt) {
      if (!guardOnlineWrite()) return;
      if (!this.isActive || !this.gameRef) return;
      const attempt = Number.isFinite(_attempt) ? _attempt : 0;
      try {
        if (!this._awaitingLocalCommit) {
          this._awaitingLocalCommit = true;
          this._expectedMoveIndex = (this.moveIndex || 0) + 1;
          try { this._clearMoveRetry(); } catch {}
        }
      } catch {}
let steps = Array.isArray(this._pendingSteps) ? this._pendingSteps.slice() : [];
      if (!steps.length) {
        const fr = Number.isFinite(_from) ? _from : null;
        const to = Number.isFinite(_to) ? _to : null;
        if (fr == null || to == null) return;
        steps = [{ from: fr, to: to, capture: false, jumped: null }];
      }
      this._pendingSteps = []; 

      const move = {
        kind: "move",
        by: -nextTurn,
        from: steps[0].from,
        to: steps[steps.length - 1].to,
        path: steps.map((s) => s.to),
        jumps: steps.filter((s) => s.jumped != null).map((s) => s.jumped),
        ts: nowTs(),
      };

      const capOrder =
        typeof TurnFX !== "undefined" && Array.isArray(TurnFX.capturedOrder)
          ? TurnFX.capturedOrder.slice()
          : [];

      const statePayload = {
        snapshot: typeof snapshotState === "function" ? snapshotState() : null,
        deferredPromotion: Game.deferredPromotion || null,
        capturedOrder: capOrder,
      };

      const souflaPlain = this._cachedSouflaPlain;
      this._cachedSouflaPlain = null;

      this.gameRef.transaction(
        (g) => {
          if (!g || g.status !== "active") return g;

          if (typeof g.turn === "number" && g.turn !== move.by) return;

          

          const mi = (g.moveIndex || 0) + 1;
          
          const ply = (g.ply || 0) + 1;

          g.moveIndex = mi;
          g.ply = ply;
          g.turn = nextTurn;

          g.lastMove = Object.assign({ moveIndex: mi, ply }, move);
          g.state = statePayload;

          g.states = g.states || {};
          g.states[ply] = statePayload;


          try {
            const KEEP_STATES = 40;
            const keys = Object.keys(g.states)
              .map((k) => parseInt(k, 10))
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b);
            if (keys.length > KEEP_STATES) {
              const cutoff = keys[keys.length - KEEP_STATES];
              keys.forEach((k) => {
                if (k < cutoff) delete g.states[k];
              });
            }
          } catch {}

          if (souflaPlain && souflaPlain.penalizer != null) {
            g.soufla = {
              availableFor: souflaPlain.penalizer,
              pending: souflaPlain,
            };
          } else {
            g.soufla = null;
          }

          g.log = g.log || [];
          
          const moverName = (move.by === -1
              ? g.players && g.players.white && g.players.white.nickname
              : g.players && g.players.black && g.players.black.nickname) || "";
          g.log.push({
            ts: nowTs(),
            text: `${moverName || "Player"}: ${move.from}→${move.to}`,
          });
          if (g.log.length > 50) g.log = g.log.slice(-50);

          return g;
        },
        (err, committed, snap) => {
          
          
          try {
            if (!err && !committed && snap && typeof snap.val === "function") {
              const cur = snap.val();
              const remoteMi = Number((cur && cur.moveIndex) || 0);
              if (
                this._awaitingLocalCommit &&
                Number.isFinite(this._expectedMoveIndex) &&
                remoteMi >= this._expectedMoveIndex
              ) {
                try { this._awaitingLocalCommit = false; this._expectedMoveIndex = null; } catch {}
                try { this._clearMoveRetry(); } catch {}
                return;
              }
            }
          } catch {}
          // If the server indicates it's not our turn (stale local state), resync instead of retrying.
          try {
            if (!err && !committed && snap && typeof snap.val === "function") {
              const cur = snap.val();
              if (cur && typeof cur.turn === "number" && cur.turn !== move.by) {
                try { this._awaitingLocalCommit = false; this._expectedMoveIndex = null; } catch {}
                try { this._clearMoveRetry(); } catch {}
                try { this._forceResync(); } catch {}
                return;
              }
            }
          } catch {}


          if (err || !committed) {
            this._pendingSteps = steps.concat(this._pendingSteps || []);
            try { this._cachedSouflaPlain = souflaPlain || this._cachedSouflaPlain; } catch {}
            // After a couple of failed commits, do a one-shot resync to resolve stale state.
            try {
              const RESYNC_AFTER = 2;
              if (!this._moveRetryDidResync && attempt >= RESYNC_AFTER) {
                this._moveRetryDidResync = true;
                try { this._forceResync(); } catch {}
              }
            } catch {}


            const MAX_MOVE_SEND_RETRIES = 12;

            try { if (err) handleDbError(err); } catch {}

            try {
              if (!this._moveRetryWarned) {
                if (err) console.warn("sendMoveToFirebase: failed", err);
                else console.warn("sendMoveToFirebase: not committed", { committed });
                this._moveRetryWarned = true;
              }
            } catch {}

            if (attempt >= MAX_MOVE_SEND_RETRIES || (err && isPermissionDenied(err))) {
              try {
                if (!this._moveRetryGaveUp) console.warn("sendMoveToFirebase: giving up", { attempt: attempt });
              } catch {}
              this._moveRetryGaveUp = true;
              return;
            }

            try {
              if (!this._moveRetryNotified) {
                this._moveRetryNotified = true;
                safeToast(tr("status.moveSendFail"));
              }
            } catch {}

            try { this._scheduleMoveRetry(_from, _to, nextTurn); } catch {}
            return;
          }

          
          try { this._awaitingLocalCommit = false; this._expectedMoveIndex = null; } catch {}
          try { this._clearMoveRetry(); } catch {}
        }
      );
    },


    


    sendSouflaDecisionToFirebase: function(decision, pending, nextTurn) {
      if (!guardOnlineWrite()) return;
      if (!this.isActive || !this.gameRef) return;
      if (!decision || !pending) return;

      const move = {
        kind: "soufla",
        by: pending.penalizer,
        decision: decision,
        ts: nowTs(),
      };

      const capOrder =
        typeof TurnFX !== "undefined" && Array.isArray(TurnFX.capturedOrder)
          ? TurnFX.capturedOrder.slice()
          : [];
      const rawFx = (decision && (decision.__souflaFX || decision.fx)) ? (decision.__souflaFX || decision.fx) : null;
      const computedFx = buildSouflaFxFromDecisionAndPending(decision, pending);

      const souflaMeta = {
        offenderIdx: decision.offenderIdx != null ? decision.offenderIdx : null,
        startedFrom: pending.startedFrom != null ? pending.startedFrom : null,
        lastPieceIdx: pending.lastPieceIdx != null ? pending.lastPieceIdx : null,
        longestGlobal: pending.longestGlobal != null ? pending.longestGlobal : 0,
        fx: normalizeSouflaFx(rawFx) || normalizeSouflaFx(computedFx),
      };

      move.souflaMeta = souflaMeta;

      const statePayload = {
        snapshot: typeof snapshotState === "function" ? snapshotState() : null,
        deferredPromotion: Game.deferredPromotion || null,
        capturedOrder: capOrder,
      };

      this._cachedSouflaPlain = null;

      

      const runTx = () =>
        this.gameRef.transaction(
          (g) => {
            if (!g || g.status !== "active") return g;
            if (g.turn !== move.by) return g;

            

            const mi = (g.moveIndex || 0) + 1;
            
            const ply = (g.ply || 0) + 1;

            g.moveIndex = mi;
            g.ply = ply;
            g.turn = nextTurn;
            g.lastMove = Object.assign({ moveIndex: mi, ply }, move);
            g.state = statePayload;
            g.states = g.states || {};
            g.states[ply] = statePayload;

            try {
              const KEEP_STATES = 40;
              const keys = Object.keys(g.states)
                .map((k) => parseInt(k, 10))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b);
              if (keys.length > KEEP_STATES) {
                const cutoff = keys[keys.length - KEEP_STATES];
                keys.forEach((k) => {
                  if (k < cutoff) delete g.states[k];
                });
              }
            } catch {}

            g.soufla = null;
            g.undoRequest = null;

            g.log = g.log || [];
            
            const penName = (move.by === -1
                ? g.players && g.players.white && g.players.white.nickname
                : g.players && g.players.black && g.players.black.nickname) || "";

            const cell = souflaMeta.offenderIdx != null ? (typeof rcStr === "function" ? rcStr(souflaMeta.offenderIdx) : "") : "";
            const what =
              decision.kind === "remove"
                ? tr("log.soufla.remove", { cell })
                : tr("log.soufla.force", { from: cell, path: (souflaMeta.forcePathStr || "") });
            g.log.push({ ts: nowTs(), text: `${penName || "Player"}: ${what}` });
            if (g.log.length > 50) g.log = g.log.slice(-50);

            return g;
          },
          (err, committed) => {
            if (err) {
              handleDbError(err, tr("soufla.sendFailed"));
              return;
            }
            if (committed === false) {
              safeToast(
                tr("soufla.notCommitted")
              );
            }
          }
        );

      try {
        const r = runTx();
        if (r && typeof r.catch === "function") {
          r.catch((e) =>
            handleDbError(e, tr("soufla.sendFailed"))
          );
        }
      } catch (e) {
        handleDbError(e, tr("soufla.sendFailed"));
      }
    },





_undoWaitKeyOf: function(ur) {
  try {
    if (!ur) return null;
    const a = ur.requesterUid != null ? String(ur.requesterUid) : "";
    let b = ur.requestedAt;
    if (b != null && typeof b === "object") {
      try { b = JSON.stringify(b); } catch { b = String(b); }
    }
    b = b != null ? String(b) : "";
    const c = ur.ply != null ? String(ur.ply) : "";
    if (!a && !b && !c) return null;
    return `${a}|${b}|${c}`;
  } catch {
    return null;
  }
},



_openUndoWaitModal: function(ur) {
  try {
    if (!ur) return;
    if (ur.status !== "pending" && ur.status !== "active") return;
    if (!ur.requesterUid || ur.requesterUid !== this.myUid) return;

    const key = this._undoWaitKeyOf(ur);
    if (!key) return;

    
    if (this._undoWaitOpen) return;
    if (this._undoWaitDismissedKey && this._undoWaitDismissedKey === key) return;

    const q = (sel) => {
      try {
        return typeof qs === "function" ? qs(sel) : document.querySelector(sel);
      } catch {
        return null;
      }
    };

    this._undoWaitOpen = true;
    this._undoWaitKey = key;

    const msg =
      tr("undo.wait.body");

    Modal.open({
      title: tr("undo.wait.title"),
      body: `<div>${msg}</div>`,
      buttons: [
        {
          label: tr("modals.close"),
          className: "primary",
          onClick: () => Modal.close(),
        },
      ],
      onClose: () => {
        const k = this._undoWaitKey;
        this._undoWaitOpen = false;
        this._undoWaitKey = null;

        if (this._undoWaitAutoClose) {
          
          this._undoWaitAutoClose = false;
        } else if (k) {
          
          this._undoWaitDismissedKey = k;
        }

        try {
          const b = q("#modalBackdrop");
          if (b && b.dataset) delete b.dataset.zamatModalTag;
        } catch {}
      },
    });

    try {
      const b = q("#modalBackdrop");
      if (b && b.dataset) b.dataset.zamatModalTag = "undo-wait";
    } catch {}
  } catch {}
},



_closeUndoWaitModal: function() {
  try {
    if (!this._undoWaitOpen) {
      this._undoWaitKey = null;
      return;
    }

    const q = (sel) => {
      try {
        return typeof qs === "function" ? qs(sel) : document.querySelector(sel);
      } catch {
        return null;
      }
    };

    const b = q("#modalBackdrop");
    if (
      b &&
      b.style &&
      b.style.display === "flex" &&
      b.dataset &&
      b.dataset.zamatModalTag === "undo-wait"
    ) {
      this._undoWaitAutoClose = true;
      Modal.close();
      return;
    }

    
    this._undoWaitOpen = false;
    this._undoWaitKey = null;
    this._undoWaitAutoClose = false;
  } catch {
    this._undoWaitOpen = false;
    this._undoWaitKey = null;
    this._undoWaitAutoClose = false;
  }
},

    

    requestUndo: function() {
      if (!guardOnlineWrite()) return;
      if (!this.isActive || !this.gameRef) return;

      try {
        if (Game && Game.forcedEnabled && Game.forcedPly < 10) {
          Modal.open({
            title: tr("modals.undo.notAllowedTitle"),
            body: `<div>${tr("modals.undo.notAllowedBody")}</div>`,
            buttons: [
              {
                label: tr("modals.close"),
                className: "primary",
                onClick: () => Modal.close(),
              },
            ],
          });
          return;
        }
      } catch {}

      try {
        if (Game && (Game.inChain || Game.awaitingPenalty)) {
          Modal.open({
            title: tr("modals.undo.title"),
            body: `<div>${tr("ui.noUndo")}</div>`,
            buttons: [
              {
                label: tr("modals.close"),
                className: "primary",
                onClick: () => Modal.close(),
              },
            ],
          });
          return;
        }
      } catch {}

      if ((this.ply || 0) <= 0) {
        Modal.open({
          title: tr("modals.undo.title"),
          body: `<div>${tr("ui.noUndo")}</div>`,
          buttons: [
            { label: tr("modals.close"), className: "primary", onClick: () => Modal.close() },
          ],
        });
        return;
      }

      const undoRef = this.gameRef.child("undoRequest");
      let tx = null;

      try {
        tx = undoRef.transaction((cur) => {
          if (cur && (cur.status === "pending" || cur.status === "active")) return cur;
          return {
            status: "pending",
        acceptedAt: 0,
            requesterUid: this.myUid,
            requesterNick: this.myNick,
            requestedAt: nowTs(),
            ply: this.ply,
          };
        });
      } catch (e) {
        handleDbError(e, tr("undo.requestFailed"));
        return;
      }

      try {
        if (tx && typeof tx.then === "function") {
          tx.then((res) => {
            try {
              const snap = res && res.snapshot ? res.snapshot : null;
              const ur = snap && typeof snap.val === "function" ? snap.val() : null;
              this._openUndoWaitModal(ur);
            } catch {}
          }).catch((e) =>
            handleDbError(e, tr("undo.requestFailed"))
          );
        }
      } catch {}
    },

    

    _handleUndoRequest: function(data) {
      const ur = data && data.undoRequest ? data.undoRequest : null;
      if (!ur) {
        this._closeUndoWaitModal();
        return;
      }

      if ((ur.status === "pending" || ur.status === "active") && ur.requesterUid === this.myUid) {
        this._openUndoWaitModal(ur);
        return;
      }

      if ((ur.status === "pending" || ur.status === "active") &&
        ur.requesterUid &&
        ur.requesterUid !== this.myUid
      ) {
        const name = ur.requesterNick || tr("online.opponent");
        Modal.open({
          title: tr("undo.request.title"),
          body: `<div>${formatTpl(
            tr("undo.request.body"),
            { name }
          )}</div>`,
          buttons: [
            {
              label: tr("actions.accept"),
              className: "ok",
              onClick: () => {
                Modal.close();
                this._respondUndo(true);
              },
            },
            {
              label: tr("actions.reject"),
              className: "ghost",
              onClick: () => {
                Modal.close();
                this._respondUndo(false);
              },
            },
          ],
        });
        return;
      }

      if (ur.status === "accepted") {
        if (ur.requesterUid === this.myUid) this._closeUndoWaitModal();
        this._performUndoTransaction();
        return;
      }

      if (ur.status === "rejected" && ur.requesterUid === this.myUid) {
        this._closeUndoWaitModal();
        Modal.open({
          title: tr("undo.rejectedTitle"),
          body: `<div>${tr("undo.rejected")}</div>`,
          buttons: [
            { label: tr("modals.close"), className: "primary", onClick: () => Modal.close() },
          ],
        });
        try { this.gameRef.child("undoRequest").remove(); } catch {}
      }
    },

    

    _respondUndo: function(accept) {
      this.gameRef.child("undoRequest").transaction((cur) => {
        if (!cur || (cur.status !== "pending" && cur.status !== "active")) return cur;
        cur.status = accept ? "accepted" : "rejected";
        cur.respondedAt = nowTs();
        cur.responderUid = this.myUid;
        cur.responderNick = this.myNick;
        return cur;
      });
    },

    

    _performUndoTransaction: function() {
      if (this._undoTxnInFlight) return;
      this._undoTxnInFlight = true;

      this.gameRef.transaction(
        (g) => {
          if (!g || g.status !== "active") return g;
          if (!g.undoRequest || g.undoRequest.status !== "accepted") return g;

          const undoneMove = g.lastMove && g.lastMove.kind === "move" ? g.lastMove : null;


const undoneFrom = (undoneMove && undoneMove.from != null) ? undoneMove.from : null;
const undonePath = (undoneMove && Array.isArray(undoneMove.path) && undoneMove.path.length)
  ? undoneMove.path.slice()
  : (undoneMove && undoneMove.to != null ? [undoneMove.to] : null);

          try {
            const curSnap = g.state && g.state.snapshot ? g.state.snapshot : null;
            if (curSnap && curSnap.forcedEnabled && curSnap.forcedPly < 10) {
              g.undoRequest = null;
              return g;
            }
          } catch {}

          const curPly = g.ply || 0;
          const prevPly = curPly - 1;
          if (prevPly < 0) {
            g.undoRequest = null;
            return g;
          }

          const prevState = g.states && g.states[prevPly];
          if (!prevState || !prevState.snapshot) {
            g.undoRequest = null;
            return g;
          }

          g.moveIndex = (g.moveIndex || 0) + 1;
          g.ply = prevPly;

          g.state = prevState;
          g.turn = prevState.snapshot.player;

          g.lastMove = {
            kind: "undo",
            by: g.turn,
            ts: nowTs(),
            undoneFrom: undoneFrom,
            undonePath: undonePath,
            ply: prevPly,
            moveIndex: g.moveIndex,
          };

          g.undoRequest = null;
          g.soufla = null;

          g.log = g.log || [];
          const from = undoneMove && undoneMove.from != null ? (typeof rcStr === "function" ? rcStr(undoneMove.from) : "") : "";
          const to = undoneMove && undoneMove.to != null ? (typeof rcStr === "function" ? rcStr(undoneMove.to) : "") : "";
          const undoTxt =
            from && to
              ? tr("undo.appliedMove", { from, to })
              : tr("undo.applied");
          g.log.push({ ts: nowTs(), text: undoTxt });
          if (g.log.length > 50) g.log = g.log.slice(-50);

          return g;
        },
        (err, committed) => {
          this._undoTxnInFlight = false;
          if (err) {
            handleDbError(err, tr("undo.failed"));
            return;
          }
          if (committed === false) {
            safeToast(tr("undo.notCommitted"));
          }
        }
      );
    },

    

    

    _goToGameAsPlayer: function(gameId) {
      try {
        
        const inPages = (location.pathname || "").includes("/pages/");
        const base = inPages ? "./game.html" : "pages/game.html";
        const url = `${base}?pvp=1&gid=${encodeURIComponent(String(gameId||""))}`;
        location.href = url;
      } catch {}
    },

    

    _goToGameAsSpectator: function(gameId) {
      try {
        const inPages = (location.pathname || "").includes("/pages/");
        const base = inPages ? "./game.html" : "pages/game.html";
        const url = `${base}?spectate=${encodeURIComponent(String(gameId||""))}`;
        location.href = url;
      } catch {}
    },

    
    

    _acceptInviteLobby: async function(inv, inviteRef) {
      try {
        if (!inv || !inv.gameId) return;
        const ok = await this.initPresence();
        if (!ok) {
          safeToast(tr("status.onlineInitFail"));
          return;
        }

        const gameId = inv.gameId;
        const gameRef = db.ref("games").child(gameId);

        
        await gameRef.transaction((g) => {
          if (!g) return g;
          if (g.status === "ended" || g.status === "rejected") return g;

          g.players = g.players || {};
          g.players.white = g.players.white || {};
          g.players.black = g.players.black || {};

          
          if (g.players.black && g.players.black.uid && g.players.black.uid !== this.myUid) {
            return g;
          }

          g.players.black = { uid: this.myUid, nickname: this.myNick };
          if (g.status === "pending") g.status = "active";

          if (!g.acceptedAt) {
            g.acceptedAt = nowTs();
            g.log = Array.isArray(g.log) ? g.log : [];
            const who = this.myNick || tr("players.player");
            g.log.push({
              ts: nowTs(),
              type: "invite_accepted",
              text: formatTpl(tr("online.log.inviteAccepted"), { player: who }),
            });
            if (g.log.length > 200) g.log = g.log.slice(-200);
          }
          return g;
        });

        try {
          this._presenceStatus = "inPvP";
          this._presenceRole = "player";
          this._presenceRoomId = gameId;
          await safePlayerWrite(this.statusRef, this.myUid, { status: "inPvP", role: "player", roomId: gameId, nickname: this.myNick, icon: this.myIcon || getSavedIconOrDefault(), updatedAt: nowTs() }, "players.enterPvP", () => { try { this._stopPresenceHeartbeat(); } catch {} });
        } catch {}

        try { if (inviteRef && typeof inviteRef.remove === "function") await inviteRef.remove(); } catch {}

        this._goToGameAsPlayer(gameId);
      } catch (err) {
        handleDbError(err, tr("online.errors.joinFailed"));
      }
    },

    

    initLobbyPage: async function(opts) {
      opts = opts || {};
      const roomsEl = document.getElementById(opts.roomsListId || "roomsList");
      const playersEl = document.getElementById(opts.playersListId || "playersList");

      const ok = await this.initPresence();
      if (!ok) {
        try {
          if (playersEl) playersEl.innerHTML = `<div class="z-empty">${tr("status.onlineInitFail")}</div>`;
        } catch {}
        return;
      }

      
      try {
        const uid = this.myUid || (auth && auth.currentUser && auth.currentUser.uid) || "";
        if (!hasExplicitNick(uid)) {
          const picked = ((await askNickname()) || "").trim();
          if (picked) this.myNick = picked;
          if (!this.myNick) this.myNick = getSavedNickOrDefault(uid);
        } else {
          const saved = (getSavedNick() || "").trim();
          if (saved) this.myNick = saved;
          if (!this.myNick) this.myNick = getSavedNickOrDefault(uid);
        }
      } catch {}

      await this._setLobbyStatus("available");

      
      try { this._bindInviteListener(); } catch {}

      
      try {
        const ref = db.ref("players");
        if (this._lobbyPlayersRef && this._lobbyPlayersCb) {
          try { this._lobbyPlayersRef.off("value", this._lobbyPlayersCb); } catch {}
        }
        this._lobbyPlayersRef = ref;

        const cb = (snap) => {
          const all = snap && snap.val ? snap.val() : null;
          const rows = [];
          
          const now = nowTs();

          if (all) {
            for (const [uid, p] of Object.entries(all)) {
              if (!p) continue;
              const isSelf = (uid === this.myUid);
              const ts = Number(p.updatedAt || 0);
              if (!ts || (now - ts) > PRESENCE_UI_TTL_MS) { if (!isSelf) continue; }

              const nick = (p.nickname || "").trim() || defaultNick(uid);
              const st = (p.status || "available");
              const role = (p.role || "").trim();
              const effectiveRole =
                role ||
                (st === "inPvP"
                  ? "player"
                  : (st === "spectating" ? "spectator" : ""));

              const stLabel =
                st === "available" ? tr("lobby.status.available") :
                st === "vsComputer" ? tr("lobby.status.vsComputer") :
                st === "inPvP" ? tr("lobby.status.inPvP") :
                st === "spectating" ? tr("lobby.status.spectating") : st;

              
              const roomId = (p.roomId || "").trim();
              const inMatchAsPlayer = (effectiveRole === "player" && !!roomId) || (st === "inPvP" && effectiveRole === "player");
              const canInvite = !inMatchAsPlayer && !isSelf;

              const icon = iconSrcForPage(p.icon);
              rows.push({ uid, nick, st, stLabel, canInvite, icon, isSelf });
            }
          }

          rows.sort((a, b) => a.nick.localeCompare(b.nick));

          if (!playersEl) return;
          if (!rows.length) {
            playersEl.innerHTML = `<div class="z-empty">${tr("lobby.emptyPlayers")}</div>`;
            return;
          }

          playersEl.innerHTML = rows
            .map((r) => {
              if (r.isSelf) {
                return `
                  <div class="z-row" data-uid="${r.uid}">
                    <div class="z-row-main">
                      <div class="z-row-title"><img class="z-avatar" src="${r.icon}" alt="" />${escapeHtml(r.nick)}</div>
                      <div class="z-row-sub">${escapeHtml(r.stLabel)}</div>
                    </div>
                    <div class="z-row-actions">
                      <span class="z-self">${tr("lobby.you")}</span>
                    </div>
                  </div>
                `;
              }

              const dis = r.canInvite ? "" : "disabled aria-disabled=\"true\"";
              const title = r.canInvite ? "" : `title=\"${tr("lobby.inviteDisabled") }\"`;
              return `
                <div class="z-row" data-uid="${r.uid}">
                  <div class="z-row-main">
                    <div class="z-row-title"><img class="z-avatar" src="${r.icon}" alt="" />${escapeHtml(r.nick)}</div>
                    <div class="z-row-sub">${escapeHtml(r.stLabel)}</div>
                  </div>
                  <div class="z-row-actions">
                    <button class="btn small ok" data-action="invite" ${dis} ${title}>
                      <img class="btn-ico" src="${ASSET_PREFIX}assets/icons/pvp.svg" alt="" aria-hidden="true" />
                      <span>${tr("actions.invite")}</span>
                    </button>
                  </div>
                </div>
              `;
            })
            .join("");

          
          Array.from(playersEl.querySelectorAll("button[data-action='invite']")).forEach((btn) => {
            btn.addEventListener("click", async (ev) => {
              const row = ev.currentTarget.closest(".z-row");
              const uid = row ? row.getAttribute("data-uid") : "";
              if (!uid) return;
              try { await this._createGame(uid); } catch {}
            });
          });
        };

        this._lobbyPlayersCb = cb;
        ref.on("value", cb);
      } catch {}

      
      try {
        const refG = db.ref("games").limitToLast(50);
        if (this._lobbyRoomsRef && this._lobbyRoomsCb) {
          try { this._lobbyRoomsRef.off("value", this._lobbyRoomsCb); } catch {}
        }
        this._lobbyRoomsRef = refG;

        const cbG = (snap) => {
          const all = snap && snap.val ? snap.val() : null;
          const rooms = [];
          
          
          const now = nowTs();
          if (all) {
            for (const [gid, g] of Object.entries(all)) {
              if (!g) continue;
              if (!g.acceptedAt) continue;
              if (g.status !== "active") continue;
              const wuid = g.players && g.players.white ? (g.players.white.uid || "") : "";
              const buid = g.players && g.players.black ? (g.players.black.uid || "") : "";
              if (!wuid || !buid) continue;
              const pres = g.presence || null;
              if (!pres || !pres[wuid] || !pres[buid]) continue;

              const pW = pres[wuid] || null;
              const pB = pres[buid] || null;
              const tsW = Number(pW && pW.updatedAt ? pW.updatedAt : 0);
              const tsB = Number(pB && pB.updatedAt ? pB.updatedAt : 0);
              if (!tsW || !tsB) continue;
              if ((now - tsW) > PRESENCE_UI_TTL_MS || (now - tsB) > PRESENCE_UI_TTL_MS) continue;

              const name = (g.roomName || g.name || "").trim() || tr("lobby.roomDefault");
              const w = g.players && g.players.white ? (g.players.white.nickname || "") : "";
              const b = g.players && g.players.black ? (g.players.black.nickname || "") : "";
              rooms.push({ gid, name, w, b, wuid, buid, createdAt: g.createdAt || 0 });
            }
          }
          rooms.sort((a, b) => (b.createdAt||0) - (a.createdAt||0));

          if (!roomsEl) return;
          if (!rooms.length) {
            roomsEl.innerHTML = `<div class="z-empty">${tr("lobby.emptyRooms")}</div>`;
            return;
          }

          roomsEl.innerHTML = rooms
            .map((r) => {
              const isMePlayer = (this.myUid && (this.myUid === r.wuid || this.myUid === r.buid));
              const joinBtn = isMePlayer
                ? `<button class="btn small primary" data-action="join" data-gid="${r.gid}">
                     <img class="btn-ico" src="${ASSET_PREFIX}assets/icons/play.svg" alt="" aria-hidden="true" />
                     <span>${tr("lobby.join")}</span>
                   </button>`
                : "";
              return `
                <div class="z-row" data-gid="${r.gid}">
                  <div class="z-row-main">
                    <div class="z-row-title">${escapeHtml(r.name)}</div>
                    <div class="z-row-sub">
                      <span class="z-side">
                        <img class="z-mini-ico" src="${ASSET_PREFIX}assets/icons/pawn-white.svg" alt="" aria-hidden="true" />
                        <span>${escapeHtml(r.w||"-")}</span>
                      </span>
                      <span class="z-vs">—</span>
                      <span class="z-side">
                        <img class="z-mini-ico" src="${ASSET_PREFIX}assets/icons/pawn-black.svg" alt="" aria-hidden="true" />
                        <span>${escapeHtml(r.b||"-")}</span>
                      </span>
                    </div>
                  </div>
                  <div class="z-row-actions">
                    ${joinBtn}
                    <button class="btn small secondary" data-action="spectate" data-gid="${r.gid}">
                      <img class="btn-ico" src="${ASSET_PREFIX}assets/icons/watch.svg" alt="" aria-hidden="true" />
                      <span>${tr("lobby.spectate")}</span>
                    </button>
                  </div>
                </div>
              `;
            })
            .join("");

          Array.from(roomsEl.querySelectorAll("button[data-action='join']")).forEach((btn) => {
            btn.addEventListener("click", (ev) => {
              const gid = ev.currentTarget.getAttribute("data-gid");
              if (gid) this._goToGameAsPlayer(gid);
            });
          });
          Array.from(roomsEl.querySelectorAll("button[data-action='spectate']")).forEach((btn) => {
            btn.addEventListener("click", (ev) => {
              const gid = ev.currentTarget.getAttribute("data-gid");
              if (gid) this._goToGameAsSpectator(gid);
            });
          });
        };

        this._lobbyRoomsCb = cbG;
        refG.on("value", cbG);
      } catch {}
    },

    

    _autoEnterFromUrl: async function() {
      if (!isGamePage()) return;
      try {
        const p = new URLSearchParams(location.search || "");
        const spectateId = (p.get("spectate") || "").trim();
        const gid = (p.get("gid") || "").trim();
        const gameId = spectateId || gid;
        if (!gameId) return;
        await this._enterGameFromId(gameId, !!spectateId);
      } catch {}
    },

    _enterGameFromId: async function(gameId, forceSpectator) {
      const ok = await this.initPresence();
      if (!ok) {
        safeToast(tr("status.onlineInitFail"));
        return;
      }

      let g = null;
      try {
        const s = await db.ref("games").child(gameId).once("value");
        g = s && s.val ? s.val() : null;
      } catch {}
      if (!g) {
        safeToast(tr("online.errors.noGame"));
        return;
      }

      const wuid = g.players && g.players.white && g.players.white.uid ? g.players.white.uid : "";
      const buid = g.players && g.players.black && g.players.black.uid ? g.players.black.uid : "";

      const amPlayer = (this.myUid && (this.myUid === wuid || this.myUid === buid));
      const asSpectator = forceSpectator || !amPlayer;

      if (asSpectator) {
        await this._startSpectator(gameId);
        return;
      }

      
      if (!g.acceptedAt) {
        safeToast(tr("online.waitingAcceptance"));
        return;
      }

      if (this.myUid === wuid) {
        await this._startInviterGame(gameId);
      } else {
        await this._joinGame(gameId);
      }
    },

    _startSpectator: async function(gameId) {
      
      const ok = await this.initPresence();
      if (!ok) return;

      this.isSpectator = true;
      this.isActive = true;
      this.mySide = 0;

      try { document.body.classList.add("z-spectator"); } catch {}
      try { this._setOnlineButtonsState(true); } catch {}

      try {
        this._presenceStatus = "spectating";
        this._presenceRole = "spectator";
        this._presenceRoomId = gameId;
        await safePlayerWrite(this.statusRef, this.myUid, {
status: "spectating", role: "spectator", roomId: gameId, nickname: this.myNick, updatedAt: nowTs() });
      } catch {}

      
      try {
        const specRef = db.ref("spectators").child(gameId);
        const uid = this.myUid;
        const nick = this.myNick || tr("players.player");

        const txn = await specRef.transaction((cur) => {
          cur = cur || {};
          if (cur[uid]) return cur;
          const count = Object.keys(cur).length;
          if (count >= 3) return; 
          cur[uid] = { uid, nickname: nick, joinedAt: nowTs() };
          return cur;
          }, "players.status");
if (!txn || txn.committed === false) {
          safeToast(tr("lobby.spectatorFull"));
          
          try {
            const back = (location.pathname || "").includes("/pages/") ? "./loby.html" : "pages/loby.html";
            
            if (isGamePage()) location.href = back;
          } catch {}
          return;
        }

        try { specRef.child(uid).onDisconnect().remove(); } catch {}
      } catch {}

      try {
        Game.settings.starter = "white";
        setupInitialBoard();
        try { Turn.start(); } catch {}
      } catch {}

      this.gameId = gameId;
      this.gameRef = db.ref("games").child(gameId);


      // Ensure no stale onDisconnect purge is active from a prior match
      try { this._cleanupArmedFor = null; } catch {}
      try { this._cancelRoomPurgeOnDisconnect(); } catch {}
      this._bindGameListeners();
      try { await this._initRoomComms(); } catch {}
      try { this._persistActiveGame(); } catch {}
    },
  };

  window.Online = Online;

  
  try {
    window.addEventListener("load", () => {
      try { Online._autoEnterFromUrl(); } catch {}
    });
  } catch {}


})();

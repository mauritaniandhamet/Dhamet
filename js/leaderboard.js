/* Section: js/leaderboard.js — Public leaderboard modal (guest-friendly) */
(function(){
  "use strict";

  function tr(key, vars){
    try {
      if (typeof window.t === "function") return window.t(key, vars);
      if (typeof window.tr === "function") return window.tr(key, vars);
    } catch (_) {}
    return key;
  }

  function normalizeLegacyIcon(p){
    const s = String(p || "");
    if (!s) return "assets/icons/users/user.svg";
    if (s.indexOf("assets/icons/users/") === 0) return s;
    // allow legacy short names (user1.svg etc)
    if (/^user\d*\.svg$/.test(s)) return "assets/icons/users/" + s;
    if (/^user\d*$/.test(s)) return "assets/icons/users/" + s + ".svg";
    if (/^assets\/icons\/users\/user\d*\.svg$/.test(s)) return s;
    return "assets/icons/users/user.svg";
  }

  function sanitizeIconPath(p){
    const s = normalizeLegacyIcon(p);
    const allow = /^assets\/icons\/users\/user\d*\.svg$/;
    if (!allow.test(s)) return "assets/icons/users/user.svg";
    return s;
  }

  async function fetchLeaderboard(limit){
    const db = firebase.database();
    const ref = db.ref("leaderboardV1").orderByChild("sortKey").limitToFirst(limit|0 || 200);
    const snap = await ref.once("value");
    const out = [];
    snap.forEach(ch => {
      const v = ch.val() || {};
      const pts = Number(v.points);
      out.push({
        uid: String(ch.key || ""),
        points: Number.isFinite(pts) ? (pts | 0) : 0,
        wins: Number.isFinite(Number(v.wins)) ? (Number(v.wins)|0) : 0,
        losses: Number.isFinite(Number(v.losses)) ? (Number(v.losses)|0) : 0,
      });
    });
    return out;
  }

  // Guest-friendly: read only public fields (nickname/icon) from profiles
  async function fetchPublicProfiles(uids){
    const db = firebase.database();
    const reads = (uids || []).map(async (uid) => {
      try{
        const [sn, si] = await Promise.all([
          db.ref("profiles").child(uid).child("nickname").once("value").then(s => s.val()).catch(() => null),
          db.ref("profiles").child(uid).child("icon").once("value").then(s => s.val()).catch(() => null),
        ]);
        return { nickname: (sn == null ? "" : String(sn)), icon: (si == null ? "" : String(si)) };
      }catch(_){
        return { nickname:"", icon:"" };
      }
    });
    return Promise.all(reads);
  }

  function buildLeaderboardBody(items){
    const wrap = document.createElement("div");
    wrap.className = "z-leaderboard-wrap";

    const list = document.createElement("div");
    list.className = "z-leaderboard-list";

    if (!items || !items.length) {
      const empty = document.createElement("div");
      empty.className = "z-leaderboard-empty";
      empty.textContent = tr("dashboard.leaderboard.empty");
      list.appendChild(empty);
      wrap.appendChild(list);
      return wrap;
    }

    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "z-leaderboard-row";

      const left = document.createElement("div");
      left.className = "z-leaderboard-left";

      const rk = document.createElement("div");
      rk.className = "z-leaderboard-rank";
      rk.textContent = String(i + 1);

      const img = document.createElement("img");
      img.className = "z-leaderboard-icon";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = sanitizeIconPath(it.icon || "");

      const name = document.createElement("div");
      name.className = "z-leaderboard-name";
      name.textContent = String(it.nickname || tr("dashboard.leaderboard.anon"));

      left.appendChild(rk);
      left.appendChild(img);
      left.appendChild(name);

      const right = document.createElement("div");
      right.className = "z-leaderboard-right";

      const pts = document.createElement("div");
      pts.className = "z-leaderboard-points";
      pts.textContent = String(it.points | 0);

      // show matches info lightly (wins-losses)
      const wl = document.createElement("div");
      wl.className = "z-leaderboard-wl";
      wl.textContent = String((it.wins|0) + "-" + (it.losses|0));

      right.appendChild(pts);
      right.appendChild(wl);

      row.appendChild(left);
      row.appendChild(right);

      list.appendChild(row);
    });

    wrap.appendChild(list);
    return wrap;
  }

  function openLeaderboardModal(){
    const body = document.createElement("div");
    body.className = "z-leaderboard-loading";
    body.textContent = tr("dashboard.leaderboard.loading");

    Modal.open({
      title: tr("dashboard.leaderboard.title"),
      body,
      buttons: [
        { label: tr("dashboard.leaderboard.ok"), className: "primary", onClick: function(){ Modal.close(); } }
      ],
    });

    (async () => {
      try{
        try { if (window.ZAuth && typeof ZAuth.initFirebase === "function") ZAuth.initFirebase(); } catch (_) {}

        const rows = await fetchLeaderboard(200);
        const uids = rows.map(r => r.uid).filter(Boolean);

        const profiles = await fetchPublicProfiles(uids);
        const items = rows.map((r, idx) => {
          const p = profiles[idx] || {};
          return {
            uid: r.uid,
            points: r.points,
            wins: r.wins,
            losses: r.losses,
            nickname: (p && p.nickname) ? String(p.nickname) : "",
            icon: (p && p.icon) ? String(p.icon) : "",
          };
        });

        body.innerHTML = "";
        body.appendChild(buildLeaderboardBody(items));
      }catch(e){
        body.textContent = tr("dashboard.leaderboard.empty");
      }
    })();
  }

  window.ZLeaderboard = {
    openModal: openLeaderboardModal
  };
})();

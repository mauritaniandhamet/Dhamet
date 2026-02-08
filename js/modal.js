/* Section: js/modal.js — Modal dialog UI helpers */















(function () {
  "use strict";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function tr0(key, fallbackOrVars, varsMaybe) {
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
      if (typeof t === "function") {
        var v = t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return (fallback != null ? fallback : String(key || ""));
  }

  function ensureDom() {
    var b = qs("#modalBackdrop");
    if (b) return b;

    
    b = document.createElement("div");
    b.id = "modalBackdrop";
    b.className = "modal-backdrop";
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-modal", "true");
    b.setAttribute("aria-hidden", "true");
    b.style.display = "none";

    b.innerHTML =
      '<div class="modal" role="document">' +
      '  <div class="modal-header">' +
      '    <div class="modal-title" id="modalTitle">...</div>' +
      '    <button class="modal-close" id="modalClose">✕</button>' +
      '  </div>' +
      '  <div class="modal-body" id="modalBody"></div>' +
      '  <div class="modal-footer" id="modalFooter">' +
      '    <div class="row" id="modalFooterButtons"></div>' +
      '  </div>' +
      '</div>';

    (document.body || document.documentElement).appendChild(b);
    try {
      var c = qs("#modalClose", b);
      if (c) { c.setAttribute("aria-label", tr0("modals.close")); c.title = tr0("modals.close"); }
    } catch (_) {}
    return b;
  }

  function normalizeButtons(opts) {
    
    if (Array.isArray(opts.buttons)) return opts.buttons;

    
    if (Array.isArray(opts.actions)) return opts.actions;

    
    return [
      {
        label: opts.okLabel || tr0("modals.ok"),
        className: opts.okClassName || "primary",
        onClick: function () { close(); },
      },
    ];
  }

  function normalizeBody(opts) {
    
    if (opts.body != null) return opts.body;

    
    if (opts.html != null) return String(opts.html);

    
    if (opts.text != null) {
      var div = document.createElement("div");
      div.style.whiteSpace = "pre-wrap";
      div.textContent = String(opts.text);
      return div;
    }

    
    if (opts.node && opts.node.nodeType) return opts.node;

    return "";
  }

  function setDir(backdrop) {
    try {
      var dir = document.documentElement.getAttribute("dir") || "rtl";
      var htmlLang = document.documentElement.getAttribute("lang") || "ar";
      backdrop.setAttribute("dir", dir);
      backdrop.setAttribute("lang", htmlLang);
    } catch (_) {}
  }

  var state = {
    onClose: null,
    keyHandler: null,
  };

  function safeRunOnClose() {
    try {
      if (typeof state.onClose === "function") state.onClose();
    } catch (_) {}
    state.onClose = null;
  }

  function close() {
    var b = ensureDom();

    
    if (state.keyHandler) {
      try {
        document.removeEventListener("keydown", state.keyHandler);
      } catch (_) {}
      state.keyHandler = null;
    }

    safeRunOnClose();

    
    try {
      var focused = b.querySelector(":focus");
      if (focused) focused.blur();
    } catch (_) {}

    b.style.display = "none";
    b.setAttribute("aria-hidden", "true");
    try {
      document.body.classList.remove("modal-open");
    } catch (_) {}
  }

  function open(opts) {
    opts = opts || {};

    
    
    try {
      if (document.body && document.body.classList && document.body.classList.contains("z-spectator")) {
        if (!opts.allowSpectator) return;
      }
    } catch (_) {}

    var b = ensureDom();

    
    close();

    setDir(b);

    try {
      var cbtn = qs("#modalClose", b);
      if (cbtn) cbtn.setAttribute("aria-label", tr0("actions.close"));
    } catch (_) {}

    var titleEl = qs("#modalTitle", b);
    var bodyEl = qs("#modalBody", b);
    var footer = qs("#modalFooterButtons", b);
    var closeBtn = qs("#modalClose", b);

    if (titleEl) titleEl.textContent = String(opts.title || "");

    
    var body = normalizeBody(opts);
    if (bodyEl) {
      bodyEl.innerHTML = "";
      if (typeof body === "string") {
        bodyEl.insertAdjacentHTML("afterbegin", body);
      } else if (body && body.nodeType) {
        bodyEl.appendChild(body);
      } else {
        bodyEl.textContent = String(body || "");
      }
    }

    
    if (footer) footer.innerHTML = "";
    var btns = normalizeButtons(opts);
    btns.forEach(function (btn) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "btn " + (btn.className || "");
      el.textContent = btn.label || tr0("modals.ok");
      if (btn.title) el.title = String(btn.title);
      if (btn.disabled) el.disabled = true;
      el.addEventListener("click", function () {
        try {
          if (btn.onClick) btn.onClick();
        } catch (_) {}
      });
      if (footer) footer.appendChild(el);
    });

    
    if (closeBtn) {
      closeBtn.onclick = function () {
        close();
      };
    }

    
    state.keyHandler = function (e) {
      try {
        if (e.key === "Escape") {
          if (opts.allowEsc === false) return;
          close();
          return;
        }
        if (e.key === "Enter" && typeof opts.onEnter === "function") {
          opts.onEnter();
        }
      } catch (_) {}
    };
    document.addEventListener("keydown", state.keyHandler);

    
    state.onClose = typeof opts.onClose === "function" ? opts.onClose : null;

    b.style.display = "flex";
    b.setAttribute("aria-hidden", "false");
    try {
      document.body.classList.add("modal-open");
    } catch (_) {}

    
    try {
      if (opts.focusSelector) {
        var f = qs(opts.focusSelector, b);
        if (f && typeof f.focus === "function") setTimeout(function () { f.focus(); }, 0);
      }
    } catch (_) {}
  }

  function popup(msg, title) {
    var ttl = title || tr0("chain.notice.title");
    var div = document.createElement("div");
    div.style.whiteSpace = "pre-wrap";
    div.textContent = String(msg == null ? "" : msg);
    open({
      title: ttl,
      body: div,
      buttons: [
        {
          label: tr0("modals.ok"),
          className: "primary",
          onClick: function () {
            close();
          },
        },
      ],
    });
  }

  function confirmModal(msg, title, yesLabel, noLabel) {
    return new Promise(function (resolve) {
      var div = document.createElement("div");
      div.style.whiteSpace = "pre-wrap";
      div.textContent = String(msg == null ? "" : msg);
      open({
        title: title || "",
        body: div,
        buttons: [
          {
            label: yesLabel || tr0("actions.ok"),
            className: "primary",
            onClick: function () {
              close();
              resolve(true);
            },
          },
          {
            label: noLabel || tr0("actions.cancel"),
            className: "ghost",
            onClick: function () {
              close();
              resolve(false);
            },
          },
        ],
      });
    });
  }

  var Modal = (window.Modal = window.Modal || {});
  Modal.open = open;
  Modal.close = close;
  Modal.popup = popup;
  Modal.confirm = confirmModal;

  
  if (!window.popup) window.popup = popup;

  
  if (!window.qs) window.qs = qs;
  if (!window.qsa)
    window.qsa = function (sel, root) {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    };
})();

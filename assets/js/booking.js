/* ==========================================================================
   Atelier Blanc — collection booking wizard
   A four-step form with per-step validation, a live estimate, and draft
   persistence. Without JS the markup still renders as one long, usable
   form that posts to /book — the steps are an enhancement, not a gate.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.querySelector("[data-booking]");
  if (!root) return;

  var STORAGE_KEY = "atelier-blanc:booking-draft:v1";
  var FREE_DELIVERY_OVER = 30;
  var DELIVERY_FEE = 5.9;

  /* Prices are "from" figures — the final invoice follows inspection at the
     atelier, which is why every total on screen is labelled an estimate. */
  var CATALOGUE = {
    "dry-cleaning":  { label: "Dry cleaning",            from: 14.5 },
    "shirt-service": { label: "Laundered shirts",        from: 5.9  },
    "press-only":    { label: "Press only",              from: 3.9  },
    "eveningwear":   { label: "Eveningwear & tailoring", from: 24.0 },
    "bridal":        { label: "Bridal & occasion",       from: 195.0 },
    "leather":       { label: "Leather, suede & fur",    from: 69.0 },
    "household":     { label: "Household & linens",      from: 22.0 },
    "sneakers":      { label: "Sneaker restoration",     from: 29.0 },
    "alterations":   { label: "Alterations & repairs",   from: 14.0 }
  };

  var WINDOWS = {
    "07-10": "Morning · 07:00–10:00",
    "10-13": "Midday · 10:00–13:00",
    "13-17": "Afternoon · 13:00–17:00",
    "17-21": "Evening · 17:00–21:00"
  };

  var PREFS = {
    "eco":        "Eco solvent only",
    "fragrance":  "Fragrance-free finish",
    "starch":     "Medium starch on shirts",
    "hangers":    "Return on wooden hangers",
    "no-crease":  "No crease in trousers",
    "repair":     "Flag any repairs before cleaning"
  };

  var form = root.querySelector("form");
  var panels = Array.prototype.slice.call(root.querySelectorAll("[data-step-panel]"));
  var stepItems = Array.prototype.slice.call(root.querySelectorAll("[data-step-item]"));
  var summaryEl = root.querySelector("[data-summary]");
  var confirmPanel = root.querySelector("[data-confirm-panel]");
  var liveRegion = root.querySelector("[data-step-live]");
  var current = 0;

  /* ---------------------------------------------------------------- state */

  function readState() {
    var services = [];
    Array.prototype.forEach.call(
      form.querySelectorAll('input[name="service"]:checked'),
      function (i) { services.push(i.value); }
    );
    var prefs = [];
    Array.prototype.forEach.call(
      form.querySelectorAll('input[name="preference"]:checked'),
      function (i) { prefs.push(i.value); }
    );
    var win = form.querySelector('input[name="window"]:checked');

    return {
      services: services,
      preferences: prefs,
      postcode: val("postcode"),
      address1: val("address1"),
      address2: val("address2"),
      city: val("city"),
      date: val("date"),
      window: win ? win.value : "",
      access: val("access"),
      firstName: val("firstName"),
      lastName: val("lastName"),
      email: val("email"),
      phone: val("phone"),
      notes: val("notes")
    };
  }

  function val(name) {
    var el = form.elements[name];
    return el && typeof el.value === "string" ? el.value.trim() : "";
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readState()));
    } catch (err) {
      /* Private mode or a full quota — the form still works, just unsaved. */
    }
  }

  function restoreDraft() {
    var raw;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (err) { return; }
    if (!raw) return;

    var data;
    try { data = JSON.parse(raw); } catch (err) { return; }
    if (!data || typeof data !== "object") return;

    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (key === "services" || key === "preferences") {
        var field = key === "services" ? "service" : "preference";
        (Array.isArray(value) ? value : []).forEach(function (v) {
          var input = form.querySelector(
            'input[name="' + field + '"][value="' + cssEscape(v) + '"]'
          );
          if (input) input.checked = true;
        });
        return;
      }
      if (key === "window") {
        var w = form.querySelector('input[name="window"][value="' + cssEscape(value) + '"]');
        if (w) w.checked = true;
        return;
      }
      var el = form.elements[key];
      if (el && typeof el.value === "string" && typeof value === "string") {
        el.value = value;
      }
    });

    var banner = root.querySelector("[data-draft-banner]");
    if (banner) banner.hidden = false;
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, "\\$&");
  }

  function clearDraft() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (err) { /* noop */ }
  }

  /* ------------------------------------------------------------- estimate */

  function estimate(state) {
    var subtotal = state.services.reduce(function (sum, id) {
      return sum + (CATALOGUE[id] ? CATALOGUE[id].from : 0);
    }, 0);
    var delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    return { subtotal: subtotal, delivery: delivery, total: subtotal + delivery };
  }

  function money(n) {
    return "£" + n.toFixed(2);
  }

  function formatDate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }

  /* -------------------------------------------------------------- summary */

  function renderSummary() {
    if (!summaryEl) return;
    var state = readState();
    var est = estimate(state);

    var services = state.services.length
      ? '<ul class="summary__list">' +
        state.services.map(function (id) {
          var item = CATALOGUE[id];
          if (!item) return "";
          return '<li class="summary__line"><span>' + item.label +
            "</span><span>from " + money(item.from) + "</span></li>";
        }).join("") +
        "</ul>"
      : '<p class="summary__empty">No services chosen yet.</p>';

    var collection = "";
    if (state.date || state.window || state.postcode) {
      collection =
        '<div class="summary__group"><dt>Collection</dt><dd>' +
        [
          formatDate(state.date),
          WINDOWS[state.window] || "",
          state.postcode ? state.postcode.toUpperCase() : ""
        ].filter(Boolean).join("<br>") +
        "</dd></div>";
    }

    var prefs = state.preferences.length
      ? '<div class="summary__group"><dt>Preferences</dt><dd>' +
        state.preferences.map(function (p) { return PREFS[p] || p; }).join(", ") +
        "</dd></div>"
      : "";

    summaryEl.innerHTML =
      '<div class="summary__group"><dt>Services</dt><dd>' + services + "</dd></div>" +
      collection + prefs;

    setText("[data-total-subtotal]", state.services.length ? money(est.subtotal) : "—");
    setText(
      "[data-total-delivery]",
      state.services.length ? (est.delivery === 0 ? "Included" : money(est.delivery)) : "—"
    );
    setText("[data-total-grand]", state.services.length ? money(est.total) : "—");

    var freeNote = root.querySelector("[data-free-note]");
    if (freeNote) {
      var short = FREE_DELIVERY_OVER - est.subtotal;
      freeNote.hidden = !(est.subtotal > 0 && est.subtotal < FREE_DELIVERY_OVER);
      if (!freeNote.hidden) {
        freeNote.textContent =
          "Add " + money(short) + " more for complimentary collection and delivery.";
      }
    }
  }

  function setText(sel, text) {
    var el = root.querySelector(sel);
    if (el) el.textContent = text;
  }

  /* ---------------------------------------------------------------- steps */

  function updateStepIndicator() {
    stepItems.forEach(function (item, i) {
      var state = i < current ? "done" : i === current ? "current" : "todo";
      item.setAttribute("data-state", state);
      var tick = item.querySelector("[data-step-tick]");
      if (tick) tick.hidden = state !== "done";
    });
  }

  function goTo(index, opts) {
    opts = opts || {};
    if (index < 0 || index >= panels.length) return;
    current = index;

    panels.forEach(function (panel, i) {
      panel.setAttribute("data-active", String(i === index));
      panel.hidden = i !== index;
    });
    updateStepIndicator();

    if (index === panels.length - 1) renderReview();

    if (opts.focus !== false) {
      var heading = panels[index].querySelector("[data-step-heading]");
      if (heading) heading.focus();
    }
    if (liveRegion) {
      liveRegion.textContent =
        "Step " + (index + 1) + " of " + panels.length + ": " +
        (stepItems[index] ? stepItems[index].getAttribute("data-step-name") : "");
    }
    if (!opts.noScroll) {
      var top = root.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({
        top: top,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto" : "smooth"
      });
    }
  }

  /* ----------------------------------------------------------- validation */

  function validateStep(index) {
    var panel = panels[index];
    var summary = panel.querySelector("[data-error-summary]");
    var failed = [];

    // Checkbox and radio groups are validated as a group, not box by box:
    // one message under the group beats nine identical messages.
    var groups = panel.querySelectorAll("[data-require-one]");
    Array.prototype.forEach.call(groups, function (group) {
      var name = group.getAttribute("data-require-one");
      var checked = group.querySelectorAll('input[name="' + name + '"]:checked').length;
      var first = group.querySelector('input[name="' + name + '"]');
      group.setAttribute("data-invalid", checked ? "false" : "true");

      var groupError = group.querySelector("[data-error]");
      if (groupError) {
        groupError.innerHTML = checked
          ? ""
          : '<svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>' +
            "<span>" +
            (group.getAttribute("data-require-message") || "Choose an option to continue.") +
            "</span>";
      }
      if (!checked && first) failed.push(first);
    });

    failed = failed.concat(window.ABForm.validateGroup(panel));

    if (failed.length) {
      window.ABForm.showSummary(summary, failed);
      return false;
    }
    window.ABForm.showSummary(summary, []);
    return true;
  }

  /* --------------------------------------------------------------- review */

  function renderReview() {
    var target = root.querySelector("[data-review]");
    if (!target) return;
    var s = readState();
    var est = estimate(s);

    var rows = [
      ["Services", s.services.length
        ? "<ul>" + s.services.map(function (id) {
            return "<li>" + (CATALOGUE[id] ? CATALOGUE[id].label : id) + "</li>";
          }).join("") + "</ul>"
        : "—", 1],
      ["Collection", [formatDate(s.date), WINDOWS[s.window] || ""].filter(Boolean).join("<br>") || "—", 2],
      ["Address", [s.address1, s.address2, s.city, s.postcode.toUpperCase()]
        .filter(Boolean).join("<br>") || "—", 2],
      ["Access notes", s.access || "—", 2],
      ["Contact", [
        [s.firstName, s.lastName].filter(Boolean).join(" "), s.email, s.phone
      ].filter(Boolean).join("<br>") || "—", 3],
      ["Preferences", s.preferences.length
        ? s.preferences.map(function (p) { return PREFS[p] || p; }).join(", ")
        : "None specified", 3],
      ["Garment notes", s.notes || "—", 3],
      ["Estimate", money(est.total) +
        ' <span class="text-muted">(' + money(est.subtotal) + " + " +
        (est.delivery === 0 ? "free collection" : money(est.delivery) + " collection") +
        ")</span>", 1]
    ];

    target.innerHTML = rows.map(function (row) {
      return '<div class="review-row"><dt>' + row[0] + "</dt><dd>" + row[1] + "</dd>" +
        '<dd><button type="button" class="link" data-edit-step="' + row[2] + '">' +
        "Edit<span class=\"visually-hidden\"> " + row[0].toLowerCase() + "</span></button></dd></div>";
    }).join("");
  }

  /* ---------------------------------------------------------- confirmation */

  function reference() {
    var d = new Date();
    var stamp =
      String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
    var tail = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "AB-" + stamp + "-" + tail;
  }

  function confirm() {
    var s = readState();
    var est = estimate(s);
    var ref = reference();

    setText("[data-confirm-ref]", ref);
    setText("[data-confirm-email]", s.email);
    setText("[data-confirm-date]", formatDate(s.date));
    setText("[data-confirm-window]", WINDOWS[s.window] || "");
    setText("[data-confirm-total]", money(est.total));

    root.querySelector("[data-wizard]").hidden = true;
    var aside = root.querySelector("[data-summary-aside]");
    if (aside) aside.hidden = true;
    confirmPanel.hidden = false;

    var heading = confirmPanel.querySelector("[data-step-heading]");
    if (heading) heading.focus();

    clearDraft();
    window.scrollTo({
      top: root.getBoundingClientRect().top + window.scrollY - 100,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto" : "smooth"
    });
  }

  /* ------------------------------------------------------------------ init */

  function initDateBounds() {
    var input = form.elements.date;
    if (!input) return;
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var horizon = new Date();
    horizon.setDate(horizon.getDate() + 60);
    input.min = tomorrow.toISOString().slice(0, 10);
    input.max = horizon.toISOString().slice(0, 10);
  }

  function initPrefill() {
    // Deep link: /book.html?service=bridal preselects from a service page.
    var params = new URLSearchParams(window.location.search);
    params.getAll("service").forEach(function (v) {
      var input = form.querySelector(
        'input[name="service"][value="' + cssEscape(v) + '"]'
      );
      if (input) input.checked = true;
    });
  }

  function init() {
    // The no-JS fallback shows every panel; the wizard now takes over.
    root.setAttribute("data-enhanced", "true");
    panels.forEach(function (panel, i) {
      panel.hidden = i !== 0;
      panel.setAttribute("data-active", String(i === 0));
    });

    restoreDraft();
    initPrefill();
    initDateBounds();
    window.ABForm.bindLiveValidation(form);
    updateStepIndicator();
    renderSummary();

    form.addEventListener("input", function () {
      renderSummary();
      saveDraft();
    });
    form.addEventListener("change", function () {
      renderSummary();
      saveDraft();
    });

    root.addEventListener("click", function (e) {
      var next = e.target.closest("[data-next]");
      if (next) {
        if (validateStep(current)) goTo(current + 1);
        return;
      }
      var back = e.target.closest("[data-back]");
      if (back) { goTo(current - 1); return; }

      var edit = e.target.closest("[data-edit-step]");
      if (edit) { goTo(Number(edit.getAttribute("data-edit-step")) - 1); return; }

      var discard = e.target.closest("[data-discard-draft]");
      if (discard) {
        clearDraft();
        form.reset();
        renderSummary();
        var banner = root.querySelector("[data-draft-banner]");
        if (banner) banner.hidden = true;
        goTo(0);
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validateStep(current)) return;
      confirm();
    });

    // Enter inside a text field advances instead of submitting mid-wizard.
    form.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      if (e.target.tagName === "TEXTAREA") return;
      if (current === panels.length - 1) return;
      e.preventDefault();
      if (validateStep(current)) goTo(current + 1);
    });

    goTo(0, { focus: false, noScroll: true });
  }

  init();
})();

/* ==========================================================================
   Atelier Blanc — site behaviour
   Progressive enhancement only: every page is readable and navigable
   with this file blocked.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- 1. Header: solid once the page scrolls ------------------------- */
  function initHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;

    var overInk = header.classList.contains("is-over-ink");
    var threshold = 24;
    var ticking = false;

    function apply() {
      var stuck = window.scrollY > threshold;
      header.classList.toggle("is-stuck", stuck);
      if (overInk) header.classList.toggle("is-over-ink", !stuck);
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
  }

  /* ---- 2. Mobile navigation drawer ------------------------------------ */
  function initDrawer() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var drawer = document.getElementById("nav-drawer");
    if (!toggle || !drawer) return;

    var closeBtn = drawer.querySelector("[data-nav-close]");
    var lastFocused = null;

    function focusables() {
      return Array.prototype.filter.call(
        drawer.querySelectorAll('a[href], button:not([disabled])'),
        function (el) { return el.offsetParent !== null; }
      );
    }

    function open() {
      lastFocused = document.activeElement;
      drawer.classList.add("is-open");
      drawer.removeAttribute("inert");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("is-locked");
      var first = focusables()[0];
      if (first) first.focus();
      document.addEventListener("keydown", onKeydown);
    }

    function close() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("inert", "");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKeydown);
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function onKeydown(e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      // Keep focus inside the drawer while it owns the screen.
      var items = focusables();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    drawer.setAttribute("inert", "");
    toggle.addEventListener("click", function () {
      if (drawer.classList.contains("is-open")) close(); else open();
    });
    if (closeBtn) closeBtn.addEventListener("click", close);
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });
  }

  /* ---- 3. Scroll reveal ----------------------------------------------- */
  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) {
        el.classList.add("is-revealed");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    Array.prototype.forEach.call(items, function (el, i) {
      // Stagger siblings, but cap it so late items never feel stalled.
      var group = el.getAttribute("data-reveal");
      if (group === "stagger") {
        el.style.setProperty("--reveal-delay", Math.min(i, 6) * 80 + "ms");
      }
      io.observe(el);
    });
  }

  /* ---- 4. Accordion ---------------------------------------------------- */
  function initAccordions() {
    var triggers = document.querySelectorAll("[data-accordion-trigger]");
    Array.prototype.forEach.call(triggers, function (trigger) {
      var panel = document.getElementById(trigger.getAttribute("aria-controls"));
      if (!panel) return;

      trigger.addEventListener("click", function () {
        var open = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!open));
        panel.setAttribute("data-open", String(!open));
      });
    });
  }

  /* ---- 5. Choice-card state (fallback for engines without :has()) ------ */
  function initChoices() {
    if (CSS.supports && CSS.supports("selector(:has(*))")) return;

    var inputs = document.querySelectorAll(".choice input, .pill-choice input");
    if (!inputs.length) return;

    function sync() {
      Array.prototype.forEach.call(inputs, function (input) {
        var label = input.closest(".choice, .pill-choice");
        if (label) label.classList.toggle("is-checked", input.checked);
      });
    }
    Array.prototype.forEach.call(inputs, function (input) {
      input.addEventListener("change", sync);
    });
    sync();
  }

  /* ---- 6. Postcode coverage check -------------------------------------- */
  var SERVED = [
    "SW1","SW3","SW5","SW6","SW7","SW10","SW11","W1","W2","W8","W11","W14",
    "NW1","NW3","NW8","EC1","EC2","EC4","E1","E14","SE1","SE11","N1","WC1","WC2"
  ];

  window.ABCoverage = {
    /**
     * Returns the served outward district for a postcode, or null.
     * A UK inward code is always three characters, so the outward part is
     * everything before them — you cannot just take a greedy prefix, or
     * "SW3 6PP" reads as district "SW36".
     */
    match: function (value) {
      var v = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      var outward = null;

      if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(v)) {
        outward = v.slice(0, -3);          // full postcode
      } else if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(v)) {
        outward = v;                       // outward code on its own
      }
      if (!outward) return null;

      if (SERVED.indexOf(outward) !== -1) return outward;

      // "SW1A" and "E1W" style districts roll up to their base district.
      var base = outward.replace(/[A-Z]$/, "");
      if (base !== outward && SERVED.indexOf(base) !== -1) return base;

      return null;
    },
    districts: SERVED
  };

  function initPostcodeCheck() {
    var forms = document.querySelectorAll("[data-postcode-check]");
    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector("input");
      var result = form.querySelector("[data-postcode-result]");
      if (!input || !result) return;

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var raw = input.value.trim();

        if (!raw) {
          result.setAttribute("data-state", "no");
          result.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>' +
            "<span>Enter a postcode so we can check the round.</span>";
          input.focus();
          return;
        }

        var hit = window.ABCoverage.match(raw);
        if (hit) {
          result.setAttribute("data-state", "ok");
          result.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-check-circle"></use></svg>' +
            "<span>Yes — we collect in <strong>" + hit +
            "</strong> daily, Monday to Saturday.</span>";
        } else {
          result.setAttribute("data-state", "no");
          result.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg>' +
            "<span>Not on a daily round yet. Leave your details and we will " +
            "arrange a courier collection instead.</span>";
        }
      });
    });
  }

  /* ---- 7. Generic form validation (contact page) ----------------------- */
  var RULES = {
    email: {
      test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
      message: "Enter an email address in the form name@example.com."
    },
    tel: {
      test: function (v) { return v.replace(/[^\d]/g, "").length >= 10; },
      message: "Enter a phone number with at least 10 digits."
    }
  };

  window.ABForm = {
    /** Validate one control, paint the field, return true when valid. */
    validateField: function (input) {
      var field = input.closest(".field");
      if (!field) return true;
      var errorEl = field.querySelector("[data-error]");
      var value = input.value;
      var message = "";

      if (input.required && !String(value).trim()) {
        message = field.getAttribute("data-required-message") ||
          "This field is required.";
      } else if (String(value).trim()) {
        var rule = RULES[input.type];
        if (rule && !rule.test(value)) message = rule.message;
        if (input.hasAttribute("data-postcode") && !window.ABCoverage.match(value)) {
          message = "We do not recognise that postcode. Check it and try again.";
        }
      }
      if (input.type === "checkbox" && input.required && !input.checked) {
        message = field.getAttribute("data-required-message") ||
          "Please confirm to continue.";
      }

      field.setAttribute("data-invalid", message ? "true" : "false");
      input.setAttribute("aria-invalid", message ? "true" : "false");
      if (errorEl) {
        errorEl.innerHTML = message
          ? '<svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg><span>' +
            message + "</span>"
          : "";
      }
      return !message;
    },

    /** Validate a container; returns the list of failing controls. */
    validateGroup: function (root) {
      var controls = root.querySelectorAll("input, select, textarea");
      var failed = [];
      Array.prototype.forEach.call(controls, function (input) {
        if (input.type === "hidden" || input.disabled) return;
        if (!window.ABForm.validateField(input)) failed.push(input);
      });
      return failed;
    },

    /** Fill and reveal an error summary, then move focus to it. */
    showSummary: function (summary, failed) {
      if (!summary) return;
      if (!failed.length) {
        summary.setAttribute("data-show", "false");
        summary.innerHTML = "";
        return;
      }
      var items = failed.map(function (input) {
        var field = input.closest(".field, [data-require-one]");
        var explicit = field && field.getAttribute("data-summary-label");
        var label = field && field.querySelector(".field__label, legend");
        var text = explicit
          ? explicit
          : label
          ? label.textContent.replace(/\*|\(optional\)/g, "").trim()
          : "This field";
        if (!input.id) input.id = "f-" + Math.random().toString(36).slice(2, 8);
        return '<li><a href="#' + input.id + '">' + text + "</a></li>";
      });
      summary.innerHTML =
        '<h3><svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg>' +
        "There " + (failed.length === 1 ? "is 1 problem" : "are " + failed.length + " problems") +
        " to fix</h3><ul>" + items.join("") + "</ul>";
      summary.setAttribute("data-show", "true");
      summary.focus();
    },

    /** Bind blur-time re-validation once a control has already failed. */
    bindLiveValidation: function (root) {
      root.addEventListener(
        "blur",
        function (e) {
          var input = e.target;
          if (!input.matches || !input.matches("input, select, textarea")) return;
          var field = input.closest(".field");
          // Only nag after the first failure — never while first typing.
          if (field && field.getAttribute("data-invalid") !== null) {
            window.ABForm.validateField(input);
          }
        },
        true
      );
      root.addEventListener("input", function (e) {
        var input = e.target;
        var field = input.closest && input.closest(".field");
        if (field && field.getAttribute("data-invalid") === "true") {
          window.ABForm.validateField(input);
        }
      });
    }
  };

  function initContactForm() {
    var form = document.querySelector("[data-validate-form]");
    if (!form) return;

    var summary = form.querySelector("[data-error-summary]");
    var success = form.querySelector("[data-form-success]");
    window.ABForm.bindLiveValidation(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var failed = window.ABForm.validateGroup(form);
      if (failed.length) {
        window.ABForm.showSummary(summary, failed);
        return;
      }
      window.ABForm.showSummary(summary, []);
      if (success) {
        success.hidden = false;
        success.focus();
      }
      form.reset();
    });
  }

  /* ---- 8. Copyright year ------------------------------------------------ */
  function initYear() {
    var nodes = document.querySelectorAll("[data-year]");
    var year = String(new Date().getFullYear());
    Array.prototype.forEach.call(nodes, function (n) { n.textContent = year; });
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    initHeader();
    initDrawer();
    initReveal();
    initAccordions();
    initChoices();
    initPostcodeCheck();
    initContactForm();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

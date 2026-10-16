/* ═══════════════════════════════════════════════════════════════════════
   DOMAIN BLACK — theme behaviour

   Liquid renders the content; this file only engraves and animates.

   GUILLOCHÉ
   A hypotrochoid swept with a slowly precessing phase, which is how an
   engine-turning lathe actually cuts a rosette. Each plate is engraved once
   to an offscreen bitmap at device resolution; the live effect comes from
   compositing two plates turning against each other, so the moiré is real
   interference rather than an animated filter, and it costs two drawImage
   calls a frame instead of a hundred thousand line segments.

   Degrades on purpose. With GSAP or Lenis blocked the page is still
   complete and readable: every reveal animates *from* its resting state,
   and smooth scroll falls back to the browser's own.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  function engravePlate(size, opts) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    if (!g) return c;

    var R = opts.R, r = opts.r, d = opts.d;
    var turns = opts.turns || 14, steps = opts.steps || 900, mid = size / 2;
    var scale = (size / 2) * 0.96 / (Math.abs(R - r) + Math.abs(d));

    g.translate(mid, mid);
    g.lineWidth = opts.weight || 0.9;
    g.lineJoin = "round";

    for (var p = 0; p < turns; p++) {
      var k = p / turns;
      var dd = d * (1 + k * (opts.spread || 0.07));
      var phase = k * (opts.precess || Math.PI * 2);
      g.strokeStyle = opts.color.replace("ALPHA", (opts.alpha * (1 - k * 0.45)).toFixed(3));
      g.beginPath();
      for (var i = 0; i <= steps; i++) {
        var t = (i / steps) * Math.PI * 2 * (opts.wraps || 13);
        var a = (R - r) * Math.cos(t + phase) + dd * Math.cos(((R - r) / r) * t + phase);
        var b = (R - r) * Math.sin(t + phase) - dd * Math.sin(((R - r) / r) * t + phase);
        if (i === 0) g.moveTo(a * scale, b * scale); else g.lineTo(a * scale, b * scale);
      }
      g.stroke();
    }

    // A certificate vignette is cleared through the middle so the engraving
    // frames the subject instead of printing under it.
    if (opts.clear) {
      g.globalCompositeOperation = "destination-out";
      var hole = g.createRadialGradient(0, 0, 0, 0, 0, mid * opts.clear);
      hole.addColorStop(0, "rgba(0,0,0,1)");
      hole.addColorStop(.62, "rgba(0,0,0,.92)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = hole;
      g.beginPath(); g.arc(0, 0, mid * opts.clear, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = "source-over";
    }
    return c;
  }

  /* ── the hero rosette: two counter-turning plates ─────────────────── */
  var rosetteEl = document.querySelector("[data-rosette]");
  var rosette = null;

  if (rosetteEl) {
    var ctx = rosetteEl.getContext("2d");
    if (ctx) {
      var plateSize = Math.min(1800, Math.round(1240 * DPR));
      var plateA = engravePlate(plateSize, {
        R: 170, r: 31, d: 97, turns: 11, wraps: 13, steps: 1500, spread: .055,
        precess: Math.PI * 2, color: "rgba(201,162,39,ALPHA)", alpha: .3, weight: 1, clear: .46
      });
      var plateB = engravePlate(plateSize, {
        R: 150, r: 23, d: 80, turns: 8, wraps: 9, steps: 1200, spread: .1,
        precess: Math.PI * 1.4, color: "rgba(236,227,214,ALPHA)", alpha: .12, weight: .9, clear: .54
      });
      var state = { rot: 0, drift: 0, scale: 1 };

      var sizeRosette = function () {
        rosetteEl.width = Math.round((rosetteEl.clientWidth || 320) * DPR);
        rosetteEl.height = Math.round((rosetteEl.clientHeight || 320) * DPR);
      };
      var drawRosette = function () {
        var w = rosetteEl.width, h = rosetteEl.height;
        ctx.clearRect(0, 0, w, h);
        var side = Math.min(w, h) * state.scale;
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(state.rot);
        ctx.drawImage(plateA, -side / 2, -side / 2, side, side); ctx.restore();
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-state.rot * 1.9 + state.drift);
        ctx.drawImage(plateB, -side * .44, -side * .44, side * .88, side * .88); ctx.restore();
      };
      sizeRosette(); drawRosette();
      window.addEventListener("resize", function () { sizeRosette(); drawRosette(); }, { passive: true });
      rosette = { state: state, draw: drawRosette };
    }
  }

  /* ── vignette plates behind each product ──────────────────────────── */
  var vignettes = document.querySelectorAll("canvas[data-vignette]");
  if (vignettes.length) {
    var vPlate = engravePlate(Math.round(560 * DPR), {
      R: 170, r: 31, d: 97, turns: 13, wraps: 13, steps: 900, spread: .07,
      precess: Math.PI * 2, color: "rgba(201,162,39,ALPHA)", alpha: .3, weight: .85, clear: .36
    });
    var paint = function (cv) {
      var g = cv.getContext("2d"); if (!g) return;
      cv.width = Math.round((cv.clientWidth || 240) * DPR);
      cv.height = Math.round((cv.clientHeight || 300) * DPR);
      var side = Math.max(cv.width, cv.height) * 1.08;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(vPlate, (cv.width - side) / 2, (cv.height - side) / 2, side, side);
    };
    requestAnimationFrame(function () { vignettes.forEach(paint); });
    window.addEventListener("resize", function () { vignettes.forEach(paint); }, { passive: true });
  }

  /* ── seal teeth, struck not hand-drawn ────────────────────────────── */
  var teeth = document.querySelector("[data-seal-teeth]");
  if (teeth) {
    var marks = "";
    for (var i = 0; i < 72; i++) {
      var ang = (i / 72) * Math.PI * 2, lng = i % 6 === 0 ? 9 : 5;
      marks += '<line x1="' + (100 + Math.cos(ang) * 70).toFixed(2) +
               '" y1="' + (100 + Math.sin(ang) * 70).toFixed(2) +
               '" x2="' + (100 + Math.cos(ang) * (70 + lng)).toFixed(2) +
               '" y2="' + (100 + Math.sin(ang) * (70 + lng)).toFixed(2) +
               '" stroke="#c9a227" stroke-width="' + (i % 6 === 0 ? 1.1 : .6) +
               '" opacity="' + (i % 6 === 0 ? .9 : .5) + '"/>';
    }
    teeth.innerHTML = marks;
  }

  /* ── motion ───────────────────────────────────────────────────────── */
  var hasGsap = typeof window.gsap !== "undefined";

  if (!still && typeof window.Lenis !== "undefined") {
    var lenis = new window.Lenis({ lerp: .075, wheelMultiplier: .9 });
    if (hasGsap && window.ScrollTrigger) {
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
    }
  }

  // The rosette turns whether or not GSAP arrived. It is the page's one
  // piece of ambient life and it costs two drawImage calls.
  if (rosette && !still) {
    var t0 = performance.now();
    (function spin(now) {
      var e = (now - t0) / 1000;
      rosette.state.rot = e * .045;
      rosette.state.drift = Math.sin(e * .22) * .12;
      rosette.draw();
      requestAnimationFrame(spin);
    })(t0);
  }

  if (still || !hasGsap) return;
  var gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  // Letters are split only once motion is certain, so the page at rest is
  // ordinary selectable text.
  document.querySelectorAll("[data-word]").forEach(function (w) {
    var txt = w.textContent; w.textContent = "";
    for (var i = 0; i < txt.length; i++) {
      var s = document.createElement("span");
      s.className = "ch"; s.textContent = txt[i]; w.appendChild(s);
    }
  });

  if (document.querySelector(".wordmark .ch")) {
    gsap.timeline()
      .from(".wordmark .ch", { yPercent: 46, opacity: 0, duration: 1.1, ease: "power3.out", stagger: .032 })
      .from(".cert-sub", { opacity: 0, y: 10, duration: .8, ease: "power2.out" }, .15)
      .from(".cert-say", { opacity: 0, duration: 1.2, ease: "power2.out" }, .45)
      .from(".bearer div", { opacity: 0, y: 14, duration: .7, ease: "power2.out", stagger: .07 }, .6);
  }

  // the issue number is struck, not typed
  var certno = document.querySelector("[data-certno]");
  if (certno) {
    var target = parseInt(certno.getAttribute("data-certno"), 10) || 1247;
    var issue = { v: 0 };
    gsap.to(issue, {
      v: target, duration: 1.8, ease: "power2.out", delay: .5,
      onUpdate: function () { certno.textContent = String(Math.round(issue.v)).padStart(4, "0"); }
    });
  }

  if (!window.ScrollTrigger) return;

  gsap.utils.toArray("[data-rise]").forEach(function (el) {
    gsap.from(el, { y: 20, opacity: 0, duration: .85, ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });

  if (rosette && document.querySelector("[data-cert]")) {
    gsap.to(rosette.state, { scale: 1.42, ease: "none",
      scrollTrigger: { trigger: "[data-cert]", start: "top top", end: "bottom top", scrub: .8 } });
  }

  gsap.utils.toArray(".vignette .lot-art, .frame .lot-art").forEach(function (art) {
    gsap.from(art, { yPercent: 8, ease: "none",
      scrollTrigger: { trigger: art, start: "top bottom", end: "bottom top", scrub: 1 } });
  });

  gsap.utils.toArray(".seal .ink-path").forEach(function (p, i) {
    var len = p.getTotalLength ? p.getTotalLength() : 600;
    gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", delay: i * .12,
        scrollTrigger: { trigger: ".seal", start: "top 82%", once: true } });
  });
  if (teeth) {
    gsap.from("[data-seal-teeth] line", {
      opacity: 0, duration: .5, stagger: { each: .008, from: "random" },
      scrollTrigger: { trigger: ".seal", start: "top 82%", once: true }
    });
  }
})();

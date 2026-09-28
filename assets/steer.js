/* "Steer the tip yourself": a planar sketch of the robot's steerable tip inside the bladder.
   Each section bends with constant curvature proportional to the square of its voltage
   (electrostrictive behaviour). The camera cone paints the parts of the wall it has seen.
   Illustrative only — not a model of the real robot. */
(function () {
  var root = document.getElementById("steer");
  if (!root) return;

  var NS = "http://www.w3.org/2000/svg";
  var svg = root.querySelector(".steer-svg");
  var inputs = {
    ins: root.querySelector('[name="ins"]'),
    s1: root.querySelector('[name="s1"]'),
    s2: root.querySelector('[name="s2"]'),
    s3: root.querySelector('[name="s3"]')
  };
  var out = root.querySelector(".steer-score b");
  var scanBtn = root.querySelector(".steer-scan");
  var clearBtn = root.querySelector(".steer-clear");

  // Geometry (SVG units)
  var C = { x: 300, y: 262 }, RX = 228, RY = 200;
  var NECK = 0.15;                  // half-angle of the bladder neck opening (rad)
  var L = 62;                       // length of one active section
  var KMAX = 1.4 / L;               // max curvature: ~80° per section
  var HALF = 0.36, RANGE = 215;     // camera half-angle and reach
  var N = 180;                      // wall segments

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function ell(t) { return { x: C.x + RX * Math.cos(t), y: C.y + RY * Math.sin(t) }; }

  // ---- Static scene ----
  var defs = el("defs", {}, svg);
  var g1 = el("radialGradient", { id: "st-tissue", cx: "50%", cy: "42%", r: "62%" }, defs);
  el("stop", { offset: "0", "stop-color": "#fff6f4" }, g1);
  el("stop", { offset: "1", "stop-color": "#f4d9d5" }, g1);
  var g2 = el("radialGradient", { id: "st-light", cx: "0", cy: "0", r: "1", gradientUnits: "userSpaceOnUse" }, defs);
  el("stop", { offset: "0", "stop-color": "#1b6ce0", "stop-opacity": ".34" }, g2);
  el("stop", { offset: "1", "stop-color": "#1b6ce0", "stop-opacity": "0" }, g2);
  var clip = el("clipPath", { id: "st-clip" }, defs);
  el("ellipse", { cx: C.x, cy: C.y, rx: RX, ry: RY }, clip);

  var a0 = Math.PI / 2 + NECK, a1 = Math.PI / 2 + 2 * Math.PI - NECK;
  var pA = ell(a0), pB = ell(a1);
  // bladder body + urethra
  el("path", {
    d: "M" + pB.x + " " + pB.y + " A" + RX + " " + RY + " 0 1 0 " + pA.x + " " + pA.y +
       " L" + (C.x - 17) + " 640 L" + (C.x + 17) + " 640 Z",
    fill: "url(#st-tissue)"
  }, svg);
  el("path", { d: "M" + pA.x + " " + pA.y + " C" + (C.x - 22) + " " + (pA.y + 20) + " " + (C.x - 17) + " " + (pA.y + 40) + " " + (C.x - 17) + " 640", class: "st-urethra" }, svg);
  el("path", { d: "M" + pB.x + " " + pB.y + " C" + (C.x + 22) + " " + (pB.y + 20) + " " + (C.x + 17) + " " + (pB.y + 40) + " " + (C.x + 17) + " 640", class: "st-urethra" }, svg);

  var cone = el("path", { class: "st-cone", fill: "url(#st-light)", "clip-path": "url(#st-clip)" }, svg);

  var wall = el("g", { class: "st-wall" }, svg);
  var segs = [], seen = new Uint8Array(N);
  for (var i = 0; i < N; i++) {
    var ta = a0 + (a1 - a0) * i / N, tb = a0 + (a1 - a0) * (i + 1) / N;
    var p = ell(ta), q = ell(tb), m = ell((ta + tb) / 2);
    segs.push({ m: m, e: el("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, wall) });
  }

  var shaft = el("line", { class: "st-shaft", x1: C.x, x2: C.x, y2: 650 }, svg);
  var tubeOuter = el("path", { class: "st-tube" }, svg);
  var elec = [0, 1, 2].map(function () { return el("path", { class: "st-elec" }, svg); });
  var rings = el("path", { class: "st-rings" }, svg);
  var cap = el("circle", { class: "st-cap", r: 8 }, svg);
  var lens = el("circle", { class: "st-lens", r: 3.2 }, svg);

  // ---- Kinematics ----
  function curv(v) { var u = v / 100; return KMAX * (u < 0 ? -u * u : u * u); }

  function backbone(baseY, ks) {
    var pts = [{ x: C.x, y: baseY }], phi = -Math.PI / 2, x = C.x, y = baseY, bounds = [0];
    for (var s = 0; s < 3; s++) {
      var k = ks[s];
      for (var j = 1; j <= 18; j++) {
        var d = L * j / 18, px, py;
        if (Math.abs(k) < 1e-7) { px = x + d * Math.cos(phi); py = y + d * Math.sin(phi); }
        else { px = x + (Math.sin(phi + k * d) - Math.sin(phi)) / k; py = y + (Math.cos(phi) - Math.cos(phi + k * d)) / k; }
        pts.push({ x: px, y: py });
      }
      x = pts[pts.length - 1].x; y = pts[pts.length - 1].y; phi += k * L;
      bounds.push(pts.length - 1);
    }
    return { pts: pts, phi: phi, bounds: bounds };
  }
  function inside(pts) {
    for (var i = 0; i < pts.length; i++) {
      var u = (pts[i].x - C.x) / (RX - 12), w = (pts[i].y - C.y) / (RY - 12);
      if (u * u + w * w > 1) return false;
    }
    return true;
  }
  function poly(pts, a, b) {
    var d = "M" + pts[a].x.toFixed(1) + " " + pts[a].y.toFixed(1);
    for (var i = a + 1; i <= b; i++) d += "L" + pts[i].x.toFixed(1) + " " + pts[i].y.toFixed(1);
    return d;
  }

  // ---- Render ----
  function render() {
    var baseY = 452 - (+inputs.ins.value) * 1.35;
    var vs = [+inputs.s1.value, +inputs.s2.value, +inputs.s3.value];
    var ks = vs.map(curv);
    var bb = backbone(baseY, ks);
    if (!inside(bb.pts)) {             // the wall stops the tip: scale the bend back until it fits
      var lo = 0, hi = 1;
      for (var it = 0; it < 14; it++) {
        var mid = (lo + hi) / 2;
        if (inside(backbone(baseY, ks.map(function (k) { return k * mid; })).pts)) lo = mid; else hi = mid;
      }
      bb = backbone(baseY, ks.map(function (k) { return k * lo; }));
    }
    var pts = bb.pts, tip = pts[pts.length - 1], dx = Math.cos(bb.phi), dy = Math.sin(bb.phi);

    shaft.setAttribute("y1", baseY);
    tubeOuter.setAttribute("d", poly(pts, 0, pts.length - 1));
    for (var s = 0; s < 3; s++) {
      elec[s].setAttribute("d", poly(pts, bb.bounds[s], bb.bounds[s + 1]));
      elec[s].style.opacity = (0.08 + 0.92 * Math.abs(vs[s]) / 100).toFixed(2);
    }
    var r = "";
    for (var j = 3; j < pts.length - 1; j += 3) {
      var a = pts[j - 1], b = pts[j + 1], tx = b.x - a.x, ty = b.y - a.y, n = Math.hypot(tx, ty) || 1;
      var nx = -ty / n * 8, ny = tx / n * 8;
      r += "M" + (pts[j].x + nx).toFixed(1) + " " + (pts[j].y + ny).toFixed(1) + "L" + (pts[j].x - nx).toFixed(1) + " " + (pts[j].y - ny).toFixed(1);
    }
    rings.setAttribute("d", r);
    cap.setAttribute("cx", tip.x); cap.setAttribute("cy", tip.y);
    lens.setAttribute("cx", tip.x + dx * 3); lens.setAttribute("cy", tip.y + dy * 3);

    // camera cone
    function ray(a) { var c = Math.cos(a), sn = Math.sin(a); return { x: tip.x + RANGE * (dx * c - dy * sn), y: tip.y + RANGE * (dx * sn + dy * c) }; }
    var l = ray(-HALF), rr = ray(HALF);
    cone.setAttribute("d", "M" + tip.x + " " + tip.y + "L" + l.x + " " + l.y + "A" + RANGE + " " + RANGE + " 0 0 1 " + rr.x + " " + rr.y + "Z");
    var g = document.getElementById("st-light");
    g.setAttribute("cx", tip.x); g.setAttribute("cy", tip.y); g.setAttribute("r", RANGE);

    // what the camera sees
    var cosH = Math.cos(HALF), count = 0;
    for (var i = 0; i < N; i++) {
      var vx = segs[i].m.x - tip.x, vy = segs[i].m.y - tip.y, dist = Math.hypot(vx, vy);
      var inView = dist < RANGE && (vx * dx + vy * dy) / dist > cosH;
      if (inView) seen[i] = 1;
      segs[i].e.setAttribute("class", inView ? "now" : seen[i] ? "seen" : "");
      count += seen[i];
    }
    out.textContent = Math.round(100 * count / N);
  }

  // ---- Interaction ----
  var raf = 0, scanning = false, t0 = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }
  Object.keys(inputs).forEach(function (k) {
    inputs[k].addEventListener("input", function (e) { if (e.isTrusted) stopScan(); schedule(); });
  });
  clearBtn.addEventListener("click", function () { seen.fill(0); render(); });

  function setScanLabel() {
    scanBtn.setAttribute("aria-pressed", String(scanning));
    root.classList.toggle("is-scanning", scanning);
  }
  function stopScan() { scanning = false; setScanLabel(); }
  function step(now) {
    if (!scanning) return;
    var t = (now - t0) / 1000;
    if (t > 16) { stopScan(); return; }
    inputs.ins.value = 50 + 48 * Math.sin(0.45 * t - 1.2);
    inputs.s1.value = 100 * Math.sin(0.9 * t);
    inputs.s2.value = 100 * Math.sin(1.37 * t + 1.1);
    inputs.s3.value = 100 * Math.sin(2.1 * t + 2.3);
    render();
    requestAnimationFrame(step);
  }
  scanBtn.addEventListener("click", function () {
    if (scanning) { stopScan(); return; }
    scanning = true; setScanLabel(); t0 = performance.now(); requestAnimationFrame(step);
  });

  render();
})();

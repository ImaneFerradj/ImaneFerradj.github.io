/* The research chain: four steps, one shown at a time. */
(function () {
  var chain = document.querySelector(".chain");
  if (!chain) return;
  var tabs = [].slice.call(chain.querySelectorAll('[role="tab"]'));
  var panels = [].slice.call(chain.querySelectorAll('[role="tabpanel"]'));
  var track = chain.querySelector(".chain-track");

  function show(i, focus) {
    tabs.forEach(function (t, k) {
      var on = k === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("is-done", k < i);
      panels[k].classList.toggle("is-active", on);
      if (on) panels[k].removeAttribute("inert"); else panels[k].setAttribute("inert", "");
    });
    track.style.setProperty("--p", tabs.length > 1 ? i / (tabs.length - 1) : 0);
    if (focus) tabs[i].focus();
  }

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { show(i); });
    t.addEventListener("keydown", function (e) {
      var rtl = document.documentElement.dir === "rtl";
      var fwd = rtl ? "ArrowLeft" : "ArrowRight", back = rtl ? "ArrowRight" : "ArrowLeft";
      var n = null;
      if (e.key === fwd) n = (i + 1) % tabs.length;
      else if (e.key === back) n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); show(n, true); }
    });
  });
  panels.forEach(function (p, i) {
    var b = p.querySelector(".chain-next");
    if (b) b.addEventListener("click", function () { show((i + 1) % tabs.length, true); });
  });
  chain.classList.add("is-ready");
  show(0);
})();

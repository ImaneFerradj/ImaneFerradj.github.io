/* Gallery: open an illustration larger, with its caption, and step through the set.
   Without JavaScript (or <dialog>), each picture is a plain link to the image file. */
(function () {
  var box = document.querySelector(".lightbox");
  var links = Array.prototype.slice.call(document.querySelectorAll(".shot-link"));
  if (!box || !links.length || typeof box.showModal !== "function") return;

  var img = box.querySelector(".lightbox-stage img");
  var title = box.querySelector(".lightbox-text h2");
  var caption = box.querySelector(".lightbox-text p");
  var current = 0, opener = null;

  function show(i) {
    current = (i + links.length) % links.length;
    var a = links[current];
    var h = a.querySelector("h3"), p = a.querySelector("p");
    img.src = a.getAttribute("href");
    img.alt = p ? p.textContent : "";
    title.innerHTML = h ? h.innerHTML : "";
    caption.innerHTML = p ? p.innerHTML : "";
  }
  function step(d) { show(current + (document.documentElement.dir === "rtl" ? -d : d)); }

  links.forEach(function (a, i) {
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      opener = a;
      show(i);
      box.showModal();
      document.documentElement.classList.add("lightbox-open");
    });
  });

  box.querySelector(".lightbox-prev").addEventListener("click", function () { show(current - 1); });
  box.querySelector(".lightbox-next").addEventListener("click", function () { show(current + 1); });
  box.querySelector(".lightbox-close").addEventListener("click", function () { box.close(); });

  // click on the dimmed backdrop closes
  box.addEventListener("click", function (e) { if (e.target === box) box.close(); });
  box.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
  });
  box.addEventListener("close", function () {
    document.documentElement.classList.remove("lightbox-open");
    if (opener) opener.focus();
  });
})();

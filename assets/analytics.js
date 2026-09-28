/* Website analytics with Google Analytics 4.
 *
 * Tracking only runs on the real GitHub Pages website.
 * Local previews and file:// pages are ignored.
 */

var GA_MEASUREMENT_ID = "G-3L39H09NNE";

(function () {
  if (
    !GA_MEASUREMENT_ID ||
    location.protocol === "file:" ||
    location.hostname !== "imaneferradj.github.io"
  ) {
    return;
  }

  /*
   * Personal opt-out.
   *
   * Run this once in your browser console to exclude yourself:
   *
   * localStorage.setItem("analytics_opt_out", "1");
   *
   * To enable tracking again:
   *
   * localStorage.removeItem("analytics_opt_out");
   */
  if (localStorage.getItem("analytics_opt_out") === "1") {
    return;
  }

  var script = document.createElement("script");
  script.async = true;
  script.src =
    "https://www.googletagmanager.com/gtag/js?id=" +
    encodeURIComponent(GA_MEASUREMENT_ID);

  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }

  window.gtag = gtag;

  gtag("js", new Date());

  gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
})();

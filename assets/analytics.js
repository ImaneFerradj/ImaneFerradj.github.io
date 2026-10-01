/* Visitor statistics with Umami Cloud (free, no cookies).
   1. Create a free account at https://cloud.umami.is and add the website
      imaneferradj.github.io.
   2. Copy the "Website ID" Umami gives you and paste it between the quotes below.
   Nothing is sent until an ID is filled in. Visits are only counted on the real
   site (imaneferradj.github.io), never on local previews. */
var UMAMI_WEBSITE_ID = "4e5fa251-d523-42a6-918d-ac7f06e2ee6c";

(function () {
  if (!UMAMI_WEBSITE_ID || location.protocol === "file:") return;
  var s = document.createElement("script");
  s.defer = true;
  s.src = "https://cloud.umami.is/script.js";
  s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  s.setAttribute("data-domains", "imaneferradj.github.io");
  document.head.appendChild(s);
})();

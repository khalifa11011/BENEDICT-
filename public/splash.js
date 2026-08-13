document.addEventListener("DOMContentLoaded", function () {

  const splash = document.createElement("div");
  splash.id = "splashScreen";

  const isMainApp = window.location.pathname === "/" ||
                    window.location.pathname === "/index.html";

  if (isMainApp) {
    splash.innerHTML = `
      <div class="splash-logo">✦ BENEDICT ✦</div>
      <div class="splash-tagline">Connect • Share • Inspire</div>
      <div class="splash-loader"></div>
    `;
  } else {
    splash.innerHTML = `
      <div class="internal-loading-logo">B</div>
      <div class="internal-loading-text">Loading...</div>
      <div class="splash-loader"></div>
    `;
  }

  document.body.prepend(splash);

  const displayTime = isMainApp ? 4000 : 1200;

  setTimeout(function () {
    splash.classList.add("hide");

    setTimeout(function () {
      splash.remove();
    }, 500);

  }, displayTime);

});

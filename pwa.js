(() => {
  "use strict";

  let deferredInstallPrompt = null;
  let installBanner = null;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canRegister =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  if (standalone) document.documentElement.classList.add("is-standalone");

  if ("serviceWorker" in navigator && canRegister) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js?v=1")
        .catch((error) => console.warn("Mode offline belum aktif", error));
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallLabel();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installBanner?.remove();
    installBanner = null;
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (standalone || wasDismissed()) return;
    const main = document.querySelector("main");
    if (!main) return;

    installBanner = document.createElement("section");
    installBanner.className = "mobile-app-banner";
    installBanner.setAttribute("aria-label", "Pasang Caption Studio di ponsel");
    installBanner.innerHTML = `
      <span class="mobile-app-icon" aria-hidden="true">Aa</span>
      <span class="mobile-app-copy">
        <strong>Buka seperti aplikasi HP</strong>
        <small>Pasang di layar utama agar lebih cepat dibuka.</small>
      </span>
      <button class="mobile-install-action" type="button">Pasang</button>
      <button class="mobile-install-close" type="button" aria-label="Tutup saran pemasangan">×</button>
    `;
    main.insertBefore(installBanner, main.firstChild);
    requestAnimationFrame(() => installBanner?.classList.add("is-visible"));
    updateInstallLabel();

    installBanner
      .querySelector(".mobile-install-action")
      ?.addEventListener("click", installApp);
    installBanner
      .querySelector(".mobile-install-close")
      ?.addEventListener("click", () => {
        try {
          sessionStorage.setItem("captionStudio.installDismissed", "1");
        } catch (_) {}
        installBanner?.remove();
        installBanner = null;
      });
  });

  function wasDismissed() {
    try {
      return sessionStorage.getItem("captionStudio.installDismissed") === "1";
    } catch (_) {
      return false;
    }
  }

  function updateInstallLabel() {
    const button = installBanner?.querySelector(".mobile-install-action");
    if (!button) return;
    if (location.protocol === "file:") button.textContent = "Panduan HP";
    else if (deferredInstallPrompt) button.textContent = "Pasang";
    else if (isIOS) button.textContent = "Cara pasang";
    else button.textContent = "Pasang di HP";
  }

  async function installApp() {
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === "accepted") {
        installBanner?.remove();
        installBanner = null;
        return;
      }
      updateInstallLabel();
    }
    showInstallGuide();
  }

  function showInstallGuide() {
    document.querySelector(".pwa-guide-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "pwa-guide-backdrop";
    const localNote =
      location.protocol === "file:"
        ? `<div class="pwa-guide-note"><strong>Agar fitur aplikasi dan offline aktif:</strong> unggah seluruh folder ini ke hosting HTTPS, lalu buka alamat websitenya dari HP.</div>`
        : "";
    const steps = isIOS
      ? `<ol><li>Buka website ini di <strong>Safari</strong>.</li><li>Tekan tombol <strong>Bagikan</strong> di bawah layar.</li><li>Pilih <strong>Tambahkan ke Layar Utama</strong>.</li><li>Tekan <strong>Tambah</strong>.</li></ol>`
      : `<ol><li>Buka website ini di <strong>Chrome</strong>.</li><li>Tekan menu <strong>⋮</strong> di kanan atas.</li><li>Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</li><li>Konfirmasi pemasangan.</li></ol>`;
    backdrop.innerHTML = `
      <div class="pwa-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title">
        <div class="pwa-guide-handle" aria-hidden="true"></div>
        <div class="pwa-guide-heading">
          <div><span class="mobile-app-icon" aria-hidden="true">Aa</span></div>
          <div><p>MODE HP</p><h2 id="pwa-guide-title">Pasang Caption Studio</h2></div>
          <button type="button" class="pwa-guide-close" aria-label="Tutup panduan">×</button>
        </div>
        ${localNote}
        ${steps}
        <p class="pwa-guide-footnote">Setelah dipasang, aplikasi dapat dibuka dari ikon di layar utama. Pembuatan video berlangsung lokal di perangkat.</p>
        <button type="button" class="pwa-guide-done">Mengerti</button>
      </div>
    `;
    document.body.append(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    backdrop
      .querySelector(".pwa-guide-close")
      ?.addEventListener("click", close);
    backdrop.querySelector(".pwa-guide-done")?.addEventListener("click", close);
    document.addEventListener("keydown", function onKeydown(event) {
      if (event.key !== "Escape") return;
      close();
      document.removeEventListener("keydown", onKeydown);
    });
    backdrop.querySelector(".pwa-guide-close")?.focus();
  }
})();

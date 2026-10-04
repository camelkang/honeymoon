import { toast } from "./actions.js";

/* ============================== 앱 (PWA) ============================== */
export let installEvt = null;
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export function setupPWA() {
  const btn = document.getElementById("btnInstall");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (isStandalone()) return;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; btn.hidden = false; });
  window.addEventListener("appinstalled", () => { btn.hidden = true; toast("📲 앱으로 설치됐어요!"); });
  if (isIOS()) btn.hidden = false;   // iOS는 설치 프롬프트가 없어 안내창으로 대체
  btn.onclick = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; btn.hidden = true; }
    else document.getElementById("installDlg").showModal();
  };
}

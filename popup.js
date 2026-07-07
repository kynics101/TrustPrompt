// popup.js
document.getElementById("btn-refresh").addEventListener("click", () => {
  const btn = document.getElementById("btn-refresh");
  btn.textContent = "Refreshing…";
  btn.disabled = true;
  chrome.runtime.sendMessage({ type: "REFRESH_RULES" }, (resp) => {
    btn.textContent = resp?.ok ? "✅ Rules updated" : "⚠ Fetch failed";
    setTimeout(() => {
      btn.textContent = "↻ Refresh Rules";
      btn.disabled = false;
    }, 2500);
  });
});

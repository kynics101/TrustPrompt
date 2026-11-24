// popup.js
// Toolbar popup: shows whether TrustPrompt is running and offers the consent,
// pause, and help actions. Re-renders whenever the stored state changes.

(function () {
  const ICONS = {
    allow:     '<path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z"/>',
    pause:     '<path fill="currentColor" d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/>',
    resume:    '<path fill="currentColor" d="M8 5v14l11-7L8 5Z"/>',
    off:       '<path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 0 1 4.9 14.3L5.7 7.1A8 8 0 0 1 12 4Zm-6.9 3.1 11.2 11.2A8 8 0 0 1 5.1 7.1Z"/>',
    uninstall: '<path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h2v9H7V9Zm4 0h2v9h-2V9Zm4 0h2v9h-2V9Z"/>',
  };

  const $ = (id) => document.getElementById(id);

  function extensionsPageUrl() {
    const id = chrome.runtime.id;
    if (navigator.brave) return `brave://extensions/?id=${id}`;
    if (/Edg\//.test(navigator.userAgent)) return `edge://extensions/?id=${id}`;
    return `chrome://extensions/?id=${id}`;
  }

  function openTab(url) {
    chrome.tabs.create({ url });
    window.close();
  }

  // Menu items, shown or hidden by the current state.
  const ITEMS = [
    {
      id: "allow",
      show: (s) => s.consent !== "allowed",
      title: () => "Allow TrustPrompt",
      desc: () => "Turn on checks in ChatGPT and Claude.",
      icon: ICONS.allow,
      run: () => TrustPromptConsent.setConsent("allowed"),
    },
    {
      id: "pause",
      show: (s) => s.consent === "allowed",
      title: (s) => (s.paused ? "Resume" : "Pause"),
      desc: (s) => (s.paused ? "Start checking prompts again." : "Stop checking until you resume."),
      icon: (s) => (s.paused ? ICONS.resume : ICONS.pause),
      run: (s) => TrustPromptConsent.setPaused(!s.paused),
    },
    {
      id: "off",
      show: (s) => s.consent === "allowed",
      title: () => "Turn off",
      desc: () => "Stop TrustPrompt. You can allow it again later.",
      icon: ICONS.off,
      run: () => TrustPromptConsent.setConsent("declined"),
    },
    {
      id: "uninstall",
      show: () => true,
      title: () => "Uninstall steps",
      desc: () => "How to remove TrustPrompt.",
      icon: ICONS.uninstall,
      run: () => openTab(chrome.runtime.getURL("onboarding.html#uninstall")),
    },
  ];

  function statusFor(state) {
    if (state.consent === "allowed" && state.paused) {
      return { cls: "paused", text: "Paused", detail: "Checks are paused. Resume to start again." };
    }
    if (state.consent === "allowed") {
      return { cls: "running", text: "Running", detail: "Checking prompts in ChatGPT and Claude." };
    }
    if (state.consent === "declined") {
      return { cls: "off", text: "Off", detail: "You chose not to allow TrustPrompt." };
    }
    return { cls: "off", text: "Off", detail: "Not allowed yet. Choose Allow to start." };
  }

  function renderMenu(state) {
    const menu = $("menu");
    menu.replaceChildren();
    for (const item of ITEMS) {
      if (!item.show(state)) continue;

      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item";
      btn.dataset.action = item.id;

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "18");
      icon.setAttribute("height", "18");
      icon.setAttribute("aria-hidden", "true");
      icon.classList.add("item-icon");
      icon.innerHTML = typeof item.icon === "function" ? item.icon(state) : item.icon;

      const text = document.createElement("span");
      text.className = "item-text";
      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = item.title(state);
      const desc = document.createElement("span");
      desc.className = "item-desc";
      desc.textContent = item.desc(state);
      text.append(title, desc);

      btn.append(icon, text);
      btn.addEventListener("click", () => item.run(state));
      li.append(btn);
      menu.append(li);
    }
  }

  async function render() {
    const state = await TrustPromptConsent.getState();
    const status = statusFor(state);
    const dot = $("status-dot");
    dot.className = `dot ${status.cls}`;
    $("status-text").textContent = status.text;
    $("status-detail").textContent = status.detail;
    renderMenu(state);
  }

  $("btn-settings").addEventListener("click", () => openTab(extensionsPageUrl()));
  $("btn-help").addEventListener("click", () => openTab(chrome.runtime.getURL("onboarding.html")));
  $("btn-steps").addEventListener("click", () => openTab(chrome.runtime.getURL("onboarding.html")));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[TrustPromptConsent.STORAGE_KEY]) render();
  });

  render();
})();

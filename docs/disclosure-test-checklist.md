# TrustPrompt disclosure and consent: browser test checklist

Run this checklist in Chrome, Edge, and Brave before publishing. Load the build with
`chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on Developer mode,
and choose "Load unpacked" on the TrustPrompt folder. Record Pass or Fail in each column.
Use made-up details only in every test prompt.

| # | Test | Steps | Expected result | Chrome | Edge | Brave |
|---|------|-------|-----------------|--------|------|-------|
| 1 | Fresh install opens disclosure page | Remove any old copy, then load unpacked | Three-step page opens in a new tab. Version shown in footer matches `manifest.json`. | | | |
| 2 | Step navigation | Click Next twice, then Back once | Steps 1, 2, 3 appear in order. Back is hidden on step 1. Next is hidden on step 3. | | | |
| 3 | Inactive before allowing | Open claude.ai and chatgpt.com without answering | No badge appears. Typing a card number shows no warning. Enter sends normally. | | | |
| 4 | I allow | Choose "I allow" | Result text says TrustPrompt is on. Open claude.ai: grey "ON" badge appears on the prompt box. | | | |
| 5 | Scanning works | Type `4111 1111 1111 1111` in Claude | Badge changes colour after a short pause. Side panel or warning appears. | | | |
| 6 | Pause from popup | Click the toolbar icon, then Pause | Status shows Paused. Badge disappears on an open claude.ai tab without reloading. Typing shows no warning. | | | |
| 7 | Pause across two tabs | Open two claude.ai tabs, pause, then type in each | Neither tab shows a badge or warning. | | | |
| 8 | Resume from popup | Click Resume | Status shows Running. Badge returns without reloading. | | | |
| 9 | I don't allow | Reload the disclosure page (Show consent steps), click I don't allow | Result text says TrustPrompt is off. Popup status shows Off. | | | |
| 10 | Declined makes no network requests | With Off status, open claude.ai, DevTools Network tab | No request to the rules URL (`trustprompt-rules.json`). No badge. | | | |
| 11 | Allow again from popup | Click Allow TrustPrompt | Status shows Running. Badge returns. | | | |
| 12 | Turn off from popup | Click Turn off | Status shows Off. Badge disappears. | | | |
| 13 | Popup menu per state | Check menu items in Off, Running, and Paused | Off: Allow TrustPrompt, Uninstall steps. Running: Pause, Turn off, Uninstall steps. Paused: Resume, Turn off, Uninstall steps. No side panel item. Footer has only "Review terms". | | | |
| 14 | Settings and help icons | Click the gear and the question-mark icons | Gear opens the browser's extension details page for TrustPrompt. Help opens the disclosure page. | | | |
| 15 | Review terms | Click Review terms | Disclosure page opens at step 1. | | | |
| 16 | Uninstall steps | Click Uninstall steps | Disclosure page opens at step 3, scrolled to the uninstall section. | | | |
| 17 | Uninstall removes state | Remove TrustPrompt, then reinstall | Disclosure page opens again, showing a fresh first-install state. | | | |
| 18 | Brave Shields | Allow TrustPrompt in Brave with default Shields | Badge and scanning work. Note whether Shields blocks any request. | n/a | n/a | |

## Before publishing

- [ ] Fill in placeholders on `onboarding.html`: `[link]` (Informed Consent Form), `[Researcher contact]`, `[REC contact]`, `[date]`.
- [ ] Replace the uninstall text with confirmed steps for each browser (Chrome, Edge, Brave).
- [ ] Confirm the wording with the ethics board (REC) if it was already approved.
- [ ] Verify the privacy statements against the final build. Code search found no network path that sends prompt text. Storage writes are the consent state, a theme preference, and the disabled rules cache. Browser DevTools console logs include the first 50 characters of prompts in debug messages. Decide whether to remove those logs before the study.
- [ ] Confirm the final version number in `manifest.json`.

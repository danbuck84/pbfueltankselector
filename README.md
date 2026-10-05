# 🛩️ Fuel Tank Timer — MSFS 2020

A sleek, installable web app (PWA) that reminds **Microsoft Flight Simulator 2020** pilots to switch fuel tanks — and, in Advanced Mode, tracks fuel per tank so you can keep the wings balanced.

**Live:** https://pbfueltankselector.netlify.app/

## 🌟 Features

### Basic Mode
- **Visual fuel selector** styled after the Cirrus SR22T G6 center console.
- **Custom interval** in 5-minute steps, no upper limit.
- **Cockpit-style alarm**: repeating two-tone beep, full-screen red flash and vibration.
- **Auto-switch**: acknowledging the alarm flips the selector and restarts the countdown.

### Advanced Mode
- **Aircraft profiles**: Cirrus SR22T G6, Cessna 172S (with **BOTH**), Beechcraft G36 Bonanza.
- **Live fuel tracking**: set fuel on board and fuel flow (GPH); the app burns fuel from the selected tank in real time.
- **Imbalance + endurance**: see which tank is fuller, total fuel and time to empty.
- **In-flight adjustments**: change GPH after leaning, or **Sync fuel with sim** to correct the numbers from the MFD.
- **Auto-balance**: at each reminder the app picks the fuller tank. It will keep you on the same tank for extra cycles when needed (e.g. after a rich climb on one side).
- **Manual switch**: tap any tank on the panel to switch right away; the cycle restarts.
- **Fuel pump reminder** (SR22T boost pump / G36 aux pump): ON 30 s before the switch, OFF 30 s after.
- **Stay option** on the alarm if you want to keep the current tank.

### Everywhere
- **Screen Wake Lock**: the screen stays on while the timer runs (when the browser supports it).
- **Background alerts**: if the app is in the background when the timer ends, you get a system notification.
- **Survives restarts**: the flight is saved locally, so if the OS closes the app it picks up where it left off.
- **Works offline** after the first visit.
- **Keyboard shortcuts**: `Space` = pause/resume or switch on alarm, `Esc` = stop.

## 📱 Install on your phone
- **iOS (Safari)**: Share → **Add to Home Screen**. Notifications on iOS require the installed app (iOS 16.4+).
- **Android (Chrome)**: menu → **Install app** (or accept the install prompt).

> **Background note:** mobile systems pause web apps in the background, especially iOS. Notifications are best-effort: Android/desktop usually deliver them; on iOS keep the app open (Wake Lock keeps the screen on) for a reliable alarm. Turn off the iPhone silent switch to hear the beep.

## 🚀 Development
Plain HTML, CSS and JavaScript — no build step, no dependencies.

```
index.html     markup
styles.css     styles
app.js         timer, fuel tracking, alarms, wake lock, notifications
sw.js          service worker (network-first, offline fallback)
manifest.json  PWA manifest
icons/         app icons and favicon
```

Run locally with any static server (service workers need `http://`, not `file://`):

```bash
npx serve .
```

Adding an aircraft: add an entry to `AIRCRAFT` at the top of `app.js`. When you change cached files, bump `CACHE_NAME` in `sw.js`.

## 🛣️ Roadmap
- [x] Mobile-first PWA
- [x] Multiple aircraft profiles
- [ ] More aircraft
- [ ] Optional Web Push server for reliable background alerts on iOS

## 🤝 Contributing
Issues and pull requests are welcome. Happy flying!

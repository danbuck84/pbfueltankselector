# 🛩️ Cirrus SR22T G6 Fuel Tank Timer

A sleek, browser-based timer app designed for **Microsoft Flight Simulator 2020** pilots to effectively manage fuel tank switching on the Cirrus SR22T G6.

## 🌟 Features

- **Visual Fuel Selector**: A beautifully designed, dark-themed interface mimicking the SR22T's center console.
- **Custom Intervals**: Set your preferred switch interval (in 5-minute increments) with no upper limit.
- **Drift-Compensated Timer**: Ensures accurate timekeeping even if the browser throttles background tabs.
- **Cockpit-Style Alerts**: Uses the Web Audio API to generate a repeating two-tone beep (similar to aircraft avionics warnings) alongside a full-screen red flashing visual alert.
- **Smart Auto-Switch**: Acknowledging the alarm automatically flips the virtual selector to the other tank and restarts the countdown.
- **Flight Stats**: Tracks total elapsed flight time and the number of tank switches.
- **Keyboard Shortcuts**: Quickly interact without clicking:
  - `Space`: Pause/Resume or Acknowledge Alarm
  - `Esc`: Stop Timer

## 🚀 Getting Started

Since this app is built with pure Vanilla HTML, CSS, and JavaScript, there are no dependencies to install or build steps to run!

### Local Usage
1. Clone the repository or download the source code.
2. Open `index.html` directly in your favorite web browser.

### Web Hosting (e.g., Netlify)
This project is ready to be hosted on static site platforms like **Netlify**, **Vercel**, or **GitHub Pages**. Simply link this repository to your hosting provider, and it will serve out of the box.

## 🛣️ Roadmap

- [ ] **Mobile First PWA**: Convert into a Progressive Web App so it can be installed natively on mobile devices or tablets for use alongside your flight simulator setup.
- [ ] **Extended Aircraft Support**: Add visual layouts for other popular general aviation aircraft.

## 💻 Tech Stack

- **HTML5** & **CSS3** (Animations, Custom styling)
- **Vanilla JavaScript** (State machine, Timer logic)
- **Web Audio API** (Procedural sound generation, zero external assets)

## 🤝 Contributing

Feel free to open issues or submit pull requests if you have ideas for new features or improvements. Happy flying!

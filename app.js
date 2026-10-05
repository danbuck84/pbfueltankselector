'use strict';

/* ═══════════════════════════════════════════════════════════
   Configuration
   ═══════════════════════════════════════════════════════════ */

// Aircraft profiles. Add new aircraft here — the UI adapts automatically.
// `tanks` is the order of the selector positions as drawn on screen.
const AIRCRAFT = {
  sr22t: {
    name: 'Cirrus SR22T G6',
    shortName: 'SR22T G6',
    tanks: ['left', 'right'],
    usablePerTank: 46,
    defaultGph: 18,
    pumpName: 'Boost pump',
  },
  c172: {
    name: 'Cessna 172S Skyhawk',
    shortName: 'C172S',
    tanks: ['left', 'both', 'right'],
    usablePerTank: 26.5,
    defaultGph: 9,
    pumpName: null, // high wing, gravity fed: no pump for tank switching
  },
  g36: {
    name: 'Beechcraft G36 Bonanza',
    shortName: 'G36',
    tanks: ['left', 'right'],
    usablePerTank: 37,
    defaultGph: 15,
    pumpName: 'Aux fuel pump',
  },
};

const BASIC_AIRCRAFT_ID = 'sr22t';      // Basic Mode is always the SR22T
const BALANCE_TOLERANCE_GAL = 1;        // Auto-balance: below this, just alternate
const IMBALANCE_WARN_GAL = 5;           // Imbalance text turns amber above this
const PUMP_LEAD_MS = 30 * 1000;         // Pump ON reminder before the switch
const PUMP_OFF_DELAY_MS = 30 * 1000;    // Pump OFF reminder after the switch
const TICK_MS = 250;
const SAVE_EVERY_MS = 5000;
const SETTINGS_KEY = 'fuelTimer.settings.v1';
const SESSION_KEY = 'fuelTimer.session.v1';
const NOTIFICATION_TAG = 'fuel-switch';

const DEFAULT_SETTINGS = {
  mode: 'basic',            // 'basic' | 'advanced'
  aircraftId: 'sr22t',
  startTank: 'left',
  intervalMin: 15,          // multiples of 5, min 5, no upper limit
  gph: AIRCRAFT.sr22t.defaultGph,
  switchLogic: 'alternate', // 'alternate' | 'balance'
  pumpReminder: true,
};

/* ═══════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════ */
let settings = loadSettings();
let setupFuel = fullTanks(activeAircraft());

// The running flight. Persisted to localStorage so it survives the OS
// killing the PWA in the background. All times are absolute timestamps,
// so the countdown stays correct no matter how long the app was suspended.
let session = null;

let tickTimer = null;
let endTimer = null;
let alarmSoundTimer = null;
let bannerTimer = null;
let lastSaveAt = 0;
let audioCtx = null;
let wakeLock = null;

const $ = (id) => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════
   Persistence
   ═══════════════════════════════════════════════════════════ */
function loadSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch { /* ignore */ }
  const merged = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (!AIRCRAFT[merged.aircraftId]) merged.aircraftId = DEFAULT_SETTINGS.aircraftId;
  return merged;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function saveSession() {
  lastSaveAt = Date.now();
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */
function activeAircraft() {
  return AIRCRAFT[settings.mode === 'basic' ? BASIC_AIRCRAFT_ID : settings.aircraftId];
}

function sessionAircraft() {
  return AIRCRAFT[session.aircraftId];
}

function fullTanks(aircraft) {
  return { left: aircraft.usablePerTank, right: aircraft.usablePerTank };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(input, fallback) {
  const value = parseFloat(String(input.value).replace(',', '.'));
  return Number.isFinite(value) ? value : fallback;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function otherTank(tank) {
  return tank === 'left' ? 'right' : 'left';
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDuration(hours) {
  if (!Number.isFinite(hours)) return '--';
  const totalMin = Math.floor(hours * 60);
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

function vibrate(pattern) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function applyModeClass(mode) {
  document.body.classList.toggle('mode-basic', mode === 'basic');
  document.body.classList.toggle('mode-advanced', mode === 'advanced');
}

/* ═══════════════════════════════════════════════════════════
   Setup Screen
   ═══════════════════════════════════════════════════════════ */
function renderSetup() {
  const aircraft = activeAircraft();
  applyModeClass(settings.mode);

  if (!aircraft.tanks.includes(settings.startTank)) settings.startTank = 'left';

  $('setup-subtitle').textContent = aircraft.name;

  document.querySelectorAll('#mode-toggle .seg-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.mode === settings.mode);
  });
  document.querySelectorAll('#logic-toggle .seg-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.logic === settings.switchLogic);
  });

  $('aircraft-list').innerHTML = Object.entries(AIRCRAFT).map(([id, a]) => `
    <button class="aircraft-btn ${id === settings.aircraftId ? 'selected' : ''}" data-aircraft="${id}">
      <span class="tank-label">${a.shortName}</span>
      <span class="tank-detail">${a.name}</span>
    </button>`).join('');

  $('start-tank-selector').innerHTML = aircraft.tanks.map((tank) => `
    <button class="tank-btn ${tank === settings.startTank ? 'selected' : ''}" data-tank="${tank}">
      <span class="tank-label">${tank.toUpperCase()}</span>
      <span class="tank-detail">${tank === 'both' ? 'LEFT + RIGHT' : `${aircraft.usablePerTank} U.S. GAL USABLE`}</span>
    </button>`).join('');

  $('interval-value').textContent = settings.intervalMin;

  ['left', 'right'].forEach((tank) => {
    const input = $(`setup-fuel-${tank}`);
    input.value = setupFuel[tank];
    input.max = aircraft.usablePerTank;
  });
  $('setup-gph').value = settings.gph;

  $('logic-hint').textContent = settings.switchLogic === 'balance'
    ? 'At each reminder, switches to the fuller tank. If it is already selected, you get a quiet "stay" notice instead of the alarm.'
    : 'Switches to the other tank at every reminder.';

  $('pump-setting').hidden = !aircraft.pumpName;
  if (aircraft.pumpName) $('pump-setting-label').textContent = `${aircraft.pumpName} reminder`;
  $('setup-pump').checked = settings.pumpReminder;
}

function readSetupInputs() {
  const aircraft = activeAircraft();
  setupFuel.left = round1(clamp(parseNumber($('setup-fuel-left'), aircraft.usablePerTank), 0, aircraft.usablePerTank));
  setupFuel.right = round1(clamp(parseNumber($('setup-fuel-right'), aircraft.usablePerTank), 0, aircraft.usablePerTank));
  settings.gph = round1(clamp(parseNumber($('setup-gph'), aircraft.defaultGph), 0, 999));
  settings.pumpReminder = $('setup-pump').checked;
}

function bindSetupEvents() {
  $('mode-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === settings.mode) return;
    readSetupInputs();
    settings.mode = btn.dataset.mode;
    setupFuel = fullTanks(activeAircraft());
    saveSettings();
    renderSetup();
  });

  $('aircraft-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-aircraft]');
    if (!btn || btn.dataset.aircraft === settings.aircraftId) return;
    readSetupInputs();
    settings.aircraftId = btn.dataset.aircraft;
    const aircraft = activeAircraft();
    setupFuel = fullTanks(aircraft);
    settings.gph = aircraft.defaultGph;
    saveSettings();
    renderSetup();
  });

  $('start-tank-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tank]');
    if (!btn) return;
    readSetupInputs();
    settings.startTank = btn.dataset.tank;
    saveSettings();
    renderSetup();
  });

  $('logic-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-logic]');
    if (!btn) return;
    readSetupInputs();
    settings.switchLogic = btn.dataset.logic;
    saveSettings();
    renderSetup();
  });

  $('interval-minus').addEventListener('click', () => adjustInterval(-5));
  $('interval-plus').addEventListener('click', () => adjustInterval(5));
  $('setup-pump').addEventListener('change', () => { settings.pumpReminder = $('setup-pump').checked; saveSettings(); });
  $('start-btn').addEventListener('click', startSession);
}

function adjustInterval(delta) {
  const next = settings.intervalMin + delta;
  if (next < 5) return;
  settings.intervalMin = next;
  $('interval-value').textContent = next;
  saveSettings();
}

/* ═══════════════════════════════════════════════════════════
   Session lifecycle
   ═══════════════════════════════════════════════════════════ */
function startSession() {
  // These need a user gesture, and Start is one.
  unlockAudio();
  requestNotificationPermission();

  const advanced = settings.mode === 'advanced';
  if (advanced) readSetupInputs();
  saveSettings();

  const aircraftId = advanced ? settings.aircraftId : BASIC_AIRCRAFT_ID;
  const aircraft = AIRCRAFT[aircraftId];
  const now = Date.now();
  const intervalMs = settings.intervalMin * 60 * 1000;

  session = {
    mode: settings.mode,
    aircraftId,
    intervalMs,
    switchLogic: advanced ? settings.switchLogic : 'alternate',
    pumpReminder: advanced && Boolean(aircraft.pumpName) && settings.pumpReminder,
    tank: settings.startTank,
    status: 'running',            // 'running' | 'paused' | 'alarm'
    cycleEndAt: settings.startTank === 'both' ? null : now + intervalMs,
    remainingMs: null,            // only used while paused
    elapsedMs: 0,
    lastTickAt: now,
    fuel: { ...setupFuel },
    gph: settings.gph,
    switchCount: 0,
    pumpOnShown: false,
    pumpOffDueAt: null,
    alarmTarget: null,
  };

  enterTimerScreen();
  afterStateChange();
}

function enterTimerScreen() {
  applyModeClass(session.mode);
  buildTanks();
  showScreen('timer-screen');
  requestWakeLock();
}

function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* ignore */ }
  if (!saved || !AIRCRAFT[saved.aircraftId] || !saved.status) return false;

  session = saved;
  enterTimerScreen();
  if (session.status === 'alarm') {
    showAlarm();
    startAlarmEffects();
  }
  afterStateChange();
  tick(); // catches up fuel burn and fires the alarm if it is overdue
  return true;
}

function stopSession() {
  if (!session) return;
  if (session.mode === 'advanced' && !window.confirm('Stop the timer? Fuel tracking for this flight will be reset.')) return;

  stopAlarmEffects();
  hideAlarm();
  hideBanner();
  clearInterval(tickTimer);
  clearTimeout(endTimer);
  tickTimer = null;
  endTimer = null;
  session = null;
  saveSession();
  releaseWakeLock();

  setupFuel = fullTanks(activeAircraft());
  renderSetup();
  showScreen('setup-screen');
}

function afterStateChange() {
  saveSession();
  scheduleEndTimer();
  if (!tickTimer) tickTimer = setInterval(tick, TICK_MS);
  render();
}

// A dedicated timeout for the exact end of the cycle. Scheduled from user
// actions, it is throttled far less than setInterval in background tabs.
function scheduleEndTimer() {
  clearTimeout(endTimer);
  endTimer = null;
  if (session && session.status === 'running' && session.cycleEndAt) {
    endTimer = setTimeout(tick, Math.max(0, session.cycleEndAt - Date.now()) + 20);
  }
}

/* ═══════════════════════════════════════════════════════════
   Timer engine
   ═══════════════════════════════════════════════════════════ */
function tick() {
  if (!session) return;
  const now = Date.now();
  advance(now);

  if (session.status === 'running') {
    if (session.cycleEndAt && now >= session.cycleEndAt) {
      triggerAlarm();
      return;
    }
    checkPumpReminders(now);
  }

  render();
  if (now - lastSaveAt > SAVE_EVERY_MS) saveSession();
}

// Moves elapsed time and fuel burn forward to `now`.
function advance(now) {
  const dt = Math.max(0, now - session.lastTickAt);
  session.lastTickAt = now;
  if (session.status === 'paused') return;

  session.elapsedMs += dt;
  if (session.mode === 'advanced') burnFuel((session.gph * dt) / 3600000);
}

function burnFuel(gallons) {
  const fuel = session.fuel;
  if (session.tank === 'both') {
    let fromLeft = Math.min(fuel.left, gallons / 2);
    let fromRight = Math.min(fuel.right, gallons - fromLeft);
    fromLeft = Math.min(fuel.left, gallons - fromRight); // if right ran dry, take the rest from left
    fuel.left -= fromLeft;
    fuel.right -= fromRight;
  } else {
    fuel[session.tank] = Math.max(0, fuel[session.tank] - gallons);
  }
}

// Which tank to feed from in the next cycle. `msAhead` projects the burn
// on the current tank, so the pump reminder and the alarm agree.
function recommendedTank(msAhead = 0) {
  const s = session;
  if (s.tank === 'both') return 'both';
  if (s.mode === 'advanced' && s.switchLogic === 'balance') {
    const projected = { ...s.fuel };
    projected[s.tank] -= (s.gph * msAhead) / 3600000;
    const diff = projected.left - projected.right;
    if (Math.abs(diff) >= BALANCE_TOLERANCE_GAL) return diff > 0 ? 'left' : 'right';
  }
  return otherTank(s.tank);
}

function remainingMs(now) {
  if (session.status === 'paused') return session.remainingMs;
  if (session.status === 'alarm') return 0;
  return session.cycleEndAt ? Math.max(0, session.cycleEndAt - now) : null;
}

function togglePause() {
  const s = session;
  if (!s || s.status === 'alarm') return;
  const now = Date.now();
  advance(now);

  if (s.status === 'paused') {
    s.status = 'running';
    if (s.remainingMs != null) s.cycleEndAt = now + s.remainingMs;
    s.remainingMs = null;
  } else {
    s.status = 'paused';
    s.remainingMs = s.cycleEndAt ? Math.max(0, s.cycleEndAt - now) : null;
    s.cycleEndAt = null;
  }
  afterStateChange();
}

// Advanced mode: tap a tank on the panel to switch manually at any time
// (e.g. right after leveling off). Restarts the cycle.
function selectTankManually(tank) {
  const s = session;
  if (!s || s.mode !== 'advanced' || s.status === 'alarm' || tank === s.tank) return;
  const now = Date.now();
  advance(now);

  s.tank = tank;
  s.switchCount += 1;
  s.pumpOnShown = false;
  if (tank === 'both') {
    s.cycleEndAt = null;
    s.remainingMs = null;
  } else if (s.status === 'paused') {
    s.remainingMs = s.intervalMs;
  } else {
    s.cycleEndAt = now + s.intervalMs;
  }
  hideBanner();
  afterStateChange();
}

function startNextCycle(now) {
  session.status = 'running';
  session.cycleEndAt = now + session.intervalMs;
  session.pumpOnShown = false;
}

/* ═══════════════════════════════════════════════════════════
   Pump reminders & banner
   ═══════════════════════════════════════════════════════════ */
function checkPumpReminders(now) {
  const s = session;
  if (!s.pumpReminder) return;
  const pumpName = sessionAircraft().pumpName;

  if (!s.pumpOnShown && s.cycleEndAt && s.cycleEndAt - now <= PUMP_LEAD_MS) {
    s.pumpOnShown = true;
    const target = recommendedTank(s.cycleEndAt - now);
    if (target !== s.tank) {
      showBanner(`${pumpName} → ON`, `Switching to ${target.toUpperCase()} in 30 seconds`, 'pump');
      vibrate(200);
    }
  }

  if (s.pumpOffDueAt && now >= s.pumpOffDueAt) {
    s.pumpOffDueAt = null;
    showBanner(`${pumpName} → OFF`, `Now feeding from ${s.tank.toUpperCase()}`, 'pump');
    vibrate(200);
    saveSession();
  }
}

function showBanner(title, detail, kind, autoHideMs = 0) {
  $('banner-title').textContent = title;
  $('banner-detail').textContent = detail || '';
  $('banner').className = `banner banner-${kind}`;
  $('banner').hidden = false;
  clearTimeout(bannerTimer);
  if (autoHideMs) bannerTimer = setTimeout(hideBanner, autoHideMs);
}

function hideBanner() {
  clearTimeout(bannerTimer);
  $('banner').hidden = true;
}

/* ═══════════════════════════════════════════════════════════
   Alarm
   ═══════════════════════════════════════════════════════════ */
function triggerAlarm() {
  const s = session;
  const now = Date.now();
  const target = recommendedTank(0);

  // Auto-balance decided to stay on the current tank: quiet notice, no alarm.
  if (target === s.tank) {
    const diff = Math.abs(s.fuel.left - s.fuel.right).toFixed(1);
    startNextCycle(now);
    showBanner(`Stay on ${s.tank.toUpperCase()}`, `${s.tank.toUpperCase()} is still ${diff} gal fuller`, 'info', 15000);
    vibrate(150);
    afterStateChange();
    return;
  }

  s.status = 'alarm';
  s.alarmTarget = target;
  hideBanner();
  afterStateChange();
  showAlarm();
  startAlarmEffects();
  if (document.hidden) notifySwitch();
}

function showAlarm() {
  const s = session;
  const advanced = s.mode === 'advanced';
  const from = s.tank.toUpperCase();
  const to = s.alarmTarget.toUpperCase();

  $('alarm-from').textContent = from;
  $('alarm-to').textContent = to;
  $('alarm-ack').textContent = advanced ? `Switch to ${to}` : 'Acknowledge';
  $('alarm-stay').textContent = `Stay on ${from}`;

  const detail = $('alarm-detail');
  if (advanced) {
    const lines = [];
    if (s.pumpReminder) lines.push(`<strong>${sessionAircraft().pumpName} ON</strong> before switching`);
    lines.push(`L ${s.fuel.left.toFixed(1)} gal · R ${s.fuel.right.toFixed(1)} gal`);
    detail.innerHTML = lines.join('<br>');
    detail.hidden = false;
  } else {
    detail.hidden = true;
  }

  $('alarm-overlay').classList.add('active');
}

function hideAlarm() {
  $('alarm-overlay').classList.remove('active');
}

function resolveAlarm(doSwitch) {
  const s = session;
  if (!s || s.status !== 'alarm') return;
  unlockAudio();
  const now = Date.now();
  advance(now);

  stopAlarmEffects();
  hideAlarm();

  if (doSwitch) {
    s.tank = s.alarmTarget;
    s.switchCount += 1;
    if (s.pumpReminder) s.pumpOffDueAt = now + PUMP_OFF_DELAY_MS;
  }
  s.alarmTarget = null;
  startNextCycle(now);
  afterStateChange();
}

function startAlarmEffects() {
  stopAlarmEffects();
  // Repeating two-tone beep pattern (like a cockpit warning) + vibration
  const pattern = () => {
    playBeep(880, 150);                          // High beep
    setTimeout(() => playBeep(660, 150), 200);   // Low beep
    vibrate([150, 50, 150]);
  };
  pattern();
  alarmSoundTimer = setInterval(pattern, 800);
}

function stopAlarmEffects() {
  clearInterval(alarmSoundTimer);
  alarmSoundTimer = null;
  vibrate(0);
  closeNotifications();
}

/* ═══════════════════════════════════════════════════════════
   Audio — Web Audio API Beep Generator
   ═══════════════════════════════════════════════════════════ */
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

// Mobile browsers only allow audio after a user gesture. Calling this from
// a tap "unlocks" the context so the alarm can beep later on its own.
function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

function playBeep(frequency, durationMs) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + durationMs / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + durationMs / 1000);
}

/* ═══════════════════════════════════════════════════════════
   Background alerts (system notifications)
   ═══════════════════════════════════════════════════════════ */
function notificationsSupported() {
  return 'Notification' in window;
}

function requestNotificationPermission() {
  if (!notificationsSupported() || Notification.permission !== 'default') return;
  try {
    const result = Notification.requestPermission(renderStatusChips);
    if (result && typeof result.then === 'function') result.then(renderStatusChips);
  } catch { /* ignore */ }
}

async function getSwRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
}

async function notifySwitch() {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !session) return;
  const s = session;
  let body = `${s.tank.toUpperCase()} → ${s.alarmTarget.toUpperCase()}`;
  if (s.pumpReminder) body += ` · ${sessionAircraft().pumpName} ON first`;

  const options = {
    body,
    tag: NOTIFICATION_TAG,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-32.png',
  };

  try {
    const reg = await getSwRegistration();
    // Android Chrome only allows notifications through the service worker
    if (reg) await reg.showNotification('Switch fuel tank', options);
    else new Notification('Switch fuel tank', options);
  } catch (err) {
    console.warn('Notification failed:', err);
  }
}

async function closeNotifications() {
  const reg = await getSwRegistration();
  if (!reg || !reg.getNotifications) return;
  try {
    const list = await reg.getNotifications({ tag: NOTIFICATION_TAG });
    list.forEach((n) => n.close());
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════
   Screen Wake Lock
   ═══════════════════════════════════════════════════════════ */
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') {
    renderStatusChips();
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      renderStatusChips();
    });
  } catch (err) {
    console.warn('Wake lock failed:', err);
  }
  renderStatusChips();
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

/* ═══════════════════════════════════════════════════════════
   Timer screen rendering
   ═══════════════════════════════════════════════════════════ */
function buildTanks() {
  const aircraft = sessionAircraft();
  const n = aircraft.tanks.length;

  $('fuel-panel-title').textContent = session.mode === 'advanced'
    ? `Fuel Selector · ${aircraft.shortName}`
    : 'Fuel Selector';

  $('fuel-tanks').innerHTML = aircraft.tanks.map((tank) => `
    <div class="fuel-tank" id="tank-${tank}" data-tank="${tank}">
      <div class="tank-name">${tank.toUpperCase()}</div>
      <div class="tank-capacity basic-only">${tank === 'both' ? 'LEFT + RIGHT' : `${aircraft.usablePerTank} U.S. GAL USABLE`}</div>
      ${tank === 'both'
        ? '<div class="tank-both-note advanced-only">L + R</div>'
        : `<div class="tank-gal advanced-only"><span id="gal-${tank}">0.0</span><small> gal</small></div>
           <div class="tank-bar advanced-only"><div class="tank-bar-fill" id="bar-${tank}"></div></div>`}
      <div class="active-badge">● SELECTED</div>
    </div>`).join('');

  // Track runs from the center of the first tank to the center of the last
  $('fuel-handle-track').style.left = `${50 / n}%`;
  $('fuel-handle-track').style.right = `${50 / n}%`;
}

function render() {
  if (!session) return;
  const s = session;
  const aircraft = sessionAircraft();
  const now = Date.now();

  // Tanks + handle
  aircraft.tanks.forEach((tank) => {
    const el = $(`tank-${tank}`);
    const feeding = tank === s.tank || (s.tank === 'both' && tank !== 'both');
    el.classList.toggle('active', tank === s.tank);
    el.classList.toggle('inactive', !feeding);
  });
  const idx = aircraft.tanks.indexOf(s.tank);
  $('fuel-handle').style.left = `calc(${((idx + 0.5) / aircraft.tanks.length) * 100}% - 18px)`;

  if (s.mode === 'advanced') renderFuelSummary(aircraft);

  // Countdown
  const rem = remainingMs(now);
  const countdown = $('countdown');
  countdown.classList.remove('warning', 'critical', 'paused');
  if (rem == null) {
    countdown.textContent = '--:--';
    $('countdown-label').textContent = s.status === 'paused' ? 'Paused · Feeding from BOTH' : 'Feeding from BOTH tanks';
  } else {
    const secs = Math.ceil(rem / 1000);
    countdown.textContent = formatTime(secs);
    if (s.status === 'paused') {
      $('countdown-label').textContent = 'Paused';
      countdown.classList.add('paused');
    } else {
      $('countdown-label').textContent = 'Next Switch In';
      if (secs <= 30) countdown.classList.add('critical');
      else if (secs <= 60) countdown.classList.add('warning');
    }
  }

  $('switch-count').textContent = s.switchCount;
  $('elapsed-time').textContent = formatTime(Math.floor(s.elapsedMs / 1000));
  $('pause-btn').textContent = s.status === 'paused' ? 'Resume' : 'Pause';
  renderStatusChips();
}

function renderFuelSummary(aircraft) {
  const s = session;
  ['left', 'right'].forEach((tank) => {
    $(`gal-${tank}`).textContent = s.fuel[tank].toFixed(1);
    $(`bar-${tank}`).style.width = `${clamp((s.fuel[tank] / aircraft.usablePerTank) * 100, 0, 100)}%`;
  });

  const diff = s.fuel.left - s.fuel.right;
  const abs = Math.abs(diff);
  const imbalance = $('imbalance');
  imbalance.textContent = abs < 0.1
    ? 'Balanced'
    : `Imbalance ${abs.toFixed(1)} gal · ${diff > 0 ? 'LEFT' : 'RIGHT'} fuller`;
  imbalance.classList.toggle('warn', abs >= IMBALANCE_WARN_GAL);

  const total = s.fuel.left + s.fuel.right;
  $('total-fuel').textContent = total.toFixed(1);
  $('endurance').textContent = s.gph > 0 ? formatDuration(total / s.gph) : '--';
  $('gph-value').textContent = `${s.gph.toFixed(1)} GPH`;
}

function renderStatusChips() {
  const wakeChip = $('wake-chip');
  if (!('wakeLock' in navigator)) {
    wakeChip.textContent = 'Screen lock: not supported';
    wakeChip.className = 'chip';
  } else if (wakeLock) {
    wakeChip.textContent = '☀ Screen stays on';
    wakeChip.className = 'chip ok';
  } else {
    wakeChip.textContent = 'Screen may sleep';
    wakeChip.className = 'chip warn';
  }

  const notifyChip = $('notify-chip');
  if (!notificationsSupported()) {
    notifyChip.textContent = 'Background alerts: unavailable';
    notifyChip.className = 'chip';
  } else if (Notification.permission === 'granted') {
    notifyChip.textContent = '🔔 Background alerts on';
    notifyChip.className = 'chip ok';
  } else if (Notification.permission === 'denied') {
    notifyChip.textContent = 'Notifications blocked';
    notifyChip.className = 'chip warn';
  } else {
    notifyChip.textContent = 'Tap to enable background alerts';
    notifyChip.className = 'chip warn';
  }
}

/* ═══════════════════════════════════════════════════════════
   In-flight fuel controls (advanced)
   ═══════════════════════════════════════════════════════════ */
function adjustGph(delta) {
  if (!session) return;
  advance(Date.now()); // burn at the old rate up to now
  session.gph = round1(clamp(session.gph + delta, 0, 999));
  saveSession();
  render();
}

function openFuelDialog() {
  if (!session) return;
  advance(Date.now());
  $('dlg-fuel-left').value = session.fuel.left.toFixed(1);
  $('dlg-fuel-right').value = session.fuel.right.toFixed(1);
  $('dlg-gph').value = session.gph.toFixed(1);
  $('fuel-dialog').showModal();
}

function onFuelDialogClose() {
  if (!session || $('fuel-dialog').returnValue !== 'save') return;
  const max = sessionAircraft().usablePerTank;
  advance(Date.now());
  session.fuel.left = round1(clamp(parseNumber($('dlg-fuel-left'), session.fuel.left), 0, max));
  session.fuel.right = round1(clamp(parseNumber($('dlg-fuel-right'), session.fuel.right), 0, max));
  session.gph = round1(clamp(parseNumber($('dlg-gph'), session.gph), 0, 999));
  saveSession();
  render();
}

/* ═══════════════════════════════════════════════════════════
   Event wiring
   ═══════════════════════════════════════════════════════════ */
function bindTimerEvents() {
  $('pause-btn').addEventListener('click', togglePause);
  $('stop-btn').addEventListener('click', stopSession);
  $('alarm-ack').addEventListener('click', () => resolveAlarm(true));
  $('alarm-stay').addEventListener('click', () => resolveAlarm(false));
  $('banner-dismiss').addEventListener('click', hideBanner);
  $('gph-minus').addEventListener('click', () => adjustGph(-0.5));
  $('gph-plus').addEventListener('click', () => adjustGph(0.5));
  $('gph-value').addEventListener('click', openFuelDialog);
  $('edit-fuel-btn').addEventListener('click', openFuelDialog);
  $('fuel-dialog').addEventListener('close', onFuelDialogClose);
  $('notify-chip').addEventListener('click', requestNotificationPermission);

  $('fuel-tanks').addEventListener('click', (e) => {
    const tankEl = e.target.closest('[data-tank]');
    if (tankEl) selectTankManually(tankEl.dataset.tank);
  });

  // Any tap re-unlocks audio (needed after the app was restored from storage)
  document.addEventListener('pointerdown', () => { if (session) unlockAudio(); });

  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.visibilityState === 'visible') {
      tick();
      requestWakeLock();
      if (session && session.status === 'alarm') closeNotifications();
    } else {
      advance(Date.now());
      saveSession();
    }
  });

  window.addEventListener('pagehide', () => {
    if (!session) return;
    advance(Date.now());
    saveSession();
  });

  // Keyboard: Space = pause/resume or switch on alarm, Esc = stop
  document.addEventListener('keydown', (e) => {
    if (!session || $('fuel-dialog').open) return;
    if (e.target.matches && e.target.matches('input, textarea')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      // Blur a focused button so the keyup does not also "click" it
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (session.status === 'alarm') resolveAlarm(true);
      else togglePause();
    } else if (e.code === 'Escape') {
      stopSession();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   Service Worker Registration (PWA)
   ═══════════════════════════════════════════════════════════ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });

  // When a new version takes over, reload once — but never mid-flight.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || session) return;
    reloaded = true;
    window.location.reload();
  });
}

/* ═══════════════════════════════════════════════════════════
   Boot
   ═══════════════════════════════════════════════════════════ */
bindSetupEvents();
bindTimerEvents();
registerServiceWorker();
if (!restoreSession()) renderSetup();

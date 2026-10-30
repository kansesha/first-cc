// 注意：contextBridge 已把 api 暴露到 window 上，不能再声明同名顶层 const，
// 否则会触发 "Identifier 'api' has already been declared" 导致整个脚本不执行。
const bridge = window.api;

const el = {
  phaseLabel: document.getElementById('phaseLabel'),
  sessionCount: document.getElementById('sessionCount'),
  time: document.getElementById('time'),
  hint: document.getElementById('hint'),
  ringFg: document.getElementById('ringFg'),
  btnStart: document.getElementById('btnStart'),
  btnReset: document.getElementById('btnReset'),
  btnSkip: document.getElementById('btnSkip'),
  btnPin: document.getElementById('btnPin'),
  btnMin: document.getElementById('btnMin'),
  btnClose: document.getElementById('btnClose'),
  btnSettings: document.getElementById('btnSettings'),
  settingsPanel: document.getElementById('settingsPanel'),
  btnSave: document.getElementById('btnSave'),
  btnCancel: document.getElementById('btnCancel'),
};

const RING_R = 88;
const RING_C = 2 * Math.PI * RING_R;

const PHASE = {
  work: { label: '专注', accent: '#e0523f' },
  shortBreak: { label: '短休息', accent: '#3aa65c' },
  longBreak: { label: '长休息', accent: '#3b82c4' },
};

const DEFAULT_CONFIG = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartBreak: true,
  autoStartWork: false,
  sound: true,
  notify: true,
};

let config = Object.assign({}, DEFAULT_CONFIG, loadConfig());
let phase = 'work';
let status = 'idle'; // idle | running | paused
let remaining = 0; // 剩余秒数
let total = 0; // 本阶段总秒数
let endAt = 0; // 结束时间戳(ms)
let completed = 0; // 本轮已完成的专注数
let ticker = null;
let audioCtx = null;

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('pomodoro-config')) || {};
  } catch {
    return {};
  }
}

function saveConfig() {
  localStorage.setItem('pomodoro-config', JSON.stringify(config));
}

function phaseDuration(p) {
  if (p === 'work') return config.workMin * 60;
  if (p === 'shortBreak') return config.shortMin * 60;
  return config.longMin * 60;
}

function enterPhase(p, autostart) {
  phase = p;
  total = phaseDuration(p);
  remaining = total;
  status = 'idle';
  endAt = 0;
  stopTicker();
  applyPhaseStyle();
  render();
  if (autostart) start();
}

function nextPhaseAfterWork() {
  completed += 1;
  return completed % config.longEvery === 0 ? 'longBreak' : 'shortBreak';
}

function finishPhase() {
  const finished = phase;
  playChime();

  let next;
  if (finished === 'work') {
    next = nextPhaseAfterWork();
    const mins = next === 'longBreak' ? config.longMin : config.shortMin;
    notify('🍅 专注结束', `${next === 'longBreak' ? '长' : '短'}休息 ${mins} 分钟`);
  } else {
    next = 'work';
    notify('☕ 休息结束', `开始专注 ${config.workMin} 分钟`);
  }

  const autostart = finished === 'work' ? config.autoStartBreak : config.autoStartWork;
  enterPhase(next, autostart);
}

function start() {
  if (status === 'running') return;
  status = 'running';
  endAt = Date.now() + remaining * 1000;
  startTicker();
  render();
}

function pause() {
  if (status !== 'running') return;
  remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  status = 'paused';
  endAt = 0;
  stopTicker();
  render();
}

function toggle() {
  if (status === 'running') pause();
  else start();
}

function reset() {
  enterPhase(phase, false);
}

function skip() {
  enterPhase(phase === 'work' ? 'shortBreak' : 'work', false);
}

function startTicker() {
  stopTicker();
  ticker = setInterval(tick, 200);
}

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick() {
  if (status !== 'running') return;
  remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  if (remaining <= 0) {
    finishPhase();
    return;
  }
  render();
}

function render() {
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  el.time.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const progress = total > 0 ? (total - remaining) / total : 0;
  el.ringFg.style.strokeDashoffset = (RING_C * (1 - progress)).toFixed(2);

  el.btnStart.textContent = status === 'running' ? '暂停' : status === 'paused' ? '继续' : '开始';

  if (status === 'running') el.hint.textContent = phase === 'work' ? '保持专注' : '放松一下';
  else if (status === 'paused') el.hint.textContent = '已暂停';
  else el.hint.textContent = '准备开始';

  renderDots();
  document.title = `${el.time.textContent} · ${PHASE[phase].label}`;
}

function renderDots() {
  const n = config.longEvery;
  const filled = completed % n;
  el.sessionCount.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < filled ? ' filled' : '');
    el.sessionCount.appendChild(d);
  }
}

function applyPhaseStyle() {
  document.documentElement.style.setProperty('--accent', PHASE[phase].accent);
  el.phaseLabel.textContent = PHASE[phase].label;
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playChime() {
  if (!config.sound) return;
  try {
    const ctx = getAudioCtx();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  } catch (e) {
    /* 忽略音频错误 */
  }
}

function notify(title, body) {
  if (config.notify && bridge && bridge.notify) bridge.notify(title, body);
}

// ---- 设置 ----
function setSwitch(id, val) {
  document.getElementById(id).checked = !!val;
}

function clampInt(id, min, max) {
  let v = parseInt(document.getElementById(id).value, 10);
  if (isNaN(v)) v = min;
  v = Math.max(min, Math.min(max, v));
  document.getElementById(id).value = v;
  return v;
}

function openSettings() {
  document.getElementById('inWork').value = config.workMin;
  document.getElementById('inShort').value = config.shortMin;
  document.getElementById('inLong').value = config.longMin;
  document.getElementById('inEvery').value = config.longEvery;
  setSwitch('swAutoBreak', config.autoStartBreak);
  setSwitch('swAutoWork', config.autoStartWork);
  setSwitch('swSound', config.sound);
  setSwitch('swNotify', config.notify);
  el.settingsPanel.classList.remove('hidden');
}

function applySettings() {
  config.workMin = clampInt('inWork', 1, 120);
  config.shortMin = clampInt('inShort', 1, 60);
  config.longMin = clampInt('inLong', 1, 90);
  config.longEvery = clampInt('inEvery', 2, 8);
  config.autoStartBreak = document.getElementById('swAutoBreak').checked;
  config.autoStartWork = document.getElementById('swAutoWork').checked;
  config.sound = document.getElementById('swSound').checked;
  config.notify = document.getElementById('swNotify').checked;
  saveConfig();
  el.settingsPanel.classList.add('hidden');
  if (status === 'idle') enterPhase(phase, false);
  render();
}

// ---- 事件 ----
el.btnStart.addEventListener('click', toggle);
el.btnReset.addEventListener('click', reset);
el.btnSkip.addEventListener('click', skip);

el.btnMin.addEventListener('click', () => bridge && bridge.minimize());
el.btnClose.addEventListener('click', () => bridge && bridge.quitApp());

el.btnPin.addEventListener('click', async () => {
  if (!bridge) return;
  const pinned = await bridge.togglePin();
  el.btnPin.classList.toggle('pinned', pinned);
  el.btnPin.title = pinned ? '取消置顶' : '置顶';
});

el.btnSettings.addEventListener('click', openSettings);
el.btnSave.addEventListener('click', applySettings);
el.btnCancel.addEventListener('click', () => el.settingsPanel.classList.add('hidden'));

window.addEventListener('keydown', (e) => {
  if (!el.settingsPanel.classList.contains('hidden')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    toggle();
  } else if (e.key === 'r' || e.key === 'R') {
    reset();
  } else if (e.key === 's' || e.key === 'S') {
    skip();
  }
});

if (bridge) {
  bridge.onTrayToggle(toggle);
  bridge.isPinned().then((p) => {
    el.btnPin.classList.toggle('pinned', p);
    el.btnPin.title = p ? '取消置顶' : '置顶';
  });
}

// ---- 初始化 ----
el.ringFg.style.strokeDasharray = RING_C.toFixed(2);
enterPhase('work', false);

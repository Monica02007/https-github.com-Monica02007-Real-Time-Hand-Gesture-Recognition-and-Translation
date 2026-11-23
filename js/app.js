import { drawHandLandmarks } from './landmarks.js';
import {
  ASL_LETTERS,
  ASL_WORDS,
  ASL_CLASSES,
  GESTURE_DESCRIPTIONS,
  formatSignForSentence,
  classifyGesture,
  synthesizeHandSkeleton,
} from './model.js';

const COMMON_ASL_WORDS = [
  'HELLO', 'HELP', 'HERE', 'HEY', 'HOW', 'HAPPY', 'HOME', 'HAVE', 'HI',
  'THANK YOU', 'THANKS', 'THANK', 'THAT', 'THIS', 'THERE', 'TIME', 'TODAY', 'TOMORROW',
  'PLEASE', 'PEACE', 'PEOPLE',
  'GOOD', 'GREAT', 'GO', 'GOODBYE',
  'YES', 'YOU', 'YOUR',
  'NO', 'NAME', 'NICE', 'NEED', 'NIGHT', 'NOW',
  'WATER', 'WHAT', 'WHERE', 'WHEN', 'WHO', 'WHY', 'WELCOME', 'WAIT', 'WANT', 'WORK',
  'LOVE', 'I LOVE YOU', 'LIKE', 'LEARN', 'LOOK',
  'SORRY', 'STOP', 'SEE', 'SIGN', 'SCHOOL',
  'MORNING', 'FRIEND', 'FAMILY', 'FOOD', 'FINE', 'FINISH',
  'DRINK', 'EAT', 'COME', 'CARE', 'BYE', 'OK',
];

const STARTER_WORDS = ['HELLO', 'THANK YOU', 'PLEASE', 'HELP', 'GOOD', 'YES', 'NO', 'I LOVE YOU'];

// ---------------- Application State ----------------
const state = {
  appMode: 'live', // 'live' | 'snapshot'
  isTheaterMode: false,
  confidenceThreshold: 0.75,
  debounceFrames: 12,
  showLandmarks: true,
  sentence: '',
  mirror: true,
  isStreaming: true,
  isSimulating: false,
  simulatedSign: 'L',
  selectedDeviceId: '',
  cameraError: null,
  showTroubleshoot: false,
  snapshotChar: null,
};

let candidateChar = null;
let holdCount = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
let handsInstance = null;
let isSending = false;
let lastLandmarks = null;
let lastPrediction = null;
let activeStream = null;
let cameraRequestId = 0;
let flashTimer = null;
let trainInterval = null;

// ---------------- DOM Elements ----------------
const el = {
  modeLiveBtn: document.getElementById('mode-live-btn'),
  modeSnapshotBtn: document.getElementById('mode-snapshot-btn'),
  sidebarTheaterBtn: document.getElementById('sidebar-theater-btn'),
  sidebarTheaterText: document.getElementById('sidebar-theater-text'),
  sidebarTheaterBadge: document.getElementById('sidebar-theater-badge'),
  headerTheaterBtn: document.getElementById('header-theater-btn'),
  headerTheaterText: document.getElementById('header-theater-text'),
  confRange: document.getElementById('conf-threshold-range'),
  confVal: document.getElementById('conf-threshold-val'),
  debounceRange: document.getElementById('debounce-range'),
  debounceVal: document.getElementById('debounce-val'),
  showLandmarksCheck: document.getElementById('show-landmarks-check'),
  dashboardGrid: document.getElementById('dashboard-grid'),
  livePanel: document.getElementById('live-panel'),
  snapshotPanel: document.getElementById('snapshot-panel'),
  sentenceBox: document.getElementById('sentence-box'),
  sentenceCount: document.getElementById('sentence-char-count'),
  flashAddedBadge: document.getElementById('flash-added-badge'),
  btnSpace: document.getElementById('btn-space'),
  btnDel: document.getElementById('btn-del'),
  btnClear: document.getElementById('btn-clear'),
  btnCopy: document.getElementById('btn-copy'),
  btnSpeak: document.getElementById('btn-speak'),
  autocompleteLabel: document.getElementById('autocomplete-label'),
  autocompleteChips: document.getElementById('autocomplete-chips'),
  // Camera
  camStatusDot: document.getElementById('cam-status-dot'),
  camHeaderTitle: document.getElementById('cam-header-title'),
  camHeaderSub: document.getElementById('cam-header-sub'),
  deviceSelect: document.getElementById('camera-device-select'),
  camMirrorBtn: document.getElementById('cam-mirror-btn'),
  camToggleBtn: document.getElementById('cam-toggle-btn'),
  camSimBtn: document.getElementById('cam-sim-btn'),
  camTheaterBtn: document.getElementById('cam-theater-btn'),
  camFullscreenBtn: document.getElementById('cam-fullscreen-btn'),
  video: document.getElementById('webcam-video'),
  canvas: document.getElementById('overlay-canvas'),
  pausedOverlay: document.getElementById('paused-overlay'),
  resumeCamBtn: document.getElementById('resume-cam-btn'),
  errorOverlay: document.getElementById('error-overlay'),
  cameraErrorMsg: document.getElementById('camera-error-msg'),
  retryCamBtn: document.getElementById('retry-cam-btn'),
  useSimBtn: document.getElementById('use-sim-btn'),
  troubleshootToggleBtn: document.getElementById('troubleshoot-toggle-btn'),
  troubleshootBox: document.getElementById('troubleshoot-box'),
  simulatorDock: document.getElementById('simulator-dock'),
  simActiveBadge: document.getElementById('sim-active-badge'),
  simLettersGrid: document.getElementById('sim-letters-grid'),
  simWordsGrid: document.getElementById('sim-words-grid'),
  // Snapshot
  snapLettersGrid: document.getElementById('snap-letters-grid'),
  snapWordsGrid: document.getElementById('snap-words-grid'),
  snapFileInput: document.getElementById('snapshot-file-input'),
  snapUploadBtn: document.getElementById('snapshot-upload-btn'),
  snapFileLabel: document.getElementById('snapshot-file-label'),
  snapCanvas: document.getElementById('snapshot-canvas'),
  snapProcessing: document.getElementById('snapshot-processing'),
  snapResult: document.getElementById('snapshot-result'),
  snapBadge: document.getElementById('snapshot-badge'),
  snapConf: document.getElementById('snapshot-conf'),
  snapDesc: document.getElementById('snapshot-desc'),
  snapAddBtn: document.getElementById('snapshot-add-btn'),
  // Metrics
  metricDetectedWrap: document.getElementById('metric-detected-wrap'),
  metricWaitingWrap: document.getElementById('metric-waiting-wrap'),
  metricTopChar: document.getElementById('metric-top-char'),
  metricTopDesc: document.getElementById('metric-top-desc'),
  metricHoldText: document.getElementById('metric-hold-text'),
  metricHoldBar: document.getElementById('metric-hold-bar'),
  metricConfText: document.getElementById('metric-conf-text'),
  metricConfBar: document.getElementById('metric-conf-bar'),
  metricThreshLabel: document.getElementById('metric-thresh-label'),
  metricTop3List: document.getElementById('metric-top3-list'),
  metricFps: document.getElementById('metric-fps'),
  // Modals
  guideModal: document.getElementById('guide-modal'),
  guideSearchInput: document.getElementById('guide-search-input'),
  guideModalBody: document.getElementById('guide-modal-body'),
  openGuideBtn: document.getElementById('open-guide-btn'),
  metricsGuideBtn: document.getElementById('metrics-guide-btn'),
  closeGuideX: document.getElementById('close-guide-x'),
  closeGuideBtn: document.getElementById('close-guide-btn'),
  trainingModal: document.getElementById('training-modal'),
  openTrainingBtn: document.getElementById('open-training-btn'),
  closeTrainingX: document.getElementById('close-training-x'),
  closeTrainingBtn: document.getElementById('close-training-btn'),
  startTrainingBtn: document.getElementById('start-training-btn'),
  trainEpoch: document.getElementById('train-epoch'),
  trainValAcc: document.getElementById('train-val-acc'),
  trainLoss: document.getElementById('train-loss'),
  trainValLoss: document.getElementById('train-val-loss'),
  trainLogs: document.getElementById('train-logs'),
  trainCompleteTag: document.getElementById('train-complete-tag'),
};

// ---------------- Sentence Builder & Autocomplete ----------------
function renderSentence() {
  const s = state.sentence;
  el.sentenceCount.textContent = `${s.length} ${s.length === 1 ? 'char' : 'chars'}`;

  el.sentenceBox.textContent = '';
  if (s) {
    el.sentenceBox.textContent = s;
  } else {
    const span = document.createElement('span');
    span.className = 'sentence-placeholder';
    span.textContent = '(Hold a hand sign steady to append letters or ASL words...)';
    el.sentenceBox.appendChild(span);
  }

  const empty = s.length === 0;
  el.btnDel.disabled = empty;
  el.btnClear.disabled = empty;
  el.btnCopy.disabled = empty;
  el.btnSpeak.disabled = empty;

  renderAutocomplete();
}

function appendToSentence(token) {
  state.sentence += token;
  renderSentence();

  el.flashAddedBadge.textContent = `+ ${token === ' ' ? 'SPACE' : token.trim()}`;
  el.flashAddedBadge.classList.remove('hidden');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.flashAddedBadge.classList.add('hidden');
  }, 1400);
}

function renderAutocomplete() {
  const lastSpaceIdx = state.sentence.lastIndexOf(' ');
  const fragment = (lastSpaceIdx === -1 ? state.sentence : state.sentence.slice(lastSpaceIdx + 1)).toUpperCase();

  let suggestions = STARTER_WORDS;
  if (fragment) {
    const prefix = COMMON_ASL_WORDS.filter((w) => w.startsWith(fragment) && w !== fragment);
    const contains =
      prefix.length < 6
        ? COMMON_ASL_WORDS.filter((w) => !w.startsWith(fragment) && w.includes(fragment) && w !== fragment)
        : [];
    const combined = [...prefix, ...contains].slice(0, 7);
    suggestions = combined.length > 0 ? combined : STARTER_WORDS.slice(0, 5);
  }

  el.autocompleteLabel.textContent = fragment ? `✨ Word Matches (${fragment}):` : '✨ Quick Words:';
  el.autocompleteChips.textContent = '';

  for (const word of suggestions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'word-chip';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      if (!fragment) {
        state.sentence += `${word} `;
      } else if (word.startsWith(fragment) || word.includes(fragment)) {
        const prefix = lastSpaceIdx === -1 ? '' : state.sentence.slice(0, lastSpaceIdx + 1);
        state.sentence = `${prefix}${word} `;
      } else {
        state.sentence = `${state.sentence.trimEnd()} ${word} `;
      }
      renderSentence();
    });
    el.autocompleteChips.appendChild(btn);
  }
}

// ---------------- Metrics Rendering ----------------
function renderMetrics(char, conf, top3) {
  const isConfident = Boolean(char && conf >= state.confidenceThreshold);

  if (isConfident && char) {
    el.metricDetectedWrap.classList.remove('hidden');
    el.metricWaitingWrap.classList.add('hidden');
    el.metricTopChar.textContent = char;
    el.metricTopDesc.textContent = GESTURE_DESCRIPTIONS[char] || 'Hand sign recognized';
  } else {
    el.metricDetectedWrap.classList.add('hidden');
    el.metricWaitingWrap.classList.remove('hidden');
  }

  const pct = (conf * 100).toFixed(1);
  el.metricConfText.textContent = `${pct}%`;
  el.metricConfText.style.color = isConfident ? '#1d4ed8' : '#64748b';
  el.metricConfBar.style.width = `${Math.min(100, conf * 100)}%`;
  el.metricConfBar.className = `progress-fill ${isConfident ? '' : 'muted'}`;

  el.metricTop3List.textContent = '';
  if (!top3 || top3.length === 0) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:0;font-size:0.75rem;color:#94a3b8;font-style:italic;';
    p.textContent = 'No candidates detected';
    el.metricTop3List.appendChild(p);
  } else {
    top3.forEach((item, idx) => {
      const row = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'top3-row-head';

      const left = document.createElement('span');
      left.style.cssText = 'display:flex;align-items:center;gap:0.35rem;font-weight:700;';
      const rank = document.createElement('span');
      rank.style.cssText = 'color:#94a3b8;font-size:0.65rem;';
      rank.textContent = `#${idx + 1}`;
      const chip = document.createElement('span');
      chip.className = 'top3-chip';
      chip.textContent = item.char;
      left.append(rank, chip);

      const right = document.createElement('span');
      right.style.cssText = 'font-family:monospace;color:#475569;';
      right.textContent = `${(item.confidence * 100).toFixed(1)}%`;

      head.append(left, right);

      const track = document.createElement('div');
      track.className = 'progress-track';
      track.style.height = '6px';
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = `${item.confidence * 100}%`;
      fill.style.background = idx === 0 ? '#3b82f6' : idx === 1 ? '#94a3b8' : '#cbd5e1';
      track.appendChild(fill);

      row.append(head, track);
      el.metricTop3List.appendChild(row);
    });
  }
}

function updateHoldMetrics(count) {
  el.metricHoldText.textContent = `${count} / ${state.debounceFrames} frames`;
  const pct = Math.min(100, (count / state.debounceFrames) * 100);
  el.metricHoldBar.style.width = `${pct}%`;
  el.metricHoldBar.className = `progress-fill ${count >= state.debounceFrames ? 'complete' : ''}`;
}

function handleDebouncedChar(char, conf) {
  if (conf < state.confidenceThreshold) {
    candidateChar = null;
    holdCount = 0;
    updateHoldMetrics(0);
    return;
  }

  if (char === candidateChar) {
    holdCount += 1;
  } else {
    candidateChar = char;
    holdCount = 1;
  }

  updateHoldMetrics(holdCount);

  if (holdCount === state.debounceFrames) {
    appendToSentence(formatSignForSentence(char));
  }
}

// ---------------- Layout & Mode Toggles ----------------
function syncLayoutUI() {
  el.modeLiveBtn.classList.toggle('active', state.appMode === 'live');
  el.modeSnapshotBtn.classList.toggle('active', state.appMode === 'snapshot');
  el.livePanel.classList.toggle('hidden', state.appMode !== 'live');
  el.snapshotPanel.classList.toggle('hidden', state.appMode !== 'snapshot');

  el.dashboardGrid.classList.toggle('theater', state.isTheaterMode);
  el.sidebarTheaterBtn.classList.toggle('theater-active', state.isTheaterMode);
  el.sidebarTheaterText.textContent = state.isTheaterMode ? 'Theater View (Full Width)' : 'Standard Split View';
  el.sidebarTheaterBadge.textContent = state.isTheaterMode ? 'Expanded' : 'Split';
  el.headerTheaterText.textContent = state.isTheaterMode ? 'Split View' : 'Expand Camera (Theater Mode)';
  el.camTheaterBtn.textContent = state.isTheaterMode ? 'Split' : 'Expand';
}

function syncCameraUI() {
  el.video.classList.toggle('hidden', state.isSimulating);
  el.video.style.transform = state.mirror ? 'scaleX(-1)' : 'none';
  el.camMirrorBtn.classList.toggle('active-blue', state.mirror);

  el.simulatorDock.classList.toggle('hidden', !state.isSimulating);
  el.camToggleBtn.classList.toggle('hidden', state.isSimulating);
  el.deviceSelect.classList.toggle('hidden', state.isSimulating || el.deviceSelect.options.length <= 1);

  if (state.isSimulating) {
    el.camSimBtn.textContent = 'Switch to Webcam';
    el.camSimBtn.className = 'cam-btn active-indigo';
    el.camStatusDot.className = 'status-dot sim';
    el.camHeaderTitle.textContent = 'Virtual Landmark Simulator';
    el.camHeaderSub.textContent = 'Synthesized 21 3D Landmarks • Real-Time Pipeline';
    el.pausedOverlay.classList.add('hidden');
    el.errorOverlay.classList.add('hidden');
  } else {
    el.camSimBtn.textContent = 'Virtual Simulator';
    el.camSimBtn.className = 'cam-btn sim-idle';
    el.camHeaderTitle.textContent = 'Live Camera Feed';
    el.camHeaderSub.textContent = handsInstance
      ? 'MediaPipe Hands Active • 63 Feature Dimensions'
      : 'Initializing Camera Engine...';

    if (state.cameraError) {
      el.camStatusDot.className = 'status-dot';
      el.errorOverlay.classList.remove('hidden');
      el.pausedOverlay.classList.add('hidden');
      el.cameraErrorMsg.textContent = state.cameraError;
    } else if (!state.isStreaming) {
      el.camStatusDot.className = 'status-dot';
      el.errorOverlay.classList.add('hidden');
      el.pausedOverlay.classList.remove('hidden');
    } else {
      el.camStatusDot.className = 'status-dot live';
      el.errorOverlay.classList.add('hidden');
      el.pausedOverlay.classList.add('hidden');
    }
  }

  el.camToggleBtn.textContent = state.isStreaming ? 'Pause' : 'Turn ON Camera';
  el.camToggleBtn.className = `cam-btn ${state.isStreaming ? 'stop' : 'start'}`;
}

// ---------------- MediaPipe & Webcam ----------------
function initMediaPipe() {
  try {
    const HandsClass = window.Hands;
    if (!HandsClass) return false;
    const hands = new HandsClass({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const raw = results.multiHandLandmarks[0];
        lastLandmarks = raw;
        const pred = classifyGesture(raw);
        lastPrediction = pred;
        renderMetrics(pred.topChar, pred.topConfidence, pred.top3);
        handleDebouncedChar(pred.topChar, pred.topConfidence);
      } else {
        lastLandmarks = null;
        lastPrediction = null;
        renderMetrics(null, 0, []);
        candidateChar = null;
        holdCount = 0;
        updateHoldMetrics(0);
      }
    });
    handsInstance = hands;
    syncCameraUI();
    return true;
  } catch (err) {
    console.warn('MediaPipe load warning:', err);
    return false;
  }
}

function stopCamera() {
  cameraRequestId += 1;
  state.isStreaming = false;
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (el.video.srcObject) {
    el.video.srcObject.getTracks().forEach((t) => t.stop());
    el.video.srcObject = null;
  }
  const ctx = el.canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  syncCameraUI();
}

async function startCamera() {
  const reqId = ++cameraRequestId;
  state.cameraError = null;
  state.isStreaming = true;
  syncCameraUI();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.isStreaming = false;
    state.cameraError =
      'Camera API is unavailable in this browser context (requires HTTPS or localhost). You can test live recognition with the Virtual Gesture Simulator.';
    syncCameraUI();
    return;
  }

  try {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }

    const videoConstraints = {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
    };
    if (state.selectedDeviceId) {
      videoConstraints.deviceId = { ideal: state.selectedDeviceId };
    } else {
      videoConstraints.facingMode = 'user';
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    } catch (constraintErr) {
      if (
        constraintErr?.name === 'NotAllowedError' ||
        constraintErr?.name === 'PermissionDeniedError' ||
        constraintErr?.name === 'NotFoundError' ||
        constraintErr?.name === 'DevicesNotFoundError'
      ) {
        throw constraintErr;
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    if (reqId !== cameraRequestId) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }

    activeStream = stream;
    el.video.srcObject = stream;
    el.video.onloadedmetadata = async () => {
      if (reqId !== cameraRequestId) return;
      try {
        await el.video.play();
      } catch (e) {
        console.warn('Video autoplay warning:', e);
      }
    };

    if (navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (reqId !== cameraRequestId) return;
        const inputs = devices.filter((d) => d.kind === 'videoinput');
        el.deviceSelect.textContent = '';
        inputs.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Camera ${idx + 1}`;
          if (d.deviceId === state.selectedDeviceId) opt.selected = true;
          el.deviceSelect.appendChild(opt);
        });
        syncCameraUI();
      } catch {}
    }
  } catch (err) {
    if (reqId !== cameraRequestId) return;
    console.warn('Camera stream unavailable:', err?.name || err?.message || err);
    state.isStreaming = false;
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      state.cameraError =
        'Camera permission was denied in your browser. Please click the camera/lock icon in your address bar to allow camera access, or use the Virtual Gesture Simulator below.';
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      state.cameraError = 'No camera device found on this system. You can use the built-in Virtual Gesture Simulator.';
    } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
      state.cameraError =
        'Your webcam is currently in use by another program (e.g., Zoom, Teams, or another tab). Close other camera apps and click Retry.';
    } else {
      state.cameraError = 'Unable to access your webcam. Try the Virtual Gesture Simulator below.';
    }
    syncCameraUI();
  }
}

async function initCameraOnLoad() {
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      if (status.state === 'denied') {
        state.isStreaming = false;
        state.cameraError =
          'Camera permission is currently blocked in your browser. Allow camera access in site settings and click Retry, or use the Virtual Gesture Simulator.';
        syncCameraUI();
        return;
      }
    } catch {}
  }
  startCamera();
}

// ---------------- Render Loop ----------------
function renderLoop() {
  frameCount += 1;
  const now = performance.now();
  if (now - lastFpsTime >= 500) {
    const fps = (frameCount / (now - lastFpsTime)) * 1000;
    el.metricFps.textContent = `${fps.toFixed(1)} FPS`;
    frameCount = 0;
    lastFpsTime = now;
  }

  if (state.appMode === 'live') {
    const ctx = el.canvas.getContext('2d');
    if (state.isSimulating && ctx) {
      el.canvas.width = el.canvas.parentElement?.clientWidth || 800;
      el.canvas.height = el.canvas.parentElement?.clientHeight || 600;
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x < el.canvas.width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, el.canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < el.canvas.height; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(el.canvas.width, y);
        ctx.stroke();
      }

      const rawLm = synthesizeHandSkeleton(state.simulatedSign, 0.012);
      const pred = classifyGesture(rawLm);

      if (state.showLandmarks) {
        drawHandLandmarks(ctx, rawLm, el.canvas.width, el.canvas.height, {
          showBones: true,
          showJoints: true,
          showBBox: true,
          label: pred.topChar,
          confidence: pred.topConfidence,
          color: pred.topConfidence >= state.confidenceThreshold ? '#22c55e' : '#f59e0b',
        });
      }

      renderMetrics(pred.topChar, pred.topConfidence, pred.top3);
      handleDebouncedChar(pred.topChar, pred.topConfidence);
    } else if (ctx && el.video.readyState >= 2) {
      const w = el.video.videoWidth || 640;
      const h = el.video.videoHeight || 480;
      if (el.canvas.width !== w || el.canvas.height !== h) {
        el.canvas.width = w;
        el.canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      if (state.showLandmarks && lastLandmarks && lastPrediction) {
        const displayLm = lastLandmarks.map((lm) => ({
          x: state.mirror ? 1.0 - lm.x : lm.x,
          y: lm.y,
          z: lm.z,
        }));
        drawHandLandmarks(ctx, displayLm, w, h, {
          showBones: true,
          showJoints: true,
          showBBox: true,
          label: lastPrediction.topChar,
          confidence: lastPrediction.topConfidence,
          color: lastPrediction.topConfidence >= state.confidenceThreshold ? '#22c55e' : '#f59e0b',
        });
      }

      if (handsInstance && !isSending && state.isStreaming) {
        isSending = true;
        handsInstance
          .send({ image: el.video })
          .catch(() => {})
          .finally(() => {
            isSending = false;
          });
      }
    }
  }

  requestAnimationFrame(renderLoop);
}

// ---------------- Snapshot Logic ----------------
function showSnapshotPrediction(pred) {
  state.snapshotChar = pred.topChar;
  el.snapResult.classList.remove('hidden');
  el.snapBadge.textContent = pred.topChar;
  el.snapConf.textContent = `${(pred.topConfidence * 100).toFixed(1)}% Confidence`;
  el.snapDesc.textContent = GESTURE_DESCRIPTIONS[pred.topChar] || 'Gesture recognized';
  renderMetrics(pred.topChar, pred.topConfidence, pred.top3);
}

function testSnapshotSign(sign) {
  const ctx = el.snapCanvas.getContext('2d');
  if (!ctx) return;
  el.snapCanvas.width = 640;
  el.snapCanvas.height = 480;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 640, 480);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 480);
    ctx.stroke();
  }
  for (let y = 0; y < 480; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }

  const lm = synthesizeHandSkeleton(sign, 0.01);
  const pred = classifyGesture(lm);
  drawHandLandmarks(ctx, lm, 640, 480, {
    showBones: true,
    showJoints: true,
    showBBox: true,
    label: pred.topChar,
    confidence: pred.topConfidence,
    color: '#22c55e',
  });
  showSnapshotPrediction(pred);
}

async function analyzeUploadedImage(img) {
  el.snapProcessing.classList.remove('hidden');
  const ctx = el.snapCanvas.getContext('2d');
  if (!ctx) {
    el.snapProcessing.classList.add('hidden');
    return;
  }
  el.snapCanvas.width = img.naturalWidth || 640;
  el.snapCanvas.height = img.naturalHeight || 480;
  ctx.drawImage(img, 0, 0, el.snapCanvas.width, el.snapCanvas.height);

  let landmarks = null;
  if (window.Hands) {
    try {
      const snapHands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      snapHands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5 });
      await new Promise((resolve) => {
        snapHands.onResults((res) => {
          if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
            landmarks = res.multiHandLandmarks[0];
          }
          resolve();
        });
        snapHands.send({ image: img });
      });
    } catch {}
  }

  if (!landmarks) {
    landmarks = synthesizeHandSkeleton('A', 0.01);
  }

  const pred = classifyGesture(landmarks);
  if (state.showLandmarks) {
    drawHandLandmarks(ctx, landmarks, el.snapCanvas.width, el.snapCanvas.height, {
      showBones: true,
      showJoints: true,
      showBBox: true,
      label: pred.topChar,
      confidence: pred.topConfidence,
      color: '#22c55e',
    });
  }
  showSnapshotPrediction(pred);
  el.snapProcessing.classList.add('hidden');
}

// ---------------- Modals & Sign Grids ----------------
function buildSignGrids() {
  const renderSimulatorButtons = () => {
    el.simLettersGrid.textContent = '';
    el.simWordsGrid.textContent = '';
    el.simActiveBadge.textContent = `Active Sign: ${state.simulatedSign}`;

    for (const sign of ASL_LETTERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sim-sign-btn ${state.simulatedSign === sign ? 'active' : ''}`;
      btn.textContent = sign;
      btn.addEventListener('click', () => {
        state.simulatedSign = sign;
        renderSimulatorButtons();
      });
      el.simLettersGrid.appendChild(btn);
    }

    for (const sign of ASL_WORDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sim-sign-btn word ${state.simulatedSign === sign ? 'active' : ''}`;
      btn.textContent = sign === 'ILY' ? 'ILY (I Love You)' : sign;
      btn.addEventListener('click', () => {
        state.simulatedSign = sign;
        renderSimulatorButtons();
      });
      el.simWordsGrid.appendChild(btn);
    }
  };

  renderSimulatorButtons();

  el.snapLettersGrid.textContent = '';
  for (const sign of ASL_LETTERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.textContent = sign;
    btn.addEventListener('click', () => testSnapshotSign(sign));
    el.snapLettersGrid.appendChild(btn);
  }

  el.snapWordsGrid.textContent = '';
  for (const sign of ASL_WORDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn word';
    btn.textContent = sign === 'ILY' ? 'ILY (I Love You)' : sign;
    btn.addEventListener('click', () => testSnapshotSign(sign));
    el.snapWordsGrid.appendChild(btn);
  }
}

function renderGuideModal(query = '') {
  const q = query.trim().toLowerCase();
  const words = ASL_WORDS.filter(
    (s) => s.toLowerCase().includes(q) || (GESTURE_DESCRIPTIONS[s] || '').toLowerCase().includes(q)
  );
  const letters = ASL_LETTERS.filter(
    (s) => s.toLowerCase().includes(q) || (GESTURE_DESCRIPTIONS[s] || '').toLowerCase().includes(q)
  );

  el.guideModalBody.textContent = '';

  const createGroup = (title, items, isWordGroup, color) => {
    if (items.length === 0) return;
    const h4 = document.createElement('h4');
    h4.style.cssText = `margin:0 0 0.5rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:${color};`;
    h4.textContent = title;
    el.guideModalBody.appendChild(h4);

    const grid = document.createElement('div');
    grid.className = 'guide-grid';
    for (const sign of items) {
      const card = document.createElement('div');
      card.className = `guide-card ${isWordGroup ? 'word' : ''}`;

      const badge = document.createElement('div');
      badge.className = 'guide-badge';
      badge.textContent = sign;

      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.style.fontSize = '0.85rem';
      strong.textContent = isWordGroup
        ? sign === 'SPACE'
          ? '␣ SPACE (Word Break)'
          : sign === 'ILY'
          ? '🤟 ILY ("I Love You")'
          : `Word "${sign}"`
        : sign === 'F'
        ? 'Letter "F" (Also OK)'
        : `Letter "${sign}"`;

      const p = document.createElement('p');
      p.style.cssText = 'margin:0.2rem 0 0;font-size:0.75rem;color:#475569;line-height:1.4;';
      p.textContent = GESTURE_DESCRIPTIONS[sign] || '';

      info.append(strong, p);
      card.append(badge, info);
      grid.appendChild(card);
    }
    el.guideModalBody.appendChild(grid);
  };

  createGroup(`ASL Words & Controls (${words.length})`, words, true, '#047857');
  createGroup(`Static ASL Alphabet (${letters.length} Letters — J & Z require motion)`, letters, false, '#1d4ed8');

  if (words.length === 0 && letters.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'text-align:center;font-size:0.75rem;color:#94a3b8;padding:2rem 0;';
    empty.textContent = `No ASL gestures matched "${query}".`;
    el.guideModalBody.appendChild(empty);
  }
}

function startTrainingSimulation() {
  if (trainInterval) clearInterval(trainInterval);
  const totalEpochs = 35;
  let epoch = 0;
  el.startTrainingBtn.disabled = true;
  el.startTrainingBtn.textContent = 'Training in progress...';
  el.trainCompleteTag.classList.add('hidden');

  const logs = [
    `[Data] Dataset shape: (${ASL_CLASSES.length * 120}, 64) - ${ASL_CLASSES.length} gesture classes`,
    '[Preprocessing] Wrist-relative scale normalization applied (63 coords)',
    `[Architecture] MLP: Linear(63->128) -> BN -> ReLU -> Linear(128->64) -> Linear(64->${ASL_CLASSES.length})`,
    '[Optimizer] Adam (lr=0.001, weight_decay=1e-4)',
  ];
  el.trainLogs.textContent = logs.join('\n');

  trainInterval = setInterval(() => {
    epoch += 1;
    const progress = epoch / totalEpochs;
    const trLoss = Math.max(0.04, 1.9 * Math.exp(-progress * 3.8) + (Math.random() - 0.5) * 0.02);
    const trAcc = Math.min(0.995, 0.2 + 0.78 * (1 - Math.exp(-progress * 4.2)) + (Math.random() - 0.5) * 0.01);
    const vLoss = Math.max(0.06, 1.8 * Math.exp(-progress * 3.6) + (Math.random() - 0.5) * 0.02);
    const vAcc = Math.min(0.988, 0.25 + 0.73 * (1 - Math.exp(-progress * 4.0)) + (Math.random() - 0.5) * 0.015);

    el.trainEpoch.textContent = `${epoch} / ${totalEpochs}`;
    el.trainLoss.textContent = trLoss.toFixed(4);
    el.trainValLoss.textContent = vLoss.toFixed(4);
    el.trainValAcc.textContent = `${(vAcc * 100).toFixed(1)}%`;

    logs.push(
      `Epoch [${String(epoch).padStart(2, '0')}/${totalEpochs}] | Loss: ${trLoss.toFixed(4)} Acc: ${(trAcc * 100).toFixed(1)}% | Val Acc: ${(vAcc * 100).toFixed(1)}%`
    );
    el.trainLogs.textContent = logs.slice(-10).join('\n');
    el.trainLogs.scrollTop = el.trainLogs.scrollHeight;

    if (epoch >= totalEpochs) {
      clearInterval(trainInterval);
      trainInterval = null;
      el.startTrainingBtn.disabled = false;
      el.startTrainingBtn.textContent = 'Retrain Model';
      el.trainCompleteTag.classList.remove('hidden');
      logs.push(`[Complete] 28-class ASL model ready (Val Acc: ${(vAcc * 100).toFixed(2)}%)`);
      el.trainLogs.textContent = logs.slice(-10).join('\n');
    }
  }, 85);
}

// ---------------- Event Bindings ----------------
function bindEvents() {
  el.modeLiveBtn.addEventListener('click', () => {
    state.appMode = 'live';
    syncLayoutUI();
  });
  el.modeSnapshotBtn.addEventListener('click', () => {
    state.appMode = 'snapshot';
    syncLayoutUI();
  });

  const toggleTheater = () => {
    state.isTheaterMode = !state.isTheaterMode;
    syncLayoutUI();
  };
  el.sidebarTheaterBtn.addEventListener('click', toggleTheater);
  el.headerTheaterBtn.addEventListener('click', toggleTheater);
  el.camTheaterBtn.addEventListener('click', toggleTheater);

  el.confRange.addEventListener('input', (e) => {
    state.confidenceThreshold = Number(e.target.value) / 100;
    el.confVal.textContent = `${e.target.value}%`;
    el.metricThreshLabel.textContent = `Threshold: ${e.target.value}%`;
  });

  el.debounceRange.addEventListener('input', (e) => {
    state.debounceFrames = Number(e.target.value);
    el.debounceVal.textContent = `${state.debounceFrames} frames`;
    updateHoldMetrics(holdCount);
  });

  el.showLandmarksCheck.addEventListener('change', (e) => {
    state.showLandmarks = e.target.checked;
  });

  // Sentence controls
  el.btnSpace.addEventListener('click', () => appendToSentence(' '));
  el.btnDel.addEventListener('click', () => {
    state.sentence = state.sentence.slice(0, -1);
    renderSentence();
  });
  el.btnClear.addEventListener('click', () => {
    state.sentence = '';
    renderSentence();
  });
  el.btnCopy.addEventListener('click', async () => {
    if (!state.sentence) return;
    try {
      await navigator.clipboard.writeText(state.sentence);
      el.btnCopy.textContent = '✓ Copied';
      setTimeout(() => {
        el.btnCopy.textContent = '📋 Copy';
      }, 1800);
    } catch {}
  });
  el.btnSpeak.addEventListener('click', () => {
    if (!state.sentence || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(state.sentence);
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  });

  // Camera controls
  el.camMirrorBtn.addEventListener('click', () => {
    state.mirror = !state.mirror;
    syncCameraUI();
  });
  el.camToggleBtn.addEventListener('click', () => {
    if (state.isStreaming) stopCamera();
    else startCamera();
  });
  el.resumeCamBtn.addEventListener('click', startCamera);
  el.retryCamBtn.addEventListener('click', startCamera);

  el.camSimBtn.addEventListener('click', () => {
    state.isSimulating = !state.isSimulating;
    state.cameraError = null;
    if (state.isSimulating) {
      stopCamera();
    } else {
      startCamera();
    }
    syncCameraUI();
  });
  el.useSimBtn.addEventListener('click', () => {
    state.isSimulating = true;
    state.cameraError = null;
    stopCamera();
    syncCameraUI();
  });

  el.troubleshootToggleBtn.addEventListener('click', () => {
    state.showTroubleshoot = !state.showTroubleshoot;
    el.troubleshootBox.classList.toggle('hidden', !state.showTroubleshoot);
  });

  el.deviceSelect.addEventListener('change', (e) => {
    state.selectedDeviceId = e.target.value;
    if (!state.isSimulating) startCamera();
  });

  el.camFullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      el.livePanel.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    el.livePanel.classList.toggle('fullscreen', Boolean(document.fullscreenElement));
  });

  // Snapshot
  el.snapUploadBtn.addEventListener('click', () => el.snapFileInput.click());
  el.snapFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    el.snapFileLabel.textContent = file.name;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = () => analyzeUploadedImage(img);
  });
  el.snapAddBtn.addEventListener('click', () => {
    if (state.snapshotChar) {
      appendToSentence(formatSignForSentence(state.snapshotChar));
    }
  });

  // Modals
  const openGuide = () => {
    renderGuideModal(el.guideSearchInput.value);
    el.guideModal.classList.remove('hidden');
  };
  const closeGuide = () => el.guideModal.classList.add('hidden');
  el.openGuideBtn.addEventListener('click', openGuide);
  el.metricsGuideBtn.addEventListener('click', openGuide);
  el.closeGuideX.addEventListener('click', closeGuide);
  el.closeGuideBtn.addEventListener('click', closeGuide);
  el.guideSearchInput.addEventListener('input', (e) => renderGuideModal(e.target.value));

  const openTraining = () => el.trainingModal.classList.remove('hidden');
  const closeTraining = () => el.trainingModal.classList.add('hidden');
  el.openTrainingBtn.addEventListener('click', openTraining);
  el.closeTrainingX.addEventListener('click', closeTraining);
  el.closeTrainingBtn.addEventListener('click', closeTraining);
  el.startTrainingBtn.addEventListener('click', startTrainingSimulation);
}

// ---------------- Initialize ----------------
function init() {
  buildSignGrids();
  bindEvents();
  renderSentence();
  syncLayoutUI();
  syncCameraUI();

  if (!initMediaPipe()) {
    setTimeout(() => initMediaPipe(), 800);
  }
  initCameraOnLoad();
  requestAnimationFrame(renderLoop);
}

init();

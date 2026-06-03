import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs";

// --- Application State ---
const state = {
  activeSpell: 'sparkles', // 'shield', 'draw', 'portal', 'sparkles'
  activeTheme: 'orange',  // 'orange', 'crimson', 'blue', 'purple'
  scaleSize: 1.0,
  scaleSpeed: 1.0,
  sparkDensity: 70,
  webcamOpacity: 0.45,
  mirrorEnabled: true,
  soundEnabled: false,
  confidenceThreshold: 0.5,
  
  // Hand tracking
  handLandmarker: null,
  cameraStream: null,
  handsDetected: 0,
  lastFrameTime: performance.now(),
  fps: 0,
  
  // Drawing mode memory
  strokes: [], // Array of strokes: stroke = { points: [{x, y, age}], theme }
  isDrawing: false,
  lastDrawPos: null
};

// --- Theme Colors ---
const THEMES = {
  orange: { r: 255, g: 106, b: 0,   hex: '#ff6a00', dark: '#b34a00' },
  crimson: { r: 255, g: 0,   b: 68,  hex: '#ff0044', dark: '#880022' },
  blue:   { r: 0,   g: 191, b: 255, hex: '#00bfff', dark: '#0077cc' },
  purple: { r: 189, g: 0,   b: 255, hex: '#bd00ff', dark: '#7700cc' }
};

// Runes characters for Eldritch Shield
const RUNES = "᚛᚜ᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛋᛏᛒᛖᛗᛘᛚᛜᛞᛟ".split('');

// --- DOM Cache ---
const el = {
  loadingOverlay: document.getElementById('loading_overlay'),
  loadingStatus: document.getElementById('loading_status'),
  flashEffect: document.getElementById('flash_effect'),
  webcam: document.getElementById('webcam'),
  canvas: document.getElementById('output_canvas'),
  instruction: document.getElementById('spell_instruction'),
  fps: document.getElementById('fps_counter'),
  btnSnapshot: document.getElementById('btn_snapshot'),
  btnClear: document.getElementById('btn_clear'),
  toggleMirror: document.getElementById('toggle_mirror'),
  toggleSound: document.getElementById('toggle_sound'),
  
  // Sliders
  paramSize: document.getElementById('param_size'),
  paramSpeed: document.getElementById('param_speed'),
  paramSparks: document.getElementById('param_sparks'),
  paramOpacity: document.getElementById('param_opacity'),
  paramConfidence: document.getElementById('param_confidence'),
  
  // Value displays
  valSize: document.getElementById('val_size'),
  valSpeed: document.getElementById('val_speed'),
  valSparks: document.getElementById('val_sparks'),
  valOpacity: document.getElementById('val_opacity'),
  valConfidence: document.getElementById('val_confidence'),
};

const ctx = el.canvas.getContext('2d');

// --- Web Audio Mystic Synth ---
let audioCtx = null;
let humOscillator = null;
let humGain = null;
let humFilter = null;
let crackleSource = null;
let crackleGain = null;

function initAudio() {
  if (audioCtx) return;
  
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // 1. Magical Hum Synth
    humOscillator = audioCtx.createOscillator();
    humOscillator.type = 'sawtooth';
    humOscillator.frequency.value = 85; // Low bass hum
    
    humFilter = audioCtx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.Q.value = 8;
    humFilter.frequency.value = 120;
    
    humGain = audioCtx.createGain();
    humGain.gain.value = 0;
    
    humOscillator.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(audioCtx.destination);
    humOscillator.start();
    
    // 2. Crackling Magic Spark Synth (White Noise Generator)
    const bufferSize = audioCtx.sampleRate * 2.0; // 2 seconds of unique noise
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseBuffer = audioCtx.createBufferSource();
    noiseBuffer.buffer = buffer;
    noiseBuffer.loop = true;
    
    const crackleFilter = audioCtx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1800;
    crackleFilter.Q.value = 5;
    
    crackleGain = audioCtx.createGain();
    crackleGain.gain.value = 0;
    
    noiseBuffer.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(audioCtx.destination);
    noiseBuffer.start();
    
    crackleSource = noiseBuffer;
  } catch (err) {
    console.error("Failed to initialize Web Audio:", err);
  }
}

function updateAudioNodes(handSpeed, handHeight) {
  if (!state.soundEnabled || !audioCtx) return;
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // Base Hum frequency modulated by hand height (0.0 to 1.0)
  // height is 0 (top) to 1 (bottom) from MediaPipe, so invert it
  const heightFactor = 1.0 - handHeight;
  const baseFreq = 65 + heightFactor * 120; // 65Hz to 185Hz
  humOscillator.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.1);
  
  // Hum volume and filter cutoff modulated by movement speed
  const speedFactor = Math.min(handSpeed * 10, 1.0); // normalize speed
  const humVolume = 0.08 + speedFactor * 0.15;
  const filterCutoff = 100 + speedFactor * 400; // open filter as speed increases
  
  humGain.gain.setTargetAtTime(humVolume, audioCtx.currentTime, 0.15);
  humFilter.frequency.setTargetAtTime(filterCutoff, audioCtx.currentTime, 0.1);
  
  // Crackle sound gets louder during fast movements or portals
  let crackleVolume = 0;
  if (state.activeSpell === 'portal') {
    crackleVolume = 0.06;
  } else if (state.activeSpell === 'draw' && state.isDrawing) {
    crackleVolume = 0.04 + speedFactor * 0.08;
  } else {
    crackleVolume = speedFactor * 0.07;
  }
  crackleGain.gain.setTargetAtTime(crackleVolume, audioCtx.currentTime, 0.1);
}

function muteAudio() {
  if (humGain) humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
  if (crackleGain) crackleGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
}

// --- Particle Engine ---
class Particle {
  constructor(x, y, vx, vy, color, size, maxLife, gravity = 0, fadeSpeed = 0.015) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color; // {r, g, b}
    this.size = size;
    this.life = 1.0;
    this.maxLife = maxLife;
    this.gravity = gravity;
    this.fadeSpeed = fadeSpeed;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.15;
  }
  
  update(timeStep) {
    this.x += this.vx * timeStep;
    this.y += this.vy * timeStep;
    this.vy += this.gravity * timeStep;
    this.life -= this.fadeSpeed * timeStep;
    this.angle += this.spin * timeStep;
  }
  
  draw(canvasCtx) {
    if (this.life <= 0) return;

    canvasCtx.save();
    canvasCtx.translate(this.x, this.y);
    canvasCtx.rotate(this.angle);

    const colorStr = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.life})`;
    
    // Draw 4-point magical spark star
    canvasCtx.fillStyle = colorStr;
    canvasCtx.shadowColor = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
    canvasCtx.shadowBlur = this.size * 3;
    
    canvasCtx.beginPath();
    const w = this.size;
    const h = this.size;
    canvasCtx.moveTo(0, -h);
    canvasCtx.lineTo(w * 0.18, -h * 0.18);
    canvasCtx.lineTo(w, 0);
    canvasCtx.lineTo(w * 0.18, h * 0.18);
    canvasCtx.lineTo(0, h);
    canvasCtx.lineTo(-w * 0.18, h * 0.18);
    canvasCtx.lineTo(-w, 0);
    canvasCtx.lineTo(-w * 0.18, -h * 0.18);
    canvasCtx.closePath();
    canvasCtx.fill();
    
    // Inner white hot core
    canvasCtx.shadowBlur = 0;
    canvasCtx.fillStyle = `rgba(255, 255, 255, ${this.life * 0.85})`;
    canvasCtx.beginPath();
    canvasCtx.arc(0, 0, this.size * 0.25, 0, Math.PI * 2);
    canvasCtx.fill();
    
    canvasCtx.restore();
  }
}

let particles = [];

function spawnSpark(x, y, vx, vy, gravity = 0.05, life = 1.0, count = 1) {
  const color = THEMES[state.activeTheme];
  const sizeMultiplier = state.scaleSize;
  
  for (let i = 0; i < count; i++) {
    const size = (3 + Math.random() * 6) * sizeMultiplier;
    // Add randomness to velocities
    const randVx = vx + (Math.random() - 0.5) * 1.8;
    const randVy = vy + (Math.random() - 0.5) * 1.8;
    // Decay rate
    const fadeSpeed = 0.01 + Math.random() * 0.02;
    particles.push(new Particle(x, y, randVx, randVy, color, size, life, gravity, fadeSpeed));
  }
}

// --- Gesture Detection Math ---
// Euclidean distance in 3D
function getDistance(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
}

// Determine if a hand is wide open (palm flat towards camera)
function isOpenHand(hand) {
  const wrist = hand[0];
  const indexPIP = hand[6];
  const indexTip = hand[8];
  const middlePIP = hand[10];
  const middleTip = hand[12];
  const ringPIP = hand[14];
  const ringTip = hand[16];
  const pinkyPIP = hand[18];
  const pinkyTip = hand[20];
  
  // Calculate tip-to-wrist vs PIP-to-wrist distances
  const indexOpen = getDistance(indexTip, wrist) > getDistance(indexPIP, wrist);
  const middleOpen = getDistance(middleTip, wrist) > getDistance(middlePIP, wrist);
  const ringOpen = getDistance(ringTip, wrist) > getDistance(ringPIP, wrist);
  const pinkyOpen = getDistance(pinkyTip, wrist) > getDistance(pinkyPIP, wrist);
  
  return indexOpen && middleOpen && ringOpen && pinkyOpen;
}

// Determine if a hand is pointing index finger only
function isIndexPointing(hand) {
  const wrist = hand[0];
  
  // Fingertips
  const indexTip = hand[8];
  const middleTip = hand[12];
  const ringTip = hand[16];
  const pinkyTip = hand[20];
  
  // Knuckles
  const indexPIP = hand[6];
  const middlePIP = hand[10];
  const ringPIP = hand[14];
  const pinkyPIP = hand[18];
  
  // Index open, others folded
  const indexOpen = getDistance(indexTip, wrist) > getDistance(indexPIP, wrist) * 1.1;
  const middleFolded = getDistance(middleTip, wrist) < getDistance(middlePIP, wrist);
  const ringFolded = getDistance(ringTip, wrist) < getDistance(ringPIP, wrist);
  const pinkyFolded = getDistance(pinkyTip, wrist) < getDistance(pinkyPIP, wrist);
  
  return indexOpen && middleFolded && ringFolded && pinkyFolded;
}

// Track velocity of the hand center to trigger effects
let prevHandCenter = null;
let handVelocity = 0;

function calculateHandMovement(handCenter) {
  if (!prevHandCenter) {
    prevHandCenter = { ...handCenter };
    return 0;
  }
  
  // Normalized delta
  const dx = handCenter.x - prevHandCenter.x;
  const dy = handCenter.y - prevHandCenter.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  
  // Smooth velocity
  handVelocity = handVelocity * 0.8 + dist * 0.2;
  
  prevHandCenter = { ...handCenter };
  return handVelocity;
}

// --- Procedural Magical Drawing Code ---

let shieldRotation = 0;

function drawEldritchShield(palmCenter, size, color) {
  const radius = size * 165 * state.scaleSize;
  const speed = state.scaleSpeed;
  shieldRotation += 0.012 * speed;
  
  ctx.save();
  ctx.translate(palmCenter.x, palmCenter.y);
  
  const glowHex = color.hex;
  ctx.shadowBlur = 18;
  ctx.shadowColor = glowHex;
  ctx.strokeStyle = glowHex;
  ctx.fillStyle = glowHex;
  ctx.lineWidth = 2.5;
  
  // Layer 1: Spin Clockwise (Outer ring)
  ctx.save();
  ctx.rotate(shieldRotation);
  
  // Outer double circles
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
  ctx.stroke();
  
  // Hexagon / 12-point star pattern
  for (let i = 0; i < 12; i++) {
    const angle1 = (i / 12) * Math.PI * 2;
    const angle2 = ((i + 4) / 12) * Math.PI * 2; // offset for star points
    const x1 = Math.cos(angle1) * (radius - 6);
    const y1 = Math.sin(angle1) * (radius - 6);
    const x2 = Math.cos(angle2) * (radius - 6);
    const y2 = Math.sin(angle2) * (radius - 6);
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  
  // Spawn outer ring sparks
  if (Math.random() < 0.8) {
    const randomAngle = Math.random() * Math.PI * 2;
    const sparkX = palmCenter.x + Math.cos(randomAngle + shieldRotation) * radius;
    const sparkY = palmCenter.y + Math.sin(randomAngle + shieldRotation) * radius;
    
    // velocity tangent to the circle
    const tangentVx = -Math.sin(randomAngle) * (2 * speed);
    const tangentVy = Math.cos(randomAngle) * (2 * speed);
    spawnSpark(sparkX, sparkY, tangentVx, tangentVy, 0.04, 0.7, 1);
  }
  
  ctx.restore();
  
  // Layer 2: Spin Counter-Clockwise (Ancient Runes ring)
  ctx.save();
  ctx.rotate(-shieldRotation * 0.7);
  
  // Mid circle limits for runes
  const runeRadius = radius * 0.78;
  ctx.beginPath();
  ctx.arc(0, 0, runeRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, runeRadius - 14, 0, Math.PI * 2);
  ctx.stroke();
  
  // Draw rune characters along circle
  ctx.font = `bold ${Math.max(10, Math.floor(13 * state.scaleSize))}px Orbitron, 'Cinzel Decorative', cursive`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const numRunes = 16;
  for (let i = 0; i < numRunes; i++) {
    const angle = (i / numRunes) * Math.PI * 2;
    const rx = Math.cos(angle) * (runeRadius - 7);
    const ry = Math.sin(angle) * (runeRadius - 7);
    
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle + Math.PI / 2); // point base towards center
    const runeChar = RUNES[(Math.floor(i + shieldRotation * 2)) % RUNES.length];
    ctx.fillText(runeChar, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  
  // Layer 3: Spin Clockwise (Inner Sacred Geometry)
  ctx.save();
  ctx.rotate(shieldRotation * 1.5);
  const innerRadius = radius * 0.55;
  
  // Draw complex overlapping squares
  ctx.beginPath();
  ctx.rect(-innerRadius/Math.sqrt(2), -innerRadius/Math.sqrt(2), innerRadius * Math.sqrt(2), innerRadius * Math.sqrt(2));
  ctx.stroke();
  ctx.save();
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.rect(-innerRadius/Math.sqrt(2), -innerRadius/Math.sqrt(2), innerRadius * Math.sqrt(2), innerRadius * Math.sqrt(2));
  ctx.stroke();
  ctx.restore();
  
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius - 8, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  ctx.restore();
}

function drawSlingPortal(hand1Center, hand2Center, color) {
  // Center of portal is middle point between two hands
  const centerX = (hand1Center.x + hand2Center.x) / 2;
  const centerY = (hand1Center.y + hand2Center.y) / 2;
  
  // Radius based on distance between two hands
  const dx = hand2Center.x - hand1Center.x;
  const dy = hand2Center.y - hand1Center.y;
  const handDist = Math.sqrt(dx*dx + dy*dy);
  
  // Portal size
  const portalRadius = Math.max(50, handDist * 0.45);
  const speed = state.scaleSpeed;
  shieldRotation += 0.02 * speed;
  
  // Draw the portal portal vortex
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
  
  // 1. Draw a swirling cosmic core inside the portal
  const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, portalRadius);
  
  // Swirling color overlay
  let cosmicTheme = { r: 100, g: 0, b: 200 }; // deep cosmic purple/pink
  if (state.activeTheme === 'blue') cosmicTheme = { r: 189, g: 0, b: 255 }; // purple
  else if (state.activeTheme === 'purple') cosmicTheme = { r: 0, g: 191, b: 255 }; // cyan
  
  grad.addColorStop(0, `rgba(5, 4, 9, 0.9)`);
  grad.addColorStop(0.6, `rgba(${cosmicTheme.r}, ${cosmicTheme.g}, ${cosmicTheme.b}, 0.25)`);
  grad.addColorStop(0.9, `rgba(${color.r}, ${color.g}, ${color.b}, 0.2)`);
  grad.addColorStop(1.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(centerX, centerY, portalRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // 2. Draw rotating fire portal ring
  const numSparks = Math.floor(state.sparkDensity * 0.7);
  for (let i = 0; i < numSparks; i++) {
    // Distribute particles around portal ring
    const angle = (i / numSparks) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    
    // Add turbulence
    const radiusNoise = (Math.random() - 0.5) * (portalRadius * 0.1);
    const r = portalRadius + radiusNoise;
    
    const px = centerX + Math.cos(angle) * r;
    const py = centerY + Math.sin(angle) * r;
    
    // Tangential speed + outward explosion velocity
    const tangentV = 3.5 * speed;
    const vx = -Math.sin(angle) * tangentV + (Math.random() - 0.2) * 1.5;
    const vy = Math.cos(angle) * tangentV + (Math.random() - 0.2) * 1.5;
    
    spawnSpark(px, py, vx, vy, -0.01, 0.9, 1);
  }
  
  ctx.restore();
}

function processDrawing(handLandmark) {
  const indexTip = handLandmark[8]; // Index tip
  const mappedX = indexTip.x * el.canvas.width;
  const mappedY = indexTip.y * el.canvas.height;
  
  if (!state.isDrawing) {
    state.isDrawing = true;
    // Start new stroke
    state.strokes.push({
      points: [{ x: mappedX, y: mappedY, age: 1.0 }],
      theme: state.activeTheme
    });
  } else {
    // Add to current active stroke
    const activeStroke = state.strokes[state.strokes.length - 1];
    const lastPt = activeStroke.points[activeStroke.points.length - 1];
    
    // Calculate distance to filter jitter
    const dist = Math.sqrt(Math.pow(mappedX - lastPt.x, 2) + Math.pow(mappedY - lastPt.y, 2));
    if (dist > 3) {
      activeStroke.points.push({ x: mappedX, y: mappedY, age: 1.0 });
      
      // Spawn sparks along the drawn line segment for magic effect!
      const steps = Math.floor(dist / 6);
      for (let s = 1; s <= steps; s++) {
        const ratio = s / steps;
        const sparkX = lastPt.x + (mappedX - lastPt.x) * ratio;
        const sparkY = lastPt.y + (mappedY - lastPt.y) * ratio;
        
        // Sparks float gently down or fly outwards
        const vx = (Math.random() - 0.5) * 1.5;
        const vy = (Math.random() - 0.1) * 1.5;
        spawnSpark(sparkX, sparkY, vx, vy, 0.05, 0.8, 1);
      }
    }
  }
}

// Draw existing lines on canvas with glowing shadows
function drawSpellCasterLines() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 5 * state.scaleSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (let s = 0; s < state.strokes.length; s++) {
    const stroke = state.strokes[s];
    const points = stroke.points;
    if (points.length < 2) continue;
    
    const themeColor = THEMES[stroke.theme];
    ctx.shadowColor = themeColor.hex;
    
    // Draw stroke line segments with fading segments
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const age = (p1.age + p2.age) / 2;
      
      if (age <= 0) continue;
      
      ctx.strokeStyle = `rgba(${themeColor.r}, ${themeColor.g}, ${themeColor.b}, ${age})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Fade strokes slowly over time
function updateStrokesAge() {
  const decaySpeed = 0.005 * state.scaleSpeed;
  
  for (let s = state.strokes.length - 1; s >= 0; s--) {
    const stroke = state.strokes[s];
    let activePoints = 0;
    
    for (let p = 0; p < stroke.points.length; p++) {
      stroke.points[p].age -= decaySpeed;
      if (stroke.points[p].age > 0) {
        activePoints++;
      }
    }
    
    // Remove strokes that have fully dissolved
    if (activePoints === 0) {
      state.strokes.splice(s, 1);
    }
  }
}

// --- Main Frame Processing ---

function processResults(results) {
  state.handsDetected = results.landmarks ? results.landmarks.length : 0;
  
  // Fade canvas to black each frame — creates motion-blur trails.
  // source-over + low alpha = gradual darkening; 'lighter' for all effects
  // gives true additive glow that works regardless of canvas alpha state.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#050409';
  ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
  ctx.globalAlpha = 1.0;

  // Additive blend: bright colors on dark background = guaranteed glow visibility
  ctx.globalCompositeOperation = 'lighter';
  
  // Draw hand-specific magic spells
  if (state.handsDetected > 0) {
    el.instruction.style.display = 'none'; // Hide default helper
    
    // Track primary hand centers for sound velocity calculations
    let primaryHandCenter = null;
    let handHeight = 0.5;
    
    if (state.activeSpell === 'portal' && state.handsDetected >= 2) {
      // SLING PORTAL MODE (Requires 2 hands)
      const hand1 = results.landmarks[0];
      const hand2 = results.landmarks[1];
      
      const center1 = {
        x: hand1[9].x * el.canvas.width,
        y: hand1[9].y * el.canvas.height
      };
      const center2 = {
        x: hand2[9].x * el.canvas.width,
        y: hand2[9].y * el.canvas.height
      };
      
      drawSlingPortal(center1, center2, THEMES[state.activeTheme]);
      
      // Audio trigger
      primaryHandCenter = center1;
      handHeight = (hand1[9].y + hand2[9].y) / 2;
      calculateHandMovement(center1);
      
    } else {
      // 1-Handed Spells
      for (let h = 0; h < results.landmarks.length; h++) {
        const landmarks = results.landmarks[h];
        const palmCenter = {
          x: landmarks[9].x * el.canvas.width,
          y: landmarks[9].y * el.canvas.height
        };
        
        // Save first hand for audio controls
        if (h === 0) {
          primaryHandCenter = palmCenter;
          handHeight = landmarks[9].y;
          calculateHandMovement(palmCenter);
        }
        
        // Draw hand tracking bones as a subtle magic skeleton
        drawMagicSkeletalGlove(landmarks);
        
        if (state.activeSpell === 'shield') {
          // ELDRITCH SHIELD MODE
          if (isOpenHand(landmarks)) {
            // Palm size estimate based on distance from wrist (0) to knuckles (9)
            const wrist = landmarks[0];
            const mcp = landmarks[9];
            const size = Math.sqrt(Math.pow(wrist.x-mcp.x, 2) + Math.pow(wrist.y-mcp.y, 2) + Math.pow(wrist.z-mcp.z, 2));
            
            drawEldritchShield(palmCenter, size, THEMES[state.activeTheme]);
            
            // Extra sparks flying out from open hand center
            if (Math.random() < 0.25) {
              const vx = (Math.random() - 0.5) * 3;
              const vy = (Math.random() - 0.5) * 3;
              spawnSpark(palmCenter.x, palmCenter.y, vx, vy, 0.05, 0.9, 2);
            }
          }
          
        } else if (state.activeSpell === 'draw') {
          // SPELL CASTER (FINGER PAINTING)
          if (isIndexPointing(landmarks)) {
            processDrawing(landmarks);
          } else {
            // Stop drawing if hand layout changes
            state.isDrawing = false;
          }
          
        } else if (state.activeSpell === 'sparkles') {
          // COSMIC SPARKLES MODE — sparks from all 5 fingertips + palm
          const fingertips = [4, 8, 12, 16, 20];
          const density = state.sparkDensity / 100;

          fingertips.forEach((tipIdx) => {
            const tip = landmarks[tipIdx];
            const tx = tip.x * el.canvas.width;
            const ty = tip.y * el.canvas.height;
            const count = Math.random() < density ? 2 : 1;
            spawnSpark(tx, ty, (Math.random() - 0.5) * 2.5, (Math.random() - 0.8) * 3, 0.02, 0.95, count);
          });

          // Extra burst from palm center
          if (Math.random() < density * 0.5) {
            spawnSpark(palmCenter.x, palmCenter.y,
              (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.01, 0.8, 2);
          }
        }
      }
    }
    
    // Update Web Audio Synth values based on movement
    if (primaryHandCenter && state.soundEnabled) {
      updateAudioNodes(handVelocity, handHeight);
    }
    
  } else {
    // No hands detected
    state.isDrawing = false;
    prevHandCenter = null;
    handVelocity = 0;
    
    updateInstruction(state.activeSpell);
    
    if (state.soundEnabled) {
      muteAudio();
    }
  }
  
  // Render persistent drawing strokes
  drawSpellCasterLines();
  updateStrokesAge();
  
  // Render & Update Particle engine
  updateAndDrawParticles();
  
  // Update FPS count
  updateFPS();
}

// Draw glowing magic lines over hand bones
function drawMagicSkeletalGlove(handLandmarks) {
  const color = THEMES[state.activeTheme];
  ctx.save();
  ctx.shadowBlur = 14;
  ctx.shadowColor = color.hex;
  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.75)`;
  ctx.lineWidth = 2.5 * state.scaleSize;
  
  // Fingertips chains mapping
  const connections = [
    [0, 1, 2, 3, 4],        // Thumb
    [0, 5, 6, 7, 8],        // Index
    [0, 9, 10, 11, 12],     // Middle
    [0, 13, 14, 15, 16],    // Ring
    [0, 17, 18, 19, 20],    // Pinky
    [5, 9, 13, 17]          // Knuckle base connector
  ];
  
  // Draw connectors
  connections.forEach((chain) => {
    ctx.beginPath();
    for (let i = 0; i < chain.length; i++) {
      const pt = handLandmarks[chain[i]];
      const cx = pt.x * el.canvas.width;
      const cy = pt.y * el.canvas.height;
      if (i === 0) {
        ctx.moveTo(cx, cy);
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();
  });
  
  // Draw subtle joint core circles
  ctx.fillStyle = `rgba(255, 255, 255, 0.45)`;
  for (let i = 0; i < handLandmarks.length; i++) {
    const pt = handLandmarks[i];
    ctx.beginPath();
    ctx.arc(pt.x * el.canvas.width, pt.y * el.canvas.height, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function updateAndDrawParticles() {
  const timeStep = 1.0;
  
  // Render particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update(timeStep);
    p.draw(ctx);
    
    // Remove dead particles
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
  
  // Cap max particles to prevent lagging
  if (particles.length > 1500) {
    particles.splice(0, particles.length - 1500);
  }
}

// FPS counter calculations
function updateFPS() {
  const now = performance.now();
  const delta = now - state.lastFrameTime;
  state.lastFrameTime = now;
  
  const currentFps = Math.round(1000 / delta);
  // Moving average
  state.fps = Math.round(state.fps * 0.9 + currentFps * 0.1);
  
  el.fps.textContent = `FPS: ${state.fps} | Hands: ${state.handsDetected} | Sparks: ${particles.length}`;
}

// --- MediaPipe HandLandmarker Initializer ---

async function initializeMediaPipe() {
  try {
    el.loadingStatus.textContent = "Loading WebAssembly vision binaries...";
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
    );

    const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    const baseOpts = {
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: state.confidenceThreshold,
      minHandPresenceConfidence: state.confidenceThreshold,
      minHandTrackingConfidence: state.confidenceThreshold
    };

    el.loadingStatus.textContent = "Downloading spell model (hand_landmarker)...";
    try {
      state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...baseOpts,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" }
      });
    } catch {
      el.loadingStatus.textContent = "GPU unavailable — switching to CPU mode...";
      state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...baseOpts,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" }
      });
    }

    el.loadingStatus.textContent = "Accessing device camera stream...";
    await startCamera();

    el.loadingOverlay.style.opacity = '0';
    setTimeout(() => { el.loadingOverlay.style.display = 'none'; }, 1000);

  } catch (err) {
    el.loadingStatus.innerHTML = `<span style="color: var(--color-crimson)">Ritual Failed: ${err.message}</span>`;
    console.error("Initialization error:", err);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available. Open this page over HTTPS or localhost.");
  }

  const constraints = {
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false
  };

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (err.name === 'NotAllowedError')
      throw new Error("Camera permission denied — allow camera access in your browser and refresh.");
    if (err.name === 'NotFoundError')
      throw new Error("No camera detected — connect a webcam and try again.");
    if (err.name === 'NotReadableError')
      throw new Error("Camera is in use by another app — close it and refresh.");
    throw err;
  }
  el.webcam.srcObject = state.cameraStream;
  
  // Wait for video metadata to read true sizes
  return new Promise((resolve) => {
    el.webcam.onloadedmetadata = () => {
      // Sync canvas dimensions
      resizeCanvas();
      resolve();
      
      // Start frame predict loop
      requestAnimationFrame(predictWebcamLoop);
    };
  });
}

function resizeCanvas() {
  el.canvas.width  = el.canvas.clientWidth  || window.innerWidth;
  el.canvas.height = el.canvas.clientHeight || window.innerHeight;
  // Fill solid black immediately so 'lighter' composite has a dark base from frame 1
  ctx.fillStyle = '#050409';
  ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
}

window.addEventListener('resize', resizeCanvas);

let lastVideoTime = -1;

async function predictWebcamLoop() {
  // Only detect when video has updated frames
  if (el.webcam.currentTime !== lastVideoTime && el.webcam.readyState >= 3) {
    lastVideoTime = el.webcam.currentTime;
    
    try {
      const startTimeMs = performance.now();
      const results = state.handLandmarker.detectForVideo(el.webcam, startTimeMs);
      processResults(results);
    } catch (e) {
      console.warn("MediaPipe model execution error:", e);
    }
  }
  
  requestAnimationFrame(predictWebcamLoop);
}

// --- UI Binding Listeners ---

// Spell Switchers
document.querySelectorAll('.spell-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.spell-btn').forEach(b => b.classList.remove('active'));
    
    const targetBtn = e.currentTarget;
    targetBtn.classList.add('active');
    state.activeSpell = targetBtn.dataset.spell;
    state.isDrawing = false;
    updateInstruction(state.activeSpell);
  });
});

// Theme Selectors
document.querySelectorAll('.theme-dot').forEach(dot => {
  dot.addEventListener('click', (e) => {
    document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
    
    const targetDot = e.currentTarget;
    targetDot.classList.add('active');
    state.activeTheme = targetDot.dataset.theme;
    
    // Update CSS variables dynamically
    const selectedColor = THEMES[state.activeTheme];
    document.documentElement.style.setProperty('--active-color', selectedColor.hex);
    document.documentElement.style.setProperty('--active-dark', selectedColor.dark);
    document.documentElement.style.setProperty('--active-glow', `rgba(${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b}, 0.8)`);
    document.documentElement.style.setProperty('--active-subtle', `rgba(${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b}, 0.2)`);
  });
});

// Slider values syncing
el.paramSize.addEventListener('input', (e) => {
  state.scaleSize = parseFloat(e.target.value);
  el.valSize.textContent = `${state.scaleSize.toFixed(1)}x`;
});

el.paramSpeed.addEventListener('input', (e) => {
  state.scaleSpeed = parseFloat(e.target.value);
  el.valSpeed.textContent = `${state.scaleSpeed.toFixed(1)}x`;
});

el.paramSparks.addEventListener('input', (e) => {
  state.sparkDensity = parseInt(e.target.value);
  el.valSparks.textContent = `${state.sparkDensity}%`;
});

el.paramOpacity.addEventListener('input', (e) => {
  state.webcamOpacity = parseFloat(e.target.value) / 100;
  el.valOpacity.textContent = `${e.target.value}%`;
  el.webcam.style.opacity = state.webcamOpacity;
});

el.paramConfidence.addEventListener('input', (e) => {
  state.confidenceThreshold = parseFloat(e.target.value);
  el.valConfidence.textContent = state.confidenceThreshold.toFixed(2);
  
  // Dynamically update model options
  if (state.handLandmarker) {
    state.handLandmarker.setOptions({
      minHandDetectionConfidence: state.confidenceThreshold,
      minHandPresenceConfidence: state.confidenceThreshold,
      minHandTrackingConfidence: state.confidenceThreshold
    });
  }
});

// Mirror Toggle
el.toggleMirror.addEventListener('change', (e) => {
  state.mirrorEnabled = e.target.checked;
  if (state.mirrorEnabled) {
    el.webcam.style.transform = 'scaleX(-1)';
    el.canvas.style.transform = 'scaleX(-1)';
  } else {
    el.webcam.style.transform = 'scaleX(1)';
    el.canvas.style.transform = 'scaleX(1)';
  }
});

// Audio Toggle
el.toggleSound.addEventListener('change', (e) => {
  state.soundEnabled = e.target.checked;
  if (state.soundEnabled) {
    initAudio();
  } else {
    muteAudio();
  }
});

// Clear Spell Canvas
el.btnClear.addEventListener('click', () => {
  state.strokes = [];
  particles = [];
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  
  // Show toast notification
  showToast("Spells dissolved into the ether.");
});

// Capture Snapshot (Merge camera feed + canvas drawing)
el.btnSnapshot.addEventListener('click', () => {
  try {
    // 1. Play screen flash animation
    el.flashEffect.classList.add('flash-active');
    setTimeout(() => el.flashEffect.classList.remove('flash-active'), 600);
    
    // 2. Create offscreen canvas to merge flipped video and canvas
    const mergeCanvas = document.createElement('canvas');
    mergeCanvas.width = el.canvas.width;
    mergeCanvas.height = el.canvas.height;
    const mergeCtx = mergeCanvas.getContext('2d');
    
    mergeCtx.globalCompositeOperation = 'source-over';

    // Apply mirror scale if enabled
    if (state.mirrorEnabled) {
      mergeCtx.translate(mergeCanvas.width, 0);
      mergeCtx.scale(-1, 1);
    }

    // Draw background video frames
    mergeCtx.drawImage(el.webcam, 0, 0, mergeCanvas.width, mergeCanvas.height);
    
    // Draw current canvas on top (canvas is already in coordinate-correct space)
    mergeCtx.drawImage(el.canvas, 0, 0, mergeCanvas.width, mergeCanvas.height);
    
    // 3. Export as PNG and download
    const dataUrl = mergeCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `spell_capture_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    
    showToast("Mystic scroll captured successfully!");
  } catch (err) {
    console.error("Failed to capture snapshot:", err);
    showToast("Ritual snapshot failed.");
  }
});

function updateInstruction(spell) {
  const texts = {
    shield:   "Open your palm towards the camera to summon the Eldritch Shield!",
    draw:     "Hold up only your index finger to paint magical lines!",
    portal:   "Raise BOTH hands in front of the camera to open the portal!",
    sparkles: "Raise your hands to conjure mystic cosmic energy!"
  };
  el.instruction.textContent = texts[spell] ?? texts.sparkles;
  el.instruction.style.display = 'block';
}

function showToast(msg) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// Mobile sidebar toggle
const sidebarToggle = document.getElementById('sidebar-toggle');
sidebarToggle.addEventListener('click', () => {
  const isOpen = document.body.classList.toggle('sidebar-open');
  sidebarToggle.setAttribute('aria-expanded', String(isOpen));
});

// Close sidebar when tapping the backdrop (outside the panel)
document.addEventListener('click', (e) => {
  if (
    document.body.classList.contains('sidebar-open') &&
    !document.getElementById('control_sidebar').contains(e.target) &&
    !sidebarToggle.contains(e.target)
  ) {
    document.body.classList.remove('sidebar-open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
  }
});

// Keyboard shortcuts: 1-4 switch spells, M toggles mirror
document.addEventListener('keydown', (e) => {
  const spellKeys = { '1': 'shield', '2': 'draw', '3': 'portal', '4': 'sparkles' };
  if (spellKeys[e.key]) {
    const targetSpell = spellKeys[e.key];
    document.querySelectorAll('.spell-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.spell === targetSpell);
    });
    state.activeSpell = targetSpell;
    state.isDrawing = false;
    updateInstruction(targetSpell);
    showToast(`Spell: ${targetSpell.charAt(0).toUpperCase() + targetSpell.slice(1)}`);
  }
  if (e.key === 'm' || e.key === 'M') {
    el.toggleMirror.checked = !el.toggleMirror.checked;
    el.toggleMirror.dispatchEvent(new Event('change'));
  }
});

// --- Start the Mystic App ---
initializeMediaPipe();

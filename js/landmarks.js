// Landmark utilities: 21 3D hand keypoints, wrist-relative normalization, and Canvas mesh rendering

export const LANDMARK_COUNT = 21;
export const FEATURE_DIM = 63; // 21 * 3

// Standard MediaPipe Hand skeleton connections
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base cross connections
  [5, 9], [9, 13], [13, 17],
];

export const FINGER_COLORS = {
  thumb: '#f59e0b',
  index: '#3b82f6',
  middle: '#10b981',
  ring: '#8b5cf6',
  pinky: '#ec4899',
  palm: '#06b6d4',
  wrist: '#ef4444',
};

/**
 * Normalizes 21 3D landmarks (63 values) using Wrist-Relative Scale Normalization:
 * 1. p_rel = p_i - p_0 (wrist p_0 becomes [0, 0, 0])
 * 2. d_max = max(norm(p_rel))
 * 3. p_norm = p_rel / (d_max + 1e-6)
 */
export function normalizeLandmarks(landmarks) {
  let pts = [];

  if (Array.isArray(landmarks) && landmarks.length === 63 && typeof landmarks[0] === 'number') {
    for (let i = 0; i < 21; i++) {
      pts.push({
        x: landmarks[i * 3],
        y: landmarks[i * 3 + 1],
        z: landmarks[i * 3 + 2],
      });
    }
  } else {
    pts = landmarks || [];
  }

  if (pts.length < 21) {
    return new Array(63).fill(0);
  }

  const wrist = pts[0];
  const relPoints = [];
  let maxDist = 0;

  for (let i = 0; i < 21; i++) {
    const rx = pts[i].x - wrist.x;
    const ry = pts[i].y - wrist.y;
    const rz = (pts[i].z || 0) - (wrist.z || 0);
    const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (dist > maxDist) {
      maxDist = dist;
    }
    relPoints.push({ x: rx, y: ry, z: rz });
  }

  const denom = maxDist + 1e-6;
  const normalized = [];
  for (let i = 0; i < 21; i++) {
    normalized.push(relPoints[i].x / denom);
    normalized.push(relPoints[i].y / denom);
    normalized.push(relPoints[i].z / denom);
  }

  return normalized;
}

/**
 * Computes bounding box from normalized landmarks for given canvas dimensions
 */
export function getLandmarkBoundingBox(landmarks, width, height, padding = 24) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const lm of landmarks) {
    const px = lm.x * width;
    const py = lm.y * height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(width, maxX - minX + padding * 2),
    height: Math.min(height, maxY - minY + padding * 2),
  };
}

/**
 * Draws the hand landmarks mesh, joint circles, and bounding box onto an HTML5 Canvas context
 */
export function drawHandLandmarks(ctx, landmarks, width, height, options = {}) {
  const {
    showBones = true,
    showJoints = true,
    showBBox = true,
    label = '',
    confidence = 0,
    color = '#22c55e',
  } = options;

  if (showBones) {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      if (!p1 || !p2) continue;

      const x1 = p1.x * width;
      const y1 = p1.y * height;
      const x2 = p2.x * width;
      const y2 = p2.y * height;

      let strokeColor = '#38bdf8';
      if (endIdx <= 4) strokeColor = FINGER_COLORS.thumb;
      else if (endIdx <= 8) strokeColor = FINGER_COLORS.index;
      else if (endIdx <= 12) strokeColor = FINGER_COLORS.middle;
      else if (endIdx <= 16) strokeColor = FINGER_COLORS.ring;
      else if (endIdx <= 20) strokeColor = FINGER_COLORS.pinky;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    }
  }

  if (showJoints) {
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const px = lm.x * width;
      const py = lm.y * height;

      ctx.beginPath();
      const radius = i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20 ? 6 : 4;
      ctx.arc(px, py, radius, 0, 2 * Math.PI);
      ctx.fillStyle = i === 0 ? '#ef4444' : '#ffffff';
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }
  }

  if (showBBox && label) {
    const box = getLandmarkBoundingBox(landmarks, width, height);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    const tagText = `${label} (${(confidence * 100).toFixed(0)}%)`;
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textMetrics = ctx.measureText(tagText);
    const tagWidth = textMetrics.width + 16;
    const tagHeight = 26;
    const tagY = Math.max(tagHeight + 4, box.y - 6);

    ctx.fillStyle = color;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(box.x, tagY - tagHeight, tagWidth, tagHeight, [4, 4, 0, 0]);
    } else {
      ctx.rect(box.x, tagY - tagHeight, tagWidth, tagHeight);
    }
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, box.x + 8, tagY - 7);
  }
}

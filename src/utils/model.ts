// Hand Gesture Classification Model & Feature Matching
import type { Landmark3D } from './landmarks';

export interface GesturePrediction {
  topChar: string;
  topConfidence: number;
  top3: { char: string; confidence: number }[];
}

export const ASL_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X', 'Y',
] as const;

export const ASL_WORDS = [
  'SPACE', 'ILY', 'GOOD', 'NO',
] as const;

export const ASL_CLASSES = [
  ...ASL_LETTERS,
  ...ASL_WORDS,
] as const;

export type ASLClass = typeof ASL_CLASSES[number];

export const GESTURE_DESCRIPTIONS: Record<string, string> = {
  A: 'Fist with thumb resting upright against the side of the index finger',
  B: 'Four fingers straight up pressed together with thumb tucked across palm',
  C: 'Curved fingers and thumb forming an open "C" arc',
  D: 'Index finger pointing straight up; other fingertips touch thumb tip',
  E: 'All fingers tightly curled downward with thumb tucked underneath',
  F: 'Thumb and index tips pinched together (OK sign); middle, ring, pinky straight up',
  G: 'Index finger and thumb pointing horizontally sideways; other fingers curled',
  H: 'Index and middle fingers extended together sideways; ring and pinky curled',
  I: 'Only the pinky finger extended straight up; thumb folded across palm',
  K: 'Index and middle extended upward in a V with thumb wedged between them',
  L: 'Thumb and index finger extended at a 90° right angle forming an "L"',
  M: 'Closed fist with three fingers (index, middle, ring) draped over thumb',
  N: 'Closed fist with two fingers (index, middle) draped over thumb',
  O: 'All fingertips curved inward touching the thumb tip to form an "O"',
  P: 'Index and middle fingers pointing downward with thumb between them',
  Q: 'Index finger and thumb pointing downward; other fingers curled',
  R: 'Index and middle fingers extended upward and crossed over each other',
  S: 'Tight fist with thumb crossed horizontally in front of the curled fingers',
  T: 'Closed fist with thumb tucked upward between index and middle fingers',
  U: 'Index and middle fingers extended straight up pressed together',
  V: 'Index and middle fingers extended upward and spread apart in a "V"',
  W: 'Index, middle, and ring fingers extended upward and spread apart',
  X: 'Index finger hooked/bent like a claw; all other fingers tightly curled',
  Y: 'Thumb and pinky extended outward (shaka / hang loose)',
  SPACE: 'Open flat hand with all five fingers extended and spread wide',
  ILY: 'Thumb, index, and pinky extended ("I Love You" in ASL)',
  GOOD: 'Closed fist with thumb raised high straight up (Thumbs Up / Good)',
  NO: 'Index and middle fingertips pinched together against the thumb tip',
};

/**
 * Converts a recognized class token into text appended to the sentence builder.
 */
export function formatSignForSentence(sign: string): string {
  switch (sign) {
    case 'SPACE':
      return ' ';
    case 'ILY':
      return 'I LOVE YOU ';
    case 'GOOD':
      return 'GOOD ';
    case 'NO':
      return 'NO ';
    default:
      return sign;
  }
}

/**
 * Calculates Euclidean distance between two 3D landmarks
 */
function dist(p1: Landmark3D, p2: Landmark3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Computes rich geometric hand-pose metrics from 21 MediaPipe landmarks
 */
export function analyzeHandPose(landmarks: Landmark3D[]) {
  if (landmarks.length < 21) {
    return null;
  }

  const wrist = landmarks[0];
  const palmScale = dist(wrist, landmarks[9]) || 0.2;

  // Finger straightness / extension checks:
  // Works for upward, sideways, AND downward-pointing fingers (P, Q)
  const isFingerStraight = (mcpIdx: number, pipIdx: number, tipIdx: number, minSpanRatio: number) => {
    const mcpToTip = dist(landmarks[mcpIdx], landmarks[tipIdx]);
    const mcpToPip = dist(landmarks[mcpIdx], landmarks[pipIdx]);
    const pipToTip = dist(landmarks[pipIdx], landmarks[tipIdx]);
    const straightness = mcpToTip / (mcpToPip + pipToTip + 1e-6);
    const wristToTip = dist(wrist, landmarks[tipIdx]);
    const wristToPip = dist(wrist, landmarks[pipIdx]);
    const pointingDown = (landmarks[tipIdx].y - landmarks[mcpIdx].y) > 0.35 * palmScale;
    const radialCheck = pointingDown ? true : wristToTip > wristToPip * 1.12;
    return radialCheck && straightness > 0.92 && mcpToTip > minSpanRatio * palmScale && mcpToTip > mcpToPip * 1.55;
  };

  const isIndexExtended = isFingerStraight(5, 6, 8, 0.55);
  const isMiddleExtended = isFingerStraight(9, 10, 12, 0.55);
  const isRingExtended = isFingerStraight(13, 14, 16, 0.50);
  const isPinkyExtended = isFingerStraight(17, 18, 20, 0.45);
  const isThumbOut =
    dist(landmarks[4], landmarks[9]) > 0.72 * palmScale &&
    dist(wrist, landmarks[4]) > dist(wrist, landmarks[2]) * 1.12;

  // Directional vectors (Image space: +y is down, -y is up)
  const idxDx = landmarks[8].x - landmarks[5].x;
  const idxDy = landmarks[8].y - landmarks[5].y;
  const midDx = landmarks[12].x - landmarks[9].x;
  const midDy = landmarks[12].y - landmarks[9].y;

  const indexPointingDown = idxDy > 0.35 * palmScale;
  const indexPointingSideways =
    Math.abs(idxDx) > Math.abs(idxDy) * 1.25 && Math.abs(idxDx) > 0.45 * palmScale;
  const indexPointingUp = -idxDy > Math.abs(idxDx) * 0.75 && -idxDy > 0.35 * palmScale;

  const middlePointingDown = midDy > 0.35 * palmScale;
  const middlePointingSideways =
    Math.abs(midDx) > Math.abs(midDy) * 1.25 && Math.abs(midDx) > 0.45 * palmScale;
  const middlePointingUp = -midDy > Math.abs(midDx) * 0.75 && -midDy > 0.35 * palmScale;

  const thumbPointingUpHigh =
    (landmarks[5].y - landmarks[4].y) > 0.38 * palmScale &&
    dist(landmarks[4], landmarks[5]) > 0.62 * palmScale;
  const thumbPointingDown = (landmarks[4].y - landmarks[2].y) > 0.22 * palmScale;

  // Normalized pairwise distances
  const thumbTipDist = dist(wrist, landmarks[4]) / palmScale;
  const indexTipDist = dist(wrist, landmarks[8]) / palmScale;
  const indexPipDist = dist(wrist, landmarks[6]) / palmScale;

  const thumbIndexTipDist = dist(landmarks[4], landmarks[8]) / palmScale;
  const thumbMiddleTipDist = dist(landmarks[4], landmarks[12]) / palmScale;
  const thumbRingTipDist = dist(landmarks[4], landmarks[16]) / palmScale;
  const thumbPinkyTipDist = dist(landmarks[4], landmarks[20]) / palmScale;

  const indexMiddleTipDist = dist(landmarks[8], landmarks[12]) / palmScale;
  const middleRingTipDist = dist(landmarks[12], landmarks[16]) / palmScale;

  const thumbIndexMcpDist = dist(landmarks[4], landmarks[5]) / palmScale;
  const thumbIndexPipDist = dist(landmarks[4], landmarks[6]) / palmScale;
  const thumbMiddleMcpDist = dist(landmarks[4], landmarks[9]) / palmScale;
  const thumbMiddlePipDist = dist(landmarks[4], landmarks[10]) / palmScale;
  const thumbRingPipDist = dist(landmarks[4], landmarks[14]) / palmScale;
  const thumbPinkyPipDist = dist(landmarks[4], landmarks[18]) / palmScale;

  const indexTipToMcpDist = dist(landmarks[8], landmarks[5]) / palmScale;
  const middleTipToMcpDist = dist(landmarks[12], landmarks[9]) / palmScale;

  // Special shape checks
  const isIndexHooked =
    !isIndexExtended &&
    !isMiddleExtended &&
    !isRingExtended &&
    !isPinkyExtended &&
    middleTipToMcpDist < 0.48 &&
    indexPipDist > 1.05 &&
    indexTipDist > 0.80 &&
    indexTipDist < indexPipDist * 1.05 &&
    (landmarks[5].y - landmarks[6].y) > 0.25 * palmScale;

  const mcpOrder = landmarks[5].x - landmarks[9].x;
  const tipOrder = landmarks[8].x - landmarks[12].x;
  const isIndexMiddleCrossed =
    isIndexExtended &&
    isMiddleExtended &&
    !isRingExtended &&
    !isPinkyExtended &&
    ((mcpOrder * tipOrder < 0) || indexMiddleTipDist < 0.21);

  const isCShaped =
    !isIndexExtended &&
    !isMiddleExtended &&
    indexTipToMcpDist > 0.48 &&
    thumbIndexTipDist >= 0.44 &&
    thumbIndexTipDist <= 1.45 &&
    indexMiddleTipDist < 0.55 &&
    thumbMiddleTipDist > 0.44;

  return {
    palmScale,
    extensions: {
      thumb: isThumbOut ? 1 : 0,
      index: isIndexExtended ? 1 : 0,
      middle: isMiddleExtended ? 1 : 0,
      ring: isRingExtended ? 1 : 0,
      pinky: isPinkyExtended ? 1 : 0,
    },
    directions: {
      indexPointingUp,
      indexPointingDown,
      indexPointingSideways,
      middlePointingUp,
      middlePointingDown,
      middlePointingSideways,
      thumbPointingUpHigh,
      thumbPointingDown,
    },
    distances: {
      thumbTipDist,
      indexTipDist,
      indexPipDist,
      thumbIndexTipDist,
      thumbMiddleTipDist,
      thumbRingTipDist,
      thumbPinkyTipDist,
      indexMiddleTipDist,
      middleRingTipDist,
      thumbIndexMcpDist,
      thumbIndexPipDist,
      thumbMiddleMcpDist,
      thumbMiddlePipDist,
      thumbRingPipDist,
      thumbPinkyPipDist,
      indexTipToMcpDist,
      middleTipToMcpDist,
    },
    shapes: {
      isIndexHooked,
      isIndexMiddleCrossed,
      isCShaped,
    },
    thumbRelY: {
      aboveIndexPip: landmarks[4].y < landmarks[6].y + 0.04 * palmScale,
      aboveMiddleMcp: landmarks[4].y < landmarks[9].y - 0.05 * palmScale,
      belowIndexPip: landmarks[4].y > landmarks[6].y + 0.06 * palmScale,
      belowAllTips: landmarks[4].y > landmarks[8].y + 0.05 * palmScale,
      inFrontOfPip: landmarks[4].z < landmarks[10].z - 0.015,
      behindPip: landmarks[4].z > landmarks[10].z + 0.01,
      outsideIndex: Math.abs(landmarks[4].x - landmarks[9].x) > Math.abs(landmarks[5].x - landmarks[9].x) * 1.15,
    },
  };
}

/**
 * Predicts ASL gesture from 21 hand landmarks across all 28 static classes
 */
export function classifyGesture(landmarks: Landmark3D[]): GesturePrediction {
  const analysis = analyzeHandPose(landmarks);
  if (!analysis) {
    return {
      topChar: 'UNKNOWN',
      topConfidence: 0,
      top3: [],
    };
  }

  const { extensions, directions, distances, shapes, thumbRelY } = analysis;
  const rawScores: Record<ASLClass, number> = {
    A: 0.05, B: 0.05, C: 0.05, D: 0.05, E: 0.05, F: 0.05,
    G: 0.05, H: 0.05, I: 0.05, K: 0.05, L: 0.05, M: 0.05,
    N: 0.05, O: 0.05, P: 0.05, Q: 0.05, R: 0.05, S: 0.05,
    T: 0.05, U: 0.05, V: 0.05, W: 0.05, X: 0.05, Y: 0.05,
    SPACE: 0.05, ILY: 0.05, GOOD: 0.05, NO: 0.05,
  };

  const extCount =
    extensions.index + extensions.middle + extensions.ring + extensions.pinky;

  // --- 4 Fingers Extended (Index, Middle, Ring, Pinky) ---
  if (extensions.index && extensions.middle && extensions.ring && extensions.pinky) {
    if (extensions.thumb && distances.thumbIndexTipDist > 0.65 && distances.indexMiddleTipDist > 0.20) {
      rawScores.SPACE += 5.0;
      rawScores.B += 1.5;
    } else {
      rawScores.B += 5.0;
      rawScores.SPACE += 1.5;
    }
  }

  // --- Middle, Ring, Pinky Extended; Index Pinched to Thumb (F) ---
  if (!extensions.index && extensions.middle && extensions.ring && extensions.pinky) {
    if (distances.thumbIndexTipDist < 0.55) {
      rawScores.F += 5.2;
    } else {
      rawScores.F += 3.5;
    }
  }

  // --- Index, Middle, Ring Extended; Pinky Curled (W) ---
  if (extensions.index && extensions.middle && extensions.ring && !extensions.pinky) {
    rawScores.W += 5.0;
  }

  // --- Thumb, Index, Pinky Extended; Middle & Ring Curled (ILY) ---
  if (extensions.index && !extensions.middle && !extensions.ring && extensions.pinky) {
    if (extensions.thumb) {
      rawScores.ILY += 5.3;
    } else {
      rawScores.ILY += 3.4;
    }
  }

  // --- Only Pinky Extended (I or Y) ---
  if (!extensions.index && !extensions.middle && !extensions.ring && extensions.pinky) {
    if (extensions.thumb && distances.thumbPinkyTipDist > 1.0) {
      rawScores.Y += 5.2;
    } else {
      rawScores.I += 5.0;
    }
  }

  // --- Index + Middle Extended; Ring & Pinky Curled (H, P, NO, K, R, U, V) ---
  if (extensions.index && extensions.middle && !extensions.ring && !extensions.pinky) {
    if (directions.indexPointingDown && directions.middlePointingDown) {
      rawScores.P += 5.2;
    } else if (directions.indexPointingSideways && directions.middlePointingSideways) {
      rawScores.H += 5.2;
    } else if (distances.thumbIndexTipDist < 0.36 && distances.thumbMiddleTipDist < 0.42) {
      rawScores.NO += 5.2;
    } else if (shapes.isIndexMiddleCrossed) {
      rawScores.R += 5.0;
      rawScores.U += 2.0;
    } else if (
      thumbRelY.aboveMiddleMcp &&
      (distances.thumbMiddlePipDist < 0.55 || distances.thumbMiddleMcpDist < 0.60) &&
      distances.indexMiddleTipDist > 0.30 &&
      distances.thumbIndexTipDist > 0.45
    ) {
      rawScores.K += 5.0;
      rawScores.V += 2.0;
    } else if (distances.indexMiddleTipDist <= 0.42) {
      rawScores.U += 4.9;
      rawScores.V += 1.8;
    } else {
      rawScores.V += 5.0;
      rawScores.U += 1.6;
    }
  }

  // --- Only Index Extended (D, G, L, Q) ---
  if (extensions.index && !extensions.middle && !extensions.ring && !extensions.pinky) {
    if (directions.indexPointingDown && directions.thumbPointingDown) {
      rawScores.Q += 5.2;
    } else if (directions.indexPointingSideways) {
      rawScores.G += 5.2;
    } else if (extensions.thumb && distances.thumbIndexTipDist > 0.70) {
      rawScores.L += 5.2;
    } else {
      rawScores.D += 5.0;
    }
  }

  // --- All 4 Fingers Curled (A, C, E, M, N, O, S, T, X, GOOD) ---
  if (extCount === 0) {
    if (directions.thumbPointingUpHigh) {
      rawScores.GOOD += 5.3;
      rawScores.A += 1.5;
    } else if (shapes.isIndexHooked) {
      rawScores.X += 5.2;
    } else if (
      !thumbRelY.behindPip &&
      distances.thumbIndexTipDist < 0.40 &&
      distances.thumbMiddleTipDist < 0.46
    ) {
      rawScores.O += 5.2;
      rawScores.C += 1.8;
    } else if (shapes.isCShaped) {
      rawScores.C += 5.1;
      rawScores.O += 1.8;
    } else if (
      thumbRelY.belowAllTips &&
      distances.thumbTipDist < 0.72 &&
      distances.indexTipToMcpDist < 0.55
    ) {
      rawScores.E += 5.0;
      rawScores.S += 1.6;
    } else if (thumbRelY.outsideIndex && thumbRelY.aboveIndexPip) {
      rawScores.A += 5.1;
      rawScores.S += 1.5;
    } else if (
      thumbRelY.behindPip &&
      thumbRelY.belowIndexPip &&
      (distances.thumbPinkyPipDist < 0.48 || distances.thumbRingPipDist < distances.thumbIndexPipDist * 0.65)
    ) {
      rawScores.M += 5.0;
      rawScores.N += 1.8;
    } else if (
      thumbRelY.behindPip &&
      thumbRelY.belowIndexPip &&
      distances.thumbMiddlePipDist < 0.50
    ) {
      rawScores.N += 5.0;
      rawScores.M += 1.8;
    } else if (
      distances.thumbIndexPipDist < 0.44 &&
      distances.thumbMiddlePipDist < 0.46 &&
      thumbRelY.aboveIndexPip &&
      !thumbRelY.outsideIndex &&
      !thumbRelY.inFrontOfPip
    ) {
      rawScores.T += 5.0;
      rawScores.S += 1.8;
    } else if (
      thumbRelY.inFrontOfPip &&
      distances.thumbIndexPipDist < 0.52 &&
      distances.thumbMiddlePipDist < 0.52
    ) {
      rawScores.S += 5.0;
      rawScores.T += 1.6;
    } else {
      rawScores.A += 3.6;
      rawScores.S += 3.2;
    }
  }

  // Compute Softmax probabilities
  const keys = Object.keys(rawScores) as ASLClass[];
  const maxScore = Math.max(...keys.map((k) => rawScores[k]));
  const exps = keys.map((k) => Math.exp(rawScores[k] - maxScore));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs: { char: string; confidence: number }[] = keys.map((k, i) => ({
    char: k,
    confidence: exps[i] / sumExp,
  }));

  probs.sort((a, b) => b.confidence - a.confidence);

  return {
    topChar: probs[0].char,
    topConfidence: probs[0].confidence,
    top3: probs.slice(0, 3),
  };
}

/**
 * Helper to place a finger's 4 joints [MCP, PIP, DIP, TIP] along a normalized direction
 */
function buildFingerChain(
  mcp: Landmark3D,
  dir: { x: number; y: number; z: number },
  lengths: [number, number, number]
): [Landmark3D, Landmark3D, Landmark3D, Landmark3D] {
  const norm = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
  const ux = dir.x / norm;
  const uy = dir.y / norm;
  const uz = dir.z / norm;

  const pip = {
    x: mcp.x + ux * lengths[0],
    y: mcp.y + uy * lengths[0],
    z: mcp.z + uz * lengths[0],
  };
  const dip = {
    x: pip.x + ux * lengths[1],
    y: pip.y + uy * lengths[1],
    z: pip.z + uz * lengths[1],
  };
  const tip = {
    x: dip.x + ux * lengths[2],
    y: dip.y + uy * lengths[2],
    z: dip.z + uz * lengths[2],
  };
  return [mcp, pip, dip, tip];
}

/**
 * Helper to curl a finger down cleanly in front of the palm
 */
function buildCurledFinger(mcp: Landmark3D, curlDepth = 0.045): [Landmark3D, Landmark3D, Landmark3D, Landmark3D] {
  const pip = { x: mcp.x, y: mcp.y - 0.035, z: -0.025 };
  const dip = { x: mcp.x, y: mcp.y + 0.015, z: -curlDepth };
  const tip = { x: mcp.x, y: mcp.y + 0.065, z: -0.015 };
  return [mcp, pip, dip, tip];
}

/**
 * Synthesizes realistic 21 3D hand landmarks for all 28 static ASL classes
 */
export function synthesizeHandSkeleton(label: ASLClass, noiseStd: number = 0.01): Landmark3D[] {
  const wrist: Landmark3D = { x: 0.50, y: 0.80, z: 0.0 };
  const lm: Landmark3D[] = new Array(21).fill(null).map(() => ({ ...wrist }));

  const idxMcp: Landmark3D = { x: 0.44, y: 0.58, z: 0.0 };
  const midMcp: Landmark3D = { x: 0.50, y: 0.56, z: 0.0 };
  const rngMcp: Landmark3D = { x: 0.55, y: 0.58, z: 0.0 };
  const pnkMcp: Landmark3D = { x: 0.60, y: 0.61, z: 0.0 };

  const thumbCmc: Landmark3D = { x: 0.43, y: 0.73, z: 0.0 };
  const thumbMcp: Landmark3D = { x: 0.40, y: 0.67, z: -0.01 };

  const setFinger = (startIdx: number, chain: [Landmark3D, Landmark3D, Landmark3D, Landmark3D]) => {
    lm[startIdx] = chain[0];
    lm[startIdx + 1] = chain[1];
    lm[startIdx + 2] = chain[2];
    lm[startIdx + 3] = chain[3];
  };

  // Default: all 4 fingers curled, thumb neutral alongside index
  setFinger(5, buildCurledFinger(idxMcp));
  setFinger(9, buildCurledFinger(midMcp));
  setFinger(13, buildCurledFinger(rngMcp));
  setFinger(17, buildCurledFinger(pnkMcp));
  lm[1] = thumbCmc;
  lm[2] = thumbMcp;
  lm[3] = { x: 0.41, y: 0.61, z: -0.02 };
  lm[4] = { x: 0.40, y: 0.55, z: -0.02 };

  const seg: [number, number, number] = [0.07, 0.06, 0.055];
  const shortSeg: [number, number, number] = [0.055, 0.048, 0.045];

  switch (label) {
    case 'A':
      // Fist with thumb resting upright outside index
      lm[3] = { x: 0.39, y: 0.60, z: -0.01 };
      lm[4] = { x: 0.39, y: 0.53, z: -0.01 };
      break;

    case 'GOOD':
      // Thumbs up: thumb raised high above index MCP
      lm[2] = { x: 0.41, y: 0.64, z: -0.01 };
      lm[3] = { x: 0.40, y: 0.53, z: -0.01 };
      lm[4] = { x: 0.39, y: 0.39, z: -0.01 };
      break;

    case 'B':
      // 4 fingers straight up together, thumb tucked across palm
      setFinger(5, buildFingerChain(idxMcp, { x: 0, y: -1, z: -0.05 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: 0, y: -1, z: -0.05 }, [0.075, 0.065, 0.06]));
      setFinger(13, buildFingerChain(rngMcp, { x: 0, y: -1, z: -0.05 }, seg));
      setFinger(17, buildFingerChain(pnkMcp, { x: 0, y: -1, z: -0.05 }, shortSeg));
      lm[3] = { x: 0.47, y: 0.64, z: -0.03 };
      lm[4] = { x: 0.53, y: 0.62, z: -0.04 };
      break;

    case 'SPACE':
      // All 5 fingers extended & spread wide
      setFinger(5, buildFingerChain(idxMcp, { x: -0.35, y: -1, z: -0.05 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: -0.05, y: -1, z: -0.05 }, [0.075, 0.065, 0.06]));
      setFinger(13, buildFingerChain(rngMcp, { x: 0.22, y: -1, z: -0.05 }, seg));
      setFinger(17, buildFingerChain(pnkMcp, { x: 0.50, y: -0.9, z: -0.05 }, shortSeg));
      lm[2] = { x: 0.36, y: 0.66, z: -0.01 };
      lm[3] = { x: 0.30, y: 0.60, z: -0.02 };
      lm[4] = { x: 0.24, y: 0.54, z: -0.03 };
      break;

    case 'C': {
      // Clear open C-curve arc with thumb opposing index tip
      const makeArc = (mcp: Landmark3D, xShift: number): [Landmark3D, Landmark3D, Landmark3D, Landmark3D] => [
        mcp,
        { x: mcp.x + xShift - 0.01, y: mcp.y - 0.08, z: -0.02 },
        { x: mcp.x + xShift - 0.07, y: mcp.y - 0.12, z: -0.06 },
        { x: mcp.x + xShift - 0.12, y: mcp.y - 0.07, z: -0.09 },
      ];
      setFinger(5, makeArc(idxMcp, 0));
      setFinger(9, makeArc(midMcp, -0.03));
      setFinger(13, makeArc(rngMcp, -0.05));
      setFinger(17, makeArc(pnkMcp, -0.07));
      lm[2] = { x: 0.36, y: 0.71, z: -0.02 };
      lm[3] = { x: 0.32, y: 0.69, z: -0.06 };
      lm[4] = { x: 0.30, y: 0.67, z: -0.09 };
      break;
    }

    case 'D':
      // Index straight up; middle/ring/pinky touch thumb
      setFinger(5, buildFingerChain(idxMcp, { x: 0, y: -1, z: -0.05 }, seg));
      lm[3] = { x: 0.45, y: 0.64, z: -0.04 };
      lm[4] = { x: 0.49, y: 0.62, z: -0.05 };
      break;

    case 'E':
      // All 4 fingers tightly curled; thumb tucked low underneath all fingertips
      setFinger(5, [idxMcp, { x: 0.44, y: 0.53, z: -0.03 }, { x: 0.44, y: 0.57, z: -0.04 }, { x: 0.44, y: 0.61, z: -0.02 }]);
      setFinger(9, [midMcp, { x: 0.50, y: 0.52, z: -0.03 }, { x: 0.50, y: 0.56, z: -0.04 }, { x: 0.50, y: 0.60, z: -0.02 }]);
      setFinger(13, [rngMcp, { x: 0.55, y: 0.53, z: -0.03 }, { x: 0.55, y: 0.57, z: -0.04 }, { x: 0.55, y: 0.61, z: -0.02 }]);
      setFinger(17, [pnkMcp, { x: 0.60, y: 0.56, z: -0.03 }, { x: 0.60, y: 0.59, z: -0.04 }, { x: 0.60, y: 0.62, z: -0.02 }]);
      lm[2] = { x: 0.43, y: 0.72, z: -0.02 };
      lm[3] = { x: 0.47, y: 0.72, z: -0.03 };
      lm[4] = { x: 0.52, y: 0.72, z: -0.03 };
      break;

    case 'F':
      // Thumb & index pinch; middle, ring, pinky straight up
      setFinger(5, [idxMcp, { x: 0.43, y: 0.54, z: -0.04 }, { x: 0.42, y: 0.57, z: -0.06 }, { x: 0.41, y: 0.60, z: -0.07 }]);
      setFinger(9, buildFingerChain(midMcp, { x: 0.05, y: -1, z: -0.04 }, [0.075, 0.065, 0.06]));
      setFinger(13, buildFingerChain(rngMcp, { x: 0.15, y: -1, z: -0.04 }, seg));
      setFinger(17, buildFingerChain(pnkMcp, { x: 0.25, y: -1, z: -0.04 }, shortSeg));
      lm[3] = { x: 0.40, y: 0.62, z: -0.05 };
      lm[4] = { x: 0.41, y: 0.60, z: -0.07 };
      break;

    case 'G':
      // Index & thumb pointing sideways left
      setFinger(5, buildFingerChain(idxMcp, { x: -1, y: 0.05, z: -0.03 }, seg));
      lm[2] = { x: 0.37, y: 0.68, z: -0.02 };
      lm[3] = { x: 0.31, y: 0.67, z: -0.03 };
      lm[4] = { x: 0.25, y: 0.66, z: -0.04 };
      break;

    case 'H':
      // Index & middle pointing sideways left together
      setFinger(5, buildFingerChain(idxMcp, { x: -1, y: 0.03, z: -0.03 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: -1, y: 0.06, z: -0.03 }, seg));
      lm[3] = { x: 0.44, y: 0.66, z: -0.04 };
      lm[4] = { x: 0.48, y: 0.65, z: -0.05 };
      break;

    case 'I':
      // Only pinky straight up
      setFinger(17, buildFingerChain(pnkMcp, { x: 0.05, y: -1, z: -0.04 }, shortSeg));
      lm[3] = { x: 0.46, y: 0.63, z: -0.04 };
      lm[4] = { x: 0.51, y: 0.61, z: -0.05 };
      break;

    case 'K':
      // Index & middle up in V, thumb wedged near middle PIP
      setFinger(5, buildFingerChain(idxMcp, { x: -0.25, y: -1, z: -0.03 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: 0.28, y: -1, z: -0.03 }, [0.075, 0.065, 0.06]));
      lm[2] = { x: 0.44, y: 0.64, z: -0.02 };
      lm[3] = { x: 0.47, y: 0.58, z: -0.03 };
      lm[4] = { x: 0.49, y: 0.52, z: -0.04 };
      break;

    case 'L':
      // Index straight up, thumb out sideways at 90 deg
      setFinger(5, buildFingerChain(idxMcp, { x: 0, y: -1, z: -0.03 }, seg));
      lm[2] = { x: 0.36, y: 0.68, z: -0.01 };
      lm[3] = { x: 0.29, y: 0.67, z: -0.02 };
      lm[4] = { x: 0.22, y: 0.66, z: -0.02 };
      break;

    case 'M':
      // Fist with 3 fingers draped over thumb (thumb tucked behind ring/pinky PIP)
      lm[3] = { x: 0.51, y: 0.63, z: 0.01 };
      lm[4] = { x: 0.57, y: 0.60, z: 0.01 };
      break;

    case 'N':
      // Fist with 2 fingers draped over thumb (thumb tucked behind index/middle PIP)
      lm[3] = { x: 0.45, y: 0.63, z: 0.01 };
      lm[4] = { x: 0.47, y: 0.60, z: 0.01 };
      break;

    case 'O':
      // All fingertips curved meeting thumb tip in O
      setFinger(5, [idxMcp, { x: 0.41, y: 0.53, z: -0.04 }, { x: 0.39, y: 0.57, z: -0.07 }, { x: 0.40, y: 0.62, z: -0.08 }]);
      setFinger(9, [midMcp, { x: 0.47, y: 0.51, z: -0.04 }, { x: 0.44, y: 0.56, z: -0.07 }, { x: 0.42, y: 0.62, z: -0.08 }]);
      setFinger(13, [rngMcp, { x: 0.52, y: 0.53, z: -0.04 }, { x: 0.48, y: 0.58, z: -0.07 }, { x: 0.44, y: 0.63, z: -0.08 }]);
      setFinger(17, [pnkMcp, { x: 0.57, y: 0.57, z: -0.04 }, { x: 0.52, y: 0.61, z: -0.07 }, { x: 0.47, y: 0.64, z: -0.08 }]);
      lm[3] = { x: 0.39, y: 0.64, z: -0.05 };
      lm[4] = { x: 0.40, y: 0.62, z: -0.08 };
      break;

    case 'P':
      // Index & middle pointing downward
      setFinger(5, buildFingerChain(idxMcp, { x: -0.15, y: 1, z: -0.04 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: 0.15, y: 1, z: -0.04 }, seg));
      lm[3] = { x: 0.45, y: 0.64, z: -0.03 };
      lm[4] = { x: 0.48, y: 0.67, z: -0.04 };
      break;

    case 'Q':
      // Index & thumb pointing downward
      setFinger(5, buildFingerChain(idxMcp, { x: -0.15, y: 1, z: -0.04 }, seg));
      lm[2] = { x: 0.39, y: 0.70, z: -0.02 };
      lm[3] = { x: 0.37, y: 0.76, z: -0.04 };
      lm[4] = { x: 0.35, y: 0.82, z: -0.05 };
      break;

    case 'R':
      // Index & middle crossed upward
      setFinger(5, buildFingerChain(idxMcp, { x: 0.25, y: -1, z: -0.03 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: -0.25, y: -1, z: -0.01 }, [0.075, 0.065, 0.06]));
      lm[3] = { x: 0.47, y: 0.63, z: -0.04 };
      lm[4] = { x: 0.52, y: 0.62, z: -0.05 };
      break;

    case 'S':
      // Tight fist with thumb crossed in front of index & middle PIPs
      lm[3] = { x: 0.44, y: 0.55, z: -0.06 };
      lm[4] = { x: 0.50, y: 0.55, z: -0.07 };
      break;

    case 'T':
      // Fist with thumb tip tucked upward between index & middle PIPs
      lm[3] = { x: 0.45, y: 0.56, z: -0.015 };
      lm[4] = { x: 0.47, y: 0.50, z: -0.015 };
      break;

    case 'U':
      // Index & middle straight up pressed together
      setFinger(5, buildFingerChain(idxMcp, { x: 0.02, y: -1, z: -0.04 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: -0.02, y: -1, z: -0.04 }, [0.075, 0.065, 0.06]));
      lm[3] = { x: 0.47, y: 0.63, z: -0.04 };
      lm[4] = { x: 0.52, y: 0.61, z: -0.05 };
      break;

    case 'V':
      // Index & middle straight up spread in a V
      setFinger(5, buildFingerChain(idxMcp, { x: -0.35, y: -1, z: -0.04 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: 0.35, y: -1, z: -0.04 }, [0.075, 0.065, 0.06]));
      lm[3] = { x: 0.46, y: 0.64, z: -0.04 };
      lm[4] = { x: 0.51, y: 0.62, z: -0.05 };
      break;

    case 'W':
      // Index, middle, ring straight up spread
      setFinger(5, buildFingerChain(idxMcp, { x: -0.35, y: -1, z: -0.04 }, seg));
      setFinger(9, buildFingerChain(midMcp, { x: 0.0, y: -1, z: -0.04 }, [0.075, 0.065, 0.06]));
      setFinger(13, buildFingerChain(rngMcp, { x: 0.35, y: -1, z: -0.04 }, seg));
      lm[3] = { x: 0.47, y: 0.64, z: -0.04 };
      lm[4] = { x: 0.53, y: 0.63, z: -0.05 };
      break;

    case 'X':
      // Index hooked/bent like a claw
      setFinger(5, [
        idxMcp,
        { x: 0.44, y: 0.47, z: -0.02 },
        { x: 0.43, y: 0.50, z: -0.07 },
        { x: 0.43, y: 0.56, z: -0.08 },
      ]);
      lm[3] = { x: 0.46, y: 0.64, z: -0.04 };
      lm[4] = { x: 0.51, y: 0.62, z: -0.05 };
      break;

    case 'Y':
      // Thumb & pinky extended out
      setFinger(17, buildFingerChain(pnkMcp, { x: 0.45, y: -0.9, z: -0.03 }, shortSeg));
      lm[2] = { x: 0.36, y: 0.67, z: -0.01 };
      lm[3] = { x: 0.30, y: 0.62, z: -0.02 };
      lm[4] = { x: 0.24, y: 0.57, z: -0.03 };
      break;

    case 'ILY':
      // Thumb + Index + Pinky extended
      setFinger(5, buildFingerChain(idxMcp, { x: -0.08, y: -1, z: -0.03 }, seg));
      setFinger(17, buildFingerChain(pnkMcp, { x: 0.35, y: -0.95, z: -0.03 }, shortSeg));
      lm[2] = { x: 0.36, y: 0.67, z: -0.01 };
      lm[3] = { x: 0.30, y: 0.62, z: -0.02 };
      lm[4] = { x: 0.24, y: 0.57, z: -0.03 };
      break;

    case 'NO':
      // Index & middle extended forward and pinched onto thumb tip
      setFinger(5, buildFingerChain(idxMcp, { x: -0.05, y: -0.45, z: -0.89 }, [0.06, 0.05, 0.045]));
      setFinger(9, buildFingerChain(midMcp, { x: -0.35, y: -0.42, z: -0.84 }, [0.06, 0.05, 0.045]));
      lm[2] = { x: 0.41, y: 0.63, z: -0.05 };
      lm[3] = { x: 0.42, y: 0.57, z: -0.10 };
      lm[4] = { x: 0.43, y: 0.50, z: -0.14 };
      break;
  }

  // Add subtle random variation & noise
  for (let i = 0; i < 21; i++) {
    lm[i].x += (Math.random() - 0.5) * noiseStd * 2;
    lm[i].y += (Math.random() - 0.5) * noiseStd * 2;
    lm[i].z += (Math.random() - 0.5) * noiseStd * 2;
  }

  return lm;
}

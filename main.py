"""
main.py - Real-Time ASL Gesture Recognition & Translation (Standalone Python Edition)

Mirrors the 28-class ASL classifier (24 static letters A-Y excluding motion J/Z,
plus SPACE, ILY, GOOD, NO) with MediaPipe Hands, wrist-relative normalization,
debounced sentence builder, and an interactive OpenCV HUD.

Requirements:
    pip install opencv-python mediapipe numpy

Usage:
    python main.py              # Run with live webcam
    python main.py --camera 1   # Use camera index 1
    python main.py --simulate   # Run built-in 28-sign landmark simulator (no webcam needed)
"""

import argparse
import math
import time
from typing import Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np

ASL_LETTERS = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I",
    "K", "L", "M", "N", "O", "P", "Q", "R", "S",
    "T", "U", "V", "W", "X", "Y",
]
ASL_WORDS = ["SPACE", "ILY", "GOOD", "NO"]
ASL_CLASSES = ASL_LETTERS + ASL_WORDS

GESTURE_DESCRIPTIONS: Dict[str, str] = {
    "A": "Fist with thumb resting upright against index side",
    "B": "Four fingers straight up together; thumb across palm",
    "C": "Curved fingers and thumb forming an open C arc",
    "D": "Index pointing up; others touch thumb tip",
    "E": "All fingers curled down tightly; thumb tucked low",
    "F": "Thumb & index pinched (OK); middle, ring, pinky up",
    "G": "Index & thumb pointing sideways",
    "H": "Index & middle pointing sideways together",
    "I": "Only pinky extended straight up",
    "K": "Index & middle up in V with thumb wedged between",
    "L": "Thumb & index at 90-degree right angle",
    "M": "Closed fist with 3 fingers draped over thumb",
    "N": "Closed fist with 2 fingers draped over thumb",
    "O": "All fingertips curved meeting thumb tip in an O",
    "P": "Index & middle pointing downward with thumb between",
    "Q": "Index & thumb pointing downward",
    "R": "Index & middle extended upward and crossed",
    "S": "Tight fist with thumb crossed in front of fingers",
    "T": "Fist with thumb peeking between index & middle",
    "U": "Index & middle straight up pressed together",
    "V": "Index & middle straight up spread apart in V",
    "W": "Index, middle, ring straight up spread apart",
    "X": "Index hooked like a claw; others curled",
    "Y": "Thumb & pinky extended outward",
    "SPACE": "Open flat hand with all 5 fingers spread wide",
    "ILY": "Thumb, index, and pinky extended (I Love You)",
    "GOOD": "Closed fist with thumb raised straight up",
    "NO": "Index & middle pinched onto thumb tip",
}

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]


def format_sign_for_sentence(sign: str) -> str:
    """Converts a confirmed sign label into sentence text."""
    if sign == "SPACE":
        return " "
    if sign == "ILY":
        return "I LOVE YOU "
    if sign == "GOOD":
        return "GOOD "
    if sign == "NO":
        return "NO "
    return sign


def normalize_landmarks(landmarks: np.ndarray) -> np.ndarray:
    """
    Wrist-relative scale normalization for 21 3D landmarks -> 63-D vector.
    1. Translate relative to wrist (index 0).
    2. Divide by maximum Euclidean distance from wrist.
    """
    pts = np.asarray(landmarks, dtype=np.float32).reshape(21, 3)
    rel = pts - pts[0]
    dists = np.linalg.norm(rel, axis=1)
    max_dist = float(np.max(dists)) + 1e-6
    return (rel / max_dist).flatten()


def _dist(p1: np.ndarray, p2: np.ndarray) -> float:
    return float(np.linalg.norm(p1 - p2))


def analyze_hand_pose(landmarks: np.ndarray) -> Optional[dict]:
    """Computes geometric finger-extension, direction, and distance features."""
    if len(landmarks) < 21:
        return None

    lm = np.asarray(landmarks, dtype=np.float32).reshape(21, 3)
    wrist = lm[0]
    palm_scale = _dist(wrist, lm[9]) or 0.2

    def is_finger_straight(mcp: int, pip: int, tip: int, min_span_ratio: float) -> bool:
        mcp_to_tip = _dist(lm[mcp], lm[tip])
        mcp_to_pip = _dist(lm[mcp], lm[pip])
        pip_to_tip = _dist(lm[pip], lm[tip])
        straightness = mcp_to_tip / (mcp_to_pip + pip_to_tip + 1e-6)
        wrist_to_tip = _dist(wrist, lm[tip])
        wrist_to_pip = _dist(wrist, lm[pip])
        pointing_down = (lm[tip][1] - lm[mcp][1]) > 0.35 * palm_scale
        radial_ok = True if pointing_down else (wrist_to_tip > wrist_to_pip * 1.12)
        return (
            radial_ok
            and straightness > 0.92
            and mcp_to_tip > min_span_ratio * palm_scale
            and mcp_to_tip > mcp_to_pip * 1.55
        )

    is_index_ext = is_finger_straight(5, 6, 8, 0.55)
    is_middle_ext = is_finger_straight(9, 10, 12, 0.55)
    is_ring_ext = is_finger_straight(13, 14, 16, 0.50)
    is_pinky_ext = is_finger_straight(17, 18, 20, 0.45)
    is_thumb_out = (
        _dist(lm[4], lm[9]) > 0.72 * palm_scale
        and _dist(wrist, lm[4]) > _dist(wrist, lm[2]) * 1.12
    )

    idx_dx = float(lm[8][0] - lm[5][0])
    idx_dy = float(lm[8][1] - lm[5][1])
    mid_dx = float(lm[12][0] - lm[9][0])
    mid_dy = float(lm[12][1] - lm[9][1])

    index_down = idx_dy > 0.35 * palm_scale
    index_side = abs(idx_dx) > abs(idx_dy) * 1.25 and abs(idx_dx) > 0.45 * palm_scale
    middle_down = mid_dy > 0.35 * palm_scale
    middle_side = abs(mid_dx) > abs(mid_dy) * 1.25 and abs(mid_dx) > 0.45 * palm_scale

    thumb_up_high = (lm[5][1] - lm[4][1]) > 0.38 * palm_scale and _dist(lm[4], lm[5]) > 0.62 * palm_scale
    thumb_down = (lm[4][1] - lm[2][1]) > 0.22 * palm_scale

    thumb_tip_dist = _dist(wrist, lm[4]) / palm_scale
    index_tip_dist = _dist(wrist, lm[8]) / palm_scale
    index_pip_dist = _dist(wrist, lm[6]) / palm_scale

    thumb_index_tip = _dist(lm[4], lm[8]) / palm_scale
    thumb_middle_tip = _dist(lm[4], lm[12]) / palm_scale
    thumb_pinky_tip = _dist(lm[4], lm[20]) / palm_scale

    index_middle_tip = _dist(lm[8], lm[12]) / palm_scale
    thumb_index_pip = _dist(lm[4], lm[6]) / palm_scale
    thumb_middle_mcp = _dist(lm[4], lm[9]) / palm_scale
    thumb_middle_pip = _dist(lm[4], lm[10]) / palm_scale
    thumb_ring_pip = _dist(lm[4], lm[14]) / palm_scale
    thumb_pinky_pip = _dist(lm[4], lm[18]) / palm_scale

    index_tip_to_mcp = _dist(lm[8], lm[5]) / palm_scale
    middle_tip_to_mcp = _dist(lm[12], lm[9]) / palm_scale

    is_index_hooked = (
        not is_index_ext
        and not is_middle_ext
        and not is_ring_ext
        and not is_pinky_ext
        and middle_tip_to_mcp < 0.48
        and index_pip_dist > 1.05
        and index_tip_dist > 0.80
        and index_tip_dist < index_pip_dist * 1.05
        and (lm[5][1] - lm[6][1]) > 0.25 * palm_scale
    )

    mcp_order = lm[5][0] - lm[9][0]
    tip_order = lm[8][0] - lm[12][0]
    is_crossed = (
        is_index_ext
        and is_middle_ext
        and not is_ring_ext
        and not is_pinky_ext
        and ((mcp_order * tip_order < 0) or index_middle_tip < 0.21)
    )

    is_c_shaped = (
        not is_index_ext
        and not is_middle_ext
        and index_tip_to_mcp > 0.48
        and 0.44 <= thumb_index_tip <= 1.45
        and index_middle_tip < 0.55
        and thumb_middle_tip > 0.44
    )

    return {
        "ext": {
            "thumb": int(is_thumb_out),
            "index": int(is_index_ext),
            "middle": int(is_middle_ext),
            "ring": int(is_ring_ext),
            "pinky": int(is_pinky_ext),
        },
        "dir": {
            "index_down": index_down,
            "index_side": index_side,
            "middle_down": middle_down,
            "middle_side": middle_side,
            "thumb_up_high": thumb_up_high,
            "thumb_down": thumb_down,
        },
        "dist": {
            "thumb_tip": thumb_tip_dist,
            "thumb_index_tip": thumb_index_tip,
            "thumb_middle_tip": thumb_middle_tip,
            "thumb_pinky_tip": thumb_pinky_tip,
            "index_middle_tip": index_middle_tip,
            "thumb_index_pip": thumb_index_pip,
            "thumb_middle_mcp": thumb_middle_mcp,
            "thumb_middle_pip": thumb_middle_pip,
            "thumb_ring_pip": thumb_ring_pip,
            "thumb_pinky_pip": thumb_pinky_pip,
            "index_tip_to_mcp": index_tip_to_mcp,
        },
        "shapes": {
            "hooked": is_index_hooked,
            "crossed": is_crossed,
            "c_shaped": is_c_shaped,
        },
        "thumb_rel": {
            "above_index_pip": lm[4][1] < lm[6][1] + 0.04 * palm_scale,
            "above_middle_mcp": lm[4][1] < lm[9][1] - 0.05 * palm_scale,
            "below_index_pip": lm[4][1] > lm[6][1] + 0.06 * palm_scale,
            "below_all_tips": lm[4][1] > lm[8][1] + 0.05 * palm_scale,
            "in_front": lm[4][2] < lm[10][2] - 0.015,
            "behind": lm[4][2] > lm[10][2] + 0.01,
            "outside_index": abs(lm[4][0] - lm[9][0]) > abs(lm[5][0] - lm[9][0]) * 1.15,
        },
    }


def classify_gesture(landmarks: np.ndarray) -> Tuple[str, float, List[Tuple[str, float]]]:
    """Predicts ASL gesture and top-3 softmax probabilities across 28 classes."""
    a = analyze_hand_pose(landmarks)
    if a is None:
        return "UNKNOWN", 0.0, []

    ext = a["ext"]
    d = a["dir"]
    dist = a["dist"]
    sh = a["shapes"]
    tr = a["thumb_rel"]

    scores: Dict[str, float] = {cls: 0.05 for cls in ASL_CLASSES}
    ext_count = ext["index"] + ext["middle"] + ext["ring"] + ext["pinky"]

    if ext["index"] and ext["middle"] and ext["ring"] and ext["pinky"]:
        if ext["thumb"] and dist["thumb_index_tip"] > 0.65 and dist["index_middle_tip"] > 0.20:
            scores["SPACE"] += 5.0
            scores["B"] += 1.5
        else:
            scores["B"] += 5.0
            scores["SPACE"] += 1.5

    if not ext["index"] and ext["middle"] and ext["ring"] and ext["pinky"]:
        scores["F"] += 5.2 if dist["thumb_index_tip"] < 0.55 else 3.5

    if ext["index"] and ext["middle"] and ext["ring"] and not ext["pinky"]:
        scores["W"] += 5.0

    if ext["index"] and not ext["middle"] and not ext["ring"] and ext["pinky"]:
        scores["ILY"] += 5.3 if ext["thumb"] else 3.4

    if not ext["index"] and not ext["middle"] and not ext["ring"] and ext["pinky"]:
        if ext["thumb"] and dist["thumb_pinky_tip"] > 1.0:
            scores["Y"] += 5.2
        else:
            scores["I"] += 5.0

    if ext["index"] and ext["middle"] and not ext["ring"] and not ext["pinky"]:
        if d["index_down"] and d["middle_down"]:
            scores["P"] += 5.2
        elif d["index_side"] and d["middle_side"]:
            scores["H"] += 5.2
        elif dist["thumb_index_tip"] < 0.36 and dist["thumb_middle_tip"] < 0.42:
            scores["NO"] += 5.2
        elif sh["crossed"]:
            scores["R"] += 5.0
            scores["U"] += 2.0
        elif (
            tr["above_middle_mcp"]
            and (dist["thumb_middle_pip"] < 0.55 or dist["thumb_middle_mcp"] < 0.60)
            and dist["index_middle_tip"] > 0.30
            and dist["thumb_index_tip"] > 0.45
        ):
            scores["K"] += 5.0
            scores["V"] += 2.0
        elif dist["index_middle_tip"] <= 0.42:
            scores["U"] += 4.9
            scores["V"] += 1.8
        else:
            scores["V"] += 5.0
            scores["U"] += 1.6

    if ext["index"] and not ext["middle"] and not ext["ring"] and not ext["pinky"]:
        if d["index_down"] and d["thumb_down"]:
            scores["Q"] += 5.2
        elif d["index_side"]:
            scores["G"] += 5.2
        elif ext["thumb"] and dist["thumb_index_tip"] > 0.70:
            scores["L"] += 5.2
        else:
            scores["D"] += 5.0

    if ext_count == 0:
        if d["thumb_up_high"]:
            scores["GOOD"] += 5.3
            scores["A"] += 1.5
        elif sh["hooked"]:
            scores["X"] += 5.2
        elif not tr["behind"] and dist["thumb_index_tip"] < 0.40 and dist["thumb_middle_tip"] < 0.46:
            scores["O"] += 5.2
            scores["C"] += 1.8
        elif sh["c_shaped"]:
            scores["C"] += 5.1
            scores["O"] += 1.8
        elif tr["below_all_tips"] and dist["thumb_tip"] < 0.72 and dist["index_tip_to_mcp"] < 0.55:
            scores["E"] += 5.0
            scores["S"] += 1.6
        elif tr["outside_index"] and tr["above_index_pip"]:
            scores["A"] += 5.1
            scores["S"] += 1.5
        elif tr["behind"] and tr["below_index_pip"] and (
            dist["thumb_pinky_pip"] < 0.48 or dist["thumb_ring_pip"] < dist["thumb_index_pip"] * 0.65
        ):
            scores["M"] += 5.0
            scores["N"] += 1.8
        elif tr["behind"] and tr["below_index_pip"] and dist["thumb_middle_pip"] < 0.50:
            scores["N"] += 5.0
            scores["M"] += 1.8
        elif (
            dist["thumb_index_pip"] < 0.44
            and dist["thumb_middle_pip"] < 0.46
            and tr["above_index_pip"]
            and not tr["outside_index"]
            and not tr["in_front"]
        ):
            scores["T"] += 5.0
            scores["S"] += 1.8
        elif tr["in_front"] and dist["thumb_index_pip"] < 0.52 and dist["thumb_middle_pip"] < 0.52:
            scores["S"] += 5.0
            scores["T"] += 1.6
        else:
            scores["A"] += 3.6
            scores["S"] += 3.2

    max_s = max(scores.values())
    exps = {k: math.exp(v - max_s) for k, v in scores.items()}
    total = sum(exps.values())
    ranked = sorted(((k, v / total) for k, v in exps.items()), key=lambda x: x[1], reverse=True)
    return ranked[0][0], ranked[0][1], ranked[:3]


def _finger_chain(mcp: List[float], direction: Tuple[float, float, float], lengths: Tuple[float, float, float]) -> List[List[float]]:
    dx, dy, dz = direction
    norm = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    ux, uy, uz = dx / norm, dy / norm, dz / norm
    pip = [mcp[0] + ux * lengths[0], mcp[1] + uy * lengths[0], mcp[2] + uz * lengths[0]]
    dip = [pip[0] + ux * lengths[1], pip[1] + uy * lengths[1], pip[2] + uz * lengths[1]]
    tip = [dip[0] + ux * lengths[2], dip[1] + uy * lengths[2], dip[2] + uz * lengths[2]]
    return [list(mcp), pip, dip, tip]


def _curled_finger(mcp: List[float]) -> List[List[float]]:
    return [
        list(mcp),
        [mcp[0], mcp[1] - 0.035, -0.025],
        [mcp[0], mcp[1] + 0.015, -0.045],
        [mcp[0], mcp[1] + 0.065, -0.015],
    ]


def synthesize_hand_skeleton(label: str, noise_std: float = 0.008) -> np.ndarray:
    """Synthesizes 21 3D landmarks for any of the 28 ASL signs (for simulator mode)."""
    wrist = [0.50, 0.80, 0.0]
    lm = np.tile(wrist, (21, 1)).astype(np.float32)

    idx_mcp = [0.44, 0.58, 0.0]
    mid_mcp = [0.50, 0.56, 0.0]
    rng_mcp = [0.55, 0.58, 0.0]
    pnk_mcp = [0.60, 0.61, 0.0]

    def set_finger(start: int, chain: List[List[float]]) -> None:
        for i, pt in enumerate(chain):
            lm[start + i] = pt

    set_finger(5, _curled_finger(idx_mcp))
    set_finger(9, _curled_finger(mid_mcp))
    set_finger(13, _curled_finger(rng_mcp))
    set_finger(17, _curled_finger(pnk_mcp))
    lm[1] = [0.43, 0.73, 0.0]
    lm[2] = [0.40, 0.67, -0.01]
    lm[3] = [0.41, 0.61, -0.02]
    lm[4] = [0.40, 0.55, -0.02]

    seg = (0.07, 0.06, 0.055)
    mid_seg = (0.075, 0.065, 0.06)
    short_seg = (0.055, 0.048, 0.045)

    if label == "A":
        lm[3], lm[4] = [0.39, 0.60, -0.01], [0.39, 0.53, -0.01]
    elif label == "GOOD":
        lm[2], lm[3], lm[4] = [0.41, 0.64, -0.01], [0.40, 0.53, -0.01], [0.39, 0.39, -0.01]
    elif label == "B":
        set_finger(5, _finger_chain(idx_mcp, (0, -1, -0.05), seg))
        set_finger(9, _finger_chain(mid_mcp, (0, -1, -0.05), mid_seg))
        set_finger(13, _finger_chain(rng_mcp, (0, -1, -0.05), seg))
        set_finger(17, _finger_chain(pnk_mcp, (0, -1, -0.05), short_seg))
        lm[3], lm[4] = [0.47, 0.64, -0.03], [0.53, 0.62, -0.04]
    elif label == "SPACE":
        set_finger(5, _finger_chain(idx_mcp, (-0.35, -1, -0.05), seg))
        set_finger(9, _finger_chain(mid_mcp, (-0.05, -1, -0.05), mid_seg))
        set_finger(13, _finger_chain(rng_mcp, (0.22, -1, -0.05), seg))
        set_finger(17, _finger_chain(pnk_mcp, (0.50, -0.9, -0.05), short_seg))
        lm[2], lm[3], lm[4] = [0.36, 0.66, -0.01], [0.30, 0.60, -0.02], [0.24, 0.54, -0.03]
    elif label == "C":
        def arc(mcp: List[float], xs: float) -> List[List[float]]:
            return [
                mcp,
                [mcp[0] + xs - 0.01, mcp[1] - 0.08, -0.02],
                [mcp[0] + xs - 0.07, mcp[1] - 0.12, -0.06],
                [mcp[0] + xs - 0.12, mcp[1] - 0.07, -0.09],
            ]
        set_finger(5, arc(idx_mcp, 0.0))
        set_finger(9, arc(mid_mcp, -0.03))
        set_finger(13, arc(rng_mcp, -0.05))
        set_finger(17, arc(pnk_mcp, -0.07))
        lm[2], lm[3], lm[4] = [0.36, 0.71, -0.02], [0.32, 0.69, -0.06], [0.30, 0.67, -0.09]
    elif label == "D":
        set_finger(5, _finger_chain(idx_mcp, (0, -1, -0.05), seg))
        lm[3], lm[4] = [0.45, 0.64, -0.04], [0.49, 0.62, -0.05]
    elif label == "E":
        set_finger(5, [idx_mcp, [0.44, 0.53, -0.03], [0.44, 0.57, -0.04], [0.44, 0.61, -0.02]])
        set_finger(9, [mid_mcp, [0.50, 0.52, -0.03], [0.50, 0.56, -0.04], [0.50, 0.60, -0.02]])
        set_finger(13, [rng_mcp, [0.55, 0.53, -0.03], [0.55, 0.57, -0.04], [0.55, 0.61, -0.02]])
        set_finger(17, [pnk_mcp, [0.60, 0.56, -0.03], [0.60, 0.59, -0.04], [0.60, 0.62, -0.02]])
        lm[2], lm[3], lm[4] = [0.43, 0.72, -0.02], [0.47, 0.72, -0.03], [0.52, 0.72, -0.03]
    elif label == "F":
        set_finger(5, [idx_mcp, [0.43, 0.54, -0.04], [0.42, 0.57, -0.06], [0.41, 0.60, -0.07]])
        set_finger(9, _finger_chain(mid_mcp, (0.05, -1, -0.04), mid_seg))
        set_finger(13, _finger_chain(rng_mcp, (0.15, -1, -0.04), seg))
        set_finger(17, _finger_chain(pnk_mcp, (0.25, -1, -0.04), short_seg))
        lm[3], lm[4] = [0.40, 0.62, -0.05], [0.41, 0.60, -0.07]
    elif label == "G":
        set_finger(5, _finger_chain(idx_mcp, (-1, 0.05, -0.03), seg))
        lm[2], lm[3], lm[4] = [0.37, 0.68, -0.02], [0.31, 0.67, -0.03], [0.25, 0.66, -0.04]
    elif label == "H":
        set_finger(5, _finger_chain(idx_mcp, (-1, 0.03, -0.03), seg))
        set_finger(9, _finger_chain(mid_mcp, (-1, 0.06, -0.03), seg))
        lm[3], lm[4] = [0.44, 0.66, -0.04], [0.48, 0.65, -0.05]
    elif label == "I":
        set_finger(17, _finger_chain(pnk_mcp, (0.05, -1, -0.04), short_seg))
        lm[3], lm[4] = [0.46, 0.63, -0.04], [0.51, 0.61, -0.05]
    elif label == "K":
        set_finger(5, _finger_chain(idx_mcp, (-0.25, -1, -0.03), seg))
        set_finger(9, _finger_chain(mid_mcp, (0.28, -1, -0.03), mid_seg))
        lm[2], lm[3], lm[4] = [0.44, 0.64, -0.02], [0.47, 0.58, -0.03], [0.49, 0.52, -0.04]
    elif label == "L":
        set_finger(5, _finger_chain(idx_mcp, (0, -1, -0.03), seg))
        lm[2], lm[3], lm[4] = [0.36, 0.68, -0.01], [0.29, 0.67, -0.02], [0.22, 0.66, -0.02]
    elif label == "M":
        lm[3], lm[4] = [0.51, 0.63, 0.01], [0.57, 0.60, 0.01]
    elif label == "N":
        lm[3], lm[4] = [0.45, 0.63, 0.01], [0.47, 0.60, 0.01]
    elif label == "O":
        set_finger(5, [idx_mcp, [0.41, 0.53, -0.04], [0.39, 0.57, -0.07], [0.40, 0.62, -0.08]])
        set_finger(9, [mid_mcp, [0.47, 0.51, -0.04], [0.44, 0.56, -0.07], [0.42, 0.62, -0.08]])
        set_finger(13, [rng_mcp, [0.52, 0.53, -0.04], [0.48, 0.58, -0.07], [0.44, 0.63, -0.08]])
        set_finger(17, [pnk_mcp, [0.57, 0.57, -0.04], [0.52, 0.61, -0.07], [0.47, 0.64, -0.08]])
        lm[3], lm[4] = [0.39, 0.64, -0.05], [0.40, 0.62, -0.08]
    elif label == "P":
        set_finger(5, _finger_chain(idx_mcp, (-0.15, 1, -0.04), seg))
        set_finger(9, _finger_chain(mid_mcp, (0.15, 1, -0.04), seg))
        lm[3], lm[4] = [0.45, 0.64, -0.03], [0.48, 0.67, -0.04]
    elif label == "Q":
        set_finger(5, _finger_chain(idx_mcp, (-0.15, 1, -0.04), seg))
        lm[2], lm[3], lm[4] = [0.39, 0.70, -0.02], [0.37, 0.76, -0.04], [0.35, 0.82, -0.05]
    elif label == "R":
        set_finger(5, _finger_chain(idx_mcp, (0.25, -1, -0.03), seg))
        set_finger(9, _finger_chain(mid_mcp, (-0.25, -1, -0.01), mid_seg))
        lm[3], lm[4] = [0.47, 0.63, -0.04], [0.52, 0.62, -0.05]
    elif label == "S":
        lm[3], lm[4] = [0.44, 0.55, -0.06], [0.50, 0.55, -0.07]
    elif label == "T":
        lm[3], lm[4] = [0.45, 0.56, -0.015], [0.47, 0.50, -0.015]
    elif label == "U":
        set_finger(5, _finger_chain(idx_mcp, (0.02, -1, -0.04), seg))
        set_finger(9, _finger_chain(mid_mcp, (-0.02, -1, -0.04), mid_seg))
        lm[3], lm[4] = [0.47, 0.63, -0.04], [0.52, 0.61, -0.05]
    elif label == "V":
        set_finger(5, _finger_chain(idx_mcp, (-0.35, -1, -0.04), seg))
        set_finger(9, _finger_chain(mid_mcp, (0.35, -1, -0.04), mid_seg))
        lm[3], lm[4] = [0.46, 0.64, -0.04], [0.51, 0.62, -0.05]
    elif label == "W":
        set_finger(5, _finger_chain(idx_mcp, (-0.35, -1, -0.04), seg))
        set_finger(9, _finger_chain(mid_mcp, (0.0, -1, -0.04), mid_seg))
        set_finger(13, _finger_chain(rng_mcp, (0.35, -1, -0.04), seg))
        lm[3], lm[4] = [0.47, 0.64, -0.04], [0.53, 0.63, -0.05]
    elif label == "X":
        set_finger(5, [idx_mcp, [0.44, 0.47, -0.02], [0.43, 0.50, -0.07], [0.43, 0.56, -0.08]])
        lm[3], lm[4] = [0.46, 0.64, -0.04], [0.51, 0.62, -0.05]
    elif label == "Y":
        set_finger(17, _finger_chain(pnk_mcp, (0.45, -0.9, -0.03), short_seg))
        lm[2], lm[3], lm[4] = [0.36, 0.67, -0.01], [0.30, 0.62, -0.02], [0.24, 0.57, -0.03]
    elif label == "ILY":
        set_finger(5, _finger_chain(idx_mcp, (-0.08, -1, -0.03), seg))
        set_finger(17, _finger_chain(pnk_mcp, (0.35, -0.95, -0.03), short_seg))
        lm[2], lm[3], lm[4] = [0.36, 0.67, -0.01], [0.30, 0.62, -0.02], [0.24, 0.57, -0.03]
    elif label == "NO":
        set_finger(5, _finger_chain(idx_mcp, (-0.05, -0.45, -0.89), (0.06, 0.05, 0.045)))
        set_finger(9, _finger_chain(mid_mcp, (-0.35, -0.42, -0.84), (0.06, 0.05, 0.045)))
        lm[2], lm[3], lm[4] = [0.41, 0.63, -0.05], [0.42, 0.57, -0.10], [0.43, 0.50, -0.14]

    if noise_std > 0:
        lm += np.random.normal(0.0, noise_std, lm.shape).astype(np.float32)
    return lm


def draw_landmarks_and_box(
    frame: np.ndarray,
    landmarks: np.ndarray,
    label: str,
    confidence: float,
    threshold: float,
) -> None:
    """Draws hand skeleton mesh, joints, and bounding box on an OpenCV BGR frame."""
    h, w, _ = frame.shape
    pts = [(int(lm[0] * w), int(lm[1] * h)) for lm in landmarks]

    for start_idx, end_idx in HAND_CONNECTIONS:
        cv2.line(frame, pts[start_idx], pts[end_idx], (248, 189, 56), 2)

    for i, (px, py) in enumerate(pts):
        color = (0, 0, 255) if i == 0 else (255, 255, 255)
        radius = 6 if i in (0, 4, 8, 12, 16, 20) else 4
        cv2.circle(frame, (px, py), radius, color, -1)
        cv2.circle(frame, (px, py), radius, (15, 23, 42), 1)

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x1, x2 = max(0, min(xs) - 20), min(w, max(xs) + 20)
    y1, y2 = max(0, min(ys) - 20), min(h, max(ys) + 20)

    box_color = (34, 197, 94) if confidence >= threshold else (0, 165, 255)
    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
    tag = f"{label} ({confidence * 100:.0f}%)"
    cv2.rectangle(frame, (x1, max(0, y1 - 28)), (x1 + len(tag) * 11 + 12, y1), box_color, -1)
    cv2.putText(frame, tag, (x1 + 6, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)


def draw_hud(
    frame: np.ndarray,
    sentence: str,
    top_char: Optional[str],
    top_conf: float,
    top3: List[Tuple[str, float]],
    fps: float,
    hold_count: int,
    debounce_frames: int,
    threshold: float,
) -> None:
    """Renders sentence bar and classification metrics HUD onto the frame."""
    h, w, _ = frame.shape

    # Top sentence banner
    cv2.rectangle(frame, (0, 0), (w, 64), (15, 23, 42), -1)
    display_text = sentence if sentence else "(Hold a sign steady to build a sentence...)"
    cv2.putText(frame, f"Sentence: {display_text[-48:]}", (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (134, 239, 172), 2)

    # Bottom status bar
    cv2.rectangle(frame, (0, h - 78), (w, h), (15, 23, 42), -1)
    sign_txt = f"{top_char} ({top_conf * 100:.1f}%)" if (top_char and top_conf >= threshold) else "Waiting..."
    cv2.putText(frame, f"Sign: {sign_txt}", (16, h - 46), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    top3_txt = " | ".join(f"{c}:{p * 100:.0f}%" for c, p in top3) if top3 else "-"
    cv2.putText(frame, f"Top-3: {top3_txt}", (16, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (203, 213, 225), 1)

    hud_right = f"FPS:{fps:.1f} | Hold:{hold_count}/{debounce_frames} | [SPACE/d/c/m/l/q]"
    cv2.putText(frame, hud_right, (max(16, w - 470), h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (148, 163, 184), 1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Real-Time ASL Gesture Recognition (28 Signs)")
    parser.add_argument("--camera", type=int, default=0, help="OpenCV camera device index")
    parser.add_argument("--threshold", type=float, default=0.75, help="Confidence threshold (0.0-1.0)")
    parser.add_argument("--debounce", type=int, default=12, help="Frames to hold sign before appending")
    parser.add_argument("--simulate", action="store_true", help="Cycle through synthesized 28 ASL signs")
    args = parser.parse_args()

    sentence = ""
    candidate_char: Optional[str] = None
    hold_count = 0
    mirror = True
    show_landmarks = True

    cap = None
    hands = None

    if not args.simulate:
        cap = cv2.VideoCapture(args.camera)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        if not cap.isOpened():
            print(f"[Warning] Could not open camera {args.camera}; switching to --simulate mode.")
            args.simulate = True
        else:
            mp_hands = mp.solutions.hands
            hands = mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=1,
                min_detection_confidence=0.6,
                min_tracking_confidence=0.5,
            )

    prev_time = time.time()
    sim_idx = 0
    sim_last_switch = time.time()

    print("Started ASL Translator. Keys: SPACE=space, d/Backspace=delete, c=clear, m=mirror, l=landmarks, q=quit")

    try:
        while True:
            now = time.time()
            fps = 1.0 / max(1e-6, now - prev_time)
            prev_time = now

            top_char: Optional[str] = None
            top_conf = 0.0
            top3: List[Tuple[str, float]] = []

            if args.simulate:
                frame = np.full((720, 1280, 3), 15, dtype=np.uint8)
                if now - sim_last_switch > 2.0:
                    sim_idx = (sim_idx + 1) % len(ASL_CLASSES)
                    sim_last_switch = now
                target_sign = ASL_CLASSES[sim_idx]
                lm_arr = synthesize_hand_skeleton(target_sign, noise_std=0.008)
                top_char, top_conf, top3 = classify_gesture(lm_arr)
                if show_landmarks:
                    draw_landmarks_and_box(frame, lm_arr, top_char, top_conf, args.threshold)
                cv2.putText(
                    frame,
                    f"SIMULATOR | Target: {target_sign} ({GESTURE_DESCRIPTIONS.get(target_sign, '')[:42]})",
                    (16, 92),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (148, 163, 184),
                    1,
                )
            else:
                ret, frame = cap.read()
                if not ret:
                    if cv2.waitKey(10) & 0xFF in (ord("q"), 27):
                        break
                    continue
                if mirror:
                    frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = hands.process(rgb)

                if results.multi_hand_landmarks:
                    hand_lm = results.multi_hand_landmarks[0]
                    lm_arr = np.array([[lm.x, lm.y, lm.z] for lm in hand_lm.landmark], dtype=np.float32)
                    top_char, top_conf, top3 = classify_gesture(lm_arr)
                    if show_landmarks:
                        draw_landmarks_and_box(frame, lm_arr, top_char, top_conf, args.threshold)

            # Debounced sentence builder
            if top_char and top_conf >= args.threshold:
                if top_char == candidate_char:
                    hold_count += 1
                else:
                    candidate_char = top_char
                    hold_count = 1
                if hold_count == args.debounce:
                    sentence += format_sign_for_sentence(top_char)
            else:
                candidate_char = None
                hold_count = 0

            draw_hud(frame, sentence, top_char, top_conf, top3, fps, hold_count, args.debounce, args.threshold)
            cv2.imshow("Real-Time ASL Translator (28 Signs)", frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            elif key == ord(" "):
                sentence += " "
            elif key in (8, 127, ord("d")):
                sentence = sentence[:-1]
            elif key == ord("c"):
                sentence = ""
            elif key == ord("m"):
                mirror = not mirror
            elif key == ord("l"):
                show_landmarks = not show_landmarks
    finally:
        if cap is not None:
            cap.release()
        if hands is not None:
            hands.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

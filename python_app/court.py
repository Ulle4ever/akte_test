"""Court geometry and homography math, ported from the previous JS tool's well-tested
implementation (spielzug-analyse.html: computeHomography/applyHomography/invertHomography,
assessCalibrationSensitivity, assessCourtSpanCoverage). Kept numerically identical to that
version rather than swapped for cv2.findHomography, so the calibration-quality warnings behave
exactly as already validated.
"""
import numpy as np

COURT_WIDTH_M = 15.0
COURT_DEPTH_M = 14.0

# Named calibration handles: real-world (x, y) in meters, half-court, basket at y=0, origin at the
# near-left corner. Any 4+ of these can be used for calibration, whichever are visible in a given
# camera angle.
HANDLES = {
    "baseline_l": (0, 0), "baseline_r": (15, 0),
    "half_l": (0, 14), "half_r": (15, 14),
    "ft_l": (5.05, 5.8), "ft_r": (9.95, 5.8),
    "lane_base_l": (5.05, 0), "lane_base_r": (9.95, 0),
    "three_base_l": (0.9, 0), "three_base_r": (14.1, 0),
    "three_corner_l": (0.9, 2.99), "three_corner_r": (14.1, 2.99),
    "ftcircle_l": (5.7, 5.8), "ftcircle_r": (9.3, 5.8),
    "halfcircle_l": (5.7, 14), "halfcircle_r": (9.3, 14),
    "backboard_l": (6.6, 1.2), "backboard_r": (8.4, 1.2),
}

CALIB_JITTER_PX = 3
CALIB_SENSITIVITY_WARN_M = 0.5
CALIB_SENSITIVITY_BLOCK_M = 3
COURT_COVERAGE_WARN_FRAC = 0.5


def compute_homography(src, dst):
    """DLT via least squares (plain normal-equations solve, matching the JS port exactly),
    src/dst: lists of (x, y) pairs, >=4 correspondences. Returns a 3x3 matrix mapping src -> dst
    in homogeneous coordinates."""
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    if len(src) < 4:
        raise ValueError("need at least 4 point correspondences")
    A = np.zeros((8, 8))
    b = np.zeros(8)
    for (x, y), (X, Y) in zip(src, dst):
        row1 = np.array([x, y, 1, 0, 0, 0, -X * x, -X * y])
        row2 = np.array([0, 0, 0, x, y, 1, -Y * x, -Y * y])
        A += np.outer(row1, row1) + np.outer(row2, row2)
        b += row1 * X + row2 * Y
    h = np.linalg.solve(A, b)
    return np.array([[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1.0]])


def apply_homography(H, x, y):
    w = H[2, 0] * x + H[2, 1] * y + H[2, 2]
    rx = (H[0, 0] * x + H[0, 1] * y + H[0, 2]) / w
    ry = (H[1, 0] * x + H[1, 1] * y + H[1, 2]) / w
    return rx, ry


def invert_homography(H):
    try:
        return np.linalg.inv(H)
    except np.linalg.LinAlgError:
        return None


def assess_calibration_sensitivity(native_pts, real_pts):
    """How much a point near the middle of the anchored points shifts in real-world meters if one
    calibration point was off by a few pixels - catches calibrations over-fit to noise."""
    native_pts = np.asarray(native_pts, dtype=np.float64)
    mid = native_pts.mean(axis=0)
    try:
        base = apply_homography(compute_homography(native_pts, real_pts), mid[0], mid[1])
    except np.linalg.LinAlgError:
        return float("inf")
    max_shift = 0.0
    for i in range(len(native_pts)):
        for dx, dy in [(CALIB_JITTER_PX, 0), (-CALIB_JITTER_PX, 0), (0, CALIB_JITTER_PX), (0, -CALIB_JITTER_PX)]:
            perturbed = native_pts.copy()
            perturbed[i] += (dx, dy)
            try:
                proj = apply_homography(compute_homography(perturbed, real_pts), mid[0], mid[1])
            except np.linalg.LinAlgError:
                return float("inf")
            shift = ((proj[0] - base[0]) ** 2 + (proj[1] - base[1]) ** 2) ** 0.5
            max_shift = max(max_shift, shift)
    return max_shift


def assess_court_span_coverage(real_pts):
    xs = [p[0] for p in real_pts]
    ys = [p[1] for p in real_pts]
    frac_x = (max(xs) - min(xs)) / COURT_WIDTH_M
    frac_y = (max(ys) - min(ys)) / COURT_DEPTH_M
    return {"frac": min(frac_x, frac_y), "fracX": frac_x, "fracY": frac_y}


def calib_sensitivity_message(point_sensitivity, coverage_frac):
    """Returns (blocking: bool, text: str) - mirrors calibSensitivityMessage() in the JS tool."""
    if point_sensitivity is None or not np.isfinite(point_sensitivity) or point_sensitivity > CALIB_SENSITIVITY_BLOCK_M:
        return True, (
            "Diese Punkte lassen sich nicht eindeutig zu einer Feld-Kalibrierung auflösen - sie "
            "liegen (fast) exakt auf einer Linie. Wähle mindestens einen zusätzlichen Punkt, der in "
            "die Tiefe des Feldes zeigt (z.B. Freiwurflinie, Mittellinie oder Drei-Punkte-Bogen)."
        )
    low_coverage = coverage_frac is not None and coverage_frac["frac"] < COURT_COVERAGE_WARN_FRAC
    if low_coverage:
        needs_width = coverage_frac["fracX"] < COURT_COVERAGE_WARN_FRAC
        needs_depth = coverage_frac["fracY"] < COURT_COVERAGE_WARN_FRAC
        if needs_width and needs_depth:
            advice = "in der Breite UND in der Tiefe"
        elif needs_width:
            advice = "in der Breite"
        else:
            advice = "in der Tiefe"
        return False, (
            f"Die gesetzten Punkte decken nur {round(coverage_frac['fracX']*100)}% der Breite und "
            f"{round(coverage_frac['fracY']*100)}% der Tiefe des Spielfelds ab - für Spieler außerhalb "
            f"dieses Bereichs kann die berechnete Position um mehrere Meter danebenliegen. Zusätzliche "
            f"Referenzpunkte setzen, die weiter auseinanderliegen {advice}."
        )
    if point_sensitivity > CALIB_SENSITIVITY_WARN_M:
        return False, (
            f"Diese Kalibrierung reagiert empfindlich auf kleine Ungenauigkeiten "
            f"(~{point_sensitivity:.1f} m Verschiebung schon bei wenigen Pixeln Abweichung)."
        )
    return False, ""


# Court line segments/arcs for drawing the tactical diagram, in the same real-world meter
# coordinates as HANDLES (half-court, basket at y=0).
def _arc(cx, cy, r, start_deg, end_deg, n=48):
    pts = []
    for i in range(n + 1):
        a = np.radians(start_deg + (end_deg - start_deg) * i / n)
        pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return pts


COURT_PATHS = [
    [(0, 0), (15, 0), (15, 14), (0, 14), (0, 0)],
    [(5.05, 0), (9.95, 0), (9.95, 5.8), (5.05, 5.8), (5.05, 0)],
    _arc(7.5, 5.8, 1.8, 0, 360),
    _arc(7.5, 1.575, 1.25, 0, 180),
    [(0.9, 0), (0.9, 2.99)],
    [(14.1, 0), (14.1, 2.99)],
    _arc(7.5, 1.575, 6.75, 12, 168),
    _arc(7.5, 14, 1.8, 180, 360),
    [(6.6, 1.2), (8.4, 1.2)],
    _arc(7.5, 1.575, 0.225, 0, 360),
]

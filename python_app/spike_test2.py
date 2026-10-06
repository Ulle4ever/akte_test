"""Follow-up spike test: the raw spike_test.py result showed 151 distinct track IDs and up to 24
"people" per frame in a 13s clip - clearly picking up crowd/spectators in the stands, not just
the ~10 real players on court, and that false-positive churn was likely dominating the "151 IDs"
number. This applies the exact same court-bounds + height-plausibility filter the old JS tool used
(using the SAME committed calibration points from the real-video tests there, for direct
comparability) and checks whether the ON-COURT-ONLY track identities are actually stable."""
import cv2
import numpy as np
from ultralytics import YOLO

import court

VIDEO = "/tmp/claude-0/-home-user-akte-test/4de499d0-5580-573b-bcb0-7d4dcc20a6ff/scratchpad/servedir2/user_koeln_hagen.webm"

# Same calibration points used in the old JS tool's test_realistic_fullplay.js, for direct comparison:
# lane_base_l->(195,195), lane_base_r->(290,195), ft_l->(205,290), ft_r->(285,290)
native_pts = [(195, 195), (290, 195), (205, 290), (285, 290)]
real_pts = [court.HANDLES["lane_base_l"], court.HANDLES["lane_base_r"], court.HANDLES["ft_l"], court.HANDLES["ft_r"]]
H = court.compute_homography(native_pts, real_pts)
Hinv = court.invert_homography(H)
print("Coverage:", court.assess_court_span_coverage(real_pts))

COURT_MARGIN_M = 2.0
PLAYER_HEIGHT_M = 1.85
PLAYER_HEIGHT_MIN_FRAC = 0.35
PLAYER_HEIGHT_MAX_FRAC = 2.2


def meters_per_pixel_at(nx, ny):
    cx, cy = court.apply_homography(H, nx, ny)
    nx2, ny2 = court.apply_homography(Hinv, cx + 1, cy)
    d = ((nx2 - nx) ** 2 + (ny2 - ny) ** 2) ** 0.5
    return d if d > 0 and np.isfinite(d) else None


def on_court_plausible(fx, fy, box_h):
    cx, cy = court.apply_homography(H, fx, fy)
    if not (-COURT_MARGIN_M <= cx <= 15 + COURT_MARGIN_M and -COURT_MARGIN_M <= cy <= 14 + COURT_MARGIN_M):
        return False
    px_per_m = meters_per_pixel_at(fx, fy)
    if px_per_m:
        expected = px_per_m * PLAYER_HEIGHT_M
        if not (expected * PLAYER_HEIGHT_MIN_FRAC <= box_h <= expected * PLAYER_HEIGHT_MAX_FRAC):
            return False
    return True


model = YOLO("yolo11n.pt")
cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)

frame_idx = 0
all_ids_ever = set()
per_frame_counts = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    results = model.track(frame, persist=True, tracker="bytetrack.yaml", classes=[0], conf=0.15, verbose=False)
    boxes = results[0].boxes
    kept_ids = []
    if boxes.id is not None:
        ids = boxes.id.int().tolist()
        xyxy = boxes.xyxy.tolist()
        for tid, (x1, y1, x2, y2) in zip(ids, xyxy):
            fx, fy = (x1 + x2) / 2.0, y2
            if on_court_plausible(fx, fy, y2 - y1):
                kept_ids.append(tid)
    per_frame_counts.append(len(kept_ids))
    all_ids_ever.update(kept_ids)
    if frame_idx % 15 == 0:
        print(f"frame {frame_idx} (t={frame_idx/fps:.2f}s): {len(kept_ids)} on-court people, ids={sorted(kept_ids)}")
    frame_idx += 1

print(f"\nTotal distinct ON-COURT track IDs ever seen: {len(all_ids_ever)} -> {sorted(all_ids_ever)}")
print(f"Per-frame on-court count: min={min(per_frame_counts)}, max={max(per_frame_counts)}, avg={sum(per_frame_counts)/len(per_frame_counts):.1f}")
cap.release()

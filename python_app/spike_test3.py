"""Spike test for two NEW, untried levers (not yet tried in spike_test.py/spike_test2.py):

1. Crop to the court's region (derived from the calibration homography, not hand-eyeballed) and
   upscale BEFORE running detection - gives small/distant players more effective resolution
   without the downside seen when upscaling the WHOLE frame (spike_test's imgsz=1280 run: MORE
   crowd false positives, much slower). Cropping first means the crowd/stands are mostly outside
   the crop to begin with.
2. A tuned ByteTrack config (larger track_buffer, more lenient match_thresh) - more tolerant of
   the confidence flicker already identified as the real bottleneck, at the cost of slightly more
   risk of two close players swapping identity.

Measures the same track-churn metric as before so results are directly comparable.
"""
import time

import cv2
import numpy as np
from ultralytics import YOLO

import court

VIDEO = "/tmp/claude-0/-home-user-akte-test/4de499d0-5580-573b-bcb0-7d4dcc20a6ff/scratchpad/servedir2/user_koeln_hagen.webm"

# Same reasonable (not perfect, but visually-grounded) calibration found earlier by examining the
# actual frame - free-throw lane corners + free-throw circle width.
native = [(265, 155), (330, 155), (305, 280), (375, 280)]
real = [court.HANDLES["lane_base_l"], court.HANDLES["lane_base_r"],
        court.HANDLES["ftcircle_l"], court.HANDLES["ftcircle_r"]]
H = court.compute_homography(native, real)
Hinv = court.invert_homography(H)
cov = court.assess_court_span_coverage(real)
print("Calibration coverage:", cov)

# Derive a native-pixel crop region from the homography: project the full court + a margin back
# to native pixels, take the bounding box. This is principled (uses the actual calibration)
# rather than a hand-eyeballed polygon.
MARGIN_M = 3.0
corners_m = [(-MARGIN_M, -MARGIN_M), (court.COURT_WIDTH_M + MARGIN_M, -MARGIN_M),
             (court.COURT_WIDTH_M + MARGIN_M, court.COURT_DEPTH_M + MARGIN_M),
             (-MARGIN_M, court.COURT_DEPTH_M + MARGIN_M)]
native_corners = [court.apply_homography(Hinv, x, y) for x, y in corners_m]
xs = [p[0] for p in native_corners]
ys = [p[1] for p in native_corners]
print("Projected crop corners (native px):", [(round(x), round(y)) for x, y in native_corners])

cap = cv2.VideoCapture(VIDEO)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
Hh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)
crop_x0 = max(0, int(min(xs)))
crop_y0 = max(0, int(min(ys)))
crop_x1 = min(W, int(max(xs)))
crop_y1 = min(Hh, int(max(ys)))
print(f"Final crop box (clipped to frame {W}x{Hh}): ({crop_x0},{crop_y0})-({crop_x1},{crop_y1})")

UPSCALE = 2.0
crop_w, crop_h = crop_x1 - crop_x0, crop_y1 - crop_y0

# Custom tracker config: larger buffer (survive longer occlusion/confidence dips without a new
# ID), more lenient match threshold (allow a bit more positional/IoU slack per match attempt).
CUSTOM_TRACKER = "/tmp/custom_bytetrack.yaml"
with open(CUSTOM_TRACKER, "w") as f:
    f.write("""
tracker_type: bytetrack
track_high_thresh: 0.2
track_low_thresh: 0.1
new_track_thresh: 0.3
track_buffer: 90
match_thresh: 0.9
fuse_score: True
""")

model = YOLO("yolo11m.pt")

frame_idx = 0
all_ids = set()
per_frame = []
t0 = time.time()
while True:
    ok, frame = cap.read()
    if not ok:
        break
    crop = frame[crop_y0:crop_y1, crop_x0:crop_x1]
    crop_up = cv2.resize(crop, (int(crop_w * UPSCALE), int(crop_h * UPSCALE)))
    results = model.track(crop_up, persist=True, tracker=CUSTOM_TRACKER, classes=[0],
                           conf=0.15, verbose=False)
    boxes = results[0].boxes
    kept = []
    if boxes.id is not None:
        for tid, (x1, y1, x2, y2) in zip(boxes.id.int().tolist(), boxes.xyxy.tolist()):
            # map back to full-frame native coords
            fx1, fy1 = crop_x0 + x1 / UPSCALE, crop_y0 + y1 / UPSCALE
            fx2, fy2 = crop_x0 + x2 / UPSCALE, crop_y0 + y2 / UPSCALE
            box_h = fy2 - fy1
            if box_h < 18:
                continue
            kept.append((tid, (fx1 + fx2) / 2, fy2))
    per_frame.append(len(kept))
    all_ids.update(tid for tid, _, _ in kept)
    if frame_idx % 30 == 0:
        print(f"frame {frame_idx} (t={frame_idx/fps:.2f}s, {time.time()-t0:.1f}s elapsed): "
              f"{len(kept)} people, ids={sorted(t for t,_,_ in kept)}")
    frame_idx += 1

print()
print(f"Processed {frame_idx} frames in {time.time()-t0:.1f}s")
print("Total distinct IDs (cropped+upscaled, tuned tracker):", len(all_ids))
print("counts min/max/avg:", min(per_frame), max(per_frame), sum(per_frame) / len(per_frame))
cap.release()

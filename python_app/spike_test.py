"""Spike test: validate YOLO + ByteTrack detection/tracking quality on the user's real video
before building the full pipeline/UI around it. Prints per-frame track counts and IDs so we can
see directly whether track identities stay stable (the old tool's main complaint) and how many
people get detected per frame (the old tool's other complaint)."""
import sys
import time

import cv2
from ultralytics import YOLO

VIDEO = "/tmp/claude-0/-home-user-akte-test/4de499d0-5580-573b-bcb0-7d4dcc20a6ff/scratchpad/servedir2/user_koeln_hagen.webm"

print("Loading YOLO11n...")
t0 = time.time()
model = YOLO("yolo11n.pt")
print(f"Loaded in {time.time()-t0:.1f}s")

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"Video: {w}x{h}, {fps:.2f} fps, {total_frames} frames, {total_frames/fps:.1f}s")

frame_idx = 0
t0 = time.time()
all_ids_ever = set()
per_frame_counts = []
max_track_id_jumps = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    results = model.track(frame, persist=True, tracker="bytetrack.yaml", classes=[0], verbose=False)
    boxes = results[0].boxes
    ids = boxes.id.int().tolist() if boxes.id is not None else []
    confs = boxes.conf.tolist() if boxes.conf is not None else []
    per_frame_counts.append(len(ids))
    all_ids_ever.update(ids)
    if frame_idx % 15 == 0:
        print(f"frame {frame_idx} (t={frame_idx/fps:.2f}s): {len(ids)} people, ids={sorted(ids)}, confs={[round(c,2) for c in confs]}")
    frame_idx += 1

elapsed = time.time() - t0
print(f"\nProcessed {frame_idx} frames in {elapsed:.1f}s ({frame_idx/elapsed:.1f} fps)")
print(f"Total distinct track IDs ever seen: {len(all_ids_ever)} -> {sorted(all_ids_ever)}")
print(f"Per-frame person count: min={min(per_frame_counts)}, max={max(per_frame_counts)}, avg={sum(per_frame_counts)/len(per_frame_counts):.1f}")
cap.release()

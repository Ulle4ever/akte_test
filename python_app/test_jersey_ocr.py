"""Feasibility test: can generic (untrained) OCR read jersey numbers from the real test video?
If yes, this is a much bigger lever than custom training - it would let the tool re-identify a
player by their actual number whenever it's legible, sidestepping the appearance-based
confidence-flicker problem entirely. If no, this result still answers the question cheaply.

Approach: detect people with the already-tested YOLO model, crop the upper-torso region (where a
jersey number usually sits) of each box, upscale it, run EasyOCR, print whatever it reads -
no ground truth needed to get a first read on legibility.
"""
import cv2
import easyocr
from ultralytics import YOLO

VIDEO = "/tmp/claude-0/-home-user-akte-test/4de499d0-5580-573b-bcb0-7d4dcc20a6ff/scratchpad/servedir2/user_koeln_hagen.webm"

print("Loading YOLO...")
model = YOLO("yolo11m.pt")
print("Loading EasyOCR (downloads detection+recognition models on first run)...")
reader = easyocr.Reader(["en"], gpu=False)
print("Loaded.")

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)

# Sample a handful of frames spread through the clip, not every frame (OCR is slow on CPU).
sample_times = [1.0, 2.5, 4.0, 5.5, 7.0, 8.5, 10.0, 11.5]
for t in sample_times:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ok, frame = cap.read()
    if not ok:
        continue
    results = model.predict(frame, classes=[0], conf=0.25, verbose=False)
    boxes = results[0].boxes.xyxy.tolist()
    print(f"\n--- t={t}s, {len(boxes)} people detected ---")
    for i, (x1, y1, x2, y2) in enumerate(boxes):
        x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
        h = y2 - y1
        if h < 30:
            continue
        # Jersey number sits roughly in the upper-middle of the torso: skip the head (~top 15%),
        # take down to about 55% of the box height, full width.
        ty1 = y1 + int(h * 0.15)
        ty2 = y1 + int(h * 0.55)
        crop = frame[max(0, ty1):ty2, max(0, x1):x2]
        if crop.size == 0 or crop.shape[0] < 10 or crop.shape[1] < 10:
            continue
        scale = max(1, 200 // max(1, crop.shape[0]))
        crop_up = cv2.resize(crop, (crop.shape[1] * scale, crop.shape[0] * scale), interpolation=cv2.INTER_CUBIC)
        result = reader.readtext(crop_up, allowlist="0123456789", detail=1)
        if result:
            texts = [(txt, round(conf, 2)) for (_, txt, conf) in result]
            print(f"  person {i} box=({x1},{y1},{x2},{y2}) h={h}px -> OCR: {texts}")
        else:
            print(f"  person {i} box=({x1},{y1},{x2},{y2}) h={h}px -> OCR: (nothing read)")
        crop_path = f"/tmp/jersey_crop_t{t}_p{i}.png"
        cv2.imwrite(crop_path, crop_up)

cap.release()
print("\nDone. Crops saved to /tmp/jersey_crop_*.png for visual inspection.")

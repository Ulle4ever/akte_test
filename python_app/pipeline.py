"""Core video processing pipeline: run YOLO + ByteTrack across every frame of a video, then
filter to plausible on-court people and project surviving foot points to court coordinates via a
committed homography.

This replaces the old JS tool's two separate, hand-rolled pieces (coco-ssd per-moment detection +
a custom NCC template tracker for continuity) with a single, battle-tested multi-object tracker
(ByteTrack, bundled with Ultralytics). Validated against the user's real video (see spike_test*.py):
the tracker itself is not the bottleneck - detection confidence genuinely flickers frame-to-frame
for small/fast/occluded players under a generic pretrained model, so track IDs still churn more
than a "near-100% automatic" bar would need. The on-court + height-plausibility filter (ported from
the old tool, see court.py) at least removes crowd/bench false positives, and the merge-tracks tool
in the UI makes fixing the residual churn fast.
"""
from dataclasses import dataclass, field

import cv2
from ultralytics import YOLO

import court

PERSON_CLASS_ID = 0  # COCO class index for "person"
PLAYER_HEIGHT_M = 1.85
PLAYER_HEIGHT_MIN_FRAC = 0.35
PLAYER_HEIGHT_MAX_FRAC = 2.2


@dataclass
class TrackedFrame:
    time: float
    frame_idx: int
    # track_id -> {"nx","ny" (native pixel foot point), "x","y" (court meters, filled later),
    #              "conf", "bbox"}
    players: dict = field(default_factory=dict)


def foot_point_from_box(xyxy):
    x1, y1, x2, y2 = xyxy
    return (x1 + x2) / 2.0, y2


def _meters_per_pixel_at(H, Hinv, nx, ny):
    cx, cy = court.apply_homography(H, nx, ny)
    nx2, ny2 = court.apply_homography(Hinv, cx + 1, cy)
    d = ((nx2 - nx) ** 2 + (ny2 - ny) ** 2) ** 0.5
    return d if d > 0 else None


def _on_court_plausible(H, Hinv, fx, fy, box_h, margin_m):
    cx, cy = court.apply_homography(H, fx, fy)
    if not (-margin_m <= cx <= court.COURT_WIDTH_M + margin_m and
            -margin_m <= cy <= court.COURT_DEPTH_M + margin_m):
        return False
    px_per_m = _meters_per_pixel_at(H, Hinv, fx, fy)
    if px_per_m:
        expected = px_per_m * PLAYER_HEIGHT_M
        if not (expected * PLAYER_HEIGHT_MIN_FRAC <= box_h <= expected * PLAYER_HEIGHT_MAX_FRAC):
            return False
    return True


def run_detection_and_tracking(video_path, homography, model_path="yolo11m.pt", conf=0.25,
                                margin_m=2.0, tracker="bytetrack.yaml", progress_cb=None):
    """Runs YOLO+tracking across the whole video, keeping only detections that plausibly belong
    to a standing player somewhere on (or just off) the court, per the committed homography.
    Returns (fps, width, height, list[TrackedFrame]) with x,y (court meters) already filled in.
    """
    Hinv = court.invert_homography(homography)
    model = YOLO(model_path)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    frames = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        results = model.track(frame, persist=True, tracker=tracker, classes=[PERSON_CLASS_ID],
                               conf=conf, verbose=False)
        boxes = results[0].boxes
        tf = TrackedFrame(time=idx / fps, frame_idx=idx)
        if boxes.id is not None:
            ids = boxes.id.int().tolist()
            xyxy = boxes.xyxy.tolist()
            confs = boxes.conf.tolist()
            for tid, box, c in zip(ids, xyxy, confs):
                fx, fy = foot_point_from_box(box)
                box_h = box[3] - box[1]
                if not _on_court_plausible(homography, Hinv, fx, fy, box_h, margin_m):
                    continue
                cx, cy = court.apply_homography(homography, fx, fy)
                tf.players[tid] = {"nx": fx, "ny": fy, "x": cx, "y": cy, "conf": c, "bbox": box}
        frames.append(tf)
        if progress_cb:
            progress_cb(min(1.0, (idx + 1) / total_frames), tf)
        idx += 1
    cap.release()
    return fps, width, height, frames


def apply_track_merges(frames, merges):
    """merges: dict alias_track_id -> canonical_track_id. Rewrites every frame's player dict keys
    through the merge map (chases chains so merging A->B then B->C still resolves A->C)."""
    def resolve(tid):
        seen = set()
        while tid in merges and tid not in seen:
            seen.add(tid)
            tid = merges[tid]
        return tid

    for tf in frames:
        new_players = {}
        for tid, p in tf.players.items():
            rtid = resolve(tid)
            # If the canonical id is already present this frame (both seen briefly at once),
            # keep whichever has higher confidence rather than silently dropping one.
            if rtid in new_players and new_players[rtid]["conf"] >= p["conf"]:
                continue
            new_players[rtid] = p
        tf.players = new_players
    return frames

"""End-to-end smoke test of the Gradio app's underlying functions (not via browser/HTTP - direct
Python calls), using the real test video. Proves the full pipeline wiring works without crashing:
calibration -> processing -> offense selection -> merge -> diagram render. Calibration quality
itself is a separate, user-facing concern (handled via real clicks in the UI) - this reuses the
known 4-point calibration from the old tool's own tests for a working (if narrow-coverage) homography,
same caveat as already documented."""
import time

import app
import court

VIDEO = "/tmp/claude-0/-home-user-akte-test/4de499d0-5580-573b-bcb0-7d4dcc20a6ff/scratchpad/servedir2/user_koeln_hagen.webm"

print("1. Calibration")
points = [
    {"name": "lane_base_l", "px": 195, "py": 195},
    {"name": "lane_base_r", "px": 290, "py": 195},
    {"name": "ft_l", "px": 205, "py": 290},
    {"name": "ft_r", "px": 285, "py": 290},
]
H, status = app.on_commit_calibration(points)
print("  status:", status)
assert H is not None, "calibration failed"

print("2. Process video (this takes a while - yolo11m over the whole 13s clip)")
t0 = time.time()
processed, status = app.on_process_video(VIDEO, H, "yolo11m.pt", 0.25)
print(f"  status: {status} ({time.time()-t0:.1f}s)")
assert processed is not None

print("3. Simulate selecting 5 offense players by clicking the boxes at t=3.0s")


class FakeEvt:
    def __init__(self, x, y):
        self.index = (x, y)


selected_ids = []
real_player_spots = [(167, 410), (241, 413), (420, 471), (799, 454), (113, 408)]
for x, y in real_player_spots:
    selected_ids, img, msg = app.on_pick_offense(VIDEO, processed, 3.0, selected_ids, {}, FakeEvt(x, y))
    print("  ", msg)
print("  selected_ids:", selected_ids)

print("4. Merge test (no-op merge, just checking it doesn't crash)")
merges, msg = app.on_merge({}, 99999, 1)
print("  ", msg)

print("5. Render single-frame diagram")
out_path, msg = app.on_render_diagram(processed, selected_ids or [1], merges, 3.0, False)
print("  ", msg, "->", out_path)

print("6. Render storyboard diagram")
out_path2, msg2 = app.on_render_diagram(processed, selected_ids or [1], merges, 3.0, True)
print("  ", msg2, "->", out_path2)

print("\nALL SMOKE TEST STEPS COMPLETED WITHOUT CRASHING")

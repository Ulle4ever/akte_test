"""Spielzug-Analyse (neu): Basketball-Taktikdiagramm aus Video, komplett neu aufgebaut auf
YOLO11 + ByteTrack (statt der alten handgestrickten Erkennung). Siehe README.md für Hintergrund,
Grenzen und wie ein eigens trainiertes Modell später eingebunden wird.
"""
import os
import tempfile

import cv2
import gradio as gr
import numpy as np

import court
import diagram
import pipeline

HANDLE_LABELS = {
    "baseline_l": "Grundlinie links", "baseline_r": "Grundlinie rechts",
    "half_l": "Mittellinie links", "half_r": "Mittellinie rechts",
    "ft_l": "Freiwurflinie links", "ft_r": "Freiwurflinie rechts",
    "lane_base_l": "Zone an Grundlinie links", "lane_base_r": "Zone an Grundlinie rechts",
    "three_base_l": "3-Punkte an Grundlinie links", "three_base_r": "3-Punkte an Grundlinie rechts",
    "three_corner_l": "3-Punkte Corner links", "three_corner_r": "3-Punkte Corner rechts",
    "ftcircle_l": "Freiwurfkreis links", "ftcircle_r": "Freiwurfkreis rechts",
    "halfcircle_l": "Mittelkreis links", "halfcircle_r": "Mittelkreis rechts",
    "backboard_l": "Brett links", "backboard_r": "Brett rechts",
}
# Order the calibration dropdown auto-advances through - the first 4 are the ones used throughout
# testing (reliably visible in a typical half-court broadcast framing); anything after is offered
# for extra width/depth coverage once the status message asks for it.
RECOMMENDED_ORDER = [
    "lane_base_l", "lane_base_r", "ft_l", "ft_r",
    "three_corner_l", "three_corner_r", "half_l", "half_r",
    "baseline_l", "baseline_r", "three_base_l", "three_base_r",
    "ftcircle_l", "ftcircle_r", "halfcircle_l", "halfcircle_r",
    "backboard_l", "backboard_r",
]
MODEL_CHOICES = ["yolo11n.pt", "yolo11s.pt", "yolo11m.pt", "yolo11l.pt"]
MARKER_COLORS = [(196, 62, 14), (37, 99, 235), (22, 163, 74), (147, 51, 234), (202, 138, 4)]


def extract_frame(video_path, t):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


def get_video_duration(video_path):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    return n / fps if fps else 0.0


def next_handle(points):
    done = {p["name"] for p in (points or [])}
    for name in RECOMMENDED_ORDER:
        if name not in done:
            return name
    return RECOMMENDED_ORDER[0]


# ---------- calibration drawing ----------
def draw_calib_points(img, points):
    if img is None:
        return None
    out = img.copy()
    for i, p in enumerate(points):
        x, y = int(p["px"]), int(p["py"])
        cv2.circle(out, (x, y), 7, (255, 255, 255), -1)
        cv2.circle(out, (x, y), 7, (30, 41, 59), 2)
        cv2.putText(out, str(i + 1), (x + 10, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (30, 41, 59), 2, cv2.LINE_AA)
    return out


def calib_status_text(points):
    lines = [f"{i+1}. {HANDLE_LABELS.get(p['name'], p['name'])}" for i, p in enumerate(points)]
    header = f"{len(points)} Punkt(e) gesetzt (mindestens 4 nötig).\n"
    return header + "\n".join(lines)


def on_add_point(video_path, t, handle_name, points, evt: gr.SelectData):
    if not video_path:
        return points, None, "Bitte zuerst ein Video hochladen.", gr.update()
    x, y = evt.index[0], evt.index[1]
    points = list(points or [])
    points = [p for p in points if p["name"] != handle_name]  # replace if same handle re-clicked
    points.append({"name": handle_name, "px": x, "py": y})
    frame = extract_frame(video_path, t)
    img = draw_calib_points(frame, points)
    return points, img, calib_status_text(points), gr.update(value=next_handle(points))


def on_reset_points(video_path, t):
    frame = extract_frame(video_path, t)
    return [], frame, "Punkte zurückgesetzt.", gr.update(value=RECOMMENDED_ORDER[0])


def on_commit_calibration(points):
    if len(points) < 4:
        return None, "Mindestens 4 Punkte nötig.", gr.update(visible=False)
    native = [(p["px"], p["py"]) for p in points]
    real = [court.HANDLES[p["name"]] for p in points]
    try:
        H = court.compute_homography(native, real)
    except Exception as e:
        return None, f"Kalibrierung fehlgeschlagen: {e}", gr.update(visible=False)
    sens = court.assess_calibration_sensitivity(native, real)
    cov = court.assess_court_span_coverage(real)
    blocking, msg = court.calib_sensitivity_message(sens, cov)
    if blocking:
        return None, f"⚠️ {msg}", gr.update(visible=False)
    status = f"✅ Kalibriert ({len(points)} Punkte). Weiter mit Schritt 3 unten."
    if msg:
        status += f" ⚠️ {msg}"
    return H.tolist(), status, gr.update(visible=True)


# ---------- processing ----------
def on_process_video(video_path, homography, model_name, conf, progress=gr.Progress()):
    if not video_path or not homography:
        return None, "Bitte zuerst Video laden und Kalibrierung abschließen.", gr.update(visible=False)
    H = np.array(homography)

    def cb(frac, tf):
        progress(frac, desc=f"Frame {tf.frame_idx} (t={tf.time:.1f}s), {len(tf.players)} Spieler erkannt")

    fps, w, h, frames = pipeline.run_detection_and_tracking(
        video_path, H, model_path=model_name, conf=conf, progress_cb=cb)
    all_ids = sorted({tid for tf in frames for tid in tf.players})
    plausible_ids = sorted({tid for tf in frames for tid, p in tf.players.items() if p["plausible"]})
    max_per_frame = max((len(tf.players) for tf in frames), default=0)
    serializable = [
        {"time": tf.time, "frame_idx": tf.frame_idx,
         "players": {str(tid): {"nx": p["nx"], "ny": p["ny"], "x": p["x"], "y": p["y"],
                                 "conf": p["conf"], "plausible": p["plausible"]}
                     for tid, p in tf.players.items()}}
        for tf in frames
    ]
    status = (f"Fertig: {len(frames)} Frames verarbeitet, {len(all_ids)} verschiedene Spur-IDs "
              f"gefunden (davon {len(plausible_ids)} vermutlich auf dem Feld), max. {max_per_frame} "
              f"Personen in einem einzelnen Frame. Weiter mit Schritt 4 unten - alle erkannten "
              f"Personen sind anklickbar, auch blass dargestellte (unsichere Feld-Position, meist "
              f"Zuschauer/Bank, aber bei knapper Kalibrierung notfalls trotzdem anklickbar).")
    visible = max_per_frame > 0
    if not visible:
        status += " ⚠️ Es wurde niemand erkannt - Modell wechseln, Mindest-Konfidenz senken, oder Video/Kalibrierung prüfen."
    return {"fps": fps, "w": w, "h": h, "frames": serializable}, status, gr.update(visible=visible)


def _frame_at_time(processed, t):
    frames = processed["frames"]
    best = min(frames, key=lambda f: abs(f["time"] - t))
    return best


def draw_tracks_on_frame(frame_img, frame_data, selected_ids, merges):
    if frame_img is None:
        return None
    out = frame_img.copy()

    def resolve(tid):
        seen = set()
        while tid in merges and tid not in seen:
            seen.add(tid)
            tid = merges[tid]
        return tid

    for tid_str, p in frame_data["players"].items():
        tid = resolve(int(tid_str))
        x, y = int(p["nx"]), int(p["ny"])
        is_sel = tid in selected_ids
        # "plausible" (on-court position + expected size there, per the current calibration) is
        # just a visual hint via a paler marker - NEVER hides a detection, since a merely imprecise
        # calibration must never make a real player impossible to click (see
        # pipeline.run_detection_and_tracking's docstring for why this used to be a hard filter).
        plausible = p.get("plausible", True)
        if is_sel:
            color = MARKER_COLORS[selected_ids.index(tid) % len(MARKER_COLORS)]
        elif plausible:
            color = (100, 116, 139)
        else:
            color = (180, 190, 200)
        radius = 10 if is_sel else 7
        cv2.circle(out, (x, y), radius, color, -1 if (is_sel or plausible) else 2)
        cv2.circle(out, (x, y), radius, (255, 255, 255), 2)
        cv2.putText(out, str(tid), (x + 12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(out, str(tid), (x + 12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    color if is_sel else (30, 41, 59), 1, cv2.LINE_AA)
    return out


def on_select_time_change(video_path, processed, t, selected_ids, merges):
    if not processed:
        return None, ""
    frame = extract_frame(video_path, t)
    fdata = _frame_at_time(processed, t)
    img = draw_tracks_on_frame(frame, fdata, selected_ids or [], merges or {})
    return img, f"Frame bei t={fdata['time']:.2f}s, {len(fdata['players'])} erkannte Personen."


def on_pick_offense(video_path, processed, t, selected_ids, merges, evt: gr.SelectData):
    if not processed:
        return selected_ids, None, "Zuerst Video verarbeiten."
    selected_ids = list(selected_ids or [])
    x, y = evt.index[0], evt.index[1]
    fdata = _frame_at_time(processed, t)

    def resolve(tid):
        seen = set()
        while tid in (merges or {}) and tid not in seen:
            seen.add(tid)
            tid = merges[tid]
        return tid

    best_tid, best_d = None, 40
    for tid_str, p in fdata["players"].items():
        tid = resolve(int(tid_str))
        d = ((p["nx"] - x) ** 2 + (p["ny"] - y) ** 2) ** 0.5
        if d < best_d:
            best_d = d
            best_tid = tid
    msg = ""
    if best_tid is None:
        msg = "Kein erkannter Spieler in der Nähe des Klicks."
    elif best_tid in selected_ids:
        selected_ids.remove(best_tid)
        msg = f"Spieler {best_tid} entfernt."
    elif len(selected_ids) >= 5:
        msg = "Schon 5 Offense-Spieler ausgewählt. Erst einen abwählen (nochmal anklicken), um zu ändern."
    else:
        selected_ids.append(best_tid)
        msg = f"Spieler {best_tid} als Offense #{len(selected_ids)} ausgewählt."
    frame = extract_frame(video_path, t)
    img = draw_tracks_on_frame(frame, fdata, selected_ids, merges or {})
    return selected_ids, img, msg


# ---------- merge tracks ----------
def on_merge(merges, alias_id, canonical_id):
    merges = dict(merges or {})
    try:
        alias_id, canonical_id = int(alias_id), int(canonical_id)
    except (TypeError, ValueError):
        return merges, "Bitte beide Spur-IDs als Zahl angeben."
    if alias_id == canonical_id:
        return merges, "Beide IDs sind gleich - nichts zu tun."
    merges[alias_id] = canonical_id
    return merges, f"Spur {alias_id} wird jetzt als Spur {canonical_id} behandelt."


# ---------- diagram / export ----------
def labels_for(selected_ids):
    return {tid: i + 1 for i, tid in enumerate(selected_ids)}


def resolve_tid(tid, merges):
    seen = set()
    while tid in merges and tid not in seen:
        seen.add(tid)
        tid = merges[tid]
    return tid


def on_render_diagram(processed, selected_ids, merges, t, overlay_all):
    if not processed or not selected_ids:
        return None, "Zuerst Video verarbeiten und mindestens einen Spieler auswählen (Schritt 4)."
    merges = merges or {}
    labels = labels_for(selected_ids)
    if overlay_all:
        frames_players = []
        for f in processed["frames"]:
            cur = {}
            for tid_str, p in f["players"].items():
                tid = resolve_tid(int(tid_str), merges)
                if tid in selected_ids:
                    cur[tid] = (p["x"], p["y"])
            if cur:
                frames_players.append(cur)
        out_path = os.path.join(tempfile.gettempdir(), "diagram_storyboard.png")
        diagram.render_storyboard(frames_players, labels=labels, out_path=out_path,
                                   title="Gesamter Spielzug")
    else:
        fdata = _frame_at_time(processed, t)
        players = {}
        for tid_str, p in fdata["players"].items():
            tid = resolve_tid(int(tid_str), merges)
            if tid in selected_ids:
                players[tid] = (p["x"], p["y"])
        out_path = os.path.join(tempfile.gettempdir(), "diagram_frame.png")
        diagram.render_frame(players, labels=labels, out_path=out_path,
                              title=f"t={fdata['time']:.2f}s")
    return out_path, "Diagramm aktualisiert."


# ---------- Blocks UI ----------
with gr.Blocks(title="Spielzug-Analyse") as demo:
    gr.Markdown(
        "# Spielzug-Analyse (neu aufgebaut)\n"
        "Erkennung/Verfolgung läuft über **YOLO11 + ByteTrack** (professioneller Multi-Objekt-"
        "Tracker). **Realistische Erwartung:** deutlich sauberer und einfacher zu bedienen, aber "
        "bei kleinen/schnellen/teils verdeckten Spielern können Spur-Nummern gelegentlich wechseln "
        "(siehe README) - dafür gibt es unten ein schnelles \"Spuren zusammenführen\"-Werkzeug.\n\n"
        "Die Schritte unten erscheinen nacheinander, sobald der vorherige abgeschlossen ist."
    )

    video_path_state = gr.State(None)
    calib_points_state = gr.State([])
    homography_state = gr.State(None)
    processed_state = gr.State(None)
    selected_ids_state = gr.State([])
    merges_state = gr.State({})

    with gr.Group():
        gr.Markdown("## 1. Video laden")
        video_input = gr.Video(label="Video hochladen")
        duration_box = gr.Textbox(label="Videolänge (s)", interactive=False)
        shared_time = gr.Slider(
            0, 60, value=0, step=0.1,
            label="Aktueller Zeitpunkt im Video (gilt für Kalibrierung, Spieler-Auswahl und Einzelbild-Diagramm)")

    step2 = gr.Group(visible=False)
    with step2:
        gr.Markdown(
            "## 2. Spielfeld kalibrieren\n"
            "Die vorgeschlagenen Feld-Punkte der Reihe nach anklicken (die Liste springt nach "
            "jedem Klick automatisch zum nächsten) - oder über die Liste einen anderen, besser "
            "sichtbaren Punkt wählen. Mindestens 4 Punkte, am besten über das ganze sichtbare "
            "Feld verteilt (nicht nur den Freiwurfraum)."
        )
        calib_handle = gr.Dropdown(choices=[(label, key) for key, label in HANDLE_LABELS.items()],
                                    value=RECOMMENDED_ORDER[0],
                                    label="Nächster Feld-Punkt zum Anklicken")
        calib_image = gr.Image(label="Klick auf den gewählten Feld-Punkt", interactive=False)
        with gr.Row():
            calib_reset_btn = gr.Button("Punkte zurücksetzen")
            calib_commit_btn = gr.Button("Kalibrierung übernehmen", variant="primary")
        calib_status = gr.Textbox(label="Status", interactive=False)

    step3 = gr.Group(visible=False)
    with step3:
        gr.Markdown("## 3. Video verarbeiten\nLäuft automatisch über das ganze Video (dauert je nach Länge/Modell 1-5 Minuten).")
        with gr.Row():
            model_dropdown = gr.Dropdown(MODEL_CHOICES, value="yolo11m.pt", allow_custom_value=True,
                                          label="Modellgröße (größer = genauer, aber langsamer) - oder Pfad zu einem eigenen trainierten Modell eintragen")
            conf_slider = gr.Slider(0.05, 0.6, value=0.25, step=0.05, label="Mindest-Konfidenz")
        process_btn = gr.Button("Video verarbeiten", variant="primary")
        process_status = gr.Textbox(label="Status", interactive=False)

    step4plus = gr.Group(visible=False)
    with step4plus:
        gr.Markdown(
            "## 4. Die 5 Offense-Spieler auswählen\n"
            "Oben den Zeitpunkt wählen, dann bis zu 5 erkannte Spieler anklicken (graue/blasse "
            "Punkte = erkannt, aber nicht ausgewählt). Nochmal anklicken entfernt die Auswahl."
        )
        select_image = gr.Image(label="Spieler anklicken", interactive=False)
        select_status = gr.Textbox(label="Status", interactive=False)

        gr.Markdown(
            "## 5. Spuren zusammenführen (falls eine Nummer gewechselt hat)\n"
            "Wurde ein Spieler fälschlich mit einer neuen Nummer weitergeführt: hier die neue "
            "(Alias-)Nummer und die ursprüngliche (richtige) Nummer eintragen."
        )
        with gr.Row():
            alias_input = gr.Number(label="Fälschlich neue Spur-ID", precision=0)
            canonical_input = gr.Number(label="Soll zu dieser Spur-ID gehören", precision=0)
            merge_btn = gr.Button("Zusammenführen")
        merge_status = gr.Textbox(label="Status", interactive=False)

        gr.Markdown("## 6. Taktikdiagramm")
        overlay_all_checkbox = gr.Checkbox(label="Gesamten Spielzug überlagern (statt nur aktueller Zeitpunkt)", value=False)
        render_btn = gr.Button("Diagramm aktualisieren", variant="primary")
        diagram_output = gr.Image(label="Taktikdiagramm", interactive=False)
        diagram_status = gr.Textbox(label="Status", interactive=False)

    # ---- wiring ----
    def on_upload(video):
        if not video:
            return None, 0, gr.update(maximum=60), None, gr.update(visible=False)
        dur = get_video_duration(video)
        frame = extract_frame(video, 0)
        return video, round(dur, 1), gr.update(maximum=dur, value=0), frame, gr.update(visible=True)

    video_input.change(
        on_upload, inputs=[video_input],
        outputs=[video_path_state, duration_box, shared_time, calib_image, step2],
    )

    shared_time.change(
        lambda vp, t, pts: draw_calib_points(extract_frame(vp, t), pts) if vp else None,
        inputs=[video_path_state, shared_time, calib_points_state], outputs=[calib_image],
    )
    shared_time.change(
        on_select_time_change,
        inputs=[video_path_state, processed_state, shared_time, selected_ids_state, merges_state],
        outputs=[select_image, select_status],
    )
    calib_image.select(
        on_add_point, inputs=[video_path_state, shared_time, calib_handle, calib_points_state],
        outputs=[calib_points_state, calib_image, calib_status, calib_handle],
    )
    calib_reset_btn.click(
        on_reset_points, inputs=[video_path_state, shared_time],
        outputs=[calib_points_state, calib_image, calib_status, calib_handle],
    )
    calib_commit_btn.click(
        on_commit_calibration, inputs=[calib_points_state],
        outputs=[homography_state, calib_status, step3],
    )

    process_btn.click(
        on_process_video, inputs=[video_path_state, homography_state, model_dropdown, conf_slider],
        outputs=[processed_state, process_status, step4plus],
    ).then(
        on_select_time_change,
        inputs=[video_path_state, processed_state, shared_time, selected_ids_state, merges_state],
        outputs=[select_image, select_status],
    )

    select_image.select(
        on_pick_offense,
        inputs=[video_path_state, processed_state, shared_time, selected_ids_state, merges_state],
        outputs=[selected_ids_state, select_image, select_status],
    )

    merge_btn.click(
        on_merge, inputs=[merges_state, alias_input, canonical_input],
        outputs=[merges_state, merge_status],
    )

    render_btn.click(
        on_render_diagram,
        inputs=[processed_state, selected_ids_state, merges_state, shared_time, overlay_all_checkbox],
        outputs=[diagram_output, diagram_status],
    )

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, inbrowser=True)

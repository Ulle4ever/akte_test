"""Renders the tactical court diagram from tracked/projected player positions, mirroring the old
JS tool's canvas drawing (half-court outline, lane, arcs) but via matplotlib so it works headless
and exports directly to PNG."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch

import court

COURT_BG = "#fdf6e9"
LINE_COLOR = "#33415c"
PALETTE = ["#C43E0E", "#2563eb", "#16a34a", "#9333ea", "#ca8a04",
           "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5"]


def track_color(idx):
    return PALETTE[idx % len(PALETTE)]


def _draw_court(ax):
    ax.set_facecolor(COURT_BG)
    for path in court.COURT_PATHS:
        xs = [p[0] for p in path]
        ys = [p[1] for p in path]
        ax.plot(xs, ys, color=LINE_COLOR, linewidth=1.5, solid_capstyle="round")
    ax.set_xlim(-1, court.COURT_WIDTH_M + 1)
    ax.set_ylim(-1, court.COURT_DEPTH_M + 1)
    ax.set_aspect("equal")
    ax.invert_yaxis()
    ax.axis("off")


def render_frame(players, labels=None, show_trails=None, out_path=None, title=None):
    """players: dict track_id -> (x, y) in court meters, for ONE frame.
    show_trails: optional dict track_id -> (prev_x, prev_y) to draw a small motion arrow from."""
    fig, ax = plt.subplots(figsize=(7, 6.6), dpi=120)
    _draw_court(ax)
    for tid, (x, y) in players.items():
        color = track_color(tid)
        if show_trails and tid in show_trails:
            px, py = show_trails[tid]
            ax.add_patch(FancyArrowPatch((px, py), (x, y), color=color, alpha=0.5,
                                          arrowstyle="-|>", mutation_scale=12, linewidth=1.5))
        ax.scatter([x], [y], s=260, color=color, edgecolors="white", linewidths=2, zorder=5)
        label = str(labels.get(tid, tid)) if labels else str(tid)
        ax.annotate(label, (x, y), color="white", ha="center", va="center",
                    fontsize=10, fontweight="bold", zorder=6)
    if title:
        ax.set_title(title, fontsize=11)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, facecolor=COURT_BG)
        plt.close(fig)
        return out_path
    return fig


def render_storyboard(frames_players, labels=None, out_path=None, title=None):
    """frames_players: ordered list of dict track_id -> (x,y), one per captured frame - draws every
    frame's dots overlaid with connecting lines per track (the old tool's "ganzen Spielzug
    überlagern" view)."""
    fig, ax = plt.subplots(figsize=(7, 6.6), dpi=120)
    _draw_court(ax)
    by_track = {}
    for frame in frames_players:
        for tid, pos in frame.items():
            by_track.setdefault(tid, []).append(pos)
    for tid, positions in by_track.items():
        color = track_color(tid)
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]
        ax.plot(xs, ys, color=color, alpha=0.4, linewidth=2, zorder=3)
        for i, (x, y) in enumerate(positions):
            alpha = 0.35 + 0.65 * (i + 1) / len(positions)
            ax.scatter([x], [y], s=200, color=color, edgecolors="white", linewidths=1.5,
                       alpha=alpha, zorder=5)
        lx, ly = positions[-1]
        label = str(labels.get(tid, tid)) if labels else str(tid)
        ax.annotate(label, (lx, ly), color="white", ha="center", va="center",
                    fontsize=9, fontweight="bold", zorder=6)
    if title:
        ax.set_title(title, fontsize=11)
    fig.tight_layout()
    if out_path:
        fig.savefig(out_path, facecolor=COURT_BG)
        plt.close(fig)
        return out_path
    return fig

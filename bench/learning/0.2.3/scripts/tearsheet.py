"""Tearsheet: per target, the target, Fable's best scored painting (0.2.1 bench), and the 0.2.1 dev-branch
Opus 5.5 V5 plan replays (default and best opt-in). Runs on the Mini with ~/venvs/scorer/bin/python."""
import glob
import json
import os
from PIL import Image, ImageDraw, ImageFont

HOME = os.path.expanduser("~")
BENCH = f"{HOME}/unpainting-021/bench"
REL = f"{HOME}/v021-release/scores"
SHEET = f"{HOME}/sheet021"
OUT = "/tmp/tearsheet-fable-021.jpg"
TH = 360  # tile height
TARGETS = [("hills", "Hills", "hills"), ("south-france", "South France", "south-france"), ("sargent", "White Ships", "sargent"),
           ("mittens", "Mittens", "mittens"), ("h36a", "Yale gateway h36a", "h36-a"), ("h34a", "Yale h34a", "h34-a")]
# 0.2.1 replays to show: (arm folder, seed, label)
REPLAY = {"hills": [("pencrc2", 1, "0.2.1 default (pencil)")],
          "south-france": [("pencrc2", 0, "0.2.1 default (pencil)"), ("inkrc2", 0, "0.2.1 plan ink drawing")],
          "sargent": [("pencrc2", 2, "0.2.1 default (pencil)"), ("np-wash", 1, "0.2.1 --inkrecipe wash, no plan")],
          "mittens": [("pencrc2", 1, "0.2.1 default (pencil)"), ("inkrc2", 2, "0.2.1 plan ink drawing")],
          "h36-a": [("pnone", 0, "0.2.1 default (pencil)"), ("drc2", 1, "0.2.1 --inkrecipe auto")],
          "h34-a": [("pnone", 0, "0.2.1 default (pencil)"), ("drc2", 2, "0.2.1 --inkrecipe auto")]}
FONT = "/System/Library/Fonts/Helvetica.ttc"
F_B, F_S, F_H = ImageFont.truetype(FONT, 19, index=1), ImageFont.truetype(FONT, 16), ImageFont.truetype(FONT, 30, index=1)


def replay_score(crop, arm, seed):
    vals = []
    for f in glob.glob(f"{REL}/*-{crop}-{arm}-s{seed}.raw*.json"):
        d = json.load(open(f))
        if d.get("arm") == arm or arm in d["id"]:
            vals.append(d["score"]["composite"])
    return sum(vals) / len(vals) if vals else None


def fable_best(task):
    best = None
    for f in glob.glob(f"{BENCH}/runs/*/fable/*/run.json") + glob.glob(f"{BENCH}/work/profile-runs/full-v1/runs/*/fable/*/run.json"):
        d = json.load(open(f))
        s = (d["crops"].get(task, {}).get("score") or {}).get("composite")
        if s is None:
            continue
        rnd = d.get("round", {}).get("id") if isinstance(d.get("round"), dict) else d.get("round")
        judge = d["crops"][task]["score"].get("judgeProfile") or d.get("judgeProfile") or "?"
        rd = os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(f))))
        img = [p for pat in ("", "*/", "*/*/") for p in glob.glob(f"{BENCH}/work/raw/{pat}{rd}/fable/{d['try']}/out/{task}/final.png")]
        src = img[0] if img else os.path.join(os.path.dirname(f), f"{task}.webp")
        if best is None or s > best[0]:
            best = (s, f"Fable 5.1 {rnd} try {d['try']}", judge, src)
    return best


def tile(path, label, sub):
    im = Image.open(path).convert("RGB")
    im = im.resize((round(im.width * TH / im.height), TH))
    t = Image.new("RGB", (max(im.width, 300), TH + 58), "white")
    t.paste(im, (0, 0))
    d = ImageDraw.Draw(t)
    d.text((2, TH + 6), label, fill="#111", font=F_B)
    d.text((2, TH + 32), sub, fill="#555", font=F_S)
    return t


rows = []
for task, name, rcrop in TARGETS:
    tgt = f"{BENCH}/v2/targets/{task}.png"
    self_score = json.load(open(f"{BENCH}/v2/crops.json"))
    ss = next((c.get("selfScore") for c in self_score["crops"] if c["task"] == task), None)
    tiles = [tile(tgt, f"Target: {name}", f"self-score {ss:.2f}" if ss else "")]
    fb = fable_best(task)
    tiles.append(tile(fb[3], fb[1], f"{fb[2]} {fb[0]:.2f}") if fb else None)
    for arm, seed, lab in REPLAY[task if task in REPLAY else rcrop] if (task in REPLAY or rcrop in REPLAY) else []:
        p = f"{SHEET}/{arm}/{rcrop}-s{seed}.png"
        s = replay_score(rcrop, arm, seed)
        tiles.append(tile(p, f"Opus 5.5 V5 plan, {lab}", f"J1 {s:.2f}, mean of 3 judgings" if s else "J1 ?"))
    tiles = [t for t in tiles if t]
    w = sum(t.width for t in tiles) + 16 * (len(tiles) - 1)
    r = Image.new("RGB", (w, TH + 58), "white")
    x = 0
    for t in tiles:
        r.paste(t, (x, 0))
        x += t.width + 16
    rows.append(r)

W = max(r.width for r in rows) + 48
head = 96
H = head + sum(r.height + 28 for r in rows) + 24
sheet = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(sheet)
d.text((24, 18), "Fable 5.1 vs the 0.2.1 dev branch", fill="#111", font=F_H)
d.text((24, 58), "Fable: best scored painting so far on release 0.2.1 (painter V101). Comparison: Opus 5.5's published V5 plans replayed on 0.2.1. "
       "Fable scores use the bench's J1-full/J2-full judges; replays use J1.", fill="#555", font=F_S)
y = head
for r in rows:
    sheet.paste(r, (24, y))
    y += r.height + 28
sheet.save(OUT, quality=88)
print(OUT, sheet.size)

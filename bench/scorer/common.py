"""Shared image loading and alignment. All images are resized to one working grid.
Never judges by pixel error: these helpers only prepare the grid."""
import json
import numpy as np
from PIL import Image
from skimage.color import rgb2lab

WORK_W = 720


def load_rgb(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return im.convert("RGB")


def to_work(im, w, h):
    return np.asarray(im.resize((w, h), Image.BICUBIC), dtype=np.float64) / 255.0


def lightness(rgb):
    return rgb2lab(rgb)[..., 0] / 100.0


def parse_region(s):
    return tuple(float(v) for v in s.split(",")) if s else None


class Pair:
    """Target and painting on one grid, optionally cropped to a region.
    region is (x, y, w, h) in pixels of a frame region_w pixels wide (default: the target's own)."""

    def __init__(self, target, painting, region=None, region_w=None, work_w=WORK_W, code=None):
        t = load_rgb(target) if isinstance(target, str) else target
        p = load_rgb(painting) if isinstance(painting, str) else painting
        self.full_scale = work_w / t.size[0]
        h = int(round(t.size[1] * work_w / t.size[0]))
        self.W, self.H = work_w, h
        self.t_rgb_full = to_work(t, work_w, h)
        self.p_rgb_full = to_work(p, work_w, h)
        self.box = (0, 0, work_w, h)
        if region:
            rw = region_w or t.size[0]
            s = work_w / rw
            x, y, rw_, rh_ = [int(round(v * s)) for v in region]
            self.box = (max(0, x), max(0, y), min(work_w, x + rw_), min(h, y + rh_))
        x0, y0, x1, y1 = self.box
        self.t_rgb = self.t_rgb_full[y0:y1, x0:x1]
        self.p_rgb = self.p_rgb_full[y0:y1, x0:x1]
        self.t_L = lightness(self.t_rgb)
        self.p_L = lightness(self.p_rgb)
        self.t_L_full = lightness(self.t_rgb_full)
        self.p_L_full = lightness(self.p_rgb_full)
        self.code = code

"""White outlines round shapes and a bare border round the sheet, measured on a block-in study, for the study-seed choice.

    study-seams.py STUDY.png [--picture PICTURE.jpg]

The image model sometimes leaves a resist-like band of bare paper between the flat shapes of a study (an outline round each shape),
and a paper margin round the whole sheet. The painter then reserves these as lights. Both are measured the same way on the study
and on the picture; only what the study has MORE of than the picture counts.

  seamLength  long thin near-white lines, as a percentage of the sheet's width. The image is put on its own paper (each channel
              over its 99.5th percentile), near-white is L* 90 or more with chroma 10 or less, thin is near-white that does not survive
              an opening of radius 4 px at 1000 px across (about 1.5 mm on a 380 mm sheet), and only lines whose skeleton is 40 px
              or longer count, away from the border (so specks of paper grain and the margin are not counted here).
  borderShare near-white share (%) of the sheet that lies in a frame 2% of the width wide round the edge.

Penalty (pick.py adds it to a study's penalty): 0.05 per percentage point of seamLength above the picture's, and 0.5 per percentage
point of the sheet that is bare border above the picture's, the same 0.5 weight as the other shares of the sheet there. A whole
outline round every shape (100% of the width) therefore costs 5, about as much as a tenth of the sheet invented.
"""
import argparse
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import color, morphology

WIDTH = 1000          # working width in px
OPEN_PX = 4           # thin = narrower than 2 * OPEN_PX + 1 px
MIN_SKELETON = 40     # px: shorter near-white lines are grain, not an outline
BORDER = 0.02         # frame width as a share of the sheet's width
SEAM_WEIGHT = 0.05    # penalty per percentage point of the sheet's width
BORDER_WEIGHT = 0.5   # penalty per percentage point of the sheet


def near_white(im, width=WIDTH):
    """Boolean near-white map of an image at `width` px across, on its own paper."""
    im = im.convert('RGB'); h = round(im.height * width / im.width)
    a = np.asarray(im.resize((width, h), Image.LANCZOS)).astype(float) / 255
    a = np.clip(a / np.maximum(np.percentile(a.reshape(-1, 3), 99.5, axis=0), 1e-3), 0, 1)
    lab = color.rgb2lab(a)
    return (lab[..., 0] >= 90) & (np.hypot(lab[..., 1], lab[..., 2]) <= 10)


def measure(im, width=WIDTH):
    white = near_white(im, width); h, w = white.shape
    f = max(1, round(BORDER * w))
    frame = np.zeros_like(white); frame[:f] = frame[-f:] = True; frame[:, :f] = frame[:, -f:] = True
    inner = ~frame; inner[:2 * f] = inner[-2 * f:] = False; inner[:, :2 * f] = inner[:, -2 * f:] = False
    thin = white & ~ndi.binary_opening(white, structure=morphology.disk(OPEN_PX)) & inner
    skeleton = morphology.skeletonize(thin)
    groups, n = ndi.label(thin, structure=np.ones((3, 3)))
    length = 0
    if n:
        sizes = ndi.sum(skeleton, groups, range(1, n + 1))
        length = int(sum(s for s in sizes if s >= MIN_SKELETON))
    return {'seamLength': round(100 * length / w, 1), 'borderShare': round(100 * float((white & frame).sum()) / white.size, 2)}


def penalty(study, picture):
    """Penalty points for a study against its picture (both measure() results)."""
    return round(SEAM_WEIGHT * max(0.0, study['seamLength'] - picture['seamLength'])
                 + BORDER_WEIGHT * max(0.0, study['borderShare'] - picture['borderShare']), 2)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('study'); ap.add_argument('--picture')
    a = ap.parse_args(); s = measure(Image.open(a.study)); out = {'study': s}
    if a.picture:
        p = measure(Image.open(a.picture)); out.update(picture=p, penalty=penalty(s, p))
    print(json.dumps(out))

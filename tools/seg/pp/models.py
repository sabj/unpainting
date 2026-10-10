"""Mask R-CNN subjects for subject-regions.py: people, animals and the things they hold.

Detections are cached by the canvas's SHA-1 when a cache directory is given, so a rerun reruns no model.
"""
import hashlib
import os

import cv2
import numpy as np

THREADS = int(os.environ.get("OMP_NUM_THREADS", "6"))

# COCO labels: person and the animals; the held things (frisbee, sports ball) join a subject they touch.
SUBJECT_CLASSES = {1, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25}
HELD_CLASSES = {34, 37}
DETECT_SCORE = 0.5
HELD_SCORE = 0.3

_MODELS = {}


def digest(arr, *extra):
    h = hashlib.sha1(np.ascontiguousarray(arr).tobytes())
    for e in extra:
        h.update(repr(e).encode())
    return h.hexdigest()[:16]


def detections(bgr, cache):
    """Mask R-CNN instances [(label, score, mask)], people, animals and held things only."""
    key = os.path.join(cache, f"maskrcnn-{digest(bgr)}.npz") if cache else None
    if key and os.path.exists(key):
        z = np.load(key)
        return [(int(l), float(s), m) for l, s, m in zip(z["labels"], z["scores"], z["masks"])]
    import torch
    from torchvision.models.detection import maskrcnn_resnet50_fpn_v2, MaskRCNN_ResNet50_FPN_V2_Weights
    torch.set_num_threads(THREADS)
    if "maskrcnn" not in _MODELS:
        _MODELS["maskrcnn"] = maskrcnn_resnet50_fpn_v2(weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT).eval()
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    x = torch.from_numpy(rgb.astype(np.float32) / 255.0).permute(2, 0, 1)
    with torch.no_grad():
        det = _MODELS["maskrcnn"]([x])[0]
    keep = [i for i, (l, s) in enumerate(zip(det["labels"].tolist(), det["scores"].tolist()))
            if (l in SUBJECT_CLASSES and s >= DETECT_SCORE) or (l in HELD_CLASSES and s >= HELD_SCORE)]
    labels = np.int32([det["labels"][i] for i in keep])
    scores = np.float32([det["scores"][i] for i in keep])
    masks = np.stack([(det["masks"][i, 0].numpy() > 0.5) for i in keep]) if keep else \
        np.zeros((0,) + bgr.shape[:2], bool)
    if key:
        np.savez_compressed(key, labels=labels, scores=scores, masks=masks)
    return [(int(l), float(s), m) for l, s, m in zip(labels, scores, masks)]

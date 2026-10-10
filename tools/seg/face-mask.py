"""face-mask.py <image> <out.png> [crop name=x,y,w,h ...]: the face as a soft ellipse from Keypoint R-CNN (COCO).

The nose, eyes and ears that pass KP_MIN fix the face's centre and span; the ellipse is taken down past the eyes toward
the chin (the keypoints stop at the eyes). Used by paint-plate --litface (src/paint/techniques/lit-planes.mjs) to keep
lit planes to the face, where a warm-colour test took in the arm and the hand. Crops are cut from the same mask and
written beside it as <dir>/<name>-face.png. Run with a torchvision venv, e.g. .venv.
"""
import sys, os, cv2, numpy as np, torch
from torchvision.models.detection import keypointrcnn_resnet50_fpn

URL = "https://download.pytorch.org/models/keypointrcnn_resnet50_fpn_coco-fc266e95.pth"
KP_MIN, DOWN, WIDE, TALL = 1.0, 0.3, 0.62, 0.85

def main():
    src, out = sys.argv[1], sys.argv[2]
    bgr = cv2.imread(src); h, w = bgr.shape[:2]
    model = keypointrcnn_resnet50_fpn(weights=None, weights_backbone=None)
    model.load_state_dict(torch.hub.load_state_dict_from_url(URL, progress=False)); model.eval()
    x = torch.from_numpy(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0).permute(2, 0, 1)
    with torch.no_grad(): det = model([x])[0]
    if not len(det["scores"]): sys.exit("no person found")
    kp, lg = det["keypoints"][0, :5, :2].numpy(), det["keypoints_scores"][0, :5].numpy()
    pts = kp[lg > KP_MIN]
    if len(pts) < 2: sys.exit(f"only {len(pts)} face keypoints seen")
    c = pts.mean(0); span = max(np.linalg.norm(a - b) for a in pts for b in pts)
    eyes = [kp[i] for i in (1, 2) if lg[i] > KP_MIN]
    ang = np.degrees(np.arctan2(*(eyes[1] - eyes[0])[::-1])) if len(eyes) == 2 else 0.0
    ang = (ang + 90) % 180 - 90  # the eyes' line either way round; down is toward the chin
    down = np.array([-np.sin(np.radians(ang)), np.cos(np.radians(ang))])
    centre = c + DOWN * span * down
    m = np.zeros((h, w), np.uint8)
    cv2.ellipse(m, (int(centre[0]), int(centre[1])), (int(WIDE * span), int(TALL * span)), ang, 0, 360, 255, -1)
    cv2.imwrite(out, m)
    print(f"face: {len(pts)} keypoints, span {span:.0f} px, tilt {ang:.0f} deg, centre {centre.round().tolist()}, {100 * (m > 0).mean():.1f}% of the image")
    for a in sys.argv[3:]:
        name, box = a.split("="); X, Y, W, H = map(int, box.split(","))
        cv2.imwrite(os.path.join(os.path.dirname(out), f"{name}-face.png"), m[Y:Y + H, X:X + W]); print(f"  {name}: {100 * (m[Y:Y + H, X:X + W] > 0).mean():.1f}%")

main()

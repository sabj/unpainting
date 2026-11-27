#!/bin/bash
# Install the segmentation tools (torch, torchvision, segment-anything, numpy, OpenCV) in their own venv on a Linux
# pod, and fetch the SAM checkpoint the painter's --segments sam needs. The versions are the ones the Mac's .venv-seg
# holds, so a pod and the Mac segment with the same code. The painter finds both by itself (src/crop/segment-prep.mjs):
# the repo's .venv-seg and work/models/sam_vit_b_01ec64.pth. Prefix: PAINTER_SEG_VENV, else .venv-seg at the root.
# A checkpoint already in place (shipped with the batch) is kept; either way its sha256 must match or the setup stops.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
prefix=${PAINTER_SEG_VENV:-$root/.venv-seg}
sam=$root/work/models/sam_vit_b_01ec64.pth
sam_sha=ec2df62732614e57411cdcf32a23ffdf28910380d03139ee0f4fcbe91eb8c912
pins=('torch==2.15.0' 'torchvision==0.29.2' 'segment-anything==1.0' 'numpy==2.2.6' 'opencv-python-headless==4.11.0.86'
  'scikit-image==0.26.0' 'scipy==1.18.1' 'pillow==13.0.0')
# The pins need Python 3.12 (scipy 1.18). A pod image whose python3 is older gets a 3.12 of its own through uv.
if python3 -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' 2>/dev/null; then
  python3 -m venv "$prefix"
  "$prefix/bin/python" -m pip install --disable-pip-version-check -q "${pins[@]}"
else
  command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/0.11.7/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh >/dev/null
  uv venv -q --python 3.12 "$prefix"
  uv pip install -q --python "$prefix/bin/python" "${pins[@]}"
fi
if [ ! -f "$sam" ]; then
  mkdir -p "$(dirname "$sam")"
  curl -fsSL -o "$sam.part" https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
  mv "$sam.part" "$sam"
fi
echo "$sam_sha  $sam" | sha256sum -c - >/dev/null || { echo "setup-seg: $sam does not match sha256 $sam_sha" >&2; exit 1; }
"$prefix/bin/python" -c 'import sys, numpy, cv2, torch, torchvision, segment_anything; print("seg tools: python", sys.version.split()[0], "numpy", numpy.__version__, "opencv", cv2.__version__, "torch", torch.__version__, "torchvision", torchvision.__version__, "cuda", torch.cuda.is_available())'

#!/bin/bash
# Install the optional line extractor without changing python3's auto-selection.
# Existing renders may select a different drawing when cv2 appears on sys.path.
# Use --sketchpython /opt/painter-lines/bin/python explicitly after review.
set -euo pipefail
prefix=${PAINTER_LINES_VENV:-/opt/painter-lines}
if ! python3 -m venv "$prefix"; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=600 update -qq
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq python3-venv
  python3 -m venv "$prefix"
fi
"$prefix/bin/python" -m pip install --disable-pip-version-check 'numpy==2.2.6' 'opencv-python-headless==4.11.0.86'
"$prefix/bin/python" -c 'import numpy, cv2; print("line tools:", numpy.__version__, cv2.__version__)'

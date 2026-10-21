#!/bin/bash
# Install the line tools (numpy, OpenCV, scikit-image) in their own venv, on Linux or macOS.
# The painter picks the venv up by itself (src/paint/methods/line-python.mjs): --sketchpython, else
# PAINTER_LINES_PYTHON, else PAINTER_LINES_VENV, else the repo's .venv-lines, else python3. A machine with the venv
# extracts observed-width lines; one without it falls back to the narrow-ridge tracer, so paintings differ between them.
# Prefix: PAINTER_LINES_VENV, else .venv-lines at the repository root.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
prefix=${PAINTER_LINES_VENV:-$root/.venv-lines}
if ! python3 -m venv "$prefix"; then
  if ! command -v apt-get >/dev/null; then
    echo "setup-lines: python3 -m venv failed and there is no apt-get (on macOS run xcode-select --install)" >&2
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=600 update -qq
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq python3-venv
  python3 -m venv "$prefix"
fi
# numpy 2.2 needs Python 3.10 or later; the macOS system python3 is 3.9, which takes numpy 2.0.2.
numpy=$("$prefix/bin/python" -c 'import sys; print("2.2.6" if sys.version_info >= (3, 10) else "2.0.2")')
"$prefix/bin/python" -m pip install --disable-pip-version-check "numpy==$numpy" 'opencv-python-headless==4.11.0.86' 'scikit-image==0.24.0'
"$prefix/bin/python" -c 'import numpy, cv2, skimage; print("line tools:", numpy.__version__, cv2.__version__, skimage.__version__)'

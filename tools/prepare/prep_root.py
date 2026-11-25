# Where the preparation works: one folder, named by the environment. Shared by every script here.
import os, sys
def prep_root():
    """The preparation folder (sources, studies, guides, vectors, labels, the subject list): $UNPAINT_PREP. Never guessed."""
    r = os.environ.get('UNPAINT_PREP')
    if not r or not os.path.isdir(r): sys.exit('UNPAINT_PREP is not set to the preparation folder (the one that holds SUBJECTS.json, studio/img, studies, guides, replay/vectors, labels): see tools/prepare/README.md')
    return os.path.abspath(r)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
def prep_python():
    """The Python the measuring steps run under (numpy, pillow, scipy, scikit-image, opencv): $UNPAINT_PREP_PYTHON, else the repository's .venv-seg."""
    p = os.environ.get('UNPAINT_PREP_PYTHON') or os.path.join(REPO, '.venv-seg', 'bin', 'python')
    if not os.path.isfile(p): sys.exit('no Python for the preparation at %s: set UNPAINT_PREP_PYTHON (numpy, pillow, scipy, scikit-image, opencv), or make the repository\'s .venv-seg (npm run doctor)' % p)
    return p

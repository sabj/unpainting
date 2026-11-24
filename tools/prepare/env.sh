# Sourced by the scripts here: where the preparation folder and the repository are, and the Python the measuring steps use.
# UNPAINT_PREP (required): the preparation folder. UNPAINT_PREP_PYTHON: a Python with numpy, pillow, scipy, scikit-image
# and opencv (default: the repository's .venv-seg). Nothing is guessed: a missing piece stops the script.
HERE=${0:A:h}; REPO=${HERE:h:h}
[[ -n $UNPAINT_PREP && -d $UNPAINT_PREP ]] || { echo "UNPAINT_PREP is not set to the preparation folder (tools/prepare/README.md)" >&2; exit 2; }
R=${UNPAINT_PREP:A}
V=${UNPAINT_PREP_PYTHON:-$REPO/.venv-seg/bin/python}
[[ -x $V ]] || { echo "no Python for the preparation at $V: set UNPAINT_PREP_PYTHON, or make the repository's .venv-seg (npm run doctor)" >&2; exit 2; }
export UNPAINT_PREP=$R UNPAINT_PREP_PYTHON=$V
# a field of a subject's record: field ID python-expression-over-s
field() { python3 -c "import json,os,sys; s=[x for x in json.load(open(os.environ.get('SUBJECTS_JSON') or '$R/SUBJECTS.json'))['subjects'] if x['id']==sys.argv[1]]; s or sys.exit('no subject '+sys.argv[1]); s=s[0]; print($2)" $1; }

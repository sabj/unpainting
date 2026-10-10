# Protocol v2 guard for Python: no image file may be opened except under bench/out/.
import builtins, io, json, os, re, time
_IMG = re.compile(r'\.(png|jpe?g|webp|gif|tiff?|bmp|heic|avif)$', re.I)
_open = builtins.open
def _guarded(file, *a, **k):
    if isinstance(file, (str, bytes, os.PathLike)):
        p = os.fsdecode(file)
        mode = a[0] if a else k.get('mode', 'r')
        if _IMG.search(p) and 'r' in mode and '/bench/out/' not in os.path.realpath(p):
            log = os.environ.get('BENCH_VIOLATIONS')
            if log:
                with _open(log, 'a') as f: f.write(json.dumps({'t': time.time(), 'kind': 'python.open', 'path': p, 'pid': os.getpid()}) + '\n')
            raise PermissionError(f'protocol v2: reading image files is not allowed ({p}). Use your own vision and kit.coarse().')
    return _open(file, *a, **k)
builtins.open = _guarded; io.open = _guarded

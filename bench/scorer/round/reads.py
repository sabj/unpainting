#!/usr/bin/env python3
"""Further readings by the same local panel, each kept apart from the others (reads/<painting>/<mode>-<size>-<judge>-<k>.json):
  single   the judge sees ONE picture and scores it as a watercolour with the scorer's own rubric (composition and
           values, edges and detail, marks and texture, overall); it is not told whether the picture is an original or
           a painting made from one. Originals and paintings are read the same way, independently.
  pair     the scorer's own reading against the source (score_painting.py's prompt, unchanged).
  768      both as the scorer has always shown them: at most 768 px on the long side.
  full     at the sheet's own pixels, nothing reduced.
Three calls a judge, every picture for one judge before the next judge is loaded, the model unloaded after."""
import importlib.util, json, os, subprocess, sys, time
os.environ['JUDGE_ROUTE'] = 'local'
HERE = os.path.dirname(os.path.abspath(__file__))
sp = importlib.util.spec_from_file_location('sa', os.path.join(HERE, 'score-all.py')); sa = importlib.util.module_from_spec(sp); sp.loader.exec_module(sa)
os.environ['JUDGE_LOCAL_PANEL'] = sa.PANEL
sys.path.insert(0, os.path.join(sa.TRUNK, 'bench', 'scorer'))
import score_painting as SP, local_route  # noqa: E402
from common import load_rgb  # noqa: E402
SINGLE_PROMPT = """The image is a painting in this style: {style}.
You do not know who or what made it. Rate it from 0 to 10 on each criterion:
- composition_values: the big shapes and the light and dark pattern read as a clear picture.
- edges_detail: edges are crisp where the picture needs them crisp and soft where it needs them soft; small key details (eyes, highlights, lids) are present and sharp.
- marks_texture: the marks look like real brush or pen marks on paper, with paper showing in the lights; ink is judged against the style above. Noise, speckle, stripes, blur, smearing and digital filters are failures.
Then give one overall score from 0 to 10 for it as a painting, weighing the washes and technique.
Blur and smear are failures, not a safe middle. 5 is a competent amateur; 9-10 is the work of a skilled watercolourist.
Reply with JSON only, no prose: {{"composition_values":n,"edges_detail":n,"marks_texture":n,"overall":n}}"""
CORE = {s['id'] for s in sa.REG.values() if s.get('role') == 'core'}
def jobs():
    E = [e for e in sa.entries() if sa.wanted(e, None) and e['png'] and not e['failure']]
    two = ('mittens-closeup', 'white-ships'); out = []
    for e in E:
        if e['group'] == 'scored' or (e['group'] == 'originals' and e['sid'] in two):
            out += [(e, 'single', '768'), (e, 'single', 'full')] + ([(e, 'pair', 'full')] if e['group'] == 'scored' else [])
        elif e['sid'] in CORE: out.append((e, 'single', '768'))
    return out
def content(e, mode, size):
    if mode == 'single':
        im = load_rgb(e['png']); side = max(im.size) if size == 'full' else 768
        return [{'type': 'text', 'text': SINGLE_PROMPT.format(style=e['style'])}, {'type': 'image_url', 'image_url': {'url': SP.data_uri(im, side)}}], list(im.size)
    target, image, _ = sa.sized(e, os.path.join(HERE, 'sized')); im = load_rgb(image)
    return SP._content(target, image, e['style'], max(im.size) if size == 'full' else 768), list(im.size)
def main():
    cfg = local_route.settings(); J = jobs()
    for m in sa.PANEL.split(','):
        tag = m.replace(':', '_')
        for e, mode, size in J:
            d = os.path.join(HERE, 'reads', e['name']); os.makedirs(d, exist_ok=True); c = None
            for k in (1, 2, 3):
                out = f'{d}/{mode}-{size}-{tag}-{k}.json'
                if (sa.load(out) or {}).get('overall') is not None: continue
                if c is None: c, px = content(e, mode, size)
                t = time.time(); res = None; err = None; usage = {}
                for _ in range(3):
                    try: raw, usage = local_route.post(cfg, m, [{'role': 'user', 'content': c}])
                    except RuntimeError as x: err = str(x)[:300]; continue
                    res = SP._parse(raw)
                    if res: break
                    err = 'no valid JSON: ' + (raw or '')[:120]
                json.dump({**(res or {'overall': None, 'error': err}), 'judge': m, 'mode': mode, 'size': size, 'imagePx': px, 'promptTokens': usage.get('prompt_tokens'), 'seconds': round(time.time() - t, 1)}, open(out, 'w'))
                print(time.strftime('%H:%M:%S'), e['name'], mode, size, m, k, res['overall'] if res else f'FAILED {err}', usage.get('prompt_tokens'), f'{round(time.time() - t)} s', flush=True)
        subprocess.run(['ollama', 'stop', m], capture_output=True)
        subprocess.run([sys.executable, os.path.join(HERE, 'table.py')], capture_output=True)
if __name__ == '__main__': main()

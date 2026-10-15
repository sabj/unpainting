"""A plain tool loop for a Together-hosted model: bash, read_file and write_file inside one worktree.

  BENCH_CROPS=sargent,trumbull python3 oss_loop.py --model zai-org/GLM-5.2 --cwd <worktree> --brief <file> --log <jsonl> [--usd 2.2] [--minutes 65] [--done paintings|any]

BENCH_CROPS narrows the crops to paint; without it the loop paints every crop in bench/v2/crops.json. The key is read from the
TOGETHER_API_KEY environment variable and never printed.
"""
import argparse, base64, json, os, pathlib, subprocess, sys, time, urllib.request, urllib.error

ALL_CROPS = tuple(c['task'] for c in json.loads((pathlib.Path(__file__).resolve().parents[1] / 'crops.json').read_text())['crops'])
CROPS = tuple(c for c in os.environ.get('BENCH_CROPS', '').split(',') if c) or ALL_CROPS
if set(CROPS) - set(ALL_CROPS):
    sys.exit(f"unknown crops: {', '.join(sorted(set(CROPS) - set(ALL_CROPS)))}")
PRICES = {
    'deepseek-ai/DeepSeek-V4.1-Flash': (0.3, 1.2),
    'MiniMaxAI/MiniMax-M3': (0.3, 1.2),  # USD per million tokens (input, output), from Together's model list
    'zai-org/GLM-5.2': (1.4, 4.4),
    'deepseek-ai/DeepSeek-V4-Pro-0813': (1.32, 3.96),
}
TOOLS = [
    {'type': 'function', 'function': {'name': 'bash', 'description': 'Run a shell command in the worktree (zsh, cwd = worktree root, 600 s timeout). Returns exit code and the last 8,000 characters of output.', 'parameters': {'type': 'object', 'properties': {'command': {'type': 'string'}}, 'required': ['command']}}},
    {'type': 'function', 'function': {'name': 'read_file', 'description': 'Read a text file (path relative to the worktree). Returns at most 30,000 characters.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'offset': {'type': 'integer', 'description': 'first line, 1-based'}, 'limit': {'type': 'integer'}}, 'required': ['path']}}},
    {'type': 'function', 'function': {'name': 'write_file', 'description': 'Write a text file (path relative to the worktree), replacing it.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'content': {'type': 'string'}}, 'required': ['path', 'content']}}},
    {'type': 'function', 'function': {'name': 'view_image', 'description': 'Look at a PNG or JPEG in the worktree (the target crops, your frames and finals). The image is shown to you right after this call.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path']}}},
    {'type': 'function', 'function': {'name': 'done', 'description': 'Call when every painting and NOTES.md are finished.', 'parameters': {'type': 'object', 'properties': {'summary': {'type': 'string'}}, 'required': ['summary']}}},
]


def key():
    return os.environ['TOGETHER_API_KEY'].strip()


def call(model, messages, k):
    body = json.dumps({'model': model, 'messages': messages, 'tools': TOOLS, 'max_tokens': 16000, 'temperature': 0.6}).encode()
    req = urllib.request.Request('https://api.together.xyz/v1/chat/completions', data=body, headers={'User-Agent': 'painter-bench/1.0', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k})
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=600))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:500]
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(10 * (attempt + 1)); continue
            raise RuntimeError(f'HTTP {e.code}: {msg}')
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3: time.sleep(10); continue
            raise


def safe(cwd, p):
    full = (cwd / p).resolve()
    if not str(full).startswith(str(cwd.resolve())): raise ValueError('path outside the worktree')
    return full


def run_tool(cwd, name, args):
    if name == 'bash':
        try:
            r = subprocess.run(['zsh', '-lc', args['command']], cwd=cwd, capture_output=True, text=True, timeout=600, env={**os.environ, 'PYTHONPATH': os.environ.get('BENCH_PYGUARD', '')})
            out = (r.stdout + r.stderr)[-8000:]
            return f'exit {r.returncode}\n{out}'
        except subprocess.TimeoutExpired:
            return 'timed out after 600 s'
    if name == 'read_file':
        lines = safe(cwd, args['path']).read_text(errors='replace').splitlines()
        o = max(1, int(args.get('offset') or 1)); n = int(args.get('limit') or 2000)
        return '\n'.join(lines[o - 1:o - 1 + n])[:30000]
    if name == 'write_file':
        f = safe(cwd, args['path']); f.parent.mkdir(parents=True, exist_ok=True); f.write_text(args['content'])
        return f'wrote {len(args["content"])} characters'
    return 'unknown tool'


KEEP_TURNS = 8
IMAGES = []
TOOL_CHARS = 2500


def short(text, n):
    text = text or ''
    if len(text) <= n: return text
    return text[:n // 3] + f'\n[... {len(text) - n} characters cut ...]\n' + text[-(2 * n) // 3:]


def state(cwd):
    lines = []
    for t in CROPS:
        o = cwd / 'bench' / 'out' / t
        st = o / 'stats.json'
        if st.exists(): lines.append(f'{t}: finished, ' + st.read_text().replace('\n', ' ')[:300])
        elif (o / 'frames').exists(): lines.append(f'{t}: in progress, {len(list((o / "frames").glob("*.png")))} frames saved')
        else: lines.append(f'{t}: not started')
    scripts = sorted(p.name for p in (cwd / 'bench').glob('*.mjs') if p.name != 'kit.mjs')
    lines.append('your scripts in bench/: ' + (', '.join(scripts) or 'none'))
    return '\n'.join(lines)


def build(base, summary, turns, cwd):
    ctx = 'Earlier turns, summarized (oldest first):\n' + ('\n'.join(summary[-60:]) or '(none yet)') + '\n\nCurrent painting state:\n' + state(cwd)
    first = base[1]['content'] + '\n\n---\n' + ctx
    msgs = [base[0], {'role': 'user', 'content': [{'type': 'text', 'text': first}] + IMAGES if IMAGES else first}]
    for t in turns[-KEEP_TURNS:]: msgs += t
    return msgs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True); ap.add_argument('--cwd', required=True); ap.add_argument('--brief', required=True)
    ap.add_argument('--log', required=True); ap.add_argument('--images', default=None); ap.add_argument('--usd', type=float, default=6); ap.add_argument('--minutes', type=float, default=65)
    ap.add_argument('--done', default='paintings', choices=['paintings', 'any'], help='paintings: done needs every bench/out/<crop>/final.png; any: done ends the loop')
    a = ap.parse_args()
    cwd = pathlib.Path(a.cwd); k = key(); pin, pout = PRICES[a.model]
    if a.images:
        for t in CROPS:
            IMAGES.append({'type': 'text', 'text': f'Target: {t}'})
            IMAGES.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(pathlib.Path(a.images, t + '.png').read_bytes()).decode()}})
    base = [{'role': 'system', 'content': 'You are a coding agent working in a terminal through tools. Use the view_image tool to look at the target crops and your renders. Only your last few turns are shown in full; earlier ones are summarized, so keep important findings in files under bench/.'},
            {'role': 'user', 'content': pathlib.Path(a.brief).read_text()}]
    summary, turns = [], []
    t0 = time.time(); tin = tout = rtok = 0; usd = 0.0; n = 0; end = 'turn limit'; reasoning_seen = False
    log = open(a.log, 'a')
    while n < 600:
        if usd >= a.usd: end = f'spend cap ${a.usd}'; break
        if time.time() - t0 > a.minutes * 60: end = f'time cap {a.minutes} min'; break
        n += 1
        try:
            r = call(a.model, build(base, summary, turns, cwd), k)
        except Exception as e:
            end = f'api error: {e}'; break
        u = r.get('usage') or {}; tin += u.get('prompt_tokens', 0); tout += u.get('completion_tokens', 0)
        rtok += ((u.get('completion_tokens_details') or {}).get('reasoning_tokens') or 0)
        usd = tin / 1e6 * pin + tout / 1e6 * pout
        msg = r['choices'][0]['message']
        if msg.get('reasoning') or msg.get('reasoning_content'): reasoning_seen = True
        keep = {'role': 'assistant', 'content': msg.get('content') or ''}
        if msg.get('tool_calls'): keep['tool_calls'] = msg['tool_calls']
        turn = [keep]
        log.write(json.dumps({'t': round(time.time() - t0), 'turn': n, 'content': (msg.get('content') or '')[:2000], 'tools': [tc['function']['name'] + ' ' + tc['function']['arguments'][:300] for tc in msg.get('tool_calls') or []], 'usd': round(usd, 4), 'prompt_tokens': u.get('prompt_tokens')}) + '\n'); log.flush()
        if not msg.get('tool_calls'):
            turn.append({'role': 'user', 'content': 'Continue with the task using the tools. Call done when every painting and NOTES.md are finished.'})
            turns.append(turn); summary.append(f'turn {n}: said "{short(msg.get("content"), 160)}"'); continue
        finished = False; notes = []; images = []
        for tc in msg['tool_calls']:
            name = tc['function']['name']
            try: args = json.loads(tc['function']['arguments'] or '{}')
            except json.JSONDecodeError: args = {}
            if name == 'view_image':
                try:
                    f = safe(cwd, args.get('path', ''))
                    mime = 'image/png' if f.suffix.lower() == '.png' else 'image/jpeg'
                    images.append({'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,' + base64.b64encode(f.read_bytes()).decode()}})
                    result = f'image {args.get("path")} attached below'
                except Exception as e: result = f'error: {e}'
            elif name == 'done':
                missing = [] if a.done == 'any' else [t for t in CROPS if not (cwd / 'bench' / 'out' / t / 'final.png').exists()]
                if missing: result = f'not done: no final.png yet for {", ".join(missing)}'
                else: finished = True; result = 'ok'
            else:
                try: result = run_tool(cwd, name, args)
                except Exception as e: result = f'error: {e}'
            turn.append({'role': 'tool', 'tool_call_id': tc['id'], 'content': short(result, TOOL_CHARS)})
            arg = args.get('command') or args.get('path') or ''
            notes.append(f'{name}({short(arg, 120)}) -> {short(result, 160)}'.replace('\n', ' '))
        if images: turn.append({'role': 'user', 'content': [{'type': 'text', 'text': 'Requested image(s):'}] + images})
        turns.append(turn)
        summary.append(f'turn {n}: ' + ('; '.join(notes))[:400])
        if finished: end = 'done'; break
    stats = {'model': a.model, 'turns': n, 'input_tokens': tin, 'output_tokens': tout, 'reasoning_tokens': rtok, 'reasoning_returned': reasoning_seen, 'reasoning_param_sent': None, 'vision': True, 'usd': round(usd, 3), 'seconds': round(time.time() - t0), 'end': end}
    log.write(json.dumps({'final': stats}) + '\n'); log.close()
    print(json.dumps(stats))


if __name__ == '__main__':
    main()

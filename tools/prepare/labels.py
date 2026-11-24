# labels.py ID IMAGE: the thing labels of one picture (names, kinds and boxes; the named forms are cut from them): one
# reply of a local vision model served by Ollama, nothing leaves the machine. IMAGE is relative to the preparation folder.
# Writes $UNPAINT_PREP/labels/ID.json; refuses to overwrite (a pinned file never changes: a new version takes a new name).
# UNPAINT_LABEL_MODEL names the model (default qwen3.8:27b-mlx, the one the 0.4 labels were made with);
# UNPAINT_LABEL_URL the server (default http://127.0.0.1:11434). Do not run while the image model is loaded.
import base64, json, io, re, sys, time, datetime, urllib.request, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_root import prep_root
M1 = os.environ.get('UNPAINT_LABEL_MODEL') or 'qwen3.8:27b-mlx'
URL = (os.environ.get('UNPAINT_LABEL_URL') or 'http://127.0.0.1:11434').rstrip('/')
ANS = ('LINE: pen|pencil|none (what the visible drawing lines are made with)', 'LINE_VISIBLE: yes|no (do drawn lines show in the finished picture)', 'FINISH: loose|medium|tight')
P1 = ('This is a painting. List the distinct things a painter would treat separately, as JSON only: '
      '[{"thing": name, "kind": one of wall|window|door|arch|gate|roof|sky|foliage|tree|ground|path|shadow|figure|animal|face|eye|hair|fur|clothing|water|other, '
      '"box": [x0,y0,x1,y1] as fractions of width and height, "how_drawn": "pen line"|"pencil"|"wash only"|"dry brush"}]. At most 24 items. '
      'Then one line: STYLE: <medium and handling in under 12 words>.\n' + '\n'.join('Then on its own line, ' + a + '.' for a in ANS) + '\nAnswer each of these with one word only.')
def ask(model, prompt, path):
    from PIL import Image
    im = Image.open(path).convert('RGB'); im.thumbnail((1024, 1024))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=88); t = time.time()
    req = urllib.request.Request(URL + '/api/chat', data=json.dumps({'model': model, 'stream': False, 'think': False, 'options': {'temperature': 0, 'num_predict': 2500}, 'messages': [{'role': 'user', 'content': prompt, 'images': [base64.b64encode(b.getvalue()).decode()]}]}).encode(), headers={'Content-Type': 'application/json'})
    txt = json.load(urllib.request.urlopen(req, timeout=1500))['message']['content']
    return txt, round(time.time() - t, 1)
def tail(txt):
    r = {}
    m = re.search(r'^\W*STYLE\s*:\s*(.+)$', txt, re.M | re.I); r['style'] = m.group(1).strip() if m else None
    for k in ('LINE_VISIBLE', 'LINE', 'FINISH'):
        m = re.search(r'^\W*' + k + r'\s*:?\s*\W*([A-Za-z]+)', txt, re.M | re.I); r[k.lower()] = m.group(1).lower() if m else None
    return r
def parse_things(txt):
    s = re.sub(r'```(?:json)?', '', txt); a = s.find('['); b = s.rfind(']')
    try:
        arr = json.loads(s[a:b + 1]); things = []
        for d in arr:
            things.append({'name': d.get('thing') or d.get('name'), 'kind': d.get('kind'), 'box': d.get('box'), 'how_drawn': d.get('how_drawn')})
        return things
    except Exception: return None
if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit('usage: labels.py ID IMAGE')
    R = prep_root(); sid, img = sys.argv[1], sys.argv[2]; f = os.path.join(R, 'labels', sid + '.json')
    if os.path.exists(f): sys.exit(f + ' exists: a new version takes a new name')
    d = {'id': sid, 'image': '../' + img, 'model': M1, 'date': datetime.date.today().isoformat()}
    txt, sec = ask(M1, P1, os.path.join(R, img)); things = parse_things(txt)
    d.update(raw_reply=txt, seconds=sec, parsed=things is not None, things=things or [], **tail(txt))
    os.makedirs(os.path.dirname(f), exist_ok=True); json.dump(d, open(f, 'w'), indent=1); print(sid, sec, 's', len(d['things']), 'things', 'line', d.get('line'))

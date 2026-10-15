#!/usr/bin/env python3
"""Named regions from Meta's hosted Segment Anything (SAM 3.1, Model API), written as a segments file.

A trial of the hosted model against the local SAM ViT-B in sam-points.py and subject-regions.py. Each --region is a
short text prompt ("orange cat", "tree", "sky"); SAM 3.1 returns every matching object with a box and a mask. The
masks of one prompt are joined into one region. Writes <out>/<name>.png (0 background, then one id per region in
--region order; a later region wins where two overlap), <name>.json (legend in the segments format, plus per-region
object counts, confidences and areas) and <name>-overlay.png to look at.

  MODEL_API_KEY=... python3 tools/seg/meta-sam.py <image> --out work/segments --name mittens-meta \\
      --region "orange cat" --region "blanket"

Needs: pip install meta_sam_parser openai opencv-python-headless numpy. MODEL_API_KEY is a pay-as-you-go Model API
key (billed per image, $2.50 per 1,000 at the time of writing); the Muse Code subscription key does not cover it.
The image goes inline as a base64 data URL; --upload sends it through POST /v1/files first instead.
--print-request prints the request without a key or a network call.
"""
import argparse, asyncio, base64, json, mimetypes, os, sys, time
import numpy as np, cv2

API = 'https://api.meta.ai/v1'
COLORS = [(230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180), (70, 240, 240), (240, 50, 230)]


def request(model, prompt, image_ref, encoding):
    return {'model': model, 'stream': True, 'metadata': {'mask_encoding': encoding},
            'input': [{'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': prompt}, image_ref]}]}


def data_url(path):
    mime = mimetypes.guess_type(path)[0] or 'image/png'
    return f'data:{mime};base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def paste(records, H, W, decode):
    """One HxW 0/1 mask from SAM's box-local masks, each scaled into its source-media bounds."""
    out = np.zeros((H, W), np.uint8)
    for r in records:
        raw = np.frombuffer(decode(r.mask), np.uint8).reshape(r.mask.height, r.mask.width)
        l, t = max(0, int(round(r.bounds.left))), max(0, int(round(r.bounds.top)))
        rgt, btm = min(W, int(round(r.bounds.right))), min(H, int(round(r.bounds.bottom)))
        if rgt <= l or btm <= t: continue
        m = cv2.resize((raw > 0).astype(np.uint8), (rgt - l, btm - t), interpolation=cv2.INTER_NEAREST)
        out[t:btm, l:rgt] |= m
    return out


async def segment(client, req):
    from meta_sam_parser import parse_responses_stream, image_segmentation_format
    events = await client.responses.create(**req)
    parsed = parse_responses_stream(events, image_segmentation_format())
    async for _ in parsed: pass
    return await parsed.final_result()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--out', default='work/segments'); ap.add_argument('--name', required=True)
    ap.add_argument('--region', action='append', required=True, help='text prompt; repeat for more regions')
    ap.add_argument('--model', default='sam-3.1'); ap.add_argument('--encoding', default='one_bit', choices=['one_bit', 'lossless'])
    ap.add_argument('--upload', action='store_true'); ap.add_argument('--print-request', action='store_true')
    a = ap.parse_args()
    img = cv2.imread(a.image)
    if img is None: sys.exit(f'meta-sam: cannot read {a.image}')
    H, W = img.shape[:2]
    inline = {'type': 'input_image', 'image_url': data_url(a.image)}
    if a.print_request:
        req = request(a.model, a.region[0], {**inline, 'image_url': inline['image_url'][:48] + '...'}, a.encoding)
        print(json.dumps({'url': f'{API}/responses', 'auth': 'Authorization: Bearer $MODEL_API_KEY', 'image': [W, H], 'body': req}, indent=1))
        return
    if not os.environ.get('MODEL_API_KEY'): sys.exit('meta-sam: set MODEL_API_KEY (a Model API key, not the Muse Code one)')
    from openai import AsyncOpenAI
    from meta_sam_parser import decode_mask_to_raster
    client = AsyncOpenAI(base_url=API, api_key=os.environ['MODEL_API_KEY'])
    ref = inline
    if a.upload:
        f = await client.files.create(file=open(a.image, 'rb'), purpose='user_data')
        ref = {'type': 'input_image', 'file_id': f.id}
    labels, legend, stats = np.zeros((H, W), np.uint8), {'0': 'background'}, []
    for i, prompt in enumerate(a.region, 1):
        t0 = time.time()
        res = await segment(client, request(a.model, prompt, ref, a.encoding))
        masks = [r for r in res.records if type(r).__name__ == 'SegmentationMaskRecord']
        m = paste(masks, H, W, decode_mask_to_raster)
        labels[m > 0] = i; legend[str(i)] = prompt
        stats.append({'id': i, 'name': prompt, 'objects': len(masks), 'confidence': [r.confidence for r in masks],
                      'area': float(m.mean()), 'seconds': round(time.time() - t0, 2), 'outcome': type(res.outcome).__name__,
                      'diagnostics': [str(d) for d in res.diagnostics]})
        print(f'{a.name}: "{prompt}" {len(masks)} object(s), {100 * m.mean():.1f}% of the image, {stats[-1]["seconds"]} s')
    os.makedirs(a.out, exist_ok=True)
    cv2.imwrite(os.path.join(a.out, a.name + '.png'), labels)
    regions = [{'id': 0, 'name': 'background'}] + [{'id': s['id'], 'name': s['name'], 'foreground': True} for s in stats]
    json.dump({'legend': legend, 'regions': regions, 'metaSam': {'model': a.model, 'encoding': a.encoding, 'regions': stats}},
              open(os.path.join(a.out, a.name + '.json'), 'w'), indent=1)
    over = img.copy()
    for s in stats:
        c = COLORS[(s['id'] - 1) % len(COLORS)][::-1]
        over[labels == s['id']] = (0.45 * over[labels == s['id']] + 0.55 * np.array(c)).astype(np.uint8)
    cv2.imwrite(os.path.join(a.out, a.name + '-overlay.png'), over)


if __name__ == '__main__':
    asyncio.run(main())

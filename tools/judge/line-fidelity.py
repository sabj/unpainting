#!/usr/bin/env python3
"""Offline source-ink fidelity audit and native-size gallery. Never painter input.

The frozen source ink masks must be reviewed alongside the source: no flattened
pen-and-wash scan supplies a perfect semantic ink layer. Scores measure fidelity
to those declared masks, not artist equivalence. Threshold sensitivity is saved.
"""
import argparse
import html
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'seg'))
from lines import thin
spec = importlib.util.spec_from_file_location('sketch', Path(__file__).resolve().parents[1]/'seg/sketch-lines.py')
sketch = importlib.util.module_from_spec(spec); spec.loader.exec_module(sketch)
KEYS = ['h36a', 'h34a', 'met-459612', 'met-459622', 'guardi']
# Fixed architectural regions, selected on targets before inspecting renders.
REGIONS = {
 'h36a': [('arch and gate', .34,.30,.66,.74),('upper windows',.32,0,.63,.17),('right windows',.76,.04,.98,.45),('fountain',.70,.46,.79,.67)],
 'h34a': [('upper tower',.20,0,.43,.31),('Gothic opening',.34,.28,.54,.65),('fountain',.29,.69,.83,.97),('right building',.61,.31,.82,.52)],
 'met-459612': [('vaults',.02,.01,.98,.51),('columns',.52,.43,.95,.99),('lower architecture',.02,.58,.68,.97)],
 'met-459622': [('upper architecture',.1,.06,.9,.54),('lower architecture and figures',.06,.5,.96,.96)],
 'guardi': [('vaults',.03,.03,.98,.5),('columns',.05,.3,.97,.87),('foreground figures',.03,.72,.97,.97)]}
CROPS = {'h36a':[(.50,.49),(.48,.10)], 'h34a':[(.44,.46),(.39,.13)],
         'met-459612':[(.67,.57),(.44,.82)], 'met-459622':[(.50,.40),(.45,.75)],
         'guardi':[(.40,.32),(.52,.73)]}


def distance(mask):
    return cv2.distanceTransform((~mask).astype('uint8'), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)


def widths(mask):
    skeleton, _ = thin(mask.astype('uint8'))
    d = cv2.distanceTransform(mask.astype('uint8'), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    values = np.maximum(1, 2*d[skeleton > 0]-1)
    return np.quantile(values, np.linspace(0, 1, 21)) if len(values) else np.zeros(21)


def compare(reference, output, paths, tolerance=2):
    dr, do = distance(reference), distance(output)
    precision = float(np.mean(dr[output] <= tolerance)) if output.any() else 0.
    recall = float(np.mean(do[reference] <= tolerance)) if reference.any() else 0.
    broken, gaps, eligible, all_length, missing_length = 0, 0, 0, 0., 0.
    for p in paths:
        if sketch.arc_length(p) < 12: continue
        eligible += 1
        hit = sketch.at(do, p) <= tolerance
        # Count internal missing runs at least 3 skeleton samples long. Endpoint
        # loss is separate from internal breaks; all missing length is reported.
        padded = np.r_[False, ~hit, False].astype(int)
        starts, ends = np.where(np.diff(padded)==1)[0], np.where(np.diff(padded)==-1)[0]
        count = sum(e-s >= 3 and s > 0 and e < len(hit) for s,e in zip(starts,ends))
        gaps += count; broken += count > 0
        all_length += len(hit); missing_length += int((~hit).sum())
    n, labels, stats, _ = cv2.connectedComponentsWithStats(reference.astype('uint8'), 8)
    eligible_ids = [i for i in range(1,n) if stats[i,cv2.CC_STAT_AREA] >= 20]
    covered = np.bincount(labels.ravel(), weights=(do<=tolerance).ravel(), minlength=n)
    missing = sum(covered[i]/stats[i,cv2.CC_STAT_AREA]<.5 for i in eligible_ids)
    # False bridges: painted components overlap two distinct substantial source
    # components. Report as a topology proxy, not a count of artist pen lifts.
    count, painted = cv2.connectedComponents(output.astype('uint8'), 8)
    pairs = np.unique(np.stack([painted[reference], labels[reference]],axis=1),axis=0)
    good = set(eligible_ids); groups = {}
    for a,b in pairs:
        if a and b in good: groups.setdefault(int(a),set()).add(int(b))
    merged = sum(max(0,len(ids)-1) for ids in groups.values())
    wr, wo = widths(reference), widths(output)
    return {'precision':precision,'recall':recall,'f1':2*precision*recall/max(1e-9,precision+recall),
        'inkPixels':int(output.sum()),'brokenPaths':int(broken),'eligiblePaths':eligible,'internalGaps':int(gaps),
        'missingSkeletonShare':missing_length/max(1,all_length), 'mergeProxy':merged,
        'missingComponents':int(missing),'eligibleComponents':len(eligible_ids),
        'widthQuantilesPx':wo.tolist(),'targetWidthQuantilesPx':wr.tolist(),
        'widthQuantileMAE':float(np.mean(np.abs(wr-wo)))}


def overlay(reference, output):
    im = np.full((*reference.shape,3),255,'uint8')
    im[reference] = (230,170,0)  # BGR cyan
    im[output] = (150,20,230)    # magenta
    im[reference & output] = (55,35,55)
    return im


def geometry(doc, w, h):
    image = np.zeros((h,w),'uint8')
    scale = np.array([w/doc['image']['w'],h/doc['image']['h']])
    for g in doc['lines']:
        points = np.asarray(g['points'])*scale
        cv2.polylines(image,[np.rint(points*16).astype('int32')],False,1,1,shift=4)
    return image.astype(bool)


def main():
    ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--root',required=True)
    ap.add_argument('--out',required=True); ap.add_argument('--partial',action='store_true')
    args=ap.parse_args(); root=Path(args.root); out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    rows=[]; sections=[]
    for key in KEYS:
        source=cv2.imread(str(root/'targets'/f'{key}.png'))
        ref=cv2.imread(str(root/'plans'/f'{key}-ink.png'),0)<128
        h,w=ref.shape; target=cv2.resize(source,(w,h),interpolation=cv2.INTER_AREA)
        skel,_=thin(ref.astype('uint8')); paths=sketch.trace(skel,min_points=2)
        cv2.imwrite(str(out/f'{key}-target.png'),target)
        cv2.imwrite(str(out/f'{key}-ink.png'),np.uint8(~ref)*255)
        row={'subject':key,'size':[w,h],'sourceInkPixels':int(ref.sum()),'regions':{}}
        cards={}; panels=[]
        for variant in ('before','trace','after','wash'):
            directory=root/'runs'/f'{key}-{variant}'
            if not (directory/'painting.png').exists():
                if args.partial: continue
                raise ValueError(f'Missing {directory}')
            im=cv2.imread(str(directory/'painting.png'))
            if im.shape[:2] != (h,w): raise ValueError(f'Unregistered render {key}: {im.shape}')
            guard=json.loads((directory/'target-guard.json').read_text())
            assert guard.get('requestedMode',guard.get('mode'))=='strict' and guard['violations']==0
            card=json.loads((root/'cards'/f'{key}-{variant}.json').read_text());card['size']=[w,h]
            cards[variant]=card
            cv2.imwrite(str(out/f'{key}-{variant}.png'),im)
            shutil.copy(directory/'target-guard.json',out/f'{key}-{variant}-guard.json')
            grey=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)/255.
            painted=grey<.72
            if variant!='wash':
                metrics=compare(ref,painted,paths)
                to_ref,to_paint=distance(ref),distance(painted)
                metrics['toleranceSweep']={str(t):{'precision':float(np.mean(to_ref[painted]<=t)) if painted.any() else 0,
                    'recall':float(np.mean(to_paint[ref]<=t))} for t in (0,1,2)}
                metrics['sensitivity']={str(t):{'precision':float(np.mean(distance(ref)[grey<t]<=2)) if (grey<t).any() else 0,
                    'recall':float(np.mean(distance(grey<t)[ref]<=2))} for t in (.60,.80)}
                for name,x0,y0,x1,y1 in REGIONS[key]:
                    region=np.zeros_like(ref);region[int(y0*h):int(y1*h),int(x0*w):int(x1*w)]=True
                    metrics.setdefault('regionRecall',{})[name]=float(np.mean(to_paint[ref & region]<=2))
                audit=json.loads((directory/'pen-state-audit.json').read_text())
                widths_mm=np.array([v for a in audit for v in a.get('contactWidthMm',[])])
                profile_floor,profile_ceiling=(.03,1.2) if 'drawing-ink' in card['settings'] else (.1,.4)
                metrics['execution']={'gestures':len(audit),'widthMmRange':[float(widths_mm.min()),float(widths_mm.max())],
                    'widthAtMinimumShare':float(np.mean(np.isclose(widths_mm,widths_mm.min()))),
                    'atProfileFloorShare':float(np.mean(np.isclose(widths_mm,profile_floor))),
                    'atProfileCeilingShare':float(np.mean(np.isclose(widths_mm,profile_ceiling))),
                    'contactWidthCV':float(widths_mm.std()/widths_mm.mean()),
                    'reloadsWithinStrokes':sum(a.get('reloadsWithinStroke',0) for a in audit),
                    'minStartingFill':min(a['instrument']['fill'] for a in audit)}
                row[variant]=metrics
                cv2.imwrite(str(out/f'{key}-{variant}-overlay.png'),overlay(ref,painted))
            else:
                opening=cv2.imread(str(directory/'drawing-opening.png'))
                opening_grey=cv2.cvtColor(opening,cv2.COLOR_BGR2GRAY)/255.
                ridge=cv2.GaussianBlur(grey,(0,0),3)-grey
                ink=(opening_grey<.72)&(cv2.GaussianBlur(opening_grey,(0,0),3)-opening_grey>.04)
                pen_audit=json.loads((root/'runs'/f'{key}-after'/'pen-state-audit.json').read_text())
                wash_audit=json.loads((directory/'pen-state-audit.json').read_text())
                same_geometry=len(pen_audit)==len(wash_audit) and all(
                    a['contactWidthMm']==b['contactWidthMm'] and a['pathLengthMm']==b['pathLengthMm']
                    and a['physicalPressure']==b['physicalPressure'] for a,b in zip(pen_audit,wash_audit))
                assert same_geometry, f'Wash opening changed the drawing: {key}'
                row['wash']={'openingInkStillDark':float(np.mean(grey[ink]<.72)),
                    'openingInkStillLocallyVisible':float(np.mean(ridge[ink]>.025)),
                    'sameOpeningGeometryContactAndPressure':same_geometry,
                    'standaloneInkConcentration':max(pen_audit[0]['instrument']['concentration']),
                    'washOpeningInkConcentration':max(wash_audit[0]['instrument']['concentration']),
                    'guardViolations':0}
                shutil.copy(directory/'drawing-opening.png',out/f'{key}-wash-opening.png')
            panels.append((variant,f'{key}-{variant}.png',card))
        for variant in ('before','after'):
            doc=json.loads((root/('before-plans' if variant=='before' else 'plans')/f'{key}-lines.json').read_text())
            geo=geometry(doc,w,h)
            row.setdefault('geometry',{})[variant]={'sourceSkeletonRecall':float(np.mean(distance(geo)[skel>0]<=2)),
                'sourceInkRecall':float(np.mean(distance(geo)[ref]<=2)),'paths':len(doc['lines']),
                'points':sum(len(g['points']) for g in doc['lines'])}
        row['cards']=cards;rows.append(row)
        def card_text(c):
            guard_note=c.get('guardSummary','strict / 0 violations')
            return html.escape(f"{c['release']} · sim {c['sim']}\ncommit {c['commit']}\nplan {c['planSource']}\nprep {c['prep']}\nsize {w} × {h} · seed {c['seed']} · guard {guard_note}\n"+' '.join(c['settings']))
        reference_commit=cards.get('after',cards.get('before',{})).get('commit','unrendered')
        sourcecard={'release':f'V097-dev (line-quality @ {reference_commit[:7]}) · source reference','sim':100,
            'commit':reference_commit+' (paired renderer; reference is not painted)',
            'planSource':'source ink; mask frozen before renders','prep':'resize only / reviewed automatic ink mask','seed':0,
            'guardSummary':'not applicable (reference)','settings':['source resized with INTER_AREA; ink mask fixed before renders']}
        columns=[('Target drawing',f'{key}-target.png',sourcecard)]+panels+[('Declared source ink',f'{key}-ink.png',sourcecard)]
        for variant in ('before','after'):
            if variant in cards: columns.append((variant+' overlay',f'{key}-{variant}-overlay.png',cards[variant]))
        def audit_links(title):
            links=[]
            if title in cards: links.append(f'<a href="{key}-{title}-guard.json">Guard record</a>')
            if title=='wash': links.append(f'<a href="{key}-wash-opening.png">Saved opening ink</a>')
            return ' · '.join(links)
        column_html=''.join(f'<figure><figcaption><b>{html.escape(title)}</b><pre>{card_text(c)}</pre>{audit_links(title)}</figcaption><a href="{file}"><img src="{file}" width="{w}" height="{h}" loading="lazy"></a></figure>' for title,file,c in columns)
        crops=[]
        by_title={title:(file,c) for title,file,c in columns}
        for number,(cx,cy) in enumerate(CROPS[key]):
            x=max(0,min(w-240,round(cx*w)-120)); y=max(0,min(h-240,round(cy*h)-120))
            cells=[]
            for title in ('Target drawing','before','after','before overlay','after overlay','wash'):
                if title not in by_title: continue
                file,c=by_title[title]; im=cv2.imread(str(out/file))[y:y+240,x:x+240]
                cropfile=f'{key}-crop{number}-{title.replace(" ","-")}.png';cv2.imwrite(str(out/cropfile),im)
                cells.append(f'<figure class="crop"><figcaption><b>{title}</b><pre>{card_text(c)}\n240 × 240 native crop at ({x}, {y})</pre></figcaption><img src="{cropfile}" width="240" height="240" loading="lazy"></figure>')
            crops.append(f'<p>100% crop {number+1} · source rectangle ({x}, {y}, 240, 240)</p><div class="sheet">'+''.join(cells)+'</div>')
        summary=''
        if 'before' in row and 'after' in row:
            b,a=row['before'],row['after']
            summary=f"Precision {b['precision']:.1%} → {a['precision']:.1%}; recall {b['recall']:.1%} → {a['recall']:.1%}; F1 {b['f1']:.3f} → {a['f1']:.3f}. Internal gaps {b['internalGaps']} → {a['internalGaps']}; width error {b['widthQuantileMAE']:.2f} → {a['widthQuantileMAE']:.2f} px."
            q=a['targetWidthQuantilesPx'];qb=b['widthQuantilesPx'];qa=a['widthQuantilesPx']
            summary+=f" Median / 90th-percentile ink width: target {q[10]:.2f} / {q[18]:.2f} px; before {qb[10]:.2f} / {qb[18]:.2f}; after {qa[10]:.2f} / {qa[18]:.2f}."
        sections.append(f'<section id="{key}"><h2>{key}</h2><p>{summary}</p>'+''.join(crops)+f'<details><summary>Full registered sheets at 100%</summary><div class="sheet">{column_html}</div></details></section>')
    document={'method':'Frozen source-derived ink masks, tolerance 2 native pixels; output luminance < .72. Automatic ink/wash separation is an estimate, not manually annotated ground truth. Internal gaps >=3 skeleton samples on paths >=12 px. Missing components >=20 pixels with recall <50%. Merge proxy counts reference components joined by a painted component. Width quantile MAE uses skeleton distance-transform widths. All metrics are offline.', 'subjects':rows}
    (out/'metrics.json').write_text(json.dumps(document,indent=2)+'\n')
    (out/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drawing fidelity — five source-ink tests</title><style>body{font:16px system-ui;margin:24px;color:#242424;background:#f2f0eb}h1{font-size:30px}p{max-width:1050px;line-height:1.5}a{color:#07516d}.sheet{display:flex;gap:16px;overflow:auto;align-items:start;background:white;padding:16px}figure{margin:0;flex:none}.crop{width:240px}.crop figcaption{width:240px}summary{padding:18px 0;cursor:pointer}figcaption{height:220px;overflow:auto;max-width:1080px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.45 monospace;margin:8px 0}img{display:block;max-width:none}section{margin:40px 0}nav a{margin-right:20px}</style><h1>Drawing fidelity</h1><p>Exactly five drawings. Each sheet is at <b>100%: one simulation pixel per CSS pixel</b>; scroll horizontally to compare. Cyan is source ink, magenta is painted ink, dark overlap is agreement. Images and run cards are downloadable. Geometry previews are not paintings.</p><p>'+html.escape(document['method'])+'</p><p><a href="metrics.json">All measurements and run cards</a> · <a href="FIDELITY.md">Report</a> · <a href="manifest.json">Source hashes</a> · <a href="SOURCES.md">Met provenance</a></p><nav>'+''.join(f'<a href="#{k}">{k}</a>' for k in KEYS)+'</nav>'+''.join(sections)+'</html>')
    print(json.dumps([{k:v for k,v in r.items() if k in ('subject','geometry','wash')} for r in rows],indent=2))


if __name__=='__main__': main()

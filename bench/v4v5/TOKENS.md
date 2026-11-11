# Recipe tokens

Base (always applied, under your tokens): `region_w13_lay4_sky3_skyb_cpp`.

Numbers in a token are free: `_lay3` sets --midlayers 3, `_st35` sets --shadowthresh .35 (the examples below show the scaling). There is no dark, cool or middle gain: the painter delivers the value the plan states. Tokens in one slot replace each other: lay2/lay4; hue/sky/sky3; cur/relonly; soft/softs; stub/stub2/stone. A setting only acts while its switch is on, so the painter reports the others as unused: eye and dg need _dp (refused, a gain), and the texture tokens (tv, tfl, stub, stub2) change no painting at all. Every subject gets the same base. Choose pigments with `--paints` in extra-args.json (pigment names: src/paint/methods/material-profiles.mjs). `<plan>` is bench/plan.

| token | painter options it sets (on top of the template) |
|---|---|
| `_onedom` | --middomain 0 |
| `_nest` | --nestedmid 1 |
| `_lay2` | --midlayers 2 |
| `_lay4` | --midlayers 4 |
| `_lf` | --loadfeather 1.5 |
| `_ls10` | --layersmooth 1 |
| `_acc3` | refused: a value gain: moves middle demand into the accent band |
| `_lt` | --layertexture 1 |
| `_cur` | --paperbase white, --paperrel (removed), --paperrgb 252,251,248 |
| `_relonly` | --paperlights (removed), --paperrgb (removed) |
| `_noslane` | --skylanes (removed) |
| `_st40` | --shadowthresh 0.4 |
| `_shw45` | --shadowwater 0.45 |
| `_dkf` | --darkfirst 1 |
| `_dp80` | refused: a value gain: doubles dark weight sheet-wide wherever the target is darker than a threshold |
| `_ms120` | --minshapecells 120 |
| `_dg2` | --deepgrow 2 |
| `_ts3` |  |
| `_tv8` | --texvariety 0.8 |
| `_eye10` | --eyering <n>/<target width> |
| `_skyb` | --skyblue 1 |
| `_cpp` | --paper coldpress |
| `_tsh8` |  |
| `_tfl8` | --texflow 0.8 |
| `_novar` | refused: a physics switch: turns off film diffusion, a physical process, which can hide engine faults |
| `_sk1` | --skyonelayer 1 |
| `_fs60` | --fastsettle 60 |
| `_fl0` | --feedbacklag 0 |
| `_ssp2` |  |
| `_spl6` | --strokeplan 1, --lanemm 6 |
| `_sml30` | --strokemm 30 |
| `_wre15` | --washreach 1.5 |
| `_lad` | --laneadapt 1 |
| `_sky` | --layerhue 1, --skysplit 1 |
| `_sky3` | --layerhue 1, --skysplit 1 |
| `_hue` | --layerhue 1 |
| `_efade` | --edgefade 1.2 |
| `_stone` | --layertexture 1, --texshort 1, --texpress .5 |
| `_stub` | --texshort 1 |
| `_stub2` | --texshort 1, --texpress .6 |
| `_soft` | --softarcs 8, --softarclen 48, --softmm 1.0 |
| `_softs` | --softsplit 1, --softarcs 12, --softarclen 40, --softmm 0.7 |
| `_och30` |  |
| `_ew5` | --edgewobble 0.5 |
| `_smc4` |  |
| `_sfa8` | --softarcs 8, --softarclen 200, --softmm 1.0 |
| `_opk` | --drawingfile <plan>/closingink |

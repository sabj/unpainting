# Recipe tokens

Base (always applied, under your tokens): `region_w13_lay4_ink4_rec2x_rcl_sky3_leaf_sep8_cg13_vio_rg10_blk60_bmm40_bka20_birr_skyb_cpp_dk13_tv8_uncap_pgreen_dwg200_tp2_shs`.

Numbers in a token are free: `_dk11` sets --darkgain 1.1, `_lay3` sets --midlayers 3 (the examples below show the scaling). Tokens in one slot replace each other: lay2/lay4; sep/sep2..sep9; ink2/ink3/ink4; rec2/rec2x; hue/sky/sky3; cur/relonly; slane/noslane; soft/softs; stub/stub2/stone; pwarm/pgold/pgreen/pbs/rv. Stone-block tokens of the base (blk, bmm, bka, birr) act on architecture only. Palette tokens act only on Trumbull; there `--paints` is: default ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sepia; _pgreen ochre,rawsienna,hansa,ultramarine,cerulean,sepia,sapgreen (+_pbs adds sienna); _pwarm ochre,rawsienna,hansa,ultramarine,cerulean,sepia; _pgold ochre,hansa,ultramarine,cerulean,sepia; _rv adds rose and --roseviolet 1. Elsewhere set `--paints` in extra-args.json (pigment names: src/paint/methods/material-profiles.mjs). `<plan>` is bench/plan.

| token | painter options it sets (on top of the template) |
|---|---|
| `_onedom` | --middomain 0 |
| `_nest` | --nestedmid 1 |
| `_lay2` | --midlayers 2 |
| `_lay4` | --midlayers 4 |
| `_dk13` | --darkgain 1.3 |
| `_lf` | --loadfeather 1.5 |
| `_sg12` | --stylegain 1.2 |
| `_ls10` | --layersmooth 1 |
| `_acc3` | --accentshare 0.3 |
| `_lt` | --layertexture 1 |
| `_cur` | --paperbase white, --paperrel (removed), --paperrgb 252,251,248 |
| `_relonly` | --paperlights (removed), --paperrgb (removed) |
| `_cg13` | --coolgain 1.3 |
| `_noslane` | --skylanes (removed), --skylanemm (removed), --skylanestep (removed) |
| `_slane` | --skylanemm (removed), --skylanestep (removed) |
| `_st40` | --shadowthresh 0.4 |
| `_mg12` | --midgain 1.2 |
| `_vio` | --violetshadow 1 |
| `_shw45` | --shadowwater 0.45 |
| `_rv` | --roseviolet 1 |
| `_dkf` | --darkfirst 1 |
| `_rg10` | --groundglaze 1 |
| `_blk60` | --stoneblocks 0.6 |
| `_bka20` | --stoneblockamt 0.2 |
| `_bmm40` | --stoneblockmm 4 |
| `_dp80` | --deepaccent 80 |
| `_ms120` | --minshapecells 120 |
| `_birr` | --stoneirregular 1 |
| `_dg2` | --deepgrow 2 |
| `_ts3` | --texshare 0.3 |
| `_rx3` | --recessmax 3 |
| `_bvar` | --stonecourses 1 |
| `_tv8` | --texvariety 0.8 |
| `_rac` | --recessaccent 1 |
| `_eye10` | --eyering <n>/<target width> |
| `_skyb` | --skyblue 1, --skyfloc .5, --layerhue 1, --skysplit 1 |
| `_cpp` | --paper coldpress |
| `_tsh8` | --texshadow 0.8 |
| `_tfl8` | --texflow 0.8 |
| `_novar` | --physics filmDiffuse=0 |
| `_sk1` | --skyonelayer 1 |
| `_bcl3` | --stoneclusters 3 |
| `_leaf` | --foliagerefit 1 |
| `_fs60` | --fastsettle 60 |
| `_fl0` | --feedbacklag 0 |
| `_sep` | --inkk .396,.481,.619 |
| `_sep2` | --inkk .396,.481,.619, --inkkscale 2 |
| `_sep4` | --inkk .396,.481,.619, --inkkscale 4 |
| `_sep8` | --inkk .396,.481,.619, --inkkscale 8 |
| `_ink2` | --drawinglast <plan>/closingink, --closinglines 100000, --closingpressure 1, --closingedgemin 0, --drawwant 1 |
| `_ink3` | --drawinglast <plan>/closingink, --closinglines 100000, --closingpressure 1, --closingedgemin 0, --drawwant .75 |
| `_ink4` | --drawinglast <plan>/closingink4, --closinglines 100000, --closingpressure 1, --closingedgemin 0, --drawwant 1 |
| `_rec2` | --recesslayers 2 |
| `_rec2x` | --recesslayers 2, --recessshare .75 |
| `_rcl` | --recessclean 1 |
| `_swarm` | --stonewarm 1 |
| `_ssp2` | --stonesplit 2 |
| `_tp2` | --touchpoints 2, --touchgain .6 |
| `_spl6` | --strokeplan 1, --lanemm 6 |
| `_sml30` | --strokemm 30 |
| `_wre15` | --washreach 1.5 |
| `_lit20` | --litlift 0.2 |
| `_shs` | --shadowraw 1 |
| `_lad` | --laneadapt 1 |
| `_lw` | --litwarm 1 |
| `_sky` | --layerhue 1, --skysplit 1 |
| `_sky3` | --layerhue 1, --skysplit 1 |
| `_hue` | --layerhue 1 |
| `_efade` | --edgefade 1.2 |
| `_stone` | --layertexture 1, --texshort 1, --texpress .5 |
| `_stub` | --texshort 1 |
| `_stub2` | --texshort 1, --texpress .6 |
| `_soft` | --softarcs 8, --softarclen 48, --softmm 1.0 |
| `_softs` | --softsplit 1, --softarcs 12, --softarclen 40, --softmm 0.7 |
| `_ol36` | --openinglines 36 |
| `_uncap` | --openinglines 100000, --closinglines 100000 |
| `_opp25` | --openingpressure 0.25 |
| `_och30` | --stoneochremin 0.3 |
| `_dwg200` | --drawwidthgain 2 |
| `_dwm50` | --drawwidthmin 0.5 |
| `_ew5` | --edgewobble 0.5 |
| `_smc4` | --stonemincells 4 |
| `_sfa8` | --softarcs 8, --softarclen 200, --softmm 1.0 |
| `_opk` | --drawingfile <plan>/closingink |

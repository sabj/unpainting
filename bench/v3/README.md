# The freehand kit session

One session paints one target freehand, stroke by stroke, through `bench/kit.mjs`: round V3, and level 1 before 0.4's fixed rounds ([rules](../docs/rules.md)). `node bench/scripts/run.mjs --round V3 --model KEY --crops TARGET --out DIR` still runs it ([scripts/v3.mjs](../scripts/v3.mjs)). The kit, guard and technique guides are the [V2 ones](../v2/README.md).

- [BRIEF.md](BRIEF.md) and [prompts.json](prompts.json): the brief and first prompt, filled in per session.
- [crops.json](crops.json): the targets, each with its picture, coarse map and rendering unit (Auto's water steps, for the runaway guard). A target without one is refused.
- [TIPS.md](TIPS.md) and [tips/](tips/): the painting tips.

One attempt of three runs of the model's script; the last completed run counts. The session has 60 minutes on the clock, runs closed ([closed.mjs](../scripts/pipeline/closed.mjs)) and has no network but the model's own service.

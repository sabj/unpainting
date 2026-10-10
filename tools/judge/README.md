# tools/judge

Command-line scoring tools for finished paintings and their saved stages. They are advisory and never feed back into the painter. [Judging](../../docs/judging.md) explains the measures.

- `judge-plate.mjs`: repeatable image measurements on one reference image and, if given, its painting.
- `stage-check.mjs`: the process measures from `src/eval/stages.mjs` on any run directory with `frames.json`, `source.jpg` and `painting.jpg`.
- `concert-judge.mjs`: every group of related measurements at once over a set of painter configurations. It writes `concert.json` and `concert.txt`.
- `judge.mjs`: measures a painting against a folder of real ink-and-wash scans in `data/refs/real/`, which is not in the repository.
- `judge-prompts.mjs`: writes prompts asking AI models to judge a run's saved frames, then tallies their answers.
- `rounds/`: a blind evaluation of saved stages with AI models as judges. `run.mjs` builds one set of images and instructions per judge and `tally.mjs` reveals the run names in the results.

Start with:

```sh
node tools/judge/stage-check.mjs work/my-picture
```

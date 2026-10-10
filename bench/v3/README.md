# V3 inputs

V3 is V2 with attempts. One session paints one target. After each attempt the model sees its painting next to the target and paints again on a fresh sheet, keeping its notes and scripts. [scripts/v3.mjs](../scripts/v3.mjs) runs it.

- [BRIEF.md](BRIEF.md): the brief, with `{CROP}`, `{SIZE}`, `{STYLE}`, `{TARGET}` and `{ATTEMPTS}` filled in per session.
- [prompts.json](prompts.json): the first prompt and the prompt between attempts. The model may end the session early by writing `bench/DONE`.

The toolkit, guard and technique guides are the V2 ones ([../v2/](../v2/README.md)). Rules:

- Each attempt is stopped after 32 minutes. The brief says 30.
- The paper seed is 1 for every attempt.
- Attempt n of every target makes try n.

Claude and Codex sessions are resumed between attempts. Open models on Together have no resume: each attempt is a fresh tool loop on the brief and the attempt's prompt, with the model's notes and earlier attempts on disk.

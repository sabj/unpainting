# The commands that made this example, run from the worktree root with bench/plan/ holding the example's target.png
# (a synthetic seascape drawn by a script, not a photograph).
P=bench/plan
node bench/tools/trace-ink.mjs $P/target.png $P/opening-lines.json .12 14 .62
cp $P/opening-lines.json $P/closing-lines.json
cat > $P/config.json <<'JSON'
{"subject":"EXAMPLE","name":"EXAMPLE",
 "styleSelection":{"style":"precise-watercolor","reason":"value planes carry the form",
   "regions":{"EXAMPLE.sky":{"style":"atmospheric-wet","reason":"soft graded sky"}}},
 "families":[{"id":"EXAMPLE.sky","bounds":[0,0,1,0.45],"baseMove":"wet in wet","referenceCue":"pale graded sky"},
             {"id":"EXAMPLE.sea","bounds":[0,0.45,1,1],"baseMove":"wet on dry","referenceCue":"darker sea, broken lights"}],
 "reserves":[{"reason":"brightest cloud edge","bounds":[0.6,0.13,0.66,0.19]}]}
JSON
echo '["--darkgain","1.1"]' > $P/extra-args.json
echo region_w13_lay2_noslane > bench/variant.txt
bash bench/check.sh > bench/example/check-output.json

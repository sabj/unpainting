#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor } from "../src/paint/doctor.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const report = runDoctor({ root });
console.log(JSON.stringify(report, null, 2));
for (const w of report.warnings ?? []) console.error(`doctor warning: ${w}`);
if (!report.ok) {
  console.error(`doctor failed: ${report.failures.join("; ")}`);
  process.exit(1);
}

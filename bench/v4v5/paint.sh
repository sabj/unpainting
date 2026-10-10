#!/bin/bash
# Start, watch and steer the painting of your plan. Usage (from the tree root): bash bench/paint.sh <command>
# Commands: start | wait | look | next | run <pass> | run closing | finish | revise [then next|run <pass>|finish] | status | help
cd "$(dirname "$0")/.." || exit 2
exec node bench/paint.mjs "$@"

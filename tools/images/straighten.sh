#!/bin/sh
# The 11 building pictures that came back drawn from a corner, straightened: door position (0..1 across
# the original) and the columns (px) where the base is the front wall. Originals are in art-redo/ (not in git).
# Then run: node tools/images/art.ts
cd "$(dirname "$0")/../.." || exit 1
s() { node tools/images/straighten.ts "art-redo/old-$1.jpg" "$1" "$2" "$3"; }
s gang-btc-maxis 0.582 400-1250
s gang-gangstas 0.412 280-430,660-880
s gang-jailbirds 0.575 470-1250
s gang-mcga 0.582 420-720,960-1180
s gang-radioactive 0.384 200-900
s gang-robbers 0.582 520-1040
s gang-skulls 0.533 360-820,990-1250
s gang-suits 0.419 150-500,700-1180
s gang-visor-gang 0.537 450-1230
s gang-wizards 0.504 0
s practice 0.604 420-1080

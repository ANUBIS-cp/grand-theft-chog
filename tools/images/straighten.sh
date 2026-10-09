#!/bin/sh
# The 11 building pictures that came back drawn from a corner, made dead-on like the straight ones:
#   door position (0..1 across the original), the columns (px) where the base is the front wall,
#   which half has no side wall showing (kept and mirrored about the door), and the parts kept as drawn:
#   LC = the rooftop landmark, centred over the door; B = a door that isn't symmetric; X = cleared.
# Originals are in art-redo/ (not in git). Then run: node tools/images/art.ts
cd "$(dirname "$0")/../.." || exit 1
s() { node tools/images/straighten.ts "art-redo/old-$1.jpg" "$1" "$2" "$3" "$4" "$5"; }
s gang-btc-maxis 0.599 400-1250 right "LC:560-860:150-425;B:720-930:560-840"
s gang-gangstas 0.416 280-430,660-880 left "LC:440-990:190-545"
s gang-jailbirds 0.575 470-1250 right "LC:590-830:150-490;B:745-880:640-830"
s gang-mcga 0.572 420-720,960-1180 right "LC:500-970:160-495;B:745-865:600-745;X:0-1407:752-1100"
s gang-radioactive 0.384 200-900 left "BC:770-1290:0-332"
s gang-robbers 0.590 520-1040 right "LC:800-1090:140-435;B:715-925:470-770"
s gang-skulls 0.533 360-820,990-1250 right "LC:600-890:155-430;B:680-820:505-770"
s gang-suits 0.428 150-500,700-1180 left "LC:180-520:290-420"
s gang-visor-gang 0.538 450-1230 right "LC:460-1010:145-450;B:690-825:540-770"
s gang-wizards 0.515 0 right "B:650-800:470-670"
s practice 0.611 420-1080 right

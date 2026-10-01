#!/bin/bash
# Stepper check at four widths in four languages against the local Worker (Van luxury 12, quick 261001).
D=/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/a59f031f-461f-402d-8699-cc93d8a2d578/scratchpad/vl12
for L in en de fr ar; do
  for WH in 1440x900 1024x768 768x1024 390x844; do
    W=${WH%x*}; H=${WH#*x}
    echo "== $L $W"
    STAGE=stepper LANG_CODE=$L W=$W H=$H SHOTS=$D/shots node $D/vl12-browser.mjs 2>&1 | grep '^PASS\|^FAIL\|^errors\|Error' | cut -c1-260
  done
done

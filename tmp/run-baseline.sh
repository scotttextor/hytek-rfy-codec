#!/bin/bash
PAIRS=(
  "test-corpus/HG250096_SE14_LOT_85_SHARMAN_STREET_REDBANK_PLAINS/U1-GF-RP-70.075"
  "test-corpus/HG250096_SE14_LOT_85_SHARMAN_STREET_REDBANK_PLAINS/U2-GF-RP-70.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-RP-70.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-RP-70.095"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-2F-RP-70.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-2F-RP-70.095"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-GF-LBW-89.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-GF-LBW-89.095"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-GF-NLBW-70.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-2F-LBW-89.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-GF-NLBW-70.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-GF-LBW-89.075"
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH02-GF-LBW-89.095"
)
for pair in "${PAIRS[@]}"; do
  out="tmp/$1-$(basename "$pair")"
  node scripts/diff-vs-detailer.mjs "$pair.xml" "$pair.rfy" "$out" > /dev/null 2>&1
  if [ -f "$out.json" ]; then
    label=$(basename "$pair")
    cohort=""
    case "$label" in
      *RP*) cohort="RP" ;;
      *LBW*) cohort="LBW" ;;
      *NLBW*) cohort="NLBW" ;;
    esac
    node -e "const d = JSON.parse(require('fs').readFileSync('$out.json','utf8')); const denom = d.totals.matched + d.totals.missing; const c = (d.totals.matched / Math.max(1, denom) * 100).toFixed(2); console.log('${cohort}\t${label}\t', d.totals.matched, '/', denom, '=', c+'%');"
  fi
done

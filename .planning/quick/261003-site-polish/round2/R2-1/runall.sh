cd "$(dirname "$0")"
run(){ node shot.mjs "$@" 2>&1 | grep -E "^R2-1|TimeoutError|waiting for" | cut -c1-70; }
for lang in en ar; do
 for w in 1440 1024 768 390; do run before $w $lang full zur list; run after $w $lang full zur list; done
done
run after 1440,390 en full zur loading
run after 1440,390 en full zzqx empty
run after 1440,390 en full zur popular
run after 1440 en full zur hover
run after 1440,768 en full zur active:4
run after 1440,390 ar full zzqx empty
run after 390 ar full zur loading
run after 390 ar full zur popular
echo FINISHED

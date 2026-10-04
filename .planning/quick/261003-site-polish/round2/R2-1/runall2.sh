cd "$(dirname "$0")"
S=../../screens
run(){ node shot.mjs "$@" 2>&1 | grep -E "^R2-1|TimeoutError" | cut -c1-70; }
for lang in en ar; do for w in 1440 1024 768 390; do
 for v in before after; do [ -f $S/R2-1-$v-$lang-$w.png ] || run $v $w $lang full zur list; done
done; done
[ -f $S/R2-1-after-loading-en-390.png ] || run after 390 en full zur loading
[ -f $S/R2-1-after-empty-en-390.png ] || run after 390 en full zzqx empty
[ -f $S/R2-1-after-popular-en-390.png ] || run after 390 en full zur popular
[ -f $S/R2-1-after-active-ar-390.png ] || true
[ -f $S/R2-1-after-empty-ar-390.png ] || run after 390 ar full zzqx empty
[ -f $S/R2-1-after-loading-ar-390.png ] || run after 390 ar full zur loading
[ -f $S/R2-1-after-popular-ar-390.png ] || run after 390 ar full zur popular
[ -f $S/R2-1-after-active-ar-768.png ] || run after 768 ar full zur active:4
echo FINISHED

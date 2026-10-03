# Hand-over: phone header wordmark (quick 261003-phone-header-wordmark)

**For:** the controller. **Written:** 2026-10-03 18:51 +0400. **Branch:** `fix/phone-header-wordmark`, cut from origin/main
`befb6e54`. Owner chose this job in the question form; the design is the mock (signed). Site code: one line in
`SiteHeader.tsx` + 72 header pictures. No migration, no strings. Needs a deploy (React pages below 1080 px).

Proof and pictures: `SUMMARY.md` and `screens/` here. After deploy: open vamostaxi.site/checkout on a phone,
expect "Vamos taxi" in full at the top left (top right in Arabic).

Note: Docker Desktop stopped on this Mac at about 18:50 (+04), not by this session; every local stack is down until
it is started again. Lab `hdr` is down; its stack and `~/.vamos-scratch/lab-hdr` are removed by `lab.sh destroy hdr`
once Docker runs.

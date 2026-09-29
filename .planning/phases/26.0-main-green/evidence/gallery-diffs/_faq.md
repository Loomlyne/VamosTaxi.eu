### faq

| test | project | mismatch | diff image |
|---|---|---|---|
| screenshot faq en @component | component-390 | expected 390px by 4698px, received 390px by 5717px. 709111 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-en-diff.png` |
| screenshot faq de @component | component-390 | expected 390px by 4812px, received 390px by 5717px. 693551 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-de-diff.png` |
| screenshot faq fr @component | component-390 | expected 390px by 4782px, received 390px by 5717px. 710858 pixels (ratio 0.32 of all image pixels) are different. | `faq/component-390/faq-fr-diff.png` |
| screenshot faq ar @component | component-390 | expected 390px by 4531px, received 390px by 5717px. 765932 pixels (ratio 0.35 of all image pixels) are different. | `faq/component-390/faq-ar-diff.png` |
| screenshot faq en @component | component-768 | expected 768px by 3413px, received 768px by 3621px. 698663 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-768/faq-en-diff.png` |
| screenshot faq de @component | component-768 | expected 768px by 3473px, received 768px by 3621px. 679209 pixels (ratio 0.25 of all image pixels) are different. | `faq/component-768/faq-de-diff.png` |
| screenshot faq fr @component | component-768 | expected 768px by 3447px, received 768px by 3621px. 697028 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-768/faq-fr-diff.png` |
| screenshot faq ar @component | component-768 | expected 768px by 3324px, received 768px by 3621px. 793849 pixels (ratio 0.29 of all image pixels) are different. | `faq/component-768/faq-ar-diff.png` |
| screenshot faq en @component | component-1024 | expected 1024px by 3409px, received 1024px by 3254px. 850446 pixels (ratio 0.25 of all image pixels) are different. | `faq/component-1024/faq-en-diff.png` |
| screenshot faq de @component | component-1024 | expected 1024px by 3506px, received 1024px by 3254px. 990259 pixels (ratio 0.28 of all image pixels) are different. | `faq/component-1024/faq-de-diff.png` |
| screenshot faq fr @component | component-1024 | expected 1024px by 3449px, received 1024px by 3254px. 914055 pixels (ratio 0.26 of all image pixels) are different. | `faq/component-1024/faq-fr-diff.png` |
| screenshot faq ar @component | component-1024 | expected 1024px by 3325px, received 1024px by 3254px. 764558 pixels (ratio 0.23 of all image pixels) are different. | `faq/component-1024/faq-ar-diff.png` |
| screenshot faq en @component | component-1440 | expected 1440px by 2726px, received 1440px by 3242px. 1615708 pixels (ratio 0.35 of all image pixels) are different. | `faq/component-1440/faq-en-diff.png` |
| screenshot faq de @component | component-1440 | expected 1440px by 2792px, received 1440px by 3242px. 1533742 pixels (ratio 0.33 of all image pixels) are different. | `faq/component-1440/faq-de-diff.png` |
| screenshot faq fr @component | component-1440 | expected 1440px by 2812px, received 1440px by 3242px. 1518814 pixels (ratio 0.33 of all image pixels) are different. | `faq/component-1440/faq-fr-diff.png` |
| screenshot faq ar @component | component-1440 | expected 1440px by 2698px, received 1440px by 3242px. 1814370 pixels (ratio 0.39 of all image pixels) are different. | `faq/component-1440/faq-ar-diff.png` |

Non-screenshot failures:

- [component-390] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-390] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-390] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-768] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-768] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-768] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-1024] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-1024] › tests/visual/faq.spec.ts:149:7 › FAQ page and gallery @component › open circle stays full-strength yellow @component — expect(locator).toHaveCSS(expected) failed
- [component-1024] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-1024] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality
- [component-1440] › tests/visual/faq.spec.ts:125:7 › FAQ page and gallery @component › keyboard disclosure aria-controls and ring @component — expect(received).toBe(expected) // Object.is equality
- [component-1440] › tests/visual/faq.spec.ts:186:7 › FAQ page and gallery @component › rtl circle inset-inline-end @component — expect(locator).toHaveAttribute(expected) failed
- [component-1440] › tests/visual/faq.spec.ts:196:7 › FAQ page and gallery @component › toggle accessible name differs en vs de @component — expect(received).not.toBe(expected) // Object.is equality

Classification of the non-screenshot failures: stale spec, owner to rule. Left unmarked and unfixed. `/faq` is now served by the DC mock (`lib/dc-mock-urls.ts` maps `/app/pages/faq` to `/faq`), not the React page the spec was written for. Observed on the mock: first item is already `aria-expanded="true"` (spec expects "false"); `/ar/faq` and `/de/faq` keep `<html lang="en" dir="ltr">` because the mock takes its language from the store, not the URL prefix (2 tests); at 1024 the hovered open circle is charcoal `rgb(30, 31, 31)`, spec expects yellow `rgb(253, 194, 11)`. The `screenshot faq <lang>` mismatches above are the same cause (mock page is taller: 5717 px vs 4698 px at 390). The `/dev/faq` gallery screenshots match their baselines.
Run: all four projects, `--retries=0`, Playwright serial mode lifted locally (not committed) so every test ran: 23 passed, 29 failed, 4 skipped. The 16 `screenshot gallery <lang>` tests pass.

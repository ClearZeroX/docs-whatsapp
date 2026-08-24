# 2026-08-03 template stability content prompts (deliverable)

Update the Apollo config keys below with these final texts:

- `material.stability.content.analysis.systemPrompt`: see `docs/superpowers/specs/2026-08-03-template-stability-content-dedup-design.md` section 6.1.
- `material.stability.content.analysis.negative.list.systemPrompt`: see same design doc section 6.2.

Both reuse the de-duplicated sampling semantics (`templateCount`, aggregated
`wabaCategoryMap`, `materialCombinationId`, `materialIds`) described there.

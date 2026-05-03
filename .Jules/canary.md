## 2026-05-03 - MkDocs Material Admonitions and Markdownlint
**Learning:** MkDocs Material admonitions (`!!! warning`, `!!! note`) require inner content to be indented by 4 spaces. However, standard markdownlint sees this 4-space indent as an indented code block and triggers the `MD046` rule failure.
**Action:** When adding standard MkDocs Material admonitions, ensure the `MD046` rule is set to `false` in `.markdownlint.json` to prevent CI build failures.

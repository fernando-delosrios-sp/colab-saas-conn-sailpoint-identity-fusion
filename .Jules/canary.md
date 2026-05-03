## 2024-05-03 - Material Admonition Conversions
**Learning:** The documentation uses standard Markdown blockquotes with bold headers (like `> **Tip:**`, `> **Important:**`, `> **Note:**`) instead of Material for MkDocs admonitions.
**Action:** Convert these blockquotes to Material admonitions (e.g., `!!! tip`, `!!! warning "Important"`, `!!! note`) with 4-space indentation for the body text to improve visual hierarchy and reader clarity.

## 2026-05-03 - Admonition Extensions for MkDocs Material
**Learning:** MkDocs requires explicit enablement of `markdown_extensions` (`admonition`, `pymdownx.details`, and `pymdownx.superfences`) in `mkdocs.yml` to support Material-style admonitions (`!!! note`, `!!! tip`).
**Action:** Always verify that admonition extensions are present in `mkdocs.yml` before trying to use `!!!` style formatting in documentation, and verify with a local `mkdocs build`.

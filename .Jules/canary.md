
## 2026-05-03 - Admonition Extensions for MkDocs Material
**Learning:** MkDocs requires explicit enablement of `markdown_extensions` (`admonition`, `pymdownx.details`, and `pymdownx.superfences`) in `mkdocs.yml` to support Material-style admonitions (`!!! note`, `!!! tip`).
**Action:** Always verify that admonition extensions are present in `mkdocs.yml` before trying to use `!!!` style formatting in documentation, and verify with a local `mkdocs build`.

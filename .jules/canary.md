## 2026-08-04 - Unlinked documentation pages in mkdocs.yml
**Learning:** MkDocs build emits warnings and hides pages if they are present in the `docs/` folder but missing from the `nav` section of `mkdocs.yml` (e.g., `concepts/glossary.md`). This makes canonical references hard to find for users.
**Action:** Always verify `mkdocs.yml` matches the `docs/` structure, and ensure new or orphaned conceptual pages are explicitly added to the `nav` under their appropriate category to surface them in the site.

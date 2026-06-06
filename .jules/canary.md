## 2026-05-03 - MkDocs Material Admonitions and Markdownlint

**Learning:** MkDocs Material admonitions (`!!! warning`, `!!! note`) require inner content to be indented by 4 spaces. However, standard markdownlint sees this 4-space indent as an indented code block and triggers the `MD046` rule failure.
**Action:** When adding standard MkDocs Material admonitions, ensure the `MD046` rule is set to `false` in `.markdownlint.json` to prevent CI build failures.

## 2024-05-03 - Material Admonition Conversions

**Learning:** The documentation uses standard Markdown blockquotes with bold headers (like `> **Tip:**`, `> **Important:**`, `> **Note:**`) instead of Material for MkDocs admonitions.
**Action:** Convert these blockquotes to Material admonitions (e.g., `!!! tip`, `!!! warning "Important"`, `!!! note`) with 4-space indentation for the body text to improve visual hierarchy and reader clarity.

## 2026-05-03 - Admonition Extensions for MkDocs Material

**Learning:** MkDocs requires explicit enablement of `markdown_extensions` (`admonition`, `pymdownx.details`, and `pymdownx.superfences`) in `mkdocs.yml` to support Material-style admonitions (`!!! note`, `!!! tip`).
**Action:** Always verify that admonition extensions are present in `mkdocs.yml` before trying to use `!!!` style formatting in documentation, and verify with a local `mkdocs build`.

## 2025-05-05 - Use Material Admonitions instead of Markdown Blockquotes

**Learning:** When updating MkDocs documentation, standard Markdown blockquotes with bold headers (e.g., `> **Tip:**`) do not leverage the visual hierarchy available in the Material theme.
**Action:** Convert them to Material for MkDocs admonitions (e.g., `!!! tip`) with 4-space indentation to improve visual clarity and reader experience.

## 2026-05-08 - MkDocs Admonition Syncing for GitHub Compatibility

**Learning:** `README.md` is primarily rendered by Git forges (like GitHub), which do not support MkDocs Material admonition syntax (`!!! note`). Directly applying MkDocs syntax to the repository's root `README.md` breaks the homepage rendering.
**Action:** Keep `README.md` in standard Markdown blockquote formatting (`> **Note:**`) so it renders correctly on GitHub, and dynamically transform these blockquotes into MkDocs admonitions programmatically during the `docs:sync-home` build step.

## 2025-02-27 - Clarify identity scope tip

**Learning:** Dense paragraphs inside admonitions (like the identity scope tip) are hard to scan, especially when describing distinct configuration states (e.g., "Not included" vs "Included"). Using Markdown bullet points with bold prefixes improves clarity. Also, MkDocs material admonitions require 4-space indentation for all block content.
**Action:** When converting verbose explanatory text into MkDocs admonitions, format distinct states or choices as bulleted lists, ensuring 4-space indentation to satisfy both Material theme parsing and readability standards.

## 2026-05-18 - MkDocs Admonition Inner Formatting

**Learning:** Inner content within MkDocs Material admonitions (like numbered lists) must be properly separated by newlines and indented by 4 spaces. Placing a list on the same line as the admonition declaration (e.g., `!!! note "Title" 1. item`) prevents correct rendering.
**Action:** Ensure all content inside admonitions is moved to a new line and indented with 4 spaces.

## 2026-05-19 - Convert Warning Admonition to MkDocs Material Format

**Learning:** The previous note about the upgrade in `docs/operations/account-list.md` was buried in a list and not properly highlighted using the available MkDocs Material admonition styles.
**Action:** Converted the list item into a `!!! warning "Upgrade note: Fusion review form definitions"` block with proper 4-space indentation to make this critical upgrade information stand out clearly.

## 2024-05-22 - Material for MkDocs Admonition Indentation Constraint

**Learning:** MkDocs Material admonitions (e.g., `!!! note`, `!!! tip`) require _all_ of their inner body text (including introductory sentences before lists) to be separated by an empty line and indented by exactly 4 spaces relative to the admonition declaration to render correctly as a callout box. If the admonition is nested inside a list (like at 4 spaces), its body must be indented at 8 spaces relative to the document root.
**Action:** When creating or fixing admonitions, ensure a blank line follows the `!!!` declaration and that all contained text is appropriately indented.

## 2024-05-22 - Material for MkDocs Admonition Indentation Constraint
**Learning:** MkDocs Material admonitions (e.g., `!!! note`, `!!! tip`) require *all* of their inner body text (including introductory sentences before lists) to be separated by an empty line and indented by exactly 4 spaces relative to the admonition declaration to render correctly as a callout box. If the admonition is nested inside a list (like at 4 spaces), its body must be indented at 8 spaces relative to the document root.
**Action:** When creating or fixing admonitions, ensure a blank line follows the `!!!` declaration and that all contained text is appropriately indented.

## 2024-05-24 - MkDocs Material Admonition Syntax
**Learning:** MkDocs Material admonitions (e.g., `!!! warning`, `!!! tip`) require *all* of their inner body text to be separated by an empty line and indented by exactly 4 spaces relative to the admonition declaration to render correctly as a callout box. If the indentation is missing, the admonition will break.
**Action:** Always add an empty line after the `!!!` line and indent the following text block by 4 spaces.

## 2026-06-06 - Format dense warnings in documentation
**Learning:** Dense warning or note paragraphs inside MkDocs admonitions (e.g., `!!! warning`) are hard to scan on first read, particularly when they contain multiple concepts like updates, impacts, and actions.
**Action:** Refactor dense text blocks inside admonitions into bulleted lists with bolded lead-in prefixes (`- **The update:**`, `- **The impact:**`, `- **The action:**`). Ensure the nested list content maintains the required 8-space indent (if the admonition block itself is at 4 spaces).

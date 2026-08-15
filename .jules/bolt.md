## 2024-05-18 - Missing Import False Positive in Code Review
**Learning:** Automated code review may flag "missing imports" when evaluating isolated patches for performance changes (like `promiseAllBatched`), even if the import statement already exists at the top of the file.
**Action:** When automated code review complains about a missing import for an optimization helper, check the file headers (`head -n 20 <filepath>`) first to verify if the import already exists before attempting to add it, avoiding duplicate imports and unnecessary work.

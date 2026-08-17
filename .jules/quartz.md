## 2024-08-17 - Remove redundant wrapper functions
**Learning:** `trimOrUndefined(val)` in `src/utils/attributes.ts` is an unnecessary wrapper around `trimStr(val)` which already safely trims and handles nullish values. We should directly use `trimStr` to remove cognitive overhead.
**Action:** Replace calls to redundant local wrappers with the underlying tested utility function, and delete the redundant wrapper.

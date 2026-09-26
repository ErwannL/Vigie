# scripts/

`check.js` – repository rules no linter enforces, run by `npm run check` (and `make verify`):
no file over 1000 lines (generated lockfiles exempt), LF line endings only, no coverage
escape hatches or skipped/focused tests in code, a `README.md` in every folder.
It is tested (`api/test/check-script.test.js`) and part of the API coverage.

# dashboard/test/

Vitest + jsdom + Testing Library. `fakes.jsx` provides a fake API client returning
`fixtures.js` and a render helper with the app context; `setup.js` cleans the DOM and storages
between tests. Suites cover the API client, SSO fragment handling, storage, formatting, i18n
parity, the App gate and navigation, and every page (including "no analytics data" states and
translated errors). `npm run coverage` fails under 100 %.

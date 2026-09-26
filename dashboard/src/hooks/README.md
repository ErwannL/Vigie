# dashboard/src/hooks/

`useResource(load)` loads data with a memoised function, reloads when it changes (for example
when the environment changes) and exposes `reload()`. Results arriving after the component
moved on are ignored.

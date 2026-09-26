# api/src/modules/

The two Vigie modules on top of the shared collector and storage:

- `incidents/` – Module 1: slowness and errors → correlation → Figura replay → issue.
- `insights/` – Module 2: feature usage, landing, funnels, segments → personas for Figura.

Module 1 works with `essential` events only. Module 2 needs `analytics` consent and says so.

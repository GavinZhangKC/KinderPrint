# KinderPrint Frontend — TSX/Figma implementation

This folder is a frontend-only React + TypeScript + Vite implementation of the current KinderPrint Figma states:

1. Explore / map state
2. Neighbourhood profile state
3. Compare neighbourhood selection with similar-neighbourhood pagination
4. No-similar-neighbourhood empty state (appears automatically for areas with no approved matches)
5. Detailed comparison scroll page

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

The Vite dev server proxies `/api` to `http://localhost:8000` for later backend integration.

## Data note

The current UI uses local prototype values in `src/data/mockData.ts` so every Figma interaction can be demonstrated even when approved backend datasets are not configured. `src/services/api.ts` mirrors the existing backend/API contract and is ready for integration. Replace prototype values with approved backend responses before production/submission.

# Vkinder Frontend — TSX/Figma implementation

This folder is a frontend-only React + TypeScript + Vite implementation of the current Vkinder Figma states:

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

The Vite dev and preview servers listen on `0.0.0.0` and proxy `/api` to
`http://localhost:8000`. Other devices on the same LAN can open
`http://<this-computer-LAN-IP>:5173` without a separate API configuration.

## API integration

The frontend uses the live API client in `src/services/api.ts` for neighbourhood
search, boundaries, indicators, profiles, priorities, explanations, matching, and
comparisons. It does not use local mock data for these application flows.

For local development, start the FastAPI backend on `http://localhost:8000`
before using the map or Insight pages. The backend must be configured with the
approved dataset paths documented in the repository root README; when a source
is missing or invalid, the API intentionally returns an unavailable or limited
state instead of substituting prototype values.

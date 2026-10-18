# wallp Admin Dashboard

Phase 0–1 administration web console for the [wallp](https://wallp.app) platform. Provides user management, role-based access control, security audit logging with side-by-side JSON diffs, two-step verification (TOTP), and catalog placeholders.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, static export `output: 'export'`)
- **Language**: TypeScript (strict)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Components**: [shadcn/ui](https://ui.shadcn.com/) (New York style, CSS variables, Lucide icons)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) with localStorage persistence
- **Server Cache / Fetching**: [TanStack Query v5](https://tanstack.com/query/latest) & [TanStack Table](https://tanstack.com/table/latest)
- **API Client**: [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) with single-flight token refresh
- **API Types**: Generated from backend OpenAPI 3.1 specification via [openapi-typescript](https://openapi-ts.dev/)
- **Form Validation**: [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Theme**: [next-themes](https://github.com/pacocoursey/next-themes) (Light / Dark / System default)
- **Testing**: [Vitest](https://vitest.dev/) + React Testing Library + jsdom

## Scripts

- `pnpm dev`: Start development server on `http://localhost:3000`
- `pnpm build`: Generate static production export to `out/`
- `pnpm start`: Serve the exported `out/` directory locally with `npx serve out`
- `pnpm lint`: Run Next.js and ESLint code checks
- `pnpm typecheck`: Run TypeScript compiler typecheck (`tsc --noEmit`)
- `pnpm test`: Run Vitest unit tests
- `pnpm gen:api`: Re-generate TypeScript API definitions from `openapi.json`

## API Configuration

The admin web app is a static client-side application that connects to any wallp backend API.

- **Default API URL**: `http://localhost:8080` (configured via `NEXT_PUBLIC_API_URL` during build).
- **Runtime Overrides**: Users can override the target API URL at runtime directly from the **Advanced Server Settings** drawer on the `/login` screen. The URL is preserved in the browser's `localStorage`.

## Deployment to GitHub Pages

The application is deployed to GitHub Pages as a static site via the GitHub Actions workflow located at `.github/workflows/pages.yml`.

### Workflow Steps:
1. Pushes to the `main` branch trigger `.github/workflows/pages.yml`.
2. Dependencies are installed via `pnpm install --frozen-lockfile=false`.
3. The app is built with:
   - `NEXT_PUBLIC_BASE_PATH=/${{ github.event.repository.name }}`
   - `NEXT_PUBLIC_API_URL=${{ vars.API_URL }}`
4. Static assets output to `out/` (including `public/.nojekyll`) are uploaded using `actions/upload-pages-artifact`.
5. GitHub Pages is published using `actions/deploy-pages`.

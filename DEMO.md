# NewZealankanz client demo

This is a separate UAT environment. It does not use production credentials or data. The local setup below binds both applications to loopback, uses the disposable `nzk_demo` database, and uses temporary local image files. Local image storage is not durable and must not be described as production storage.

## Run locally

1. Start a disposable PostgreSQL instance. Create a database named `nzk_demo` that is separate from `nzk_test` and every production database.
2. Copy `.env.demo.example` to `.env.demo.local`; set a private random JWT secret and three different random passwords of at least 12 characters. Keep the file mode `0600`. Do not paste the credentials into public notes or publish them.
3. In the backend, load the file and prepare the database:

   ```sh
   set -a; source .env.demo.local; set +a
   pnpm install --frozen-lockfile
   pnpm build
   pnpm prisma:migrate:deploy
   pnpm prisma:seed:demo
   pnpm start:prod
   ```

4. In the frontend, copy `.env.demo.example` to `.env.demo.local`, then run `pnpm install --frozen-lockfile` and `pnpm dev --mode demo --host 127.0.0.1 --port 5178 --strictPort`.
5. Open `http://127.0.0.1:5178/`. Private demo account credentials are in the ignored backend `.env.demo.local` file. Use the seeded buyer, seller, and admin accounts for role-specific demonstrations; registration creates and locally verifies a new demo account.

Demo registration verification tokens are returned only when `NODE_ENV=demo` and `DEMO_EMAIL_VERIFICATION=true`. The frontend immediately consumes the one-time token. This path is absent from production and normal test responses. SMTP is intentionally not configured; the API health payload reports `email: disabled_demo`, and the frontend labels the environment and explains that real email delivery is disabled. In-app notifications continue to be stored normally.

## Remote UAT requirements

No cloud deployment is configured by this change. Before a remote demo, provision separate demo-only Render and Vercel resources and a new managed PostgreSQL database named `nzk_demo`; do not reuse or point at a production service. Require HTTPS. Set the demo frontend's exact origin in `CORS_ORIGIN` and `PUBLIC_SITE_URL`, and use a demo-only `VITE_API_BASE_URL`. Set `DEMO_DATABASE_HOST` to the dedicated demo database hostname. Run migrations and the idempotent demo seeder only after confirming the database hostname and database name. The seeder refuses mismatches and never deletes records.

Protect the frontend and API at an access-control edge (for example, a private VPN or identity-aware gateway) for approved client testers. CORS is not access control. Keep admin credentials private and rotate them after UAT. For image uploads, configure a separate demo S3-compatible bucket and CDN; do not use local disk on ephemeral hosting. Leave SMTP unset unless a demo-only provider is later approved.

Never place secrets in Vercel build variables, source control, a public demo page, or the `.env.demo.example` files. Use the hosting providers' encrypted secret settings. Do not attach production credentials to the demo project.

# LyaSolution

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.0.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

(`npm run build` runs `scripts/write-env.mjs` then `ng build`, so Vercel picks up `SUPABASE_*` and optional `LEAD_NOTIFY_*` env vars.)

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## WhatsApp lead alerts (optional)

A separate **Node** service under `server/whatsapp-lead-notify` uses `whatsapp-web.js` to send you a WhatsApp when someone submits the contact form (after Supabase save). It must run on a **long-lived host** (VPS, etc.), not on Vercel.

- Setup: see `server/whatsapp-lead-notify/README.md`
- Angular env: `whatsappNotifyApiUrl` / `whatsappNotifyApiKey` (local `environment.ts`), or Vercel `LEAD_NOTIFY_API_URL` / `LEAD_NOTIFY_API_KEY` for production builds

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

# NewProject

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.6.

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
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

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


## API integration notes

This project is the new UI wired to the backend services (IAM, Campaign, Donor, Payment).

- Install and run: `npm install` then `ng serve` (port 6701). `proxy.conf.json` forwards `/api`, `/cam-api`, `/don-api` and `/pay-api` to the local services; `nginx.conf` does the same in production.
- Sign-in: `/login` (plus `/auth/mfa`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/reauthenticate`). The access token lives in sessionStorage; the refresh token is an HttpOnly cookie and is renewed on a 401.
- Payment return: `/give/result` verifies the payment with the server after the gateway redirects back.
- HTML/CSS is unchanged from the UI-only project, except a few click bindings (Forgot password, My security, sign-out).

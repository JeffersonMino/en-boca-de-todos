# En Boca De Todos

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.17.

## CRM, API y base local

La aplicacion ya incluye una API Express integrada al servidor SSR y una base local persistente:

```bash
npm run serve:crm
```

Abre `http://localhost:4000/`. La API queda disponible bajo `/api` y guarda datos en:

```txt
server-data/en-boca-de-todos.db.json
```

El esquema recomendado para PostgreSQL/Supabase esta en `database/schema.sql`.

Credenciales seed local:

```txt
Usuario: admin
Clave: Boca2026!
Codigo: 250426
```

Para produccion, crea la base con variables de entorno `EBT_ADMIN_USERNAME`, `EBT_ADMIN_PASSWORD`, `EBT_ADMIN_CONFIRMATION_CODE` y `EBT_DATABASE_FILE`.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

Para probar login admin, pedidos persistentes y CRM con base de datos, usa el servidor SSR en `http://localhost:4000/`.

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

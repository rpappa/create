# @rpappa/create

Personalized TypeScript project template, includes the following:

-   TypeScript
-   Opinionated linting / formatting
-   Testing, with vitest
-   Monorepo support with [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)

## Usage

From the directory where you want `package.json` to be, run `npm init @rpappa`

To pass arguments use `npx @rpappa/create@latest`

Allowed arguments:

- `--yes` or `-y` will pass through to initial `npm init` if ran
- `--monorepo` or `-m` will create a monorepo
- `--scope=` (ex `--scope=@foo`) will use the specified scope when creating packages
- `--workspace=[package]` (ex `--workspace=packages/foo`) or `-w [package]` will define a new workspace
  at the specified path. This allows for re-running the script after project creation to initialize a new
  workspace.

For example:

```
npx @rpappa/create@latest -y -m --scope=@foo
```

This will produce a monorepo with scope `@foo` without any intervention.

Or

```
npx @rpappa/create -w packages/newLib
```

To create a new workspace after the first `npm init`.

## Goals

Goals for this project:

1. Reduce setup time for personal TypeScript projects
2. Get more in the habit of using linting and testing for personal projects

Long term I'd like to migrate the TypeScript and eslint configs to their own packages, but this will do for now.

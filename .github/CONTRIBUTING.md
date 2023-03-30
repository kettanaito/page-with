# Contributing

Thank you for considering contributing to this library! Below you can find the instructions on the development process, as well as testing and publishing guidelines. Don't hesitate to reach out to the library maintainers in the case of questions.

## Pre-requisites

- [PNPM](https://pnpm.io/)
- [TypeScript](https://www.typescriptlang.org/)
- [Jest](https://jestjs.io/)

## Git workflow

```bash
$ git checkout -b <FEATURE>
$ git add .
$ git commit -m 'Adds contribution guidelines'
$ git push -u origin <FEATURE>
```

Ensure that your feature branch is up-to-date with the latest `main` before assigning it for code review:

```bash
$ git checkout master
$ git pull --rebase
$ git checkout <FEATURE>
$ git rebase master
```

Once your changes are ready, open a Pull request and assign one of the library maintainers as a reviewer. We will go through your changes and ensure they land in the next release.

## Develop

```bash
$ pnpm start
```

## Test

### Run all tests

```bash
$ pnpm test
```

### Run a single test

```bash
$ pnpm test test/add.test.ts
```

## Publish

This package is published automatically upon each merge to the `main` branch.

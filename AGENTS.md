# satisfactory-belt

This is a performance focused factory planer for the game satisfactory.

## agent instructions
- please do not add unrequested suff - make suggestions if needed
- install shadcn components via the shadcn cli

## tech stack
- nodejs 24
- typescript 7
- pnpm monorepo
- oxlint and oxfmt
- elkjs
- pixijs (WebGL only - No experimental WebGPU support yet)
- tailwindcss
- shadcn/ui (--preset b0)
- vitest

## repository conventions
- conventional branch names, pr titles and commits
- use squash merge
- treat the main branch as protected - unless explicitly allowed to push directly
- split logic from representation / use monorepo packages
- do not add github ci actions

## testing
- only test relevant parts - do not add tests for the sake of having tests

## projects phase
- pre release / no customers
- complex breaking changes are ok
- no need for backwards compatibilty
- do not add to README.md - when the project is done - we add instructions

## assets
- use lucide svg paths when icons are needed as pixijs elements

## inspiration
- excalidraw for the minimal canvas and ui elements

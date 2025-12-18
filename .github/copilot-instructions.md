---
applyTo: "**/*.{ts,tsx,js,jsx}"
---

# Voidsync/Mimic Project Context

Voidsync is a collaborative document synchronization system built with TypeScript and Effect. The project uses Bun as the runtime and follows functional programming principles with Effect.

## Project Structure

This is a monorepo containing:
- `@voidhash/mimic` - Core document synchronization primitives and operations
- `@voidhash/mimic-effect` - Effect-based server implementation with WebSocket support
- `examples/` - Example implementations

## Key Principles

- **Functional Programming**: Use Effect for all async operations and error handling
- **Type Safety**: Strict TypeScript with no `any` types
- **Bun Runtime**: Use Bun instead of Node.js, npm, pnpm, or vite
- **Monorepo**: Workspace-based package management
- **Collaborative Sync**: Operations are transactional and conflict-free

## Before Writing Code

1. Analyze existing patterns in the codebase, especially Effect patterns
2. Consider edge cases and error scenarios - use Effect's error handling
3. Follow Effect best practices for async operations
4. Ensure operations are transactional and reversible
5. Use the workspace catalog for shared dependencies (especially Effect)

## Rules

### Effect Usage
- Use `Effect` for all async operations, never raw Promises
- Use `Schema` for validation and type inference
- Handle errors with Effect's error handling mechanisms
- Use `Layer` for dependency injection
- Prefer `pipe` for function composition

### TypeScript Best Practices
- No `any` types - use proper types or `unknown`
- Use `as const` for literal types
- Prefer type inference where possible
- Use `export type` for type-only exports
- Use `import type` for type-only imports

### Bun-Specific
- Use `bun` commands instead of `npm`, `pnpm`, or `node`
- Use Bun's built-in test runner or Vitest (already configured)
- Leverage Bun's native TypeScript support

### Code Quality
- Use `for...of` instead of `Array.forEach`
- Use arrow functions instead of function expressions
- Use template literals over string concatenation
- Use `===` and `!==` for comparisons
- Don't use `var` - use `const` or `let`
- Handle all errors explicitly with Effect

### Testing
- Use `@effect/vitest` for Effect-aware testing
- Tests should be deterministic and isolated
- Use Effect's testing utilities for async operations

## Common Tasks

- `bun install` - Install dependencies
- `bun run <script>` - Run scripts
- `bun test` - Run tests (if configured)
- `bun build` - Build packages

## Example: Effect Usage

```typescript
// ✅ Good: Using Effect for async operations
import { Effect, Schema } from "effect";

const fetchData = Effect.gen(function* () {
  const data = yield* Effect.tryPromise({
    try: () => fetch("/api/data").then(r => r.json()),
    catch: (error) => new Error(`Failed to fetch: ${error}`)
  });
  return data;
});

// ❌ Bad: Using raw Promises
const fetchData = async () => {
  const response = await fetch("/api/data");
  return response.json();
};
```

## Example: Error Handling

```typescript
// ✅ Good: Comprehensive error handling with Effect
import { Effect, Exit } from "effect";

const operation = Effect.gen(function* () {
  const result = yield* someOperation;
  return { success: true, data: result };
}).pipe(
  Effect.catchAll((error) => 
    Effect.succeed({ success: false, error: error.message })
  )
);

// ❌ Bad: Swallowing errors
try {
  return await someOperation();
} catch (e) {
  console.log(e);
}
```

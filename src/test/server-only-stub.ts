/**
 * Test-only stand-in for the `server-only` package.
 *
 * `server-only` throws on import so a server module can never be pulled into a
 * client bundle. That guard is worth keeping in production, but it also makes
 * any module importing it impossible to unit-test under Vitest's node
 * environment. `vitest.config.ts` aliases the package to this empty module so
 * server code keeps the guard when Next builds it, and stays testable here.
 */
export {};

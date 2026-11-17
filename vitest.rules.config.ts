import { defineConfig } from 'vitest/config'

// The Firestore rules suite (F11): needs the emulator, so it is NOT part of `npm test`.
// Run it with `npm run test:rules` (wraps `firebase emulators:exec`).
export default defineConfig({
  test: {
    include: ['__tests__/rules/**/*.rules.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
})

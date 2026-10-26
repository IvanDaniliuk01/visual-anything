import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    // Tests run beside other builds and test runs: a loaded machine stretches them past 5 seconds.
    testTimeout: 20_000,
  },
});

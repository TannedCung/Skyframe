import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  // Unit tests use a lightweight setup (no MSW server).
  // Integration tests include MSW via their own beforeAll/afterAll.
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Allow Jest to transform ESM packages used by MSW v2
  transformIgnorePatterns: [
    "node_modules/(?!(msw|@mswjs|rettime|outvariant|strict-event-emitter|@bundled-es-modules|is-node-process|@open-draft)/)",
  ],
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/__tests__/**/*.test.tsx",
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/integration/**/*.test.ts",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/**/layout.tsx",
    "!src/app/**/page.tsx",
    "!src/types/**",
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
};

export default createJestConfig(config);

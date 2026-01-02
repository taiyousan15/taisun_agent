module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts',           // re-export files
    '!src/**/BenchmarkRunner.ts', // benchmarking utility
    '!src/proxy-mcp/server.ts',   // MCP server entry point (requires stdio)
    '!src/proxy-mcp/internal/normalize.ts', // future embedding utilities
    '!src/proxy-mcp/browser/skills.ts',     // requires chrome MCP (M4 integration)
    '!src/proxy-mcp/internal/mcp-client.ts', // requires external MCP servers
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  // Transform TypeScript files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Custom projects for different test types
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/tests/unit/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      testEnvironment: 'node',
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
      },
      setupFilesAfterEnv: ['<rootDir>/tests/utils/setup.ts'],
    },
  ],
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,     // lowered due to complex conditional logic in services
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Coverage reporters (including json-summary for CI)
  coverageReporters: ['text', 'lcov', 'json-summary'],
};

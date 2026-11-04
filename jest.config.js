module.exports = {
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/ciphers)/)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.agents/',
  ],
};

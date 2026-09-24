// Two test projects in a single run: 'logic' (Node, ts-jest — pure logic/repo/sync)
// and 'ui' (jest-expo — React component tests). Kept separate because logic tests
// run fast without native modules, while UI tests need babel + RN transforms.
// To run a single project: npx jest --selectProjects logic  (or ui).
/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/jest.logic.config.js', '<rootDir>/jest.ui.config.js'],
};

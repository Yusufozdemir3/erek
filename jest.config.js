// İki test projesi tek koşuda: 'logic' (Node, ts-jest — saf mantık/repo/sync) ve
// 'ui' (jest-expo — React bileşen testleri). Ayrık tutulur çünkü mantık testleri
// native modül olmadan hızlı koşar; UI testleri ise babel + RN dönüşümü ister.
// Tek proje çalıştırmak için: npx jest --selectProjects logic  (ya da ui).
/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/jest.logic.config.js', '<rootDir>/jest.ui.config.js'],
};

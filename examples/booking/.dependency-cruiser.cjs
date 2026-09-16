const base = require('../../templates/api-shared-kernel/.dependency-cruiser.cjs');
// 雛形の規約を、サンプルの配置へ適用する。
module.exports = JSON.parse(JSON.stringify(base).replaceAll('apps/api', 'examples/booking'));
module.exports.options.tsConfig.fileName = require('node:path').join(__dirname, 'tsconfig.json');

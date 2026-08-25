'use strict';
/**
 * bug-bench —— 专门解决 bug 的角色 · 能力评测运行器
 *
 * 用法：
 *   node bug-bench/run.js                 # 运行全部用例
 *   node bug-bench/run.js --case case-01  # 运行单个用例
 *   node bug-bench/run.js --report        # 输出对比报告模板
 *
 * 每个用例位于 cases/<case-id>/ 下：
 *   - buggy.js  : 含真实 bug 的实现（module.exports = 被测函数）
 *   - test.js   : export const tests = [{ name, fn }]，fn(buggy) 断言
 *   - README.md : bug 描述 + 期望行为
 *
 * 运行器对每个用例：加载 buggy.js，逐一执行 tests[].fn(buggy)，
 * 输出 通过/失败，并汇总「修复通过率」。
 * 修复后重跑同一 run.js，通过率提升即为「修复生效」。
 */
const fs = require('fs');
const path = require('path');

const CASES_DIR = path.join(__dirname, 'cases');
const args = process.argv.slice(2);
const onlyCase = parseArg(args, '--case');
const wantReport = args.includes('--report');

function parseArg(argv, key) {
  const i = argv.indexOf(key);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

function listCases() {
  return fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('case-'))
    .map((d) => d.name)
    .sort();
}

function runCase(caseId) {
  const dir = path.join(CASES_DIR, caseId);
  const buggy = require(path.join(dir, 'buggy.js'));
  const { tests } = require(path.join(dir, 'test.js'));
  const results = tests.map((t) => {
    try {
      const ok = t.fn(buggy);
      return { name: t.name, pass: ok === true };
    } catch (e) {
      return { name: t.name, pass: false, error: e.message };
    }
  });
  return { caseId, results };
}

function main() {
  const cases = onlyCase ? [onlyCase] : listCases();
  let pass = 0;
  let fail = 0;
  const summary = [];
  for (const c of cases) {
    if (!fs.existsSync(path.join(CASES_DIR, c))) {
      console.log(`❌ 用例不存在: ${c}`);
      continue;
    }
    const { results } = runCase(c);
    const cPass = results.filter((r) => r.pass).length;
    pass += cPass;
    fail += results.length - cPass;
    console.log(`\n=== ${c} ===`);
    for (const r of results) {
      console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.error ? `  <- ${r.error}` : ''}`);
    }
    summary.push({ caseId: c, pass: cPass, total: results.length });
  }
  console.log('\n====================');
  console.log(`通过率: ${pass}/${pass + fail} (${((pass / (pass + fail)) * 100).toFixed(0)}%)`);
  summary.forEach((s) =>
    console.log(`  ${s.caseId}: ${s.pass}/${s.total}`)
  );
  if (wantReport) printReport();
}

function printReport() {
  console.log('\n=== 对比报告模板（同批用例交给不同角色修复后填写） ===');
  console.log('| 角色 | 修复通过率 | 平均轮次 | 回归率 | 壳机制遵守度 |');
  console.log('|------|-----------|---------|--------|-------------|');
  console.log('| 被测·带壳 bug 角色 | 待填 | 待填 | 待填 | 待填 |');
  console.log('| 基线A·DeepSeek v4 flash | 待填 | 待填 | 待填 | — |');
  console.log('| 基线B·外部 CodeBuddy | 待填 | 待填 | 待填 | — |');
}

main();

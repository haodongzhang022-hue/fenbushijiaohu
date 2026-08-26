'use strict';
/**
 * bug-bench/compare.js —— 基线能力对比评测 · 统一判分器
 *
 * 目的：验证「带壳 bug 角色」的修复能力是否优于无壳基线
 *      （DeepSeek v4 flash / 外部 CodeBuddy），从而判定「壳」是否生效。
 *
 * 控制变量原则：
 *   - 同一批 bug 任务（bug-bench/baseline/ 原始 bug 版本）
 *   - 同一测试信号灯（cases 目录下 test.js 的断言）
 *   - 仅切换「修复执行者」：带壳角色 vs 无壳基线
 *
 * 用法：
 *   node bug-bench/compare.js                    # 列出已登记的评测结果
 *   node bug-bench/compare.js --record <json>    # 登记某执行者的评测结果
 *   node bug-bench/compare.js --report           # 输出对比报告（Markdown）
 *
 * 评测记录数据结构（每执行者一条）：
 * {
 *   "role": "带壳bug角色" | "DeepSeek-v4-flash" | "外部CodeBuddy",
 *   "fixedCount": 5,        // 修复通过的用例数
 *   "totalCount": 5,        // 总用例数
 *   "avgRounds": 1.2,       // 平均「评审→修复」轮次
 *   "regression": 0,        // 回归用例数（修复过程中破坏的其他用例）
 *   "shellAdherence": { "defaultDirectFix": true, "max10Rounds": true, "stopWhenGreen": true },
 *   "note": "说明"
 * }
 */
const fs = require('fs');
const path = require('path');

const RECORD_FILE = path.join(__dirname, 'baseline', 'results.json');
const args = process.argv.slice(2);

function loadRecords() {
  if (!fs.existsSync(RECORD_FILE)) return [];
  return JSON.parse(fs.readFileSync(RECORD_FILE, 'utf8'));
}

function saveRecords(records) {
  fs.writeFileSync(RECORD_FILE, JSON.stringify(records, null, 2) + '\n', 'utf8');
}

function listCases() {
  return fs
    .readdirSync(path.join(__dirname, 'cases'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('case-'))
    .map((d) => d.name)
    .sort();
}

function main() {
  if (args.includes('--record')) {
    const idx = args.indexOf('--record');
    if (!args[idx + 1]) {
      console.error('缺少评测记录 JSON');
      process.exit(1);
    }
    const rec = JSON.parse(args[idx + 1]);
    const records = loadRecords();
    const existing = records.findIndex((r) => r.role === rec.role);
    if (existing >= 0) records[existing] = rec;
    else records.push(rec);
    saveRecords(records);
    console.log(`已登记 ${rec.role} 评测结果：${rec.fixedCount}/${rec.totalCount}`);
    return;
  }

  if (args.includes('--report')) {
    printReport(loadRecords());
    return;
  }

  // 默认：打印已登记结果 + 待测清单
  const records = loadRecords();
  const cases = listCases();
  console.log(`评测集：${cases.length} 个用例（${cases.join(', ')}）`);
  console.log(`已登记执行者：${records.length} 个`);
  if (records.length === 0) {
    console.log('\n尚未登记任何评测结果。请各执行者修复 baseline/ 下原始 bug 版本后登记。');
  } else {
    for (const r of records) {
      const passRate = ((r.fixedCount / r.totalCount) * 100).toFixed(0);
      console.log(`  · ${r.role}: 通过率 ${r.fixedCount}/${r.totalCount} (${passRate}%), 平均轮次 ${r.avgRounds}, 回归 ${r.regression}`);
    }
  }
  console.log('\n提示：--report 输出对比报告；--record \'<json>\' 登记结果。');
}

function printReport(records) {
  const cases = listCases();
  const rows = records.map((r) => {
    const passRate = ((r.fixedCount / r.totalCount) * 100).toFixed(0);
    const shell = r.shellAdherence
      ? `${r.shellAdherence.defaultDirectFix ? '✅' : '❌'}默认直接改 / ` +
        `${r.shellAdherence.max10Rounds ? '✅' : '❌'}10轮护栏 / ` +
        `${r.shellAdherence.stopWhenGreen ? '✅' : '❌'}钩子没bug就停`
      : '—';
    return `| ${r.role} | ${passRate}% (${r.fixedCount}/${r.totalCount}) | ${r.avgRounds} | ${r.regression} | ${shell} |`;
  });
  console.log(`## bug 角色能力 · 基线对比报告`);
  console.log(`\n评测集：${cases.length} 个注入 bug（${cases.join(', ')}），同一信号灯判分。`);
  console.log(`\n| 执行者 | 修复通过率 | 平均轮次 | 回归数 | 壳机制遵守度 |`);
  console.log(`|--------|-----------|---------|--------|-------------|`);
  rows.forEach((r) => console.log(r));
  console.log(`\n> 结论判定：带壳角色通过率显著高于基线且回归更低 ⇒ 壳生效。`);
}

main();

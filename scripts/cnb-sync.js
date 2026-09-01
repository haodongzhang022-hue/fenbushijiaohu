// cnb-sync.js - 本地↔云端 CNB 同步守护
// 用法: node scripts/cnb-sync.js --once | node scripts/cnb-sync.js --interval 180
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const NODE = 'C:/Users/dongdong/AppData/Local/nvm/v22.20.0/node.exe';
const CNB = 'C:/Users/dongdong/AppData/Local/nodejs/node_modules/@cnbcool/cnb-cli/bin/cnb.js';
const REPO = 'dongdongxiaozu/fenbushijiaohu';
const STATE_DIR = 'E:/CNBcool/.cloud-sync';
const STATE = path.join(STATE_DIR, 'state.json');
const INBOX = path.join(STATE_DIR, 'inbox.md');
function cnb(args) { return execFileSync(NODE, [CNB, ...args], { encoding: 'utf8', timeout: 60000 }); }
function checkOnce() {
  let raw;
  try { raw = cnb(['issues','list-issues','--repo',REPO,'--state','open','--page-size','50','-v']); }
  catch (e) { console.log('[cnb-sync] 调用失败:', String(e).slice(0,200)); return; }
  const obj = JSON.parse(raw);
  const data = (obj && obj.data) || [];
  const snap = {};
  for (const i of data) { snap[i.number] = i.title + '|' + i.updated_at + '|' + i.comment_count + '|' + i.state; }
  let old = {};
  if (fs.existsSync(STATE)) { try { old = JSON.parse(fs.readFileSync(STATE,'utf8')); } catch {} }
  const changed = [];
  for (const k of Object.keys(snap)) { if (!(k in old) || old[k] !== snap[k]) changed.push(k); }
  for (const k of Object.keys(old)) { if (!(k in snap)) changed.push(k + '(closed)'); }
  if (changed.length) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
    fs.appendFileSync(INBOX, '## ' + stamp + ' 云端变更: ' + changed.sort().map(c => 'Issue #' + c).join(', ') + '\n');
    for (const k of changed.sort()) { if (snap[k]) fs.appendFileSync(INBOX, '  - #' + k + ' : ' + snap[k] + '\n'); }
    console.log('[cnb-sync]', changed.length, '个变化 → inbox:', INBOX);
  } else { console.log('[cnb-sync] 无变化', new Date().toLocaleTimeString('zh-CN', { hour12: false })); }
  fs.writeFileSync(STATE, JSON.stringify(snap));
}
const once = process.argv.includes('--once');
const ia = process.argv.indexOf('--interval');
const iv = ia > 0 ? (parseInt(process.argv[ia+1],10) || 180) : 180;
if (once) { checkOnce(); } else { checkOnce(); setInterval(checkOnce, iv*1000); }
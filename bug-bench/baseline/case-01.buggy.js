'use strict';
/**
 * case-01 · session 时钟推进（Lamport）缺失（注入 bug）
 *
 * bug 描述：`merge()` 里漏掉了 `this._clock = Math.max(this._clock, msg.ts) + 1`，
 * 导致本地时钟不随远端消息推进。这破坏了 Lamport 时钟的 happens-before
 * 偏序：本地后续消息可能与已收到的远端消息「同时」（同 ts），
 * 在多节点并发场景下收敛序列不稳定。
 *
 * 正确行为（04 §3.2 + 12 L3 细纲）：收到远端 ts=T 的消息后，
 * 本地再发消息必须满足 ts > T（严格递增，保持因果序）。
 *
 * 输入：(remoteTs)
 * 输出：{ localNextTs: number, causalOk: boolean }
 */
class BuggySession {
  constructor() {
    this._clock = 0;
    this._messages = new Map();
  }
  send(payload) {
    this._clock += 1;
    const msg = { payload, ts: this._clock };
    return msg;
  }
  merge(msg) {
    // BUG: 缺失 this._clock = Math.max(this._clock, msg.ts) + 1
    return msg;
  }
  get clock() {
    return this._clock;
  }
}

function scenario(remoteTs) {
  const s = new BuggySession();
  s.merge({ ts: remoteTs });        // 收到远端 ts=remoteTs
  const localMsg = s.send('x');     // 本地再发一条
  return {
    localNextTs: localMsg.ts,
    // 因果序要求：本地新消息 ts 必须严格大于远端 ts
    causalOk: localMsg.ts > remoteTs,
  };
}

module.exports = scenario;

'use strict';
/**
 * case-04 · transport 消息丢失/漏投递（注入 bug）
 *
 * bug 描述：send() 在消息负载为空字符串时直接返回 true 但不投递
 * （漏投递），导致对端收不到空消息，破坏「必达」语义。
 *
 * 正确行为：无论消息内容是否为空，只要未关闭，都应投递到对端。
 *
 * 输入：([{ payload }], nodeB)
 * 输出：nodeB 实际收到的消息条数
 */
function buggyTransport(msgs, nodeB) {
  let received = 0;
  const listener = () => {
    received += 1;
  };
  nodeB.listen(listener);
  for (const m of msgs) {
    // BUG: 空负载消息被静默丢弃，不投递
    if (m.payload === '') continue;
    nodeB._deliver(m);
  }
  return received;
}

module.exports = buggyTransport;

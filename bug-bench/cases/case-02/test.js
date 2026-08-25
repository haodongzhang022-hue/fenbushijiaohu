'use strict';
/**
 * case-02 测试断言
 * 正确行为：非法公钥 / 篡改消息 / 错误签名都必须验签失败。
 */
const crypto = require('crypto');

function makeKeyPair() {
  return crypto.generateKeyPairSync('ed25519');
}

module.exports = {
  tests: [
    {
      name: 'case-02 非法公钥必须验签失败',
      fn: (verify) => {
        // 传非法 base64 公钥（被篡改/损坏），必须返回 false
        return verify('!!!not-a-valid-key!!!', 'hello', 'AAAA') === false;
      },
    },
    {
      name: 'case-02 篡改消息必须验签失败',
      fn: (verify) => {
        const kp = makeKeyPair();
        const pub = kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const sig = crypto
          .sign(null, Buffer.from('hello', 'utf8'), kp.privateKey)
          .toString('base64');
        // 篡改消息内容，必须验签失败
        return verify(pub, 'hellx', sig) === false;
      },
    },
  ],
};

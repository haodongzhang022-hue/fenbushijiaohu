'use strict';
/**
 * packages/content —— M4 内容分发层 + M4b 云端同步/冷存归档
 */
const { Content } = require('./src/content');
const { Storage } = require('./src/storage');
const { CloudSync } = require('./src/sync');
const { Archive115 } = require('./src/archive');

module.exports = { Content, Storage, CloudSync, Archive115 };

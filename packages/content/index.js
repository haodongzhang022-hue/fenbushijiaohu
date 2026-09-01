'use strict';
/**
 * packages/content —— M4 内容分发层 + M4b 分层存储/云端/冷存
 */
const { Content } = require('./src/content');
const { Storage } = require('./src/storage');
const { SyncClient } = require('./src/sync');
const { Archive } = require('./src/archive');

module.exports = { Content, Storage, SyncClient, Archive };

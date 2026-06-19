#!/usr/bin/env node
'use strict';

const {
    ImosEmbedError,
    ImosOriginError,
    parsePostMessageData,
    isConfiguratorCompleteMessage,
    handlePostMessage,
} = require('../lib/imos/embed-bridge.js');

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

assert(parsePostMessageData('{"type":"externalConfiguratorComplete"}')?.type === 'externalConfiguratorComplete', 'parse JSON string');
assert(parsePostMessageData('{bad json') === null, 'reject malformed JSON');
assert(parsePostMessageData({ closeMessage: 'externalConfiguratorComplete' }) !== null, 'accept object');

assert(isConfiguratorCompleteMessage({ type: 'externalConfiguratorComplete' }), 'complete by type');
assert(isConfiguratorCompleteMessage({ closeMessage: 'externalConfiguratorComplete' }), 'complete by closeMessage');
assert(!isConfiguratorCompleteMessage({ type: 'other' }), 'ignore other types');

const goodEvent = { origin: 'https://3034.netshop.imos3d.com', data: { type: 'externalConfiguratorComplete', article: 'K1' } };
const good = handlePostMessage(goodEvent);
assert(good.ok && good.payload.article === 'K1', 'accept allowed origin');

const badOrigin = handlePostMessage({ origin: 'https://evil.example', data: { type: 'externalConfiguratorComplete' } });
assert(!badOrigin.ok && badOrigin.error instanceof ImosOriginError, 'reject wrong origin');

const ignored = handlePostMessage({ origin: 'https://3034.netshop.imos3d.com', data: { type: 'ping' } });
assert(!ignored.ok && ignored.error.code === 'IMOS_MESSAGE_IGNORED', 'ignore non-complete messages');

const badJson = handlePostMessage({ origin: 'https://3034.netshop.imos3d.com', data: 'not-json{{{' });
assert(!badJson.ok && badJson.error instanceof ImosEmbedError, 'reject invalid payload');

process.exit(failed ? 1 : 0);

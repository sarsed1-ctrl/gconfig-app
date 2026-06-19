#!/usr/bin/env node
'use strict';

const { parseImosOrderXml, validateOrderMeta, ImosXmlParseError } = require('../lib/imos/xml-to-order-meta.js');

let failed = false;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        failed = true;
    } else {
        console.log('OK:', msg);
    }
}

const sampleXml = `<?xml version="1.0"?>
<Order>
  <ProjectName>Kitchen Project Alpha</ProjectName>
  <Article>
    <ArticleName>Base cabinet 600</ArticleName>
    <Material>76.F206.C.20</Material>
    <Quantity>2</Quantity>
  </Article>
  <Article>
    <Name>Wall cabinet 400</Name>
    <MaterialCode>74.F303.1.5.43</MaterialCode>
    <Qty>1</Qty>
  </Article>
</Order>`;

const meta = parseImosOrderXml(sampleXml);
assert(meta.projectName === 'Kitchen Project Alpha', 'project name');
assert(meta.articleCount === 2, 'article count');
assert(meta.lines[0].name === 'Base cabinet 600' && meta.lines[0].qty === 2, 'first line');
assert(meta.source === 'imos-kitchen', 'source tag');
assert(validateOrderMeta(meta), 'validateOrderMeta');

try {
    parseImosOrderXml('');
    assert(false, 'empty should throw');
} catch (e) {
    assert(e instanceof ImosXmlParseError, 'empty throws ImosXmlParseError');
}

process.exit(failed ? 1 : 0);

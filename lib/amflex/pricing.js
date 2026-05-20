'use strict';

/**
 * @typedef {object} AmflexLookup
 * @property {(code: string) => object | undefined} get
 */

/**
 * @typedef {object} AmflexCatalog
 * @property {string} countryCode
 * @property {AmflexLookup} materials
 * @property {AmflexLookup} finishes
 * @property {AmflexLookup} plastics
 * @property {Record<string, object>} glueByThickness
 * @property {string[]} fiber
 * @property {{ festool_processing_price: number, urgent_order_price_coefficient: number }} global
 */

/**
 * @typedef {object} AmflexOrderPayload
 * @property {string} [error]
 * @property {Array<object>} items
 */

function parseMaterialRow(row, countryCode) {
    const item = { ...row };
    if (countryCode === 'EE' && item.price_ee != null) {
        item.price = parseFloat(item.price_ee);
    } else if (item.price != null) {
        item.price = parseFloat(item.price);
    }
    item.code = item.RowKey;
    return item;
}

function parseFinishRow(row, countryCode) {
    const item = { ...row };
    if (countryCode === 'EE' && item.price_ee != null) {
        item.price = parseFloat(item.price_ee);
    } else if (item.price != null) {
        item.price = parseFloat(item.price);
    }
    item.code = item.RowKey;
    return item;
}

function parseGlueRow(row, countryCode) {
    const item = { ...row };
    item.thickness = item.RowKey;
    item.waste = parseInt(String(item.waste).replace('%', ''), 10) || 0;
    if (countryCode === 'EE') {
        item.saw = parseFloat(item.saw_ee);
        item.glue = parseFloat(item.glue_ee);
        item.CNCFirst = parseFloat(item.CNCFirst_ee);
        item.CNCNext = parseFloat(item.CNCNext_ee);
        item.press = parseFloat(item.press_ee);
    } else {
        item.saw = parseFloat(item.saw);
        item.glue = parseFloat(item.glue);
        item.CNCFirst = parseFloat(item.CNCFirst);
        item.CNCNext = parseFloat(item.CNCNext);
        item.press = parseFloat(item.press);
    }
    return item;
}

function buildLookup(rows, parser, countryCode) {
    const list = rows.map((r) => parser(r, countryCode));
    return {
        list,
        get(code) {
            if (!code) return undefined;
            const upper = String(code).toUpperCase();
            return list.find((x) => x.code === upper);
        },
    };
}

/**
 * @param {object} input
 * @returns {AmflexCatalog}
 */
function buildCatalog(input) {
    const cc = (input.countryCode || 'EE').toUpperCase();
    const materials = buildLookup(input.materialsRaw || [], parseMaterialRow, cc);
    const finishes = buildLookup(input.finishesRaw || [], parseFinishRow, cc);
    const plastics = buildLookup(input.plasticsRaw || [], parseFinishRow, cc);

    /** @type {Record<string, object>} */
    const glueByThickness = {};
    for (const row of input.glueRaw || []) {
        if (row.PartitionKey === 'glue') {
            const parsed = parseGlueRow(row, cc);
            glueByThickness[parsed.thickness] = parsed;
        }
    }

    /** @type {string[]} */
    const fiber = [];
    for (const row of input.fiberRaw || []) {
        if (row.RowKey === 'Paralēli platumam') fiber.push('V_PLAT');
        if (row.RowKey === 'Paralēli garumam') fiber.push('V_GAR');
    }

    /** @type {{ festool_processing_price: number, urgent_order_price_coefficient: number }} */
    const global = {
        festool_processing_price: 0,
        urgent_order_price_coefficient: 1.8,
    };
    for (const row of input.settingRaw || []) {
        if (row.PartitionKey === 'setting') {
            if (row.RowKey === 'festool_processing_price') {
                global.festool_processing_price = parseFloat(row.settingValue);
            }
            if (row.RowKey === 'urgent_order_price_coefficient') {
                global.urgent_order_price_coefficient = parseFloat(row.settingValue);
            }
        }
    }

    return { countryCode: cc, materials, finishes, plastics, glueByThickness, fiber, global };
}

function getMaterialSettingForThickness(glueByThickness, thickness) {
    const key = String(thickness);
    if (glueByThickness[key]) return glueByThickness[key];
    let best = Infinity;
    let chosen;
    for (const k of Object.keys(glueByThickness)) {
        const t = parseFloat(k);
        if (thickness < t && t < best) {
            best = t;
            chosen = glueByThickness[k];
        }
    }
    return chosen;
}

function sideWithMargin(glueSetting, lengthMm) {
    const minimumSize = 140;
    const glueMin = parseFloat(glueSetting.glueMin);
    const glueOverlay = parseFloat(glueSetting.glueOverlay);
    return lengthMm < minimumSize ? glueMin : lengthMm + glueOverlay;
}

function getCalcUsingLength(material) {
    if (!material) return false;
    return material.calc_using_length === 'true' || material.calc_using_length === 1 || material.calc_using_length === true;
}

function getWidthForPriceCalculation(item) {
    const first = item.materials.first;
    const second = item.materials.second;
    const useFirst = getCalcUsingLength(first);
    const useSecond = getCalcUsingLength(second);
    if (useFirst && useSecond) {
        return Math.max(first.default_width, second.default_width);
    }
    if (useFirst) return first.default_width;
    if (useSecond) return second.default_width;
    return item.width;
}

function getMaterialPrice(item, calcWidth, glueByThickness) {
    return Object.entries(item.materials).reduce((sum, [key, mat]) => {
        if (!mat) return sum;
        let part = (calcWidth * item.length) / 1e6 * mat.price;
        if (key === 'upperPlastic' || key === 'lowerPlastic') {
            return sum + part;
        }
        const setting = glueByThickness[String(mat.thickness)];
        const waste = setting ? setting.waste / 100 : 0;
        return sum + part * (1 + waste);
    }, 0);
}

function getPressedMaterials(item) {
    return Object.values(item.materials).filter((m) => m != null);
}

function getPressingPrice(item, glueSetting) {
    if (!item.pressed) return 0;
    const mats = getPressedMaterials(item);
    return ((item.width * item.length) / 1e6) * (mats.length - 1) * glueSetting.press;
}

function getFestoolProcessingPrice(item, global) {
    return item.festoolProcessing && global.festool_processing_price
        ? global.festool_processing_price
        : 0;
}

function getPrice(item, catalog, options) {
    options = options || {};
    if (!item || !item.materials || !item.materials.first) return 0;

    const glueSetting = getMaterialSettingForThickness(catalog.glueByThickness, item.thickness);
    if (!glueSetting) return 0;

    const x1 = item.sideMaterialCode.x1;
    const x2 = item.sideMaterialCode.x2;
    const y1 = item.sideMaterialCode.y1;
    const y2 = item.sideMaterialCode.y2;

    const calcWidth = getWidthForPriceCalculation(item);
    const materialPart = getMaterialPrice(item, calcWidth, catalog.glueByThickness);

    let processing =
        (2 * (parseFloat(calcWidth) + parseFloat(item.length))) / 1000 * glueSetting.saw;

    let edgeY1 = 0;
    let edgeY2 = 0;
    let edgeX1 = 0;
    let edgeX2 = 0;
    let glueY1 = 0;
    let glueY2 = 0;
    let glueX1 = 0;
    let glueX2 = 0;

    const marginForLength = sideWithMargin(glueSetting, parseFloat(item.length));
    if (y1) {
        edgeY1 = (marginForLength * y1.price) / 1000;
        glueY1 = (item.length * glueSetting.glue) / 1000;
    }
    if (y2) {
        edgeY2 = (marginForLength * y2.price) / 1000;
        glueY2 = (item.length * glueSetting.glue) / 1000;
    }

    const marginForWidth = sideWithMargin(glueSetting, parseFloat(calcWidth));
    if (x1) {
        edgeX1 = (marginForWidth * x1.price) / 1000;
        glueX1 = (calcWidth * glueSetting.glue) / 1000;
    }
    if (x2) {
        edgeX2 = (marginForWidth * x2.price) / 1000;
        glueX2 = (calcWidth * glueSetting.glue) / 1000;
    }

    processing += glueX1 + glueX2 + glueY1 + glueY2;

    if (item.processing_box) {
        processing += ((item.qty - 1) * glueSetting.CNCNext + glueSetting.CNCFirst) / item.qty;
    }

    processing += getPressingPrice(item, glueSetting);
    processing += getFestoolProcessingPrice(item, catalog.global);

    if (options.urgent) {
        processing *= catalog.global.urgent_order_price_coefficient || 1.8;
    }

    return Math.round(100 * (materialPart + processing + edgeX1 + edgeX2 + edgeY1 + edgeY2)) / 100;
}

function mapFiber(rawFiber, fiberLabels) {
    const f = String(rawFiber || '').toLowerCase();
    if (f === 'x') return fiberLabels[1] || '';
    if (f === 'y') return fiberLabels[0] || '';
    return '';
}

/**
 * @param {object} rawRow
 * @param {AmflexCatalog} catalog
 */
function processRow(rawRow, catalog) {
    const errors = [];
    const material = catalog.materials.get(rawRow.material);
    if (!material) {
        errors.push(`Material "${rawRow.material}" not found`);
    }

    /** @type {object} */
    const item = {
        name: rawRow.name || '',
        width: rawRow.width,
        length: rawRow.length,
        qty: rawRow.qty || 1,
        fiber: mapFiber(rawRow.fiber, catalog.fiber),
        processing: rawRow.processing || '',
        processing_box: !!(rawRow.processing && String(rawRow.processing).length > 0),
        pressed: false,
        festoolProcessing: false,
        urgent: false,
        materials: {
            first: material || null,
            second: null,
            upperPlastic: null,
            lowerPlastic: null,
        },
        thickness: material ? material.thickness : null,
        sideMaterialCode: { x1: null, x2: null, y1: null, y2: null },
        attachments: [],
    };

    const sides = ['x1', 'x2', 'y1', 'y2'];
    for (const side of sides) {
        const code = rawRow.sideMaterialCode && rawRow.sideMaterialCode[side];
        if (code != null && String(code).length > 0) {
            const edge = catalog.finishes.get(code);
            if (!edge) errors.push(`Edge "${code}" not found`);
            item.sideMaterialCode[side] = edge || null;
        }
    }

    if (errors.length) {
        const err = new Error(errors.join('; '));
        err.statusCode = 422;
        throw err;
    }
    return item;
}

function getVatRate(countryCode) {
    return countryCode === 'EE' ? 0.24 : 0.21;
}

/**
 * @param {AmflexOrderPayload} payload
 * @param {AmflexCatalog} catalog
 * @param {{ urgent?: boolean }} [options]
 */
function computeQuote(payload, catalog, options) {
    const items = payload.items || [];
    if (!items.length) {
        const err = new Error('No line items in Tellimus file');
        err.statusCode = 422;
        throw err;
    }

    /** @type {Array<{ name: string, qty: number, unitPrice: number, lineTotal: number }>} */
    const lines = [];
    let subtotal = 0;
    let itemCount = 0;

    for (const raw of items) {
        const item = processRow(raw, catalog);
        const unitPrice = getPrice(item, catalog, options);
        const qty = item.qty || 1;
        const lineTotal = Math.round(100 * unitPrice * qty) / 100;
        subtotal += lineTotal;
        itemCount += qty;
        lines.push({
            name: item.name || raw.name || '',
            qty,
            unitPrice,
            lineTotal,
        });
    }

    subtotal = Math.round(100 * subtotal) / 100;
    const vat = Math.round(getVatRate(catalog.countryCode) * subtotal * 100) / 100;
    const total = Math.round(100 * (subtotal + vat)) / 100;

    return {
        subtotal,
        vat,
        total,
        currency: 'EUR',
        itemCount,
        lines,
    };
}

module.exports = {
    buildCatalog,
    processRow,
    getPrice,
    computeQuote,
};

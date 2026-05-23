/**
 * EAMF countertop thickness (mm) — shared with v1 configurator and v2 3D preview.
 * Logic matches configurator.html getEamfCountertopThick / isEamfCountertop*.
 */
(function (global) {
    const COUNTERTOP_HPL12_ARTICLES = { '76.F206.C.920': true, '76.F274.C.920': true };

    function itemId(item) {
        return item && (item.article || item.code) || '';
    }

    function isHpl12(material) {
        if (!material) return false;
        const id = itemId(material);
        if (material.hpl12 === true || COUNTERTOP_HPL12_ARTICLES[id]) return true;
        const parts = id.split('.');
        return parts.length >= 3 && parts[parts.length - 1] === '12';
    }

    function isHdf13(material) {
        if (!material) return false;
        if (material.hdf13 === true) return true;
        const parts = itemId(material).split('.');
        return parts.length >= 3 && parts[parts.length - 1] === '13';
    }

    function isLdsp20(material) {
        if (!material) return false;
        if (material.ldsp20 === true) return true;
        const parts = itemId(material).split('.');
        return parts.length >= 3 && parts[parts.length - 1] === '20';
    }

    function isLdsp38(code) {
        const parts = String(code || '').split('.');
        if (!parts.length || parts[0] !== '76' || parts.length < 3) return false;
        const last = parts[parts.length - 1];
        if (last === '8' || last === '12' || last === '13' || last === '20') return false;
        if (parts.length >= 2 && parts[parts.length - 2] === '1' && parts[parts.length - 1] === '5') return true;
        return parts.slice(1).some((p) => p === '60' || p === '65' || p === '90' || p === '92');
    }

    function getThicknessMm(material) {
        if (!material) return null;
        if (isHpl12(material)) return 12;
        if (isLdsp20(material)) return 20;
        if (isHdf13(material)) return 13;
        const id = itemId(material);
        if (material.ldsp38 === true || isLdsp38(id)) return 38;
        const t = material.thick != null ? material.thick : material.thickness;
        if (t != null && Number.isFinite(Number(t))) return Number(t);
        const parts = id.split('.');
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) return parseInt(last, 10);
        return null;
    }

    function findCountertop(catalog, article) {
        if (!article || !catalog) return null;
        const id = String(article).trim();
        return (catalog.countertops || []).find((ct) => ct.article === id || ct.code === id) || null;
    }

    function getThicknessMmByArticle(catalog, article) {
        return getThicknessMm(findCountertop(catalog, article));
    }

    global.GConfigCountertopThick = {
        getThicknessMm,
        findCountertop,
        getThicknessMmByArticle,
        itemId,
    };
})(typeof window !== 'undefined' ? window : globalThis);

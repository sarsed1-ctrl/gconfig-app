/**

 * GConfig v2 — iframe bridge to v1 configurator.html

 * Preserves 100% v1 logic; wizard UI syncs fields and mirrors preview/price.

 */

(function () {

    'use strict';



    const params = new URLSearchParams(window.location.search);

    let productMode = params.get('type') === 'beds' ? 'beds' : 'closets';

    let currentLang = 'ru';

    let currentStep = 1;

    const TOTAL_STEPS = 4;

    const STEP_STORAGE_KEY = 'gconfig-v2-step';
    const THEME_STORAGE_KEY = 'gconfig-v2-theme';

    let iframeReady = false;

    let syncPaused = false;

    let previewTimer = null;



    const iframe = document.getElementById('v1Frame');

    const loadingOverlay = document.getElementById('loadingOverlay');

    const appShell = document.getElementById('appShell');

    const previewCanvas = document.getElementById('previewCanvas');

    const priceMirror = document.getElementById('priceMirror');

    const priceMirrorWrap = document.getElementById('priceMirrorWrap');

    const exportActions = document.getElementById('exportActions');

    const previewMeta = document.getElementById('previewMeta');



    const SELECT_CLONE_IDS = [

        'facadeThick', 'carcassThick', 'wallType', 'countertopMaterial',

        'lowerDrawerSystem', 'lowerDrawerCount',

        'eamfBackPanel', 'eamfFacadeMaterial', 'eamfFacadeEdge',

        'eamfCarcassMaterial', 'eamfCarcassEdge',

        'upperHingeBrand', 'upperHingeType', 'upperHingeCount',

        'lowerHingeBrand', 'lowerHingeType', 'lowerHingeCount',

        'bedPreset', 'bedBaseType'

    ];



    const EAMF_IFRAME_HANDLERS = {

        eamfFacadeMaterial: 'onEamfFacadeMaterialChange',

        eamfCarcassMaterial: 'onEamfCarcassMaterialChange',

        eamfFacadeEdge: 'onEamfFacadeEdgeChange',

        eamfCarcassEdge: 'onEamfCarcassEdgeChange',

        eamfBackPanel: 'onEamfBackPanelChange',

        countertopMaterial: 'onEamfCountertopMaterialChange'

    };



    const EAMF_EDGE_SELECT_IDS = ['eamfFacadeEdge', 'eamfCarcassEdge'];



    const SPACING_SLIDER_PAIRS = [

        ['w-upperSpacingH', 'w-upperSpacingHVal'],

        ['w-upperSpacingV', 'w-upperSpacingVVal'],

        ['w-vanitySpacingH', 'w-vanitySpacingHVal'],

        ['w-vanitySpacingV', 'w-vanitySpacingVVal']

    ];



    const I18N = {

        ru: {

            loading: 'Загрузка конфигуратора…',

            to_home: 'Главная',

            to_v1: '← v1',

            step1_short: 'Размеры',

            step2_short: 'Полки',

            step3_short: 'Фурнитура',

            step4_short: 'Материалы',

            step1_title: 'Размеры',

            step1_desc: 'Габариты секций, толщины и тип стены.',

            step2_title: 'Полки и двери',

            step2_desc: 'Количество полок и режим фурнитуры дверей.',

            step3_title: 'Задняя стенка и петли',

            step3_desc: 'Задняя панель EAMF и настройки петель.',

            step4_title: 'Материалы и цена',

            step4_desc: 'Отделка EAMF и итоговая стоимость Amflex.',

            mode_closets: 'Шкафы',

            mode_beds: 'Кровати',

            lower_section: 'Нижний шкаф',

            upper_section: 'Верхний шкаф',

            width: 'Ширина (W)',

            height: 'Высота (H)',

            depth: 'Глубина (D)',

            general_thick: 'Общие параметры',

            facade_thick: 'Толщина фасада',

            carcass_thick: 'Толщина корпуса',

            wall_type: 'Тип стены',

            countertop: 'Столешница',

            include_countertop: 'Включить столешницу',

            ct_material: 'Материал столешницы',

            ct_front_overhang: 'Выступ спереди (мм)',

            ct_side_overhang: 'Выступ сбоку (мм)',

            shelves: 'Полки',

            upper_shelves_h: 'Верх — гориз.',

            upper_shelves_v: 'Верх — верт.',

            lower_shelves_h: 'Низ — гориз.',

            lower_shelves_v: 'Низ — верт.',

            shelf_spacing_h: 'Вертикальный шаг (верх)',

            shelf_spacing_v: 'Горизонтальный шаг (верх)',

            shelf_spacing_h_lower: 'Вертикальный шаг (низ)',

            shelf_spacing_v_lower: 'Горизонтальный шаг (низ)',

            hardware_mode: 'Фурнитура дверей',

            upper_hw: 'Верхний шкаф',

            lower_hw: 'Нижний шкаф',

            gas: 'Газлифты',

            hinge: 'Петли',

            drawer: 'Ящики',

            lower_split_door: 'Разделить дверь на две створки',

            drawer_system: 'Система ящиков',

            drawer_count: 'Количество ящиков',

            back_panel: 'Задняя панель',

            use_carcass_back: 'Корпусная задняя стенка',

            eamf_back: 'EAMF задняя панель',

            back_panel_fit: 'Посадка задней панели',

            overlay: 'Накладная',

            inset: 'Вкладная',

            hinges: 'Петли и газлифты',

            upper_hinge_brand: 'Верх — бренд',

            upper_hinge_type: 'Верх — тип',

            upper_hinge_count: 'Верх — кол-во петель',

            lower_hinge_brand: 'Низ — бренд',

            lower_hinge_type: 'Низ — тип',

            lower_hinge_count: 'Низ — кол-во петель',

            gas_auto_hint: 'Газлифты GTV HORIZON подбираются автоматически по весу фасада.',

            materials: 'Материалы EAMF',

            facade_mat: 'Фасад',

            facade_edge: 'Кромка фасада',

            carcass_mat: 'Корпус',

            carcass_edge: 'Кромка корпуса',

            project: 'Проект',

            project_name: 'Название проекта',

            price_on_right: 'Сводка цены справа. Экспорт — кнопки под превью.',

            open_v1_full: 'Полный конфигуратор v1 →',

            preview: 'Превью',

            back: 'Назад',

            next: 'Далее',

            finish: 'Готово',

            pdf: 'PDF',

            excel: 'Excel',

            order: 'Заказ',

            bed_dims: 'Кровать',

            bed_preset: 'Пресет',

            mattress_w: 'Ширина матраса',

            bed_length: 'Длина',

            frame_h: 'Высота каркаса',

            headboard_h: 'Изголовье',

            footboard_h: 'Изножье',

            bed_base: 'Основание',

            beds_step2_skip: 'Для кроватей этот шаг не применяется.',

            beds_step3_skip: 'Для кроватей задняя панель и петли скрыты в v1.',

            preview_updating: 'Обновление превью…',

            step_of: 'Шаг {n} из 4'

        },

        en: {

            loading: 'Loading configurator…',

            to_home: 'Home',

            to_v1: '← v1',

            step1_short: 'Size',

            step2_short: 'Shelves',

            step3_short: 'Hardware',

            step4_short: 'Materials',

            step1_title: 'Dimensions',

            step1_desc: 'Cabinet sizes, thicknesses, and wall type.',

            step2_title: 'Shelves & doors',

            step2_desc: 'Shelf counts and door hardware mode.',

            step3_title: 'Back panel & hinges',

            step3_desc: 'EAMF back panel and hinge settings.',

            step4_title: 'Materials & price',

            step4_desc: 'EAMF finishes and Amflex total.',

            mode_closets: 'Closets',

            mode_beds: 'Beds',

            lower_section: 'Lower cabinet',

            upper_section: 'Upper cabinet',

            width: 'Width (W)',

            height: 'Height (H)',

            depth: 'Depth (D)',

            general_thick: 'General',

            facade_thick: 'Facade thickness',

            carcass_thick: 'Carcass thickness',

            wall_type: 'Wall type',

            countertop: 'Countertop',

            include_countertop: 'Include countertop',

            ct_material: 'Countertop material',

            ct_front_overhang: 'Front overhang (mm)',

            ct_side_overhang: 'Side overhang (mm)',

            shelves: 'Shelves',

            upper_shelves_h: 'Upper — horiz.',

            upper_shelves_v: 'Upper — vert.',

            lower_shelves_h: 'Lower — horiz.',

            lower_shelves_v: 'Lower — vert.',

            shelf_spacing_h: 'Vertical spacing (upper)',

            shelf_spacing_v: 'Horizontal spacing (upper)',

            shelf_spacing_h_lower: 'Vertical spacing (lower)',

            shelf_spacing_v_lower: 'Horizontal spacing (lower)',

            hardware_mode: 'Door hardware',

            upper_hw: 'Upper cabinet',

            lower_hw: 'Lower cabinet',

            gas: 'Gas lifts',

            hinge: 'Hinges',

            drawer: 'Drawers',

            lower_split_door: 'Split door into two leaves',

            drawer_system: 'Drawer system',

            drawer_count: 'Drawer count',

            back_panel: 'Back panel',

            use_carcass_back: 'Carcass back panel',

            eamf_back: 'EAMF back panel',

            back_panel_fit: 'Back panel fit',

            overlay: 'Overlay',

            inset: 'Inset',

            hinges: 'Hinges & gas lifts',

            upper_hinge_brand: 'Upper — brand',

            upper_hinge_type: 'Upper — type',

            upper_hinge_count: 'Upper — hinge count',

            lower_hinge_brand: 'Lower — brand',

            lower_hinge_type: 'Lower — type',

            lower_hinge_count: 'Lower — hinge count',

            gas_auto_hint: 'GTV HORIZON gas lifts are selected automatically by facade weight.',

            materials: 'EAMF materials',

            facade_mat: 'Facade',

            facade_edge: 'Facade edge',

            carcass_mat: 'Carcass',

            carcass_edge: 'Carcass edge',

            project: 'Project',

            project_name: 'Project name',

            price_on_right: 'Price summary on the right. Export buttons below preview.',

            open_v1_full: 'Open full v1 configurator →',

            preview: 'Preview',

            back: 'Back',

            next: 'Next',

            finish: 'Done',

            pdf: 'PDF',

            excel: 'Excel',

            order: 'Order',

            bed_dims: 'Bed',

            bed_preset: 'Preset',

            mattress_w: 'Mattress width',

            bed_length: 'Length',

            frame_h: 'Frame height',

            headboard_h: 'Headboard',

            footboard_h: 'Footboard',

            bed_base: 'Base',

            beds_step2_skip: 'This step does not apply to beds.',

            beds_step3_skip: 'Back panel and hinges are hidden for beds in v1.',

            preview_updating: 'Updating preview…',

            step_of: 'Step {n} of 4'

        }

    };



    function t(key) {

        const dict = I18N[currentLang] || I18N.ru;

        return dict[key] || I18N.ru[key] || key;

    }



    function applyI18n() {

        document.querySelectorAll('[data-i18n]').forEach((el) => {

            const key = el.getAttribute('data-i18n');

            if (key) el.textContent = t(key);

        });

        const projectInput = document.getElementById('w-project-name-input');

        if (projectInput) {

            projectInput.placeholder = currentLang === 'en' ? 'Optional project name' : 'Необязательное название';

        }

        document.documentElement.lang = currentLang === 'en' ? 'en' : 'ru';

        updateNavLabels();

    }



    function iframeDoc() {

        try {

            return iframe.contentDocument || iframe.contentWindow?.document;

        } catch (_) {

            return null;

        }

    }



    function iframeWin() {

        try {

            return iframe.contentWindow;

        } catch (_) {

            return null;

        }

    }



    function iframeSrc() {

        return productMode === 'beds'

            ? 'configurator.html?mode=beds'

            : 'configurator.html';

    }



    function loadIframe() {

        iframeReady = false;

        loadingOverlay.classList.remove('hidden');

        iframe.src = iframeSrc();

    }



    function triggerV1Update() {

        const win = iframeWin();

        if (!win) return;

        if (typeof win.scheduleUpdate === 'function') {

            win.scheduleUpdate();

        } else if (typeof win.updateConfigurator === 'function') {

            win.updateConfigurator();

        }

    }



    function dispatchEl(el) {

        if (!el) return;

        el.dispatchEvent(new Event('input', { bubbles: true }));

        el.dispatchEvent(new Event('change', { bubbles: true }));

    }



    function setIframeValue(id, value) {

        const doc = iframeDoc();

        if (!doc) return;

        const el = doc.getElementById(id);

        if (!el) return;

        if (el.type === 'checkbox') {

            el.checked = !!value;

        } else {

            el.value = value;

        }

        dispatchEl(el);

    }



    function setIframeRadio(name, value) {

        const doc = iframeDoc();

        if (!doc) return;

        const el = doc.querySelector(`input[name="${name}"][value="${value}"]`);

        if (!el) return;

        el.checked = true;

        dispatchEl(el);

    }



    function getIframeValue(id) {

        const doc = iframeDoc();

        if (!doc) return null;

        const el = doc.getElementById(id);

        if (!el) return null;

        if (el.type === 'checkbox') return el.checked;

        return el.value;

    }



    function getIframeRadio(name) {

        const doc = iframeDoc();

        if (!doc) return null;

        const el = doc.querySelector(`input[name="${name}"]:checked`);

        return el ? el.value : null;

    }



    function cloneOptionElement(opt) {

        const o = document.createElement('option');

        o.value = opt.value;

        o.textContent = opt.textContent;

        o.disabled = opt.disabled;

        o.selected = opt.selected;

        return o;

    }



    function cloneSelectOptions(fromId, toSelect) {

        const doc = iframeDoc();

        if (!doc || !toSelect) return;

        const src = doc.getElementById(fromId);

        if (!src) return;

        const prev = toSelect.value;

        toSelect.innerHTML = '';

        toSelect.disabled = src.disabled;

        Array.from(src.childNodes).forEach((node) => {

            if (node.nodeName === 'OPTION') {

                toSelect.appendChild(cloneOptionElement(node));

            } else if (node.nodeName === 'OPTGROUP') {

                const og = document.createElement('optgroup');

                og.label = node.label;

                Array.from(node.children).forEach((opt) => {

                    if (opt.nodeName === 'OPTION') og.appendChild(cloneOptionElement(opt));

                });

                toSelect.appendChild(og);

            }

        });

        if (prev && Array.from(toSelect.options).some((o) => o.value === prev)) {

            toSelect.value = prev;

        } else if (src.value) {

            toSelect.value = src.value;

        }

    }



    function refreshEamfEdgeSelects() {

        EAMF_EDGE_SELECT_IDS.forEach((id) => {

            const wEl = document.querySelector(`[data-iframe="${id}"]`);

            if (wEl && wEl.tagName === 'SELECT') cloneSelectOptions(id, wEl);

        });

    }



    function syncSpacingLabels() {

        SPACING_SLIDER_PAIRS.forEach(([sliderId, labelId]) => {

            const slider = document.getElementById(sliderId);

            const label = document.getElementById(labelId);

            if (!slider || !label) return;

            label.textContent = `${slider.value} mm`;

        });

    }



    function syncShelfSpacingVisibility() {

        const upperH = parseInt(document.getElementById('w-upperShelvesH')?.value, 10) || 0;

        const upperV = parseInt(document.getElementById('w-upperShelvesV')?.value, 10) || 0;

        const lowerH = parseInt(document.getElementById('w-vanityShelvesH')?.value, 10) || 0;

        const lowerV = parseInt(document.getElementById('w-vanityShelvesV')?.value, 10) || 0;

        document.getElementById('upperHSpacingBlock')?.classList.toggle('hidden', upperH <= 0);

        document.getElementById('upperVSpacingBlock')?.classList.toggle('hidden', upperV <= 0);

        document.getElementById('vanityHSpacingBlock')?.classList.toggle('hidden', lowerH <= 0);

        document.getElementById('vanityVSpacingBlock')?.classList.toggle('hidden', lowerV <= 0);

    }



    function syncHardwareChips(radioName, containerId) {

        const val = getIframeRadio(radioName);

        const container = document.getElementById(containerId);

        if (!container || !val) return;

        container.querySelectorAll('.hw-chip').forEach((chip) => {

            chip.classList.toggle('active', chip.getAttribute('data-value') === val);

        });

    }



    function updateConditionalUI() {

        const hasCountertop = document.getElementById('w-hasCountertop')?.checked;

        const countertopFields = document.getElementById('countertopFields');

        if (countertopFields) countertopFields.classList.toggle('hidden', !hasCountertop);



        const lowerMode = getIframeRadio('lowerHardwareMode');

        const upperMode = getIframeRadio('upperHardwareMode');

        const drawerFields = document.getElementById('drawerFields');

        const lowerSplitWrap = document.getElementById('lowerSplitWrap');

        if (drawerFields) drawerFields.classList.toggle('visible', lowerMode === 'drawer');

        if (lowerSplitWrap) lowerSplitWrap.classList.toggle('hidden', lowerMode !== 'hinge');



        document.querySelectorAll('.hinge-upper-field').forEach((el) => {

            el.classList.toggle('hidden', upperMode === 'gas');

        });

        document.querySelectorAll('.hinge-lower-field').forEach((el) => {

            el.classList.toggle('hidden', lowerMode !== 'hinge');

        });



        const gasHint = document.getElementById('gasHint');

        if (gasHint) {

            gasHint.classList.toggle('visible', upperMode === 'gas' || lowerMode === 'gas');

        }



        const useCarcassBack = document.getElementById('w-useCarcassBackPanel')?.checked;

        const backFitRow = document.getElementById('backFitRow');

        if (backFitRow) backFitRow.classList.toggle('hidden', !!useCarcassBack);



        syncShelfSpacingVisibility();

        syncSpacingLabels();

    }



    function pullFromIframe() {

        syncPaused = true;

        document.querySelectorAll('[data-iframe]').forEach((el) => {

            const id = el.getAttribute('data-iframe');

            const val = getIframeValue(id);

            if (val === null) return;

            if (el.type === 'checkbox') el.checked = !!val;

            else el.value = val;

        });



        SELECT_CLONE_IDS.forEach((id) => {

            const wEl = document.querySelector(`[data-iframe="${id}"]`);

            if (wEl && wEl.tagName === 'SELECT') cloneSelectOptions(id, wEl);

        });



        syncHardwareChips('upperHardwareMode', 'upperHwChips');

        syncHardwareChips('lowerHardwareMode', 'lowerHwChips');

        syncHardwareChips('backPanelFitType', 'backFitChips');

        refreshEamfEdgeSelects();

        syncSpacingLabels();

        syncPaused = false;

        updateConditionalUI();

    }



    function pushToIframe(fromEl) {

        if (syncPaused || !iframeReady) return;

        const id = fromEl.getAttribute('data-iframe');

        if (!id) return;



        const handlerName = EAMF_IFRAME_HANDLERS[id];

        if (fromEl.type === 'checkbox') setIframeValue(id, fromEl.checked);

        else setIframeValue(id, fromEl.value);



        if (handlerName) {

            const win = iframeWin();

            if (win && typeof win[handlerName] === 'function') win[handlerName]();

            setTimeout(refreshEamfEdgeSelects, 0);

        }



        updateConditionalUI();

        triggerV1Update();

        schedulePreviewSync();

    }



    function pushRadioToIframe(name, value) {

        if (syncPaused || !iframeReady) return;

        setIframeRadio(name, value);

        updateConditionalUI();

        triggerV1Update();

        schedulePreviewSync();

    }



    let neonSoftBuffer = null;



    function mixChannel(a, b, t) {

        return Math.round(a + (b - a) * t);

    }



    function smoothstep(edge0, edge1, x) {

        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));

        return t * t * (3 - 2 * t);

    }



    function colorDistance(r, g, b, ir, ig, ib) {

        const dr = r - ir;

        const dg = g - ig;

        const db = b - ib;

        return dr * dr + dg * dg + db * db;

    }



    function mapSegmentColorToNeon(r, g, b) {

        const palette = [

            { in: [41, 128, 185], out: [82, 203, 255] },

            { in: [211, 84, 0], out: [255, 166, 62] },

            { in: [142, 68, 173], out: [210, 130, 255] },

            { in: [22, 160, 133], out: [48, 232, 186] },

            { in: [192, 57, 43], out: [255, 110, 98] },

            { in: [44, 62, 80], out: [150, 180, 210] },

            { in: [26, 107, 47], out: [92, 255, 200] },

        ];

        let best = null;

        let bestDist = 6500;

        for (const entry of palette) {

            const dist = colorDistance(r, g, b, entry.in[0], entry.in[1], entry.in[2]);

            if (dist < bestDist) {

                bestDist = dist;

                best = entry;

            }

        }

        if (best && bestDist < 3600) return best.out;



        const max = Math.max(r, g, b);

        const min = Math.min(r, g, b);

        const sat = max === 0 ? 0 : (max - min) / max;

        if (sat > 0.2) {

            const scale = 1.42;

            const lift = 38;

            let nr = Math.min(255, Math.round(r * scale + lift));

            let ng = Math.min(255, Math.round(g * scale + lift));

            let nb = Math.min(255, Math.round(b * scale + lift));

            const maxOut = Math.max(nr, ng, nb);

            if (maxOut < 195) {

                const s = 195 / maxOut;

                nr = Math.min(255, Math.round(nr * s));

                ng = Math.min(255, Math.round(ng * s));

                nb = Math.min(255, Math.round(nb * s));

            }

            return [nr, ng, nb];

        }

        return [r, g, b];

    }



    function recolorSchematicForNeon(ctx, w, h) {

        const img = ctx.getImageData(0, 0, w, h);

        const d = img.data;

        const BG = [8, 12, 20];

        const PANEL = [18, 28, 42];

        const LINE = [36, 175, 138];

        const LINE_HI = [92, 255, 200];

        const TEXT = [118, 178, 164];

        const TEXT_HI = [168, 228, 210];



        for (let i = 0; i < d.length; i += 4) {

            const r = d[i];

            const g = d[i + 1];

            const b = d[i + 2];

            const a = d[i + 3];

            if (a < 8) continue;



            const max = Math.max(r, g, b);

            const min = Math.min(r, g, b);

            const lum = max / 255;

            const sat = max === 0 ? 0 : (max - min) / max;



            if (b > r + 35 && b > g + 15 && b > 60) {

                d[i] = BG[0];

                d[i + 1] = BG[1];

                d[i + 2] = BG[2];

                continue;

            }



            if (sat > 0.22 && lum > 0.1 && lum < 0.72 && g > r + 18 && r < 120) {

                d[i] = BG[0];

                d[i + 1] = BG[1];

                d[i + 2] = BG[2];

                continue;

            }



            if (sat > 0.22 && lum > 0.1 && lum < 0.72 && b > g + 18 && r < 120) {

                d[i] = BG[0];

                d[i + 1] = BG[1];

                d[i + 2] = BG[2];

                continue;

            }



            const bgWeight = smoothstep(0.66, 0.95, lum) * (1 - Math.min(1, sat * 1.4));

            const panelWeight = smoothstep(0.52, 0.84, lum) * (1 - Math.min(1, sat * 1.1));

            if (bgWeight > 0.04 || panelWeight > 0.08) {

                const fillWeight = Math.max(bgWeight, panelWeight * 0.85);

                const tr = mixChannel(PANEL[0], BG[0], bgWeight);

                const tg = mixChannel(PANEL[1], BG[1], bgWeight);

                const tb = mixChannel(PANEL[2], BG[2], bgWeight);

                d[i] = mixChannel(r, tr, fillWeight);

                d[i + 1] = mixChannel(g, tg, fillWeight);

                d[i + 2] = mixChannel(b, tb, fillWeight);

                continue;

            }



            if (sat > 0.16 && lum > 0.08 && lum < 0.92) {

                const neon = mapSegmentColorToNeon(r, g, b);

                d[i] = neon[0];

                d[i + 1] = neon[1];

                d[i + 2] = neon[2];

                continue;

            }



            const lineWeight = (1 - smoothstep(0.1, 0.5, lum)) * (1 - sat * 0.28);

            if (lineWeight > 0.04) {

                const lr = mixChannel(LINE[0], LINE_HI[0], lineWeight);

                const lg = mixChannel(LINE[1], LINE_HI[1], lineWeight);

                const lb = mixChannel(LINE[2], LINE_HI[2], lineWeight);

                const blend = lineWeight * 0.88;

                d[i] = mixChannel(r, lr, blend);

                d[i + 1] = mixChannel(g, lg, blend);

                d[i + 2] = mixChannel(b, lb, blend);

                continue;

            }



            const textWeight = smoothstep(0.24, 0.66, lum) * (1 - sat) * 0.72;

            if (textWeight > 0.04) {

                const tr = mixChannel(TEXT[0], TEXT_HI[0], textWeight);

                const tg = mixChannel(TEXT[1], TEXT_HI[1], textWeight);

                const tb = mixChannel(TEXT[2], TEXT_HI[2], textWeight);

                d[i] = mixChannel(r, tr, textWeight);

                d[i + 1] = mixChannel(g, tg, textWeight);

                d[i + 2] = mixChannel(b, tb, textWeight);

            }

        }



        ctx.putImageData(img, 0, 0);

    }



    const NEON_SEGMENT_COLORS = ['#62d8ff', '#ffb25e', '#de9cff', '#58ffda', '#ff8a8a', '#c8dcf5'];



    function drawNeonShelfSegmentsOverlay(ctx) {

        const win = iframeWin();

        const segments = win?.__gconfigSchematicShelfSegments;

        if (!segments?.length) return;



        const dashSplit = [8, 5, 3, 5];

        const dashSingle = [9, 6];



        segments.forEach(({ x1, y1, x2, y2, segIdx, isSplit, orientation }) => {

            const dash = isSplit ? dashSplit : dashSingle;

            let color;



            if (isSplit) {

                color = NEON_SEGMENT_COLORS[segIdx % NEON_SEGMENT_COLORS.length];

            } else {

                color = '#5cffc8';

            }



            ctx.save();

            ctx.globalCompositeOperation = 'destination-out';

            ctx.lineWidth = 4.5;

            ctx.lineCap = 'round';

            ctx.strokeStyle = 'rgba(0, 0, 0, 1)';

            ctx.setLineDash(dash);

            ctx.beginPath();

            ctx.moveTo(x1, y1);

            ctx.lineTo(x2, y2);

            ctx.stroke();

            ctx.restore();



            ctx.save();

            ctx.globalCompositeOperation = 'source-over';

            ctx.lineWidth = 2.6;

            ctx.lineCap = 'round';

            ctx.strokeStyle = color;

            ctx.shadowColor = color;

            ctx.shadowBlur = 12;

            ctx.setLineDash(dash);

            ctx.beginPath();

            ctx.moveTo(x1, y1);

            ctx.lineTo(x2, y2);

            ctx.stroke();

            ctx.restore();

        });

    }



    function drawNeonParallelLiftOverlay(ctx) {

        const win = iframeWin();

        const data = win?.__gconfigParallelLiftRect;

        if (!data) return;

        const { fdX, fdY, fdW, fdH, wY } = data;



        ctx.save();

        ctx.globalCompositeOperation = 'destination-out';

        ctx.fillStyle = 'rgba(0, 0, 0, 1)';

        ctx.fillRect(fdX - 1, fdY - 1, fdW + 2, fdH + 2);

        ctx.restore();



        ctx.save();

        ctx.fillStyle = 'rgba(0, 229, 160, 0.16)';

        ctx.strokeStyle = 'rgba(92, 255, 200, 0.9)';

        ctx.lineWidth = 2;

        ctx.setLineDash([6, 4]);

        ctx.fillRect(fdX, fdY, fdW, fdH);

        ctx.strokeRect(fdX, fdY, fdW, fdH);



        ctx.strokeStyle = 'rgba(0, 229, 160, 0.5)';

        ctx.lineWidth = 1;

        ctx.beginPath();

        ctx.moveTo(fdX, wY);

        ctx.lineTo(fdX, fdY);

        ctx.stroke();

        ctx.beginPath();

        ctx.moveTo(fdX + fdW, wY);

        ctx.lineTo(fdX + fdW, fdY);

        ctx.stroke();



        ctx.strokeStyle = 'rgba(92, 255, 200, 0.88)';

        ctx.fillStyle = 'rgba(92, 255, 200, 0.88)';

        ctx.lineWidth = 2;

        ctx.setLineDash([]);

        const arrowX1 = fdX + fdW * 0.3;

        const arrowX2 = fdX + fdW * 0.7;

        const arrowTip = fdY - 8;

        [arrowX1, arrowX2].forEach((ax) => {

            ctx.beginPath();

            ctx.moveTo(ax, wY - 4);

            ctx.lineTo(ax, arrowTip + 10);

            ctx.stroke();

            ctx.beginPath();

            ctx.moveTo(ax, arrowTip);

            ctx.lineTo(ax - 5, arrowTip + 8);

            ctx.lineTo(ax + 5, arrowTip + 8);

            ctx.closePath();

            ctx.fill();

        });

        ctx.restore();

    }



    function collectHingeDotsFromIframe() {

        const win = iframeWin();

        if (!win || !Array.isArray(win.__gconfigSchematicHingeDots)) return [];

        return win.__gconfigSchematicHingeDots.map((dot) => ({

            x: dot.x,

            y: dot.y,

            radius: dot.r || 5,

        }));

    }



    function drawSoftNeonHingeDots(ctx, dots) {

        if (!dots.length) return;



        dots.forEach(({ x, y, radius }) => {

            const r = radius || 5;



            ctx.save();

            ctx.globalCompositeOperation = 'destination-out';

            ctx.beginPath();

            ctx.arc(x, y, r + 3, 0, Math.PI * 2);

            ctx.fill();

            ctx.restore();



            ctx.save();

            const glow = ctx.createRadialGradient(x, y, 0, x, y, r + 6);

            glow.addColorStop(0, 'rgba(0, 229, 160, 0.5)');

            glow.addColorStop(0.65, 'rgba(0, 229, 160, 0.14)');

            glow.addColorStop(1, 'rgba(0, 229, 160, 0)');

            ctx.fillStyle = glow;

            ctx.beginPath();

            ctx.arc(x, y, r + 6, 0, Math.PI * 2);

            ctx.fill();

            ctx.restore();



            ctx.save();

            const core = ctx.createRadialGradient(x, y, 0, x, y, r + 0.5);

            core.addColorStop(0, '#eafff8');

            core.addColorStop(0.55, '#5cffc8');

            core.addColorStop(1, '#00c888');

            ctx.fillStyle = core;

            ctx.beginPath();

            ctx.arc(x, y, r + 0.5, 0, Math.PI * 2);

            ctx.fill();

            ctx.strokeStyle = 'rgba(180, 255, 230, 0.4)';

            ctx.lineWidth = 1;

            ctx.stroke();

            ctx.restore();

        });

    }



    function applyNeonSchematicSoftening(ctx, w, h) {

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;



        if (!neonSoftBuffer) neonSoftBuffer = document.createElement('canvas');

        if (neonSoftBuffer.width !== w || neonSoftBuffer.height !== h) {

            neonSoftBuffer.width = w;

            neonSoftBuffer.height = h;

        }

        const sctx = neonSoftBuffer.getContext('2d');

        if (!sctx) return;

        sctx.clearRect(0, 0, w, h);

        sctx.drawImage(ctx.canvas, 0, 0);



        ctx.clearRect(0, 0, w, h);

        ctx.save();

        ctx.filter = 'blur(1.35px)';

        ctx.globalAlpha = 0.26;

        ctx.drawImage(neonSoftBuffer, 0, 0);

        ctx.restore();

        ctx.save();

        ctx.globalAlpha = 0.88;

        ctx.drawImage(neonSoftBuffer, 0, 0);

        ctx.restore();

    }



    function syncCanvas() {

        const doc = iframeDoc();

        if (!doc || !previewCanvas) return;

        const src = doc.getElementById('schematicCanvas');

        if (!src) return;

        const ctx = previewCanvas.getContext('2d');

        if (!ctx) return;

        if (previewCanvas.width !== src.width) previewCanvas.width = src.width;

        if (previewCanvas.height !== src.height) previewCanvas.height = src.height;

        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        try {

            ctx.drawImage(src, 0, 0);

            if (document.documentElement.classList.contains('theme-future')) {

                const hingeDots = collectHingeDotsFromIframe();

                recolorSchematicForNeon(ctx, previewCanvas.width, previewCanvas.height);

                applyNeonSchematicSoftening(ctx, previewCanvas.width, previewCanvas.height);

                drawNeonParallelLiftOverlay(ctx);

                drawNeonShelfSegmentsOverlay(ctx);

                drawSoftNeonHingeDots(ctx, hingeDots);

            }

        } catch (_) { /* tainted or not ready */ }

    }



    function syncPriceMirror() {

        const doc = iframeDoc();

        if (!doc || !priceMirror) return;

        const src = doc.getElementById('priceSummary');

        if (!src) return;

        priceMirror.innerHTML = src.innerHTML;

        priceMirror.className = src.className;

        if (priceMirrorWrap) {

            priceMirrorWrap.classList.toggle('is-loading', src.classList.contains('is-loading'));

            priceMirrorWrap.classList.toggle('is-error', src.classList.contains('is-error'));

        }

    }



    function schedulePreviewSync() {

        clearTimeout(previewTimer);

        previewTimer = setTimeout(() => {

            syncCanvas();

            syncPriceMirror();

        }, 220);

    }



    function updateV1Link() {

        const link = document.getElementById('openV1Link');

        if (link) {

            link.href = productMode === 'beds' ? 'beds.html' : 'configurator.html';

        }

    }



    function setProductMode(mode) {

        if (mode === productMode) return;

        productMode = mode;

        appShell.classList.toggle('beds-mode', mode === 'beds');

        document.getElementById('modeClosets').classList.toggle('active', mode === 'closets');

        document.getElementById('modeBeds').classList.toggle('active', mode === 'beds');

        updateV1Link();

        const url = new URL(window.location.href);

        if (mode === 'beds') url.searchParams.set('type', 'beds');

        else url.searchParams.delete('type');

        window.history.replaceState({}, '', url);

        loadIframe();

    }



    function persistStep(step) {

        try {

            sessionStorage.setItem(STEP_STORAGE_KEY, String(step));

        } catch (_) { /* ignore */ }

    }



    function restoreStep() {

        try {

            const saved = sessionStorage.getItem(STEP_STORAGE_KEY);

            if (saved) {

                const n = Number(saved);

                if (n >= 1 && n <= TOTAL_STEPS) return n;

            }

        } catch (_) { /* ignore */ }

        return 1;

    }



    function triggerStepEnter(el) {
        if (!el || !document.documentElement.classList.contains('theme-future')) return;
        el.classList.remove('step-enter');
        void el.offsetWidth;
        el.classList.add('step-enter');
        el.addEventListener('animationend', () => el.classList.remove('step-enter'), { once: true });
    }

    function goToStep(step) {

        const prevStep = currentStep;

        currentStep = Math.max(1, Math.min(TOTAL_STEPS, step));

        persistStep(currentStep);

        document.querySelectorAll('.wizard-step').forEach((s) => {

            const isActive = Number(s.dataset.step) === currentStep;

            s.classList.toggle('active', isActive);

            if (isActive && currentStep !== prevStep) triggerStepEnter(s);

        });

        document.querySelectorAll('.stepper-item').forEach((item) => {

            const n = Number(item.dataset.step);

            item.classList.toggle('active', n === currentStep);

            item.classList.toggle('done', n < currentStep);

            if (n === currentStep && currentStep !== prevStep) triggerStepEnter(item);

        });

        document.getElementById('btnPrev').disabled = currentStep === 1;

        const btnNext = document.getElementById('btnNext');

        btnNext.textContent = currentStep === TOTAL_STEPS ? t('finish') : t('next');

        exportActions.classList.toggle('visible', iframeReady);

        if (currentStep === 4) refreshEamfEdgeSelects();

        updateNavLabels();

        schedulePreviewSync();

    }



    function updateNavLabels() {

        if (previewMeta) {

            previewMeta.textContent = t('step_of').replace('{n}', String(currentStep));

        }

    }



    function setLang(lang) {

        currentLang = lang === 'en' ? 'en' : 'ru';

        document.getElementById('langRu').classList.toggle('active', currentLang === 'ru');

        document.getElementById('langEn').classList.toggle('active', currentLang === 'en');

        applyI18n();

        const win = iframeWin();

        if (win && typeof win.setLang === 'function') win.setLang(currentLang);

    }



    function onIframeLoad() {

        const win = iframeWin();

        if (!win) return;



        iframeReady = true;

        loadingOverlay.classList.add('hidden');

        appShell.classList.toggle('beds-mode', productMode === 'beds');

        exportActions.classList.add('visible');



        if (typeof win.setLang === 'function') win.setLang(currentLang);



        pullFromIframe();

        triggerV1Update();



        setTimeout(() => {

            pullFromIframe();

            syncCanvas();

            syncPriceMirror();

            startPreviewLoop();

        }, 600);



        setTimeout(() => {

            pullFromIframe();

            syncPriceMirror();

        }, 1200);



        setTimeout(() => {

            pullFromIframe();

            refreshEamfEdgeSelects();

        }, 2500);

    }



    function startPreviewLoop() {

        setInterval(() => {

            if (!iframeReady) return;

            syncCanvas();

            syncPriceMirror();

        }, 500);

    }



    function callIframe(fnName) {

        const win = iframeWin();

        if (!win) return;

        triggerV1Update();

        setTimeout(() => {

            if (typeof win[fnName] === 'function') win[fnName]();

        }, 100);

    }



    function bindWizardInputs() {

        document.querySelectorAll('[data-iframe]').forEach((el) => {

            el.addEventListener('input', () => {

                if (el.type === 'range') syncSpacingLabels();

                pushToIframe(el);

            });

            el.addEventListener('change', () => {

                if (el.type === 'range') return;

                pushToIframe(el);

            });

        });



        document.querySelectorAll('.hw-chips').forEach((group) => {

            const radioName = group.getAttribute('data-radio');

            group.querySelectorAll('.hw-chip').forEach((chip) => {

                chip.addEventListener('click', () => {

                    group.querySelectorAll('.hw-chip').forEach((c) => c.classList.remove('active'));

                    chip.classList.add('active');

                    pushRadioToIframe(radioName, chip.getAttribute('data-value'));

                });

            });

        });

    }



    function applyTheme(theme) {

        const isFuture = theme === 'future';

        document.documentElement.classList.toggle('theme-future', isFuture);

        document.body.classList.toggle('theme-future', isFuture);

        const btn = document.getElementById('themeToggle');

        if (btn) btn.textContent = isFuture ? 'Classic' : 'Neon';

        try {

            localStorage.setItem(THEME_STORAGE_KEY, isFuture ? 'future' : 'classic');

        } catch (_) { /* ignore */ }

        updateHomeLink();

        syncCanvas();

    }



    function updateHomeLink() {

        const link = document.getElementById('homeLink');

        if (!link) return;

        const url = new URL('welcome.html', location.href);

        if (document.documentElement.classList.contains('theme-future')) {

            url.searchParams.set('theme', 'future');

        }

        link.href = url.pathname + url.search;

    }



    function restoreTheme() {

        try {

            const saved = localStorage.getItem(THEME_STORAGE_KEY);

            if (saved === 'future') return 'future';

        } catch (_) { /* ignore */ }

        return 'classic';

    }



    function toggleTheme() {

        const isFuture = document.documentElement.classList.contains('theme-future');

        applyTheme(isFuture ? 'classic' : 'future');

    }



    function bindUI() {

        document.getElementById('modeClosets').addEventListener('click', () => setProductMode('closets'));

        document.getElementById('modeBeds').addEventListener('click', () => setProductMode('beds'));



        document.getElementById('langRu').addEventListener('click', () => setLang('ru'));

        document.getElementById('langEn').addEventListener('click', () => setLang('en'));



        const themeBtn = document.getElementById('themeToggle');

        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        window.__gconfigToggleTheme = toggleTheme;



        document.getElementById('btnPrev').addEventListener('click', () => goToStep(currentStep - 1));

        document.getElementById('btnNext').addEventListener('click', () => {

            if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);

            else goToStep(1);

        });



        document.querySelectorAll('.stepper-item').forEach((item) => {

            item.addEventListener('click', () => goToStep(Number(item.dataset.step)));

        });



        document.getElementById('btnPdf').addEventListener('click', () => callIframe('generatePDF'));

        document.getElementById('btnExcel').addEventListener('click', () => callIframe('downloadTellimusExcel'));

        document.getElementById('btnOrder').addEventListener('click', () => callIframe('openSendModal'));



        iframe.addEventListener('load', onIframeLoad);

        bindWizardInputs();

    }



    function init() {

        appShell.classList.toggle('beds-mode', productMode === 'beds');

        document.getElementById('modeClosets').classList.toggle('active', productMode === 'closets');

        document.getElementById('modeBeds').classList.toggle('active', productMode === 'beds');

        updateV1Link();

        const themeParam = params.get('theme');

        if (themeParam === 'future' || themeParam === 'classic') {

            applyTheme(themeParam);

        } else {

            applyTheme(restoreTheme());

        }

        applyI18n();

        bindUI();

        loadIframe();

        goToStep(restoreStep());

    }



    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', init);

    } else {

        init();

    }

})();



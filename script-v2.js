/**

 * GConfig v2 — iframe bridge to v1 configurator.html

 * Preserves 100% v1 logic; wizard UI syncs fields and mirrors preview/price.

 */

(function () {

    'use strict';



    const params = new URLSearchParams(window.location.search);

    let productMode = params.get('type') === 'beds' ? 'beds' : 'closets';

    let currentStep = 1;

    const TOTAL_STEPS = 4;

    function getTotalSteps() {
        return productMode === 'beds' ? 2 : TOTAL_STEPS;
    }

    function getDisplayStepNumber(step) {
        if (productMode === 'beds') return step === 4 ? 2 : 1;
        return step;
    }

    function getNextStep(step) {
        if (productMode === 'beds') return step === 1 ? 4 : step;
        return step + 1;
    }

    function getPrevStep(step) {
        if (productMode === 'beds') return step === 4 ? 1 : step - 1;
        return step - 1;
    }

    function isLastStep(step) {
        return productMode === 'beds' ? step === 4 : step === TOTAL_STEPS;
    }

    function normalizeStep(step) {
        if (productMode === 'beds' && (step === 2 || step === 3)) {
            return step > currentStep ? 4 : 1;
        }
        return step;
    }

    const STEP_STORAGE_KEY = 'gconfig-v2-step';
    const THEME_STORAGE_KEY = 'gconfig-v2-theme';
    const LANG_STORAGE_KEY = 'gconfig-v2-lang';
    const V1_LANG_STORAGE_KEY = 'configurator_lang';

    function restoreLang() {
        try {
            const saved = localStorage.getItem(LANG_STORAGE_KEY) || localStorage.getItem(V1_LANG_STORAGE_KEY);
            if (saved === 'en' || saved === 'ru') return saved;
        } catch (_) { /* ignore */ }
        return 'en';
    }

    let currentLang = restoreLang();

    let iframeReady = false;

    let syncPaused = false;

    let previewLoopInterval = null;

    let bedsIframeReloadAttempts = 0;

    let previewSyncTimer = null;

    let model3dEnabled = false;

    let model3dDimsEnabled = true;

    function isMobile3D() {

        return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

    }

    function normalizeBedCarcassT(value) {

        const allowed = [16, 18, 19, 25, 28];

        const n = parseInt(value, 10);

        if (allowed.includes(n)) return n;

        let best = allowed[0];

        let bestDist = Infinity;

        for (const a of allowed) {

            const d = Math.abs(a - (Number.isFinite(n) ? n : best));

            if (d < bestDist) { bestDist = d; best = a; }

        }

        return best;

    }



    /** Fields that should redraw the schematic immediately while typing. */

    const DIMENSION_SYNC_IDS = new Set([

        'w1', 'h1', 'd1', 'upper_w', 'upper_h', 'upper_d',

    ]);



    const INSTANT_PREVIEW_IDS = new Set([

        'w1', 'h1', 'd1', 'upper_w', 'upper_h', 'upper_d',

        'ctFrontOverhang', 'ctSideOverhang',

        'facadeThick', 'carcassThick', 'wallType', 'hasCountertop',

        'upperShelvesH', 'upperShelvesV', 'vanityShelvesH', 'vanityShelvesV',

        'upperSpacingH', 'upperSpacingV', 'vanitySpacingH', 'vanitySpacingV',

        'bedPreset', 'bedMattressW', 'bedLength', 'bedFrameH', 'bedHeadboardH', 'bedFootboardH', 'bedBaseType'

    ]);



    const iframe = document.getElementById('v1Frame');

    const loadingOverlay = document.getElementById('loadingOverlay');

    const appShell = document.getElementById('appShell');

    const previewCanvas = document.getElementById('previewCanvas');

    const priceMirror = document.getElementById('priceMirror');

    const priceMirrorWrap = document.getElementById('priceMirrorWrap');

    const exportActions = document.getElementById('exportActions');

    const previewMeta = document.getElementById('previewMeta');



    // ── Drawer system database (manufacturer specs) ───────────────────────────
    // sideH    — side panel / inner box height, mm (what you see on the label)
    // sideThick — side panel thickness, mm
    // gap      — total lateral clearance consumed by runners + brackets, mm
    // sideColor — Three.js hex for the side panel material in 3D preview
    // runners  — available runner lengths, mm (largest that fits depth is chosen)
    const DRAWER_SYSTEMS = [
        // GTV AxisPro — aluminium, ALWAYS push-to-open, anthracite, 37mm bracket per side
        { id: 'axispro_86',  brand: 'GTV',    name: 'AxisPro H86',         pushToOpen: true, sideH: 86,  sideThick: 14, gap: 74, sideColor: 0x4b5563, runners: [250,300,350,400,450,500,550,600] },
        { id: 'axispro_115', brand: 'GTV',    name: 'AxisPro H115',        pushToOpen: true, sideH: 115, sideThick: 14, gap: 74, sideColor: 0x4b5563, runners: [250,300,350,400,450,500,550,600] },
        { id: 'axispro_150', brand: 'GTV',    name: 'AxisPro H150',        pushToOpen: true, sideH: 150, sideThick: 14, gap: 74, sideColor: 0x4b5563, runners: [250,300,350,400,450,500,550,600] },
        // Hafele MatrixBox — epoxy steel, 7mm clearance per side; available in regular + push-to-open
        { id: 'matrixbox_86',  brand: 'Hafele', name: 'MatrixBox S30 H86',  sideH: 86,  sideThick: 13, gap: 14, sideColor: 0x9ca3af, runners: [270,350,400,450,500,550] },
        { id: 'matrixbox_115', brand: 'Hafele', name: 'MatrixBox M40 H115', sideH: 115, sideThick: 13, gap: 14, sideColor: 0x9ca3af, runners: [270,350,400,450,500,550] },
        { id: 'matrixbox_150', brand: 'Hafele', name: 'MatrixBox L40 H150', sideH: 150, sideThick: 13, gap: 14, sideColor: 0x9ca3af, runners: [270,350,400,450,500,550] },
        { id: 'matrixbox_190', brand: 'Hafele', name: 'MatrixBox XL H190',  sideH: 190, sideThick: 13, gap: 14, sideColor: 0x9ca3af, runners: [270,350,400,450,500,550] },
    ];

    /**
     * Pick the tallest DRAWER_SYSTEMS entry for the given brand that fits
     * inside a single drawer slot.
     *   slotH = (cabinetInterior) / drawerCount
     *   Required clearance: 16mm chipboard bottom + 10mm top gap + 6mm facade gaps = 32mm
     * Returns null when nothing fits.
     */
    function getBestDrawerSpec(brand, cabinetH, drawerCount, carcassT) {
        const interior = (cabinetH || 500) - 2 * (carcassT || 16);
        const count    = Math.max(1, drawerCount || 1);
        const slotH    = Math.floor(interior / count);
        const maxSideH = slotH - 32;
        return DRAWER_SYSTEMS
            .filter(s => s.id.startsWith(brand) && s.sideH <= maxSideH)
            .sort((a, b) => b.sideH - a.sideH)[0] || null;
    }

    /** Per-drawer open types: index 0 = top drawer (as user sees). 'regular' | 'pto'. */
    let drawerTypesArr = [];

    /**
     * Returns an array of length `count` with per-drawer types.
     * AxisPro forces all to 'pto'. Unset slots default to 'regular'.
     */
    function getDrawerTypes(count) {
        const brand = document.getElementById('w-lowerDrawerSystem')?.value || 'axispro';
        const def   = brand === 'axispro' ? 'pto' : 'regular';
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(drawerTypesArr[i] !== undefined ? drawerTypesArr[i] : def);
        }
        return result;
    }

    /**
     * Renders per-drawer type rows into #drawerTypeRows.
     * Each row: "Drawer N  [Regular] [Push-to-open]"
     */
    function renderDrawerTypeRows(count) {
        const container = document.getElementById('drawerTypeRows');
        if (!container) return;
        const brand     = document.getElementById('w-lowerDrawerSystem')?.value || 'axispro';
        const isPtoOnly = brand === 'axispro';
        const types     = getDrawerTypes(count);
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'drawer-type-row';
            const lbl = document.createElement('span');
            lbl.className = 'drawer-type-label';
            lbl.textContent = `${t('drawer_label')} ${i + 1}`;
            const chips = document.createElement('div');
            chips.className = 'hw-chips' + (isPtoOnly ? ' section-disabled' : '');
            ['regular', 'pto'].forEach(val => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'hw-chip' + (types[i] === val ? ' active' : '');
                btn.dataset.value = val;
                btn.textContent = t(val === 'regular' ? 'drawer_regular' : 'drawer_pto');
                btn.addEventListener('click', () => {
                    if (isPtoOnly) return;
                    chips.querySelectorAll('.hw-chip').forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    drawerTypesArr[i] = val;
                    schedule3DRebuild();
                });
                chips.appendChild(btn);
            });
            row.appendChild(lbl);
            row.appendChild(chips);
            container.appendChild(row);
        }
    }

    /** Get the auto-selected spec (physical dimensions only — no pushToOpen). */
    function getSelectedDrawerSpec() {
        const brand    = document.getElementById('w-lowerDrawerSystem')?.value || 'axispro';
        const cabinetH = fieldNum('h1', 500);
        const count    = fieldNum('lowerDrawerCount', 1);
        const carcassT = fieldNum('carcassThick', 16);
        return getBestDrawerSpec(brand, cabinetH, count, carcassT) || DRAWER_SYSTEMS[0];
    }

    /** Update the auto-height info label shown next to the brand selector. */
    function updateDrawerAutoLabel() {
        const label = document.getElementById('drawerAutoHeightLabel');
        if (!label) return;
        const spec = (() => {
            const brand    = document.getElementById('w-lowerDrawerSystem')?.value || 'axispro';
            const cabinetH = fieldNum('h1', 500);
            const count    = fieldNum('lowerDrawerCount', 1);
            const carcassT = fieldNum('carcassThick', 16);
            return getBestDrawerSpec(brand, cabinetH, count, carcassT);
        })();
        if (!spec) {
            label.textContent = currentLang === 'ru'
                ? '⚠ Ящики не помещаются в шкаф'
                : '⚠ Drawers do not fit cabinet';
            label.dataset.state = 'warn';
        } else {
            label.textContent = `↳ ${spec.name}`;
            label.dataset.state = 'ok';
        }
    }

    /**
     * Called whenever drawer mode is active and dimensions/count change.
     * The <select> only holds brand (axispro/matrixbox) — height is auto.
     */
    function rebuildDrawerSystemSelect() {
        updateDrawerAutoLabel();
        const count = parseInt(document.getElementById('w-lowerDrawerCount')?.value) || 1;
        renderDrawerTypeRows(count);
        schedule3DRebuild();
    }
    // ─────────────────────────────────────────────────────────────────────────

    const SELECT_CLONE_IDS = [

        'facadeThick', 'carcassThick', 'wallType', 'countertopMaterial',

        'lowerDrawerCount',

        'eamfBackPanel', 'eamfFacadeMaterial', 'eamfFacadeEdge',

        'eamfCarcassMaterial', 'eamfCarcassEdge',

        'upperHingeBrand', 'upperHingeType', 'upperHingeCount',

        'lowerHingeBrand', 'lowerHingeType', 'lowerHingeCount',

        'bedPreset', 'bedBaseType'

    ];



    /** Fallback when iframe bed UI is not ready yet (sync with configurator.html defaults). */

    const BED_WIZARD_DEFAULTS = {

        bedPreset: 'double',

        bedMattressW: 1600,

        bedLength: 2000,

        bedFrameH: 420,

        bedHeadboardH: 900,

        bedFootboardH: 420,

        bedBaseType: 'slats',

    };



    const BED_IFRAME_FIELD_IDS = [

        'bedPreset', 'bedMattressW', 'bedLength', 'bedFrameH',

        'bedHeadboardH', 'bedFootboardH', 'bedBaseType',

        'facadeThick', 'carcassThick',

    ];



    const BED_PRESET_OPTIONS = [

        { value: 'single', en: 'Single (900×2000)', ru: 'Одинарная (900×2000)' },

        { value: 'onehalf', en: '1.5 (1200×2000)', ru: '1,5 (1200×2000)' },

        { value: 'double', en: 'Double (1600×2000)', ru: 'Двуспальная (1600×2000)' },

    ];



    const BED_BASE_OPTIONS = [

        { value: 'slats', en: 'Transverse strips (LDSP)', ru: 'Поперечные планки (ЛДСП)' },

        { value: 'sheet', en: 'Solid LDSP sheet', ru: 'Листовое ЛДСП' },

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

            to_v1: '← v1.0',

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

            drawer_brand: 'Бренд',

            drawer_label: 'Ящик',

            drawer_type: 'Тип открывания',

            drawer_regular: 'Обычный',

            drawer_pto: 'Push-to-open',

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

            open_v1_full: 'Открыть старый конфигуратор →',

            preview: 'Превью',

            preview_3d: '3D',

            toggle_3d_model: '3D модель',

            toggle_off: 'Выкл',

            toggle_on: 'Вкл',

            toggle_3d: '3D',

            toggle_3d_dims: 'Размеры',

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

            step_of: 'Шаг {n} из {total}',

            sm_title: 'Заказ проекта',

            sm_project: 'Название проекта',

            sm_email: 'Ваш email *',

            sm_phone: 'Телефон',

            sm_desc: 'Описание / комментарий',

            sm_hint: '📨 PDF со списком деталей будет отправлен в Telegram',

            sm_cancel: 'Отмена',

            sm_send: 'Отправить →',

            sm_email_invalid: 'Введите корректный email.',

            sm_not_ready: 'Конфигуратор ещё загружается.',

            sm_sending: '⏳ Отправка…',

            hint_drawer_sink: 'Ящики отключают мойку в нижнем шкафу (правило v1).',

            hint_drawer_preview: 'Каждый ящик — отдельная панель фасада в превью.',

            hint_lower_shelves_drawer: 'Полки недоступны в режиме ящиков.',

            hint_edge_override: 'Подбирается при смене материала; можно изменить вручную.',

            hint_spacing_upper_h: 'Расстояние между горизонтальными полками верхнего шкафа.',

            hint_spacing_upper_v: 'Расстояние между вертикальными перегородками верхнего шкафа.',

            hint_spacing_lower_h: 'Расстояние между горизонтальными полками нижнего шкафа.',

            hint_spacing_lower_v: 'Расстояние между вертикальными перегородками нижнего шкафа.'

        },

        en: {

            loading: 'Loading configurator…',

            to_home: 'Home',

            to_v1: '← v1.0',

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

            drawer_brand: 'Brand',

            drawer_label: 'Drawer',

            drawer_type: 'Opening type',

            drawer_regular: 'Regular',

            drawer_pto: 'Push-to-open',

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

            open_v1_full: 'Open old configurator →',

            preview: 'Preview',

            preview_3d: '3D',

            toggle_3d_model: '3D model',

            toggle_off: 'Off',

            toggle_on: 'On',

            toggle_3d: '3D',

            toggle_3d_dims: 'Dimensions',

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

            step_of: 'Step {n} of {total}',

            sm_title: 'Order Project',

            sm_project: 'Project Name',

            sm_email: 'Your email *',

            sm_phone: 'Phone',

            sm_desc: 'Description / comment',

            sm_hint: '📨 PDF with full parts list will be sent to Telegram',

            sm_cancel: 'Cancel',

            sm_send: 'Send →',

            sm_email_invalid: 'Please enter a valid email address.',

            sm_not_ready: 'Configurator is still loading.',

            sm_sending: '⏳ Sending…',

            hint_drawer_sink: 'Drawers disable sink in the lower cabinet (v1 rule).',

            hint_drawer_preview: 'Each drawer becomes a separate facade panel in the preview.',

            hint_lower_shelves_drawer: 'Lower shelves unavailable in drawer mode.',

            hint_edge_override: 'Auto-selected when material changes; you can override.',

            hint_spacing_upper_h: 'Distance between horizontal shelves in the upper cabinet.',

            hint_spacing_upper_v: 'Distance between vertical shelf dividers in the upper cabinet.',

            hint_spacing_lower_h: 'Distance between horizontal shelves in the lower cabinet.',

            hint_spacing_lower_v: 'Distance between vertical shelf dividers in the lower cabinet.'

        }

    };



    function t(key) {

        const dict = I18N[currentLang] || I18N.en;

        return dict[key] || I18N.en[key] || key;

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

        const bust = `_=${Date.now()}`;

        return productMode === 'beds'

            ? `configurator.html#mode=beds&${bust}`

            : `configurator.html?${bust}`;

    }



    function loadIframe() {

        iframeReady = false;

        loadingOverlay.classList.remove('hidden');

        iframe.src = iframeSrc();

    }



    function prepareIframeForDrawerMode() {

        const doc = iframeDoc();

        if (!doc) return;

        const sink = doc.getElementById('sinkType');

        if (sink && sink.value !== 'none') {

            sink.value = 'none';

            dispatchEl(sink);

        }

        const siphon = doc.getElementById('hasSiphon');

        if (siphon && siphon.checked) {

            siphon.checked = false;

            dispatchEl(siphon);

        }

    }



    function ensureLowerDrawerModeInIframe() {

        if (!iframeReady) return;

        if (getLowerHardwareMode() !== 'drawer') return;

        prepareIframeForDrawerMode();

        if (getIframeRadio('lowerHardwareMode') !== 'drawer') {

            setIframeRadio('lowerHardwareMode', 'drawer');

        }

    }



    function triggerV1UpdateNow(changedId) {

        ensureLowerDrawerModeInIframe();

        const win = iframeWin();

        if (!win) return;

        if (changedId && DIMENSION_SYNC_IDS.has(changedId) && typeof win.__gconfigSyncHingePositionsForDimensions === 'function') {

            win.__gconfigSyncHingePositionsForDimensions(changedId);

        }

        if (typeof win.updateConfigurator === 'function') {

            win.updateConfigurator();

        } else if (typeof win.scheduleUpdate === 'function') {

            win.scheduleUpdate();

        }

        flushPreviewNow();

    }



    function triggerV1Update() {

        ensureLowerDrawerModeInIframe();

        const win = iframeWin();

        if (!win) return;

        if (typeof win.scheduleUpdate === 'function') {

            win.scheduleUpdate();

        } else if (typeof win.updateConfigurator === 'function') {

            win.updateConfigurator();

        }

    }



    function flushPreviewNow() {

        if (productMode === 'beds' && !ensureBedPreviewDrawn()) {

            syncPriceMirror();

            schedule3DRebuild();

            return;

        }

        syncCanvas();

        syncPriceMirror();

        schedule3DRebuild();

    }



    function fieldByIframe(id) {

        return document.querySelector(`[data-iframe="${id}"]`);

    }



    function fieldNum(id, fallback = 0) {

        const el = fieldByIframe(id);

        if (!el) return fallback;

        if (el.type === 'checkbox') return el.checked ? 1 : 0;

        const v = parseFloat(el.value);

        return Number.isFinite(v) ? v : fallback;

    }



    function fieldStr(id) {

        const el = fieldByIframe(id);

        return el ? String(el.value || '') : '';

    }



    function fieldCheck(id) {

        const el = fieldByIframe(id);

        return el?.type === 'checkbox' ? !!el.checked : false;

    }



    let eamfCatalogCache = null;

    let eamfCatalogLoadPromise = null;



    function loadEamfCatalog() {

        if (eamfCatalogCache) return Promise.resolve(eamfCatalogCache);

        if (eamfCatalogLoadPromise) return eamfCatalogLoadPromise;

        eamfCatalogLoadPromise = fetch('assets/eamf-catalog.json')

            .then((r) => (r.ok ? r.json() : null))

            .then((data) => {

                eamfCatalogCache = data || { countertops: [] };

                return eamfCatalogCache;

            })

            .catch(() => {

                eamfCatalogCache = { countertops: [] };

                return eamfCatalogCache;

            });

        return eamfCatalogLoadPromise;

    }



    function getCountertopThicknessMm() {

        if (!fieldCheck('hasCountertop')) return 0;

        const win = iframeWin();

        if (win && typeof win.__gconfigGetCountertopThicknessMm === 'function') {

            const fromV1 = win.__gconfigGetCountertopThicknessMm();

            if (Number.isFinite(fromV1) && fromV1 > 0) return fromV1;

        }

        const article = fieldStr('countertopMaterial');

        if (window.GConfigCountertopThick && eamfCatalogCache) {

            const t = window.GConfigCountertopThick.getThicknessMmByArticle(eamfCatalogCache, article);

            if (Number.isFinite(t) && t > 0) return t;

        }

        return 0;

    }



    function collectHingeZoneSpec(zone, cabinetHeightMm) {

        const prefix = zone === 'upper' ? 'upper' : 'lower';

        const doc = iframeDoc();

        const readNum = (id, fallback) => {

            const el = fieldByIframe(id) || doc?.getElementById(id);

            const v = parseFloat(el?.value);

            return Number.isFinite(v) ? v : fallback;

        };

        const count = Math.max(2, Math.min(5, readNum(`${prefix}HingeCount`, 2)));

        const edgeDist = readNum(`${prefix}HingeEdgeDist`, 70);

        const position = getIframeRadio(`${prefix}HingePosition`) || (zone === 'upper' ? 'both' : 'left');

        const positions = [];

        for (let i = 1; i <= 5; i += 1) {

            const pos = readNum(`${prefix}HingePos${i}`, 0);

            if (pos > 0) positions.push(pos);

        }

        const suggest = (n, h) => {

            if (n <= 1) return [Math.max(100, Math.round(h / 2))];

            const top = 100;

            const bottom = Math.max(top + 50, h - 100);

            if (n === 2) return [top, bottom];

            const step = (bottom - top) / (n - 1);

            return Array.from({ length: n }, (_, i) => Math.round(top + step * i));

        };

        return {

            count,

            edgeDist,

            position,

            positions: positions.length ? positions : suggest(count, cabinetHeightMm),

        };

    }



    function collect3DParams() {

        const carcassT = fieldNum('carcassThick', 16);

        const facadeT = fieldNum('facadeThick', 16);

        const material = fieldStr('eamfCarcassMaterial');

        const edge = fieldStr('eamfCarcassEdge');

        const facadeMaterial = fieldStr('eamfFacadeMaterial') || material;

        const shared = {

            lang: currentLang,

            quality: isMobile3D() ? 'mobile' : 'desktop',

            dimensionsVisible: model3dDimsEnabled,

        };



        if (productMode === 'beds') {

            return {

                mode: 'beds',

                width: fieldNum('bedMattressW', 1600),

                length: fieldNum('bedLength', 2000),

                height: fieldNum('bedFrameH', 420),

                headboardH: fieldNum('bedHeadboardH', 900),

                footboardH: fieldNum('bedFootboardH', 420),

                facadeT,

                carcassT: normalizeBedCarcassT(carcassT),

                baseType: fieldStr('bedBaseType') || 'slats',

                material,

                edge,

                facadeMaterial,

                ...shared,

            };

        }



        const shelves = [

            {

                zone: 'upper',

                horizontal: fieldNum('upperShelvesH', 0),

                vertical: fieldNum('upperShelvesV', 0),

                spacingH: fieldNum('upperSpacingH', 100),

                spacingV: fieldNum('upperSpacingV', 200),

                w: fieldNum('upper_w', 800),

                h: fieldNum('upper_h', 400),

                d: fieldNum('upper_d', 350),

            },

            {

                zone: 'lower',

                horizontal: fieldNum('vanityShelvesH', 0),

                vertical: fieldNum('vanityShelvesV', 0),

                spacingH: fieldNum('vanitySpacingH', 100),

                spacingV: fieldNum('vanitySpacingV', 200),

                w: fieldNum('w1', 800),

                h: fieldNum('h1', 500),

                d: fieldNum('d1', 450),

            },

        ];



        return {

            mode: 'closets',

            width: fieldNum('w1', 800),

            height: fieldNum('h1', 500),

            depth: fieldNum('d1', 450),

            upperWidth: fieldNum('upper_w', 800),

            upperHeight: fieldNum('upper_h', 400),

            upperDepth: fieldNum('upper_d', 350),

            carcassT,

            facadeT,

            shelves,

            doors: {

                upper: getUpperHardwareMode(),

                lower: getLowerHardwareMode(),

            },

            hinges: {

                upper: collectHingeZoneSpec('upper', fieldNum('upper_h', 400)),

                lower: collectHingeZoneSpec('lower', fieldNum('h1', 500)),

            },

            drawers: {

                enabled: getLowerHardwareMode() === 'drawer',

                count: fieldNum('lowerDrawerCount', 1),

                spec: getSelectedDrawerSpec(),

                types: getDrawerTypes(fieldNum('lowerDrawerCount', 1)),

            },

            lowerSplitDoor: fieldCheck('lowerSplitFacade'),

            backWall: fieldCheck('useCarcassBackPanel') || !!fieldStr('eamfBackPanel'),

            countertop: (() => {
                const material = fieldStr('countertopMaterial');
                const enabled = fieldCheck('hasCountertop');
                const thickness = enabled ? getCountertopThicknessMm() : 0;
                return {
                    enabled: enabled && thickness > 0,
                    thickness,
                    frontOverhang: fieldNum('ctFrontOverhang', 20),
                    sideOverhang: fieldNum('ctSideOverhang', 2),
                    material,
                };
            })(),

            material,

            edge,

            facadeMaterial,

            ...shared,

        };

    }



    let threeRebuildTimer = null;



    function schedule3DRebuild() {

        if (!model3dEnabled || !iframeReady || !window.GConfig3D) return;

        if (threeRebuildTimer) clearTimeout(threeRebuildTimer);

        const debounceMs = isMobile3D() ? 180 : 100;

        threeRebuildTimer = setTimeout(() => {

            threeRebuildTimer = null;

            window.GConfig3D.scheduleRebuild(collect3DParams());

        }, debounceMs);

    }



    function setModel3dEnabled(enabled) {

        if (model3dEnabled === enabled) return;

        model3dEnabled = enabled;

        const workspace = document.querySelector('.workspace');

        const panel = document.getElementById('furniture3dPanel');

        updateSlideToggle('toggle3d', enabled ? 1 : 0);

        if (enabled) {

            workspace?.classList.add('has-3d');

            if (panel) {

                panel.hidden = false;

                panel.setAttribute('aria-hidden', 'false');

            }

            waitFor3DModule(() => init3DView());

            updateSlideToggle('toggle3dDims', model3dDimsEnabled ? 1 : 0);

        } else {

            workspace?.classList.remove('has-3d');

            const modal = document.getElementById('furniture-3d-modal');

            const host = document.getElementById('furniture-3d-modal-host');

            const panelEl = document.getElementById('furniture-3d');

            if (modal && !modal.hidden && host && panelEl) {

                while (host.firstChild) panelEl.appendChild(host.firstChild);

                modal.hidden = true;

            }

            window.GConfig3D?.dispose?.();

            if (panel) {

                panel.hidden = true;

                panel.setAttribute('aria-hidden', 'true');

            }

        }

    }



    function bind3DToggle() {

        bindSlideToggle('toggle3d', (btn) => {

            setModel3dEnabled(btn.getAttribute('data-3d') === 'on');

        });

    }



    function init3DView() {

        if (!document.getElementById('furniture-3d') || !window.GConfig3D) return;

        window.GConfig3D.init();

        window.GConfig3D.setOptions({

            quality: isMobile3D() ? 'mobile' : 'desktop',

            dimensionsVisible: model3dDimsEnabled,

            mobileExpanded: false,

        });

        schedule3DRebuild();

    }



    function bind3DDimensionsToggle() {

        bindSlideToggle('toggle3dDims', (btn) => {

            const enabled = btn.getAttribute('data-dims') === 'on';

            if (model3dDimsEnabled === enabled) return;

            model3dDimsEnabled = enabled;

            window.GConfig3D?.setDimensionsVisible?.(model3dDimsEnabled);

        });

    }



    function bind3DModal() {

        const btn = document.getElementById('btn3dExpand');

        const modal = document.getElementById('furniture-3d-modal');

        const host = document.getElementById('furniture-3d-modal-host');

        const panel = document.getElementById('furniture-3d');

        const closeBtn = document.getElementById('btn3dModalClose');

        const backdrop = document.getElementById('furniture3dModalBackdrop');

        if (!btn || !modal || !host || !panel) return;



        const move3dTo = (target) => {

            const source = target === host ? panel : host;

            while (source.firstChild) {

                target.appendChild(source.firstChild);

            }

        };



        const closeModal = () => {

            modal.hidden = true;

            move3dTo(panel);

            window.GConfig3D?.setMobileExpanded?.(false);

            if (window.GConfig3D?.resize) window.GConfig3D.resize();

        };



        btn.addEventListener('click', () => {

            modal.hidden = false;

            move3dTo(host);

            window.GConfig3D?.setMobileExpanded?.(true);

            if (window.GConfig3D?.resize) window.GConfig3D.resize();

        });



        closeBtn?.addEventListener('click', closeModal);

        backdrop?.addEventListener('click', closeModal);

    }



    function schedulePreviewAfterPaint() {

        requestAnimationFrame(() => {

            flushPreviewNow();

            requestAnimationFrame(flushPreviewNow);

        });

    }



    let _deferredTriggerTimer = null;

    function deferredTriggerV1Update() {

        if (_deferredTriggerTimer) clearTimeout(_deferredTriggerTimer);

        _deferredTriggerTimer = setTimeout(() => {

            _deferredTriggerTimer = null;

            if (syncPaused) {

                deferredTriggerV1Update();

                return;

            }

            triggerV1Update();

            schedulePreviewSync();

        }, 50);

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



    function setIframeValueQuiet(id, value) {

        const doc = iframeDoc();

        if (!doc) return;

        const el = doc.getElementById(id);

        if (!el) return;

        if (el.type === 'checkbox') el.checked = !!value;

        else el.value = value;

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



    function cloneSelectOptions(fromId, toSelect, options) {

        const opts = options || {};

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

        if (opts.preferSourceValue && src.value) {

            toSelect.value = src.value;

        } else if (prev && Array.from(toSelect.options).some((o) => o.value === prev)) {

            toSelect.value = prev;

        } else if (src.value) {

            toSelect.value = src.value;

        }

    }



    function refreshEamfEdgeSelects() {

        EAMF_EDGE_SELECT_IDS.forEach((id) => {

            const wEl = document.querySelector(`[data-iframe="${id}"]`);

            if (wEl && wEl.tagName === 'SELECT') {

                cloneSelectOptions(id, wEl, { preferSourceValue: true });

            }

        });

    }



    function refreshEamfBackPanelSelect() {

        const wEl = document.querySelector('[data-iframe="eamfBackPanel"]');

        if (wEl && wEl.tagName === 'SELECT') {

            cloneSelectOptions('eamfBackPanel', wEl, { preferSourceValue: true });

        }

    }



    function refreshDrawerSelects() {

        if (getLowerHardwareMode() !== 'drawer') return;

        // lowerDrawerSystem is now managed by rebuildDrawerSystemSelect(), not cloned from v1
        // lowerDrawerCount is still cloned from v1
        const wEl = document.querySelector('[data-iframe="lowerDrawerCount"]');
        if (wEl && wEl.tagName === 'SELECT') cloneSelectOptions('lowerDrawerCount', wEl);

        rebuildDrawerSystemSelect();

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



    function getHardwareModeFromChips(containerId, fallback) {

        const active = document.getElementById(containerId)?.querySelector('.hw-chip.active');

        return active?.getAttribute('data-value') || fallback;

    }



    function getLowerHardwareMode() {

        const fromChips = getHardwareModeFromChips('lowerHwChips', null);

        if (fromChips) return fromChips;

        return getIframeRadio('lowerHardwareMode') || 'hinge';

    }



    function getUpperHardwareMode() {

        const fromChips = getHardwareModeFromChips('upperHwChips', null);

        if (fromChips) return fromChips;

        return getIframeRadio('upperHardwareMode') || 'gas';

    }



    function updateConditionalUI() {

        const hasCountertop = document.getElementById('w-hasCountertop')?.checked;

        const countertopFields = document.getElementById('countertopFields');

        if (countertopFields) countertopFields.classList.toggle('hidden', !hasCountertop);



        const lowerMode = getLowerHardwareMode();

        const upperMode = getUpperHardwareMode();

        const drawerFields = document.getElementById('drawerFields');

        const lowerSplitWrap = document.getElementById('lowerSplitWrap');

        if (drawerFields) drawerFields.classList.toggle('visible', lowerMode === 'drawer');

        if (lowerSplitWrap) lowerSplitWrap.classList.toggle('hidden', lowerMode !== 'hinge');

        // Rebuild drawer system select + per-drawer type rows whenever mode or dimensions change
        if (lowerMode === 'drawer') rebuildDrawerSystemSelect();

        // ── Shelves ↔ Drawers mutex ──────────────────────────────────────────
        const isDrawer = lowerMode === 'drawer';
        document.querySelectorAll('.lower-shelf-field').forEach((el) => {
            el.classList.toggle('section-disabled', isDrawer);
        });
        document.getElementById('lowerShelvesDrawerHint')?.classList.toggle('hidden', !isDrawer);
        if (isDrawer) {
            const hEl = document.getElementById('w-vanityShelvesH');
            const vEl = document.getElementById('w-vanityShelvesV');
            if (hEl && hEl.value !== '0') {
                hEl.value = '0';
                hEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (vEl && vEl.value !== '0') {
                vEl.value = '0';
                vEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        // ─────────────────────────────────────────────────────────────────────



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



    function updateBedWizardSelectLabels() {

        const lang = currentLang === 'en' ? 'en' : 'ru';

        const presetEl = fieldByIframe('bedPreset');

        if (presetEl && presetEl.tagName === 'SELECT') {

            const prev = presetEl.value || BED_WIZARD_DEFAULTS.bedPreset;

            presetEl.innerHTML = '';

            BED_PRESET_OPTIONS.forEach(({ value, en, ru }) => {

                const opt = document.createElement('option');

                opt.value = value;

                opt.textContent = lang === 'en' ? en : ru;

                presetEl.appendChild(opt);

            });

            presetEl.value = prev;

        }

        const baseEl = fieldByIframe('bedBaseType');

        if (baseEl && baseEl.tagName === 'SELECT') {

            const prev = baseEl.value || BED_WIZARD_DEFAULTS.bedBaseType;

            baseEl.innerHTML = '';

            BED_BASE_OPTIONS.forEach(({ value, en, ru }) => {

                const opt = document.createElement('option');

                opt.value = value;

                opt.textContent = lang === 'en' ? en : ru;

                baseEl.appendChild(opt);

            });

            baseEl.value = prev;

        }

    }



    function ensureBedWizardSelectOptions() {

        const lang = currentLang === 'en' ? 'en' : 'ru';

        const presetEl = fieldByIframe('bedPreset');

        if (presetEl && presetEl.tagName === 'SELECT' && !presetEl.options.length) {

            BED_PRESET_OPTIONS.forEach(({ value, en, ru }) => {

                const opt = document.createElement('option');

                opt.value = value;

                opt.textContent = lang === 'en' ? en : ru;

                presetEl.appendChild(opt);

            });

            presetEl.value = BED_WIZARD_DEFAULTS.bedPreset;

        }

        const baseEl = fieldByIframe('bedBaseType');

        if (baseEl && baseEl.tagName === 'SELECT' && !baseEl.options.length) {

            BED_BASE_OPTIONS.forEach(({ value, en, ru }) => {

                const opt = document.createElement('option');

                opt.value = value;

                opt.textContent = lang === 'en' ? en : ru;

                baseEl.appendChild(opt);

            });

            baseEl.value = BED_WIZARD_DEFAULTS.bedBaseType;

        }

    }



    function applyBedWizardDefaults(force = false) {

        if (productMode !== 'beds') return;

        ensureBedWizardSelectOptions();

        Object.entries(BED_WIZARD_DEFAULTS).forEach(([id, defVal]) => {

            const el = fieldByIframe(id);

            if (!el) return;

            if (force || el.value === '' || el.value == null) {

                el.value = String(defVal);

            }

        });

    }



    function isIframeBedUiReady() {

        const doc = iframeDoc();

        return !!(doc && doc.getElementById('bedMattressW'));

    }



    /** Bed schematic canvas is 580px tall; closet schematic uses 500px. */

    function isIframeBedSchematicReady() {

        if (productMode !== 'beds') return true;

        const win = iframeWin();

        const doc = iframeDoc();

        if (!win || !doc) return false;

        if (win.__gconfigMode !== 'beds') return false;

        if (win.__gconfigBedsSchematicReady) return true;

        const src = doc.getElementById('schematicCanvas');

        return !!(src && src.height >= 550 && src.width >= 600);

    }



    function ensureBedPreviewDrawn() {

        if (productMode !== 'beds') return true;

        if (isIframeBedSchematicReady()) return true;

        if (!iframeReady) return false;

        if (isIframeBedUiReady()) {

            pushBedWizardToIframe();

        } else {

            redrawBedIframeSchematic();

        }

        return isIframeBedSchematicReady();

    }



    function pushBedWizardToIframe() {

        if (productMode !== 'beds' || !iframeReady) return false;

        if (!isIframeBedUiReady()) return false;

        applyBedWizardDefaults();

        syncPaused = true;

        BED_IFRAME_FIELD_IDS.forEach((id) => {

            const el = fieldByIframe(id);

            if (!el) return;

            const val = el.type === 'checkbox' ? el.checked : el.value;

            setIframeValueQuiet(id, val);

        });

        syncPaused = false;



        const win = iframeWin();

        if (win && typeof win.__gconfigRedrawBedsConfigurator === 'function') {

            win.__gconfigRedrawBedsConfigurator();

        } else if (win && typeof win.__gconfigSyncBedToCoreFields === 'function') {

            win.__gconfigSyncBedToCoreFields();

            if (typeof win.scheduleUpdate === 'function') win.scheduleUpdate();

            else if (typeof win.updateConfigurator === 'function') win.updateConfigurator();

        }

        return true;

    }



    function redrawBedIframeSchematic() {

        const win = iframeWin();

        if (!win) return;

        if (typeof win.__gconfigRedrawBedsConfigurator === 'function') {

            win.__gconfigRedrawBedsConfigurator();

            return;

        }

        if (typeof win.updateConfigurator === 'function') win.updateConfigurator();

        else if (typeof win.scheduleUpdate === 'function') win.scheduleUpdate();

    }



    function ensureIframeBedsDocument() {

        if (productMode !== 'beds') return true;

        const win = iframeWin();

        if (!win) return false;

        if (win.__gconfigMode === 'beds') return true;

        if (bedsIframeReloadAttempts < 2) {

            bedsIframeReloadAttempts += 1;

            loadIframe();

        }

        return false;

    }



    function refreshBedPreviewFromIframe(attempt = 0) {

        if (productMode !== 'beds') return;

        if (!ensureIframeBedsDocument()) {

            if (attempt < 40) {

                setTimeout(() => refreshBedPreviewFromIframe(attempt + 1), 200);

            }

            return;

        }

        applyBedWizardDefaults(true);



        if (!iframeReady) {

            if (attempt < 40) {

                setTimeout(() => refreshBedPreviewFromIframe(attempt + 1), 150);

            }

            return;

        }



        if (pushBedWizardToIframe() && isIframeBedSchematicReady()) {

            pullFromIframe();

            flushPreviewNow();

            return;

        }



        if (attempt < 40) {

            setTimeout(() => refreshBedPreviewFromIframe(attempt + 1), attempt < 10 ? 150 : 300);

        }

    }



    function scheduleBedWizardSync() {

        refreshBedPreviewFromIframe(0);

    }



    function onV1EngineReady(mode) {

        if (mode === 'beds' && productMode === 'beds') {

            applyBedWizardDefaults(true);

            pushBedWizardToIframe();

            redrawBedIframeSchematic();

            pullFromIframe();

            requestAnimationFrame(() => {

                flushPreviewNow();

                requestAnimationFrame(flushPreviewNow);

            });

            return;

        }

        if (productMode === 'closets' && mode !== 'beds') {

            pullFromIframe();

            triggerV1Update();

            flushPreviewNow();

        }

    }



    function pullFromIframe() {

        syncPaused = true;

        if (productMode === 'beds') ensureBedWizardSelectOptions();

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



        if (productMode === 'beds') applyBedWizardDefaults();



        syncHardwareChips('upperHardwareMode', 'upperHwChips');

        syncHardwareChips('lowerHardwareMode', 'lowerHwChips');

        syncHardwareChips('backPanelFitType', 'backFitChips');

        refreshEamfEdgeSelects();

        syncSpacingLabels();

        syncPaused = false;

        updateConditionalUI();

    }



    function pushToIframe(fromEl) {

        if (!iframeReady) return;

        const id = fromEl.getAttribute('data-iframe');

        if (!id) return;



        if (id === 'lowerDrawerCount' || id === 'lowerDrawerSystem') {

            ensureLowerDrawerModeInIframe();

            rebuildDrawerSystemSelect(); // refresh auto-height label + 3D

        }



        const handlerName = EAMF_IFRAME_HANDLERS[id];

        const instantPreview = INSTANT_PREVIEW_IDS.has(id) && !handlerName;



        if (fromEl.type === 'checkbox') {

            if (instantPreview) setIframeValueQuiet(id, fromEl.checked);

            else setIframeValue(id, fromEl.checked);

        } else if (handlerName) {

            setIframeValueQuiet(id, fromEl.value);

        } else if (instantPreview) {

            setIframeValueQuiet(id, fromEl.value);

        } else {

            setIframeValue(id, fromEl.value);

        }



        if (handlerName) {

            const win = iframeWin();

            if (win && typeof win[handlerName] === 'function') win[handlerName]();

            setTimeout(() => {

                refreshEamfEdgeSelects();

                if (id === 'eamfCarcassMaterial' || id === 'eamfFacadeMaterial' || id === 'eamfBackPanel') {

                    refreshEamfBackPanelSelect();

                }

                if (id === 'countertopMaterial' || id === 'hasCountertop') schedule3DRebuild();

            }, 0);

        }



        updateConditionalUI();

        if (syncPaused) {

            deferredTriggerV1Update();

            return;

        }



        if (instantPreview) {

            triggerV1UpdateNow(id);

            schedulePreviewAfterPaint();

            return;

        }



        triggerV1Update();

        schedulePreviewSync();

    }



    function pushRadioToIframe(name, value) {

        if (!iframeReady) return;

        if (name === 'lowerHardwareMode' && value === 'drawer') {

            prepareIframeForDrawerMode();

        }

        setIframeRadio(name, value);

        updateConditionalUI();

        if (syncPaused) {

            deferredTriggerV1Update();

            return;

        }

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

        if (productMode === 'beds') {

            const win = iframeWin();

            if (win && win.__gconfigMode !== 'beds') return;

            if (!isIframeBedSchematicReady()) {

                ensureBedPreviewDrawn();

                return;

            }

        }

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

                if (productMode === 'beds') {

                    recolorSchematicForNeon(ctx, previewCanvas.width, previewCanvas.height);

                    applyNeonSchematicSoftening(ctx, previewCanvas.width, previewCanvas.height);

                } else {

                    const hingeDots = collectHingeDotsFromIframe();

                    recolorSchematicForNeon(ctx, previewCanvas.width, previewCanvas.height);

                    applyNeonSchematicSoftening(ctx, previewCanvas.width, previewCanvas.height);

                    drawNeonParallelLiftOverlay(ctx);

                    drawNeonShelfSegmentsOverlay(ctx);

                    drawSoftNeonHingeDots(ctx, hingeDots);

                }

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

        if (previewSyncTimer) clearTimeout(previewSyncTimer);

        previewSyncTimer = setTimeout(() => {

            previewSyncTimer = null;

            flushPreviewNow();

        }, 80);

    }



    function updateV1Link() {

        const link = document.getElementById('openV1Link');

        if (link) {

            link.href = productMode === 'beds' ? 'beds.html' : 'configurator.html';

        }

        const wrap = document.getElementById('v1LinkWrap');

        if (wrap) wrap.hidden = !isLastStep(currentStep);

    }



    function setProductMode(mode) {

        if (mode === productMode) return;

        productMode = mode;

        bedsIframeReloadAttempts = 0;

        appShell.classList.toggle('beds-mode', mode === 'beds');

        document.getElementById('modeClosets').classList.toggle('active', mode === 'closets');

        document.getElementById('modeBeds').classList.toggle('active', mode === 'beds');

        const url = new URL(window.location.href);

        if (mode === 'beds') url.searchParams.set('type', 'beds');

        else url.searchParams.delete('type');

        window.history.replaceState({}, '', url);

        if (mode === 'beds' && (currentStep === 2 || currentStep === 3)) {
            goToStep(1);
        } else {
            updateNavLabels();
            updateV1Link();
        }

        applyBedWizardDefaults(true);

        loadIframe();

        schedule3DRebuild();

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

                if (n >= 1 && n <= TOTAL_STEPS) {
                    if (productMode === 'beds' && (n === 2 || n === 3)) return 1;
                    return n;
                }

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

        step = normalizeStep(step);

        currentStep = Math.max(1, Math.min(TOTAL_STEPS, step));

        persistStep(currentStep);

        document.querySelectorAll('.wizard-step').forEach((s) => {

            const isActive = Number(s.dataset.step) === currentStep;

            s.classList.toggle('active', isActive);

            if (isActive && currentStep !== prevStep) triggerStepEnter(s);

        });

        document.querySelectorAll('.stepper-item').forEach((item) => {

            const n = Number(item.dataset.step);

            if (productMode === 'beds' && (n === 2 || n === 3)) return;

            let isActive;
            let isDone;
            if (productMode === 'beds') {
                isActive = (n === 1 && currentStep === 1) || (n === 4 && currentStep === 4);
                isDone = n === 1 && currentStep === 4;
            } else {
                isActive = n === currentStep;
                isDone = n < currentStep;
            }

            item.classList.toggle('active', isActive);

            item.classList.toggle('done', isDone);

            if (isActive && currentStep !== prevStep) triggerStepEnter(item);

        });

        document.getElementById('btnPrev').disabled = currentStep === 1;

        const btnNext = document.getElementById('btnNext');

        btnNext.textContent = isLastStep(currentStep) ? t('finish') : t('next');

        exportActions.classList.toggle('visible', iframeReady);

        if (currentStep === 4) refreshEamfEdgeSelects();

        if (currentStep === 3) {

            refreshDrawerSelects();

            refreshEamfBackPanelSelect();

            ensureLowerDrawerModeInIframe();

            triggerV1Update();

        }

        updateConditionalUI();

        updateNavLabels();

        updateV1Link();

        schedulePreviewSync();

    }



    function updateStepperDots() {
        document.querySelectorAll('.stepper-item').forEach((item) => {
            const n = Number(item.dataset.step);
            const dot = item.querySelector('.stepper-dot');
            if (!dot) return;
            let display = String(n);
            if (productMode === 'beds' && n === 4) display = '2';
            dot.setAttribute('data-num', display);
            dot.textContent = display;
        });
    }

    function updateNavLabels() {

        const total = getTotalSteps();

        const displayN = getDisplayStepNumber(currentStep);

        const stepText = t('step_of')
            .replace('{n}', String(displayN))
            .replace('{total}', String(total));

        if (previewMeta) previewMeta.textContent = stepText;

        const progressLabel = document.getElementById('wizardProgressLabel');
        if (progressLabel) progressLabel.textContent = stepText;

        const progressFill = document.getElementById('wizardProgressFill');
        if (progressFill) progressFill.style.width = `${(displayN / total) * 100}%`;

        const progressTrack = document.querySelector('.wizard-progress-track');
        if (progressTrack) {
            progressTrack.setAttribute('aria-valuenow', String(displayN));
            progressTrack.setAttribute('aria-valuemax', String(total));
        }

        updateStepperDots();

        const mobileTitle = document.getElementById('mobileStepTitle');
        if (mobileTitle) {
            const stepKey = `step${currentStep}_title`;
            mobileTitle.textContent = t(stepKey);
        }

    }



    function setLang(lang) {

        currentLang = lang === 'en' ? 'en' : 'ru';

        try {
            localStorage.setItem(LANG_STORAGE_KEY, currentLang);
            localStorage.setItem(V1_LANG_STORAGE_KEY, currentLang);
        } catch (_) { /* ignore */ }

        updateSlideToggle('langToggle', currentLang === 'en' ? 1 : 0);

        applyI18n();

        if (productMode === 'beds') updateBedWizardSelectLabels();

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



        if (productMode === 'beds') {

            applyBedWizardDefaults(true);

            scheduleBedWizardSync();

        } else {

            pullFromIframe();

            triggerV1Update();

        }



        setTimeout(() => {

            if (productMode === 'beds') {

                pushBedWizardToIframe();

                if (!isIframeBedSchematicReady()) redrawBedIframeSchematic();

                pullFromIframe();

            } else {

                pullFromIframe();

                triggerV1Update();

            }

            syncCanvas();

            syncPriceMirror();

            schedule3DRebuild();

            startPreviewLoop();

            refreshEamfEdgeSelects();

            refreshEamfBackPanelSelect();

        }, 800);

    }



    function startPreviewLoop() {

        if (previewLoopInterval) clearInterval(previewLoopInterval);

        previewLoopInterval = setInterval(() => {

            if (!iframeReady) return;

            flushPreviewNow();

        }, 500);

    }



    function showV2Toast(msg, isError) {

        const toast = document.getElementById('v2-toast');

        if (!toast) return;

        toast.textContent = msg;

        toast.className = 'v2-toast show' + (isError ? ' error' : '');

        setTimeout(() => { toast.className = 'v2-toast'; }, 4000);

    }



    function openOrderModal() {

        const overlay = document.getElementById('v2-send-modal-overlay');

        if (!overlay) return;

        const projectInput = document.getElementById('w-project-name-input');

        const smProject = document.getElementById('v2-sm-project');

        if (projectInput && smProject && !smProject.value.trim()) smProject.value = projectInput.value.trim();

        overlay.hidden = false;

        smProject?.focus();

    }



    function closeOrderModal() {

        const overlay = document.getElementById('v2-send-modal-overlay');

        if (overlay) overlay.hidden = true;

    }



    function syncOrderFieldsToIframe(project, email, phone, desc) {

        const doc = iframeDoc();

        if (!doc) return false;

        const setField = (id, val) => {

            const el = doc.getElementById(id);

            if (el) el.value = val;

        };

        setField('sm-project', project);

        setField('sm-email', email);

        setField('sm-phone', phone);

        setField('sm-desc', desc);

        setField('project-name-input', project || 'Untitled');

        return true;

    }



    async function submitOrder() {

        const win = iframeWin();

        if (!win || typeof win.doSendProject !== 'function') {

            showV2Toast(t('sm_not_ready'), true);

            return;

        }



        const emailEl = document.getElementById('v2-sm-email');

        const projectEl = document.getElementById('v2-sm-project');

        const phoneEl = document.getElementById('v2-sm-phone');

        const descEl = document.getElementById('v2-sm-desc');

        if (!emailEl || !projectEl) return;



        const email = emailEl.value.trim();

        const project = projectEl.value.trim();

        const phone = phoneEl?.value.trim() || '';

        const desc = descEl?.value.trim() || '';



        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {

            emailEl.style.borderColor = '#e74c3c';

            emailEl.focus();

            showV2Toast(t('sm_email_invalid'), true);

            return;

        }

        emailEl.style.borderColor = '';



        if (!syncOrderFieldsToIframe(project, email, phone, desc)) {

            showV2Toast(t('sm_not_ready'), true);

            return;

        }



        const projectWizard = document.getElementById('w-project-name-input');

        if (projectWizard && project) projectWizard.value = project;



        const sendBtn = document.getElementById('v2-sm-send');

        const origSendText = sendBtn?.textContent || '';

        if (sendBtn) {

            sendBtn.disabled = true;

            sendBtn.textContent = t('sm_sending');

        }



        try {

            triggerV1Update();

            await win.doSendProject();



            await new Promise((resolve) => setTimeout(resolve, 150));

            const iframeToast = iframeDoc()?.getElementById('toast');

            if (iframeToast?.classList.contains('show')) {

                const isError = iframeToast.classList.contains('error');

                showV2Toast(iframeToast.textContent, isError);

                if (!isError) closeOrderModal();

            } else {

                closeOrderModal();

            }

        } finally {

            if (sendBtn) {

                sendBtn.disabled = false;

                sendBtn.textContent = origSendText;

            }

        }

    }



    function callIframe(fnName) {

        const win = iframeWin();

        if (!win) return;

        triggerV1Update();

        setTimeout(() => {

            if (typeof win[fnName] !== 'function') return;

            Promise.resolve(win[fnName]()).catch((err) => {

                console.error(`iframe ${fnName} failed:`, err);

                showV2Toast(currentLang === 'ru' ? 'Ошибка экспорта' : 'Export failed', true);

            });

        }, 100);

    }



    function bindWizardInputs() {

        document.querySelectorAll('[data-iframe]').forEach((el) => {

            el.addEventListener('input', () => {

                if (el.type === 'range') syncSpacingLabels();

                if (el.tagName === 'SELECT') return;

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

                    updateConditionalUI();

                });

            });

        });

    }



    function updateSlideToggle(id, activeIndex) {

        const toggle = document.getElementById(id);

        if (!toggle) return;

        toggle.dataset.active = String(activeIndex);

        toggle.querySelectorAll('.slide-toggle-btn').forEach((btn, i) => {

            const isActive = i === activeIndex;

            btn.classList.toggle('active', isActive);

            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

        });

    }



    function bindSlideToggle(id, onSelect) {

        const toggle = document.getElementById(id);

        if (!toggle) return;

        toggle.addEventListener('click', (e) => {

            const btn = e.target.closest('.slide-toggle-btn');

            if (!btn || btn.classList.contains('active')) return;

            const buttons = [...toggle.querySelectorAll('.slide-toggle-btn')];

            const activeIndex = buttons.indexOf(btn);

            onSelect(btn);

            if (activeIndex >= 0) updateSlideToggle(id, activeIndex);

        });

    }



    function applyTheme(theme) {

        const isFuture = theme === 'future';

        document.documentElement.classList.toggle('theme-future', isFuture);

        document.body.classList.toggle('theme-future', isFuture);

        updateSlideToggle('themeToggle', isFuture ? 0 : 1);

        try {

            localStorage.setItem(THEME_STORAGE_KEY, isFuture ? 'future' : 'classic');

        } catch (_) { /* ignore */ }

        updateHomeLink();

        syncCanvas();

        if (window.GConfig3D?.onThemeChange) window.GConfig3D.onThemeChange();

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

        return 'future';

    }



    function toggleTheme() {

        const isFuture = document.documentElement.classList.contains('theme-future');

        applyTheme(isFuture ? 'classic' : 'future');

    }



    function bindUI() {

        document.getElementById('modeClosets').addEventListener('click', () => setProductMode('closets'));

        document.getElementById('modeBeds').addEventListener('click', () => setProductMode('beds'));



        window.addEventListener('message', (ev) => {

            if (!iframe?.contentWindow || ev.source !== iframe.contentWindow) return;

            if (ev.data?.type !== 'gconfig-v1-ready') return;

            onV1EngineReady(ev.data.mode);

        });



        bindSlideToggle('langToggle', (btn) => setLang(btn.getAttribute('data-lang')));



        bindSlideToggle('themeToggle', (btn) => applyTheme(btn.getAttribute('data-theme')));

        window.__gconfigToggleTheme = toggleTheme;



        document.getElementById('btnPrev').addEventListener('click', () => goToStep(getPrevStep(currentStep)));

        document.getElementById('btnNext').addEventListener('click', () => {

            if (isLastStep(currentStep)) {
                exportActions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }

            goToStep(getNextStep(currentStep));

        });



        document.querySelectorAll('.stepper-item').forEach((item) => {

            item.addEventListener('click', () => goToStep(Number(item.dataset.step)));

        });



        bind3DModal();

        bind3DToggle();

        bind3DDimensionsToggle();

        let resize3dTimer = null;

        window.addEventListener('orientationchange', () => {

            if (!model3dEnabled) return;

            clearTimeout(resize3dTimer);

            resize3dTimer = setTimeout(() => {

                window.GConfig3D?.setOptions?.({ quality: isMobile3D() ? 'mobile' : 'desktop' });

                window.GConfig3D?.resize?.();

                schedule3DRebuild();

            }, 200);

        });



        document.getElementById('btnPdf').addEventListener('click', () => callIframe('generatePDF'));

        document.getElementById('btnExcel').addEventListener('click', () => callIframe('downloadTellimusExcel'));

        document.getElementById('btnOrder').addEventListener('click', openOrderModal);



        const orderOverlay = document.getElementById('v2-send-modal-overlay');

        if (orderOverlay) {

            orderOverlay.addEventListener('click', (e) => {

                if (e.target === orderOverlay) closeOrderModal();

            });

        }

        document.getElementById('v2SendModalClose')?.addEventListener('click', closeOrderModal);

        document.getElementById('v2SendModalCancel')?.addEventListener('click', closeOrderModal);

        document.getElementById('v2-sm-send')?.addEventListener('click', () => { submitOrder(); });



        iframe.addEventListener('load', onIframeLoad);

        bindWizardInputs();

    }



    function init() {

        appShell.classList.toggle('beds-mode', productMode === 'beds');

        document.getElementById('modeClosets').classList.toggle('active', productMode === 'closets');

        document.getElementById('modeBeds').classList.toggle('active', productMode === 'beds');

        const themeParam = params.get('theme');

        if (themeParam === 'classic') {

            applyTheme('classic');

        } else {

            applyTheme('future');

        }

        setLang(currentLang);

        if (productMode === 'beds') applyBedWizardDefaults(true);

        bindUI();

        loadEamfCatalog().then(() => {

            if (productMode === 'closets') schedule3DRebuild();

        });

        loadIframe();

        goToStep(restoreStep());

    }



    function waitFor3DModule(cb, attempts = 50) {

        if (window.GConfig3D) {

            cb();

            return;

        }

        if (attempts <= 0) return;

        setTimeout(() => waitFor3DModule(cb, attempts - 1), 60);

    }



    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', init);

    } else {

        init();

    }

})();



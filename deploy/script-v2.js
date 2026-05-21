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



    const I18N = {

        ru: {

            loading: 'Загрузка конфигуратора…',

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



    function cloneSelectOptions(fromId, toSelect) {

        const doc = iframeDoc();

        if (!doc || !toSelect) return;

        const src = doc.getElementById(fromId);

        if (!src) return;

        const prev = toSelect.value;

        toSelect.innerHTML = '';

        Array.from(src.options).forEach((opt) => {

            const o = document.createElement('option');

            o.value = opt.value;

            o.textContent = opt.textContent;

            o.disabled = opt.disabled;

            o.selected = opt.selected;

            toSelect.appendChild(o);

        });

        if (prev && Array.from(toSelect.options).some((o) => o.value === prev)) {

            toSelect.value = prev;

        } else if (src.value) {

            toSelect.value = src.value;

        }

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

        syncPaused = false;

        updateConditionalUI();

    }



    function pushToIframe(fromEl) {

        if (syncPaused || !iframeReady) return;

        const id = fromEl.getAttribute('data-iframe');

        if (!id) return;

        if (fromEl.type === 'checkbox') setIframeValue(id, fromEl.checked);

        else setIframeValue(id, fromEl.value);

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



    function goToStep(step) {

        currentStep = Math.max(1, Math.min(TOTAL_STEPS, step));

        persistStep(currentStep);

        document.querySelectorAll('.wizard-step').forEach((s) => {

            s.classList.toggle('active', Number(s.dataset.step) === currentStep);

        });

        document.querySelectorAll('.stepper-item').forEach((item) => {

            const n = Number(item.dataset.step);

            item.classList.toggle('active', n === currentStep);

            item.classList.toggle('done', n < currentStep);

        });

        document.getElementById('btnPrev').disabled = currentStep === 1;

        const btnNext = document.getElementById('btnNext');

        btnNext.textContent = currentStep === TOTAL_STEPS ? t('finish') : t('next');

        exportActions.classList.toggle('visible', iframeReady);

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

            el.addEventListener('input', () => pushToIframe(el));

            el.addEventListener('change', () => pushToIframe(el));

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



    function bindUI() {

        document.getElementById('modeClosets').addEventListener('click', () => setProductMode('closets'));

        document.getElementById('modeBeds').addEventListener('click', () => setProductMode('beds'));



        document.getElementById('langRu').addEventListener('click', () => setLang('ru'));

        document.getElementById('langEn').addEventListener('click', () => setLang('en'));



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



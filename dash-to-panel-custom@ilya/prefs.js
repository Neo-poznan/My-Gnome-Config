const { Gdk, Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {
}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.panel-margins');

    // Создаем Notebook (вкладки)
    const notebook = new Gtk.Notebook({
        margin_top: 10, 
        margin_bottom: 10,
        margin_start: 10,
        margin_end: 10,
    });

    // ============ Вкладка "Позиция" ============
    const positionPage = createPositionPage(settings);
    notebook.append_page(positionPage, new Gtk.Label({ label: 'Позиция' }));

    // ============ Вкладка "Внешний вид" ============
    const appearancePage = createAppearancePage(settings);
    notebook.append_page(appearancePage, new Gtk.Label({ label: 'Внешний вид' }));

    // ============ Вкладка "Виджеты" ============
    const widgetsPage = createWidgetsPage(settings);
    notebook.append_page(widgetsPage, new Gtk.Label({ label: 'Виджеты' }));

    return notebook;
}

/**
 * Создаёт страницу настроек позиционирования панели
 */
function createPositionPage(settings) {
    const page = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 20,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
    });

    // Заголовок
    const titleLabel = new Gtk.Label({
        label: '<b>Позиционирование панели</b>',
        use_markup: true,
        halign: Gtk.Align.START,
        margin_bottom: 10
    });
    page.append(titleLabel);

    // Позиция панели (верх/низ)
    page.append(createComboRow(
        settings,
        'Расположение панели',
        'Разместить панель сверху или снизу экрана',
        'panel-position',
        [['top', 'Сверху'], ['bottom', 'Снизу']]
    ));

    // Толщина панели
    page.append(createSpinRow(
        settings,
        'Толщина панели',
        'Высота панели в пикселях',
        'panel-thickness',
        20, 120
    ));

    // Длина панели
    page.append(createScaleRow(
        settings,
        'Длина панели',
        'Процент от ширины экрана',
        'panel-width',
        20, 100
    ));

    // Отступ сверху
    page.append(createSpinRow(
        settings,
        'Отступ сверху',
        'Отступ между краем экрана и панелью',
        'margin-top',
        0, 50
    ));

    // Отступ снизу
    page.append(createSpinRow(
        settings,
        'Отступ снизу',
        'Отступ между панелью и окнами',
        'margin-bottom',
        0, 50
    ));

    return page;
}

/**
 * Создаёт страницу настроек внешнего вида
 */
function createAppearancePage(settings) {
    const page = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 15,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
    });

    // Заголовок - Цвет
    const colorTitle = new Gtk.Label({
        label: '<b>Цвет панели</b>',
        use_markup: true,
        halign: Gtk.Align.START,
        margin_bottom: 10
    });
    page.append(colorTitle);

    // Выбор цвета
    page.append(createColorRow(settings, 'Цвет фона', 'Цвет фона панели', 'panel-color'));

    // Прозрачность
    page.append(createScaleRow(
        settings,
        'Прозрачность',
        'Непрозрачность панели (0 - полностью прозрачная)',
        'panel-alpha',
        0, 100
    ));

    // Скругление углов
    page.append(createSpinRow(
        settings,
        'Скругление углов',
        'Радиус скругления углов панели',
        'panel-border-radius',
        0, 50
    ));

    // Разделитель
    const separator1 = new Gtk.Separator({
        orientation: Gtk.Orientation.HORIZONTAL,
        margin_top: 15,
        margin_bottom: 15
    });
    page.append(separator1);

    // Заголовок - Иконки
    const iconsTitle = new Gtk.Label({
        label: '<b>Иконки и отступы</b>',
        use_markup: true,
        halign: Gtk.Align.START,
        margin_bottom: 10
    });
    page.append(iconsTitle);

    // Размер иконок
    page.append(createSpinRow(
        settings,
        'Размер иконок',
        'Размер иконок на панели задач',
        'icon-size',
        16, 64
    ));

    // Размер шрифта системного монитора
    page.append(createSpinRow(
        settings,
        'Размер шрифта монитора',
        'Размер шрифта виджета системного монитора',
        'sysmon-font-size',
        8, 18
    ));
    
    // Отступ слева
    page.append(createSpinRow(
        settings,
        'Отступ слева',
        'Отступ левой части панели от края',
        'left-box-padding',
        0, 50
    ));

    // Отступ справа
    page.append(createSpinRow(
        settings,
        'Отступ справа',
        'Отступ правой части панели от края',
        'right-box-padding',
        0, 50
    ));

    return page;
}

/**
 * Создаёт страницу настроек виджетов
 */
function createWidgetsPage(settings) {
    const scrolled = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true
    });

    const page = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 15,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
    });

    // Заголовок - Позиции и приоритеты
    const posTitle = new Gtk.Label({
        label: '<b>Расположение и порядок виджетов</b>',
        use_markup: true,
        halign: Gtk.Align.START,
        margin_bottom: 10
    });
    page.append(posTitle);

    // Описание
    const descLabel = new Gtk.Label({
        label: 'Выберите позицию и приоритет для каждого элемента панели.\nПриоритет определяет порядок внутри блока (меньше = раньше).',
        halign: Gtk.Align.START,
        margin_bottom: 15
    });
    descLabel.add_css_class('dim-label');
    page.append(descLabel);

    // Список виджетов с выбором позиции и приоритета
    const widgets = [
        { posKey: 'distro-icon-position', prioKey: 'distro-icon-priority', title: 'Иконка дистрибутива', subtitle: 'Декоративный логотип системы' },
        { posKey: 'activities-position', prioKey: 'activities-priority', title: 'Кнопка Обзор', subtitle: 'Открывает обзор рабочих столов' },
        { posKey: 'appmenu-position', prioKey: 'appmenu-priority', title: 'Меню приложения', subtitle: 'Название текущего окна' },
        { posKey: 'showapps-position', prioKey: 'showapps-priority', title: 'Кнопка приложений', subtitle: 'Открывает меню приложений' },
        { posKey: 'taskbar-position', prioKey: 'taskbar-priority', title: 'Панель задач', subtitle: 'Избранные и запущенные приложения' },
        { posKey: 'clock-position', prioKey: 'clock-priority', title: 'Часы', subtitle: 'Дата и время' },
        { posKey: 'systemmenu-position', prioKey: 'systemmenu-priority', title: 'Системное меню', subtitle: 'Быстрые настройки, звук, сеть' },
        { posKey: 'keyboard-position', prioKey: 'keyboard-priority', title: 'Раскладка клавиатуры', subtitle: 'Индикатор раскладки' },
        { posKey: 'sysmon-position', prioKey: 'sysmon-priority', title: 'Монитор системы', subtitle: 'Память, процессор, температура' },
        { posKey: 'media-player-position', prioKey: 'media-player-priority', title: 'Медиа-плеер', subtitle: 'Отображает текущую музыку/видео' },
        { posKey: 'thirdparty-position', prioKey: 'thirdparty-priority', title: 'Сторонние виджеты', subtitle: 'Виджеты от других расширений' },
    ];

    widgets.forEach(widget => {
        page.append(createWidgetRow(settings, widget.title, widget.subtitle, widget.posKey, widget.prioKey));
    });

    // Разделитель
    const separator = new Gtk.Separator({
        orientation: Gtk.Orientation.HORIZONTAL,
        margin_top: 15,
        margin_bottom: 15
    });
    page.append(separator);

    // Заголовок - Видимость
    const visTitle = new Gtk.Label({
        label: '<b>Видимость виджетов</b>',
        use_markup: true,
        halign: Gtk.Align.START,
        margin_bottom: 10
    });
    page.append(visTitle);

    // Описание
    const visDesc = new Gtk.Label({
        label: 'Скрыть ненужные элементы панели',
        halign: Gtk.Align.START,
        margin_bottom: 15
    });
    visDesc.add_css_class('dim-label');
    page.append(visDesc);

    // Чекбоксы для скрытия виджетов
    const hideWidgets = [
        { key: 'hide-distro-icon', title: 'Скрыть иконку дистрибутива' },
        { key: 'hide-activities', title: 'Скрыть кнопку Обзор' },
        { key: 'hide-appmenu', title: 'Скрыть меню приложения' },
        { key: 'hide-showapps', title: 'Скрыть кнопку приложений' },
        { key: 'hide-taskbar', title: 'Скрыть панель задач' },
        { key: 'hide-clock', title: 'Скрыть часы' },
        { key: 'hide-systemmenu', title: 'Скрыть системное меню' },
        { key: 'hide-keyboard', title: 'Скрыть раскладку клавиатуры' },
        { key: 'hide-sysmon', title: 'Скрыть монитор системы' },
        { key: 'hide-media-player', title: 'Скрыть медиа-плеер' },
        { key: 'hide-thirdparty', title: 'Скрыть сторонние виджеты' },
    ];

    hideWidgets.forEach(widget => {
        page.append(createSwitchRow(settings, widget.title, '', widget.key));
    });

    scrolled.set_child(page);
    return scrolled;
}

/**
 * Создаёт строку виджета с позицией и приоритетом
 */
function createWidgetRow(settings, title, subtitle, posKey, prioKey) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START,
        hexpand: true
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    labelBox.append(subtitleLabel);

    // ComboBox для позиции
    const positions = [
        ['left', 'Слева'],
        ['center', 'По центру'],
        ['right', 'Справа'],
    ];

    const comboBox = new Gtk.ComboBoxText({
        valign: Gtk.Align.CENTER
    });

    positions.forEach(([id, label]) => {
        comboBox.append(id, label);
    });

    comboBox.set_active_id(settings.get_string(posKey));

    comboBox.connect('changed', () => {
        const newValue = comboBox.get_active_id();
        if (newValue) {
            settings.set_string(posKey, newValue);
        }
    });

    // SpinButton для приоритета
    const prioLabel = new Gtk.Label({
        label: 'Приоритет:',
        valign: Gtk.Align.CENTER,
        margin_start: 10
    });

    const spinButton = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 10,
            step_increment: 1,
            page_increment: 1,
            value: settings.get_int(prioKey)
        }),
        valign: Gtk.Align.CENTER,
        width_chars: 3
    });

    settings.bind(prioKey, spinButton, 'value', Gio.SettingsBindFlags.DEFAULT);

    row.append(labelBox);
    row.append(comboBox);
    row.append(prioLabel);
    row.append(spinButton);

    return row;
}

/**
 * Создаёт строку с SpinButton
 */
function createSpinRow(settings, title, subtitle, key, min, max) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START,
        hexpand: true
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    if (subtitle) labelBox.append(subtitleLabel);

    const spinButton = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: 1,
            page_increment: 10,
            value: settings.get_int(key)
        }),
        valign: Gtk.Align.CENTER
    });

    settings.bind(key, spinButton, 'value', Gio.SettingsBindFlags.DEFAULT);

    row.append(labelBox);
    row.append(spinButton);

    return row;
}

/**
 * Создаёт строку с Switch
 */
function createSwitchRow(settings, title, subtitle, key) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    labelBox.append(titleLabel);

    if (subtitle) {
        const subtitleLabel = new Gtk.Label({
            label: subtitle,
            halign: Gtk.Align.START,
            hexpand: true
        });
        subtitleLabel.add_css_class('dim-label');
        labelBox.append(subtitleLabel);
    }

    const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER
    });

    settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    row.append(labelBox);
    row.append(toggle);

    return row;
}

/**
 * Создаёт строку с выбором позиции виджета (ComboBox)
 */
function createPositionRow(settings, title, subtitle, key) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START,
        hexpand: true
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    labelBox.append(subtitleLabel);

    // Создаём ComboBox с вариантами позиций
    const positions = [
        ['left', 'Слева'],
        ['center', 'По центру'],
        ['right', 'Справа'],
    ];

    const comboBox = new Gtk.ComboBoxText({
        valign: Gtk.Align.CENTER
    });

    positions.forEach(([id, label]) => {
        comboBox.append(id, label);
    });

    // Устанавливаем текущее значение
    const currentValue = settings.get_string(key);
    comboBox.set_active_id(currentValue);

    // Слушаем изменения
    comboBox.connect('changed', () => {
        const newValue = comboBox.get_active_id();
        if (newValue) {
            settings.set_string(key, newValue);
        }
    });

    row.append(labelBox);
    row.append(comboBox);

    return row;
}

/**
 * Создаёт строку с ComboBox для выбора значения
 */
function createComboRow(settings, title, subtitle, key, options) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START,
        hexpand: true
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    labelBox.append(subtitleLabel);

    const comboBox = new Gtk.ComboBoxText({
        valign: Gtk.Align.CENTER
    });

    options.forEach(([id, label]) => {
        comboBox.append(id, label);
    });

    const currentValue = settings.get_string(key);
    comboBox.set_active_id(currentValue);

    comboBox.connect('changed', () => {
        const newValue = comboBox.get_active_id();
        if (newValue) {
            settings.set_string(key, newValue);
        }
    });

    row.append(labelBox);
    row.append(comboBox);

    return row;
}

/**
 * Создаёт строку со слайдером (Scale)
 */
function createScaleRow(settings, title, subtitle, key, min, max) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: false,
        width_request: 200
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    labelBox.append(subtitleLabel);

    const scale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: 1,
            page_increment: 10,
            value: settings.get_int(key)
        }),
        hexpand: true,
        draw_value: true,
        value_pos: Gtk.PositionType.RIGHT,
        digits: 0
    });

    settings.bind(key, scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);

    row.append(labelBox);
    row.append(scale);

    return row;
}

/**
 * Создаёт строку с выбором цвета
 */
function createColorRow(settings, title, subtitle, key) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_bottom: 10
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });

    const titleLabel = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const subtitleLabel = new Gtk.Label({
        label: subtitle,
        halign: Gtk.Align.START,
        hexpand: true
    });
    subtitleLabel.add_css_class('dim-label');

    labelBox.append(titleLabel);
    labelBox.append(subtitleLabel);

    // Парсим текущий цвет
    const currentColor = settings.get_string(key);
    const rgba = new Gdk.RGBA();
    rgba.parse(currentColor);

    const colorButton = new Gtk.ColorButton({
        rgba: rgba,
        use_alpha: false,
        valign: Gtk.Align.CENTER
    });

    colorButton.connect('color-set', () => {
        const color = colorButton.get_rgba();
        const hex = '#' + 
            Math.round(color.red * 255).toString(16).padStart(2, '0') +
            Math.round(color.green * 255).toString(16).padStart(2, '0') +
            Math.round(color.blue * 255).toString(16).padStart(2, '0');
        settings.set_string(key, hex);
    });

    row.append(labelBox);
    row.append(colorButton);

    return row;
}

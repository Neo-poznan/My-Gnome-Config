# Custom Panel — расширение для GNOME Shell 43

Полная кастомизация панели GNOME: позиционирование, стилизация, управление виджетами.

## Возможности

- **Позиция панели**: верх или низ экрана
- **Геометрия**: настраиваемая высота, отступы, ширина в процентах
- **Внешний вид**: цвет, прозрачность, скругление углов
- **Виджеты**: настройка позиции (слева/центр/справа), приоритет, скрытие
- **Таскбар**: избранные + запущенные приложения с превью окон
- **Иконка дистрибутива**: декоративный логотип Debian
- **Поддержка сторонних расширений**: их виджеты переносятся на нашу панель

---

## Архитектура

```
dash-to-panel-custom@ilya/
├── extension.js          # Точка входа, создаёт PanelManager
├── panelManager.js       # Жизненный цикл панели, геометрия
├── panel.js              # Класс Panel (St.BoxLayout с leftBox/centerBox/rightBox)
├── taskbar.js            # Таскбар с иконками приложений
├── windowPreview.js      # Popup превью окон при наведении
├── systemIndicators.js   # Перенос виджетов с Main.panel
├── distroIcon.js         # Декоративная иконка дистрибутива
├── prefs.js              # UI настроек (Gtk4)
├── stylesheet.css        # Стили
├── debian-logo.png       # Логотип дистрибутива
├── metadata.json         # Метаданные расширения
└── schemas/
    └── org.gnome.shell.extensions.panel-margins.gschema.xml
```

---

## Подробное описание модулей

### extension.js

Точка входа. Экспортирует объект с методами `enable()` и `disable()`.

```javascript
function enable() {
    panelManager = new PanelManager();
    panelManager.enable();
}

function disable() {
    panelManager.disable();
    panelManager = null;
}
```

### panelManager.js

**Главный управляющий класс.** Координирует всё остальное.

#### Что делает:
1. Скрывает оригинальную панель (`Main.panel.visible = false`)
2. Скрывает Dash в Overview (чтобы не дублировать таскбар)
3. Создаёт кастомную `Panel`
4. Создаёт и подключает модули: `Taskbar`, `SystemIndicators`, `DistroIcon`
5. Рассчитывает и применяет геометрию панели
6. Обрабатывает смену режима сессии (скрывает панель на экране блокировки)
7. Слушает изменения конфигурации мониторов

#### Ключевые методы:

- `enable()` — инициализация всего
- `disable()` — очистка и восстановление оригинального состояния
- `_setupPanelPosition()` — размещает панель вверху или внизу
- `_applyGeometry()` — рассчитывает размеры и позицию
- `_calculateGeometry()` — формула расчёта:
  ```
  totalWidth = monitor.width * (panelWidthPercent / 100)
  totalHeight = thickness + marginTop + marginBottom
  x = marginLeft + (monitor.width - totalWidth) / 2
  ```
- `_onSessionModeChanged()` — скрывает панель при блокировке экрана

#### Особенности нижней панели:
Для позиции "bottom" создаётся отдельный `St.BoxLayout` и добавляется в `Main.layoutManager` через `addChrome()` с `affectsStruts: true`.

---

### panel.js

**Класс Panel** — сама визуальная панель.

```javascript
class Panel extends St.BoxLayout {
    this.leftBox = new St.BoxLayout();
    this.centerBox = new St.BoxLayout();
    this.rightBox = new St.BoxLayout();
}
```

#### Свойства:
- `panelHeight` — текущая высота (для привязки размера иконок)
- `leftBox`, `centerBox`, `rightBox` — контейнеры для виджетов

#### Методы:
- `updateStyle()` — применяет цвет, прозрачность, скругление углов
- `_rgbToHex(r, g, b)` — конвертация цвета для CSS

Цвет задаётся через `background-color` в inline-стиле с учётом альфа-канала.

---

### taskbar.js

**Таскбар с приложениями.**

#### Структура:
- `_showAppsButton` — кнопка "Показать приложения" (сетка точек)
- `_container` — контейнер с иконками приложений

#### Логика:
1. Получает избранные приложения из `AppFavorites.getAppFavorites()`
2. Получает запущенные приложения из `Shell.AppSystem.get_default()`
3. Создаёт кнопки для каждого приложения
4. Между избранными и запущенными добавляет разделитель

#### Кнопка приложения:
```javascript
const button = new St.Button({
    child: new St.Icon({ gicon: app.get_icon() }),
    style_class: 'taskbar-icon-button'
});
```

#### Индикаторы окон:
Под каждой иконкой — точки по количеству открытых окон (макс. 4).

#### Превью окон:
При наведении показывается `WindowPreviewPopup` с миниатюрами окон.

#### Контекстное меню:
Правый клик на кнопке — PopupMenu с действиями: "Новое окно", "Закрыть все окна", "Убрать из избранного".

#### Сигналы, которые слушает:
- `Shell.AppSystem.app-state-changed` — обновление при запуске/закрытии приложений
- `AppFavorites.changed` — изменение избранных
- `global.display.window-created` — создание окон
- `global.window_manager.destroy` — закрытие окон

---

### windowPreview.js

**Popup с превью окон приложения.**

#### Показ:
```javascript
_windowPreview.show(app, button);
```

#### Логика:
1. Получает все окна приложения через `app.get_windows()`
2. Для каждого окна создаёт миниатюру через `Clutter.Clone`
3. Рассчитывает масштаб с сохранением пропорций
4. Позиционирует popup относительно кнопки приложения

#### Контекстное меню превью:
Правый клик на миниатюре — "Закрыть окно".

#### Обновление:
Метод `refresh()` перестраивает popup при закрытии окна.

---

### systemIndicators.js

**Перенос виджетов со стандартной панели на нашу.**

#### Известные элементы (`_knownElements`):
```javascript
{
    'activities': { settingsKey: 'activities-position', hideKey: 'hide-activities', priorityKey: 'activities-priority' },
    'appMenu': { ... },
    'dateMenu': { ... },
    'quickSettings': { ... },  // или 'aggregateMenu' для GNOME < 43
    'keyboard': { ... },
}
```

#### Логика:
1. Перебирает все элементы `Main.panel.statusArea`
2. Сохраняет оригинальную информацию (родитель, позиция, индекс)
3. Удаляет из оригинального родителя
4. Добавляет в нужный box нашей панели

#### Приоритеты:
Элементы сортируются внутри каждого блока (left/center/right) по приоритету.

```javascript
byPosition[pos].sort((a, b) => a.priority - b.priority);
```

#### Сторонние виджеты:
- Используют общие настройки `thirdparty-position` и `thirdparty-priority`
- Метод `_watchStatusArea()` каждую секунду проверяет появление новых элементов

#### Восстановление:
При `disable()` все элементы возвращаются на оригинальные места.

---

### distroIcon.js

**Декоративная иконка дистрибутива.**

```javascript
class DistroIcon {
    this._container = new St.Bin({ reactive: false });
    this._icon = new St.Icon({ gicon: Gio.icon_new_for_string(path) });
}
```

#### Особенности:
- `reactive: false` — не реагирует на клики
- Размер = высота панели - 8px
- Настраиваемые позиция, приоритет, видимость

---

### prefs.js

**UI настроек на Gtk4.**

Использует `Gtk.Notebook` с тремя вкладками:
1. **Позиция** — геометрия панели, отступы
2. **Виджеты** — позиции, приоритеты, видимость виджетов
3. **Внешний вид** — цвет, прозрачность, скругление, размер иконок

#### Хелперы:
- `createSpinRow()` — строка с числовым полем
- `createSwitchRow()` — строка с переключателем
- `createComboRow()` — строка с выпадающим списком
- `createColorRow()` — строка с выбором цвета
- `createWidgetRow()` — строка виджета (позиция + приоритет)

---

### stylesheet.css

Стили для:
- `.panel-taskbar` — контейнер таскбара
- `.taskbar-icon-button` — кнопка приложения
- `.taskbar-separator` — разделитель между избранными и запущенными
- `.window-indicator-dot` — точки индикатора окон
- `.window-preview-popup` — popup превью

---

### schemas/org.gnome.shell.extensions.panel-margins.gschema.xml

Все настройки GSettings.

#### Геометрия:
- `panel-position` (string): 'top' | 'bottom'
- `panel-thickness` (int): высота панели
- `panel-width-percent` (int): ширина в процентах (1-100)
- `margin-top`, `margin-bottom`, `margin-left`, `margin-right` (int)
- `left-box-padding`, `right-box-padding` (int)

#### Внешний вид:
- `panel-color-r`, `panel-color-g`, `panel-color-b` (int): RGB компоненты цвета
- `panel-alpha` (int): прозрачность (0-100)
- `panel-border-radius` (int): скругление углов
- `icon-size` (int): размер иконок

#### Позиции виджетов (`*-position`):
- `activities-position`, `appmenu-position`, `showapps-position`, `taskbar-position`
- `clock-position`, `systemmenu-position`, `keyboard-position`
- `thirdparty-position`, `distro-icon-position`

#### Приоритеты виджетов (`*-priority`):
Аналогичные ключи с суффиксом `-priority` (int 1-10).

#### Скрытие виджетов (`hide-*`):
Boolean ключи для каждого виджета.

---

## Жизненный цикл

### Включение:
```
extension.js enable()
  └── PanelManager.enable()
        ├── скрыть Main.panel
        ├── скрыть Dash
        ├── создать Panel
        ├── Taskbar.enable(panel)
        ├── SystemIndicators.enable(panel)
        ├── DistroIcon.enable(panel)
        ├── применить геометрию
        └── подписаться на сигналы
```

### Отключение:
```
extension.js disable()
  └── PanelManager.disable()
        ├── отписаться от сигналов
        ├── SystemIndicators.disable()  // вернуть виджеты
        ├── DistroIcon.disable()
        ├── Taskbar.disable()
        ├── уничтожить Panel
        ├── показать Main.panel
        └── показать Dash
```

---

## Как добавить новый виджет

1. **Создать модуль** (например, `myWidget.js`):
   ```javascript
   var MyWidget = class MyWidget {
       enable(panel) { ... }
       disable() { ... }
   }
   ```

2. **Добавить ключи в схему**:
   ```xml
   <key name="mywidget-position" type="s"><default>'left'</default></key>
   <key name="mywidget-priority" type="i"><default>5</default></key>
   <key name="hide-mywidget" type="b"><default>false</default></key>
   ```

3. **Скомпилировать схему**:
   ```bash
   glib-compile-schemas schemas/
   ```

4. **Добавить в PanelManager**:
   ```javascript
   const { MyWidget } = Me.imports.myWidget;
   // в enable():
   this._myWidget = new MyWidget();
   this._myWidget.enable(this._panel);
   // в disable():
   this._myWidget.disable();
   ```

5. **Добавить в prefs.js** (массивы `widgets` и `hideWidgets`).

---

## Полезные команды

```bash
# Компиляция схемы
glib-compile-schemas schemas/

# Перезапуск GNOME Shell (X11)
Alt+F2 → r → Enter

# Перезапуск GNOME Shell (Wayland) — нужен релогин
# Или через D-Bus:
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restart")'

# Просмотр логов
journalctl -f -o cat /usr/bin/gnome-shell

# Открыть настройки расширения
gnome-extensions prefs dash-to-panel-custom@ilya
```

---

## Известные особенности

1. **GNOME 43+**: используется `quickSettings`, в более ранних версиях — `aggregateMenu`
2. **Wayland**: некоторые функции превью могут работать иначе
3. **Экран блокировки**: панель автоматически скрывается
4. **Смена мониторов**: геометрия пересчитывается автоматически

---

## Лицензия

MIT

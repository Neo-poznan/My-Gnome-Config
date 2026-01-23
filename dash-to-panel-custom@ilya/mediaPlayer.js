/**
 * MediaPlayer - показывает текущий медиа контент на панели
 */

const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

var MediaPlayer = class MediaPlayer {
    constructor() {
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.panel-margins');
        this._widget = null;
        this._updateId = null;
        this._settingsChangedId = null;
        
        // Элементы UI
        this._container = null;
        this._coverIcon = null;
        this._titleLabel = null;
        this._artistLabel = null;
        this._playPauseButton = null;
        this._currentPlayer = null;
    }
    
    /**
     * Геттер для виджета
     */
    get widget() {
        return this._widget;
    }
    
    /**
     * Создаёт виджет без добавления на панель
     * (позиционирование управляется через WidgetPositioner)
     */
    createWidget() {
        this._buildWidget();
        
        // Начинаем обновления
        this._startUpdates();
    }
    
    /**
     * @deprecated Используйте createWidget() + WidgetPositioner
     */
    enable(container) {
        // Проверяем настройку скрытия
        if (this._settings.get_boolean('hide-media-player')) {
            return;
        }
        
        this._container = container;
        this._buildWidget();
        
        // Добавляем в контейнер
        container.add_child(this._widget);
        
        // Слушаем изменения настроек
        this._settingsChangedId = this._settings.connect('changed', (settings, key) => {
            if (key === 'hide-media-player') {
                if (!settings.get_boolean('hide-media-player')) {
                    if (!this._widget) {
                        this.enable(container);
                    }
                } else {
                    this.disable();
                }
            }
        });
        
        // Начинаем обновления
        this._startUpdates();
    }
    
    disable() {
        this._stopUpdates();
        
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        if (this._widget && this._widget.get_parent()) {
            this._widget.get_parent().remove_child(this._widget);
        }
        
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
    }
    
    _buildWidget() {
        // Основной контейнер
        this._widget = new St.BoxLayout({
            vertical: false,
            style_class: 'media-player-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        // Обложка
        this._coverIcon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: 32,
            style_class: 'media-player-cover'
        });
        this._widget.add_child(this._coverIcon);
        
        // Кнопка play/pause
        this._playPauseButton = new St.Button({
            style_class: 'media-player-control-button',
            child: new St.Icon({
                icon_name: 'media-playback-start-symbolic',
                icon_size: 16
            })
        });

        this._widget.add_child(this._playPauseButton);
        // Контейнер для текста
        const textContainer = new St.BoxLayout({
            vertical: true,
            style_class: 'media-player-text'
        });
        this._widget.add_child(textContainer);
        
        // Название трека
        this._titleLabel = new St.Label({
            text: 'Нет медиа',
            style_class: 'media-player-title'
        });
        textContainer.add_child(this._titleLabel);
        
        // Исполнитель
        this._artistLabel = new St.Label({
            text: '',
            style_class: 'media-player-artist'
        });
        textContainer.add_child(this._artistLabel);
        
        
        // Подключаем обработчики
        this._playPauseButton.connect('clicked', () => {
            if (this._currentPlayer) {
                this._currentPlayer.playPause();
            }
        });
        
        // Изначально скрываем
        this._widget.visible = false;
    }
    
    _startUpdates() {
        // Обновляем каждые 3 секунды
        this._updateId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
            this._updateMediaInfo();
            return GLib.SOURCE_CONTINUE;
        });
        
        // Первое обновление сразу
        this._updateMediaInfo();
    }
    
    _stopUpdates() {
        if (this._updateId) {
            GLib.source_remove(this._updateId);
            this._updateId = null;
        }
    }
    
    _updateMediaInfo() {
        try {
            // Простой способ - проверяем календарное меню
            const dateMenu = Main.panel.statusArea.dateMenu;
            if (!dateMenu) {
                this._setNoMedia();
                return;
            }
            
            // Проверяем есть ли медиа-секция и активна ли она
            let hasActiveMedia = false;
            let mediaSection = null;
            
            // Пробуем разные способы найти медиа-секцию
            if (dateMenu._messageList && dateMenu._messageList._mediaSection) {
                mediaSection = dateMenu._messageList._mediaSection;
            } else if (dateMenu._calendar && dateMenu._calendar._messageList && dateMenu._calendar._messageList._mediaSection) {
                mediaSection = dateMenu._calendar._messageList._mediaSection;
            }
            
            if (mediaSection && mediaSection._players) {
                
                // Проверяем есть ли активные плееры
                let foundAnyPlayer = false;
                for (let player of mediaSection._players.values()) {
                    foundAnyPlayer = true;
                    
                    // Проверяем есть ли активная медиа информация
                    if (player.trackTitle && player.trackTitle !== 'Unknown title') {
                        this._showMediaInfoFromMpris(player);
                        this._currentPlayer = player;
                        hasActiveMedia = true;
                        break;
                    }
                    // Или если есть исполнители
                    else if (player.trackArtists && player.trackArtists.length > 0 && 
                             player.trackArtists[0] !== 'Unknown artist') {
                        this._showMediaInfoFromMpris(player);
                        this._currentPlayer = player;
                        hasActiveMedia = true;
                        break;
                    }
                    // Или если плеер играет/на паузе
                    else if (player.status && (player.status === 'Playing' || player.status === 'Paused')) {
                        this._showMediaInfoFromMpris(player);
                        this._currentPlayer = player;
                        hasActiveMedia = true;
                        break;
                    }
                }
                
                // Если нашли плееры но они не активны, покажем "ожидание" только если плееры могут воспроизводить
                if (foundAnyPlayer && !hasActiveMedia) {
                    this._widget.visible = true;
                    this._titleLabel.text = 'Медиа-плеер';
                    this._artistLabel.text = 'Ожидание...';
                    this._artistLabel.visible = true;
                    this._coverIcon.icon_name = 'audio-x-generic-symbolic';
                    this._playPauseButton.child.icon_name = 'media-playback-start-symbolic';
                    this._playPauseButton.reactive = false;
                    this._currentPlayer = null;
                    hasActiveMedia = true;
                }
            } else {
            }
            
            if (!hasActiveMedia) {
                this._setNoMedia();
            }
            
        } catch (e) {
            this._setNoMedia();
        }
    }
    
    _checkMPRISDirect() {
        try {
            // Упрощенная проверка - просто считаем что если нет в календаре, то нет медиа
            this._setNoMedia();
        } catch (e) {
            this._setNoMedia();
        }
    }
    
    _showMediaInfo(metadata, player) {
        // Название трека
        const title = metadata['xesam:title'] || 'Без названия';
        this._titleLabel.text = this._truncateText(title, 25);
        
        // Исполнитель
        let artist = '';
        if (metadata['xesam:artist']) {
            if (Array.isArray(metadata['xesam:artist'])) {
                artist = metadata['xesam:artist'][0] || '';
            } else {
                artist = metadata['xesam:artist'] || '';
            }
        }
        
        this._artistLabel.text = this._truncateText(artist, 20);
        this._artistLabel.visible = artist.length > 0;
        
        // Обложка
        if (metadata['mpris:artUrl']) {
            try {
                this._coverIcon.gicon = Gio.File.new_for_uri(metadata['mpris:artUrl']).icon;
            } catch (e) {
                this._coverIcon.icon_name = 'audio-x-generic-symbolic';
            }
        } else {
            // Разные иконки в зависимости от типа
            if (player.status === 'Playing') {
                this._coverIcon.icon_name = 'media-playback-start-symbolic';
            } else {
                this._coverIcon.icon_name = 'media-playback-pause-symbolic';
            }
        }
        
        this._widget.visible = true;
    }
    
    _showMediaInfoFromMpris(player) {
        // Получаем информацию напрямую из MprisPlayer
        const title = player.trackTitle || 'Без названия';
        this._titleLabel.text = this._truncateText(title, 25);
        
        // Исполнители
        let artist = '';
        if (player.trackArtists && player.trackArtists.length > 0) {
            artist = player.trackArtists.join(', ');
        }
        
        this._artistLabel.text = this._truncateText(artist, 20);
        this._artistLabel.visible = artist.length > 0;
        
        // Обложка/превью
        if (player.trackCoverUrl) {
            try {
                let file = Gio.File.new_for_uri(player.trackCoverUrl);
                this._coverIcon.gicon = new Gio.FileIcon({ file });
                this._coverIcon.icon_name = null; // Убираем иконку по умолчанию
                this._coverIcon.remove_style_class_name('fallback');
            } catch (e) {
                this._coverIcon.gicon = null;
                this._coverIcon.icon_name = 'audio-x-generic-symbolic';
                this._coverIcon.add_style_class_name('fallback');
            }
        } else {
            // Показываем иконку ноты если нет обложки
            this._coverIcon.gicon = null;
            this._coverIcon.icon_name = 'audio-x-generic-symbolic';
            this._coverIcon.add_style_class_name('fallback');
        }
        
        // Кнопка play/pause в зависимости от статуса
        if (player.status === 'Playing') {
            this._playPauseButton.child.icon_name = 'media-playback-pause-symbolic';
        } else {
            this._playPauseButton.child.icon_name = 'media-playback-start-symbolic';
        }
        
        // Активируем кнопку если плеер может воспроизводить
        this._playPauseButton.reactive = true;
        
        this._widget.visible = true;
    }
    
    _setNoMedia() {
        this._widget.visible = false;
        
        this._titleLabel.text = 'Нет медиа';
        this._artistLabel.text = '';
        this._artistLabel.visible = false;
        this._coverIcon.gicon = null;
        this._coverIcon.icon_name = 'audio-x-generic-symbolic';
        this._playPauseButton.child.icon_name = 'media-playback-start-symbolic';
        this._playPauseButton.reactive = false;
        this._currentPlayer = null;
        
    }
    
    _truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }
};
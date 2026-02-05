const { Gio, GObject, Shell, St, Clutter } = imports.gi;

const MPRIS_PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';

const DBusIface = `
<node>
  <interface name="org.freedesktop.DBus">
    <method name="ListNames">
      <arg type="as" direction="out" name="names"/>
    </method>
    <signal name="NameOwnerChanged">
      <arg type="s" direction="out" name="name"/>
      <arg type="s" direction="out" name="oldOwner"/>
      <arg type="s" direction="out" name="newOwner"/>
    </signal>
  </interface>
</node>`;

const MprisIface = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
  </interface>
</node>`;

const MprisPlayerIface = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="PlaybackStatus" type="s" access="read"/>
  </interface>
</node>`;

const DBusProxy = Gio.DBusProxy.makeProxyWrapper(DBusIface);
const MprisProxy = Gio.DBusProxy.makeProxyWrapper(MprisIface);
const MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MprisPlayerIface);

/**
 * Класс для работы с одним MPRIS плеером
 */
class MprisPlayerHandler {
    constructor(busName, onUpdate, onClosed) {
        this._busName = busName;
        this._onUpdate = onUpdate;
        this._onClosed = onClosed;
        
        this._trackArtists = [];
        this._trackTitle = '';
        this._trackCoverUrl = '';
        this._playbackStatus = 'Stopped';
        this._canPlay = false;
        
        this._mprisProxy = new MprisProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            this._onMprisProxyReady.bind(this)
        );
        
        this._playerProxy = new MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            this._onPlayerProxyReady.bind(this)
        );
    }
    
    get status() {
        return this._playbackStatus;
    }
    
    get trackArtists() {
        return this._trackArtists;
    }
    
    get trackTitle() {
        return this._trackTitle;
    }
    
    get trackCoverUrl() {
        return this._trackCoverUrl;
    }
    
    get canPlay() {
        return this._canPlay;
    }
    
    get isPlaying() {
        return this._playbackStatus === 'Playing';
    }
    
    playPause() {
        if (this._playerProxy) {
            this._playerProxy.PlayPauseAsync().catch(() => {});
        }
    }
    
    raise() {
        let app = null;
        if (this._mprisProxy && this._mprisProxy.DesktopEntry) {
            const desktopId = `${this._mprisProxy.DesktopEntry}.desktop`;
            app = Shell.AppSystem.get_default().lookup_app(desktopId);
        }
        
        if (app) {
            app.activate();
        } else if (this._mprisProxy && this._mprisProxy.CanRaise) {
            this._mprisProxy.RaiseAsync().catch(() => {});
        }
    }
    
    destroy() {
        if (this._mprisProxy) {
            this._mprisProxy.disconnectObject(this);
            this._mprisProxy = null;
        }
        if (this._playerProxy) {
            this._playerProxy.disconnectObject(this);
            this._playerProxy = null;
        }
    }
    
    _onMprisProxyReady() {
        this._mprisProxy.connectObject('notify::g-name-owner', () => {
            if (!this._mprisProxy.g_name_owner) {
                this._close();
            }
        }, this);
        
        if (!this._mprisProxy.g_name_owner) {
            this._close();
        }
    }
    
    _onPlayerProxyReady() {
        this._playerProxy.connectObject('g-properties-changed', () => {
            this._updateState();
        }, this);
        this._updateState();
    }
    
    _updateState() {
        if (!this._playerProxy) return;
        
        const metadata = {};
        if (this._playerProxy.Metadata) {
            for (let prop in this._playerProxy.Metadata) {
                metadata[prop] = this._playerProxy.Metadata[prop].deepUnpack();
            }
        }
        
        // Парсим исполнителей
        this._trackArtists = metadata['xesam:artist'];
        if (!Array.isArray(this._trackArtists) ||
            !this._trackArtists.every(artist => typeof artist === 'string')) {
            this._trackArtists = [];
        }
        
        // Парсим название
        this._trackTitle = metadata['xesam:title'];
        if (typeof this._trackTitle !== 'string') {
            this._trackTitle = '';
        }
        
        // Парсим обложку
        this._trackCoverUrl = metadata['mpris:artUrl'];
        if (typeof this._trackCoverUrl !== 'string') {
            this._trackCoverUrl = '';
        }
        
        this._playbackStatus = this._playerProxy.PlaybackStatus || 'Stopped';
        this._canPlay = this._playerProxy.CanPlay || false;
        
        if (this._onUpdate) {
            this._onUpdate();
        }
    }
    
    _close() {
        this.destroy();
        if (this._onClosed) {
            this._onClosed(this._busName);
        }
    }
}

/**
 * Виджет медиаплеера для панели
 */
var MediaPlayer = class MediaPlayer {
    constructor(config) {
        this._config = config.widgets.mediaPlayer || {};
        this._container = null;
        this._players = new Map();
        this._activePlayer = null;
        this._dbusProxy = null;
        
        this._coverIcon = null;
        this._playPauseButton = null;
        this._titleLabel = null;
        this._artistLabel = null;
    }
    
    get container() {
        return {
            container: this._container
        };
    }
    
    createWidget() {
        this._createContainer();
        this._createElements();
        this._initDbusProxy();
        this._updateVisibility();
    }
    
    _createContainer() {
        this._container = new St.BoxLayout({
            style_class: 'media-player-container',
            vertical: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        
        this._container.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1 && this._activePlayer) {
                this._activePlayer.raise();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }
    
    _createElements() {
        // Обложка
        this._coverIcon = new St.Icon({
            style_class: 'media-player-cover',
            icon_name: 'audio-x-generic-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._coverIcon);
        
        // Кнопка Play/Pause
        this._playPauseButton = new St.Button({
            style_class: 'media-player-play-button',
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            child: new St.Icon({
                icon_name: 'media-playback-start-symbolic',
                style_class: 'media-player-play-icon',
            }),
        });
        this._playPauseButton.connect('clicked', () => {
            if (this._activePlayer) {
                this._activePlayer.playPause();
            }
        });
        this._container.add_child(this._playPauseButton);
        
        // Контейнер для текста (название и исполнитель)
        const textBox = new St.BoxLayout({
            style_class: 'media-player-text-box',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: false,
        });
        
        this._titleLabel = new St.Label({
            style_class: 'media-player-title',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._titleLabel.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.END;
        textBox.add_child(this._titleLabel);
        
        this._artistLabel = new St.Label({
            style_class: 'media-player-artist',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._artistLabel.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.END;
        textBox.add_child(this._artistLabel);
        
        this._container.add_child(textBox);
    }
    
    _initDbusProxy() {
        this._dbusProxy = new DBusProxy(
            Gio.DBus.session,
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            this._onDbusProxyReady.bind(this)
        );
    }
    
    async _onDbusProxyReady() {
        try {
            const [names] = await this._dbusProxy.ListNamesAsync();
            names.forEach(name => {
                if (name.startsWith(MPRIS_PLAYER_PREFIX)) {
                    this._addPlayer(name);
                }
            });
        } catch (e) {
            // Игнорируем ошибки
        }
        
        this._dbusProxy.connectSignal('NameOwnerChanged', 
            this._onNameOwnerChanged.bind(this));
    }
    
    _onNameOwnerChanged(proxy, sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith(MPRIS_PLAYER_PREFIX)) return;
        
        if (newOwner && !oldOwner) {
            this._addPlayer(name);
        }
    }
    
    _addPlayer(busName) {
        if (this._players.has(busName)) return;
        
        const player = new MprisPlayerHandler(
            busName,
            () => this._onPlayerUpdate(),
            (name) => this._onPlayerClosed(name)
        );
        
        this._players.set(busName, player);
    }
    
    _onPlayerClosed(busName) {
        this._players.delete(busName);
        
        if (this._activePlayer && this._activePlayer._busName === busName) {
            this._activePlayer = null;
        }
        
        this._selectActivePlayer();
        this._updateUI();
        this._updateVisibility();
    }
    
    _onPlayerUpdate() {
        this._selectActivePlayer();
        this._updateUI();
        this._updateVisibility();
    }
    
    _selectActivePlayer() {
        // Приоритет: играющий плеер > первый доступный
        let playingPlayer = null;
        let firstAvailable = null;
        
        for (const [_, player] of this._players) {
            if (player.canPlay) {
                if (!firstAvailable) {
                    firstAvailable = player;
                }
                if (player.isPlaying) {
                    playingPlayer = player;
                    break;
                }
            }
        }
        
        this._activePlayer = playingPlayer || firstAvailable;
    }
    
    _updateUI() {
        if (!this._activePlayer) {
            this._titleLabel.text = '';
            this._artistLabel.text = '';
            this._coverIcon.gicon = null;
            this._coverIcon.icon_name = 'audio-x-generic-symbolic';
            this._playPauseButton.child.icon_name = 'media-playback-start-symbolic';
            return;
        }
        
        // Обновляем название
        this._titleLabel.text = this._activePlayer.trackTitle || '';
        
        // Обновляем исполнителя
        this._artistLabel.text = this._activePlayer.trackArtists.join(', ') || '';
        
        // Обновляем обложку
        if (this._activePlayer.trackCoverUrl) {
            const file = Gio.File.new_for_uri(this._activePlayer.trackCoverUrl);
            this._coverIcon.gicon = new Gio.FileIcon({ file });
            this._coverIcon.remove_style_class_name('fallback');
        } else {
            this._coverIcon.gicon = null;
            this._coverIcon.icon_name = 'audio-x-generic-symbolic';
            this._coverIcon.add_style_class_name('fallback');
        }
        
        // Обновляем кнопку play/pause
        const iconName = this._activePlayer.isPlaying
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._playPauseButton.child.icon_name = iconName;
    }
    
    _updateVisibility() {
        const hasActivePlayer = this._activePlayer && this._activePlayer.canPlay;
        this._container.visible = hasActivePlayer;
    }
    
    disable() {
        for (const [_, player] of this._players) {
            player.destroy();
        }
        this._players.clear();
        this._activePlayer = null;
        
        if (this._dbusProxy) {
            this._dbusProxy = null;
        }
        
        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
    }
};

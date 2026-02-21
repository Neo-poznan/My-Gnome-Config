/**
 * SystemMonitor - виджет системного мониторинга ресурсов
 * 
 * Отображает:
 * - Память (ОЗУ): использовано в ГБ и %
 * - Загруженность CPU: средняя по всем ядрам в %
 * - Температура CPU: в °C
 * - Температура GPU: в °C
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export class SystemMonitor {
    constructor() {
        this._container = null;
        this._memoryLabel = null;
        this._cpuLabel = null;
        this._cpuTempLabel = null;
        this._gpuTempLabel = null;
        this._updateTimeoutId = null;
        
        // Для расчёта загрузки CPU
        this._lastCpuTotal = 0;
        this._lastCpuIdle = 0;
    }
    
    /**
     * Геттер для данных виджета (используется WidgetsManager)
     */
    get widget() {
        return {
            actor: this._container
        };
    }
    
    /**
     * Создаёт виджет системного монитора
     */
    createWidget() {
        
        // Создаём контейнер
        this._container = new St.BoxLayout({
            style_class: 'system-monitor-container',
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,  // Делаем кликабельным
            can_focus: true,
            track_hover: true,
        });
        
        // Создаём лейблы для отображения информации
        this._memoryLabel = new St.Label({
            style_class: 'system-monitor-label memory-label',
            text: 'RAM: --',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._cpuLabel = new St.Label({
            style_class: 'system-monitor-label cpu-label',
            text: 'CPU: --%',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._cpuTempLabel = new St.Label({
            style_class: 'system-monitor-label cpu-temp-label',
            text: '--°C',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._gpuTempLabel = new St.Label({
            style_class: 'system-monitor-label gpu-temp-label',
            text: 'GPU: --°C',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        // Добавляем элементы с разделителями
        this._container.add_child(this._memoryLabel);
        this._container.add_child(this._createSeparator());
        this._container.add_child(this._cpuLabel);
        this._container.add_child(this._createSeparator());
        this._container.add_child(this._cpuTempLabel);
        this._container.add_child(this._createSeparator());
        this._container.add_child(this._gpuTempLabel);
        
        // Добавляем обработчик клика для запуска bottom
        this._container.connect('button-press-event', () => {
            this._openSystemMonitor();
            return Clutter.EVENT_STOP;
        });
        
        // Применяем размер шрифта
        this._updateFontSize();
        
        // Запускаем обновление данных каждые 2 секунды
        this._startUpdating();
    
    }
    
    /**
     * Отключает и удаляет монитор
     */
    disable() {
        // Останавливаем обновления
        if (this._updateTimeoutId) {
            GLib.Source.remove(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }
        
        if (this._container) {
            const parent = this._container.get_parent();
            if (parent) {
                parent.remove_child(this._container);
            }
            this._container.destroy();
            this._container = null;
        }
        
        this._memoryLabel = null;
        this._cpuLabel = null;
        this._cpuTempLabel = null;
        this._gpuTempLabel = null;
    }
    
    /**
     * Создаёт разделитель между элементами
     */
    _createSeparator() {
        return new St.Label({
            text: ' | ',
            style_class: 'system-monitor-separator',
            y_align: Clutter.ActorAlign.CENTER
        });
    }
    
    /**
     * Запускает регулярное обновление данных
     */
    _startUpdating() {
        // Первое обновление сразу
        this._updateSystemInfo();
        
        // Затем каждые 2 секунды
        this._updateTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            this._updateSystemInfo();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    /**
     * Обновляет информацию о системе
     */
    _updateSystemInfo() {
        try {
            this._updateMemoryInfo();
            this._updateCpuInfo();
            this._updateCpuTemp();
            this._updateGpuTemp();
        } catch (e) {
            console.log(`[SystemMonitor] Error updating info: ${e}`);
        }
    }
    
    /**
     * Обновляет информацию о памяти
     */
    _updateMemoryInfo() {
        try {
            const file = Gio.File.new_for_path('/proc/meminfo');
            const [success, contents] = file.load_contents(null);
            
            if (!success) return;
            
            const meminfo = new TextDecoder().decode(contents);
            const lines = meminfo.split('\n');
            
            let totalKB = 0;
            let availableKB = 0;
            
            for (const line of lines) {
                if (line.startsWith('MemTotal:')) {
                    totalKB = parseInt(line.match(/\d+/)[0]);
                } else if (line.startsWith('MemAvailable:')) {
                    availableKB = parseInt(line.match(/\d+/)[0]);
                }
            }
            
            if (totalKB > 0) {
                const usedKB = totalKB - availableKB;
                const usedGB = (usedKB / 1024 / 1024).toFixed(1);
                const totalGB = (totalKB / 1024 / 1024).toFixed(1);
                const usedPercent = Math.round((usedKB / totalKB) * 100);
                
                this._memoryLabel.set_text(`RAM: ${usedGB}/${totalGB}GB (${usedPercent}%)`);
            }
        } catch (e) {
            console.log(`[SystemMonitor] Memory info error: ${e}`);
            this._memoryLabel.set_text('RAM: Error');
        }
    }
    
    /**
     * Обновляет информацию о CPU
     */
    _updateCpuInfo() {
        try {
            const file = Gio.File.new_for_path('/proc/stat');
            const [success, contents] = file.load_contents(null);
            
            if (!success) return;
            
            const stat = new TextDecoder().decode(contents);
            const firstLine = stat.split('\n')[0];
            
            // cpu  user nice system idle iowait irq softirq steal guest guest_nice
            const values = firstLine.split(/\s+/).slice(1).map(v => parseInt(v));
            
            const idle = values[3] + values[4]; // idle + iowait
            const total = values.reduce((sum, val) => sum + val, 0);
            
            if (this._lastCpuTotal > 0) {
                const totalDiff = total - this._lastCpuTotal;
                const idleDiff = idle - this._lastCpuIdle;
                
                if (totalDiff > 0) {
                    const cpuUsage = Math.round(100 * (totalDiff - idleDiff) / totalDiff);
                    this._cpuLabel.set_text(`CPU: ${cpuUsage}%`);
                }
            }
            
            this._lastCpuTotal = total;
            this._lastCpuIdle = idle;
            
        } catch (e) {
            console.log(`[SystemMonitor] CPU info error: ${e}`);
            this._cpuLabel.set_text('CPU: Error');
        }
    }
    
    /**
     * Обновляет температуру CPU
     */
    _updateCpuTemp() {
        try {
            // Пробуем разные источники температуры
            const tempSources = [
                '/sys/class/thermal/thermal_zone0/temp',
                '/sys/class/thermal/thermal_zone1/temp',
                '/sys/devices/platform/coretemp.0/hwmon/hwmon1/temp1_input',
                '/sys/devices/platform/coretemp.0/hwmon/hwmon0/temp1_input'
            ];
            
            for (const source of tempSources) {
                try {
                    const file = Gio.File.new_for_path(source);
                    if (file.query_exists(null)) {
                        const [success, contents] = file.load_contents(null);
                        if (success) {
                            const tempStr = new TextDecoder().decode(contents).trim();
                            let temp = parseInt(tempStr);
                            
                            // Некоторые источники дают температуру в миллиградусах
                            if (temp > 1000) {
                                temp = Math.round(temp / 1000);
                            }
                            
                            if (temp > 0 && temp < 150) { // Разумные пределы
                                this._cpuTempLabel.set_text(`${temp}°C`);
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // Продолжаем поиск
                    continue;
                }
            }
            
            // Если не нашли температуру
            this._cpuTempLabel.set_text('--°C');
            
        } catch (e) {
            console.log(`[SystemMonitor] CPU temp error: ${e}`);
            this._cpuTempLabel.set_text('--°C');
        }
    }
    
    /**
     * Обновляет температуру GPU
     */
    _updateGpuTemp() {
        try {
            // Пробуем получить температуру через разные методы
            this._tryGetGpuTemp();
        } catch (e) {
            console.log(`[SystemMonitor] GPU temp error: ${e}`);
            this._gpuTempLabel.set_text('GPU: --°C');
        }
    }
    
    /**
     * Пытается получить температуру GPU разными способами
     */
    _tryGetGpuTemp() {
        // Пробуем NVIDIA GPU через nvidia-smi
        this._tryNvidiaTemp(() => {
            // Пробуем AMD GPU через hwmon
            this._tryAmdTemp(() => {
                // Не найдено
                this._gpuTempLabel.set_text('GPU: --°C');
            });
        });
    }
    
    /**
     * Пытается получить температуру NVIDIA GPU
     */
    _tryNvidiaTemp(fallback) {
        try {
            const proc = Gio.Subprocess.new(
                ['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            
            proc.communicate_utf8_async(null, null, (proc, result) => {
                try {
                    const [, stdout] = proc.communicate_utf8_finish(result);
                    const temp = parseInt(stdout.trim());
                    
                    if (!isNaN(temp) && temp > 0 && temp < 150) {
                        this._gpuTempLabel.set_text(`GPU: ${temp}°C`);
                    } else {
                        fallback();
                    }
                } catch (e) {
                    fallback();
                }
            });
        } catch (e) {
            fallback();
        }
    }
    
    /**
     * Пытается получить температуру AMD GPU
     */
    _tryAmdTemp(fallback) {
        try {
            // Ищем файлы hwmon для AMD GPU
            const hwmonDir = Gio.File.new_for_path('/sys/class/hwmon');
            
            if (!hwmonDir.query_exists(null)) {
                fallback();
                return;
            }
            
            const enumerator = hwmonDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let found = false;
            
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const hwmonPath = `/sys/class/hwmon/${name}`;
                
                try {
                    const nameFile = Gio.File.new_for_path(`${hwmonPath}/name`);
                    if (nameFile.query_exists(null)) {
                        const [success, contents] = nameFile.load_contents(null);
                        if (success) {
                            const deviceName = new TextDecoder().decode(contents).trim().toLowerCase();
                            
                            // Ищем AMD GPU устройства
                            if (deviceName.includes('amdgpu') || deviceName.includes('radeon')) {
                                // Пробуем temp1_input
                                const tempFile = Gio.File.new_for_path(`${hwmonPath}/temp1_input`);
                                if (tempFile.query_exists(null)) {
                                    const [tempSuccess, tempContents] = tempFile.load_contents(null);
                                    if (tempSuccess) {
                                        const temp = Math.round(parseInt(new TextDecoder().decode(tempContents).trim()) / 1000);
                                        if (temp > 0 && temp < 150) {
                                            this._gpuTempLabel.set_text(`GPU: ${temp}°C`);
                                            found = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!found) {
                fallback();
            }
            
        } catch (e) {
            fallback();
        }
    }
    
    /**
     * Обновляет размер шрифта виджета
     */
    _updateFontSize() {
        const fontSize = 16; // Жёстко задано для упрощения 
        const style = `font-size: ${fontSize}px;`;
        
        if (this._memoryLabel) this._memoryLabel.set_style(style);
        if (this._cpuLabel) this._cpuLabel.set_style(style);
        if (this._cpuTempLabel) this._cpuTempLabel.set_style(style);
        if (this._gpuTempLabel) this._gpuTempLabel.set_style(style);
    }
    
    /**
     * Открывает системный монитор (bottom/btm)
     */
    _openSystemMonitor() {
        // Получаем терминал из настроек GNOME
        let terminalExec = 'gnome-terminal';
        try {
            const terminalSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.default-applications.terminal',
            });
            terminalExec = terminalSettings.get_string('exec');
        } catch (e) {
            console.log('[SystemMonitor] Could not get terminal from settings, trying common terminals');
        }

        // Список терминалов для попытки (в порядке предпочтения)
        const terminals = [
            terminalExec,
            'kgx',           // GNOME Console
            'gnome-terminal',
            'konsole',
            'xfce4-terminal',
            'alacritty',
            'kitty',
            'tilix',
            'terminator',
            'xterm',
        ];

        // Список системных мониторов для попытки
        const monitors = ['btm', 'htop', 'top'];

        for (const terminal of terminals) {
            for (const monitor of monitors) {
                try {
                    // Определяем аргументы в зависимости от терминала
                    let args;
                    if (terminal.includes('konsole')) {
                        args = [terminal, '-e', monitor];
                    } else if (terminal.includes('alacritty') || terminal.includes('kitty')) {
                        args = [terminal, '-e', monitor];
                    } else if (terminal.includes('kgx')) {
                        args = [terminal, '--', monitor];
                    } else {
                        // Для большинства терминалов (gnome-terminal, xfce4-terminal, etc.)
                        args = [terminal, '--', monitor];
                    }

                    Gio.Subprocess.new(args, Gio.SubprocessFlags.NONE);
                    console.log(`[SystemMonitor] Opened ${monitor} in ${terminal}`);
                    return;
                } catch (e) {
                    // Пробуем следующую комбинацию
                    continue;
                }
            }
        }

        // Если ничего не сработало
        console.log('[SystemMonitor] Could not open any system monitor');
        this._showNotification('Системный монитор', 
            'Не удалось открыть системный монитор. Установите btm или htop.');
    }
    
    /**
     * Показывает системное уведомление
     */
    _showNotification(title, body) {
        try {
            const source = new MessageTray.Source({ title });
            Main.messageTray.add(source);
            const notification = new MessageTray.Notification({ source, title, body });
            source.addNotification(notification);
        } catch (e) {
            console.log(`[SystemMonitor] Notification error: ${e}`);
        }
    }
}
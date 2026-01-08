// ========== 1. КОНФИГУРАЦИЯ И КЭШ   2a070f22-2ec8-4581-89e5-8105fa0cea9e   ==========
const API_KEY = ' 2a070f22-2ec8-4581-89e5-8105fa0cea9e,, '; // 🔒 Замените на ваш ключ!
const API_URL = 'https://open.faceit.com/data/v4';
const CACHE_TTL = 600000; // 1 минута в миллисекундах

let matchStatusCache = new Map();
let isProcessing = false;
let processedPlayers = new Set();

// ========== СПИСОК ПОМЕЧЕННЫХ ИГРОКОВ ==========
let trackedPlayers = {};

// Загрузка сохраненных игроков из localStorage
function loadTrackedPlayers() {
    try {
        const saved = localStorage.getItem('faceit_tracked_players');
        if (saved) {
            trackedPlayers = JSON.parse(saved);
            console.log('[FACEIT Status] Загружены помеченные игроки:', Object.keys(trackedPlayers).length);
        }
    } catch (e) {
        console.error('[FACEIT Status] Ошибка загрузки помеченных игроков:', e);
        trackedPlayers = {};
    }
}

// Сохранение помеченных игроков в localStorage
function saveTrackedPlayers() {
    try {
        localStorage.setItem('faceit_tracked_players', JSON.stringify(trackedPlayers));
    } catch (e) {
        console.error('[FACEIT Status] Ошибка сохранения помеченных игроков:', e);
    }
}

// ========== 2. ОСНОВНАЯ ФУНКЦИЯ: ПОЛУЧЕНИЕ СТАТУСА МАТЧА ==========
async function fetchPlayerMatchStatus(nickname) {
    const cacheKey = nickname.toLowerCase();
    const cached = matchStatusCache.get(cacheKey);
    
    // Проверка кэша
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[FACEIT Status] Используем кэш для: ${nickname}`);
        return cached.data;
    }
    
    try {
        console.log(`[FACEIT Status] Запрашиваем API для: ${nickname}`);
        
        // 1. Получаем player_id по никнейму
        const playerResponse = await fetch(
            `https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            }
        );
        
        if (!playerResponse.ok) {
            throw new Error(`API ошибка: ${playerResponse.status} ${playerResponse.statusText}`);
        }
        
        const playerData = await playerResponse.json();
        
        if (!playerData.player_id) {
            throw new Error('Игрок не найден в API');
        }
        
        const playerId = playerData.player_id;
        
        // 2. Получаем последний матч игрока
        const matchResponse = await fetch(
            `https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&limit=1&offset=0`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${API_KEY}` }
            }
        );
        
        if (!matchResponse.ok) {
            throw new Error(`API ошибка истории: ${matchResponse.status}`);
        }
        
        const matchData = await matchResponse.json();
        
        const result = {
            playerId,
            nickname,
            lastMatch: matchData.items?.[0] || null,
            timestamp: Date.now()
        };
        
        // Сохраняем в кэш
        matchStatusCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        return result;
        
    } catch (error) {
        console.error(`[FACEIT Status] Ошибка для ${nickname}:`, error.message);
        return {
            playerId: null,
            nickname,
            lastMatch: null,
            error: error.message,
            timestamp: Date.now()
        };
    }
}

// ========== 3. АНАЛИЗ ВРЕМЕНИ ЗАВЕРШЕНИЯ МАТЧА ==========
function calculateTimeStatus(matchData) {
    if (!matchData?.lastMatch) {
        return { status: 'no_data', label: 'Нет данных', color: '#9e9e9e', emoji: '❓' };
    }
    
    const match = matchData.lastMatch;
    const now = Math.floor(Date.now() / 1000);
    const finishedAt = match.finished_at;
    const startedAt = match.started_at;
    const status = match.status ? match.status.toUpperCase() : '';
    
    // Проверяем статус матча
    if (status === 'ONGOING' || status === 'LIVE' || status === 'IN_PROGRESS') {
        const duration = now - startedAt;
        const minutes = Math.floor(duration / 60);
        return {
            status: 'in_progress',
            label: `В игре (${minutes} мин)`,
            color: '#ff5722',
            emoji: '🎮',
            details: `ID: ${match.match_id}`,
            finishedAt: finishedAt
        };
    }
    
    if (status === 'FINISHED' && finishedAt && finishedAt > 0) {
        const timeDiff = now - finishedAt;
        
        let label, color, emoji;
        
        if (timeDiff < 300) {
            label = 'Только что';
            color = '#f44336';
            emoji = '🔥';
        } else if (timeDiff < 3600) {
            const minutes = Math.floor(timeDiff / 60);
            label = `${minutes} мин назад`;
            color = '#ff9800';
            emoji = '⏱️';
        } else if (timeDiff < 86400) {
            const hours = Math.floor(timeDiff / 3600);
            label = `${hours} ч назад`;
            color = '#4caf50';
            emoji = '✅';
        } else {
            const days = Math.floor(timeDiff / 86400);
            label = `${days} д назад`;
            color = '#607d8b';
            emoji = '📅';
        }
        
        return {
            status: 'finished',
            label,
            color,
            emoji,
            details: `${new Date(finishedAt * 1000).toLocaleString('ru-RU')}`,
            finishedAt: finishedAt
        };
    }
    
    // Обработка других статусов
    if (status === 'CANCELLED' || status === 'ABORTED') {
        return {
            status: 'cancelled',
            label: 'Отменен',
            color: '#9e9e9e',
            emoji: '❌'
        };
    }
    
    if (status === 'UPCOMING' || status === 'SCHEDULED') {
        return {
            status: 'upcoming',
            label: 'Ожидается',
            color: '#2196f3',
            emoji: '⏳'
        };
    }
    
    return {
        status: 'unknown',
        label: 'Неизвестно',
        color: '#9e9e9e',
        emoji: '❓'
    };
}

// ========== 4. ДОБАВЛЕНИЕ КНОПКИ С СТАТУСОМ И КНОПКИ ДОБАВЛЕНИЯ В СПИСОК ==========
function addMatchStatusButton(playerContainer, nickname) {
    const buttonId = 'status_' + nickname.toLowerCase();
    
    if (processedPlayers.has(buttonId)) return;
    if (playerContainer.querySelector('.faceit-status-btn')) return;
    
    processedPlayers.add(buttonId);
    
    // Создаем контейнер для кнопок
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "faceit-buttons-container";
    buttonContainer.style.cssText = `
        display: inline-flex !important;
        gap: 5px !important;
        margin-left: 10px !important;
        vertical-align: middle !important;
    `;
    
    // Кнопка проверки статуса
    const statusButton = document.createElement("button");
    statusButton.className = "faceit-status-btn";
    statusButton.dataset.nickname = nickname;
    
    statusButton.style.cssText = `
        background: #9e9e9e !important;
        color: white !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 4px 8px !important;
        font-size: 11px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        min-width: 90px !important;
        text-align: center !important;
        transition: background 0.3s !important;
        flex-shrink: 0 !important;
    `;
    
    statusButton.innerHTML = '🔄 Проверить';
    statusButton.title = `Проверить статус матча для ${nickname}`;
    
    // Кнопка добавления в список
    const trackButton = document.createElement("button");
    trackButton.className = "faceit-track-btn";
    trackButton.dataset.nickname = nickname;
    
    trackButton.style.cssText = `
        background: #2196f3 !important;
        color: white !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 4px 8px !important;
        font-size: 11px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        min-width: 30px !important;
        text-align: center !important;
        transition: background 0.3s !important;
        flex-shrink: 0 !important;
    `;
    
    // Проверяем, добавлен ли уже игрок в список
    const isTracked = trackedPlayers[nickname.toLowerCase()];
    trackButton.innerHTML = isTracked ? '✓' : '+';
    trackButton.title = isTracked ? `Уже в списке (клик для удаления)` : `Добавить в список отслеживания`;
    trackButton.style.background = isTracked ? '#4caf50 !important' : '#2196f3 !important';
    
    // Обработчик для кнопки проверки статуса
    statusButton.addEventListener('click', async function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (statusButton.disabled) return;
        
        statusButton.disabled = true;
        statusButton.innerHTML = '⏳ Запрос...';
        statusButton.style.background = '#607d8b !important';
        
        try {
            const matchData = await fetchPlayerMatchStatus(nickname);
            const status = calculateTimeStatus(matchData);
            
            statusButton.innerHTML = `${status.emoji} ${status.label}`;
            statusButton.style.background = `${status.color} !important`;
            statusButton.title = `${nickname}: ${status.label}${status.details ? ` | ${status.details}` : ''}`;
            
        } catch (error) {
            statusButton.innerHTML = '❌ Ошибка';
            statusButton.style.background = '#d32f2f !important';
            statusButton.title = `Ошибка: ${error.message}`;
        } finally {
            setTimeout(() => {
                statusButton.disabled = false;
            }, 10000);
        }
    });
    
    // Обработчик для кнопки добавления в список
    trackButton.addEventListener('click', async function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        const nicknameKey = nickname.toLowerCase();
        const isCurrentlyTracked = trackedPlayers[nicknameKey];
        
        if (isCurrentlyTracked) {
            // Удаляем из списка
            delete trackedPlayers[nicknameKey];
            trackButton.innerHTML = '+';
            trackButton.title = `Добавить в список отслеживания`;
            trackButton.style.background = '#2196f3 !important';
            showNotification(`${nickname} удален из списка`, 'info');
        } else {
            // Добавляем в список и получаем статус
            trackButton.disabled = true;
            trackButton.innerHTML = '⏳';
            trackButton.style.background = '#607d8b !important';
            
            try {
                const matchData = await fetchPlayerMatchStatus(nickname);
                const status = calculateTimeStatus(matchData);
                
                trackedPlayers[nicknameKey] = {
                    nickname: nickname,
                    addedAt: Date.now(),
                    lastCheck: Date.now(),
                    lastStatus: status,
                    finishedAt: status.finishedAt || null
                };
                
                trackButton.innerHTML = '✓';
                trackButton.title = `Уже в списке (клик для удаления)`;
                trackButton.style.background = '#4caf50 !important';
                showNotification(`${nickname} добавлен в список отслеживания`, 'success');
                
            } catch (error) {
                trackButton.innerHTML = '❌';
                trackButton.title = `Ошибка: ${error.message}`;
                trackButton.style.background = '#d32f2f !important';
                showNotification(`Ошибка при добавлении ${nickname}`, 'error');
                setTimeout(() => {
                    trackButton.innerHTML = '+';
                    trackButton.title = `Добавить в список отслеживания`;
                    trackButton.style.background = '#2196f3 !important';
                }, 2000);
            } finally {
                trackButton.disabled = false;
            }
        }
        
        saveTrackedPlayers();
        updateTrackedPlayersPanel();
    });
    
    // Добавляем кнопки в контейнер
    buttonContainer.appendChild(statusButton);
    buttonContainer.appendChild(trackButton);
    
    // Добавляем контейнер к игроку
    const nicknameElement = playerContainer.querySelector(`
        div[class*="Nickname"],
        div[class*="nickname"],
        div.Text-sc-1ldgose
    `);
    
    if (nicknameElement?.parentElement) {
        nicknameElement.parentElement.appendChild(buttonContainer);
    } else {
        playerContainer.appendChild(buttonContainer);
    }
    
    console.log(`[FACEIT Status] Кнопки добавлены: ${nickname}`);
}

// ========== 5. ПАНЕЛЬ ОТСЛЕЖИВАЕМЫХ ИГРОКОВ ==========
function createTrackedPlayersPanel() {
    // Удаляем старую панель если есть
    const oldPanel = document.getElementById('faceit-tracked-panel');
    if (oldPanel) oldPanel.remove();
    
    const panel = document.createElement("div");
    panel.id = 'faceit-tracked-panel';
    panel.style.cssText = `
        position: fixed !important;
        top: 100px !important;
        right: 20px !important;
        width: 300px !important;
        background: #1f1f1f !important;
        border: 1px solid #444 !important;
        border-radius: 8px !important;
        z-index: 9999 !important;
        font-family: Arial, sans-serif !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        color: white !important;
        max-height: 500px !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
    `;
    
    panel.innerHTML = `
        <div style="
            background: #2196f3 !important;
            padding: 12px 15px !important;
            font-weight: bold !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-bottom: 1px solid #444 !important;
        ">
            <span>📋 Отслеживаемые игроки</span>
            <span id="tracked-count" style="
                background: rgba(255,255,255,0.2) !important;
                padding: 2px 8px !important;
                border-radius: 10px !important;
                font-size: 12px !important;
            ">0</span>
        </div>
        <div style="
            flex-grow: 1 !important;
            overflow-y: auto !important;
            padding: 10px !important;
            max-height: 400px !important;
        " id="tracked-players-list">
            <div style="
                text-align: center !important;
                padding: 20px !important;
                color: #888 !important;
                font-size: 14px !important;
            ">
                Список пуст. Нажмите "+" рядом с игроком чтобы добавить.
            </div>
        </div>
        <div style="
            padding: 10px !important;
            border-top: 1px solid #444 !important;
            display: flex !important;
            justify-content: space-between !important;
            background: #2a2a2a !important;
        ">
            <button id="refresh-tracked-btn" style="
                background: #4caf50 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 6px 12px !important;
                font-size: 12px !important;
                cursor: pointer !important;
                flex: 1 !important;
                margin-right: 5px !important;
            ">🔄 Обновить всех</button>
            <button id="clear-tracked-btn" style="
                background: #f44336 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 6px 12px !important;
                font-size: 12px !important;
                cursor: pointer !important;
                flex: 1 !important;
                margin-left: 5px !important;
            ">🗑️ Очистить</button>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Обработчики для кнопок панели
    document.getElementById('refresh-tracked-btn').addEventListener('click', async () => {
        await refreshAllTrackedPlayers();
    });
    
    document.getElementById('clear-tracked-btn').addEventListener('click', () => {
        if (confirm('Удалить всех отслеживаемых игроков?')) {
            trackedPlayers = {};
            saveTrackedPlayers();
            updateTrackedPlayersPanel();
            showNotification('Список очищен', 'info');
        }
    });
    
    // Добавляем возможность перетаскивания
    makePanelDraggable(panel);
}

function makePanelDraggable(panel) {
    const header = panel.querySelector('div:first-child');
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    header.style.cursor = 'move';
    
    header.addEventListener('mousedown', startDrag);
    
    function startDrag(e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(panel.style.right) || 20;
        startTop = parseInt(panel.style.top) || 100;
        
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        e.preventDefault();
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        const dx = startX - e.clientX;
        const dy = e.clientY - startY;
        
        panel.style.right = (startLeft + dx) + 'px';
        panel.style.top = (startTop + dy) + 'px';
    }
    
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }
}

async function refreshAllTrackedPlayers() {
    const refreshBtn = document.getElementById('refresh-tracked-btn');
    const originalText = refreshBtn.textContent;
    
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Обновление...';
    refreshBtn.style.background = '#607d8b !important';
    
    for (const [key, player] of Object.entries(trackedPlayers)) {
        try {
            const matchData = await fetchPlayerMatchStatus(player.nickname);
            const status = calculateTimeStatus(matchData);
            
            trackedPlayers[key] = {
                ...player,
                lastCheck: Date.now(),
                lastStatus: status,
                finishedAt: status.finishedAt || null
            };
            
            console.log(`[FACEIT Status] Обновлен: ${player.nickname}`);
        } catch (error) {
            console.error(`[FACEIT Status] Ошибка обновления ${player.nickname}:`, error);
        }
    }
    
    saveTrackedPlayers();
    updateTrackedPlayersPanel();
    
    refreshBtn.disabled = false;
    refreshBtn.textContent = originalText;
    refreshBtn.style.background = '#4caf50 !important';
    
    showNotification('Все игроки обновлены', 'success');
}

function updateTrackedPlayersPanel() {
    const listContainer = document.getElementById('tracked-players-list');
    const countElement = document.getElementById('tracked-count');
    
    if (!listContainer) return;
    
    const players = Object.values(trackedPlayers);
    
    // Обновляем счетчик
    if (countElement) {
        countElement.textContent = players.length;
    }
    
    if (players.length === 0) {
        listContainer.innerHTML = `
            <div style="
                text-align: center !important;
                padding: 20px !important;
                color: #888 !important;
                font-size: 14px !important;
            ">
                Список пуст. Нажмите "+" рядом с игроком чтобы добавить.
            </div>
        `;
        return;
    }
    
    // Сортируем по времени добавления (сначала новые)
    players.sort((a, b) => b.addedAt - a.addedAt);
    
    listContainer.innerHTML = '';
    
    players.forEach((player, index) => {
        const playerElement = document.createElement("div");
        playerElement.className = "tracked-player-item";
        playerElement.style.cssText = `
            background: ${index % 2 === 0 ? '#2a2a2a' : '#333'} !important;
            padding: 10px !important;
            margin-bottom: 5px !important;
            border-radius: 4px !important;
            font-size: 13px !important;
            border-left: 3px solid ${player.lastStatus?.color || '#2196f3'} !important;
        `;
        
        const timeAgo = Math.floor((Date.now() - player.lastCheck) / 60000);
        const timeText = timeAgo < 1 ? 'только что' : `${timeAgo} мин назад`;
        
        playerElement.innerHTML = `
            <div style="
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 5px !important;
            ">
                <strong style="color: white !important;">${player.nickname}</strong>
                <button class="remove-tracked-btn" data-nickname="${player.nickname}" style="
                    background: #f44336 !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 50% !important;
                    width: 20px !important;
                    height: 20px !important;
                    font-size: 12px !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                ">×</button>
            </div>
            <div style="color: #ccc !important; font-size: 12px !important; margin-bottom: 3px !important;">
                ${player.lastStatus?.emoji || '❓'} ${player.lastStatus?.label || 'Неизвестно'}
            </div>
            <div style="color: #888 !important; font-size: 11px !important;">
                ${player.lastStatus?.details || 'Нет данных'} • Обновлено: ${timeText}
            </div>
        `;
        
        playerElement.querySelector('.remove-tracked-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const nickname = e.target.dataset.nickname;
            delete trackedPlayers[nickname.toLowerCase()];
            saveTrackedPlayers();
            updateTrackedPlayersPanel();
            updateTrackButtonsOnPage();
            showNotification(`${nickname} удален из списка`, 'info');
        });
        
        listContainer.appendChild(playerElement);
    });
}

function updateTrackButtonsOnPage() {
    document.querySelectorAll('.faceit-track-btn').forEach(button => {
        const nickname = button.dataset.nickname;
        const isTracked = trackedPlayers[nickname.toLowerCase()];
        
        button.innerHTML = isTracked ? '✓' : '+';
        button.title = isTracked ? `Уже в списке (клик для удаления)` : `Добавить в список отслеживания`;
        button.style.background = isTracked ? '#4caf50 !important' : '#2196f3 !important';
    });
}

// ========== 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function showNotification(message, type = 'info') {
    const notification = document.createElement("div");
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        info: '#2196f3',
        warning: '#ff9800'
    };
    
    notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        z-index: 10000 !important;
        background: ${colors[type] || colors.info} !important;
        color: white !important;
        padding: 12px 16px !important;
        border-radius: 6px !important;
        font-family: Arial !important;
        font-size: 14px !important;
        max-width: 300px !important;
        box-shadow: 0 3px 10px rgba(0,0,0,0.2) !important;
        animation: slideIn 0.3s ease !important;
    `;
    
    notification.innerHTML = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.5s !important';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========== 7. ПОИСК ИГРОКОВ И ИНИЦИАЛИЗАЦИЯ ==========
function addButtonsToPlayers() {
    if (isProcessing) return;
    isProcessing = true;
    
    const playerContainers = document.querySelectorAll(`
        div.ListContentPlayer__Background-sc-36ad4183-0.bTaihS,
        div[class*="ListContentPlayer__Background"],
        div.roster-player,
        div[class*="player-container"],
        div[class*="player-row"],
        div[class*="player-card"]
    `);
    
    playerContainers.forEach(container => {
        const nicknameElement = container.querySelector(`
            div[class*="Nickname"],
            div[class*="nickname"],
            a[href*="/players/"],
            span[class*="nickname"]
        `);
        
        if (nicknameElement) {
            const nickname = nicknameElement.textContent.trim();
            if (nickname && nickname.length >= 2) {
                addMatchStatusButton(container, nickname);
            }
        }
    });
    
    isProcessing = false;
}

function initializeMatchRoom() {
    if (!window.location.pathname.includes('/room/') && 
        !window.location.pathname.includes('/matchroom/')) {
        return;
    }
    
    console.log('[FACEIT Status] Инициализация комнаты матча');
    
    // Загружаем отслеживаемых игроков
    loadTrackedPlayers();
    
    // Создаем панель отслеживания
    createTrackedPlayersPanel();
    updateTrackedPlayersPanel();
    
    // Первый запуск с задержкой
    setTimeout(addButtonsToPlayers, 1500);
    
    // Наблюдатель за изменениями
    const debouncedAddButtons = debounce(addButtonsToPlayers, 1000);
    const observer = new MutationObserver(debouncedAddButtons);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ========== 8. ОСНОВНОЙ ЗАПУСК ==========
function main() {
    console.log('[FACEIT Status] Запуск системы');
    
    if (window.location.pathname.includes('/room/') || 
        window.location.pathname.includes('/matchroom/')) {
        initializeMatchRoom();
    }
}

// Запуск при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

// Добавляем CSS анимацию
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log('[FACEIT Status] Система готова к работе!');    

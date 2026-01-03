// background.js - FACEIT Risk Warning
console.log('[FACEIT Background] Сервис запущен');

// Хранилище данных
const playerHistory = new Map();
let markedPlayers = [];

// Загрузка данных при старте
loadAllData();

// ==================== ФУНКЦИИ ХРАНЕНИЯ ====================

// Загрузка всех данных
function loadAllData() {
    loadPlayerHistory();
    loadMarkedPlayers();
}

// Загрузка истории проверок
function loadPlayerHistory() {
    try {
        const savedHistory = localStorage.getItem('faceit_risk_history');
        if (savedHistory) {
            const historyArray = JSON.parse(savedHistory);
            historyArray.forEach(([id, data]) => {
                playerHistory.set(id, data);
            });
            console.log(`[Background] Загружено ${playerHistory.size} записей истории`);
        }
    } catch (error) {
        console.error('[Background] Ошибка загрузки истории:', error);
    }
}

// Загрузка помеченных игроков
function loadMarkedPlayers() {
    chrome.storage.local.get(['markedPlayers'], (result) => {
        markedPlayers = result.markedPlayers || [];
        console.log(`[Background] Загружено ${markedPlayers.length} помеченных игроков`);
    });
}

// Сохранение помеченных игроков
function saveMarkedPlayers() {
    chrome.storage.local.set({ markedPlayers }, () => {
        console.log(`[Background] Сохранено ${markedPlayers.length} помеченных игроков`);
    });
}

// Сохранение данных игрока
function savePlayerData(playerData, risk) {
    if (!playerData?.id) return;
    
    const playerInfo = {
        id: playerData.id,
        nickname: playerData.nickname,
        elo: playerData.elo,
        risk: risk,
        bestMoment: playerData.bestMomentInfo?.text || null,
        timestamp: Date.now()
    };
    
    playerHistory.set(playerData.id, playerInfo);
    
    // Сохраняем в localStorage
    try {
        const historyArray = Array.from(playerHistory.entries());
        localStorage.setItem('faceit_risk_history', JSON.stringify(historyArray));
        console.log(`[Background] Сохранен игрок: ${playerData.nickname} (риск: ${risk}%)`);
    } catch (error) {
        console.error('[Background] Ошибка сохранения:', error);
    }
}

// ==================== ФУНКЦИИ МЕТОК ====================

// Добавление игрока в список меток
function addMarkedPlayer(playerData, risk) {
    const existingIndex = markedPlayers.findIndex(p => p.id === playerData.id);
    
    const playerInfo = {
        id: playerData.id,
        nickname: playerData.nickname,
        elo: playerData.elo,
        currentRisk: risk,
        bestMoment: playerData.bestMomentInfo?.text || null,
        profileUrl: playerData.profileUrl,
        addedAt: Date.now(),
        lastUpdate: Date.now(),
        updateCount: 0
    };
    
    if (existingIndex >= 0) {
        // Обновляем существующего игрока
        playerInfo.addedAt = markedPlayers[existingIndex].addedAt;
        playerInfo.updateCount = markedPlayers[existingIndex].updateCount + 1;
        markedPlayers[existingIndex] = playerInfo;
        console.log(`[Background] Обновлен помеченный игрок: ${playerData.nickname}`);
    } else {
        // Добавляем нового игрока
        markedPlayers.push(playerInfo);
        console.log(`[Background] Добавлен помеченный игрок: ${playerData.nickname}`);
    }
    
    saveMarkedPlayers();
    return existingIndex < 0; // Возвращаем true если игрок новый
}

// Удаление игрока из списка меток
function removeMarkedPlayer(playerId) {
    const initialLength = markedPlayers.length;
    markedPlayers = markedPlayers.filter(p => p.id !== playerId);
    
    if (markedPlayers.length < initialLength) {
        saveMarkedPlayers();
        console.log(`[Background] Удален помеченный игрок: ${playerId}`);
        return true;
    }
    return false;
}

// Обновление данных помеченных игроков
async function updateMarkedPlayers() {
    console.log(`[Background] Начало обновления ${markedPlayers.length} игроков`);
    
    const updateTime = Date.now();
    let updatedCount = 0;
    let highRiskCount = 0;
    
    // Для каждого помеченного игрока...
    for (const player of markedPlayers) {
        try {
            // Здесь будет логика получения актуальных данных
            // Пока что используем старые данные
            const risk = player.currentRisk || 50;
            
            // Обновляем время последнего обновления
            player.lastUpdate = updateTime;
            player.updateCount = (player.updateCount || 0) + 1;
            
            if (risk >= 70) {
                highRiskCount++;
                
                // Отправляем уведомление о высоком риске
                sendRiskNotification(player.nickname, risk, player.profileUrl);
            }
            
            updatedCount++;
            
            // Задержка между запросами чтобы не нагружать сервер
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`[Background] Ошибка обновления игрока ${player.nickname}:`, error);
        }
    }
    
    // Сохраняем обновленных игроков
    saveMarkedPlayers();
    
    // Сохраняем время последнего обновления
    const nextUpdateTime = Date.now() + 60 * 60 * 1000; // Через час
    chrome.storage.local.set({
        lastAutoUpdate: updateTime,
        nextAutoUpdate: nextUpdateTime
    });
    
    console.log(`[Background] Обновлено ${updatedCount} игроков, высокий риск: ${highRiskCount}`);
    return { updatedCount, highRiskCount };
}

// Отправка уведомления о высоком риске
function sendRiskNotification(nickname, risk, profileUrl) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: '⚠️ ВЫСОКИЙ РИСК ВСТРЕЧИ',
        message: `${nickname} - риск: ${risk}%`,
        priority: 2,
        buttons: [
            { title: 'Открыть профиль' }
        ]
    });
}

// ==================== АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ====================

// Настройка автоматического обновления
function setupAutoUpdate() {
    // Устанавливаем обновление каждый час
    chrome.alarms.create('updateMarkedPlayers', {
        periodInMinutes: 600 // Каждый 10 час
    });
    
    console.log('[Background] Автоматическое обновление настроено (каждый час)');
}

// ==================== ОБРАБОТЧИКИ СООБЩЕНИЙ ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Получено сообщение:', message.type);
    
    switch (message.type) {
        case 'PLAYER_ANALYZED':
            if (message.playerData && message.risk !== undefined) {
                savePlayerData(message.playerData, message.risk);
            }
            sendResponse({ saved: true });
            break;
            
        case 'ADD_MARKED_PLAYER':
            if (message.playerData && message.risk !== undefined) {
                const isNew = addMarkedPlayer(message.playerData, message.risk);
                sendResponse({ success: true, isNew: isNew });
            } else {
                sendResponse({ success: false, error: 'Нет данных игрока' });
            }
            break;
            
        case 'REMOVE_MARKED_PLAYER':
            if (message.playerId) {
                const removed = removeMarkedPlayer(message.playerId);
                sendResponse({ success: removed });
            }
            break;
            
        case 'GET_MARKED_PLAYERS':
            sendResponse({ players: markedPlayers });
            break;
            
        case 'UPDATE_MARKED_PLAYERS':
            updateMarkedPlayers().then(result => {
                sendResponse({ success: true, result: result });
            });
            return true; // Асинхронный ответ
            
        case 'CHECK_PLAYER_MARKED':
            if (message.playerId) {
                const isMarked = markedPlayers.some(p => p.id === message.playerId);
                sendResponse({ isMarked: isMarked });
            }
            break;
            
        default:
            sendResponse({ received: true });
    }
    
    return true;
});

// Обработчик алармов
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateMarkedPlayers') {
        console.log('[Background] Автоматическое обновление по расписанию');
        updateMarkedPlayers();
    }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// Запуск при установке
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Background] Расширение установлено');
    setupAutoUpdate();
});

console.log('[FACEIT Background] Готов к работе');

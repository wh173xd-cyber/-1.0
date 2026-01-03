// popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Загрузка помеченных игроков
    let markedPlayers = await loadMarkedPlayers();
    
    // Инициализация табов
    initTabs();
    
    // Отображение игроков
    renderPlayers(markedPlayers);
    
    // Отображение статистики
    renderStats(markedPlayers);
    
    // Обработчики кнопок
    document.getElementById('update-now').addEventListener('click', updateNow);
    document.getElementById('clear-all').addEventListener('click', clearAllPlayers);
});

// Загрузка помеченных игроков
async function loadMarkedPlayers() {
    return new Promise(resolve => {
        chrome.storage.local.get(['markedPlayers'], (result) => {
            resolve(result.markedPlayers || []);
        });
    });
}

// Инициализация табов
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Убираем активный класс у всех табов
            tabs.forEach(t => t.classList.remove('active'));
            // Скрываем все контенты
            contents.forEach(c => c.style.display = 'none');
            
            // Активируем выбранный таб
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).style.display = 'block';
            
            // Если переключились на вкладку, обновляем контент
            if (tabId === 'high-risk') {
                updateHighRiskTab();
            }
        });
    });
}

// Рендер списка игроков
function renderPlayers(players) {
    const container = document.getElementById('marked-players');
    
    if (players.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div>🎯</div>
                <h3>Нет помеченных игроков</h3>
                <p>Перейдите на страницу игрока на Faceit и нажмите кнопку "Добавить в список"</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = players.map(player => createPlayerCard(player)).join('');
    
    // Добавляем обработчики кнопок
    document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const nickname = e.target.closest('.player-card').dataset.nickname;
            removePlayer(nickname);
        });
    });
    
    document.querySelectorAll('.btn-profile').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const url = e.target.closest('.player-card').dataset.url;
            chrome.tabs.create({ url });
        });
    });
}

// Создание карточки игрока
function createPlayerCard(player) {
    const riskClass = player.currentRisk >= 70 ? 'high-risk' : 
                     player.currentRisk >= 40 ? 'medium-risk' : '';
    
    const riskBadge = player.currentRisk >= 70 ? 
        `<span class="risk-badge risk-high">${player.currentRisk}% ВЫСОКО</span>` :
        player.currentRisk >= 40 ?
        `<span class="risk-badge risk-medium">${player.currentRisk}% СРЕДНИЙ</span>` :
        `<span class="risk-badge risk-low">${player.currentRisk}% НИЗКИЙ</span>`;
    
    const lastUpdate = player.lastUpdate ? 
        new Date(player.lastUpdate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 
        'не обновлялся';
    
    return `
        <div class="player-card ${riskClass}" data-nickname="${player.nickname}" data-url="${player.profileUrl}">
            <div class="player-header">
                <div class="player-name">${player.nickname}</div>
                ${riskBadge}
            </div>
            <div class="player-info">
                <span>ELO: ${player.elo}</span>
                <span>${player.bestMoment || 'нет данных'}</span>
            </div>
            <div class="player-info">
                <span>Добавлен: ${new Date(player.addedAt).toLocaleDateString('ru-RU')}</span>
                <span>Обновлён: ${lastUpdate}</span>
            </div>
            <div class="player-actions">
                <button class="btn btn-remove">🗑️ Удалить</button>
                <button class="btn btn-profile">🔗 Профиль</button>
            </div>
        </div>
    `;
}

// Обновление вкладки "Высокий риск"
async function updateHighRiskTab() {
    const players = await loadMarkedPlayers();
    const highRiskPlayers = players.filter(p => p.currentRisk >= 70);
    const container = document.getElementById('high-risk-players');
    
    if (highRiskPlayers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div>✅</div>
                <h3>Нет игроков с высоким риском</h3>
                <p>Все помеченные игроки имеют низкий или средний риск встречи</p>
            </div>
        `;
    } else {
        container.innerHTML = highRiskPlayers.map(player => createPlayerCard(player)).join('');
        
        // Добавляем обработчики кнопок
        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nickname = e.target.closest('.player-card').dataset.nickname;
                removePlayer(nickname);
            });
        });
        
        document.querySelectorAll('.btn-profile').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.closest('.player-card').dataset.url;
                chrome.tabs.create({ url });
            });
        });
    }
}

// Отображение статистики
function renderStats(players) {
    document.getElementById('total-players').textContent = players.length;
    document.getElementById('high-risk-count').textContent = players.filter(p => p.currentRisk >= 70).length;
    
    // Получаем время последнего обновления
    chrome.storage.local.get(['lastAutoUpdate', 'nextAutoUpdate'], (result) => {
        if (result.lastAutoUpdate) {
            const lastUpdate = new Date(result.lastAutoUpdate);
            document.getElementById('last-update-time').textContent = 
                lastUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (result.nextAutoUpdate) {
            const nextUpdate = new Date(result.nextAutoUpdate);
            document.getElementById('next-update-time').textContent = 
                nextUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
    });
}

// Удаление игрока из списка
async function removePlayer(nickname) {
    const players = await loadMarkedPlayers();
    const updatedPlayers = players.filter(p => p.nickname !== nickname);
    
    await chrome.storage.local.set({ markedPlayers: updatedPlayers });
    
    // Обновляем отображение
    renderPlayers(updatedPlayers);
    renderStats(updatedPlayers);
    updateHighRiskTab();
}

// Обновление данных сейчас
async function updateNow() {
    const button = document.getElementById('update-now');
    const originalText = button.textContent;
    button.textContent = '🔄 Обновление...';
    button.disabled = true;
    
    // Отправляем сообщение в background для обновления
    chrome.runtime.sendMessage({ type: 'UPDATE_MARKED_PLAYERS' }, async (response) => {
        if (response.success) {
            // Ждем немного для обновления данных
            setTimeout(async () => {
                const players = await loadMarkedPlayers();
                renderPlayers(players);
                renderStats(players);
                
                button.textContent = originalText;
                button.disabled = false;
                
                alert('Данные успешно обновлены!');
            }, 2000);
        } else {
            button.textContent = originalText;
            button.disabled = false;
            alert('Ошибка при обновлении данных');
        }
    });
}

// Очистка всех игроков
async function clearAllPlayers() {
    if (confirm('Вы уверены, что хотите удалить всех помеченных игроков?')) {
        await chrome.storage.local.set({ markedPlayers: [] });
        
        // Обновляем отображение
        renderPlayers([]);
        renderStats([]);
        updateHighRiskTab();
    }
}
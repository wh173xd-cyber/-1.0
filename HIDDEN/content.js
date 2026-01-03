// content.js - FACEIT Risk Warning
console.log('[FACEIT Risk] Content script загружен');

const MY_ELO = 2500;
const ELO_DIFFERENCE_THRESHOLD = 500;
const LOW_RISK_ELO_DIFFERENCE = 5;

let warningPanel = null;
let riskIndicator = null;
let processedPlayers = new Set(); // Для отслеживания обработанных игроков
let isProcessing = false; // Защита от повторных вызовов

// ========== 1. БЛОКИРОВКА SENTRY ==========
if (window.location.hostname.includes('faceit.com')) {
    console.log('[FACEIT Risk] Sentry отключен на FACEIT');
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('sentry.io')) {
            return Promise.reject(new Error('Sentry заблокирован'));
        }
        return originalFetch.apply(this, args);
    };
}

// ========== 2. ОПТИМИЗИРОВАННЫЙ ПОИСК ELO ==========
// ========== 2. ИСПРАВЛЕННЫЙ ПОИСК ELO ==========
function getPlayerEloInMatchRoom(playerContainer, nickname) {
    if (!playerContainer) return 2000;
    
    console.log(`[FACEIT Risk] Ищем ELO для: ${nickname}`);
    
    // Стратегия 1: Ищем ELO внутри контейнера игрока
    const eloElement = playerContainer.querySelector('div.TextBlock__Holder-sc-1bbd9bc2-0.fjYAKC > div > span');
    
    if (eloElement?.textContent) {
        const text = eloElement.textContent.trim();
        const match = text.match(/(\d{3,4})/);
        if (match) {
            const elo = parseInt(match[1]);
            if (elo >= 500 && elo <= 5000) {
                console.log(`[FACEIT Risk] Найден ELO в контейнере: ${elo}`);
                return elo;
            }
        }
    }
    
    // Стратегия 2: Ищем все ELO на странице и сопоставляем по порядку
    const allEloElements = document.querySelectorAll('div.TextBlock__Holder-sc-1bbd9bc2-0.fjYAKC > div > span');
    console.log(`[FACEIT Risk] Всего ELO на странице: ${allEloElements.length}`);
    
    // Находим индекс текущего контейнера среди всех контейнеров игроков
    const allPlayerContainers = document.querySelectorAll(`
        div.ListContentPlayer__Background-sc-36ad4183-0.bTaihS,
        div[class*="ListContentPlayer__Background"]
    `);
    
    let containerIndex = -1;
    for (let i = 0; i < allPlayerContainers.length; i++) {
        if (allPlayerContainers[i] === playerContainer) {
            containerIndex = i;
            break;
        }
    }
    
    console.log(`[FACEIT Risk] Контейнер ${nickname} имеет индекс: ${containerIndex}`);
    
    // Если нашли соответствие и ELO есть по этому индексу
    if (containerIndex >= 0 && allEloElements.length > containerIndex) {
        const eloText = allEloElements[containerIndex].textContent.trim();
        const match = eloText.match(/(\d{3,4})/);
        if (match) {
            const elo = parseInt(match[1]);
            if (elo >= 500 && elo <= 5000) {
                console.log(`[FACEIT Risk] Сопоставлен ELO по индексу: ${elo}`);
                return elo;
            }
        }
    }
    
    // Стратегия 3: Ищем ELO по близости к нику
    const nicknameElement = playerContainer.querySelector(`
        div[class*="Nickname"],
        div[class*="nickname"]
    `);
    
    if (nicknameElement) {
        // Ищем числовые значения рядом с ником
        const containerHTML = playerContainer.innerHTML;
        
        // Ищем паттерны типа "2828", "2432" и т.д.
        const numberMatches = containerHTML.match(/\b(\d{3,4})\b/g);
        if (numberMatches) {
            for (const numStr of numberMatches) {
                const num = parseInt(numStr);
                if (num >= 500 && num <= 5000) {
                    // Проверяем, что это не часть другого контекста
                    const contextStart = Math.max(0, containerHTML.indexOf(numStr) - 50);
                    const contextEnd = Math.min(containerHTML.length, containerHTML.indexOf(numStr) + 50);
                    const context = containerHTML.substring(contextStart, contextEnd);
                    
                    if (!context.includes('hours') && !context.includes('matches') && 
                        !context.includes('wins') && !context.includes('streak')) {
                        console.log(`[FACEIT Risk] Найден ELO по паттерну: ${num}`);
                        return num;
                    }
                }
            }
        }
    }
    
    console.log(`[FACEIT Risk] ELO для ${nickname} не найден, использую 2000`);
    return 2000;
}


// ========== 3. УЛУЧШЕННАЯ ФУНКЦИЯ ДЛЯ КНОПКИ ==========
function addQuickAddButton(playerContainer, nickname) {
    const playerId = 'player_' + nickname.toLowerCase();
    
    if (document.querySelector(`[data-player-id="${playerId}"]`)) {
        return;
    }
    
    if (playerContainer.querySelector('.faceit-quick-add-btn')) {
        return;
    }
    
    processedPlayers.add(playerId);
    
    // Ищем ELO с передачей ника для отладки
    const playerElo = getPlayerEloInMatchRoom(playerContainer, nickname);
    const riskPercent = calculateRiskWithElo(playerElo);
    
    console.log(`[FACEIT Risk] ${nickname}: ELO=${playerElo}, риск=${riskPercent}%`);
    
    const button = document.createElement("button");
    button.className = "faceit-quick-add-btn";
    button.dataset.nickname = nickname;
    button.dataset.playerId = playerId;
    button.dataset.elo = playerElo;
    
    button.style.cssText = `
        background: #2196f3 !important;
        color: white !important;
        border: none !important;
        border-radius: 4px !important;
        padding: 4px 8px !important;
        margin-left: 25px !important;
        font-size: 11px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        display: inline-block !important;
        vertical-align: middle !important;
        min-width: 75px !important;
        text-align: center !important;
        position: relative !important;
        z-index: 100 !important;
    `;
    
    button.innerHTML = '🎯 Добавить';
    button.title = `${nickname} | ELO: ${playerElo} | Риск: ${riskPercent}%`;
    
    button.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        if (button.disabled) return;
        
        const playerData = {
            id: 'faceit_' + nickname.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            nickname: nickname,
            elo: playerElo,
            risk: riskPercent,
            profileUrl: `https://www.faceit.com/players/${encodeURIComponent(nickname)}`,
            addedAt: Date.now()
        };
        
        chrome.runtime.sendMessage({
            type: 'ADD_MARKED_PLAYER',
            playerData: playerData,
            risk: riskPercent
        }, (response) => {
            if (response?.success) {
                button.innerHTML = '✅ В списке';
                button.style.background = '#4caf50 !important';
                button.disabled = true;
                button.style.opacity = '0.8';
                button.style.cursor = 'default';
            }
        });
    });
    
    // Пытаемся добавить кнопку рядом с ником
    const nicknameElement = playerContainer.querySelector(`
        div[class*="Nickname"],
        div[class*="nickname"]
    `);
    
    if (nicknameElement?.parentElement) {
        nicknameElement.parentElement.appendChild(button);
    } else {
        playerContainer.appendChild(button);
    }
    
    console.log(`[FACEIT Risk] Кнопка добавлена: ${nickname}`);
}

// ========== 4. ИСПРАВЛЕННЫЙ ПОИСК ИГРОКОВ ==========
function addButtonsToPlayers() {
    if (isProcessing) return;
    isProcessing = true;
    
    console.log('[FACEIT Risk] Поиск игроков...');
    
    processedPlayers.clear();
    
    // 1. Находим все контейнеры с игроками
    const playerContainers = document.querySelectorAll(`
        div.ListContentPlayer__Background-sc-36ad4183-0.bTaihS,
        div[class*="ListContentPlayer__Background"]
    `);
    
    console.log(`[FACEIT Risk] Найдено основных контейнеров: ${playerContainers.length}`);
    
    let addedCount = 0;
    
    // 2. Ищем игроков ВНУТРИ этих контейнеров
    playerContainers.forEach(container => {
        // Ищем никнейм разными способами
        let nicknameElement = null;
        let nickname = null;
        
        // Способ 1: Ищем в div с классом Nickname (скорее всего тут)
        const nicknameDiv = container.querySelector(`
            div[class*="Nickname"],
            div[class*="nickname"],
            div.styles__NicknameContainer-sc-c3c4cf34-4.ZwufR
        `);
        
        if (nicknameDiv) {
            // Берем первый текстовый элемент внутри
            const textElements = nicknameDiv.querySelectorAll('div, span');
            for (let elem of textElements) {
                nickname = extractNickname(elem);
                if (nickname) {
                    nicknameElement = elem;
                    break;
                }
            }
            
            // Если не нашли в дочерних элементах, проверяем сам div
            if (!nickname && nicknameDiv.textContent) {
                nickname = extractNickname(nicknameDiv);
                if (nickname) nicknameElement = nicknameDiv;
            }
        }
        
        // Способ 2: Ищем по структуре из дебага (твои селекторы)
        if (!nickname) {
            const possibleElements = container.querySelectorAll(`
                div.Nickname__Container-sc-d3288876-0.jzPjky,
                div > div > div,
                div[class*="Container"]:not([class*="Background"])
            `);
            
            for (let elem of possibleElements) {
                nickname = extractNickname(elem);
                if (nickname) {
                    nicknameElement = elem;
                    break;
                }
            }
        }
        
        // Способ 3: Просто ищем любой текст в контейнере
        if (!nickname) {
            // Ищем все элементы с текстом
            const allElements = container.querySelectorAll('div, span');
            for (let elem of allElements) {
                if (elem.textContent && elem.textContent.trim()) {
                    const text = elem.textContent.trim();
                    // Проверяем, похоже ли на никнейм
                    if (text.length >= 2 && text.length <= 20 && 
                        !text.includes('ELO') && !text.match(/^\d+$/) &&
                        !text.includes('Level') && !text.includes('FACEIT')) {
                        nickname = text;
                        nicknameElement = elem;
                        break;
                    }
                }
            }
        }
        
        // Если нашли никнейм - добавляем кнопку
        if (nickname && nicknameElement) {
            console.log(`[FACEIT Risk] Найден игрок: ${nickname}`);
            
            // Находим ELO для этого игрока
            let playerElo = 2000;
            const eloIndex = addedCount; // Предполагаем, что ELO идут по порядку
            
            // Берем ELO из списка, который нашел дебаг
            const allEloElements = document.querySelectorAll('div.TextBlock__Holder-sc-1bbd9bc2-0.fjYAKC > div > span');
            if (allEloElements.length > eloIndex) {
                const eloText = allEloElements[eloIndex].textContent.trim();
                const match = eloText.match(/(\d+)/);
                if (match) {
                    playerElo = parseInt(match[1]);
                    console.log(`[FACEIT Risk] ELO для ${nickname}: ${playerElo}`);
                }
            }
            
            addQuickAddButton(container, nickname, playerElo);
            addedCount++;
        }
    });
    
    console.log(`[FACEIT Risk] Итог: добавлено кнопок: ${addedCount}`);
    isProcessing = false;
}
// ========== 5. ФУНКЦИЯ DEBOUNCE ДЛЯ НАБЛЮДАТЕЛЯ ==========
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

// ========== 6. ОПТИМИЗИРОВАННАЯ ИНИЦИАЛИЗАЦИЯ ==========
function initializeMatchRoom() {
    if (!window.location.pathname.includes('/room/') && 
        !window.location.pathname.includes('/matchroom/') &&
        !window.location.pathname.includes('/lobby/')) {
        return;
    }
    
    console.log('[FACEIT Risk] Комната матча обнаружена');
    
    // Сбрасываем состояние при новой загрузке
    processedPlayers.clear();
    
    // Задержка перед первым поиском
    setTimeout(() => {
        addButtonsToPlayers();
    }, 2500);
    
    // Дебаунс для наблюдателя (не чаще чем раз в 2 секунды)
    const debouncedAddButtons = debounce(addButtonsToPlayers, 2000);
    
    const observer = new MutationObserver(() => {
        debouncedAddButtons();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
    
    window.faceitMutationObserver = observer;
}

// ========== 7. ОСТАЛЬНЫЕ ФУНКЦИИ (без изменений) ==========
function showWarning(nickname, risk) {
    if (warningPanel) warningPanel.remove();
    
    warningPanel = document.createElement("div");
    warningPanel.id = "faceit-high-risk-warning";
    warningPanel.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        z-index: 10000; background: #b00020; color: white; 
        padding: 16px; border-radius: 8px; font-family: Arial; 
        font-size: 14px; max-width: 280px; border: 2px solid #ff5252;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    warningPanel.innerHTML = `
        <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
            ⚠️ ВНИМАНИЕ!
        </div>
        <div style="margin-bottom: 8px;">Высокий риск: <strong>${nickname}</strong></div>
        <div style="margin-bottom: 12px;">Риск: <strong style="color: #ffcc00;">${risk}%</strong></div>
        <div style="font-weight: bold; background: rgba(255, 255, 255, 0.2); padding: 8px; border-radius: 4px; text-align: center;">
            ⛔ НЕ ЗАПУСКАЙТЕ МАТЧ!
        </div>
    `;
    
    document.body.appendChild(warningPanel);
    warningPanel.addEventListener('click', () => warningPanel.remove());
    setTimeout(() => warningPanel?.remove(), 15000);
}

function showRiskIndicator(riskPercent, nickname = '', eloInfo = '') {
    if (riskIndicator) riskIndicator.remove();
    
    let bgColor, textColor, emoji;
    if (riskPercent >= 80) { bgColor='#d32f2f'; textColor='#fff'; emoji='🔥'; }
    else if (riskPercent >= 65) { bgColor='#ff5722'; textColor='#fff'; emoji='⚠️'; }
    else if (riskPercent >= 40) { bgColor='#ffc107'; textColor='#000'; emoji='⚡'; }
    else if (riskPercent >= 20) { bgColor='#2196f3'; textColor='#fff'; emoji='📊'; }
    else { bgColor='#4caf50'; textColor='#fff'; emoji='✅'; }
    
    riskIndicator = document.createElement("div");
    riskIndicator.id = "faceit-risk-indicator";
    riskIndicator.style.cssText = `
        position: fixed; top: 60px; right: 20px;
        z-index: 9999; background: ${bgColor}; color: ${textColor};
        padding: 12px 16px; border-radius: 8px; font-family: Arial;
        font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        border: 2px solid ${textColor === '#fff' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'};
        text-align: center; min-width: 120px; cursor: pointer;
    `;
    
    riskIndicator.innerHTML = `
        <div style="margin-bottom: 4px;">${emoji} РИСК</div>
        <div style="font-size: 24px; margin: 4px 0;">${riskPercent}%</div>
        ${nickname ? `<div style="font-size: 12px; opacity: 0.9;">${nickname}</div>` : ''}
        ${eloInfo ? `<div style="font-size: 10px; margin-top: 4px;">${eloInfo}</div>` : ''}
    `;
    
    document.body.appendChild(riskIndicator);
    riskIndicator.addEventListener('click', () => riskIndicator.remove());
}

function getPlayerEloSimpleFixed() {
    const text = document.body.textContent;
    const numbers = text.match(/\b(\d{3,4})\b/g) || [];
    
    for (const numStr of numbers) {
        const num = parseInt(numStr);
        if (num >= 500 && num <= 5000) {
            console.log('[FACEIT Risk] Найден ELO:', num);
            return num;
        }
    }
    
    return 2000;
}

function collectPlayerData() {
    try {
        let nickname = '';
        const pathMatch = window.location.pathname.match(/\/players\/([^\/]+)/);
        if (pathMatch) nickname = decodeURIComponent(pathMatch[1]);
        
        if (!nickname) return null;
        
        return {
            id: 'faceit_' + nickname.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            nickname,
            elo: getPlayerEloSimpleFixed(),
            profileUrl: window.location.href
        };
        
    } catch (error) {
        console.error('[FACEIT Risk] Ошибка сбора данных:', error);
        return null;
    }
}

function calculateRiskWithElo(playerElo) {
    const eloDifference = Math.abs(playerElo - MY_ELO);
    
    if (eloDifference > ELO_DIFFERENCE_THRESHOLD) {
        return LOW_RISK_ELO_DIFFERENCE;
    }
    
    let risk = 0.0;
    
    if (eloDifference <= 100) risk += 0.3;
    else if (eloDifference <= 250) risk += 0.2;
    else if (eloDifference <= 500) risk += 0.1;
    
    risk += 0.1;
    risk = Math.max(0, Math.min(1, risk));
    
    return Math.round(risk * 100);
}

function extractNickname(element) {
    if (!element) return null;
    
    let nickname = element.textContent.trim();
    nickname = nickname.replace(/[@#]/g, '');
    
    if (nickname.length >= 2 && nickname.length <= 25 && 
        !nickname.includes('FACEIT') && !nickname.includes('Вы') && 
        !nickname.includes('You') && !nickname.includes('ELO') &&
        !nickname.includes('Level') && !nickname.match(/^\d+$/)) {
        return nickname;
    }
    
    return null;
}

// ========== ДЕБАГ ФУНКЦИЯ ==========
function debugPageStructure() {
    console.log('[FACEIT Risk] === ДЕБАГ СТРУКТУРЫ СТРАНИЦЫ ===');
    
    // 1. Ищем контейнеры по твоим селекторам
    const testSelectors = [
        'div.ListContentPlayer__Background-sc-36ad4183-0.bTaihS',
        'div.RosterParty__Container-sc-a1d1e41c-0.bzxoJC',
        'div[class*="ListContentPlayer"]',
        'div[class*="RosterParty"]',
        'div[class*="player-container"]'
    ];
    
    testSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        console.log(`Селектор "${selector}": ${elements.length} элементов`);
    });
    
    // 2. Ищем все ссылки на игроков
    const playerLinks = document.querySelectorAll('a[href*="/players/"]');
    console.log(`Ссылок на игроков: ${playerLinks.length}`);
    playerLinks.forEach((link, i) => {
        console.log(`  ${i+1}. "${link.textContent.trim()}" -> ${link.href}`);
    });
    
    // 3. Ищем текст с ELO
    const eloElements = document.querySelectorAll('div.TextBlock__Holder-sc-1bbd9bc2-0.fjYAKC > div > span');
    console.log(`Элементов ELO: ${eloElements.length}`);
    eloElements.forEach((el, i) => {
        console.log(`  ${i+1}. ELO текст: "${el.textContent}"`);
    });
    
    console.log('[FACEIT Risk] === КОНЕЦ ДЕБАГА ===');
}

// И вызови её в initializeMatchRoom после задержки:
function initializeMatchRoom() {
    if (!window.location.pathname.includes('/room/') && 
        !window.location.pathname.includes('/matchroom/') &&
        !window.location.pathname.includes('/lobby/')) {
        return;
    }
    
    console.log('[FACEIT Risk] Комната матча обнаружена');
    
    // Сбрасываем состояние при новой загрузке
    processedPlayers.clear();
    
    // Задержка перед первым поиском
    setTimeout(() => {
        debugPageStructure(); // <-- ДОБАВЬ ЭТУ СТРОКУ
        addButtonsToPlayers();
    }, 2500);
    
    // ... остальной код без изменений
}

function main() {
    console.log('[FACEIT Risk] Инициализация для:', window.location.pathname);
    
    if (window.faceitMutationObserver) {
        window.faceitMutationObserver.disconnect();
        window.faceitMutationObserver = null;
    }
    
    // Для страниц профилей
    if (window.location.pathname.includes('/players/')) {
        setTimeout(() => {
            const playerData = collectPlayerData();
            
            if (playerData) {
                const riskPercent = calculateRiskWithElo(playerData.elo);
                const eloInfo = `ELO: ${playerData.elo}`;
                
                showRiskIndicator(riskPercent, playerData.nickname, eloInfo);
                
                if (riskPercent >= 65) {
                    showWarning(playerData.nickname, riskPercent);
                }
            }
        }, 2000);
    }
    
    // Для комнат матча
    if (window.location.pathname.includes('/room/') || 
        window.location.pathname.includes('/matchroom/') ||
        window.location.pathname.includes('/lobby/')) {
        initializeMatchRoom();
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FORCE_UPDATE") {
        addButtonsToPlayers();
    }
    sendResponse({ received: true });
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}

console.log('[FACEIT Risk] Система готова!');
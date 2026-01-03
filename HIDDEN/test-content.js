// test-content.js - МИНИМАЛЬНЫЙ ТЕСТ
console.log('[FACEIT TEST] Content script ЗАГРУЖЕН!', Date.now());

// Простая функция для проверки
window.testFaceit = {
    hello: () => {
        console.log('Привет от расширения FACEIT Risk!');
        return 'РАБОТАЕТ';
    },
    
    checkPage: () => {
        console.log('Проверка страницы...');
        console.log('URL:', window.location.href);
        console.log('Заголовок:', document.title);
        return 'OK';
    }
};

console.log('[FACEIT TEST] Для теста введите: testFaceit.hello()');

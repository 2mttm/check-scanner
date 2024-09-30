// Функция для запуска сканера QR-кода
function startQrCodeScanner() {
    const qrResultInput = document.getElementById('qr-result');
    const reader = document.getElementById('reader');

    // Отображаем блок камеры
    reader.style.display = "block";

    // Инициализируем QR код ридер
    const html5QrCode = new Html5Qrcode("reader");

    // Параметры камеры (640x480)
    const config = {fps: 10, qrbox: {width: 250, height: 250}};

    // Начинаем сканирование камеры
    html5QrCode.start(
        {facingMode: "environment"}, // Камера по умолчанию (задняя)
        config,
        qrCodeMessage => {
            // При успешном сканировании, вставляем QR-код в поле
            qrResultInput.value = qrCodeMessage;
            html5QrCode.stop(); // Останавливаем сканирование после нахождения QR-кода
        },
        errorMessage => {
            console.warn(`Ошибка сканирования: ${errorMessage}`);
        }
    ).catch(err => {
        console.error(`Ошибка инициализации камеры: ${err}`);
    });
}

// Функция для парсинга сайта по ссылке
async function fetchAndParseWebsite(url) {
    const proxyUrl = 'https://corsproxy.io/?';

    try {
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        const html = await response.text();

        // Создаем временный элемент для разбора полученного HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Ищем элемент с нужными классами
        const targetElement = doc.querySelector('.col-span-1.md\\:col-span-3.lg\\:col-span-2.xl\\:col-span-1.px-5.font-monospace');
        if (targetElement) {
            // Вставляем содержимое элемента на наш сайт
            document.getElementById('content').innerHTML = targetElement.innerHTML;

            console.log(extractRelevantDivs(targetElement));
        } else {
            document.getElementById('content').innerHTML = "Элемент не найден!";
        }
    } catch (error) {
        console.error("Ошибка при парсинге сайта:", error);
        document.getElementById('content').innerHTML = "Ошибка при получении данных!";
    }
}

// Функция для извлечения div-ов с нужными классами
function extractRelevantDivs(parentElement) {
    let extractedContent = [];
    let currentGroup;

    let skip = false;

    for (const child of parentElement.children) {
        // Проверяем, есть ли у элемента классы "flex justify-between items-center"
        if (child.classList.contains('flex') &&
            child.classList.contains('justify-between') &&
            child.classList.contains('items-center')) {

            if (extractedContent.length === 0) {
                if (!currentGroup) {
                    currentGroup = [];
                    skip = false;
                }

                if (skip) {
                    skip = false;
                    continue;
                }

                const qty = parseFloat(child.children[1].textContent.replaceAll(' ', '').split('x')[0]);
                const price = parseFloat(child.children[1].textContent.replaceAll(' ', '').split('x')[1]);

                currentGroup.push({
                    item: child.children[0].textContent,
                    qty: qty,
                    price: price,
                    total: qty * price,
                });

                skip = true;

            } else {
                if (!currentGroup) currentGroup = [];
                for (const innerChild of child.children)
                    currentGroup.push(innerChild.textContent.replaceAll('\n', '').trim())
            }

        } else if (currentGroup) {
            extractedContent.push(currentGroup);
            currentGroup = undefined;
        }
    }

    return extractedContent || "Не удалось найти соответствующие блоки.";
}

// Обработчик клика для кнопки "Запустить сканер"
document.getElementById('start-scanner').addEventListener('click', startQrCodeScanner);

// Обработчик клика для кнопки "Продолжить"
document.getElementById('continue').addEventListener('click', function () {
    const qrCode = document.getElementById('qr-result').value;
    if (qrCode) {
        fetchAndParseWebsite(qrCode);
    } else {
        alert("Пожалуйста, введите QR-код или отсканируйте его.");
    }
});

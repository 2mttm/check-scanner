const CLIENT_ID = '264415427079-9ic9kqr20fffuiocp52e807qu3pab8ef.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBHZNkYNyOsCxGpyminQAbyLRNSwvn5Nig';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let checkData = '';

// Инициализация событий и обработчиков
function init() {
    document.getElementById('start-scanner').addEventListener('click', startQrCodeScanner);
    document.getElementById('continue').addEventListener('click', handleContinueClick);
    document.getElementById('send-to-sheets').addEventListener('click', handleSendToSheetsClick);
}

// Функция для запуска сканера QR-кода
function startQrCodeScanner() {
    const qrResultInput = document.getElementById('qr-result');
    const reader = document.getElementById('reader');

    // Отображаем блок камеры
    reader.style.display = "block";

    const html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Начинаем сканирование камеры
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (qrCodeMessage) => {
            qrResultInput.value = qrCodeMessage;
            html5QrCode.stop();
        },
        (errorMessage) => {
            console.warn(`Ошибка сканирования: ${errorMessage}`);
        }
    ).catch(err => {
        console.error(`Ошибка инициализации камеры: ${err}`);
    });
}

// Обработчик клика для кнопки "Продолжить"
function handleContinueClick() {
    const qrCode = document.getElementById('qr-result').value;
    if (qrCode) {
        fetchAndParseWebsite(qrCode);
    } else {
        alert("Пожалуйста, введите QR-код или отсканируйте его.");
    }
}

// Обработчик клика для кнопки "Send to Google Sheets"
async function handleSendToSheetsClick() {
    await signIn();  // Запрашиваем авторизацию перед отправкой данных
}

// Функция для парсинга сайта по ссылке
async function fetchAndParseWebsite(url) {
    const proxyUrl = 'https://corsproxy.io/?';

    try {
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        const html = await response.text();
        parseHtml(html);
    } catch (error) {
        console.error("Ошибка при парсинге сайта:", error);
        document.getElementById('content').innerHTML = "Ошибка при получении данных!";
    }
}

// Функция для разбора полученного HTML
function parseHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const targetElement = doc.querySelector('.col-span-1.md\\:col-span-3.lg\\:col-span-2.xl\\:col-span-1.px-5.font-monospace');

    if (targetElement) {
        document.getElementById('content').innerHTML = targetElement.innerHTML;
        document.getElementById('send-to-sheets').style.display = 'block';
        checkData = extractRelevantDivs(targetElement);
        console.log(checkData);
    } else {
        document.getElementById('content').innerHTML = "Элемент не найден!";
    }
}

// Функция для извлечения div-ов с нужными классами
function extractRelevantDivs(parentElement) {
    const extractedContent = [];
    let currentGroup;
    let skip = false;

    for (const child of parentElement.children) {
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

    return extractedContent.length ? extractedContent : "Не удалось найти соответствующие блоки.";
}

// Обработчик клика для кнопки "Send to Google Sheets"
async function handleSendToSheetsClick() {
    await signIn();  // Запрашиваем авторизацию перед отправкой данных
}

// Функция для отправки данных в Google Sheets
async function sendDataToSheets(data) {
    const { isConfirmed } = await Swal.fire({
        title: 'Создать новый документ?',
        showCancelButton: true,
        confirmButtonText: 'Да',
        cancelButtonText: 'Нет',
    });

    if (isConfirmed) {
        createSpreadsheet(data);
    } else {
        const { value: spreadsheetId } = await Swal.fire({
            title: 'Введите ID существующего документа',
            input: 'text',
            showCancelButton: true,
        });

        if (spreadsheetId) {
            await addDataToExistingSpreadsheet(spreadsheetId, data);
        }
    }
}

// Функция для добавления данных в существующий документ
async function addDataToExistingSpreadsheet(spreadsheetId, data) {
    const sheetName = 'Data';

    // Получаем информацию о листах в документе
    const sheetsResponse = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
    });

    const sheets = sheetsResponse.result.sheets;
    const sheetExists = sheets.some(sheet => sheet.properties.title === sheetName);

    if (!sheetExists) {
        // Если лист не существует, создаем его
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                        },
                    },
                }],
            },
        }).then(() => {
            // Добавляем заголовки после создания листа
            return gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1:D1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['Item', 'Qty', 'Price', 'Date']],
                },
            });
        }).catch((err) => {
            console.error("Ошибка при добавлении листа:", err);
            Swal.fire("Ошибка", "Не удалось добавить лист.", "error");
            return;
        });
    } else {
        // Если лист существует, добавляем заголовки только если они отсутствуют
        const headersResponse = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:D1`,
        });

        const headers = headersResponse.result.values;
        if (!headers || headers.length === 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: `${sheetName}!A1:D1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['Item', 'Qty', 'Price', 'Date']],
                },
            });
        }
    }

    // Добавляем данные
    const values = data[0].map(item => ([
        item.item,
        item.qty,
        item.price,
        data[4][0].split(' ')[1],
    ]));

    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A2`, // Начинаем с A2, чтобы не перезаписывать заголовки
        valueInputOption: 'RAW',
        resource: {
            values: values,
        },
    });

    Swal.fire("Успех", "Данные успешно добавлены в существующий документ.", "success");
}

// Функция для создания нового документа в Google Sheets
async function createSpreadsheet(data) {
    const response = await gapi.client.sheets.spreadsheets.create({
        properties: {
            title: "Новый документ из QR-кода"
        },
        sheets: [
            {
                properties: {
                    title: "Data"
                },
                data: [
                    {
                        rowData: [
                            {
                                values: [
                                    { userEnteredValue: { stringValue: "Item" } },
                                    { userEnteredValue: { stringValue: "Qty" } },
                                    { userEnteredValue: { stringValue: "Price" } },
                                    { userEnteredValue: { stringValue: "Date" } },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    });

    console.log("Документ создан:", response);
    Swal.fire("Успех", "Новый документ успешно создан.", "success");

    // Добавляем данные
    const values = data[0].map(item => ([
        item.item,
        item.qty,
        item.price,
        data[4][0].split(' ')[1],
    ]));

    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: response.result.spreadsheetId,
        range: "Data!A2", // Начинаем с A2, чтобы не перезаписывать заголовки
        valueInputOption: 'RAW',
        resource: {
            values: values,
        },
    });

    Swal.fire("Успех", "Данные успешно добавлены в новый документ.", "success");
}

// Инициализация Google API и авторизации
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
            if (resp.error) {
                throw resp;
            }
            await sendDataToSheets(checkData); // Вызываем после успешной аутентификации
        },
    });
    gisInited = true;
}

async function signIn() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

// Запуск инициализации при загрузке страницы
init();

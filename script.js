const CLIENT_ID = '264415427079-9ic9kqr20fffuiocp52e807qu3pab8ef.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBHZNkYNyOsCxGpyminQAbyLRNSwvn5Nig';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let checkData = '';

let html5QrcodeScanner = new Html5QrcodeScanner(
    "reader",
    {fps: 10, qrbox: {width: 250, height: 250}});
html5QrcodeScanner.render(onScanSuccess, onScanError)

// Инициализация событий и обработчиков
function init() {
    document.getElementById('continue').addEventListener('click', handleContinueClick);
    document.getElementById('send-to-sheets').addEventListener('click', handleSendToSheetsClick);
}

function onScanSuccess(decodedText, decodedResult) {
    const qrResultInput = document.getElementById('qr-result');
    qrResultInput.value = decodedText;
}

function onScanError(errorMessage) {
    // console.warn(`Ошибка сканирования: ${errorMessage}`);
}

// Обработчик клика для кнопки "Продолжить"
function handleContinueClick() {
    let qrCode = document.getElementById('qr-result').value;
    if (qrCode.startsWith('https://sift-mev.sfs.md/receipt/')) qrCode = 'https://mev.sfs.md/receipt-verifier/' + qrCode.split('/')[4]
    if (qrCode) {
        fetchAndParseWebsite(qrCode);
    } else {
        Swal.fire({
            title: "Please scan or insert a link to mev.sfs.md",
            icon: "error",
        });
    }
}

// Функция для парсинга сайта по ссылке
async function fetchAndParseWebsite(url) {
    const proxyUrl = 'https://corsproxy.io/?';

    try {
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        const html = await response.text();
        parseHtml(html);
    } catch (error) {
        Swal.fire({title: "Error on fetching step. Please contact developer.", icon: "error"});
        console.error("Parsing or fetching error:", error);
        document.getElementById('content').innerHTML = "Parsing error!";
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
        document.getElementById('content').innerHTML = "Element not found!";
    }
}

// Функция для извлечения div-ов с нужными классами
function extractRelevantDivs(parentElement) {
    const extractedContent = [];
    let currentGroup;
    let skip = false;

    for (let i = 0; i < parentElement.children.length; i++) {
        const child = parentElement.children[i]

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
                const total = parseFloat(parentElement.children[i+1].children[1].textContent);

                currentGroup.push({
                    item: child.children[0].textContent,
                    qty: qty,
                    price: price,
                    total: total,
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

    return extractedContent.length ? extractedContent : "Could not find the data groups.";
}

// Обработчик клика для кнопки "Send to Google Sheets"
async function handleSendToSheetsClick() {
    await signIn();  // Запрашиваем авторизацию перед отправкой данных
}

// Функция для отправки данных в Google Sheets
async function sendDataToSheets(data) {
    const {isConfirmed} = await Swal.fire({
        title: 'Create a new Google Sheets document?',
        showCancelButton: true,
        confirmButtonText: 'Yes',
        cancelButtonText: 'No (use an existing one)',
    });

    if (isConfirmed) {
        createSpreadsheet(data);
    } else {
        const {value: spreadsheetId} = await Swal.fire({
            title: 'Insert ID of an existing document',
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
                range: `${sheetName}!A1:E1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['Item', 'Date', 'Qty', 'Price', 'Total']],
                },
            });
        }).catch((err) => {
            console.error("Error on adding sheet:", err);
            Swal.fire({
                title: "Could not create a sheet",
                icon: "error"
            });
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
                range: `${sheetName}!A1:E1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['Item', 'Date', 'Qty', 'Price', 'Total']],
                },
            });
        }
    }

    // Добавляем данные
    const dateValue = `${data[4][0].split(' ')[1]} ${data[4][1].split(' ')[1]}`; // Объединяем дату и время
    const values = data[0].map(item => ([
        item.item,
        dateValue,
        item.qty,
        item.price,
        item.total,
    ]));

    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A2`, // Начинаем с A2, чтобы не перезаписывать заголовки
        valueInputOption: 'RAW',
        resource: {
            values: values,
        },
    });
    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId;
    Swal.fire({
        title: "All the data has been added successfully!",
        html: `<a href="${spreadsheetUrl}" target="_blank">Open Spreadsheet</a>`,
        icon: "success"
    });
}

// Функция для создания нового документа в Google Sheets
async function createSpreadsheet(data) {
    if (!gapiInited) {
        console.error('Google API not initialized');
        Swal.fire({title: "Google API not initialized", icon: "error"});
        return;
    }

    try {
        const dateValue = `${data[4][0].split(' ')[1]} ${data[4][1].split(' ')[1]}`; // Объединяем дату и время
        const response = await gapi.client.sheets.spreadsheets.create({
            properties: {
                title: "Abobus " + new Date().toJSON()
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
                                        {userEnteredValue: {stringValue: "Item"}},
                                        {userEnteredValue: {stringValue: "Date"}},
                                        {userEnteredValue: {stringValue: "Qty"}},
                                        {userEnteredValue: {stringValue: "Price"}},
                                        {userEnteredValue: {stringValue: "Total"}},
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const spreadsheetUrl = response.result.spreadsheetUrl;
        console.log("Document created:", response);
        Swal.fire({
            title: "New document successfully created",
            html: `<a href="${spreadsheetUrl}" target="_blank">Open Spreadsheet</a>`,
            icon: "success",
        });

        const values = data[0].map(item => ([
            item.item,
            dateValue,
            item.qty,
            item.price,
            item.total,
        ]));

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: response.result.spreadsheetId,
            range: "Data!A2",
            valueInputOption: 'RAW',
            resource: {
                values: values,
            },
        });

    } catch (error) {
        console.error("Could not create a new document:", error);
        Swal.fire({title: "Could not create a new document", icon: "error"});
    }
}

// Google API initialization and authorization
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
    } catch (error) {
        console.error('Google API initialization error:', error);
        Swal.fire({title: "Could not initialize Google API", icon: "error"});
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
            try {
                if (resp.error) {
                    throw new Error(resp.error);
                }
                await sendDataToSheets(checkData);
            } catch (error) {
                console.error(error)
                Swal.fire({
                        title: "Google Sheets error",
                        text: JSON.stringify(JSON.parse(error.body).error),
                        icon: "error"
                    }
                )
            }
        },
    });
    gisInited = true;
}

async function signIn() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

init();

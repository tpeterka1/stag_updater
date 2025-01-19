const axios = require('axios');
const fs = require('fs');
const ini = require('ini');
const iconv = require('iconv-lite');
const path = require('path');
const yesno = require('yesno');
const inquirer = require('inquirer');
const png = require('pngjs').PNG;
const bmp = require('bmp-ts');

const settingsFile = './stag_updater_settings.ini';

async function getStagDirectory() {
    let stagDirectory;

    if (fs.existsSync(settingsFile)) {
        const config = ini.parse(fs.readFileSync(settingsFile, 'utf-8'));
        stagDirectory = config.settings.stagDirectory;

        const confirmation = await yesno(
            {
                question: `Je složka se Stag: ${stagDirectory} správná? (Y/N)`,
                invalid: function ({ question, defaultValue, yesValues, noValues }) {
                    console.log(`Neplatná odpověď. (Y-ano/N-ne)`)
                }
            }
        );

        if (!confirmation) {
            stagDirectory = await promptForDirectory();
        }
    } else {
        stagDirectory = await promptForDirectory();
    }

    // Save the directory to the settings file
    const config = { settings: { stagDirectory } };
    fs.writeFileSync(settingsFile, ini.stringify(config));

    return stagDirectory;
}

async function promptForDirectory() {
    let isCorrect = false;
    let directory;

    while (!isCorrect) {
        const response = await inquirer.prompt([
            {
                type: 'input',
                name: 'directory',
                message: 'Vložte cestu ke složce se Stag (složka se stag.exe):',
                validate: input => (fs.existsSync(input) && fs.lstatSync(input).isDirectory && fs.existsSync(path.join(input, "stag.exe"))) || 'Byla zadána špatná cesta, ujistěte se, že jste zadali cestu ke složce s programem stag.exe'
            }
        ]);

        directory = response.directory;

        const confirmation = await yesno(
            {
                question: `Je složka se Stag: ${stagDirectory} správná? (Y/N)`,
                invalid: function ({ question, defaultValue, yesValues, noValues }) {
                    console.log(`Neplatná odpověď. (Y-ano/N-ne)`)
                }
            }
        );

        isCorrect = confirmation;
    }

    return directory;
}

let stagDirectory = path.resolve(__dirname, '..'); // Stag adresář

// https://github.com/npm/ini/issues/22#issuecomment-1426581205
function flattenIniObject(obj)
{
    function _flattenIniObject(obj, topLevel = [], resp = {}) {
        let props = {};
        for(let key in obj) {
            if(typeof obj[key] == 'object') {
                topLevel.push(key);
                resp = { ...resp, ..._flattenIniObject(obj[key], topLevel, resp)}
            }
            else
                props[key] = obj[key];
        }

        const topLevelName = topLevel.join(".");
        if(topLevelName !== '' && Object.keys(props).length > 0)
            resp = { ...resp, [topLevelName]: props}

        topLevel.pop();
        return resp;
    }

    return _flattenIniObject(obj);
}

function readIniFile(filePath) {
    const rawData = fs.readFileSync(filePath);
    const decodedData = iconv.decode(rawData, 'windows-1250');
    const iniData = ini.parse(decodedData);

    const flat = flattenIniObject(iniData);
    return flat;
}

let vozy = "";
let stagINI = "";
let baseUrl = 'https://stag.jachyhm.cz/vini/';

async function getServerVersion() {
    try {
        const localVersion = parseInt(vozy.default._verze || '100');
        console.log(`Verze definice na tomto PC: ${localVersion}`)
        console.log('Zjišťuji novou verzi definice...');

        const response = await axios.get(`${baseUrl}getversion.php`);
        const serverVersion = parseInt(response.data.split('\n')[0]);

        console.log(`Verze definice na serveru: ${serverVersion}`)

        if (localVersion < serverVersion) {
            console.log('Na serveru je novější verze definice vozů');
        } else {
            console.log('Máte aktuální verzi definice vozů');
        }

    } catch (error) {
        console.error('Chyba/Error:', error.message);
    }
}

async function downloadDefinitions() {
    console.log("Stahuji novou definici vozů...")
    try {
        const response = await axios.get(`${baseUrl}getvini.php`, { responseType: 'arraybuffer' });
        console.log('Definice stažena... - aktualizuji')

        // Save the new definitions to the local ini file
        const decodedData = iconv.decode(response.data, 'windows-1250'); // nejdřív dekódujeme do UTF-8 pro ini parser
        vozyNotFlat = ini.parse(decodedData);
        vozy = flattenIniObject(vozyNotFlat);
        const encodedData = iconv.encode(decodedData, 'windows-1250'); // zakódujeme zpátky do win-1250 pro zápis do souboru (nevim jestli by nešlo prostě zapsat celej response.data bez úprav)
        fs.writeFileSync(path.join(stagDirectory, 'vozy/vozy.ini'), encodedData);

        await downloadCarImages();

    } catch (error) {
        console.error('Chyba/Error:', error.message);
    }
}

// Helper function to format log lines with consistent alignment
function formatLogLine(logMessage, current, total) {
    const maxLogWidth = 80; // Maximum width of the log message
    const percentage = ((current / total) * 100).toFixed(2);
    const paddedMessage = logMessage.padEnd(maxLogWidth, '.');
    return `${paddedMessage}${percentage.padStart(6, '.')}%`;
}

function convertRGBAToABGR(rgbaBuffer) {
    if (rgbaBuffer.length % 4 !== 0) {
        throw new Error("Invalid RGBA buffer length.");
    }

    const abgrBuffer = Buffer.alloc(rgbaBuffer.length);

    for (let i = 0; i < rgbaBuffer.length; i += 4) {
        // RGBA to ABGR
        const r = rgbaBuffer[i];     // Red
        const g = rgbaBuffer[i + 1]; // Green
        const b = rgbaBuffer[i + 2]; // Blue
        //const a = rgbaBuffer[i + 3]; // Alpha - celá černá, takže neni potřeba brát ji z png

        abgrBuffer[i] = 0;     // Alpha - celá černá, takže 0
        abgrBuffer[i + 1] = b; // Blue
        abgrBuffer[i + 2] = g; // Green
        abgrBuffer[i + 3] = r; // Red
    }

    return abgrBuffer;
}

async function downloadCarImages() {
    console.log('Stahuji nové obrázky vozů, jsou-li dostupné...');

    const sections = Object.keys(vozy).filter(section => section !== 'default');
    const totalSections = sections.length;

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];

        const imgId = vozy[section].img;
        if (imgId && imgId !== '-1') {
            let imageIndex = 0;

            try {
                do {
                    const logMessage = `Stahuji obrázek pro vůz ${section} (id: ${imgId}, img: ${imageIndex})...`
                    const logLine = formatLogLine(logMessage, i + 1, totalSections);
                    console.log(logLine);

                    const response = await axios.get(
                        `${baseUrl}getimg.php`,
                        {
                            params: {
                                obrid: imageIndex,
                                id: imgId
                            },
                            responseType: 'arraybuffer'
                        }
                    );

                    // Přečteme buffer png a dekódujeme raw image byty
                    const buffer = Buffer.from(response.data);
                    const decodedPng = png.sync.read(buffer);

                    // Převrátíme channely z RGBA do ABGR (pro BMP enkodér)
                    decodedPng.data = convertRGBAToABGR(decodedPng.data);

                    // Uložíme raw image byty (s převrácenými channely do 32bit BMP)
                    const bmpData = {
                        data: decodedPng.data,
                        width: decodedPng.width,
                        height: decodedPng.height,
                        bitPP: 32
                    };
                    const encodedBmp = bmp.encode(bmpData);

                    // Z nějakýho důvodu BMP enkodér přidává na konec 2 01 01 byty, takže je odebereme a rekalkulujeme image size byty v headerech
                    if (encodedBmp.data.length >= 2) {
                        encodedBmp.data = encodedBmp.data.subarray(0, encodedBmp.data.length - 2);
                    }
                    
                    // Update file size in the header (offset 0x2, 4 bytes)
                    const newFileSize = encodedBmp.data.length;
                    encodedBmp.data.writeUInt32LE(newFileSize, 2);
                    
                    // Update image size in the header (offset 0x22, 4 bytes)
                    const newImageSize = decodedPng.width * decodedPng.height * 4; // 4 bytes per pixel
                    encodedBmp.data.writeUInt32LE(newImageSize, 0x22);

                    // Uložíme BMP
                    const fileName = imageIndex === 0
                        ? `vuz_${section}.bmp`
                        : `vuz__${imageIndex}_${section}.bmp`;

                    fs.writeFileSync(path.join(stagDirectory, 'vozy', fileName), encodedBmp.data);

                    imageIndex++;
                } while (imageIndex <= parseInt(vozy[section].imgex || '0'));

            } catch (error) {
                console.error(`Chyba při stahování vozu ${section} (id: ${imgId}, img: ${imageIndex}):`, error.message);
            }
        }
    }

    console.log('Update - hotovo');
}

async function deleteOldImages() {
    const vozyFolder = path.join(stagDirectory, 'vozy')
    fs.readdir(vozyFolder, (err, files) => {
        if (err) {
            return console.error(`Chyba čtení adresáře s vozy: ${err.message}`);
        }

        files.forEach(file => {
            if (path.extname(file).toLowerCase() === '.bmp') {
                const filePath = path.join(vozyFolder, file);
                fs.unlink(filePath, err => {
                    if (err) {
                        console.error(`Chyba mazání souboru ${file}: ${err.message}`);
                    } else {
                        //console.log(`Smazán soubor: ${file}`);
                    }
                });
            }
        });
    });
}

async function main() {
    console.log("==================================================")
    console.log("            AKTUALIZÁTOR DEFINIC VOZŮ             ")
    console.log("Neoficiální aplikace na aktualizování STAG definic")
    console.log("    Před aktualizací doporučuji udělat ZÁLOHU!    ")
    console.log("            Autoři: tpeterka1, ChatGPT            ")
    console.log("==================================================")

    stagDirectory = await getStagDirectory();
    vozy = readIniFile(path.join(stagDirectory, 'vozy/vozy.ini')) || "";
    stagINI = readIniFile(path.join(stagDirectory, 'stag.ini')) || "";
    baseUrl = stagINI.update.base || 'https://stag.jachyhm.cz/vini/';

    await getServerVersion();

    const download = await yesno({
        question: 'Stáhnout? (Y/N)',
        invalid: function ({ question, defaultValue, yesValues, noValues }) {
            console.log('Neplatná odpověď. (Y-ano/N-ne)')
        }
    })
    if (!download) process.exit();

    const wipeDir = await yesno({
        question: 'Smazat starou definici (doporučeno)? (Y/N)',
        invalid: function ({ question, defaultValue, yesValues, noValues }) {
            console.log('Neplatná odpověď. (Y-ano/N-ne)')
        }
    })
    if (wipeDir) {
        console.log("Mažu starou definici...")
        await deleteOldImages();
        console.log("Stará definice smazána")
    }

    await downloadDefinitions();

    console.log('Definice vozů byla aktualizována.');

    const konec = await yesno({
        question: 'Ukončit aplikaci? (Y/N)',
        invalid: function ({ question, defaultValue, yesValues, noValues }) {
            console.log('Neplatná odpověď. (Y-ano/N-ne)')
        }
    })
}

main().catch(error => console.error('Chyba/Error:', error));

const axios = require('axios');
const fs = require('fs');
const ini = require('ini');
const iconv = require('iconv-lite');
const path = require('path');
const yesno = require('yesno');
const inquirer = require('inquirer');

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

function readIniFile(filePath) {
    const rawData = fs.readFileSync(filePath);
    const decodedData = iconv.decode(rawData, 'windows1250');
    return ini.parse(decodedData);
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
        const response = await axios.get(`${baseUrl}getvini.php`);
        console.log('Definice stažena... - aktualizuji')

        // Save the new definitions to the local ini file
        const decodedData = iconv.decode(Buffer.from(response.data), 'windows1250');
        fs.writeFileSync(path.join(stagDirectory, 'vozy/vozy.ini'), decodedData);

        vozy = ini.parse(decodedData);

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

                    const fileName = imageIndex === 0
                        ? `vuz_${section}.bmp`
                        : `vuz__${imageIndex}_${section}.bmp`;

                    fs.writeFileSync(path.join(stagDirectory, 'vozy', fileName), response.data);

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

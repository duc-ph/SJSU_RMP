chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkForUpdates') {
        console.log('Received message to check for updates.');
        // Wrap the async function in a Promise
        (async () => {
            try {
                await checkAndUpdateData();
                sendResponse({ status: 'Update process completed' }); // Send the response after completion
            } catch (error) {
                console.error('Error during update:', error);
                sendResponse({ status: 'Update process failed', error: error.message });
            }
        })();

        // Ensure the message channel stays open for the asynchronous sendResponse
        return true;
    }
});

async function fetchFileList() {
    const url = 'https://api.github.com/repos/thiel-ph/SJSU_RMP/contents/teacher_data';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch file list');
    return await response.json();
}

function extractDateFromFilename(filename) {
    const match = filename.match(/^(\d{8})_.*_current\.json$/);
    return match ? match[1] : null;
}

async function downloadJsonFile(fileUrl) {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Failed to download JSON file');
    return await response.json();
}

async function checkAndUpdateData() {
    try {
        const files = await fetchFileList();
        const currentFile = files.find(file => extractDateFromFilename(file.name) !== null);
        
        if (!currentFile) {
            console.log('No current file found.');
            return;
        }

        const currentVersion = extractDateFromFilename(currentFile.name);

        chrome.storage.local.get(['data_version', 'teacher_data'], async function(result) {
            const storedVersion = result.data_version;

            if (!storedVersion || storedVersion < currentVersion) {
                const jsonData = await downloadJsonFile(currentFile.download_url);

                chrome.storage.local.set({
                    data_version: currentVersion,
                    teacher_data: jsonData
                }, function() {
                    console.log('Data updated successfully.');
                });
            } else {
                console.log('Data is up-to-date.');
            }
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

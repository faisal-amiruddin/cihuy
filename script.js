// Fungsi untuk mencetak pesan ke Console Output
function printToConsole(message, type = 'info') {
    const consoleOutput = document.getElementById('console-output');
    const messageElement = document.createElement('div');
    messageElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    // Tambahkan warna berdasarkan jenis pesan
    switch (type) {
        case 'error':
            messageElement.style.color = '#ED4245'; // Merah untuk error
            break;
        case 'success':
            messageElement.style.color = '#43B581'; // Hijau untuk sukses
            break;
        default:
            messageElement.style.color = '#FFFFFF'; // Putih untuk info
    }

    consoleOutput.appendChild(messageElement);
    consoleOutput.scrollTop = consoleOutput.scrollHeight; // Auto-scroll ke bawah
}

// Event listener untuk tombol "Start Bot"
document.getElementById('start-btn').addEventListener('click', async () => {
    const licenseKey = document.getElementById('license-key').value;
    const botToken = document.getElementById('bot-token').value;
    const botPrefix = document.getElementById('bot-prefix').value;
    const ownerIds = document.getElementById('owner-ids').value.split(',').map(id => id.trim());
    const historyChannelId = document.getElementById('history-id').value;
    const donationChannelId = document.getElementById('donation-id').value;
    const stockChannelId = document.getElementById('stock-id').value;
    const storeBanner = document.getElementById('banner-url').value;
    const mongoUri = document.getElementById('mongodb-url').value;

    // Validasi license key
    printToConsole('Validating license key...');
    const licenseResponse = await fetch('http://localhost:3000/validate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey }),
    });
    const licenseResult = await licenseResponse.json();

    if (!licenseResult.valid) {
        printToConsole(`License Error: ${licenseResult.message}`, 'error');
        return;
    }

    printToConsole('License is valid. Starting bot...', 'success');

    // Start bot
    const botResponse = await fetch('http://localhost:3000/start-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: botToken,
            prefix: botPrefix,
            ownerIds: ownerIds,
            historyChannelId: historyChannelId,
            donationChannelId: donationChannelId,
            stockChannelId: stockChannelId,
            storeBanner: storeBanner,
            mongoUri: mongoUri,
        }),
    });
    const botResult = await botResponse.json();

    if (botResult.success) {
        printToConsole(`Bot started successfully: ${botResult.message}`, 'success');
    } else {
        printToConsole(`Error starting bot: ${botResult.message}`, 'error');
    }
});

// Event listener untuk tombol "Stop Bot"
document.getElementById('stop-btn').addEventListener('click', async () => {
    printToConsole('Stopping bot...');
    const response = await fetch('http://localhost:3000/stop-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();

    if (result.success) {
        printToConsole('Bot stopped successfully.', 'success');
    } else {
        printToConsole(`Error stopping bot: ${result.message}`, 'error');
    }
});
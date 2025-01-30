const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Colors } = require('discord.js');
const cors = require('cors');
const app = express();
const port = 3000;


// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the "frontend" folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Environment variables
require('dotenv').config();
const LICENSE_DB_URI = process.env.LICENSE_DB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Discord Bot
let botClient = null;
let maintenanceMode = false;

// MongoDB Collections
let collection, collection_products, collection_depo, order_collection;

// Validate License
app.post('/validate-license', async (req, res) => {
    const { licenseKey } = req.body;
    try {
        const client = new MongoClient(LICENSE_DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        const db = client.db("license_db");
        const collection = db.collection("licenses");
        const licenseData = await collection.findOne({ license: licenseKey });

        if (!licenseData) {
            return res.status(400).json({ valid: false, message: "License invalid" });
        }

        if (!licenseData.active) {
            return res.status(400).json({ valid: false, message: "License inactive" });
        }

        const hwid = require('node-machine-id').machineIdSync();
        if (licenseData.hwid !== hwid) {
            return res.status(400).json({ valid: false, message: `HWID mismatch | your HWID: ${hwid}` });
        }

        res.json({ valid: true, message: "License valid" });
    } catch (e) {
        res.status(500).json({ valid: false, message: `Connection error: ${e.message}` });
    }
});

// Start Discord Bot
app.post('/start-bot', async (req, res) => {
    const { token, prefix, ownerIds, historyChannelId, donationChannelId, stockChannelId, storeBanner, mongoUri } = req.body;

    if (botClient) {
        return res.status(400).json({ success: false, message: "Bot is already running." });
    }

    try {
        // Connect to MongoDB
        const mongoClient = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
        await mongoClient.connect();
        const db = mongoClient.db("discord");
        collection = db.collection("users");
        collection_products = db.collection("products");
        collection_depo = db.collection("depo");
        order_collection = db.collection("orders");

        // Initialize Discord Bot
        botClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [
                Partials.Message,
                Partials.Channel,
                Partials.Reaction,
            ],
            help_command: null, // Remove default help command
        });

        // Event: Bot is ready
        botClient.on('ready', () => {
            console.log(`Bot is ready as ${botClient.user.tag}`);
            res.json({ success: true, message: `Bot started as ${botClient.user.tag}` });
        });

        // Event: Message Create
        botClient.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Handle Donation Channel
            if (message.channel.id === donationChannelId && message.webhookId) {
                await updateBalance(message);
            }

            // Handle Commands
            if (message.content.startsWith(prefix)) {
                const args = message.content.slice(prefix.length).trim().split(/ +/);
                const command = args.shift().toLowerCase();

                // Maintenance Mode Check
                if (maintenanceMode && !ownerIds.includes(message.author.id)) {
                    await message.reply('Bot is under maintenance. Please try again later.');
                    return;
                }

                // Command: help
                if (command === 'help') {
                    await helpCommand(message, prefix, ownerIds, storeBanner);
                }

                // Command: setuser
                if (command === 'setuser') {
                    await setUserCommand(message, args, ownerIds);
                }

                // Command: set
                if (command === 'set') {
                    await setCommand(message, args);
                }

                // Command: bal
                if (command === 'bal') {
                    await balCommand(message);
                }

                // Command: info
                if (command === 'info') {
                    await infoCommand(message, args, ownerIds);
                }

                // Command: addbal
                if (command === 'addbal') {
                    await addBalCommand(message, args, ownerIds);
                }

                // Command: addsaldo
                if (command === 'addsaldo') {
                    await addSaldoCommand(message, args, ownerIds);
                }

                // Command: addp
                if (command === 'addp') {
                    await addProductCommand(message, args, ownerIds);
                }

                // Command: adds
                if (command === 'adds') {
                    await addStockCommand(message, args, ownerIds);
                }

                // Command: stock
                if (command === 'stock') {
                    await stockCommand(message, ownerIds, storeBanner);
                }

                // Command: buy
                if (command === 'buy') {
                    await buyCommand(message, args, historyChannelId);
                }

                // Command: changeprice
                if (command === 'changeprice') {
                    await changePriceCommand(message, args, ownerIds);
                }

                // Command: changerp
                if (command === 'changerp') {
                    await changeRpCommand(message, args, ownerIds);
                }

                // Command: changename
                if (command === 'changename') {
                    await changeNameCommand(message, args, ownerIds);
                }

                // Command: remove
                if (command === 'remove') {
                    await removeCommand(message, args, ownerIds);
                }

                // Command: depo
                if (command === 'depo') {
                    await depoCommand(message);
                }

                // Command: changeworld
                if (command === 'changeworld') {
                    await changeWorldCommand(message, args, ownerIds);
                }

                // Command: send
                if (command === 'send') {
                    await sendCommand(message, args, ownerIds, historyChannelId);
                }

                // Command: setmt
                if (command === 'setmt') {
                    await setMaintenanceCommand(message, ownerIds);
                }
            }
        });

        // Login Bot
        botClient.login(token);
    } catch (e) {
        res.status(500).json({ success: false, message: `Error starting bot: ${e.message}` });
    }
});

// Stop Discord Bot
app.post('/stop-bot', async (req, res) => {
    if (!botClient) {
        return res.status(400).json({ success: false, message: "No bot is running." });
    }

    try {
        await botClient.destroy();
        botClient = null;
        res.json({ success: true, message: "Bot stopped successfully." });
    } catch (e) {
        res.status(500).json({ success: false, message: `Error stopping bot: ${e.message}` });
    }
});

// Route untuk root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// ====================================================
// Helper Functions for Commands
// ====================================================

async function updateBalance(webhookMessage) {
    if (webhookMessage.embeds && webhookMessage.embeds.length > 0) {
        const embed = webhookMessage.embeds[0];
        const description = embed.description;

        // Regex untuk mengekstrak GrowID, jumlah, dan jenis item
        const growIdMatch = description.match(/GrowID: (\S+)\nDeposit: (\d+) (World Lock|Diamond Lock)/);
        const saweriaMatch = embed.title?.match(/(\S+) melakukan Top Up via Saweria sebanyak Rp ([\d.]+)/);

        if (growIdMatch) {
            const growId = growIdMatch[1].toLowerCase();
            const total = parseInt(growIdMatch[2]);
            const item = growIdMatch[3];

            let newBalance = total;
            if (item === 'Diamond Lock') {
                newBalance *= 100; // Konversi Diamond Lock ke World Lock
            }

            // Cari pengguna di database
            const user = await collection.findOne({ name: { $regex: `^${growId}$`, $options: 'i' } });

            if (user) {
                const userObj = await botClient.users.fetch(user.user);
                const updatedBalance = user.balance + newBalance;
                const updatedBalanceHistory = user.balance_history + newBalance;

                // Update balance di database
                await collection.updateOne(
                    { name: { $regex: `^${growId}$`, $options: 'i' } },
                    { $set: { balance: updatedBalance, balance_history: updatedBalanceHistory } }
                );

                // Format balance untuk ditampilkan
                const formattedBalance = updatedBalance.toLocaleString('id-ID').replace(/,/g, '.');

                // Kirim pesan ke pengguna
                await userObj.send(
                    `Success Adding **${total} ${item}** to **${growId}**\nNow Your Balance is **${formattedBalance}** <:emoji_9:1071815138430160997>`
                );

                // Kirim pesan ke channel donasi
                await webhookMessage.channel.send(
                    `Success Adding **${total} ${item}** to **${growId}**\nNow Your Balance is **${formattedBalance}** <:emoji_9:1071815138430160997>`
                );
            } else {
                await webhookMessage.channel.send("User not found in database");
            }
        } else if (saweriaMatch) {
            const growId = saweriaMatch[1].toLowerCase();
            const totalStr = saweriaMatch[2].replace(/\./g, '');
            const total = parseInt(totalStr);

            // Cari pengguna di database
            const user = await collection.findOne({ name: { $regex: `^${growId}$`, $options: 'i' } });

            if (user) {
                const userObj = await botClient.users.fetch(user.user);
                const updatedSawer = user.sawer + total;

                // Update saldo Saweria di database
                await collection.updateOne(
                    { name: { $regex: `^${growId}$`, $options: 'i' } },
                    { $set: { sawer: updatedSawer } }
                );

                // Format saldo untuk ditampilkan
                const formattedTotal = total.toLocaleString('id-ID').replace(/,/g, '.');
                const formattedSawer = updatedSawer.toLocaleString('id-ID').replace(/,/g, '.');

                // Kirim pesan ke pengguna
                await userObj.send(
                    `Berhasil TopUp **Rp ${formattedTotal}**\nSekarang Saldo ${growId} ada **Rp ${formattedSawer}**`
                );

                // Kirim pesan ke channel donasi
                await webhookMessage.channel.send(
                    `Berhasil TopUp **Rp ${formattedTotal}**\nSekarang Saldo ${growId} ada **Rp ${formattedSawer}**`
                );
            } else {
                await webhookMessage.channel.send("User not found in database");
            }
        }
    }
}

async function helpCommand(message, prefix, ownerIds, storeBanner) {
    let commands = [
        `${prefix}help - Menampilkan daftar perintah.`,
        `${prefix}set <growid> - Mengatur GrowID Anda.`,
        `${prefix}bal - Menampilkan saldo Anda.`,
        `${prefix}depo - Menampilkan informasi deposit.`,
        `${prefix}info [@user] - Menampilkan informasi pengguna.`,
        `${prefix}stock - Menampilkan daftar produk yang tersedia.`,
        `${prefix}buy <code product> <amount> - Membeli produk.`,
        // Tambahkan perintah lain sesuai kebutuhan
    ];

    if (ownerIds.includes(message.author.id)) {
        commands.push(
            `${prefix}setmt - Mengatur mode pemeliharaan.`,
            `${prefix}addbal <@tag user> <total balance> - Menambahkan saldo ke pengguna.`,
            `${prefix}setuser <@mention> <growid> - Mengatur GrowID untuk pengguna tertentu.`,
            `${prefix}send <@mention> <code> <amount> - Mengirim produk ke pengguna.`
            // Tambahkan perintah pemilik lainnya sesuai kebutuhan
        );
    }

    const embed = new EmbedBuilder()
        .setTitle("Daftar Perintah")
        .setColor(0x00FF00)
        .setDescription(commands.join("\n"))
        .setImage(storeBanner);

    await message.reply({ embeds: [embed] });
}

async function setUserCommand(message, args, ownerIds) {
    if (!ownerIds.includes(message.author.id)) {
        return await message.reply("Anda tidak memiliki izin untuk menggunakan perintah ini.");
    }

    if (args.length < 2) {
        return await message.reply("Format perintah tidak valid. Gunakan: `setuser <@mention> <growid>`");
    }

    const member = message.mentions.members.first();
    const growId = args.slice(1).join(" ");

    if (!member) {
        return await message.reply("Pengguna tidak ditemukan. Silakan sebutkan pengguna yang valid.");
    }

    // Logika untuk menyimpan GrowID ke database
    const userBalance = 0;
    const balanceHistory = 0;
    const sawer = 0;
    const userId = member.id;

    const existingUser  = await collection.findOne({ name: { $regex: `^${growId}$`, $options: 'i' } });

    if (existingUser ) {
        return await message.reply(`Nama '${growId}' sudah digunakan. Silakan pilih nama lain.`);
    }

    const user = await collection.findOne({ user: userId });

    if (user) {
        await collection.updateOne({ user: userId }, { $set: { name: growId } });
    } else {
        const userData = { user: userId, name: growId, balance: userBalance, sawer: sawer, balance_history: balanceHistory };
        await collection.insertOne(userData);
    }

    await message.reply(`GrowID untuk ${member} telah diatur menjadi: ${growId}`);
}

async function setCommand(message, args) {
    if (args.length < 1) {
        return await message.reply("Format perintah tidak valid. Gunakan: `set <growid>`");
    }

    const growId = args.join(" ");
    const userId = message.author.id;

    const existingUser  = await collection.findOne({ name: { $regex: `^${growId}$`, $options: 'i' } });

    if (existingUser ) {
        return await message.reply(`Nama '${growId}' sudah digunakan. Silakan pilih nama lain.`);
    }

    const user = await collection.findOne({ user: userId });

    if (user) {
        await collection.updateOne({ user: userId }, { $set: { name: growId } });
    } else {
        const userData = { user: userId, name: growId, balance: 0, sawer: 0, balance_history: 0 };
        await collection.insertOne(userData);
    }

    await message.reply(`GrowID Anda telah diatur menjadi: ${growId}`);
}

async function balCommand(message) {
    const userId = message.author.id;
    const user = await collection.findOne({ user: userId });

    if (!user) {
        return await message.reply("Anda belum memiliki akun. Silakan gunakan perintah `set <growid>` terlebih dahulu.");
    }

    const embed = new EmbedBuilder()
        .setTitle("Saldo Anda")
        .setColor(0x00FF00)
        .setDescription(`**Saldo:** ${user.balance}\n**Total Deposit:** ${user.balance_history}`);

    await message.reply({ embeds: [embed] });
}

async function infoCommand(message, args, ownerIds) {
    // Implementasi info command
}

async function addBalCommand(message, args, ownerIds) {
    // Implementasi addbal command
}

async function addSaldoCommand(message, args, ownerIds) {
    // Implementasi addsaldo command
}

async function addProductCommand(message, args, ownerIds) {
    // Implementasi addp command
}

async function addStockCommand(message, args, ownerIds) {
    // Implementasi adds command
}

async function stockCommand(message, ownerIds, storeBanner) {
    // Implementasi stock command
}

async function buyCommand(message, args, historyChannelId) {
    // Implementasi buy command
}

async function changePriceCommand(message, args, ownerIds) {
    // Implementasi changeprice command
}

async function changeRpCommand(message, args, ownerIds) {
    // Implementasi changerp command
}

async function changeNameCommand(message, args, ownerIds) {
    // Implementasi changename command
}

async function removeCommand(message, args, ownerIds) {
    // Implementasi remove command
}

async function depoCommand(message) {
    // Implementasi depo command
}

async function changeWorldCommand(message, args, ownerIds) {
    // Implementasi changeworld command
}

async function sendCommand(message, args, ownerIds, historyChannelId) {
    // Implementasi send command
}

async function setMaintenanceCommand(message, ownerIds) {
    // Implementasi setmt command
}
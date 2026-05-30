require('dotenv').config();

const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const cors = require('cors');
const basicAuth = require('express-basic-auth');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(basicAuth({
    users: { 
        [process.env.BASIC_AUTH_USER || 'admin']: process.env.BASIC_AUTH_PASS || 'changeme'
    },
    challenge: true,
    realm: 'Selfbot Dashboard'
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DISBOARD_ID = "302050872383242240";
const COMMAND_NAME = "bump";

// Channels where the bot will occasionally chat to look human
const activityChannels = [
    {
        name: "General Chat 1",
        channelId: "ACTIVITY_CHANNEL_ID_HERE"
    }
];

const activityMessages = [
    "hello",
    "how is everyone doing?",
    "what's up",
    "anyone playing games later?",
    "lol true",
    "fr",
    "same",
    "bruh",
    "im bored"
];

// Default servers configuration
let servers = [
    {
        name: "Server 1",
        channelId: "CHANNEL_ID_1_HERE"
    },
    {
        name: "Server 2",
        channelId: "CHANNEL_ID_2_HERE"
    },
    {
        name: "Server 3",
        channelId: "CHANNEL_ID_3_HERE"
    }
];

const DATA_FILE = path.join(__dirname, 'servers.json');
const STATS_FILE = path.join(__dirname, 'stats.json');

// Load saved servers or create file
if (fs.existsSync(DATA_FILE)) {
    try {
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        servers = JSON.parse(rawData);
    } catch (e) {
        console.error("❌ Failed to parse servers.json, using defaults.");
    }
} else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
}

const easterEggs = [
    "im abt to bump 👀",
    "bumping...",
    "stay away a fart bump is coming 💨",
    "mind ur own bumping",
    "fatbump incoming 🔥",
    "kys bumpers",
    "bumpy bum the bumping bum",
    "brophet bumhoamad has arrived 🙏",
    "time for the holy bump",
    "big bump energy",
    "bump lord is here"
];

// Analytics tracking — load from disk so counts survive restarts
let globalStats = { totalBumps: 0, failedBumps: 0 };
if (fs.existsSync(STATS_FILE)) {
    try {
        globalStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        console.log(`📊 Loaded stats: ${globalStats.totalBumps} bumps, ${globalStats.failedBumps} failed`);
    } catch (e) { /* ignore, start fresh */ }
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(globalStats, null, 4));

// Parse multiple tokens
const tokensStr = process.env.TOKENS || process.env.TOKEN;
const tokens = tokensStr ? tokensStr.split(',').map(t => t.trim()).filter(Boolean) : [];

if (tokens.length === 0) {
    console.error("❌ No Discord tokens found in .env file (TOKEN or TOKENS).");
    process.exit(1);
}

// Map to keep track of each server's bump timer so we can cancel it
const bumpTimers = new Map();

// Initialize the bot pool
const botPool = tokens.map((token, index) => {
    return {
        id: index + 1,
        token: token,
        client: new Client(),
        ready: false,
        tag: 'Offline',
        lastBumpTime: 0,
        cooldownUntil: 0,
        error: null
    };
});

// Smart selection of next available bot
const getAvailableBot = (excludedBotIds = []) => {
    const now = Date.now();
    const available = botPool.filter(bot => bot.ready && now >= bot.cooldownUntil && !excludedBotIds.includes(bot.id));
    if (available.length === 0) return null;
    
    // Pick the bot that has the oldest lastBumpTime (i.e. least recently used)
    available.sort((a, b) => a.lastBumpTime - b.lastBumpTime);
    return available[0];
};

const scheduleNextBump = (server, customInterval = null) => {
    let nextInterval;
    if (customInterval !== null) {
        nextInterval = customInterval;
    } else {
        const randomMinutes = Math.floor(Math.random() * 30) + 1;
        nextInterval = (2 * 60 * 60 * 1000) + (randomMinutes * 60 * 1000);
    }

    server.nextBumpTime = Date.now() + nextInterval;
    console.log(`⏳ Next bump for ${server.name} in ${Math.round(nextInterval / 60000)} minutes`);
    
    if (bumpTimers.has(server.channelId)) {
        clearTimeout(bumpTimers.get(server.channelId));
    }

    const timerId = setTimeout(() => bumpServer(server), nextInterval);
    bumpTimers.set(server.channelId, timerId);
};

const bumpServer = async (server, excludedBotIds = []) => {
    const bot = getAvailableBot(excludedBotIds);
    if (!bot) {
        const readyBotsCount = botPool.filter(b => b.ready).length;
        if (readyBotsCount > 0 && excludedBotIds.length >= readyBotsCount) {
            console.log(`❌ [${server.name}] All online bots failed to bump. Scheduling next bump in 2 hours.`);
            server.lastStatus = "❌ All bots failed";
            scheduleNextBump(server);
            return;
        }

        console.log(`⏳ [${server.name}] No available bot accounts. Retrying in 1 minute...`);
        server.lastStatus = "⏳ Waiting for free bot";
        server.nextBumpTime = Date.now() + 60000;
        
        if (bumpTimers.has(server.channelId)) {
            clearTimeout(bumpTimers.get(server.channelId));
        }
        
        const timerId = setTimeout(() => bumpServer(server), 60000);
        bumpTimers.set(server.channelId, timerId);
        return;
    }

    const clientToUse = bot.client;
    const botShortTag = bot.tag.split('#')[0];
    console.log(`🤖 [${server.name}] Selected bot ${bot.tag} for this bump.`);

    try {
        const channel = await clientToUse.channels.fetch(server.channelId).catch(() => null);
        if (!channel) {
            console.log(`❌ [${server.name}] Could not find channel ${server.channelId} for bot ${bot.tag}. Retrying with another bot...`);
            excludedBotIds.push(bot.id);
            setTimeout(() => bumpServer(server, excludedBotIds), 2000);
            return;
        }

        // Send random easter egg
        const randomMsg = easterEggs[Math.floor(Math.random() * easterEggs.length)];
        await channel.send(randomMsg);
        console.log(`📢 [${server.name}] (${botShortTag}) Sent: ${randomMsg}`);

        // Small human-like delay
        await new Promise(r => setTimeout(r, Math.random() * 3000 + 1500));

        // Send actual /bump and wait for Disboard's response
        console.log(`🔄 [${server.name}] Sending /bump command using ${botShortTag}...`);
        await channel.sendSlash(DISBOARD_ID, COMMAND_NAME);

        // Wait up to 15 seconds for Disboard to reply
        const collected = await channel.awaitMessages({
            filter: (m) => m.author.id === DISBOARD_ID || (m.interaction && m.interaction.commandName === 'bump'),
            max: 1,
            time: 15000
        }).catch(() => null);

        if (collected && collected.size > 0) {
            const reply = collected.first();
            const content = (reply.content || '') + (reply.embeds?.map(e => e.description || '').join(' ') || '');
            
            const contentLower = content.toLowerCase();
            const successWords = ['bump done', 'bumped', 'erfolgreich', 'sucesso', 'éxito', 'succès', 'succes', 'başarılı', 'sukces', 'успешно', '成功'];
            const waitWords = ['wait', 'cooldown', 'minute', 'minuten', 'minutos', 'dakika', 'minut', 'warte', '分钟', '分'];

            if (successWords.some(w => contentLower.includes(w))) {
                console.log(`✅ [${server.name}] VERIFIED — Disboard confirmed bump!`);
                globalStats.totalBumps++;
                server.lastStatus = `✅ Verified (${botShortTag})`;
                bot.lastBumpTime = Date.now();
                bot.cooldownUntil = Date.now() + 31 * 60 * 1000; 
                saveStats();
                scheduleNextBump(server);
            } else if (waitWords.some(w => contentLower.includes(w))) {
                const matchMins = content.match(/(\d+)\s*(?:minute|minuten|minutos|minut|dakika|分钟|分)/i);
                let minutesToWait = 30;
                if (matchMins && matchMins[1]) {
                    minutesToWait = parseInt(matchMins[1], 10);
                }

                console.log(`⏰ [${server.name}] COOLDOWN — Disboard says wait ${minutesToWait} mins. Bot: ${botShortTag}`);
                globalStats.failedBumps++;
                
                if (minutesToWait <= 30) {
                    console.log(`🔄 [${server.name}] Bot ${botShortTag} is on user cooldown. Marking bot and retrying immediately with another bot...`);
                    bot.cooldownUntil = Date.now() + (minutesToWait * 60 * 1000) + 10000;
                    server.lastStatus = "⏰ Bot on cooldown, retrying next...";
                    saveStats();
                    setTimeout(() => bumpServer(server, excludedBotIds), 2000);
                } else {
                    console.log(`⏳ [${server.name}] Server is on cooldown for ${minutesToWait} mins. Rescheduling server.`);
                    server.lastStatus = `⏰ Server Cooldown (${minutesToWait}m)`;
                    saveStats();
                    scheduleNextBump(server, minutesToWait * 60 * 1000);
                }
            } else {
                console.log(`⚠️ [${server.name}] UNKNOWN response from Disboard: ${content.substring(0, 150)}`);
                globalStats.totalBumps++;
                server.lastStatus = `⚠️ Unverified (${botShortTag})`;
                bot.lastBumpTime = Date.now();
                bot.cooldownUntil = Date.now() + 31 * 60 * 1000;
                saveStats();
                scheduleNextBump(server);
            }
        } else {
            console.log(`❓ [${server.name}] NO RESPONSE — Disboard did not reply within 15s.`);
            globalStats.failedBumps++;
            server.lastStatus = "❓ No Response";
            saveStats();
            scheduleNextBump(server);
        }
    } catch (e) {
        console.error(`❌ [${server.name}] ERROR with bot ${botShortTag}: ${e.message}`);
        globalStats.failedBumps++;
        server.lastStatus = `❌ ${e.message.substring(0, 50)}`;
        saveStats();
        
        excludedBotIds.push(bot.id);
        setTimeout(() => bumpServer(server, excludedBotIds), 2000);
    }
};

const simulateActivity = async () => {
    if (activityChannels.length === 0) return;

    const randomConfig = activityChannels[Math.floor(Math.random() * activityChannels.length)];
    const readyBots = botPool.filter(b => b.ready);
    
    if (readyBots.length > 0) {
        const bot = readyBots[Math.floor(Math.random() * readyBots.length)];
        try {
            const channel = await bot.client.channels.fetch(randomConfig.channelId);
            if (channel) {
                const randomMsg = activityMessages[Math.floor(Math.random() * activityMessages.length)];
                await channel.send(randomMsg);
                console.log(`💬 [Activity] Bot ${bot.tag.split('#')[0]} sent to ${randomConfig.name}: ${randomMsg}`);
            }
        } catch (e) {
            console.error(`❌ [Activity] Error with bot ${bot.tag.split('#')[0]} in ${randomConfig.name}:`, e.message);
        }
    }

    const nextActivityMin = Math.floor(Math.random() * 30) + 15;
    setTimeout(simulateActivity, nextActivityMin * 60 * 1000);
};

let managerStarted = false;
const startManagerOnce = () => {
    if (managerStarted) return;
    managerStarted = true;
    console.log(`🔄 Multi-server auto bump manager started (${servers.length} servers configured)`);

    // Start initial servers with stagger
    for (let i = 0; i < servers.length; i++) {
        servers[i].lastStatus = "⏳ Waiting...";
        if (servers[i].channelId && !servers[i].channelId.includes("HERE")) {
            servers[i].nextBumpTime = Date.now() + (i * 8000);
            setTimeout(() => bumpServer(servers[i]), i * 8000);
        } else {
            servers[i].lastStatus = "⚠️ Not Configured";
        }
    }

    // Start activity simulation
    if (activityChannels.length > 0 && activityChannels[0].channelId !== "ACTIVITY_CHANNEL_ID_HERE") {
        simulateActivity();
    }
};

// Web API Endpoint to add new server
app.post('/api/add-server', async (req, res) => {
    const { inviteLink, channelId } = req.body;
    if (!inviteLink || !channelId) {
        return res.status(400).json({ error: "Missing inviteLink or channelId" });
    }

    try {
        let inviteCode = inviteLink;
        const match = inviteLink.match(/(?:discord\.gg\/|discord\.com\/invite\/)(.+)/i);
        if (match && match[1]) inviteCode = match[1];

        const activeBots = botPool.filter(b => b.ready);
        if (activeBots.length === 0) {
            return res.status(500).json({ error: "No bot accounts are currently online/ready to join." });
        }

        console.log(`🌐 Joining server invite ${inviteCode} with ${activeBots.length} bots...`);
        let guildName = "";

        const joinPromises = activeBots.map(async (bot) => {
            try {
                const guild = await bot.client.acceptInvite(inviteCode);
                if (!guildName) guildName = guild.name;
                console.log(`✅ Bot ${bot.tag} successfully joined: ${guild.name}`);
                return { tag: bot.tag, success: true };
            } catch (e) {
                console.error(`❌ Bot ${bot.tag} failed to join: ${e.message}`);
                return { tag: bot.tag, success: false, error: e.message };
            }
        });

        const results = await Promise.all(joinPromises);
        const successfulJoins = results.filter(r => r.success);

        if (successfulJoins.length === 0) {
            throw new Error(`All bots failed to join. Try verifying invite code or token validity.`);
        }

        const serverName = guildName || `Server (${channelId})`;
        const newServer = {
            name: serverName,
            channelId: channelId
        };

        servers.push(newServer);
        fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));

        // Trigger immediate bump
        bumpServer(newServer);

        res.json({ 
            success: true, 
            message: `Joined ${serverName} with ${successfulJoins.length}/${activeBots.length} bots and started bumping!` 
        });
    } catch (error) {
        console.error(`❌ WebUI: Failed to join server:`, error.message);
        res.status(500).json({ error: `Failed to join server: ${error.message}` });
    }
});

// Web API Endpoint to get stats
app.get('/api/stats', (req, res) => {
    const activeServers = servers.filter(s => s.channelId && !s.channelId.includes("HERE")).map(s => ({
        name: s.name,
        channelId: s.channelId,
        lastStatus: s.lastStatus || "⏳ Waiting...",
        nextBumpTime: s.nextBumpTime || null
    }));

    const botsStatus = botPool.map(bot => ({
        id: bot.id,
        tag: bot.tag,
        ready: bot.ready,
        cooldownUntil: bot.cooldownUntil,
        lastBumpTime: bot.lastBumpTime,
        error: bot.error
    }));

    res.json({
        global: globalStats,
        servers: activeServers,
        bots: botsStatus
    });
});

// Web API Endpoint to cancel a server's auto bump
app.post('/api/cancel-server', (req, res) => {
    const { channelId } = req.body;
    if (!channelId) {
        return res.status(400).json({ error: "Missing channelId" });
    }
    const server = servers.find(s => s.channelId === channelId);
    if (!server) {
        return res.status(404).json({ error: "Server not found" });
    }
    
    const timerId = bumpTimers.get(channelId);
    if (timerId) {
        clearTimeout(timerId);
        bumpTimers.delete(channelId);
    }
    server.lastStatus = "❌ Cancelled";
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
    res.json({ success: true, message: `Auto bump cancelled for ${server.name}` });
});

// Start Web Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web interface running at http://localhost:${PORT}`);
});

// Log in all bots
console.log(`🔌 Logging in ${botPool.length} bot account(s)...`);
botPool.forEach(bot => {
    bot.client.on('ready', () => {
        bot.ready = true;
        bot.tag = bot.client.user.tag;
        bot.error = null;
        console.log(`✅ Bot [${bot.id}] online as ${bot.tag}`);
        startManagerOnce();
    });

    bot.client.on('error', (err) => {
        console.error(`❌ Bot [${bot.id}] error: ${err.message}`);
        bot.error = err.message;
    });

    bot.client.login(bot.token).catch(err => {
        console.error(`❌ Bot [${bot.id}] login failed: ${err.message}`);
        bot.error = err.message;
    });
});
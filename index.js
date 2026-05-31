require('dotenv').config();

const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
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

// Default servers configuration
let servers = [];

const DATA_FILE = path.join(__dirname, 'servers.json');
const STATS_FILE = path.join(__dirname, 'stats.json');

// Load saved servers
if (fs.existsSync(DATA_FILE)) {
    try {
        servers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error("❌ Failed to parse servers.json.");
        servers = [];
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
    "bumpy bum the bumping bum",
    "brophet bumhoamad has arrived 🙏",
    "time for the holy bump",
    "big bump energy",
    "bump lord is here",
    "fat bumpers assemble 🍔",
    "get bumped on nerds 🤓",
    "i came, i saw, i bumped 🏛️",
    "to bump or not to bump, that is the question 🎭",
    "you miss 100% of the bumps you don't take 🏀",
    "bumping is my passion ❤️‍🔥",
    "keep calm and bump on ☕",
    "bumping my way to the top 🧗",
    "out of my way, professional bumper coming through 🕴️",
    "did someone say bump? 👂",
    "it's bumping time ⌚",
    "bump it like it's hot 🔥",
    "another day, another bump 🌅",
    "may the bump be with you 🌌",
    "bumping: a lifestyle choice ✨",
    "i'm just a bot standing in front of a server, asking it to bump me 🥺"
];

// Analytics — load from disk so counts survive restarts
let globalStats = { totalBumps: 0, failedBumps: 0 };
if (fs.existsSync(STATS_FILE)) {
    try {
        globalStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        console.log(`📊 Loaded stats: ${globalStats.totalBumps} bumps, ${globalStats.failedBumps} failed`);
    } catch (e) { /* ignore */ }
}
const saveStats = () => fs.writeFileSync(STATS_FILE, JSON.stringify(globalStats, null, 4));

// Parse multiple tokens from .env
// Supports TOKENS=tok1,tok2,tok3  or  TOKEN=tok1
const tokensStr = process.env.TOKENS || process.env.TOKEN || '';
const tokens = tokensStr.split(',').map(t => t.trim()).filter(Boolean);

if (tokens.length === 0) {
    console.error("❌ No Discord tokens found. Add TOKEN or TOKENS to your .env file.");
    process.exit(1);
}

// Map to cancel scheduled bump timers
const bumpTimers = new Map();

// Initialize bot pool — NO cooldown field, bots are always eligible to try
const botPool = tokens.map((token, index) => ({
    id: index + 1,
    token,
    client: new Client(),
    ready: false,
    tag: `Bot #${index + 1}`,
    lastBumpTime: 0,
    status: 'connecting', // 'connecting' | 'online' | 'error'
    error: null
}));

// ─────────────────────────────────────────────
// Core bump logic:
// Try bots in order (Bot 1 → Bot 2 → Bot 3 …).
// If a server has an assignedBotId, ONLY that bot is used.
// If it has no assignedBotId, it uses any bot in the "Shared Pool"
// (which are bots not assigned to ANY server).
// ─────────────────────────────────────────────

const bumpServer = async (server, triedBotIds = [], isFirstAttempt = true) => {
    let bot;

    if (server.assignedBotId) {
        // Dedicated bot
        bot = botPool.find(b => b.id === server.assignedBotId && b.ready);
        if (triedBotIds.includes(server.assignedBotId)) {
            bot = null; // already tried this dedicated bot
        }
    } else {
        // Shared pool (bots that are not assigned to any server)
        const assignedBots = servers.map(s => s.assignedBotId).filter(id => id != null);
        bot = botPool.find(b => b.ready && !triedBotIds.includes(b.id) && !assignedBots.includes(b.id));
    }

    if (!bot) {
        // All eligible bots have been tried
        let msg = server.assignedBotId ? "Dedicated bot is on cooldown or offline." : `All available shared bots (${botPool.filter(b=>b.ready).length} online) are on cooldown.`;
        console.log(`❌ [${server.name}] ${msg} Scheduling next attempt in 2h.`);
        server.lastStatus = "❌ All bots on cooldown";
        scheduleNextBump(server);
        return;
    }

    const botShortTag = bot.tag.split('#')[0];
    console.log(`🤖 [${server.name}] Trying Bot ${bot.id} (${bot.tag})…`);
    server.lastStatus = `🔄 Trying Bot ${bot.id}…`;

    try {
        const channel = await bot.client.channels.fetch(server.channelId).catch(() => null);
        if (!channel) {
            console.log(`⚠️ [${server.name}] Bot ${bot.id} can't see channel. Trying next bot…`);
            triedBotIds.push(bot.id);
            return setTimeout(() => bumpServer(server, triedBotIds), 1500);
        }

        if (isFirstAttempt) {
            // Send easter egg message first
            const randomMsg = easterEggs[Math.floor(Math.random() * easterEggs.length)];
            await channel.send(randomMsg).catch(() => null);

            // Wait exactly 6 seconds before bumping
            await new Promise(r => setTimeout(r, 6000));
        } else {
            // Short silent delay when switching bots
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
        }

        // Send /bump slash command
        console.log(`🔄 [${server.name}] Bot ${bot.id} sending /bump…`);
        await channel.sendSlash(DISBOARD_ID, COMMAND_NAME);

        // Wait up to 15 seconds for Disboard's response
        const collected = await channel.awaitMessages({
            filter: m => m.author.id === DISBOARD_ID || (m.interaction && m.interaction.commandName === 'bump'),
            max: 1,
            time: 15000
        }).catch(() => null);

        if (collected && collected.size > 0) {
            const reply = collected.first();
            const content = (reply.content || '') + (reply.embeds?.map(e => e.description || '').join(' ') || '');
            const lower = content.toLowerCase();

            const successWords = ['bump done', 'bumped', 'erfolgreich', 'sucesso', 'éxito', 'succès', 'succes', 'başarılı', 'sukces', 'успешно', '成功'];
            const cooldownWords = ['wait', 'cooldown', 'minute', 'minuten', 'minutos', 'dakika', 'minut', 'warte', 'poczekaj', '分钟', '分', 'min.', 'min '];

            if (successWords.some(w => lower.includes(w))) {
                // ✅ SUCCESS
                console.log(`✅ [${server.name}] Bot ${bot.id} BUMPED successfully!`);
                await channel.send("low cortisol 😊").catch(() => null);
                
                globalStats.totalBumps++;
                server.lastStatus = `✅ Bumped by Bot ${bot.id}`;
                bot.lastBumpTime = Date.now();
                saveStats();
                scheduleNextBump(server);

            } else if (cooldownWords.some(w => lower.includes(w))) {
                // ⏰ This bot is on Disboard per-user cooldown → try next bot
                const matchMins = content.match(/(\d+)\s*(?:minute|minuten|minutos|minut|min\.|min|dakika|分钟|分)/i);
                const minsLeft = matchMins ? parseInt(matchMins[1], 10) : '?';
                console.log(`⏰ [${server.name}] Bot ${bot.id} is on cooldown (${minsLeft}m). Trying next bot…`);
                await channel.send("im on cooldown high cortisol 😩").catch(() => null);

                server.lastStatus = `⏰ Bot ${bot.id} on cooldown, trying next…`;
                globalStats.failedBumps++;
                saveStats();
                triedBotIds.push(bot.id);
                // Small gap then try next bot immediately (silently)
                setTimeout(() => bumpServer(server, triedBotIds, false), 1500);

            } else {
                // Unknown response — assume success to avoid infinite loops
                console.log(`⚠️ [${server.name}] Unknown Disboard response. Treating as success.`);
                globalStats.totalBumps++;
                server.lastStatus = `⚠️ Bumped (unverified) by Bot ${bot.id}`;
                bot.lastBumpTime = Date.now();
                saveStats();
                scheduleNextBump(server);
            }

        } else {
            // Disboard didn't reply — assume success or network issue, schedule next
            console.log(`❓ [${server.name}] No response from Disboard within 15s. Scheduling next bump.`);
            globalStats.failedBumps++;
            server.lastStatus = "❓ No response from Disboard";
            saveStats();
            scheduleNextBump(server);
        }

    } catch (e) {
        console.error(`❌ [${server.name}] Error with Bot ${bot.id}: ${e.message}`);
        globalStats.failedBumps++;
        server.lastStatus = `❌ Bot ${bot.id} error`;
        saveStats();
        triedBotIds.push(bot.id);
        setTimeout(() => bumpServer(server, triedBotIds), 2000);
    }
};

const scheduleNextBump = (server, customMs = null) => {
    const intervalMs = customMs ?? ((2 * 60 * 60 * 1000) + (Math.floor(Math.random() * 10) * 60 * 1000));
    server.nextBumpTime = Date.now() + intervalMs;
    console.log(`⏳ [${server.name}] Next bump in ${Math.round(intervalMs / 60000)} minutes`);

    if (bumpTimers.has(server.channelId)) clearTimeout(bumpTimers.get(server.channelId));
    const tid = setTimeout(() => bumpServer(server), intervalMs);
    bumpTimers.set(server.channelId, tid);
};

let managerStarted = false;
const startManagerOnce = () => {
    if (managerStarted) return;
    managerStarted = true;
    console.log(`🚀 Bump manager started — ${servers.length} server(s) configured`);

    servers.forEach((server, i) => {
        server.lastStatus = "⏳ Starting…";
        if (server.channelId && !server.channelId.includes('HERE')) {
            server.nextBumpTime = Date.now() + (i * 8000);
            setTimeout(() => bumpServer(server), i * 8000);
        } else {
            server.lastStatus = "⚠️ Not configured";
        }
    });
};

// ─── API Routes ───────────────────────────────

app.post('/api/add-server', async (req, res) => {
    const { channelId, inviteLink, serverName, assignedBotId } = req.body;
    if (!channelId) return res.status(400).json({ error: "Missing channelId" });

    try {
        let guildName = serverName || '';

        if (inviteLink) {
            // Join via invite if provided
            const match = inviteLink.match(/(?:discord\.gg\/|discord\.com\/invite\/)(.+)/i);
            const inviteCode = (match && match[1]) ? match[1] : inviteLink;
            const activeBots = botPool.filter(b => b.ready);
            if (activeBots.length === 0) return res.status(500).json({ error: "No bots are online." });
            const results = await Promise.all(activeBots.map(async bot => {
                try {
                    const guild = await bot.client.acceptInvite(inviteCode);
                    if (!guildName) guildName = guild.name;
                    return { success: true };
                } catch (e) { return { success: false }; }
            }));
            if (!results.some(r => r.success)) throw new Error("All bots failed to join.");
        } else {
            // No invite — bots should already be in the server.
            // Try to auto-detect the guild name from the channel.
            if (!guildName) {
                for (const bot of botPool.filter(b => b.ready)) {
                    try {
                        const ch = await bot.client.channels.fetch(channelId);
                        if (ch && ch.guild) { guildName = ch.guild.name; break; }
                    } catch (e) { /* try next bot */ }
                }
            }
        }

        const name = guildName || `Server (${channelId})`;
        // Avoid duplicates
        if (servers.find(s => s.channelId === channelId)) {
            return res.status(400).json({ error: "This channel is already being bumped." });
        }
        
        const parsedBotId = assignedBotId ? parseInt(assignedBotId, 10) : null;
        const newServer = { name, channelId, assignedBotId: parsedBotId, lastStatus: "⏳ Starting…" };
        
        servers.push(newServer);
        fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
        bumpServer(newServer);
        res.json({ success: true, message: `Added "${name}" and starting bumps!` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', (req, res) => {
    const activeServers = servers
        .filter(s => s.channelId && !s.channelId.includes('HERE'))
        .map(s => ({
            name: s.name,
            channelId: s.channelId,
            assignedBotId: s.assignedBotId || null,
            lastStatus: s.lastStatus || "⏳ Waiting…",
            nextBumpTime: s.nextBumpTime || null
        }));

    const bots = botPool.map(b => ({
        id: b.id,
        tag: b.tag,
        ready: b.ready,
        status: b.status,
        lastBumpTime: b.lastBumpTime,
        error: b.error
    }));

    res.json({ global: globalStats, servers: activeServers, bots });
});

app.post('/api/cancel-server', (req, res) => {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: "Missing channelId" });
    const server = servers.find(s => s.channelId === channelId);
    if (!server) return res.status(404).json({ error: "Server not found" });

    if (bumpTimers.has(channelId)) {
        clearTimeout(bumpTimers.get(channelId));
        bumpTimers.delete(channelId);
    }
    server.lastStatus = "❌ Cancelled";
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
    res.json({ success: true });
});

app.delete('/api/remove-server', (req, res) => {
    const { channelId } = req.body;
    if (!channelId) return res.status(400).json({ error: "Missing channelId" });
    if (bumpTimers.has(channelId)) {
        clearTimeout(bumpTimers.get(channelId));
        bumpTimers.delete(channelId);
    }
    servers = servers.filter(s => s.channelId !== channelId);
    fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
    res.json({ success: true });
});

// ─── Web Server ───────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Dashboard running at http://localhost:${PORT}`));

// ─── Login all bots ───────────────────────────

console.log(`🔌 Logging in ${botPool.length} bot(s)…`);
botPool.forEach(bot => {
    bot.client.on('ready', () => {
        bot.ready = true;
        bot.status = 'online';
        bot.tag = bot.client.user.tag;
        bot.error = null;
        console.log(`✅ Bot [${bot.id}] online as ${bot.tag}`);
        startManagerOnce();
    });

    bot.client.on('error', err => {
        bot.status = 'error';
        bot.error = err.message;
        console.error(`❌ Bot [${bot.id}] error: ${err.message}`);
    });

    bot.client.login(bot.token).catch(err => {
        bot.status = 'error';
        bot.error = err.message;
        console.error(`❌ Bot [${bot.id}] login failed: ${err.message}`);
    });
});
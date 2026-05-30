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
        // You can set these via env vars or change here
        [process.env.BASIC_AUTH_USER || 'admin']: process.env.BASIC_AUTH_PASS || 'changeme'
    },
    challenge: true,
    realm: 'Selfbot Dashboard'
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Client();

const DISBOARD_ID = "302050872383242240";
const COMMAND_NAME = "bump";

// Channels where the bot will occasionally chat to look human
const activityChannels = [
    {
        name: "General Chat 1",
        channelId: "ACTIVITY_CHANNEL_ID_HERE"
    }
    // Add more channels here
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

// Add as many servers as you want here
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
    // Add more like this ↓
    // { name: "My Cool Server", channelId: "123456789012345678" }
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

client.on('ready', async () => {
    console.log(`✅ Selfbot started as ${client.user.tag}`);
    console.log(`🔄 Multi-server auto bump started (${servers.length} servers)`);

    // Map to keep track of each server's bump timer so we can cancel it
    const bumpTimers = new Map();

    const bumpServer = async (server) => {
        try {
            const channel = await client.channels.fetch(server.channelId);
            if (!channel) {
                console.log(`❌ [${server.name}] Could not find channel ${server.channelId}`);
                globalStats.failedBumps++;
                server.lastStatus = "❌ Channel not found";
                saveStats();
                return;
            }

            // Send random easter egg
            const randomMsg = easterEggs[Math.floor(Math.random() * easterEggs.length)];
            await channel.send(randomMsg);
            console.log(`📢 [${server.name}] Sent: ${randomMsg}`);

            // Small human-like delay
            await new Promise(r => setTimeout(r, Math.random() * 3000 + 1500));

            // Send actual /bump and wait for Disboard's response
            console.log(`🔄 [${server.name}] Sending /bump command...`);
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
                
                if (content.toLowerCase().includes('bump done') || content.toLowerCase().includes('bumped')) {
                    console.log(`✅ [${server.name}] VERIFIED — Disboard confirmed bump!`);
                    globalStats.totalBumps++;
                    server.lastStatus = "✅ Verified";
                } else if (content.toLowerCase().includes('wait') || content.toLowerCase().includes('cooldown') || content.toLowerCase().includes('minutes')) {
                    console.log(`⏰ [${server.name}] COOLDOWN — Disboard says wait. Response: ${content.substring(0, 100)}`);
                    globalStats.failedBumps++;
                    server.lastStatus = "⏰ On Cooldown";
                } else {
                    console.log(`⚠️ [${server.name}] UNKNOWN response from Disboard: ${content.substring(0, 150)}`);
                    globalStats.totalBumps++;
                    server.lastStatus = "⚠️ Unverified";
                }
            } else {
                console.log(`❓ [${server.name}] NO RESPONSE — Disboard did not reply within 15s. Bump may not have worked.`);
                globalStats.failedBumps++;
                server.lastStatus = "❓ No Response";
            }
            saveStats();
        } catch (e) {
            console.error(`❌ [${server.name}] ERROR: ${e.message}`);
            globalStats.failedBumps++;
            server.lastStatus = `❌ ${e.message.substring(0, 50)}`;
            saveStats();
        }

        // Schedule next bump for THIS server
        const randomMinutes = Math.floor(Math.random() * 30) + 1;
        const nextInterval = (2 * 60 * 60 * 1000) + (randomMinutes * 60 * 1000);

        server.nextBumpTime = Date.now() + nextInterval;

        console.log(`⏳ Next bump for ${server.name} in 2 hours + ${randomMinutes} minutes`);
        const timerId = setTimeout(() => bumpServer(server), nextInterval);
        // Store the timer so we can cancel it later
        bumpTimers.set(server.channelId, timerId);
    };

    const simulateActivity = async () => {
        if (activityChannels.length === 0) return;

        // Pick a random channel
        const randomConfig = activityChannels[Math.floor(Math.random() * activityChannels.length)];
        
        try {
            const channel = await client.channels.fetch(randomConfig.channelId);
            if (channel) {
                const randomMsg = activityMessages[Math.floor(Math.random() * activityMessages.length)];
                await channel.send(randomMsg);
                console.log(`💬 [Activity] Sent to ${randomConfig.name}: ${randomMsg}`);
            }
        } catch (e) {
            console.error(`❌ [Activity] Error in ${randomConfig.name}:`, e.message);
        }

        // Schedule next random activity (e.g. anywhere between 15 mins to 45 mins)
        const nextActivityMin = Math.floor(Math.random() * 30) + 15;
        setTimeout(simulateActivity, nextActivityMin * 60 * 1000);
    };

    // Start initial servers with stagger
    for (let i = 0; i < servers.length; i++) {
        servers[i].lastStatus = "⏳ Waiting...";
        if (servers[i].channelId !== "CHANNEL_ID_" + (i+1) + "_HERE" && !servers[i].channelId.includes("HERE")) {
            servers[i].nextBumpTime = Date.now() + (i * 8000);
            setTimeout(() => bumpServer(servers[i]), i * 8000); // 8 seconds apart for initial start
        } else {
            servers[i].lastStatus = "⚠️ Not Configured";
        }
    }

    // Start activity simulation
    if (activityChannels.length > 0 && activityChannels[0].channelId !== "ACTIVITY_CHANNEL_ID_HERE") {
        simulateActivity();
    } else {
        console.log("⚠️ Activity channels not configured. Please add channel IDs to activityChannels to enable activity simulation.");
    }

    // Web API Endpoint to add new server
    app.post('/api/add-server', async (req, res) => {
        const { inviteLink, channelId } = req.body;
        if (!inviteLink || !channelId) {
            return res.status(400).json({ error: "Missing inviteLink or channelId" });
        }

        try {
            // Extract invite code
            let inviteCode = inviteLink;
            const match = inviteLink.match(/(?:discord\.gg\/|discord\.com\/invite\/)(.+)/i);
            if (match && match[1]) inviteCode = match[1];

            // Join server
            const guild = await client.acceptInvite(inviteCode);
            console.log(`✅ WebUI: Successfully joined server: ${guild.name}`);

            const newServer = {
                name: guild.name,
                channelId: channelId
            };

            servers.push(newServer);

            // Save to disk permanently
            fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));

            // Trigger immediate bump for this new server
            bumpServer(newServer);

            res.json({ success: true, message: `Joined ${guild.name} and started bumping!` });
        } catch (error) {
            console.error(`❌ WebUI: Failed to join server:`, error.message);
            res.status(500).json({ error: `Failed to join server: ${error.message}` });
        }
    });

    // Web API Endpoint to get stats
    app.get('/api/stats', (req, res) => {
        const activeServers = servers.filter(s => !s.channelId.includes("HERE")).map(s => ({
            name: s.name,
            channelId: s.channelId,
            lastStatus: s.lastStatus || "⏳ Waiting...",
            nextBumpTime: s.nextBumpTime || null
        }));

        res.json({
            global: globalStats,
            servers: activeServers
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
        // Clear the timer if it exists
        const timerId = bumpTimers.get(channelId);
        if (timerId) {
            clearTimeout(timerId);
            bumpTimers.delete(channelId);
        }
        server.lastStatus = "❌ Cancelled";
        // Persist the changed status (optional)
        fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 4));
        res.json({ success: true, message: `Auto bump cancelled for ${server.name}` });
    });

    // Start Web Server
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Web interface running at http://localhost:${PORT}`);
    });
});

client.login(process.env.TOKEN);
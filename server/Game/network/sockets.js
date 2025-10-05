let crypto = require("crypto"),
    net = require('net'),
    fs = require("fs");
    PERMABAN_FILE = "./permabans.json";
let bans = global.bans || (global.bans = []);
let permBans = global.permBans || (global.permBans = []);

class socketManager {
    constructor(parent) {
        this.permissionsDict = {};
        this.clients = parent.clients;
        this.gamemode = parent.gamemode;
        this.players = [];
        this.disconnections = [];
        this.playersReceived = [];
        this.bans = [];
        // Import permissions
        for (let entry of require("../permissions.js")) {
            this.permissionsDict[entry.key] = entry;
        }
    };

    broadcast(message) {
        for (let i = 0; i < this.clients.length; i++) {
            this.clients[i].talk("m", Config.MESSAGE_DISPLAY_TIME, message);
        }
    };
    broadcastRoom() {
        for (let i = 0; i < this.clients.length; i++) {
            this.clients[i].talk(
                'r',
                global.gameManager.room.width,
                global.gameManager.room.height,
                JSON.stringify(global.gameManager.room.setup.map(x => x.map(t => { 
                    return {
                        color: t.color,
                        image: t.image ?? false,
                    }
                }))),
            );
        }
    };
    ban(socket, reason) {
        let time = Date.now();
        util.warn((reason || "No reason given.") + " Banning.");

        let s = this.clients.filter((c) => c.ip === socket.ip);

        for (let i = 0; i < s.length; i++) {
            s[i].lastWords("K");
            if (s[i].player && s[i].player.body) {
                s[i].player.body.kill();
                s[i].player.body.destroy();
            }
            if (s[i].readyState === s[i].OPEN) {
                setTimeout(() => {
                    s[i].terminate();
                }, 100);
            }
        }
        bans.push({
            id: Math.random().toString(36).substr(2, 9),
            ip: socket.ip,
            time: time,
            name: (socket.player && socket.player.body && socket.player.body.name) || "Unnamed",
            reason: reason,
        });
    }

    permaban(socket, reason) {
        let time = Date.now();
        util.warn((reason || "No reason given.") + " Permanent Banning.");

        let s = this.clients.filter((c) => c.ip === socket.ip);
        for (let i = 0; i < s.length; i++) {
            s[i].lastWords("K");
            if (s[i].player && s[i].player.body) {
                s[i].player.body.kill();
                s[i].player.body.destroy();
            }
            if (s[i].readyState === s[i].OPEN) {
                setTimeout(() => {
                    s[i].terminate();
                }, 100);
            }
        }

        permBans.push({
            ip: socket.ip,
            time: time,
            name: (socket.player && socket.player.body && socket.player.body.name) || "Unnamed",
            reason: reason,
        });

        fs.writeFileSync(PERMABAN_FILE, JSON.stringify(permBans, null, 2));
    }
    chatLoop() {
        // clean up expired messages
        let now = Date.now();
        for (let i in chats) {
            chats[i] = chats[i].filter((chat) => chat.expires > now);
            if (!chats[i].length) {
                delete chats[i];
            }
        }

        // send chat messages to everyone
        for (let view of global.gameManager.views) {
            let nearby = view.getNearby(),
            spammersAdded = 0,
            array = [];

            for (let entity of nearby.values()) {
                let id = entity.id;
                if (chats[id]) {
                        spammersAdded++;
                        array.push(id, chats[id].length);
                        for (let chat of chats[id]) {
                        array.push(chat.message, chat.expires.toString());
                    }
                }
            }
            if (!view.socket.status.disablechat) view.socket.talk("CHAT_MESSAGE_ENTITY", spammersAdded, ...array);
        }
    }

    close(socket) {
        // Figure out who the player was
        let player = socket.player,
            index = this.players.indexOf(player);
        // Remove it from any group if there was one...
        if (socket.group) groups.removeMember(socket);
        // Remove the player if one was created
        if (index != -1) {
            // Kill the body if it exists
            if (player.body != null) {
                if (player.body.underControl) {
                    player.body.giveUp(player);
                }
                if (socket.status.transferred) {
                    player.body.invuln = false;
                    player.body.destroy();
                } else if (player.body.invuln || global.gameManager.arenaClosed) {
                    player.body.invuln = false;
                    player.body.kill();
                    player.body.destroy();
                } else if (!global.gameManager.arenaClosed) {
                    let timeout = setTimeout(() => {
                        if (player.body != null) {
                            player.body.kill();
                        }
                        util.remove(this.disconnections, this.disconnections.indexOf(disconnection));
                    }, 60000);
                    let disconnection = {
                        body: player.body,
                        ip: socket.ip,
                        timeout: timeout,
                    };
                    this.disconnections.push(disconnection);
                    player.command.autospin = false;
                    player.body.life();
                }
            }
            // Disconnect everything
            util.log("[INFO] " + (player.body ? `User ${player.body.name == "" ? "A unnamed player" : player.body.name}` : "A user without an entity") + " disconnected!");
            util.remove(this.players, index);
        } else {
            util.log("[INFO] A player disconnected before entering the game.");
        }
        // Free the view
        util.remove(global.gameManager.views, global.gameManager.views.indexOf(socket.view));
        // Remove the socket
        util.remove(this.clients, this.clients.indexOf(socket));
        if (!global.gameManager.parentPort) {
            for (let i = 0; i < global.servers.length; i++) {
                let server = global.servers[i];
                if (server.gameManager) server.players--;
            }
        } else {
            global.gameManager.parentPort.postMessage([true, this.clients.length]);
        }
        util.log("[INFO] The connection has closed. Views: " + global.gameManager.views.length + ". Clients: " + this.clients.length + ".");
    }
    incoming(message, socket) {
        // Decode it
        let m = protocol.decode(message);
        // Remember who we are
        let player = socket.player;
        // Make sure it looks legit
        if (m === -1) {
            socket.kick("Malformed packet.");
            return 1;
        }
        // Handle the request
        if (socket.resolveResponse(m[0], m)) {
            return;
        }
        switch (m.shift()) {
            case 'k': { // key verification
                if (m.length > 1) { socket.kick('Ill-sized key request.'); return 1; }
                if (socket.status.verified) { socket.kick('Duplicate player spawn attempt.'); return 1; }
                socket.talk('w', true);
                if (m.length === 1) {
                    let key = m[0].toString().trim();
                    socket.permissions = this.permissionsDict[key];
                    if (socket.permissions) {
                        util.log(`[INFO] A socket was verified with the token: ${key}`);
                    } else {
                        util.log(`[WARNING] A socket failed to verify with the token: ${key}`);
                    }
                    socket.key = key;
                }
                socket.status.verified = true;
                util.log('Clients: ' + this.clients.length);
            } break;
            case 's': { // spawn request
                if (!socket.status.deceased) { socket.kick('Trying to spawn while already alive.'); return 1; }
                if (this.clients.length > global.gameManager.webProperties.maxPlayers) return (
                    socket.talk("message", "This server is full, please rejoin later."),
                    socket.kick("Server full.")
                )
                let b = bans.find((ban) => ban.ip === socket.ip);
                if (b) {
                    socket.talk("bansussy"); // Important, kick the user after calling bansussy in order to see the ban message.
                    socket.kick("temp-Banned player detected!");
                    return 1;
                  }
                let permB = permBans.find(
                  (bannedIP) => bannedIP.ip === socket.ip
                );
                if (permB) {
                    socket.talk("permanentban");
                    socket.permaban("Permanent Banned player found!");
                  return 1;
                }
                // Get data
                if (m.length < 3) {
                    socket.kick("Ill-sized spawn request.");
                    return 1;
                }
                let name = m[0].replace(Config.BANNED_CHARACTERS_REGEX, '');
                let needsRoom = m[1];
                let autoLVLup = m[2];
                let transferbodyID = m[3];
                if (transferbodyID) transferbodyID = transferbodyID.replace(name, "");
                if (global.gameManager.arenaClosed) {
                    if (needsRoom) {
                      socket.talk("message", "Arena closed. Try again in a few seconds.");
                      socket.terminate("Bad spawn while arena closed.");
                    } else socket.talk("m", 5_000, "Arena Closed.");
                    return;
                };
                // Verify it
                if (typeof name != "string") { socket.kick("Bad spawn request name."); return 1; }
                if (encodeURI(name).split(/%..|./).length > 48) { socket.kick("Overly-long name."); return 1; }
                if (typeof m[1] !== "number") { socket.kick("Bad spawn request needsRoom."); return 1; }
                if (typeof autoLVLup !== "number") { socket.kick("Bad spawn request autoLVLup."); return 1; }
                // Give it the room state and move the camera.
                if (needsRoom) {
                    this.newPlayer(socket);
                    socket.talk(
                        'R',
                        global.gameManager.room.width,
                        global.gameManager.room.height,
                        JSON.stringify(global.gameManager.room.setup.map(x => x.map(t => { 
                            return {
                                color: t.color,
                                visibleOnBlackout: t.visibleOnBlackout,
                                image: t.image ?? false,
                            }
                        }))),
                        JSON.stringify(util.serverStartTime),
                        global.gameManager.roomSpeed,
                        JSON.stringify({
                            active: Config.BLACKOUT,
                            color: Config.BLACKOUT_FOG,
                        }),
                        Config.RADIAL_MODE,
                        Config.ARENA_TYPE,
                    );
                }
                let loop = setInterval(() => {
                    // You can put your code here to prevent players from spawning.
                    if (!global.cannotRespawn && !global.gameManager.arenaClosed && socket.status.readyToSpawn) {
                        clearInterval(loop);
                        let epackage = {};
                        epackage.name = name;
                        epackage.needsRoom = needsRoom;
                        epackage.autoLVLup = autoLVLup;
                        epackage.transferbodyID = transferbodyID;
                        // Easter eggs
                        epackage.braindamagemode = false;
                        if (name.includes("Brain Damage") || name.includes("brain Damage") || name.includes("Brain damage") || name.includes("brain damage")) {
                            epackage.braindamagemode = true;
                        }
                        this.initalizePlayer(epackage, socket);
                    }
                }, 20)
            } break;
            case 'S': { // clock syncing
                if (m.length !== 1) { socket.kick('Ill-sized sync packet.'); return 1; }
                // Get data
                let synctick = m[0];
                // Verify it
                if (typeof synctick !== 'number') { socket.kick('Weird sync packet.'); return 1; }
                // Bounce it back
                socket.talk('S', synctick, util.time());
            } break;
            case 'p': { // ping
                if (m.length !== 1) { socket.kick('Ill-sized ping.'); return 1; }
                // Get data
                let ping = m[0];
                // Verify it
                if (typeof ping !== 'number') { socket.kick('Weird ping.'); return 1; }
                // Pong
                socket.talk('p', ping.toFixed(1)); // Just pong it right back
                socket.status.lastHeartbeat = util.time();
            } break;
            case "d": {
                // downlink
                if (m.length !== 1) {
                    socket.kick("Ill-sized downlink.");
                    return 1;
                }
                // Get data
                let time = m[0];
                // Verify data
                if (typeof time !== "number") {
                    socket.kick("Bad downlink.");
                    return 1;
                }
                // The downlink indicates that the client has received an update and is now ready to receive more.
                socket.status.receiving = 0;
                socket.camera.ping = util.time() - time;
                socket.camera.lastDowndate = util.time();
                // Schedule a new update cycle
                // Either fires immediately or however much longer it's supposed to wait per the config.
                socket.update(Math.max(0, (1000 / 24) - (util.time() - socket.camera.lastUpdate)));
            } break;
            case "C": {
            // command packet
            if (m.length !== 4) {
                socket.kick("Ill-sized command packet.");
                return 1;
            }
            // Get data
            let target = {
                    x: m[0],
                    y: m[1],
                },
                reverseTank = m[2],
                commands = m[3];
            // Verify data
            if (
                typeof target.x !== "number" ||
                typeof target.y !== "number" ||
                typeof commands !== "number"
            ) {
                socket.kick("Weird downlink.");
                return 1;
            }
            if (commands > 255) {
                socket.kick("Malformed command packet.");
                return 1;
            }
            if (player.body == null) return;
            // Put the new target in
            if (!socket.player.body.eastereggs.braindamage) player.target = target;
            // Reverse the tank's facing if we want.
            player.body.reverseTank = reverseTank;
            // Process the commands
            if (player.command != null) {
                player.command.up = commands & 1;
                player.command.down = (commands & 2) >> 1;
                player.command.left = (commands & 4) >> 2;
                player.command.right = (commands & 8) >> 3;
                player.command.lmb = (commands & 16) >> 4;
                player.command.mmb = (commands & 32) >> 5;
                player.command.rmb = (commands & 64) >> 6;
            }
            // Update the thingy
            socket.timeout.set(commands);
            } break;
            case "#": {
                try {
                    runKeyCommand(socket, m);
                } catch (e) { 
                    console.error(e);
                }
            } break;
            case "t": {
                // player toggle
                if (m.length !== 2) {
                    socket.kick("Ill-sized toggle.");
                    return 1;
                }
                // Get data
                let tog = m[0];
                // Verify request
                if (typeof tog !== "number") {
                    socket.kick("Weird toggle.");
                    return 1;
                }
                let sendMessage = m[1];
                // ...what are we supposed to do?
                let given = [
                    "autospin",
                    "autofire",
                    "override",
                    "autoalt",
                    "spinlock" //spinlock does something both in the client and server side
                ][tog];
    
                // Kick if it sent us shit.
                if (!given) {
                    socket.kick("Bad toggle.");
                    return 1;
                }
                // Apply a good request.
                if (player.command != null && player.body != null) {
                    player.command[given] = !player.command[given];
                    // Send a message.
                    if (sendMessage) player.body.sendMessage(given.charAt(0).toUpperCase() + given.slice(1) + (player.command[given] ? " enabled." : " disabled."));
                }
            } break;
            case "U": {
                // upgrade request
                if (m.length !== 2) {
                    socket.kick("Ill-sized upgrade request.");
                    return 1;
                }
                // Get data
                let upgrade = m[0];
                let branchId = m[1];
                // Verify the request
                if (typeof upgrade != "number" || upgrade < 0 || typeof branchId != "number" || branchId < 0) {
                    socket.kick("Bad upgrade request.");
                    return 1;
                }
                // Upgrade it
                if (player.body != null) {
                    player.body.upgrade(upgrade, branchId); // Ask to upgrade
                }
            } break;
            case "x": {
                // skill upgrade request
                if (m.length !== 2) {
                    socket.kick("Ill-sized skill request.");
                    return 1;
                }
                let number = m[0],
                    max = m[1],
                    stat = ["atk", "hlt", "spd", "str", "pen", "dam", "rld", "mob", "rgn", "shi"][number];
    
                if (typeof number != "number") {
                    socket.kick("Weird stat upgrade request number.");
                    return 1;
                }
                if (typeof max != "number") {
                    socket.kick("Weird stat upgrade request max boolean.");
                    return 1;
                }
                if (max !== 0 && 1 !== max) {
                    socket.kick("invalid upgrade request max boolean.");
                    return 1;
                }
    
                if (!stat) {
                    socket.kick("Unknown stat upgrade request.");
                    return 1;
                }
    
                if (player.body != null) {
                    let limit = 256;
                    do {
                        player.body.skillUp(stat);
                    } while (limit-- && max && player.body.skill.points && player.body.skill.amount(stat) < player.body.skill.cap(stat))
                }
                
            } break;
            case "L": {
                // level up cheat
                if (m.length !== 0) {
                    socket.kick("Ill-sized level-up request.");
                    return 1;
                }
                // cheatingbois
                if (player.body == null || player.body.underControl) return;
                if (player.body.skill.level < Config.LEVEL_CHEAT_CAP || (socket.permissions && socket.permissions.infiniteLevelUp)) {
                    player.body.skill.score += player.body.skill.levelScore;
                    player.body.skill.maintain();
                    player.body.refreshBodyAttributes();
                }
            } break;
            case "0": {
                // testbed cheat
                if (m.length !== 0) {
                    socket.kick("Ill-sized testbed request.");
                    return 1;
                }
                // cheatingbois
                if (
                    player.body != null &&
                    socket.permissions &&
                    socket.permissions.class
                ) {
                    player.body.define({ RESET_UPGRADES: true, BATCH_UPGRADES: false });
                    player.body.define(socket.permissions.class);
                }
            } break;
            case "1": {
                //suicide squad
                if (player.body != null && !player.body.underControl && player.body.invuln) {
                    for (const instance of entities.values()) {
                        if (
                            instance.settings.clearOnMasterUpgrade &&
                            instance.master.id === player.body.id
                        ) {
                            instance.kill();
                        }
                    }
                    player.body.destroy();
                }
            } break;
            case "H": {
                if (player.body == null) return 1;
                let entities = [];
                let body = player.body;
                for (let e of entities.values()) entities.push(e);
                body.emit("control", { body });
                if (body.underControl) {
                    let relinquishedControlMessage = 
                    Config.DOMINATION ? "dominator" : 
                    Config.MOTHERSHIP ? "mothership" :
                    "special tank"
                    if (Config.DOMINATION || Config.MOTHERSHIP) {
                        player.body.sendMessage(`You have relinquished control of the ${relinquishedControlMessage}.`);
                        body.giveUp(player, body.isDominator ? "" : undefined);
                        return 1;
                    }
                }
                if (Config.MOTHERSHIP) {
                    let motherships = entities
                        .map((entry) => {
                            if (
                                entry.isMothership &&
                                entry.team === player.body.team &&
                                !entry.underControl
                            )
                                return entry;
                        })
                        .filter((instance) => instance);
                    if (!motherships.length) {
                        player.body.sendMessage("There are no motherships available that are on your team or already controlled by an player.");
                        return 1;
                    }
                    let mothership = motherships.shift();
                    mothership.controllers = [];
                    mothership.underControl = true;
                    player.body = mothership;
                    player.body.become(player);
                    body.kill();
                    if (!player.body.dontIncreaseFov) player.body.FOV += 0.5;
                    player.body.dontIncreaseFov = true;
                    player.body.skill.points = 0;
                    player.body.refreshBodyAttributes();
                    player.body.name = body.name;
                    player.body.sendMessage("You are now controlling the mothership.");
                    player.body.sendMessage("Press F to relinquish control of the mothership.");
                } else if (Config.DOMINATION) {
                    let dominators = entities.map((entry) => {
                        if (entry.isDominator && entry.team === player.body.team && !entry.underControl) return entry;
                    }).filter(x=>x);
                    if (!dominators.length) {
                        player.body.sendMessage("There are no dominators available that are on your team or already controlled by an player.");
                        return 1;
                    }
                    let dominator = dominators.shift();
                    dominator.controllers = [];
                    dominator.underControl = true;
                    player.body = dominator;
                    player.body.become(player, true);
                    body.dontSendDeathMessage = true;
                    body.kill();
                    if (!player.body.dontIncreaseFov) player.body.FOV += 0.5;
                    player.body.dontIncreaseFov = true;
                    player.body.skill.points = 0;
                    player.body.refreshBodyAttributes();
                    player.body.name = body.name;
                    player.body.sendMessage("You are now controlling the dominator.");
                    player.body.sendMessage("Press F to relinquish control of the dominator.");
                } else {
                    player.body.sendMessage("There are no special tanks in this mode that you can control.");
                }
            } break;
            case "M": {
                if (player.body == null) return 1;
                let abort, message = m[0], original = m[0];
    
                if ("string" !==  typeof message) {
                    socket.kick("Non-string chat message.");
                    return 1;
                }
    
                util.log(player.body.name + ': ' + original);
    
                if (Config.SANITIZE_CHAT_MESSAGE_COLORS) {
                    // I thought it should be "§§" but it only works if you do "§§§§"?
                    message = message.replace(/§/g, "§§§§");
                    original = original.replace(/§/g, "§§§§");
                }
    
                Events.emit('chatMessage', { gameManager: global.gameManager, message: original, socket, preventDefault: () => abort = true, setMessage: str => message = str });
    
                // we are not anti-choice here.
                if (abort) break;
    
                if (message !== original) {
                    util.log('changed to: ' + message);
                }
    
                let id = player.body.id;
                if (!chats[id]) {
                    chats[id] = [];
                }

                chats[id].unshift({ message, expires: Date.now() + Config.CHAT_MESSAGE_DURATION });
    
                // do one tick of the chat loop so they don't need to wait 100ms to receive it.
                this.chatLoop();
            } break;
            case "T": {
                // send the upgrade tree mockups
                if (player.body && socket.status.lastTank != player.body.index) {
                    socket.status.lastTank = player.body.index;
                    this.sendMockup(player.body.index, socket);
                    for (let i of player.body.index.split("-")) {
                        let ind = parseInt(i);
                        let mockup = mockupData.find(o => o.index === `${ind}`);
                        if (!mockup) {
                            let e = this.generateMockup(ind);
                            mockup = mockupData.find(o => o.index === `${e.index}`);
                        }
                        this.sendMockupUpgrades(ind, socket);
                    }
                    socket.talk("T");
                }
            } break;
            case "K": {
                if (socket.status.mockupData.requestMockups.includes(`${m[0]}`)) return;
                let index = parseInt(m[0]);
                let mockup = mockupData.find(o => o.index === `${index}`);
                if (!mockup) {
                    let e = this.generateMockup(index);
                    mockup = mockupData.find(o => o.index === `${e.index}`);
                }
                //console.log(`${socket.player.body ? `Player ${socket.player.body.name}` : "A unnamed player"}'s Client needs a mockup ${index}!, sending the mockup...`);
                this.sendMockup(index, socket);
                for (let e of mockup.upgrades) {
                    for (let i of e.index.split("-")) {
                        this.sendMockup(i, socket);
                        this.sendMockupUpgrades(i, socket);
                    }
                    this.sendMockup(e.index, socket);
                    this.sendMockupUpgrades(e.index, socket);
                };
                socket.status.mockupData.requestMockups.push(m[0]);
            } break;
            case "NWB": {
                socket.status.forceNewBroadcast = true;
            } break;
            default: {
                console.log(m)
                console.log("Invalid registered packet." + m);
            } break;
        }
    };

    spectateEntity(possible, socket) {
        let entries = [];
        for (const entry of entities.values()) {
            if (possible.includes("arenaCloser") && entry.isArenaCloser) entries.push(entry);
            if (possible.includes("players") && entry.isPlayer) entries.push(entry);
            if (possible.includes("bots") && entry.isBot) entries.push(entry);
        }
        if (!entries.length) {
            return 1;
        }
        let entity;
        do {
            entity = ran.choose(entries);
        } while (entity === socket.spectateEntity && entries.length > 1);
        socket.spectateEntity = entity;
    }

    traffic(socket) {
        let strikes = 0;
        // This function wiSl be called in the slow loop
        return () => {
            // Kick if it's d/c'd
            if (util.time() - socket.status.lastHeartbeat > Config.maxHeartbeatInterval) {
                socket.kick("Heartbeat lost.");
                return 0;
            }
            // Add a strike if there's more than 50 requests in a second
            if (socket.status.requests > 50) {
                strikes++;
            } else {
                strikes = 0;
            }
            // Kick if we've had 3 violations in a row
            if (strikes > 3) {
                socket.kick("Socket traffic volume violation!");
                return 0;
            }
            // Reset the requests
            socket.status.requests = 0;
        };
    }

    floppy(value = null) {
        let flagged = true;
        return {
            // The update method
            update: (newValue) => {
                let eh = false;
                if (value == null) {
                    eh = true;
                } else {
                    if (typeof newValue != typeof value) {
                        eh = true;
                    }
                    // Decide what to do based on what type it is
                    switch (typeof newValue) {
                        case "number":
                        case "string":
                            if (newValue !== value) {
                                eh = true;
                            }
                            break;
                        case "object":
                            if (Array.isArray(newValue)) {
                                if (newValue.length !== value.length) {
                                    eh = true;
                                } else {
                                    for (let i = 0, len = newValue.length; i < len; i++) {
                                        if (newValue[i] !== value[i]) eh = true;
                                    }
                                }
                                break;
                            }
                        default:
                            util.error(newValue);
                            throw new Error("Unsupported type for a floppyvar!");
                    }
                }
                // Update if neeeded
                if (eh) {
                    flagged = true;
                    value = newValue;
                }
            },
            // The return method
            publish: () => {
                if (flagged && value != null) {
                    flagged = false;
                    return value;
                }
            },
        };
    }

    container(player) {
        let vars = [],
            skills = player.body.skill,
            out = [],
            statnames = ["atk", "hlt", "spd", "str", "pen", "dam", "rld", "mob", "rgn", "shi"];
        // Load everything (b/c I'm too lazy to do it manually)
        for (let i = 0; i < statnames.length; i++) {
            vars.push(this.floppy());
            vars.push(this.floppy());
            vars.push(this.floppy());
        }
        return {
            update: () => {
                let needsupdate = false,
                    i = 0;
                // Update the things
                for (let j = 0; j < statnames.length; j++) {
                    let a = statnames[j];
                    vars[i++].update(skills.title(a));
                    vars[i++].update(skills.cap(a));
                    vars[i++].update(skills.cap(a, true));
                }
                /* This is a for and not a find because we need
                 * each floppy cyles or if there's multiple changes
                 * (there will be), we'll end up pushing a bunch of
                 * excessive updates long after the first and only
                 * needed one as it slowly hits each updated value
                 */
                for (let j = 0; j < vars.length; j++)
                    if (vars[j].publish() != null) needsupdate = true;
                if (needsupdate) {
                    // Update everything
                    for (let j = 0; j < statnames.length; j++) {
                        let a = statnames[j];
                        out.push(skills.title(a));
                        out.push(skills.cap(a));
                        out.push(skills.cap(a, true));
                    }
                }
            },
            /* The reason these are separate is that if we
             * can only update when the body exists, we might have
             * a situation where we update, and it's non-trivial
             * so we need to publish but then the body dies and so
             * we're forever sending repeated data when we don't
             * need to. This way we can flag it as already sent
             * regardless of if we had an update cycle.
             */
            publish: () => {
                if (out.length) {
                    let o = out.splice(0, out.length);
                    out = [];
                    return o;
                }
            },
        };
    }

    getstuff(s) {
        let val = '';
        //these have to be in reverse order
        val += s.amount("shi").toString(16).padStart(2, '0');
        val += s.amount("rgn").toString(16).padStart(2, '0');
        val += s.amount("mob").toString(16).padStart(2, '0');
        val += s.amount("rld").toString(16).padStart(2, '0');
        val += s.amount("dam").toString(16).padStart(2, '0');
        val += s.amount("pen").toString(16).padStart(2, '0');
        val += s.amount("str").toString(16).padStart(2, '0');
        val += s.amount("spd").toString(16).padStart(2, '0');
        val += s.amount("hlt").toString(16).padStart(2, '0');
        val += s.amount("atk").toString(16).padStart(2, '0');
        return val;
    }

    update(gui) {
        let b = gui.master.body;
        // We can't run if we don't have a body to look at
        if (!b) return 0;
        gui.bodyid = b.id;
        // Update most things
        gui.fps.update(Math.min(1, (global.fps / global.gameManager.roomSpeed / 1000) * 30)); 
        gui.color.update(gui.master.teamColor);
        gui.label.update(b.index);
        gui.score.update(JSON.stringify([b.skill.score, b.killCount.solo, b.killCount.assists, b.killCount.bosses]));
        gui.points.update(b.skill.points);
        // Update the upgrades
        let upgrades = [];
        let skippedUpgrades = [0];
        for (let i = 0; i < b.upgrades.length; i++) {
            let upgrade = b.upgrades[i];
            if (b.skill.level >= b.upgrades[i].level) {
                upgrades.push(upgrade.branch.toString() + "_" + upgrade.branchLabel + "_" + upgrade.index);
            } else {
                if (upgrade.branch >= skippedUpgrades.length) {
                    skippedUpgrades[upgrade.branch] = 1;
                } else {
                    skippedUpgrades[skippedUpgrades.length - 1]++;
                }
            }
        }
        b.skippedUpgrades = skippedUpgrades;
        gui.upgrades.update(upgrades);
        // Update the stats and skills
        gui.stats.update();
        gui.skills.update(this.getstuff(b.skill));
        // Update physics
        gui.accel.update(b.acceleration);
        gui.topspeed.update(b.topSpeed);
        // Update other
        gui.root.update(b.rerootUpgradeTree);
        gui.class.update(b.label);
    }

    publish(gui) {
        let o = {
            fps: gui.fps.publish(),
            label: gui.label.publish(),
            score: gui.score.publish(),
            points: gui.points.publish(),
            upgrades: gui.upgrades.publish(),
            color: gui.color.publish(),
            statsdata: gui.stats.publish(),
            skills: gui.skills.publish(),
            accel: gui.accel.publish(),
            top: gui.topspeed.publish(),
            root: gui.root.publish(),
            class: gui.class.publish(),
        };
        // Encode which we'll be updating and capture those values only
        let oo = [0];
        if (o.fps != null) {
            oo[0] += 0x0001;
            oo.push(o.fps || 1);
        }
        if (o.label != null) {
            oo[0] += 0x0002;
            oo.push(o.label);
            oo.push(o.color || gui.master.teamColor);
            oo.push(gui.bodyid);
        }
        if (o.score != null) {
            oo[0] += 0x0004;
            oo.push(o.score);
        }
        if (o.points != null) {
            oo[0] += 0x0008;
            oo.push(o.points);
        }
        if (o.upgrades != null) {
            oo[0] += 0x0010;
            oo.push(o.upgrades.length, ...o.upgrades);
        }
        if (o.statsdata != null) {
            oo[0] += 0x0020;
            oo.push(...o.statsdata);
        }
        if (o.skills != null) {
            oo[0] += 0x0040;
            oo.push(o.skills);
        }
        if (o.accel != null) {
            oo[0] += 0x0080;
            oo.push(o.accel);
        }
        if (o.top != null) {
            oo[0] += 0x0100;
            oo.push(o.top);
        }
        if (o.root != null) {
            oo[0] += 0x0200;
            oo.push(o.root);
        }
        if (o.class != null) {
            oo[0] += 0x0400;
            oo.push(o.class);
        }
        // Output it
        return oo;
    }

    newgui = (player) => {
        // This is the protected gui data
        let gui = {
            master: player,
            fps: this.floppy(),
            label: this.floppy(),
            score: this.floppy(),
            points: this.floppy(),
            upgrades: this.floppy(),
            color: this.floppy(),
            skills: this.floppy(),
            topspeed: this.floppy(),
            accel: this.floppy(),
            stats: this.container(player),
            bodyid: -1,
            root: this.floppy(),
            class: this.floppy(),
        };
        // This is the gui itself
        return {
            update: () => this.update(gui),
            publish: () => this.publish(gui),
        };
    };

    initalizePlayer(epackage, socket) {
        let name = epackage.name;
        let needsRoom = epackage.needsRoom;
        let autoLVLup = epackage.autoLVLup;
        let transferbodyID = epackage.transferbodyID;
        let eastereggs = {
            braindamage: epackage.braindamagemode
        };
        // Bring to life
        socket.status.deceased = false;
        // Define the player.
        if (this.players.indexOf(socket.player) != -1) { util.remove(this.players, this.players.indexOf(socket.player));  }
        // Free the old view
        if (global.gameManager.views.indexOf(socket.view) != -1) { util.remove(global.gameManager.views, global.gameManager.views.indexOf(socket.view)); socket.makeView(); }
        
        let spawn = true;

        if (transferbodyID) {
            let bodyInfo = global.travellingPlayers.find(i => i.id === transferbodyID);
            if (bodyInfo) {
                spawn = false;
                socket.player = socket.spawn(name);
                socket.player.body.upgrades = []
                for (let def of bodyInfo.definition) {
                    if (def in Class) socket.player.body.define(Class[def]);
                    else if (typeof def === "object") socket.player.body.define(def);
                }
                socket.player.body.skill.score = bodyInfo.score;
                socket.player.body.skill.deduction = bodyInfo.score;
                for (let i = 0; i < Config.LEVEL_CHEAT_CAP; i++) socket.player.body.skill.maintain();
                socket.player.body.killCount = bodyInfo.killCount;
                socket.player.body.skill.setCaps(bodyInfo.skillcap);
                socket.player.body.skill.set(bodyInfo.skill);
                socket.player.body.skill.points = bodyInfo.points;
                socket.player.body.color.base = socket.player.teamColor;
                util.remove(global.travellingPlayers, global.travellingPlayers.indexOf(bodyInfo));
            }
        }
        if (spawn) {
            if (needsRoom && Config.hidden) return socket.close();
            socket.player = socket.spawn(name);
            setTimeout(() => { // Give the entity a small time to prepare.
                // Trigger easter eggs if needed.
                if (!socket.player) return;
                if (eastereggs.braindamage) {
                    socket.player.body.orginFov = socket.player.body.FOV;
                    socket.player.body.eastereggs.braindamage = true;
                    let braindamageloop = setInterval(() => {
                        if (socket.player.body == null) return clearInterval(braindamageloop);
                        socket.player.body.facing = ran.randomAngle();
                        let stressFov = 0.5 + Math.floor(Math.random() * 2);
                        socket.player.body.FOV = stressFov * socket.player.body.orginFov;
                    }, 20)
                }
            }, 100)
            if (autoLVLup) {
                if (!socket.player.body) return;
                while (socket.player.body.skill.level < Config.LEVEL_CHEAT_CAP) {
                    socket.player.body.skill.score += socket.player.body.skill.levelScore;
                    socket.player.body.skill.maintain();
                    socket.player.body.refreshBodyAttributes();
                }
            }
        }
        // Start the update rhythm immediately
        socket.update(0);
        // Log it 
        util.log(`[INFO] [${global.gameManager.name}] ${name == "" ? "An unnamed player" : name} ${needsRoom ? "joined" : "rejoined"} the game on team ${socket.player.body.team}! Players: ${this.players.length}`);
    }
    newPlayer(socket) {
        let { player, loc } = this.getSpawnLocation(socket.rememberedTeam);
        // Save the player (temporarily as we are still connecting.)
        player.socket = socket;
        // Focus on the new location
        socket.camera.x = loc.x;
        socket.camera.y = loc.y;
        socket.camera.fov = 2000;
        socket.view.gazeUpon(true); // Do one tick so the camera can update.
        socket.rememberedTeam = player.team; // Save team
        socket.player.loc = loc;
    } 
    getSpawnLocation(rememberedTeam) {
        let player = {},
            loc = {};
        player.team = rememberedTeam;
        if (Config.MODE == "tdm" || Config.TAG) {
            let team = getWeakestTeam(global.gameManager);
            // Choose from one of the least ones
            if (player.team == null || (player.team !== team && global.defeatedTeams.includes(player.team))) {
                player.team = team;
            }
        };
        if (global.spawnPoint) loc = global.spawnPoint;
        else loc = getSpawnableArea(player.team, global.gameManager);
        return { player, loc };
    }
    spawn = (socket, name) => {
        let { player, loc } = this.getSpawnLocation(socket.rememberedTeam);
        if (socket.player.loc && !global.spawnPoint) loc = socket.player.loc;
        // Create and bind a body for the player host
        let body;
        const filter = this.disconnections.filter(r => r.ip === socket.ip && r.body && !r.body.isDead());
        if (filter.length) {
            let recover = filter[0];
            util.remove(this.disconnections, this.disconnections.indexOf(recover));
            clearTimeout(recover.timeout);
            body = recover.body;
            body.reset(false);
            body.become(player);
            player.team = body.team;
            socket.rememberedTeam = body.team;
        } else {
            body = new Entity(loc);
            body.protect();
            body.isPlayer = true;
            body.define(Config.SPAWN_CLASS);
            body.name = name;
            if (socket.permissions && socket.permissions.nameColor) {
                body.nameColor = socket.permissions.nameColor;
                socket.talk("z", body.nameColor);
            }
            body.become(player); // become it so it can speak and listen.
            socket.spectateEntity = null; // don't break the camera.
            body.invuln = true;
        }
        player.body = body;
        body.socket = socket;
        body.hasOperator = socket.status.hasOperator;
        // Decide how to color and team the body
        switch (Config.MODE) {
            case "tdm": {
                body.team = player.team;
                body.color.base = global.getTeamColor(player.body.team);
                socket.rememberedTeam = body.team;
            } break;
            case 'tag': {
                body.team = player.team;
                body.color.base = global.getTeamColor(player.body.team);
                socket.rememberedTeam = body.team;
                Config.TAG_DATA.addPlayer(body);
            } break;
            default: {
                body.team = -Math.floor(Math.random() * 2000) + 1;
                body.color.base = Config.RANDOM_COLORS ? 
                    ran.choose([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 ]) : getTeamColor(TEAM_RED);
            }
        }
        this.preparePlayer(socket, player, body);
        return player;
    };

    preparePlayer(socket, player, body, doNotTakeAction = {}) {
        // Decide what to do about colors when sending updates and stuff
        player.teamColor = new Color(!Config.RANDOM_COLORS && (Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG)) ? 10 : global.getTeamColor(body.team)).compiled; // blue
        // Set up the targeting structure
        player.target = { x: 0, y: 0 };
        // Set up the command structure
        player.command = {
            up: false,
            down: false,
            left: false,
            right: false,
            lmb: false,
            mmb: false,
            rmb: false,
            autofire: false,
            autospin: false,
            override: false,
            autoalt: false,
            spinlock: false
        };
        // Set up the recording commands
        if (!doNotTakeAction.dontOverrideRecords) {
            let begin = util.time();
            player.records = () => [
                player.body.skill.score,
                Math.floor((util.time() - begin) / 1000),
                Config.RESPAWN_TIMEOUT,
                player.body.killCount.solo,
                player.body.killCount.assists,
                player.body.killCount.bosses,
                player.body.killCount.polygons,
                player.body.killCount.killers.length,
                ...player.body.killCount.killers,
            ];
        }
        // Set up the player's gui
        player.gui = this.newgui(player);
        // Save the player
        player.socket = socket;
        this.players.push(player);
        // Focus on the new player
        socket.camera.x = body.x;
        socket.camera.y = body.y;
        socket.camera.fov = 2000;
        // Mark it as spawned
        socket.status.hasSpawned = true;

        //send the welcome message
        if (!doNotTakeAction.dontSendWelcomeMessage) {
            let msg = Config.WELCOME_MESSAGE.split("\n");
            for (let i = 0; i < msg.length; i++) {
                body.sendMessage(msg[i]);
            }
        }
        // Move the client camera
        socket.talk("c", socket.camera.x, socket.camera.y, socket.camera.fov);
    }

    flatten(data) {
        let output = [data.type]; // We will remove the first entry in the persepective method
        if (data.type & 0x01) {
            output.push(
                /*  1 */ data.facing,
                /*  2 */ data.layer,
                /*  3 */ data.index,
                /*  4 */ data.color,
                /*  5 */ data.size,
                /*  6 */ data.realSize,
                /*  7 */ data.sizeFactor,
                /*  8 */ data.angle,
                /*  9 */ data.direction,
                /* 10 */ data.offset,
                /* 11 */ data.mirrorMasterAngle,
            );            
        } else if (data.type & 0x10) {
            output.push(
                /*  1 */ data.id,
                /*  2 */ data.index,
                /*  3 */ data.x,
                /*  4 */ data.y,
                /*  5 */ data.vx,
                /*  6 */ data.vy,
                /*  7 */ data.size,
                /*  8 */ data.facing,
                /*  9 */ data.vfacing,
                /* 11 */ data.layer,
                /* 12 */ data.color,
                /* 14 */ Math.ceil(65535 * data.health),
                /* 15 */ Math.round(65535 * data.shield),
                /* 16 */ Math.round(255 * data.alpha)
            );
        } else {
            output.push(
                /*  1 */ data.id,
                /*  2 */ data.index,
                /*  3 */ data.x,
                /*  4 */ data.y,
                /*  5 */ data.vx,
                /*  6 */ data.vy,
                /*  7 */ data.size,
                /*  8 */ data.facing,
                /*  9 */ data.vfacing,
                /* 10 */ data.twiggle,
                /* 11 */ data.layer,
                /* 12 */ data.color,
                /* 14 */ data.borderless,
                /* 15 */ data.drawFill,
                /* 16 */ data.invuln,
                /* 17 */ Math.ceil(65535 * data.health),
                /* 18 */ Math.round(65535 * data.shield),
                /* 19 */ Math.round(255 * data.alpha)
            );
            if (data.type & 0x04) {
                output.push(
                    /* 17 */ data.name,
                    /* 18 */ data.score
                );
            }
        };
        // Add the gun data to the array
        output.push(data.guns.length);
        for (let i = 0; i < data.guns.length; i++) {
            for (let k in data.guns[i])
                output.push(data.guns[i][k]);
        }
        // For each turret, add their own output
        output.push(data.turrets.length);
        for (let i = 0; i < data.turrets.length; i++) output.push(...this.flatten(data.turrets[i]));
        // Return it
        return output;
    }
    
    perspective(e, player, data) {
        if (player.body != null) {
            if (player.body.id === e.master.id) {
                data = data.slice(); // So we don't mess up references to the original
                // Set the proper color if it's on our team and decide what to do about colors when sending updates and stuff
                player.teamColor = new Color(!Config.RANDOM_COLORS && (Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG)) ? 10 : global.getTeamColor(player.body.team)).compiled; // blue
                // And make it force to our mouse if it ought to
                if (player.command.autospin) {
                    data[10] = 1;
                }
            }
            if (
                player.body.team === e.source.team &&
                (Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG))
            ) {
                // GROUPS
                data = data.slice();
                if (e.limited) data[11] = player.teamColor;
                else data[12] = player.teamColor;
            }
        }
        return data;
    }

    generateMockup(index) {
        index = parseInt(index);
        let mock;
        let find = Object.keys(Class).find(o => Class[o] && Class[o].index === index);
        if (find) {
            // This function generates the mockup.
            buildMockup(find, global.gameManager);
            // Okay, now we are able to find it without any problems.
            mock = mockupData.find(o => o.index === `${index}`);
        } else mock = null;

        return mock;
    }

    sendMockup(index, socket) {
        for (let splittedIndex of index.toString().split("-")) {
            if (socket.status.mockupData.receivedIndexes.includes(splittedIndex)) continue; // Do NOT continue if we have the mockup already.

            let index = parseInt(splittedIndex); // Parse it, without this won't work for some reason.
            // Now we need to find the mockup.
            let mockup = mockupData.find(o => o.index === `${index}`);
            if (!mockup) { // If not, then make one.
                let e = this.generateMockup(index);
                mockup = mockupData.find(o => o.index === `${e.index}`);
            }
            // Send the mockup to the client.
            socket.talk("M", index, JSON.stringify(mockup));
            // Also push it to the socket's status so we know it.
            socket.status.mockupData.receivedMockups.push(mockup);
            // Push the index so the function doesn't run a thousands of times.
            socket.status.mockupData.receivedIndexes.push(splittedIndex);
            // Now we need the turret mockups.
            for (let turrets of mockup.turrets) {
                // Run the same function, but it targets the turret mockups.
                this.sendMockup(turrets.index, socket);
            }
            if (mockup.sendAllMockups) { // Send all of its upgrades if needed to prevent bugs.
                // Target upgrades
                for (let upgrades of mockup.upgrades) {
                    for (let i of upgrades.index.split("-")) { // Split the indexes.
                        this.sendMockup(i, socket);
                        this.sendMockupUpgrades(i, socket);
                    }
                }
            }
        }
    }

    sendMockupUpgrades(index, socket) {
        let allowToContinue = true;
        for (let i = 0; i < socket.status.mockupData.receivedUpgradePackMockups.length; i++) {
            let entry = socket.status.mockupData.receivedUpgradePackMockups[i];
            if (entry.index == `${index}`) allowToContinue = false;
        }
        if (!allowToContinue) return;
        index = parseInt(index);
        let mockup = mockupData.find(o => o.index === `${index}`);
        if (!mockup) {
            let e = this.generateMockup(index);
            mockup = mockupData.find(o => o.index === `${e.index}`);
        }
        socket.status.mockupData.receivedUpgradePackMockups.push(mockup);
        for (let e of mockup.upgrades) {
            this.sendMockup(e.index, socket);
            this.sendMockupUpgrades(e.index, socket);
        };
    }

    eyes(socket) {
        const check = (camera, obj) => {
            let fov = global.gameManager.arenaClosed ? 1.6 : 1;
            return Math.abs(obj.x - camera.x) < camera.fov * fov + 1.5 * obj.size + 100 &&
                Math.abs(obj.y - camera.y) < camera.fov * fov * 0.5625 + 1.5 * obj.size + 100;
        };
        let lastVisibleUpdate = 0;
        let nearby = new Map();
        let o = {
            socket,
            getNearby: () => nearby,
            add: e => { if (check(socket.camera, e)) nearby.set(e.id, e); },
            remove: e => { nearby.delete(e.id) },
            check: (e) => { return check(socket.camera, e); },
            gazeUpon: (updateCam = false) => {
                logs.network.set();
                // If nothing has changed since the last update, wait (approximately) until then to update
                let lastCycle = global.gameManager.room.lastCycle;
                if (lastCycle === socket.camera.lastUpdate) {
                    socket.update(5 + global.gameManager.room.cycleSpeed - util.time() + lastCycle);
                    return 1;
                }
                // else update it.
                socket.camera.lastUpdate = lastCycle;
                // Receive it!
                socket.status.receiving++;
                // Prepare to emit data to send to the client to render.
                let player = socket.player, // Quick Define player
                    camera = socket.camera, // Quick Define camera
                    fovNow = camera.fov;
                // If we are alive, update the camera.
                if (player.body != null) {
                    // If we are dead, then let the client know.
                    if (player.body.isDead()) {
                        let purge = () => player.body = null; // Remove our bonded body.
                        if (player.body.store && player.body.store.dragInterval) { // If we are still dragging an entity, clear it and delete it.
                            clearInterval(player.body.store.dragInterval);
                            delete player.body.store.dragInterval;
                        }
                        let die = () => { // The only reason this exist is because of bacteria's abilities.
                            socket.status.deceased = true;
                            // Let the client know it died
                            socket.talk("F", ...player.records());
                            purge(); // Call the function so it can remove the body.
                        }
                        if (player.body.master.label == "Bacteria") { // Why not trigger bacteria's abilities :)
                            let exit = () => die();
                            let newgui = (player) => this.newgui(player);
                            becomeBulletChildren(socket, player, exit, newgui);
                        } else die();
                    } else if (player.body.photo) { // If we are alive, update camera's position.
                        // Define X and Y and update the camera's X and Y.
                        let x = player.body.cameraOverrideX === null ? player.body.photo.x : player.body.cameraOverrideX,
                            y = player.body.cameraOverrideY === null ? player.body.photo.y : player.body.cameraOverrideY;

                        camera.x = x;
                        camera.y = y;
                        camera.vx = player.body.photo.vx;
                        camera.vy = player.body.photo.vy;
                        camera.scoping = player.body.cameraOverrideX !== null; // For scoping.
                        // Get what we should be able to see
                        fovNow = player.body.fov;
                        // Get our body id
                        player.viewId = player.body.id;
                    }
                } 
                if (player.body == null) { // if we have nobody, then u dead bro.
                    fovNow = 2000;
                    camera.scoping = false; // No scoping bugs!
                    if (socket.spectateEntity != null) { // If we want to spectate someone, we spectate it.
                        if (socket.spectateEntity) {
                            camera.x = socket.spectateEntity.x;
                            camera.y = socket.spectateEntity.y;
                        }
                    }
                }
                // The only reason this exists is that the client is smoothing to its updated fov, and so the server does it the same.
                camera.fov += (fovNow - camera.fov) / 30;

                // Grab entities that we can see
                if (camera.lastUpdate - lastVisibleUpdate > Config.visibleListInterval) {
                    // Update our timer
                    lastVisibleUpdate = camera.lastUpdate;
                    
                    // Reuse the nearby array instead of recreating it
                    nearby.clear();
                    
                    // Pre-calculate camera bounds for the broad check
                    const camFovBroad = camera.fov * (global.gameManager.arenaClosed ? 1.6 : 1);
                    const camXBound = camFovBroad + 100;
                    const camYBound = camFovBroad * 0.5625 + 100;
                    
                    // Get nearby entities with single efficient check
                    for (const entity of entities.values()) { 
                        // Simplified check that combines both visibility checks
                        if (Math.abs(entity.x - camera.x) < camXBound + 1.5 * entity.size &&
                            Math.abs(entity.y - camera.y) < camYBound + 1.5 * entity.size) {
                            nearby.set(entity.id, entity);
                        }
                    }
                }
                
                // Reset the nearby for this frame and prepare for detailed visibility check
                let visible = [];
                
                // Pre-calculate constants for the detailed visibility check
                const camX = camera.x, camY = camera.y, camFov = camera.fov;
                const limitDistance = 1.5;  // Recommended value is 2
                const fovDiv = camFov / limitDistance;
                const fovDivY = fovDiv * (9 / 13);
                
                // Prepare a batch of mockups to send
                const mockupsToSend = new Set();
                
                // Check each nearby entity for detailed visibility
                for (const entity of nearby.values()) {
                    
                    // Detailed visibility check
                    if (entity.photo && 
                        Math.abs(entity.x - camX) < fovDiv + 1.5 * entity.size &&
                        Math.abs(entity.y - camY) < fovDivY + 1.5 * entity.size
                    ) {
                        // Add mockup to batch if needed
                        if (!Config.LOAD_ALL_MOCKUPS && entity.index) {
                            mockupsToSend.add(entity.index);
                        }
                
                        // Lazily initialize flattened photo
                        if (!entity.flattenedPhoto) {
                            entity.flattenedPhoto = this.flatten(entity.photo);
                        }
                        
                        // Add to visible entities
                        visible.push(this.perspective(entity, player, entity.flattenedPhoto));
                    }
                }
                
                // Send mockups as a batch if needed
                if (!Config.LOAD_ALL_MOCKUPS && mockupsToSend.size > 0) {
                    for (const index of mockupsToSend) {
                        this.sendMockup(index, socket);
                    }
                }
                // Spread it for upload
                const view = [].concat(...visible);
                if (!Config.LOAD_ALL_MOCKUPS) {
                    for (let upgrade of (player.body?.upgrades || [])) {
                        if (player.body.skill.level >= upgrade.level) {
                            this.sendMockup(upgrade.index, socket);
                        }
                    }
                }
                if (updateCam) {
                    socket.talk(
                        "u",
                        true,
                        camera.x,
                        camera.y,
                    );
                } else {
                    // Update the gui
                    player.gui.update();
                    // Send it to the player
                    socket.talk(
                        "u",
                        lastCycle,
                        camera.x,
                        camera.y,
                        fovNow,
                        camera.vx,
                        camera.vy,
                        camera.scoping,
                        ...player.gui.publish(),
                        visible.length,
                        ...view
                    );
                }
                 // Queue up some for the front util.log if needed
                if (socket.status.receiving < 1) {
                    socket.update(Math.max(
                        0,
                        (1000 / 24) - (camera.lastDowndate - camera.lastUpdate), 
                        camera.ping / 1
                    ));
                } else {
                    if (!updateCam) socket.update(0);
                }
                logs.network.mark();
            },
        };
        global.gameManager.views.push(o);
        return o;
    }

    deltaHandler = (() => {
        const Delta = class {
            constructor(dataLength, finder) {
                this.dataLength = dataLength;
                this.finder = finder;
                this.data = [];
            }
            update(id = 0, ...args) {
                if (!this.data[id]) this.data[id] = this.finder([]);
                let old = this.data[id];
                let now = this.finder(args);
                this.data[id] = now;
                this.now = now;
                let oldIndex = 0;
                let nowIndex = 0;
                let updates = [];
                let updatesLength = 0;
                let deletes = [];
                let deletesLength = 0;
                while (oldIndex < old.length && nowIndex < now.length) {
                    let oldElement = old[oldIndex];
                    let nowElement = now[nowIndex];
                    if (oldElement.id === nowElement.id) {
                        // update
                        nowIndex++;
                        oldIndex++;
                        let updated = false;
                        for (let i = 0; i < this.dataLength; i++)
                            if (oldElement.data[i] !== nowElement.data[i]) {
                                updated = true;
                                break;
                            }
                        if (updated) {
                            updates.push(nowElement.id, ...nowElement.data);
                            updatesLength++;
                        }
                    } else if (oldElement.id < nowElement.id) {
                        // delete
                        deletes.push(oldElement.id);
                        deletesLength++;
                        oldIndex++;
                    } else {
                        // create
                        updates.push(nowElement.id, ...nowElement.data);
                        updatesLength++;
                        nowIndex++;
                    }
                }
                for (let i = oldIndex; i < old.length; i++) {
                    deletes.push(old[i].id);
                    deletesLength++;
                }
                for (let i = nowIndex; i < now.length; i++) {
                    updates.push(now[i].id, ...now[i].data);
                    updatesLength++;
                }
                let reset = [0, now.length],
                    update = [deletesLength, ...deletes, updatesLength, ...updates];
                for (let element of now) reset.push(element.id, ...element.data);
                return { update, reset };
            }
        };
        let makeLeaderboardList = (list, args) => {
            let topTen = [];
            for (let i = 0; i < 10 && list.length; i++) {
                let top,
                    is = 0;
                for (let j = 0; j < list.length; j++) {
                    let val = list[j].skill.score;
                    if (val > is) {
                        is = val;
                        top = j;
                    }
                }
                if (is === 0) break;
                let entry = list[top];
                let color = entry.leaderboardColor ? entry.leaderboardColor + " 0 1 0 false" 
                    : Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG) ? '11 0 1 0 false'
                    : entry.color.compiled;
                topTen.push({
                    id: entry.id,
                    data: [
                        Math.round(entry.skill.score),
                        entry.index,
                        entry.name,
                        color,
                        color,
                        entry.nameColor || "#FFFFFF",
                        entry.label,
                        entry.settings.renderOnLeaderboard,
                    ],
                });
                list.splice(top, 1);
            }
            global.gameManager.room.topPlayerID = topTen.length ? topTen[0].id : -1;
            return topTen.sort((a, b) => a.id - b.id);
        }
        let makeLeaderboardHPList = (list) => {
            let topTen = [];
            for (let i = 0; i < 10 && list.length; i++) {
                let top,
                    is = 0;
                for (let j = 0; j < list.length; j++) {
                    let val = list[j].skill.score;
                    if (val > is) {
                        is = val;
                        top = j;
                    }
                }
                if (is === 0) break;
                let entry = list[top];
                topTen.push({
                    id: entry.id + 100, // Make independent id
                    data: [
                        Math.round((entry.health.amount / entry.health.max) * 100),
                        entry.index.toString(),
                        entry.name === "" ? entry.label : entry.name,
                        entry.color.compiled,
                        entry.color.compiled,
                        "#ffffff",
                        Class.hp.LABEL,
                        false,
                    ]
                });
                list.splice(top, 1);
            }
            global.gameManager.room.topPlayerID = topTen.length ? topTen[0].id : -1;
            return topTen.sort((a, b) => a.id - b.id);
        }
        // Deltas
        let minimapAll = new Delta(5, args => {
            let all = [];
            for (const my of entities.values()) {
                if (my.allowedOnMinimap && (
                    my.alwaysShowOnMinimap ||
                    (my.type === "wall" && my.alpha > 0.2) ||
                    my.type === "miniboss" || my.type == "portal" || 
                    my.isMothership
                )) {
                    const x = Config.BLACKOUT ? Math.floor(Math.random() * global.gameManager.room.width - global.gameManager.room.width / 2) : my.x;
                    const y = Config.BLACKOUT ? Math.floor(Math.random() * global.gameManager.room.height - global.gameManager.room.height / 2) : my.y;
                    all.push({
                        id: my.id,
                        data: [
                            Config.BLACKOUT ? 0 : my.type === "wall" || my.isMothership ? my.shape === 4 ? 2 : 1 : 0,
                            util.clamp(Math.floor((256 * x) / global.gameManager.room.width), -128, 127),
                            util.clamp(Math.floor((256 * y) / global.gameManager.room.height), -128, 127),
                            Config.BLACKOUT ? Config.BLACKOUT_MINIMAP_COLOR + " 0 1 0 false" : my.minimapColor ? my.minimapColor + " 0 1 0 false" : my.color.compiled,
                            Math.round(my.SIZE),
                        ],
                    });
                }
            }
            return all;
        });
        let minimapTeams = new Delta(3, args => {
            let all = [];
            for (const my of entities.values())
                if (my.type === "tank" && my.team === args[0] && my.master === my && my.allowedOnMinimap) {
                    all.push({
                        id: my.id,
                        data: [
                            util.clamp(Math.floor((256 * my.x) / global.gameManager.room.width), -128, 127),
                            util.clamp(Math.floor((256 * my.y) / global.gameManager.room.height), -128, 127),
                            my.minimapColor ? my.minimapColor + " 0 1 0 false" : Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG) ? '10 0 1 0 false' : my.color.compiled,
                        ],
                    });
                }
            return all;
        });
        let minimapAllTeams = new Delta(3, args => {
            let all = [];
            for (const my of entities.values())
                if (my.type === "tank" && my.master === my && !my.lifetime) {
                    all.push({
                        id: my.id,
                        data: [
                            util.clamp(Math.floor((256 * my.x) / global.gameManager.room.width), -128, 127),
                            util.clamp(Math.floor((256 * my.y) / global.gameManager.room.height), -128, 127),
                            my.minimapColor ? my.minimapColor + " 0 1 0 false" : Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG) ? '12 0 1 0 false' : my.color.compiled,
                        ],
                    });
                }
            return all;
        });
        let globalLeaderboard = new Delta(7, args => {
            let list = [];
            if (Config.TAG) {
                let teams = Config.TAG_DATA.getData();
                for (let i = 0; i < teams.length; i++) {
                  list.push({
                    id: i,
                    data: [
                      teams[i],
                      Class.tagMode.index.toString(),
                      teamNames[i],
                      getTeamColor(-i - 1, true),
                      getTeamColor(-i - 1, true),
                      "#ffffff",
                      Class.tagMode.LABEL,
                      false,
                    ],
                  });
                }
                return list;
            }
            if (Config.MOTHERSHIP) {
                let teams = Config.MOTHERSHIP_DATA.getData();
                for (let i = 0; i < teams.length; i++) {
                    let m = teams[i];
                    if (!m.isDead()) {
                        list.push({
                            id: m.id,
                            data: [
                                Math.round((m.health.amount / m.health.max) * 100),
                                m.index.toString(),
                                teamNames[i],
                                getTeamColor(-i - 1, true),
                                getTeamColor(-i - 1, true),
                                "#ffffff",
                                Class.hp.LABEL,
                                false,
                            ]
                        });
                    }
                }
                return list;
            }
            for (let instance of entities.values()) {
                if (instance.settings.leaderboardable &&
                    instance.settings.drawShape &&
                    (instance.type === "tank" ||
                     instance.killCount.solo ||
                     instance.killCount.assists
                    )
                ) list.push(instance);
            }
            return makeLeaderboardList(list, args);
        });
        let defaultLeaderboard = new Delta(7, args => {
            let list = [];
            for (const instance of entities.values()) {
                if (instance.settings.leaderboardable &&
                    instance.settings.drawShape &&
                    instance.type !== "food" &&
                    (instance.type === "tank" ||
                     instance.killCount.solo ||
                     instance.killCount.assists
                    )
                ) list.push(instance);
            }
            return makeLeaderboardList(list, args);
        });
        let playerLeaderboard = new Delta(7, args => {
            let list = [];
            for (const instance of entities.values()) {
                if (
                    instance.isPlayer &&
                    instance.settings.leaderboardable &&
                    instance.settings.drawShape
                ) list.push(instance);
            }
            return makeLeaderboardList(list, args);
        })
        let bossLeaderboard = new Delta(7, args => {
            let list = [];
            for (const instance of entities.values()) {
                if (
                    (instance.isBoss ||
                     instance.type == "miniboss"
                    ) &&
                    instance.settings.leaderboardable &&
                    instance.settings.drawShape
                ) list.push(instance);
            }
            return makeLeaderboardHPList(list);
        })
        let subscribers = [];
        setInterval(() => {
            logs.minimap.set();
            let minimapUpdate = minimapAll.update(),
                leaderboardUpdate,
                minimapAllTeamsUpdate = minimapAllTeams.update(),
                minimapTeamUpdates;
            for (let socket of subscribers) {
                minimapTeamUpdates = minimapTeams.update(socket.id, socket.player.body ? socket.player.body.team : socket.player.team);
                if (!socket.status.selectedLeaderboard) socket.status.selectedLeaderboard = "global";
                if (!socket.status.hasSpawned || socket.status.selectedLeaderboard == "stop") continue;
                let sl = socket.status.selectedLeaderboard;
                let getLeaderboard =
                sl == "global" ? globalLeaderboard :
                sl == "default" ? defaultLeaderboard :
                sl == "players" ? playerLeaderboard :
                sl == "bosses" ? bossLeaderboard :
                globalLeaderboard;

                leaderboardUpdate = getLeaderboard.update(
                    socket.id,
                    (Config.GROUPS || (Config.MODE == 'ffa' && !Config.TAG)) && socket.player.body ? socket.player.body.id : null
                );
                let team = socket.status.seesAllTeams ? minimapAllTeamsUpdate : minimapTeamUpdates;
                
                // Send the leaderboard tanks' mockups
                if (global.gameManager.gameHandler.active) {
                    for (let e of globalLeaderboard.now) {
                        this.sendMockup(e.data[1], socket);
                    }
                }

                if (socket.status.needsNewBroadcast) {
                    socket.talk("RM");
                    socket.talk(
                      "b",
                      ...minimapUpdate.reset,
                      ...(team ? team.reset : [0, 0]),
                      ...(socket.anon ? [0, 0] : leaderboardUpdate.reset)
                    );
                    socket.status.needsNewBroadcast = false;
                } else {
                    socket.talk(
                      "b",
                      ...minimapUpdate.update,
                      ...(team ? team.update : [0, 0]),
                      ...(socket.anon ? [0, 0] : leaderboardUpdate.update)
                    );
                }
                if (socket.status.forceNewBroadcast) {
                    socket.talk("RM");
                    socket.talk("RL");
                    socket.status.needsNewBroadcast = true;
                }
            }
            logs.minimap.mark();
            let time = performance.now();
            for (let socket of this.clients) {
                if (socket.timeout.check(time)) socket.lastWords("K");
                if (time - socket.statuslastHeartbeat > Config.maxHeartbeatInterval) socket.kick("Lost heartbeat.");
            }
        }, 250);
        const broadcast = {
            add: socket => subscribers.push(socket),
            remove: socket => {
                let i = subscribers.indexOf(socket);
                if (i !== -1) util.remove(subscribers, i);
            },
        };
        return {
            subscribe: (socket) => broadcast.add(socket),
            unsubscribe: (socket) => broadcast.remove(socket),
        }
    })();

    sendToServer(socket, server) {
        if (!socket.player?.body || socket.status.transferred) return;
        socket.status.transferred = true;
        let id = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
        fetch(`${server}/api/sendPlayer`, {
            method: "POST",
            body: JSON.stringify({
                key: process.env.API_KEY,
                id: id,
                name: socket.player.body.name,
                definition: socket.player.body.defs.map(d => Object.keys(Class).find(k => Class[k] === d) || d),
                score: socket.player.body.skill.score,
                killCount: socket.player.body.killCount,
                level: socket.player.body.skill.level,
                skillcap: socket.player.body.skill.caps,
                skill: socket.player.body.skill.raw,
                points: socket.player.body.skill.points,
            }),
        }).then(async (r) => {
            if (r.status === 200) {
                socket.talk("t", server.replace("http://", "").replace("https://", ""), id);
            }
        }).catch(e => {
            console.log(e);
            socket.status.transferred = false;
        });
    };

    connect(socket, req) {
        util.log(`[INFO]: [${this.gamemode}] A client wants to connect...`);
        socket.player = { camera: {} };
        socket.nearby = [];
        socket.spectateEntity = null;
        socket.id = crypto.randomUUID();
        socket.binaryType = "arraybuffer";
        socket.onerror = () => {};
        socket.spawn = (name) => this.spawn(socket, name);
        socket.onerror = () => {};
        socket.kick = (reason) => {
            util.warn(reason + " Kicking.");
            socket.close();
        };
        socket.talk = (...message) => {
            if (socket.readyState === socket.OPEN) {
                socket.send(protocol.encode(message), { binary: true });
            }
        };
        socket.ban = (reason) => this.ban(socket, reason);
        socket.permaban = (reason) => this.permaban(socket, reason);
        socket.lastWords = (...message) => {
            if (socket.readyState === socket.OPEN) { 
                socket.send(protocol.encode(message), { binary: true, });
                socket.terminate();
            } 
        };
        socket.on("close", () => {
            socket.loops.terminate();
            this.close(socket);
        });
        socket.initMockupList = () => {
            return {
                receivedIndexes: [], // The only reason why this exist is that to prevent lags from the socket gazeUpon, You can find it out by removing this.
                receivedMockups: [],
                receivedUpgradePackMockups: [],
                requestMockups: [],
            }
        }
        socket.messageManager = socket.on("message", message => this.incoming(message, socket));
        socket.connectedTo = global.gameManager.name;
        let mem = 0;
        let timer = 0;
        socket.timeout = {
            check: (time) => timer && time - timer > Config.maxHeartbeatInterval,
            set: (val) => {
                if (mem !== val) {
                    mem = val;
                    timer = performance.now();
                }
            },
        };
        socket.awaiting = {};
        socket.awaitResponse = function (options, callback) {
            socket.awaiting[options.packet] = {
                callback: callback,
                timeout: setTimeout(() => {
                    console.log("Socket did not respond to the eval packet, kicking...");
                    socket.kick("Did not comply with the server's protocol.");
                }, options.timeout),
            };
        };
        socket.resolveResponse = function (id, packet) {
            if (socket.awaiting[id]) {
                clearTimeout(socket.awaiting[id].timeout);
                socket.awaiting[id].callback(packet);
                return true;
            }
            return false;
        };
        // Set up the status container
        socket.status = {
            verified: false,
            receiving: 0,
            deceased: true,
            requests: 0,
            hasSpawned: false,
            needsFullMap: true,
            needsNewBroadcast: true,
            forceNewBroadcast: false,
            selectedLeaderboard: false,
            seesAllTeams: false,
            readyToSpawn: true,
            hasOperator: false,
            mockupData: socket.initMockupList(),
            lastHeartbeat: util.time(),
        };  
        // Set up loops
        let nextUpdateCall = null; // has to be started manually
        let trafficMonitoring = setInterval(() => this.traffic(socket), 1500);
        this.deltaHandler.subscribe(socket);
        socket.loops = {
            setUpdate: (timeout) => {
                nextUpdateCall = timeout;
            },
            cancelUpdate: () => {
                clearTimeout(nextUpdateCall);
            },
            terminate: () => {
                clearTimeout(nextUpdateCall);
                clearTimeout(trafficMonitoring);
                this.deltaHandler.unsubscribe(socket);
            },
        };
        // Set up the camera
        socket.camera = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            lastUpdate: performance.now(),
            lastDowndate: undefined,
            scoping: false,
            fov: 2000,
        };
        // Set up the viewer
        socket.makeView = () => { socket.view = this.eyes(socket); };
        socket.makeView();
        // And make an update
        socket.update = time => {
            socket.loops.cancelUpdate();
            socket.loops.setUpdate(setTimeout(() => { socket.view.gazeUpon(); }, time));
        };

        // Account for proxies
        // Very simplified reimplementation of what the forwarded-for npm package does
        let store = req.headers['fastly-client-ip'] || req.headers["cf-connecting-ip"] || req.headers['x-forwarded-for'] || req.headers['z-forwarded-for'] ||
                    req.headers['forwarded'] || req.headers['x-real-ip'] || req.connection.remoteAddress,
            ips = store.split(',');

        if (!ips) {
            return socket.kick("Missing IP: " + store);
        }

        for (let i = 0; i < ips.length; i++) {
            if (net.isIPv6(ips[i])) {
                ips[i] = ips[i].trim();
            } else {
                ips[i] = ips[i].split(':')[0].trim();
            }
            if (!net.isIP(ips[i])) {
                return socket.kick("Invalid IP(s): " + store);
            }
        }

        socket.ip = ips[0];

        try {
            if (fs.existsSync(PERMABAN_FILE)) {
                permBans = JSON.parse(fs.readFileSync(PERMABAN_FILE));
                if (permBans.some(b => b.ip === socket.ip)) {
                    socket.talk("permanentban");
                    socket.kick("Permanent Banned player found!");
                    return;
                }
            }
        } catch (e) {
            console.error("Error checking permabans:", e);
        }
        // Log it
        util.log("[INFO] New socket opened with ip " + socket.ip);

        this.clients.push(socket);

        if (!global.gameManager.parentPort) {
            for (let i = 0; i < global.servers.length; i++) {
                let server = global.servers[i];
                if (server.gameManager) server.players++;
            }
        } else {
            global.gameManager.parentPort.postMessage([true, this.clients.length]);
        }
        util.log(`[INFO]: [${this.gamemode}] Client has been welcomed!`);

        if (Config.LOAD_ALL_MOCKUPS) {
            for (let i = 0; i < mockupData.length; i++) {
                socket.talk("M", mockupData[i].index, JSON.stringify(mockupData[i]));
            }
        }

        // Let the client know that we are connected.
        socket.talk("W", true);
    };

    disconnect(socket) {
        let check = this.clients.find(o => o.id === socket.id);
        if (check) {
            check.loops.terminate();
            util.log(`[INFO]: [${this.gamemode}] ${check.player.body ? check.player.body.name : "A Client"} has disconnected!`);
            // Free the view
            util.remove(global.gameManager.views, global.gameManager.views.indexOf(socket.view));
            // Remove the client from the server.
            util.remove(this.clients, this.clients.indexOf(check));
            this.close(socket);
        }
    }
}

module.exports = { socketManager };

// Log startup messages
console.log("Starting up...");
console.log("Importing modules...\n");

const path = require("path");
const fs = require("fs");

const { Worker } = require("worker_threads");

// Increase the stack trace limit for better debugging
Error.stackTraceLimit = Infinity;

// Load environment variables from .env using a custom dotenv loader
const dotenv = require("./lib/dotenv.js");
const envContent = fs.readFileSync(path.join(__dirname, "./.env")).toString();
const environment = dotenv(envContent);

// Set each environment variable in process.env
for (const key in environment) {
    process.env[key] = environment[key];
}

// Load all necessary modules and files via the loader
const GLOBAL = require("./loaders/loader.js");

// Load definitions and tile definitions
new definitionCombiner({ groups: fs.readdirSync(path.join(__dirname, './lib/definitions/groups')), addonsFolder: path.join(__dirname, './lib/definitions/tankAddons') }).loadDefinitions();
GLOBAL.loadRooms(true);

// Optionally load all mockups if enabled in configuration
if (Config.LOAD_ALL_MOCKUPS) global.loadAllMockups();

// Log loader information including creation date and time
console.log(`Loader successfully loaded all files. Info: [ Created Date: ${GLOBAL.creationDate} Created Time: ${GLOBAL.creationTime} ]`);

// Define the public directory for static files
const publicRoot = path.join(__dirname, "../public/"),
mimeSet = {
    js: "application/javascript",
    json: "application/json",
    css: "text/css",
    html: "text/html",
    md: "text/markdown",
    //"png": "image/png",
};

let wsServer; // WebSocket server instance
let server; // HTTP server instance

// Attempt to create a WebSocket server instance using the 'ws' package
try {
    const WebSocketServer = require("ws").WebSocketServer;
    wsServer = new WebSocketServer({ noServer: true });
} catch (err) {
    throw new Error(
        "Package 'ws' is not installed! To install it, run 'npm install ws' in the terminal."
    );
}

// Log a warning if Access-Control-Allow-Origin is enabled
if (Config.allowAccessControlAllowOrigin && Config.LOGS) {
    util.warn("'Access-Control-Allow-Origin' is enabled, which allows any server/client to access it.");
}

// Create an HTTP server to handle both API and static file requests
server = require("http").createServer((req, res) => {
    let readString = ""; // Response content for API endpoints
    let ok = true; // Flag to indicate whether we use default API response
    let serversIP = [];

    // Set CORS headers if enabled in the configuration or allow only the children servers.
    for (let server of global.servers) if (server.ip !== Config.host && server.ip) {
        let http = server.ip.startsWith("localhost") ? `http://${server.ip}` : `https://${server.ip}`;
        serversIP.push(http);
    };
    if (Config.allowAccessControlAllowOrigin || serversIP.includes(req.headers.origin)) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }

    // Handle specific API endpoints based on the request URL
    switch (req.url) {
        case "/getServers.json": {
            // Serve a list of active servers (excluding hidden ones)
            readString = JSON.stringify(servers.filter((s) => s && !s.hidden).map((server) => ({
                    ip: server.ip,
                    players: server.players,
                    maxPlayers: server.maxPlayers,
                    id: server.id,
                    region: server.region,
                    gameMode: server.gameMode,
                }))
            );
        } break;
        case "/getTotalPlayers": {
            let countPlayers = 0;
            servers.forEach((s) => {
                countPlayers += s.players;
            });
            readString = JSON.stringify(countPlayers);
        } break;
        case "/api/sendPlayer": {
            ok = false;
            let body = "";
            req.on("data", c => body += c);
            req.on("end", () => {
                let json = null;
                try {
                    json = JSON.parse(body);
              } catch { }
                  if (json) {
                      if (json.key === process.env.API_KEY) {
                            let { id, name, definition, score, level, skillcap, skill, points, killCount } = json;
                            global.travellingPlayers.push({ id, name, definition, score, level, skillcap, skill, points, killCount });
                            res.writeHead(200);
                            res.end("OK");
                        } else {
                            res.writeHead(403);
                            res.end("Access Denied");
                        }
                    } else {
                        res.writeHead(400);
                        res.end("Invalid JSON body");
                    }
            });
        } break;
        case "/portalPermission": {
            ok = false;
            let sserver = [];
            if (Config.ALLOW_SERVER_TRAVEL && global.launchedOnMainServer) {
                for (let i = 0; i < global.servers.length; i++) {
                    let server = global.servers[i];
                    if (server.gameManager) sserver.push(server);
                }
                res.writeHead(200);
                res.end(JSON.stringify(sserver.map((server) => ({
                    ip: server.ip,
                    players: server.players,
                    gameMode: server.gameMode,
                }))));
            } else {
                res.writeHead(404);
                res.end("Denied.");
            }
        } break;
        case "/isOnline": {
            readString = "true";
        } break;
        default: {
            // For all other routes, serve static files from the public directory
            ok = false;
            let fileToGet = path.join(publicRoot, req.url);

            // If the requested file doesn't exist or isn't a file, default to the INDEX_HTML file
            if (!fs.existsSync(fileToGet) || !fs.lstatSync(fileToGet).isFile()) {
                fileToGet = path.join(publicRoot, Config.INDEX_HTML);
            }

            // Determine the file's MIME type based on its extension and serve the file stream
            const extension = fileToGet.split(".").pop();
            res.writeHead(200, { "Content-Type": mimeSet[extension] || "text/html" });
            fs.createReadStream(fileToGet).pipe(res);
        } break;
    }

    // If an API endpoint was handled, send the JSON response
    if (ok) {
        res.writeHead(200);
        res.end(readString);
    }
});

// Loads a game server
function loadGameServer(loadViaMain = false, host, port, gamemode, region, webProperties, properties) {
    // Determine the new server index and initialize an empty object in the global servers array
    if (!loadViaMain) {
        let index = global.servers.length;
        global.servers.push({});

        // Create a new worker thread to load the game server asynchronously
        let worker = new Worker("./server/serverLoader.js", {
            workerData: {
                host,
                port: port, // Increment port for each server
                gamemode,
                region,
                webProperties,
                properties
            }
        });

        // Listen for messages from the worker to update the server's status
        worker.on("message", message => {
            const flag = message.shift();
            switch (flag) {
                case false:
                    // Initial load: store server details
                    global.servers[index] = message.shift();
                    break;
                case true:
                    // Update: change the server's player count
                    global.servers[index].players = message.shift();
                    break;
                case "doneLoading":
                    // Once loading is complete, trigger the server loaded callback
                    onServerLoaded();
                    break;
            }
        });
    } else {
        global.servers.push({ loadedViaMainServer: true });
        setTimeout(() => { // Space it a little out.
            if (global.launchedOnMainServer) {
                console.warn("Only one server can be loaded via through the main server!\nProcess terminated.");
                process.exit(1);
            }
            global.launchedOnMainServer = true;
            new (require("./game.js").gameServer)(Config.host, Config.port, gamemode, region, webProperties, properties, false);
        }, 10)
    }
}

// Server Loaded Callback
let loadedServers = 0;
global.onServerLoaded = () => {
    loadedServers++;
    // Once all servers are loaded, log the status and routing table
    if (loadedServers >= global.servers.length) {
        util.saveToLog("Servers up", "All servers booted up.", 0x37F554);
        if (Config.LOGS) {
            util.log("Dumping endpoint -> gamemode routing table");
            for (const game of global.servers) {
                console.log("> " + `${Config.host}/#${game.id}`.padEnd(40, " ") + " -> " + game.gameMode);
            }
            console.log("\n");
        }
        let serverStartEndTime = performance.now();
        console.log("Server loaded in " + util.rounder(serverStartEndTime, 4) + " milliseconds.");
        console.log("[WEB SERVER] Server listening on port", Config.port);
    }
};

// Start the HTTP Server & Load Game Servers
server.listen(Config.port, () => {
    Config.SERVERS.forEach(server => {
        // Load all the servers.
        loadGameServer(
            server.LOAD_ON_MAINSERVER, 
            server.HOST,
            server.PORT,
            server.GAMEMODE, 
            server.REGION, 
            { id: server.SERVER_ID, maxPlayers: server.MAX_PLAYERS }, 
            server.PROPERTIES
        );
    })
});

// Upgrade HTTP connections to WebSocket connections if applicable
server.on("upgrade", (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
        if (global.launchedOnMainServer) {
            for (let i = 0; i < global.servers.length; i++) {
                let server = global.servers[i];
                if (server.gameManager) server.gameManager.socketManager.connect(ws, req);
            }
        } else {
            ws.close();
        }
    });
});

// Set up a loop to periodically call Bun's garbage collector if available
let bunLoop = setInterval(() => {
    try {
        Bun.gc(true);
    } catch (e) {
        // If Bun.gc fails, clear the interval
        clearInterval(bunLoop);
    }
}, 1000);

// Log that the web server has been initialized if logging is enabled
if (Config.LOGS) console.log("Web Server initialized.");

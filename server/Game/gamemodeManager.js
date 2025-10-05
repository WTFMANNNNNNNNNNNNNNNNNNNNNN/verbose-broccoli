let { bossRush } = require("./gamemodes/bossRush.js");
let { Assault } = require("./gamemodes/assault.js");
let { Tag } = require("./gamemodes/tag.js");
let { Domination } = require("./gamemodes/dominator.js");
let { Mothership } = require("./gamemodes/mothership.js");
let { Sandbox } = require("./gamemodes/sandbox.js");
let { Train } = require("./gamemodes/trainwars.js");
let { Maze } = require("./gamemodes/maze.js");
let { Outbreak } = require("./gamemodes/outbreak.js");

class gamemodeManager {
    constructor() {
        this.gameSiege = new bossRush(global.gameManager);
        this.gameAssault = new Assault(global.gameManager);
        this.gameTag = new Tag(global.gameManager);
        this.gameDomination = new Domination(global.gameManager);
        this.gameMothership = new Mothership(global.gameManager);
        this.gameSandbox = new Sandbox(global.gameManager);
        this.gameMaze = new Maze(global.gameManager, null);
        this.gameTrain = new Train();
        this.gameOutreak = new Outbreak(global.gameManager);
    }

    request(type) {
        if (type == "start") {
            if (Config.SPECIAL_BOSS_SPAWNS) this.gameSiege.start(Config.MAZE_TYPE ?? false);
            if (Config.ASSAULT) this.gameAssault.start();
            if (Config.TAG) Config.TAG_DATA.initAndStart();
            if (Config.DOMINATION) this.gameDomination.start();
            if (Config.MOTHERSHIP) this.gameMothership.start();
            if (Config.MAZE_TYPE !== undefined && !Config.SPECIAL_BOSS_SPAWNS) this.gameMaze.generate();
            if (Config.OUTBREAK) this.gameOutreak.start();
        }
        if (type == "loop") {
            global.gameManager.lagLogger.set();
            if (Config.SPECIAL_BOSS_SPAWNS) this.gameSiege.loop();
            if (Config.MOTHERSHIP) this.gameMothership.loop();
            global.gameManager.lagLogger.mark();
            if (global.gameManager.lagLogger.totalTime > 100) {
                console.log("Gamemode loop is taking a long time!");
                console.log(`Gamemode loop took ${global.gameManager.lagLogger.totalTime}ms to complete!`);
                console.log(`Gamemode loop log history: (Last ${global.gameManager.lagLogger.sum.length} entries)`);
                console.log(global.gameManager.lagLogger.sum.map(entry => `Run at: ${entry.at}. Time: ${entry.time}.`).join("\n"));
            }
        }
        if (type == "quickloop") { // Mainly for sandbox and trainwars only, but you can also put your own gamemode loop here incase the regular loop doesn't fit.
            if (Config.SANDBOX) this.gameSandbox.update();
            if (Config.TRAIN) this.gameTrain.loop();
        }
    }

    terminate() {
        if (Config.SPECIAL_BOSS_SPAWNS) this.gameSiege.reset();
        if (Config.ASSAULT) this.gameAssault.reset();
        if (Config.TAG) Config.TAG_DATA.resetAndStop();
        if (Config.DOMINATION) this.gameDomination.reset();
        if (Config.MOTHERSHIP) this.gameMothership.reset();
    }

    redefine(theshit) {
        this.gameSiege.redefine(theshit);
        this.gameAssault.redefine(theshit);
        this.gameTag.redefine(theshit);
        this.gameSandbox.redefine(theshit);
        this.gameMaze.redefine(Config.MAZE_TYPE);
        this.gameOutreak.redefine(theshit);
    }
}

module.exports = { gamemodeManager };
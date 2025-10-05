// Global Variables (These must come before we import from the modules folder.)
let EventEmitter = require('events');
const HashGrid = require('../lib/hashgrid.js');
global.Events = new EventEmitter();
global.Config = require("../config.js");

global.ran = require("../lib/random.js");
global.util = require("../lib/util.js");
global.mazeGenerator = require("../miscFiles/mazeGenerator.js");
global.grid = new HashGrid(7);
global.protocol = require("../lib/fasttalk.js");
global.cannotRespawn = false;
global.mockupData = [];
global.entities = new Map();
global.targetableEntities = new Map();
global.unspawnableTeam = [];
global.walls = [];
global.entitiesToAvoid = [];
global.servers = [];
global.chats = {};
global.travellingPlayers = [];
global.fps = "Unknown";

global.loadedAddons = [];
global.TEAM_BLUE = -1;
global.TEAM_GREEN = -2;
global.TEAM_RED = -3;
global.TEAM_PURPLE = -4;
global.TEAM_YELLOW = -5;
global.TEAM_ORANGE = -6;
global.TEAM_BROWN = -7;
global.TEAM_CYAN = -8;
global.TEAM_DREADNOUGHTS = -10;
global.TEAM_ROOM = -100;
global.TEAM_ENEMIES = -101;
global.getSpawnableArea = (team, gameManager) => {
    gameManager = ensureIsManager(gameManager);
    let room = gameManager.room;
    return ran.choose((team in room.spawnable && room.spawnable[team].length) ? room.spawnable[team] : room.spawnableDefault).randomInside();

}
global.teamNames = ["BLUE", "GREEN", "RED", "PURPLE", "YELLOW", "ORANGE", "BROWN", "CYAN"],
global.teamColors = [10, 11, 12, 15, 25, 26, 27, 28];
global.getTeamName = team => ["BLUE", "GREEN", "RED", "PURPLE", "YELLOW", "ORANGE", "BROWN", "CYAN", , "DREADNOUGHTS"][-team - 1] ?? "An unknown team";
global.getTeamColor = (team, fixMode = false) => {
    let color = ([10, 11, 12, 15, 25, 26, 27, 28, , 4][-team - 1] ?? 3);
    if (fixMode) color = color + " 0 1 0 false";
    return color;
}
global.isPlayerTeam = team => /*team < 0 && */team > -11;
global.getWeakestTeam = () => {
    let teamcounts = {};
    for (let i = -Config.TEAMS; i < 0; i++) {
        if (global.defeatedTeams.includes(i)) continue;
        teamcounts[i] = 0;
    }
    for (let o of global.entities) {
        if ((o.isBot || o.isPlayer) && o.team in teamcounts && o.team < 0 && isPlayerTeam(o.team)) {
            if (!(o.team in teamcounts)) {
                teamcounts[o.team] = 0;
            }
            teamcounts[o.team]++;
        }
    }
    teamcounts = Object.entries(teamcounts).map(([teamId, amount]) => {
        let weight = teamId in Config.TEAM_WEIGHTS ? Config.TEAM_WEIGHTS[teamId] : 1;
        return [teamId, amount / weight];
    });
    let lowestTeamCount = Math.min(...teamcounts.map(x => x[1])),
        entries = teamcounts.filter(a => a[1] == lowestTeamCount);
    return parseInt(!entries.length ? -Math.ceil(Math.random() * Config.TEAMS) : ran.choose(entries)[0]);
};

global.loopThrough = function(array, callback = () => {}) {
    for (let index = 0, length = array.length; index < length; index++) callback(array[index], index);
};

global.Class = {};
global.tileClass = {};
global.definitionsWaiter = false;

global.ensureIsClass = str => {
    if ("object" == typeof str) {
        return str;
    }
    if (str in Class) {
        return Class[str];
    };

    throw Error(`Definition ${str} is attempted to be gotten but does not exist!`);
}

global.ensureIsManager = str => {
    if ("undefined" == typeof str) {
        console.error(`No game manager detected! Please check your code.`);
        throw new Error("No game manager detected!");
    }
    return str;
}

global.tickIndex = 0;
global.tickEvents = new EventEmitter();
global.syncedDelaysLoop = () => tickEvents.emit(tickIndex++);
global.setSyncedTimeout = (callback, ticks = 0, ...args) => tickEvents.once(tickIndex + Math.round(ticks), () => callback(...args));

global.bringToLife = (() => {
    return my => {
        // Size animation
        if (my.permanentSize) {
            my.coreSize = my.permanentSize;
        } else if (my.isPlayer && !my.settings.noSizeAnimation) {
            const diff = my.SIZE - my.coreSize;
            if (diff) my.coreSize += diff / 11;
        } else if (my.SIZE !== my.coreSize) {
            my.coreSize = my.SIZE;
        }

        // Invisibility/Alpha
        const velSq = my.velocity.x * my.velocity.x + my.velocity.y * my.velocity.y;
        if (!my.damageReceived && velSq <= 0.1) {
            my.alpha = Math.max(my.alphaRange[0], my.alpha - my.invisible[1]);
        } else {
            my.alpha = Math.min(my.alphaRange[1], my.alpha + my.invisible[0]);
        }

        // Control logic
        const faucet = (my.settings.independent || my.source == null || my.source === my) ? {} : my.source.control;
        let b = {
            target: remapTarget(faucet, my.source, my),
            goal: undefined,
            fire: faucet.fire,
            main: faucet.main,
            alt: faucet.alt,
            power: undefined,
        };

        // Attention craver
        if (my.settings.attentionCraver && !faucet.main && my.range) {
            my.range--;
        }

        // Controllers
        logs.though.set();
        for (let i = 0, len = my.controllers.length; i < len; i++) {
            const AI = my.controllers[i];
            const a = AI.think(b);
            if (a) {
                if (a.target != null && (b.target == null || AI.acceptsFromTop)) b.target = a.target;
                if (a.goal != null && (b.goal == null || AI.acceptsFromTop)) b.goal = a.goal;
                if (a.fire != null && (b.fire == null || AI.acceptsFromTop)) b.fire = a.fire;
                if (a.main != null && (b.main == null || AI.acceptsFromTop)) b.main = a.main;
                if (a.alt != null && (b.alt == null || AI.acceptsFromTop)) b.alt = a.alt;
                if (a.power != null && (b.power == null || AI.acceptsFromTop)) b.power = a.power;
            }
        }
        logs.though.mark();

        my.control.target = b.target == null ? my.control.target : b.target;
        my.control.goal = b.goal || { x: my.x, y: my.y };
        my.control.fire = b.fire;
        my.control.main = b.main;
        my.control.alt = b.alt;
        my.control.power = b.power == null ? 1 : b.power;

        // React
        my.move();
        my.face();
        my.updateBodyInfo();

        // Guns and turrets
        if (my.guns) {
            for (let gun of my.guns.values()) gun.live();
        }
        if (my.turrets) {
            for (let turret of my.turrets.values()) turret.life();
        }

        // Refresh body attributes if needed
        if (my.skill.maintain()) my.refreshBodyAttributes();
    }
})();

global.defineSplit = (() => {
    return (defs, branch, set, my, emitEvent) => {
        set = ensureIsClass(defs[branch]);

        if (set.index != null) my.index += "-" + set.index;
        if (set.PARENT != null) {
            if (Array.isArray(set.PARENT)) {
                for (let i = 0; i < set.PARENT.length; i++) {
                    my.branchLabel = ensureIsClass(set.PARENT[i]).BRANCH_LABEL;
                }
            } else {
                my.branchLabel = ensureIsClass(set.PARENT).BRANCH_LABEL;
            }
        }
        if (set.LABEL != null && set.LABEL.length > 0) my.label = my.label + "-" + set.LABEL;
        if (set.MAX_CHILDREN != null) my.maxChildren += set.MAX_CHILDREN;
        else my.maxChildren = null; // For bullet and drone combos so all parts remain functional
        if (set.BODY != null) {
            if (set.BODY.ACCELERATION != null) my.ACCELERATION *= set.BODY.ACCELERATION;
            if (set.BODY.SPEED != null) my.SPEED *= set.BODY.SPEED;
            if (set.BODY.HEALTH != null) my.HEALTH *= set.BODY.HEALTH;
            if (set.BODY.RESIST != null) my.RESIST *= set.BODY.RESIST;
            if (set.BODY.SHIELD != null) my.SHIELD *= set.BODY.SHIELD;
            if (set.BODY.REGEN != null) my.REGEN *= set.BODY.REGEN;
            if (set.BODY.DAMAGE != null) my.DAMAGE *= set.BODY.DAMAGE;
            if (set.BODY.PENETRATION != null) my.PENETRATION *= set.BODY.PENETRATION;
            if (set.BODY.RANGE != null) my.RANGE *= set.BODY.RANGE;
            if (set.BODY.FOV != null) my.FOV *= set.BODY.FOV;
            if (set.BODY.SHOCK_ABSORB != null) my.SHOCK_ABSORB *= set.BODY.SHOCK_ABSORB;
            if (set.BODY.RECOIL_MULTIPLIER != null) my.RECOIL_MULTIPLIER *= set.BODY.RECOIL_MULTIPLIER;
            if (set.BODY.DENSITY != null) my.DENSITY *= set.BODY.DENSITY;
            if (set.BODY.STEALTH != null) my.STEALTH *= set.BODY.STEALTH;
            if (set.BODY.PUSHABILITY != null) my.PUSHABILITY *= set.BODY.PUSHABILITY;
            if (set.BODY.HETERO != null) my.heteroMultiplier *= set.BODY.HETERO;
            my.refreshBodyAttributes();
        }
        if (set.GUNS != null) {
            let newGuns = [];
            for (let i = 0; i < set.GUNS.length; i++) {
                newGuns.push(new Gun(my, set.GUNS[i]));
            }
            for (let guns of newGuns) {
                my.guns.set(guns.id, guns);
            }
        }
        if (set.TURRETS != null) {
            for (let i = 0; i < set.TURRETS.length; i++) {
                let def = set.TURRETS[i],
                    o = new Entity(my, my.master),
                    turretDanger = false,
                    type = Array.isArray(def.TYPE) ? def.TYPE : [def.TYPE];
                for (let j = 0; j < type.length; j++) {
                    o.define(type[j]);
                    if (type.TURRET_DANGER) turretDanger = true;
                }
                if (!turretDanger) o.define({ DANGER: 0 });
                o.bindToMaster(def.POSITION, my);
            }
        }
        if (set.PROPS != null) {
            for (let i = 0; i < set.PROPS.length; i++) {
                let def = set.PROPS[i],
                    o = new Prop(def.POSITION, my.master, true),
                    type = Array.isArray(def.TYPE) ? def.TYPE : [def.TYPE];
                for (let j = 0; j < type.length; j++) {
                    o.define(type[j]);
                }
            }
        }
        if (set.SIZE != null) {
            my.SIZE *= set.SIZE * my.squiggle;
            if (my.coreSize == null) my.coreSize = my.SIZE;
        }
        if (set.CONTROLLERS != null) {
            let toAdd = [];
            for (let i = 0; i < set.CONTROLLERS.length; i++) {
                let io = set.CONTROLLERS[i];
                if ("string" == typeof io) io = [io];
                toAdd.push(new ioTypes[io[0]](my, io[1]));
            }
            my.addController(toAdd);
        }
        if (set.BATCH_UPGRADES != null) my.batchUpgrades = set.BATCH_UPGRADES;
        for (let i = 0; i < Config.MAX_UPGRADE_TIER; i++) {
            let tierProp = 'UPGRADES_TIER_' + i;
            if (set[tierProp] != null && emitEvent) {
                for (let j = 0; j < set[tierProp].length; j++) {
                    let upgrades = set[tierProp][j];
                    let index = "";
                    if (!Array.isArray(upgrades)) upgrades = [upgrades];
                    let redefineAll = upgrades.includes(true);
                    let trueUpgrades = upgrades.slice(0, upgrades.length - redefineAll); // Ignore last element if it's true
                    for (let k of trueUpgrades) {
                        let e = ensureIsClass(k);
                        index += e.index + "-";
                    }
                    my.upgrades.push({
                        class: trueUpgrades,
                        level: Config.TIER_MULTIPLIER * i,
                        index: index.substring(0, index.length - 1),
                        tier: i,
                        branch,
                        branchLabel: my.branchLabel,
                        redefineAll,
                    });
                }
            }
        }
        if (set.REROOT_UPGRADE_TREE) my.rerootUpgradeTree = set.REROOT_UPGRADE_TREE;
        if (Array.isArray(my.rerootUpgradeTree)) {
            let finalRoot = "";
            for (let root of my.rerootUpgradeTree) finalRoot += root + "_";
            my.rerootUpgradeTree += finalRoot.substring(0, finalRoot.length - 2);
        }
    }
})();

global.handleBatchUpgradeSplit = (() => {
    function chooseUpgradeFromBranch(remaining, my) {
        if (remaining > 0) { // If there's more to select
            let branchUgrades = my.tempUpgrades[my.defs.length - remaining];
            for (let i = 0; i < branchUgrades.length; i++) { // Pick all possible options and continue selecting
                my.selection[my.defs.length - remaining] = branchUgrades[i];
                chooseUpgradeFromBranch(remaining - 1, my);
            }
            if (branchUgrades.length == 0) // For when the branch has no upgrades
                chooseUpgradeFromBranch(remaining - 1, my);
        } else { // If there's nothing more to select
            let upgradeClass = [],
                upgradeTier = 0,
                upgradeIndex = "";
            for (let u of my.selection) {
                upgradeClass.push(u.class);
                upgradeIndex += u.index + '-';
                upgradeTier = Math.max(upgradeTier, u.tier);
            }
            my.upgrades.push({
                class: upgradeClass,
                level: Config.TIER_MULTIPLIER * upgradeTier,
                index: upgradeIndex.substring(0, upgradeIndex.length - 1),
                tier: upgradeTier,
                branch: 0,
                branchLabel: "",
                redefineAll: true,
            });
        }
    }
    return (my) => {
        my.tempUpgrades = [];
        let numBranches = my.defs.length;
        for (let i = 0; i < numBranches; i++) { // Create a 2d array for the upgrades (1st index is branch index)
            my.tempUpgrades.push([]);
        }
        for (let upgrade of my.upgrades) {
            let upgradeBranch = upgrade.branch;
            my.tempUpgrades[upgradeBranch].push(upgrade);
        }

        my.upgrades = [];
        my.selection = JSON.parse(JSON.stringify(my.defs));
        chooseUpgradeFromBranch(numBranches, my); // Recursively build upgrade options
    }
})();

global.checkIfInView = (() => {
    return (boolean, addToNearby, clients, my) => {
        for (let socket of clients) {
            boolean = my.gameManager.views.some(v => v.check(my));
        
            if (boolean) {
                if (!socket.nearby.includes(my) && addToNearby) my.onRender = true, socket.nearby.push(my);
            } else my.onRender = false;
        }
        return boolean;
    }
})();

global.Tile = class Tile {
    constructor(args) {
        this.args = args;
        this.name = args.NAME;
        this.image = args.IMAGE;
        if ("object" !== typeof this.args) {
            throw new Error("First argument has to be an object!");
        }
        this.visibleOnBlackout = args.VISIBLE_FROM_BLACKOUT ?? false;
        this.color = args.COLOR;
        this.data = args.DATA || {};
        if ("object" !== typeof this.data) {
            throw new Error("'data' property must be an object!");
        }
        this.init = args.INIT || (() => { });
        if ("function" !== typeof this.init) {
            throw new Error("'init' property must be a function!");
        }
        this.tick = args.TICK || (() => { });
        if ("function" !== typeof this.tick) {
            throw new Error("'tick' property must be a function!");
        }
    }
}

global.flatten = (output, definition) => {
    definition = ensureIsClass(definition);

    if (definition.PARENT) {
        if (!Array.isArray(definition.PARENT)) {
            flatten(output, definition.PARENT);
        } else for (let parent of definition.PARENT) {
            flatten(output, parent);
        }
    }

    for (let key in definition) {
        if (key !== "PARENT") {
            output[key] = definition[key];
        }
    }

    return output;
};

global.makeHitbox = wall => {
    const _size = wall.size + 4;
    //calculate the relative corners
    let relativeCorners = [
            Math.atan2(    _size,     _size) + wall.angle,
            Math.atan2(0 - _size,     _size) + wall.angle,
            Math.atan2(0 - _size, 0 - _size) + wall.angle,
            Math.atan2(    _size, 0 - _size) + wall.angle
        ],
        distance = Math.sqrt(_size ** 2 + _size ** 2);

    //convert 4 corners into 4 lines
    for (let i = 0; i < 4; i++) {
        relativeCorners[i] = {
            x: distance * Math.sin(relativeCorners[i]),
            y: distance * Math.cos(relativeCorners[i])
        };
    }

    wall.hitbox = [
        [relativeCorners[0], relativeCorners[1]],
        [relativeCorners[1], relativeCorners[2]],
        [relativeCorners[2], relativeCorners[3]],
        [relativeCorners[3], relativeCorners[0]]
    ];
    wall.hitboxRadius = distance;
}

global.wallTypes = [
    { color: 16, label: 'Wall',    alpha: 1, class: 'wall' },
    { color: 12, label: 'deadly',  alpha: 1, class: 'wall' },
    { color: 11, label: 'heal',    alpha: 1, class: 'wall' },
    { color: 19, label: 'bouncy',  alpha: 1, class: 'wall' },
    { color: 5,  label: 'breaker', alpha: 1, class: 'wall' },
    { color: 0,  label: 'chunks',  alpha: 1, class: 'wall' },
    { color: 13, label: 'optical', alpha: 1, class: 'eyewall' },
    { color: 17, label: '!up',     alpha: 1, class: 'uparrow' },
    { color: 17, label: '!down',   alpha: 1, class: 'downarrow' },
    { color: 17, label: '!left',   alpha: 1, class: 'leftarrow' },
    { color: 17, label: '!right',  alpha: 1, class: 'rightarrow' },
];

global.becomeBulletChildren = (socket, player, exit, newgui) => {
    let a = player.body.bulletchildren[player.body.bulletchildren.length - 1]
    if (a !== undefined && a !== null) {
        a.parent = a;
        a.source = a;
        a.bulletparent = a;
        a.settings.connectChildrenOnCamera = true;
        a.settings.persistsAfterDeath = true;

        let newchildren = player.body.bulletchildren,
            removedchildren = player.body.bulletchildren;

        newchildren = newchildren.filter((e) => e.id !== a.id && e !== null && e.master === a.master);
        removedchildren = newchildren.filter((e) => e.master !== a.master);
        a.bulletchildren = newchildren;
        removedchildren.forEach((e) => {
            e.master = e;
            e.destroy();
        })
        a.bulletchildren.forEach((e) => {
            e.source = a;
            e.bulletparent = a;
            e.parent = a;
        })

        let become = a;
        become.controllers = [];
        player.body = become;
        player.body.become(socket.player);
        player.body.isPlayer = true;
        player.body.socket = socket;
        player.gui = newgui(player);
        player.body.refreshBodyAttributes();
    } else exit();
}

global.loadAllMockups = (logText = true) => {
    let mockupsLoadStartTime = performance.now();
    if (logText) console.log("Started Loading All Mockups...");
    for (let k in Class) buildMockup(k, false);
    let mockupsLoadEndTime = performance.now();
    if (logText) console.log("Finished created " + mockupData.length + " MockupEntities.");
    if (logText) console.log("Mockups generated in " + util.rounder(mockupsLoadEndTime - mockupsLoadStartTime, 3) + " milliseconds.\n");
}
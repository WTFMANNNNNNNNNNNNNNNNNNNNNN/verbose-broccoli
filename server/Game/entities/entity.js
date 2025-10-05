let EventEmitter = require('events');
global.entitiesIdLog = 0;
const forceTwiggle = ["autospin", "turnWithSpeed", "spin", "fastspin", "veryfastspin", "withMotion", "smoothWithMotion", "looseWithMotion"];
const { combineStats } = require('../../lib/definitions/facilitators.js');
class Prop { // Used for split upgrades only
    constructor(position, bond) {
        this.guns = [];
        this.id = entitiesIdLog++;
        this.color = new Color(16);
        this.borderless = false;
        this.drawFill = true;
        this.strokeWidth = 1;

        // Bind prop
        this.bond = bond;
        this.bond.props.set(this.id, this);
        // Get my position.
        if (Array.isArray(position)) {
            position = {
                SIZE: position[0],
                X: position[1],
                Y: position[2],
                ANGLE: position[3],
                LAYER: position[4]
            };
        }
        position.SIZE ??= 10;
        position.X ??= 0;
        position.Y ??= 0;
        position.ANGLE ??= 0;
        position.LAYER ??= 0;
        let _off = new Vector(position.X, position.Y);
        this.bound = {
            size: position.SIZE / 20,
            angle: position.ANGLE * Math.PI / 180,
            direction: _off.direction,
            offset: _off.length / 10,
            layer: position.LAYER
        };
        // Initalize.
        this.facing = 0;
        this.x = 0;
        this.y = 0;
        this.size = 1;
        this.realSize = 1;
        this.settings = {};
        this.settings.mirrorMasterAngle = true;
        this.upgrades = [];
        this.turrets = [];
        this.props = [];
    }
    define(def) {
        let set = ensureIsClass(def);

        if (set.PARENT != null) {
            if (Array.isArray(set.PARENT)) {
                for (let i = 0; i < set.PARENT.length; i++) {
                    this.define(set.PARENT[i], false);
                }
            } else {
                this.define(set.PARENT, false);
            }
        }
        if (set.index != null) this.index = set.index.toString();
        if (set.SHAPE != null) {
            this.shape = typeof set.SHAPE === "number" ? set.SHAPE : 0;
            this.shapeData = set.SHAPE;
        }
        this.imageInterpolation = set.IMAGE_INTERPOLATION != null ? set.IMAGE_INTERPOLATION : 'bilinear'
        if (set.COLOR != null) {
            this.color.interpret(set.COLOR);
        }
        if (set.STROKE_WIDTH != null) this.strokeWidth = set.STROKE_WIDTH
        if (set.BORDERLESS != null) this.borderless = set.BORDERLESS;
        if (set.DRAW_FILL != null) this.drawFill = set.DRAW_FILL;
        if (set.GUNS != null) {
            let newGuns = [];
            for (let i = 0; i < set.GUNS.length; i++) {
                newGuns.push(new Gun(this, set.GUNS[i]));
            }
            this.guns = newGuns;
        }
    }
    camera() {
        return {
            type: 0x01,
            id: this.id,
            index: this.index,
            size: this.size,
            realSize: this.realSize,
            facing: this.facing,
            angle: this.bound.angle,
            direction: this.bound.direction,
            offset: this.bound.offset,
            sizeFactor: this.bound.size,
            mirrorMasterAngle: this.settings.mirrorMasterAngle,
            layer: this.bound.layer,
            color: this.color.compiled,
            strokeWidth: this.strokeWidth,
            borderless: this.borderless,
            drawFill: this.drawFill,
            guns: this.guns.map((gun) => gun.getPhotoInfo()),
            turrets: this.turrets,
        };
    }
}
class Entity extends EventEmitter {
    constructor(position, master) {
        super();
        if (!master) master = this;
        this.isGhost = false;
        this.killCount = { solo: 0, assists: 0, bosses: 0, polygons: 0, killers: [] };
        this.creationTime = new Date().getTime();
        // Inheritance
        this.master = master;
        this.source = this;
        this.parent = this;
        this.bulletparent = this;
        this.onRender = false;
        this.control = {
            target: new Vector(0, 0),
            goal: new Vector(0, 0),
            main: false,
            alt: false,
            fire: false,
            power: 0,
        };
        this.isInGrid = false;
        this.removeFromGrid = () => {
            if (this.isInGrid) {
                this.isInGrid = false;
            }
        };
        this.addToGrid = () => {
            if (!this.collidingBond && this.bond != null) return;
            if (!this.isInGrid) {
                this.isInGrid = true;
            }
        };
        this.activation = new Activation(this);
        this.autoOverride = false;
        this.controllers = [];
        this.definitionEvents = [];
        this.blend = {
            color: '#FFFFFF',
            amount: 0,
        };
        // Objects
        this.skill = new Skill();
        this.health = new HealthType(1, 'static', 0);
        this.shield = new HealthType(0, 'dynamic');
        this.guns = new Map();
        this.turrets = new Map();
        this.props = new Map();
        this.upgrades = [];
        this.skippedUpgrades = [];
        this.settings = {};
        this.eastereggs = { braindamage: false };
        this.aiSettings = {};
        this.children = [];
        this.bulletchildren = [];
        this.color = new Color(16);
        this.glow = { radius: null, color: new Color(-1).compiled, alpha: 1, recursion: 1 }
        this.confinement = { xMin: 0, xMax: global.gameManager.room.width, yMin: 0, yMax: global.gameManager.room.height };
        this.firingArc = [0, 360];
        this.necro = () => {};
        // Define it
        this.SIZE = 1;
        this.sizeMultiplier = 1;
        this.define("genericEntity");
        this.nameColor = "#ffffff";
        // Initalize physics and collision
        this.alwaysShowOnMinimap = false;
        this.allowedOnMinimap = true;
        this.maxSpeed = 0;
        this.facing = 0;
        this.vfacing = 0;
        this.range = 0;
        this.damageReceived = 0;
        this.stepRemaining = 1;
        this.x = position.x;
        this.y = position.y;
        this.cameraOverrideX = null;
        this.cameraOverrideY = null;
        this.velocity = new Vector(0, 0);
        this.accel = new Vector(0, 0);
        this.damp = 0.05;
        this.collisionArray = [];
        this.invuln = false;
        this.alpha = 1;
        this.invisible = [0, 0];
        this.alphaRange = [0, 1];
        this.antiNaN = new antiNaN(this);
        // Get a new unique id
        this.id = entitiesIdLog++;
        this.team = this.id;
        this.team = master.team;
        // This is for collisions
        this.minX = 0;
        this.minY = 0;
        this.maxX = 0;
        this.maxY = 0;
        this.collidingBond = false;
        // Optimized AABB calculation and update
        this.updateAABB = (active) => {
            if (!active || (!this.collidingBond && this.bond != null)) {
                this.isInGrid = false;
            } else {
                this.isInGrid = true;
                this.minX = this.x - this.size;
                this.minY = this.y - this.size;
                this.maxX = this.x + this.size;
                this.maxY = this.y + this.size;
            }
        };
        entities.set(this.id, this);
        for (let v of global.gameManager.views) v.add(this);
    }

    life() { bringToLife(this); }

    reset(keepPlayerController = true) {
        this.controllers = keepPlayerController
            ? [this.controllers.filter(con => con instanceof ioTypes.listenToPlayer)[0]]
            : [];
    }

    addController(newIO) {
        if (!Array.isArray(newIO)) newIO = [newIO];
        for (let oldId = 0; oldId < this.controllers.length; oldId++) {
            for (let newId = 0; newId < newIO.length; newId++) {
                let oldIO = this.controllers[oldId];
                let io = newIO[newId];
                if (io.constructor === oldIO.constructor) {
                    this.controllers[oldId] = io;
                    newIO.splice(newId, 1);
                }
            }
        }
        this.controllers = this.controllers.concat(newIO);
    }

    become(player, dom = false) {
        this.addController(new ioTypes.listenToPlayer(this, { player, static: dom })); // Make it listen.
        this.sendMessage = (content, displayTime = Config.MESSAGE_DISPLAY_TIME) =>
            player.socket.talk("m", displayTime, content);  // make sure that it sends messages.
        this.kick = (reason) => player.socket.kick(reason);
    }

    giveUp(player, name = "Mothership") {
        if (!player.body.isMothership) {
            player.body.controllers = [
                new ioTypes.nearestDifferentMaster(player.body),
                new ioTypes.spin(player.body, { onlyWhenIdle: true }),
            ];
        } else {
            player.body.controllers = [
                new ioTypes.nearestDifferentMaster(player.body, {}, global.gameManager),
                new ioTypes.mapTargetToGoal(player.body),
            ];
        }
        player.body.name = player.body.label;
        player.body.underControl = false;
        let fakeBody = new Entity({ x: player.body.x, y: player.body.y });
        fakeBody.passive = true;
        fakeBody.underControl = true;
        player.body = fakeBody;
        player.body.kill();
    }

    define(defs, emitEvent = true, overwriteindex = true, overrideDefs = true) {
        if (!Array.isArray(defs)) defs = [defs];

        // Define all primary stats
        let set = ensureIsClass(defs[0]);
        this.props.clear();
        this.store = {};
        for (let gun of this.guns.values()) gun.store = {};
        if (set.PARENT != null) {
            if (Array.isArray(set.PARENT)) {
                for (let i = 0; i < set.PARENT.length; i++) {
                    this.define(set.PARENT[i], false);
                }
            } else {
                this.define(set.PARENT, false);
            }
        }
        if (set.LAYER != null) this.layerID = set.LAYER;
        if (set.index != null && overwriteindex) this.index = set.index.toString();
        if (set.NAME != null) this.name = set.NAME;
        if (set.LABEL != null) this.label = set.LABEL;
        if (set.ANGLE != null) this.angle = set.ANGLE;
        if (set.DISPLAY_NAME != null) this.displayName = set.DISPLAY_NAME;
        if (set.TYPE != null) this.type = set.TYPE;
        if (set.WALL_TYPE != null) this.walltype = set.WALL_TYPE;
        if (set.SHAPE != null) {
            this.shape = typeof set.SHAPE === "number" ? set.SHAPE : (set.SHAPE_NUM ?? 0);
            this.shapeData = set.SHAPE;
        }
        if (set.COLOR != null) {
            this.color.interpret(set.COLOR);
        }
        if (set.UPGRADE_COLOR) this.upgradeColor = new Color(set.UPGRADE_COLOR).compiled;
        if (set.GLOW != null) {
            this.glow = {
                radius: set.GLOW.RADIUS ?? 0,
                color: new Color(set.GLOW.COLOR).compiled,
                alpha: set.GLOW.ALPHA ?? 1,
                recursion: set.GLOW.RECURSION ?? 1
            };
        }
        if (set.CONTROLLERS != null) {
            let addedSuccess = false;
            try {
                let toAdd = [];
                for (let i = 0; i < set.CONTROLLERS.length; i++) {
                    let io = set.CONTROLLERS[i];
                    if ("string" == typeof io) io = [io];
                    toAdd.push(new ioTypes[io[0]](this, io[1], global.gameManager));
                    addedSuccess = true;
                }
                this.addController(toAdd);
            } catch (e) {
                console.error(addedSuccess ? `Controller ${set.CONTROLLERS} ran into an error!` : `Controller ${set.CONTROLLERS} is attempted to be gotten but does not exist!`);
                throw new Error(e);
            }
        }
        if (set.IGNORED_BY_AI != null) this.ignoredByAi = set.IGNORED_BY_AI;
        if (set.MOTION_TYPE != null) {
            this.motionType = set.MOTION_TYPE;
            if (Array.isArray(this.motionType)) {
                this.motionTypeArgs = this.motionType[1];
                this.motionType = this.motionType[0];
            } else {
                this.motionTypeArgs = {};
            }
        }
        if (set.FACING_TYPE != null) {
            this.facingType = set.FACING_TYPE;
            if (Array.isArray(this.facingType)) {
                this.facingTypeArgs = this.facingType[1];
                this.facingType = this.facingType[0];
            } else {
                this.facingTypeArgs = {};
            }
        };
        if (set.NO_COLLISIONS) this.settings.no_collisions = set.NO_COLLISIONS;
        if (set.MIRROR_MASTER_ANGLE != null) this.settings.mirrorMasterAngle = set.MIRROR_MASTER_ANGLE
        if (set.DRAW_HEALTH != null) this.settings.drawHealth = set.DRAW_HEALTH;
        if (set.DRAW_SELF != null) this.settings.drawShape = set.DRAW_SELF;
        if (set.DAMAGE_EFFECTS != null) this.settings.damageEffects = set.DAMAGE_EFFECTS;
        if (set.RATIO_EFFECTS != null) this.settings.ratioEffects = set.RATIO_EFFECTS;
        if (set.MOTION_EFFECTS != null) this.settings.motionEffects = set.MOTION_EFFECTS;
        if (set.ACCEPTS_SCORE != null) this.settings.acceptsScore = set.ACCEPTS_SCORE;
        if (set.GIVE_KILL_MESSAGE != null) this.settings.givesKillMessage = set.GIVE_KILL_MESSAGE;
        if (set.CAN_GO_OUTSIDE_ROOM != null) this.settings.canGoOutsideRoom = set.CAN_GO_OUTSIDE_ROOM;
        if (set.HITS_OWN_TYPE != null) this.settings.hitsOwnType = set.HITS_OWN_TYPE;
        if (set.DIE_AT_LOW_SPEED != null) this.settings.diesAtLowSpeed = set.DIE_AT_LOW_SPEED;
        if (set.DIE_AT_RANGE != null) this.settings.diesAtRange = set.DIE_AT_RANGE;
        if (set.INDEPENDENT != null) this.settings.independent = set.INDEPENDENT;
        if (set.PERSISTS_AFTER_DEATH != null) this.settings.persistsAfterDeath = set.PERSISTS_AFTER_DEATH;
        if (set.CLEAR_ON_MASTER_UPGRADE != null) this.settings.clearOnMasterUpgrade = set.CLEAR_ON_MASTER_UPGRADE;
        if (set.HEALTH_WITH_LEVEL != null) this.settings.healthWithLevel = set.HEALTH_WITH_LEVEL;
        if (set.OBSTACLE != null) this.settings.obstacle = set.OBSTACLE;
        if (set.NECRO != null) this.settings.necroTypes = Array.isArray(set.NECRO) ? set.NECRO : set.NECRO ? [this.shape] : [];
        if (set.HAS_NO_RECOIL != null) this.settings.hasNoRecoil = set.HAS_NO_RECOIL;
        if (set.CRAVES_ATTENTION != null) this.settings.attentionCraver = set.CRAVES_ATTENTION;
        if (set.KILL_MESSAGE != null) this.settings.killMessage = set.KILL_MESSAGE === "" ? "Killed" : set.KILL_MESSAGE;
        if (set.AUTOSPIN_MULTIPLIER != null) this.autospinBoost = set.AUTOSPIN_MULTIPLIER;
        if (set.BROADCAST_MESSAGE != null) this.settings.broadcastMessage = set.BROADCAST_MESSAGE === "" ? undefined : set.BROADCAST_MESSAGE;
        if (set.DEFEAT_MESSAGE) this.settings.defeatMessage = true;
        if (set.HEALER) this.healer = true;
        if (set.DAMAGE_CLASS != null) this.settings.damageClass = set.DAMAGE_CLASS;
        if (set.BUFF_VS_FOOD != null) this.settings.buffVsFood = set.BUFF_VS_FOOD;
        if (set.CAN_BE_ON_LEADERBOARD != null) this.settings.leaderboardable = set.CAN_BE_ON_LEADERBOARD;
        if (set.RENDER_ON_LEADERBOARD != null) this.settings.renderOnLeaderboard = set.RENDER_ON_LEADERBOARD;
        if (set.INTANGIBLE != null) this.intangibility = set.INTANGIBLE;
        if (set.IS_SMASHER != null) this.settings.reloadToAcceleration = set.IS_SMASHER;
        if (set.STAT_NAMES != null) this.settings.skillNames = {
            body_damage: set.STAT_NAMES?.BODY_DAMAGE ?? 'Body Damage',
            max_health: set.STAT_NAMES?.MAX_HEALTH ?? 'Max Health',
            bullet_speed: set.STAT_NAMES?.BULLET_SPEED ?? 'Bullet Speed',
            bullet_health: set.STAT_NAMES?.BULLET_HEALTH ?? 'Bullet Health',
            bullet_pen: set.STAT_NAMES?.BULLET_PEN ?? 'Bullet Penetration',
            bullet_damage: set.STAT_NAMES?.BULLET_DAMAGE ?? 'Bullet Damage',
            reload: set.STAT_NAMES?.RELOAD ?? 'Reload',
            move_speed: set.STAT_NAMES?.MOVE_SPEED ?? 'Movement Speed',
            shield_regen: set.STAT_NAMES?.SHIELD_REGEN ?? 'Shield Regeneration',
            shield_cap: set.STAT_NAMES?.SHIELD_CAP ?? 'Shield Capacity',
        };
        if (set.AI != null) this.aiSettings = set.AI;
        if (set.INVISIBLE != null) this.invisible = set.INVISIBLE;
        if (set.ALPHA != null) {
            this.alpha = ("number" === typeof set.ALPHA) ? set.ALPHA : set.ALPHA[1];
            this.alphaRange = [set.ALPHA[0] || 0, set.ALPHA[1] || 1];
        }
        if (set.DANGER != null) this.dangerValue = set.DANGER;
        if (set.SHOOT_ON_DEATH != null) this.shootOnDeath = set.SHOOT_ON_DEATH;
        if (set.BORDERLESS != null) this.borderless = set.BORDERLESS;
        if (set.DRAW_FILL != null) this.drawFill = set.DRAW_FILL;
        if (set.TEAM != null) {
            this.team = set.TEAM;
            if (!global.gameManager.socketManager.players.length) {
                const _entity = this;
                for (let i = 0; i < global.gameManager.socketManager.players.length; i++) {
                    if (global.gameManager.socketManager.players[i].body.id == _entity.id) {
                        global.gameManager.socketManager.players[i].team = -_entity.team;
                    }
                }
            }
        }
        if (set.VARIES_IN_SIZE != null) {
            this.settings.variesInSize = set.VARIES_IN_SIZE;
            this.squiggle = this.settings.variesInSize ? ran.randomRange(0.8, 1.2) : 1;
        }
        if (set.RESET_UPGRADES || set.RESET_STATS) {
            let caps = this.skill.caps.map(x => x);
            this.skill.setCaps(Array(10).fill(0));
            this.skill.setCaps(caps);
            this.upgrades = [];
            this.isArenaCloser = false;
            this.ac = false;
            this.alpha = 1;
            this.reset();
        }
        if (set.RESET_UPGRADE_MENU) this.upgrades = []
        if (set.ARENA_CLOSER != null) this.isArenaCloser = set.ARENA_CLOSER, this.ac = set.ARENA_CLOSER;
        if (set.BRANCH_LABEL != null) this.branchLabel = set.BRANCH_LABEL;
        if (set.BATCH_UPGRADES != null) this.batchUpgrades = set.BATCH_UPGRADES;
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
                    this.upgrades.push({
                        class: trueUpgrades,
                        level: Config.TIER_MULTIPLIER * i,
                        index: index.substring(0, index.length - 1),
                        tier: i,
                        branch: 0,
                        branchLabel: this.branchLabel,
                        redefineAll,
                    });
                }
            }
        }
        if (set.SIZE != null) {
            this.SIZE = set.SIZE * this.squiggle;
            if (this.coreSize == null) this.coreSize = this.SIZE;
        }
        if (set.NO_SIZE_ANIMATION != null) this.settings.noSizeAnimation = set.NO_SIZE_ANIMATION;
        if (set.LEVEL != null) {
            this.skill.reset();
            while (this.skill.level < set.LEVEL) {
                this.skill.score += this.skill.levelScore;
                this.skill.maintain();
            }
            this.refreshBodyAttributes();
        }
        if (set.SKILL_CAP != null && set.SKILL_CAP != []) {
            if (set.SKILL_CAP.length != 10) throw "Inappropiate skill cap amount.";
            this.skill.setCaps(set.SKILL_CAP);
        }
        if (set.SKILL != null && set.SKILL != []) {
            if (set.SKILL.length != 10) throw "Inappropiate skill raws.";
            this.skill.set(set.SKILL);
        }
        if (set.VALUE != null) this.skill.score = Math.max(this.skill.score, set.VALUE * this.squiggle);
        if (set.ALT_ABILITIES != null) this.abilities = set.ALT_ABILITIES;
        if (set.GUNS != null) {
            this.guns.clear();
            let newGuns = [];
            for (let i = 0; i < set.GUNS.length; i++) {
                newGuns.push(new Gun(this, set.GUNS[i]));
            }
            for (let guns of newGuns) {
                this.guns.set(guns.id, guns);
            }
        }
        if (set.CONNECT_CHILDREN_ON_CAMERA) this.settings.connectChildrenOnCamera = true;
        if (set.GUN_STAT_SCALE) this.gunStatScale = set.GUN_STAT_SCALE;
        if (set.MAX_CHILDREN != null) this.maxChildren = set.MAX_CHILDREN;
        if (set.MAX_BULLETS != null) this.maxBullets = set.MAX_BULLETS; 
        if ("function" === typeof set.LEVEL_SKILL_POINT_FUNCTION) this.skill.LSPF = set.LEVEL_SKILL_POINT_FUNCTION;
        if (set.RECALC_SKILL != null) {
            let score = this.skill.score;
            this.skill.reset();
            this.skill.score = score;
            while (this.skill.maintain()) { }
        }
        if (set.EXTRA_SKILL != null) this.skill.points += set.EXTRA_SKILL;
        if (set.BODY != null) {
            if (set.BODY.ACCELERATION != null) this.ACCELERATION = set.BODY.ACCELERATION;
            if (set.BODY.SPEED != null) this.SPEED = set.BODY.SPEED;
            if (set.BODY.HEALTH != null) this.HEALTH = set.BODY.HEALTH;
            if (set.BODY.RESIST != null) this.RESIST = set.BODY.RESIST;
            if (set.BODY.SHIELD != null) this.SHIELD = set.BODY.SHIELD;
            if (set.BODY.REGEN != null) this.REGEN = set.BODY.REGEN;
            if (set.BODY.DAMAGE != null) this.DAMAGE = set.BODY.DAMAGE;
            if (set.BODY.PENETRATION != null) this.PENETRATION = set.BODY.PENETRATION;
            if (set.BODY.RANGE != null) this.RANGE = set.BODY.RANGE;
            if (set.BODY.FOV != null) this.FOV = set.BODY.FOV;
            if (set.BODY.SHOCK_ABSORB != null) this.SHOCK_ABSORB = set.BODY.SHOCK_ABSORB;
            if (set.BODY.RECOIL_MULTIPLIER != null) this.RECOIL_MULTIPLIER = set.BODY.RECOIL_MULTIPLIER;
            if (set.BODY.DENSITY != null) this.DENSITY = set.BODY.DENSITY;
            if (set.BODY.STEALTH != null) this.STEALTH = set.BODY.STEALTH;
            if (set.BODY.PUSHABILITY != null) this.PUSHABILITY = set.BODY.PUSHABILITY;
            if (set.BODY.KNOCKBACK != null) this.KNOCKBACK = set.BODY.KNOCKBACK;
            if (set.BODY.HETERO != null) this.heteroMultiplier = set.BODY.HETERO;
            this.refreshBodyAttributes();
        }
        if (set.SPAWN_ON_DEATH) this.spawnOnDeath = set.SPAWN_ON_DEATH;
        if (set.RESET_EVENTS) {
            for (let { event, handler, once } of this.definitionEvents) this.removeListener(event, handler, once);
            this.definitionEvents = [];
        }
        if (set.REROOT_UPGRADE_TREE) this.rerootUpgradeTree = set.REROOT_UPGRADE_TREE;
        if (Array.isArray(this.rerootUpgradeTree)) {
            let finalRoot = "";
            for (let root of this.rerootUpgradeTree) finalRoot += root + "_";
            this.rerootUpgradeTree = finalRoot.substring(0, finalRoot.length - 1);
        }
        if (set.ON_MINIMAP != null) this.allowedOnMinimap = set.ON_MINIMAP;
        if (set.TURRETS != null) {
            for (let turret of this.turrets.values()) turret.destroy();
            this.turrets.clear();
            for (let i = 0; i < set.TURRETS.length; i++) {
                let def = set.TURRETS[i],
                    o = new Entity(this, this.master),
                    turretDanger = false,
                    type = Array.isArray(def.TYPE) ? def.TYPE : [def.TYPE];
                for (let j = 0; j < type.length; j++) {
                    o.define(type[j]);
                    if (type.TURRET_DANGER) turretDanger = true;
                }
                if (!turretDanger) o.define({ DANGER: 0 });
                o.collidingBond = def.VULNERABLE;
                o.bindToMaster(def.POSITION, this, def.VULNERABLE);
            }
        }
        if (set.ON != null) {
            for (let { event, handler, once = false } of set.ON) {
                if ("undefined" == typeof handler) return;
                this.definitionEvents.push({ event, handler, once });
                this.on(event, handler, once);
            }
        }
        if (set.SHAKE != null && this.socket) {
            let info = [];
            set.SHAKE.forEach(set => {
                if (set.CAMERA_SHAKE) {
                    info.push({
                        type: "camera",
                        duration: set.CAMERA_SHAKE.DURATION,
                        amount: set.CAMERA_SHAKE.AMOUNT,
                        keepShake: set.CAMERA_SHAKE.KEEP_SHAKE ?? false,
                        push: set.PUSH ?? false,
                        applyOn: { // You can basicly add other stuff to trigger the shake.
                            upgrade: set.APPLY_ON_UPGRADE ?? false,
                            shoot: set.APPLY_ON_SHOOT ?? false,
                        }
                    })
                }
                if (set.GUI_SHAKE) {
                    info.push({
                        type: "gui",
                        duration: set.GUI_SHAKE.DURATION,
                        amount: set.GUI_SHAKE.AMOUNT,
                        keepShake: set.GUI_SHAKE.KEEP_SHAKE ?? false,
                        push: set.PUSH ?? false,
                        applyOn: { // You can basicly add other stuff to trigger the shake.
                            upgrade: set.APPLY_ON_UPGRADE ?? false,
                            shoot: set.APPLY_ON_SHOOT ?? false,
                        }
                    })
                }
                info.forEach(info => {
                    if (info.applyOn.upgrade) {
                        this.socket.talk("SH", JSON.stringify(info));
                    }
                });
            })
            this.settings.shakeProperties = info;
        }
        if (set.mockup != null) {
            this.mockup = set.mockup;
        }
        if (emitEvent) {
            this.emit('define', { body: this, set });
        }
        if (overrideDefs) {
            this.defs = [];
            for (let def of defs) this.defs.push(def);
        }

        for (let branch = 1; branch < defs.length; branch++) defineSplit(defs, branch, set, this, emitEvent); // Define additional stats for other split upgrades
        // Batch upgrades
        if (this.batchUpgrades && emitEvent) handleBatchUpgradeSplit(this); // Batch upgrades

        // Make the entity targetable if they aren't a bullet, etc.
        const checkIfTargetAble = ["bullet", "drone", "swarm", "trap", "wall", "food", "unknown"];
        if (!checkIfTargetAble.includes(this.type)) {
            targetableEntities.set(this.id, this);
        } else targetableEntities.delete(this.id);
    }

    refreshBodyAttributes() {
        let speedReduce = Math.pow(this.size / (this.coreSize || this.SIZE), 1);
        this.acceleration = (1 * global.gameManager.runSpeed * this.ACCELERATION) / speedReduce;
        if (this.settings.reloadToAcceleration) this.acceleration *= this.skill.acl;
        this.topSpeed = (1 * global.gameManager.runSpeed * this.SPEED * this.skill.mob) / speedReduce;
        if (this.settings.reloadToAcceleration) this.topSpeed /= Math.sqrt(this.skill.acl);
        this.health.set(((this.settings.healthWithLevel ? 2 * this.level : 0) + this.HEALTH) * this.skill.hlt * 1);
        this.health.resist = 1 - 1 / Math.max(1, this.RESIST + this.skill.brst);
        this.shield.set(((this.settings.healthWithLevel ? 0.6 * this.level : 0) + this.SHIELD) * this.skill.shi, Math.max(0, ((this.settings.healthWithLevel ? 0.006 * this.level : 0) + 1) * this.REGEN * this.skill.rgn * 1));
        this.damage = 1 * this.DAMAGE * this.skill.atk;
        this.penetration = 1 * (this.PENETRATION + 1.5 * (this.skill.brst + 0.8 * (this.skill.atk - 1)));
        if (this.settings.diesAtRange || !this.range) this.range = 1 * this.RANGE;
        this.density = 1 * (1 + 0.08 * this.level) * this.DENSITY;
        this.stealth = 1 * this.STEALTH;
        this.pushability = 1 * this.PUSHABILITY;
        this.knockback = this.KNOCKBACK ?? false;
        this.sizeMultiplier = 1;
        this.recoilMultiplier = this.RECOIL_MULTIPLIER * 1;
    }

    updateBodyInfo() { this.fov = 1 * this.FOV * 275 * Math.sqrt(this.size); }

    bindToMaster(position, bond, isInvulnerable) {
        this.bond = bond;
        this.source = bond;
        this.bond.turrets.set(this.id, this);
        this.skill = this.bond.skill;
        this.label = this.bond.label + " " + this.label;
        this.ignoredByAi = true;
        // It will not be in collision calculations any more nor shall it be seen or continue to run independently.
        if (!isInvulnerable) {
            this.removeFromGrid();
            this.skipLife = true;
            targetableEntities.delete(this.id);
        }
        if (isInvulnerable) this.on('dead', () => { this.master.turrets.delete(this.id); })
        this.settings.drawShape = false;
        // Get my position.
        if (Array.isArray(position)) position = { SIZE: position[0], X: position[1], Y: position[2], ANGLE: position[3], ARC: position[4], LAYER: position[5] };
        position.SIZE ??= 10;
        position.X ??= 0;
        position.Y ??= 0;
        position.ANGLE ??= 0;
        position.ARC ??= 360;
        position.LAYER ??= 0;
        let _off = new Vector(position.X, position.Y);
        this.bound = { size: position.SIZE / 20, angle: position.ANGLE * Math.PI / 180, direction: _off.direction, offset: _off.length / 10, arc: position.ARC * Math.PI / 180, layer: position.LAYER };
        // Initalize.
        this.facing = this.bond.facing + this.bound.angle;
        if (this.facingType.includes('Target') || this.facingType.includes('Speed')) this.facingType = "bound", this.facingTypeArgs = {};
        this.motionType = "bound";
        this.motionTypeArgs = {};
        this.move();
    }

    get level() {
        return Math.min(this.levelCap ?? Config.LEVEL_CAP, this.skill.level);
    }
    get size() {
        return this.bond == null ? (this.coreSize || this.SIZE) * this.sizeMultiplier * (1 + this.level / 45) : this.bond.size * this.bound.size;
    }
    get mass() {
        return this.density * (this.size ** 2 + 1);
    }
    get realSize() {
        return this.size * lazyRealSizes[Math.floor(Math.abs(this.shape))];
    }
    get xMotion() {
        return (this.velocity.x + this.accel.x) / global.gameManager.roomSpeed;
    }
    get yMotion() {
        return (this.velocity.y + this.accel.y) / global.gameManager.roomSpeed;
    }
    set gunStatScale(gunStatScale) {
        if (!Array.isArray(gunStatScale)) gunStatScale = [gunStatScale];
        for (let gun of this.guns.values()) {
            if (!gun.shootSettings) continue;
            gun.shootSettings = combineStats([gun.shootSettings, ...gunStatScale]);
            gun.trueRecoil = gun.shootSettings.recoil;
            gun.interpret();
        }
    }

    camera(tur = false) {        
        // Get bound data
        const turretsAndProps = Array.from(this.turrets).concat(Array.from(this.props));
        turretsAndProps.sort((a, b) => a[1].bound.layer - b[1].bound.layer);
        const boundData = this.bound != null ? {
            direction: this.bound.direction,
            angle: this.bound.angle,
            offset: this.bound.offset,
            size: this.bound.size,
            layer: this.bound.layer
        } : { direction: 0, angle: 0, offset: 0, size: 1, layer: 0 };
        
        // Calculate type value more efficiently
        const typeValue = tur * 0x01 + (this.settings.drawHealth ? 0x02 : 0) + 
                          (((this.type === "tank" || this.type === "miniboss") && this.displayName) ? 0x04 : 0);
        
        // Determine layer value more efficiently
        const layerValue = this.layerID || (this.bond != null ? this.bound.layer : 
                          (this.type === "wall" ? 11 : 
                           this.type === "food" ? 10 : 
                           this.type === "tank" ? 5 : 
                           this.type === "crasher" ? 1 : 0));
        
        // Create camera info object
        const cameraInfo = {
            type: typeValue,
            invuln: this.invuln,
            id: this.id,
            index: this.index,
            x: this.x,
            y: this.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            size: this.size,
            health: this.health.display(),
            shield: this.shield.display(),
            alpha: this.alpha,
            facing: this.facing,
            vfacing: this.vfacing,
            mirrorMasterAngle: this.settings.mirrorMasterAngle ?? false,
            direction: boundData.direction,
            angle: boundData.angle,
            offset: boundData.offset,
            sizeFactor: boundData.size,
            twiggle: forceTwiggle.includes(this.facingType) || this.eastereggs.braindamage || 
                    this.settings.connectChildrenOnCamera || (this.facingType === "locksFacing" && this.control.alt),
            layer: layerValue,
            color: this.color.compiled,
            strokeWidth: this.strokeWidth,
            borderless: this.borderless,
            drawFill: this.drawFill,
            name: (this.nameColor || "#ffffff") + this.name,
            score: this.settings.scoreLabel || this.skill.score,
            guns: Array.from(this.guns).map(gun => gun[1].getPhotoInfo()),
            turrets: turretsAndProps.map(turret => turret[1].camera(true)),
        };
        
        // Process child camera connections if needed
        if (this.settings.connectChildrenOnCamera) {
            if (this.children.length > 0 || this.bulletchildren.length > 0) {
                // Initialize variables
                let sumX = cameraInfo.x;
                let sumY = cameraInfo.y;
                
                // Process all children in one pass with a single array
                const allChildren = [...this.children, ...this.bulletchildren];
                for (let i = 0; i < allChildren.length; i++) {
                    sumX += allChildren[i].x;
                    sumY += allChildren[i].y;
                }
                
                // Calculate average position (add 1 to count for this entity)
                const totalCount = allChildren.length + 1;
                this.cameraOverrideX = sumX / totalCount;
                this.cameraOverrideY = sumY / totalCount;
            } else {
                this.cameraOverrideX = null;
                this.cameraOverrideY = null;
            }
        }
        
        return cameraInfo;
    }

    isBeingViewed(addToNearby = true) {
        let boolean = checkIfInView(false, addToNearby, global.gameManager.clients, this);
        return boolean;
    }

    syncTurrets() {
        for (let gun of this.guns.values()) gun.syncChildren();
        for (let turret of this.turrets.values()) {
            turret.skill = this.skill;
            turret.refreshBodyAttributes();
            turret.syncTurrets();
        }
    }
    skillUp(stat) {
        let suc = this.skill.upgrade(stat);
        if (suc) {
            this.refreshBodyAttributes();
            this.syncSkillsToGuns();
            this.emit("skillUp", stat);
        }
        return suc;
    }
    syncSkillsToGuns() {
        for (let gun of this.guns.values()) gun.syncChildren();
        for (let turret of this.turrets.values()) turret.syncTurrets();
    }

    refreshSkills() { this.skill.update(); this.syncSkillsToGuns(); }

    upgrade(number, branchId) {
        // Account for upgrades that are too high level for the player to access
        for (let i = 0; i < branchId; i++) { number += this.skippedUpgrades[i] ?? 0; };
        if (number < this.upgrades.length && this.skill.level >= this.upgrades[number].level) {
            let upgrade = this.upgrades[number], upgradeClass = upgrade.class, upgradeBranch = upgrade.branch, redefineAll = upgrade.redefineAll;
            if (redefineAll) {
                for (let i = 0; i < upgradeClass.length; i++) upgradeClass[i] = ensureIsClass(...upgradeClass[i]);
                this.upgrades = [];
                this.define(upgradeClass);
            } else {
                this.defs.splice(upgradeBranch, 1, ...upgradeClass);
                this.upgrades = [];
                this.define(this.defs);
            }
            this.emit("upgrade", { body: this });
            if (this.settings.shakeProperties) this.settings.shakeProperties.forEach(info => {
                if (info.applyOn.upgrade) {
                    this.socket.talk("SH", JSON.stringify(info));
                }
            })
            this.sendMessage("You have upgraded to " + this.label + ".");
            for (let def of this.defs) {
                def = ensureIsClass(def);
                if (def.TOOLTIP != null && def.TOOLTIP.length > 0) this.sendMessage(def.TOOLTIP);
            }
            for (let instance of entities.values()) {
                if (instance.settings.clearOnMasterUpgrade && instance.master.id === this.id) instance.kill();
            }
            this.skill.update();
            this.syncTurrets();
            this.refreshBodyAttributes();
        }
    }

    damageMultiplier() {
        switch (this.type) {
            case 'swarm': return 0.25 + 1.5 * util.clamp(this.range / (this.RANGE + 1), 0, 1);
            default: return 1;
        }
    }

    move() {
        let g = { x: this.control.goal.x - this.x, y: this.control.goal.y - this.y },
            gactive = (g.x !== 0 || g.y !== 0),
            engine = { x: 0, y: 0, },
            a = this.acceleration / global.gameManager.roomSpeed;
        switch (this.motionType) {
            case 'glide':
                this.maxSpeed = this.topSpeed;
                this.damp = 0.05;
                break;
            case 'motor':
                this.maxSpeed = 0;
                if (this.topSpeed) {
                    this.damp = a / this.topSpeed;
                }
                if (gactive) {
                    let len = Math.sqrt(g.x * g.x + g.y * g.y);
                    engine = { x: a * g.x / len, y: a * g.y / len, };
                }
                break;
            case 'swarm':
                this.maxSpeed = this.topSpeed;
                let l = util.getDistance({ x: 0, y: 0, }, g) + 1;
                if (gactive && l > this.size) {
                    let desiredxspeed = this.topSpeed * g.x / l,
                        desiredyspeed = this.topSpeed * g.y / l,
                        turning = Math.sqrt((this.topSpeed * Math.max(1, this.motionTypeArgs.turnVelocity ?? this.range) + 1) / a);
                    engine = {
                        x: (desiredxspeed - this.velocity.x) / Math.max(5, turning),
                        y: (desiredyspeed - this.velocity.y) / Math.max(5, turning),
                    };
                } else {
                    if (this.velocity.length < this.topSpeed) {
                        engine = {
                            x: this.velocity.x * a / 20,
                            y: this.velocity.y * a / 20,
                        };
                    }
                }
                break;
            case 'chase':
                if (gactive) {
                    let l = util.getDistance({ x: 0, y: 0, }, g);
                    if (l > this.size * 2) {
                        this.maxSpeed = this.topSpeed;
                        let desiredxspeed = this.topSpeed * g.x / l,
                            desiredyspeed = this.topSpeed * g.y / l;
                        engine = {
                            x: (desiredxspeed - this.velocity.x) * a,
                            y: (desiredyspeed - this.velocity.y) * a,
                        };
                    } else if (this.motionTypeArgs.keepSpeed) {
                        if (this.velocity.length < this.topSpeed) {
                            engine = {
                                x: this.velocity.x * a / 20,
                                y: this.velocity.y * a / 20,
                            };
                        }
                    } else this.maxSpeed = 0;
                } else if (this.motionTypeArgs.keepSpeed) {
                    if (this.velocity.length < this.topSpeed) {
                        engine = {
                            x: this.velocity.x * a / 20,
                            y: this.velocity.y * a / 20,
                        };
                    }
                } else this.maxSpeed = 0;
                break;
            case 'drift':
                this.maxSpeed = 0;
                engine = { x: g.x * a, y: g.y * a, };
                break;
            case 'bound':
                let bound = this.bound, ref = this.bond;
                this.x = ref.x + ref.size * bound.offset * Math.cos(bound.direction + bound.angle + ref.facing);
                this.y = ref.y + ref.size * bound.offset * Math.sin(bound.direction + bound.angle + ref.facing);
                this.bond.velocity.x += bound.size * this.accel.x;
                this.bond.velocity.y += bound.size * this.accel.y;
                this.firingArc = [ref.facing + bound.angle, bound.arc / 2];
                nullVector(this.accel);
                this.blend = ref.blend;
                break;
            case "withMaster":
                this.x = this.source.x;
                this.y = this.source.y;
                this.velocity.x = this.source.velocity.x;
                this.velocity.y = this.source.velocity.y;
                break;
        }
        this.accel.x += engine.x * this.control.power;
        this.accel.y += engine.y * this.control.power;
    }

    face() {
        let t = this.control.target,
            oldFacing = this.facing;
        let defaultBound = () => {
            let givenangle;
            if (this.control.main) {
                if (this.master.master.isPlayer) {
                    let reverse = this.master.master.reverseTargetWithTank ? 1 : this.master.master.reverseTank;
                    givenangle = Math.atan2(t.y * reverse, t.x * reverse);
                } else {
                    givenangle = Math.atan2(t.y, t.x);
                }
                let diff = util.angleDifference(givenangle, this.firingArc[0]);
                if (Math.abs(diff) >= this.firingArc[1]) {
                    givenangle = this.firingArc[0];
                }
            } else {
                givenangle = this.firingArc[0];
            }
            this.facing += util.loopSmooth(this.facing, givenangle, 4 / global.gameManager.runSpeed);
        }
        switch (this.facingType) {
            case "spin":
                this.facing += (this.facingTypeArgs.speed ?? 0.05) / global.gameManager.runSpeed;
                break;
            case "spinWhenIdle":
                if (t && this.control.fire) this.facing = Math.atan2(t.y, t.x); else this.facing += (this.facingTypeArgs.speed ?? 0.05) / global.gameManager.runSpeed;
                break;
            case 'turnWithSpeed':
                this.facing += this.velocity.length / 90 * Math.PI / global.gameManager.roomSpeed;
                break;
            case 'withMotion':
                this.facing = this.velocity.direction;
                break;
            case 'smoothWithMotion':
            case 'looseWithMotion':
                this.facing += util.loopSmooth(this.facing, this.velocity.direction, 4 / global.gameManager.roomSpeed);
                break;
            case 'withTarget':
            case 'toTarget':
                if (this.eastereggs.braindamage) return;
                if (this.isPlayer) {
                    let reverse = this.reverseTargetWithTank ? 1 : this.reverseTank;
                    this.facing = Math.atan2(t.y * reverse, t.x * reverse);
                } else {
                    this.facing = Math.atan2(t.y, t.x);
                }
                break;
            case 'locksFacing':
                if (!this.control.alt) this.facing = Math.atan2(t.y, t.x);
                break;
            case 'looseWithTarget':
            case 'looseToTarget':
            case 'smoothToTarget':
                this.facing += util.loopSmooth(this.facing, Math.atan2(t.y, t.x), 4 / global.gameManager.roomSpeed);
                break;
            case "noFacing":
                if (this.lastSavedFacing !== this.facing) this.facing = this.facingTypeArgs.angle ?? 0;
                this.lastSavedFacing = this.facing;
                break;
            case 'bound':
                defaultBound();
                break;
            case "spinOnFire":
                if (t && this.control.fire) this.facing += util.loopSmooth(this.facing, this.facing += 1, 4 / global.gameManager.runSpeed); else defaultBound();
                break;
            case "manual":
                if ((this.facingTypeArgs.angle ?? 0) !== this.facing) {
                    this.facing = this.facingTypeArgs.angle;
                }
                break;
        }
        // Loop
        const TAU = 2 * Math.PI
        this.facing = (this.facing % TAU + TAU) % TAU;
        this.vfacing = util.angleDifference(oldFacing, this.facing) * global.gameManager.roomSpeed;
    }

    takeSelfie() {
        if (this.settings.drawShape) {
            // Only compute camera data and reset flattenedPhoto when necessary
            this.flattenedPhoto = null;
            this.photo = this.camera();
        } else if (this.photo !== undefined) {
            // Only set to undefined if it wasn't already undefined
            this.photo = undefined;
        }
    }

    physics() {
        if (this.accel.x == null || this.velocity.x == null) {
            util.error('Void Error!');
            util.error(this.collisionArray);
            util.error(this.label);
            util.error(this);
            nullVector(this.accel); nullVector(this.velocity);
        }
        // Apply acceleration
        this.velocity.x += this.accel.x;
        this.velocity.y += this.accel.y;
        // Reset acceleration
        nullVector(this.accel);
        // Apply motion
        this.stepRemaining = 1;
        this.x += this.stepRemaining * this.velocity.x / global.gameManager.roomSpeed;
        this.y += this.stepRemaining * this.velocity.y / global.gameManager.roomSpeed;
    }

    friction() {
        var motion = this.velocity.length,
            excess = motion - this.maxSpeed;
        if (excess > 0 && this.damp) {
            var k = this.damp / global.gameManager.roomSpeed,
                drag = excess / (k + 1),
                finalvelocity = this.maxSpeed + drag;
            this.velocity.x = finalvelocity * this.velocity.x / motion;
            this.velocity.y = finalvelocity * this.velocity.y / motion;
        }
    }

    confinementToTheseEarthlyShackles() {
        if (this.x == null || this.x == null) {
            util.error('Void Error!');
            util.error(this.collisionArray);
            util.error(this.label);
            util.error(this);
            nullVector(this.accel); nullVector(this.velocity);
            return 0;
        }
        if (!this.settings.canGoOutsideRoom) {
            if (Config.ARENA_TYPE === "circle") {
                let centerPoint = {
                    x: global.gameManager.room.width - global.gameManager.room.width,
                    y: global.gameManager.room.height - global.gameManager.room.height,
                }, dist = util.getDistance(this, centerPoint);
                if (dist > global.gameManager.room.width - global.gameManager.room.width / 2) {
                    let strength = (dist - global.gameManager.room.width / 2) * Config.ROOM_BOUND_FORCE / (Config.runSpeed * 350);
                    this.x = util.lerp(this.x, centerPoint.x, strength);
                    this.y = util.lerp(this.y, centerPoint.y, strength);
                }
            } else {
                this.accel.x -= Math.min(this.x - this.realSize + global.gameManager.room.width / 2 + 50, 0) * Config.ROOM_BOUND_FORCE / global.gameManager.roomSpeed;
                this.accel.x -= Math.max(this.x + this.realSize - global.gameManager.room.width / 2 - 50, 0) * Config.ROOM_BOUND_FORCE / global.gameManager.roomSpeed;
                this.accel.y -= Math.min(this.y - this.realSize + global.gameManager.room.height / 2 + 50, 0) * Config.ROOM_BOUND_FORCE / global.gameManager.roomSpeed;
                this.accel.y -= Math.max(this.y + this.realSize - global.gameManager.room.height / 2 - 50, 0) * Config.ROOM_BOUND_FORCE / global.gameManager.roomSpeed;
            }
        }
    }

    contemplationOfMortality() {
        if (this.invuln || this.godmode) {
            this.damageReceived = 0;
            return 0;
        }
        // Life-limiting effects
        if (this.settings.diesAtRange) {
            this.range -= 1 / global.gameManager.roomSpeed;
            if (this.range < 0) this.kill();
        }
        if (this.settings.diesAtLowSpeed && !this.collisionArray.length && this.velocity.length < this.topSpeed / 2) this.health.amount -= this.health.getDamage(1 / global.gameManager.roomSpeed);
        // Shield regen and damage
        if (this.shield.max) {
            if (this.damageReceived) {
                let shieldDamage = this.shield.getDamage(this.damageReceived);
                this.damageReceived -= shieldDamage;
                this.shield.amount -= shieldDamage;
            }
        }
        // Health damage
        if (this.damageReceived) {
            let healthDamage = this.health.getDamage(this.damageReceived);
            this.blend.amount = 1;
            this.health.amount -= healthDamage;
        }
        this.damageReceived = 0;

        // Check for death
        if (this.readyToDie) return 1;
        if (this.isDead() && !this.readyToDie) {
            this.readyToDie = true;
            for (let gun of this.guns.values()) {
                if (gun.shootOnDeath && gun.body != null) gun.spawnBullets();
            }

            // NO MEMORY LEAKS!
            for (let turret of this.turrets.values()) turret.kill();
            // Legacy death function
            if (this.onDeath) this.onDeath();
            // Initalize message arrays
            let killers = [],
                killTools = [],
                notJustFood = false;
            // If I'm a tank, call me a nameless player
            let name = this.master.name == ""
                ? this.master.type === "tank"
                    ? "an unnamed " + this.label : this.master.type === "miniboss"
                        ? "a visiting " + this.label : this.label.substring(0, 3) == 'The'
                            ? this.label : util.addArticle(this.label)
                : this.master.name + "'s " + this.label;
            // Calculate the jackpot
            let jackpot = util.getJackpot(this.skill.score) / this.collisionArray.length;
            // Now for each of the things that kill me...
            for (let i = 0; i < this.collisionArray.length; i++) {
                let instance = this.collisionArray[i];
                if (instance.type === 'wall' || !instance.damage) continue;
                if (instance.master.settings.acceptsScore) {
                    // If it's not food, give its master the score
                    if (instance.master.type === "tank" || instance.master.type === "miniboss") {
                        notJustFood = true;
                    }
                    instance.master.skill.score += jackpot;
                    killers.push(instance.master); // And keep track of who killed me
                } else if (instance.settings.acceptsScore) instance.skill.score += jackpot;
                killTools.push(instance); // Keep track of what actually killed me
            }
            // Remove duplicates
            killers = killers.filter((elem, index, self) => index == self.indexOf(elem));
            killers.forEach((e) => e.emit('kill', { body: e, entity: this }));
            // If there's no valid killers (you were killed by food), change the message to be more passive
            let killText = "You have been killed by ",
                doISendAText = this.settings.givesKillMessage;

            for (let i = 0; i < killers.length; i++) {
                let instance = killers[i];
                switch (this.type) {
                    case "tank":
                        killers.length > 1 ? instance.killCount.assists++ : instance.killCount.solo++;
                        break;
                    case "food":
                    case "crasher":
                        instance.killCount.polygons++;
                        break
                    case "miniboss":
                        instance.killCount.bosses++;
                        break;
                }

                this.killCount.killers.push(instance.index);
            };
            // Add the killers to our death message, also send them a message
            if (notJustFood) {
                for (let i = 0; i < killers.length; i++) {
                    let instance = killers[i];
                    if (instance.master.type !== "food" && instance.master.type !== "crasher") {
                        killText += instance.name == "" ? killText == "" ? "An unnamed player" : "an unnamed player" : instance.name;
                        killText += " and ";
                    }
                    // Only if we give messages
                    if (doISendAText) instance.sendMessage("You killed " + name + (killers.length > 1 ? " (with some help)." : "."));
                    if (this.settings.killMessage) instance.sendMessage("You " + this.settings.killMessage + " " + name + (killers.length > 1 ? " (with some help)." : "."));
                }
                // Prepare the next part of the next
                killText = killText.slice(0, -4) + "killed you with ";
            }
            // Broadcast
            if (this.settings.broadcastMessage) global.gameManager.socketManager.broadcast(this.settings.broadcastMessage);
            if (this.settings.defeatMessage) {
                let text = util.addArticle(this.label, true);
                if (notJustFood) {
                    text += " has been defeated by";
                    for (let { name } of killers) {
                        text += " ";
                        text += name === "" ? "an unnamed player" : name;
                        text += " and";
                    }
                    text = text.slice(0, -4);
                    text += "!";
                } else text += " fought a polygon... and the polygon won.";
                sockets.broadcast(text);
            }

            // instead of "a Machine Gunner Bullet and a Machine Gunner Bullet and a Machine Gunner Bullet",
            // make it say " 3 Machine Gunner Bullets"
            let killCounts = {};
            for (let { label } of killTools) {
                if (!killCounts[label]) killCounts[label] = 0;
                killCounts[label]++;
            }
            let killCountEntries = Object.entries(killCounts).map(([name, count], i) => name);
            for (let i = 0; i < killCountEntries.length; i++) {
                killText += (killCounts[killCountEntries[i]] == 1) ? util.addArticle(killTools[i].label) : killCounts[killCountEntries[i]] + ' ' + killCountEntries[i] + 's';
                killText += i < killCountEntries.length - 2 ? ', ' : ' and ';
            }

            // Prepare it and clear the collision array.
            killText = killText.slice(0, -5);
            if (killText === "You have been kille") killText = "You have died a stupid death";
            if (!this.dontSendDeathMessage) this.sendMessage(killText + ".");
            // If I'm the leader, broadcast it:
            if (this.id === global.gameManager.room.topPlayerID) {
                let usurptText = this.name === "" ? "The leader" : this.name;
                if (notJustFood) {
                    usurptText += " has been usurped by";
                    for (let i = 0; i < killers.length; i++) {
                        usurptText += " ";
                        usurptText += killers[i].name === "" ? "an unnamed player" : killers[i].name;
                        usurptText += " and";
                    }
                    usurptText = usurptText.slice(0, -4) + "!";
                } else {
                    usurptText += " fought a polygon... and the polygon won.";
                }
                global.gameManager.socketManager.broadcast(usurptText);
            }
            this.emit('dead', { body: this, killers });
            // Kill it
            return 1;
        }
        return 0;
    }

    protect() {
        entitiesToAvoid.push(this); this.isProtected = true;
    }
    
    say(message, duration = Config.CHAT_MESSAGE_DURATION) {
        if (!chats[this.id]) {
            chats[this.id] = [];
        }
        chats[this.id].unshift({ message, expires: Date.now() + duration });
    }

    sendMessage(message) { } // Dummy

    kill() {
        this.invuln = false;
        this.godmode = false;
        this.health.amount = -100;
    }

    destroy() {
        // Remove from the protected entities list
        if (this.isProtected) util.remove(entitiesToAvoid, entitiesToAvoid.indexOf(this));
        // Remove from minimap
        let i = global.gameManager.minimap.findIndex(entry => { return entry[0] === this.id; });
        if (i != -1) util.remove(global.gameManager.minimap, i);
        // Remove this from views
        global.gameManager.views.forEach(v => v.remove(this));
        // Remove bullet from bullet list if needed, and the only reason it exists is for bacteria.
        if (this.bulletparent != null) util.remove(this.bulletparent.bulletchildren, this.bulletparent.bulletchildren.indexOf(this))
        // Remove from parent lists if needed
        if (this.parent != null) util.remove(this.parent.children, this.parent.children.indexOf(this));
        // Kill all of its children
        for (const instance of entities.values()) {
            if (instance.source.id === this.id) {
                if (instance.settings.persistsAfterDeath) {
                    instance.source = instance;
                } else if (this.master.label !== "Bacteria") {
                    instance.kill();
                    targetableEntities.delete(instance.id);
                }
            }
            if (instance.parent && instance.parent.id === this.id) {
                instance.parent = null;
            }
            if (instance.master.id === this.id) {
                if (this.master.label !== "Bacteria") {
                    instance.kill();
                    instance.master = instance;
                    targetableEntities.delete(instance.id);
                }
            }
        };
        // Remove everything bound to it
        for (const turret of this.turrets.values()) {
            turret.destroy();
        }
        this.removeFromGrid();
        this.isGhost = true;
        entities.delete(this.id);
        targetableEntities.delete(this.id);
    }

    isDead() { return this.health.amount <= 0; }
}
module.exports = { Entity, Prop };

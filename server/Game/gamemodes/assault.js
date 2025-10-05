class Assault {
    constructor() {
        this.room = global.gameManager.room;
        this.choices = ["destroyerDominator", "gunnerDominator", "trapperDominator"];
        this.defineProperties();
    }
    
    spawnDominator(tile, team, type, originalType, saveCurrentType = false) {
        let o = new Entity(tile.loc);
        o.define(type);
        if (saveCurrentType) originalType = type;
        o.team = team;
        o.color.base = getTeamColor(team);
        o.skill.score = 111069;
        o.name = "Dominator";
        o.SIZE = global.gameManager.room.tileWidth / 19;
        o.permanentSize = o.SIZE;
        o.isDominator = true;
        o.displayName = false;
        if (!tile.isMain) {
            o.controllers = [new ioTypes.nearestDifferentMaster(o, {}, global.gameManager), new ioTypes.spin(o, { onlyWhenIdle: true })];
        }
        o.on("dead", () => {
            if (!this.gameActive || global.gameManager.arenaClosed) return;
            if (o.team === TEAM_BLUE) {
                this.spawnDominator(tile, TEAM_GREEN, tile.isMain ? "sanctuaryTier3" : originalType, originalType);
                tile.color = "green";
                this.leftDominators++;
                global.gameManager.socketManager.broadcast(`A GREEN ${tile.isMain ? "Sanctuary" : "Dominator"} has been repaired!`);
                if (this.leftDominators == 3 && this.timerPaused) this.timerPaused = false;
            } else {
                this.spawnDominator(tile, TEAM_BLUE, "dominator", originalType);
                tile.color = "blue";
                this.leftDominators--;
                global.gameManager.socketManager.broadcast(`A GREEN ${tile.isMain ? "Sanctuary" : "Dominator"} has been destroyed!`);
                if (this.leftDominators == 2) {
                    global.gameManager.socketManager.broadcast("Green bases are down.");
                    this.timerPaused = true;
                    this.minuteTimer = 8;
                    this.secondTimer = 60;
                }
                if (this.leftDominators == 0) {
                    this.win(TEAM_BLUE);
                }
            }
            global.gameManager.socketManager.broadcastRoom();
        })
    }

    defineProperties() {
        this.gameActive = false;
        this.minuteTimer = 12;
        this.secondTimer = 60;
        this.timerInterval = null;
        this.timerPaused = false;
        this.leftDominators = 0;
    }

    win(team) {
        global.gameManager.socketManager.broadcast(`${getTeamName(team)} HAS WON THE GAME!`);
        this.gameActive = false;
        setTimeout(() => {
            global.gameManager.closeArena();
        }, 3000)
    }

    start() {
        this.gameActive = true;
        let mainTile = ran.choose(this.room.spawnable["assaultDominators"]);
        mainTile.isMain = true;
        if (!this.room.spawnable[TEAM_GREEN]) this.room.spawnable[TEAM_GREEN] = [];
        this.room.spawnable[TEAM_GREEN].push(mainTile);
        this.spawnDominator(mainTile, TEAM_GREEN, "sanctuaryTier3");
        for (let tile of this.room.spawnable["assaultDominators"]) {
            this.leftDominators += 1;
            tile.color = tile.bluePrint.COLOR;
            let type = ran.choose(this.choices);
            if (!tile.isMain) {
                this.spawnDominator(tile, TEAM_GREEN, type, false, true);
            };
        }
        this.timerInterval = setInterval(() => {
            if (global.gameManager.arenaClosed) clearInterval(this.timerInterval);
            if (!this.gameActive || this.timerPaused) return;
            if (this.minuteTimer !== 0) {
                this.minuteTimer--;
                global.gameManager.socketManager.broadcast(`${this.minuteTimer + 1} minut${this.minuteTimer == 0 ? "e" : "es"} until ${getTeamName(TEAM_GREEN)} wins!`);
            }
            if (this.minuteTimer == 0) {
                clearInterval(this.timerInterval);
            }
        }, 60000)
        this.secondaryTimeInterval = setInterval(() => {
            if (global.gameManager.arenaClosed) clearInterval(this.secondaryTimeInterval);
            if (!this.gameActive || this.timerPaused) return;
            if (this.minuteTimer == 0) {
                this.secondTimer--;
                if (this.secondTimer === 0) {
                    this.win(TEAM_GREEN);
                    clearInterval(this.secondaryTimeInterval);
                    return;
                }
                if (
                    this.secondTimer % 10 == 0 ||
                    this.secondTimer == 14 ||
                    this.secondTimer == 13 ||
                    this.secondTimer == 12 ||
                    this.secondTimer == 11 ||
                    this.secondTimer == 9 ||
                    this.secondTimer == 8 ||
                    this.secondTimer == 7 ||
                    this.secondTimer == 6 ||
                    this.secondTimer == 5 ||
                    this.secondTimer == 4 ||
                    this.secondTimer == 3 ||
                    this.secondTimer == 2 ||
                    this.secondTimer == 1
                ) {
                    global.gameManager.socketManager.broadcast(
                        `${this.secondTimer} secon${this.secondTimer == 1 ? "d" : "ds"} left until ${getTeamName(TEAM_GREEN)} wins!`,
                    );
                }
            }
        }, 1000)
    }

    reset() {
        clearInterval(this.timerInterval);
        clearInterval(this.secondaryTimeInterval);
        this.defineProperties();
    }
    
    redefine(theshit) {
        this.room = theshit.room;
        this.defineProperties();
    }
}

module.exports = { Assault };
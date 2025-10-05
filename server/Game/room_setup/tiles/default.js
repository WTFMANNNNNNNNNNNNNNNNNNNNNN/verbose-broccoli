let spawnPermanentAntiTankMachineGun = (loc, gameManager) => {
    let o = new Entity(loc);
    o.define('antiTankMachineGun');
    o.define({
        BODY: { FOV: 1.5, },
        FACING_TYPE: "spinWhenIdle",
    })
    o.controllers = [new ioTypes.nearestDifferentMaster(o, {}, gameManager)]
    o.team = TEAM_ROOM;
    o.SIZE = 15;
    o.color.base = getTeamColor(TEAM_RED);
    o.on('dead', () => spawnPermanentAntiTankMachineGun(loc, gameManager));
};

tileClass.normal = new Tile({
    COLOR: "white",
    NAME: "Default Tile",
    INIT: (tile, room) => room.spawnableDefault.push(tile),
});
tileClass.nest = new Tile({
    COLOR: "nest",
    NAME: "Nest Tile",
    INIT: (tile, room) => {
        if (!room.spawnable[TEAM_ENEMIES]) room.spawnable[TEAM_ENEMIES] = [];
        room.spawnable[TEAM_ENEMIES].push(tile);
    },
});
tileClass.wall = new Tile({
    COLOR: "white",
    NAME: "Wall Tile",
    INIT: (tile, room) => {
        let o = new Entity(tile.loc);
        o.define("wall");
        o.team = TEAM_ROOM;
        o.SIZE = room.tileWidth / 2 / lazyRealSizes[4] * Math.SQRT2 - 2;
        o.protect();
        o.life();
        makeHitbox(o);
        walls.push(o);
        o.on("dead", () => {
            util.remove(walls, walls.indexOf(o));
        })
    }
});
tileClass.atmg = new Tile({
    COLOR: "white",
    NAME: "ATMG Tile",
    INIT: (tile, room, gameManager) => spawnPermanentAntiTankMachineGun(tile.loc, gameManager)
})
tileClass.botWanderingTile = new Tile({
    COLOR: "white",
    NAME: "Bot Wandering Tile",
    INIT: (tile, room) => {
        if (!room["botWanderingTiles"]) room["botWanderingTiles"] = [];
        room["botWanderingTiles"].push(tile);
    },
})
let placeRoids = (defs, tile, room, gameManager) => {
    for (let [def, amount] of defs) {
        def = ensureIsClass(def);
        let checkRadius = 10 + def.SIZE;
        for (; amount; amount--) {
            let i = 200,
                position = {};
            do {
                position = tile.randomInside();
            } while (i-- && dirtyCheck(position, checkRadius, gameManager));
            let o = new Entity(position);
            o.team = -101;
            o.facing = ran.randomAngle();
            o.define(def);
            o.protect();
            o.life();
        }
    }
};

tileClass.rock = new Tile({
    COLOR: "white",
    NAME: "Rock Tile",
    INIT: (tile, room, gameManager) => placeRoids([['rock', 0], ['gravel', 2]], tile, room, gameManager)
})
tileClass.roid = new Tile({
    COLOR: "white",
    NAME: "Roid Tile",
    INIT: (tile, room, gameManager) => placeRoids([['rock', 1], ['gravel', 1]], tile, room, gameManager)
})

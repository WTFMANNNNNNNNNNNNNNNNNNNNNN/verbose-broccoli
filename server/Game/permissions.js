// OPERATOR LEVELS
/*
{
    level: 1 // All basic stuff
    level: 2 // All advanced stuff
    level: 3 // All stuff
} 
*/

module.exports = [
    {
        key: process.env.SHINY,
        discordID: "0",
        nameColor: "#ffffff",
        class: "shinyMenu",
        level: 2,
        name: "unnamed#0000",
        note: "note here"
    },
    {
        key: process.env.YOUTUBER,
        discordID: "0",
        nameColor: "#ffffff",
        class: "youtuber",
        level: 2,
        name: "unnamed#0000",
        note: "note here"
    },
    {
        key: process.env.BETA_TESTER,
        discordID: "0",
        nameColor: "#ffffff",
        class: "shinyMenu", // "betaTester" TODO: CREATE BETA TESTER
        level: 3,
        name: "unnamed#0000",
        note: "note here"
    },
    {
        key: process.env.DEVELOPER,
        discordID: "0",
        nameColor: "#ffffff",
        class: "developer",
        administrator: true,
        level: 3,
        name: "unnamed#0000",
        note: "note here",
    },
]

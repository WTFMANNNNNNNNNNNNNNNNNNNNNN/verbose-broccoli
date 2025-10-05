import { util } from "./util.js";
import { global } from "./global.js";
import { config } from "./config.js";
import { Canvas } from "./canvas.js";
import { color as colors } from "./color.js";
import { gameDraw } from "./gameDraw.js";
import * as socketStuff from "./socketinit.js";

(async function (util, global, config, Canvas, color, gameDraw, socketStuff) {
    let { socketInit, resync, gui, leaderboard, minimap, moveCompensation, lag, getNow } = socketStuff;
    global.loggers = {
        processEntities: new util.logger(),
        renderedEntities: new util.logger(),
        processMinimap: new util.logger(),
        processLeaderboard: new util.logger(),
        master: new util.logger(),
        socketMaster: new util.logger(),
    };
    // Get the changelog
    fetch("changelog.md", { cache: "no-cache" }).then(response => response.text()).then(response => {
        let a = [];
        for (let c of response.split("\n")) 0 !== c.length && (response = c.charAt(0), "#" === response ? (initalizeChangelog(a, !0), a = [c.slice(1).trim()]) : "-" === response ? a.push(c.slice(1).trim()) : a[a.length - 1] += " " + c.trim());
        initalizeChangelog(a, !1);
    });

    let controls = document.getElementById("controlSettings"),
        resetButton = document.getElementById("resetControls"),
        selectedElement = null,
        controlsArray = [],
        defaultKeybinds = {},
        keybinds = {};

    global.clearUpgrades = (clearNow = false) => {
        if (clearNow) gui.upgrades = [];
        else {
            global.pullUpgradeMenu = true;
            let loop = setInterval(() => {
                if (upgradeMenu.get() < (-global.columnCount * 3) * 0.9999) {
                    global.pullUpgradeMenu = false;
                    gui.upgrades = [];
                    clearInterval(loop);
                }
            }, 10)
        }
    }

    // Build the leaderboard object
    let leaderboardEntries = {};
    let leaderboardUpdate = 0;
    global.canUpgrade = false;
    global.canSkill = false;
    global.showTree = false;
    global.message = "";
    global.time = 0;
    global.guntime = 0;

    var upgradeSpin = 0,
        lastPing = 0,
        lasttick = 0,
        fovlasttick = 0;

    // Tips setup :D
    let tips = global.tips[Math.floor(Math.random() * global.tips.length)];
    global.tips = tips[Math.floor(Math.random() * tips.length)];
    // Window setup <3
    global.mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);
    global.mobile && document.body.classList.add("mobile");
    !global.mobile && document.getElementById("tabAppearance").classList.remove("shadowScroll");

    function getKeybinds() {
        let kb = localStorage.getItem("keybinds");
        keybinds = typeof kb === "string" && kb.startsWith("{") ? JSON.parse(kb) : {};
    }

    function setKeybinds() {
        localStorage.setItem("keybinds", JSON.stringify(keybinds));
    }

    function unselectElement() {
        if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
        selectedElement.element.parentNode.parentNode.classList.remove("editing");
        selectedElement = null;
    }

    function selectElement(element) {
        selectedElement = element;
        selectedElement.element.parentNode.parentNode.classList.add("editing");
        if (selectedElement.keyCode !== -1 && window.getSelection) {
            let selection = window.getSelection();
            selection.removeAllRanges();
            let range = document.createRange();
            range.selectNodeContents(selectedElement.element);
            selection.addRange(range);
        }
    }

    function setKeybind(key, keyCode) {
        selectedElement.element.parentNode.parentNode.classList.remove("editing");
        resetButton.classList.add("active");
        if (keyCode !== selectedElement.keyCode) {
            let otherElement = controlsArray.find(c => c.keyCode === keyCode);
            if (keyCode !== -1 && otherElement) {
                otherElement.keyName = selectedElement.keyName;
                otherElement.element.innerText = selectedElement.keyName;
                otherElement.keyCode = selectedElement.keyCode;
                global[otherElement.keyId] = selectedElement.keyCode;
                keybinds[otherElement.keyId] = [selectedElement.keyName, selectedElement.keyCode];
            }
        }
        selectedElement.keyName = key;
        selectedElement.element.innerText = key;
        selectedElement.keyCode = keyCode;
        global[selectedElement.keyId] = keyCode;
        keybinds[selectedElement.keyId] = [key, keyCode];
        setKeybinds();
    }

    function getElements(kb, storeInDefault) {
        for (let row of controls.rows) {
            for (let cell of row.cells) {
                let element = cell.firstChild.firstChild;
                if (!element) continue;
                let key = element.dataset.key;
                if (storeInDefault) defaultKeybinds[key] = [element.innerText, global[key]];
                if (kb[key]) {
                    element.innerText = kb[key][0];
                    global[key] = kb[key][1];
                    resetButton.classList.add("active");
                }
                let obj = {
                    element,
                    keyId: key,
                    keyName: element.innerText,
                    keyCode: global[key]
                };
                controlsArray.push(obj);
            }
        }
    }
    window.onload = async () => {
        // Prepare the server selector
        global.serverMap = {};
        global.servers = [];
        // Set up the socket
        global.loadServerSelector(false, "Connecting..."); // The code is at ./serverSelectorHandler.js

        fetch("/getServers.json").then(response => response.json()).then(json => {
            global.servers = json;
            global.loadServerSelector(json); // The code is at ./serverSelectorHandler.js
        }).catch(error => {
            console.error(error);
        })

        // Retrieve forms
        util.retrieveFromLocalStorage("playerNameInput");
        util.retrieveFromLocalStorage("playerKeyInput");
        util.retrieveFromLocalStorage("optSharpEdges");
        util.retrieveFromLocalStorage("optSlowerFOV");
        util.retrieveFromLocalStorage("optPredictive");
        util.retrieveFromLocalStorage("optFancy");
        util.retrieveFromLocalStorage("optLowResolution");
        util.retrieveFromLocalStorage("coloredHealthbars");
        util.retrieveFromLocalStorage("smoothCamera");
        util.retrieveFromLocalStorage("optColors");
        util.retrieveFromLocalStorage("optCustom");
        util.retrieveFromLocalStorage("optPointy");
        util.retrieveFromLocalStorage("optPredictAnim");
        util.retrieveFromLocalStorage("optLerpAnim");
        util.retrieveFromLocalStorage("optBorders");
        util.retrieveFromLocalStorage("optNoGrid");
        util.retrieveFromLocalStorage("optRenderKillbar");
        util.retrieveFromLocalStorage("seperatedHealthbars");
        util.retrieveFromLocalStorage("autoLevelUp");
        util.retrieveFromLocalStorage("optMobile");
        // GUI
        util.retrieveFromLocalStorage("optRenderGui");
        util.retrieveFromLocalStorage("optRenderLeaderboard");
        util.retrieveFromLocalStorage("optRenderNames");
        util.retrieveFromLocalStorage("optRenderHealth");
        util.retrieveFromLocalStorage("optRenderScores");
        util.retrieveFromLocalStorage("optReducedInfo");
        util.retrieveFromLocalStorage("showCrosshair");
        util.retrieveFromLocalStorage("showJoystick");
        util.retrieveFromLocalStorage("optFullHD");
        // Set default theme
        if (document.getElementById("optColors").value === "") {
            document.getElementById("optColors").value = "normal";
            // Also do auto check for GUI stuff.
            document.getElementById("optRenderGui").checked = true;
            document.getElementById("optRenderLeaderboard").checked = true;
            document.getElementById("optRenderNames").checked = true;
            document.getElementById("optRenderHealth").checked = true;
            document.getElementById("optRenderScores").checked = true;
            document.getElementById("optFancy").checked = true;
            if (global.mobile) document.getElementById("showCrosshair").checked = true, document.getElementById("showJoystick").checked = true;
        }
        if (document.getElementById("optBorders").value === "") {
            document.getElementById("optBorders").value = "normal";
        }
        // Mobile Selection stuff
        if (document.getElementById("optMobile").value === "") {
            document.getElementById("optMobile").value = "mobile";
        }
        loadSettings();
        // Keybinds stuff
        getKeybinds();
        getElements(keybinds, true);
        document.addEventListener("click", event => {
            if (!global.gameStart) {
                if (selectedElement) {
                    unselectElement();
                } else {
                    let element = controlsArray.find(({ element }) => element === event.target);
                    if (element) selectElement(element);
                }
            }
        });
        resetButton.addEventListener("click", () => {
            keybinds = {};
            setKeybinds();
            controlsArray = [];
            getElements(defaultKeybinds);
            resetButton.classList.add("spin");
            setTimeout(() => {
                resetButton.classList.remove("active");
                resetButton.classList.remove("spin");
            }, 400);
        });

        // Tab menu creater
        global.createTabMenu = (text, type, addDismissButton = false) => {
            let allowedType = [
                "warning",
                "critical",
                "discord",
                "stat",
                "achieve",
            ];
            if (allowedType.includes(type)) {
                let b = document.getElementById("menuTabs");
                b.style.textAlign = "center";
                let d = document.createElement("span");
                d.classList.add("menuTab");
                d.classList.add(type);
                d.appendChild(document.createTextNode(`${text}${addDismissButton ? "\xa0\xa0\xa0" : ""}`));
                if (addDismissButton) {
                    text = document.createElement("text");
                    text.style.textDecoration = "underline";
                    text.href = "javascript:;";
                    text.appendChild(document.createTextNode("Dismiss"));
                    text.addEventListener("click", () => d.remove());
                    d.appendChild(text);
                }
                b.appendChild(d);
                return d;
            } else throw new Error("Invalid menu tab type.");
        };
        // Warn the users to turn their phones into landscape.
        if (global.mobile && window.innerHeight > 1.1 * window.innerWidth) {
            let tabMenu = global.createTabMenu("Please turn your device to landscape mode.", "warning", true);
            window.addEventListener("orientationchange", () => {
                window.innerHeight > 1.1 * window.innerWidth || tabMenu.remove();
            });
        };

        // Game start stuff
        document.getElementById("startButton").onclick = () => startGame();
        document.onkeydown = (e) => {
            if (!(global.gameStart || e.shiftKey || e.ctrlKey || e.altKey)) {
                let key = e.which || e.keyCode;
                if (selectedElement) {
                    if (1 !== e.key.length /*|| /[0-9]/.test(e.key) // this code prevents numbers */ || 3 === e.location) {
                        if (!("Backspace" !== e.key && "Delete" !== e.key)) {
                            setKeybind("", -1);
                        }
                    } else {
                        setKeybind(e.key.toUpperCase(), e.keyCode);
                    }
                } else if (key === global.KEY_ENTER) {
                    startGame();
                }
            }
        };
        window.addEventListener("resize", resizeEvent);
        // Resizing stuff
        resizeEvent();
    };

    // Sliding between options menu.
    function toggleOptionsMenu() {
        let clicked = false,
            a = document.getElementById("startMenuSlidingTrigger"), // Trigger ID
            c = document.getElementById("optionArrow"), // Arrow
            h = document.getElementById("viewOptionText"), // Text (view options)
            u = document.getElementsByClassName("sliderHolder")[0], // Sliding.
            y = document.getElementsByClassName("slider"), // For animations things.
            toggle = () => {
                c.style.transform = c.style.webkitTransform = clicked // Rotate the arrow.
                    ? "translate(2px, -2px) rotate(45deg)"
                    : "rotate(-45deg)";
                h.innerText = clicked ? "close options" : "view options"; // Change the text.
                clicked ? u.classList.add("slided") : u.classList.remove("slided"); // Slide it up.
                y[0].style.opacity = clicked ? 0 : 1; // Fade it away.
                y[2].style.opacity = clicked ? 1 : 0; // same for this.
            };
        a.onclick = () => { // When the button is triggered, This code runs.
            clicked = !clicked;
            toggle();
        };
        return () => {
            clicked || ((clicked = !0), toggle());
        };
    };

    // Tab options
    function tabOptionsMenuSwitcher() {
        let buttonTabs = document.getElementById("optionMenuTabs"),
            tabOptions = [
                document.getElementById("tabAppearance"),
                document.getElementById("tabOptions"),
                document.getElementById("tabControls"),
                document.getElementById("tabAbout"),
            ];
        for (let g = 1; g < tabOptions.length; g++) tabOptions[g].style.display = "none";
        let e = 0;
        for (let g = 0; g < buttonTabs.children.length; g++)
            buttonTabs.children[g].addEventListener("click", () => {
                e !== g &&
                    (buttonTabs.children[e].classList.remove("active"), // Remove the active class
                        buttonTabs.children[g].classList.add("active"), // Add the clicked active class
                        (tabOptions[e].style.display = "none"), // don't display the old menu.
                        (tabOptions[g].style.display = "block"), // Display the menu.
                        (e = g))
            });
    }

    // Important functions
    toggleOptionsMenu();
    tabOptionsMenuSwitcher();

    // Prepare canvas
   function resizeEvent() {
        let scale = window.devicePixelRatio;
        if (config.graphical.lowResolution) {
            scale *= 0.5;
        }
        global.screenWidth = global.vscreenSize = window.innerWidth * scale;
        global.screenHeight = global.vscreenSizey = window.innerHeight * scale;
        c.resize(global.screenWidth, global.screenHeight);
        global.ratio = scale;
        global.screenSize = Math.min(1920, Math.max(window.innerWidth, 1280));
    }

    window.resizeEvent = resizeEvent;
    global.canvas = new Canvas();
    var c = global.canvas.cv;
    var ctx = [
        document.getElementById("gameCanvas-background").getContext("2d"),
        document.getElementById("gameCanvas-gameplay").getContext("2d"),
        document.getElementById("gameCanvas-gui").getContext("2d"),
    ];
    var c2 = document.createElement("canvas");
    var ctx2 = c2.getContext("2d");
    ctx2.imageSmoothingEnabled = false;

    // Animation things
    function Smoothbar(value, speed, sharpness = 3, lerpValue = 0.025, syncWithfps = false) {
        let time = Date.now();
        let display = value;
        let oldvalue = value;
        return {
            set: (val) => {
                if (value !== val) {
                    oldvalue = display;
                    value = val;
                    time = Date.now();
                }
            },
            get: (round = false) => {
                display = util.lerp(display, value, lerpValue, syncWithfps);
                if (Math.abs(value - display) < 0.1 && round) display = value;
                return display;
            },
            force: (val) => {
                display = value = val;
            },
        };
    };

    function AdvancedSmoothBar(a, b, d = 3) {
        let value = a;
        let speed = b;
        let h = d;
        let time = Date.now();
        let display;
        let S = display = a;
        let set = (a) => {
            value !== a &&
                ((S = get()), (value = a), (time = Date.now()));
        };
        let get = () => {
            let a = (Date.now() - time) / 1e3;
            return (display =
                a >= speed ? value : S + (value - S) * Math.pow(a / speed, 1 / h));
        };
        return {
            set: (a) => set(a),
            get: () => get(),
            force: (val) => {
                display = value = val;
            },
        }
    };

    // Prepare the player
    global.player = global.initPlayer();
    function calculateTarget() {
        if (!global.canvas.mouseMoved) return;
        global.target.x = global.mouse.x - (global.player.screenx / global.screenWidth * global.canvas.width + global.canvas.width / 2);
        global.target.y = global.mouse.y - (global.player.screeny / global.screenHeight * global.canvas.height + global.canvas.height / 2);
        if (global.canvas.reverseDirection) global.reverseTank = -1;
        else global.reverseTank = 1;
        global.target.x *= global.screenWidth / global.canvas.width;
        global.target.y *= global.screenHeight / global.canvas.height;
        return global.target;
    };

    let CalcScreenSize = () => Math.max(global.vscreenSize, (16 / 9) * global.vscreenSizey) / global.player.renderv,
        handleScreenDistance = (alpha, instance, fade = true) => {
            let indexes = instance.index.split("-"),
            m = global.mockups[parseInt(indexes[0])] ?? global.missingMockup[0];
            switch (fade) {
                case true: 
                    GetScreenDistance(instance.render.x - global.player.loc.x, instance.render.y - global.player.loc.y, instance.size) ||
                    (alpha *= GetScreenDistanceF(instance.render.x - global.player.loc.x, instance.size));
                    (alpha *= GetScreenDistanceV(instance.render.y - global.player.loc.y, instance.size));
                    break;
                case false:
                    let size = instance.size;
                    size *= m.position.axis;
                    let realSize = size.toFixed(0);
                    alpha *= GetScreenDistance(instance.render.x - global.player.loc.x, instance.render.y - global.player.loc.y, parseInt(realSize));
                    break;
            }
            return alpha;
        },
        GetScreenDistance = (a, b, d) => {
            d += 6;
            let e = 2 * CalcScreenSize();
            return (
                (a + d) * e > -global.vscreenSize &&
                (a - d) * e < global.vscreenSize &&
                (b + d) * e > -global.vscreenSizey &&
                (b - d) * e < global.vscreenSizey
            );
        },
        GetScreenDistanceF = (a, b) => {
            b += 6;
            let d = 2 * CalcScreenSize();
            return Math.max(
                0,
                Math.min(1, 2 + (-a + global.vscreenSize / d) / b, 2 + (a + global.vscreenSize / d) / b)
            );
        },
        GetScreenDistanceV = (a, b) => {
            b += 6;
            let d = 2 * CalcScreenSize();
            return Math.max(
                0,
                Math.min(1, 2 + (a + global.vscreenSizey / d) / b, 2 + (-a + global.vscreenSizey / d) / b)
            );
        };

    function parseTheme(string) {
        // Decode from base64
        try {
            let stripped = string.replace(/\s+/g, '');
            if (stripped.length % 4 == 2)
                stripped += '==';
            else if (stripped.length % 4 == 3)
                stripped += '=';
            let data = atob(stripped);

            let name = 'Unknown Theme',
                author = '';
            let index = data.indexOf('\x00');
            if (index === -1) return null;
            name = data.slice(0, index) || name;
            data = data.slice(index + 1);
            index = data.indexOf('\x00');
            if (index === -1) return null;
            author = data.slice(0, index) || author;
            data = data.slice(index + 1);
            let border = data.charCodeAt(0) / 0xff;
            data = data.slice(1);
            let paletteSize = Math.floor(data.length / 3);
            if (paletteSize < 2) return null;
            let colorArray = [];
            for (let i = 0; i < paletteSize; i++) {
                let red = data.charCodeAt(i * 3)
                let green = data.charCodeAt(i * 3 + 1)
                let blue = data.charCodeAt(i * 3 + 2)
                let color = (red << 16) | (green << 8) | blue
                colorArray.push('#' + color.toString(16).padStart(6, '0'))
            }
            let content = {
                teal: colorArray[0],
                lgreen: colorArray[1],
                orange: colorArray[2],
                yellow: colorArray[3],
                aqua: colorArray[4],
                pink: colorArray[5],
                vlgrey: colorArray[6],
                lgrey: colorArray[7],
                guiwhite: colorArray[8],
                black: colorArray[9],

                blue: colorArray[10],
                green: colorArray[11],
                red: colorArray[12],
                gold: colorArray[13],
                purple: colorArray[14],
                magenta: colorArray[15],
                grey: colorArray[16],
                dgrey: colorArray[17],
                white: colorArray[18],
                guiblack: colorArray[19],

                paletteSize,
                border,
            }
            return { name, author, content };
        } catch (e) { }

        // Decode from JSON
        try {
            let output = JSON.parse(string);
            if (typeof output !== 'object')
                return null;
            let { name = 'Unknown Theme', author = '', content } = output;

            for (let colorHex of [
                content.teal,
                content.lgreen,
                content.orange,
                content.yellow,
                content.aqua,
                content.pink,
                content.vlgrey,
                content.lgrey,
                content.guiwhite,
                content.black,

                content.blue,
                content.green,
                content.red,
                content.gold,
                content.purple,
                content.magenta,
                content.grey,
                content.dgrey,
                content.white,
                content.guiblack,
            ]) {
                if (!/^#[0-9a-fA-F]{6}$/.test(colorHex)) return null;
            }

            return {
                name: (typeof name === 'string' && name) || 'Unknown Theme',
                author: (typeof author === 'string' && author) || '',
                content,
            }
        } catch (e) { }

        return null;
    }
    function initalizeChangelog(b, a) { // From CX Client (Modified) + decoded;
        var sa = document.getElementById("patchNotes");
        var c = b.shift();
        if (c) {
            c = c.match(/^([A-Za-z ]+[A-Za-z])\s*\[([0-9\-]+)\]\s*(.+)?$/) || [c, c, null];
            var h = c[1] ? {
                    Update: "update",
                    Feature: "update",
                    Event: "event",
                    Gamemode: "event",
                    "Balance Update": "balance-update",
                    "Balance Update Details": "balance",
                    Balance: "balance",
                    Patch: "patch"
                } [c[1]] : null,
                d = document.createElement("div");
            h && d.classList.add(h);
            var y = document.createElement("b"),
                f = [c[1]];
            if (c[2]) {
                var e = new Date(c[2] + "T00:00:00Z");
                if (e > Date.now()) return;
                f.push(e.toLocaleDateString("default", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC"
                }))
            }
            c[3] && f.push(c[3]);
            y.innerHTML = f.join(" - ");
            d.appendChild(y);
            let g = document.createElement("ul");
            let l;
            for (let n of b) l = document.createElement("li"), l.innerHTML = n, g.appendChild(l);
            l = g.getElementsByTagName("a");
            for (b = 0; b < l.length; b++) {
                let n = l[b];
                if (!n.href) continue;
                let a = n.href.lastIndexOf("#"); - 1 !== a && (a = n.href.slice(a + 1), "options-menu" === a ? l[b].onclick = function(b) {
                    b.preventDefault();
                    bb()
                } : Ja[a] &&
                (l[b].onclick = function(b) {
                    b.preventDefault();
                    Ja[a]()
                }))
            }
            d.appendChild(g)
            a && d.appendChild(document.createElement("hr"));
            sa.appendChild(d)
        }
    }
    function loadSettings() {
        config.graphical.fancyAnimations = document.getElementById("optFancy").checked;
        config.graphical.predictAnimations = document.getElementById("optPredictAnim").checked;
        config.graphical.lerpAnimations = document.getElementById("optLerpAnim").checked;
        config.graphical.smoothcamera = document.getElementById("smoothCamera").checked;
        config.graphical.pointy = document.getElementById("optPointy").checked;
        config.game.autoLevelUp = document.getElementById("autoLevelUp").checked;
        config.lag.unresponsive = document.getElementById("optPredictive").checked;
        config.graphical.sharpEdges = document.getElementById("optSharpEdges").checked;
        config.graphical.coloredHealthbars = document.getElementById("coloredHealthbars").checked;
        config.graphical.seperatedHealthbars = document.getElementById("seperatedHealthbars").checked;
        config.graphical.lowResolution = document.getElementById("optLowResolution").checked;
        config.graphical.showGrid = !document.getElementById("optNoGrid").checked;
        config.graphical.slowerFOV = document.getElementById("optSlowerFOV").checked;
        // GUI
        global.GUIStatus.renderGUI = document.getElementById("optRenderGui").checked;
        global.GUIStatus.renderLeaderboard = document.getElementById("optRenderLeaderboard").checked;
        global.GUIStatus.renderPlayerNames = document.getElementById("optRenderNames").checked;
        global.GUIStatus.renderPlayerScores = document.getElementById("optRenderScores").checked;
        global.GUIStatus.renderPlayerKillbar = document.getElementById("optRenderKillbar").checked;
        global.GUIStatus.renderhealth = document.getElementById("optRenderHealth").checked;
        global.GUIStatus.minimapReducedInfo = document.getElementById("optReducedInfo").checked;
        global.GUIStatus.fullHDMode = document.getElementById("optFullHD").checked;
        global.mobileStatus.enableCrosshair = document.getElementById("showCrosshair").checked;
        global.mobileStatus.showJoysticks = document.getElementById("showJoystick").checked;
    }

    function startGame() {
        // Set flag
        if (global.gameLoading) return;
        global.gameLoading = true;
        if (global.mobile) {
            var d = document.body;
            d.requestFullscreen ? d.requestFullscreen()
                : d.msRequestFullscreen ? d.msRequestFullscreen()
                    : d.mozRequestFullScreen ? d.mozRequestFullScreen()
                        : d.webkitRequestFullscreen && d.webkitRequestFullscreen();
        }

        // Save forms and get options
        util.submitToLocalStorage("optFancy");
        util.submitToLocalStorage("optLowResolution");
        util.submitToLocalStorage("smoothCamera");
        util.submitToLocalStorage("optBorders");
        util.submitToLocalStorage("optPointy");
        util.submitToLocalStorage("optPredictAnim");
        util.submitToLocalStorage("optLerpAnim");
        util.submitToLocalStorage("autoLevelUp");
        util.submitToLocalStorage("optMobile");
        util.submitToLocalStorage("optPredictive");
        util.submitToLocalStorage("optSharpEdges");
        util.submitToLocalStorage("optSlowerFOV");
        util.submitToLocalStorage("optRenderKillbar");
        util.submitToLocalStorage("coloredHealthbars");
        util.submitToLocalStorage("seperatedHealthbars");
        util.submitToLocalStorage("optNoGrid");
        // GUI
        util.submitToLocalStorage("optRenderGui");
        util.submitToLocalStorage("optRenderLeaderboard");
        util.submitToLocalStorage("optRenderNames");
        util.submitToLocalStorage("optRenderHealth");
        util.submitToLocalStorage("optRenderScores");
        util.submitToLocalStorage("optReducedInfo");
        util.submitToLocalStorage("showCrosshair");
        util.submitToLocalStorage("showJoystick");
        util.submitToLocalStorage("optFullHD");
        loadSettings();
        switch (document.getElementById("optMobile").value) {
            case "desktop":
                global.mobile = false;
                break;
            case "mobileWithBigJoysticks":
                global.mobileStatus.useBigJoysticks = true;
                break;
        }
        util.submitToLocalStorage("optColors");
        let a = document.getElementById("optColors").value;
        color = colors[a === "" ? "normal" : a];
        if (a == "custom") {
            let customTheme = document.getElementById("optCustom").value;
            color = parseTheme(customTheme).content;
            util.submitToLocalStorage("optCustom");
        }
        gameDraw.color = color;
        gameDraw.colorCache = {};
        global.refreshMonitorColoring(gameDraw);
        // Other more important stuff
        let playerNameInput = document.getElementById("playerNameInput");
        let playerKeyInput = document.getElementById("playerKeyInput");
        let autolevelUpInput = document.getElementById("autoLevelUp").checked;
        global.autolvlUp = autolevelUpInput;
        // Name and keys
        util.submitToLocalStorage("playerNameInput");
        util.submitToLocalStorage("playerKeyInput");
        global.playerName = global.player.name = playerNameInput.value;
        global.playerKey = playerKeyInput.value.replace(/(<([^>]+)>)/gi, "").substring(0, 64);
        // Change the screen
        global.screenWidth = window.innerWidth;
        global.screenHeight = window.innerHeight;
        document.getElementById("startMenuWrapper").style.top = "-700px";
        setTimeout(() => {
            document.getElementById("startMenuWrapper").style.display = "none";
        }, 1e3);

        global.gameConnecting = true;
        // Connect to the server.
        global.socket = socketInit();
        // initialize canvas.
        global.canvas.socket = global.socket;
        global.socketMotionCycle = setInterval(() => moveCompensation.iterate(global.socket.cmd.getMotion()), 1e3 / 40);
        if (!global.playerTotalInterval) global.playerTotalInterval = setInterval(() => util.pullTotalPlayers(), 20000);
        if (!global.canvas.initalized) global.canvas.init();
        document.getElementById("gameAreaWrapper").style.display = "block";
        document.getElementById("gameCanvas").focus();
        window.onbeforeunload = () => (global.gameStart && !global.died && !global.disconnected ? !0 : null);
        // Start client if it didn't start yet
        !global.clientStarted && startClient();
        // Load graphics
        loadGraphics();
    }
    global.startGame = () => startGame();
    function startClient() {
        let a = document.getElementById("optColors").value;
        color = colors[a === "" ? "normal" : a];
        if (a == "custom") {
            let customTheme = document.getElementById("optCustom").value;
            color = parseTheme(customTheme).content;
            util.submitToLocalStorage("optCustom");
        }
        gameDraw.color = color;
        animloop(); // Start the client
        global.clientStarted = true; // Set flag
    }

    // Start animation
    window.requestAnimFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame || (callback => setTimeout(callback, 1000 / 60));
    window.cancelAnimFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;
    // Drawing states
    const statMenu = Smoothbar(0, 2, 0.1, 0.08, 0.025, true);
    const upgradeMenu = Smoothbar(0, 2, 3, 0.08, 0.025, true);
    const mobileUpgradeGlide = Smoothbar(0, 2, 3, 0.08, 0.025, true);
    const lbGlide = AdvancedSmoothBar(0, 0.3, 1.5);
    const chatInput = AdvancedSmoothBar(0, 0.3, 1.3);
    util.fovAnimation = util.AdvancedSmoothBar(0, 0.2, 1.5);

    // Define the graph constructor
    function graph() {
        var data = [];
        return (point, x, y, w, h, col) => {
            // Add point and push off old ones
            data.push(point);
            while (data.length > w) {
                data.splice(0, 1);
            }
            // Get scale
            let min = Math.min(...data),
                max = Math.max(...data),
                range = max - min;
            // Draw zero
            if (max > 0 && min < 0) {
                drawBar(x, x + w, y + (h * max) / range, 2, color.guiwhite);
            }
            // Draw points
            ctx[2].beginPath();
            let i = -1;
            for (let p of data) {
                if (!++i) {
                    ctx[2].moveTo(x, y + (h * (max - p)) / range);
                } else {
                    ctx[2].lineTo(x + i, y + (h * (max - p)) / range);
                }
            }
            ctx[2].lineWidth = 1;
            ctx[2].strokeStyle = col;
            ctx[2].stroke();
        };
    }

    // Protected functions
    function interpolate(p1, p2, v1, v2, ts, tt) {
        let k = Math.cos((1 + tt) * Math.PI);
        return 0.5 * (((1 + tt) * v1 + p1) * (k + 1) + (-tt * v2 + p2) * (1 - k));
    }

    function extrapolate(p1, p2, v1, v2, ts, tt) {
        return p2 + (p2 - p1) * tt;
    }

    // Useful thing
    let modulo = function (a, n) {
        return ((a % n) + n) % n;
    };
    function angleDifference(sourceA, targetA) {
        let a = targetA - sourceA;
        return modulo(a + Math.PI, 2 * Math.PI) - Math.PI;
    }

    // Lag compensation functions
    const compensation = () => {
        // Protected vars
        let t = 0,
            tt = 0,
            ts = 0;
        // Methods
        return {
            set: (
                time = global.player.time,
                interval = global.metrics.rendergap
            ) => {
                t = Math.max(getNow() - time - 80, -interval);
                if (t > 150 && t < 1000) {
                    t = 150;
                }
                if (t > 1000) {
                    t = (1000 * 1000 * Math.sin(t / 1000 - 1)) / t + 1000;
                }
                tt = t / interval;
                ts = 30 * config.roomSpeed * t / 1E3;
            },
            predict: (p1, p2, v1, v2) => {
                return t >= 0
                    ? extrapolate(p1, p2, v1, v2, ts, tt)
                    : interpolate(p1, p2, v1, v2, ts, tt);
            },
            predictFacing: (f1, f2) => {
                return f1 + (1 + tt) * angleDifference(f1, f2);
            },
            getPrediction: () => {
                return t;
            },
        };
    };

    // Make graphs
    const timingGraph = graph(),
        lagGraph = graph(),
        gapGraph = graph();

    // The skill bar dividers
    let skas = [];
    for (let i = 1; i <= 256; i++) { //if you want to have more skill levels than 255, then update this
        skas.push((i - 2) * 0.01 + Math.log(4 * (i / 9) + 1) / 1.6);
    }
    const ska = (x) => skas[x];
    var getClassUpgradeKey = function (number) {
        switch (number) {
            case 0:
                return "Y";
            case 1:
                return "U";
            case 2:
                return "I";
            case 3:
                return "H";
            case 4:
                return "J";
            case 5:
                return "K";
            default:
                return null;
        }
    };

    let tiles,
        branches,
        tankTree,
        measureSize = (x, y, colorIndex, { index, tier = 0 }) => {
            tiles.push({ x, y, colorIndex, index });
            let { upgrades } = global.mockups[parseInt(index)],
                xStart = x,
                cumulativeWidth = 1,
                maxHeight = 1,
                hasUpgrades = [],
                noUpgrades = [];
            for (let i = 0; i < upgrades.length; i++) {
                let upgrade = upgrades[i];
                if (global.mockups[upgrade.index].upgrades.length) {
                    hasUpgrades.push(upgrade);
                } else {
                    noUpgrades.push(upgrade);
                }
            }
            for (let i = 0; i < hasUpgrades.length; i++) {
                let upgrade = hasUpgrades[i],
                    spacing = 2 * Math.max(1, upgrade.tier - tier),
                    measure = measureSize(x, y + spacing, upgrade.upgradeColor ?? i, upgrade);
                branches.push([{ x, y: y + Math.sign(i) }, { x, y: y + spacing + 1 }]);
                if (i === hasUpgrades.length - 1 && !noUpgrades.length) {
                    branches.push([{ x: xStart, y: y + 1 }, { x, y: y + 1 }]);
                }
                x += measure.width;
                cumulativeWidth += measure.width;
                if (maxHeight < measure.height) maxHeight = measure.height;
            }
            y++;
            for (let i = 0; i < noUpgrades.length; i++) {
                let upgrade = noUpgrades[i],
                    height = 2 + upgrades.length;
                measureSize(x, y + 1 + i + Math.sign(hasUpgrades.length) * 2, upgrade.upgradeColor ?? i, upgrade);
                if (i === noUpgrades.length - 1) {
                    if (hasUpgrades.length > 1) cumulativeWidth++;
                    branches.push([{ x: xStart, y }, { x, y }]);
                    branches.push([{ x, y }, { x, y: y + noUpgrades.length + Math.sign(hasUpgrades.length) * 2 }]);
                }
                if (maxHeight < height) maxHeight = height;
            }
            return {
                width: cumulativeWidth,
                height: 2 + maxHeight,
            };
        };

    function generateTankTree(indexes) {
        tiles = [];
        branches = [];
        tankTree = { width: 0, height: 0 };
        let rightmostSoFar = 0;
        if (!Array.isArray(indexes)) indexes = [indexes];
        for (let index of indexes) {
            rightmostSoFar += 3 + measureSize(rightmostSoFar, 0, 0, { index }).width;
        }
        for (let { x, y } of tiles) {
            tankTree.width = Math.max(tankTree.width, x);
            tankTree.height = Math.max(tankTree.height, y);
        }
    };

    // Background clearing
    function clearScreen(clearColor, alpha, context) {
        context.fillStyle = clearColor;
        context.globalAlpha = alpha;
        context.fillRect(0, 0, global.screenWidth, global.screenHeight);
        context.globalAlpha = 1;
    }

    // Text functions
    const fontWidth = "bold";
    const measureText = (text, fontSize, twod = false) => {
        fontSize += config.graphical.fontSizeBoost;
        ctx[2].font = fontWidth + " " + fontSize + "px Ubuntu";
        return twod ? { width: ctx[2].measureText(text).width, height: fontSize } : ctx[2].measureText(text).width;
    };

    // Init stuff
    function arrayifyText(rawText) {
        //we want people to be able to use the section sign in writing too
        // string with double §           txt   col   txt                      txt
        // "...§text§§text§..." => [..., "text", "", "text", ...] => [..., "text§text", ...]
        // this code is balanced on tight threads, holy shit
        let textArrayRaw = rawText.split('§'),
            textArray = [];
        if (!(textArrayRaw.length & 1)) {
            textArrayRaw.unshift('');
        }
        while (textArrayRaw.length) {
            let first = textArrayRaw.shift();
            if (!textArrayRaw.length) {
                textArray.push(first);
            } else if (textArrayRaw[1]) {
                textArray.push(first, textArrayRaw.shift());
            } else {
                textArrayRaw.shift();
                textArray.push(first + '§' + textArrayRaw.shift(), textArrayRaw.shift());
            }
        }
        return textArray;
    }

    function drawText(rawText, x, y, size, defaultFillStyle, align = "left", center = false, fade = 1, stroke = true, context = ctx[2], radial = false) {
        size += config.graphical.fontSizeBoost;
        // Get text dimensions and resize/reset the canvas
        let offset = size / 5,
            ratio = 1,
            textArray = arrayifyText(rawText),
            renderedFullText = textArray.reduce((a, b, i) => (i & 1) ? a : a + b, '');

        if (context.getTransform) {
            ratio = context.getTransform().d;
            offset *= ratio;
        }
        if (ratio !== 1) {
            size *= ratio;
        }
        context.font = "bold " + size + "px Ubuntu";

        let Xoffset = offset,
            Yoffset = (size + 2 * offset) / 2,
            alignMultiplier = 0;

        switch (align) {
            //case "left":
            //    //do nothing.
            //    break;
            case "center":
                alignMultiplier = 0.5;
                break;
            case "right":
                alignMultiplier = 1;
        }
        if (alignMultiplier) {
            Xoffset -= context.measureText(renderedFullText).width * alignMultiplier;
        }

        // Draw it
        context.lineWidth = (size + 1) / config.graphical.fontStrokeRatio;
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.strokeStyle = color.black;
        context.fillStyle = defaultFillStyle;
        context.save();
        radial && context.translate(global.screenWidth / 2, global.screenHeight / 2);
        radial && context.rotate(Math.atan2(-global.player.renderx, -global.player.rendery));
        radial && context.translate(global.screenWidth / -2, global.screenHeight / -2);
        context.lineCap = config.graphical.miterText ? "miter" : "round";
        context.lineJoin = config.graphical.miterText ? "miter" : "round";
        if (ratio !== 1) {
            context.scale(1 / ratio, 1 / ratio);
        }

        Xoffset += x * ratio - size / 4; //this extra size-dependant margin is a guess lol // apparently this guess worked out to be a hella good one
        Yoffset += y * ratio - Yoffset * (center ? 1.05 : 1.5);
        if (stroke) {
            context.strokeText(renderedFullText, Xoffset, Yoffset);
        }
        for (let i = 0; i < textArray.length; i++) {
            let str = textArray[i];

            // odd index = this is a color to set the fill style to
            if (i & 1) {

                //reset color to default
                if (str === "reset") {
                    context.fillStyle = defaultFillStyle;
                } else {
                    str = gameDraw.getColor(str) ?? str;
                }
                context.fillStyle = str;

            } else {
                // move forward a bit taking the width of the last piece of text + "kerning" between
                // the last letter of last text and the first letter of current text,
                // making it align perfectly with what we drew with strokeText earlier
                if (i) {
                    Xoffset += ctx[2].measureText(textArray[i - 2] + str).width - ctx[2].measureText(str).width;
                }
                context.fillText(str, Xoffset, Yoffset);
            }
        }
        context.restore();
    }

    // Gui drawing functions
    function scaleScreenRatio(by, unset) {
        global.screenWidth /= by;
        global.screenHeight /= by;
        ctx[0].scale(by, by);
        ctx[1].scale(by, by);
        ctx[2].scale(by, by);
        if (!unset) ratio *= by;
    };

    function drawGuiRect(x, y, length, height, stroke = false) {
        switch (stroke) {
            case true:
                ctx[2].strokeRect(x, y, length, height);
                break;
            case false:
                ctx[2].fillRect(x, y, length, height);
                break;
        }
    }

    function drawGuiCircle(x, y, radius, stroke = false) {
        ctx[2].beginPath();
        ctx[2].arc(x, y, radius, 0, Math.PI * 2);
        stroke ? ctx[2].stroke() : ctx[2].fill();
    }

    function drawGuiLine(x1, y1, x2, y2) {
        ctx[2].beginPath();
        ctx[2].lineTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
        ctx[2].lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
        ctx[2].closePath();
        ctx[2].stroke();
    }

    function drawBar(x1, x2, y, width, color, context = ctx[2]) {
        context.beginPath();
        context.lineTo(x1, y);
        context.lineTo(x2, y);
        context.lineWidth = width;
        if (color) context.strokeStyle = color;
        if (!config.graphical.sharpEdges) context.closePath();
        context.stroke();
    }

    function drawBarStroke(x1, y, width, color, h2, context = ctx[2]) {
        context.lineWidth = 2.5;
        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(x1, y);
        context.lineTo(x1 + width, y);
        context.arc(x1 + width, y + h2 / 2, h2 / 2, -Math.PI / 2, Math.PI / 2);
        context.lineTo(x1, y + h2);
        context.arc(x1, y + h2 / 2, h2 / 2, Math.PI / 2, -Math.PI / 2);
        context.stroke();
    }

    function drawBarAdvanced(x1, x2, y, width, color, h2, context = ctx[2]) {
        context.beginPath();
        context.roundRect(x1 - width / 2, y - width / 2, x2 - x1 + width, h2 + width, [width / 2]);
        context.fillStyle = color;
        context.fill();
    }

    function drawButton(x, y, width, height, alpha, type = "rect", text, textSize, color1, color2, color3, clickable = false, clickType, clickableRatio, index) {
        // If width is set to true, that means we want to calculate it on the text's length.
        if (width == true) width = measureText(text, height);
        // Set the clickable's position
        if (clickable) global.clickables[clickType].place(index, (x - width / 2) * clickableRatio, y * clickableRatio, width * clickableRatio, height * clickableRatio);
        let hover = false;
        if (clickable) hover = global.clickables[clickType].check({ x: global.mouse.x, y: global.mouse.y });
        // Draw boxes
        ctx[2].globalAlpha = 0.5 * alpha;
        ctx[2].fillStyle = color1 ? color1 : color.grey;
        if (type == "rect") drawGuiRect(x - width / 2, y, width, height);
        else if (type == "bar") drawBar(x - width / 2, x + width / 2, y + height / 2, height, color1 ? color1 : color.grey);
        ctx[2].globalAlpha = 0.1 * alpha;
        // Shaders
        if (clickable && hover == index) {
            if (global.clickables.clicked) {
                ctx[2].globalAlpha = 0.2 * alpha;
                ctx[2].fillStyle = color.black;
            } else {
                ctx[2].globalAlpha = 0.15 * alpha;
                ctx[2].fillStyle = color.guiwhite;
            }
            if (type == "rect") drawGuiRect(x - width / 2, y, width, height);
            else if (type == "bar") drawBar(x - width / 2, x + width / 2, y + height / 2, height, false)
            
        }
        ctx[2].fillStyle = color2 ? color2 : color.black;
        if (type == "rect") drawGuiRect(x - width / 2, y + height * 0.6, width, height * 0.4);
        else if (type == "bar") drawBar(x - width / 1.9, x + width / 1.9, y + height * 0.7, height * 0.6, color2 ? color2 : color.black);
        ctx[2].globalAlpha = 1 * alpha;
        ctx[2].fillStyle = color.guiwhite;
        ctx[2].strokeStyle = color.black;

        // Draw text
        if (text) drawText(text, x, y + height * 0.5, textSize ? textSize : height * 0.6, color.guiwhite, "center", true);

        // Draw the borders
        ctx[2].strokeStyle = color3 ? color3 : color.black;
        ctx[2].lineWidth = 3;
        if (type == "rect") drawGuiRect(x - width / 2, y, width, height, true);
        else if (type == "bar") drawBarStroke(x - width / 2, y, width, color3 ? color3 : color.black, height);
    }
    /* NOTE: WebGL will be included in the next beta release of osa */
    // Entity drawing (this is a function that makes a function)
    const drawEntityCanvas2D = (() => {
        let drawPolyImgs = [],
        // Draw body function, (AKA: drawPoly)
        drawBody = (context, centerX, centerY, radius, sides, angle = 0, borderless, fill, imageInterpolation) => {
            try {
                // Start drawing
                context.beginPath();
                if (sides instanceof Array) {
                    let dx = Math.cos(angle);
                    let dy = Math.sin(angle);
                    for (let [x, y] of sides)
                        context.lineTo(
                            centerX + radius * (x * dx - y * dy),
                            centerY + radius * (y * dx + x * dy)
                        );
                } else {
                    if ("string" === typeof sides) {
                        if (sides.startsWith('image=')) {
                            const defaultDirectory = sides.startsWith("image=/");
                            const clientRootDirectory = sides.startsWith("image=./");
                            const onlineDirectory = sides.startsWith("image=https");
                            drawPolyImgs[sides] = new Image();
                            drawPolyImgs[sides].src = 
                            defaultDirectory ? 
                            `imgs${sides.slice(6)}` : 
                            clientRootDirectory || onlineDirectory ?
                            `${onlineDirectory ? sides.slice(6) : sides.slice(7)}` : 
                            "imgs/unknownNotFound.png";
                            drawPolyImgs[sides].onerror = function() {
                                drawPolyImgs[sides].src = "imgs/unknownNotFound.png";
                            }
        
                            let img = drawPolyImgs[sides];
                            context.translate(centerX, centerY);
                            context.rotate(angle);
                            context.imageSmoothingEnabled = imageInterpolation;
                            const imageSize = radius / 1.09;
                            context.drawImage(img, -imageSize, -imageSize, imageSize * 2, imageSize * 2);
                            context.imageSmoothingEnabled = true;
                            context.rotate(-angle);
                            context.translate(-centerX, -centerY);
                            return;
                        }
                        let path = new Path2D(sides);
                        context.save();
                        context.translate(centerX, centerY);
                        context.scale(radius, radius);
                        context.lineWidth /= radius;
                        context.rotate(angle);
                        context.lineWidth *= fill ? 1 : 0.5; // Maintain constant border width
                        if (!borderless) context.stroke(path);
                        if (fill) context.fill(path);
                        context.restore();
                        return;
                    }
                    angle += sides % 2 ? 0 : Math.PI / sides;
                }
                if (!sides) {
                    // Circle
                    let fillcolor = context.fillStyle;
                    let strokecolor = context.strokeStyle;
                    context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                    context.fillStyle = strokecolor;
                    context.lineWidth *= fill ? 1 : 0.5; // Maintain constant border width
                    if (!borderless) context.stroke();
                    context.closePath();
                    context.beginPath();
                    context.fillStyle = fillcolor;
                    context.arc(centerX, centerY, radius * fill, 0, 2 * Math.PI);
                    if (fill) context.fill();
                    context.closePath();
                    return;
                } else if (0 > sides) {
                    // Star
                    if (config.graphical.pointy) context.lineJoin = "miter";
                    sides = -sides;
                    angle += (sides % 1) * Math.PI * 2;
                    sides = Math.floor(sides);
                    let dip = 1 - 6 / (sides ** 2);
                    context.moveTo(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
                    context.lineWidth *= fill ? 1 : 0.5; // Maintain constant border width
                    for (let i = 0; i < sides; i++) {
                        let htheta = ((i + 0.5) / sides) * 2 * Math.PI + angle,
                            theta = ((i + 1) / sides) * 2 * Math.PI + angle,
                            cx = centerX + radius * dip * Math.cos(htheta),
                            cy = centerY + radius * dip * Math.sin(htheta),
                            px = centerX + radius * Math.cos(theta),
                            py = centerY + radius * Math.sin(theta);
                        if (config.graphical.curvyTraps) {
                            context.quadraticCurveTo(cx, cy, px, py);
                        } else {
                            context.lineTo(cx, cy);
                            context.lineTo(px, py);
                        }
                    }
                } else if (0 < sides) {
                    // Polygon
                    angle += (sides % 1) * Math.PI * 2;
                    sides = Math.floor(sides);
                    context.lineWidth *= fill ? 1 : 0.5; // Maintain constant border width
                    for (let i = 0; i < sides; i++) {
                        let theta = (i / sides) * 2 * Math.PI + angle;
                        context.lineTo(centerX + radius * Math.cos(theta), centerY + radius * Math.sin(theta));
                    }
                }
                context.closePath();
                if (!borderless) context.stroke();
                if (fill) context.fill();
                context.lineJoin = "round";
            } catch (e) { // this actually prevents to panic the client. so we will just call "resizeEvent()".
                resizeEvent();
                console.error("Uh oh, 'CanvasRenderingContext2D' has gotton an error! Error: " + e);
            }
        },
        // Draw gun function, (AKA: drawTrapezoid)
        drawGun = (context, x, y, length, height, aspect, angle, borderless, fill, alpha, strokeWidth, position) => {
            let h = [];
            h = aspect > 0 ? [height * aspect, height] : [height, -height * aspect];
    
            // Construct a trapezoid at angle 0
            let points = [],
                sinT = Math.sin(angle),
                cosT = Math.cos(angle);
            points.push([-position, h[1]]);
            points.push([length * 2 - position, h[0]]);
            points.push([length * 2 - position, -h[0]]);
            points.push([-position, -h[1]]);
            context.globalAlpha = alpha;
    
            // Rotate it to the new angle via vector rotation
            context.beginPath();
            for (let point of points) {
                let newX = point[0] * cosT - point[1] * sinT + x,
                    newY = point[0] * sinT + point[1] * cosT + y;
                context.lineTo(newX, newY);
            }
            context.closePath();
            context.lineWidth *= strokeWidth
            context.lineWidth *= fill ? 1 : 0.5; // Maintain constant border width
            if (!borderless) context.stroke();
            context.lineWidth /= fill ? 1 : 0.5; // Maintain constant border width
            if (fill) context.fill();
            context.globalAlpha = 1;
        };
        // The actual drawEntity function
        return (baseColor, x, y, instance, ratio, alpha = 1, scale = 1, lineWidthMult = 1, rot = 0, turretsObeyRot = false, assignedContext = false, turretInfo = false, render = instance.render, smoothsize = false) => {
            // --- Fast early exit for invisible objects ---
            const fade = turretInfo ? 1 : render.status.getFade();
            if (fade === 0 || alpha === 0) return;
            
            const alphaFade = fade * alpha;
            if (!global.gameUpdate && alphaFade < 0.5) return;
        
            // --- Context setup with minimal state changes ---
            let context = assignedContext || ctx[1];
            const indexStr = instance.index;
            const indexes = indexStr.split("-");
            const mockupIndex = +indexes[0];
            const m = global.mockups[mockupIndex] || global.missingMockup[0];
            const source = turretInfo === false ? instance : turretInfo;
            
            // --- Size calculations with cached values ---
            const instSize = instance.size;
            let drawSize = smoothsize ? scale * ratio * smoothsize : scale * ratio * instSize;
            
            if (global.gameUpdate && fade !== 1) {
                drawSize *= config.graphical.fancyAnimations ? 
                    (1 + 0.5 * (1 - fade)) : 
                    (1 - 1.6 * (1 - fade));
                    
                if (drawSize < 0) drawSize = scale * ratio * instSize;
            }
            
            // --- Early optimization for small or distant objects ---
            if (drawSize < 0.1) return;
        
            // --- Gun positions with single update ---
            source.guns.update();
        
            // --- Fancy canvas with reduced state setup ---
            let xx = x, yy = y;
            const useFancyCanvas = global.gameUpdate && 
                                  config.graphical.fancyAnimations &&
                                  assignedContext != ctx2 && 
                                  alphaFade < 1;
        
            if (useFancyCanvas) {
                context = ctx2;
                context.canvas.width = context.canvas.height = drawSize * m.position.axis + ratio * 20 * m.position.axis;
                xx = context.canvas.width / 2 - (drawSize * m.position.axis * m.position.middle.x * Math.cos(rot)) / 4;
                yy = context.canvas.height / 2 - (drawSize * m.position.axis * m.position.middle.x * Math.sin(rot)) / 4;
                context.translate(0.5, 0.5);
            } else if (alphaFade < 0.5) {
                return;
            }
        
            // --- Batch context property settings ---
            const sharp = config.graphical.sharpEdges;
            const minBorder = config.graphical.mininumBorderChunk;
            const borderChunk = config.graphical.borderChunk;
            const initStrokeWidth = lineWidthMult * Math.max(minBorder, ratio * borderChunk);
            
            context.lineCap = sharp ? "miter" : "round";
            context.lineJoin = sharp ? "miter" : "round";
            context.lineWidth = initStrokeWidth;
        
            // --- Size ratio cached for body drawing ---
            const sizeRatio = (drawSize / m.size) * m.realSize;
        
            // --- Find upper turrets and props with optimized loop ---
            const turrets = instance.isImage ? source.turrets : [...source.turrets, ...m.props];
            if (m.props) turrets.sort((a, b) => a.layer - b.layer);
        
            // --- Draw turrets beneath with cached values ---
            for (let i = 0; i < turrets.length; i++) {
                let t = turrets[i];
                if (t.isProp) t = util.requestEntityImage(t);
                // Cache facing calculation
                if (t.lerpedFacing === undefined) {
                    t.lerpedFacing = t.facing;
                } else {
                    t.lerpedFacing = util.lerpAngle(t.lerpedFacing, t.facing, 0.1, true);
                }
                t.invuln = instance.invuln;
                if (!t.layer) {
                    const ang = t.direction + t.angle + rot;
                    const len = t.offset * drawSize;
                    const facing = (t.mirrorMasterAngle || turretsObeyRot) ? rot + t.angle : t.lerpedFacing;
                    const cosAng = Math.cos(ang);
                    const sinAng = Math.sin(ang);
                    
                    context.lineWidth = initStrokeWidth * t.strokeWidth;
                    
                    drawEntityCanvas2D(
                        baseColor,
                        xx + len * cosAng,
                        yy + len * sinAng,
                        t,
                        ratio,
                        1,
                        (drawSize / ratio / t.size) * t.sizeFactor,
                        lineWidthMult,
                        facing,
                        turretsObeyRot,
                        context,
                        t,
                        render
                    );
                }
            }
        
            // --- Gun positions/config with minimal property access ---
            const positions = source.guns.getPositions();
            const gunConfig = source.guns.getConfig();
            const statusColor = render.status.getColor();
            const blend = render.status.getBlend();
            
            const sourceGuns = source.guns;
            const gunLength = sourceGuns.length;
            
            for (let drawAbove = 0; drawAbove < 2; ++drawAbove) {
                // Draw guns for current layer
                for (let i = 0; i < gunLength; ++i) {
                    const g = gunConfig[i];
                    
                    // Skip guns not in current drawing pass
                    if ((drawAbove === 0 && g.drawAbove) || (drawAbove === 1 && !g.drawAbove)) {
                        continue;
                    }
                    
                    context.lineWidth = initStrokeWidth;
                    
                    // Cache angle calculations
                    const gAngle = g.angle + rot;
                    const gunAngle = g.direction + gAngle;
                    const cosGunAngle = Math.cos(gunAngle);
                    const sinGunAngle = Math.sin(gunAngle);
                    
                    const gx = g.offset * cosGunAngle;
                    const gy = g.offset * sinGunAngle;
                    
                    // Minimize color calculations
                    let gunColor = g.color == null ? color.grey : gameDraw.modifyColor(g.color, baseColor);
                    const gunAlpha = g.alpha === undefined ? 1 : g.alpha;
                    let mixedColor = gameDraw.mixColors(gunColor, statusColor, blend);
                    instance.invuln !== 0 && 100 > (Date.now() - instance.invuln) % 200 && ((mixedColor = gameDraw.mixColors(gunColor, gameDraw.getColor(6), 0.3)));
                    gameDraw.setColor(context, mixedColor);
                    
                    // Draw gun with precalculated values
                    drawGun(
                        context,
                        xx + drawSize * gx,
                        yy + drawSize * gy,
                        drawSize * g.length / 2,
                        drawSize * g.width / 2,
                        g.aspect,
                        gAngle,
                        g.borderless,
                        g.drawFill,
                        gunAlpha,
                        g.strokeWidth,
                        drawSize * positions[i]
                    );
                }
        
                // Draw body between gun layers
                if (drawAbove === 0) {
                    context.globalAlpha = 1;
                    context.lineWidth = initStrokeWidth * m.strokeWidth;
                    
                    // Precalculate body color
                    let bodyColor = gameDraw.mixColors(
                        gameDraw.modifyColor(instance.color, baseColor),
                        statusColor,
                        blend
                    );
                    instance.invuln !== 0 && 100 > (Date.now() - instance.invuln) % 200 && ((bodyColor = gameDraw.mixColors(gameDraw.modifyColor(instance.color, baseColor), gameDraw.getColor(6), 0.3)));
                    gameDraw.setColor(context, bodyColor);
        
                    // Optimized glow effect
                    const glow = m.glow;
                    const glowRadius = glow.radius;
                    
                    if (glowRadius > 0) {
                        // Calculate glow color once
                        context.shadowColor = glow.color != null
                            ? gameDraw.modifyColor(glow.color)
                            : gameDraw.mixColors(
                                gameDraw.modifyColor(instance.color),
                                statusColor,
                                0
                            );
                            
                        const glowSize = glowRadius * sizeRatio;
                        context.shadowBlur = glowSize;
                        context.shadowOffsetX = 0;
                        context.shadowOffsetY = 0;
                        context.globalAlpha = glow.alpha;
                        
                        const recursion = glow.recursion;
                        const shape = m.shape;
                        
                        // Draw glow with minimal state changes
                        for (let i = 0; i < recursion; ++i) {
                            drawBody(context, xx, yy, sizeRatio, shape, rot, true, m.drawFill);
                        }
                        
                        context.globalAlpha = 1;
                    }
        
                    // Reset shadow properties in bulk
                    if (glowRadius > 0) {
                        context.shadowBlur = 0;
                        context.shadowOffsetX = 0;
                        context.shadowOffsetY = 0;
                    }
                    
                    // Draw body once
                    drawBody(context, xx, yy, sizeRatio, m.shape, rot, m.borderless, m.drawFill, m.imageInterpolation);
                }
            }
        
            // --- Draw turrets above with cached trig values ---
            for (let i = 0; i < turrets.length; i++) {
                let t = turrets[i];
                if (t.isProp) t = util.requestEntityImage(t);
                // Cache facing calculation
                if (t.lerpedFacing === undefined) {
                    t.lerpedFacing = t.facing;
                } else {
                    t.lerpedFacing = util.lerpAngle(t.lerpedFacing, t.facing, 0.1, true);
                }
                t.invuln = instance.invuln;
                if (t.layer) {
                    const ang = t.direction + t.angle + rot;
                    const len = t.offset * drawSize;
                    const facing = (t.mirrorMasterAngle || turretsObeyRot) ? rot + t.angle : t.lerpedFacing;
                    const cosAng = Math.cos(ang);
                    const sinAng = Math.sin(ang);
                    
                    context.lineWidth = initStrokeWidth * t.strokeWidth;
                    
                    drawEntityCanvas2D(
                        baseColor,
                        xx + len * cosAng,
                        yy + len * sinAng,
                        t,
                        ratio,
                        1,
                        (drawSize / ratio / t.size) * t.sizeFactor,
                        lineWidthMult,
                        facing,
                        turretsObeyRot,
                        context,
                        t,
                        render
                    );
                }
            }
        
            // --- Optimized fancy canvas drawing ---
            if (!assignedContext && context !== ctx[1] && context.canvas.width > 0 && context.canvas.height > 0) {
                ctx[1].save();
                
                // Apply alpha in one operation
                ctx[1].globalAlpha = alphaFade;
                ctx[1].imageSmoothingEnabled = false;
                
                // Draw in one operation
                ctx[1].drawImage(context.canvas, x - xx, y - yy);
                ctx[1].restore();
            }
        
            // --- Minimal context reset ---
            if (sharp) {
                context.lineCap = "round";
                context.lineJoin = "round";
            }
        }
    })();


    const drawEntity = (baseColor, x, y, instance, ratio, alpha = 1, scale = 1, lineWidthMult = 1, rot = 0, turretsObeyRot = false, assignedContext = false, turretInfo = false, render = instance.render, smoothsize = false, forceRenderOnCanvas2D = false) => {
        return drawEntityCanvas2D(baseColor, x, y, instance, ratio, alpha, scale, lineWidthMult, rot, turretsObeyRot, assignedContext, turretInfo, render, smoothsize);
    };
    const iconColorOrder = [10, 11, 12, 15, 13, 2, 14, 4, 5, 1, 0, 3];
    function getIconColor(colorIndex) {
        return iconColorOrder[colorIndex % 12].toString();
    }

    function drawEntityIcon(model, x, y, len, height, lineWidthMult, angle, alpha, colorIndex, upgradeKey, hover = false) {
        let picture = (typeof model == "object") ? model : util.requestEntityImage(model, gui.color),
            position = picture.position,
            scale = (0.6 * len) / position.axis,
            entityX = x + 0.5 * len,
            entityY = y + 0.5 * height,
            baseColor = picture.color;

        // Find x and y shift for the entity image
        let xShift = position.middle.x * Math.cos(angle) - position.middle.y * Math.sin(angle),
            yShift = position.middle.x * Math.sin(angle) + position.middle.y * Math.cos(angle);
        entityX -= scale * xShift;
        entityY -= scale * yShift;

        // Draw box
        ctx[2].globalAlpha = alpha;
        ctx[2].fillStyle = picture.upgradeColor != null
            ? gameDraw.modifyColor(picture.upgradeColor)
            : gameDraw.getColor(getIconColor(colorIndex));
        drawGuiRect(x, y, len, height);
        // Shading for hover
        if (hover) {
            if (global.clickables.clicked) {
                ctx[2].globalAlpha = 0.2;
                ctx[2].fillStyle = color.black;
            } else {
                ctx[2].globalAlpha = 0.15;
                ctx[2].fillStyle = color.guiwhite;
            }
            drawGuiRect(x, y, len, height);
        }
        ctx[2].globalAlpha = 0.25 * alpha;
        ctx[2].fillStyle = color.black;
        drawGuiRect(x, y + height * 0.6, len, height * 0.4);
        ctx[2].globalAlpha = 1;

        // FIX: Force Canvas2D rendering for tank icons to ensure proper layering
        // Draw Tank - always use Canvas2D for icons to avoid layering issues with WebGL2
        drawEntity(baseColor, entityX, entityY, picture, 1, 1, scale / picture.size, lineWidthMult, angle, true, ctx[2], false, picture.render, false, true);

        // Tank name
        drawText(picture.upgradeName ?? picture.name, x + (upgradeKey ? 0.9 * len : len) / 2, y + height * 0.94, height / 10, color.guiwhite, "center");

        // Upgrade key
        if (upgradeKey) {
            drawText("[" + upgradeKey + "]", x + len - 4, y + height - 6, height / 8 - 5, color.guiwhite, "right");
        }
        ctx[2].strokeStyle = color.black;
        ctx[2].lineWidth = 3 * lineWidthMult;
        drawGuiRect(x, y, len, height, true); // Border
    }

    // Draw Game functions
    function drawFloor(px, py, ratio, tick) {
        // Clear the background + draw grid
        clearScreen(color.white, 1, ctx[0]);
        clearScreen(color.guiblack, 0.1, ctx[0]);

        let gameWidth = global.gameWidth = global.player.roomAnim.x.get(tick);
        let gameHeight = global.gameHeight = global.player.roomAnim.y.get(tick);

        //loop through the entire room setup
        ctx[0].globalAlpha = 1;
        ctx[0].fillStyle = color.white;
        // Draw the room
        let roomX = -px + global.screenWidth / 2 - ratio * gameWidth / 2,
            roomY = -py + global.screenHeight / 2 - ratio * gameHeight / 2,
            roomWidth = ratio * gameWidth,
            roomHeight = ratio * gameHeight;
            if (global.advanced.radial) {
                ctx[0].save();
                ctx[0].translate(global.screenWidth / 2, global.screenHeight / 2);
                ctx[0].rotate(Math.atan2(-global.player.renderx, -global.player.rendery));
                ctx[0].translate(global.screenWidth / -2, global.screenHeight / -2);
            }
            if (global.advanced.roundMap) {
                ctx[0].save();
                ctx[0].beginPath();
                ctx[0].arc(
                    -px + global.screenWidth / 2 - (ratio * gameWidth) * 0,
                    -py + global.screenHeight / 2 - (ratio * gameHeight) * 0,
                    (ratio * global.gameWidth) / 2,
                    0,
                    Math.PI * 2
                );
                ctx[0].clip();
            }
        ctx[0].fillRect(roomX, roomY, roomWidth, roomHeight);
        if (global.roomSetup.length) {
            let W = global.roomSetup[0].length,
                H = global.roomSetup.length;

            for (let f = 0; f < H; f++) {
                let e = global.roomSetup[f];
                for (let h = 0; h < W; h++) {
                    let tile = e[h];
                    let top = ratio * h * gameWidth / W - px + global.screenWidth / 2 - ratio * gameWidth / 2,
                        bottom = ratio * f * gameHeight / H - py + global.screenHeight / 2 - ratio * gameHeight / 2,
                        left = ratio * (h + 1) * gameWidth / W - px + global.screenWidth / 2 - ratio * gameWidth / 2,
                        right = ratio * (f + 1) * gameHeight / H - py + global.screenHeight / 2 - ratio * gameHeight / 2;
                    if (!tile) {
                        ctx[0].fillStyle = gameDraw.getColor("border", true);
                        ctx[0].fillRect(top, bottom, left - top, right - bottom);
                        continue;
                    };
                    if (tile.image) { // if a tile is an image, then get the image and render it.
                        ctx[0].globalAlpha = 1;
                        if (!tile.renderImage) {
                            tile.renderImage = new Image();
                            tile.renderImage.src = `imgs/${tile.image}`;
                            tile.renderImage.onerror = () => {
                                console.warn(`Failed to get ${tile.image}! If you are the developer of this game, make sure that you typed the path correctly. Using unknown image.`)
                                tile.renderImage.src = `imgs/unknownNotFound.png`;
                            }
                        };
                        ctx[0].drawImage(tile.renderImage, top, bottom, left - top, right - bottom);
                    }

                    ctx[0].globalAlpha = 0.3;
                    if (tile.color == 'none') tile.color = 'border';
                    let tileColor = gameDraw.getColor(tile.color, true);
                    // If not default tile color, draw that tile!
                    if (tileColor !== color.white) {
                        ctx[0].fillStyle = tileColor;
                        ctx[0].fillRect(top, bottom, left - top, right - bottom);
                    }
                }
            }
        }
        global.advanced.roundMap && ctx[0].restore();
        let gridsize = 30 * ratio;
        if (config.graphical.showGrid && 2.5 < gridsize) { // Draw grid if the user wants to.
            ctx[0].save();
            ctx[0].lineWidth = ratio;
            ctx[0].strokeStyle = color.guiblack;
            ctx[0].globalAlpha = 0.04;
            ctx[0].beginPath();
            if (global.advanced.radial) {
                let n =
                Math.ceil(Math.sqrt(global.screenWidth * global.screenWidth + global.screenHeight * global.screenHeight) / ratio / ratio / 12) * gridsize;
                for (let u = ((global.screenWidth / 2 - px) % gridsize) - n; u < global.screenWidth + n; u += gridsize)
                ctx[0].moveTo(u, -n), ctx[0].lineTo(u, n + global.screenHeight);
                for (let u = ((global.screenHeight / 2 - py) % gridsize) - n; u < global.screenHeight + n; u += gridsize)
                ctx[0].moveTo(-n, u), ctx[0].lineTo(n + global.screenWidth, u);
            } else {
                for (let x = (global.screenWidth / 2 - px) % gridsize; x < global.screenWidth; x += gridsize) {
                    ctx[0].moveTo(x, 0);
                    ctx[0].lineTo(x, global.screenHeight);
                }
                for (let y = (global.screenHeight / 2 - py) % gridsize; y < global.screenHeight; y += gridsize) {
                    ctx[0].moveTo(0, y);
                    ctx[0].lineTo(global.screenWidth, y);
                }
            }

            ctx[0].stroke();
            ctx[0].globalAlpha = 1;
            global.advanced.radial && ctx[0].restore();
        }
        global.advanced.radial && ctx[0].restore();
    }
    function drawEntities(px, py, ratio, tick) {
        global.loggers.renderedEntities.set();
        if (global.advanced.blackout.active) {
            document.getElementById("gameCanvas-background").style.display = "none";
            ctx[1].drawImage(ctx[0].canvas, 0, 0, global.screenWidth, global.screenHeight);
            if (global.glCanvas) ctx[1].drawImage(global.glCanvas, 0, 0, global.screenWidth, global.screenHeight);
        } else if (document.getElementById("gameCanvas-background").style.display === "none") document.getElementById("gameCanvas-background").style.display = "block";
        if (global.advanced.radial) {
            ctx[1].save();
            ctx[1].translate(global.screenWidth / 2, global.screenHeight / 2);
            ctx[1].rotate(Math.atan2(-global.player.renderx, -global.player.rendery));
            ctx[1].translate(global.screenWidth / -2, global.screenHeight / -2);
        }
        // Draw things
        for (let instance of global.entities) {
            if (!instance.render.draws) {
                continue;
            }
            let motion = compensation();
            let rst = instance.render.status.getFade();
            if (rst === 1) {
                motion.set();
            } else {
                if (config.graphical.lerpAnimations) {
                    instance.x += instance.vx * global.metrics.updatetime / global.metrics.rendertime;
                    instance.y += instance.vy * global.metrics.updatetime / global.metrics.rendertime;
                    instance.facing += instance.vfacing * global.metrics.updatetime / global.metrics.rendertime;
                }
                motion.set(instance.render.lastRender, instance.render.interval);
            }
            let isize = instance.render.size.get(tick, 1 !== rst);
            instance.render.x = config.graphical.predictAnimations ?
                motion.predict(instance.render.lastx, instance.x, instance.render.lastvx, instance.vx) :
                config.graphical.lerpAnimations ?
                util.lerp(instance.render.x, Math.round(instance.x + instance.vx), 0.1, true) :
                instance.render.xAnim.get(tick, 1 !== rst);

            instance.render.y = config.graphical.predictAnimations ?
                motion.predict(instance.render.lasty, instance.y, instance.render.lastvy, instance.vy) :
                config.graphical.lerpAnimations ?
                util.lerp(instance.render.y, Math.round(instance.y + instance.vy), 0.1, true) :
                instance.render.yAnim.get(tick, 1 !== rst);

            instance.render.f = config.graphical.predictAnimations ?
                motion.predictFacing(instance.render.lastf, instance.facing) :
                instance.render.faceAnim.get(tick, 1 !== rst);

            instance.id === gui.playerid &&
                !global.autoSpin &&
                !global.syncingWithTank &&
                !instance.twiggle &&
                !global.died ?
                instance.render.f = Math.atan2(global.target.y * global.reverseTank, global.target.x * global.reverseTank) : 0

            let x = ratio * instance.render.x - px,
                y = ratio * instance.render.y - py,
                baseColor = instance.color;
            if (instance.id === gui.playerid) {
                x = !config.graphical.smoothcamera && !global.player.isScoping && config.graphical.shakeProperties.CameraShake.shakeStartTime == -1 && !global.died ? 0 : x;
                y = !config.graphical.smoothcamera && !global.player.isScoping && config.graphical.shakeProperties.CameraShake.shakeStartTime == -1 && !global.died ? 0 : y;
                global.player.screenx = x;
                global.player.screeny = y;
                global.player.name = instance.name ?? "";
            }
            x += global.screenWidth / 2;
            y += global.screenHeight / 2;
            let alpha = instance.id === gui.playerid ? 1 : instance.alpha;
            if (!global.advanced.radial) alpha = handleScreenDistance(global.advanced.blackout.active && global.died ? 0 : alpha, instance, false);
            drawEntity(baseColor, x, y, instance, ratio, instance.id === gui.playerid || global.showInvisible ? instance.alpha ? instance.alpha * 0.75 + 0.25 : 0.25 : instance.alpha * alpha, 1, 1, instance.render.f, false, false, false, instance.render, isize);
        }
        global.advanced.radial && ctx[1].restore();
        for (let instance of global.entities) {
            let alpha = instance.id === gui.playerid ? 1 : instance.alpha;
            alpha = handleScreenDistance(alpha, instance);
            let x = instance.id === gui.playerid ? global.player.screenx : ratio * instance.render.x - px,
                y = instance.id === gui.playerid ? global.player.screeny : ratio * instance.render.y - py;
            drawHealth(x, y, instance, ratio, alpha, instance.size);
            drawName(x, y, instance, ratio, alpha, instance.size);
        }
        for (let instance of global.entities) {
            let alpha = instance.id === gui.playerid ? 1 : instance.alpha;
            alpha = handleScreenDistance(alpha, instance);
            let x = instance.id === gui.playerid ? global.player.screenx : ratio * instance.render.x - px,
                y = instance.id === gui.playerid ? global.player.screeny : ratio * instance.render.y - py;
            drawChatMessages(x, false, py, instance, ratio, alpha, instance.size, px, py);
            drawChatInput(x, y, instance, ratio, instance.size);
        }
        if (global.advanced.blackout.active) {
            let entity = global.entities.find((u) => u.id === gui.playerid);
            if (entity) {
                ctx[1].beginPath();
                let x = global.screenWidth / 2 - px + ratio * 0,
                    y = global.screenHeight / 2 - py + ratio * 0,
                    kt = ratio * global.gameWidth,
                    ky = ratio * global.gameHeight,
                    G = global.roomSetup[0].length,
                    L = global.roomSetup.length

                for (let S = 0; S < L; S++) for (let ea = 0; ea < G; ea++) {
                    let Pc = x + ((ea + 0.5) / G) * kt - kt / 2,
                        Qc = y + ((S + 0.5) / L) * ky - ky / 2,
                        tile = global.roomSetup[S][ea];

                    if (tile.visibleOnBlackout) {
                        ctx[1].moveTo(Pc + ((0.5) / G) * kt, Qc);
                        ctx[1].arc(Pc, Qc, ((0.5) / G) * kt, 0, 2 * Math.PI);
                    }
                }
                for (let entity of global.entities) {
                    let x = ratio * entity.render.x - px,
                        y = ratio * entity.render.y - py,
                        indexes = entity.index.split("-"),
                        m = global.mockups[parseInt(indexes[0])] ?? global.missingMockup[0];

                    x += global.screenWidth / 2;
                    y += global.screenHeight / 2;
                    if (entity.id === gui.playerid || (m.visibleOnBlackout && entity.alpha < 0.1)) {
                        ctx[1].moveTo(x, y);
                        ctx[1].arc(x, y, entity.size * ratio * 4, 0, 2 * Math.PI);
                    }
                    if (entity.id === gui.playerid) {
                        if (!global.died) {
                            ctx[1].moveTo(x, y);
                            let na = Math.atan2(global.target.y * global.reverseTank, global.target.x * global.reverseTank);
                            ctx[1].arc(x, y, entity.size * ratio * 24, na - 0.3, na + 0.3);
                        }
                        for (let gun of m.guns) {
                            let facing = entity.render.f,
                                tx = x + gun.offset * Math.cos(gun.direction + gun.angle + facing) + (gun.length / 2) * Math.cos(gun.angle + facing),
                                ty = y + gun.offset * Math.sin(gun.direction + gun.angle + facing) + (gun.length / 2) * Math.sin(gun.angle + facing);
                            ctx[1].moveTo(tx, ty);
                            let Ia = facing + gun.angle;
                            ctx[1].arc(tx, ty, entity.size * ratio * gun.length * 6, Ia - 0.3, Ia + 0.3);
                        }
                    }
                }
                ctx[1].globalAlpha = 1;
                ctx[1].fillStyle = global.advanced.blackout.color;
                ctx[1].globalCompositeOperation = "destination-in";
                ctx[1].fill();
                ctx[1].globalCompositeOperation = "destination-over";
                ctx[1].fillRect(0, 0, global.screenWidth, global.screenHeight);
                ctx[1].globalCompositeOperation = "source-over";
            } else {
                ctx[1].globalAlpha = 1;
                ctx[1].fillStyle = global.advanced.blackout.color;
                ctx[1].fillRect(0, 0, global.screenWidth, global.screenHeight);
            }
        }
        global.loggers.renderedEntities.mark();
    }

    global.scrollX = global.scrollY = global.fixedScrollX = global.fixedScrollY = -1;
    global.scrollVelocityY = global.scrollVelocityX = 0;
    let lastGuiType = null;
    function drawUpgradeTree(spacing, alcoveSize) {
        if (global.died) {  // Hide the tree on death
            if (global.showTree) {
                global.showTree = false;
                global.pullUpgradeMenu = false;
            }
            global.scrollX = global.scrollY = global.fixedScrollX = global.fixedScrollY = global.scrollVelocityY = global.scrollVelocityX = 0;
            global.treeScale = 1;
            return;
        }

        if (lastGuiType != gui.type || global.generateTankTree) {
            try {
                let m = util.requestEntityImage(gui.type), // The mockup that corresponds to the player's tank
                    rootName = m.rerootUpgradeTree, // The upgrade tree root of the player's tank
                    rootIndex = [];
                for (let name of rootName) {
                    let mockup = global.mockups.find(i => i && i.className === name);
                    let ind = name == undefined || !mockup ? -1 : mockup.index;
                    rootIndex.push(ind); // The index of the mockup that corresponds to the root tank (-1 for no root)
                }
                if (!rootIndex.includes(-1)) {
                    generateTankTree(rootIndex);
                }
                lastGuiType = gui.type;
                global.generateTankTree = false;
            } catch { };
        }

        if (!tankTree) {
            console.log('No tank tree rendered yet.');
            return;
        }
        let tileSize = alcoveSize / 2,
            size = tileSize - 4, // TODO: figure out where this 4 comes from
            spaceBetween = 10,
            screenDivisor = (spaceBetween + tileSize) * 2 * global.treeScale,
            padding = tileSize / screenDivisor,
            dividedWidth = global.screenWidth / screenDivisor,
            dividedHeight = global.screenHeight / screenDivisor,
            treeFactor = 1 + spaceBetween / tileSize;

        global.fixedScrollX = Math.max(
            dividedWidth - padding,
            Math.min(
                tankTree.width * treeFactor + padding - dividedWidth,
                global.fixedScrollX + global.scrollVelocityX
            )
        );
        global.fixedScrollY = Math.max(
            dividedHeight - padding,
            Math.min(
                tankTree.height * treeFactor + padding - dividedHeight,
                global.fixedScrollY + global.scrollVelocityY
            )
        );
        global.scrollX = util.lerp(global.scrollX, global.fixedScrollX, 0.1);
        global.scrollY = util.lerp(global.scrollY, global.fixedScrollY, 0.1);

        for (let [start, end] of branches) {
            let sx = ((start.x - global.scrollX) * (tileSize + spaceBetween) + 1 + 0.5 * size) * global.treeScale + global.screenWidth / 2,
                sy = ((start.y - global.scrollY) * (tileSize + spaceBetween) + 1 + 0.5 * size) * global.treeScale + global.screenHeight / 2,
                ex = ((end.x - global.scrollX) * (tileSize + spaceBetween) + 1 + 0.5 * size) * global.treeScale + global.screenWidth / 2,
                ey = ((end.y - global.scrollY) * (tileSize + spaceBetween) + 1 + 0.5 * size) * global.treeScale + global.screenHeight / 2;
            if (ex < 0 || sx > global.screenWidth || ey < 0 || sy > global.screenHeight) continue;
            ctx[2].strokeStyle = color.black;
            ctx[2].lineWidth = 2 * global.treeScale;
            drawGuiLine(sx, sy, ex, ey);
        }
        ctx[2].globalAlpha = 0.5;
        ctx[2].fillStyle = color.guiwhite;
        ctx[2].fillRect(0, 0, innerWidth, innerHeight);
        ctx[2].globalAlpha = 1;

        //draw the various tank icons
        let angle = -Math.PI / 4;
        for (let { x, y, colorIndex, index } of tiles) {
            let ax = (x - global.scrollX) * (tileSize + spaceBetween) * global.treeScale + global.screenWidth / 2,
                ay = (y - global.scrollY) * (tileSize + spaceBetween) * global.treeScale + global.screenHeight / 2;
            if (ax < -tileSize || ax > global.screenWidth + tileSize || ay < -tileSize || ay > global.screenHeight + tileSize) continue;
            drawEntityIcon(index.toString(), ax, ay, tileSize * global.treeScale, tileSize * global.treeScale, global.treeScale, angle, 1, colorIndex);
        }

        let text = "Arrow keys to navigate the class tree. Shift to navigate faster. Scroll wheel (or +/- keys) to zoom in/out.";
        let w = measureText(text, 18);
        ctx[2].globalAlpha = 1;
        ctx[2].lineWidth = 1;
        ctx[2].fillStyle = color.dgrey;
        ctx[2].strokeStyle = color.black;
        ctx[2].fillText(text, global.screenWidth / 2 - w / 2, innerHeight * 0.04);
        ctx[2].strokeText(text, global.screenWidth / 2 - w / 2, innerHeight * 0.04);
        ctx[2].globalAlpha = 1;
    }

    function drawMessages(spacing, alcoveSize) {
        // Draw messages
        let height = 18;
        let x = global.screenWidth / 2;
        let y = spacing + 5;
        if (global.mobile) {
            if (global.canUpgrade) {
                mobileUpgradeGlide.set(0 + (global.canUpgrade || global.upgradeHover));
                y += (alcoveSize / 1.4 /*+ spacing * 2*/) * mobileUpgradeGlide.get();
            }
            y += global.canSkill || global.showSkill ? (alcoveSize / 2.2 /*+ spacing * 2*/) * statMenu.get() : 0;
        }

        // Draw each message
        var Bd = Date.now();
        var yy = config.animationSettings.ScaleBar;
        for (let i = global.messages.length - 1; i >= 0; i--) {
            let msg = global.messages[i],
                txt = msg.text,
                time = Bd - msg.time,
                duration = msg.duration - time,
                text = txt;

            if (0 >= duration) {
                 global.messages.splice(i, 1);
                 continue;
            }

            let K = Math.max(0, Math.min(1, time / 300, duration / 300));
            if (msg.textJSON) { // If a message is like a big ass box, then draw this instead.
                let len = 0;
                // Give it a textobj if it doesn't have one
                msg.textJSON.forEach((txt) => {
                    if (len < measureText(txt, height - 4, false)) len = measureText(txt, height - 4, false)
                })
                ctx[2].globalAlpha = 0.5 * K;
                // Draw the background
                drawBarAdvanced(x - len / 2, x + len / 2, y + yy / 2, height, color.black, 18 * (msg.textJSON.length) - 18);
                ctx[2].globalAlpha = K;
                // Draw the text
                msg.textobjs = [];
                msg.textJSON.forEach((txt) => {
                    msg.textobjs[msg.textobjs.length] = function () { }; // For some reason, this fixes the text's location, I guess.
                    drawText(txt, x - len / 2, y + 15 + 18 * (msg.textobjs.length - 1), height - 4, color.guiwhite, "left");
                })
                y += 23 * K + 18 * (3 - 2 * K) * (msg.textJSON.length - 1) * K * K;
            } else {
                // Give it a textobj if it doesn't have one
                if (msg.len == null) msg.len = measureText(text, height - 4);
                // Draw the background
                ctx[2].globalAlpha = 0.5 * K;
                drawBar(x - msg.len / 2, x + msg.len / 2, y + yy / 2, height + 2, color.black);
                // Draw the text
                ctx[2].globalAlpha = K;
                drawText(text, x, y + yy / 2, height - 4, color.guiwhite, "center", true);
                y += 23 * (3 - 2 * K) * K * K;
            }
        }
        ctx[2].globalAlpha = 1;
    }

    function drawChatMessages(x, y, py, instance, ratio, alpha, isize) {
        if (!(instance.id === gui.playerid) && instance.alpha < 0.25) return;
        let now = Date.now(),
            size = isize * ratio,
            g = Math.max(20, size);
    
        if (!y) y = instance.id === gui.playerid
            ? global.player.screeny - 1 * (global.showChatGlide) * (global.lerp(0, 1, global.showChatGlide)) * g
            : ratio * instance.render.y - py;
        //put chat msg above name
        let fade = instance.render.status.getFade();
        fade *= fade;
        ctx.globalAlpha = fade;
    
        x += global.screenWidth / 2;
        y += global.screenHeight / 2;
        if (instance.id !== gui.playerid && instance.nameplate) y -= 8 * ratio;
    
        let messages = global.chats[instance.id];
        if (!messages) return;
        const messageSpacing = 25 * 0.04 * g;

        if (global.advanced.radial) {
            ctx[1].save();
            ctx[1].translate(global.screenWidth / 2, global.screenHeight / 2);
            ctx[1].rotate(Math.atan2(-global.player.renderx, -global.player.rendery));
            ctx[1].translate(global.screenWidth / -2, global.screenHeight / -2);
        }
        // Draw all the messages
        for (let i = 0; i < messages.length; i++) {
            let chatIndex = messages.length - 1 - i;
            let chat = messages[chatIndex],
                text = chat.text,
                msgLengthHalf = measureText(text, 0.5 * g) / 2,
                barScale = global.GUIStatus.renderPlayerScores ? 2.66 : 2.26,
                textScale = global.GUIStatus.renderPlayerScores ? 2.45 : 2.05,
                timeSinceCreated = now - chat.createdAt,
                fadeInDuration = 300,
                fadeInAlpha = chat.fadedIn ? 1 : Math.min(1, timeSinceCreated / fadeInDuration),
                expiryAlpha = Math.max(0, Math.min(200, chat.expires - now) / 200),
                valpha = fadeInAlpha * expiryAlpha;
            if (chat.targetY === undefined) {
                chat.targetY = i * messageSpacing;
                chat.currentY = i === 0 ? 0 : (i-1) * messageSpacing;
            }
            chat.targetY = i * messageSpacing;
            const animationSpeed = 0.15;
            chat.currentY += (chat.targetY - chat.currentY) * animationSpeed;
            let slideOffset = chat.currentY;
            
            if (fadeInAlpha >= 1 && !chat.fadedIn) {
                chat.fadedIn = true;
            }
            if (valpha == 0 && expiryAlpha == 0) util.remove(messages, messages.indexOf(chat));
            ctx[1].globalAlpha = 0.5 * valpha * alpha * alpha * fade;
            drawBar(x - msgLengthHalf, x + msgLengthHalf, y - g * (instance.id === gui.playerid ? 2.26 : barScale) - slideOffset, 0.75 * g, gameDraw.modifyColor(instance.color), ctx[1]);
            global.advanced.radial && ctx[1].restore();
            ctx[1].globalAlpha = valpha * alpha * fade;
            config.graphical.fontStrokeRatio *= 1.2;
            drawText(text, x, y - g * (instance.id === gui.playerid ? 2.05 : textScale) - slideOffset, 0.50 * g, color.guiwhite, "center", false, 1, true, ctx[1], global.advanced.radial ? true : false);
            config.graphical.fontStrokeRatio /= 1.2;
        }
    }
    

    function drawHealth(x, y, instance, ratio, alpha, isize) {
        if (!(0.02 > alpha)) {
            let fade = instance.render.status.getFade();
            fade *= fade;
            ctx.globalAlpha = fade;

            let size = isize * ratio,
                indexes = instance.index.split("-"),
                m = global.mockups[parseInt(indexes[0])];
            if (!m) m = global.missingMockup[0];
            let realSize = (size / m.size) * m.realSize;

            if (global.advanced.radial) {
                ctx[1].save();
                ctx[1].translate(global.screenWidth / 2, global.screenHeight / 2);
                ctx[1].rotate(Math.atan2(-global.player.renderx, -global.player.rendery));
                ctx[1].translate(global.screenWidth / -2, global.screenHeight / -2);
            }

            if (instance.drawsHealth) {
                let health = instance.render.health.get(),
                    shield = instance.render.shield.get();

                x += global.screenWidth / 2;
                y += global.screenHeight / 2;

                if (health < 0.99 || shield < 0.99 && global.GUIStatus.renderhealth) {
                    let col = config.graphical.coloredHealthbars ? gameDraw.mixColors(gameDraw.modifyColor(instance.color), color.guiwhite, 0.5) : color.lgreen;
                    let yy = y + 1 + realSize + 15 * ratio;
                    let barWidth = 3 * ratio;
                    ctx[1].globalAlpha = alpha * alpha * fade;

                    //background bar
                    drawBar(x - size, x + size, yy + barWidth * config.graphical.seperatedHealthbars / 2, barWidth * (1 + config.graphical.seperatedHealthbars) + config.graphical.barChunk, color.black, ctx[1]);

                    //hp bar
                    drawBar(x - size, x - size + 2 * size * health, yy + barWidth * config.graphical.seperatedHealthbars, barWidth, col, ctx[1]);

                    //shield bar
                    if (shield || config.graphical.seperatedHealthbars) {
                        if (!config.graphical.seperatedHealthbars) ctx[2].globalAlpha *= 0.7;
                        ctx[1].globalAlpha *= 0.3 + 0.3 * shield,
                            drawBar(x - size, x - size + 2 * size * shield, yy, barWidth, config.graphical.coloredHealthbars ? gameDraw.mixColors(col, color.guiblack, 0.25) : color.teal, ctx[1]);
                    }
                    if (gui.showhealthtext) drawText(Math.round(instance.healthN) + "/" + Math.round(instance.maxHealthN), x, yy + barWidth * 2 + barWidth * config.graphical.seperatedHealthbars * 2 + 10, 12 * ratio, color.guiwhite, "center", false, 1, true, ctx[1]);
                    ctx[2].globalAlpha = alpha;
                }
            }
            global.advanced.radial && ctx[1].restore();
        }
    }

    function drawName(x, y, instance, ratio, alpha, isize) {
        if (!(0.02 > alpha)) {
            let fade = instance.render.status.getFade();
            fade *= fade;
            ctx[1].globalAlpha = fade;

            let size = isize * ratio;
            x += global.screenWidth / 2;
            y += global.screenHeight / 2;

            if (instance.id !== gui.playerid && instance.nameplate) {
                var name = instance.name.substring(7, instance.name.length + 1);
                var namecolor = instance.name.substring(0, 7);
                ctx[1].globalAlpha = alpha * alpha * fade;
                let g = Math.max(20, size);
                if (global.GUIStatus.renderPlayerNames) drawText(name, x, y - g * (global.GUIStatus.renderPlayerScores || typeof instance.score === "string" ? 1.9 : 1.45), 0.55 * g, namecolor == "#ffffff" ? color.guiwhite : namecolor, "center", false, 1, true, ctx[1], global.advanced.radial ? true : false);
                if (global.GUIStatus.renderPlayerScores || typeof instance.score === "string") drawText(typeof instance.score === "string" ? instance.score : util.handleLargeNumber(instance.score, 1), x, y - 1.45 * g, 0.3 * g, namecolor == "#ffffff" ? color.guiwhite : namecolor, "center", false, 1, true, ctx[1], global.advanced.radial ? true : false);
                ctx[1].globalAlpha = 1;
            }
        }
    }

    function drawSkillBars(spacing, alcoveSize) {
        // Draw skill bars
        if (global.mobile) return drawMobileSkillUpgrades(spacing, alcoveSize);
        statMenu.set(0 + (global.died || global.statHover || (global.canSkill && !gui.skills.every(skill => skill.cap === skill.amount))));
        global.clickables.stat.hide();

        let vspacing = 5;
        let height = 14.5;
        let gap = 37;
        let len = alcoveSize; // * global.screenWidth; // The 30 is for the value modifiers
        let save = len;
        let x = spacing + (statMenu.get() - 1) * (height + 50 + len * ska(gui.skills.reduce((largest, skill) => Math.max(largest, skill.cap), 0)));
        let y = global.screenHeight - spacing - height;
        let ticker = 11;
        let namedata;
        try {
            namedata = gui.getStatNames(global.mockups[parseInt(gui.type.split("-")[0])].statnames);
        } catch (e) {
            namedata = gui.getStatNames(global.missingMockup[0].statnames);
        }
        let clickableRatio = global.canvas.height / global.screenHeight / global.ratio;

        for (let i = 0; i < gui.skills.length; i++) {
            ticker--;
            //information about the bar
            let skill = gui.skills[i],
                name = namedata[ticker - 1],
                level = skill.amount,
                col = color[skill.color],
                cap = skill.softcap,
                maxLevel = skill.cap;

            if (!cap) continue;

            len = save;
            let max = 0,
                extension = cap > max,
                blocking = cap < maxLevel;
            if (extension) {
                max = cap;
            }

            //bar fills
            drawBar(x + height / 2, x - height / 2 + len * ska(cap), y + height / 2, height - 4 + config.graphical.barChunk, color.black);
            drawBar(x + height / 2, x + height / 2 + len * ska(cap) - gap, y + height / 2, height - 3, color.grey);
            drawBar(x + height / 2, x + height / 2 + len * ska(level) - gap, y + height / 2, height - 3.5, col);

            // Blocked-off area
            if (blocking) {
                ctx[2].lineWidth = 1;
                ctx[2].strokeStyle = color.grey;
                for (let j = cap + 1; j < max; j++) {
                    drawGuiLine(x + len * ska(j) - gap, y + 1.5, x + len * ska(j) - gap, y - 3 + height);
                }
            }

            // Vertical dividers
            ctx[2].strokeStyle = color.black;
            ctx[2].lineWidth = 1;
            for (let j = 1; j < level + 1; j++) {
                drawGuiLine(x + len * ska(j) - gap, y + 1.5, x + len * ska(j) - gap, y - 3 + height);
            }

            // Skill name
            len = save * ska(max);
            let textcolor = level == maxLevel ? col : !gui.points || (cap !== maxLevel && level == cap) ? color.grey : color.guiwhite;
            drawText(name, Math.round(x + len / 2) + 0.5, y + height / 2, height - 5, textcolor, "center", true);

            // Skill key
            drawText("[" + (ticker % 10) + "]", Math.round(x + len - height * 0.25) - 1.5, y + height / 2, height - 5, textcolor, "right", true);
            if (textcolor === color.guiwhite) {
                // If it's active
                global.clickables.stat.place(ticker - 1, x * clickableRatio, y * clickableRatio, len * clickableRatio, height * clickableRatio);
            }

            // Skill value
            if (level) {
                drawText(textcolor === col ? "MAX" : "+" + level, Math.round(x + len + 4) + 0.5, y + height / 2, height - 5, col, "left", true);
            }

            // Move on
            y -= height + vspacing;
        }

        global.clickables.hover.place(0, 0, y * clickableRatio, 0.8 * len * clickableRatio, (global.screenHeight - y) * clickableRatio);
        if (gui.points !== 0) {
            // Draw skillpoints to spend
            drawText("x" + gui.points, Math.round(x + len - 2) + 0.5, Math.round(y + height - 4) + 0.5, 20, color.guiwhite, "right");
        }
    }

    function drawSelfInfo(max) {
        //rendering information
        let width = 440,
            scorewidth = 70,
            scorelength = 0,
            height = 25.5,
            x = (global.screenWidth - width) / 2,
            y = global.screenHeight - 22 - height;
        ctx[2].lineWidth = 10;
        drawBar(x, x + width, y + height / 2, height - 3 + config.graphical.barChunk, color.black);
        drawBar(x, x + width, y + height / 2, height - 3, color.grey);
        drawBar(x, x + width * gui.__s.getProgress(), y + height / 2, height - 3.5, color.gold);
        drawText("Level " + gui.__s.getLevel() + " " + gui.class, x + width / 2 + 1, y + height / 2 + 9, 21, color.guiwhite, "center", false, 6);
        height = 17;
        y -= height + 5;
        if (global.GUIStatus.renderPlayerKillbar) {
            scorelength = -112.2;
            scorewidth = 160;
            drawBar(x + scorewidth - scorelength, x + width - scorewidth - scorelength, y + height / 2, height - 3 + config.graphical.barChunk, color.black);
            drawBar(x + scorewidth - scorelength, x + width - scorewidth - scorelength, y + height / 2, height - 3, color.grey);
            drawBar(x + scorewidth - scorelength, x - scorelength + width * ((scorewidth / width) + ((width - scorewidth * 2) / width) * (1 ? Math.min(1, gui.__s.getKills()[0] / 1) : 1)), y + height / 2, height - 3.5, color.teal);
            drawText("Kills: " + util.formatKills(...gui.__s.getKills()), x + width / 2 + 0.5 - scorelength, y + height / 2 + 6, 13, color.guiwhite, "center");
            scorelength = 72.5;
            scorewidth = 120;
        }
        drawBar(x + scorewidth - scorelength, x + width - scorewidth - scorelength, y + height / 2, height - 3 + config.graphical.barChunk, color.black);
        drawBar(x + scorewidth - scorelength, x + width - scorewidth - scorelength, y + height / 2, height - 3, color.grey);
        drawBar(x + scorewidth - scorelength, x - scorelength + width * ((scorewidth / width) + ((width - scorewidth * 2) / width) * (max ? Math.min(1, gui.__s.getScore() / max) : 1)), y + height / 2, height - 3.5, color.green);
        drawText("Score: " + util.formatLargeNumber(Math.round(gui.__s.getScore())), x + width / 2 + 0.5 - scorelength, y + height / 2 + 6, 13, color.guiwhite, "center");
        ctx[2].lineWidth = 4;
        var name = global.player.name.substring(7, global.player.name.length + 1);
        drawText(name, Math.round(x + width / 2) + 1.5, Math.round(y - 10 - 4) - 1, 31, global.nameColor = "#ffffff" ? color.guiwhite : global.nameColor, "center");
    }

    function handleSpeedMonitor() {
        if ((100 * gui.fps) < 100) global.serverStats.lag_color = color.orange; else global.serverStats.lag_color = color.guiwhite;
        if (global.metrics.rendertime < 10) global.metrics.rendertime_color = color.orange; else global.metrics.rendertime_color = color.guiwhite;
        if (global.serverStats.mspt > 28.0) {
            global.serverStats.mspt_color = color.red;
        } else if (global.serverStats.mspt > 20.0) {
            global.serverStats.mspt_color = color.orange;
        } else global.serverStats.mspt_color = color.guiwhite;
    }

    function drawMinimapAndDebug(spacing, alcoveSize, GRAPHDATA) {
        // Draw minimap and FPS monitors
        // Minimap stuff starts here
        let len = alcoveSize; // * global.screenWidth;
        let height = (len / global.gameWidth) * global.gameHeight;
        global.loggers.processMinimap.set();
        let upgradeColumns = Math.ceil(gui.upgrades.length / 9);
        let x = global.mobile ? spacing : global.screenWidth - spacing - len - 5;
        let y = global.mobile ? spacing : global.screenHeight - height - spacing - 5;
        if (global.mobile) {
            y += global.canUpgrade ? (alcoveSize / 1.5) * mobileUpgradeGlide.get() * upgradeColumns / 1.5 + spacing * (upgradeColumns + 1.55) + 9 : 0;
            y += global.canSkill || global.showSkill ? statMenu.get() * alcoveSize / 2.6 + spacing / 0.75 : 0;
        }
        ctx[2].globalAlpha = 0.4;
        ctx[2].save();
        ctx[2].fillStyle = color.white;
        global.advanced.roundMap ? drawGuiCircle(x + len / 2, y + height / 2, len / 2) : drawGuiRect(x, y, len, height);
        ctx[2].beginPath(); // We will not allow to draw outside the minimap, so we are only allowing minimap entities to draw INSIDE the minimap only
        global.advanced.roundMap ? ctx[2].arc(x + len / 2, y + height / 2, len / 2, 0, 2 * Math.PI) : ctx[2].rect(x, y, len, height); // Draw everything inside the minimap
        ctx[2].clip();

        if (global.roomSetup.length) {
            let W = global.roomSetup[0].length,
                H = global.roomSetup.length,
                i = 0;

            for (let ycell = 0; ycell < H; ycell++) {
                let j = 0;
                for (let xcell = 0; xcell < W; xcell++) {
                    let cell = global.roomSetup[ycell][xcell];
                    if (!cell) {
                        ctx[2].fillStyle = gameDraw.getColor("border", true);
                        drawGuiRect(x + (j * len) / W, y + (i * height) / H, len / W, height / H);
                    } else {
                        let color = cell.color;
                        if (color == 'none') cell.color = 'pureBlack';
                        if (cell.renderImage) {
                            ctx[2].globalAlpha = 1;
                            ctx[2].drawImage(cell.renderImage, x + (j * len) / W, y + (i * height) / H, len / W, height / H);
                        }
                        ctx[2].globalAlpha = 0.4;
                        ctx[2].fillStyle = gameDraw.getColor(color);
                        if (gameDraw.getColor(color) !== color.white) {
                            drawGuiRect(x + (j * len) / W, y + (i * height) / H, len / W, height / H);
                        }
                    };
                    j++;
                }
                i++;
            }
        }
        ctx[2].globalAlpha = 1;
        for (let entity of minimap.get()) {
            ctx[2].fillStyle = gameDraw.mixColors(gameDraw.modifyColor(entity.color), color.black, 0.3);
            ctx[2].globalAlpha = entity.alpha;
            switch (entity.type) {
                case 2:
                    // Draw wall entieies
                    let trueSize = (entity.size + 2) / 1.1283791671; // lazyRealSizes[4] / sqrt(2)
                    drawGuiRect(x + ((entity.x - trueSize) / global.gameWidth + 0.5) * len, y + ((entity.y - trueSize) / global.gameHeight + 0.5) * height, ((2 * trueSize) / global.gameWidth) * len, ((2 * trueSize) / global.gameWidth) * len + 0.2);
                    break;
                case 1:
                    // Draw rock/other entities
                    drawGuiCircle(x + (entity.x / global.gameWidth + 0.5) * len, y + (entity.y / global.gameHeight + 0.5) * height, (entity.size / global.gameWidth) * len);
                    break;
                case 0:
                    // Draw players
                    if (entity.id !== gui.playerid) drawGuiCircle(x + (entity.x / global.gameWidth + 0.5) * len, y + (entity.y / global.gameHeight + 0.5) * height, !global.mobile ? 2 : 3.5);
                    break;
            }
        }

        ctx[2].globalAlpha = 1;
        ctx[2].lineWidth = 1;
        ctx[2].strokeStyle = color.guiblack;
        ctx[2].fillStyle = color.guiblack;
        // Draw yourself in the minimap
        drawGuiCircle(x + (global.player.cx.animX / global.gameWidth + 0.5) * len, y + (global.player.cy.animY / global.gameHeight + 0.5) * height, !global.mobile ? 2 : 3.5, false);
        ctx[2].restore();
        ctx[2].globalAlpha = 1;
        ctx[2].fillStyle = color.black;
        // Draw border of the minimap
        ctx[2].lineWidth = 3;
        global.advanced.roundMap ? drawGuiCircle(x + len / 2, y + height / 2, len / 2, true) : drawGuiRect(x, y, len, height, true); // Border
        if (global.mobile) {
            x = global.screenWidth - spacing - len;
            y = global.screenHeight - spacing;
        }
        if (global.showDebug) {
            drawGuiRect(x, y - 40, len, 30);
            lagGraph(lag.get(), x, y - 40, len, 30, color.teal);
            gapGraph(global.metrics.rendergap, x, y - 40, len, 30, color.pink);
            timingGraph(GRAPHDATA, x, y - 40, len, 30, color.yellow);
        }
        global.loggers.processMinimap.mark();
        // Minimap stuff ends here
        // Debug stuff
        if (!global.showDebug) y += 13 * 3;
        // Text
        handleSpeedMonitor();

        if (!global.metrics.latency.length) global.metrics.latency.push(0);
        let ping = global.metrics.latency.reduce((b, a) => b + a, 1) / global.metrics.latency.length - 1;
        let tankSpeed = Math.sqrt(global.player.vx * global.player.vx + global.player.vy * global.player.vy);
        let xloc = global.player.renderx / 30;
        let yloc = global.player.rendery / 30;
        if (global.showDebug) {
            let getRenderingInfo = (data, isTurret) => {
                isTurret ? global.renderingInfo.turretEntities += data.length : global.renderingInfo.entities += data.length;
                for (let instance of data) { 
                    if (instance.name && instance.id !== gui.playerid) global.renderingInfo.entitiesWithName++;
                    if (instance.turrets.length) getRenderingInfo(instance.turrets, true);
                };
            };
            getRenderingInfo(global.entities, false);
            if (!global.tankSpeedHistory) global.tankSpeedHistory = [];
            const HISTORY_LENGTH = 5;
            let rawSpeed = Math.sqrt(global.player.vx * global.player.vx + global.player.vy * global.player.vy) * config.roomSpeed;
            rawSpeed = rawSpeed * 0.765;
            global.tankSpeedHistory.push(rawSpeed);
            if (global.tankSpeedHistory.length > HISTORY_LENGTH) global.tankSpeedHistory.shift();
            let tankSpeed = global.tankSpeedHistory.reduce((sum, val) => sum + val, 0) / global.tankSpeedHistory.length;
            drawText("Open Source Arras", x + len, y - 50 - 10 * 14 - 2, 15, "#1081E5", "right");
            drawText("Tank Speed: " + tankSpeed.toFixed(2) + " gu/s", x + len, y - 50 - 9 * 14, 10, color.guiwhite, "right");
            drawText(`Coordinates: (${xloc.toFixed(2)}, ${yloc.toFixed(2)})`, x + len, y - 50 - 8 * 14, 10, color.guiwhite, "right");
            drawText(`Rendering: e ${global.renderingInfo.entities} t: ${global.renderingInfo.turretEntities} n: ${global.renderingInfo.entitiesWithName}`, x + len, y - 50 - 7 * 14, 10, color.guiwhite, "right");
            drawText(`Bandwidth: tx ${global.bandwidth.finalHa} rx ${global.bandwidth.finalFa}`, x + len, y - 50 - 6 * 14, 10, color.guiwhite, "right");
            drawText("Memory: " + global.metrics.rendergap.toFixed(1) + " Mib / " + "Class: " + global.mockups[parseInt(gui.type.split("-"))].name, x + len, y - 50 - 5 * 14, 10, color.guiwhite, "right");
            drawText("Update Rate: " + global.metrics.updatetime + "Hz", x + len, y - 50 - 4 * 14, 10, color.guiwhite, "right");
            drawText(`§${global.serverStats.lag_color}§ ${(100 * gui.fps).toFixed(2)}% §reset§/ ` + global.serverStats.players + ` Player${global.serverStats.players == 1 ? "" : "s"}`, x + len, y - 50 - 3 * 14, 10, color.guiwhite, "right");
            drawText("Prediction: " + Math.round(GRAPHDATA) + "ms", x + len, y - 50 - 2 * 14, 10, color.guiwhite, "right");
            drawText(`§${global.metrics.rendertime_color}§ ${global.metrics.rendertime} FPS §reset§/` + `§${global.serverStats.mspt_color}§ ${global.serverStats.mspt} mspt : ${global.metrics.mspt} gmspt`, x + len, y - 50 - 1 * 14, 10, color.guiwhite, "right");
            drawText(ping.toFixed(1) + " ms / " + global.serverStats.serverGamemodeName + " " + global.locationHash, x + len, y - 50, 10, color.guiwhite, "right");
        } else if (!global.GUIStatus.minimapReducedInfo) {
            drawText("Open Source Arras", x + len, y - 50 - 3 * 14 - 2, 15, "#1081E5", "right");
            drawText(`§${global.serverStats.lag_color}§ ${(100 * gui.fps).toFixed(2)}% §reset§/ ` + global.serverStats.players + ` Player${global.serverStats.players == 1 ? "" : "s"}`, x + len, y - 50 - 2 * 14, 10, color.guiwhite, "right");
            drawText(`§${global.metrics.rendertime_color}§ ${global.metrics.rendertime} FPS §reset§/` + `§${global.serverStats.mspt_color}§ ${global.serverStats.mspt} mspt`, x + len, y - 50 - 1 * 14, 10, color.guiwhite, "right");
            drawText(ping.toFixed(1) + " ms / " + global.serverStats.serverGamemodeName + " " + global.locationHash, x + len, y - 50, 10, color.guiwhite, "right");
        } else drawText("Open Source Arras", x + len, y - 22 - 2 * 14 - 2, 15, "#1081E5", "right");
    }

    function drawLeaderboard(spacing, alcoveSize, max) {
        // Draw leaderboard
        let lb = leaderboard.get();
        let vspacing = 4;
        let len = alcoveSize; // * global.screenWidth;
        let height = 14;
        let x = global.screenWidth - spacing - 10;
        let y = spacing + height + 13;
        lbGlide.set(0 + lb.data.length > 0);
        let glide = lbGlide.get();
        x -= lb.data.length ? len * glide : len * glide;

        // Animation things
        let mobileGlide = mobileUpgradeGlide.get();
        if (global.mobile) {
            if (global.canUpgrade && 2 * 20 + gui.upgrades.length * (6.5 * 23 + 17) > 1.4 * x) {
                y += (alcoveSize / 1.4) * mobileGlide;
            }
            y += global.canSkill || global.showSkill ? (alcoveSize / 2.2 /*+ spacing * 2*/) * statMenu.get() : 0;
        }
        drawText("Leaderboard", Math.round(x + len / 2) + 0.5, Math.round(y - 6) + 0.5, height + 3.5, color.guiwhite, "center");
        y += 7;

        for (let i = 0; i < lb.data.length; i++) {
            let entry = lb.data[i];
            let lbEntry = leaderboardEntries[entry.id];
            if (!lbEntry) {
                lbEntry = leaderboardEntries[entry.id] = {
                    ...entry,
                    leaderboardUpdate,
                    animX: Smoothbar(0, 0.30, 1.5, 0.025, true),
                    animY: Smoothbar(0, 0.30, 1.5, 0.025, true),
                    x: 0,
                    y: i,
                    targetX: 1,
                    targetY: i
                };
            }
            if (lbEntry.y !== i && lbEntry.targetY !== i) lbEntry.targetY = i;

            lbEntry.image = entry.image;
            lbEntry.position = entry.position;
            lbEntry.barColor = entry.barColor;
            lbEntry.label = entry.label;
            lbEntry.score = entry.score;
            lbEntry.nameColor = entry.nameColor;
            lbEntry.visible = true;
            lbEntry.update = leaderboardUpdate;
        }
        for (let id in leaderboardEntries) {
            let entry = leaderboardEntries[id];
            if (entry.update !== leaderboardUpdate && entry.targetX !== 0) entry.targetX = 0;
            if (entry.update === leaderboardUpdate && entry.targetX === 0) entry.targetX = 1;
            if (entry.animX.get() > 0.999) {
                entry.animX.force(0);
                entry.x = entry.targetX;
                if (entry.x === 0) { 
                    entry.visible = false;
                    delete leaderboardEntries[id];
                };
            }
            if (entry.animY.get() > 0.999) {
                entry.animY.force(0);
                entry.y = entry.targetY;
            }
            if (entry.x !== entry.targetX) entry.animX.set(1);
            if (entry.y !== entry.targetY) entry.animY.set(1);

            if (entry.visible) {
                let scale = height / entry.position.axis;
                let fullX = global.screenWidth + 1.5 * height + scale * entry.position.middle.x * Math.SQRT1_2 + 10;
                let entryX = entry.x ? x : fullX;
                if (entry.x !== entry.targetX) entryX = entryX + entry.animX.get() * ((entry.targetX ? x : fullX) - entryX);
                let entryPos = entry.y;
                if (entry.y !== entry.targetY) entryPos = entry.y + entry.animY.get() * (entry.targetY - entry.y);
                let entryY = y + (vspacing + height) * entryPos;

                drawBar(entryX, entryX + len, entryY + height / 2 - .7, height - 3 + config.graphical.barChunk, color.black);
                drawBar(entryX, entryX + len, entryY + height / 2 - .7, height - 3, color.grey);
                let shift = Math.min(1, entry.score / max);
                drawBar(entryX, entryX + len * shift, entryY + height / 2 - .7, height - 3.5, gameDraw.modifyColor(entry.barColor));

                // Leadboard name + score
                let nameColor = entry.nameColor || "#FFFFFF";
                let overwritelabel = entry.label.includes("#")
                    ? entry.label.replace("##", Math.round(entry.score).toString()).replace("#s", 1 === Math.round(entry.score) ? "" : "s")
                    : false;
                drawText(overwritelabel ? overwritelabel : entry.label + (": " + util.handleLargeNumber(Math.round(entry.score))), entryX + len / 2, entryY + height / 2, height - 4.5, nameColor == "#ffffff" ? color.guiwhite : nameColor, "center", true);

                // Mini-image
                if (entry.renderEntity) {
                    let xx = entryX - 1.5 * height - scale * entry.position.middle.x * Math.SQRT1_2,
                        yy = entryY + 0.5 * height - scale * entry.position.middle.y * Math.SQRT1_2,
                        baseColor = entry.color;
                    drawEntity(baseColor, xx, yy, entry.image, 1 / scale, 1, (scale * scale) / entry.image.size, 3, -Math.PI / 4, true, ctx[2], false, entry.image.render, false, true);
                }
            }
        }
        leaderboardUpdate++;
    }

    function drawAvailableUpgrades(spacing, alcoveSize) {
        // Draw upgrade menu
        if (gui.upgrades.length > 0) {
            let internalSpacing = 15;
            let len = alcoveSize / 2;
            let height = len;

            // Animation processing
            global.columnCount = Math.max(global.mobile ? 9 : 3, Math.floor(gui.upgrades.length ** 0.55));
            if (!global.canUpgrade) {
                upgradeMenu.force(-global.columnCount * 3)
                global.canUpgrade = true;
            } else
                if (global.pullUpgradeMenu) {
                    upgradeMenu.set(-global.columnCount * 3);
                } else upgradeMenu.set(0);
            let glide = upgradeMenu.get();

            upgradeSpin = Date.now() * 0.0005;
            upgradeSpin = upgradeSpin - (Math.floor(upgradeSpin / Math.PI / 2) * Math.PI * 2);

            let x = glide * 2 * spacing + spacing + 5;
            let y = spacing - height - internalSpacing + 5;
            let xStart = x;
            let initialX = x;
            let rowWidth = 0;
            let initialY = y;
            let ticker = 0;
            let upgradeNum = 0;
            let colorIndex = 0;
            let clickableRatio = global.canvas.height / global.screenHeight / global.ratio;
            let lastBranch = -1;
            let upgradeHoverIndex = global.clickables.upgrade.check({ x: global.mouse.x, y: global.mouse.y });

            for (let i = 0; i < gui.upgrades.length; i++) {
                let upgrade = gui.upgrades[i];
                let upgradeBranch = upgrade[0];
                let upgradeBranchLabel = upgrade[1] == "undefined" ? "" : upgrade[1];
                let model = upgrade[2];

                // Draw either in the next row or next column
                if (ticker === global.columnCount || upgradeBranch != lastBranch) {
                    x = xStart;
                    y += height + internalSpacing;
                    if (upgradeBranch != lastBranch) {
                        if (upgradeBranchLabel.length > 0) {
                            drawText(" " + upgradeBranchLabel, xStart, y + internalSpacing * 2, internalSpacing * 2.3, color.guiwhite, "left", false);
                            y += 3 * internalSpacing;
                        }
                        colorIndex = 0;
                    }
                    lastBranch = upgradeBranch;
                    ticker = 0;
                } else {
                    x += len + internalSpacing;
                }

                if (y > initialY) initialY = y;
                rowWidth = x;

                global.clickables.upgrade.place(i, x * clickableRatio, y * clickableRatio, len * clickableRatio, height * clickableRatio);
                let upgradeKey = getClassUpgradeKey(upgradeNum);

                drawEntityIcon(model, x, y, len, height, 1, upgradeSpin, 0.6, colorIndex++, !global.mobile ? upgradeKey : false, !global.mobile ? upgradeNum == upgradeHoverIndex : false);

                ticker++;
                upgradeNum++;
            }

            // Draw don't upgrade button
            let h = 19.1,
                textScale = h - 6,
                msg = "Don't Upgrade",
                m = measureText(msg, textScale),
                buttonX = initialX + (rowWidth + len - initialX) / 2,
                buttonY = initialY + height + internalSpacing - 5;

            drawButton(buttonX, buttonY, m, h, 1, "rect", msg, textScale - 3.3, false, false, false, true, "skipUpgrades", clickableRatio, 0);

            // Upgrade tooltip
            if (upgradeHoverIndex > -1 && upgradeHoverIndex < gui.upgrades.length && !global.mobile) {
                let picture = gui.upgrades[upgradeHoverIndex][2];
                if (picture.upgradeTooltip.length > 0) {
                    let boxWidth = measureText(picture.name, alcoveSize / 10),
                        boxX = global.mouse.x * global.screenWidth / global.canvas.width + 2,
                        boxY = global.mouse.y * global.screenHeight / global.canvas.height + 2,
                        boxPadding = 6,
                        splitTooltip = picture.upgradeTooltip.split("\n"),
                        textY = boxY + boxPadding + alcoveSize / 10;

                    // Tooltip box width
                    for (let line of splitTooltip) boxWidth = Math.max(boxWidth, measureText(line, alcoveSize / 15));

                    // Draw tooltip box
                    gameDraw.setColor(ctx[2], color.dgrey);
                    ctx[2].lineWidth /= 1.5;
                    drawGuiRect(boxX, boxY, boxWidth + boxPadding * 3, alcoveSize * (splitTooltip.length + 1) / 10 + boxPadding * 3, false);
                    drawGuiRect(boxX, boxY, boxWidth + boxPadding * 3, alcoveSize * (splitTooltip.length + 1) / 10 + boxPadding * 3, true);
                    ctx[2].lineWidth *= 1.5;
                    drawText(picture.name, boxX + boxPadding * 1.5, textY, alcoveSize / 10, color.guiwhite);

                    for (let t of splitTooltip) {
                        textY += boxPadding + alcoveSize / 15
                        drawText(t, boxX + boxPadding * 1.5, textY, alcoveSize / 15, color.guiwhite);
                    }
                }
            }
        } else {
            global.canUpgrade = false;
            upgradeMenu.force(0);
            global.clickables.upgrade.hide();
            global.clickables.skipUpgrades.hide();
        }
    }

    // MOBILE UI FUNCTIONS
    function drawMobileJoysticks() {
        // Draw the joysticks.
        let radius = Math.min(
            global.mobileStatus.useBigJoysticks ? global.screenWidth * 0.8 : global.screenWidth * 0.6,
            global.mobileStatus.useBigJoysticks ? global.screenHeight * 0.16 : global.screenHeight * 0.12
        );

        ctx[2].globalAlpha = 0.3;
        ctx[2].fillStyle = "#ffffff";
        ctx[2].beginPath();
        ctx[2].arc(
            (global.screenWidth * 1) / 6,
            (global.screenHeight * 2) / 3,
            radius,
            0,
            2 * Math.PI
        );
        ctx[2].arc(
            (global.screenWidth * 5) / 6,
            (global.screenHeight * 2) / 3,
            radius,
            0,
            2 * Math.PI
        );
        ctx[2].fill();
        ctx[2].globalAlpha = 0.5;
        ctx[2].fillStyle = "#ffffff";
        ctx[2].beginPath();
        if (global.mobileStatus.showJoysticks && global.canvas.movementTouchPos) {
            ctx[2].arc(
                global.canvas.movementTouchPos.x + (global.screenWidth * 1) / 6,
                global.canvas.movementTouchPos.y + (global.screenHeight * 2) / 3,
                radius / 2.5,
                0,
                2 * Math.PI
            );
            ctx[2].arc(
                global.canvas.controlTouchPos.x + (global.screenWidth * 5) / 6,
                global.canvas.controlTouchPos.y + (global.screenHeight * 2) / 3,
                radius / 2.5,
                0,
                2 * Math.PI
            );
        }
        ctx[2].fill();

        // crosshair
        drawCrosshair();
    };

    function drawCrosshair() {
        if (global.mobileStatus.showCrosshair && (global.mobileStatus.enableCrosshair || global.gamepadMode)) {
            const crosshairpos = {
                x: global.screenWidth / 2 + global.player.target.x,
                y: global.screenHeight / 2 + global.player.target.y
            };
            ctx[2].lineWidth = 1;
            ctx[2].globalAlpha = 1;
            gameDraw.setColor(ctx[2], color.black);
            ctx[2].beginPath();
            ctx[2].moveTo(crosshairpos.x, crosshairpos.y - 20);
            ctx[2].lineTo(crosshairpos.x, crosshairpos.y + 20);
            ctx[2].moveTo(crosshairpos.x - 20, crosshairpos.y);
            ctx[2].lineTo(crosshairpos.x + 20, crosshairpos.y);
            ctx[2].closePath();
            ctx[2].stroke();
        }
    }

    function drawMobileButtons(spacing, alcoveSize) {
        let makeButton = (index, x, y, width, height, text, clickableRatio) => {
            // Set the clickable's position
            global.clickables.mobileButtons.place(index, x * clickableRatio, y * clickableRatio, width * clickableRatio, height * clickableRatio);

            // Draw boxes
            ctx[2].globalAlpha = 0.5;
            ctx[2].fillStyle = color.grey;
            drawGuiRect(x, y, width, height);
            ctx[2].globalAlpha = 0.1;
            ctx[2].fillStyle = color.black;
            drawGuiRect(x, y + height * 0.6, width, height * 0.4);
            ctx[2].globalAlpha = 1;

            // Draw text
            drawText(text, x + width / 2, y + height * 0.5, height * 0.6, color.guiwhite, "center", true);

            // Draw the borders
            ctx[2].strokeStyle = color.black;
            ctx[2].lineWidth = 3;
            drawGuiRect(x, y, width, height, true);
        }

        let makeButtons = (buttons, startX, startY, baseSize, clickableRatio, spacing) => {
            let x = startX, y = startY, index = 0;

            for (let row = 0; row < buttons.length; row++) {
                for (let col = 0; col < buttons[row].length; col++) {
                    makeButton(buttons[row][col][3] ?? index, x, y, baseSize * (buttons[row][col][1] ?? 1), baseSize * (buttons[row][col][2] ?? 1), buttons[row][col][0], clickableRatio);
                    x += baseSize * (buttons[row][col][1] ?? 1) + spacing;
                    index++;
                }

                x = startX;
                y += Math.max(...buttons[row].map(b => baseSize * (b[2] ?? 1))) + spacing;
            }
        }
        if (global.clickables.mobileButtons.active == null) global.clickables.mobileButtons.active = false;
        if (global.clickables.mobileButtons.altFire == null) global.clickables.mobileButtons.altFire = false;

        // Hide the buttons
        global.clickables.mobileButtons.hide();

        // Some animations.
        mobileUpgradeGlide.set(0 + (global.canUpgrade || global.upgradeHover));

        // Some sizing variables
        let clickableRatio = global.canvas.height / global.screenHeight / global.ratio;
        let upgradeColumns = Math.ceil(gui.upgrades.length / 9);
        let yOffset = 0;
        if (global.mobile) {
            yOffset += global.canUpgrade ? (alcoveSize / 1.5 /*+ spacing * 2*/) * mobileUpgradeGlide.get() * upgradeColumns / 1.5 + spacing * (upgradeColumns + 1.55) + -17.5 : 0;
            yOffset += global.canSkill || global.showSkill ? statMenu.get() * alcoveSize / 2.6 + spacing / 0.75 : 0;
        }
        let buttons;
        let baseSize = (alcoveSize - spacing * 2) / 3;

        if (global.mobile) {
            buttons = global.clickables.mobileButtons.active ? [
                [[global.clickables.mobileButtons.active ? "-" : "+"], [`Alt ${global.clickables.mobileButtons.altFire ? "Manual" : "Disabled"}`, 6], [`${!document.fullscreenElement ? "Full" : "Exit Full"} Screen`, 5]],
                [["Autofire", 3.5], ["Reverse", 3.5], ["Self-Destruct", 5]],
                [["Autospin", 3.5], ["Override", 3.5], ["Level Up", 5]],
                [["Action", 3.5], ["Special", 3.5], ["Chat", 5]],
            ] : [
                [[global.clickables.mobileButtons.active ? "-" : "+"]],
            ];
        }
        if (global.clickables.mobileButtons.altFire) buttons.push([["\u2756", 2, 2]]);

        let len = alcoveSize;
        makeButtons(buttons, len + spacing * 2, yOffset + spacing, baseSize, clickableRatio, spacing);
    }

    function drawMobileSkillUpgrades(spacing, alcoveSize) {
        global.canSkill = gui.points > 0 && gui.skills.some(s => s.amount < s.cap) && !global.canUpgrade;
        global.showSkill = !global.canUpgrade && !global.canSkill && global.died;
        statMenu.set(global.canSkill || global.showSkill || global.disconnected ? 1 : 0);
        let n = statMenu.get();
        global.clickables.stat.hide();
        let t = alcoveSize / 2,
            q = alcoveSize / 3,
            x = 2 * n * spacing - spacing,
            statNames,
            clickableRatio = global.canvas.height / global.screenHeight / global.ratio;

            try {
                statNames = gui.getStatNames(global.mockups[parseInt(gui.type.split("-")[0])].statnames);
            } catch (e) {
                statNames = gui.getStatNames(global.missingMockup[0].statnames);
            }

        if (global.canSkill || global.showSkill) {
            for (let i = 0; i < gui.skills.length; i++) {
                let skill = gui.skills[i],
                    softcap = skill.softcap;

                if (softcap <= 0) continue;

                let amount = skill.amount,
                    skillColor = color[skill.color],
                    cap = skill.cap,
                    name = statNames[9 - i].split(/\s+/),
                    halfNameLength = Math.floor(name.length / 2),
                    [name1, name2] = name.length === 1 ? [name[0], null] : [name.slice(0, halfNameLength).join(" "), name.slice(halfNameLength).join(" ")];

                ctx[2].globalAlpha = 0.5;
                ctx[2].fillStyle = skillColor;
                drawGuiRect(x, spacing, t, 2 * q / 3);

                ctx[2].globalAlpha = 0.1;
                ctx[2].fillStyle = color.black;
                drawGuiRect(x, spacing + q * 2 / 3 * 2 / 3, t, q * 2 / 3 / 3);

                ctx[2].globalAlpha = 1;
                ctx[2].fillStyle = color.guiwhite;
                drawGuiRect(x, spacing + q * 2 / 3, t, q / 3);

                ctx[2].fillStyle = skillColor;
                drawGuiRect(x, spacing + q * 2 / 3, t * amount / softcap, q / 3);

                ctx[2].strokeStyle = color.black;
                ctx[2].lineWidth = 1;
                for (let j = 1; j < cap; j++) {
                    let width = x + j / softcap * t;
                    drawGuiLine(width, spacing + q * 2 / 3, width, spacing + q);
                }

                cap === 0 || !gui.points || softcap !== cap && amount === softcap || global.clickables.stat.place(9 - i, x * clickableRatio, spacing * clickableRatio, t * clickableRatio, q * clickableRatio);

                if (name2) {
                    drawText(name2, x + t / 2, spacing + q * 0.55, q / 5, color.guiwhite, "center");
                    drawText(name1, x + t / 2, spacing + q * 0.3, q / 5, color.guiwhite, "center");
                } else {
                    drawText(name1, x + t / 2, spacing + q * 0.425, q / 5, color.guiwhite, "center");
                }

                if (amount > 0) {
                    drawText(amount < softcap ? `+${amount}` : "MAX", x + t / 2, spacing + q * 1.3, q / 4, skillColor, "center");
                }

                ctx[2].strokeStyle = color.black;
                ctx[2].globalAlpha = 1;
                ctx[2].lineWidth = 3;
                drawGuiLine(x, spacing + q * 2 / 3, x + t, spacing + q * 2 / 3);
                drawGuiRect(x, spacing, t, q, true);

                x += n * (t + 14);
            }

            if (gui.points > 1) {
                drawText(`x${gui.points}`, x, spacing + 20, 20, color.guiwhite, "left");
            }
        }
    }; // END OF MOBILE FUNCTIONS

    let ichatInput = 0;
    function drawChatInput(x, y, instance, ratio, isize) {
        if (global.showChat === 0 || !global.canvas.chatBox) return;
        if (instance.id === gui.playerid) {
            let size = isize * ratio,
                g = Math.max(20, size);

            if (!global.showChat) {
                if (ichatInput === 0) chatInput.force(0);
                if (ichatInput >= 200) return;
                ichatInput++;
            } else if (ichatInput) {
                ichatInput = 0;
                chatInput.force(0);
            }
            if (global.died && global.showChat) {
                global.canvas.chatBox.blur();
                global.canvas.cv.focus();
                global.showChat = false;
                if (global.canvas.chatBox.value) global.canvas.chatBox.value = "";
            }

            chatInput.set(1);
            global.showChatGlide = global.showChat ? chatInput.get() : 1 - chatInput.get();
            x += global.screenWidth / 2;
            y += global.screenHeight / 2;
            let boxLengthHalf = (10.49 * g) / 2;
            global.canvas.chatBox.loadedProperly = true;
            // Box drawing
            global.canvas.chatBox.style.color = color.black;
            global.canvas.chatBox.style.backgroundColor = color.guiwhite;
            global.canvas.chatBox.style.borderColor = color.black;
            global.canvas.chatBox.style.borderWidth = 0.1 * g + 'px';
            global.canvas.chatBox.style.opacity = global.showChatGlide * 1 * global.lerp(0, 1, global.showChatGlide);
            global.canvas.chatBox.style.width = (boxLengthHalf * 2 + 0.75 * g) / global.screenWidth * 100 + `%`;
            global.canvas.chatBox.style.height = 0.95 * g + `px`;
            global.canvas.chatBox.style.left = (x - boxLengthHalf - 0.75 * g / 2) / global.screenWidth * 100 + `%`;
            global.canvas.chatBox.style.top =  (y - g * (2.26) - 0.55 * g) / global.screenWidth * window.innerWidth + `px`;
            // Input 
            global.canvas.chatInput.style.opacity = global.showChatGlide * 1 * global.lerp(0, 1, global.showChatGlide);
            global.canvas.chatInput.style["font-size"] = 0.5 * g + 'px';
            global.canvas.chatInput.style.color = color.black;
            global.canvas.chatInput.style.width = (boxLengthHalf * 2 + 0.35 * g) / global.screenWidth * 100 + `%`;
            global.canvas.chatInput.style.height = 0.95 * g + `px`;
            global.canvas.chatInput.style.left = (x - boxLengthHalf - 0.35 * g / 2) / global.screenWidth * 100 + `%`;
            global.canvas.chatInput.style.top =  (y - g * (2.26) - 0.55 * g) / global.screenWidth * window.innerWidth + `px`;
            if (global.canvas.chatBox && global.canvas.chatBox.style.opacity == 0 && !global.showChat) chatInput.force(0), global.canvas.chatInput.remove(), global.canvas.chatBox.remove(), global.canvas.chatBox = false;
        }
    }

    let getKills = () => {
        let finalKills = {
            " kills": [Math.round(global.finalKills[0].get()), 1],
            " assists": [Math.round(global.finalKills[1].get()), 0.5],
            " visitors defeated": [Math.round(global.finalKills[2].get()), 3],
            " polygons destroyed": [Math.round(global.finalKills[3].get()), 0.05],
        }, killCountTexts = [];
        let destruction = 0;
        for (let key in finalKills) {
            if (finalKills[key][0]) {
                destruction += finalKills[key][0] * finalKills[key][1];
                killCountTexts.push(finalKills[key][0] + key);
            }
        }
        return (
            (destruction === 0 ? "🌼"
                : destruction < 4 ? "🎯"
                    : destruction < 8 ? "💥"
                        : destruction < 15 ? "💢"
                            : destruction < 25 ? "🔥"
                                : destruction < 50 ? "💣"
                                    : destruction < 75 ? "👺"
                                        : destruction < 100 ? "🌶️" : "💯"
            ) + " " + (!killCountTexts.length ? "A true pacifist" :
                killCountTexts.length == 1 ? killCountTexts.join(" and ") :
                    killCountTexts.slice(0, -1).join(", ") + " and " + killCountTexts[killCountTexts.length - 1])
        );
    };

    let getDeath = () => {
        let txt = "";
        if (global.finalKillers.length) {
            txt = "🔪 Succumbed to";
            for (let e of global.finalKillers) {
                txt += " " + util.addArticle(util.requestEntityImage(e).name) + " and";
            }
            txt = txt.slice(0, -4);
        } else {
            txt += "🤷 Well that was kinda dumb huh";
        }
        return txt;
    };

    let getTips = () => {
        let txt = "❓ ";
        if (global.finalKillers.length) {
            txt += "lol you died";
        } else if (!global.autolvlUp) {
            txt += "Enable auto-level up in the options menu to get level 45";
        } else {
            txt += "Kill players and polygons to get more score";
        }
        return txt;
    };

    const gameDrawDead = () => {
        let glide = global.deathAnimation.get();
        let x = global.screenWidth / 2,
            y = Math.min(global.screenHeight / 2 - 60, global.screenHeight - 500) - 800 * (1 - global.lerp(0, 1, glide)),
            len = 140,
            position = global.mockups[parseInt(gui.type.split("-")[0])].position,
            scale = len / position.axis,
            xx = global.screenWidth / 2 - scale * position.middle.x * 0.707,
            yy = y + scale * position.middle.y * Math.SQRT1_2,
            picture = util.requestEntityImage(gui.type, gui.color),
            baseColor = picture.color,
            name = global.player.name.substring(7, global.player.name.length + 1),
            timestamp = Math.floor(Date.now() / 1000);

        clearScreen(color.black, 0.1 + 0.15 * global.lerp(0, 0.5, glide), ctx[2]);
        let ratio = util.getScreenRatio();
        scaleScreenRatio(ratio, true);
        drawEntity(baseColor, (xx - 190 - len / 2 + 0.5) | 0, (yy - -5 + 0.5) | 0, picture, 1.5, 1, (0.5 * scale) / picture.realSize, 1, -Math.PI / 4, true, ctx[2], false, picture.render, false, true);
        drawText("Level " + gui.__s.getLevel(), x - 275, y - -80, 14, color.guiwhite, "center");
        drawText(picture.name, x - 275, y - -110, 24, color.guiwhite, "center");
        drawText(timestamp + '', x, y - 80, 10, color.guiwhite, "center");
        drawText(name == "" ? "Your Score: " : name + "'s Score: ", x - 170, y - 30, 24, color.guiwhite);
        drawText(util.formatLargeNumber(Math.round(global.finalScore.get())), x - 170, y + 25, 50, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(1, 1.25, glide);
        drawText("⌚ Survived for " + util.timeForHumans(Math.round(global.finalLifetime.get())), x - 170, y + 55, 16, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(1.25, 1.5, glide);
        drawText(getKills(), x - 170, y + 77, 16, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(1.5, 1.75, glide);
        drawText(getDeath(), x - 170, y + 99, 16, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(1.75, 2, glide);
        drawText(getTips(), x - 170, y + 122, 16, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(2, 2.25, glide);
        drawText("🦆 The server was alive for " + (100 * gui.fps).toFixed(0) + "%" + " for the run", x - 170, y + 144, 16, color.guiwhite);
        ctx[2].globalAlpha = global.lerp(3, 3.25, glide);
        if (global.cannotRespawn || global.mobile || global.gamepadMode) drawText(global.cannotRespawn ?
            global.respawnTimeout ?
            "(you may respawn in " + global.respawnTimeout + " Secon" + `${global.respawnTimeout <= 1 ? 'd' : 'ds'}` + ")"
            : "(you cannot respawn)"
            : global.mobile ? 
            "(tap to respawn)"
            : global.gamepadMode ? 
            "(Press RT or R2 button to respawn)"
            : '',
            x, y + 189, 16, color.guiwhite, "center");
        if (!global.disconnected && !global.cannotRespawn) {
            if (!global.mobile && !global.gamepadMode) {
                drawButton(x - 80, y + 195, 130, 30, global.lerp(3, 3.25, glide), "rect", "Back", 15, false, false, false, true, "exitGame", global.canvas.height / global.screenHeight / global.ratio, 0);
                drawButton(x + 80, y + 195, 130, 30, global.lerp(3, 3.25, glide), "rect", "Respawn", 15, false, false, false, true, "deathRespawn", global.canvas.height / global.screenHeight / global.ratio, 0);
            } else drawButton(x, y + 215, 150, 50, global.lerp(3, 3.25, glide), "rect", "Back", 25, false, false, false, true, "exitGame", global.canvas.height / global.screenHeight / global.ratio, 0);
        } 
    };

    const applyScreenShake = (type = "camera", returnOption = false) => {
        let properties = type == "gui" ? config.graphical.shakeProperties.UIShake : config.graphical.shakeProperties.CameraShake;
        var cdx = 0;
        var cdy = 0;
        if (properties.shakeStartTime == -1) return;
        var dt = Date.now() - properties.shakeStartTime;
        if (dt > properties.shakeDuration) {
            properties.shakeStartTime = -1;
            properties.shakeDuration = -1;
            properties.shakeAmount = -1;
            return;
        }
        var easingCoef = dt / properties.shakeDuration;
        var easing = Math.pow(easingCoef - 1, 3);
        cdx = easing * (Math.cos(dt * 0.1) + Math.cos(dt * 0.3115)) * Math.random() * properties.shakeAmount;
        cdy = easing * (Math.sin(dt * 0.05) + Math.sin(dt * 0.3115)) * Math.random() * properties.shakeAmount;
        if (properties.keepShake && dt > 100) properties.shakeStartTime = Date.now();
        if (cdx == 0 && cdy == 0) return;
        if (returnOption) return {
            dx: cdx,
            dy: cdy,
        }
        global.player.renderx += cdx;
        global.player.rendery += cdy;
    }
    const drawGameplay = (tick, ratio) => {
        // Prep stuff
        global.metrics.rendertimes++;
        global.GRAPHDATA = 0;
        let tickMotion = lasttick ? tick - lasttick : null;
        lasttick = tick;
        global.clientTickMotion = null == tickMotion ? 0 : 0.99 ** tickMotion;
        let motion = compensation();
        motion.set();
        global.GRAPHDATA = motion.getPrediction();
        // Move the camera
        // Don't move the camera if you're dead. This helps with jitter issues
        let playerx = global.player.animX.get(tick);
        let playery = global.player.animY.get(tick);
        if (config.graphical.lerpAnimations) {
            global.player.renderx = util.lerp(global.player.renderx, global.player.cx.x, 0.1, true);
            global.player.rendery = util.lerp(global.player.rendery, global.player.cy.y, 0.1, true);
        } else if (config.graphical.smoothcamera) {
            global.player.renderx = global.player.renderx * global.clientTickMotion + playerx * (1 - global.clientTickMotion);
            global.player.rendery = global.player.rendery * global.clientTickMotion + playery * (1 - global.clientTickMotion);
        } else if (config.graphical.predictAnimations) {
            global.player.renderx = motion.predict(global.player.lastx, global.player.cx.x, global.player.lastvx, global.player.vx),
            global.player.rendery = motion.predict(global.player.lasty, global.player.cy.y, global.player.lastvy, global.player.vy);
        } else {
            global.player.renderx = playerx;
            global.player.rendery = playery;
        }
        if (config.graphical.shakeProperties.CameraShake.shakeStartTime !== -1) applyScreenShake();
        global.player.cx.animX = playerx;
        global.player.cy.animY = playery;
        let px = ratio * global.player.renderx,
            py = ratio * global.player.rendery;

        // Get the player's target
        if (!global.mobile && !global.gamepadMode) calculateTarget();

        let spacing = 20;
        //draw the in game stuff
        drawFloor(px, py, ratio, tick);
        drawEntities(px, py, ratio, tick, spacing);
    };

    const drawGUI = (tick, scaleRatio) => {
        scaleScreenRatio(scaleRatio, true);
        let ratio = util.getScreenRatio();
        //draw hud
        let spacing = 20;
        let alcoveSize = 200 / ratio; // drawRatio * global.screenWidth;
        gui.__s.update();
        let lb = leaderboard.get();
        let max = lb.max;
        global.canSkill = !!gui.points && !global.showTree && !global.pullSkillBar;
        let shake = false;
        if (config.graphical.shakeProperties.UIShake.shakeStartTime !== -1) shake = applyScreenShake("gui", true);
        if (shake) ctx[2].translate(shake.dx, shake.dy);
        if (global.mobile) { // MOBILE UI
            drawMobileJoysticks();
            drawMobileButtons(spacing, alcoveSize);
        }
        if (global.gamepadMode) drawCrosshair();
        if (global.GUIStatus.renderGUI) {
            drawMessages(spacing, alcoveSize);
            drawSkillBars(spacing, alcoveSize);
            drawSelfInfo(max);
            drawMinimapAndDebug(spacing, alcoveSize, global.GRAPHDATA);
            if (global.GUIStatus.renderLeaderboard) drawLeaderboard(spacing, alcoveSize, max);
            drawAvailableUpgrades(spacing, alcoveSize);
        } else drawAvailableUpgrades(spacing, alcoveSize);
        if (global.showTree) {
            drawUpgradeTree(spacing, alcoveSize);
        }
        if (shake) ctx[2].translate(-shake.dx, -shake.dy);
        global.metrics.lastrender = getNow();
    }

    function runSecondary() {
        let pingAttempt = setInterval(() => {
            if (global.gameUpdate && !global.disconnected) {
                clearInterval(pingAttempt);
                resizeEvent();
                global.socket.ping(Date.now(), socketStuff.clockDiff - socketStuff.serverStart);
            };
        }, 500);
    }

    let drawConnectingScreen = () => {
        let ratio = util.getScreenRatio();
        scaleScreenRatio(ratio, true);
        clearScreen(color.white, 1, ctx[2]);
        drawText("Connecting...", global.screenWidth / 2, global.screenHeight / 2, 30, color.guiwhite, "center");
        drawText(global.message, global.screenWidth / 2, global.screenHeight / 2 + 30, 15, color.lgreen, "center");
        drawText(global.tips, global.screenWidth / 2, global.screenHeight / 2 + 60, 15, color.guiwhite, "center");
    };

    const drawDisconnectedScreen = () => {
        let ratio = util.getScreenRatio();
        scaleScreenRatio(ratio, true);
        clearScreen(gameDraw.mixColors(color.red, color.guiblack, 0.3), global.gameStart ? 0.25 : 1, ctx[2]);
        drawText("Disconnected", global.screenWidth / 2, global.screenHeight / 2, 30, color.guiwhite, "center");
        if (global.message === '') global.message = 'The connection has closed. you may attempt to regain score or reload the game.';
        drawText(global.message, global.screenWidth / 2, global.screenHeight / 2 + 30, 15, color.orange, "center");
        lastPing = 0;
        drawButton(global.screenWidth / 2 - 80, global.screenHeight / 2 + 135, 130, 30, 1, "rect", "Back", 15, false, false, false, true, "exitGame", global.canvas.height / global.screenHeight / global.ratio, 0);
        drawButton(global.screenWidth / 2 + 80, global.screenHeight / 2 + 135, 130, 30, 1, "rect", "Reconnect", 15, false, false, false, true, "reconnect", global.canvas.height / global.screenHeight / global.ratio, 0);
    };

    const drawResyncScreen = () => {
        let ratio = util.getScreenRatio();
        scaleScreenRatio(ratio, true);
        clearScreen(gameDraw.mixColors(color.black, color.guiblack, 0.3), 0.25, ctx[2]);
        drawText("Out of sync!", global.screenWidth / 2, global.screenHeight / 2 - 10, 30, color.red, "center");
        drawText("The client is out of sync, please wait until this screen has disappeared.", global.screenWidth / 2, global.screenHeight / 2 + 40, 15, color.guiwhite, "center");
        drawText("The rendering has paused to prevent interuptions.", global.screenWidth / 2, global.screenHeight / 2 + 90, 15, color.guiwhite, "center");
    };

    const drawErrorScreen = () => {
        let ratio = util.getScreenRatio();
        scaleScreenRatio(ratio, true);
        clearScreen(gameDraw.mixColors(color.black, color.guiblack, 0.3), 0.25, ctx[2]);
        drawText("Error!", global.screenWidth / 2, global.screenHeight / 2, 30, color.red, "center");
        drawText("The client ran into an error, try to move away from the glitched entity.", global.screenWidth / 2, global.screenHeight / 2 + 30, 15, color.guiwhite, "center");
        drawText("Press F12 if you're on PC, check the console logs, and report it to the developers.", global.screenWidth / 2, global.screenHeight / 2 + 60, 15, color.guiwhite, "center");
    };
        let animationFrame =
        (!/Chrome\/8[4-6]\.0\.41([4-7][0-9]|8[0-3])\./.test(navigator.userAgent) &&
          window.requestAnimationFrame) ||
        ((a) => setTimeout(() => a(Date.now()), 1e3 / 60));
    function animloop(tick) {
        if (document.hidden) {
            setTimeout(() => animloop(Date.now()), 200); // Slow down when tab is hidden
            return;
        }
        global.loggers.master.set();
        animationFrame(animloop);
        if (global.needsFovAnimReset) {
            util.fovAnimation.force(2000);
            global.needsFovAnimReset = false;
        }
        if (global.gameStart) {
            // Update fov
            let fovtickMotion = fovlasttick ? tick - fovlasttick : null;
            fovlasttick = tick;
            let renderv = null == fovtickMotion ? 0 : config.graphical.slowerFOV ? 0.98 : 0.99 ** fovtickMotion;
            let renderfov = global.player.animv.get(tick);
            global.player.renderv = global.player.renderv * renderv + renderfov * (1 - renderv);
            // Reset collected rendering info (DEBUG)
            global.renderingInfo.entities = 0;
            global.renderingInfo.turretEntities = 0;
            global.renderingInfo.entitiesWithName = 0;
        }
    
        var ratio = config.graphical.screenshotMode ? 2 : util.getRatio();
        // Set the drawing style
        gameDraw.reanimateColors();
        for (let context of ctx) {
            context.lineCap = "round";
            context.lineJoin = "round";
            context.clearRect(0, 0, window.innerWidth + 1000, window.innerHeight + 1000);
        }
        // Figure out where we're rendering if we don't yet know
        if (isNaN(global.player.renderx) && isNaN(global.player.rendery)) {
            global.player.renderx = global.player.cx.x;
            global.player.rendery = global.player.cy.y;
        }
        // Draw the game
        if (global.gameUpdate && !global.disconnected) {
            global.time = getNow();
            if (isNaN(global.time)) { // If something isn't right, do a resync and pause the rendering.
                global.gameUpdate = false;
                global.pullUpgradeMenu = true;
                global.pullSkillBar = true;
                resizeEvent();
                resync();
            }
            if (global.time - lastPing > 1000) {
                // Get last ping.
                lastPing = global.time;
                // Do rendering speed.
                global.metrics.rendertime = global.metrics.rendertimes - 1;
                global.metrics.rendertimes = 0;
                global.fps = global.metrics.rendertime;
                // Do update rate.
                global.metrics.updatetime = global.updateTimes;
                global.updateTimes = 0;
                // Get the final bandwidth.
                global.bandwidth.finalHa = global.bandwidth.currentHa;
                global.bandwidth.finalFa = global.bandwidth.currentFa;
                global.bandwidth.currentHa = 0;
                global.bandwidth.currentFa = 0;
                if (!global.secondaryLoop) global.secondaryLoop = true, runSecondary();
                // Other
                let sum = global.loggers.master.record();
                let sum2 = global.loggers.socketMaster.record();

                global.metrics.mspt = (sum+sum2).toFixed(1);
            }
            global.metrics.lag = global.time - global.player.time;
        }
        if (global.GUIStatus.fullHDMode) ctx[2].translate(0.5, 0.5);
    
        try {
            drawGameplay(tick, ratio);
            drawGUI(tick, util.getScreenRatio());
            if (global.gameConnecting && !global.disconnected) {
                drawConnectingScreen();
            };
            if (global.died) {
                gameDrawDead();
            }
            if (isNaN(global.time)) drawResyncScreen();
            if (global.disconnected) {
                drawDisconnectedScreen();
            }
            if (global.GUIStatus.fullHDMode) ctx[2].translate(-0.5, -0.5);
    
            //oh no, we need to throw an error!
        } catch (e) {
            //hold on....
            drawErrorScreen(); // Draw the error screen.
            if (global.GUIStatus.fullHDMode) ctx[2].translate(-0.5, -0.5);

            //okay, NOW throw the error!
            throw e;
        }
        global.loggers.master.mark();
    }
})(util, global, config, Canvas, colors, gameDraw, socketStuff)

// Scale the game to fit the screen on small devices
function scaleGame() {
    const gameWidth = 500;
    const scale = Math.min(1, (window.innerWidth - 16) / gameWidth);
    document.body.style.zoom = scale;
}
window.addEventListener('resize', scaleGame);
window.addEventListener('load', scaleGame);

// HTML elements
const board = document.getElementById('game-board');
const instructionText = document.getElementById('instruction-text');
const logo = document.getElementById('logo');
const scoreEl = document.getElementById('score');
const highScoreText = document.getElementById('highScore');
const equationDisplay = document.getElementById('equation-display');

// Audio
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playBiteSound() {
    const ctx = getAudioCtx();
    const duration = 0.12;

    // White noise burst for the crunch
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter shapes the noise into a crunch
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;

    // Quick fade out
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    noise.stop(ctx.currentTime + duration);
}

// BGM — note frequencies & sequence data
const N = {
    C3:130.81, D3:146.83, E3:164.81, F3:174.61, G3:196.00, A3:220.00,
    C5:523.25, D5:587.33, E5:659.25, G5:783.99, A5:880.00,
    R: 0
};
const STEP = 60 / (160 * 4); // sixteenth note at 160 BPM (~0.094 s)

// [frequency, length_in_sixteenth_steps]
const bgmMelody = [
    // bar 1
    [N.E5,1],[N.R,1],[N.D5,1],[N.R,1],[N.C5,2],[N.R,2],
    [N.E5,1],[N.R,1],[N.G5,1],[N.R,1],[N.A5,2],[N.R,2],
    // bar 2
    [N.G5,1],[N.R,1],[N.E5,1],[N.R,1],[N.D5,2],[N.R,2],
    [N.C5,1],[N.R,1],[N.E5,1],[N.R,1],[N.G5,2],[N.R,2],
    // bar 3
    [N.A5,1],[N.R,1],[N.G5,1],[N.R,1],[N.E5,1],[N.R,1],[N.D5,1],[N.R,1],
    [N.C5,1],[N.R,1],[N.D5,1],[N.R,1],[N.E5,2],[N.R,2],
    // bar 4
    [N.G5,1],[N.R,1],[N.A5,1],[N.R,1],[N.G5,2],[N.R,2],
    [N.E5,3],[N.R,1],[N.C5,3],[N.R,1],
];

const bgmBass = [
    // bar 1
    [N.C3,4],[N.G3,4],[N.C3,4],[N.G3,4],
    // bar 2
    [N.F3,4],[N.C3,4],[N.G3,4],[N.D3,4],
    // bar 3
    [N.A3,4],[N.E3,4],[N.F3,4],[N.C3,4],
    // bar 4
    [N.G3,4],[N.D3,4],[N.C3,8],
];

const BGM_LOOP_DURATION = bgmMelody.reduce((s, [, steps]) => s + steps, 0) * STEP; // ~6 s

let bgmPlaying    = false;
let bgmNextLoop   = 0;
let bgmTickId     = null;
let bgmMasterGain = null;

function getBGMMaster() {
    if (!bgmMasterGain) {
        const ctx = getAudioCtx();
        bgmMasterGain = ctx.createGain();
        bgmMasterGain.connect(ctx.destination);
    }
    return bgmMasterGain;
}

function scheduleSequence(seq, type, vol, startTime) {
    const ctx = getAudioCtx();
    const master = getBGMMaster();
    let t = startTime;
    seq.forEach(([freq, steps]) => {
        const dur = steps * STEP;
        if (freq > 0) {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            g.gain.setValueAtTime(vol, t);
            g.gain.setValueAtTime(vol, t + dur * 0.82);
            g.gain.linearRampToValueAtTime(0, t + dur);
            osc.connect(g);
            g.connect(master);
            osc.start(t);
            osc.stop(t + dur);
        }
        t += dur;
    });
}

function scheduleBGMLoop(startTime) {
    scheduleSequence(bgmMelody, 'square',   0.05, startTime);
    scheduleSequence(bgmBass,   'triangle', 0.03, startTime);
    bgmNextLoop = startTime + BGM_LOOP_DURATION;
}

function bgmTick() {
    if (!bgmPlaying) return;
    const ctx = getAudioCtx();
    // Keep scheduling loops 2 seconds ahead
    while (bgmNextLoop < ctx.currentTime + 2.0) {
        scheduleBGMLoop(bgmNextLoop);
    }
}

function startBGM() {
    if (bgmPlaying) return;
    bgmPlaying = true;
    const ctx    = getAudioCtx();
    const master = getBGMMaster();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    bgmNextLoop = ctx.currentTime + 0.05;
    scheduleBGMLoop(bgmNextLoop);
    bgmTickId = setInterval(bgmTick, 500);
}

function stopBGM() {
    if (!bgmPlaying) return;
    bgmPlaying = false;
    clearInterval(bgmTickId);
    bgmTickId = null;
    const ctx    = getAudioCtx();
    const master = getBGMMaster();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
}

// Game variables
let gridSize = 10;
let snake = [{ x: 5, y: 5 }];
let foods = [];
let currentEquation = null;
let highScore = 0;
let direction = 'right';
let gameInterval;
let gameSpeedDelay = 300;
let gameStarted = false;

// Generate a random math equation and its answer
function generateEquation() {
    const operations = ['+', '-', '*'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    let a, b, answer;

    if (op === '+') {
        a = Math.floor(Math.random() * 10) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a + b;
    } else if (op === '-') {
        a = Math.floor(Math.random() * 10) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        if (a < b) [a, b] = [b, a];
        if (a === b) a++; // avoid answer of 0
        answer = a - b;
    } else {
        a = Math.floor(Math.random() * 9) + 1;
        b = Math.floor(Math.random() * 9) + 1;
        answer = a * b;
    }

    return { expression: `${a} ${op} ${b}`, answer };
}

// Number of food items scales with snake length (more distractors as you grow)
function getFoodCount() {
    return Math.min(snake.length + 2, 7);
}

function isOnSnake(x, y) {
    return snake.some(seg => seg.x === x && seg.y === y);
}

function isOnOtherFood(x, y) {
    return foods.some(f => f.x === x && f.y === y);
}

function generateFoods() {
    foods = [];
    const correct = currentEquation.answer;
    const numFoods = getFoodCount();

    // Generate unique wrong values in a plausible range
    const maxVal = Math.max(correct + 15, 20);
    const usedValues = new Set([correct]);
    const wrongValues = [];

    while (wrongValues.length < numFoods - 1) {
        const wrong = Math.floor(Math.random() * maxVal) + 1;
        if (!usedValues.has(wrong)) {
            usedValues.add(wrong);
            wrongValues.push(wrong);
        }
    }

    // Shuffle all values so the correct one is in a random position
    const allValues = [correct, ...wrongValues];
    for (let i = allValues.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allValues[i], allValues[j]] = [allValues[j], allValues[i]];
    }

    // Place each food at a random unoccupied cell
    allValues.forEach(value => {
        let x, y;
        do {
            x = Math.floor(Math.random() * gridSize) + 1;
            y = Math.floor(Math.random() * gridSize) + 1;
        } while (isOnSnake(x, y) || isOnOtherFood(x, y));
        foods.push({ x, y, value });
    });
}

// Draw everything
function draw() {
    if (!gameStarted) return;
    board.innerHTML = '';
    drawSnake();
    drawFoods();
    updateScore();
}

function drawSnake() {
    snake.forEach((segment, index) => {
        const el = createGameElement('div', index === 0 ? 'snake snake-head' : 'snake');
        if (index === 0) el.dataset.dir = direction;
        setPosition(el, segment);
        board.appendChild(el);
    });
}

function drawFoods() {
    if (!gameStarted) return;
    foods.forEach(food => {
        const el = createGameElement('div', 'food');
        el.textContent = food.value;
        setPosition(el, food);
        board.appendChild(el);
    });
}

function createGameElement(tag, className) {
    const element = document.createElement(tag);
    element.className = className;
    return element;
}

function setPosition(element, position) {
    element.style.gridColumn = position.x;
    element.style.gridRow = position.y;
}

// Returns the head position if the snake moved in the given direction
function getNextHead(dir) {
    const head = { ...snake[0] };
    switch (dir) {
        case 'right': head.x++; break;
        case 'left':  head.x--; break;
        case 'down':  head.y++; break;
        case 'up':    head.y--; break;
    }
    return head;
}

function isOutOfBounds(pos) {
    return pos.x < 1 || pos.x > gridSize || pos.y < 1 || pos.y > gridSize;
}

// The two perpendicular directions for each direction
const perpendicularTurns = {
    right: ['up', 'down'],
    left:  ['up', 'down'],
    up:    ['left', 'right'],
    down:  ['left', 'right'],
};

function move() {
    let nextHead = getNextHead(direction);

    // Wall hit: randomly try one of the two perpendicular turns
    if (isOutOfBounds(nextHead)) {
        const turns = [...perpendicularTurns[direction]];
        if (Math.random() < 0.5) turns.reverse();

        for (const turn of turns) {
            const candidate = getNextHead(turn);
            if (!isOutOfBounds(candidate)) {
                direction = turn;
                nextHead = candidate;
                break;
            }
        }
    }

    snake.unshift(nextHead);

    // Check if a food was eaten
    const eatenIndex = foods.findIndex(f => f.x === nextHead.x && f.y === nextHead.y);
    if (eatenIndex !== -1) {
        const eaten = foods[eatenIndex];
        if (eaten.value === currentEquation.answer) {
            // Correct answer — grow, new equation, speed up
            playBiteSound();
            currentEquation = generateEquation();
            generateFoods();
            updateEquationDisplay();
            increaseSpeed();
            clearInterval(gameInterval);
            gameInterval = setInterval(() => {
                move();
                checkCollision();
                draw();
            }, gameSpeedDelay);
            // Snake grows: don't pop the tail
        } else {
            // Wrong answer — game over
            resetGame();
            return;
        }
    } else {
        snake.pop();
    }
}

function updateEquationDisplay() {
    equationDisplay.textContent = currentEquation ? `${currentEquation.expression} = ?` : '';
}

function startGame() {
    gameStarted = true;
    instructionText.style.display = 'none';
    logo.style.display = 'none';
    currentEquation = generateEquation();
    generateFoods();
    updateEquationDisplay();
    equationDisplay.style.display = 'block';
    startBGM();
    gameInterval = setInterval(() => {
        move();
        checkCollision();
        draw();
    }, gameSpeedDelay);
}

// Keypress handler — also prevents 180-degree reversal
function handlekeypress(event) {
    if (!gameStarted && (event.code === 'Space' || event.key === ' ')) {
        startGame();
    } else if (gameStarted) {
        switch (event.key) {
            case 'ArrowUp':    if (direction !== 'down')  direction = 'up';    break;
            case 'ArrowDown':  if (direction !== 'up')    direction = 'down';  break;
            case 'ArrowRight': if (direction !== 'left')  direction = 'right'; break;
            case 'ArrowLeft':  if (direction !== 'right') direction = 'left';  break;
        }
    }
}

document.addEventListener('keydown', handlekeypress);

// D-pad buttons
function handleDpad(newDirection) {
    if (!gameStarted) {
        startGame();
        return;
    }
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (direction !== opposite[newDirection]) direction = newDirection;
}

document.getElementById('btn-up').addEventListener('click',    () => handleDpad('up'));
document.getElementById('btn-down').addEventListener('click',  () => handleDpad('down'));
document.getElementById('btn-left').addEventListener('click',  () => handleDpad('left'));
document.getElementById('btn-right').addEventListener('click', () => handleDpad('right'));

function increaseSpeed() {
    if      (gameSpeedDelay > 150) gameSpeedDelay -= 3;
    else if (gameSpeedDelay > 100) gameSpeedDelay -= 2;
    else if (gameSpeedDelay > 50)  gameSpeedDelay -= 1;
    else if (gameSpeedDelay > 25)  gameSpeedDelay -= 1;
}

// Self-collision only (wall handled in move())
function checkCollision() {
    const head = snake[0];
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            resetGame();
            return;
        }
    }
}

function resetGame() {
    updateHighScore();
    stopGame();
    snake = [{ x: 5, y: 5 }];
    foods = [];
    direction = 'right';
    gameSpeedDelay = 200;
    currentEquation = null;
    equationDisplay.style.display = 'none';
    equationDisplay.textContent = '';
    board.innerHTML = '';
    updateScore();
}

function updateScore() {
    const currentScore = snake.length - 1;
    scoreEl.textContent = currentScore.toString().padStart(3, '0');
}

function stopGame() {
    clearInterval(gameInterval);
    gameStarted = false;
    stopBGM();
    instructionText.style.display = 'block';
    logo.style.display = 'block';
    updateHighScore();
}

function updateHighScore() {
    const currentScore = snake.length - 1;
    if (currentScore > highScore) {
        highScore = currentScore;
        highScoreText.textContent = highScore.toString().padStart(3, '0');
    }
    highScoreText.style.display = 'block';
}

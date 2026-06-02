/*
 * Trivia Rush — LAN Multiplayer Server
 * Run: node server.js
 * Then open http://YOUR_LOCAL_IP:3000 on any device on the same WiFi
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

// ── Game state ────────────────────────────────────────────
let players = {};       // { id: { id, name, speed, score, correctCount, lapCount, alive, course } }
let gamePhase = "lobby"; // lobby | game | ended
let questionQueue = [];
let currentQuestion = null;
let questionIndex = 0;
let questionTimer = null;
let answerBuffer = {}; // { playerId: answerIdx } collected per question
let hostId = null;

// ── Question bank (120+ questions) ───────────────────────
const QUESTIONS = [
  { q: "Which planet is closest to the Sun?", a: ["Mercury","Venus","Mars","Jupiter"], correct:0, diff:1 },
  { q: "What is the capital of France?", a: ["London","Berlin","Paris","Madrid"], correct:2, diff:1 },
  { q: "Who painted the Mona Lisa?", a: ["Picasso","Michelangelo","Da Vinci","Rembrandt"], correct:2, diff:1 },
  { q: "What is H2O commonly known as?", a: ["Salt","Water","Acid","Oxygen"], correct:1, diff:1 },
  { q: "How many sides does a hexagon have?", a: ["5","6","7","8"], correct:1, diff:1 },
  { q: "Which ocean is the largest?", a: ["Atlantic","Indian","Arctic","Pacific"], correct:3, diff:1 },
  { q: "What year did World War II end?", a: ["1943","1944","1945","1946"], correct:2, diff:2 },
  { q: "Who wrote 'Romeo and Juliet'?", a: ["Dickens","Shakespeare","Tolstoy","Austen"], correct:1, diff:1 },
  { q: "What is the approximate speed of light?", a: ["100,000 km/s","200,000 km/s","300,000 km/s","400,000 km/s"], correct:2, diff:2 },
  { q: "Which country has the most natural lakes?", a: ["USA","Russia","Brazil","Canada"], correct:3, diff:2 },
  { q: "What is the largest organ in the human body?", a: ["Heart","Liver","Brain","Skin"], correct:3, diff:1 },
  { q: "Who directed Jurassic Park?", a: ["James Cameron","Steven Spielberg","George Lucas","Ridley Scott"], correct:1, diff:2 },
  { q: "What currency does Japan use?", a: ["Yuan","Won","Yen","Baht"], correct:2, diff:1 },
  { q: "How many bones in the adult human body?", a: ["196","206","216","226"], correct:1, diff:2 },
  { q: "What is the tallest mountain on Earth?", a: ["K2","Kangchenjunga","Everest","Lhotse"], correct:2, diff:1 },
  { q: "Which element has atomic number 79?", a: ["Silver","Platinum","Gold","Copper"], correct:2, diff:3 },
  { q: "In what year was the Eiffel Tower completed?", a: ["1879","1889","1899","1909"], correct:1, diff:2 },
  { q: "What is the longest river in the world?", a: ["Amazon","Nile","Mississippi","Yangtze"], correct:1, diff:2 },
  { q: "Which planet has the most moons?", a: ["Jupiter","Saturn","Uranus","Neptune"], correct:1, diff:3 },
  { q: "Who was the first person to walk on the Moon?", a: ["Buzz Aldrin","Yuri Gagarin","Neil Armstrong","John Glenn"], correct:2, diff:1 },
  { q: "What is the smallest country in the world?", a: ["Monaco","San Marino","Vatican City","Liechtenstein"], correct:2, diff:2 },
  { q: "Which programming language was created first?", a: ["C","FORTRAN","Python","Java"], correct:1, diff:3 },
  { q: "What is the hardest natural substance?", a: ["Platinum","Quartz","Diamond","Titanium"], correct:2, diff:1 },
  { q: "How many strings does a standard guitar have?", a: ["4","5","6","7"], correct:2, diff:1 },
  { q: "Who wrote '1984'?", a: ["Aldous Huxley","George Orwell","Ray Bradbury","Philip K. Dick"], correct:1, diff:2 },
  { q: "What is the capital of Australia?", a: ["Sydney","Melbourne","Brisbane","Canberra"], correct:3, diff:2 },
  { q: "What year did the Titanic sink?", a: ["1910","1911","1912","1913"], correct:2, diff:1 },
  { q: "Which gas makes up most of Earth's atmosphere?", a: ["Oxygen","Carbon Dioxide","Nitrogen","Argon"], correct:2, diff:2 },
  { q: "What is the square root of 144?", a: ["10","11","12","13"], correct:2, diff:1 },
  { q: "Who discovered penicillin?", a: ["Marie Curie","Alexander Fleming","Louis Pasteur","Joseph Lister"], correct:1, diff:2 },
  { q: "What is the powerhouse of the cell?", a: ["Nucleus","Ribosome","Mitochondria","Golgi Body"], correct:2, diff:1 },
  { q: "How many planets are in our solar system?", a: ["7","8","9","10"], correct:1, diff:1 },
  { q: "What language is the most spoken natively worldwide?", a: ["English","Hindi","Mandarin Chinese","Spanish"], correct:2, diff:2 },
  { q: "What is the freezing point of water in Celsius?", a: ["-10","0","10","32"], correct:1, diff:1 },
  { q: "Who invented the telephone?", a: ["Thomas Edison","Nikola Tesla","Alexander Graham Bell","Guglielmo Marconi"], correct:2, diff:1 },
  { q: "What is the largest continent by area?", a: ["Africa","North America","Europe","Asia"], correct:3, diff:1 },
  { q: "In which year did the Berlin Wall fall?", a: ["1987","1988","1989","1990"], correct:2, diff:2 },
  { q: "What is the name of the ship in Moby Dick?", a: ["Nautilus","Pequod","Enterprise","Beagle"], correct:1, diff:3 },
  { q: "How many teeth does an adult human have?", a: ["28","30","32","34"], correct:2, diff:2 },
  { q: "Who composed the Fifth Symphony?", a: ["Mozart","Handel","Beethoven","Bach"], correct:2, diff:2 },
  { q: "What is the largest species of shark?", a: ["Great White","Hammerhead","Whale Shark","Bull Shark"], correct:2, diff:2 },
  { q: "Which country invented pizza?", a: ["Greece","France","Spain","Italy"], correct:3, diff:1 },
  { q: "What is the name of Harry Potter's owl?", a: ["Crookshanks","Hedwig","Errol","Fawkes"], correct:1, diff:1 },
  { q: "In what year did the first iPhone launch?", a: ["2005","2006","2007","2008"], correct:2, diff:2 },
  { q: "What is the chemical symbol for gold?", a: ["Go","Gd","Au","Ag"], correct:2, diff:2 },
  { q: "Who played Iron Man in the MCU?", a: ["Chris Evans","Chris Hemsworth","Robert Downey Jr.","Mark Ruffalo"], correct:2, diff:1 },
  { q: "Which country is home to the Great Barrier Reef?", a: ["New Zealand","Australia","Fiji","Indonesia"], correct:1, diff:1 },
  { q: "What does DNA stand for?", a: ["Deoxyribonucleic Acid","Dinucleic Acid","Diaminonucleic Acid","Deoxynatural Acid"], correct:0, diff:2 },
  { q: "How many colors are in a rainbow?", a: ["5","6","7","8"], correct:2, diff:1 },
  { q: "What is the capital of Brazil?", a: ["Rio de Janeiro","São Paulo","Salvador","Brasília"], correct:3, diff:2 },
  { q: "Which planet is known as the Red Planet?", a: ["Venus","Jupiter","Mars","Saturn"], correct:2, diff:1 },
  { q: "Who wrote the Harry Potter series?", a: ["Stephenie Meyer","J.R.R. Tolkien","J.K. Rowling","C.S. Lewis"], correct:2, diff:1 },
  { q: "What year did World War I begin?", a: ["1912","1913","1914","1915"], correct:2, diff:2 },
  { q: "What is the largest desert in the world?", a: ["Sahara","Gobi","Kalahari","Antarctic"], correct:3, diff:3 },
  { q: "How many hearts does an octopus have?", a: ["1","2","3","4"], correct:2, diff:2 },
  { q: "What is Pi approximately equal to?", a: ["3.12","3.14","3.16","3.18"], correct:1, diff:1 },
  { q: "Which artist painted the Sistine Chapel ceiling?", a: ["Da Vinci","Raphael","Michelangelo","Botticelli"], correct:2, diff:2 },
  { q: "What is the smallest planet in our solar system?", a: ["Mars","Venus","Mercury","Pluto"], correct:2, diff:2 },
  { q: "In Greek mythology, who is the god of the sea?", a: ["Zeus","Ares","Poseidon","Hades"], correct:2, diff:1 },
  { q: "Which country has the most time zones?", a: ["Russia","USA","China","France"], correct:3, diff:3 },
  { q: "What is the longest bone in the human body?", a: ["Tibia","Fibula","Femur","Humerus"], correct:2, diff:2 },
  { q: "Which country is the Colosseum located in?", a: ["Greece","Spain","Italy","Turkey"], correct:2, diff:1 },
  { q: "Who proposed the theory of relativity?", a: ["Newton","Darwin","Einstein","Hawking"], correct:2, diff:1 },
  { q: "How many keys does a standard piano have?", a: ["76","80","88","92"], correct:2, diff:2 },
  { q: "Which continent is Egypt on?", a: ["Asia","Europe","Africa","Middle East"], correct:2, diff:1 },
  { q: "What is the world's fastest land animal?", a: ["Lion","Peregrine Falcon","Cheetah","Greyhound"], correct:2, diff:1 },
  { q: "Who wrote 'The Great Gatsby'?", a: ["Ernest Hemingway","F. Scott Fitzgerald","William Faulkner","John Steinbeck"], correct:1, diff:2 },
  { q: "What is the largest moon of Saturn?", a: ["Europa","Ganymede","Titan","Callisto"], correct:2, diff:3 },
  { q: "How many chambers does a human heart have?", a: ["2","3","4","5"], correct:2, diff:1 },
  { q: "Which sport uses a shuttlecock?", a: ["Tennis","Squash","Badminton","Pickleball"], correct:2, diff:1 },
  { q: "What is the official language of Brazil?", a: ["Spanish","English","Portuguese","French"], correct:2, diff:1 },
  { q: "Who invented the World Wide Web?", a: ["Bill Gates","Steve Jobs","Tim Berners-Lee","Vint Cerf"], correct:2, diff:2 },
  { q: "What is the capital of Russia?", a: ["St. Petersburg","Novosibirsk","Vladivostok","Moscow"], correct:3, diff:1 },
  { q: "Who was the first female Nobel Prize winner?", a: ["Rosalind Franklin","Marie Curie","Dorothy Hodgkin","Rita Levi-Montalcini"], correct:1, diff:2 },
  { q: "What is the rarest blood type?", a: ["O negative","A negative","B negative","AB negative"], correct:3, diff:2 },
  { q: "In what country is Mount Kilimanjaro?", a: ["Kenya","Tanzania","Uganda","Ethiopia"], correct:1, diff:2 },
  { q: "How many letters are in the Greek alphabet?", a: ["22","24","26","28"], correct:1, diff:3 },
  { q: "In which city is the Louvre museum?", a: ["London","Rome","Madrid","Paris"], correct:3, diff:1 },
  { q: "What is the deepest ocean trench?", a: ["Puerto Rico Trench","Java Trench","Mariana Trench","Philippine Trench"], correct:2, diff:2 },
  { q: "What is the most abundant gas in Earth's atmosphere?", a: ["Oxygen","Carbon Dioxide","Nitrogen","Hydrogen"], correct:2, diff:2 },
  { q: "Who is known as the Father of Computers?", a: ["Alan Turing","Charles Babbage","John von Neumann","Ada Lovelace"], correct:1, diff:2 },
  { q: "How many days are in a leap year?", a: ["364","365","366","367"], correct:2, diff:1 },
  { q: "What year did the Soviet Union dissolve?", a: ["1989","1990","1991","1992"], correct:2, diff:2 },
  { q: "Which hormone regulates blood sugar?", a: ["Adrenaline","Insulin","Cortisol","Serotonin"], correct:1, diff:2 },
  { q: "What is the smallest continent?", a: ["Europe","Antarctica","Australia","South America"], correct:2, diff:1 },
  { q: "Who sang Thriller?", a: ["Prince","Michael Jackson","David Bowie","Elton John"], correct:1, diff:1 },
  { q: "Which country invented the compass?", a: ["Egypt","Greece","China","India"], correct:2, diff:2 },
  { q: "How many days does Earth take to orbit the Sun?", a: ["355","360","365.25","370"], correct:2, diff:2 },
  { q: "What is the capital of Canada?", a: ["Toronto","Vancouver","Montreal","Ottawa"], correct:3, diff:2 },
  { q: "Who painted Starry Night?", a: ["Monet","Van Gogh","Cézanne","Gauguin"], correct:1, diff:1 },
  { q: "What is the national animal of Scotland?", a: ["Stag","Thistle","Unicorn","Lion"], correct:2, diff:3 },
  { q: "In what year did man first land on the moon?", a: ["1967","1968","1969","1970"], correct:2, diff:1 },
  { q: "What does HTML stand for?", a: ["Hyperlink Text Markup Language","HyperText Markup Language","Home Tool Markup Language","Hypertext Mediation Language"], correct:1, diff:1 },
  { q: "Which country has the largest population?", a: ["USA","Brazil","India","China"], correct:2, diff:1 },
  { q: "What is the main component of the Sun?", a: ["Helium","Hydrogen","Oxygen","Nitrogen"], correct:1, diff:2 },
  { q: "Who created the theory of evolution?", a: ["Gregor Mendel","Charles Darwin","Alfred Wallace","Jean-Baptiste Lamarck"], correct:1, diff:1 },
  { q: "How many vertices does a cube have?", a: ["6","7","8","10"], correct:2, diff:2 },
  { q: "What is the capital of China?", a: ["Shanghai","Guangzhou","Beijing","Chongqing"], correct:2, diff:1 },
  { q: "Which country is the origin of sushi?", a: ["China","Korea","Japan","Thailand"], correct:2, diff:1 },
  { q: "How many zeros are in one billion?", a: ["7","8","9","10"], correct:2, diff:2 },
  { q: "What is the name of our galaxy?", a: ["Andromeda","Triangulum","Milky Way","Whirlpool"], correct:2, diff:1 },
  { q: "Which country gifted the Statue of Liberty to the USA?", a: ["England","France","Germany","Italy"], correct:1, diff:2 },
  { q: "What year was Google founded?", a: ["1996","1997","1998","1999"], correct:2, diff:2 },
  { q: "What does USB stand for?", a: ["Universal Serial Bus","Universal System Bridge","Unified Serial Bus","Universal Software Base"], correct:0, diff:2 },
  { q: "How many ounces are in a pound?", a: ["12","14","16","20"], correct:2, diff:1 },
  { q: "What color is a male cardinal bird?", a: ["Blue","Yellow","Red","Green"], correct:2, diff:1 },
  { q: "What language did Shakespeare write in?", a: ["Old English","Middle English","Early Modern English","Modern English"], correct:2, diff:3 },
  { q: "Which film won the Oscar for Best Picture in 1994?", a: ["Forrest Gump","Pulp Fiction","Schindler's List","The Shawshank Redemption"], correct:2, diff:3 },
  { q: "What is the chemical symbol for iron?", a: ["Ir","Fe","In","Fr"], correct:1, diff:2 },
  { q: "How many sides does an octagon have?", a: ["6","7","8","9"], correct:2, diff:1 },
  { q: "Who wrote 'A Brief History of Time'?", a: ["Carl Sagan","Neil deGrasse Tyson","Stephen Hawking","Richard Feynman"], correct:2, diff:2 },
  { q: "What is the capital of Japan?", a: ["Osaka","Kyoto","Hiroshima","Tokyo"], correct:3, diff:1 },
  { q: "Which animal is the largest on Earth?", a: ["African Elephant","Giraffe","Blue Whale","Colossal Squid"], correct:2, diff:1 },
  { q: "What year was Facebook founded?", a: ["2002","2003","2004","2005"], correct:2, diff:2 },
  { q: "What is the chemical formula for table salt?", a: ["KCl","NaBr","NaCl","CaCl2"], correct:2, diff:2 },
  { q: "Who invented the lightbulb?", a: ["Nikola Tesla","Alexander Graham Bell","Thomas Edison","James Watt"], correct:2, diff:1 },
  { q: "How many continents are there on Earth?", a: ["5","6","7","8"], correct:2, diff:1 },
  { q: "What is the capital of Germany?", a: ["Munich","Hamburg","Frankfurt","Berlin"], correct:3, diff:1 },
  { q: "Which planet is closest in size to Earth?", a: ["Mars","Mercury","Venus","Uranus"], correct:2, diff:2 },
  { q: "What sport is Wimbledon associated with?", a: ["Cricket","Golf","Tennis","Polo"], correct:2, diff:1 },
  { q: "Who wrote 'The Odyssey'?", a: ["Virgil","Sophocles","Homer","Plato"], correct:2, diff:2 },
  { q: "What is the atomic number of carbon?", a: ["4","6","8","12"], correct:1, diff:2 },
];

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ── HTTP server (serves index.html) ──────────────────────
const httpServer = http.createServer((req, res) => {
  const filePath = path.join(__dirname, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Map(); // ws -> playerId

function broadcast(msg, excludeId = null) {
  const data = JSON.stringify(msg);
  for (const [ws, pid] of clients) {
    if (pid !== excludeId && ws.readyState === 1) ws.send(data);
  }
}

function broadcastAll(msg) {
  const data = JSON.stringify(msg);
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function sendTo(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function getPlayerList() {
  return Object.values(players);
}

function startQuestionTimer() {
  clearTimeout(questionTimer);
  questionTimer = setTimeout(() => {
    // Time's up — push timeout for all who haven't answered
    const playerIds = Object.keys(players);
    for (const pid of playerIds) {
      if (!(pid in answerBuffer)) answerBuffer[pid] = -1;
    }
    resolveQuestion();
  }, 16000); // 15s + 1s buffer
}

function pushNextQuestion() {
  if (questionIndex >= questionQueue.length) {
    questionQueue = shuffle(QUESTIONS);
    questionIndex = 0;
  }
  currentQuestion = questionQueue[questionIndex++];
  answerBuffer = {};
  broadcastAll({
    type: "QUESTION",
    payload: {
      question: currentQuestion,
      index: questionIndex,
      total: questionQueue.length,
      timestamp: Date.now(),
    }
  });
  startQuestionTimer();
}

function resolveQuestion() {
  clearTimeout(questionTimer);
  if (!currentQuestion) return;

  // Apply speed/score changes per player
  for (const [pid, ansIdx] of Object.entries(answerBuffer)) {
    const p = players[pid];
    if (!p) continue;
    const timeTaken = (answerBuffer[`${pid}_time`] || 15);
    const correct = ansIdx === currentQuestion.correct;
    const diff = currentQuestion.diff || 2;

    const progressBonus = (p.totalAnswered / 150) * 8;
    const speedBonus = Math.max(0, (15 - timeTaken) / 15) * 10;
    const diffBonus = diff * 4;
    let delta;
    if (!correct) {
      delta = (diff <= 1 ? -18 : diff === 2 ? -12 : -8) - progressBonus * 0.3;
      p.wrongStreak = (p.wrongStreak || 0) + 1;
    } else {
      delta = progressBonus + speedBonus + diffBonus;
      p.wrongStreak = 0;
      p.correctCount = (p.correctCount || 0) + 1;
    }
    p.speed = Math.max(2, Math.min(120, (p.speed || 30) + delta));
    p.totalAnswered = (p.totalAnswered || 0) + 1;

    // Death check
    if ((p.speed <= 6 || p.wrongStreak >= 4) && p.alive) {
      p.alive = false;
      sendTo(getWsForPlayer(pid), { type: "DEATH", payload: { speed: p.speed, wrongStreak: p.wrongStreak } });
    }
  }

  // Reveal correct answer to all
  broadcastAll({
    type: "ANSWER_REVEAL",
    payload: {
      correct: currentQuestion.correct,
      answers: answerBuffer,
      players: getPlayerList(),
    }
  });

  // Check if everyone is dead
  const alive = Object.values(players).filter(p => p.alive);
  if (alive.length === 0) {
    endGame();
    return;
  }

  setTimeout(pushNextQuestion, 2000);
}

function endGame() {
  gamePhase = "ended";
  const sorted = Object.values(players).sort((a, b) => (b.correctCount || 0) - (a.correctCount || 0));
  broadcastAll({ type: "GAME_OVER", payload: { players: sorted } });
}

function getWsForPlayer(pid) {
  for (const [ws, id] of clients) { if (id === pid) return ws; }
  return null;
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type, payload } = msg;

    if (type === "JOIN") {
      const pid = payload.id;
      clients.set(ws, pid);
      if (!hostId || !players[hostId]) hostId = pid;
      players[pid] = {
        id: pid,
        name: payload.name || "Player",
        course: payload.course || "horror",
        speed: 30,
        correctCount: 0,
        totalAnswered: 0,
        lapCount: 0,
        wrongStreak: 0,
        pos: 0,
        alive: true,
      };
      // Tell joiner their role and current state
      sendTo(ws, {
        type: "WELCOME",
        payload: {
          isHost: pid === hostId,
          players: getPlayerList(),
          gamePhase,
          currentQuestion: gamePhase === "game" ? currentQuestion : null,
        }
      });
      // Tell everyone else
      broadcast({ type: "PLAYER_JOINED", payload: players[pid] }, pid);
      broadcastAll({ type: "PLAYER_LIST", payload: getPlayerList() });
    }

    if (type === "START_GAME") {
      if (clients.get(ws) !== hostId) return;
      gamePhase = "game";
      questionQueue = shuffle(QUESTIONS);
      questionIndex = 0;
      // Reset all players
      for (const p of Object.values(players)) {
        p.speed = 30; p.correctCount = 0; p.totalAnswered = 0;
        p.lapCount = 0; p.wrongStreak = 0; p.pos = 0; p.alive = true;
      }
      broadcastAll({ type: "GAME_STARTED", payload: { players: getPlayerList() } });
      setTimeout(pushNextQuestion, 1000);
    }

    if (type === "ANSWER") {
      const pid = clients.get(ws);
      if (!pid || !(pid in players) || !players[pid].alive) return;
      if (pid in answerBuffer) return; // already answered
      answerBuffer[pid] = payload.answer;
      answerBuffer[`${pid}_time`] = payload.timeTaken || 15;

      // Tell all players someone answered (but not who/what yet)
      broadcastAll({ type: "PLAYER_ANSWERED", payload: { pid, name: players[pid].name } });

      // If all alive players answered, resolve early
      const alivePids = Object.values(players).filter(p => p.alive).map(p => p.id);
      if (alivePids.every(pid => pid in answerBuffer)) resolveQuestion();
    }

    if (type === "LAP_UPDATE") {
      const pid = clients.get(ws);
      if (pid && players[pid]) {
        players[pid].lapCount = payload.lapCount;
        players[pid].pos = payload.pos;
        broadcast({ type: "PLAYER_LIST", payload: getPlayerList() }, pid);
      }
    }

    if (type === "RESTART") {
      gamePhase = "lobby";
      players = {};
      hostId = null;
      currentQuestion = null;
      answerBuffer = {};
      clearTimeout(questionTimer);
      broadcastAll({ type: "RESET" });
    }
  });

  ws.on("close", () => {
    const pid = clients.get(ws);
    clients.delete(ws);
    if (pid) {
      delete players[pid];
      if (hostId === pid) {
        hostId = Object.keys(players)[0] || null;
        if (hostId) {
          const hw = getWsForPlayer(hostId);
          if (hw) sendTo(hw, { type: "YOU_ARE_HOST" });
        }
      }
      broadcastAll({ type: "PLAYER_LIST", payload: getPlayerList() });
    }
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
});

// ── Start ─────────────────────────────────────────────────
httpServer.listen(PORT, "0.0.0.0", () => {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  const localIps = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) localIps.push(iface.address);
    }
  }
  console.log("\n🎢  TRIVIA RUSH SERVER STARTED\n");
  console.log(`   Local:   http://localhost:${PORT}`);
  localIps.forEach(ip => console.log(`   Network: http://${ip}:${PORT}  ← share this with other players`));
  console.log("\n   Open the Network URL on any device connected to the same WiFi.\n");
});

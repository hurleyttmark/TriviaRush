/*
 * Trivia Rush — Long-Poll Multiplayer Server
 * Works on Render.com free tier (no WebSocket needed)
 * Run: node server.js
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// ── Game state ─────────────────────────────────────────────
let players     = {};
let gamePhase   = "lobby";
let questionQueue  = [];
let currentQuestion = null;
let questionIndex   = 0;
let questionTimer   = null;
let answerBuffer    = {};
let hostId          = null;

const eventQueues   = {};
const pollWaiters   = {};
const lastSeen      = {};

// ── Question bank ──────────────────────────────────────────
const QUESTIONS = [
  { q:"Which planet is closest to the Sun?",            a:["Mercury","Venus","Mars","Jupiter"],                          correct:0, diff:1 },
  { q:"What is the capital of France?",                 a:["London","Berlin","Paris","Madrid"],                          correct:2, diff:1 },
  { q:"Who painted the Mona Lisa?",                     a:["Picasso","Michelangelo","Da Vinci","Rembrandt"],              correct:2, diff:1 },
  { q:"What is H2O commonly known as?",                 a:["Salt","Water","Acid","Oxygen"],                              correct:1, diff:1 },
  { q:"How many sides does a hexagon have?",            a:["5","6","7","8"],                                             correct:1, diff:1 },
  { q:"Which ocean is the largest?",                    a:["Atlantic","Indian","Arctic","Pacific"],                      correct:3, diff:1 },
  { q:"What year did World War II end?",                a:["1943","1944","1945","1946"],                                  correct:2, diff:2 },
  { q:"Who wrote 'Romeo and Juliet'?",                  a:["Dickens","Shakespeare","Tolstoy","Austen"],                  correct:1, diff:1 },
  { q:"Approximate speed of light?",                   a:["100,000 km/s","200,000 km/s","300,000 km/s","400,000 km/s"], correct:2, diff:2 },
  { q:"Which country has the most natural lakes?",      a:["USA","Russia","Brazil","Canada"],                            correct:3, diff:2 },
  { q:"Largest organ in the human body?",               a:["Heart","Liver","Brain","Skin"],                              correct:3, diff:1 },
  { q:"Who directed Jurassic Park?",                    a:["James Cameron","Steven Spielberg","George Lucas","Ridley Scott"], correct:1, diff:2 },
  { q:"What currency does Japan use?",                  a:["Yuan","Won","Yen","Baht"],                                   correct:2, diff:1 },
  { q:"How many bones in the adult human body?",        a:["196","206","216","226"],                                     correct:1, diff:2 },
  { q:"Tallest mountain on Earth?",                     a:["K2","Kangchenjunga","Everest","Lhotse"],                     correct:2, diff:1 },
  { q:"Which element has atomic number 79?",            a:["Silver","Platinum","Gold","Copper"],                        correct:2, diff:3 },
  { q:"Year the Eiffel Tower was completed?",           a:["1879","1889","1899","1909"],                                 correct:1, diff:2 },
  { q:"Longest river in the world?",                    a:["Amazon","Nile","Mississippi","Yangtze"],                    correct:1, diff:2 },
  { q:"Which planet has the most moons?",               a:["Jupiter","Saturn","Uranus","Neptune"],                      correct:1, diff:3 },
  { q:"First person to walk on the Moon?",              a:["Buzz Aldrin","Yuri Gagarin","Neil Armstrong","John Glenn"], correct:2, diff:1 },
  { q:"Smallest country in the world?",                 a:["Monaco","San Marino","Vatican City","Liechtenstein"],       correct:2, diff:2 },
  { q:"Which programming language was created first?",  a:["C","FORTRAN","Python","Java"],                              correct:1, diff:3 },
  { q:"Hardest natural substance?",                     a:["Platinum","Quartz","Diamond","Titanium"],                   correct:2, diff:1 },
  { q:"Standard guitar strings?",                      a:["4","5","6","7"],                                             correct:2, diff:1 },
  { q:"Who wrote '1984'?",                              a:["Aldous Huxley","George Orwell","Ray Bradbury","Philip K. Dick"], correct:1, diff:2 },
  { q:"Capital of Australia?",                          a:["Sydney","Melbourne","Brisbane","Canberra"],                 correct:3, diff:2 },
  { q:"Year the Titanic sank?",                         a:["1910","1911","1912","1913"],                                 correct:2, diff:1 },
  { q:"Gas that makes up most of Earth's atmosphere?",  a:["Oxygen","Carbon Dioxide","Nitrogen","Argon"],               correct:2, diff:2 },
  { q:"Square root of 144?",                            a:["10","11","12","13"],                                        correct:2, diff:1 },
  { q:"Who discovered penicillin?",                     a:["Marie Curie","Alexander Fleming","Louis Pasteur","Joseph Lister"], correct:1, diff:2 },
  { q:"Powerhouse of the cell?",                        a:["Nucleus","Ribosome","Mitochondria","Golgi Body"],           correct:2, diff:1 },
  { q:"Planets in our solar system?",                   a:["7","8","9","10"],                                           correct:1, diff:1 },
  { q:"Most spoken native language worldwide?",         a:["English","Hindi","Mandarin Chinese","Spanish"],            correct:2, diff:2 },
  { q:"Freezing point of water in Celsius?",            a:["-10","0","10","32"],                                        correct:1, diff:1 },
  { q:"Who invented the telephone?",                    a:["Thomas Edison","Nikola Tesla","Alexander Graham Bell","Guglielmo Marconi"], correct:2, diff:1 },
  { q:"Largest continent by area?",                     a:["Africa","North America","Europe","Asia"],                   correct:3, diff:1 },
  { q:"Year the Berlin Wall fell?",                     a:["1987","1988","1989","1990"],                                 correct:2, diff:2 },
  { q:"Ship in Moby Dick?",                             a:["Nautilus","Pequod","Enterprise","Beagle"],                  correct:1, diff:3 },
  { q:"Adult human teeth count?",                       a:["28","30","32","34"],                                        correct:2, diff:2 },
  { q:"Who composed the Fifth Symphony?",               a:["Mozart","Handel","Beethoven","Bach"],                       correct:2, diff:2 },
  { q:"Largest species of shark?",                      a:["Great White","Hammerhead","Whale Shark","Bull Shark"],      correct:2, diff:2 },
  { q:"Which country invented pizza?",                  a:["Greece","France","Spain","Italy"],                          correct:3, diff:1 },
  { q:"Harry Potter's owl?",                            a:["Crookshanks","Hedwig","Errol","Fawkes"],                    correct:1, diff:1 },
  { q:"Year the first iPhone launched?",                a:["2005","2006","2007","2008"],                                 correct:2, diff:2 },
  { q:"Chemical symbol for gold?",                      a:["Go","Gd","Au","Ag"],                                        correct:2, diff:2 },
  { q:"Who played Iron Man in the MCU?",                a:["Chris Evans","Chris Hemsworth","Robert Downey Jr.","Mark Ruffalo"], correct:2, diff:1 },
  { q:"Home of the Great Barrier Reef?",                a:["New Zealand","Australia","Fiji","Indonesia"],               correct:1, diff:1 },
  { q:"What does DNA stand for?",                       a:["Deoxyribonucleic Acid","Dinucleic Acid","Diaminonucleic Acid","Deoxynatural Acid"], correct:0, diff:2 },
  { q:"Colors in a rainbow?",                           a:["5","6","7","8"],                                            correct:2, diff:1 },
  { q:"Capital of Brazil?",                             a:["Rio de Janeiro","São Paulo","Salvador","Brasília"],         correct:3, diff:2 },
  { q:"Red Planet?",                                    a:["Venus","Jupiter","Mars","Saturn"],                          correct:2, diff:1 },
  { q:"Who wrote the Harry Potter series?",             a:["Stephenie Meyer","J.R.R. Tolkien","J.K. Rowling","C.S. Lewis"], correct:2, diff:1 },
  { q:"Year World War I began?",                        a:["1912","1913","1914","1915"],                                 correct:2, diff:2 },
  { q:"Largest desert in the world?",                   a:["Sahara","Gobi","Kalahari","Antarctic"],                     correct:3, diff:3 },
  { q:"Octopus hearts?",                                a:["1","2","3","4"],                                            correct:2, diff:2 },
  { q:"Pi approximately equals?",                       a:["3.12","3.14","3.16","3.18"],                                correct:1, diff:1 },
  { q:"Who painted the Sistine Chapel ceiling?",        a:["Da Vinci","Raphael","Michelangelo","Botticelli"],           correct:2, diff:2 },
  { q:"Smallest planet in our solar system?",           a:["Mars","Venus","Mercury","Pluto"],                           correct:2, diff:2 },
  { q:"Greek god of the sea?",                          a:["Zeus","Ares","Poseidon","Hades"],                           correct:2, diff:1 },
  { q:"Country with most time zones?",                  a:["Russia","USA","China","France"],                            correct:3, diff:3 },
  { q:"Longest bone in the human body?",                a:["Tibia","Fibula","Femur","Humerus"],                         correct:2, diff:2 },
  { q:"Country the Colosseum is in?",                   a:["Greece","Spain","Italy","Turkey"],                          correct:2, diff:1 },
  { q:"Who proposed the theory of relativity?",         a:["Newton","Darwin","Einstein","Hawking"],                     correct:2, diff:1 },
  { q:"Keys on a standard piano?",                      a:["76","80","88","92"],                                        correct:2, diff:2 },
  { q:"Which continent is Egypt on?",                   a:["Asia","Europe","Africa","Middle East"],                     correct:2, diff:1 },
  { q:"World's fastest land animal?",                   a:["Lion","Peregrine Falcon","Cheetah","Greyhound"],            correct:2, diff:1 },
  { q:"Who wrote 'The Great Gatsby'?",                  a:["Ernest Hemingway","F. Scott Fitzgerald","William Faulkner","John Steinbeck"], correct:1, diff:2 },
  { q:"Largest moon of Saturn?",                        a:["Europa","Ganymede","Titan","Callisto"],                     correct:2, diff:3 },
  { q:"Chambers in a human heart?",                     a:["2","3","4","5"],                                            correct:2, diff:1 },
  { q:"Sport that uses a shuttlecock?",                 a:["Tennis","Squash","Badminton","Pickleball"],                 correct:2, diff:1 },
  { q:"Official language of Brazil?",                   a:["Spanish","English","Portuguese","French"],                  correct:2, diff:1 },
  { q:"Who invented the World Wide Web?",               a:["Bill Gates","Steve Jobs","Tim Berners-Lee","Vint Cerf"],    correct:2, diff:2 },
  { q:"Capital of Russia?",                             a:["St. Petersburg","Novosibirsk","Vladivostok","Moscow"],      correct:3, diff:1 },
  { q:"First female Nobel Prize winner?",               a:["Rosalind Franklin","Marie Curie","Dorothy Hodgkin","Rita Levi-Montalcini"], correct:1, diff:2 },
  { q:"Rarest blood type?",                             a:["O negative","A negative","B negative","AB negative"],      correct:3, diff:2 },
  { q:"Country of Mount Kilimanjaro?",                  a:["Kenya","Tanzania","Uganda","Ethiopia"],                     correct:1, diff:2 },
  { q:"Letters in the Greek alphabet?",                 a:["22","24","26","28"],                                        correct:1, diff:3 },
  { q:"City with the Louvre?",                          a:["London","Rome","Madrid","Paris"],                           correct:3, diff:1 },
  { q:"Deepest ocean trench?",                          a:["Puerto Rico Trench","Java Trench","Mariana Trench","Philippine Trench"], correct:2, diff:2 },
  { q:"Most abundant gas in Earth's atmosphere?",       a:["Oxygen","Carbon Dioxide","Nitrogen","Hydrogen"],           correct:2, diff:2 },
  { q:"Father of Computers?",                           a:["Alan Turing","Charles Babbage","John von Neumann","Ada Lovelace"], correct:1, diff:2 },
  { q:"Days in a leap year?",                           a:["364","365","366","367"],                                    correct:2, diff:1 },
  { q:"Year the Soviet Union dissolved?",               a:["1989","1990","1991","1992"],                                 correct:2, diff:2 },
  { q:"Hormone that regulates blood sugar?",            a:["Adrenaline","Insulin","Cortisol","Serotonin"],              correct:1, diff:2 },
  { q:"Smallest continent?",                            a:["Europe","Antarctica","Australia","South America"],          correct:2, diff:1 },
  { q:"Who sang Thriller?",                             a:["Prince","Michael Jackson","David Bowie","Elton John"],      correct:1, diff:1 },
  { q:"Country that invented the compass?",             a:["Egypt","Greece","China","India"],                           correct:2, diff:2 },
  { q:"Days Earth takes to orbit the Sun?",             a:["355","360","365.25","370"],                                 correct:2, diff:2 },
  { q:"Capital of Canada?",                             a:["Toronto","Vancouver","Montreal","Ottawa"],                  correct:3, diff:2 },
  { q:"Who painted Starry Night?",                      a:["Monet","Van Gogh","Cézanne","Gauguin"],                     correct:1, diff:1 },
  { q:"National animal of Scotland?",                   a:["Stag","Thistle","Unicorn","Lion"],                          correct:2, diff:3 },
  { q:"Year humans first landed on the Moon?",          a:["1967","1968","1969","1970"],                                 correct:2, diff:1 },
  { q:"What does HTML stand for?",                      a:["Hyperlink Text Markup Language","HyperText Markup Language","Home Tool Markup Language","Hypertext Mediation Language"], correct:1, diff:1 },
  { q:"Country with the largest population?",           a:["USA","Brazil","India","China"],                             correct:2, diff:1 },
  { q:"Main component of the Sun?",                     a:["Helium","Hydrogen","Oxygen","Nitrogen"],                    correct:1, diff:2 },
  { q:"Who created the theory of evolution?",           a:["Gregor Mendel","Charles Darwin","Alfred Wallace","Jean-Baptiste Lamarck"], correct:1, diff:1 },
  { q:"Vertices of a cube?",                            a:["6","7","8","10"],                                           correct:2, diff:2 },
  { q:"Capital of China?",                              a:["Shanghai","Guangzhou","Beijing","Chongqing"],               correct:2, diff:1 },
  { q:"Origin of sushi?",                               a:["China","Korea","Japan","Thailand"],                         correct:2, diff:1 },
  { q:"Zeros in one billion?",                          a:["7","8","9","10"],                                           correct:2, diff:2 },
  { q:"Name of our galaxy?",                            a:["Andromeda","Triangulum","Milky Way","Whirlpool"],           correct:2, diff:1 },
  { q:"Country that gifted the Statue of Liberty?",     a:["England","France","Germany","Italy"],                       correct:1, diff:2 },
  { q:"Year Google was founded?",                       a:["1996","1997","1998","1999"],                                 correct:2, diff:2 },
  { q:"What does USB stand for?",                       a:["Universal Serial Bus","Universal System Bridge","Unified Serial Bus","Universal Software Base"], correct:0, diff:2 },
  { q:"Ounces in a pound?",                             a:["12","14","16","20"],                                        correct:2, diff:1 },
  { q:"Color of a male cardinal bird?",                 a:["Blue","Yellow","Red","Green"],                              correct:2, diff:1 },
  { q:"Language Shakespeare wrote in?",                 a:["Old English","Middle English","Early Modern English","Modern English"], correct:2, diff:3 },
  { q:"Oscar Best Picture winner 1994?",                a:["Forrest Gump","Pulp Fiction","Schindler's List","Shawshank Redemption"], correct:2, diff:3 },
  { q:"Chemical symbol for iron?",                      a:["Ir","Fe","In","Fr"],                                        correct:1, diff:2 },
  { q:"Sides on an octagon?",                           a:["6","7","8","9"],                                            correct:2, diff:1 },
  { q:"Who wrote 'A Brief History of Time'?",           a:["Carl Sagan","Neil deGrasse Tyson","Stephen Hawking","Richard Feynman"], correct:2, diff:2 },
  { q:"Capital of Japan?",                              a:["Osaka","Kyoto","Hiroshima","Tokyo"],                        correct:3, diff:1 },
  { q:"Largest animal on Earth?",                       a:["African Elephant","Giraffe","Blue Whale","Colossal Squid"], correct:2, diff:1 },
  { q:"Year Facebook was founded?",                     a:["2002","2003","2004","2005"],                                 correct:2, diff:2 },
  { q:"Chemical formula for table salt?",               a:["KCl","NaBr","NaCl","CaCl2"],                               correct:2, diff:2 },
  { q:"Who invented the lightbulb?",                    a:["Nikola Tesla","Alexander Graham Bell","Thomas Edison","James Watt"], correct:2, diff:1 },
  { q:"Continents on Earth?",                           a:["5","6","7","8"],                                            correct:2, diff:1 },
  { q:"Capital of Germany?",                            a:["Munich","Hamburg","Frankfurt","Berlin"],                    correct:3, diff:1 },
  { q:"Planet closest in size to Earth?",               a:["Mars","Mercury","Venus","Uranus"],                          correct:2, diff:2 },
  { q:"Sport Wimbledon is associated with?",            a:["Cricket","Golf","Tennis","Polo"],                           correct:2, diff:1 },
  { q:"Who wrote 'The Odyssey'?",                       a:["Virgil","Sophocles","Homer","Plato"],                       correct:2, diff:2 },
  { q:"Atomic number of carbon?",                       a:["4","6","8","12"],                                           correct:1, diff:2 },
];

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ── Event queue helpers ────────────────────────────────────
function enqueue(pid, event) {
  if (!eventQueues[pid]) eventQueues[pid] = [];
  eventQueues[pid].push(event);
  if (pollWaiters[pid]) {
    const { res, timer } = pollWaiters[pid];
    clearTimeout(timer);
    delete pollWaiters[pid];
    flushQueue(pid, res);
  }
}

function enqueueAll(event, excludePid) {
  for (const pid of Object.keys(players)) {
    if (pid !== excludePid) enqueue(pid, event);
  }
}

function flushQueue(pid, res) {
  const events = eventQueues[pid] || [];
  eventQueues[pid] = [];
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ events }));
}

// ── Game logic ─────────────────────────────────────────────
function getPlayerList() { return Object.values(players); }

function startQuestionTimer() {
  clearTimeout(questionTimer);
  questionTimer = setTimeout(() => {
    for (const pid of Object.keys(players)) {
      if (!(pid in answerBuffer)) answerBuffer[pid] = -1;
    }
    resolveQuestion();
  }, 16000);
}

function pushNextQuestion() {
  if (questionIndex >= questionQueue.length) {
    questionQueue = shuffle(QUESTIONS);
    questionIndex = 0;
  }
  currentQuestion = questionQueue[questionIndex++];
  answerBuffer = {};
  for (const pid of Object.keys(players)) {
    enqueue(pid, {
      type: "QUESTION",
      payload: { question: currentQuestion, index: questionIndex, total: questionQueue.length, timestamp: Date.now() }
    });
  }
  startQuestionTimer();
}

function resolveQuestion() {
  clearTimeout(questionTimer);
  if (!currentQuestion) return;

  for (const pid of Object.keys(answerBuffer).filter(k => !k.includes("_time"))) {
    const p = players[pid];
    if (!p) continue;
    const ansIdx    = answerBuffer[pid];
    const timeTaken = answerBuffer[`${pid}_time`] || 15;
    const correct   = ansIdx === currentQuestion.correct;
    const diff      = currentQuestion.diff || 2;
    const progressBonus = (p.totalAnswered / 150) * 8;
    const speedBonus    = Math.max(0, (15 - timeTaken) / 15) * 10;
    const diffBonus     = diff * 4;
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

    if ((p.speed <= 6 || p.wrongStreak >= 4) && p.alive) {
      p.alive = false;
      enqueue(pid, { type: "DEATH", payload: { speed: p.speed, wrongStreak: p.wrongStreak } });
    }
  }

  for (const pid of Object.keys(players)) {
    enqueue(pid, {
      type: "ANSWER_REVEAL",
      payload: { correct: currentQuestion.correct, answers: answerBuffer, players: getPlayerList() }
    });
  }

  const alive = Object.values(players).filter(p => p.alive);
  if (alive.length === 0) { endGame(); return; }
  setTimeout(pushNextQuestion, 2000);
}

function endGame() {
  gamePhase = "ended";
  const allPlayers = Object.values(players);
  const sorted = [...allPlayers].sort((a, b) => (b.correctCount || 0) - (a.correctCount || 0));
  const totalPlayers = allPlayers.length;

  for (const pid of Object.keys(players)) {
    const p = players[pid];
    if (totalPlayers === 1) {
      // Solo play — send GAME_OVER; client checks alive to decide winner vs death screen
      enqueue(pid, { type: "GAME_OVER", payload: { players: sorted, solo: true } });
    } else if (p.alive) {
      // Multiplayer survivor — send GAME_OVER; client shows winner/congratulations screen
      enqueue(pid, { type: "GAME_OVER", payload: { players: sorted, solo: false } });
    }
    // Dead multiplayer players already received DEATH — don't send GAME_OVER to them
  }
}

// ── Cleanup stale players ──────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const pid of Object.keys(lastSeen)) {
    if (now - lastSeen[pid] > 30000) {
      delete players[pid];
      delete eventQueues[pid];
      delete lastSeen[pid];
      if (pollWaiters[pid]) {
        clearTimeout(pollWaiters[pid].timer);
        delete pollWaiters[pid];
      }
      if (hostId === pid) {
        hostId = Object.keys(players)[0] || null;
        if (hostId) enqueue(hostId, { type: "YOU_ARE_HOST" });
      }
      enqueueAll({ type: "PLAYER_LIST", payload: getPlayerList() });
    }
  }
}, 10000);

// ── HTTP server ────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/poll")) {
    const params = new URL(req.url, "http://x").searchParams;
    const pid    = params.get("id");
    if (!pid) { res.writeHead(400); res.end("missing id"); return; }
    lastSeen[pid] = Date.now();
    if (!eventQueues[pid]) eventQueues[pid] = [];

    if (eventQueues[pid].length > 0) { flushQueue(pid, res); return; }

    const timer = setTimeout(() => {
      delete pollWaiters[pid];
      flushQueue(pid, res);
    }, 20000);

    pollWaiters[pid] = { res, timer };
    req.on("close", () => {
      if (pollWaiters[pid] && pollWaiters[pid].res === res) {
        clearTimeout(pollWaiters[pid].timer);
        delete pollWaiters[pid];
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/action") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let msg;
      try { msg = JSON.parse(body); } catch { res.writeHead(400); res.end("bad json"); return; }
      const { type, payload, id: pid } = msg;
      if (pid) lastSeen[pid] = Date.now();
      handleAction(type, payload, pid, res);
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

function handleAction(type, payload, pid, res) {
  const ok = () => { res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({ok:true})); };

  if (type === "JOIN") {
    if (!hostId || !players[hostId]) hostId = pid;
    // If player is rejoining (same ID), preserve their state; otherwise create fresh
    if (players[pid]) {
      players[pid].name   = payload.name   || players[pid].name;
      players[pid].course = payload.course || players[pid].course;
    } else {
      players[pid] = {
        id: pid, name: payload.name || "Player", course: payload.course || "horror",
        speed: 30, correctCount: 0, totalAnswered: 0,
        lapCount: 0, wrongStreak: 0, pos: 0, alive: true,
      };
    }
    if (!eventQueues[pid]) eventQueues[pid] = [];
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({
      ok: true,
      welcome: {
        isHost: pid === hostId,
        players: getPlayerList(),
        gamePhase,
        currentQuestion: gamePhase === "game" ? currentQuestion : null,
      }
    }));
    enqueueAll({ type: "PLAYER_JOINED", payload: players[pid] }, pid);
    enqueueAll({ type: "PLAYER_LIST",   payload: getPlayerList() });
    return;
  }

  if (type === "START_GAME") {
    if (pid !== hostId) { ok(); return; }
    gamePhase = "game";
    questionQueue = shuffle(QUESTIONS);
    questionIndex = 0;
    for (const p of Object.values(players)) {
      p.speed = 30; p.correctCount = 0; p.totalAnswered = 0;
      p.lapCount = 0; p.wrongStreak = 0; p.pos = 0; p.alive = true;
    }
    for (const qpid of Object.keys(players)) {
      enqueue(qpid, { type: "GAME_STARTED", payload: { players: getPlayerList() } });
    }
    setTimeout(pushNextQuestion, 1000);
    ok(); return;
  }

  if (type === "ANSWER") {
    if (!pid || !players[pid] || !players[pid].alive) { ok(); return; }
    if (pid in answerBuffer) { ok(); return; }
    answerBuffer[pid]           = payload.answer;
    answerBuffer[`${pid}_time`] = payload.timeTaken || 15;
    for (const qpid of Object.keys(players)) {
      enqueue(qpid, { type: "PLAYER_ANSWERED", payload: { pid, name: players[pid]?.name } });
    }
    const alivePids = Object.values(players).filter(p => p.alive).map(p => p.id);
    if (alivePids.every(ap => ap in answerBuffer)) resolveQuestion();
    ok(); return;
  }

  if (type === "LAP_UPDATE") {
    if (pid && players[pid]) {
      players[pid].lapCount = payload.lapCount;
      players[pid].pos      = payload.pos;
      enqueueAll({ type: "PLAYER_LIST", payload: getPlayerList() }, pid);
    }
    ok(); return;
  }

  if (type === "RESTART") {
    clearTimeout(questionTimer);
    // Notify everyone first, then wipe all state
    for (const qpid of Object.keys(eventQueues)) enqueue(qpid, { type: "RESET" });
    setTimeout(() => {
      gamePhase = "lobby"; players = {}; hostId = null;
      currentQuestion = null; answerBuffer = {};
      // Clear ghost queues and last-seen tracking
      for (const key of Object.keys(eventQueues)) delete eventQueues[key];
      for (const key of Object.keys(lastSeen))    delete lastSeen[key];
    }, 600); // slight delay so RESET event flushes before queues are wiped
    ok(); return;
  }

  ok();
}

// ── Start ──────────────────────────────────────────────────
httpServer.listen(PORT, "0.0.0.0", () => {
  const { networkInterfaces } = require("os");
  const nets = networkInterfaces();
  const localIps = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) localIps.push(iface.address);
    }
  }
  console.log("\n🎢  TRIVIA RUSH SERVER STARTED (long-poll mode)\n");
  console.log(`   Local:   http://localhost:${PORT}`);
  localIps.forEach(ip => console.log(`   Network: http://${ip}:${PORT}  ← share with other players`));
  console.log("");
});

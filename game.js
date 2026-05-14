/* ═══════════════════════════════════════════════════
   IELTS Keyword Blitz — game.js
   All game logic: screens, timer, scoring, review,
   progress tracking via localStorage.
═══════════════════════════════════════════════════ */

/* ── Constants ── */
// (none needed for bar timer)

/* ── State ── */
const state = {
  speed:        7,       // seconds per keyword
  kwCount:      10,      // keywords per round
  score:        0,       // session score
  totalScore:   0,       // cumulative (all rounds)
  streak:       0,       // current streak
  bestStreak:   0,
  playedIds:    [],      // topic ids completed this session
  currentTopic: null,
  currentWords: [],      // shuffled subset for this round
  wordIndex:    0,       // which word we're on
  timerInterval:null,
  timerStart:   null,
  answered:     false,   // prevent double-tap
  roundResults: [],      // { word, correct, playerAnswer, timedOut }
};

/* ── Persist progress ── */
const STORAGE_KEY = 'ielts_blitz_progress';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { playedIds: [], totalScore: 0 };
    return JSON.parse(raw);
  } catch { return { playedIds: [], totalScore: 0 }; }
}

function saveProgress() {
  try {
    const saved = loadProgress();
    // merge played ids
    const merged = [...new Set([...saved.playedIds, ...state.playedIds])];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      playedIds:  merged,
      totalScore: (saved.totalScore || 0) + state.score,
    }));
  } catch {}
}

function resetProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  state.playedIds  = [];
  state.totalScore = 0;
  state.score      = 0;
  updateStartScreen();
}

/* ── DOM refs ── */
const screens = {
  start:  document.getElementById('screen-start'),
  topic:  document.getElementById('screen-topic'),
  game:   document.getElementById('screen-game'),
  review: document.getElementById('screen-review'),
  done:   document.getElementById('screen-done'),
};

const el = {
  // start
  speedBtns:       document.querySelectorAll('.speed-btn'),
  kwSlider:        document.getElementById('kw-slider'),
  kwCountDisplay:  document.getElementById('kw-count-display'),
  progDone:        document.getElementById('prog-done'),
  btnStart:        document.getElementById('btn-start'),
  resetBtn:        document.getElementById('reset-btn'),

  // topic
  topicBadge:      document.getElementById('topic-badge'),
  topicDots:       document.getElementById('topic-dots'),
  cueTitle:        document.getElementById('cue-title'),
  cueBody:         document.getElementById('cue-body'),
  btnReady:        document.getElementById('btn-ready'),

  // game
  hudScore:        document.getElementById('hud-score'),
  hudRemaining:    document.getElementById('hud-remaining'),
  streakNum:       document.getElementById('streak-num'),
  streakFire:      document.getElementById('streak-fire'),
  topicReminder:   document.getElementById('topic-reminder'),
  ringFill:        document.getElementById('timer-bar-fill'),
  timerLabel:      document.getElementById('timer-bar-label'),
  keywordWord:     document.getElementById('keyword-word'),
  btnYes:          document.getElementById('btn-yes'),
  btnNo:           document.getElementById('btn-no'),
  answerFeedback:  document.getElementById('answer-feedback'),

  // review
  reviewScoreBig:  document.getElementById('review-score-big'),
  reviewStars:     document.getElementById('review-stars'),
  reviewTopicName: document.getElementById('review-topic-name'),
  reviewList:      document.getElementById('review-list'),
  btnNextTopic:    document.getElementById('btn-next-topic'),
  btnBackHome:     document.getElementById('btn-back-home'),

  // done
  doneFinalScore:  document.getElementById('done-final-score'),
  btnPlayAgain:    document.getElementById('btn-play-again'),
};

/* ═══════════════════════════════════════════════════
   SCREEN MANAGEMENT
═══════════════════════════════════════════════════ */
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════
   START SCREEN
═══════════════════════════════════════════════════ */
function updateStartScreen() {
  const saved = loadProgress();
  const doneSoFar = new Set([...saved.playedIds, ...state.playedIds]);
  el.progDone.textContent = doneSoFar.size;
}

// Speed buttons
el.speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    el.speedBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.speed = parseInt(btn.dataset.speed, 10);
  });
});

// Keyword count slider
el.kwSlider.addEventListener('input', () => {
  const val = parseInt(el.kwSlider.value, 10);
  state.kwCount = val;
  el.kwCountDisplay.textContent = val;
});

// Reset progress
el.resetBtn.addEventListener('click', () => {
  if (confirm('Reset all progress and scores? This cannot be undone.')) {
    resetProgress();
  }
});

// Start button
el.btnStart.addEventListener('click', startGame);

function startGame() {
  const saved = loadProgress();
  // merge saved + session played ids
  const allPlayed = [...new Set([...saved.playedIds, ...state.playedIds])];

  const topic = getNextTopic(allPlayed);
  if (!topic) {
    // all done!
    showDoneScreen();
    return;
  }
  loadTopic(topic);
}

/* ═══════════════════════════════════════════════════
   TOPIC SCREEN
═══════════════════════════════════════════════════ */
function loadTopic(topic) {
  state.currentTopic = topic;
  state.roundResults = [];
  state.wordIndex    = 0;
  state.answered     = false;

  // shuffle and slice keywords for this round
  const allWords = [...topic.keywords];
  shuffleArray(allWords);
  state.currentWords = allWords.slice(0, Math.min(state.kwCount, allWords.length));

  // populate cue card
  el.cueTitle.textContent = topic.title;
  el.cueBody.textContent  = topic.prompt;

  // badge
  const saved    = loadProgress();
  const allPlayed = new Set([...saved.playedIds, ...state.playedIds]);
  const doneCount = allPlayed.size;
  el.topicBadge.textContent = `Topic ${doneCount + 1} of 25`;

  // progress dots (show up to 25)
  buildDots(doneCount);

  showScreen('topic');
}

function buildDots(doneCount) {
  el.topicDots.innerHTML = '';
  const total   = Math.min(topics.length, 25);
  const visible = Math.min(total, 13); // max dots to show on mobile
  for (let i = 0; i < visible; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < doneCount)           dot.classList.add('done');
    else if (i === doneCount)    dot.classList.add('active');
    el.topicDots.appendChild(dot);
  }
}

el.btnReady.addEventListener('click', () => {
  showScreen('game');
  setupGameScreen();
  nextWord();
});

/* ═══════════════════════════════════════════════════
   GAME SCREEN
═══════════════════════════════════════════════════ */
function setupGameScreen() {
  el.topicReminder.textContent = state.currentTopic.title;
  el.hudScore.textContent      = state.score;
  el.streakNum.textContent     = state.streak;
  el.answerFeedback.textContent = '';
  el.answerFeedback.className   = 'answer-feedback';
  updateRemaining();
}

function updateRemaining() {
  const left = state.currentWords.length - state.wordIndex;
  el.hudRemaining.textContent = left;
}

function nextWord() {
  if (state.wordIndex >= state.currentWords.length) {
    endRound();
    return;
  }

  state.answered = false;
  clearFeedback();
  enableButtons();

  const wordObj = state.currentWords[state.wordIndex];

  // pop-in animation
  el.keywordWord.classList.remove('pop');
  void el.keywordWord.offsetWidth; // reflow to retrigger
  el.keywordWord.textContent = wordObj.word;
  el.keywordWord.classList.add('pop');

  updateRemaining();
  startTimer();
}

/* ── Timer ── */
function startTimer() {
  clearInterval(state.timerInterval);
  state.timerStart = performance.now();

  const duration = state.speed * 1000;

  // reset bar
  el.ringFill.style.width = '100%';
  el.ringFill.classList.remove('urgent');
  el.timerLabel.textContent = state.speed + 's';

  state.timerInterval = setInterval(() => {
    const elapsed  = performance.now() - state.timerStart;
    const progress = Math.min(elapsed / duration, 1);
    const remaining = Math.ceil((duration - elapsed) / 1000);

    el.ringFill.style.width = ((1 - progress) * 100) + '%';
    el.timerLabel.textContent = remaining + 's';

    // turn red at 33% time left
    if (progress >= 0.67) {
      el.ringFill.classList.add('urgent');
    }

    if (progress >= 1) {
      clearInterval(state.timerInterval);
      handleTimeout();
    }
  }, 50); // ~20fps is plenty for a bar
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

function handleTimeout() {
  if (state.answered) return;
  state.answered = true;
  disableButtons();

  const wordObj = state.currentWords[state.wordIndex];
  state.roundResults.push({
    word:         wordObj,
    playerAnswer: null,
    timedOut:     true,
    wasCorrect:   false,
  });

  // break streak
  state.streak = 0;
  el.streakNum.textContent = state.streak;
  el.streakFire.textContent = '💨';

  showFeedback('timeout', "⏱ Time's up!");
  flashBody('wrong');

  setTimeout(() => {
    state.wordIndex++;
    nextWord();
  }, 800);
}

/* ── Answer buttons ── */
el.btnYes.addEventListener('click', () => handleAnswer(true));
el.btnNo.addEventListener('click',  () => handleAnswer(false));

function handleAnswer(playerSaidYes) {
  if (state.answered) return;
  state.answered = true;
  stopTimer();
  disableButtons();

  const wordObj   = state.currentWords[state.wordIndex];
  const isCorrect = wordObj.correct === playerSaidYes;

  state.roundResults.push({
    word:         wordObj,
    playerAnswer: playerSaidYes,
    timedOut:     false,
    wasCorrect:   isCorrect,
  });

  if (isCorrect) {
    // points: base 10, +5 bonus for speed
    const elapsed     = performance.now() - state.timerStart;
    const speedBonus  = Math.floor(5 * (1 - elapsed / (state.speed * 1000)));
    const points      = 10 + Math.max(0, speedBonus);
    state.score      += points;
    state.streak++;
    if (state.streak > state.bestStreak) state.bestStreak = state.streak;

    el.hudScore.textContent  = state.score;
    el.streakNum.textContent = state.streak;

    // fire emoji escalates with streak
    el.streakFire.textContent = streakEmoji(state.streak);
    pulseStreak();

    showFeedback('correct', `✓ Correct! +${points}`);
    flashBody('correct');
  } else {
    state.streak = 0;
    el.streakNum.textContent = 0;
    el.streakFire.textContent = '💨';

    const correctAnswer = wordObj.correct ? 'YES — this fits' : 'NO — this is a distractor';
    showFeedback('wrong', `✕ Wrong. Answer: ${correctAnswer}`);
    flashBody('wrong');
  }

  setTimeout(() => {
    state.wordIndex++;
    nextWord();
  }, 900);
}

function streakEmoji(streak) {
  if (streak >= 10) return '🔥🔥🔥';
  if (streak >= 6)  return '🔥🔥';
  if (streak >= 3)  return '🔥';
  return '✦';
}

function pulseStreak() {
  el.streakFire.classList.remove('pulse');
  void el.streakFire.offsetWidth;
  el.streakFire.classList.add('pulse');
}

function showFeedback(type, msg) {
  el.answerFeedback.textContent = msg;
  el.answerFeedback.className   = `answer-feedback ${type}`;
}

function clearFeedback() {
  el.answerFeedback.textContent = '';
  el.answerFeedback.className   = 'answer-feedback';
}

function flashBody(type) {
  document.body.classList.remove('flash-correct', 'flash-wrong');
  void document.body.offsetWidth;
  document.body.classList.add(`flash-${type}`);
  setTimeout(() => document.body.classList.remove('flash-correct', 'flash-wrong'), 300);
}

function disableButtons() {
  el.btnYes.classList.add('disabled');
  el.btnNo.classList.add('disabled');
}

function enableButtons() {
  el.btnYes.classList.remove('disabled');
  el.btnNo.classList.remove('disabled');
}

/* ═══════════════════════════════════════════════════
   END OF ROUND
═══════════════════════════════════════════════════ */
function endRound() {
  stopTimer();

  // mark topic as played
  if (!state.playedIds.includes(state.currentTopic.id)) {
    state.playedIds.push(state.currentTopic.id);
  }
  saveProgress();

  buildReviewScreen();
  showScreen('review');
}

/* ═══════════════════════════════════════════════════
   REVIEW SCREEN
═══════════════════════════════════════════════════ */
function buildReviewScreen() {
  const results   = state.roundResults;
  const correct   = results.filter(r => r.wasCorrect).length;
  const total     = results.length;
  const pct       = total > 0 ? correct / total : 0;

  el.reviewScoreBig.textContent  = `${correct}/${total}`;
  el.reviewTopicName.textContent = state.currentTopic.title;

  // Stars
  let stars = '☆☆☆';
  if (pct >= 0.9)      stars = '★★★';
  else if (pct >= 0.6) stars = '★★☆';
  else if (pct >= 0.3) stars = '★☆☆';
  el.reviewStars.textContent = stars;

  // Build list — show ALL words that appeared this round
  el.reviewList.innerHTML = '';

  results.forEach(r => {
    const wordObj = r.word;
    const item    = document.createElement('div');

    let statusClass, icon, resultLabel;

    if (r.timedOut) {
      statusClass = 'wrong-answer';
      icon        = '⏱';
      resultLabel = 'Timed out';
    } else if (r.wasCorrect) {
      statusClass = 'correct-answer';
      icon        = '✓';
      resultLabel = r.playerAnswer ? 'You said YES ✓' : 'You said NO ✓';
    } else {
      statusClass = 'wrong-answer';
      icon        = '✕';
      resultLabel = r.playerAnswer ? 'You said YES ✕' : 'You said NO ✕';
    }

    const tagClass  = wordObj.correct ? 'fits' : 'distractor';
    const tagLabel  = wordObj.correct ? 'fits topic' : 'distractor';

    item.className = `review-item ${statusClass}`;
    item.innerHTML = `
      <div class="review-icon">${icon}</div>
      <div>
        <div class="review-word">
          ${wordObj.word}
          <span class="review-tag ${tagClass}">${tagLabel}</span>
        </div>
        <div class="review-explanation">${wordObj.explanation}</div>
        <div class="review-result-label">${resultLabel}</div>
      </div>
    `;
    el.reviewList.appendChild(item);
  });

  // Also show any words from this topic that were NOT in this round (for reference)
  const seenWords  = new Set(results.map(r => r.word.word));
  const allWords   = state.currentTopic.keywords;
  const notSeen    = allWords.filter(w => !seenWords.has(w.word));

  if (notSeen.length > 0) {
    const divider = document.createElement('div');
    divider.style.cssText = `
      font-size: 12px;
      color: var(--c-text-dim);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 8px;
      padding: 6px 0;
      border-top: 1px solid var(--c-border);
    `;
    divider.textContent = 'Other keywords for this topic (not shown this round)';
    el.reviewList.appendChild(divider);

    notSeen.forEach(wordObj => {
      const item = document.createElement('div');
      const tagClass = wordObj.correct ? 'fits' : 'distractor';
      const tagLabel = wordObj.correct ? 'fits topic' : 'distractor';
      item.className = 'review-item not-seen';
      item.innerHTML = `
        <div class="review-icon">○</div>
        <div>
          <div class="review-word">
            ${wordObj.word}
            <span class="review-tag ${tagClass}">${tagLabel}</span>
          </div>
          <div class="review-explanation">${wordObj.explanation}</div>
        </div>
      `;
      el.reviewList.appendChild(item);
    });
  }
}

/* Review buttons */
el.btnNextTopic.addEventListener('click', () => {
  const saved    = loadProgress();
  const allPlayed = [...new Set([...saved.playedIds, ...state.playedIds])];
  const next     = getNextTopic(allPlayed);

  if (!next) {
    showDoneScreen();
  } else {
    loadTopic(next);
    showScreen('topic');
  }
});

el.btnBackHome.addEventListener('click', () => {
  updateStartScreen();
  showScreen('start');
});

/* ═══════════════════════════════════════════════════
   DONE SCREEN
═══════════════════════════════════════════════════ */
function showDoneScreen() {
  const saved = loadProgress();
  el.doneFinalScore.textContent = `Total score: ${(saved.totalScore || 0) + state.score}`;
  showScreen('done');
}

document.getElementById('btn-play-again').addEventListener('click', () => {
  // Reset session but keep persistent progress clear for replay
  resetProgress();
  state.score    = 0;
  state.streak   = 0;
  state.playedIds = [];
  updateStartScreen();
  showScreen('start');
});

/* ═══════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
function init() {
  // Load saved progress and update start screen
  updateStartScreen();

  // Sync slider display
  el.kwCountDisplay.textContent = el.kwSlider.value;
  state.kwCount = parseInt(el.kwSlider.value, 10);

  showScreen('start');
}

init();
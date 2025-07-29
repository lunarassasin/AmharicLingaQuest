// public/script.js

// --- DATA (will be fetched from server) ---
let vocabulary = [];
let sentences = []; // Still holds static sentences if fetched, but fill-blank uses AI now

// --- STATE MANAGEMENT ---
let state = {
    exerciseMode: null,
    currentQuestionIndex: 0,
    score: 0,
    currentStreak: 0,
    highestStreak: 0,
    shuffledData: [],
    selectedGerman: null,
    selectedAmharic: null,
    matchedPairs: 0,
    userToken: localStorage.getItem('jwtToken') || null, // Store JWT token
    userId: localStorage.getItem('userId') || null,       // Store User ID
    username: localStorage.getItem('username') || null,   // Store Username
};

// --- SPEECH RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'am-ET';
    recognition.continuous = false;
    recognition.interimResults = false;
}

// --- DOM ELEMENTS ---
// Authentication UI
const authArea = document.getElementById('auth-area');
const authFeedback = document.getElementById('auth-feedback');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerConfirmPasswordInput = document.getElementById('register-confirm-password');
const registerBtn = document.getElementById('register-btn');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');
const logoutBtn = document.getElementById('logout-btn'); // Add a logout button in your HTML somewhere (e.g., in main-menu)

// Main App UI
const mainMenu = document.getElementById('main-menu');
const exerciseArea = document.getElementById('exercise-area');
const resultScreen = document.getElementById('result-screen');
const backToMenuBtn = document.getElementById('back-to-menu');
const resultsBackToMenuBtn = document.getElementById('results-back-to-menu-btn'); // New for results screen
const exerciseTitle = document.getElementById('exercise-title');
const progressBar = document.getElementById('progress-bar');
const feedbackMessage = document.getElementById('feedback-message');
const streakDisplay = document.getElementById('streak-display');
const exerciseStreak = document.getElementById('exercise-streak');

// Exercise-specific elements (already there)
const ui = {
    'vocabulary': document.getElementById('vocabulary-ui'),
    'matching': document.getElementById('matching-ui'),
    'fill-blank': document.getElementById('fill-blank-ui'),
    'listening': document.getElementById('listening-ui'),
    'speaking': document.getElementById('speaking-ui'),
};
const micBtn = document.getElementById('mic-btn');
const speechFeedback = document.getElementById('speech-feedback');
const nextSpeakingBtn = document.getElementById('next-speaking-btn');


// --- LOCAL STORAGE ---
function saveProgress() {
    localStorage.setItem('amharicLinguaQuestProgress', JSON.stringify({
        highestStreak: state.highestStreak,
        userId: state.userId, // Save user ID with progress
        username: state.username,
        // Potentially save other user-specific progress like XP, level here later
    }));
}

function loadProgress() {
    const progress = JSON.parse(localStorage.getItem('amharicLinguaQuestProgress'));
    if (progress) {
        state.highestStreak = progress.highestStreak || 0;
        state.userId = progress.userId || null;
        state.username = progress.username || null;
        streakDisplay.textContent = `Höchster Streak: 🔥 ${state.highestStreak}`;
    }
}

// --- UTILITY ---
const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);
const speak = (text, lang) => {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
};

// Helper function to parse LLM output (crucial and can be tricky)
function parseLLMOutput(text) {
    const germanMatch = text.match(/German: "(.*?)"/);
    const amharicMatch = text.match(/Amharic: "(.*?)"/);
    const blankMatch = text.match(/BlankWord: "(.*?)"/);

    if (germanMatch && amharicMatch && blankMatch) {
        return {
            german: germanMatch[1],
            amharic: amharicMatch[1],
            blank: blankMatch[1]
        };
    }
    console.error("Failed to parse LLM output:", text);
    return null;
}


// --- AUTHENTICATION FUNCTIONS ---

function showAuthArea() {
    authArea.classList.remove('hidden');
    mainMenu.classList.add('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    showLoginForm(); // Default to login form
}

function showLoginForm() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authFeedback.textContent = ''; // Clear feedback
}

function showRegisterForm() {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authFeedback.textContent = ''; // Clear feedback
}

async function handleRegister() {
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value.trim();
    const confirmPassword = registerConfirmPasswordInput.value.trim();

    if (!username || !password || !confirmPassword) {
        authFeedback.textContent = 'Bitte füllen Sie alle Felder aus.';
        return;
    }
    if (password !== confirmPassword) {
        authFeedback.textContent = 'Passwörter stimmen nicht überein.';
        return;
    }
    if (password.length < 6) {
        authFeedback.textContent = 'Passwort muss mindestens 6 Zeichen lang sein.';
        return;
    }

    try {
        const response = await fetch('/api/users/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            authFeedback.textContent = 'Registrierung erfolgreich! Bitte melden Sie sich an.';
            authFeedback.style.color = '#22c55e'; // Green for success
            setTimeout(showLoginForm, 1500); // Show login after success
            registerUsernameInput.value = ''; // Clear form
            registerPasswordInput.value = '';
            registerConfirmPasswordInput.value = '';
        } else {
            authFeedback.textContent = data.msg || 'Registrierung fehlgeschlagen.';
            authFeedback.style.color = '#ef4444'; // Red for error
        }
    } catch (error) {
        console.error('Registration error:', error);
        authFeedback.textContent = 'Ein Serverfehler ist aufgetreten.';
        authFeedback.style.color = '#ef4444';
    }
}

async function handleLogin() {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        authFeedback.textContent = 'Bitte geben Sie Benutzername und Passwort ein.';
        return;
    }

    try {
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            handleAuthSuccess(data.token, data.user.id, data.user.username);
        } else {
            authFeedback.textContent = data.msg || 'Anmeldung fehlgeschlagen.';
            authFeedback.style.color = '#ef4444';
        }
    } catch (error) {
        console.error('Login error:', error);
        authFeedback.textContent = 'Ein Serverfehler ist aufgetreten.';
        authFeedback.style.color = '#ef4444';
    }
}

function handleAuthSuccess(token, userId, username) {
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('username', username);
    state.userToken = token;
    state.userId = userId;
    state.username = username;
    authFeedback.textContent = ''; // Clear any previous auth feedback
    console.log('User logged in:', username, 'ID:', userId);
    // Proceed to load vocabulary and show main menu
    fetchVocabulary();
}

function handleLogout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    state.userToken = null;
    state.userId = null;
    state.username = null;
    alert('Sie wurden abgemeldet.');
    showAuthArea(); // Go back to login/register screen
}


// --- FETCH VOCABULARY FROM SERVER ---
// This function is now called AFTER successful login
async function fetchVocabulary() {
    try {
        // Add Authorization header for authenticated requests later if needed
        const headers = { 'Content-Type': 'application/json' };
        if (state.userToken) {
            headers['Authorization'] = `Bearer ${state.userToken}`;
        }

        const response = await fetch('/api/vocabulary', { headers });
        if (!response.ok) {
            // Handle cases where token might be expired/invalid
            if (response.status === 401 || response.status === 403) {
                alert('Sitzung abgelaufen oder nicht autorisiert. Bitte melden Sie sich erneut an.');
                handleLogout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        vocabulary = data.vocabulary;
        sentences = data.sentences; // Static sentences (if still used)
        console.log('Vocabulary loaded:', vocabulary);
        console.log('Sentences loaded:', sentences);
        showMainMenu(); // Show main menu once data is loaded and user is authenticated
    } catch (error) {
        console.error('Failed to fetch vocabulary:', error);
        alert('Could not load vocabulary. Please check the server connection or your authentication.');
        showAuthArea(); // Go back to auth area on data load error
    }
}


// --- CORE LOGIC ---
function showMainMenu() {
    authArea.classList.add('hidden'); // Hide auth area
    mainMenu.classList.remove('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    loadProgress(); // Load highest streak
}

async function startExercise(mode) {
    if (vocabulary.length === 0) {
        alert("Wortschatz ist noch nicht geladen. Bitte warten oder aktualisieren Sie die Seite.");
        return;
    }

    state.exerciseMode = mode;
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.currentStreak = 0;

    mainMenu.classList.add('hidden');
    exerciseArea.classList.remove('hidden');
    resultScreen.classList.add('hidden');

    Object.values(ui).forEach(el => el.classList.add('hidden'));
    if (ui[mode]) {
        ui[mode].classList.remove('hidden');
    }

    feedbackMessage.textContent = '';
    exerciseStreak.textContent = `🔥 ${state.currentStreak}`;

    switch (mode) {
        case 'vocabulary':
            exerciseTitle.textContent = 'Wortschatz-Quiz';
            state.shuffledData = shuffleArray([...vocabulary]);
            displayVocabularyQuestion();
            break;
        case 'matching':
            exerciseTitle.textContent = 'Wort-Matching';
            state.shuffledData = shuffleArray([...vocabulary]).slice(0, 5);
            state.matchedPairs = 0;
            displayMatchingExercise();
            break;
        case 'fill-blank':
            exerciseTitle.textContent = 'Lückentext';
            await fetchAndDisplayGeneratedFillBlankSentenceAI();
            break;
        case 'listening':
            exerciseTitle.textContent = 'Hörverständnis';
            state.shuffledData = shuffleArray([...vocabulary]);
            displayListeningQuestion();
            break;
        case 'speaking':
            exerciseTitle.textContent = 'Sprechübung';
            if (!recognition) {
                alert("Entschuldigung, Ihr Browser unterstützt keine Spracherkennung. Versuchen Sie Chrome oder Edge.");
                showMainMenu();
                return;
            }
            state.shuffledData = shuffleArray([...vocabulary]);
            displaySpeakingExercise();
            break;
    }
}

function nextQuestion() {
    if (state.exerciseMode === 'fill-blank') {
        fetchAndDisplayGeneratedFillBlankSentenceAI();
        return;
    }

    state.currentQuestionIndex++;
    feedbackMessage.textContent = '';

    const totalQuestions = state.shuffledData.length;
    if (state.currentQuestionIndex >= totalQuestions) {
        showResults();
        return;
    }

    switch (state.exerciseMode) {
        case 'vocabulary': displayVocabularyQuestion(); break;
        case 'listening': displayListeningQuestion(); break;
        case 'speaking': displaySpeakingExercise(); break;
    }
}

function updateProgress(total) {
    progressBar.style.width = `${((state.currentQuestionIndex + 1) / total) * 100}%`;
}

function handleAnswer(isCorrect) {
    if (isCorrect) {
        state.score++;
        state.currentStreak++;
        if (state.currentStreak > state.highestStreak) {
            state.highestStreak = state.currentStreak;
            saveProgress();
        }
        feedbackMessage.textContent = 'Richtig!';
        feedbackMessage.style.color = '#22c55e';
    } else {
        state.currentStreak = 0;
        feedbackMessage.textContent = 'Falsch!';
        feedbackMessage.style.color = '#ef4444';
    }
    exerciseStreak.textContent = `🔥 ${state.currentStreak}`;

    if (state.exerciseMode === 'fill-blank') {
        const sentenceContainer = document.getElementById('fill-blank-sentence');
        if (isCorrect) {
             const questionData = state.shuffledData[state.currentQuestionIndex];
             const correctAnswerAmharic = vocabulary.find(v => v.german === questionData.blank)?.amharic;
             if (correctAnswerAmharic) {
                sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-green-600">${correctAnswerAmharic}</span>`);
             }
        }
        const optionsContainer = document.getElementById('fill-blank-options');
        optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);

        setTimeout(() => {
            nextQuestion();
        }, 2000);
        return;
    }

    setTimeout(nextQuestion, 1500);
}


// --- EXERCISE-SPECIFIC DISPLAY FUNCTIONS ---

function displayVocabularyQuestion() {
    const isAmharicToGerman = Math.random() > 0.5;
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const questionWord = isAmharicToGerman ? questionData.amharic : questionData.german;
    const correctAnswer = isAmharicToGerman ? questionData.german : questionData.amharic;
    const optionSource = isAmharicToGerman ? 'german' : 'amharic';

    document.getElementById('vocab-prompt').textContent = `Was bedeutet das Wort auf ${isAmharicToGerman ? 'Deutsch' : 'Amharisch'}?`;
    document.getElementById('vocab-word').textContent = questionWord;

    let options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v[optionSource] !== correctAnswer).map(v => v[optionSource])).slice(0, 3)]);
    const optionsContainer = document.getElementById('vocab-options');
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer);
            btn.classList.add(opt === correctAnswer ? 'correct' : 'incorrect');
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
            if (opt !== correctAnswer) {
                const correctBtn = Array.from(optionsContainer.querySelectorAll('button')).find(b => b.textContent === correctAnswer);
                correctBtn.classList.add('correct');
            }
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(state.shuffledData.length);
}

function displayMatchingExercise() {
    const germanContainer = document.getElementById('german-words');
    const amharicContainer = document.getElementById('amharic-words');
    germanContainer.innerHTML = '';
    amharicContainer.innerHTML = '';

    const germanWords = shuffleArray(state.shuffledData.map(v => v.german));
    const amharicWords = shuffleArray(state.shuffledData.map(v => v.amharic));

    germanWords.forEach(word => {
        const btn = document.createElement('button');
        btn.textContent = word;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg';
        btn.onclick = () => {
            if (state.selectedGerman) state.selectedGerman.classList.remove('selected');
            state.selectedGerman = btn;
            btn.classList.add('selected');
            checkMatch();
        };
        germanContainer.appendChild(btn);
    });

    amharicWords.forEach(word => {
        const btn = document.createElement('button');
        btn.textContent = word;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg';
        btn.onclick = () => {
            if (state.selectedAmharic) state.selectedAmharic.classList.remove('selected');
            state.selectedAmharic = btn;
            btn.classList.add('selected');
            checkMatch();
        };
        amharicContainer.appendChild(btn);
    });
}

function checkMatch() {
    if (!state.selectedGerman || !state.selectedAmharic) return;

    const germanText = state.selectedGerman.textContent;
    const amharicText = state.selectedAmharic.textContent;
    const correctPair = vocabulary.find(v => v.german === germanText && v.amharic === amharicText);

    if (correctPair) {
        state.matchedPairs++;
        state.selectedGerman.classList.add('matched');
        state.selectedAmharic.classList.add('matched');
        state.selectedGerman.disabled = true;
        state.selectedAmharic.disabled = true;
        handleAnswer(true);
    } else {
        state.selectedGerman.classList.add('incorrect');
        state.selectedAmharic.classList.add('incorrect');
        handleAnswer(false);
    }

    setTimeout(() => {
        if (state.selectedGerman) state.selectedGerman.classList.remove('selected', 'incorrect');
        if (state.selectedAmharic) state.selectedAmharic.classList.remove('selected', 'incorrect');
        state.selectedGerman = null;
        state.selectedAmharic = null;

        if (state.matchedPairs === state.shuffledData.length) {
            feedbackMessage.textContent = 'Super gemacht!';
            setTimeout(showResults, 1500);
        }
    }, 800);
}

function displayFillBlankQuestion() {
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const sentenceContainer = document.getElementById('fill-blank-sentence');
    sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-blue-600">____</span>`);

    const correctAnswerAmharic = vocabulary.find(v => v.german === questionData.blank)?.amharic;
    if (!correctAnswerAmharic) {
        console.error("Could not find Amharic word for blank from vocabulary:", questionData.blank);
        feedbackMessage.textContent = "Fehler: Lückenwort nicht gefunden. Frage überspringen.";
        feedbackMessage.style.color = '#ef4444';
        setTimeout(nextQuestion, 2000);
        return;
    }

    const options = shuffleArray([
        correctAnswerAmharic,
        ...shuffleArray(vocabulary.filter(v => v.amharic !== correctAnswerAmharic).map(v => v.amharic)).slice(0, 3)
    ]);
    const optionsContainer = document.getElementById('fill-blank-options');
    optionsContainer.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswerAmharic);
            btn.classList.add(opt === correctAnswerAmharic ? 'correct' : 'incorrect');
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(1);
}

function displayListeningQuestion() {
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const correctAnswer = questionData.german;
    const options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v.german !== correctAnswer).map(v => v.german)).slice(0, 3)]);
    const optionsContainer = document.getElementById('listening-options');
    optionsContainer.innerHTML = '';

    document.getElementById('play-audio-btn').onclick = () => speak(questionData.amharic, 'am-ET');
    speak(questionData.amharic, 'am-ET');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer);
            btn.classList.add(opt === correctAnswer ? 'correct' : 'incorrect');
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(state.shuffledData.length);
}

function displaySpeakingExercise() {
    speechFeedback.textContent = '';
    const questionData = state.shuffledData[state.currentQuestionIndex];
    document.getElementById('speaking-word').textContent = questionData.amharic;
    nextSpeakingBtn.classList.add('hidden'); // Hide next button initially
    updateProgress(state.shuffledData.length);
}

// --- RESULTS ---
function showResults() {
    exerciseArea.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    const total = state.exerciseMode === 'matching' ? state.shuffledData.length : state.score;
    document.getElementById('score').textContent = `${state.score} / ${total}`;
    document.getElementById('restart-btn').onclick = () => startExercise(state.exerciseMode);
}

// --- EVENT LISTENERS ---
backToMenuBtn.addEventListener('click', showMainMenu);
resultsBackToMenuBtn.addEventListener('click', showMainMenu); // For the results screen

// Exercise mode buttons
document.querySelectorAll('[data-exercise-mode]').forEach(button => {
    button.addEventListener('click', (event) => {
        const mode = event.target.dataset.exerciseMode;
        startExercise(mode);
    });
});

// Authentication Event Listeners
showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
registerBtn.addEventListener('click', handleRegister);
loginBtn.addEventListener('click', handleLogin);
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout); // If you add a logout button in HTML

// Speech Recognition Event Listeners
micBtn.addEventListener('click', () => {
    micBtn.classList.add('listening');
    speechFeedback.textContent = 'Listening...';
    try {
        recognition.start();
    } catch (e) {
        console.error("Speech recognition error:", e);
        speechFeedback.textContent = 'Error starting mic.';
        micBtn.classList.remove('listening');
    }
});

if (recognition) {
    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        const targetWord = state.shuffledData[state.currentQuestionIndex].amharic; // Target Amharic word for speaking practice

        speechFeedback.textContent = `You said: "${spokenText}"`;
        const isCorrect = spokenText.trim().toLowerCase() === targetWord.trim().toLowerCase(); // Case-insensitive compare

        handleAnswer(isCorrect); // This updates score/streak and feedback message

        if (isCorrect) {
            speechFeedback.style.color = '#22c55e'; // Green
            nextSpeakingBtn.classList.remove('hidden'); // Show next button on correct answer
            setTimeout(nextQuestion, 1500); // Auto-advance on correct
        } else {
            speechFeedback.style.color = '#ef4444'; // Red
            feedbackMessage.textContent = `Falsch! Versuchen Sie es erneut. Das richtige Wort ist "${targetWord}"`;
            nextSpeakingBtn.classList.remove('hidden'); // Show next button to allow manual advance
        }
    };
    recognition.onend = () => {
        micBtn.classList.remove('listening');
    };
    recognition.onerror = (event) => {
        speechFeedback.textContent = `Error: ${event.error}`;
        micBtn.classList.remove('listening');
        nextSpeakingBtn.classList.remove('hidden'); // Show next button on error
    };
}
// Add event listener for the "Next Question" button in speaking practice
if (nextSpeakingBtn) {
    nextSpeakingBtn.addEventListener('click', nextQuestion);
}

// --- INITIALIZATION ---
window.onload = () => {
    loadProgress(); // Load any saved streak/user info
    if (state.userToken && state.userId && state.username) {
        // If user is already logged in (token exists), try to fetch vocabulary
        // and go to main menu. Backend will validate the token.
        console.log("Found existing session. Attempting auto-login...");
        fetchVocabulary();
    } else {
        // No token found, show auth area
        console.log("No active session. Showing login/registration.");
        showAuthArea();
    }
};

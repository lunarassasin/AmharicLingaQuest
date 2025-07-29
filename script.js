// script.js (Frontend)

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
    userId: localStorage.getItem('userId') || null,        // Store User ID
    username: localStorage.getItem('username') || null,    // Store Username
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
// Removed nextSpeakingBtn as auto-advance is handled or it's not needed with the new flow.
// If you want a manual 'Next' button for speaking, add it back to HTML and here.


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

// --- REMOVED: parseLLMOutput function ---
// This function is no longer needed on the frontend because the backend
// now handles parsing the raw AI response and sends a structured JSON object.


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
            // Directly call the AI generation and display for fill-blank
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
    // For fill-blank, we always fetch a new AI sentence.
    // This effectively means each "question" is a new AI call.
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
    // For fill-blank, since it's one AI-generated sentence at a time,
    // progress can be simplified or managed differently if you want a "session" of AI questions.
    // For now, it will show 100% after each AI question, which is fine if each AI call is a distinct "round".
    progressBar.style.width = `${((state.currentQuestionIndex + 1) / total) * 100}%`;
}

// --- MODIFIED: handleAnswer with correct answer display ---
function handleAnswer(isCorrect, correctAnswerProvided = null) {
    if (isCorrect) {
        state.score++;
        state.currentStreak++;
        if (state.currentStreak > state.highestStreak) {
            state.highestStreak = state.currentStreak;
            saveProgress();
        }
        feedbackMessage.textContent = 'Richtig!';
        feedbackMessage.style.color = '#22c55e'; // Green
    } else {
        state.currentStreak = 0;
        // Display the correct answer if provided (for fill-blank, vocab, listening)
        if (correctAnswerProvided) {
            feedbackMessage.textContent = `Falsch! Die richtige Antwort war "${correctAnswerProvided}"`;
        } else {
            feedbackMessage.textContent = 'Falsch!';
        }
        feedbackMessage.style.color = '#ef4444'; // Red
    }
    exerciseStreak.textContent = `🔥 ${state.currentStreak}`;

    // Disable options/buttons after an answer is given for relevant exercises
    if (state.exerciseMode === 'vocabulary' || state.exerciseMode === 'listening' || state.exerciseMode === 'fill-blank') {
        const optionsContainer = document.getElementById(
            state.exerciseMode === 'vocabulary' ? 'vocab-options' :
            (state.exerciseMode === 'listening' ? 'listening-options' : 'fill-blank-options')
        );
        if (optionsContainer) {
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
        }
    }
    
    // Auto-advance for most quizzes after a short delay
    if (state.exerciseMode !== 'matching' && state.exerciseMode !== 'speaking') {
        setTimeout(nextQuestion, 1500);
    }
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
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer, correctAnswer); // Pass correct answer
            btn.classList.add(opt === correctAnswer ? 'correct' : 'incorrect');
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
            if (opt !== correctAnswer) {
                const correctBtn = Array.from(optionsContainer.querySelectorAll('button')).find(b => b.textContent === correctAnswer);
                if (correctBtn) correctBtn.classList.add('correct');
            }
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(state.shuffledData.length);
}

function displayMatchingExercise() {
    state.selectedGerman = null;
    state.selectedAmharic = null;
    state.matchedPairs = 0; // Reset for new matching game

    const germanContainer = document.getElementById('german-words');
    const amharicContainer = document.getElementById('amharic-words');
    germanContainer.innerHTML = '';
    amharicContainer.innerHTML = '';

    const germanWords = shuffleArray(state.shuffledData.map(v => v.german));
    const amharicWords = shuffleArray(state.shuffledData.map(v => v.amharic));

    germanWords.forEach(word => {
        const btn = document.createElement('button');
        btn.textContent = word;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
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
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            if (state.selectedAmharic) state.selectedAmharic.classList.remove('selected');
            state.selectedAmharic = btn;
            btn.classList.add('selected');
            checkMatch();
        };
        amharicContainer.appendChild(btn);
    });
    updateProgress(1); // Update progress for each matching game
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
        handleAnswer(true); // Call handleAnswer for streak/score
    } else {
        state.selectedGerman.classList.add('incorrect');
        state.selectedAmharic.classList.add('incorrect');
        handleAnswer(false); // Call handleAnswer for streak/score
    }

    // Reset selection and visual feedback after a short delay
    setTimeout(() => {
        if (state.selectedGerman) state.selectedGerman.classList.remove('selected', 'incorrect');
        if (state.selectedAmharic) state.selectedAmharic.classList.remove('selected', 'incorrect');
        state.selectedGerman = null;
        state.selectedAmharic = null;

        if (state.matchedPairs === state.shuffledData.length) {
            feedbackMessage.textContent = 'Super gemacht! Alle Paare gefunden.';
            setTimeout(showResults, 1500); // End game if all matched
        }
    }, 800);
}

// --- NEW/MODIFIED: fetchAndDisplayGeneratedFillBlankSentenceAI ---
async function fetchAndDisplayGeneratedFillBlankSentenceAI() {
    try {
        feedbackMessage.textContent = 'Generiere neue Sätze...'; // User feedback
        feedbackMessage.style.color = '#3b82f6'; // Blue for loading
        
        // Clear previous options
        const optionsContainer = document.getElementById('fill-blank-options');
        optionsContainer.innerHTML = '';

        // Call our backend API to get an AI-generated sentence
        const response = await fetch('/api/generate-ai-sentence'); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // Backend now sends structured JSON directly
        const generatedData = await response.json(); 

        if (!generatedData || !generatedData.amharic || !generatedData.german || !generatedData.blank) {
            throw new Error('Incomplete data received from AI sentence generation.');
        }

        // Store the single generated sentence in shuffledData for consistency with state
        state.shuffledData = [{ 
            german: generatedData.german,
            amharic: generatedData.amharic, // This will be the Amharic sentence with '____'
            blank: generatedData.blank      // This is the German word corresponding to the blank
        }];
        state.currentQuestionIndex = 0; // Reset as we're always dealing with a single new question
        updateProgress(1); // Progress for single AI question (1/1)

        const questionData = state.shuffledData[state.currentQuestionIndex];
        const sentenceContainer = document.getElementById('fill-blank-sentence');
        // Display the Amharic sentence, replacing the blank marker with a highlighted blank space
        sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-blue-600">____</span>`);

        // Get the correct Amharic word that corresponds to the 'blank' German word
        // This word is what the user needs to select.
        const correctAnswerAmharic = vocabulary.find(v => v.german === questionData.blank)?.amharic;

        if (!correctAnswerAmharic) {
            // This should ideally not happen if vocabulary matches backend's choice
            console.error("Fehler: Das Lückenwort konnte nicht im lokalen Wortschatz gefunden werden. Überspringe Frage.", questionData.blank);
            feedbackMessage.textContent = "Fehler: Lückenwort nicht gefunden im Wortschatz. Überspringen.";
            feedbackMessage.style.color = '#ef4444';
            setTimeout(nextQuestion, 2000); // Skip to next AI sentence
            return;
        }

        // Generate options for the blank. Include the correct answer and 3 random incorrect ones.
        const options = shuffleArray([
            correctAnswerAmharic,
            ...shuffleArray(vocabulary.filter(v => v.amharic !== correctAnswerAmharic).map(v => v.amharic)).slice(0, 3)
        ]);
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
            btn.onclick = () => {
                const isCorrect = (opt === correctAnswerAmharic);
                handleAnswer(isCorrect, correctAnswerAmharic); // Pass correct answer to handleAnswer
                btn.classList.add(isCorrect ? 'correct' : 'incorrect');
                if (!isCorrect) { // Highlight correct answer if user was wrong
                    const correctBtn = Array.from(optionsContainer.children).find(b => b.textContent === correctAnswerAmharic);
                    if (correctBtn) correctBtn.classList.add('correct');
                }
            };
            optionsContainer.appendChild(btn);
        });
        feedbackMessage.textContent = ''; // Clear loading message
    } catch (error) {
        console.error('Error fetching/displaying AI generated sentence:', error);
        feedbackMessage.textContent = 'Fehler beim Laden der KI-Sätze. Bitte versuchen Sie es erneut.';
        feedbackMessage.style.color = '#ef4444';
        setTimeout(showMainMenu, 3000); // Go back to main menu on severe error
    }
}

// --- REMOVED: displayFillBlankQuestion ---
// This function is no longer needed as fetchAndDisplayGeneratedFillBlankSentenceAI
// handles both fetching the AI content and displaying the question for the fill-blank exercise.


function displayListeningQuestion() {
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const correctAnswer = questionData.german;
    const options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v.german !== correctAnswer).map(v => v.german)).slice(0, 3)]);
    const optionsContainer = document.getElementById('listening-options');
    optionsContainer.innerHTML = '';

    document.getElementById('play-audio-btn').onclick = () => speak(questionData.amharic, 'am-ET');
    speak(questionData.amharic, 'am-ET'); // Automatically play audio when question is displayed

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer, correctAnswer); // Pass correct answer
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
    // nextSpeakingBtn.classList.add('hidden'); // If you add nextSpeakingBtn back, uncomment this
    updateProgress(state.shuffledData.length);
}

// --- RESULTS ---
function showResults() {
    exerciseArea.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    // Calculate total questions based on exercise type for accurate score display
    let totalQuestionsForScore = state.shuffledData.length;
    if (state.exerciseMode === 'fill-blank') {
        // For fill-blank, if each AI question is a new 'round', total can be simply state.score
        // or a predefined number if you want a fixed number of AI questions per session.
        // For now, let's just show the score count as total, as there isn't a fixed 'total' for AI questions.
        totalQuestionsForScore = state.score > 0 ? state.score : 0; // If score is 0, total is 0. Prevents 0/0.
        // If you want a fixed number of AI questions per exercise session, you'd define that earlier.
    }
    
    document.getElementById('score').textContent = `${state.score} / ${totalQuestionsForScore}`;
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
if (micBtn && recognition) { // Only add listeners if micBtn and recognition exist
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

    recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        const targetWord = state.shuffledData[state.currentQuestionIndex].amharic; // Target Amharic word for speaking practice

        speechFeedback.textContent = `You said: "${spokenText}"`;
        const isCorrect = spokenText.trim().toLowerCase() === targetWord.trim().toLowerCase(); // Case-insensitive compare

        handleAnswer(isCorrect, targetWord); // Pass correct answer for feedback

        if (isCorrect) {
            speechFeedback.style.color = '#22c55e'; // Green
            setTimeout(nextQuestion, 1500); // Auto-advance on correct
        } else {
            speechFeedback.style.color = '#ef4444'; // Red
            feedbackMessage.textContent = `Falsch! Versuchen Sie es erneut. Das richtige Wort ist "${targetWord}"`;
            // Removed nextSpeakingBtn interaction, assuming auto-advance or re-attempt.
            // If you need a manual next for speaking, you'll need to re-add that button and its logic.
        }
    };
    recognition.onend = () => {
        micBtn.classList.remove('listening');
    };
    recognition.onerror = (event) => {
        speechFeedback.textContent = `Error: ${event.error}`;
        micBtn.classList.remove('listening');
        // nextSpeakingBtn.classList.remove('hidden'); // If you add nextSpeakingBtn back, uncomment this
    };
}
// Removed nextSpeakingBtn event listener as the button isn't consistently available or its logic changed.
// If you want a manual 'Next' for speaking, reconsider its placement and interaction.


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

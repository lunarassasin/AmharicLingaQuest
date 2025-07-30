// script.js (Frontend)

// --- DATA (will be fetched from server) ---
let vocabulary = [];
let sentences = [];

// --- STATE MANAGEMENT ---
let state = {
    exerciseMode: null,
    currentQuestionIndex: 0,
    score: 0,
    currentStreak: 0,
    highestStreak: 0, // This will now be primarily managed by the backend
    shuffledData: [],
    selectedSourceWord: null, // Renamed from selectedGerman for matching, now holds the source language word
    selectedAmharic: null,
    matchedPairs: 0,
    userToken: localStorage.getItem('jwtToken') || null,
    userId: localStorage.getItem('userId') || null,
    username: localStorage.getItem('username') || null,
    // NEW: Source language state
    sourceLanguage: localStorage.getItem('sourceLanguage') || 'english', // Default to ENGLISH
};

// --- SPEECH RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'am-ET'; // Amharic for target language
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
const logoutBtn = document.getElementById('logout-btn');

// Main App UI
const mainMenu = document.getElementById('main-menu');
const exerciseArea = document.getElementById('exercise-area');
const resultScreen = document.getElementById('result-screen');
const backToMenuBtn = document.getElementById('back-to-menu');
const resultsBackToMenuBtn = document.getElementById('results-back-to-menu-btn');
const exerciseTitle = document.getElementById('exercise-title');
const progressBar = document.getElementById('progress-bar');
const feedbackMessage = document.getElementById('feedback-message');
const exerciseStreak = document.getElementById('exercise-streak');

// UI Elements for XP and Daily Streak
const xpDisplay = document.getElementById('xp-display');
const dailyStreakDisplay = document.getElementById('daily-streak-display');
const highestStreakDisplay = document.getElementById('streak-display'); // Renamed for clarity

// NEW: Language selection UI
const languageSelect = document.getElementById('language-select'); // Assuming a <select> element
const currentLanguageDisplay = document.getElementById('current-language-display'); // To show selected language

// Exercise-specific elements
const ui = {
    'vocabulary': document.getElementById('vocabulary-ui'),
    'matching': document.getElementById('matching-ui'),
    'fill-blank': document.getElementById('fill-blank-ui'),
    'listening': document.getElementById('listening-ui'),
    'speaking': document.getElementById('speaking-ui'),
};
const micBtn = document.getElementById('mic-btn');
const speechFeedback = document.getElementById('speech-feedback');
const playAudioBtn = document.getElementById('play-audio-btn'); // Get reference to the play audio button


// --- LOCAL STORAGE ---
// Simplified as main progress is on server, but language preference is local
function saveLanguagePreference(lang) {
    localStorage.setItem('sourceLanguage', lang);
    state.sourceLanguage = lang;
    updateLanguageDisplay();
}

function loadLanguagePreference() {
    state.sourceLanguage = localStorage.getItem('sourceLanguage') || 'english'; // Default to ENGLISH
    if (languageSelect) {
        languageSelect.value = state.sourceLanguage;
    }
    updateLanguageDisplay();
}

function updateLanguageDisplay() {
    if (currentLanguageDisplay) {
        const langMap = {
            'german': 'German',
            'english': 'English',
            'french': 'French',
            'spanish': 'Spanish'
        };
        currentLanguageDisplay.textContent = `Learning Language: ${langMap[state.sourceLanguage] || state.sourceLanguage}`;
    }
}

// --- UTILITY ---
const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper to convert PCM to WAV Blob
function pcmToWav(pcmData, sampleRate) {
    const numChannels = 1;
    const bytesPerSample = 2; // PCM 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    // RIFF chunk
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // BitsPerSample

    // DATA sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true); // Subchunk2Size

    const combined = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
    combined.set(new Uint8Array(wavHeader), 0);
    combined.set(new Uint8Array(pcmData), wavHeader.byteLength);

    return new Blob([combined], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// New function to synthesize speech using backend API
async function synthesizeSpeech(text, lang) {
    if (playAudioBtn) {
        playAudioBtn.disabled = true;
        playAudioBtn.innerHTML = '<svg class="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    }

    try {
        const apiKey = ""; // Canvas will inject the API key at runtime
        const apiUrl = `/api/synthesize-amharic-speech`; // Use relative path to your backend endpoint

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang }) // Send text and language to backend
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        const audioData = result?.audioData;
        const mimeType = result?.mimeType;
        const sampleRate = result?.sampleRate;

        if (audioData && mimeType && mimeType.startsWith("audio/L16") && sampleRate) {
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData); // API returns signed PCM16 audio data.
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl); // Clean up the object URL after playing
                if (playAudioBtn) {
                    playAudioBtn.disabled = false;
                    playAudioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 16 16"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-1.414 1.414A6.472 6.472 0 0 1 12.026 8a6.472 6.472 0 0 1-1.904 4.606l1.414 1.414zM10.121 12.596A6.48 6.48 0 0 0 12.026 8a6.48 6.48 0 0 0-1.905-4.596l-1.414 1.414A4.486 4.486 0 0 1 10.026 8a4.486 4.486 0 0 1-1.313 3.182l1.414 1.414zM8.707 11.182A4.486 4.486 0 0 0 10.026 8a4.486 4.486 0 0 0-1.319-3.182L7.293 6.23A2.488 2.488 0 0 1 8.026 8a2.488 2.488 0 0 1-.732 1.768l1.414 1.414zM6 2.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-1 0v-10a.5.5 0 0 1 .5-.5zM4 4.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm-2 2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5z"/></svg>';
                }
            };
        } else {
            console.error("Invalid audio data received from API:", result);
            alert("Failed to play audio: Invalid data.");
            if (playAudioBtn) {
                playAudioBtn.disabled = false;
                playAudioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 16 16"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-1.414 1.414A6.472 6.472 0 0 1 12.026 8a6.472 6.472 0 0 1-1.904 4.606l1.414 1.414zM10.121 12.596A6.48 6.48 0 0 0 12.026 8a6.48 6.48 0 0 0-1.905-4.596l-1.414 1.414A4.486 4.486 0 0 1 10.026 8a4.486 4.486 0 0 1-1.313 3.182l1.414 1.414zM8.707 11.182A4.486 4.486 0 0 0 10.026 8a4.486 4.486 0 0 0-1.319-3.182L7.293 6.23A2.488 2.488 0 0 1 8.026 8a2.488 2.488 0 0 1-.732 1.768l1.414 1.414zM6 2.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-1 0v-10a.5.5 0 0 1 .5-.5zM4 4.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm-2 2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5z"/></svg>';
            }
        }
    } catch (error) {
        console.error('Error synthesizing speech:', error);
        alert('Failed to synthesize speech. Please try again.');
        if (playAudioBtn) {
            playAudioBtn.disabled = false;
            playAudioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 16 16"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-1.414 1.414A6.472 6.472 0 0 1 12.026 8a6.472 6.472 0 0 1-1.904 4.606l1.414 1.414zM10.121 12.596A6.48 6.48 0 0 0 12.026 8a6.48 6.48 0 0 0-1.905-4.596l-1.414 1.414A4.486 4.486 0 0 1 10.026 8a4.486 4.486 0 0 1-1.313 3.182l1.414 1.414zM8.707 11.182A4.486 4.486 0 0 0 10.026 8a4.486 4.486 0 0 0-1.319-3.182L7.293 6.23A2.488 2.488 0 0 1 8.026 8a2.488 2.488 0 0 1-.732 1.768l1.414 1.414zM6 2.5a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-1 0v-10a.5.5 0 0 1 .5-.5zM4 4.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm-2 2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5z"/></svg>';
            }
        }
    }


const speak = (text, lang) => {
    if (lang === 'am-ET') {
        synthesizeSpeech(text, lang); // Use the new API for Amharic
    } else if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech synthesis not supported in this browser for non-Amharic languages.");
    }
};

// --- AUTHENTICATION FUNCTIONS ---
function showAuthArea() {
    authArea.classList.remove('hidden');
    mainMenu.classList.add('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    showLoginForm();
}

function showLoginForm() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authFeedback.textContent = '';
}

function showRegisterForm() {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    authFeedback.textContent = '';
}

async function handleRegister() {
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value.trim();
    const confirmPassword = registerConfirmPasswordInput.value.trim();

    if (!username || !password || !confirmPassword) {
        authFeedback.textContent = 'Please fill in all fields.';
        return;
    }
    if (password !== confirmPassword) {
        authFeedback.textContent = 'Passwords do not match.';
        return;
    }
    if (password.length < 6) {
        authFeedback.textContent = 'Password must be at least 6 characters long.';
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
            authFeedback.textContent = 'Registration successful! Please log in.';
            authFeedback.style.color = '#22c55e';
            setTimeout(showLoginForm, 1500);
            registerUsernameInput.value = '';
            registerPasswordInput.value = '';
            registerConfirmPasswordInput.value = '';
        } else {
            authFeedback.textContent = data.msg || 'Registration failed.';
            authFeedback.style.color = '#ef4444';
        }
    } catch (error) {
        console.error('Registration error:', error);
        authFeedback.textContent = 'A server error occurred.';
        authFeedback.style.color = '#ef4444';
    }
}

async function handleLogin() {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        authFeedback.textContent = 'Please enter username and password.';
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
            authFeedback.textContent = data.msg || 'Login failed.';
            authFeedback.style.color = '#ef4444';
        }
    } catch (error) {
        console.error('Login error:', error);
        authFeedback.textContent = 'A server error occurred.';
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
    authFeedback.textContent = '';
    console.log('User logged in:', username, 'ID:', userId);
    fetchVocabulary(); // This will now fetch vocabulary and then call fetchUserProfile
}

function handleLogout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('sourceLanguage'); // Clear language preference on logout
    state.userToken = null;
    state.userId = null;
    state.username = null;
    state.sourceLanguage = 'english'; // Reset to default ENGLISH
    alert('You have been logged out.');
    showAuthArea();
}

// --- Function to fetch and display user profile (XP, Daily Streak, etc.) ---
async function fetchUserProfile() {
    if (!state.userId || !state.userToken) {
        console.warn("Cannot fetch user profile: user not logged in.");
        return;
    }

    try {
        const response = await fetch(`/api/user/profile/${state.userId}`, {
            headers: {
                'Authorization': `Bearer ${state.userToken}`
            }
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                alert('Session expired or unauthorized. Please log in again.');
                handleLogout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const profileData = await response.json();

        // Update DOM elements
        if (xpDisplay) xpDisplay.textContent = `XP: ${profileData.xp}`;
        if (dailyStreakDisplay) dailyStreakDisplay.textContent = `Daily Streak: ${profileData.daily_streak} 🔥`;
        state.highestStreak = profileData.highest_streak;
        if (highestStreakDisplay) highestStreakDisplay.textContent = `Highest Streak: 🔥 ${state.highestStreak}`;

        // Set user's preferred language from profile if available, otherwise use local or default
        if (profileData.preferred_source_language && profileData.preferred_source_language !== state.sourceLanguage) {
            saveLanguagePreference(profileData.preferred_source_language);
            // No need to refetch vocabulary here, as fetchVocabulary is called after login
        } else {
            // If no preference from backend, ensure local storage is used
            loadLanguagePreference(); // Ensure UI reflects current state
        }

    } catch (error) {
        console.error('Error fetching user profile:', error);
    }
}

// --- FETCH VOCABULARY FROM SERVER (Now sends sourceLanguage) ---
async function fetchVocabulary() {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (state.userToken) {
            headers['Authorization'] = `Bearer ${state.userToken}`;
        }
        if (!state.userId) {
            console.error("User ID not available for vocabulary fetch. Showing login.");
            showAuthArea();
            return;
        }

        // Pass sourceLanguage as a query parameter
        const response = await fetch(`/api/vocabulary?userId=${state.userId}&sourceLanguage=${state.sourceLanguage}`, { headers });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                alert('Session expired or unauthorized. Please log in again.');
                handleLogout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        vocabulary = data.vocabulary;
        sentences = data.sentences;
        // Update sourceLanguage from backend response, ensuring consistency
        state.sourceLanguage = data.sourceLanguage || state.sourceLanguage;
        saveLanguagePreference(state.sourceLanguage); // Save to local storage

        console.log('Vocabulary loaded:', vocabulary);
        console.log('Sentences loaded:', sentences);

        await fetchUserProfile(); // Fetch profile to update XP/Streaks and potentially language preference
        showMainMenu();
    } catch (error) {
        console.error('Failed to fetch vocabulary:', error);
        alert('Could not load vocabulary. Please check the server connection or your authentication.');
        showAuthArea();
    }
}

// --- CORE LOGIC ---
function showMainMenu() {
    authArea.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    updateLanguageDisplay(); // Ensure language display is updated when showing main menu
}

async function startExercise(mode) {
    if (vocabulary.length === 0) {
        alert("Vocabulary not yet loaded. Please wait or refresh the page.");
        fetchVocabulary();
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
            exerciseTitle.textContent = `Vocabulary Quiz (${getLanguageName(state.sourceLanguage)} - Amharic)`;
            state.shuffledData = shuffleArray([...vocabulary]);
            displayVocabularyQuestion();
            break;
        case 'matching':
            exerciseTitle.textContent = `Word Matching (${getLanguageName(state.sourceLanguage)} - Amharic)`;
            state.shuffledData = shuffleArray([...vocabulary]).slice(0, 5);
            state.matchedPairs = 0;
            displayMatchingExercise();
            break;
        case 'fill-blank':
            exerciseTitle.textContent = `Fill in the Blank (${getLanguageName(state.sourceLanguage)} - Amharic)`;
            await fetchAndDisplayGeneratedFillBlankSentenceAI();
            break;
        case 'listening':
            exerciseTitle.textContent = `Listening Practice (${getLanguageName(state.sourceLanguage)} - Amharic)`;
            state.shuffledData = shuffleArray([...vocabulary]);
            displayListeningQuestion();
            break;
        case 'speaking':
            exerciseTitle.textContent = `Speaking Practice (${getLanguageName(state.sourceLanguage)} - Amharic)`;
            if (!recognition) {
                alert("Sorry, your browser does not support speech recognition. Try Chrome or Edge.");
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

// --- handleAnswer (now only for SRS and current streak) ---
function handleAnswer(isCorrect, correctAnswerProvided = null, vocabularyId = null) {
    if (isCorrect) {
        state.score++;
        state.currentStreak++;
        feedbackMessage.textContent = 'Correct!';
        feedbackMessage.style.color = '#22c55e';
    } else {
        state.currentStreak = 0;
        if (correctAnswerProvided) {
            feedbackMessage.textContent = `Incorrect! The correct answer was "${correctAnswerProvided}"`;
        } else {
            feedbackMessage.textContent = 'Incorrect!';
        }
        feedbackMessage.style.color = '#ef4444';
    }
    exerciseStreak.textContent = `🔥 ${state.currentStreak}`;

    if (state.exerciseMode === 'vocabulary' || state.exerciseMode === 'listening' || state.exerciseMode === 'fill-blank' || state.exerciseMode === 'speaking') {
        const optionsContainer = document.getElementById(
            state.exerciseMode === 'vocabulary' ? 'vocab-options' :
            (state.exerciseMode === 'listening' ? 'listening-options' : (state.exerciseMode === 'fill-blank' ? 'fill-blank-options' : null))
        );
        if (optionsContainer) {
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
        }
    }

    // --- SRS Update Call (ONLY SRS here) ---
    if (vocabularyId && state.userId) {
        updateUserSRSOnServer(vocabularyId, isCorrect);
    }

    if (state.exerciseMode !== 'matching' && state.exerciseMode !== 'speaking') {
        setTimeout(nextQuestion, 1500);
    }
}

// Function to update user SRS progress on server
async function updateUserSRSOnServer(vocabularyId, isCorrect) {
    try {
        const response = await fetch('/api/vocabulary/update_srs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.userToken}`
            },
            body: JSON.stringify({
                userId: state.userId,
                vocabularyId: vocabularyId,
                isCorrect: isCorrect,
            })
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                alert('Session expired or unauthorized. Please log in again.');
                handleLogout();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('SRS update response:', data);

    } catch (error) {
        console.error('Error updating SRS on server:', error);
        feedbackMessage.textContent = 'Error saving progress.';
        feedbackMessage.style.color = '#ef4444';
    }
}


// --- EXERCISE-SPECIFIC DISPLAY FUNCTIONS (Now dynamic for source language) ---

function getLanguageName(langCode) {
    const names = {
        'german': 'German',
        'english': 'English',
        'french': 'French',
        'spanish': 'Spanish'
    };
    return names[langCode] || langCode; // Fallback to code if not found
}

function displayVocabularyQuestion() {
    const isAmharicToSource = Math.random() > 0.5; // Amharic to selected source language
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const vocabularyId = questionData.vocabulary_id;

    // Dynamically select the source word based on state.sourceLanguage
    const sourceWord = questionData[`${state.sourceLanguage}_word`]; // Access dynamic property

    const questionWord = isAmharicToSource ? questionData.amharic : sourceWord;
    const correctAnswer = isAmharicToSource ? sourceWord : questionData.amharic;
    const optionSourceProp = isAmharicToSource ? `${state.sourceLanguage}_word` : 'amharic'; // Property name for options

    document.getElementById('vocab-prompt').textContent = `What does the word mean in ${isAmharicToSource ? getLanguageName(state.sourceLanguage) : 'Amharic'}?`;
    document.getElementById('vocab-word').textContent = questionWord;

    let options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v[optionSourceProp] !== correctAnswer).map(v => v[optionSourceProp])).slice(0, 3)]);
    const optionsContainer = document.getElementById('vocab-options');
    optionsContainer.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer, correctAnswer, vocabularyId);
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
    state.selectedSourceWord = null; // Renamed from selectedGerman
    state.selectedAmharic = null;
    state.matchedPairs = 0;

    const sourceContainer = document.getElementById('german-words'); // Re-using 'german-words' for source language
    const amharicContainer = document.getElementById('amharic-words');
    sourceContainer.innerHTML = '';
    amharicContainer.innerHTML = '';

    // Dynamically get source words
    const sourceWords = shuffleArray(state.shuffledData.map(v => v[`${state.sourceLanguage}_word`]));
    const amharicWords = shuffleArray(state.shuffledData.map(v => v.amharic));

    sourceWords.forEach(word => {
        const btn = document.createElement('button');
        btn.textContent = word;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            if (state.selectedSourceWord) state.selectedSourceWord.classList.remove('selected');
            state.selectedSourceWord = btn; // Storing the source language button here
            btn.classList.add('selected');
            checkMatch();
        };
        sourceContainer.appendChild(btn);
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
    updateProgress(1);
}

function checkMatch() {
    if (!state.selectedSourceWord || !state.selectedAmharic) return;

    const sourceText = state.selectedSourceWord.textContent; // This is now the source language text
    const amharicText = state.selectedAmharic.textContent;

    // Find the correct pair in the vocabulary based on the selected source language
    const correctPair = vocabulary.find(v => v[`${state.sourceLanguage}_word`] === sourceText && v.amharic === amharicText);

    if (correctPair) {
        state.matchedPairs++;
        state.selectedSourceWord.classList.add('matched');
        state.selectedAmharic.classList.add('matched');
        state.selectedSourceWord.disabled = true;
        state.selectedAmharic.disabled = true;
        handleAnswer(true);
    } else {
        state.selectedSourceWord.classList.add('incorrect');
        state.selectedAmharic.classList.add('incorrect');
        handleAnswer(false);
    }

    setTimeout(() => {
        if (state.selectedSourceWord) state.selectedSourceWord.classList.remove('selected', 'incorrect');
        if (state.selectedAmharic) state.selectedAmharic.classList.remove('selected', 'incorrect');
        state.selectedSourceWord = null;
        state.selectedAmharic = null;

        if (state.matchedPairs === state.shuffledData.length) {
            feedbackMessage.textContent = 'Well done! All pairs found.';
            setTimeout(showResults, 1500);
        }
    }, 800);
}

async function fetchAndDisplayGeneratedFillBlankSentenceAI() {
    try {
        feedbackMessage.textContent = 'Generating new sentences...';
        feedbackMessage.style.color = '#3b82f6';
        
        const optionsContainer = document.getElementById('fill-blank-options');
        optionsContainer.innerHTML = '';

        // Pass sourceLanguage to the AI sentence generation endpoint
        const response = await fetch(`/api/generate-ai-sentence?sourceLanguage=${state.sourceLanguage}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const generatedData = await response.json(); // This will have properties like { english: "...", amharic: "...", blank: "...", vocabulary_id: ... }

        if (!generatedData || !generatedData.amharic || !generatedData[state.sourceLanguage] || !generatedData.blank || generatedData.vocabulary_id === undefined) {
            console.error("Incomplete AI data:", generatedData);
            throw new Error('Incomplete data received from AI sentence generation.');
        }

        state.shuffledData = [{
            source_sentence: generatedData[state.sourceLanguage], // The sentence in the selected source language
            amharic: generatedData.amharic,
            blank: generatedData.blank, // The blank word in the selected source language
            vocabulary_id: generatedData.vocabulary_id
        }];
        state.currentQuestionIndex = 0;
        updateProgress(1); // This line was incomplete in your provided code

        const questionData = state.shuffledData[state.currentQuestionIndex];
        const sentenceContainer = document.getElementById('fill-blank-sentence');
        // Display the source language sentence, replacing the blank marker
        sentenceContainer.innerHTML = questionData.source_sentence.replace('____', `<span class="font-bold text-blue-600">____</span>`);

        // Get the correct source language word that corresponds to the blank
        // IMPORTANT FIX: Use generatedData.blank directly as it's the word the AI chose for the blank.
        const correctAnswerSource = generatedData.blank;

        // We still try to find the vocabulary item locally to get its ID for SRS updates.
        // If it's not found, it means the AI picked a word not currently in the user's SRS review queue.
        const localVocabItem = vocabulary.find(v => v.vocabulary_id === questionData.vocabulary_id);

        if (!localVocabItem) {
            console.warn("Warning: The blank word's vocabulary_id was not found in the local SRS vocabulary. SRS progress might not be updated correctly for this specific word.", questionData.blank, questionData.vocabulary_id);
            // We can still proceed with the exercise, but SRS update for this word might be skipped or inaccurate.
            // The error message to the user can be removed or changed to a less critical warning.
            // Removing the `return` here allows the exercise to continue.
        }

        // Generate options for the blank. Include the correct answer and 3 random incorrect ones.
        // Ensure options are also in the correct source language.
        const options = shuffleArray([
            correctAnswerSource,
            ...shuffleArray(vocabulary.filter(v => v[`${state.sourceLanguage}_word`] !== correctAnswerSource).map(v => v[`${state.sourceLanguage}_word`])).slice(0, 3)
        ]);
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
            btn.onclick = () => {
                const isCorrect = (opt === correctAnswerSource);
                // Pass the vocabulary_id from the generated data, as it's the source of truth for the AI's chosen word.
                handleAnswer(isCorrect, correctAnswerSource, questionData.vocabulary_id); 
                btn.classList.add(isCorrect ? 'correct' : 'incorrect');
                if (!isCorrect) {
                    const correctBtn = Array.from(optionsContainer.children).find(b => b.textContent === correctAnswerSource);
                    if (correctBtn) correctBtn.classList.add('correct');
                }
            };
            optionsContainer.appendChild(btn);
        });
        feedbackMessage.textContent = '';
    } catch (error) {
        console.error('Error fetching/displaying generated sentence:', error);
        feedbackMessage.textContent = 'Error generating sentences. Please try again.';
        feedbackMessage.style.color = '#ef4444';
        setTimeout(showMainMenu, 3000);
    }
}

function displayListeningQuestion() {
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const vocabularyId = questionData.vocabulary_id;
    const correctAnswer = questionData[`${state.sourceLanguage}_word`]; // Correct answer is now in the source language
    const options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v[`${state.sourceLanguage}_word`] !== correctAnswer).map(v => v[`${state.sourceLanguage}_word`])).slice(0, 3)]);
    const optionsContainer = document.getElementById('listening-options');
    optionsContainer.innerHTML = '';

    if (playAudioBtn) {
        playAudioBtn.onclick = () => speak(questionData.amharic, 'am-ET');
    }
    speak(questionData.amharic, 'am-ET'); // Automatically play on question display

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg hover:bg-gray-100 transition-colors duration-200';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer, correctAnswer, vocabularyId);
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
    const vocabularyId = questionData.vocabulary_id;
    document.getElementById('speaking-word').textContent = questionData.amharic; // User speaks Amharic word
    updateProgress(state.shuffledData.length);

    if (recognition) {
        recognition.onresult = (event) => {
            const spokenText = event.results[0][0].transcript;
            const targetWord = state.shuffledData[state.currentQuestionIndex].amharic;

            speechFeedback.textContent = `You said: "${spokenText}"`;
            const isCorrect = spokenText.trim().toLowerCase() === targetWord.trim().toLowerCase();

            handleAnswer(isCorrect, targetWord, vocabularyId);

            if (isCorrect) {
                speechFeedback.style.color = '#22c55e';
                setTimeout(nextQuestion, 1500);
            } else {
                speechFeedback.style.color = '#ef4444';
                feedbackMessage.textContent = `Incorrect! Try again. The correct word is "${targetWord}"`;
            }
        };
    }
}

// --- showResults to call new /api/exercise/complete endpoint ---
async function showResults() {
    exerciseArea.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    
    let totalQuestionsForScore = state.shuffledData.length;
    if (state.exerciseMode === 'fill-blank') {
        totalQuestionsForScore = state.score > 0 ? state.score : 0;
    }
    
    document.getElementById('score').textContent = `${state.score} / ${totalQuestionsForScore}`;
    document.getElementById('restart-btn').onclick = () => startExercise(state.exerciseMode);

    // --- Call backend to mark exercise complete and update XP/Streak ---
    if (state.userId) {
        try {
            const response = await fetch('/api/exercise/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.userToken}`
                },
                body: JSON.stringify({
                    userId: state.userId,
                    exerciseMode: state.exerciseMode,
                    score: state.score,
                    totalQuestions: totalQuestionsForScore
                })
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    alert('Session expired or unauthorized. Please log in again.');
                    handleLogout();
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Exercise completion response:', data);

            // Update main menu displays with final values from backend
            if (xpDisplay) xpDisplay.textContent = `XP: ${data.totalXp}`;
            if (dailyStreakDisplay) dailyStreakDisplay.textContent = `Daily Streak: ${data.newDailyStreak} 🔥`;
            if (highestStreakDisplay) highestStreakDisplay.textContent = `Highest Streak: 🔥 ${data.newHighestStreak}`;

        } catch (error) {
            console.error('Error marking exercise complete on server:', error);
            alert('Error saving exercise completion. XP and Streak may not have updated.');
        }
    }
}

// --- EVENT LISTENERS ---
backToMenuBtn.addEventListener('click', showMainMenu);
resultsBackToMenuBtn.addEventListener('click', showMainMenu);

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
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

// NEW: Language selection event listener
if (languageSelect) {
    languageSelect.addEventListener('change', async (event) => {
        const newLanguage = event.target.value;
        if (state.userId && newLanguage !== state.sourceLanguage) {
            try {
                const response = await fetch('/api/user/update_language', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.userToken}`
                    },
                    body: JSON.stringify({ userId: state.userId, language: newLanguage })
                });

                if (response.ok) {
                    console.log(`Language updated to: ${newLanguage}`);
                    saveLanguagePreference(newLanguage); // Update local state and storage
                    fetchVocabulary(); // Re-fetch vocabulary for the new language
                } else {
                    const errorData = await response.json();
                    alert(`Error updating language: ${errorData.message || 'Unknown error'}`);
                    languageSelect.value = state.sourceLanguage; // Revert selection on error
                }
            } catch (error) {
                console.error('Error updating language preference:', error);
                alert('A network error occurred. Language could not be updated.');
                languageSelect.value = state.sourceLanguage; // Revert selection on error
            }
        } else if (!state.userId) {
            // If not logged in, just update local preference and refetch
            saveLanguagePreference(newLanguage);
            fetchVocabulary(); // This will lead to auth screen if not logged in
        }
    });
}


// Speech Recognition Event Listeners
if (micBtn && recognition) {
    micBtn.addEventListener('click', () => {
        micBtn.classList.add('listening');
        speechFeedback.textContent = 'Listening...';
        try {
            recognition.start();
        } catch (e) {
            console.error("Speech recognition error:", e);
            speechFeedback.textContent = 'Error starting mic.';
            micBtn.classList.remove('listening');
        };
    });

    recognition.onend = () => {
        micBtn.classList.remove('listening');
    };
    recognition.onerror = (event) => {
        speechFeedback.textContent = `Error: ${event.error}`;
        micBtn.classList.remove('listening');
    };
}


// --- INITIALIZATION ---
window.onload = () => {
    loadLanguagePreference(); // Load language preference first
    // No need to call loadProgress() here, as it's redundant.
    // fetchVocabulary() will handle loading user data and showing main menu after auth.
    if (state.userToken && state.userId && state.username) {
        console.log("Found existing session. Attempting auto-login and fetching data.");
        fetchVocabulary(); // This will fetch vocab for the loaded language, then profile
    } else {
        console.log("No active session. Showing login/registration.");
        showAuthArea();
    }
};

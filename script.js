// script.js (Client-side)

// --- DATA (will be fetched from server) ---
let vocabulary = [];
// 'sentences' will now primarily be dynamically generated for fill-blank,
// but keep the variable for consistency if other modes ever need it static.
let sentences = [];

// --- STATE MANAGEMENT ---
let state = {
    exerciseMode: null,
    currentQuestionIndex: 0,
    score: 0,
    currentStreak: 0,
    highestStreak: 0,
    shuffledData: [], // For 'fill-blank', this will hold only the current generated sentence
    selectedGerman: null,
    selectedAmharic: null,
    matchedPairs: 0
};

// --- SPEECH RECOGNITION SETUP ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'am-ET'; // Amharic language code
    recognition.continuous = false; // Stop after a single phrase
    recognition.interimResults = false; // Only return final results
}

// --- DOM ELEMENTS ---
const mainMenu = document.getElementById('main-menu');
const exerciseArea = document.getElementById('exercise-area');
const resultScreen = document.getElementById('result-screen');
const backToMenuBtn = document.getElementById('back-to-menu');
const exerciseTitle = document.getElementById('exercise-title');
const progressBar = document.getElementById('progress-bar');
const feedbackMessage = document.getElementById('feedback-message');
const streakDisplay = document.getElementById('streak-display');
const exerciseStreak = document.getElementById('exercise-streak');

// Exercise-specific UI containers
const ui = {
    'vocabulary': document.getElementById('vocabulary-ui'),
    'matching': document.getElementById('matching-ui'),
    'fill-blank': document.getElementById('fill-blank-ui'),
    'listening': document.getElementById('listening-ui'),
    'speaking': document.getElementById('speaking-ui'),
};
const micBtn = document.getElementById('mic-btn');
const speechFeedback = document.getElementById('speech-feedback');

// --- LOCAL STORAGE ---
function saveProgress() {
    localStorage.setItem('amharicLinguaQuestProgress', JSON.stringify({ highestStreak: state.highestStreak }));
}

function loadProgress() {
    const progress = JSON.parse(localStorage.getItem('amharicLinguaQuestProgress'));
    if (progress) {
        state.highestStreak = progress.highestStreak || 0;
        streakDisplay.textContent = `Höchster Streak: 🔥 ${state.highestStreak}`;
    }
}

// --- UTILITY FUNCTIONS ---
const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);

const speak = (text, lang) => {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9; // Slightly slower for better comprehension
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("Speech synthesis not supported in this browser.");
    }
};

// Helper function to parse LLM output (crucial and can be tricky)
// Adjust this function if Gemini's output format changes or needs more robustness.
function parseLLMOutput(text) {
    // Expected format from prompt: German: "...", Amharic: "...", BlankWord: "..."
    const germanMatch = text.match(/German: "(.*?)"/);
    const amharicMatch = text.match(/Amharic: "(.*?)"/);
    const blankMatch = text.match(/BlankWord: "(.*?)"/);

    if (germanMatch && amharicMatch && blankMatch) {
        return {
            german: germanMatch[1],
            amharic: amharicMatch[1],
            blank: blankMatch[1] // This is the German word for the blank
        };
    }
    console.error("Failed to parse LLM output:", text);
    return null;
}


// --- FETCHING AI-GENERATED SENTENCE ---
async function fetchAndDisplayGeneratedFillBlankSentenceAI() {
    try {
        // Construct the prompt for Gemini. Be very specific about the desired output format!
        const prompt = `Generate a very simple German sentence for a language learner, then translate it to Amharic. The sentence should include a blank '____' where a single German noun can fit, and its corresponding Amharic translation should also have a blank.
Example: "German: "Mein Name ist ____.", Amharic: "ስሜ ____ ነው።", BlankWord: "Name""
Requirement: The blank word must be a simple noun.
Output format: German: "Your German sentence ____.", Amharic: "Your Amharic sentence ____.", BlankWord: "German word for the blank"`;

        const response = await fetch(`/api/generate-ai-sentence?prompt=${encodeURIComponent(prompt)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const generatedText = data.generatedText;

        const parsed = parseLLMOutput(generatedText);

        if (!parsed || !parsed.german || !parsed.amharic || !parsed.blank) {
            throw new Error("Invalid output format from AI. Check prompt or parsing logic.");
        }

        // For fill-blank, we only have one "question" at a time in shuffledData
        state.shuffledData = [{
            german: parsed.german,
            amharic: parsed.amharic,
            blank: parsed.blank // This is the German word to find its Amharic equivalent
        }];
        state.currentQuestionIndex = 0; // Always start at index 0 for a single generated question
        updateProgress(1); // Progress for a single question (1/1)

        displayFillBlankQuestion(); // Display the newly fetched sentence

    } catch (error) {
        console.error('Failed to generate AI-powered sentence:', error);
        alert('Could not load AI-generated exercise. Please check server logs and the AI prompt.');
        showMainMenu(); // Go back to main menu on error
    }
}


// --- FETCH VOCABULARY FROM SERVER (Initial data load) ---
async function fetchVocabulary() {
    try {
        const response = await fetch('/api/vocabulary');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        vocabulary = data.vocabulary;
        sentences = data.sentences; // Keep this, even if not used for AI-gen fill-blank directly
        console.log('Vocabulary loaded:', vocabulary);
        console.log('Sentences loaded:', sentences); // These are your static sentences from DB
        showMainMenu();
    } catch (error) {
        console.error('Failed to fetch vocabulary:', error);
        alert('Could not load vocabulary. Please check the server connection.');
    }
}


// --- CORE LOGIC ---
function showMainMenu() {
    mainMenu.classList.remove('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    loadProgress(); // Load highest streak on menu display
}

async function startExercise(mode) { // This function must be async now!
    // Ensure vocabulary is loaded before starting an exercise
    if (vocabulary.length === 0) {
        alert("Vocabulary is not loaded yet. Please wait or refresh the page.");
        return;
    }

    state.exerciseMode = mode;
    state.currentQuestionIndex = 0;
    state.score = 0;
    state.currentStreak = 0;

    mainMenu.classList.add('hidden');
    exerciseArea.classList.remove('hidden');
    resultScreen.classList.add('hidden');

    // Hide all UI sections first, then show the relevant one
    Object.values(ui).forEach(el => el.classList.add('hidden'));
    if (ui[mode]) {
        ui[mode].classList.remove('hidden');
    }

    feedbackMessage.textContent = '';
    exerciseStreak.textContent = `🔥 ${state.currentStreak}`;

    switch (mode) {
        case 'vocabulary':
            exerciseTitle.textContent = 'Vocabulary Quiz';
            state.shuffledData = shuffleArray([...vocabulary]);
            displayVocabularyQuestion();
            break;
        case 'matching':
            exerciseTitle.textContent = 'Word Matching';
            state.shuffledData = shuffleArray([...vocabulary]).slice(0, 5); // Use a subset for matching
            state.matchedPairs = 0;
            displayMatchingExercise();
            break;
        case 'fill-blank':
            exerciseTitle.textContent = 'Fill in the Blank';
            // Call the AI generation function directly
            await fetchAndDisplayGeneratedFillBlankSentenceAI();
            break;
        case 'listening':
            exerciseTitle.textContent = 'Listening Practice';
            state.shuffledData = shuffleArray([...vocabulary]);
            displayListeningQuestion();
            break;
        case 'speaking':
            exerciseTitle.textContent = 'Speaking Practice';
            if (!recognition) {
                alert("Sorry, your browser doesn't support Speech Recognition. Try Chrome or Edge.");
                showMainMenu();
                return;
            }
            state.shuffledData = shuffleArray([...vocabulary]);
            displaySpeakingExercise();
            break;
    }
}

function nextQuestion() {
    // For AI-generated fill-in-the-blank, we always generate a new sentence
    if (state.exerciseMode === 'fill-blank') {
        fetchAndDisplayGeneratedFillBlankSentenceAI(); // Request a new AI sentence
        return; // Exit here, as the new fetch will call displayFillBlankQuestion
    }

    // Original logic for other exercise modes (vocabulary, matching, listening, speaking)
    state.currentQuestionIndex++;
    feedbackMessage.textContent = '';

    const totalQuestions = state.shuffledData.length;
    if (state.currentQuestionIndex >= totalQuestions) {
        showResults();
        return;
    }

    // Display the next question based on the exercise mode
    switch (state.exerciseMode) {
        case 'vocabulary': displayVocabularyQuestion(); break;
        // 'fill-blank' is handled above
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

    // Specific handling for fill-blank vs. other modes
    if (state.exerciseMode === 'fill-blank') {
        const sentenceContainer = document.getElementById('fill-blank-sentence');
        // If correct, permanently display the correct word in the blank
        if (isCorrect) {
             const questionData = state.shuffledData[state.currentQuestionIndex];
             // Find the Amharic translation of the blank word from the main vocabulary list
             const correctAnswerAmharic = vocabulary.find(v => v.german === questionData.blank)?.amharic;
             if (correctAnswerAmharic) {
                sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-green-600">${correctAnswerAmharic}</span>`);
             }
        }
        // Disable options after answer submission for all cases
        const optionsContainer = document.getElementById('fill-blank-options');
        optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);

        // Schedule the next question generation
        setTimeout(() => {
            nextQuestion(); // This will trigger fetching a new AI sentence
        }, 2000); // Wait 2 seconds before getting the next question
        return; // Exit handleAnswer for fill-blank
    }

    // Default delay for other exercise modes
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
            // nextQuestion is called by handleAnswer after a delay
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
    // For AI-generated questions, state.shuffledData will contain only one item at index 0
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const sentenceContainer = document.getElementById('fill-blank-sentence');
    // Display the Amharic sentence with the blank
    sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-blue-600">____</span>`);

    // Find the correct Amharic translation for the German blank word from your main vocabulary
    const correctAnswerAmharic = vocabulary.find(v => v.german === questionData.blank)?.amharic;
    if (!correctAnswerAmharic) {
        console.error("Could not find Amharic word for blank from vocabulary:", questionData.blank);
        feedbackMessage.textContent = "Error: Blank word not found. Skipping question.";
        feedbackMessage.style.color = '#ef4444';
        setTimeout(nextQuestion, 2000); // Skip and get a new sentence
        return;
    }

    // Generate options: correct answer + 3 random incorrect Amharic words
    const options = shuffleArray([
        correctAnswerAmharic,
        ...shuffleArray(vocabulary.filter(v => v.amharic !== correctAnswerAmharic).map(v => v.amharic)).slice(0, 3)
    ]);
    const optionsContainer = document.getElementById('fill-blank-options');
    optionsContainer.innerHTML = ''; // Clear previous options

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            const isCorrect = opt === correctAnswerAmharic;
            handleAnswer(isCorrect); // handleAnswer now manages next question for fill-blank
            btn.classList.add(isCorrect ? 'correct' : 'incorrect');
            // Options are disabled in handleAnswer
        };
        optionsContainer.appendChild(btn);
    });
    // For AI-generated, total questions for progress is 1, as each is a new question
    updateProgress(1);
}

function displayListeningQuestion() {
    const questionData = state.shuffledData[state.currentQuestionIndex];
    const correctAnswer = questionData.german;
    const options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v.german !== correctAnswer).map(v => v.german)).slice(0, 3)]);
    const optionsContainer = document.getElementById('listening-options');
    optionsContainer.innerHTML = '';

    document.getElementById('play-audio-btn').onclick = () => speak(questionData.amharic, 'am-ET');
    speak(questionData.amharic, 'am-ET'); // Play on load

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            handleAnswer(opt === correctAnswer);
            btn.classList.add(opt === correctAnswer ? 'correct' : 'incorrect');
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
            // nextQuestion is called by handleAnswer after a delay
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(state.shuffledData.length);
}

function displaySpeakingExercise() {
    speechFeedback.textContent = '';
    const questionData = state.shuffledData[state.currentQuestionIndex];
    document.getElementById('speaking-word').textContent = questionData.amharic;
    updateProgress(state.shuffledData.length);
}

// --- RESULTS ---
function showResults() {
    exerciseArea.classList.add('hidden');
    resultScreen.classList.remove('hidden');
    // For fill-blank mode, total score is based on `state.score` directly as questions are endless
    const total = state.exerciseMode === 'matching' ? state.shuffledData.length : state.score; // Or use a fixed number of rounds for AI gen
    document.getElementById('score').textContent = `${state.score} / ${total}`; // Adjust total as per your AI exercise design
    document.getElementById('restart-btn').onclick = () => startExercise(state.exerciseMode);
}

// --- EVENT LISTENERS ---
backToMenuBtn.addEventListener('click', showMainMenu);

// Add event listeners for the exercise buttons
document.querySelectorAll('[data-exercise-mode]').forEach(button => {
    button.addEventListener('click', (event) => {
        const mode = event.target.dataset.exerciseMode;
        startExercise(mode);
    });
});

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
        const targetText = state.shuffledData[state.currentQuestionIndex].amharic;

        speechFeedback.textContent = `You said: "${spokenText}"`;
        const isCorrect = spokenText.trim() === targetText.trim();
        handleAnswer(isCorrect);

        if (isCorrect) {
            speechFeedback.style.color = '#22c55e';
        } else {
            speechFeedback.style.color = '#ef4444';
            feedbackMessage.textContent = `Try again! The correct word is ${targetText}`;
        }

        // For speaking exercise, if incorrect, let them re-attempt or provide option to skip
        if (isCorrect) {
            setTimeout(nextQuestion, 2000);
        } else {
            // Keep mic open for re-attempt or show a "Skip" button
            // For now, let's allow another attempt without auto-advancing on wrong answer
            // Or add a 'Next' button to move on manually
        }
    };
    recognition.onend = () => {
        micBtn.classList.remove('listening');
    };
    recognition.onerror = (event) => {
        speechFeedback.textContent = `Error: ${event.error}`;
        micBtn.classList.remove('listening');
    };
}

// --- INITIALIZATION ---
window.onload = fetchVocabulary; // Call fetchVocabulary on window load

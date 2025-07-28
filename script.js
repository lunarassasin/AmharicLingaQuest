// --- DATA (will be fetched from server) ---
let vocabulary = [];
let sentences = []; // Assuming sentences might also come from DB in the future or be derived from vocabulary

// --- STATE MANAGEMENT ---
let state = {
    exerciseMode: null, currentQuestionIndex: 0, score: 0, currentStreak: 0, highestStreak: 0,
    shuffledData: [], selectedGerman: null, selectedAmharic: null, matchedPairs: 0
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
const mainMenu = document.getElementById('main-menu');
const exerciseArea = document.getElementById('exercise-area');
const resultScreen = document.getElementById('result-screen');
const backToMenuBtn = document.getElementById('back-to-menu');
const exerciseTitle = document.getElementById('exercise-title');
const progressBar = document.getElementById('progress-bar');
const feedbackMessage = document.getElementById('feedback-message');
const streakDisplay = document.getElementById('streak-display');
const exerciseStreak = document.getElementById('exercise-streak');
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

// --- UTILITY ---
const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);
const speak = (text, lang) => {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    }
};

async function fetchAndDisplayGeneratedFillBlankSentenceAI() {
    try {
        const languagePair = "German to Amharic";
        const sentenceContext = "a simple sentence for a beginner about daily life, using a noun.";
        const exampleWord = "Wasser"; // You could even prompt for a specific word type

        const prompt = `Generate a very simple German sentence for a language learner, then translate it to Amharic. The sentence should include a blank '____' where a single German noun can fit, and its corresponding Amharic translation should also have a blank.
        Example: "Mein Name ist ____. -> ስሜ ____ ነው።"
        Requirement: The blank should be replaceable by a single word from my vocabulary.
        Output format: German: "Your German sentence ____.", Amharic: "Your Amharic sentence ____.", BlankWord: "German word for the blank"`;
        // This prompt needs careful crafting to get the exact output format you want.

        const response = await fetch(`/api/generate-ai-sentence?prompt=${encodeURIComponent(prompt)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const generatedText = data.generatedText;

        // You'll need robust parsing logic here to extract German, Amharic, and BlankWord
        // from the generatedText. This is the trickiest part with LLMs.
        // For demonstration, let's assume it always returns something like:
        // "German: "Ich mag ____.", Amharic: "እኔ ____ እወዳለሁ።", BlankWord: "Essen""
        const parsed = parseLLMOutput(generatedText); // Implement this helper function

        if (!parsed || !parsed.german || !parsed.amharic || !parsed.blank) {
            throw new Error("Invalid output format from AI.");
        }

        state.shuffledData = [{
            german: parsed.german,
            amharic: parsed.amharic,
            blank: parsed.blank
        }];
        state.currentQuestionIndex = 0;
        updateProgress(1);
        displayFillBlankQuestion(); // Reuse existing display logic

    } catch (error) {
        console.error('Failed to generate AI-powered sentence:', error);
        alert('Could not load AI-generated exercise. Please check server logs.');
        showMainMenu();
    }
}

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
    return null; // Or throw an error
}

// In startExercise for 'fill-blank' mode:
// await fetchAndDisplayGeneratedFillBlankSentenceAI(); // Call the AI version
// --- FETCH VOCABULARY FROM SERVER ---
async function fetchVocabulary() {
    try {
        // Assuming your server is running on the same host/port and exposes /api/vocabulary
        const response = await fetch('/api/vocabulary'); 
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        vocabulary = data.vocabulary;
        sentences = data.sentences; // Assuming sentences are also part of the fetched data or derived
        console.log('Vocabulary loaded:', vocabulary);
        console.log('Sentences loaded:', sentences);
        // Once data is loaded, you can enable main menu buttons or proceed
        // For now, directly show the main menu
        showMainMenu(); 
    } catch (error) {
        console.error('Failed to fetch vocabulary:', error);
        alert('Could not load vocabulary. Please check the server connection.');
        // Potentially display a user-friendly error message on the page
    }
}


// --- CORE LOGIC ---
function showMainMenu() {
    mainMenu.classList.remove('hidden');
    exerciseArea.classList.add('hidden');
    resultScreen.classList.add('hidden');
    loadProgress();
}

async function startExercise(mode) {
    // Ensure vocabulary is loaded before starting an exercise
    if (vocabulary.length === 0) {
        alert("Vocabulary is not loaded yet. Please wait or refresh.");
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
            exerciseTitle.textContent = 'Vocabulary Quiz';
            state.shuffledData = shuffleArray([...vocabulary]);
            displayVocabularyQuestion();
            break;
        case 'matching':
            exerciseTitle.textContent = 'Word Matching';
            state.shuffledData = shuffleArray([...vocabulary]).slice(0, 5); // 5 pairs
            state.matchedPairs = 0;
            displayMatchingExercise();
            break;
        case 'fill-blank':
            exerciseTitle.textContent = 'Fill in the Blank';
            state.shuffledData = shuffleArray([...sentences]);
            displayFillBlankQuestion();
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
    state.currentQuestionIndex++;
    feedbackMessage.textContent = '';
    
    const totalQuestions = state.shuffledData.length;
    if (state.currentQuestionIndex >= totalQuestions) {
        showResults();
        return;
    }

    switch (state.exerciseMode) {
        case 'vocabulary': displayVocabularyQuestion(); break;
        case 'fill-blank': displayFillBlankQuestion(); break;
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
            setTimeout(nextQuestion, 1500);
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
    
    const correctAnswer = vocabulary.find(v => v.german === questionData.blank)?.amharic;
    if (!correctAnswer) {
        console.error("Could not find Amharic word for blank:", questionData.blank);
        nextQuestion(); // Skip broken question
        return;
    }
    const options = shuffleArray([correctAnswer, ...shuffleArray(vocabulary.filter(v => v.amharic !== correctAnswer).map(v => v.amharic)).slice(0, 3)]);
    const optionsContainer = document.getElementById('fill-blank-options');
    optionsContainer.innerHTML = '';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.className = 'btn w-full bg-white border-2 border-gray-300 text-gray-700 font-semibold py-4 px-4 rounded-lg';
        btn.onclick = () => {
            const isCorrect = opt === correctAnswer;
            handleAnswer(isCorrect);
            btn.classList.add(isCorrect ? 'correct' : 'incorrect');
            if (isCorrect) {
                sentenceContainer.innerHTML = questionData.amharic.replace('____', `<span class="font-bold text-green-600">${correctAnswer}</span>`);
            }
            optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
            setTimeout(nextQuestion, 2000);
        };
        optionsContainer.appendChild(btn);
    });
    updateProgress(state.shuffledData.length);
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
            setTimeout(nextQuestion, 1500);
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
    const total = state.exerciseMode === 'matching' ? state.shuffledData.length : state.currentQuestionIndex;
    document.getElementById('score').textContent = `${state.score} / ${total}`;
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

        if (isCorrect) {
            setTimeout(nextQuestion, 2000);
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

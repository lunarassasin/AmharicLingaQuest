        // --- DATA ---
        const vocabulary = [
            { german: "Hallo", amharic: "ሰላም" }, { german: "Danke", amharic: "አመሰግናለሁ" },
            { german: "Bitte", amharic: "እባክዎን" }, { german: "Ja", amharic: "አዎ" },
            { german: "Nein", amharic: "አይ" }, { german: "Wasser", amharic: "ውሃ" },
            { german: "Essen", amharic: "ምግብ" }, { german: "Haus", amharic: "ቤት" },
            { german: "Liebe", amharic: "ፍቅር" }, { german: "Freund", amharic: "ጓደኛ" },
            { german: "Guten Morgen", amharic: "እንደምን አደሩ" }, { german: "Auf Wiedersehen", amharic: "ደህና ሁኑ" },
            { german: "Ich", amharic: "እኔ" }, { german: "Du", amharic: "አንተ" }, { german: "Name", amharic: "ስም" },
        ];
        const sentences = [
            { german: "Mein Name ist ____.", amharic: "ስሜ ____ ነው።", blank: "Name" },
            { german: "Ich trinke ____.", amharic: "እኔ ____ እጠጣለሁ።", blank: "Wasser" },
            { german: "Das ist mein ____.", amharic: "ይህ የኔ ____ ነው።", blank: "Haus" },
        ];

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

        // --- CORE LOGIC ---
        function showMainMenu() {
            mainMenu.classList.remove('hidden');
            exerciseArea.classList.add('hidden');
            resultScreen.classList.add('hidden');
            loadProgress();
        }

        function startExercise(mode) {
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
        window.onload = showMainMenu;

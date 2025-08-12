document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    
    

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const footerToggle = document.getElementById('footer-toggle');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    
    // --- State Management ---
const urlParams = new URLSearchParams(window.location.search);
const testId = urlParams.get('id');
let currentModule = 1;
let currentQuestion = null;
let savedQuestions = {}; // +++ ADD THIS LINE +++

    // --- Data Definitions (for toolbars) ---
    const questionTypes = {
        "Reading & Writing": {
            "Information and Ideas": ["Central Ideas and Details", "Command of Evidence", "Inferences"],
            "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
            "Expression of Ideas": ["Rhetorical Synthesis", "Transitions"],
            "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"]
        },
        "Math": {
            "Algebra": ["Linear equations in one variable", "Linear functions"],
            "Advanced Math": ["Equivalent expressions", "Nonlinear functions"],
            "Problem-Solving and Data Analysis": ["Ratios, rates, and proportions", "Percentages"],
            "Geometry and Trigonometry": ["Area and volume", "Circles", "Triangles"]
        }
    };
    const pointValues = [10, 20, 30, 40];

    if (!testId) {
        alert('No test ID provided!');
        window.location.href = 'admin.html';
        return;
    }

    // --- REPLACE THIS ENTIRE BLOCK ---
// --- Fetch Test Info and ALL Question Statuses ---
const testRef = db.collection('tests').doc(testId);

testRef.get().then(doc => {
    if (doc.exists) {
        editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
    } else {
        alert('Test not found!');
        window.location.href = 'admin.html';
    }
});

// NEW: Fetch all question statuses at the beginning
testRef.collection('questions').get().then(snapshot => {
    snapshot.forEach(doc => {
        savedQuestions[doc.id] = true; // e.g., { 'm1_q12': true, 'm2_q5': true }
    });
    // Now that we know the status, generate the initial buttons
    generateNavButtons(27, 1);
});
// --- END OF REPLACEMENT ---

    // --- UI Generation Functions ---
    function generateNavButtons(count, moduleNum) {
        questionNavigator.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const button = document.createElement('button');
            button.classList.add('q-nav-btn');
            button.dataset.module = moduleNum;
            button.dataset.qNumber = i;
            button.textContent = i;
            const questionId = `m${moduleNum}_q${i}`;
        if (savedQuestions[questionId]) {
            button.classList.add('completed');
        }
            button.addEventListener('click', handleNavClick);
            questionNavigator.appendChild(button);
        }
    }

    function showEditorForQuestion(module, qNumber) {
        currentModule = module;
        currentQuestion = qNumber;
        
        document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.q-nav-btn[data-module='${module}'][data-q-number='${qNumber}']`);
        if (activeBtn) activeBtn.classList.add('active');

        // --- Clear and display the form template ---
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.innerHTML = '';
        editorContainer.appendChild(formClone);
        
        
        // --- Select all form elements ---
        const questionForm = editorContainer.querySelector('#question-form');
        const stimulusTextarea = document.getElementById('stimulus-textarea'); // We can select this now
        const domainSelect = editorContainer.querySelector('#q-domain');
        const skillSelect = editorContainer.querySelector('#q-skill');
        const pointsSelect = editorContainer.querySelector('#q-points');
        editorContainer.querySelector('#q-number-display').textContent = qNumber;

        // --- Populate Toolbars ---
        const isMath = module > 2;
        const domains = isMath ? Object.keys(questionTypes.Math) : Object.keys(questionTypes["Reading & Writing"]);
        domains.forEach(domain => { domainSelect.innerHTML += `<option value="${domain}">${domain}</option>`; });
        domainSelect.addEventListener('change', () => {
            skillSelect.innerHTML = '';
            const selectedDomain = domainSelect.value;
            const skills = isMath ? questionTypes.Math[selectedDomain] : questionTypes["Reading & Writing"][selectedDomain];
            skills.forEach(skill => { skillSelect.innerHTML += `<option value="${skill}">${skill}</option>`; });
        });
        domainSelect.dispatchEvent(new Event('change'));
        
        let defaultPoints = 20;
        if (qNumber <= 5) defaultPoints = 10;
        else if (qNumber >= 20) defaultPoints = 30;
        pointValues.forEach(val => {
            const selected = (val === defaultPoints) ? 'selected' : '';
            pointsSelect.innerHTML += `<option value="${val}" ${selected}>${val} points</option>`;
        });

                // --- LOGIC TO LOAD EXISTING QUESTION DATA ---
        const questionId = `m${module}_q${qNumber}`;
        db.collection('tests').doc(testId).collection('questions').doc(questionId).get().then(doc => {
            const dataToLoad = doc.exists ? doc.data() : {};
            
            // This one function now handles the entire left panel
            renderStimulus(dataToLoad); 
            
            if (doc.exists) {
                // Load the rest of the form data into the right panel
                questionForm.querySelector('#question-text').value = dataToLoad.prompt || '';
                questionForm.querySelector('#option-a').value = dataToLoad.options.A || '';
                questionForm.querySelector('#option-b').value = dataToLoad.options.B || '';
                questionForm.querySelector('#option-c').value = dataToLoad.options.C || '';
                questionForm.querySelector('#option-d').value = dataToLoad.options.D || '';
                questionForm.querySelector(`input[name="correct-answer"][value="${dataToLoad.correctAnswer}"]`).checked = true;
                domainSelect.value = dataToLoad.domain;
                domainSelect.dispatchEvent(new Event('change'));
                skillSelect.value = dataToLoad.skill;
                pointsSelect.value = dataToLoad.points;
            }
        });

        // --- LOGIC TO HANDLE SAVING THE FORM ---
        questionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const questionData = {
                module: parseInt(module),
                questionNumber: parseInt(qNumber),
                domain: domainSelect.value,
                skill: skillSelect.value,
                points: parseInt(pointsSelect.value),
                passage: document.getElementById('stimulus-panel').dataset.stimulusValue || '',
                prompt: questionForm.querySelector('#question-text').value,
                options: {
                    A: questionForm.querySelector('#option-a').value,
                    B: questionForm.querySelector('#option-b').value,
                    C: questionForm.querySelector('#option-c').value,
                    D: questionForm.querySelector('#option-d').value,
                },
                correctAnswer: questionForm.querySelector('input[name="correct-answer"]:checked').value,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const questionRef = db.collection('tests').doc(testId).collection('questions').doc(questionId);
            
            questionRef.set(questionData, { merge: true })
                .then(() => {
                    alert(`Question ${qNumber} saved successfully!`);
                    activeBtn.classList.add('completed');
                     savedQuestions[questionId] = true; // +++ ADD THIS LINE
                })
                .catch(err => {
                    console.error("Error saving question:", err);
                    alert("Error: " + err.message);
                });
        });
    }
        // +++ ADD THIS ENTIRE NEW FUNCTION +++
    // --- RENDER STIMULUS (Text or Image) ---
    function renderStimulus(data = {}) {
        const stimulusDisplay = document.getElementById('stimulus-display');
        const stimulusPanel = document.getElementById('stimulus-panel');
        // Store current value on the panel itself so the save function can find it
        stimulusPanel.dataset.stimulusValue = data.passage || ''; 
        
        const passage = data.passage || '';

        // Check if the passage is actually an image ID
        if (passage.startsWith('TELEGRAM_IMG_ID:')) {
            const fileId = passage.replace('TELEGRAM_IMG_ID:', '');
            stimulusDisplay.innerHTML = `<p>Loading image...</p>`;
            
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)
                .then(res => res.json())
                .then(apiRes => {
                    if (apiRes.ok) {
                        const imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${apiRes.result.file_path}`;
                        stimulusDisplay.innerHTML = `<img src="${imageUrl}" alt="Question Stimulus" style="width: 100%; height: auto; border-radius: 8px;">`;
                    } else {
                        stimulusDisplay.innerHTML = `<p style="color:red;">Error: Could not load image.</p>`;
                    }
                });
        } else {
            // It's just plain text, so show the textarea
            stimulusDisplay.innerHTML = `<textarea class="stimulus-textarea" id="stimulus-textarea">${passage}</textarea>`;
            // When user types in the textarea, update the stored value
            stimulusDisplay.querySelector('textarea').addEventListener('input', (e) => {
                stimulusPanel.dataset.stimulusValue = e.target.value;
            });
        }
    }
    // --- Event Handlers ---
    function handleNavClick(e) {
        const module = e.target.dataset.module;
        const qNumber = e.target.dataset.qNumber;
        showEditorForQuestion(module, qNumber);
    }

    moduleSwitcher.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        document.querySelectorAll('.module-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        const moduleNum = parseInt(e.target.dataset.module);
        const questionCount = (moduleNum <= 2) ? 27 : 22;
        generateNavButtons(questionCount, moduleNum);
        
        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below to begin editing.</p></div>`;
    });

        // ... (after the handleNavClick and moduleSwitcher functions)

    // --- NEW: TELEGRAM IMAGE UPLOAD LOGIC ---
    
    // This function handles the actual upload
    async function uploadImageToTelegram(file) {
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHANNEL_ID);
        formData.append('photo', file);

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.ok) {
                // Success! Get the best quality photo file_id
                const photoArray = data.result.photo;
                const fileId = photoArray[photoArray.length - 1].file_id;
                return fileId;
            } else {
                throw new Error(data.description);
            }
        } catch (error) {
            console.error('Telegram Upload Error:', error);
            alert('Error uploading image: ' + error.message);
            return null;
        }
    }

    // This function handles the button clicks
        // Event listener for the "Add Image" button
    document.getElementById('add-image-btn').addEventListener('click', () => {
        if (!currentQuestion) {
            alert("Please select a question first!");
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            
            document.getElementById('stimulus-display').innerHTML = `<p>Uploading...</p>`;
            const fileId = await uploadImageToTelegram(file);

            if (fileId) {
                const newValue = `TELEGRAM_IMG_ID:${fileId}`;
                renderStimulus({ passage: newValue });
                alert('Image uploaded! Click "Save Question" to finalize.');
            } else {
                renderStimulus({ passage: '' }); // Show empty textarea on failure
            }
        };
        input.click();
    });

    // Event listener for the "Remove" button
    document.getElementById('remove-stimulus-btn').addEventListener('click', () => {
        if (!currentQuestion) {
            alert("Please select a question first!");
            return;
        }
        renderStimulus({ passage: '' }); // This clears the panel
    });

    

});
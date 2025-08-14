document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- Page Elements ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    
    // --- State Management ---
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;
    let savedQuestions = {};

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

    // --- DATA FETCHING ---
    const testRef = db.collection('tests').doc(testId);
    testRef.get().then(doc => {
        if (doc.exists) {
            editorHeaderTitle.textContent = `Editing: ${doc.data().name}`;
        } else {
            alert('Test not found!');
            window.location.href = 'admin.html';
        }
    });

    testRef.collection('questions').get().then(snapshot => {
        snapshot.forEach(doc => {
            savedQuestions[doc.id] = true;
        });
        generateNavButtons(27, 1);
    });

    // --- CORE FUNCTIONS ---
    async function uploadImageToTelegram(file) {
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHANNEL_ID);
        formData.append('photo', file);
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
        try {
            const response = await fetch(url, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.ok) {
                const photoArray = data.result.photo;
                const fileId = photoArray[photoArray.length - 1].file_id;
                const fileUrlData = await (await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)).json();
                if (fileUrlData.ok) {
                    return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileUrlData.result.file_path}`;
                } else {
                    throw new Error(fileUrlData.description);
                }
            } else { throw new Error(data.description); }
        } catch (error) {
            console.error('Telegram Upload Error:', error);
            alert('Error uploading image: ' + error.message);
            return null;
        }
    }

    function renderStimulus(data = {}) {
        const imageContainer = document.getElementById('stimulus-image-container');
        const imagePreview = document.getElementById('stimulus-image-preview');
        const stimulusTextarea = document.getElementById('stimulus-textarea');

        stimulusTextarea.value = data.passage || '';

        if (data.imageUrl) {
            imagePreview.src = data.imageUrl;
            imageContainer.style.width = data.imageWidth || '100%';
            imageContainer.classList.remove('hidden');
        } else {
            imageContainer.classList.add('hidden');
        }
    }

    function setupImageResizing() {
        const imageContainer = document.getElementById('stimulus-image-container');
        const resizeHandle = imageContainer.querySelector('.resize-handle');
        if (!resizeHandle) return;
        let isResizing = false;

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            const startX = e.clientX;
            const startWidth = imageContainer.offsetWidth;
            
            const doDrag = (e) => {
                if (!isResizing) return;
                const newWidth = startWidth + (e.clientX - startX);
                if (newWidth > 100) { // minimum width
                    imageContainer.style.width = `${newWidth}px`;
                }
            };
            const stopDrag = () => { isResizing = false; window.removeEventListener('mousemove', doDrag);};
            
            window.addEventListener('mousemove', doDrag);
            window.addEventListener('mouseup', stopDrag);
        });
    }

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

    async function showEditorForQuestion(module, qNumber) {
        currentModule = module;
        currentQuestion = qNumber;
        
        document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.q-nav-btn[data-q-number='${qNumber}'][data-module='${module}']`);
        if (activeBtn) activeBtn.classList.add('active');

        editorContainer.innerHTML = '';
        const formClone = editorTemplate.content.cloneNode(true);
        editorContainer.appendChild(formClone);
        
        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        const pointsSelect = questionForm.querySelector('#q-points');
        questionForm.querySelector('#q-number-display').textContent = qNumber;

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
        else if (qNumber > 20 && module <= 2) defaultPoints = 30;
        else if (qNumber > 15 && module > 2) defaultPoints = 30;
        pointValues.forEach(val => {
            const selected = (val === defaultPoints) ? 'selected' : '';
            pointsSelect.innerHTML += `<option value="${val}" ${selected}>${val} points</option>`;
        });

        const questionId = `m${module}_q${qNumber}`;
        const doc = await db.collection('tests').doc(testId).collection('questions').doc(questionId).get();
        const questionData = doc.exists ? doc.data() : {};
        
        renderStimulus(questionData);
        if (doc.exists) {
            questionForm.querySelector('#question-text').value = questionData.prompt || '';
            questionForm.querySelector('#option-a').value = questionData.options.A || '';
            questionForm.querySelector('#option-b').value = questionData.options.B || '';
            questionForm.querySelector('#option-c').value = questionData.options.C || '';
            questionForm.querySelector('#option-d').value = questionData.options.D || '';
            questionForm.querySelector(`input[name="correct-answer"][value="${questionData.correctAnswer}"]`).checked = true;
            domainSelect.value = questionData.domain;
            domainSelect.dispatchEvent(new Event('change'));
            skillSelect.value = questionData.skill;
            pointsSelect.value = questionData.points;
        }

        questionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const imageContainer = document.getElementById('stimulus-image-container');
            const dataToSave = {
                module: parseInt(module),
                questionNumber: parseInt(qNumber),
                domain: domainSelect.value,
                skill: skillSelect.value,
                points: parseInt(pointsSelect.value),
                passage: document.getElementById('stimulus-textarea').value,
                imageUrl: imageContainer.classList.contains('hidden') ? null : document.getElementById('stimulus-image-preview').src,
                imageWidth: imageContainer.classList.contains('hidden') ? null : imageContainer.style.width,
                prompt: questionForm.querySelector('#question-text').value,
                options: {
                    A: questionForm.querySelector('#option-a').value, B: questionForm.querySelector('#option-b').value,
                    C: questionForm.querySelector('#option-c').value, D: questionForm.querySelector('#option-d').value,
                },
                correctAnswer: questionForm.querySelector('input[name="correct-answer"]:checked').value,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            testRef.collection('questions').doc(questionId).set(dataToSave, { merge: true }).then(() => {
                alert(`Question ${qNumber} saved successfully!`);
                activeBtn.classList.add('completed');
                savedQuestions[questionId] = true;
            }).catch(err => {
                console.error("Error saving question:", err);
                alert("Error: " + err.message);
            });
        });
        setupImageResizing();
    }

    // --- EVENT HANDLERS ---
    function handleNavClick(e) {
        const qNumber = e.target.dataset.qNumber;
        showEditorForQuestion(currentModule, qNumber);
    }
    
    document.getElementById('add-image-btn').addEventListener('click', () => {
        if (!currentQuestion) return alert("Please select a question first!");
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            
            const stimulusDisplay = document.getElementById('stimulus-display');
            if(stimulusDisplay) {
                stimulusDisplay.innerHTML = `<p>Uploading...</p>`;
            } else {
                 document.getElementById('stimulus-image-container').innerHTML = `<p>Uploading...</p>`;
            }
            
            const imageUrl = await uploadImageToTelegram(file);
            if (imageUrl) {
                renderStimulus({ 
                    passage: document.getElementById('stimulus-textarea').value, 
                    imageUrl: imageUrl 
                });
                alert('Image uploaded! Click "Save Question" to finalize.');
            } else {
                renderStimulus({ 
                    passage: document.getElementById('stimulus-textarea').value 
                });
            }
        };
        input.click();
    });

    document.getElementById('remove-image-btn').addEventListener('click', () => {
        if (!currentQuestion) return alert("Please select a question first!");
        renderStimulus({ passage: document.getElementById('stimulus-textarea').value });
    });

    moduleSwitcher.addEventListener('click', (e) => {
        if (!e.target.matches('button')) return;
        document.querySelectorAll('.module-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        const moduleNum = parseInt(e.target.dataset.module);
        currentModule = moduleNum;
        const questionCount = (moduleNum <= 2) ? 27 : 22;
        generateNavButtons(questionCount, moduleNum);
        
        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below to begin editing.</p></div>`;
    });

    // --- Initial Page Load ---
    generateNavButtons(27, 1);
});
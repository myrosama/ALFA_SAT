document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();
    var MQ = MathQuill.getInterface(2);

    // --- Page Elements & State ---
    const editorHeaderTitle = document.getElementById('editor-header-title');
    const questionNavigator = document.getElementById('question-navigator');
    const moduleSwitcher = document.querySelector('.module-switcher');
    const editorContainer = document.getElementById('question-editor-container');
    const editorTemplate = document.getElementById('question-editor-template');
    const addImageBtn = document.getElementById('add-image-btn');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('id');
    let currentModule = 1;
    let currentQuestion = null;
    let savedQuestions = {};
    
    // --- Global Editor Instances ---
    let passageEditor = null;
    let promptEditor = null;

    // --- Data Definitions ---
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
        if (doc.exists) { editorHeaderTitle.textContent = `Editing: ${doc.data().name}`; }
        else { alert('Test not found!'); window.location.href = 'admin.html'; }
    });
    testRef.collection('questions').get().then(snapshot => {
        snapshot.forEach(doc => { savedQuestions[doc.id] = true; });
        generateNavButtons(27, 1);
    });

    // --- CORE FUNCTIONS ---
    function initializeQuillEditor(selector, placeholder) {
        return new Quill(selector, {
            theme: 'snow', placeholder: placeholder,
            modules: { toolbar: [['bold', 'italic', 'underline']] }
        });
    }

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
                } else { throw new Error(fileUrlData.description); }
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
            e.preventDefault(); isResizing = true;
            const startX = e.clientX;
            const startWidth = imageContainer.offsetWidth;
            const doDrag = (e) => {
                if (!isResizing) return;
                const newWidth = startWidth + (e.clientX - startX);
                if (newWidth > 100) imageContainer.style.width = `${newWidth}px`;
            };
            const stopDrag = () => { isResizing = false; window.removeEventListener('mousemove', doDrag); };
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
            if (savedQuestions[questionId]) button.classList.add('completed');
            button.addEventListener('click', handleNavClick);
            questionNavigator.appendChild(button);
        }
    }

    async function showEditorForQuestion(module, qNumber) {
        currentModule = module; currentQuestion = qNumber;
        document.querySelectorAll('.q-nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.q-nav-btn[data-q-number='${qNumber}'][data-module='${module}']`);
        if (activeBtn) activeBtn.classList.add('active');

        if (!editorContainer.querySelector('#question-form')) {
            const formClone = editorTemplate.content.cloneNode(true);
            editorContainer.innerHTML = '';
            editorContainer.appendChild(formClone);
            passageEditor = new Quill('#stimulus-editor', { theme: 'snow', placeholder: 'Paste passage text here...' });
            promptEditor = new Quill('#question-text-editor', { theme: 'snow', placeholder: 'Type question prompt here...' });
            setupImageResizing();
            editorContainer.querySelector('#question-form').addEventListener('submit', handleFormSubmit);
        }
        
        const questionForm = editorContainer.querySelector('#question-form');
        const domainSelect = questionForm.querySelector('#q-domain');
        const skillSelect = questionForm.querySelector('#q-skill');
        const pointsSelect = questionForm.querySelector('#q-points');
        const formatSelect = questionForm.querySelector('#q-format');
        const mcqContainer = questionForm.querySelector('#answer-options-container');
        const fillInContainer = questionForm.querySelector('#fill-in-answer-container');
        questionForm.querySelector('#q-number-display').textContent = qNumber;

        const isMath = module > 2;

        Object.values(questionForm.querySelectorAll('.math-input')).forEach(el => MQ.MathField(el));
        
        formatSelect.addEventListener('change', () => {
            mcqContainer.classList.toggle('hidden', formatSelect.value !== 'mcq');
            fillInContainer.classList.toggle('hidden', formatSelect.value !== 'fill-in');
        });

        const domains = isMath ? Object.keys(questionTypes.Math) : Object.keys(questionTypes["Reading & Writing"]);
        domainSelect.innerHTML = ''; domains.forEach(d => { domainSelect.innerHTML += `<option value="${d}">${d}</option>`; });
        
        domainSelect.addEventListener('change', () => {
            skillSelect.innerHTML = '';
            const selectedDomain = domainSelect.value;
            const skills = isMath ? questionTypes.Math[selectedDomain] : questionTypes["Reading & Writing"][selectedDomain];
            skills.forEach(skill => { skillSelect.innerHTML += `<option value="${skill}">${skill}</option>`; });
        });
        domainSelect.dispatchEvent(new Event('change'));

        let defaultPoints = 20;
        if (qNumber <= 5) defaultPoints = 10;
        else if ((qNumber > 20 && module <= 2) || (qNumber > 15 && module > 2)) defaultPoints = 30;
        pointsSelect.innerHTML = ''; pointValues.forEach(val => {
            const selected = (val === defaultPoints) ? 'selected' : '';
            pointsSelect.innerHTML += `<option value="${val}" ${selected}>${val} points</option>`;
        });

        const questionId = `m${module}_q${qNumber}`;
        const doc = await testRef.collection('questions').doc(questionId).get();
        const data = doc.exists ? doc.data() : {};
        
        renderStimulus(data);
        passageEditor.root.innerHTML = data.passage || '';
        promptEditor.root.innerHTML = data.prompt || '';
        
        if (doc.exists) {
            formatSelect.value = data.format || 'mcq';
            formatSelect.dispatchEvent(new Event('change'));
            
            MQ(questionForm.querySelector('#option-a')).latex(data.options.A || '');
            MQ(questionForm.querySelector('#option-b')).latex(data.options.B || '');
            MQ(questionForm.querySelector('#option-c')).latex(data.options.C || '');
            MQ(questionForm.querySelector('#option-d')).latex(data.options.D || '');
            MQ(questionForm.querySelector('#fill-in-answer')).latex(data.fillInAnswer || '');
            
            if (data.correctAnswer) {
                const radio = questionForm.querySelector(`input[name="correct-answer"][value="${data.correctAnswer}"]`);
                if (radio) radio.checked = true;
            }
            
            domainSelect.value = data.domain;
            domainSelect.dispatchEvent(new Event('change'));
            skillSelect.value = data.skill;
            pointsSelect.value = data.points;
        }
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        if (!currentQuestion) return;

        const questionId = `m${currentModule}_q${currentQuestion}`;
        const activeBtn = document.querySelector(`.q-nav-btn[data-q-number='${currentQuestion}'][data-module='${currentModule}']`);
        const imageContainer = document.getElementById('stimulus-image-container');
        const questionForm = editorContainer.querySelector('#question-form');
        
        const dataToSave = {
            passage: passageEditor.root.innerHTML,
            imageUrl: imageContainer.classList.contains('hidden') ? null : document.getElementById('stimulus-image-preview').src,
            imageWidth: imageContainer.classList.contains('hidden') ? null : imageContainer.style.width,
            prompt: promptEditor.root.innerHTML,
            module: parseInt(currentModule), questionNumber: parseInt(currentQuestion),
            domain: questionForm.querySelector('#q-domain').value,
            skill: questionForm.querySelector('#q-skill').value,
            points: parseInt(questionForm.querySelector('#q-points').value),
            format: questionForm.querySelector('#q-format').value,
            options: {
                A: MQ(questionForm.querySelector('#option-a')).latex(), B: MQ(questionForm.querySelector('#option-b')).latex(),
                C: MQ(questionForm.querySelector('#option-c')).latex(), D: MQ(questionForm.querySelector('#option-d')).latex(),
            },
            fillInAnswer: MQ(questionForm.querySelector('#fill-in-answer')).latex(),
            correctAnswer: questionForm.querySelector('input[name="correct-answer"]:checked')?.value || null,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        testRef.collection('questions').doc(questionId).set(dataToSave, { merge: true }).then(() => {
            alert(`Question ${currentQuestion} saved successfully.`);
            if (activeBtn) activeBtn.classList.add('completed');
            savedQuestions[questionId] = true;
        }).catch(err => {
            console.error("Error saving question:", err);
            alert("Error saving question. See console for details.");
        });
    }

    function handleNavClick(e) {
        const qNumber = e.target.dataset.qNumber;
        showEditorForQuestion(currentModule, qNumber);
    }
    
    addImageBtn.addEventListener('click', async () => {
        if (!currentQuestion) return alert("Please select a question first!");
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('stimulus-image-container').classList.remove('hidden');
            document.getElementById('stimulus-image-preview').src = "https://i.gifer.com/ZZ5H.gif";
            const imageUrl = await uploadImageToTelegram(file);
            if (imageUrl) {
                renderStimulus({ passage: passageEditor.root.innerHTML, imageUrl: imageUrl });
            } else {
                renderStimulus({ passage: passageEditor.root.innerHTML });
                alert("Image upload failed. Please try again.");
            }
        };
        input.click();
    });

    removeImageBtn.addEventListener('click', () => {
        if (!currentQuestion) return alert("Please select a question first!");
        renderStimulus({ passage: passageEditor.root.innerHTML });
    });

    moduleSwitcher.addEventListener('click', (e) => {
        if (!e.target.matches('button')) return;
        document.querySelectorAll('.module-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        currentModule = parseInt(e.target.dataset.module);
        const questionCount = (currentModule <= 2) ? 27 : 22;
        generateNavButtons(questionCount, currentModule);
        editorContainer.innerHTML = `<div class="editor-placeholder"><i class="fa-solid fa-hand-pointer"></i><p>Select a question from the navigator below to begin editing.</p></div>`;
        document.getElementById('stimulus-panel').querySelector('.panel-content').innerHTML = `<div id="stimulus-image-container" class="hidden"><img id="stimulus-image-preview" src=""><div class="resize-handle"></div></div><div id="stimulus-editor"></div>`;
        // Reset the state to prevent any other bugs
        currentQuestion = null;
        passageEditor = null;
        promptEditor = null;
    });

    generateNavButtons(27, 1);
});
async function fetchGeminiWithRetry(apiKey, payload, maxRetries = 3) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            return await response.json();
        }

        const errData = await response.json().catch(() => ({}));
        
        if (response.status === 429 && i < maxRetries - 1) {
            console.warn(`Rate limited (429). Retrying in 11 seconds... (Attempt ` + (i+1) + `/` + maxRetries + `)`);
            await new Promise(resolve => setTimeout(resolve, 11000));
            continue;
        }
        
        throw new Error(errData.error?.message || `HTTP ` + response.status);
    }
}
// State Management
let cvData = {
    personal: { name: '', email: '', phone: '', location: '', url: '' },
    summary: '',
    experience: [],
    education: [],
    skills: '',
    publications: []
};

// Translations
const translations = {
    en: {
        summary: "Professional Summary",
        experience: "Experience",
        education: "Education",
        skills: "Skills",
        publications: "Publications"
    },
    he: {
        summary: "תקציר מקצועי",
        experience: "ניסיון תעסוקתי",
        education: "השכלה",
        skills: "כישורים",
        publications: "פרסומים אקדמיים"
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupNavigation();
    setupEventListeners();
    renderAll();
    
    // Add dir="auto" to all inputs to support RTL languages automatically
    document.querySelectorAll('input, textarea').forEach(el => el.setAttribute('dir', 'auto'));

    const savedFont = localStorage.getItem('cvFont') || 'Inter';
    document.documentElement.style.setProperty('--theme-font', `"${savedFont}", Arial, sans-serif`);
});

// Navigation
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.editor-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });
}

// LocalStorage & Data Management
function saveData() {
    cvData.personal = {
        name: document.getElementById('personal-name').value,
        title: document.getElementById('personal-title').value,
        email: document.getElementById('personal-email').value,
        phone: document.getElementById('personal-phone').value,
        location: document.getElementById('personal-location').value,
        url: document.getElementById('personal-url').value
    };
    cvData.summary = document.getElementById('summary-text').value;
    cvData.skills = document.getElementById('skills-text').value;
    localStorage.setItem('cvData', JSON.stringify(cvData));
    localStorage.setItem('cvLanguage', document.getElementById('settings-language').value);
    localStorage.setItem('cvColor', document.getElementById('settings-color').value);
}

function loadData() {
    const saved = localStorage.getItem('cvData');
    if (saved) {
        try {
            cvData = JSON.parse(saved);
            if (!cvData.publications) {
                cvData.publications = [];
            }
            if (cvData.experience) {
                cvData.experience.forEach(exp => {
                    if (exp.start || exp.end) {
                        if (exp.start && exp.end) exp.dates = `${exp.start} - ${exp.end}`;
                        else if (exp.start) exp.dates = exp.start;
                        else if (exp.end) exp.dates = exp.end;
                        delete exp.start;
                        delete exp.end;
                    }
                });
            }
        } catch(e) {
            console.error("Error loading saved data");
        }
    }
    
    const savedLang = localStorage.getItem('cvLanguage');
    if (savedLang) {
        document.getElementById('settings-language').value = savedLang;
    }

    const savedColor = localStorage.getItem('cvColor');
    if (savedColor) {
        document.getElementById('settings-color').value = savedColor;
    }

    populateInputs();
    
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) {
        document.getElementById('settings-api-key').value = savedKey;
    }
}

function populateInputs() {
    document.getElementById('personal-name').value = cvData.personal?.name || '';
    document.getElementById('personal-title').value = cvData.personal?.title || '';
    document.getElementById('personal-email').value = cvData.personal?.email || '';
    document.getElementById('personal-phone').value = cvData.personal?.phone || '';
    document.getElementById('personal-location').value = cvData.personal?.location || '';
    document.getElementById('personal-url').value = cvData.personal?.url || '';
    document.getElementById('summary-text').value = cvData.summary || '';
    document.getElementById('skills-text').value = cvData.skills || '';
}

// JSON Import / Export
function downloadJSON() {
    saveData();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cvData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "cv_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if(parsed.personal) {
                cvData = parsed;
                populateInputs();
                renderAll();
                saveData();
                alert("Backup restored successfully!");
            }
        } catch (err) {
            alert("Invalid JSON file.");
        }
    };
    reader.readAsText(file);
}

// PDF Parsing
async function extractTextFromPDF(pdfData) {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        text += strings.join(" ") + "\n";
    }
    return text;
}

async function handlePDFImport() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first to use the AI parser.");
        return;
    }

    const fileInput = document.getElementById('import-pdf-file');
    const file = fileInput.files[0];
    if (!file) {
        alert("Please select a PDF file first.");
        return;
    }

    const statusEl = document.getElementById('pdf-import-status');
    const btn = document.getElementById('import-pdf-btn');
    
    btn.disabled = true;
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading PDF...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfText = await extractTextFromPDF(arrayBuffer);
        
        statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing with AI...';

        const payload = {
            contents: [{
                parts: [{
                    text: `You are an expert data extractor. Extract the resume details from the provided text and return ONLY a valid JSON object strictly matching this schema, with no markdown formatting or backticks around it:
{
  "personal": { "name": "", "title": "", "email": "", "phone": "", "location": "", "url": "" },
  "summary": "",
  "experience": [ { "title": "", "company": "", "location": "", "dates": "", "bullets": "bullet 1\\nbullet 2" } ],
  "education": [ { "degree": "", "school": "", "location": "", "date": "" } ],
  "publications": [ { "title": "", "journal": "", "date": "", "link": "" } ],
  "skills": "skill 1, skill 2"
}
Text: ${pdfText}`
                }]
            }]
        };

        const data = await fetchGeminiWithRetry(apiKey, payload);
        let aiText = data.candidates[0].content.parts[0].text.trim();
        if (aiText.startsWith("```json")) aiText = aiText.substring(7);
        if (aiText.startsWith("```")) aiText = aiText.substring(3);
        if (aiText.endsWith("```")) aiText = aiText.slice(0, -3);
        
        const parsed = JSON.parse(aiText.trim());
        cvData = parsed;
        
        populateInputs();
        renderAll();
        saveData();
        
        statusEl.innerHTML = '<span style="color: green"><i class="fa-solid fa-check"></i> Successfully imported!</span>';
    } catch (error) {
        console.error("Import Error:", error);
        statusEl.innerHTML = `<span style="color: red"><i class="fa-solid fa-circle-xmark"></i> Error: ${error.message}</span>`;
    } finally {
        btn.disabled = false;
    }
}

async function enhanceTextWithAI(textarea, suggestionBox, btn) {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first.");
        return;
    }

    const textToEnhance = textarea.value.trim();
    if (!textToEnhance) {
        alert("Please enter some text to enhance.");
        return;
    }

    const jobDescription = localStorage.getItem('jobDescription') || '';
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    suggestionBox.classList.add('hidden');

    try {
        const promptText = jobDescription 
            ? `You are an expert CV writer. Fix the grammar of the following text and rewrite it using professional, impactful action verbs. Most importantly, TAILOR this text to align with the provided Job Description (highlight relevant skills, keywords, and tone). Do not add formatting like markdown backticks, just return the improved text directly. IMPORTANT: NEVER use bullet point characters (like •, -, or *) in your response. Just return plain text sentences separated by newlines. CRITICAL: You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Text' provided below (e.g., if the original text is in Hebrew, your response must be in Hebrew).\n\nJob Description:\n${jobDescription}\n\nOriginal Text:\n${textToEnhance}`
            : `You are an expert CV writer. Fix the grammar of the following text and rewrite it using professional, impactful action verbs suitable for an ATS-friendly CV. Do not add formatting like markdown backticks, just return the improved text directly. IMPORTANT: NEVER use bullet point characters (like •, -, or *) in your response. Just return plain text sentences separated by newlines. CRITICAL: You MUST write your response in the EXACT SAME LANGUAGE as the 'Text' provided below (e.g., if the original text is in Hebrew, your response must be in Hebrew).\n\nText:\n${textToEnhance}`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }]
        };

        const data = await fetchGeminiWithRetry(apiKey, payload);
        let aiText = data.candidates[0].content.parts[0].text.trim();
        
        if (aiText.startsWith("```")) {
            const lines = aiText.split('\n');
            if (lines.length > 1) {
                lines.shift();
                if (lines[lines.length - 1].startsWith("```")) lines.pop();
                aiText = lines.join('\n').trim();
            }
        }

        const taId = 'ai-sugg-' + Date.now();
        suggestionBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem; margin-top: 1rem;">
                <strong><i class="fa-solid fa-wand-magic-sparkles"></i> AI Suggestion <span style="font-size:0.8em; font-weight:normal; color:#888;">(editable)</span>:</strong>
                <button class="primary-btn apply-suggestion-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; width: auto;"><i class="fa-solid fa-arrow-up"></i> Insert</button>
            </div>
            <textarea id="${taId}" class="ai-suggestion-textarea" style="width: 100%; min-height: 100px; resize: vertical; padding: 0.5rem; border: 1px solid #4F46E5; border-radius: 6px; background-color: #EEF2FF;">${aiText}</textarea>
        `;
        suggestionBox.classList.remove('hidden');

        const suggTextarea = suggestionBox.querySelector('textarea');
        
        // Auto-resize textarea to fit content
        setTimeout(() => {
            suggTextarea.style.height = 'auto';
            suggTextarea.style.height = suggTextarea.scrollHeight + 'px';
        }, 0);
        
        suggTextarea.addEventListener('input', () => {
            suggTextarea.style.height = 'auto';
            suggTextarea.style.height = suggTextarea.scrollHeight + 'px';
        });

        suggestionBox.querySelector('.apply-suggestion-btn').addEventListener('click', () => {
            textarea.value = suggTextarea.value;
            // Trigger an input event to automatically save data
            const event = new Event('input', { bubbles: true });
            textarea.dispatchEvent(event);
            suggestionBox.classList.add('hidden');
        });

    } catch (error) {
        console.error("AI Enhance Error:", error);
        alert(`Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Event Listeners
function setupEventListeners() {
    const inputs = document.querySelectorAll('#section-personal input, #summary-text, #skills-text');
    inputs.forEach(input => input.addEventListener('input', saveData));

    document.getElementById('add-experience-btn').addEventListener('click', () => {
        cvData.experience.push({ title: '', company: '', location: '', dates: '', bullets: '' });
        renderExperience();
        saveData();
    });

    document.getElementById('add-education-btn').addEventListener('click', () => {
        cvData.education.push({ degree: '', school: '', location: '', date: '' });
        renderEducation();
        saveData();
    });

    document.getElementById('add-publication-btn').addEventListener('click', () => {
        cvData.publications.push({ title: '', journal: '', date: '', link: '' });
        renderPublications();
        saveData();
    });

    document.getElementById('settings-api-key').addEventListener('change', (e) => {
        localStorage.setItem('geminiApiKey', e.target.value);
    });

    document.getElementById('settings-language').addEventListener('change', saveData);
    document.getElementById('settings-color').addEventListener('input', saveData);

    const fontEl = document.getElementById('settings-font');
    if (fontEl) {
        fontEl.value = localStorage.getItem('cvFont') || 'Inter';
        fontEl.addEventListener('change', (e) => {
            localStorage.setItem('cvFont', e.target.value);
            document.documentElement.style.setProperty('--theme-font', `"${e.target.value}", Arial, sans-serif`);
        });
    }

    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        saveData();
        generatePrintPreview();
        window.print();
    });
    document.getElementById('download-json-btn').addEventListener('click', downloadJSON);
    document.getElementById('import-json-file').addEventListener('change', importJSON);
    document.getElementById('import-pdf-btn').addEventListener('click', handlePDFImport);
    
    document.getElementById('ai-enhance-summary-btn').addEventListener('click', (e) => {
        const textarea = document.getElementById('summary-text');
        const suggestionBox = document.getElementById('ai-suggestion-summary');
        enhanceTextWithAI(textarea, suggestionBox, e.currentTarget);
    });
    
    document.getElementById('ai-enhance-skills-btn').addEventListener('click', (e) => {
        const textarea = document.getElementById('skills-text');
        const suggestionBox = document.getElementById('ai-suggestion-skills');
        enhanceTextWithAI(textarea, suggestionBox, e.currentTarget);
    });

    // Job description auto-save
    const jobDescEl = document.getElementById('ai-job-description');
    const savedJobDesc = localStorage.getItem('jobDescription');
    if (savedJobDesc) jobDescEl.value = savedJobDesc;
    jobDescEl.addEventListener('input', () => {
        localStorage.setItem('jobDescription', jobDescEl.value);
    });

    // Translate
    document.getElementById('translate-cv-btn').addEventListener('click', handleTranslateCV);

    // Cover Letter
    document.getElementById('generate-cover-letter-btn').addEventListener('click', handleGenerateCoverLetter);
    document.getElementById('export-cover-letter-btn').addEventListener('click', exportCoverLetter);
    
    // Load saved cover letter
    const savedCoverLetter = localStorage.getItem('coverLetterText');
    if (savedCoverLetter) {
        document.getElementById('cover-letter-text').value = savedCoverLetter;
        document.getElementById('cover-letter-output').classList.remove('hidden');
    }
    document.getElementById('cover-letter-text').addEventListener('input', (e) => {
        localStorage.setItem('coverLetterText', e.target.value);
    });
}

// Rendering Lists
function renderAll() {
    renderExperience();
    renderEducation();
    renderPublications();
}

function renderExperience() {
    const list = document.getElementById('experience-list');
    list.innerHTML = '';
    const tpl = document.getElementById('tpl-experience-item');

    cvData.experience.forEach((exp, index) => {
        const clone = tpl.content.cloneNode(true);
        const titleInput = clone.querySelector('.exp-title');
        const companyInput = clone.querySelector('.exp-company');
        const locationInput = clone.querySelector('.exp-location');
        const datesInput = clone.querySelector('.exp-dates');
        const bulletsInput = clone.querySelector('.exp-bullets');

        titleInput.value = exp.title || '';
        companyInput.value = exp.company || '';
        locationInput.value = exp.location || '';
        datesInput.value = exp.dates || '';
        bulletsInput.value = exp.bullets || '';
        
        clone.querySelectorAll('input, textarea').forEach(el => el.setAttribute('dir', 'auto'));

        [titleInput, companyInput, locationInput, datesInput, bulletsInput].forEach(input => {
            input.addEventListener('input', (e) => {
                const key = e.target.className.replace('exp-', '');
                cvData.experience[index][key] = e.target.value;
                saveData();
            });
        });

        clone.querySelector('.delete-btn').addEventListener('click', () => {
            cvData.experience.splice(index, 1);
            renderExperience();
            saveData();
        });

        const moveUpBtn = clone.querySelector('.move-up-btn');
        const moveDownBtn = clone.querySelector('.move-down-btn');
        
        if (index === 0) moveUpBtn.disabled = true;
        if (index === cvData.experience.length - 1) moveDownBtn.disabled = true;

        moveUpBtn.addEventListener('click', () => {
            if (index > 0) {
                const temp = cvData.experience[index];
                cvData.experience[index] = cvData.experience[index - 1];
                cvData.experience[index - 1] = temp;
                renderExperience();
                saveData();
            }
        });

        moveDownBtn.addEventListener('click', () => {
            if (index < cvData.experience.length - 1) {
                const temp = cvData.experience[index];
                cvData.experience[index] = cvData.experience[index + 1];
                cvData.experience[index + 1] = temp;
                renderExperience();
                saveData();
            }
        });

        const enhanceBtn = clone.querySelector('.ai-enhance-btn');
        enhanceBtn.addEventListener('click', (e) => {
            const suggestionBox = e.currentTarget.closest('.form-group').querySelector('.ai-suggestion-box');
            enhanceTextWithAI(bulletsInput, suggestionBox, e.currentTarget);
        });

        list.appendChild(clone);
    });
}

function renderEducation() {
    const list = document.getElementById('education-list');
    list.innerHTML = '';
    const tpl = document.getElementById('tpl-education-item');

    cvData.education.forEach((edu, index) => {
        const clone = tpl.content.cloneNode(true);
        const degreeInput = clone.querySelector('.edu-degree');
        const schoolInput = clone.querySelector('.edu-school');
        const locationInput = clone.querySelector('.edu-location');
        const dateInput = clone.querySelector('.edu-date');

        degreeInput.value = edu.degree || '';
        schoolInput.value = edu.school || '';
        locationInput.value = edu.location || '';
        dateInput.value = edu.date || '';
        
        clone.querySelectorAll('input').forEach(el => el.setAttribute('dir', 'auto'));

        [degreeInput, schoolInput, locationInput, dateInput].forEach(input => {
            input.addEventListener('input', (e) => {
                const key = e.target.className.replace('edu-', '');
                cvData.education[index][key] = e.target.value;
                saveData();
            });
        });

        clone.querySelector('.delete-btn').addEventListener('click', () => {
            cvData.education.splice(index, 1);
            renderEducation();
            saveData();
        });

        const moveUpBtn = clone.querySelector('.move-up-btn');
        const moveDownBtn = clone.querySelector('.move-down-btn');
        
        if (index === 0) moveUpBtn.disabled = true;
        if (index === cvData.education.length - 1) moveDownBtn.disabled = true;

        moveUpBtn.addEventListener('click', () => {
            if (index > 0) {
                const temp = cvData.education[index];
                cvData.education[index] = cvData.education[index - 1];
                cvData.education[index - 1] = temp;
                renderEducation();
                saveData();
            }
        });

        moveDownBtn.addEventListener('click', () => {
            if (index < cvData.education.length - 1) {
                const temp = cvData.education[index];
                cvData.education[index] = cvData.education[index + 1];
                cvData.education[index + 1] = temp;
                renderEducation();
                saveData();
            }
        });

        list.appendChild(clone);
    });
}

function renderPublications() {
    const list = document.getElementById('publications-list');
    if (!list) return; // safety
    list.innerHTML = '';
    const tpl = document.getElementById('tpl-publication-item');

    cvData.publications.forEach((pub, index) => {
        const clone = tpl.content.cloneNode(true);
        const titleInput = clone.querySelector('.pub-title');
        const authorsInput = clone.querySelector('.pub-authors');
        const journalInput = clone.querySelector('.pub-journal');
        const dateInput = clone.querySelector('.pub-date');
        const linkInput = clone.querySelector('.pub-link');

        titleInput.value = pub.title || '';
        authorsInput.value = pub.authors || '';
        journalInput.value = pub.journal || '';
        dateInput.value = pub.date || '';
        linkInput.value = pub.link || '';
        
        clone.querySelectorAll('input').forEach(el => el.setAttribute('dir', 'auto'));

        [titleInput, authorsInput, journalInput, dateInput, linkInput].forEach(input => {
            input.addEventListener('input', (e) => {
                const key = e.target.className.replace('pub-', '');
                cvData.publications[index][key] = e.target.value;
                saveData();
            });
        });

        clone.querySelector('.delete-btn').addEventListener('click', () => {
            cvData.publications.splice(index, 1);
            renderPublications();
            saveData();
        });

        const moveUpBtn = clone.querySelector('.move-up-btn');
        const moveDownBtn = clone.querySelector('.move-down-btn');
        
        if (index === 0) moveUpBtn.disabled = true;
        if (index === cvData.publications.length - 1) moveDownBtn.disabled = true;

        moveUpBtn.addEventListener('click', () => {
            if (index > 0) {
                const temp = cvData.publications[index];
                cvData.publications[index] = cvData.publications[index - 1];
                cvData.publications[index - 1] = temp;
                renderPublications();
                saveData();
            }
        });

        moveDownBtn.addEventListener('click', () => {
            if (index < cvData.publications.length - 1) {
                const temp = cvData.publications[index];
                cvData.publications[index] = cvData.publications[index + 1];
                cvData.publications[index + 1] = temp;
                renderPublications();
                saveData();
            }
        });

        list.appendChild(clone);
    });
}

// Print / PDF Generation
function generatePrintPreview() {
    const preview = document.getElementById('cv-preview');
    const lang = document.getElementById('settings-language').value || 'en';
    const color = document.getElementById('settings-color').value || '#E6E6E6';
    const t = translations[lang];
    
    if (lang === 'he') {
        document.body.classList.add('rtl');
    } else {
        document.body.classList.remove('rtl');
    }

    document.documentElement.style.setProperty('--theme-color', color);
    
    const displayUrl = cvData.personal.url ? cvData.personal.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '';
    let urlIcon = "fa-solid fa-link";
    let urlText = displayUrl;
    
    if (displayUrl.toLowerCase().includes("linkedin.com")) {
        urlText = lang === 'he' ? 'לינקדאין' : 'LinkedIn';
    } else if (displayUrl.toLowerCase().includes("github.com")) {
        urlText = 'GitHub';
    } else if (displayUrl) {
        urlText = lang === 'he' ? 'אתר אישי' : 'Website';
    }
    
    let html = `
        <div class="cv-header">
            <div class="cv-header-top">
                <h1 class="cv-name" dir="auto">${cvData.personal.name}</h1>
                ${cvData.personal.title ? `<h2 class="cv-title" dir="auto">${cvData.personal.title}</h2>` : ''}
            </div>
            <div class="cv-contact-bar" dir="auto">
                ${cvData.personal.phone ? `<span class="contact-item"><i class="fa-solid fa-phone"></i> <span>${cvData.personal.phone}</span></span>` : ''}
                ${cvData.personal.email ? `<span class="contact-item"><i class="fa-solid fa-envelope"></i> <a href="mailto:${cvData.personal.email}">${cvData.personal.email}</a></span>` : ''}
                ${cvData.personal.location ? `<span class="contact-item"><i class="fa-solid fa-location-dot"></i> <span>${cvData.personal.location}</span></span>` : ''}
                ${cvData.personal.url ? `<span class="contact-item"><i class="${urlIcon}"></i> <a href="${cvData.personal.url.startsWith('http') ? cvData.personal.url : 'https://' + cvData.personal.url}" target="_blank">${urlText}</a></span>` : ''}
            </div>
        </div>
        <table class="cv-layout-table">
            <thead>
                <tr>
                    <td style="height: 1.5rem; padding: 0; border: none;"></td>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <div class="cv-grid-container">
                            <div class="cv-left-col">
    `;

    if (cvData.education?.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">${t.education}</h3>`;
        cvData.education.forEach(edu => {
            html += `
                <div class="cv-item">
                    <div class="cv-item-header" dir="auto">
                        <span class="bold">${edu.degree}</span>
                        <span class="light-text">${edu.date || ''}</span>
                    </div>
                    <div class="cv-item-subheader" dir="auto">
                        <span class="title-text">${edu.school}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.skills?.trim()) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">${t.skills}</h3>
                <ul class="cv-skills-list" dir="auto">
                    ${cvData.skills.split(',').map(s => s.trim()).filter(s => s).map(s => `<li>${s}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    html += `
            </div> <!-- End Left Col -->
            <div class="cv-right-col">
    `;

    if (cvData.summary?.trim()) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">${t.summary}</h3>
                <div class="cv-summary" dir="auto">${cvData.summary}</div>
            </div>
        `;
    }

    if (cvData.experience?.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">${t.experience}</h3>`;
        cvData.experience.forEach(exp => {
            const bulletsHtml = exp.bullets?.split('\n')
                .filter(b => b.trim())
                .map(b => {
                    let text = b.trim();
                    if (text.startsWith('•') || text.startsWith('-') || text.startsWith('*')) {
                        text = text.substring(1).trim();
                    }
                    return `<li dir="auto">${text}</li>`;
                }).join('') || '';

            html += `
                <div class="cv-item">
                    <div class="cv-item-header" dir="auto">
                        <span class="bold">${exp.company}</span>
                        <span class="light-text">${exp.dates || ''}</span>
                    </div>
                    <div class="cv-item-subheader" dir="auto">
                        <span class="title-text">${exp.title}</span>
                    </div>
                    ${bulletsHtml ? `<ul class="cv-bullets">${bulletsHtml}</ul>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.publications?.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">${t.publications}</h3>`;
        cvData.publications.forEach(pub => {
            html += `
                <div class="cv-item" dir="ltr" style="text-align: left;">
                    <div class="cv-item-header" style="display: flex; justify-content: space-between; align-items: baseline; flex-direction: row;">
                        <span class="bold">${pub.title}</span>
                        <span class="light-text">${pub.date || ''}</span>
                    </div>
                    <div class="cv-item-subheader">
                        ${pub.authors ? `<span>${pub.authors}</span><br>` : ''}
                        <span>${pub.journal}</span>
                        ${pub.link ? `<br><a href="${pub.link.startsWith('http') ? pub.link : 'https://' + pub.link}" target="_blank" style="font-size: 0.9em; color: #4F46E5;">${pub.link.replace(/^https?:\/\//, '')}</a>` : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `
                            </div> <!-- End Right Col -->
                        </div> <!-- End Grid -->
                    </td>
                </tr>
            </tbody>
        </table>
    `;

    preview.innerHTML = html;
}



// AI Translate CV
async function handleTranslateCV() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first.");
        return;
    }

    const direction = document.getElementById('translate-direction').value;
    const fromLang = direction === 'en-to-he' ? 'English' : 'Hebrew';
    const toLang = direction === 'en-to-he' ? 'Hebrew' : 'English';

    const btn = document.getElementById('translate-cv-btn');
    const statusEl = document.getElementById('translate-status');
    const originalText = btn.innerHTML;

    // Auto-backup before translating
    saveData();
    localStorage.setItem('cvData_backup_before_translate', JSON.stringify(cvData));
    statusEl.innerHTML = '<i class="fa-solid fa-shield"></i> Backup saved. Translating...';

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Translating...';
    btn.disabled = true;

    try {
        const payload = {
            contents: [{
                parts: [{
                    text: `You are an expert translator. Translate all text content in the following CV JSON from ${fromLang} to ${toLang}.
                    
                    IMPORTANT RULES:
                    - Return ONLY a valid JSON object with the exact same schema
                    - Translate ALL text fields: summary, skills, experience (title, company, location, dates, bullets), education (degree, school, location, date)
                    - Do NOT translate: personal.name, personal.email, personal.phone, personal.url, links/DOIs
                    - Do NOT translate the publications array AT ALL. Leave all publications data exactly as it is in the original JSON.
                    - For bullet points (exp.bullets), translate each line but keep the newline-separated format
                    - No markdown, no backticks around the JSON
                    
                    CV JSON: ${JSON.stringify(cvData, null, 2)}`
                }]
            }]
        };

        const data = await fetchGeminiWithRetry(apiKey, payload);
        let aiText = data.candidates[0].content.parts[0].text.trim();
        if (aiText.startsWith("```json")) aiText = aiText.substring(7);
        if (aiText.startsWith("```")) aiText = aiText.substring(3);
        if (aiText.endsWith("```")) aiText = aiText.slice(0, -3);

        const translated = JSON.parse(aiText.trim());
        cvData = translated;
        if (!cvData.publications) cvData.publications = [];

        // Auto-set language
        if (direction === 'en-to-he') {
            document.getElementById('settings-language').value = 'he';
        } else {
            document.getElementById('settings-language').value = 'en';
        }

        populateInputs();
        renderAll();
        saveData();

        statusEl.innerHTML = `<span style="color: green"><i class="fa-solid fa-check"></i> Successfully translated to ${toLang}! A backup of your previous version was saved automatically.</span>`;
    } catch (error) {
        console.error("Translate Error:", error);
        statusEl.innerHTML = `<span style="color: red"><i class="fa-solid fa-circle-xmark"></i> Error: ${error.message}</span>`;
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Cover Letter Generator
async function handleGenerateCoverLetter() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first.");
        return;
    }

    const jobDescription = document.getElementById('ai-job-description').value;
    if (!jobDescription) {
        alert("Please paste a job description in the Job Description tab first.");
        return;
    }

    const btn = document.getElementById('generate-cover-letter-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        saveData();
        const payload = {
            contents: [{
                parts: [{
                    text: `You are an expert career coach and cover letter writer. Write a highly tailored, extremely concise cover letter for the candidate below based on their CV and the Job Description.

                    CRITICAL CONSTRAINT: The entire letter MUST NOT EXCEED 150-200 words. However, the tone MUST remain highly natural, warm, and conversational. Do NOT sound robotic, staccato, or like you are just summarizing a CV. Write beautifully and humanely, just keep it concise.

                    STRUCTURE AND LOGIC (Exactly 4 short paragraphs):
                    1. Introduction: State clearly what role you are applying for and express genuine excitement. Then, provide a natural, high-level summary of who you are. Do not cram everything into one run-on sentence.
                    2. Professional Match: Create a logical bridge between your past experience and their specific needs. Explain *why* your background makes you a precise fit. Ensure sentences flow logically.
                    3. Personal Match: Highlight character traits or soft skills that make you a great cultural fit, tying them naturally to the role.
                    4. Closing: A polite, single-sentence sign-off (e.g. "I would appreciate your consideration of my application, thank you.")

                    TONE AND SYNTAX RULES:
                    - Ensure excellent sentence flow and logical transitions between paragraphs.
                    - Avoid run-on sentences. Do NOT aggressively compress multiple facts into a single messy sentence.
                    - Make it sound like a real, thoughtful human being wrote this.

                    ADDITIONAL RULES:
                    - Write in the SAME LANGUAGE as the Job Description (if the JD is in Hebrew, write the letter in Hebrew).
                    - Do NOT include placeholder brackets like [Company Name]. If you don't know the company name, refer to it as "your company".
                    - Do NOT include the header/address block (no dates, no addresses). Start immediately with the greeting.
                    - Write in plain text, no markdown formatting.
                    
                    CANDIDATE CV: ${JSON.stringify(cvData, null, 2)}
                    
                    JOB DESCRIPTION: ${jobDescription}`
                }]
            }]
        };

        const data = await fetchGeminiWithRetry(apiKey, payload);
        let coverLetter = data.candidates[0].content.parts[0].text.trim();

        document.getElementById('cover-letter-text').value = coverLetter;
        document.getElementById('cover-letter-output').classList.remove('hidden');
        localStorage.setItem('coverLetterText', coverLetter);

    } catch (error) {
        console.error("Cover Letter Error:", error);
        alert(`Error generating cover letter: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Export Cover Letter as PDF
function exportCoverLetter() {
    saveData();
    const coverLetterText = document.getElementById('cover-letter-text').value;
    if (!coverLetterText.trim()) {
        alert("No cover letter to export. Please generate one first.");
        return;
    }

    const preview = document.getElementById('cv-preview');
    const color = document.getElementById('settings-color').value || '#E6E6E6';
    const lang = document.getElementById('settings-language').value || 'en';
    const dir = lang === 'he' ? 'rtl' : 'ltr';

    const paragraphs = coverLetterText.split('\n').filter(p => p.trim()).map(p => `<p style="margin-bottom: 1em; text-align: justify;">${p}</p>`).join('');

    const today = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    preview.innerHTML = `
        <style>
            @media print {
                @page { margin: 2.5cm !important; }
            }
        </style>
        <div class="cover-letter-preview" dir="${dir}">
            <div style="text-align: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid ${color};">
                <h1 style="margin: 0; font-size: 1.5rem; font-weight: 700;">${cvData.personal.name || ''}</h1>
                <div style="font-size: 0.9rem; color: #555; margin-top: 0.5rem;">
                    ${cvData.personal.email ? cvData.personal.email : ''}${cvData.personal.phone ? ' | ' + cvData.personal.phone : ''}${cvData.personal.location ? ' | ' + cvData.personal.location : ''}
                </div>
            </div>
            <div style="margin-bottom: 1.5rem; font-size: 0.95rem; color: #555;">${today}</div>
            <div style="font-size: 1rem; line-height: 1.7;">
                ${paragraphs}
            </div>
        </div>
    `;

    if (lang === 'he') {
        document.body.classList.add('rtl');
    } else {
        document.body.classList.remove('rtl');
    }

    window.print();
}





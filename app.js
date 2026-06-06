let currentCooldownInterval = null;

function updateRateLimitUI(waitMs, attempt) {
    const lang = localStorage.getItem('cvLanguage') || 'en';
    const totalSeconds = Math.ceil(waitMs / 1000);
    let secondsLeft = totalSeconds;
    
    if (currentCooldownInterval) {
        clearInterval(currentCooldownInterval);
    }
    
    const modal = document.getElementById('ai-progress-modal');
    const isModalOpen = modal && !modal.classList.contains('hidden');
    
    if (isModalOpen) {
        const container = document.getElementById('api-cooldown-container');
        const titleEl = document.getElementById('api-cooldown-title');
        const barEl = document.getElementById('api-cooldown-bar');
        const textEl = document.getElementById('api-cooldown-text');
        const attemptEl = document.getElementById('api-cooldown-attempt');
        
        if (container) {
            container.classList.remove('hidden');
            if (attemptEl) {
                attemptEl.textContent = lang === 'he' ? `ניסיון ${attempt}` : `Attempt ${attempt}`;
            }
            if (titleEl) {
                titleEl.textContent = lang === 'he' 
                    ? 'עומס זמני ב-API, ממתינים לניסיון חוזר...' 
                    : 'API is temporarily busy, waiting to retry...';
            }
            
            const updateModalCooldown = () => {
                if (secondsLeft >= 0) {
                    const percentage = (secondsLeft / totalSeconds) * 100;
                    if (barEl) barEl.style.width = `${percentage}%`;
                    if (textEl) {
                        textEl.textContent = lang === 'he'
                            ? `מנסים שוב בעוד ${secondsLeft} שניות...`
                            : `Retrying in ${secondsLeft} seconds...`;
                    }
                    secondsLeft--;
                } else {
                    clearInterval(currentCooldownInterval);
                    container.classList.add('hidden');
                }
            };
            
            updateModalCooldown();
            currentCooldownInterval = setInterval(updateModalCooldown, 1000);
        }
    } else {
        let toast = document.getElementById('rate-limit-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'rate-limit-toast';
            toast.className = 'rate-limit-toast';
            document.body.appendChild(toast);
        }
        
        toast.style.display = 'block';
        toast.innerHTML = `
            <div class="toast-header">
                <i class="fa-solid fa-hourglass-half fa-spin" style="animation-duration: 3s;"></i>
                <span>${lang === 'he' ? 'עומס זמני ב-API' : 'API Rate Limit Hit'}</span>
            </div>
            <div class="toast-body">
                ${lang === 'he' 
                    ? `מערכת ה-AI זמנית בעומס. מנסים שוב בעוד <strong id="toast-countdown">${secondsLeft}</strong> שניות...` 
                    : `We are waiting to retry. Retrying in <strong id="toast-countdown">${secondsLeft}</strong>s...`}
                <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.8;">
                    ${lang === 'he' ? `ניסיון ${attempt}` : `Attempt ${attempt}`}
                </div>
            </div>
            <div class="toast-progress-bg">
                <div class="toast-progress-bar" id="toast-progress-bar" style="width: 100%;"></div>
            </div>
        `;
        
        const countdownEl = document.getElementById('toast-countdown');
        const barEl = document.getElementById('toast-progress-bar');
        
        const updateToastCooldown = () => {
            if (secondsLeft >= 0) {
                const percentage = (secondsLeft / totalSeconds) * 100;
                if (barEl) barEl.style.width = `${percentage}%`;
                if (countdownEl) countdownEl.textContent = secondsLeft;
                secondsLeft--;
            } else {
                clearInterval(currentCooldownInterval);
                toast.style.display = 'none';
            }
        };
        
        updateToastCooldown();
        currentCooldownInterval = setInterval(updateToastCooldown, 1000);
    }
}

function hideRateLimitUI() {
    if (currentCooldownInterval) {
        clearInterval(currentCooldownInterval);
    }
    const container = document.getElementById('api-cooldown-container');
    if (container) container.classList.add('hidden');
    
    const toast = document.getElementById('rate-limit-toast');
    if (toast) toast.style.display = 'none';
}

async function fetchGeminiWithRetry(apiKey, payload, maxRetries = 3, onRetry = null) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            hideRateLimitUI();
            return await response.json();
        }

        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error?.message || '';
        const isRateLimit = response.status === 429 || errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('rate limit');
        
        if (isRateLimit && i < maxRetries - 1) {
            const match = errMessage.match(/Please retry in (\d+\.?\d*)s/i);
            let waitMs = 15000;
            if (match) {
                waitMs = Math.ceil(parseFloat(match[1]) + 2.0) * 1000;
            }
            
            console.warn(`Rate limited or Quota exceeded. Retrying in ${waitMs / 1000} seconds... (Attempt ${i + 1}/${maxRetries})`);
            
            updateRateLimitUI(waitMs, i + 1);
            
            if (onRetry) {
                onRetry(waitMs, i + 1);
            }
            
            await new Promise(resolve => setTimeout(resolve, waitMs));
            hideRateLimitUI();
            continue;
        }
        
        hideRateLimitUI();
        throw new Error(errMessage || `HTTP ${response.status}`);
    }
}
// State Management
const defaultDesign = {
    fontFamily: 'Inter',
    fontSize: 10,
    lineHeight: 1.4,
    sectionSpacing: 2.0,
    itemSpacing: 1.2,
    pageMargins: 3.0,
    themeColor: '#E6E6E6',
    pageSize: 'letter',
    pageFit: 'auto'
};

let cvData = {
    personal: { name: '', email: '', phone: '', location: '', url: '' },
    summary: '',
    experience: [],
    education: [],
    skills: '',
    publications: [],
    design: { ...defaultDesign }
};

let activeDesignSettings = null;

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
            const targetId = btn.dataset.target;
            document.getElementById(targetId).classList.add('active');
            
            if (targetId === 'section-design') {
                renderLivePreview();
            }
        });
    });
}

// LocalStorage & Data Management
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
    
    // Ensure design object exists
    if (!cvData.design) {
        cvData.design = { ...defaultDesign };
    }
    
    localStorage.setItem('cvData', JSON.stringify(cvData));
    localStorage.setItem('cvLanguage', document.getElementById('settings-language').value);
    
    // Sync settings tab color and font
    localStorage.setItem('cvColor', cvData.design.themeColor);
    localStorage.setItem('cvFont', cvData.design.fontFamily);
}

function applyDesignSettings(doc = document) {
    if (!cvData.design) return;
    
    const d = cvData.design;
    const fontValue = `"${d.fontFamily}", Arial, sans-serif`;
    
    const active = activeDesignSettings || d;
    
    doc.documentElement.style.setProperty('--theme-font', fontValue);
    doc.documentElement.style.setProperty('--theme-color', d.themeColor);
    doc.documentElement.style.setProperty('--theme-font-size', `${active.fontSize}pt`);
    doc.documentElement.style.setProperty('--theme-line-height', active.lineHeight);
    doc.documentElement.style.setProperty('--theme-section-spacing', `${active.sectionSpacing}em`);
    doc.documentElement.style.setProperty('--theme-item-spacing', `${active.itemSpacing}em`);
    doc.documentElement.style.setProperty('--theme-page-margins', `${active.pageMargins}em`);
}

function populateDesignInputs() {
    if (!cvData.design) return;
    
    const d = cvData.design;
    document.getElementById('design-font').value = d.fontFamily || 'Inter';
    document.getElementById('design-fit').value = d.pageFit || 'auto';
    
    document.getElementById('design-font-size').value = d.fontSize || 10;
    document.getElementById('val-font-size').innerText = `${d.fontSize || 10}pt`;
    
    document.getElementById('design-line-height').value = d.lineHeight || 1.4;
    document.getElementById('val-line-height').innerText = d.lineHeight || 1.4;
    
    document.getElementById('design-section-spacing').value = d.sectionSpacing || 2.0;
    document.getElementById('val-section-spacing').innerText = `${parseFloat(d.sectionSpacing || 2.0).toFixed(1)}em`;
    
    document.getElementById('design-item-spacing').value = d.itemSpacing || 1.2;
    document.getElementById('val-item-spacing').innerText = `${parseFloat(d.itemSpacing || 1.2).toFixed(1)}em`;
    
    document.getElementById('design-page-margins').value = d.pageMargins || 3.0;
    document.getElementById('val-page-margins').innerText = `${parseFloat(d.pageMargins || 3.0).toFixed(1)}em`;
    
    document.getElementById('design-color').value = d.themeColor || '#E6E6E6';
    document.getElementById('design-page-size').value = d.pageSize || 'letter';
    
    // Sync with settings panel
    const settingsColorEl = document.getElementById('settings-color');
    if (settingsColorEl) settingsColorEl.value = d.themeColor || '#E6E6E6';
    
    const settingsFontEl = document.getElementById('settings-font');
    if (settingsFontEl) settingsFontEl.value = d.fontFamily || 'Inter';
}

function loadData() {
    const saved = localStorage.getItem('cvData');
    if (saved) {
        try {
            cvData = JSON.parse(saved);
            if (!cvData.publications) {
                cvData.publications = [];
            }
            if (!cvData.design) {
                cvData.design = { ...defaultDesign };
            } else {
                // Merge in any missing defaults in case of code updates
                cvData.design = { ...defaultDesign, ...cvData.design };
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
            console.error("Error loading saved data", e);
        }
    } else {
        cvData.design = { ...defaultDesign };
    }
    
    const savedLang = localStorage.getItem('cvLanguage');
    if (savedLang) {
        document.getElementById('settings-language').value = savedLang;
    }

    const savedColor = localStorage.getItem('cvColor') || cvData.design.themeColor;
    cvData.design.themeColor = savedColor;

    const savedFont = localStorage.getItem('cvFont') || cvData.design.fontFamily;
    cvData.design.fontFamily = savedFont;

    populateInputs();
    populateDesignInputs();
    
    if (cvData.design) {
        activeDesignSettings = {
            fontSize: parseFloat(cvData.design.fontSize) || 10,
            lineHeight: parseFloat(cvData.design.lineHeight) || 1.4,
            sectionSpacing: parseFloat(cvData.design.sectionSpacing) || 2.0,
            itemSpacing: parseFloat(cvData.design.itemSpacing) || 1.2,
            pageMargins: parseFloat(cvData.design.pageMargins) || 3.0
        };
    } else {
        activeDesignSettings = {
            fontSize: defaultDesign.fontSize,
            lineHeight: defaultDesign.lineHeight,
            sectionSpacing: defaultDesign.sectionSpacing,
            itemSpacing: defaultDesign.itemSpacing,
            pageMargins: defaultDesign.pageMargins
        };
    }
    applyDesignSettings(document);
    
    const savedKey = localStorage.getItem('geminiApiKey');
    if (savedKey) {
        document.getElementById('settings-api-key').value = savedKey;
    }
    updateSalaryWidget();
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
        let promptText = "";
        
        if (textarea.id === 'skills-text') {
            promptText = jobDescription 
                ? `You are an expert CV writer. The user provided a list of skills. Review the list and tailor it to align with the provided Job Description. You can reorder, rename, or add highly relevant skills based on the Job Description.
                   IMPORTANT RULES:
                   1. Return ONLY a comma-separated list of skills.
                   2. Do NOT return sentences, bullet points, paragraphs, markdown formatting, or numbering.
                   3. Just skills separated by commas (e.g., "Python, JavaScript, SQL, Project Management").
                   4. Do NOT include any introductory or concluding text (e.g. do not say "Here are the skills:").
                   5. You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Text' provided below.

                   Job Description:
                   ${jobDescription}

                   Original Text:
                   ${textToEnhance}`
                : `You are an expert CV writer. The user provided a list of skills. Improve the professional naming of these skills.
                   IMPORTANT RULES:
                   1. Return ONLY a comma-separated list of skills.
                   2. Do NOT return sentences, bullet points, paragraphs, markdown formatting, or numbering.
                   3. Just skills separated by commas (e.g., "Python, JavaScript, SQL, Project Management").
                   4. Do NOT include any introductory or concluding text (e.g. do not say "Here are the skills:").
                   5. You MUST write your response in the EXACT SAME LANGUAGE as the 'Text' provided below.

                   Text:
                   ${textToEnhance}`;
        } else {
            promptText = jobDescription 
                ? `You are an expert CV writer. Fix the grammar of the following text and rewrite it using professional, impactful action verbs. Most importantly, TAILOR this text to align with the provided Job Description (highlight relevant skills, keywords, and tone). Do not add formatting like markdown backticks, just return the improved text directly. IMPORTANT: NEVER use bullet point characters (like •, -, or *) in your response. Just return plain text sentences separated by newlines. CRITICAL: You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Text' provided below (e.g., if the original text is in Hebrew, your response must be in Hebrew).\n\nJob Description:\n${jobDescription}\n\nOriginal Text:\n${textToEnhance}`
                : `You are an expert CV writer. Fix the grammar of the following text and rewrite it using professional, impactful action verbs suitable for an ATS-friendly CV. Do not add formatting like markdown backticks, just return the improved text directly. IMPORTANT: NEVER use bullet point characters (like •, -, or *) in your response. Just return plain text sentences separated by newlines. CRITICAL: You MUST write your response in the EXACT SAME LANGUAGE as the 'Text' provided below (e.g., if the original text is in Hebrew, your response must be in Hebrew).\n\nText:\n${textToEnhance}`;
        }

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

        if (textarea.id === 'skills-text') {
            // Post-process skills text to guarantee a clean comma-separated list
            let lines = aiText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            // Remove intro line if it ends with colon or contains introductory keywords
            if (lines.length > 1 && (lines[0].endsWith(':') || /here are|skills|כישורים|להלן|הנה/i.test(lines[0]))) {
                lines.shift();
            }
            
            // Remove concluding line if it contains conversational fluff
            if (lines.length > 0) {
                let lastLine = lines[lines.length - 1];
                if (lastLine.includes('let me know') || lastLine.includes('בהצלחה') || lastLine.includes('hope this helps') || lastLine.includes('עזרתי')) {
                    lines.pop();
                }
            }

            let items = [];
            lines.forEach(line => {
                // Strip list numbers, bullet characters, etc. at the start of the line
                let clean = line.replace(/^[\s•\-*#\d\.\)]+/, '').trim();
                if (clean) {
                    // Split by comma or semicolon
                    let splitItems = clean.split(/[,;\u060C\u002C]/).map(x => x.trim()).filter(x => x.length > 0);
                    items.push(...splitItems);
                }
            });

            // Filter out items that are full sentences, and clean ending punctuation
            items = items.map(item => {
                return item.replace(/[\.\s,]+$/, '').trim(); // strip ending dots/commas
            }).filter(item => {
                if (!item) return false;
                // A skill is rarely longer than 6 words; filter out longer text which is likely prose
                const wordCount = item.split(/\s+/).length;
                if (wordCount > 6) return false;
                return true;
            });

            // Deduplicate (case-insensitive lookup, preserve original casing)
            let seen = new Set();
            let uniqueItems = [];
            items.forEach(item => {
                let key = item.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueItems.push(item);
                }
            });

            aiText = uniqueItems.join(', ');
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

    document.getElementById('settings-language').addEventListener('change', () => {
        saveData();
        const iframe = document.getElementById('design-preview-iframe');
        if (iframe && document.getElementById('section-design').classList.contains('active')) {
            renderLivePreview();
        }
        updateSalaryWidget();
    });
    
    document.getElementById('settings-color').addEventListener('input', (e) => {
        if (!cvData.design) cvData.design = { ...defaultDesign };
        cvData.design.themeColor = e.target.value;
        saveData();
        applyDesignSettings(document);
        populateDesignInputs();
        
        const iframe = document.getElementById('design-preview-iframe');
        if (iframe) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            applyDesignSettings(iframeDoc);
        }
        triggerPreviewLayoutUpdate();
    });

    const fontEl = document.getElementById('settings-font');
    if (fontEl) {
        fontEl.value = localStorage.getItem('cvFont') || 'Inter';
        fontEl.addEventListener('change', (e) => {
            if (!cvData.design) cvData.design = { ...defaultDesign };
            cvData.design.fontFamily = e.target.value;
            saveData();
            applyDesignSettings(document);
            populateDesignInputs();
            
            const iframe = document.getElementById('design-preview-iframe');
            if (iframe) {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                applyDesignSettings(iframeDoc);
            }
            triggerPreviewLayoutUpdate();
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

    // Job description auto-save and state clearing
    const jobDescEl = document.getElementById('ai-job-description');
    if (jobDescEl) {
        const savedJobDesc = localStorage.getItem('jobDescription');
        if (savedJobDesc) jobDescEl.value = savedJobDesc;
        jobDescEl.addEventListener('input', () => {
            localStorage.setItem('jobDescription', jobDescEl.value);
            
            // Clear old salary estimate on changes to prevent stale data
            localStorage.removeItem('salaryShortRange');
            localStorage.removeItem('salaryHTMLResponse');
            const outputEl = document.getElementById('salary-estimate-output');
            if (outputEl) {
                outputEl.innerHTML = '';
                outputEl.classList.add('hidden');
            }
            updateSalaryWidget();

            // Clear all AI suggestion boxes to force fresh tailoring suggestions
            document.querySelectorAll('.ai-suggestion-box').forEach(box => {
                box.innerHTML = '';
                box.classList.add('hidden');
            });

            // Clear cover letter
            const clTextarea = document.getElementById('cover-letter-text');
            const clOutputEl = document.getElementById('cover-letter-output');
            if (clTextarea) clTextarea.value = '';
            if (clOutputEl) clOutputEl.classList.add('hidden');
            localStorage.removeItem('coverLetterText');
        });
    }

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

    // Salary Estimation
    const estimateSalaryBtn = document.getElementById('estimate-salary-btn');
    if (estimateSalaryBtn) {
        estimateSalaryBtn.addEventListener('click', handleEstimateSalary);
    }

    // Load saved salary estimate
    const savedSalaryHTML = localStorage.getItem('salaryHTMLResponse');
    if (savedSalaryHTML) {
        const outputEl = document.getElementById('salary-estimate-output');
        if (outputEl) {
            outputEl.innerHTML = savedSalaryHTML;
            outputEl.classList.remove('hidden');
        }
    }

    // Salary widget navigation and click behavior
    const salaryWidget = document.getElementById('sidebar-salary-widget');
    if (salaryWidget) {
        salaryWidget.addEventListener('click', () => {
            const navBtns = document.querySelectorAll('.nav-btn');
            const sections = document.querySelectorAll('.editor-section');
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            const jobDescBtn = Array.from(navBtns).find(btn => btn.dataset.target === 'section-job-desc');
            if (jobDescBtn) jobDescBtn.classList.add('active');
            const sectionEl = document.getElementById('section-job-desc');
            if (sectionEl) {
                sectionEl.classList.add('active');
                // Scroll to salary estimator card
                const estimatorCard = sectionEl.querySelector('.card:last-of-type');
                if (estimatorCard) {
                    estimatorCard.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }

    // One-Click AI Optimizer
    const autoTailorAllBtn = document.getElementById('auto-tailor-all-btn');
    if (autoTailorAllBtn) {
        autoTailorAllBtn.addEventListener('click', handleAutoTailorEverything);
    }

    const closeProgressModalBtn = document.getElementById('close-progress-modal-btn');
    if (closeProgressModalBtn) {
        closeProgressModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('ai-progress-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    // Initialize design control listeners
    setupDesignEventListeners();

    // Initial update of the salary widget
    updateSalaryWidget();
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
    const printArea = document.getElementById('print-area');
    const preview = document.getElementById('cv-preview');
    const lang = document.getElementById('settings-language').value || 'en';
    
    if (lang === 'he') {
        document.body.classList.add('rtl');
    } else {
        document.body.classList.remove('rtl');
    }

    applyDesignSettings(document);
    preview.innerHTML = getCVHTML();
    
    // If auto-fit is active, run the solver on the print area inside offscreen measure mode
    const d = cvData.design;
    if (d && (d.pageFit === '1' || d.pageFit === '2')) {
        printArea.classList.add('measure-mode');
        
        const pageSize = d.pageSize || 'letter';
        const pageHeight = pageSize === 'letter' ? (1056 - 57) : (1123 - 57);
        const targetPages = parseInt(d.pageFit);
        
        const fit = runAutoFitSolver(document, preview, targetPages, pageHeight);
        activeDesignSettings = fit;
        
        printArea.classList.remove('measure-mode');
    } else if (d) {
        activeDesignSettings = {
            fontSize: parseFloat(d.fontSize) || 10,
            lineHeight: parseFloat(d.lineHeight) || 1.4,
            sectionSpacing: parseFloat(d.sectionSpacing) || 2.0,
            itemSpacing: parseFloat(d.itemSpacing) || 1.2,
            pageMargins: parseFloat(d.pageMargins) || 3.0
        };
        applyDesignSettings(document);
    }
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

// Salary Estimator
async function handleEstimateSalary() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first.");
        return;
    }

    const jobDescription = document.getElementById('ai-job-description').value.trim();
    if (!jobDescription) {
        alert("Please paste a job description first.");
        return;
    }

    const btn = document.getElementById('estimate-salary-btn');
    const outputEl = document.getElementById('salary-estimate-output');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Estimating...';
    btn.disabled = true;
    outputEl.classList.add('hidden');

    try {
        const promptText = `You are an expert career consultant and recruitment market analyst.
Analyze the following job description to estimate a reasonable market salary range and provide negotiation tips.

Job Description:
${jobDescription}

IMPORTANT INSTRUCTIONS:
1. Detect the language of the job description. Respond in the EXACT SAME LANGUAGE as the job description (e.g., Hebrew for Hebrew, English for English).
2. Detect the geographic location of the job if mentioned, or assume the local market if clear (e.g., Israel if in Hebrew).
3. If the market is Israel (or in Hebrew), provide the estimated monthly gross salary in ILS (ש"ח לחודש).
4. If the market is the US or international, provide the estimated yearly gross salary in USD ($ per year).
5. Provide a realistic range (Minimum, Midpoint, Maximum) based on required experience, tech stack, and seniority.
6. Provide 3-4 key market factors that influence this estimate (e.g. high-demand tech stack, management requirements, years of experience).
7. Provide 2-3 specific salary negotiation tips customized to the skills required in this job description.
8. Format your response in clean, beautiful HTML (using headers <h4>, paragraphs, lists, bold text) so it displays natively in the application container. Do NOT return markdown or wrap with \`\`\`html backticks. Start immediately with the HTML tags.
9. CRITICAL: At the very beginning of the HTML response, include a hidden div containing the estimated short salary range: <div id="salary-badge-val" style="display:none;">[Short Range, e.g. "₪25k - ₪32k" or "$110k - $130k"]</div>. Ensure this string is very short (max 20 characters) and uses the correct currency symbol.`;

        const payload = {
            contents: [{ parts: [{ text: promptText }] }]
        };

        const data = await fetchGeminiWithRetry(apiKey, payload);
        let aiHTML = data.candidates[0].content.parts[0].text.trim();
        
        // Strip markdown code fences if generated by mistake
        if (aiHTML.startsWith("```html")) aiHTML = aiHTML.substring(7);
        if (aiHTML.startsWith("```")) aiHTML = aiHTML.substring(3);
        if (aiHTML.endsWith("```")) aiHTML = aiHTML.slice(0, -3);
        
        outputEl.innerHTML = aiHTML.trim();
        outputEl.classList.remove('hidden');

        // Extract the short range from the hidden element
        let shortRange = '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(aiHTML, 'text/html');
            const badgeValEl = doc.getElementById('salary-badge-val');
            if (badgeValEl) {
                shortRange = badgeValEl.textContent.trim();
                localStorage.setItem('salaryShortRange', shortRange);
            } else {
                // Fallback: try to search for currency and numbers in the HTML
                const rx = /(₪|\$)\s*\d+[\d,]*\s*-\s*(₪|\$)?\s*\d+[\d,]*k?/i;
                const match = aiHTML.match(rx);
                if (match) {
                    shortRange = match[0];
                    localStorage.setItem('salaryShortRange', shortRange);
                }
            }
        } catch (e) {
            console.error("Error extracting short range:", e);
        }

        localStorage.setItem('salaryHTMLResponse', aiHTML);
        updateSalaryWidget();

    } catch (error) {
        console.error("Salary Estimate Error:", error);
        alert(`Error estimating salary: ${error.message}`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Update the Salary Widget on the Sidebar
function updateSalaryWidget() {
    const widget = document.getElementById('sidebar-salary-widget');
    const titleEl = document.getElementById('salary-widget-title');
    const bodyEl = document.getElementById('sidebar-salary-body');
    const linkEl = document.getElementById('salary-widget-link');
    
    if (!widget || !titleEl || !bodyEl || !linkEl) return;
    
    const lang = localStorage.getItem('cvLanguage') || 'en';
    const shortRange = localStorage.getItem('salaryShortRange');
    const jobDesc = (document.getElementById('ai-job-description')?.value || '').trim();
    
    if (shortRange) {
        widget.classList.add('has-salary');
        if (lang === 'he') {
            titleEl.textContent = 'שכר מומלץ למשרה';
            bodyEl.innerHTML = shortRange;
            linkEl.textContent = 'לפרטים וטיפים נוספים ←';
        } else {
            titleEl.textContent = 'Recommended Salary';
            bodyEl.innerHTML = shortRange;
            linkEl.textContent = 'Details & Tips ←';
        }
        linkEl.style.display = 'block';
    } else if (jobDesc) {
        widget.classList.remove('has-salary');
        if (lang === 'he') {
            titleEl.textContent = 'הערכת שכר';
            bodyEl.innerHTML = '<span style="opacity:0.75; font-size:0.8rem;">ממתין להערכת שכר...</span>';
            linkEl.textContent = 'חשב שכר מומלץ';
        } else {
            titleEl.textContent = 'Salary Indication';
            bodyEl.innerHTML = '<span style="opacity:0.75; font-size:0.8rem;">Awaiting estimation...</span>';
            linkEl.textContent = 'Estimate Salary Now';
        }
        linkEl.style.display = 'block';
    } else {
        widget.classList.remove('has-salary');
        if (lang === 'he') {
            titleEl.textContent = 'הערכת שכר';
            bodyEl.innerHTML = '<span style="opacity:0.75; font-size:0.8rem; font-weight:normal;">הזן תיאור משרה לקבלת הערכה.</span>';
        } else {
            titleEl.textContent = 'Salary Indication';
            bodyEl.innerHTML = '<span style="opacity:0.75; font-size:0.8rem; font-weight:normal;">Paste job description to estimate.</span>';
        }
        linkEl.style.display = 'none';
    }
}

// Helper to update progress step states in the overlay modal
function setStepState(stepId, state, labelText = '') {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    
    const iconEl = stepEl.querySelector('.step-icon');
    const labelEl = stepEl.querySelector('.step-label');
    
    if (labelText && labelEl) {
        labelEl.textContent = labelText;
    }
    
    // Clear old classes
    stepEl.classList.remove('active', 'completed', 'error');
    if (iconEl) {
        iconEl.className = 'step-icon'; // reset fontawesome classes
    }
    
    if (state === 'pending') {
        if (iconEl) iconEl.className = 'fa-regular fa-circle step-icon';
    } else if (state === 'active') {
        stepEl.classList.add('active');
        if (iconEl) iconEl.className = 'fa-solid fa-circle-notch fa-spin step-icon';
    } else if (state === 'completed') {
        stepEl.classList.add('completed');
        if (iconEl) iconEl.className = 'fa-solid fa-circle-check step-icon';
    } else if (state === 'error') {
        stepEl.classList.add('error');
        if (iconEl) iconEl.className = 'fa-solid fa-circle-xmark step-icon';
    }
}

// Master AI Optimizer: Tailors Summary, Skills, Work Experiences, Estimates Salary, and Writes Cover Letter
async function handleAutoTailorEverything() {
    const apiKey = localStorage.getItem('geminiApiKey');
    if (!apiKey) {
        alert("Please set your Gemini API Key in the Settings section first.");
        return;
    }

    const jobDescription = document.getElementById('ai-job-description').value.trim();
    if (!jobDescription) {
        alert("Please paste a job description first.");
        return;
    }

    const modal = document.getElementById('ai-progress-modal');
    const closeBtn = document.getElementById('close-progress-modal-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');

    if (!modal) return;

    // Show modal and reset state
    modal.classList.remove('hidden');
    if (closeBtn) closeBtn.style.display = 'none';
    
    const lang = localStorage.getItem('cvLanguage') || 'en';
    if (modalTitle) modalTitle.textContent = lang === 'he' ? 'אופטימיזציית CV באמצעות AI...' : 'Running AI CV Optimization...';
    if (modalDesc) modalDesc.textContent = lang === 'he' 
        ? 'אנחנו מנתחים את תיאור המשרה ומייצרים המלצות מותאמות לקורות החיים שלך. אנא המתן.'
        : 'We are analyzing the job description and generating tailored recommendations for your CV. Please wait.';

    // Reset all steps to pending (we will mark them completed instantly if we skip them)
    setStepState('step-init', 'active', lang === 'he' ? 'מכין תיאור משרה...' : 'Preparing job description...');
    setStepState('step-summary', 'pending', lang === 'he' ? 'מתאים תקציר מקצועי...' : 'Tailoring summary suggestion...');
    setStepState('step-skills', 'pending', lang === 'he' ? 'מתאים רשימת כישורים...' : 'Tailoring skills suggestion...');
    setStepState('step-experience', 'pending', lang === 'he' ? 'מתאים ניסיון תעסוקתי...' : 'Tailoring work experience suggestions...');
    setStepState('step-salary', 'pending', lang === 'he' ? 'מעריך שכר מומלץ למשרה...' : 'Estimating market salary range...');
    setStepState('step-coverletter', 'pending', lang === 'he' ? 'מנסח מכתב פנייה (Cover Letter)...' : 'Generating tailored cover letter...');

    const makeOnRetryCallback = (stepId, originalLabelText) => {
        return (waitMs, attempt) => {
            let secondsLeft = Math.ceil(waitMs / 1000);
            if (window.activeCountdownInterval) {
                clearInterval(window.activeCountdownInterval);
            }
            
            const updateCountdown = () => {
                if (secondsLeft > 0) {
                    setStepState(stepId, 'active', `${originalLabelText} (${lang === 'he' ? 'עומס: מנסה שוב בעוד' : 'Rate limited: retrying in'} ${secondsLeft}s...)`);
                    secondsLeft--;
                } else {
                    clearInterval(window.activeCountdownInterval);
                    setStepState(stepId, 'active', `${originalLabelText} (${lang === 'he' ? 'מנסה שוב כעת...' : 'Retrying now...'})`);
                }
            };
            
            updateCountdown();
            window.activeCountdownInterval = setInterval(updateCountdown, 1000);
        };
    };

    try {
        // Step 1: Init / Prep
        await new Promise(resolve => setTimeout(resolve, 800)); // nice visual flow
        setStepState('step-init', 'completed', lang === 'he' ? 'תיאור המשרה הוכן בהצלחה' : 'Job description prepared.');
        setStepState('step-summary', 'active');

        // Step 2: Summary Recommendation
        const summaryTextarea = document.getElementById('summary-text');
        const summarySuggestionBox = document.getElementById('ai-suggestion-summary');
        const summaryText = (summaryTextarea?.value || '').trim();
        
        if (summaryText && summaryTextarea && summarySuggestionBox) {
            const existingSugg = summarySuggestionBox.querySelector('textarea');
            if (existingSugg && existingSugg.value.trim().length > 0) {
                setStepState('step-summary', 'completed', lang === 'he' ? 'תקציר מקצועי (כבר קיים - דילוג)' : 'Tailoring summary suggestion... (Skipped - already tailored)');
            } else {
                if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                
                const promptText = `You are an expert CV writer. Fix the grammar of the following CV summary and rewrite it using professional, impactful action verbs. Most importantly, TAILOR this CV summary to align with the provided Job Description (highlight relevant skills, keywords, and tone). Return ONLY the direct improved summary text, do not add markdown code blocks, backticks, or any introductory prose. Keep it to 3-4 sentences. You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Summary' provided below.\n\nJob Description:\n${jobDescription}\n\nOriginal Summary:\n${summaryText}`;
                
                const payload = { contents: [{ parts: [{ text: promptText }] }] };
                const data = await fetchGeminiWithRetry(
                    apiKey, 
                    payload, 
                    5, 
                    makeOnRetryCallback('step-summary', lang === 'he' ? 'מתאים תקציר מקצועי...' : 'Tailoring summary suggestion...')
                );
                
                if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                let aiText = data.candidates[0].content.parts[0].text.trim();
                
                if (aiText.startsWith("```")) {
                    const lines = aiText.split('\n');
                    if (lines.length > 1) {
                        lines.shift();
                        if (lines[lines.length - 1].startsWith("```")) lines.pop();
                        aiText = lines.join('\n').trim();
                    }
                }

                const taId = 'ai-sugg-summary-' + Date.now();
                summarySuggestionBox.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem; margin-top: 1rem;">
                        <strong><i class="fa-solid fa-wand-magic-sparkles"></i> ${lang === 'he' ? 'המלצת AI (ניתנת לעריכה):' : 'AI Suggestion (editable):'}</strong>
                        <button class="primary-btn apply-suggestion-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; width: auto;"><i class="fa-solid fa-arrow-up"></i> ${lang === 'he' ? 'הכנס לקורות חיים' : 'Insert'}</button>
                    </div>
                    <textarea id="${taId}" class="ai-suggestion-textarea" style="width: 100%; min-height: 100px; resize: vertical; padding: 0.5rem; border: 1px solid #4F46E5; border-radius: 6px; background-color: #EEF2FF;">${aiText}</textarea>
                `;
                summarySuggestionBox.classList.remove('hidden');

                const suggTextarea = summarySuggestionBox.querySelector('textarea');
                summarySuggestionBox.querySelector('.apply-suggestion-btn').addEventListener('click', () => {
                    summaryTextarea.value = suggTextarea.value;
                    const event = new Event('input', { bubbles: true });
                    summaryTextarea.dispatchEvent(event);
                    summarySuggestionBox.classList.add('hidden');
                });
                
                setStepState('step-summary', 'completed', lang === 'he' ? 'תקציר מקצועי הותאם בהצלחה' : 'Tailoring summary suggestion...');
            }
        } else {
            setStepState('step-summary', 'completed', lang === 'he' ? 'תקציר מקצועי (אין תוכן להתאמה)' : 'Tailoring summary suggestion... (No summary to tailor)');
        }
        
        setStepState('step-skills', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 3: Skills Recommendation
        const skillsTextarea = document.getElementById('skills-text');
        const skillsSuggestionBox = document.getElementById('ai-suggestion-skills');
        const skillsText = (skillsTextarea?.value || '').trim();

        if (skillsText && skillsTextarea && skillsSuggestionBox) {
            const existingSugg = skillsSuggestionBox.querySelector('textarea');
            if (existingSugg && existingSugg.value.trim().length > 0) {
                setStepState('step-skills', 'completed', lang === 'he' ? 'רשימת כישורים (כבר קיימת - דילוג)' : 'Tailoring skills suggestion... (Skipped - already tailored)');
            } else {
                if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                
                const promptText = `You are an expert CV writer. The user provided a list of skills. Review the list and tailor it to align with the provided Job Description. You can reorder, rename, or add highly relevant skills based on the Job Description.
                   IMPORTANT RULES:
                   1. Return ONLY a comma-separated list of skills.
                   2. Do NOT return sentences, bullet points, paragraphs, markdown formatting, or numbering.
                   3. Just skills separated by commas (e.g., "Python, JavaScript, SQL, Project Management").
                   4. Do NOT include any introductory or concluding text (e.g. do not say "Here are the skills:").
                   5. You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Text' provided below.

                   Job Description:
                   ${jobDescription}

                   Original Text:
                   ${skillsText}`;

                const payload = { contents: [{ parts: [{ text: promptText }] }] };
                const data = await fetchGeminiWithRetry(
                    apiKey, 
                    payload, 
                    5, 
                    makeOnRetryCallback('step-skills', lang === 'he' ? 'מתאים רשימת כישורים...' : 'Tailoring skills suggestion...')
                );
                
                if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                let aiText = data.candidates[0].content.parts[0].text.trim();
                
                if (aiText.startsWith("```")) {
                    const lines = aiText.split('\n');
                    if (lines.length > 1) {
                        lines.shift();
                        if (lines[lines.length - 1].startsWith("```")) lines.pop();
                        aiText = lines.join('\n').trim();
                    }
                }

                // Post-process skills using existing filters
                let lines = aiText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 1 && (lines[0].endsWith(':') || /here are|skills|כישורים|להלן|הנה/i.test(lines[0]))) {
                    lines.shift();
                }
                if (lines.length > 0) {
                    let lastLine = lines[lines.length - 1];
                    if (lastLine.includes('let me know') || lastLine.includes('בהצלחה') || lastLine.includes('hope this helps') || lastLine.includes('עזרתי')) {
                        lines.pop();
                    }
                }
                let items = [];
                lines.forEach(line => {
                    let clean = line.replace(/^[\s•\-*#\d\.\)]+/, '').trim();
                    if (clean) {
                        let splitItems = clean.split(/[,;\u060C\u002C]/).map(x => x.trim()).filter(x => x.length > 0);
                        items.push(...splitItems);
                    }
                });
                items = items.map(item => item.replace(/[\.\s,]+$/, '').trim()).filter(item => {
                    if (!item) return false;
                    const wordCount = item.split(/\s+/).length;
                    return wordCount <= 6;
                });
                let seen = new Set();
                let uniqueItems = [];
                items.forEach(item => {
                    let key = item.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueItems.push(item);
                    }
                });
                aiText = uniqueItems.join(', ');

                const taId = 'ai-sugg-skills-' + Date.now();
                skillsSuggestionBox.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem; margin-top: 1rem;">
                        <strong><i class="fa-solid fa-wand-magic-sparkles"></i> ${lang === 'he' ? 'המלצת AI (ניתנת לעריכה):' : 'AI Suggestion (editable):'}</strong>
                        <button class="primary-btn apply-suggestion-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; width: auto;"><i class="fa-solid fa-arrow-up"></i> ${lang === 'he' ? 'הכנס לקורות חיים' : 'Insert'}</button>
                    </div>
                    <textarea id="${taId}" class="ai-suggestion-textarea" style="width: 100%; min-height: 100px; resize: vertical; padding: 0.5rem; border: 1px solid #4F46E5; border-radius: 6px; background-color: #EEF2FF;">${aiText}</textarea>
                `;
                skillsSuggestionBox.classList.remove('hidden');

                const suggTextarea = skillsSuggestionBox.querySelector('textarea');
                skillsSuggestionBox.querySelector('.apply-suggestion-btn').addEventListener('click', () => {
                    skillsTextarea.value = suggTextarea.value;
                    const event = new Event('input', { bubbles: true });
                    skillsTextarea.dispatchEvent(event);
                    skillsSuggestionBox.classList.add('hidden');
                });
                
                setStepState('step-skills', 'completed', lang === 'he' ? 'כישורים הותאמו בהצלחה' : 'Tailoring skills suggestion...');
            }
        } else {
            setStepState('step-skills', 'completed', lang === 'he' ? 'כישורים (אין תוכן להתאמה)' : 'Tailoring skills suggestion... (No skills to tailor)');
        }
        
        setStepState('step-experience', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 4: Work Experience Recommendations
        const expCards = document.querySelectorAll('#experience-list .item-card');
        if (expCards && expCards.length > 0) {
            let idx = 0;
            let skipCount = 0;
            for (const card of expCards) {
                const bulletsInput = card.querySelector('.exp-bullets');
                const bulletsSuggestionBox = card.querySelector('.ai-suggestion-box');
                const expText = (bulletsInput?.value || '').trim();

                if (expText && bulletsInput && bulletsSuggestionBox) {
                    const existingSugg = bulletsSuggestionBox.querySelector('textarea');
                    if (existingSugg && existingSugg.value.trim().length > 0) {
                        skipCount++;
                        idx++;
                        continue;
                    }

                    // Small intentional delay between experience cards
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    
                    if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                    
                    setStepState('step-experience', 'active', lang === 'he'
                        ? `מתאים ניסיון תעסוקתי (${idx + 1}/${expCards.length})...`
                        : `Tailoring work experience suggestions (${idx + 1}/${expCards.length})...`);
                    
                    const promptText = `You are an expert CV writer. Tailor the following work experience bullet points/responsibilities to align with the provided Job Description (highlight relevant achievements, keywords, and tone). Return ONLY the direct tailored bullet points separated by newlines. Do NOT use bullet characters (like •, -, or *), markdown formatting, backticks, or introductory prose. You MUST write your response in the EXACT SAME LANGUAGE as the 'Original Text' provided below.\n\nJob Description:\n${jobDescription}\n\nOriginal Text:\n${expText}`;
                    
                    const payload = { contents: [{ parts: [{ text: promptText }] }] };
                    const data = await fetchGeminiWithRetry(
                        apiKey, 
                        payload, 
                        5, 
                        makeOnRetryCallback('step-experience', lang === 'he'
                            ? `מתאים ניסיון תעסוקתי (${idx + 1}/${expCards.length})...`
                            : `Tailoring work experience suggestions (${idx + 1}/${expCards.length})...`)
                    );
                    
                    if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
                    let aiText = data.candidates[0].content.parts[0].text.trim();

                    if (aiText.startsWith("```")) {
                        const lines = aiText.split('\n');
                        if (lines.length > 1) {
                            lines.shift();
                            if (lines[lines.length - 1].startsWith("```")) lines.pop();
                            aiText = lines.join('\n').trim();
                        }
                    }

                    const taId = 'ai-sugg-exp-' + Date.now() + '-' + idx;
                    bulletsSuggestionBox.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem; margin-top: 1rem;">
                            <strong><i class="fa-solid fa-wand-magic-sparkles"></i> ${lang === 'he' ? 'המלצת AI (ניתנת לעריכה):' : 'AI Suggestion (editable):'}</strong>
                            <button class="primary-btn apply-suggestion-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; width: auto;"><i class="fa-solid fa-arrow-up"></i> ${lang === 'he' ? 'הכנס לקורות חיים' : 'Insert'}</button>
                        </div>
                        <textarea id="${taId}" class="ai-suggestion-textarea" style="width: 100%; min-height: 100px; resize: vertical; padding: 0.5rem; border: 1px solid #4F46E5; border-radius: 6px; background-color: #EEF2FF;">${aiText}</textarea>
                    `;
                    bulletsSuggestionBox.classList.remove('hidden');

                    const suggTextarea = bulletsSuggestionBox.querySelector('textarea');
                    bulletsSuggestionBox.querySelector('.apply-suggestion-btn').addEventListener('click', () => {
                        bulletsInput.value = suggTextarea.value;
                        const event = new Event('input', { bubbles: true });
                        bulletsInput.dispatchEvent(event);
                        bulletsSuggestionBox.classList.add('hidden');
                    });
                }
                idx++;
            }
            if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
            
            if (skipCount === expCards.length) {
                setStepState('step-experience', 'completed', lang === 'he' ? 'ניסיון תעסוקתי (כבר קיים - דילוג)' : 'Tailoring work experience suggestions... (Skipped - all already tailored)');
            } else {
                setStepState('step-experience', 'completed', lang === 'he' ? 'ניסיון תעסוקתי הותאם בהצלחה' : 'Tailoring work experience suggestions...');
            }
        } else {
            setStepState('step-experience', 'completed', lang === 'he' ? 'ניסיון תעסוקתי (אין משרות להתאמה)' : 'Tailoring work experience suggestions... (No experience to tailor)');
        }
        
        setStepState('step-salary', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 5: Estimate Salary Range
        const hasSalaryHTML = localStorage.getItem('salaryHTMLResponse');
        if (hasSalaryHTML && hasSalaryHTML.trim().length > 0) {
            setStepState('step-salary', 'completed', lang === 'he' ? 'הערכת שכר (כבר קיימת - דילוג)' : 'Estimating market salary range... (Skipped - already estimated)');
        } else {
            if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
            
            const salaryPrompt = `You are an expert career consultant and recruitment market analyst.
Analyze the following job description to estimate a reasonable market salary range and provide negotiation tips.

Job Description:
${jobDescription}

IMPORTANT INSTRUCTIONS:
1. Detect the language of the job description. Respond in the EXACT SAME LANGUAGE as the job description (e.g., Hebrew for Hebrew, English for English).
2. Detect the geographic location of the job if mentioned, or assume the local market if clear (e.g., Israel if in Hebrew).
3. If the market is Israel (or in Hebrew), provide the estimated monthly gross salary in ILS (ש"ח לחודש).
4. If the market is the US or international, provide the estimated yearly gross salary in USD ($ per year).
5. Provide a realistic range (Minimum, Midpoint, Maximum) based on required experience, tech stack, and seniority.
6. Provide 3-4 key market factors that influence this estimate (e.g. high-demand tech stack, management requirements, years of experience).
7. Provide 2-3 specific salary negotiation tips customized to the skills required in this job description.
8. Format your response in clean, beautiful HTML (using headers <h4>, paragraphs, lists, bold text) so it displays natively in the application container. Do NOT return markdown or wrap with \`\`\`html backticks. Start immediately with the HTML tags.
9. CRITICAL: At the very beginning of the HTML response, include a hidden div containing the estimated short salary range: <div id="salary-badge-val" style="display:none;">[Short Range, e.g. "₪25k - ₪32k" or "$110k - $130k"]</div>. Ensure this string is very short (max 20 characters) and uses the correct currency symbol.`;

            const salaryPayload = { contents: [{ parts: [{ text: salaryPrompt }] }] };
            const salaryData = await fetchGeminiWithRetry(
                apiKey, 
                salaryPayload, 
                5, 
                makeOnRetryCallback('step-salary', lang === 'he' ? 'מעריך שכר מומלץ למשרה...' : 'Estimating market salary range...')
            );
            
            if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
            let salaryHTML = salaryData.candidates[0].content.parts[0].text.trim();
            
            if (salaryHTML.startsWith("```html")) salaryHTML = salaryHTML.substring(7);
            if (salaryHTML.startsWith("```")) salaryHTML = salaryHTML.substring(3);
            if (salaryHTML.endsWith("```")) salaryHTML = salaryHTML.slice(0, -3);

            const salaryOutputEl = document.getElementById('salary-estimate-output');
            if (salaryOutputEl) {
                salaryOutputEl.innerHTML = salaryHTML.trim();
                salaryOutputEl.classList.remove('hidden');
            }

            let shortRange = '';
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(salaryHTML, 'text/html');
                const badgeValEl = doc.getElementById('salary-badge-val');
                if (badgeValEl) {
                    shortRange = badgeValEl.textContent.trim();
                    localStorage.setItem('salaryShortRange', shortRange);
                } else {
                    const rx = /(₪|\$)\s*\d+[\d,]*\s*-\s*(₪|\$)?\s*\d+[\d,]*k?/i;
                    const match = salaryHTML.match(rx);
                    if (match) {
                        shortRange = match[0];
                        localStorage.setItem('salaryShortRange', shortRange);
                    }
                }
            } catch (e) {
                console.error("Error extracting short range:", e);
            }
            localStorage.setItem('salaryHTMLResponse', salaryHTML);
            updateSalaryWidget();

            setStepState('step-salary', 'completed', lang === 'he' ? 'הערכת שכר הושלמה בהצלחה' : 'Estimating market salary range...');
        }
        
        setStepState('step-coverletter', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 6: Generate Cover Letter
        const hasCoverLetter = localStorage.getItem('coverLetterText');
        if (hasCoverLetter && hasCoverLetter.trim().length > 0) {
            setStepState('step-coverletter', 'completed', lang === 'he' ? 'מכתב פנייה (כבר קיים - דילוג)' : 'Generating tailored cover letter... (Skipped - already generated)');
        } else {
            if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
            
            const clPrompt = `You are an expert career coach and cover letter writer. Write a highly tailored, extremely concise cover letter for the candidate below based on their CV and the Job Description.

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
            
            JOB DESCRIPTION: ${jobDescription}`;

            const clPayload = { contents: [{ parts: [{ text: clPrompt }] }] };
            const clData = await fetchGeminiWithRetry(
                apiKey, 
                clPayload, 
                5, 
                makeOnRetryCallback('step-coverletter', lang === 'he' ? 'מנסח מכתב פנייה (Cover Letter)...' : 'Generating tailored cover letter...')
            );
            
            if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
            let coverLetter = clData.candidates[0].content.parts[0].text.trim();

            const clTextarea = document.getElementById('cover-letter-text');
            const clOutputEl = document.getElementById('cover-letter-output');
            if (clTextarea && clOutputEl) {
                clTextarea.value = coverLetter;
                clOutputEl.classList.remove('hidden');
                localStorage.setItem('coverLetterText', coverLetter);
            }

            setStepState('step-coverletter', 'completed', lang === 'he' ? 'מכתב פנייה נוסח בהצלחה' : 'Generating tailored cover letter...');
        }

        // Success finalization
        if (modalTitle) modalTitle.textContent = lang === 'he' ? 'האופטימיזציה הושלמה!' : 'Optimization Complete!';
        if (modalDesc) modalDesc.textContent = lang === 'he'
            ? 'כל המלצות ההתאמה הוכנו בהצלחה, הערכת השכר מוכנה ומכתב הפנייה נכתב!'
            : 'All tailoring suggestions have been prepared, the salary estimate is ready, and the cover letter is written!';
        if (closeBtn) {
            closeBtn.style.display = 'block';
            closeBtn.textContent = lang === 'he' ? 'סיום' : 'Done';
            closeBtn.focus();
        }

    } catch (error) {
        console.error("Auto-Tailor Error:", error);
        if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
        hideRateLimitUI();
        
        const activeStep = modal.querySelector('.progress-step.active');
        if (activeStep) {
            setStepState(activeStep.id, 'error');
        }
        
        let friendlyMessage = error.message;
        if (error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('resource_exhausted')) {
            friendlyMessage = lang === 'he'
                ? 'מכסת השימוש הזמנית ב-Gemini API הסתיימה. אנא המתן כדקה ונסה להפעיל מחדש (התהליך יימשך מהנקודה שבה עצר).'
                : 'The temporary Gemini API rate limit was reached. Please wait a minute and click run again to continue (completed steps will be skipped).';
        }
        
        if (modalTitle) modalTitle.textContent = lang === 'he' ? 'האופטימיזציה נעצרה זמנית' : 'Optimization Paused (Rate Limit)';
        if (modalDesc) modalDesc.textContent = friendlyMessage;
        if (closeBtn) {
            closeBtn.style.display = 'block';
            closeBtn.textContent = lang === 'he' ? 'סגור' : 'Close';
            closeBtn.focus();
        }
    } finally {
        if (window.activeCountdownInterval) clearInterval(window.activeCountdownInterval);
        hideRateLimitUI();
        saveData();
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

// ==========================================================================
// NEW DESIGN & LIVE PREVIEW WORKSPACE FUNCTIONS
// ==========================================================================

let layoutUpdateTimeout = null;
function triggerPreviewLayoutUpdate() {
    if (layoutUpdateTimeout) clearTimeout(layoutUpdateTimeout);
    layoutUpdateTimeout = setTimeout(() => {
        const iframe = document.getElementById('design-preview-iframe');
        const scaleWrapper = document.getElementById('design-preview-scale-wrapper');
        const scrollWrapper = document.querySelector('.design-preview-scroll-wrapper');
        if (iframe && scaleWrapper && scrollWrapper) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            adjustPreviewLayout(iframe, scaleWrapper, scrollWrapper, iframeDoc);
        }
    }, 15);
}

// Get HTML for CV Content
function getCVHTML() {
    const lang = document.getElementById('settings-language').value || 'en';
    const color = cvData.design?.themeColor || '#E6E6E6';
    const t = translations[lang] || translations['en'];
    
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
                <h1 class="cv-name" dir="auto">${cvData.personal.name || ''}</h1>
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
                    <td style="height: 1.5em; padding: 0; border: none;"></td>
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
                        <span class="bold">${edu.degree || ''}</span>
                        <span class="light-text">${edu.date || ''}</span>
                    </div>
                    <div class="cv-item-subheader" dir="auto">
                        <span class="title-text">${edu.school || ''}</span>
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
                        <span class="bold">${exp.company || ''}</span>
                        <span class="light-text">${exp.dates || ''}</span>
                    </div>
                    <div class="cv-item-subheader" dir="auto">
                        <span class="title-text">${exp.title || ''}</span>
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
                        <span class="bold">${pub.title || ''}</span>
                        <span class="light-text">${pub.date || ''}</span>
                    </div>
                    <div class="cv-item-subheader">
                        ${pub.authors ? `<span>${pub.authors}</span><br>` : ''}
                        <span>${pub.journal || ''}</span>
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

    return html;
}

// Render Live Preview in Iframe
function renderLivePreview() {
    const iframe = document.getElementById('design-preview-iframe');
    const scaleWrapper = document.getElementById('design-preview-scale-wrapper');
    const scrollWrapper = document.querySelector('.design-preview-scroll-wrapper');
    
    if (!iframe || !scaleWrapper || !scrollWrapper) return;
    
    const lang = document.getElementById('settings-language').value || 'en';
    const direction = lang === 'he' ? 'rtl' : 'ltr';
    const bodyClass = lang === 'he' ? 'rtl' : '';
    
    // Write content to Iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const iframeHTML = `
      <!DOCTYPE html>
      <html lang="${lang}" dir="${direction}">
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;600;700&family=Alef:wght@400;700&family=Frank+Ruhl+Libre:wght@400;700&family=Rubik:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <link rel="stylesheet" href="style.css">
        <style>
          body {
            background: white;
            padding: 0;
            margin: 0;
            overflow-x: hidden;
            width: 100%;
          }
        </style>
      </head>
      <body class="${bodyClass}">
        <div id="cv-preview">
          ${getCVHTML()}
        </div>
      </body>
      </html>
    `;
    
    iframeDoc.open();
    iframeDoc.write(iframeHTML);
    iframeDoc.close();
    
    // Wait for style.css to load in iframe before layout checks
    const link = iframeDoc.querySelector('link[href="style.css"]');
    if (link) {
        link.onload = () => {
            adjustPreviewLayout(iframe, scaleWrapper, scrollWrapper, iframeDoc);
        };
        setTimeout(() => {
            adjustPreviewLayout(iframe, scaleWrapper, scrollWrapper, iframeDoc);
        }, 100);
    } else {
        adjustPreviewLayout(iframe, scaleWrapper, scrollWrapper, iframeDoc);
    }
}

// Run solver to auto-fit CV elements to page count
function runAutoFitSolver(doc, contentEl, targetPages, pageHeight) {
    const d = cvData.design || defaultDesign;
    const maxHeight = targetPages * pageHeight;
    
    // Apply baseline settings first
    applyDesignSettings(doc);
    
    // Force browser reflow to get baseline height
    let contentHeight = contentEl.offsetHeight;
    
    let fontSize = parseFloat(d.fontSize) || 10;
    let lineHeight = parseFloat(d.lineHeight) || 1.4;
    let sectionSpacing = parseFloat(d.sectionSpacing) || 2.0;
    let itemSpacing = parseFloat(d.itemSpacing) || 1.2;
    let pageMargins = parseFloat(d.pageMargins) || 3.0;
    
    const minFontSize = 2.0;
    const minLineHeight = 1.05;
    const minSectionSpacing = 0.3;
    const minItemSpacing = 0.15;
    const minPageMargins = 1.0;
    
    let attempts = 0;
    const maxAttempts = 20;
    
    while (contentHeight > maxHeight && attempts < maxAttempts) {
        let changed = false;
        
        if (sectionSpacing > minSectionSpacing) {
            sectionSpacing = Math.max(minSectionSpacing, sectionSpacing - 0.15);
            changed = true;
        }
        if (itemSpacing > minItemSpacing) {
            itemSpacing = Math.max(minItemSpacing, itemSpacing - 0.1);
            changed = true;
        }
        if (lineHeight > minLineHeight) {
            lineHeight = Math.max(minLineHeight, lineHeight - 0.03);
            changed = true;
        }
        if (fontSize > minFontSize) {
            fontSize = Math.max(minFontSize, fontSize - 0.25);
            changed = true;
        }
        if (pageMargins > minPageMargins) {
            pageMargins = Math.max(minPageMargins, pageMargins - 0.1);
            changed = true;
        }
        
        if (!changed) break;
        
        doc.documentElement.style.setProperty('--theme-font-size', `${fontSize}pt`);
        doc.documentElement.style.setProperty('--theme-line-height', lineHeight);
        doc.documentElement.style.setProperty('--theme-section-spacing', `${sectionSpacing}em`);
        doc.documentElement.style.setProperty('--theme-item-spacing', `${itemSpacing}em`);
        doc.documentElement.style.setProperty('--theme-page-margins', `${pageMargins}em`);
        
        contentHeight = contentEl.offsetHeight;
        attempts++;
    }
    
    return {
        fontSize,
        lineHeight,
        sectionSpacing,
        itemSpacing,
        pageMargins
    };
}

// Adjust live preview layout sizes, auto-fit, and scaling factor
function adjustPreviewLayout(iframe, scaleWrapper, scrollWrapper, iframeDoc) {
    if (!cvData.design) return;
    
    const d = cvData.design;
    const pageSize = d.pageSize || 'letter';
    const pageWidth = pageSize === 'letter' ? 816 : 794;
    // Subtract 15mm bottom print margin (approx 57px) to align layout height with browser page-breaks
    const pageHeight = pageSize === 'letter' ? (1056 - 57) : (1123 - 57);
    const cvPreview = iframeDoc.getElementById('cv-preview');
    
    if (!cvPreview) return;
    
    const controlsCard = document.querySelector('.design-controls-card');
    const autoFitBanner = document.getElementById('design-autofit-banner');
    
    // Step 1: Auto-Fit Algorithm
    if (d.pageFit === '1' || d.pageFit === '2') {
        // Show banner and disable sliders
        autoFitBanner.classList.remove('hidden');
        controlsCard.classList.add('auto-fit-active');
        document.querySelectorAll('.design-controls-card input[type="range"]').forEach(el => el.disabled = true);
        document.getElementById('design-font').disabled = true;
        
        const targetPages = parseInt(d.pageFit);
        const fit = runAutoFitSolver(iframeDoc, cvPreview, targetPages, pageHeight);
        
        // Show auto-adjusted values in UI labels
        document.getElementById('val-font-size').innerText = `${fit.fontSize.toFixed(1)}pt (Auto)`;
        document.getElementById('val-line-height').innerText = `${fit.lineHeight.toFixed(2)} (Auto)`;
        document.getElementById('val-section-spacing').innerText = `${fit.sectionSpacing.toFixed(1)}em (Auto)`;
        document.getElementById('val-item-spacing').innerText = `${fit.itemSpacing.toFixed(1)}em (Auto)`;
        document.getElementById('val-page-margins').innerText = `${fit.pageMargins.toFixed(1)}em (Auto)`;
        
        // Move manual inputs to match visually
        document.getElementById('design-font-size').value = fit.fontSize;
        document.getElementById('design-line-height').value = fit.lineHeight;
        document.getElementById('design-section-spacing').value = fit.sectionSpacing;
        document.getElementById('design-item-spacing').value = fit.itemSpacing;
        document.getElementById('design-page-margins').value = fit.pageMargins;
        
        activeDesignSettings = fit;
        
        // Update main document variables so it prints with the auto-fit values
        const mainDocEl = document.documentElement;
        mainDocEl.style.setProperty('--theme-font-size', `${fit.fontSize}pt`);
        mainDocEl.style.setProperty('--theme-line-height', fit.lineHeight);
        mainDocEl.style.setProperty('--theme-section-spacing', `${fit.sectionSpacing}em`);
        mainDocEl.style.setProperty('--theme-item-spacing', `${fit.itemSpacing}em`);
        mainDocEl.style.setProperty('--theme-page-margins', `${fit.pageMargins}em`);
        
        checkDesignWarnings(fit.fontSize, fit.lineHeight, fit.pageMargins, fit.sectionSpacing, fit.itemSpacing);
    } else {
        // Hide banner and enable sliders
        autoFitBanner.classList.add('hidden');
        controlsCard.classList.remove('auto-fit-active');
        document.querySelectorAll('.design-controls-card input[type="range"]').forEach(el => el.disabled = false);
        document.getElementById('design-font').disabled = false;
        
        applyDesignSettings(iframeDoc);
        applyDesignSettings(document);
        
        // Normal label display
        document.getElementById('val-font-size').innerText = `${d.fontSize}pt`;
        document.getElementById('val-line-height').innerText = d.lineHeight;
        document.getElementById('val-section-spacing').innerText = `${parseFloat(d.sectionSpacing).toFixed(1)}em`;
        document.getElementById('val-item-spacing').innerText = `${parseFloat(d.itemSpacing).toFixed(1)}em`;
        document.getElementById('val-page-margins').innerText = `${parseFloat(d.pageMargins).toFixed(1)}em`;
        
        activeDesignSettings = {
            fontSize: parseFloat(d.fontSize) || 10,
            lineHeight: parseFloat(d.lineHeight) || 1.4,
            sectionSpacing: parseFloat(d.sectionSpacing) || 2.0,
            itemSpacing: parseFloat(d.itemSpacing) || 1.2,
            pageMargins: parseFloat(d.pageMargins) || 3.0
        };
        
        checkDesignWarnings(d.fontSize, d.lineHeight, d.pageMargins, d.sectionSpacing, d.itemSpacing);
    }
    
    // Step 2: Scale and resize container
    const containerWidth = scrollWrapper.clientWidth - 48; // padding space
    const scale = Math.min(1, containerWidth / pageWidth);
    
    const contentHeight = cvPreview.offsetHeight;
    const numPages = Math.ceil(contentHeight / pageHeight);
    const totalHeight = Math.max(pageHeight, numPages * pageHeight);
    
    // Set scale Wrapper sizes
    scaleWrapper.style.width = `${pageWidth * scale}px`;
    scaleWrapper.style.height = `${totalHeight * scale}px`;
    
    // Style Iframe
    iframe.style.transform = `scale(${scale})`;
    iframe.style.transformOrigin = 'top left';
    iframe.style.width = `${pageWidth}px`;
    iframe.style.height = `${totalHeight}px`;
    
    // Display scaling indicator
    const zoomEl = document.querySelector('.preview-zoom-info');
    if (zoomEl) {
        zoomEl.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Zoom Auto-fit: ${Math.round(scale * 100)}% | Page size: ${pageSize.toUpperCase()}`;
    }
    
    // Step 3: Draw page-break indicators
    updatePageGuides(iframeDoc, pageHeight, totalHeight);
}

// Draw dynamic visual page breaks in the preview
function updatePageGuides(iframeDoc, pageHeight, totalHeight) {
    // Clean old guides
    iframeDoc.querySelectorAll('.page-break-guide-container').forEach(el => el.remove());
    
    const cvPreview = iframeDoc.getElementById('cv-preview');
    if (!cvPreview) return;
    
    const numPages = Math.round(totalHeight / pageHeight);
    if (numPages <= 1) return;
    
    const container = iframeDoc.createElement('div');
    container.className = 'page-break-guide-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = `${totalHeight}px`;
    container.style.pointerEvents = 'none';
    
    for (let i = 1; i < numPages; i++) {
        const y = i * pageHeight;
        
        const guide = iframeDoc.createElement('div');
        guide.className = 'page-break-guide';
        guide.style.position = 'absolute';
        guide.style.top = `${y}px`;
        guide.style.left = '0';
        guide.style.right = '0';
        guide.style.borderTop = '2px dashed #EF4444'; // Red dashed indicator
        guide.style.height = '0';
        guide.style.zIndex = '9999';
        
        const label = iframeDoc.createElement('span');
        label.innerText = `Page ${i} / Page ${i+1} Break`;
        label.style.position = 'absolute';
        label.style.right = '20px';
        label.style.background = '#EF4444';
        label.style.color = 'white';
        label.style.fontSize = '10px';
        label.style.fontWeight = 'bold';
        label.style.padding = '2px 6px';
        label.style.borderRadius = '4px';
        label.style.transform = 'translateY(-50%)';
        label.style.fontFamily = 'sans-serif';
        
        guide.appendChild(label);
        container.appendChild(guide);
    }
    
    cvPreview.style.position = 'relative';
    cvPreview.appendChild(container);
}

// Bind event listeners for design controls
function setupDesignEventListeners() {
    // Sliders
    document.getElementById('design-font-size').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-font-size').innerText = `${val}pt`;
        updateDesignValue('fontSize', val);
    });
    
    document.getElementById('design-line-height').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-line-height').innerText = val;
        updateDesignValue('lineHeight', val);
    });
    
    document.getElementById('design-section-spacing').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-section-spacing').innerText = `${val.toFixed(1)}rem`;
        updateDesignValue('sectionSpacing', val);
    });
    
    document.getElementById('design-item-spacing').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-item-spacing').innerText = `${val.toFixed(1)}rem`;
        updateDesignValue('itemSpacing', val);
    });
    
    document.getElementById('design-page-margins').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        document.getElementById('val-page-margins').innerText = `${val.toFixed(1)}rem`;
        updateDesignValue('pageMargins', val);
    });
    
    // Color picker
    document.getElementById('design-color').addEventListener('input', (e) => {
        updateDesignValue('themeColor', e.target.value);
    });
    
    // Dropdowns
    document.getElementById('design-font').addEventListener('change', (e) => {
        updateDesignValue('fontFamily', e.target.value);
    });
    
    document.getElementById('design-fit').addEventListener('change', (e) => {
        updateDesignValue('pageFit', e.target.value);
    });
    
    document.getElementById('design-page-size').addEventListener('change', (e) => {
        // Update stylesheet target page media size
        const letterPageStyle = '@page { margin: 0 0 15mm 0; size: letter; }';
        const a4PageStyle = '@page { margin: 0 0 15mm 0; size: A4; }';
        
        // Find or create style tag in main document to set print page size
        let sizeStyleTag = document.getElementById('dynamic-print-size');
        if (!sizeStyleTag) {
            sizeStyleTag = document.createElement('style');
            sizeStyleTag.id = 'dynamic-print-size';
            document.head.appendChild(sizeStyleTag);
        }
        sizeStyleTag.innerHTML = `@media print { ${e.target.value === 'letter' ? letterPageStyle : a4PageStyle} }`;
        
        updateDesignValue('pageSize', e.target.value);
    });
    
    // Export PDF button inside preview panel
    document.getElementById('design-export-pdf-btn').addEventListener('click', () => {
        saveData();
        generatePrintPreview();
        window.print();
    });
    
    // Window Resize auto-scale
    window.addEventListener('resize', () => {
        if (document.getElementById('section-design').classList.contains('active')) {
            triggerPreviewLayoutUpdate();
        }
    });
}

// Update a single design variable and refresh the layout instantly
function updateDesignValue(key, value) {
    if (!cvData.design) cvData.design = { ...defaultDesign };
    cvData.design[key] = value;
    saveData();
    
    const iframe = document.getElementById('design-preview-iframe');
    if (iframe) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        applyDesignSettings(iframeDoc);
    }
    applyDesignSettings(document);
    triggerPreviewLayoutUpdate();
}

// Display print safety warnings if layout spacing is set too small
function checkDesignWarnings(fontSize, lineHeight, pageMargins, sectionSpacing, itemSpacing) {
    const warningBanner = document.getElementById('design-warning-banner');
    if (!warningBanner) return;
    
    let warnings = [];
    const lang = document.getElementById('settings-language').value || 'en';
    
    if (fontSize < 8.5) {
        warnings.push(lang === 'he' 
            ? `גודל גופן קטן מ-8.5pt (${fontSize.toFixed(1)}pt) עלול להיות קשה לקריאה בהדפסה.` 
            : `Font size below 8.5pt (${fontSize.toFixed(1)}pt) may be hard to read when printed.`);
    }
    if (lineHeight < 1.2) {
        warnings.push(lang === 'he' 
            ? `מרווח שורות צפוף מ-1.2 (${lineHeight.toFixed(2)}) עלול לגרום לטקסט לעלות זה על זה.` 
            : `Line height below 1.2 (${lineHeight.toFixed(2)}) may make text overlap.`);
    }
    if (pageMargins < 1.8) {
        warnings.push(lang === 'he' 
            ? `שולי דף קטנים מ-1.8em (${pageMargins.toFixed(1)}em) עלולים להיחתך על ידי מדפסות סטנדרטיות.` 
            : `Page margins below 1.8em (${pageMargins.toFixed(1)}em) may be clipped by standard printers.`);
    }
    if (sectionSpacing < 0.8 || itemSpacing < 0.6) {
        warnings.push(lang === 'he' 
            ? `מרווחי פסקאות קטנים במיוחד עלולים להקשות על קריאת המבנה הכללי.` 
            : `Very small spacing between sections/items may make document structure unreadable.`);
    }
    
    if (warnings.length > 0) {
        warningBanner.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation" style="margin-top: 0.15rem;"></i>
            <div>
                <strong>${lang === 'he' ? 'אזהרת הדפסה:' : 'Print Warning:'}</strong>
                <ul style="margin: 0.25rem 0 0 0; padding: 0 1.25rem; list-style-type: disc;">
                    ${warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            </div>
        `;
        warningBanner.classList.remove('hidden');
    } else {
        warningBanner.classList.add('hidden');
    }
}





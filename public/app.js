// AMR Flashcard App - Client-side Logic
class AMRFlashcardApp {
    constructor() {
        this.cards = [];
        this.currentCardIndex = 0;
        this.isFlipped = false;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.studyOrder = []; // Shuffled order for study
        this.importedFile = null;
        
        // AMR Constants
        this.DEFAULT_STRENGTH = 1.0;
        this.RETENTION_TARGET = 0.85;
        this.MIN_INTERVAL_DAYS = 0.5;
        this.BOX_COUNT = 5;
        this.QUALITY_MULTIPLIER = {
            5: 1.30, 4: 1.15, 3: 1.05,
            2: 0.85, 1: 0.6, 0: 0.45
        };
        
        this.init();
    }

    init() {
        this.loadCards();
        this.loadTheme();
        this.setupEventListeners();
        this.updateStats();
        this.renderCurrentCard();
    }

    setupEventListeners() {
        document.getElementById('addCardBtn').addEventListener('click', () => this.openModal('addCardModal'));
        document.getElementById('addCardForm').addEventListener('submit', (e) => this.handleAddCard(e));
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('importBtn').addEventListener('click', () => this.openModal('importModal'));
        document.getElementById('exportBtn').addEventListener('click', () => this.exportCards());
        document.getElementById('shuffleBtn').addEventListener('click', () => this.shuffleCards());
        
        // File input
        const fileInput = document.getElementById('fileInput');
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Touch events for swipe
        const studyArea = document.getElementById('studyArea');
        studyArea.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        studyArea.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        studyArea.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }

    // Local Storage Management
    saveCards() {
        localStorage.setItem('amr_flashcards', JSON.stringify(this.cards));
    }

    loadCards() {
        const saved = localStorage.getItem('amr_flashcards');
        this.cards = saved ? JSON.parse(saved) : [];
    }

    loadTheme() {
        const theme = localStorage.getItem('amr_theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('amr_theme', newTheme);
        this.updateThemeIcon(newTheme);
    }

    updateThemeIcon(theme) {
        document.getElementById('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    // Card Management
    createCard(front, back) {
        const card = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            front,
            back,
            strength: this.DEFAULT_STRENGTH,
            box: 1,
            lastReview: null,
            nextReview: null,
            history: []
        };
        return card;
    }

    handleAddCard(e) {
        e.preventDefault();
        const front = document.getElementById('frontInput').value.trim();
        const back = document.getElementById('backInput').value.trim();
        
        if (front && back) {
            const card = this.createCard(front, back);
            this.cards.push(card);
            this.saveCards();
            this.updateStats();
            this.closeModal('addCardModal');
            document.getElementById('addCardForm').reset();
            
            if (this.cards.length === 1) {
                this.renderCurrentCard();
            }
            
            this.showAlert('Card added successfully!', 'success');
        }
    }

    // Import/Export Functions
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.importedFile = file;
            document.getElementById('fileName').textContent = `Selected: ${file.name}`;
        }
    }

    async processImport() {
        if (!this.importedFile) {
            this.showAlert('Please select a file first', 'error');
            return;
        }

        const file = this.importedFile;
        const fileName = file.name.toLowerCase();
        
        try {
            const text = await file.text();
            let parsedData = [];

            if (fileName.endsWith('.json')) {
                parsedData = this.parseJSON(text);
            } else if (fileName.endsWith('.csv')) {
                parsedData = this.parseCSV(text);
            } else if (fileName.endsWith('.py')) {
                parsedData = this.parsePython(text);
            } else {
                throw new Error('Unsupported file format');
            }

            if (parsedData.length === 0) {
                throw new Error('No valid data found in file');
            }

            // Convert parsed data to cards
            let importCount = 0;
            parsedData.forEach(item => {
                const front = this.buildFront(item);
                const back = this.buildBack(item);
                
                if (front && back) {
                    const card = this.createCard(front, back);
                    this.cards.push(card);
                    importCount++;
                }
            });

            this.saveCards();
            this.updateStats();
            this.renderCurrentCard();
            this.closeModal('importModal');
            
            this.showAlert(`Successfully imported ${importCount} cards!`, 'success');
            
            // Reset file input
            document.getElementById('fileInput').value = '';
            document.getElementById('fileName').textContent = '';
            this.importedFile = null;

        } catch (error) {
            console.error('Import error:', error);
            this.showAlert(`Import failed: ${error.message}`, 'error');
        }
    }

    parseJSON(text) {
        try {
            const data = JSON.parse(text);
            return Array.isArray(data) ? data : [data];
        } catch (e) {
            throw new Error('Invalid JSON format');
        }
    }

    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) throw new Error('CSV must have headers and data');
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
        
        return data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result.map(v => v.replace(/^"|"$/g, ''));
    }

    parsePython(text) {
        // Extract JSON-like structures from Python files
        const data = [];
        
        // Try to find list/dict assignments
        const patterns = [
            /=\s*\[([\s\S]*?)\]/g,  // list assignment
            /=\s*\{([\s\S]*?)\}/g   // dict assignment
        ];
        
        for (const pattern of patterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                try {
                    // Convert Python syntax to JSON
                    let jsonStr = match[1] || match[0];
                    jsonStr = jsonStr
                        .replace(/'/g, '"')
                        .replace(/True/g, 'true')
                        .replace(/False/g, 'false')
                        .replace(/None/g, 'null');
                    
                    // Try to parse as array of objects
                    const parsed = JSON.parse('[' + jsonStr + ']');
                    if (Array.isArray(parsed)) {
                        data.push(...parsed.filter(item => typeof item === 'object'));
                    }
                } catch (e) {
                    // Continue to next pattern
                }
            }
        }
        
        if (data.length === 0) {
            throw new Error('Could not extract data from Python file');
        }
        
        return data;
    }

    buildFront(item) {
        // Build front of card from various formats
        if (item.word) {
            const pos = item.part_of_speech || item.pos || '';
            return pos ? `${item.word} (${pos})` : item.word;
        }
        if (item.question) return item.question;
        if (item.term) return item.term;
        if (item.front) return item.front;
        return '';
    }

    buildBack(item) {
        // Build back of card from various formats
        const parts = [];
        
        if (item.meaning || item.definition) {
            parts.push(item.meaning || item.definition);
        }
        
        if (item.example) {
            parts.push(`\nExample: ${item.example}`);
        }
        
        if (item.answer) return item.answer;
        if (item.back) return item.back;
        
        return parts.join('\n').trim();
    }

    exportCards() {
        if (this.cards.length === 0) {
            this.showAlert('No cards to export)
                           return;
        }

        const dataStr = JSON.stringify(this.cards, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `amr_flashcards_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showAlert('Cards exported successfully!', 'success');
    }

    shuffleCards() {
        const dueCards = this.getDueCards();
        if (dueCards.length === 0) {
            this.showAlert('No cards available to shuffle', 'error');
            return;
        }

        // Fisher-Yates shuffle for study order (doesn't affect due dates)
        this.studyOrder = [...Array(dueCards.length).keys()];
        for (let i = this.studyOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.studyOrder[i], this.studyOrder[j]] = [this.studyOrder[j], this.studyOrder[i]];
        }
        
        this.currentCardIndex = 0;
        this.renderCurrentCard();
        this.showAlert('Cards shuffled! Order randomized for this session.', 'success');
    }

    // AMR Algorithm Implementation
    calculateRetention(card) {
        if (!card.lastReview) return 0.0;
        const lastReviewDate = new Date(card.lastReview);
        const now = new Date();
        const tDays = (now - lastReviewDate) / (1000 * 60 * 60 * 24);
        return Math.exp(-tDays / Math.max(1e-6, card.strength));
    }

    scheduleNextReview(strength, now = new Date()) {
        const tDays = -strength * Math.log(this.RETENTION_TARGET);
        const finalDays = Math.max(tDays, this.MIN_INTERVAL_DAYS);
        const nextDate = new Date(now.getTime() + finalDays * 24 * 60 * 60 * 1000);
        return nextDate.toISOString();
    }

    updateCardOnReview(card, quality) {
        const now = new Date();
        
        const historyEntry = {
            time: now.toISOString(),
            quality,
            oldStrength: card.strength,
            oldBox: card.box
        };

        const mult = this.QUALITY_MULTIPLIER[quality] || 1.0;
        let newStrength = Math.max(0.1, card.strength * mult);
        
        if (quality === 5) {
            newStrength += 0.2;
        }

        let newBox = card.box;
        if (quality >= 4) {
            newBox = Math.min(this.BOX_COUNT, card.box + 1);
        } else if (quality <= 2) {
            newBox = 1;
        }

        card.strength = newStrength;
        card.box = newBox;
        card.lastReview = now.toISOString();
        card.nextReview = this.scheduleNextReview(newStrength, now);

        historyEntry.newStrength = newStrength;
        historyEntry.newBox = newBox;
        historyEntry.nextReview = card.nextReview;
        
        card.history.push(historyEntry);
    }

    getDueCards() {
        const now = new Date();
        return this.cards.filter(card => {
            if (!card.nextReview) return true;
            return new Date(card.nextReview) <= now;
        });
    }

    // UI Rendering
    renderCurrentCard() {
        const studyArea = document.getElementById('studyArea');
        
        if (this.cards.length === 0) {
            studyArea.innerHTML = `
                <div class="empty-state">
                    <h2>No flashcards yet</h2>
                    <p>Click "Add Card" or "Import" to get started</p>
                </div>
            `;
            return;
        }

        const dueCards = this.getDueCards();
        if (dueCards.length === 0) {
            studyArea.innerHTML = `
                <div class="empty-state">
                    <h2>🎉 All caught up!</h2>
                    <p>No cards due for review right now</p>
                    <p style="margin-top: 20px; font-size: 14px; color: var(--text-secondary);">
                        Come back later or add more cards
                    </p>
                </div>
            `;
            return;
        }

        // Use shuffled order if available, otherwise sequential
        const displayIndex = this.studyOrder.length > 0 
            ? this.studyOrder[this.currentCardIndex % this.studyOrder.length]
            : this.currentCardIndex % dueCards.length;
            
        const card = dueCards[displayIndex];
        const retention = this.calculateRetention(card);
        
        studyArea.innerHTML = `
            <div class="flashcard-container">
                <div class="flashcard" id="flashcard" onclick="app.flipCard()">
                    <div class="card-face">
                        <div class="card-label">Question</div>
                        <div class="card-content">${this.escapeHtml(card.front)}</div>
                    </div>
                    <div class="card-face card-back">
                        <div class="card-label">Answer</div>
                        <div class="card-content">${this.escapeHtml(card.back).replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            </div>
            
            <div class="review-actions">
                <button class="review-btn btn-wrong" onclick="app.reviewCard(1)">
                    ❌ Wrong
                </button>
                <button class="review-btn btn-correct" onclick="app.reviewCard(4)">
                    ✓ Correct
                </button>
            </div>

            <div class="quality-buttons">
                <button class="quality-btn" onclick="app.reviewCard(0)">0 - Complete blackout</button>
                <button class="quality-btn" onclick="app.reviewCard(1)">1 - Wrong, but familiar</button>
                <button class="quality-btn" onclick="app.reviewCard(2)">2 - Wrong, close</button>
                <button class="quality-btn" onclick="app.reviewCard(3)">3 - Correct, hard</button>
                <button class="quality-btn" onclick="app.reviewCard(4)">4 - Correct, good</button>
                <button class="quality-btn" onclick="app.reviewCard(5)">5 - Perfect recall</button>
            </div>

            <div class="card-info">
                Box: ${card.box}/${this.BOX_COUNT} | 
                Strength: ${card.strength.toFixed(2)} days | 
                Retention: ${(retention * 100).toFixed(1)}%
                <br>
                Card ${(this.currentCardIndex % dueCards.length) + 1} of ${dueCards.length} due
                ${this.studyOrder.length > 0 ? ' (shuffled)' : ''}
            </div>
        `;
        
        this.isFlipped = false;
    }

    flipCard() {
        const flashcard = document.getElementById('flashcard');
        if (flashcard) {
            this.isFlipped = !this.isFlipped;
            flashcard.classList.toggle('flipped');
        }
    }

    reviewCard(quality) {
        const dueCards = this.getDueCards();
        if (dueCards.length === 0) return;
        
        const displayIndex = this.studyOrder.length > 0 
            ? this.studyOrder[this.currentCardIndex % this.studyOrder.length]
            : this.currentCardIndex % dueCards.length;
            
        const card = dueCards[displayIndex];
        this.updateCardOnReview(card, quality);
        this.saveCards();
        
        this.currentCardIndex++;
        
        // Reset shuffle if we've gone through all cards
        if (this.studyOrder.length > 0 && this.currentCardIndex >= this.studyOrder.length) {
            this.studyOrder = [];
            this.currentCardIndex = 0;
        }
        
        this.updateStats();
        this.renderCurrentCard();
    }

    // Touch Handlers
    handleTouchStart(e) {
        this.touchStartX = e.changedTouches[0].screenX;
    }

    handleTouchMove(e) {
        this.touchEndX = e.changedTouches[0].screenX;
    }

    handleTouchEnd(e) {
        const swipeThreshold = 100;
        const diff = this.touchStartX - this.touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                this.reviewCard(1);
            } else {
                this.reviewCard(4);
            }
        }
    }

    // Stats
    updateStats() {
        const total = this.cards.length;
        const due = this.getDueCards().length;
        const mastered = this.cards.filter(c => c.box === this.BOX_COUNT).length;
        const learning = this.cards.filter(c => c.box < this.BOX_COUNT && c.lastReview).length;
        
        document.getElementById('totalCards').textContent = total;
        document.getElementById('dueCards').textContent = due;
        document.getElementById('masteredCards').textContent = mastered;
        document.getElementById('learningCards').textContent = learning;
    }

    // Modal & Alerts
    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        if (modalId === 'addCardModal') {
            document.getElementById('frontInput').focus();
        }
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    showAlert(message, type = 'success') {
        const container = document.getElementById('alertContainer');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        
        container.innerHTML = '';
        container.appendChild(alert);
        
        setTimeout(() => {
            alert.style.transition = 'opacity 0.3s';
            alert.style.opacity = '0';
            setTimeout(() => container.removeChild(alert), 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for inline handlers
function closeModal(modalId) {
    app.closeModal(modalId);
}

function processImport() {
    app.processImport();
}

// Initialize app
const app = new AMRFlashcardApp();

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

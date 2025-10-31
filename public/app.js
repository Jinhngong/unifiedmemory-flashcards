class FlashcardApp {
  constructor() {
    this.cards = JSON.parse(localStorage.getItem("flashcards")) || [];
    this.currentIndex = 0;
    this.theme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", this.theme);
    this.setupEventListeners();
    this.updateStats();
    this.renderStudyCard();
  }

  setupEventListeners() {
    const addCardBtn = document.getElementById("addCardBtn");
    const addCardForm = document.getElementById("addCardForm");
    const themeToggle = document.getElementById("themeToggle");
    const importBtn = document.getElementById("importBtn");
    const exportBtn = document.getElementById("exportBtn");
    const shuffleBtn = document.getElementById("shuffleBtn");
    const resetBtn = document.getElementById("resetBtn");

    if (!addCardBtn || !addCardForm) return; // safety guard

    addCardBtn.addEventListener("click", () => this.openModal("addCardModal"));
    addCardForm.addEventListener("submit", (e) => this.addCard(e));
    themeToggle.addEventListener("click", () => this.toggleTheme());
    importBtn.addEventListener("click", () => this.openModal("importModal"));
    exportBtn.addEventListener("click", () => this.exportCards());
    shuffleBtn.addEventListener("click", () => this.shuffleCards());

    // ✅ RESET APP FEATURE
    resetBtn?.addEventListener("click", () => {
      if (confirm("This will delete ALL flashcards and settings. Continue?")) {
        localStorage.clear();
        alert("All local data cleared! Reloading...");
        location.reload();
      }
    });
  }

  addCard(e) {
    e.preventDefault();
    const front = document.getElementById("frontInput").value.trim();
    const back = document.getElementById("backInput").value.trim();
    if (!front || !back) return this.showAlert("Please fill both sides", "error");

    this.cards.push({ front, back, level: 0 });
    localStorage.setItem("flashcards", JSON.stringify(this.cards));
    this.closeModal("addCardModal");
    e.target.reset();
    this.showAlert("Card added!", "success");
    this.updateStats();
    this.renderStudyCard();
  }

  shuffleCards() {
    if (this.cards.length === 0) return this.showAlert("No cards to shuffle", "error");
    this.cards.sort(() => Math.random() - 0.5);
    localStorage.setItem("flashcards", JSON.stringify(this.cards));
    this.currentIndex = 0;
    this.renderStudyCard();
    this.showAlert("Cards shuffled!", "success");
  }

  exportCards() {
    const cards = this.cards;
    if (cards.length === 0) return this.showAlert("No cards to export", "error");

    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flashcards.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  toggleTheme() {
    this.theme = this.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", this.theme);
    localStorage.setItem("theme", this.theme);
  }

  renderStudyCard() {
    const area = document.getElementById("studyArea");
    if (this.cards.length === 0) {
      area.innerHTML = `<div class="empty-state"><h2>No cards yet</h2><p>Add or import cards to start studying!</p></div>`;
      return;
    }

    const card = this.cards[this.currentIndex];
    area.innerHTML = `
      <div class="flashcard-container">
        <div class="flashcard" id="flashcard">
          <div class="card-face card-front"><div class="card-content">${card.front}</div></div>
          <div class="card-face card-back"><div class="card-content">${card.back}</div></div>
        </div>
      </div>
      <div class="review-actions">
        <button class="review-btn btn-wrong" id="wrongBtn">Forgot</button>
        <button class="review-btn btn-correct" id="correctBtn">Know</button>
      </div>
    `;

    const flashcard = document.getElementById("flashcard");
    flashcard.addEventListener("click", () => flashcard.classList.toggle("flipped"));

    document.getElementById("wrongBtn").addEventListener("click", () => this.nextCard(false));
    document.getElementById("correctBtn").addEventListener("click", () => this.nextCard(true));
  }

  nextCard(correct) {
    const card = this.cards[this.currentIndex];
    card.level = correct ? Math.min((card.level || 0) + 1, 5) : 0;

    localStorage.setItem("flashcards", JSON.stringify(this.cards));
    this.currentIndex = (this.currentIndex + 1) % this.cards.length;
    this.renderStudyCard();
    this.updateStats();
  }

  updateStats() {
    document.getElementById("totalCards").textContent = this.cards.length;
    document.getElementById("masteredCards").textContent = this.cards.filter((c) => c.level >= 3).length;
    document.getElementById("learningCards").textContent = this.cards.filter((c) => c.level < 3).length;
    document.getElementById("dueCards").textContent = this.cards.length;
  }

  showAlert(message, type = "success") {
    const container = document.getElementById("alertContainer");
    const div = document.createElement("div");
    div.className = `alert alert-${type}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => div.remove(), 2500);
  }

  openModal(id) {
    document.getElementById(id).classList.add("active");
  }

  closeModal(id) {
    document.getElementById(id).classList.remove("active");
  }

  // ✅ IMPROVED IMPORT HANDLER
  async processImport() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files?.[0];
    if (!file) return alert("Please select a file first!");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        let importedCards = [];

        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(content);
          importedCards = parsed.map(c => ({
            front: c.front ?? c.question ?? c.prompt ?? "",
            back: c.back ?? c.answer ?? c.response ?? ""
          }));
        } else if (file.name.endsWith(".csv")) {
          const rows = content.split("\n").map(r => r.trim()).filter(r => r);
          for (const row of rows) {
            const [front, back] = row.split(",").map(s => s.trim());
            if (front && back) importedCards.push({ front, back, level: 0 });
          }
        } else if (file.name.endsWith(".py")) {
          const matches = content.match(/\{[^}]+\}/g);
          if (matches) {
            for (const m of matches) {
              try {
                const obj = JSON.parse(m.replace(/'/g, '"'));
                if (obj.front && obj.back) importedCards.push({ ...obj, level: 0 });
              } catch {}
            }
          }
        } else {
          alert("Unsupported file format. Use .json, .csv, or .py");
          return;
        }

        if (importedCards.length === 0) {
          alert("No valid flashcards found in file.");
          return;
        }

        const merged = [...this.cards, ...importedCards];
        this.cards = merged;
        localStorage.setItem("flashcards", JSON.stringify(merged));
        alert(`Imported ${importedCards.length} cards successfully!`);
        location.reload();

      } catch (err) {
        console.error(err);
        alert("Error reading file.");
      }
    };

    reader.readAsText(file);
  }
}

document.addEventListener("DOMContentLoaded", () => new FlashcardApp());

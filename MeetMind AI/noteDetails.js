document.addEventListener("DOMContentLoaded", async () => {
  // Gemini API yapılandırması
  const GEMINI_API_KEY = "AIzaSyBeK7EkbynttwoBCevcC1QQTWMx9zHUIv8";

  // Agent sınıfları
  class BaseAgent {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }

    async callGemini(prompt) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt,
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            `API yanıt hatası: ${response.status} - ${
              errorData.error?.message || "Bilinmeyen hata"
            }`
          );
        }

        const data = await response.json();

        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          console.error("API yanıtı:", data);
          throw new Error("Beklenmeyen API yanıt yapısı");
        }

        return data.candidates[0].content.parts[0].text;
      } catch (error) {
        console.error("Gemini API çağrısı hatası:", error);
        throw new Error(`Gemini API hatası: ${error.message}`);
      }
    }
  }

  // ... (Diğer agent sınıfları aynı kalıyor) ...

  class AnalyzerAgent extends BaseAgent {
    async analyze(content) {
      const prompt = `Lütfen bu toplantı notlarını analiz et ve önemli noktaları çıkar: ${content}`;
      return await this.callGemini(prompt);
    }
  }

  class SummarizerAgent extends BaseAgent {
    async summarize(content) {
      const prompt = `Bu toplantı notlarının kısa bir özetini çıkar: ${content}`;
      return await this.callGemini(prompt);
    }
  }

  class TaskAnalyzerAgent extends BaseAgent {
    async analyzeTasks(content) {
      const prompt = `Bu toplantı notlarındaki görevleri ve sorumlulukları listele: ${content}`;
      return await this.callGemini(prompt);
    }
  }

  class DialogueAnalyzerAgent extends BaseAgent {
    async analyzeDialogue(content) {
      const prompt = `Bu toplantıdaki konuşmaları analiz et ve önemli etkileşimleri belirle: ${content}`;
      return await this.callGemini(prompt);
    }
  }

  // AgentCrew sınıfı
  class AgentCrew {
    constructor(apiKey) {
      this.analyzer = new AnalyzerAgent(apiKey);
      this.summarizer = new SummarizerAgent(apiKey);
      this.taskAnalyzer = new TaskAnalyzerAgent(apiKey);
      this.dialogueAnalyzer = new DialogueAnalyzerAgent(apiKey);
    }

    async runAllAnalyses(content) {
      try {
        // Her bir agent'ı sırayla çalıştır (hata yönetimi için)
        const analysis = await this.analyzer.analyze(content);
        const summary = await this.summarizer.summarize(content);
        const tasks = await this.taskAnalyzer.analyzeTasks(content);
        const dialogue = await this.dialogueAnalyzer.analyzeDialogue(content);

        return {
          analysis,
          summary,
          tasks,
          dialogue,
        };
      } catch (error) {
        console.error("Analizler sırasında hata:", error);
        throw error;
      }
    }
  }

  // Event listener ve UI kodu
  try {
    const result = await chrome.storage.local.get(["currentMeeting"]);
    const contentDiv = document.getElementById("content");

    if (result.currentMeeting?.content) {
      contentDiv.textContent = result.currentMeeting.content;

      const dateStr = new Date(result.currentMeeting.timestamp).toLocaleString(
        "tr-TR"
      );
      const dateDiv = document.createElement("div");
      dateDiv.style.marginBottom = "10px";
      dateDiv.innerHTML = `**Tarih:** ${dateStr}`;
      contentDiv.insertBefore(dateDiv, contentDiv.firstChild);

      document.getElementById("summarizeBtn").disabled = false;
    } else {
      contentDiv.innerHTML = `Not bulunamadı veya içerik boş.`;
      document.getElementById("summarizeBtn").disabled = true;
    }
  } catch (error) {
    console.error("Veri yükleme hatası:", error);
    document.getElementById(
      "content"
    ).innerHTML = `Veri yüklenirken bir hata oluştu: ${error.message}`;
  }

  const summarizeBtn = document.getElementById("summarizeBtn");
  summarizeBtn.addEventListener("click", async () => {
    const content = document.getElementById("content").textContent;
    if (!content || content.includes("Not bulunamadı")) {
      document.getElementById("summary").innerHTML =
        "Özetlenecek içerik bulunamadı.";
      return;
    }

    summarizeBtn.disabled = true;
    summarizeBtn.textContent = "Analiz ediliyor...";
    const summaryDiv = document.getElementById("summary");

    try {
      summaryDiv.innerHTML = `<div class="p-4">
        <p>Analizler yapılıyor, lütfen bekleyin...</p>
        <progress class="w-full"></progress>
      </div>`;

      const crew = new AgentCrew(GEMINI_API_KEY);
      const results = await crew.runAllAnalyses(content);

      summaryDiv.innerHTML = `
        <div class="analysis-section">
          <h3>Genel Analiz</h3>
          <p>${results.analysis}</p>
        </div>
        <div class="analysis-section">
          <h3>Özet</h3>
          <p>${results.summary}</p>
        </div>
        <div class="analysis-section">
          <h3>Görevler ve Sorumluluklar</h3>
          <p>${results.tasks}</p>
        </div>
        <div class="analysis-section">
          <h3>Konuşma Analizi</h3>
          <p>${results.dialogue}</p>
        </div>
      `;
    } catch (error) {
      summaryDiv.innerHTML = `<div class="error-message p-4">
        Analiz sırasında bir hata oluştu: ${error.message}
      </div>`;
    } finally {
      summarizeBtn.disabled = false;
      summarizeBtn.textContent = "Analiz Et";
    }
  });
});

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode");
  const manualModeRadio = document.querySelector("#manual-mode");
  const summarizeTranscriptBtn = document.querySelector(
    "#summarize-transcript"
  );
  const summaryContainer = document.querySelector("#summary-container");
  const summaryContent = document.querySelector("#summary-content");
  const loadingIndicator = document.querySelector("#loading-indicator");
  const transcriptListContainer = document.querySelector("#transcript-list");
  const errorLogsContainer = document.querySelector("#error-logs");
  const tabButtons = document.querySelectorAll(".tab-button");

  document.querySelector("#version").innerHTML = `v${chrome.runtime.getManifest().version
    }`;

  // Tab switching functionality
  tabButtons.forEach((button) => {
    button.addEventListener("click", function () {
      // Remove active class from all buttons and tabs
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((tab) => tab.classList.remove("active"));

      // Add active class to clicked button
      this.classList.add("active");

      // Show corresponding tab content
      const tabId = "tab-" + this.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");

      // If history tab is clicked, load meeting history
      if (this.getAttribute("data-tab") === "history") {
        loadTranscripts();
      }

      // If logs tab is clicked, load error logs
      if (this.getAttribute("data-tab") === "logs") {
        loadErrorLogs();
      }
    });
  });

  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined) autoModeRadio.checked = true;
    else if (result.operationMode == "auto") autoModeRadio.checked = true;
    else if (result.operationMode == "manual") manualModeRadio.checked = true;
  });

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { });
  });
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { });
  });

  // Check if there's already a summary available and display it
  chrome.storage.local.get(["meetingSummary"], function (result) {
    if (result.meetingSummary) {
      summaryContainer.style.display = "block";
      summaryContent.textContent = result.meetingSummary;
    }
  });

  // Add event listener for summarize transcript button
  summarizeTranscriptBtn.addEventListener("click", () => {
    chrome.storage.local.get(["currentTranscriptId"], function (result) {
      if (result.currentTranscriptId) {
        // Show loading indicator
        loadingIndicator.style.display = "inline-block";
        summarizeTranscriptBtn.disabled = true;
        summarizeTranscriptBtn.textContent = "Özet oluşturuluyor...";

        // Kullanıcıya bilgilendirme mesajı göster
        summaryContainer.style.display = "block";
        summaryContent.innerHTML = `<div class="agent-summary">
          <p><strong>Toplantı özeti oluşturuluyor...</strong></p>
          <p>Bu işlem, toplantının uzunluğuna bağlı olarak birkaç dakika sürebilir.</p>
          <p>Lütfen bekleyin, yapay zeka toplantınızı analiz ediyor.</p>
        </div>`;

        // Switch to current tab to show loading
        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "current") {
            btn.click();
          }
        });

        // Send message to background script to summarize the transcript
        chrome.runtime.sendMessage(
          {
            type: "summarize_transcript",
            meetingId: result.currentTranscriptId,
          },
          function (response) {
            if (response && response.status === "error") {
              alert(response.message || "Toplantı özeti oluşturulamadı.");
              loadingIndicator.style.display = "none";
              summarizeTranscriptBtn.disabled = false;
              summarizeTranscriptBtn.textContent = "Toplantıyı Özetle";
            }
            // If successful, we'll wait for the summary_ready message
          }
        );
      } else {
        alert(
          "Özetlenecek toplantı seçilmedi. Lütfen önce toplantılar sekmesinden bir toplantı seçin."
        );
      }
    });
  });

  // Listen for message from background script that summary is ready
  chrome.runtime.onMessage.addListener(function (
    message,
    sender,
    sendResponse
  ) {
    if (message.type === "summary_ready") {
      // Hide loading indicator
      loadingIndicator.style.display = "none";
      summarizeTranscriptBtn.disabled = false;
      summarizeTranscriptBtn.textContent = "Toplantıyı Özetle";

      // Display the summary for the meeting ID
      displaySummary(message.meetingId);
    } else if (message.type === "summarization_error") {
      // Hide loading indicator
      loadingIndicator.style.display = "none";
      summarizeTranscriptBtn.disabled = false;
      summarizeTranscriptBtn.textContent = "Toplantıyı Özetle";

      // Show error message
      summaryContainer.style.display = "block";
      summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 0, 0, 0.1);">
        <strong>Hata:</strong> Özet oluşturulurken bir sorun oluştu. ${message.message || ""
        }
        <p>Lütfen daha sonra tekrar deneyin veya hata kayıtları sekmesinden detayları kontrol edin.</p>
      </div>`;

      // Switch to current tab to show the error
      tabButtons.forEach((btn) => {
        if (btn.getAttribute("data-tab") === "current") {
          btn.click();
        }
      });

      // Log to console
      console.error("Summarization error:", message.message);
    }
  });

  // Function to display a summary
  function displaySummary(meetingId) {
    const summaryId = `summary_${meetingId}`;

    chrome.storage.local.get([summaryId], function (result) {
      if (result[summaryId] && result[summaryId].summary) {
        const summaryData = result[summaryId];
        const summary = summaryData.summary;

        summaryContainer.style.display = "block";

        // Çoklu ajan formatında özeti görüntüle
        let summaryHTML = "";

        // Toplantı başlığını ve tarihini ekle
        summaryHTML += `<div style="margin-bottom: 1rem;">
                          <h2 style="margin-bottom: 0.5rem;">${summaryData.title
          }</h2>
                          <p style="font-size: 0.9rem; opacity: 0.8;">${new Date(
            summaryData.date
          ).toLocaleString()}</p>
                        </div>`;

        // Genel Özet
        summaryHTML += `<h3>Genel Özet</h3>
                        <div class="agent-summary">${formatContent(
          summary.general_summary
        )}</div>`;

        // Tarihler ve Etkinlikler
        summaryHTML += `<h3>Tarihler ve Etkinlikler</h3>
                        <div class="agent-summary">${formatContent(
          summary.date_events
        )}</div>`;

        // Önemli Konular
        summaryHTML += `<h3>Önemli Konular</h3>
                        <div class="agent-summary">${formatContent(
          summary.key_topics
        )}</div>`;

        // Görevler
        summaryHTML += `<h3>Görevler ve Sorumlular</h3>
                        <div class="agent-summary">${formatContent(
          summary.tasks
        )}</div>`;

        summaryContent.innerHTML = summaryHTML;

        // Switch to current tab to show the summary
        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "current") {
            btn.click();
          }
        });
      } else {
        summaryContainer.style.display = "block";
        summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 140, 0, 0.1);">
          <strong>Uyarı:</strong> Özet bulunamadı. Lütfen tekrar deneyin veya hata kayıtları sekmesini kontrol edin.
        </div>`;
      }
    });
  }

  // Format content to add links to URLs and handle API errors
  function formatContent(content) {
    if (!content) return "<em>Bilgi yok</em>";

    // API yanıtı alınamadı hata mesajlarını işle
    if (
      content.startsWith("API yanıtı alınamadı") ||
      content.startsWith("API hatası:")
    ) {
      return `<div style="color: #ff6b6b; padding: 10px; background-color: rgba(255, 0, 0, 0.05); border-radius: 4px;">
                <strong>⚠️ ${content}</strong>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">Lütfen daha sonra tekrar deneyin veya API anahtarınızı kontrol edin.</p>
              </div>`;
    }

    // Beklenmeyen API yanıtı hata mesajlarını işle
    if (content === "Beklenmeyen API yanıtı.") {
      return `<div style="color: #ff9e57; padding: 10px; background-color: rgba(255, 160, 0, 0.05); border-radius: 4px;">
                <strong>⚠️ Beklenmeyen API yanıtı</strong>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">Gemini API'den beklenmeyen bir yanıt alındı. Lütfen daha sonra tekrar deneyin.</p>
              </div>`;
    }

    // Replace URLs with clickable links
    return content.replace(
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
      '<a href="$&" target="_blank">$&</a>'
    );
  }

  // Function to summarize a transcript or view its summary
  function summarizeOrViewTranscript(id) {
    const summaryId = `summary_${id}`;
    const button = document.querySelector(
      `.summary-item-button[data-id="${id}"]`
    );

    if (button) {
      button.disabled = true;
      button.textContent = "İşleniyor...";
    }

    chrome.storage.local.get(
      [summaryId, "savedTranscripts"],
      function (result) {
        const transcript =
          result.savedTranscripts && result.savedTranscripts[id];

        // Set this as the current transcript ID
        chrome.storage.local.set({ currentTranscriptId: id }, function () {
          if (result[summaryId]) {
            // If summary already exists, show it
            displaySummary(id);

            if (button) {
              button.disabled = false;
              button.textContent = "Özetle";
            }
          } else if (transcript) {
            // If summary doesn't exist, create one
            loadingIndicator.style.display = "inline-block";

            // Kullanıcıya bilgi ver
            summaryContainer.style.display = "block";
            summaryContent.innerHTML = `<div class="agent-summary">
              <p><strong>Toplantı özeti oluşturuluyor...</strong></p>
              <p>Bu işlem, toplantının uzunluğuna bağlı olarak birkaç dakika sürebilir.</p>
              <p>Lütfen bekleyin, yapay zeka toplantınızı analiz ediyor.</p>
            </div>`;

            // Switch to current tab to show loading
            tabButtons.forEach((btn) => {
              if (btn.getAttribute("data-tab") === "current") {
                btn.click();
              }
            });

            // Send message to background script to summarize
            chrome.runtime.sendMessage({
              type: "summarize_transcript",
              meetingId: id,
            });

            // Button will be reset when the summary_ready or summarization_error message is received
          } else {
            alert("Toplantı içeriği bulunamadı");

            if (button) {
              button.disabled = false;
              button.textContent = "Özetle";
            }
          }
        });
      }
    );
  }

  // Function to load transcript list
  function loadTranscripts() {
    chrome.storage.local.get(["savedTranscripts"], function (result) {
      const transcripts = result.savedTranscripts || {};
      const transcriptIds = Object.keys(transcripts);

      if (transcriptIds.length === 0) {
        transcriptListContainer.innerHTML = `
          <div class="summary-item">
            <div class="summary-item-info">
              <div class="summary-item-title">Henüz kaydedilmiş toplantı yok</div>
              <div class="summary-item-date">-</div>
            </div>
          </div>
        `;
        return;
      }

      // Sort transcripts by date (newest first)
      transcriptIds.sort((a, b) => {
        const dateA = new Date(transcripts[a].date);
        const dateB = new Date(transcripts[b].date);
        return dateB - dateA;
      });

      // Generate HTML for each transcript
      let html = "";
      transcriptIds.forEach((id) => {
        const transcript = transcripts[id];

        // Burada doğrudan özet kontrol yöntemi kullanıyoruz
        const summaryId = `summary_${id}`;

        html += `
          <div class="summary-item" data-id="${id}">
            <div class="summary-item-info" data-id="${id}">
              <div class="summary-item-title">${transcript.title}</div>
              <div class="summary-item-date">${transcript.date}</div>
            </div>
            <div class="summary-item-button-container">
              <button class="summary-item-button" data-id="${id}">Özetle</button>
            </div>
          </div>
        `;
      });

      transcriptListContainer.innerHTML = html;

      // Add click event for each summary button
      document.querySelectorAll(".summary-item-button").forEach((button) => {
        button.addEventListener("click", function () {
          const id = this.getAttribute("data-id");
          summarizeOrViewTranscript(id);
        });
      });

      // Add click event for transcript title and info section
      document.querySelectorAll(".summary-item-info").forEach((infoSection) => {
        infoSection.addEventListener("click", function () {
          const id = this.getAttribute("data-id");
          viewTranscriptContent(id);
        });
      });
    });
  }

  // Yeni fonksiyon: Toplantı metnini görüntüle
  function viewTranscriptContent(id) {
    chrome.storage.local.get(["savedTranscripts"], function (result) {
      const transcripts = result.savedTranscripts || {};

      if (transcripts[id]) {
        // Yeni tab oluştur
        const tabButtons = document.querySelectorAll(".tab-button");
        const tabContents = document.querySelectorAll(".tab-content");

        // Önceki transcript content tabını kaldır
        const existingTab = document.getElementById("tab-transcript-content");
        const existingTabButton = document.querySelector(
          '.tab-button[data-tab="transcript-content"]'
        );

        if (existingTab) {
          existingTab.remove();
        }

        if (existingTabButton) {
          existingTabButton.remove();
        }

        // Yeni tab button oluştur
        const newTabButton = document.createElement("div");
        newTabButton.className = "tab-button";
        newTabButton.setAttribute("data-tab", "transcript-content");
        newTabButton.textContent = "Toplantı Metni";

        // Yeni tab content oluştur
        const newTabContent = document.createElement("div");
        newTabContent.className = "tab-content";
        newTabContent.id = "tab-transcript-content";

        // Toplantı metnini formatlı göster
        newTabContent.innerHTML = `
          <div>
            <h3>${transcripts[id].title}</h3>
            <p style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.8);">${transcripts[id].date}</p>
            <div style="margin-top: 1rem; white-space: pre-line; font-family: monospace; line-height: 1.5; max-height: 400px; overflow-y: auto; padding: 0.5rem; background-color: rgba(255, 255, 255, 0.05); border-radius: 4px;">
              ${transcripts[id].content}
            </div>
          </div>
        `;

        // Tab butonunu ve içeriğini ekle
        const tabButtonsContainer = document.querySelector(".tab-buttons");
        tabButtonsContainer.appendChild(newTabButton);

        const tabContainer = document.querySelector(".tab-container");
        tabContainer.appendChild(newTabContent);

        // Tab değiştirme işlevselliğini ekle
        newTabButton.addEventListener("click", function () {
          tabButtons.forEach((btn) => btn.classList.remove("active"));
          tabContents.forEach((tab) => tab.classList.remove("active"));

          this.classList.add("active");
          newTabContent.classList.add("active");
        });

        // Yeni taba geç
        newTabButton.click();
      }
    });
  }

  // Function to load error logs
  function loadErrorLogs() {
    chrome.storage.local.get(["errorLogs"], function (result) {
      const logs = result.errorLogs || [];

      if (logs.length === 0) {
        errorLogsContainer.innerHTML = `<div class="error-log">Henüz hata kaydı yok.</div>`;
        return;
      }

      // Sort logs by timestamp (newest first)
      logs.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      // Generate HTML for each log entry
      let html = "";
      logs.forEach((log) => {
        html += `
          <div class="error-log">
            <div><strong>Kaynak:</strong> ${log.source}</div>
            <div><strong>Tarih:</strong> ${new Date(
          log.timestamp
        ).toLocaleString()}</div>
            <div><strong>Mesaj:</strong> ${log.message}</div>
            ${log.details
            ? `<div><strong>Detaylar:</strong> ${JSON.stringify(
              log.details
            )}</div>`
            : ""
          }
          </div>
        `;
      });

      errorLogsContainer.innerHTML = html;
    });
  }

  // Initial load of transcripts in history tab
  loadTranscripts();
};

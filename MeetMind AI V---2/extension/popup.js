window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode");
  const manualModeRadio = document.querySelector("#manual-mode");
  const summaryContainer = document.querySelector("#summary-container");
  const summaryContent = document.querySelector("#summary-content");
  const summaryDisplayLoadingIndicator = document.querySelector(
    "#summary-display-loading-indicator"
  );
  const transcriptListContainer = document.querySelector("#transcript-list");
  const errorLogsContainer = document.querySelector("#error-logs");
  const tabButtons = document.querySelectorAll(".tab-button");

  // New const declarations for radio button styling and theme toggle
  const autoModeContainer = document.getElementById("auto-mode-container");
  const manualModeContainer = document.getElementById("manual-mode-container");
  const themeToggle = document.getElementById("theme-toggle"); // For theme toggle
  const body = document.body; // For theme toggle
  const languageSelectorPopup = document.getElementById(
    "language-selector-popup"
  ); // Updated ID for language selector

  // --- Start of Theme Toggle Functionality (moved from inline) ---
  console.log("Theme toggle script executing from popup.js.");

  if (!body) {
    console.error("document.body is not available in popup.js.");
  }
  if (!themeToggle) {
    console.error(
      "#theme-toggle element not found in popup.js. Ensure the ID in your HTML matches."
    );
  }

  function applyTheme(isDark) {
    if (!body) return;
    console.log("applyTheme called with isDark:", isDark);
    if (isDark) {
      body.classList.add("dark-mode");
      if (themeToggle) themeToggle.checked = true;
    } else {
      body.classList.remove("dark-mode");
      if (themeToggle) themeToggle.checked = false;
    }
    console.log("Body classList after applyTheme:", body.classList.toString());
    if (themeToggle)
      console.log(
        "Toggle checked state after applyTheme:",
        themeToggle.checked
      );
  }

  const storedTheme = localStorage.getItem("darkMode");
  console.log("Stored theme from localStorage:", storedTheme);
  if (storedTheme === "enabled") {
    applyTheme(true);
  } else if (storedTheme === "disabled") {
    applyTheme(false);
  } else {
    console.log("No theme preference stored, or defaulting to light theme.");
    applyTheme(false);
  }

  if (themeToggle) {
    themeToggle.addEventListener("change", function () {
      if (!body) return;
      console.log(
        "Theme toggle 'change' event fired. Checkbox is now checked:",
        this.checked
      );
      if (this.checked) {
        body.classList.add("dark-mode");
        localStorage.setItem("darkMode", "enabled");
        console.log(
          "Dark Mode ENABLED by toggle. Body classList:",
          body.classList.toString()
        );
      } else {
        body.classList.remove("dark-mode");
        localStorage.setItem("darkMode", "disabled");
        console.log(
          "Dark Mode DISABLED by toggle. Body classList:",
          body.classList.toString()
        );
      }
    });
    console.log("Event listener attached to theme toggle in popup.js.");
  } else {
    console.warn(
      "Could not attach event listener in popup.js: #theme-toggle element was not found."
    );
  }
  // --- End of Theme Toggle Functionality ---

  // --- Start of Radio Button Active Styles (moved from inline) ---
  function updateActiveStyles() {
    if (
      !autoModeRadio ||
      !manualModeRadio ||
      !autoModeContainer ||
      !manualModeContainer
    ) {
      console.warn("Radio mode elements not found for styling in popup.js");
      return;
    }
    if (autoModeRadio.checked) {
      autoModeContainer.classList.add("active");
      manualModeContainer.classList.remove("active");
    } else if (manualModeRadio.checked) {
      manualModeContainer.classList.add("active");
      autoModeContainer.classList.remove("active");
    }
  }
  // --- End of Radio Button Active Styles ---

  // --- Start of Language Selector Functionality ---
  if (languageSelectorPopup) {
    // Load saved language preference
    chrome.storage.sync.get(["summaryLanguage"], function (result) {
      if (result.summaryLanguage) {
        languageSelectorPopup.value = result.summaryLanguage;
      } else {
        // Default to Turkish if no language is set
        languageSelectorPopup.value = "tr";
        chrome.storage.sync.set({ summaryLanguage: "tr" });
      }
    });

    // Save language preference on change
    languageSelectorPopup.addEventListener("change", function () {
      chrome.storage.sync.set({ summaryLanguage: this.value }, function () {
        console.log("Summary language saved:", this.value);
      });
    });
  } else {
    console.warn("#language-selector-popup element not found in popup.js");
  }
  // --- End of Language Selector Functionality ---

  document.querySelector("#version").innerHTML = `v${
    chrome.runtime.getManifest().version
  }`;

  // Tab switching functionality
  tabButtons.forEach((button) => {
    button.addEventListener("click", function () {
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((tab) => tab.classList.remove("active"));
      this.classList.add("active");
      const tabId = "tab-" + this.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
      if (this.getAttribute("data-tab") === "history") {
        loadTranscripts();
      }
      if (this.getAttribute("data-tab") === "logs") {
        loadErrorLogs();
      }
    });
  });

  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined) autoModeRadio.checked = true;
    else if (result.operationMode == "auto") autoModeRadio.checked = true;
    else if (result.operationMode == "manual") manualModeRadio.checked = true;
    updateActiveStyles(); // Call for initial state
  });

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () {});
    updateActiveStyles(); // Call on change
  });
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () {});
    updateActiveStyles(); // Call on change
  });

  // Listen for message from background script that summary is ready
  chrome.runtime.onMessage.addListener(function (
    message,
    sender,
    sendResponse
  ) {
    if (message.type === "summary_ready") {
      // Hide loading indicator for the new tab
      if (summaryDisplayLoadingIndicator)
        summaryDisplayLoadingIndicator.style.display = "none";

      // Re-enable buttons in the history list if any were disabled for this summarization
      const processedButton = document.querySelector(
        `.summary-item-button[data-id="${message.meetingId}"][data-processing="true"]`
      );
      if (processedButton) {
        processedButton.disabled = false;
        processedButton.textContent = "Özeti Gör"; // Artık özet hazır
        processedButton.removeAttribute("data-processing");
      }

      // Display the summary for the meeting ID in the new tab
      displaySummary(message.meetingId);
    } else if (message.type === "summarization_error") {
      // Hide loading indicator for the new tab
      if (summaryDisplayLoadingIndicator)
        summaryDisplayLoadingIndicator.style.display = "none";

      // Re-enable buttons in the history list
      const processedButton = document.querySelector(
        `.summary-item-button[data-id="${message.meetingId}"][data-processing="true"]`
      );
      if (processedButton) {
        processedButton.disabled = false;
        processedButton.textContent = "Özetle"; // Hata oluştu, tekrar özetlenebilir
        processedButton.removeAttribute("data-processing");
      }

      // Show error message in the new summary tab
      if (summaryContainer) summaryContainer.style.display = "block";
      if (summaryContent) {
        summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 0, 0, 0.1);">
          <strong>Hata:</strong> Özet oluşturulurken bir sorun oluştu. ${
            message.message || ""
          }
          <p>Lütfen daha sonra tekrar deneyin veya hata kayıtları sekmesinden detayları kontrol edin.</p>
        </div>`;
      }

      // Switch to summary display tab to show the error
      tabButtons.forEach((btn) => {
        if (btn.getAttribute("data-tab") === "summary-display") {
          btn.click(); // Sekmeyi aktif hale getir
        }
      });

      // Log to console
      console.error("Summarization error:", message.message);
    }
  });

  // Function to display a summary in the new "Toplantı Özetleri" tab
  function displaySummary(meetingId) {
    const summaryId = `summary_${meetingId}`;

    chrome.storage.local.get([summaryId], function (result) {
      if (result[summaryId] && result[summaryId].summary) {
        const summaryData = result[summaryId];
        const summary = summaryData.summary;

        if (summaryContainer) summaryContainer.style.display = "block";

        // Çoklu ajan formatında özeti görüntüle
        let summaryHTML = "";

        // Toplantı başlığını ve tarihini ekle
        summaryHTML += `<div style="margin-bottom: 1rem;">
                          <h2 style="margin-bottom: 0.5rem;">${
                            summaryData.title
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

        if (summaryContent) summaryContent.innerHTML = summaryHTML;

        // Switch to summary display tab to show the summary
        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "summary-display") {
            btn.click(); // Sekmeyi aktif hale getir
          }
        });
      } else {
        if (summaryContainer) summaryContainer.style.display = "block";
        if (summaryContent) {
          summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 140, 0, 0.1);">
            <strong>Uyarı:</strong> Özet bulunamadı (${meetingId}). Lütfen tekrar deneyin veya hata kayıtları sekmesini kontrol edin.
            </div>`;
        }
        // Switch to summary display tab to show the warning
        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "summary-display") {
            btn.click();
          }
        });
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

  // Function to summarize a transcript or view its summary (called from History tab items)
  function summarizeOrViewTranscript(id) {
    const summaryId = `summary_${id}`;
    const button = document.querySelector(
      `.summary-item-button[data-id="${id}"]`
    );

    chrome.storage.local.get(
      [summaryId, "savedTranscripts"],
      function (result) {
        const transcript =
          result.savedTranscripts && result.savedTranscripts[id];

        // Set this as the current transcript ID (still useful if summarization fails and user retries)
        chrome.storage.local.set({ currentTranscriptId: id }, function () {
          if (result[summaryId]) {
            // If summary already exists, show it in the summary display tab
            displaySummary(id);
            if (button) {
              button.disabled = false;
              button.textContent = "Özeti Gör"; // Text might already be this, but ensure state
            }
          } else if (transcript) {
            // If summary doesn't exist, create one
            if (summaryDisplayLoadingIndicator)
              summaryDisplayLoadingIndicator.style.display = "inline-block";
            if (button) {
              button.disabled = true;
              button.textContent = "Özetleniyor...";
              button.setAttribute("data-processing", "true"); // Mark button as processing
            }

            // Kullanıcıya bilgi ver (Toplantı Özetleri sekmesinde)
            if (summaryContainer) summaryContainer.style.display = "block";
            if (summaryContent) {
              summaryContent.innerHTML = `<div class="agent-summary">
                <p><strong>Toplantı özeti (${
                  transcript.title || id
                }) oluşturuluyor...</strong></p>
                <p>Bu işlem, toplantının uzunluğuna bağlı olarak birkaç dakika sürebilir.</p>
                <p>Lütfen bekleyin, yapay zeka toplantınızı analiz ediyor.</p>
              </div>`;
            }

            // Switch to summary display tab to show loading
            tabButtons.forEach((btn) => {
              if (btn.getAttribute("data-tab") === "summary-display") {
                btn.click();
              }
            });

            // Send message to background script to summarize
            chrome.runtime.sendMessage({
              type: "summarize_transcript",
              meetingId: id,
            });
          } else {
            alert("Toplantı içeriği bulunamadı: " + id);
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
      // Get all existing summary IDs to check against
      chrome.storage.local.get(null, function (allStorage) {
        const summaryKeys = Object.keys(allStorage).filter((key) =>
          key.startsWith("summary_")
        );

        transcriptIds.forEach((id) => {
          const transcript = transcripts[id];
          const summaryExists = summaryKeys.includes(`summary_${id}`);

          html += `
            <div class="summary-item" data-id="${id}">
              <div class="summary-item-info" data-id="${id}">
                <div class="summary-item-title">${transcript.title}</div>
                <div class="summary-item-date">${transcript.date}</div>
              </div>
              <div class="summary-item-button-container">
                <button class="summary-item-button" data-id="${id}">${
            summaryExists ? "Özeti Gör" : "Özetle"
          }</button>
              </div>
            </div>
          `;
        });

        transcriptListContainer.innerHTML = html;

        // Add click event for each summary button
        document.querySelectorAll(".summary-item-button").forEach((button) => {
          button.addEventListener("click", function () {
            const id = this.getAttribute("data-id");
            summarizeOrViewTranscript(id); // This function now handles both cases
          });
        });

        // Add click event for transcript title and info section to view raw transcript
        document
          .querySelectorAll(".summary-item-info")
          .forEach((infoSection) => {
            infoSection.addEventListener("click", function () {
              const id = this.getAttribute("data-id");
              viewTranscriptContent(id);
            });
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
            ${
              log.details
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

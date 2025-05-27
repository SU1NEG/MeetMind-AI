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

  const autoModeContainer = document.getElementById("auto-mode-container");
  const manualModeContainer = document.getElementById("manual-mode-container");
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;
  const languageSelectorPopup = document.getElementById(
    "language-selector-popup"
  );

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

  if (languageSelectorPopup) {
    chrome.storage.sync.get(["summaryLanguage"], function (result) {
      if (result.summaryLanguage) {
        languageSelectorPopup.value = result.summaryLanguage;
      } else {
        languageSelectorPopup.value = "tr";
        chrome.storage.sync.set({ summaryLanguage: "tr" });
      }
    });

    languageSelectorPopup.addEventListener("change", function () {
      chrome.storage.sync.set({ summaryLanguage: this.value }, function () {
        console.log("Summary language saved:", this.value);
      });
    });
  } else {
    console.warn("#language-selector-popup element not found in popup.js");
  }

  document.querySelector("#version").innerHTML = `v${
    chrome.runtime.getManifest().version
  }`;

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
    updateActiveStyles();
  });

  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () {});
    updateActiveStyles();
  });
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () {});
    updateActiveStyles();
  });

  chrome.runtime.onMessage.addListener(function (
    message,
    sender,
    sendResponse
  ) {
    if (message.type === "summary_ready") {
      if (summaryDisplayLoadingIndicator)
        summaryDisplayLoadingIndicator.style.display = "none";

      const processedButton = document.querySelector(
        `.summary-item-button[data-id="${message.meetingId}"][data-processing="true"]`
      );
      if (processedButton) {
        processedButton.disabled = false;
        processedButton.textContent = "Özeti Gör";
        processedButton.removeAttribute("data-processing");
      }

      displaySummary(message.meetingId);
    } else if (message.type === "summarization_error") {
      if (summaryDisplayLoadingIndicator)
        summaryDisplayLoadingIndicator.style.display = "none";

      const processedButton = document.querySelector(
        `.summary-item-button[data-id="${message.meetingId}"][data-processing="true"]`
      );
      if (processedButton) {
        processedButton.disabled = false;
        processedButton.textContent = "Özetle";
        processedButton.removeAttribute("data-processing");
      }

      if (summaryContainer) summaryContainer.style.display = "block";
      if (summaryContent) {
        summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 0, 0, 0.1);">
          <strong>Hata:</strong> Özet oluşturulurken bir sorun oluştu. ${
            message.message || ""
          }
          <p>Lütfen daha sonra tekrar deneyin veya hata kayıtları sekmesinden detayları kontrol edin.</p>
        </div>`;
      }

      tabButtons.forEach((btn) => {
        if (btn.getAttribute("data-tab") === "summary-display") {
          btn.click();
        }
      });

      console.error("Summarization error:", message.message);
    }
  });

  function displaySummary(meetingId) {
    const summaryId = `summary_${meetingId}`;

    chrome.storage.local.get([summaryId], function (result) {
      if (result[summaryId] && result[summaryId].summary) {
        const summaryData = result[summaryId];
        const summary = summaryData.summary;

        if (summaryContainer) summaryContainer.style.display = "block";

        let summaryHTML = "";

        summaryHTML += `<div style="margin-bottom: 1rem;">
                          <h2 style="margin-bottom: 0.5rem;">${
                            summaryData.title
                          }</h2>
                          <p style="font-size: 0.9rem; opacity: 0.8;">${new Date(
                            summaryData.date
                          ).toLocaleString()}</p>
                        </div>`;

        summaryHTML += `<h3>Genel Özet</h3>
                        <div class="agent-summary">${formatContent(
                          summary.general_summary
                        )}</div>`;

        summaryHTML += `<h3>Tarihler ve Etkinlikler</h3>
                        <div class="agent-summary">${formatContent(
                          summary.date_events
                        )}</div>`;

        summaryHTML += `<h3>Önemli Konular</h3>
                        <div class="agent-summary">${formatContent(
                          summary.key_topics
                        )}</div>`;

        summaryHTML += `<h3>Görevler ve Sorumlular</h3>
                        <div class="agent-summary">${formatContent(
                          summary.tasks
                        )}</div>`;

        if (summaryContent) summaryContent.innerHTML = summaryHTML;

        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "summary-display") {
            btn.click();
          }
        });
      } else {
        if (summaryContainer) summaryContainer.style.display = "block";
        if (summaryContent) {
          summaryContent.innerHTML = `<div class="agent-summary" style="background-color: rgba(255, 140, 0, 0.1);">
            <strong>Uyarı:</strong> Özet bulunamadı (${meetingId}). Lütfen tekrar deneyin veya hata kayıtları sekmesini kontrol edin.
            </div>`;
        }
        tabButtons.forEach((btn) => {
          if (btn.getAttribute("data-tab") === "summary-display") {
            btn.click();
          }
        });
      }
    });
  }

  function formatContent(content) {
    if (!content) return "<em>Bilgi yok</em>";

    if (
      content.startsWith("API yanıtı alınamadı") ||
      content.startsWith("API hatası:")
    ) {
      return `<div style="color: #ff6b6b; padding: 10px; background-color: rgba(255, 0, 0, 0.05); border-radius: 4px;">
                <strong>⚠️ ${content}</strong>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">Lütfen daha sonra tekrar deneyin veya API anahtarınızı kontrol edin.</p>
              </div>`;
    }

    if (content === "Beklenmeyen API yanıtı.") {
      return `<div style="color: #ff9e57; padding: 10px; background-color: rgba(255, 160, 0, 0.05); border-radius: 4px;">
                <strong>⚠️ Beklenmeyen API yanıtı</strong>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">Gemini API'den beklenmeyen bir yanıt alındı. Lütfen daha sonra tekrar deneyin.</p>
              </div>`;
    }

    return content.replace(
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
      '<a href="$&" target="_blank">$&</a>'
    );
  }

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

        chrome.storage.local.set({ currentTranscriptId: id }, function () {
          if (result[summaryId]) {
            displaySummary(id);
            if (button) {
              button.disabled = false;
              button.textContent = "Özeti Gör";
            }
          } else if (transcript) {
            if (summaryDisplayLoadingIndicator)
              summaryDisplayLoadingIndicator.style.display = "inline-block";
            if (button) {
              button.disabled = true;
              button.textContent = "Özetleniyor...";
              button.setAttribute("data-processing", "true");
            }

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

            tabButtons.forEach((btn) => {
              if (btn.getAttribute("data-tab") === "summary-display") {
                btn.click();
              }
            });

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

      transcriptIds.sort((a, b) => {
        const dateA = new Date(transcripts[a].date);
        const dateB = new Date(transcripts[b].date);
        return dateB - dateA;
      });

      let html = "";
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

        document.querySelectorAll(".summary-item-button").forEach((button) => {
          button.addEventListener("click", function () {
            const id = this.getAttribute("data-id");
            summarizeOrViewTranscript(id);
          });
        });

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

  function viewTranscriptContent(id) {
    chrome.storage.local.get(["savedTranscripts"], function (result) {
      const transcripts = result.savedTranscripts || {};

      if (transcripts[id]) {
        const tabButtons = document.querySelectorAll(".tab-button");
        const tabContents = document.querySelectorAll(".tab-content");

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

        const newTabButton = document.createElement("div");
        newTabButton.className = "tab-button";
        newTabButton.setAttribute("data-tab", "transcript-content");
        newTabButton.textContent = "Toplantı Metni";

        const newTabContent = document.createElement("div");
        newTabContent.className = "tab-content";
        newTabContent.id = "tab-transcript-content";

        newTabContent.innerHTML = `
          <div>
            <h3>${transcripts[id].title}</h3>
            <p style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.8);">${transcripts[id].date}</p>
            <div style="margin-top: 1rem; white-space: pre-line; font-family: monospace; line-height: 1.5; max-height: 400px; overflow-y: auto; padding: 0.5rem; background-color: rgba(255, 255, 255, 0.05); border-radius: 4px;">
              ${transcripts[id].content}
            </div>
          </div>
        `;

        const tabButtonsContainer = document.querySelector(".tab-buttons");
        tabButtonsContainer.appendChild(newTabButton);

        const tabContainer = document.querySelector(".tab-container");
        tabContainer.appendChild(newTabContent);

        newTabButton.addEventListener("click", function () {
          tabButtons.forEach((btn) => btn.classList.remove("active"));
          tabContents.forEach((tab) => tab.classList.remove("active"));

          this.classList.add("active");
          newTabContent.classList.add("active");
        });

        newTabButton.click();
      }
    });
  }

  function loadErrorLogs() {
    chrome.storage.local.get(["errorLogs"], function (result) {
      const logs = result.errorLogs || [];

      if (logs.length === 0) {
        errorLogsContainer.innerHTML = `<div class="error-log">Henüz hata kaydı yok.</div>`;
        return;
      }

      logs.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

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

  loadTranscripts();
};

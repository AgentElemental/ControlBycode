// Import the io function from socket.io-client
const io = require("socket.io-client")

// ControlByCode Client - Technical UI
class GameClient {
  constructor() {
    this.socket = io()
    this.playerId = null
    this.currentWorld = null
    this.gameState = null
    this.autoRunEnabled = false

    this.initializeElements()
    this.setupEventListeners()
    this.setupSocketListeners()
    this.initializeCyberpunkFeatures()
  }

  initializeElements() {
    // Core elements
    this.codeEditor = document.getElementById("codeEditor")
    this.playerName = document.getElementById("playerName")
    this.languageSelect = document.getElementById("languageSelect")
    this.connectionStatus = document.getElementById("connectionStatus")
    this.worldGrid = document.getElementById("worldGrid")
    this.consoleOutput = document.getElementById("consoleOutput")
    this.leaderboard = document.getElementById("leaderboard")
    this.roundTimer = document.getElementById("roundTimer")
    this.roundStatus = document.getElementById("roundStatus")

    // Stats elements
    this.playerScore = document.getElementById("playerScore")
    this.playerOps = document.getElementById("playerOps")
    this.playerTime = document.getElementById("playerTime")
    this.codeSize = document.getElementById("codeSize")

    // Buttons
    this.runOnceBtn = document.getElementById("runOnce")
    this.autoRunBtn = document.getElementById("autoRun")
    this.setNameBtn = document.getElementById("setName")
    this.clearConsoleBtn = document.getElementById("clearConsole")

    // Admin elements
    this.adminPanel = document.getElementById("adminPanel")
    this.adminEmail = document.getElementById("adminEmail")
    this.adminPassword = document.getElementById("adminPassword")
    this.adminLoginBtn = document.getElementById("adminLogin")
    this.startRoundBtn = document.getElementById("startRound")
    this.endRoundBtn = document.getElementById("endRound")
    this.clearGlobalBtn = document.getElementById("clearGlobal")
  }

  setupEventListeners() {
    // Code editor
    this.codeEditor.addEventListener("input", () => {
      this.socket.emit("updateCode", this.codeEditor.value)
      this.updateCodeSize()
    })

    // Language selection
    this.languageSelect.addEventListener("change", () => {
      this.socket.emit("setLanguage", this.languageSelect.value)
    })

    // Player name
    this.setNameBtn.addEventListener("click", () => {
      const name = this.playerName.value.trim()
      if (name) {
        this.socket.emit("setName", name)
      }
    })

    this.playerName.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.setNameBtn.click()
      }
    })

    // Game controls
    this.runOnceBtn.addEventListener("click", () => {
      this.socket.emit("runOnce")
    })

    this.autoRunBtn.addEventListener("click", () => {
      this.autoRunEnabled = !this.autoRunEnabled
      this.socket.emit("autoRun", this.autoRunEnabled)
      this.updateAutoRunButton()
    })

    // Console
    this.clearConsoleBtn.addEventListener("click", () => {
      this.consoleOutput.innerHTML = ""
    })

    // Admin controls
    this.adminLoginBtn.addEventListener("click", () => {
      this.socket.emit("adminLogin", {
        email: this.adminEmail.value,
        password: this.adminPassword.value,
      })
    })

    this.startRoundBtn.addEventListener("click", () => {
      this.socket.emit("adminStartRound")
    })

    this.endRoundBtn.addEventListener("click", () => {
      this.socket.emit("adminEndRound")
    })

    this.clearGlobalBtn.addEventListener("click", () => {
      this.socket.emit("adminClearGlobal")
    })

    // Admin panel toggle (Ctrl+A)
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault()
        this.toggleAdminPanel()
      }
    })
  }

  setupSocketListeners() {
    this.socket.on("connect", () => {
      this.updateConnectionStatus(true)
      this.logToConsole("NEURAL LINK ESTABLISHED", "system")
    })

    this.socket.on("disconnect", () => {
      this.updateConnectionStatus(false)
      this.logToConsole("NEURAL LINK SEVERED", "error")
    })

    this.socket.on("self", (data) => {
      this.playerId = data.id
      this.logToConsole(`HACKER ID: ${this.playerId}`, "system")
    })

    this.socket.on("state", (state) => {
      this.gameState = state
      this.updateGameState()
    })

    this.socket.on("world", (world) => {
      this.currentWorld = world
      this.renderWorld()
    })

    this.socket.on("needName", () => {
      this.logToConsole("IDENTITY REQUIRED - SET HACKER ALIAS", "error")
      this.playerName.focus()
    })

    this.socket.on("nameRejected", (data) => {
      this.logToConsole(`ALIAS REJECTED: ${data.reason}`, "error")
    })

    this.socket.on("roundReset", () => {
      this.logToConsole("SYSTEM BREACH INITIATED!", "system")
    })

    this.socket.on("roundEnded", () => {
      this.logToConsole("BREACH TERMINATED!", "system")
    })

    this.socket.on("global", (data) => {
      this.updateGlobalLeaderboard(data.leaderboard)
    })

    this.socket.on("adminOk", (data) => {
      if (data.ok) {
        this.logToConsole("Admin action successful", "log")
      } else {
        this.logToConsole(`Admin error: ${data.reason}`, "error")
      }
    })
  }

  updateConnectionStatus(connected) {
    const statusDot = this.connectionStatus.querySelector(".status-dot")
    const statusText = this.connectionStatus.querySelector(".status-text")

    if (connected) {
      statusDot.classList.add("connected")
      statusText.textContent = "NEURAL_LINK_ACTIVE"
    } else {
      statusDot.classList.remove("connected")
      statusText.textContent = "NEURAL_LINK_DOWN"
    }
  }

  updateGameState() {
    if (!this.gameState) return

    // Update round timer
    if (this.gameState.running) {
      const timeLeft = Math.max(0, this.gameState.roundEndsAt - Date.now())
      const minutes = Math.floor(timeLeft / 60000)
      const seconds = Math.floor((timeLeft % 60000) / 1000)
      this.roundTimer.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      this.roundStatus.textContent = "BREACH_IN_PROGRESS"
    } else {
      this.roundTimer.textContent = "--:--"
      this.roundStatus.textContent = "AWAITING_BREACH..."
    }

    // Update player stats
    const myPlayer = this.gameState.players.find((p) => p.id === this.playerId)
    if (myPlayer) {
      this.playerScore.textContent = myPlayer.score || 0
      this.playerOps.textContent = myPlayer.metrics?.ops || 0
      this.playerTime.textContent = `${myPlayer.metrics?.timeMs || 0}ms`

      // Update console with logs and errors
      if (myPlayer.lastLogs) {
        myPlayer.lastLogs.forEach((log) => {
          this.logToConsole(log, "log")
        })
      }
      if (myPlayer.lastError) {
        this.logToConsole(`Error: ${myPlayer.lastError}`, "error")
      }
    }

    // Update leaderboard
    this.updateLeaderboard()
  }

  updateLeaderboard() {
    if (!this.gameState) return

    const sortedPlayers = [...this.gameState.players].filter((p) => p.name).sort((a, b) => b.score - a.score)

    this.leaderboard.innerHTML = ""
    sortedPlayers.forEach((player, index) => {
      const item = document.createElement("div")
      item.className = "leaderboard-item"
      item.innerHTML = `
                <span>${index + 1}. ${player.name}</span>
                <span>${player.score}</span>
            `
      this.leaderboard.appendChild(item)
    })
  }

  updateGlobalLeaderboard(leaderboard) {
    // Could add a separate global leaderboard section
    console.log("Global leaderboard:", leaderboard)
  }

  renderWorld() {
    if (!this.currentWorld) {
      this.worldGrid.innerHTML = '<div class="no-world">MATRIX_OFFLINE</div>'
      return
    }

    this.worldGrid.innerHTML = ""

    for (let y = 0; y < this.currentWorld.height; y++) {
      for (let x = 0; x < this.currentWorld.width; x++) {
        const cell = document.createElement("div")
        cell.className = "grid-cell"

        const key = `${x},${y}`

        // Check for obstacles
        if (this.currentWorld.obstacles.includes(key)) {
          cell.classList.add("obstacle")
          cell.textContent = "▓"
        }

        // Check for goals
        if (this.currentWorld.goals.includes(key)) {
          cell.classList.add("goal")
          cell.textContent = "◉"
        }

        // Check for players
        Object.entries(this.currentWorld.players).forEach(([playerId, player]) => {
          if (player.x === x && player.y === y) {
            cell.classList.add("player")
            const dirSymbol = {
              N: "▲",
              S: "▼",
              E: "▶",
              W: "◀",
            }
            cell.textContent = dirSymbol[player.dir] || "●"

            if (playerId === this.playerId) {
              cell.style.background = "var(--cyber-cyan)"
              cell.style.boxShadow = "var(--glow-cyan)"
            }
          }
        })

        this.worldGrid.appendChild(cell)
      }
    }
  }

  updateCodeSize() {
    const size = new Blob([this.codeEditor.value]).size
    this.codeSize.textContent = `${size}b`
  }

  updateAutoRunButton() {
    if (this.autoRunEnabled) {
      this.autoRunBtn.textContent = "STOP_HACK"
      this.autoRunBtn.classList.add("cyber-btn", "danger")
      this.autoRunBtn.classList.remove("secondary")
    } else {
      this.autoRunBtn.textContent = "AUTO_HACK"
      this.autoRunBtn.classList.add("cyber-btn", "secondary")
      this.autoRunBtn.classList.remove("danger")
    }
  }

  logToConsole(message, type = "log") {
    const line = document.createElement("div")
    line.className = `console-line ${type}`
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false })
    line.textContent = `[${timestamp}] ${message}`
    this.consoleOutput.appendChild(line)
    this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight

    setTimeout(() => {
      line.style.opacity = "1"
    }, 10)
  }

  toggleAdminPanel() {
    const isVisible = this.adminPanel.style.display !== "none"
    this.adminPanel.style.display = isVisible ? "none" : "block"
  }

  initializeCyberpunkFeatures() {
    // Initialize line numbers for code editor
    this.updateLineNumbers()

    // Update system time display
    this.updateSystemTime()
    setInterval(() => this.updateSystemTime(), 1000)

    // Initialize stat bars animation
    this.animateStatBars()

    // Add typing effect to console
    this.logToConsole("SYSTEM INITIALIZED", "system")
    this.logToConsole("AWAITING NEURAL INTERFACE...", "system")
  }

  updateLineNumbers() {
    const lineNumbers = document.getElementById("lineNumbers")
    if (!lineNumbers) return

    const lines = this.codeEditor.value.split("\n").length
    let numbersHtml = ""
    for (let i = 1; i <= Math.max(lines, 10); i++) {
      numbersHtml += `${i}\n`
    }
    lineNumbers.textContent = numbersHtml
  }

  updateSystemTime() {
    const systemTime = document.getElementById("systemTime")
    if (systemTime) {
      const now = new Date()
      systemTime.textContent = now.toLocaleTimeString("en-US", { hour12: false })
    }
  }

  animateStatBars() {
    const statBars = document.querySelectorAll(".bar-fill")
    statBars.forEach((bar, index) => {
      setTimeout(() => {
        bar.style.width = `${Math.random() * 100}%`
      }, index * 200)
    })
  }
}

// Initialize the game client when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new GameClient()
})

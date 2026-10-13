import { useState, useEffect, useRef } from 'react'

// Helper: Format INR currency
function formatINR(val) {
  return "₹" + Number(val || 0).toLocaleString("en-IN")
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || ""

export default function App() {
  const [farmers, setFarmers] = useState([])
  const [stats, setStats] = useState({ totalTons: 0, totalPaid: 0, totalPending: 0, farmerCount: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [villageFilter, setVillageFilter] = useState("ALL")
  const [activeTab, setActiveTab] = useState("assistant")

  // Chat State
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome to **Sanjivani Sugar Factory** portal. Ask any question about farmer sugarcane supplies, pending payments, or village-wise summaries.",
    },
  ])
  const [inputQuery, setInputQuery] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const chatEndRef = useRef(null)

  // 1. Load initial data
  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isThinking])

  async function fetchData() {
    try {
      setLoading(true)
      const [farmersRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/farmers`),
        fetch(`${API_BASE}/api/stats`),
      ])

      const farmersData = farmersRes.ok ? await farmersRes.json() : { farmers: [] }
      const statsData = statsRes.ok ? await statsRes.json() : { totalTons: 0, totalPaid: 0, totalPending: 0, farmerCount: 0 }

      setFarmers(farmersData.farmers || [])
      setStats(statsData)
    } catch (err) {
      console.error("Failed to load records:", err)
    } finally {
      setLoading(false)
    }
  }

  // 2. Submit AI Query
  async function handleSend(queryText) {
    const q = (queryText || inputQuery).trim()
    if (!q || isThinking) return

    // Switch to assistant tab on mobile when asking a question
    setActiveTab("assistant")
    setMessages((prev) => [...prev, { role: "user", content: q }])
    setInputQuery("")
    setIsThinking(true)

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      })

      if (!res.ok) {
        let errDetail = ""
        try {
          const errData = await res.json()
          errDetail = errData.error || ""
        } catch {
          errDetail = await res.text()
        }
        throw new Error(errDetail || `Server returned status ${res.status}`)
      }

      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || "No response received from assistant." },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err.message}` },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  // 3. Filter farmers by search & village
  const filteredFarmers = farmers.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.village.toLowerCase().includes(search.toLowerCase())
    const matchesVillage = villageFilter === "ALL" || f.village.toLowerCase() === villageFilter.toLowerCase()
    return matchesSearch && matchesVillage
  })

  const villages = ["ALL", ...Array.from(new Set(farmers.map((f) => f.village)))]

  // Helper to parse basic markdown for chat bubbles
  function renderMarkdown(text) {
    const html = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^### (.*$)/gim, "<h4 class='chat-subhead'>$1</h4>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n- (.*?)(?=\n|$)/g, "<li>$1</li>")
      .replace(/\n\d+\. (.*?)(?=\n|$)/g, "<li>$1</li>")
    return { __html: `<p>${html}</p>` }
  }

  // Computed totals for filtered farmers
  const filteredTotalTons = filteredFarmers.reduce((acc, f) => acc + (Number(f.sugarcane_tons) || 0), 0)
  const filteredTotalPaid = filteredFarmers.reduce((acc, f) => acc + (Number(f.amount_paid) || 0), 0)
  const filteredTotalPending = filteredFarmers.reduce((acc, f) => acc + (Number(f.payment_pending) || 0), 0)

  return (
    <div className="dashboard-wrapper">
      {/* HEADER */}
      <header className="main-header">
        <div className="brand-section">
          <div className="brand-icon">🌾</div>
          <div>
            <div className="title-row">
              <h1>Sanjivani Sugar Factory</h1>
              <span className="badge-tag">सहकारी साखर कारखाना • Kopargaon</span>
            </div>
            <p className="subtitle">Sugarcane Procurement Ledger & Farmer Payment Portal</p>
          </div>
        </div>

        <div className="system-status">
          <span className="status-dot"></span>
          <span>Database & AI Connected</span>
        </div>
      </header>

      {/* METRIC KPI CARDS */}
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-head">
            <span className="metric-title">Total Cane Supplied</span>
            <span className="metric-icon icon-green">🌾</span>
          </div>
          <div className="metric-val">
            {stats.totalTons?.toLocaleString("en-IN") || "--"} <span className="metric-unit">Tons</span>
          </div>
          <div className="metric-footer">Total sugarcane crushed to date</div>
        </div>

        <div className="metric-card">
          <div className="metric-head">
            <span className="metric-title">Amount Settled</span>
            <span className="metric-icon icon-emerald">💰</span>
          </div>
          <div className="metric-val text-emerald">
            {formatINR(stats.totalPaid)}
          </div>
          <div className="metric-footer">Successfully paid to farmers</div>
        </div>

        <div className="metric-card highlight-amber">
          <div className="metric-head">
            <span className="metric-title">Pending Dues</span>
            <span className="metric-icon icon-amber">⏳</span>
          </div>
          <div className="metric-val text-amber">
            {formatINR(stats.totalPending)}
          </div>
          <div className="metric-footer text-amber-sub">Outstanding balance</div>
        </div>

        <div className="metric-card">
          <div className="metric-head">
            <span className="metric-title">Active Farmers</span>
            <span className="metric-icon icon-blue">👨‍🌾</span>
          </div>
          <div className="metric-val">
            {stats.farmerCount || farmers.length} <span className="metric-unit">Growers</span>
          </div>
          <div className="metric-footer">Registered across all villages</div>
        </div>
      </section>

      {/* MOBILE TAB NAVIGATION */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === "assistant" ? "active" : ""}`}
          onClick={() => setActiveTab("assistant")}
        >
          🤖 AI Assistant
        </button>
        <button
          className={`tab-btn ${activeTab === "farmers" ? "active" : ""}`}
          onClick={() => setActiveTab("farmers")}
        >
          📋 Farmer Ledger
        </button>
      </nav>

      {/* MAIN GRID */}
      <div className="main-grid">
        {/* LEFT COLUMN: AI ASSISTANT */}
        <section className={`panel ai-panel ${activeTab !== "assistant" ? "mobile-hidden" : ""}`}>
          <div className="panel-header">
            <div>
              <h2>AI Cane Accounts Assistant</h2>
              <p className="panel-subtext">Natural language answers via MCP & OpenAI</p>
            </div>
            <span className="tag-badge">⚡ Live</span>
          </div>

          {/* Suggested Queries */}
          <div className="prompts-container">
            <span className="prompts-label">Quick Queries:</span>
            <div className="prompts-list">
              <button
                className="prompt-btn"
                onClick={() =>
                  handleSend(
                    "Which farmers from Kopargaon village supply sugarcane, how many tons did they supply, and what is their pending payment?"
                  )
                }
              >
                📍 Kopargaon Farmers
              </button>
              <button
                className="prompt-btn"
                onClick={() =>
                  handleSend("What is the total sugarcane supplied and total pending payment across all farmers?")
                }
              >
                📊 Factory Summary
              </button>
              <button
                className="prompt-btn"
                onClick={() =>
                  handleSend("List all farmers who have pending payment greater than ₹50,000.")
                }
              >
                ⚠️ Dues &gt; ₹50K
              </button>
              <button
                className="prompt-btn"
                onClick={() =>
                  handleSend("Who are the top 3 highest sugarcane suppliers to Sanjivani Factory?")
                }
              >
                🏆 Top Suppliers
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="chat-window">
            {messages.map((m, i) => (
              <div key={i} className={`chat-entry ${m.role === "user" ? "entry-user" : "entry-assistant"}`}>
                <div className="avatar-icon">{m.role === "user" ? "👤" : "🤖"}</div>
                <div className="speech-bubble" dangerouslySetInnerHTML={renderMarkdown(m.content)} />
              </div>
            ))}

            {isThinking && (
              <div className="chat-entry entry-assistant">
                <div className="avatar-icon">🤖</div>
                <div className="speech-bubble loading-bubble">
                  <span className="spinner-pulse"></span>
                  <span>Fetching live records via MCP & OpenAI...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Row */}
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <input
              type="text"
              placeholder="Ask about farmer supplies or payments..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isThinking}
            />
            <button type="submit" disabled={isThinking || !inputQuery.trim()}>
              {isThinking ? "Thinking..." : "Ask AI"}
            </button>
          </form>
        </section>

        {/* RIGHT COLUMN: FARMERS DIRECTORY */}
        <section className={`panel table-panel ${activeTab !== "farmers" ? "mobile-hidden" : ""}`}>
          <div className="panel-header">
            <div>
              <h2>Farmer Supply & Settlement Ledger</h2>
              <p className="panel-subtext">Live records from Sanjivani Sugar Factory database</p>
            </div>
            <div className="counter-tag">{filteredFarmers.length} Farmers</div>
          </div>

          {/* Search & Filter Controls */}
          <div className="filters-bar">
            <div className="search-container">
              <span className="search-symbol">🔍</span>
              <input
                type="text"
                placeholder="Search by farmer name or village..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && <button className="dismiss-btn" onClick={() => setSearch("")}>✕</button>}
            </div>

            <div className="village-dropdown">
              <select value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)}>
                {villages.map((v) => (
                  <option key={v} value={v}>
                    {v === "ALL" ? "All Villages" : `Village: ${v}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Loading / Empty states */}
          {loading ? (
            <div className="loading-state">
              <span className="loading-spinner"></span>
              Loading farmer records...
            </div>
          ) : filteredFarmers.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📭</span>
              <span className="empty-state-text">No matching farmers found.</span>
            </div>
          ) : (
            <>
              {/* MOBILE: Card View */}
              <div className="mobile-cards">
                {filteredFarmers.map((f, idx) => (
                  <div key={idx} className="farmer-card">
                    <div className="farmer-card-header">
                      <span className="farmer-card-name">{f.name}</span>
                      <span className="farmer-card-village">{f.village}</span>
                    </div>
                    <div className="farmer-card-stats">
                      <div className="farmer-stat">
                        <span className="farmer-stat-label">Cane</span>
                        <span className="farmer-stat-value">{f.sugarcane_tons}T</span>
                      </div>
                      <div className="farmer-stat">
                        <span className="farmer-stat-label">Paid</span>
                        <span className="farmer-stat-value stat-green">{formatINR(f.amount_paid)}</span>
                      </div>
                      <div className="farmer-stat">
                        <span className="farmer-stat-label">Pending</span>
                        <span className="farmer-stat-value stat-amber">{formatINR(f.payment_pending)}</span>
                      </div>
                    </div>
                    <button
                      className="farmer-card-action"
                      onClick={() =>
                        handleSend(`What are the cane supply and payment settlement details for ${f.name} from ${f.village}?`)
                      }
                    >
                      🤖 Ask AI About {f.name.split(" ")[0]}
                    </button>
                  </div>
                ))}

                {/* Mobile Summary */}
                <div className="mobile-summary">
                  <div className="mobile-summary-item">
                    <span className="mobile-summary-label">Total Cane</span>
                    <span className="mobile-summary-value">{filteredTotalTons}T</span>
                  </div>
                  <div className="mobile-summary-item">
                    <span className="mobile-summary-label">Total Paid</span>
                    <span className="mobile-summary-value text-emerald">{formatINR(filteredTotalPaid)}</span>
                  </div>
                  <div className="mobile-summary-item">
                    <span className="mobile-summary-label">Pending</span>
                    <span className="mobile-summary-value text-amber">{formatINR(filteredTotalPending)}</span>
                  </div>
                </div>
              </div>

              {/* DESKTOP: Table View */}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Farmer Name</th>
                      <th>Village</th>
                      <th className="align-right">Cane (Tons)</th>
                      <th className="align-right">Paid Amount</th>
                      <th className="align-right">Pending Dues</th>
                      <th className="align-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFarmers.map((f, idx) => (
                      <tr key={idx}>
                        <td className="text-dimmed">{idx + 1}</td>
                        <td className="font-semibold text-slate">{f.name}</td>
                        <td>
                          <span className="village-pill">{f.village}</span>
                        </td>
                        <td className="align-right font-medium">
                          {f.sugarcane_tons} <span className="unit-tag">Tons</span>
                        </td>
                        <td className="align-right text-emerald font-semibold">
                          {formatINR(f.amount_paid)}
                        </td>
                        <td className="align-right text-amber font-semibold">
                          {formatINR(f.payment_pending)}
                        </td>
                        <td className="align-center">
                          <button
                            className="table-action-btn"
                            onClick={() =>
                              handleSend(`What are the cane supply and payment settlement details for ${f.name} from ${f.village}?`)
                            }
                          >
                            Ask AI
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tfoot-summary">
                      <td colSpan="3" className="font-bold">Total ({filteredFarmers.length} Farmers)</td>
                      <td className="align-right font-bold">{filteredTotalTons} Tons</td>
                      <td className="align-right font-bold text-emerald">{formatINR(filteredTotalPaid)}</td>
                      <td className="align-right font-bold text-amber">{formatINR(filteredTotalPending)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <span>Sanjivani Sugar Factory</span> • AI-Powered Cane Procurement & Accounts Portal • Kopargaon, Maharashtra
      </footer>
    </div>
  )
}

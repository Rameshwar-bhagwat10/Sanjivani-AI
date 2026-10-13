import { useState } from 'react'

// Helper: Format INR Currency
function formatINR(val) {
  return "₹" + Number(val || 0).toLocaleString("en-IN")
}

// Helper: Compute settlement percentage
function getSettlementPercent(paid, pending) {
  const total = Number(paid || 0) + Number(pending || 0)
  if (total <= 0) return 100
  return Math.min(100, Math.round((Number(paid || 0) / total) * 100))
}

// Markdown parser helper for inline formatting
function renderFormattedInline(text) {
  if (!text) return ""
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="highlight-bold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/(₹\s?[\d,]+)/g, '<span class="currency-tag">$1</span>')
    .replace(/(\b\d+\s?tons\b|\b\d+\s?T\b)/gi, '<span class="tons-tag">$1</span>')
}

// Markdown parser helper for structured sections
function parseMarkdownSections(markdownText) {
  if (!markdownText) return []
  
  const lines = markdownText.split("\n")
  const sections = []
  let currentSection = { title: "", lines: [] }

  for (let line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("### ")) {
      if (currentSection.lines.length > 0 || currentSection.title) {
        sections.push(currentSection)
      }
      currentSection = {
        title: trimmed.replace(/^###\s+/, ""),
        lines: [],
      }
    } else {
      currentSection.lines.push(line)
    }
  }

  if (currentSection.lines.length > 0 || currentSection.title) {
    sections.push(currentSection)
  }

  return sections
}

// Parser for Markdown tables
function parseMarkdownTable(lines) {
  const tableLines = lines.filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|"))
  if (tableLines.length < 2) return null

  const rows = tableLines.map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
  )

  // Exclude divider row (e.g., |---|---|)
  const header = rows[0]
  const dataRows = rows.slice(1).filter((r) => !r.every((c) => /^[-:]+$/.test(c)))

  return { header, rows: dataRows }
}

export default function AiStructuredOutput({
  content = "",
  toolCall = null,
  onFilterLedger = () => {},
  onAskPrompt = () => {},
}) {
  const [viewMode, setViewMode] = useState("table") // 'table' | 'cards'
  const [copied, setCopied] = useState(false)
  const [showMcpDetails, setShowMcpDetails] = useState(false)

  // 1. Extract records from toolCall if available
  const toolRecords =
    toolCall?.result?.records ||
    toolCall?.records ||
    (Array.isArray(toolCall?.result) ? toolCall.result : null) ||
    []

  const hasRecords = Array.isArray(toolRecords) && toolRecords.length > 0

  // 2. Compute aggregate metrics from records
  const totalCane = toolRecords.reduce((sum, r) => sum + (Number(r.sugarcane_tons) || 0), 0)
  const totalPaid = toolRecords.reduce((sum, r) => sum + (Number(r.amount_paid) || 0), 0)
  const totalPending = toolRecords.reduce((sum, r) => sum + (Number(r.payment_pending) || 0), 0)
  const overallSettlementPct = getSettlementPercent(totalPaid, totalPending)
  const highDuesList = toolRecords.filter((r) => Number(r.payment_pending) >= 50000)

  // Village breakdown if records span multiple
  const villageGroups = toolRecords.reduce((acc, r) => {
    const v = r.village || "Unknown"
    if (!acc[v]) acc[v] = { tons: 0, paid: 0, pending: 0, count: 0 }
    acc[v].tons += Number(r.sugarcane_tons) || 0
    acc[v].paid += Number(r.amount_paid) || 0
    acc[v].pending += Number(r.payment_pending) || 0
    acc[v].count += 1
    return acc
  }, {})
  const villageKeys = Object.keys(villageGroups)

  // 3. Parse markdown sections
  const sections = parseMarkdownSections(content)

  // 4. Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard?.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 5. Intelligent follow-up suggestions based on context
  const getFollowUpSuggestions = () => {
    const suggestions = []
    const villageArg = toolCall?.arguments?.village
    if (villageArg) {
      suggestions.push(`Who has highest pending dues in ${villageArg}?`)
      suggestions.push(`Compare ${villageArg} with Shirdi village`)
      suggestions.push("Show total factory summary")
    } else if (highDuesList.length > 0) {
      suggestions.push("Who are top 3 highest sugarcane suppliers?")
      suggestions.push("Show Kopargaon village farmers")
      suggestions.push("List all farmers with 100% payments completed")
    } else {
      suggestions.push("Which farmers have pending dues > ₹50,000?")
      suggestions.push("Show Kopargaon sugarcane suppliers")
      suggestions.push("Top 3 sugarcane suppliers")
    }
    return suggestions.slice(0, 3)
  }

  const followUps = getFollowUpSuggestions()

  return (
    <div className="ai-structured-card">
      {/* 1. TOP HEADER & PROVENANCE BAR */}
      <div className="ai-card-topbar">
        <div className="ai-card-title-wrap">
          <span className="ai-pulse-pill">
            <span className="pulse-circle"></span>
            AI Structured Intelligence
          </span>
          {toolCall?.name && (
            <span className="ai-tool-pill" title="Verified via live MCP Database Tool">
              ⚡ MCP: {toolCall.name}
            </span>
          )}
          {hasRecords && (
            <span className="ai-count-pill">{toolRecords.length} Records</span>
          )}
        </div>

        <div className="ai-topbar-actions">
          <button
            className="ai-action-btn"
            onClick={handleCopy}
            title="Copy answer to clipboard"
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>
          {toolCall && (
            <button
              className={`ai-action-btn ${showMcpDetails ? "active" : ""}`}
              onClick={() => setShowMcpDetails(!showMcpDetails)}
              title="Inspect MCP live query and data"
            >
              🔍 Details
            </button>
          )}
        </div>
      </div>

      {/* 2. OPTIONAL MCP LIVE QUERY INSPECTOR (EXPANDABLE) */}
      {showMcpDetails && toolCall && (
        <div className="mcp-inspector-box">
          <div className="inspector-head">
            <span>⚡ MCP Live Provenance & Database Inspection</span>
            <span className="badge-live">LIVE ATLAS</span>
          </div>
          <div className="inspector-body">
            <div className="inspector-row">
              <span className="inspector-label">Invoked Tool:</span>
              <code>{toolCall.name}</code>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Query Filters:</span>
              <code>{JSON.stringify(toolCall.arguments || {})}</code>
            </div>
            <div className="inspector-row">
              <span className="inspector-label">Records Returned:</span>
              <span>{toolRecords.length} verified farmer records</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. DYNAMIC METRIC KPI STRIP (IF RECORDS FOUND) */}
      {hasRecords && (
        <div className="ai-kpi-ribbon">
          <div className="ai-kpi-stat">
            <span className="kpi-label">🌾 Cane Volume</span>
            <span className="kpi-value">{totalCane.toLocaleString("en-IN")} <span className="kpi-unit">Tons</span></span>
          </div>
          <div className="ai-kpi-stat">
            <span className="kpi-label">💰 Settled Amount</span>
            <span className="kpi-value text-emerald">{formatINR(totalPaid)}</span>
          </div>
          <div className="ai-kpi-stat">
            <span className="kpi-label">⏳ Pending Dues</span>
            <span className="kpi-value text-amber">{formatINR(totalPending)}</span>
          </div>
          <div className="ai-kpi-stat">
            <span className="kpi-label">📊 Disbursal Rate</span>
            <div className="kpi-progress-wrap">
              <div className="kpi-progress-bar">
                <div
                  className="kpi-progress-fill"
                  style={{ width: `${overallSettlementPct}%` }}
                ></div>
              </div>
              <span className="kpi-pct">{overallSettlementPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. SECTIONS PARSER (Executive Summary, Insights, etc.) */}
      {sections.map((sec, secIdx) => {
        const textContent = sec.lines.join("\n")
        const tableData = parseMarkdownTable(sec.lines)
        const isTableSection = Boolean(tableData)
        const isSummary = /summary|overview/i.test(sec.title)
        const isInsights = /insight|action|recommend/i.test(sec.title)
        const isAlert = /alert|priority|urgent/i.test(sec.title)

        // If it's a table section and we ALREADY have rich toolRecords, we will display our interactive table below instead of duplicate raw markdown table
        if (isTableSection && hasRecords) {
          return null
        }

        return (
          <div
            key={secIdx}
            className={`ai-content-section ${
              isSummary
                ? "section-summary"
                : isAlert
                ? "section-alert"
                : isInsights
                ? "section-insights"
                : ""
            }`}
          >
            {sec.title && (
              <div className="section-header-title">
                {isSummary && <span className="sec-icon">📌</span>}
                {isAlert && <span className="sec-icon">⚠️</span>}
                {isInsights && <span className="sec-icon">💡</span>}
                {!isSummary && !isAlert && !isInsights && <span className="sec-icon">📋</span>}
                <span>{sec.title}</span>
              </div>
            )}

            {/* If there's an embedded Markdown Table without toolRecords */}
            {isTableSection ? (
              <div className="ai-table-responsive-wrapper">
                <table className="ai-custom-table">
                  <thead>
                    <tr>
                      {tableData.header.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            dangerouslySetInnerHTML={{
                              __html: renderFormattedInline(cell),
                            }}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="section-body-text"
                dangerouslySetInnerHTML={{
                  __html: renderFormattedInline(
                    sec.lines
                      .map((l) => {
                        const t = l.trim()
                        if (t.startsWith("- ") || t.startsWith("* ")) {
                          return `<div class="ai-bullet-item"><span class="bullet-dot"></span><span>${t.substring(2)}</span></div>`
                        }
                        if (/^\d+\.\s/.test(t)) {
                          return `<div class="ai-bullet-item num-bullet"><span>${t}</span></div>`
                        }
                        if (t.length === 0) return ""
                        return `<p class="ai-paragraph">${t}</p>`
                      })
                      .join("")
                  ),
                }}
              />
            )}
          </div>
        )
      })}

      {/* 5. INTERACTIVE FARMER DATA PRESENTATION (WHEN RECORDS ARE PRESENT) */}
      {hasRecords && (
        <div className="ai-data-block">
          {/* Controls: Table vs Card View + Filter Quick Action */}
          <div className="ai-data-header">
            <div className="ai-data-title">
              <span>🌾 Detailed Supply & Payment Records</span>
              <span className="badge-sub">{toolRecords.length} records</span>
            </div>

            <div className="ai-view-switch-tabs">
              <button
                className={`switch-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
                title="Table Layout"
              >
                📋 Table View
              </button>
              <button
                className={`switch-btn ${viewMode === "cards" ? "active" : ""}`}
                onClick={() => setViewMode("cards")}
                title="Card Layout"
              >
                🗂️ Cards View
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: INTERACTIVE TABLE */}
          {viewMode === "table" && (
            <div className="ai-table-responsive-wrapper">
              <table className="ai-custom-table interactive-table">
                <thead>
                  <tr>
                    <th>Farmer Name</th>
                    <th>Village</th>
                    <th>Cane (Tons)</th>
                    <th>Amount Paid</th>
                    <th>Pending Dues</th>
                    <th>Settled %</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {toolRecords.map((farmer, fIdx) => {
                    const pct = getSettlementPercent(
                      farmer.amount_paid,
                      farmer.payment_pending
                    )
                    const isHighDue = Number(farmer.payment_pending) >= 50000

                    return (
                      <tr key={fIdx} className={isHighDue ? "row-high-due" : ""}>
                        <td className="cell-farmer-name">
                          <span className="farmer-avatar-letter">
                            {farmer.name?.charAt(0) || "F"}
                          </span>
                          <span className="farmer-name-text">{farmer.name}</span>
                        </td>
                        <td>
                          <button
                            className="tag-village-clickable"
                            onClick={() => onFilterLedger({ village: farmer.village })}
                            title={`Filter ledger by ${farmer.village}`}
                          >
                            📍 {farmer.village}
                          </button>
                        </td>
                        <td className="cell-num">
                          <strong>{farmer.sugarcane_tons}</strong> T
                        </td>
                        <td className="cell-num text-emerald">
                          {formatINR(farmer.amount_paid)}
                        </td>
                        <td className="cell-num">
                          <span
                            className={
                              isHighDue ? "due-badge badge-red" : "due-badge badge-amber"
                            }
                          >
                            {formatINR(farmer.payment_pending)}
                          </span>
                        </td>
                        <td className="cell-progress">
                          <div className="table-mini-progress">
                            <div
                              className="table-mini-fill"
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <span className="table-mini-pct">{pct}%</span>
                        </td>
                        <td>
                          <button
                            className="btn-sync-ledger"
                            onClick={() =>
                              onFilterLedger({
                                search: farmer.name,
                                village: farmer.village,
                              })
                            }
                            title="Highlight in Main Ledger"
                          >
                            🔍 Ledger
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW MODE 2: CARDS GRID */}
          {viewMode === "cards" && (
            <div className="ai-farmer-cards-grid">
              {toolRecords.map((farmer, fIdx) => {
                const pct = getSettlementPercent(
                  farmer.amount_paid,
                  farmer.payment_pending
                )
                const isHighDue = Number(farmer.payment_pending) >= 50000

                return (
                  <div
                    key={fIdx}
                    className={`ai-record-card ${isHighDue ? "card-high-due" : ""}`}
                  >
                    <div className="record-card-top">
                      <div className="record-farmer-info">
                        <div className="record-avatar">
                          {farmer.name?.charAt(0) || "F"}
                        </div>
                        <div>
                          <div className="record-name">{farmer.name}</div>
                          <button
                            className="record-village-pill"
                            onClick={() => onFilterLedger({ village: farmer.village })}
                          >
                            📍 {farmer.village}
                          </button>
                        </div>
                      </div>
                      {isHighDue && <span className="alert-chip">⚠️ High Due</span>}
                    </div>

                    <div className="record-stats-strip">
                      <div className="record-stat-box">
                        <span className="stat-label">Cane</span>
                        <span className="stat-val">{farmer.sugarcane_tons} T</span>
                      </div>
                      <div className="record-stat-box">
                        <span className="stat-label">Paid</span>
                        <span className="stat-val text-emerald">
                          {formatINR(farmer.amount_paid)}
                        </span>
                      </div>
                      <div className="record-stat-box">
                        <span className="stat-label">Pending</span>
                        <span
                          className={`stat-val ${
                            isHighDue ? "text-red" : "text-amber"
                          }`}
                        >
                          {formatINR(farmer.payment_pending)}
                        </span>
                      </div>
                    </div>

                    <div className="record-card-footer">
                      <div className="record-progress-row">
                        <span>Settled: {pct}%</span>
                        <div className="record-progress-track">
                          <div
                            className="record-progress-bar"
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                      <button
                        className="btn-card-sync"
                        onClick={() =>
                          onFilterLedger({
                            search: farmer.name,
                            village: farmer.village,
                          })
                        }
                      >
                        🔍 View in Ledger
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* VILLAGE DISTRIBUTION BARS (IF MULTIPLE VILLAGES) */}
          {villageKeys.length > 1 && (
            <div className="ai-village-dist-box">
              <span className="dist-title">🏘️ Regional Village Breakdown</span>
              <div className="dist-bars-list">
                {villageKeys.map((vName) => {
                  const vData = villageGroups[vName]
                  const vShare =
                    totalCane > 0 ? Math.round((vData.tons / totalCane) * 100) : 0
                  return (
                    <div key={vName} className="dist-bar-item">
                      <div className="dist-bar-label">
                        <button
                          className="village-link-btn"
                          onClick={() => onFilterLedger({ village: vName })}
                        >
                          {vName} ({vData.count} farmers)
                        </button>
                        <span className="dist-bar-num">
                          {vData.tons} T ({vShare}%) • Dues: {formatINR(vData.pending)}
                        </span>
                      </div>
                      <div className="dist-bar-track">
                        <div
                          className="dist-bar-fill"
                          style={{ width: `${vShare}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. HIGH DUES URGENCY CALLOUT IF APPLICABLE */}
      {highDuesList.length > 0 && (
        <div className="ai-urgency-banner">
          <div className="urgency-icon">⚠️</div>
          <div className="urgency-content">
            <span className="urgency-headline">
              Outstanding Dues Alert (&gt; ₹50,000)
            </span>
            <p className="urgency-text">
              {highDuesList.length} farmer(s) have pending balances exceeding ₹50,000,
              totaling {formatINR(highDuesList.reduce((s, f) => s + f.payment_pending, 0))}.
              Prioritize account reconciliation for these suppliers.
            </p>
          </div>
        </div>
      )}

      {/* 7. CONTEXTUAL FOLLOW-UP SMART CHIPS */}
      {followUps.length > 0 && (
        <div className="ai-followup-container">
          <span className="followup-heading">💡 Recommended Follow-up Queries:</span>
          <div className="followup-chips">
            {followUps.map((promptText, pIdx) => (
              <button
                key={pIdx}
                className="followup-chip-btn"
                onClick={() => onAskPrompt(promptText)}
              >
                <span>{promptText}</span>
                <span className="chip-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

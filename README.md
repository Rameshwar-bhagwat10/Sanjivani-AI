# 🌾 Sanjivani-AI: Sugarcane Procurement & Accounts Assistant

An AI-powered agricultural intelligence system for **Sanjivani Sugar Factory (सहकारी साखर कारखाना • Kopargaon)** built with the **Model Context Protocol (MCP)**, **MongoDB Atlas**, **OpenAI (GPT-4o-mini)**, and a **React 18** client dashboard.

---

## 🌟 Key Architecture

- **MCP Server (`server.ts`)**: Implements the official `@modelcontextprotocol/sdk` to securely expose MongoDB database queries as standardized AI tools (`get_farmers_data`) over `stdio`.
- **MCP Client (`client.ts`)**: Spawns the MCP server, translates Zod tool definitions into OpenAI Function Calling format, and orchestrates LLM tool invocations.
- **Web Backend (`app.ts`)**: Serves the REST API endpoints (`/api/farmers`, `/api/stats`, `/api/chat`) and static production assets on Port 3000.
- **React Frontend (`public/`)**: Modern React 18 dashboard with a professional light theme, KPI metrics, dynamic search & filtering, and a conversational AI Copilot.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/Rameshwar-bhagwat10/Sanjivani-AI.git
cd Sanjivani-AI
```

### 2. Install dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm --prefix public install
```

### 3. Configure environment variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update your credentials in `.env`:
```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.b1zh8h3.mongodb.net/sanjivani_sugar?retryWrites=true&w=majority&appName=Cluster0
OPENAI_API_KEY=sk-...
PORT=3000
```

### 4. Run the application
```bash
# Start the full application (Backend + React UI)
npm run ui

# (Optional) Run the React Vite Dev Server with Hot Reloading
npm run dev:react
```

Open **`http://localhost:3000`** in your browser.

---

## 🛠️ Technology Stack

- **Model Context Protocol**: `@modelcontextprotocol/sdk` (v1.32.1)
- **Database**: MongoDB Atlas (`mongodb` native driver v6)
- **AI / LLM**: OpenAI (`gpt-4o-mini` with Function Calling)
- **Frontend**: React 18, Vite, Vanilla CSS Design System
- **Language**: TypeScript & Node.js ES Modules

import "dotenv/config";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MongoClient } from "mongodb";
import OpenAI from "openai";
import { SAMPLE_FARMERS } from "./server.js";

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const DB_NAME = "sanjivani_sugar";
const COLLECTION_NAME = "farmers";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(root, "public", "dist");
const publicDir = existsSync(distDir) ? distDir : join(root, "public");

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Global MCP Client and OpenAI Client
let mcpClient: Client | null = null;
let mcpTools: OpenAI.ChatCompletionTool[] = [];
let mongoClient: MongoClient | null = null;

// Initialize MCP Client Connection
async function initMcpClient() {
  console.log("⚡ Starting MCP Client and connecting to server.ts...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"],
    env: process.env as Record<string, string>,
  });

  mcpClient = new Client(
    { name: "sanjivani-web-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  const { tools } = await mcpClient.listTools();
  console.log(`✅ MCP Client connected! Discovered ${tools.length} tool(s):`);
  tools.forEach((t) => console.log(`   - ${t.name}`));

  mcpTools = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

// Direct DB Helper for UI stats and table
async function getFarmersData() {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URI, { tls: true, family: 4 } as any);
      await mongoClient.connect();
    }
    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
    const results = await collection.find({}, { projection: { _id: 0 } }).toArray();
    if (results.length > 0) return results;
  } catch (err) {
    console.error("DB notice, using fallback data:", (err as Error).message);
    if (mongoClient) {
      await mongoClient.close(true).catch(() => {});
      mongoClient = null;
    }
  }
  return SAMPLE_FARMERS;
}

// Helpers for JSON responses and reading body
function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

// Static File Server
async function serveStatic(pathname: string, res: ServerResponse) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "text/plain",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

// Start HTTP Server
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // 1. GET /api/farmers - Live Farmers List
  if (req.method === "GET" && url.pathname === "/api/farmers") {
    try {
      const farmers = await getFarmersData();
      sendJson(res, 200, { farmers });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  // 2. GET /api/stats - Aggregated KPI Metrics
  if (req.method === "GET" && url.pathname === "/api/stats") {
    try {
      const farmers = await getFarmersData();
      const totalTons = farmers.reduce((sum, f) => sum + (Number(f.sugarcane_tons) || 0), 0);
      const totalPaid = farmers.reduce((sum, f) => sum + (Number(f.amount_paid) || 0), 0);
      const totalPending = farmers.reduce((sum, f) => sum + (Number(f.payment_pending) || 0), 0);

      sendJson(res, 200, {
        totalTons,
        totalPaid,
        totalPending,
        farmerCount: farmers.length,
      });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  // 3. POST /api/chat - AI Query via MCP Tool
  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const { question } = await readBody(req);
      if (!question) {
        sendJson(res, 400, { error: "Question is required." });
        return;
      }

      if (!mcpClient) {
        await initMcpClient();
      }

      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are the intelligent AI executive assistant for Sanjivani Sugar Factory (सहकारी साखर कारखाना • Kopargaon).
You analyze sugarcane procurement, farmer ledger accounts, tonnage supplied, amounts disbursed, and outstanding dues.

FORMATTING INSTRUCTIONS:
- Be clear, structured, and professional.
- Start with a concise executive summary or key answer.
- When listing multiple farmers or comparative data, provide a clean markdown table with columns:
  | Farmer Name | Village | Cane Supplied (Tons) | Amount Paid (₹) | Pending Dues (₹) | Status |
- Use '### Summary', '### Key Metrics', '### Farmer Records', and '### Actionable Insights' section headers where appropriate.
- Highlight monetary amounts with ₹ (INR) and tonnages with Tons.
- If pending payment is high (> ₹50,000), add a recommendation or priority note.`,
        },
        { role: "user", content: question },
      ];

      console.log(`\n💬 Received Question: "${question}"`);
      const initialResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: mcpTools,
      });

      const assistantMessage = initialResponse.choices[0].message;
      let toolCallData: { name: string; arguments: any; result: any } | null = null;

      // Handle MCP Tool Invocation if requested by OpenAI
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type === "function") {
            const funcName = toolCall.function.name;
            const funcArgs = JSON.parse(toolCall.function.arguments);

            console.log(`⚡ OpenAI invoked MCP tool: "${funcName}" with args:`, funcArgs);

            // Execute via MCP Client
            const toolResult = await mcpClient!.callTool({
              name: funcName,
              arguments: funcArgs,
            });

            const contentText =
              Array.isArray(toolResult.content) && toolResult.content[0]?.type === "text"
                ? (toolResult.content[0] as { type: "text"; text: string }).text
                : JSON.stringify(toolResult.content);

            let parsedResult: any = contentText;
            try {
              parsedResult = JSON.parse(contentText);
            } catch {}

            toolCallData = {
              name: funcName,
              arguments: funcArgs,
              result: parsedResult,
            };

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: contentText,
            });
          }
        }

        // Get final AI answer with tool data
        const finalResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
        });

        const answer = finalResponse.choices[0].message.content;
        sendJson(res, 200, { answer, toolCall: toolCallData });
        return;
      }

      // Direct response if no tool was needed
      sendJson(res, 200, { answer: assistantMessage.content, toolCall: null });
    } catch (err) {
      console.error("Chat API error:", err);
      sendJson(res, 500, { error: (err as Error).message });
    }
    return;
  }

  // 4. Serve static frontend files
  if (req.method === "GET") {
    await serveStatic(url.pathname, res);
    return;
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

// Start listening and initialize MCP Client
server.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(`🌱 SANJIVANI SUGAR FACTORY AI DASHBOARD ONLINE`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`=================================================`);
  try {
    await initMcpClient();
  } catch (err) {
    console.error("Failed to initialize MCP Client on startup:", err);
  }
});

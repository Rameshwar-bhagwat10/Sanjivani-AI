import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";

// Hardcoded question about Sanjivani Sugar Factory farmers
const HARDCODED_QUESTION =
  "Which farmers from Kopargaon village supply sugarcane to Sanjivani Sugar Factory, how many tons did they supply, and what is the total pending payment for them?";

async function main() {
  console.log("=================================================");
  console.log("🌱 SANJIVANI SUGAR FACTORY - MCP AI APPLICATION");
  console.log("=================================================");
  console.log(`\n📌 Hardcoded Question:\n"${HARDCODED_QUESTION}"\n`);

  // 1. Initialize MCP Client with Stdio transport running our server.ts
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"],
    env: process.env as Record<string, string>,
  });

  const mcpClient = new Client(
    { name: "sanjivani-sugar-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("⏳ Connecting MCP Client to MCP Server...");
  await mcpClient.connect(transport);
  console.log("✅ Connected to MCP Server via Stdio Transport!\n");

  // 2. Discover available tools from the MCP Server
  const { tools } = await mcpClient.listTools();
  console.log(`🛠️ Discovered ${tools.length} tool(s) from MCP Server:`);
  tools.forEach((t) => console.log(`   - ${t.name}: ${t.description}`));

  // Convert MCP tool schemas into OpenAI Function Calling format
  const openAITools: OpenAI.ChatCompletionTool[] = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));

  // 3. Check OpenAI API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    console.log("\n⚠️ OPENAI_API_KEY is not set in .env!");
    console.log("👉 Add your OpenAI API key in .env to run the full AI reasoning step.");
    console.log("💡 MCP Server (connected to MongoDB Atlas) & MCP Client handshake is 100% verified!\n");
    await mcpClient.close();
    return;
  }

  // 4. Send question to OpenAI with MCP tools
  const openai = new OpenAI({ apiKey });
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an AI assistant for Sanjivani Sugar Factory management. Use the provided tools to query farmer information from the database and answer questions accurately.",
    },
    { role: "user", content: HARDCODED_QUESTION },
  ];

  console.log("\n🤖 Sending question and MCP tools to OpenAI...");
  const initialResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools: openAITools,
  });

  const assistantMessage = initialResponse.choices[0].message;

  // 5. Handle Tool Calls requested by OpenAI
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type === "function") {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n⚡ OpenAI requested MCP tool: "${functionName}"`);
        console.log("   Arguments:", JSON.stringify(functionArgs));

        // Call the tool on the MCP Server (which queries MongoDB Atlas)
        const toolResult = await mcpClient.callTool({
          name: functionName,
          arguments: functionArgs,
        });

        console.log("   Tool Execution Output Received from MCP Server:");
        console.log(JSON.stringify(toolResult, null, 2));

        // Feed tool result back to OpenAI
        const contentStr =
          Array.isArray(toolResult.content) && toolResult.content[0]?.type === "text"
            ? (toolResult.content[0] as { type: "text"; text: string }).text
            : JSON.stringify(toolResult.content);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: contentStr,
        });
      }
    }

    // 6. Generate final AI response incorporating tool data
    console.log("\n🤖 Generating final response from OpenAI...");
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    console.log("\n=================================================");
    console.log("📋 FINAL AI ANSWER (OpenAI via MCP & MongoDB Atlas)");
    console.log("=================================================");
    console.log(finalResponse.choices[0].message.content);
    console.log("=================================================\n");
  } else {
    console.log("\n🤖 Direct OpenAI Response (No tool call required):");
    console.log(assistantMessage.content);
  }

  // Cleanly close MCP Client connection
  await mcpClient.close();
}

main().catch((err) => {
  console.error("❌ Application Error:", err);
  process.exit(1);
});

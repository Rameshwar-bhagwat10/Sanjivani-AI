import { MongoClient } from "mongodb";
import OpenAI from "openai";

const MONGO_URI = process.env.MONGO_URI || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const DB_NAME = "sanjivani_sugar";
const COLLECTION_NAME = "farmers";

const SAMPLE_FARMERS = [
  { name: "Rameshwar Patil", village: "Kopargaon", sugarcane_tons: 120, amount_paid: 300000, payment_pending: 60000 },
  { name: "Suresh Deshmukh", village: "Shirdi", sugarcane_tons: 85, amount_paid: 200000, payment_pending: 55000 },
  { name: "Anand Shinde", village: "Rahata", sugarcane_tons: 210, amount_paid: 550000, payment_pending: 80000 },
  { name: "Vikas Pawar", village: "Kopargaon", sugarcane_tons: 45, amount_paid: 110000, payment_pending: 25000 },
  { name: "Sunil Ghadge", village: "Kolpewadi", sugarcane_tons: 160, amount_paid: 400000, payment_pending: 80000 },
  { name: "Balasaheb Kadam", village: "Singnapur", sugarcane_tons: 95, amount_paid: 250000, payment_pending: 35000 },
  { name: "Dnyaneshwar Jagtap", village: "Yesgaon", sugarcane_tons: 310, amount_paid: 800000, payment_pending: 130000 },
  { name: "Santosh More", village: "Kopargaon", sugarcane_tons: 70, amount_paid: 180000, payment_pending: 30000 },
  { name: "Pandurang Gaikwad", village: "Pohegaon", sugarcane_tons: 140, amount_paid: 360000, payment_pending: 60000 },
  { name: "Ashok Kale", village: "Puntamba", sugarcane_tons: 180, amount_paid: 470000, payment_pending: 70000 },
];

let cachedClient: MongoClient | null = null;

async function queryDatabase(filter: { village?: string; name?: string }) {
  if (MONGO_URI) {
    try {
      if (!cachedClient) {
        cachedClient = new MongoClient(MONGO_URI, { tls: true, family: 4 } as any);
        await cachedClient.connect();
      }

      const query: Record<string, unknown> = {};
      if (filter.village) query.village = new RegExp(filter.village, "i");
      if (filter.name) query.name = new RegExp(filter.name, "i");

      const collection = cachedClient.db(DB_NAME).collection(COLLECTION_NAME);
      const results = await collection.find(query, { projection: { _id: 0 } }).toArray();
      if (results && results.length > 0) return results;
    } catch (error) {
      console.error("MongoDB Atlas query error, using fallback data:", error);
    }
  }

  // Fallback to sample data
  return SAMPLE_FARMERS.filter((f) => {
    const matchVillage = filter.village ? f.village.toLowerCase().includes(filter.village.toLowerCase()) : true;
    const matchName = filter.name ? f.name.toLowerCase().includes(filter.name.toLowerCase()) : true;
    return matchVillage && matchName;
  });
}

// OpenAI Tool Definition
const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_farmers_data",
      description: "Fetch farmers supplying sugarcane to Sanjivani Sugar Factory. Filter by village or farmer name, or omit filters to get all farmers.",
      parameters: {
        type: "object",
        properties: {
          village: {
            type: "string",
            description: "Filter by village name (e.g., Kopargaon, Shirdi, Rahata, Kolpewadi)",
          },
          name: {
            type: "string",
            description: "Filter by farmer name",
          },
        },
      },
    },
  },
];

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const question = body?.question;

    if (!question) {
      return res.status(400).json({ error: "Question is required." });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing. Please add it to your Vercel Project Settings under Environment Variables.",
      });
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

    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
    });

    const assistantMessage = initialResponse.choices[0].message;
    let toolCallData: { name: string; arguments: any; result: any } | null = null;

    // Handle tool call if requested by OpenAI
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type === "function") {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          const dbResults = await queryDatabase(args);

          toolCallData = {
            name: toolCall.function.name,
            arguments: args,
            result: {
              factory: "Sanjivani Sugar Factory",
              count: dbResults.length,
              records: dbResults,
            },
          };

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              factory: "Sanjivani Sugar Factory",
              count: dbResults.length,
              records: dbResults,
            }),
          });
        }
      }

      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
      });

      return res.status(200).json({
        answer: finalResponse.choices[0].message.content,
        toolCall: toolCallData,
      });
    }

    return res.status(200).json({
      answer: assistantMessage.content,
      toolCall: null,
    });
  } catch (error) {
    console.error("Vercel /api/chat error:", error);
    return res.status(500).json({
      error: (error as Error).message,
    });
  }
}

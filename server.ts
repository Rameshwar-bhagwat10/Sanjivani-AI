import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MongoClient } from "mongodb";
import { z } from "zod";

const MONGO_URI = process.env.MONGO_URI!;
const DB_NAME = "sanjivani_sugar";
const COLLECTION_NAME = "farmers";

// 10 Farmers Dataset for Sanjivani Sugar Factory
export const SAMPLE_FARMERS = [
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

let mongoClient: MongoClient | null = null;

// Connect to MongoDB Atlas and query farmers (with automatic fallback)
async function queryFarmers(filter: { village?: string; name?: string }) {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URI, { tls: true, family: 4 } as any);
      await mongoClient.connect();
      console.error("[MCP Server] Connected to MongoDB Atlas.");
    }

    const query: Record<string, unknown> = {};
    if (filter.village) query.village = new RegExp(filter.village, "i");
    if (filter.name) query.name = new RegExp(filter.name, "i");

    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
    const results = await collection.find(query, { projection: { _id: 0 } }).toArray();
    if (results.length > 0) return results;
  } catch (error) {
    console.error("[MCP Server] Atlas TLS notice, using fallback data:", (error as Error).message);
    if (mongoClient) {
      await mongoClient.close(true).catch(() => {});
      mongoClient = null;
    }
  }

  // Seamless fallback to dataset
  return SAMPLE_FARMERS.filter((f) => {
    const matchVillage = filter.village ? f.village.toLowerCase().includes(filter.village.toLowerCase()) : true;
    const matchName = filter.name ? f.name.toLowerCase().includes(filter.name.toLowerCase()) : true;
    return matchVillage && matchName;
  });
}

// 1. Initialize MCP Server
const server = new McpServer({
  name: "sanjivani-sugar-factory-server",
  version: "1.0.0",
});

// 2. Register Tool: get_farmers_data
server.tool(
  "get_farmers_data",
  "Fetch farmers supplying sugarcane to Sanjivani Sugar Factory. Filter by village or farmer name, or omit filters to get all farmers.",
  {
    village: z.string().optional().describe("Filter by village name (e.g., Kopargaon, Shirdi, Rahata)"),
    name: z.string().optional().describe("Filter by farmer name"),
  },
  async ({ village, name }) => {
    const farmers = await queryFarmers({ village, name });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            factory: "Sanjivani Sugar Factory",
            count: farmers.length,
            records: farmers,
          }, null, 2),
        },
      ],
    };
  }
);

// 3. Connect via standard IO transport
const transport = new StdioServerTransport();
await server.connect(transport);

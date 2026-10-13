import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "";
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

async function getClient() {
  if (!MONGO_URI) return null;
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URI, { tls: true, family: 4 } as any);
    await cachedClient.connect();
  }
  return cachedClient;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let list = SAMPLE_FARMERS;

  try {
    const client = await getClient();
    if (client) {
      const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
      const results = await collection.find({}, { projection: { _id: 0 } }).toArray();
      if (results && results.length > 0) {
        list = results as any;
      }
    }
  } catch (error) {
    console.error("MongoDB Atlas error, using fallback for stats:", error);
  }

  const totalTons = list.reduce((sum, f) => sum + (Number(f.sugarcane_tons) || 0), 0);
  const totalPaid = list.reduce((sum, f) => sum + (Number(f.amount_paid) || 0), 0);
  const totalPending = list.reduce((sum, f) => sum + (Number(f.payment_pending) || 0), 0);

  return res.status(200).json({
    totalTons,
    totalPaid,
    totalPending,
    farmerCount: list.length,
  });
}

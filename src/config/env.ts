import dotenv from "dotenv";

dotenv.config();

const { PORT = "5000", MONGODB_URI, CLIENT_URL = "http://localhost:3000" } = process.env;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Add it to your .env file.");
}

export const env = {
  port: Number(PORT),
  mongoUri: MONGODB_URI,
  clientUrl: CLIENT_URL,
};
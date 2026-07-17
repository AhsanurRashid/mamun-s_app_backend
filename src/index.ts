import app from "./app";
import { connectToDatabase } from "./config/db";
import { env } from "./config/env";

const startServer = async () => {
  try {
    await connectToDatabase(env.mongoUri);
    app.listen(env.port, () => {
      console.log(`Server listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error("Failed to start backend", error);
    process.exit(1);
  }
};

void startServer();
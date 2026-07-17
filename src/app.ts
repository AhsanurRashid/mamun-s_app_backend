import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";

import customerRouter from "./routes/customer.routes";
import productRouter from "./routes/product.routes";
import saleRouter from "./routes/sale.routes";

const app = express();
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use("/api/products", productRouter);
app.use("/api/customers", customerRouter);
app.use("/api/sales", saleRouter);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Backend is running.",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  res.status(500).json({
    message: "Something went wrong.",
    error: error instanceof Error ? error.message : "Unknown error",
  });
};

app.use(errorHandler);

export default app;
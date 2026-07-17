import { Router } from "express";

import {
  createSale,
  deleteSale,
  getSaleById,
  getSaleStats,
  getSales,
  updateSale,
} from "../controllers/sale.controller";

const router = Router();

router.get("/", getSales);
router.get("/stats", getSaleStats);
router.get("/:id", getSaleById);
router.post("/", createSale);
router.patch("/:id", updateSale);
router.delete("/:id", deleteSale);

export default router;

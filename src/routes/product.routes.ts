import { Router } from "express";

import {
  createProduct,
  createProductsBulk,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "../controllers/product.controller";

const router = Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", createProduct);
router.post("/bulk", createProductsBulk);
router.patch("/:id", updateProduct);
router.delete("/:id", deleteProduct);

export default router;
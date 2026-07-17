import type { Request, Response } from "express";
import mongoose from "mongoose";

import ProductModel from "../models/product.model";

const getSingleQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildValidationErrors = (body: Record<string, unknown>) => {
  const errors: string[] = [];

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    errors.push("name is required and must be a non-empty string.");
  }

  if (typeof body.productNo !== "number" || Number.isNaN(body.productNo) || body.productNo < 1) {
    errors.push("productNo is required and must be a number greater than or equal to 1.");
  }

  if (typeof body.price !== "number" || Number.isNaN(body.price) || body.price < 0) {
    errors.push("price is required and must be a number greater than or equal to 0.");
  }

  return errors;
};

const normalizeProductPayload = (body: Record<string, unknown>) => ({
  name: typeof body.name === "string" ? body.name.trim() : body.name,
  price: body.price,
  productNo: body.productNo,
});

export const createProduct = async (req: Request, res: Response) => {
  const payload = normalizeProductPayload(req.body as Record<string, unknown>);
  const validationErrors = buildValidationErrors(payload);

  if (validationErrors.length > 0) {
    res.status(400).json({
      errors: validationErrors,
      message: "Validation failed.",
    });
    return;
  }

  try {
    const product = await ProductModel.create({
      name: (payload.name as string).trim(),
      price: payload.price as number,
      productNo: payload.productNo as number,
    });

    res.status(201).json({
      data: product,
      message: "Product created successfully.",
    });
  } catch (error) {
    if (error instanceof mongoose.Error && error.name === "ValidationError") {
      res.status(400).json({
        message: "Validation failed.",
      });
      return;
    }

    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      res.status(409).json({
        message: "Product number already exists.",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to create product.",
    });
  }
};

export const createProductsBulk = async (req: Request, res: Response) => {
  const rawProducts = (req.body as { products?: unknown }).products;

  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    res.status(400).json({
      message: "products must be a non-empty array.",
    });
    return;
  }

  if (rawProducts.length > 500) {
    res.status(400).json({
      message: "You can upload at most 500 products at a time.",
    });
    return;
  }

  const normalizedProducts = rawProducts.map((product, index) => {
    const normalized = normalizeProductPayload(product as Record<string, unknown>);

    return {
      index,
      product: normalized,
      validationErrors: buildValidationErrors(normalized),
    };
  });

  const invalidRows = normalizedProducts
    .filter((item) => item.validationErrors.length > 0)
    .map((item) => ({
      errors: item.validationErrors,
      row: item.index + 1,
    }));

  const seenProductNumbers = new Map<number, number>();
  const duplicateRows: Array<{ errors: string[]; row: number }> = [];

  normalizedProducts.forEach((item) => {
    if (typeof item.product.productNo !== "number" || Number.isNaN(item.product.productNo)) {
      return;
    }

    const existingRow = seenProductNumbers.get(item.product.productNo);

    if (existingRow !== undefined) {
      duplicateRows.push({
        errors: [`productNo ${item.product.productNo} is duplicated in this upload batch.`],
        row: item.index + 1,
      });
      return;
    }

    seenProductNumbers.set(item.product.productNo, item.index + 1);
  });

  if (invalidRows.length > 0 || duplicateRows.length > 0) {
    res.status(400).json({
      errors: [...invalidRows, ...duplicateRows],
      message: "Bulk validation failed.",
    });
    return;
  }

  try {
    const insertedProducts = await ProductModel.insertMany(
      normalizedProducts.map((item) => item.product),
      { ordered: false },
    );

    res.status(201).json({
      data: insertedProducts,
      message: `${insertedProducts.length} products created successfully.`,
      meta: {
        failedCount: 0,
        insertedCount: insertedProducts.length,
        requestedCount: normalizedProducts.length,
      },
    });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        message: "Bulk validation failed.",
      });
      return;
    }

    if (error && typeof error === "object" && "writeErrors" in error) {
      const writeErrors = (error as { writeErrors?: Array<{ code?: number; err?: { op?: { productNo?: number } } }> }).writeErrors ?? [];
      const duplicateKeyErrors = writeErrors
        .filter((item) => item.code === 11000)
        .map((item) => item.err?.op?.productNo)
        .filter((value): value is number => typeof value === "number");

      res.status(409).json({
        message: duplicateKeyErrors.length > 0
          ? `Some product numbers already exist: ${duplicateKeyErrors.join(", ")}.`
          : "Some products could not be created.",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to create products in bulk.",
    });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  const rawPage = Number(getSingleQueryValue(req.query.page) ?? 1);
  const rawLimit = Number(getSingleQueryValue(req.query.limit) ?? 20);
  const rawMinPrice = getSingleQueryValue(req.query.minPrice);
  const rawMaxPrice = getSingleQueryValue(req.query.maxPrice);
  const rawSearch = getSingleQueryValue(req.query.search);
  const rawSortBy = getSingleQueryValue(req.query.sortBy);
  const rawSortOrder = getSingleQueryValue(req.query.sortOrder);

  if (!Number.isInteger(rawPage) || rawPage < 1) {
    res.status(400).json({
      message: "page must be an integer greater than or equal to 1.",
    });
    return;
  }

  if (!Number.isInteger(rawLimit) || rawLimit < 1) {
    res.status(400).json({
      message: "limit must be an integer greater than or equal to 1.",
    });
    return;
  }

  const minPrice = rawMinPrice === undefined ? undefined : Number(rawMinPrice);
  const maxPrice = rawMaxPrice === undefined ? undefined : Number(rawMaxPrice);

  if (minPrice !== undefined && (Number.isNaN(minPrice) || minPrice < 0)) {
    res.status(400).json({
      message: "minPrice must be a number greater than or equal to 0.",
    });
    return;
  }

  if (maxPrice !== undefined && (Number.isNaN(maxPrice) || maxPrice < 0)) {
    res.status(400).json({
      message: "maxPrice must be a number greater than or equal to 0.",
    });
    return;
  }

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    res.status(400).json({
      message: "minPrice cannot be greater than maxPrice.",
    });
    return;
  }

  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";

  if (search.length > 100) {
    res.status(400).json({
      message: "search can be at most 100 characters.",
    });
    return;
  }

  const allowedSortBy = ["productNo", "name", "price", "createdAt", "updatedAt"] as const;
  const sortBy = typeof rawSortBy === "string" && rawSortBy.length > 0 ? rawSortBy : "productNo";

  if (!allowedSortBy.includes(sortBy as (typeof allowedSortBy)[number])) {
    res.status(400).json({
      message: "sortBy must be one of productNo, name, price, createdAt, updatedAt.",
    });
    return;
  }

  const sortOrder = typeof rawSortOrder === "string" ? rawSortOrder.toLowerCase() : "asc";

  if (sortOrder !== "asc" && sortOrder !== "desc") {
    res.status(400).json({
      message: "sortOrder must be either asc or desc.",
    });
    return;
  }

  const filter: Record<string, unknown> = {};

  if (search.length > 0) {
    const escapedSearch = escapeRegex(search);
    const orConditions: Record<string, unknown>[] = [
      {
        name: {
          $options: "i",
          $regex: escapedSearch,
        },
      },
    ];

    if (/^\d+$/.test(search)) {
      orConditions.push({ productNo: Number(search) });
    }

    filter.$or = orConditions;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};

    if (minPrice !== undefined) {
      priceFilter.$gte = minPrice;
    }

    if (maxPrice !== undefined) {
      priceFilter.$lte = maxPrice;
    }

    filter.price = priceFilter;
  }

  const maxLimit = 100;
  const limit = Math.min(rawLimit, maxLimit);
  const page = rawPage;
  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const data = await ProductModel.find(filter)
    .sort({ [sortBy]: sortDirection, productNo: 1 })
    .skip(skip)
    .limit(limit);
  const total = await ProductModel.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  res.status(200).json({
    data,
    meta: {
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
      page,
      search,
      sortBy,
      sortOrder,
      total,
      totalPages,
    },
  });
};

export const getProductById = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid product id.",
    });
    return;
  }

  const product = await ProductModel.findById(id);

  if (!product) {
    res.status(404).json({
      message: "Product not found.",
    });
    return;
  }

  res.status(200).json({
    data: product,
  });
};

export const updateProduct = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid product id.",
    });
    return;
  }

  const updates = req.body as Record<string, unknown>;
  const allowedUpdates = ["name", "price", "productNo"] as const;
  const updateKeys = Object.keys(updates);
  const hasInvalidKey = updateKeys.some((key) => !allowedUpdates.includes(key as (typeof allowedUpdates)[number]));

  if (hasInvalidKey) {
    res.status(400).json({
      message: "Only name, price, and productNo can be updated.",
    });
    return;
  }

  const product = await ProductModel.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });

  if (!product) {
    res.status(404).json({
      message: "Product not found.",
    });
    return;
  }

  res.status(200).json({
    data: product,
    message: "Product updated successfully.",
  });
};

export const deleteProduct = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid product id.",
    });
    return;
  }

  const deletedProduct = await ProductModel.findByIdAndDelete(id);

  if (!deletedProduct) {
    res.status(404).json({
      message: "Product not found.",
    });
    return;
  }

  res.status(200).json({
    message: "Product deleted successfully.",
  });
};
import type { Request, Response } from "express";
import mongoose from "mongoose";

import CustomerModel from "../models/customer.model";
import ProductModel from "../models/product.model";
import SaleModel from "../models/sale.model";

type RawSaleItem = {
  discountPercent?: unknown;
  productId?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

type SaleItemInput = {
  discountPercent: number;
  productId: string;
  quantity: number;
  unitPrice: number;
};

const getSingleQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNumber = (value: unknown) => (typeof value === "number" ? value : Number(value));

const parseDateOnly = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getRangeTotal = async (match: Record<string, unknown>) => {
  const summary = await SaleModel.aggregate<{ total: number }>([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: "$grandTotal" },
      },
    },
  ]);

  return summary[0]?.total ?? 0;
};

const normalizeSaleItems = (items: unknown[]): SaleItemInput[] => {
  return items.map((item) => {
    const raw = (item ?? {}) as RawSaleItem;

    return {
      discountPercent: raw.discountPercent === undefined ? 0 : toNumber(raw.discountPercent),
      productId: typeof raw.productId === "string" ? raw.productId.trim() : "",
      quantity: toNumber(raw.quantity),
      unitPrice: toNumber(raw.unitPrice),
    };
  });
};

const validateSalePayload = (body: Record<string, unknown>) => {
  const errors: string[] = [];

  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";

  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
    errors.push("customerId is required and must be a valid id.");
  }

  const rawItems = body.items;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    errors.push("items must be a non-empty array.");
    return { customerId, errors, items: [] as SaleItemInput[] };
  }

  const items = normalizeSaleItems(rawItems);

  items.forEach((item, index) => {
    const row = index + 1;

    if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
      errors.push(`items[${row}].productId must be a valid id.`);
    }

    if (!Number.isFinite(item.quantity) || item.quantity < 1) {
      errors.push(`items[${row}].quantity must be 1 or greater.`);
    }

    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      errors.push(`items[${row}].unitPrice must be 0 or greater.`);
    }

    if (!Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100) {
      errors.push(`items[${row}].discountPercent must be between 0 and 100.`);
    }
  });

  return { customerId, errors, items };
};

const buildSaleDocument = async (customerId: string, items: SaleItemInput[]) => {
  const customer = await CustomerModel.findById(customerId);

  if (!customer) {
    return {
      error: "Customer not found.",
    } as const;
  }

  const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
  const products = await ProductModel.find({
    _id: {
      $in: uniqueProductIds,
    },
  });

  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const missingProducts = uniqueProductIds.filter((id) => !productMap.has(id));

  if (missingProducts.length > 0) {
    return {
      error: `Some products were not found: ${missingProducts.join(", ")}.`,
    } as const;
  }

  const hydratedItems = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const gross = item.quantity * item.unitPrice;
    const discountAmount = (gross * item.discountPercent) / 100;
    const lineTotal = Math.max(0, gross - discountAmount);

    return {
      discountPercent: item.discountPercent,
      lineTotal,
      product: product._id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    };
  });

  const subtotal = hydratedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const grandTotal = hydratedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalDiscount = Math.max(0, subtotal - grandTotal);

  return {
    sale: {
      customer: customer._id,
      customerName: customer.name,
      grandTotal,
      items: hydratedItems,
      subtotal,
      totalDiscount,
    },
  } as const;
};

export const createSale = async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const validation = validateSalePayload(body);

  if (validation.errors.length > 0) {
    res.status(400).json({
      errors: validation.errors,
      message: "Validation failed.",
    });
    return;
  }

  const saleDocument = await buildSaleDocument(validation.customerId, validation.items);

  if ("error" in saleDocument) {
    res.status(400).json({
      message: saleDocument.error,
    });
    return;
  }

  const note = typeof body.note === "string" ? body.note.trim() : undefined;

  try {
    const sale = await SaleModel.create({
      ...saleDocument.sale,
      note: note && note.length > 0 ? note : undefined,
    });

    res.status(201).json({
      data: sale,
      message: "Sale created successfully.",
    });
  } catch {
    res.status(500).json({
      message: "Failed to create sale.",
    });
  }
};

export const getSales = async (req: Request, res: Response) => {
  const rawPage = Number(getSingleQueryValue(req.query.page) ?? 1);
  const rawLimit = Number(getSingleQueryValue(req.query.limit) ?? 20);
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

  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";

  if (search.length > 100) {
    res.status(400).json({
      message: "search can be at most 100 characters.",
    });
    return;
  }

  const allowedSortBy = ["createdAt", "grandTotal", "subtotal", "updatedAt"] as const;
  const sortBy = typeof rawSortBy === "string" && rawSortBy.length > 0 ? rawSortBy : "createdAt";

  if (!allowedSortBy.includes(sortBy as (typeof allowedSortBy)[number])) {
    res.status(400).json({
      message: "sortBy must be one of createdAt, grandTotal, subtotal, updatedAt.",
    });
    return;
  }

  const sortOrder = typeof rawSortOrder === "string" ? rawSortOrder.toLowerCase() : "desc";

  if (sortOrder !== "asc" && sortOrder !== "desc") {
    res.status(400).json({
      message: "sortOrder must be either asc or desc.",
    });
    return;
  }

  const filter: Record<string, unknown> = {};

  if (search.length > 0) {
    const escapedSearch = escapeRegex(search);

    filter.$or = [
      {
        customerName: {
          $options: "i",
          $regex: escapedSearch,
        },
      },
      {
        "items.productName": {
          $options: "i",
          $regex: escapedSearch,
        },
      },
    ];
  }

  const maxLimit = 100;
  const limit = Math.min(rawLimit, maxLimit);
  const page = rawPage;
  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const data = await SaleModel.find(filter)
    .sort({ [sortBy]: sortDirection, createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const total = await SaleModel.countDocuments(filter);
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

export const getSaleStats = async (req: Request, res: Response) => {
  const now = new Date();
  const rawYear = getSingleQueryValue(req.query.year);
  const currentYear = now.getUTCFullYear();
  let selectedYear = currentYear;

  if (rawYear !== undefined) {
    if (typeof rawYear !== "string" || !/^-?\d+$/.test(rawYear.trim())) {
      res.status(400).json({
        message: "year must be a valid integer year.",
      });
      return;
    }

    const yearValue = Number(rawYear.trim());

    if (!Number.isInteger(yearValue)) {
      res.status(400).json({
        message: "year must be a valid integer year.",
      });
      return;
    }

    selectedYear = yearValue;
  }

  const yearStart = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(selectedYear + 1, 0, 1, 0, 0, 0, 0));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const rawStartDate = getSingleQueryValue(req.query.startDate);
  const rawEndDate = getSingleQueryValue(req.query.endDate);

  let range: { endDate: string; startDate: string; total: number } | null = null;

  if (rawStartDate !== undefined || rawEndDate !== undefined) {
    if (typeof rawStartDate !== "string" || typeof rawEndDate !== "string") {
      res.status(400).json({
        message: "startDate and endDate must be valid date strings in YYYY-MM-DD format.",
      });
      return;
    }

    const startDateText = rawStartDate.trim();
    const endDateText = rawEndDate.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateText) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateText)) {
      res.status(400).json({
        message: "startDate and endDate must follow YYYY-MM-DD format.",
      });
      return;
    }

    const startDate = parseDateOnly(startDateText);
    const endDate = parseDateOnly(endDateText);

    if (!startDate || !endDate) {
      res.status(400).json({
        message: "startDate and endDate must be valid dates.",
      });
      return;
    }

    const endBoundary = new Date(endDate);
    endBoundary.setUTCDate(endBoundary.getUTCDate() + 1);

    if (startDate.getTime() >= endBoundary.getTime()) {
      res.status(400).json({
        message: "startDate must be earlier than or equal to endDate.",
      });
      return;
    }

    const rangeTotal = await getRangeTotal({
      createdAt: {
        $gte: startDate,
        $lt: endBoundary,
      },
    });

    range = {
      endDate: endDateText,
      startDate: startDateText,
      total: rangeTotal,
    };
  }

  const [lifetimeTotal, yearlyTotal, monthlyTotal] = await Promise.all([
    getRangeTotal({}),
    getRangeTotal({
      createdAt: {
        $gte: yearStart,
        $lt: yearEnd,
      },
    }),
    getRangeTotal({
      createdAt: {
        $gte: monthStart,
      },
    }),
  ]);

  res.status(200).json({
    data: {
      lifetimeTotal,
      monthlyTotal,
      range,
      selectedYear,
      yearlyTotal,
    },
  });
};

export const getSaleById = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid sale id.",
    });
    return;
  }

  const sale = await SaleModel.findById(id);

  if (!sale) {
    res.status(404).json({
      message: "Sale not found.",
    });
    return;
  }

  res.status(200).json({
    data: sale,
  });
};

export const updateSale = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid sale id.",
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const validation = validateSalePayload(body);

  if (validation.errors.length > 0) {
    res.status(400).json({
      errors: validation.errors,
      message: "Validation failed.",
    });
    return;
  }

  const saleDocument = await buildSaleDocument(validation.customerId, validation.items);

  if ("error" in saleDocument) {
    res.status(400).json({
      message: saleDocument.error,
    });
    return;
  }

  const note = typeof body.note === "string" ? body.note.trim() : undefined;

  const sale = await SaleModel.findByIdAndUpdate(
    id,
    {
      ...saleDocument.sale,
      note: note && note.length > 0 ? note : undefined,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!sale) {
    res.status(404).json({
      message: "Sale not found.",
    });
    return;
  }

  res.status(200).json({
    data: sale,
    message: "Sale updated successfully.",
  });
};

export const deleteSale = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid sale id.",
    });
    return;
  }

  const deletedSale = await SaleModel.findByIdAndDelete(id);

  if (!deletedSale) {
    res.status(404).json({
      message: "Sale not found.",
    });
    return;
  }

  res.status(200).json({
    message: "Sale deleted successfully.",
  });
};

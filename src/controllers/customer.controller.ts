import type { Request, Response } from "express";
import mongoose from "mongoose";

import CustomerModel from "../models/customer.model";

const getSingleQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePhone = (value: string) => value.replace(/\s+/g, "").trim();

const buildValidationErrors = (body: Record<string, unknown>) => {
  const errors: string[] = [];

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    errors.push("name is required and must be a non-empty string.");
  }

  if (typeof body.phone !== "string" || normalizePhone(body.phone).length < 5) {
    errors.push("phone is required and must be a valid phone number.");
  }

  if (body.address !== undefined && typeof body.address !== "string") {
    errors.push("address must be a string.");
  }

  return errors;
};

const normalizeCustomerPayload = (body: Record<string, unknown>) => ({
  address: typeof body.address === "string" ? body.address.trim() : body.address,
  name: typeof body.name === "string" ? body.name.trim() : body.name,
  phone: typeof body.phone === "string" ? normalizePhone(body.phone) : body.phone,
});

export const createCustomer = async (req: Request, res: Response) => {
  const payload = normalizeCustomerPayload(req.body as Record<string, unknown>);
  const validationErrors = buildValidationErrors(payload);

  if (validationErrors.length > 0) {
    res.status(400).json({
      errors: validationErrors,
      message: "Validation failed.",
    });
    return;
  }

  try {
    const customer = await CustomerModel.create({
      address: payload.address as string | undefined,
      name: payload.name as string,
      phone: payload.phone as string,
    });

    res.status(201).json({
      data: customer,
      message: "Customer created successfully.",
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
        message: "Phone number already exists.",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to create customer.",
    });
  }
};

export const getCustomers = async (req: Request, res: Response) => {
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

  const allowedSortBy = ["name", "phone", "createdAt", "updatedAt"] as const;
  const sortBy = typeof rawSortBy === "string" && rawSortBy.length > 0 ? rawSortBy : "createdAt";

  if (!allowedSortBy.includes(sortBy as (typeof allowedSortBy)[number])) {
    res.status(400).json({
      message: "sortBy must be one of name, phone, createdAt, updatedAt.",
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
        name: {
          $options: "i",
          $regex: escapedSearch,
        },
      },
      {
        phone: {
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

  const data = await CustomerModel.find(filter)
    .sort({ [sortBy]: sortDirection, createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const total = await CustomerModel.countDocuments(filter);
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

export const getCustomerById = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid customer id.",
    });
    return;
  }

  const customer = await CustomerModel.findById(id);

  if (!customer) {
    res.status(404).json({
      message: "Customer not found.",
    });
    return;
  }

  res.status(200).json({
    data: customer,
  });
};

export const updateCustomer = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid customer id.",
    });
    return;
  }

  const updates = normalizeCustomerPayload(req.body as Record<string, unknown>) as Record<string, unknown>;
  const allowedUpdates = ["name", "phone", "address"] as const;
  const updateKeys = Object.keys(updates).filter((key) => updates[key] !== undefined);
  const hasInvalidKey = updateKeys.some((key) => !allowedUpdates.includes(key as (typeof allowedUpdates)[number]));

  if (hasInvalidKey) {
    res.status(400).json({
      message: "Only name, phone, and address can be updated.",
    });
    return;
  }

  if (updateKeys.length === 0) {
    res.status(400).json({
      message: "At least one field is required to update.",
    });
    return;
  }

  const validationErrors = buildValidationErrors({
    ...updates,
    name: updates.name ?? "ok",
    phone: updates.phone ?? "01234",
  });

  if (validationErrors.length > 0) {
    res.status(400).json({
      errors: validationErrors,
      message: "Validation failed.",
    });
    return;
  }

  try {
    const customer = await CustomerModel.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!customer) {
      res.status(404).json({
        message: "Customer not found.",
      });
      return;
    }

    res.status(200).json({
      data: customer,
      message: "Customer updated successfully.",
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      res.status(409).json({
        message: "Phone number already exists.",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to update customer.",
    });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      message: "Invalid customer id.",
    });
    return;
  }

  const deletedCustomer = await CustomerModel.findByIdAndDelete(id);

  if (!deletedCustomer) {
    res.status(404).json({
      message: "Customer not found.",
    });
    return;
  }

  res.status(200).json({
    message: "Customer deleted successfully.",
  });
};

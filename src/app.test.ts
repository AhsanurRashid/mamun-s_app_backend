import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import app from "./app";

test("GET /api/health returns backend status", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = (await response.json()) as {
    message: string;
    status: string;
    timestamp: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.message, "Backend is running.");
  assert.ok(body.timestamp);
});

test("POST /api/products validates required fields", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/products`, {
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 400);
});

test("GET /api/products validates pagination query", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/products?page=0&limit=10`);
  const body = (await response.json()) as {
    message: string;
  };

  assert.equal(response.status, 400);
  assert.equal(body.message, "page must be an integer greater than or equal to 1.");
});

test("POST /api/products/bulk validates products array", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/products/bulk`, {
    body: JSON.stringify({ products: [] }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as { message: string };

  assert.equal(response.status, 400);
  assert.equal(body.message, "products must be a non-empty array.");
});

test("GET /api/products validates sortBy query", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/products?sortBy=invalidField`);
  const body = (await response.json()) as {
    message: string;
  };

  assert.equal(response.status, 400);
  assert.equal(body.message, "sortBy must be one of productNo, name, price, createdAt, updatedAt.");
});

test("POST /api/customers validates required fields", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/customers`, {
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 400);
});

test("GET /api/customers validates sortBy query", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/customers?sortBy=invalidField`);
  const body = (await response.json()) as {
    message: string;
  };

  assert.equal(response.status, 400);
  assert.equal(body.message, "sortBy must be one of name, phone, createdAt, updatedAt.");
});

test("POST /api/sales validates required fields", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/sales`, {
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 400);
});

test("GET /api/sales validates sortBy query", async (t) => {
  const server = app.listen(0);

  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  );

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/sales?sortBy=invalidField`);
  const body = (await response.json()) as {
    message: string;
  };

  assert.equal(response.status, 400);
  assert.equal(body.message, "sortBy must be one of createdAt, grandTotal, subtotal, updatedAt.");
});
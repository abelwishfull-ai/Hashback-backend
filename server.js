const express = require("express");
const cors = require("cors");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;
const PALPLUSS_API_KEY = process.env.PALPLUSS_API_KEY || "";
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || "";

// In-memory store for transactions (replace with a DB in production)
const transactions = {};

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Helper: Make HTTPS request to PalPluss API ───────────────────────────────

function palplussRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyData = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${PALPLUSS_API_KEY}:`).toString("base64");

    const options = {
      hostname: "api.palpluss.com",
      port: 443,
      path: `/v1${path}`,
      method: method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (bodyData) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyData);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (bodyData) {
      req.write(bodyData);
    }

    req.end();
  });
}

// ─── Helper: Format error message as plain text ───────────────────────────────

function formatError(err, context) {
  if (typeof err === "string") return `Error: ${err}`;

  const parts = [`Error during ${context || "request"}.`];

  if (err.message) parts.push(`Message: ${err.message}`);
  if (err.code) parts.push(`Code: ${err.code}`);
  if (err.error) {
    if (err.error.message) parts.push(`API Error: ${err.error.message}`);
    if (err.error.code) parts.push(`API Code: ${err.error.code}`);
    if (err.error.details && Object.keys(err.error.details).length > 0) {
      parts.push(`Details: ${JSON.stringify(err.error.details)}`);
    }
  }
  if (err.requestId) parts.push(`Request ID (for support): ${err.requestId}`);

  return parts.join("\n");
}

// ─── Helper: Generate HTML Receipt ────────────────────────────────────────────

function buildReceipt(txn) {
  const statusColor =
    txn.status === "SUCCESS"
      ? "#16a34a"
      : txn.status === "FAILED"
        ? "#dc2626"
        : "#d97706";

  const statusEmoji =
    txn.status === "SUCCESS"
      ? "✅"
      : txn.status === "FAILED"
        ? "❌"
        : "⏳";

  const date = txn.completedAt
    ? new Date(txn.completedAt).toLocaleString("en-KE", {
        timeZone: "Africa/Nairobi",
        dateStyle: "long",
        timeStyle: "medium",
      })
    : new Date().toLocaleString("en-KE", {
        timeZone: "Africa/Nairobi",
        dateStyle: "long",
        timeStyle: "medium",
      });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .receipt {
      background: #ffffff;
      border-radius: 16px;
      width: 100%;
      max-width: 420px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(0,0,0,0.4);
    }
    .header {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white;
      padding: 28px 24px 20px;
      text-align: center;
    }
    .header .logo {
      font-size: 36px;
      margin-bottom: 6px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .header p {
      font-size: 13px;
      opacity: 0.85;
      margin-top: 4px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${statusColor};
      color: white;
      font-weight: 700;
      font-size: 14px;
      padding: 6px 18px;
      border-radius: 999px;
      margin-top: 12px;
      letter-spacing: 0.5px;
    }
    .amount-block {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      text-align: center;
      padding: 20px 24px;
      border-bottom: 2px dashed #d1d5db;
    }
    .amount-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 600;
    }
    .amount-value {
      font-size: 42px;
      font-weight: 800;
      color: #15803d;
      margin-top: 4px;
    }
    .amount-currency {
      font-size: 20px;
      font-weight: 600;
      color: #16a34a;
    }
    .details {
      padding: 20px 24px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .row:last-child { border-bottom: none; }
    .row-label {
      font-size: 12px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      flex-shrink: 0;
      padding-right: 12px;
    }
    .row-value {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
      text-align: right;
      word-break: break-all;
    }
    .footer {
      background: #f9fafb;
      text-align: center;
      padding: 16px 24px;
      border-top: 2px dashed #d1d5db;
    }
    .footer p {
      font-size: 11px;
      color: #9ca3af;
      line-height: 1.6;
    }
    .footer .powered {
      font-weight: 700;
      color: #6b7280;
    }
    .watermark {
      font-size: 10px;
      color: #d1d5db;
      margin-top: 8px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">📱</div>
      <h1>M-Pesa Payment Receipt</h1>
      <p>Powered by PalPluss</p>
      <div class="status-badge">${statusEmoji} ${txn.status || "PENDING"}</div>
    </div>

    <div class="amount-block">
      <div class="amount-label">Amount Paid</div>
      <div class="amount-value">
        <span class="amount-currency">KES </span>${Number(txn.amount || 0).toLocaleString("en-KE")}
      </div>
    </div>

    <div class="details">
      <div class="row">
        <span class="row-label">Customer</span>
        <span class="row-value">${txn.customerName || "—"}</span>
      </div>
      <div class="row">
        <span class="row-label">Phone</span>
        <span class="row-value">${txn.phone || "—"}</span>
      </div>
      <div class="row">
        <span class="row-label">Transaction ID</span>
        <span class="row-value" style="font-family:monospace;font-size:12px;">${txn.transactionId || "—"}</span>
      </div>
      ${
        txn.mpesaReceiptNumber
          ? `<div class="row">
        <span class="row-label">M-Pesa Ref</span>
        <span class="row-value" style="font-weight:700;color:#15803d;">${txn.mpesaReceiptNumber}</span>
      </div>`
          : ""
      }
      <div class="row">
        <span class="row-label">Date &amp; Time</span>
        <span class="row-value">${date}</span>
      </div>
      ${
        txn.resultDesc
          ? `<div class="row">
        <span class="row-label">Note</span>
        <span class="row-value" style="color:${statusColor};">${txn.resultDesc}</span>
      </div>`
          : ""
      }
    </div>

    <div class="footer">
      <p class="powered">PalPluss Payment Services</p>
      <p>This is an official payment receipt.<br/>Keep it for your records.</p>
      <p class="watermark">Generated on ${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Payment server is running." });
});

// ── POST /pay ── Initiate STK Push ────────────────────────────────────────────
app.post("/pay", async (req, res) => {
  const { name, phone, amount } = req.body;

  // Validate inputs
  if (!name || String(name).trim() === "") {
    return res
      .status(400)
      .type("text")
      .send("Error: Customer name is required.");
  }
  if (!phone || String(phone).trim() === "") {
    return res
      .status(400)
      .type("text")
      .send("Error: Phone number is required.");
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res
      .status(400)
      .type("text")
      .send("Error: A valid amount greater than 0 is required.");
  }
  if (!PALPLUSS_API_KEY) {
    return res
      .status(500)
      .type("text")
      .send(
        "Error: PALPLUSS_API_KEY is not configured on the server. Contact the administrator."
      );
  }
  if (!CALLBACK_BASE_URL) {
    return res
      .status(500)
      .type("text")
      .send(
        "Error: CALLBACK_BASE_URL is not configured on the server. Contact the administrator."
      );
  }

  const callbackUrl = `${CALLBACK_BASE_URL.replace(/\/$/, "")}/webhook`;

  try {
    const response = await palplussRequest("POST", "/payments/stk", {
      amount: Number(amount),
      phone: String(phone).trim(),
      accountReference: `DEP-${Date.now()}`,
      transactionDesc: `Deposit by ${String(name).trim()}`,
      callbackUrl,
    });

    if (response.body.success === false) {
      const errMsg = formatError(response.body, "STK Push initiation");
      return res.status(response.statusCode || 400).type("text").send(errMsg);
    }

    const txnData = response.body.data || {};
    const txnId = txnData.transactionId;

    // Store transaction metadata
    transactions[txnId] = {
      transactionId: txnId,
      customerName: String(name).trim(),
      phone: txnData.phone || String(phone).trim(),
      amount: txnData.amount || Number(amount),
      currency: txnData.currency || "KES",
      status: txnData.status || "PENDING",
      createdAt: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message:
        "STK Push sent successfully. Please check your phone and enter your M-Pesa PIN to complete the payment.",
      transactionId: txnId,
      phone: txnData.phone,
      amount: txnData.amount,
      currency: txnData.currency || "KES",
      status: txnData.status || "PENDING",
    });
  } catch (err) {
    const errMsg = formatError(
      err,
      "connecting to payment gateway (STK Push)"
    );
    return res.status(500).type("text").send(errMsg);
  }
});

// ── POST /webhook ── PalPluss callback handler ────────────────────────────────
app.post("/webhook", (req, res) => {
  const payload = req.body;

  const txn = payload.transaction || {};
  const txnId = txn.id;

  if (txnId && transactions[txnId]) {
    transactions[txnId].status = txn.status || transactions[txnId].status;
    transactions[txnId].resultCode = txn.result_code;
    transactions[txnId].resultDesc = txn.result_desc;
    transactions[txnId].mpesaReceiptNumber =
      txn.mpesa_receipt_number || txn.mpesaReceiptNumber;
    transactions[txnId].completedAt = new Date().toISOString();
  } else if (txnId) {
    // Store even if we don't have the original metadata
    transactions[txnId] = {
      transactionId: txnId,
      status: txn.status,
      amount: txn.amount,
      phone: txn.phone_number,
      resultCode: txn.result_code,
      resultDesc: txn.result_desc,
      mpesaReceiptNumber: txn.mpesa_receipt_number || txn.mpesaReceiptNumber,
      currency: txn.currency || "KES",
      completedAt: new Date().toISOString(),
    };
  }

  // Always return 200 to PalPluss so it doesn't retry
  return res.status(200).json({ received: true });
});

// ── GET /status/:transactionId ── Poll transaction status ─────────────────────
app.get("/status/:transactionId", async (req, res) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    return res
      .status(400)
      .type("text")
      .send("Error: Transaction ID is required.");
  }

  // Check local store first
  const local = transactions[transactionId];
  if (local && (local.status === "SUCCESS" || local.status === "FAILED")) {
    return res.status(200).json({
      success: true,
      transactionId,
      status: local.status,
      amount: local.amount,
      currency: local.currency || "KES",
      phone: local.phone,
      customerName: local.customerName,
      resultCode: local.resultCode,
      resultDesc: local.resultDesc,
      mpesaReceiptNumber: local.mpesaReceiptNumber,
    });
  }

  // Otherwise poll PalPluss API
  if (!PALPLUSS_API_KEY) {
    return res
      .status(500)
      .type("text")
      .send(
        "Error: PALPLUSS_API_KEY is not configured on the server. Cannot query status."
      );
  }

  try {
    const response = await palplussRequest(
      "GET",
      `/transactions/${transactionId}`
    );

    if (response.body.success === false) {
      const errMsg = formatError(response.body, "fetching transaction status");
      return res.status(response.statusCode || 400).type("text").send(errMsg);
    }

    const txn = response.body.data || {};

    // Merge API response into local store
    if (transactions[transactionId]) {
      transactions[transactionId].status = txn.status || "PENDING";
      transactions[transactionId].resultCode = txn.resultCode || txn.result_code;
      transactions[transactionId].resultDesc = txn.resultDesc || txn.result_desc;
      transactions[transactionId].mpesaReceiptNumber =
        txn.mpesaReceiptNumber || txn.mpesa_receipt_number;
    } else {
      transactions[transactionId] = {
        transactionId,
        status: txn.status || "PENDING",
        amount: txn.amount,
        phone: txn.phone,
        currency: txn.currency || "KES",
        resultCode: txn.resultCode || txn.result_code,
        resultDesc: txn.resultDesc || txn.result_desc,
        mpesaReceiptNumber: txn.mpesaReceiptNumber || txn.mpesa_receipt_number,
      };
    }

    return res.status(200).json({
      success: true,
      transactionId,
      status: txn.status || "PENDING",
      amount: txn.amount,
      currency: txn.currency || "KES",
      phone: txn.phone,
      customerName: transactions[transactionId]?.customerName,
      resultCode: txn.resultCode || txn.result_code,
      resultDesc: txn.resultDesc || txn.result_desc,
      mpesaReceiptNumber: txn.mpesaReceiptNumber || txn.mpesa_receipt_number,
    });
  } catch (err) {
    const errMsg = formatError(
      err,
      "connecting to payment gateway (status check)"
    );
    return res.status(500).type("text").send(errMsg);
  }
});

// ── GET /receipt/:transactionId ── Coloured HTML receipt ──────────────────────
app.get("/receipt/:transactionId", (req, res) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    return res
      .status(400)
      .type("text")
      .send("Error: Transaction ID is required.");
  }

  const txn = transactions[transactionId];

  if (!txn) {
    return res
      .status(404)
      .type("text")
      .send(
        `Error: No transaction found with ID "${transactionId}".\n` +
          `Make sure the STK Push was initiated through this server and the transaction ID is correct.`
      );
  }

  const html = buildReceipt(txn);
  return res.status(200).type("html").send(html);
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res
    .status(404)
    .type("text")
    .send(
      `Error: Endpoint "${req.method} ${req.path}" not found.\n\n` +
        `Available endpoints:\n` +
        `  POST /pay              — Initiate M-Pesa STK Push\n` +
        `  POST /webhook          — PalPluss payment callback (internal)\n` +
        `  GET  /status/:id       — Check transaction status\n` +
        `  GET  /receipt/:id      — Get coloured HTML payment receipt`
    );
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const errMsg = formatError(err, "server processing");
  return res.status(500).type("text").send(errMsg);
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Payment server running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /pay`);
  console.log(`  POST /webhook`);
  console.log(`  GET  /status/:transactionId`);
  console.log(`  GET  /receipt/:transactionId`);
});

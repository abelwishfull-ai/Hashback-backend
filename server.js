const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Replace these with your actual HashBack credentials
const HASHBACK_API_KEY = process.env.HASHBACK_API_KEY || "YOUR_API_KEY_HERE";
const HASHBACK_ACCOUNT_ID = process.env.HASHBACK_ACCOUNT_ID || "YOUR_ACCOUNT_ID_HERE";
const HASHBACK_BASE_URL = "https://api.hashback.co.ke";

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors()); // Allow all frontends
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Normalize phone number to 2547XXXXXXXX format.
 * Accepts: 07XXXXXXXX, 7XXXXXXXX, 2547XXXXXXXX
 */
function normalizePhone(phone) {
  const cleaned = String(phone).trim().replace(/\s+/g, "");
  if (/^2547\d{8}$/.test(cleaned)) return cleaned;
  if (/^07\d{8}$/.test(cleaned)) return "254" + cleaned.slice(1);
  if (/^7\d{8}$/.test(cleaned)) return "254" + cleaned;
  return null;
}

/**
 * Extract a readable error message from an axios error or plain Error.
 */
function extractErrorMessage(err) {
  if (err.response) {
    const data = err.response.data;
    if (typeof data === "string") return data;
    if (data && data.message) return data.message;
    if (data && data.error) {
      if (typeof data.error === "string") return data.error;
      if (data.error.message) return data.error.message;
    }
    return `API responded with status ${err.response.status}: ${JSON.stringify(data)}`;
  }
  if (err.request) return "No response received from payment gateway. Please check your internet connection.";
  return err.message || "An unknown error occurred.";
}

/**
 * Build a coloured HTML receipt string.
 */
function buildReceipt(data) {
  const {
    name,
    phone,
    amount,
    transactionId,
    receipt,
    transactionDate,
    reference,
  } = data;

  const date = transactionDate
    ? new Date(String(transactionDate).replace(
        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
        "$1-$2-$3T$4:$5:$6"
      )).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })
    : new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Receipt</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #f0fdf4;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .receipt {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
    }
    .receipt-header {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white;
      padding: 28px 24px;
      text-align: center;
    }
    .receipt-header .check-icon {
      font-size: 48px;
      margin-bottom: 8px;
    }
    .receipt-header h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .receipt-header p {
      font-size: 13px;
      opacity: 0.85;
      margin-top: 4px;
    }
    .receipt-body {
      padding: 24px;
    }
    .amount-block {
      background: #f0fdf4;
      border: 2px solid #bbf7d0;
      border-radius: 12px;
      text-align: center;
      padding: 20px;
      margin-bottom: 20px;
    }
    .amount-block .label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .amount-block .amount {
      font-size: 36px;
      font-weight: 800;
      color: #15803d;
    }
    .amount-block .currency {
      font-size: 18px;
      font-weight: 600;
      color: #16a34a;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
    }
    .details-table tr {
      border-bottom: 1px solid #f3f4f6;
    }
    .details-table tr:last-child {
      border-bottom: none;
    }
    .details-table td {
      padding: 10px 4px;
      font-size: 14px;
    }
    .details-table td:first-child {
      color: #6b7280;
      font-weight: 500;
      width: 40%;
    }
    .details-table td:last-child {
      color: #111827;
      font-weight: 600;
      text-align: right;
    }
    .receipt-footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 16px 24px;
      text-align: center;
    }
    .receipt-footer p {
      font-size: 12px;
      color: #9ca3af;
    }
    .badge {
      display: inline-block;
      background: #dcfce7;
      color: #15803d;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 999px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-header">
      <div class="check-icon">✅</div>
      <h1>Payment Successful</h1>
      <p>M-Pesa STK Push — Deposit Confirmed</p>
    </div>
    <div class="receipt-body">
      <div class="amount-block">
        <div class="label">Amount Paid</div>
        <div class="amount"><span class="currency">KES </span>${Number(amount).toLocaleString("en-KE")}</div>
      </div>
      <table class="details-table">
        <tr>
          <td>Customer Name</td>
          <td>${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td>Phone Number</td>
          <td>${escapeHtml(phone)}</td>
        </tr>
        <tr>
          <td>M-Pesa Receipt</td>
          <td>${escapeHtml(receipt || transactionId || "N/A")}</td>
        </tr>
        <tr>
          <td>Reference</td>
          <td>${escapeHtml(reference || "DEPOSIT")}</td>
        </tr>
        <tr>
          <td>Date &amp; Time</td>
          <td>${date}</td>
        </tr>
        <tr>
          <td>Status</td>
          <td><span class="badge">Paid</span></td>
        </tr>
      </table>
    </div>
    <div class="receipt-footer">
      <p>Thank you for your payment. Keep this receipt for your records.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

/**
 * POST /deposit
 * Body: { amount, phone, name }
 * Initiates STK push.
 * Returns: { success, message, checkout_id }
 */
app.post("/deposit", async (req, res) => {
  const { amount, phone, name } = req.body;

  // Validate inputs
  if (!amount || !phone || !name) {
    return res.status(400).type("text").send(
      "Missing required fields: amount, phone, and name are all required."
    );
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).type("text").send(
      "Invalid amount. Please enter a positive number greater than zero."
    );
  }

  const msisdn = normalizePhone(phone);
  if (!msisdn) {
    return res.status(400).type("text").send(
      "Invalid phone number. Please use the format 07XXXXXXXX or 2547XXXXXXXX."
    );
  }

  const reference = encodeURIComponent(`DEPOSIT-${Date.now()}`);

  try {
    const response = await axios.post(
      `${HASHBACK_BASE_URL}/initiatestk`,
      {
        api_key: HASHBACK_API_KEY,
        account_id: HASHBACK_ACCOUNT_ID,
        amount: String(Math.round(parsedAmount)),
        msisdn: msisdn,
        reference: reference,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );

    const data = response.data;

    if (!data.success) {
      const errMsg = data.message || "STK push was not initiated. Please try again.";
      return res.status(502).type("text").send(
        `Payment gateway error: ${errMsg}`
      );
    }

    return res.json({
      success: true,
      message: data.message || "STK push sent to your phone. Please enter your M-Pesa PIN.",
      checkout_id: data.checkout_id,
      phone: msisdn,
      amount: Math.round(parsedAmount),
      name: name,
    });
  } catch (err) {
    const message = extractErrorMessage(err);
    return res.status(502).type("text").send(
      `Failed to initiate STK push: ${message}`
    );
  }
});

/**
 * POST /check-status
 * Body: { checkout_id, name, phone, amount }
 * Checks the transaction status.
 * Returns: On success → HTML receipt. On pending/failure → text message.
 */
app.post("/check-status", async (req, res) => {
  const { checkout_id, name, phone, amount } = req.body;

  if (!checkout_id) {
    return res.status(400).type("text").send(
      "Missing checkout_id. Please provide the checkout ID from the STK push."
    );
  }

  try {
    const response = await axios.post(
      `${HASHBACK_BASE_URL}/transactionstatus`,
      {
        api_key: HASHBACK_API_KEY,
        account_id: HASHBACK_ACCOUNT_ID,
        checkoutid: checkout_id,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );

    const data = response.data;

    // ResultCode "0" = success per HashBack docs
    if (String(data.ResultCode) === "0") {
      const receiptHtml = buildReceipt({
        name: name || "Customer",
        phone: phone || "",
        amount: amount || 0,
        transactionId: data.CheckoutRequestID || checkout_id,
        receipt: data.TransactionReceipt || data.MerchantRequestID || "",
        transactionDate: data.TransactionDate || null,
        reference: data.TransactionReference || "",
      });
      return res.status(200).type("html").send(receiptHtml);
    }

    // Non-zero result code
    const desc = data.ResultDesc || data.ResponseDescription || "Transaction not yet confirmed.";
    const resultCode = data.ResultCode;

    // Common M-Pesa result codes
    const codeMessages = {
      "1032": "Payment cancelled. You cancelled the M-Pesa prompt on your phone.",
      "1037": "Payment timed out. The STK push request expired without response.",
      "1": "Insufficient M-Pesa balance to complete this payment.",
      "2001": "Incorrect M-Pesa PIN entered. Please try again.",
    };

    const friendlyMsg = codeMessages[String(resultCode)] || desc;
    return res.status(200).type("text").send(
      `Transaction status: ${friendlyMsg} (Code: ${resultCode})`
    );
  } catch (err) {
    const message = extractErrorMessage(err);
    return res.status(502).type("text").send(
      `Failed to check transaction status: ${message}`
    );
  }
});

/**
 * POST /webhook
 * HashBack sends payment confirmation here automatically.
 * Configure this URL in your HashBack portal settings.
 * Body: webhook payload from HashBack
 */
app.post("/webhook", async (req, res) => {
  const payload = req.body;

  console.log("[WEBHOOK] Received payment callback:", JSON.stringify(payload, null, 2));

  // Respond immediately with 200 so HashBack knows we received it
  res.status(200).json({ received: true });

  // Process the payment confirmation
  const {
    ResponseCode,
    ResultCode,
    TransactionID,
    TransactionAmount,
    TransactionReceipt,
    TransactionDate,
    TransactionReference,
    Msisdn,
  } = payload;

  if (String(ResultCode) === "0" || String(ResponseCode) === "0") {
    console.log(`[WEBHOOK] ✅ Payment CONFIRMED — Receipt: ${TransactionReceipt}, Amount: KES ${TransactionAmount}, MSISDN: ${Msisdn}`);
    // TODO: Update your database here to mark payment as complete
  } else {
    console.log(`[WEBHOOK] ❌ Payment FAILED — Code: ${ResultCode}, Ref: ${TransactionReference}`);
    // TODO: Update your database here to mark payment as failed
  }
});

/**
 * GET /
 * Simple health check
 */
app.get("/", (req, res) => {
  res.type("text").send("HashBack Deposit Server is running. Endpoints: POST /deposit, POST /check-status, POST /webhook");
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).type("text").send(
    `Internal server error: ${err.message || "Something went wrong on the server."}`
  );
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`HashBack deposit server running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /deposit       — initiate STK push`);
  console.log(`  POST /check-status  — check transaction status`);
  console.log(`  POST /webhook       — HashBack payment callback`);
});

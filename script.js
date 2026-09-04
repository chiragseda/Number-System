(() => {
  const sheetId = "1kP8Iwh5lCnEGvVxLP1vxCy0mJWO34BW9FKBg4ZSXAf8";
  const apiKey = "AIzaSyAwe-nAyIphZ47DgK5din3JoqADod5sVLk";
  const range = "Sheet1!A:M";

  // ============================================================
  // TAKEN STATUS CONFIGURATION
  // ============================================================
  // Paste your deployed Google Apps Script Web App URL here.
  const TAKEN_API_URL = "https://script.google.com/macros/s/AKfycbzPBNfn0u6rUXTT0My6bfkUvXHw1FxgP_xEoF6WfO_UZ4RPAQerewdLhG7QH8ESo6Jx/exec";

  let cachedData = null;
  let lastResult = null;
  let lastRecord = null;

  const headers = [
    "Serial no.",
    "Date",
    "Name",
    "City",
    "Item",
    "Amount",
    "ਖਾਲਸ ਸੋਨਾ",
    "Int.",
    "ਹੋਰ",
    "P.Pmt",
    "Notes",
    "Ph. No",
    "Taken"
  ];

  // ============================================================
  // HELPERS
  // ============================================================

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parseAmount(value) {
    return Number(String(value).replace(/[^\d]/g, "")) || 0;
  }

  function parseRate(value) {
    return Number(String(value).replace(/[^\d.]/g, "")) || 0;
  }

  // ============================================================
  // DATE
  // ============================================================

  function parseDate(dateStr) {
    if (!dateStr) return null;

    const cleaned = String(dateStr)
      .replace(/[()]/g, "")
      .trim();

    const parts = cleaned.split(/[.\-/]/);

    if (parts.length !== 3) return null;

    let [d, m, y] = parts.map(Number);

    if (
      !Number.isFinite(d) ||
      !Number.isFinite(m) ||
      !Number.isFinite(y)
    ) {
      return null;
    }

    if (y < 100) {
      y = y > 50 ? 1900 + y : 2000 + y;
    }

    const date = new Date(y, m - 1, d);

    if (isNaN(date.getTime())) return null;

    return date;
  }

  function formatDate(date) {
    if (!date) return "";
    return date.toLocaleDateString("en-GB");
  }

  function daysBetween(start, end) {
    return Math.floor(
      (end - start) / (1000 * 60 * 60 * 24)
    );
  }

  // ============================================================
  // PARSE P.PMT / EXTRA ENTRIES
  //
  // Example:
  // 5,000 (12/05/2026)
  // 10000 (01/06/2026)
  // ============================================================

  function parseEntries(text) {
    if (!text || text === "—") return [];

    const results = [];

    const regex = /([\d,]+)[^\(]*\(([^)]+)\)/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
      const amount = Number(
        match[1].replace(/,/g, "")
      );

      const date = match[2].trim();

      if (amount > 0 && parseDate(date)) {
        results.push({
          amount,
          date
        });
      }
    }

    return results;
  }

  // ============================================================
  // MONTH CALCULATION
  //
  // Existing rule:
  //
  // 0-4 extra days  = same months
  // 5-15 extra days = +0.5 month
  // 16+ extra days  = +1 month
  // ============================================================

  function calculateMonths(start, end) {
    if (!start || !end) return 0;

    let months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    let anchor = new Date(start);

    anchor.setMonth(
      anchor.getMonth() + months
    );

    if (anchor > end) {
      months--;

      anchor = new Date(start);

      anchor.setMonth(
        anchor.getMonth() + months
      );
    }

    const extraDays = Math.floor(
      (end - anchor) /
      (1000 * 60 * 60 * 24)
    );

    if (extraDays <= 4) {
      return months;
    }

    if (extraDays <= 15) {
      return months + 0.5;
    }

    return months + 1;
  }

  // ============================================================
  // MAIN INTEREST CALCULATION
  //
  // EXISTING LOGIC — DO NOT CHANGE
  // ============================================================

  function calculateFull(record) {
    const initialPrincipal = parseAmount(
      record["Amount"]
    );

    const rate = parseRate(
      record["Int."]
    );

    const startDate = parseDate(
      record["Date"]
    );

    if (
      !initialPrincipal ||
      !rate ||
      !startDate
    ) {
      return null;
    }

    // ----------------------------------------------------------
    // READ PAYMENTS
    // ----------------------------------------------------------

    const payments = parseEntries(
      record["P.Pmt"]
    ).map(payment => ({
      ...payment,
      type: "payment"
    }));

    // ----------------------------------------------------------
    // READ EXTRA MONEY
    // ----------------------------------------------------------

    const extras = parseEntries(
      record["ਹੋਰ"]
    ).map(extra => ({
      ...extra,
      type: "extra"
    }));

    // ----------------------------------------------------------
    // 7-DAY WINDOW
    // ----------------------------------------------------------

    const graceEndDate = new Date(startDate);

    graceEndDate.setDate(
      graceEndDate.getDate() + 7
    );

    const initialExtras = extras.filter(extra => {
      const extraDate = parseDate(extra.date);

      return (
        extraDate &&
        extraDate >= startDate &&
        extraDate <= graceEndDate
      );
    });

    const laterExtras = extras.filter(extra => {
      const extraDate = parseDate(extra.date);

      return !(
        extraDate &&
        extraDate >= startDate &&
        extraDate <= graceEndDate
      );
    });

    // ----------------------------------------------------------
    // PRINCIPAL
    // ----------------------------------------------------------

    let principal = initialPrincipal;

    initialExtras.forEach(extra => {
      principal += extra.amount;
    });

    // ----------------------------------------------------------
    // INTEREST
    // ----------------------------------------------------------

    let interestOutstanding = 0;

    let totalInterestCharged = 0;

    // ----------------------------------------------------------
    // CURRENT DATE
    // ----------------------------------------------------------

    let currentDate = new Date(startDate);

    const steps = [];

    // ----------------------------------------------------------
    // STARTING STEP
    // ----------------------------------------------------------

    steps.push({
      type: "start",
      date: new Date(startDate),
      amount: initialPrincipal
    });

    // ----------------------------------------------------------
    // SHOW INITIAL EXTRAS IN LEDGER
    // ----------------------------------------------------------

    initialExtras
      .slice()
      .sort((a, b) => {
        return (
          parseDate(a.date) -
          parseDate(b.date)
        );
      })
      .forEach(extra => {
        steps.push({
          type: "initialExtra",
          date: new Date(
            parseDate(extra.date)
          ),
          amount: extra.amount,
          afterPrincipal: principal
        });
      });

    // ----------------------------------------------------------
    // COMBINE NORMAL EVENTS
    // ----------------------------------------------------------

    const events = [
      ...payments,
      ...laterExtras
    ].sort((a, b) => {
      return (
        parseDate(a.date) -
        parseDate(b.date)
      );
    });

    let isFirstPeriod = true;

    // ==========================================================
    // PROCESS EVERY NORMAL EVENT
    // ==========================================================

    events.forEach(event => {
      const eventDate = parseDate(
        event.date
      );

      if (!eventDate) return;

      // --------------------------------------------------------
      // CALCULATE INTEREST BEFORE EVENT
      // --------------------------------------------------------

      let months;

      if (isFirstPeriod) {
        months = Math.max(
          1,
          calculateMonths(
            currentDate,
            eventDate
          )
        );
      } else {
        months = calculateMonths(
          currentDate,
          eventDate
        );
      }

      // --------------------------------------------------------
      // INTEREST IS CALCULATED ONLY ON PRINCIPAL
      // --------------------------------------------------------

      const interestForPeriod =
        principal *
        rate /
        100 *
        months;

      if (months > 0) {
        interestOutstanding +=
          interestForPeriod;

        totalInterestCharged +=
          interestForPeriod;

        steps.push({
          type: "interest",

          from: new Date(currentDate),

          to: new Date(eventDate),

          base: principal,

          rate: rate,

          months: months,

          interest: interestForPeriod,

          principalAfter: principal,

          interestOutstanding:
            interestOutstanding,

          totalInterestCharged:
            totalInterestCharged
        });
      }

      isFirstPeriod = false;

      // --------------------------------------------------------
      // LATE EXTRA MONEY
      // --------------------------------------------------------

      if (event.type === "extra") {
        const previousPrincipal =
          principal;

        principal += event.amount;

        steps.push({
          type: "extra",

          date: new Date(eventDate),

          amount: event.amount,

          previousPrincipal:
            previousPrincipal,

          afterPrincipal:
            principal,

          interestOutstanding:
            interestOutstanding
        });
      }

      // --------------------------------------------------------
      // PART PAYMENT
      // --------------------------------------------------------

      if (event.type === "payment") {
        let remainingPayment =
          event.amount;

        // First pay interest.

        const interestPaid =
          Math.min(
            remainingPayment,
            interestOutstanding
          );

        interestOutstanding -=
          interestPaid;

        remainingPayment -=
          interestPaid;

        // Then pay principal.

        const principalPaid =
          Math.min(
            remainingPayment,
            principal
          );

        principal -=
          principalPaid;

        remainingPayment -=
          principalPaid;

        steps.push({
          type: "payment",

          date: new Date(eventDate),

          amount: event.amount,

          interestPaid:
            interestPaid,

          principalPaid:
            principalPaid,

          afterPrincipal:
            principal,

          interestOutstanding:
            interestOutstanding,

          excessPayment:
            remainingPayment
        });
      }

      currentDate =
        new Date(eventDate);
    });

    // ==========================================================
    // FINAL INTEREST
    // ==========================================================

    const today = new Date();

    let finalMonths;

    if (isFirstPeriod) {
      finalMonths = Math.max(
        1,
        calculateMonths(
          currentDate,
          today
        )
      );
    } else {
      finalMonths =
        calculateMonths(
          currentDate,
          today
        );
    }

    const finalInterest =
      principal *
      rate /
      100 *
      finalMonths;

    if (finalMonths > 0) {
      interestOutstanding +=
        finalInterest;

      totalInterestCharged +=
        finalInterest;
    }

    steps.push({
      type: "interest",

      from: new Date(currentDate),

      to: new Date(today),

      base: principal,

      rate: rate,

      months: finalMonths,

      interest: finalInterest,

      principalAfter:
        principal,

      interestOutstanding:
        interestOutstanding,

      totalInterestCharged:
        totalInterestCharged,

      final: true
    });

    // ==========================================================
    // FINAL RESULT
    // ==========================================================

    const finalAmount =
      principal +
      interestOutstanding;

    return {
      principal:
        principal,

      totalInterest:
        interestOutstanding,

      totalInterestCharged:
        totalInterestCharged,

      finalAmount:
        finalAmount,

      steps:
        steps
    };
  }

  // ============================================================
  // PHONE NUMBER
  // ============================================================

  function cleanPhoneNumber(phone) {
    if (!phone) return "";

    let digits = String(phone)
      .replace(/\D/g, "");

    digits = digits.replace(
      /^0+/,
      ""
    );

    if (
      digits.length === 12 &&
      digits.startsWith("91")
    ) {
      return digits;
    }

    if (digits.length === 10) {
      return "91" + digits;
    }

    if (digits.length > 10) {
      return (
        "91" +
        digits.slice(-10)
      );
    }

    return "";
  }

  // ============================================================
  // WHATSAPP
  // ============================================================

  function sendWhatsApp(record, result) {
    const phone =
      cleanPhoneNumber(
        record["Ph. No"]
      );

    if (!phone) {
      alert("Invalid phone number");
      return;
    }

    const message = `
BK Jewellers

Name: ${record["Name"]}
Item: ${record["Item"]}

Principal: ₹${Math.round(result.principal)}
Interest: ₹${Math.round(result.totalInterest)}
Total: ₹${Math.round(result.finalAmount)}

Thank you 🙏
    `;

    const url =
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(
      url,
      "_blank"
    );
  }

  // ============================================================
  // TAKEN STATUS
  // ============================================================

  function hasTakenDate(record) {
    const value =
      String(record["Taken"] || "").trim();

    return (
      value !== "" &&
      value !== "-" &&
      value !== "—"
    );
  }

  function formatTakenDate(value) {
    if (!value) return "";

    const parsed = parseDate(value);

    if (parsed) {
      const day =
        String(parsed.getDate())
          .padStart(2, "0");

      const month =
        String(parsed.getMonth() + 1)
          .padStart(2, "0");

      const year =
        parsed.getFullYear();

      return `${day}.${month}.${year}`;
    }

    return String(value);
  }

  async function markRecordAsTaken(record, button) {
    if (!record || !record["Serial no."]) {
      alert("Invalid record.");
      return;
    }

    if (hasTakenDate(record)) {
      alert(
        `This record is already marked as taken on ${formatTakenDate(record["Taken"])}.`
      );

      return;
    }

    if (
      !TAKEN_API_URL ||
      TAKEN_API_URL.includes("PASTE_YOUR")
    ) {
      alert(
        "Taken system is not connected yet. Deploy the Google Apps Script backend and paste its Web App URL into TAKEN_API_URL in script.js."
      );

      return;
    }

    const confirmed = confirm(
      `Mark Serial No. ${record["Serial no."]} as TAKEN?\n\nToday's date will be entered in the Taken column and columns A:M will be highlighted red.`
    );

    if (!confirmed) return;

    const originalText =
      button
        ? button.textContent
        : "";

    if (button) {
      button.disabled = true;
      button.textContent =
        "Marking...";
    }

    try {
      const response = await fetch(
        TAKEN_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8"
          },

          body: JSON.stringify({
            action: "markTaken",

            serialNo:
              String(
                record["Serial no."]
              ).trim()
          })
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
          "Unable to update the record."
        );
      }

      const takenDate =
        data.takenDate ||
        formatDate(new Date());

      // Update local record/cache.
      record["Taken"] =
        takenDate;

      if (
        cachedData &&
        cachedData.values
      ) {
        const rows =
          cachedData.values.slice(1);

        const rowIndex =
          rows.findIndex(row =>
            String(
              row[0] || ""
            ).trim() ===
            String(
              record["Serial no."]
            ).trim()
          );

        if (rowIndex !== -1) {
          // M is index 12 in A:M.
          cachedData.values[
            rowIndex + 1
          ][12] =
            takenDate;
        }
      }

      if (button) {
        button.disabled = true;

        button.classList.remove(
          "taken-action-btn"
        );

        button.classList.add(
          "taken-done-btn"
        );

        button.textContent =
          `Taken on ${formatTakenDate(takenDate)}`;
      }

      const status =
        document.getElementById(
          "takenStatus"
        );

      if (status) {
        status.className =
          "taken-status taken";

        status.innerHTML =
          `🔴 <b>TAKEN</b> — ${escapeHtml(
            formatTakenDate(takenDate)
          )}`;
      }

      alert(
        `Serial No. ${record["Serial no."]} marked as taken on ${formatTakenDate(takenDate)}.`
      );

    } catch (error) {
      console.error(
        "Taken update error:",
        error
      );

      alert(
        `Unable to mark this record as taken.\n\n${error.message || error}`
      );

      if (button) {
        button.disabled = false;

        button.textContent =
          originalText ||
          "Mark as Taken";
      }
    }
  }

  // ============================================================
  // SHOW INTEREST MODAL
  // ============================================================

  window.showInterest = function(record) {
    const modal =
      document.getElementById(
        "ppModal"
      );

    const content =
      document.getElementById(
        "ppContent"
      );

    const result =
      calculateFull(record);

    lastResult = result;
    lastRecord = record;

    if (!result) {
      content.innerHTML =
        "Invalid data";

      modal.style.display =
        "flex";

      return;
    }

    let html =
      `<h3>Detailed Ledger</h3>`;

    // ==========================================================
    // LEDGER
    // ==========================================================

    result.steps.forEach(step => {

      // --------------------------------------------------------
      // START
      // --------------------------------------------------------

      if (step.type === "start") {
        html += `
          <div class="pp-item">
            <b>Starting Principal</b>

            <span>
              ₹${Math.round(
                step.amount
              )}
            </span>
          </div>
        `;
      }

      // --------------------------------------------------------
      // INITIAL EXTRA WITHIN 7 DAYS
      // --------------------------------------------------------

      if (step.type === "initialExtra") {
        html += `
          <div class="pp-item">
            <span>
              Extra Money Within
              7-Day Adjustment
              (${formatDate(step.date)})
            </span>

            <span>
              +₹${Math.round(
                step.amount
              )}
            </span>
          </div>
        `;
      }

      // --------------------------------------------------------
      // INTEREST
      // --------------------------------------------------------

      if (step.type === "interest") {
        html += `
          <div class="pp-item">
            <span>
              ${formatDate(step.from)}
              →
              ${formatDate(step.to)}

              <br>

              Interest on Principal:
              ₹${Math.round(
                step.base
              )}

              @ ${step.rate}%

              × ${step.months} months
            </span>

            <span>
              +₹${Math.round(
                step.interest
              )}
            </span>
          </div>
        `;

        html += `
          <div class="pp-item">
            <span>
              Interest Outstanding
            </span>

            <span>
              ₹${Math.round(
                step.interestOutstanding
              )}
            </span>
          </div>
        `;
      }

      // --------------------------------------------------------
      // NORMAL EXTRA
      // --------------------------------------------------------

      if (step.type === "extra") {
        html += `
          <div class="pp-item">
            <span>
              Extra Money
              (${formatDate(step.date)})
            </span>

            <span>
              +₹${Math.round(
                step.amount
              )}
            </span>
          </div>
        `;

        html += `
          <div class="pp-item">
            <span>
              Principal After Extra
            </span>

            <span>
              ₹${Math.round(
                step.afterPrincipal
              )}
            </span>
          </div>
        `;
      }

      // --------------------------------------------------------
      // PAYMENT
      // --------------------------------------------------------

      if (step.type === "payment") {
        html += `
          <div class="pp-item">
            <span>
              Payment
              (${formatDate(step.date)})

              <br>

              Interest Paid:
              ₹${Math.round(
                step.interestPaid
              )}

              <br>

              Principal Paid:
              ₹${Math.round(
                step.principalPaid
              )}
            </span>

            <span>
              -₹${Math.round(
                step.amount
              )}
            </span>
          </div>
        `;

        html += `
          <div class="pp-item">
            <span>
              Principal Remaining
            </span>

            <span>
              ₹${Math.round(
                step.afterPrincipal
              )}
            </span>
          </div>
        `;

        html += `
          <div class="pp-item">
            <span>
              Interest Remaining
            </span>

            <span>
              ₹${Math.round(
                step.interestOutstanding
              )}
            </span>
          </div>
        `;
      }
    });

    // ==========================================================
    // FINAL SUMMARY
    // ==========================================================

    html += `
      <hr>

      <div class="pp-item">
        <b>Principal</b>

        <span>
          ₹${Math.round(
            result.principal
          )}
        </span>
      </div>

      <div class="pp-item">
        <b>Interest</b>

        <span>
          ₹${Math.round(
            result.totalInterest
          )}
        </span>
      </div>

      <div class="pp-item">
        <b>Final Amount</b>

        <span>
          ₹${Math.round(
            result.finalAmount
          )}
        </span>
      </div>
    `;

    // ==========================================================
    // WHATSAPP BUTTON
    // ==========================================================

    html += `
      <div style="margin-top:15px;">
        <button
          class="pp-btn"
          id="waSend"
        >
          Send WhatsApp
        </button>
      </div>
    `;

    content.innerHTML =
      html;

    modal.style.display =
      "flex";

    document.getElementById(
      "waSend"
    ).onclick = () => {
      sendWhatsApp(
        lastRecord,
        lastResult
      );
    };
  };

  // ============================================================
  // EXISTING-RECORD PRINT SUPPORT
  // Presentation-only helper: uses the existing print area.
  // ============================================================

  function numberToIndianWordsForPrint(number) {
    number = Math.floor(Number(number));
    if (!Number.isFinite(number) || number < 0) return "";
    if (number === 0) return "Zero";

    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const underHundred = n => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    const underThousand = n => n < 100 ? underHundred(n) : ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + underHundred(n % 100) : "");

    let result = "";
    const crore = Math.floor(number / 10000000); number %= 10000000;
    const lakh = Math.floor(number / 100000); number %= 100000;
    const thousand = Math.floor(number / 1000); number %= 1000;
    if (crore) result += underThousand(crore) + " Crore ";
    if (lakh) result += underThousand(lakh) + " Lakh ";
    if (thousand) result += underThousand(thousand) + " Thousand ";
    if (number) result += underThousand(number);
    return result.trim();
  }

  function setPrintText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value == null ? "" : String(value);
  }

  function printExistingRecord(record) {
    const amount = parseAmount(record["Amount"]);
    const date = formatDate(parseDate(record["Date"])) || String(record["Date"] || "");
    const amountWords = numberToIndianWordsForPrint(amount) + " Only";
    const values = {
      Serial: record["Serial no."], Phone: record["Ph. No"], Name: record["Name"],
      Address: record["City"], Item: record["Item"], EstimatedWeight: "",
      GoldWeight: record["खਾਲਸ ਸੋਨਾ"] || record["ਖਾਲਸ ਸੋਨਾ"] || "", Amount: amount ? amount.toLocaleString("en-IN") + "/-" : "", Date: date, AmountWords: amountWords
    };

    ["Customer", "Office"].forEach(copy => {
      setPrintText("printSerial" + copy, values.Serial);
      setPrintText("printPhone" + copy, values.Phone);
      setPrintText("printName" + copy, values.Name);
      setPrintText("printAddress" + copy, values.Address ? "(" + values.Address + ")" : "");
      setPrintText("printItem" + copy, values.Item);
      setPrintText("printEstimatedWeight" + copy, values.EstimatedWeight);
      setPrintText("printGoldWeight" + copy, values.GoldWeight);
      setPrintText("printAmount" + copy, values.Amount);
      setPrintText("printDate" + copy, values.Date);
      setPrintText("printAmountWords" + copy, values.AmountWords);
    });

    window.print();
  }

  // ============================================================
  // FETCH RECORD
  // ============================================================

  function fetchRecord(serialInput) {
    const resultDiv =
      document.getElementById(
        "result"
      );

    if (!cachedData) {
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}&_=${Date.now()}`,
        { cache: "no-store" }
      )
        .then(res => res.json())
        .then(data => {
          cachedData = data;
          process(serialInput);
        })
        .catch(error => {
          console.error(
            "Google Sheets error:",
            error
          );

          resultDiv.innerHTML =
            "Unable to load records.";
        });
    } else {
      process(serialInput);
    }

    function process(serialInput) {
      if (
        !cachedData ||
        !cachedData.values
      ) {
        resultDiv.innerHTML =
          "No data found.";

        return;
      }

      const rows =
        cachedData.values.slice(1);

      const index =
        rows.findIndex(
          row =>
            String(
              row[0] || ""
            ).trim() ===
            String(
              serialInput || ""
            ).trim()
        );

      if (index === -1) {
        resultDiv.innerHTML =
          "No record";

        return;
      }

      const raw =
        rows[index];

      const record = {};

      headers.forEach(
        (header, i) => {
          record[header] =
            raw[i] || "";
        }
      );

      // ========================================================
      // RESPONSIVE DASHBOARD RENDER
      // ========================================================

      const initialAmount = parseAmount(record["Amount"]);
      const payments = parseEntries(record["P.Pmt"]);
      const extras = parseEntries(record["හੋਰ"] || record["ਹੋਰ"]);
      const calculation = calculateFull(record);
      const totalPayments = payments.reduce((sum, item) => sum + item.amount, 0);
      const totalExtras = extras.reduce((sum, item) => sum + item.amount, 0);

      const money = value =>
        `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;

      const displayValue = (value, fallback = "—") =>
        String(value || "").trim() ? escapeHtml(value) : fallback;

      const infoCard = (icon, title, rows) => `
        <details class="info-card" open>
          <summary><i class="bi ${icon}"></i><span>${title}</span></summary>
          <div class="info-body">
            ${rows.map(([label, value]) => `
              <div class="info-row field">
                <span class="label ${label === "P.Pmt" || label === "Other" ? "compatibility-label" : ""}" ${label === "P.Pmt" ? 'data-display="Part Payment"' : label === "Other" ? 'data-display="Extra Amount"' : ""}>${label}</span>
                <span class="value ${value === "—" ? "value-empty" : ""}">${value}</span>
              </div>
            `).join("")}
          </div>
        </details>`;

      const ledgerRows = calculation
        ? calculation.steps.map((step, index) => {
            let type = "interest";
            let typeLabel = "Interest";
            let description = "";
            let amount = "—";
            let interest = "—";
            let principalAfter = "—";
            let outstanding = "—";

            if (step.type === "start") {
              type = "original";
              typeLabel = "Original";
              description = "Initial Amount";
              amount = money(step.amount);
              principalAfter = money(step.amount);
              outstanding = money(step.amount);
            } else if (step.type === "initialExtra") {
              type = "extra";
              typeLabel = "Extra";
              description = `Extra Amount within 7-day adjustment (${formatDate(step.date)})`;
              amount = `+${money(step.amount)}`;
              principalAfter = money(step.afterPrincipal);
              outstanding = money(step.afterPrincipal);
            } else if (step.type === "interest") {
              type = "interest";
              typeLabel = "Interest";
              description = `${formatDate(step.from)} → ${formatDate(step.to)} · ${step.months} month${step.months === 1 ? "" : "s"} @ ${step.rate}%`;
              interest = `+${money(step.interest)}`;
              principalAfter = money(step.principalAfter);
              outstanding = money(step.principalAfter + step.interestOutstanding);
            } else if (step.type === "extra") {
              type = "extra";
              typeLabel = "Extra";
              description = `Extra Amount (${formatDate(step.date)})`;
              amount = `+${money(step.amount)}`;
              principalAfter = money(step.afterPrincipal);
              outstanding = money(step.afterPrincipal + step.interestOutstanding);
            } else if (step.type === "payment") {
              type = "payment";
              typeLabel = "Payment";
              description = `Part Payment (${formatDate(step.date)}) · Interest paid ${money(step.interestPaid)}`;
              amount = `-${money(step.amount)}`;
              principalAfter = money(step.afterPrincipal);
              outstanding = money(step.afterPrincipal + step.interestOutstanding);
            }

            return `<tr>
              <td>${index + 1}</td>
              <td>${formatDate(step.date || step.to)}</td>
              <td><span class="type-badge type-${type}">${typeLabel}</span></td>
              <td>${escapeHtml(description)}</td>
              <td class="amount">${amount}</td>
              <td class="amount">${interest}</td>
              <td class="amount">${principalAfter}</td>
              <td class="amount">${outstanding}</td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="8" class="text-center text-muted py-4">Calculate interest to generate the transaction ledger.</td></tr>`;

      const alreadyTaken = hasTakenDate(record);
      const takenDateText = alreadyTaken ? formatTakenDate(record["Taken"]) : "";

      let html = `
        <section class="record-card">
          <div class="record-head">
            <div class="record-title-wrap">
              <i class="bi bi-file-earmark-text record-icon"></i>
              <div>
                <h2 class="record-title">Record Details</h2>
                <span id="takenStatus" class="status-pill ${alreadyTaken ? "status-taken" : "status-active"}">
                  <i class="bi ${alreadyTaken ? "bi-circle-fill" : "bi-check-circle-fill"}"></i>
                  ${alreadyTaken ? `TAKEN · ${escapeHtml(takenDateText)}` : "ACTIVE"}
                </span>
              </div>
            </div>
            <div class="record-meta"><strong>Record #${escapeHtml(record["Serial no."])}</strong>Created on ${escapeHtml(formatDate(parseDate(record["Date"])) || record["Date"])}</div>
          </div>

          <div class="info-grid">
            ${infoCard("bi-person-fill", "Customer Information", [
              ["Name", displayValue(record["Name"])],
              ["Address / City", displayValue(record["City"])],
              ["Phone", displayValue(record["Ph. No"])]
            ])}
            ${infoCard("bi-calendar3", "Transaction Details", [
              ["Date", displayValue(formatDate(parseDate(record["Date"])) || record["Date"])],
              ["Item", displayValue(record["Item"])],
              ["Amount", money(initialAmount)],
              ["Interest Rate", displayValue(record["Int."])]
            ])}
            ${infoCard("bi-box-seam-fill", "Gold Details", [
              ["Pure Gold Weight", displayValue(record["खालस ਸੋਨਾ"] || record["ਖਾਲਸ ਸੋਨਾ"], "—")],
              ["Estimated Weight", "—"]
            ])}
            ${infoCard("bi-file-text-fill", "Other Information", [
              ["Other", totalExtras ? money(totalExtras) : "—"],
              ["P.Pmt", totalPayments ? money(totalPayments) : "—"],
              ["Notes", displayValue(record["Notes"])],
              ["Taken", alreadyTaken ? escapeHtml(takenDateText) : "Not Taken"]
            ])}
          </div>

          <div class="action-bar">
            <button class="dashboard-btn calc-btn" id="calcBtn" type="button"><i class="bi bi-calculator"></i><span>Calculate Interest</span></button>
            <button class="dashboard-btn payment-btn part-payment-btn" type="button" data-serial="${escapeHtml(record["Serial no."])}"><i class="bi bi-currency-rupee"></i><span>Add Part Payment</span></button>
            <button class="dashboard-btn extra-btn extra-amount-btn" type="button" data-serial="${escapeHtml(record["Serial no."])}"><i class="bi bi-plus-lg"></i><span>Add Extra Amount</span></button>
            ${alreadyTaken
              ? `<button class="taken-done-btn" id="takenBtn" type="button" disabled><i class="bi bi-check-circle-fill"></i><span>Taken on ${escapeHtml(takenDateText)}</span></button>`
              : `<button class="taken-action-btn" id="takenBtn" type="button"><i class="bi bi-check-circle-fill"></i><span>Mark as Taken</span></button>`}
            <button class="dashboard-btn whatsapp-btn" id="whatsappBtn" type="button"><i class="bi bi-whatsapp"></i><span>Send via WhatsApp</span></button>
            <button class="dashboard-btn print-btn" id="printBtn" type="button"><i class="bi bi-printer-fill"></i><span>Print Slips</span></button>
          </div>
        </section>

        <div class="lower-grid">
          <section class="summary-panel">
            <h3 class="section-title"><i class="bi bi-bar-chart-fill"></i>Interest Summary</h3>
            <div class="metric-grid">
              <div class="metric principal"><div class="metric-label">Principal Amount</div><div class="metric-value">${money(calculation ? calculation.principal : initialAmount)}</div></div>
              <div class="metric interest"><div class="metric-label">Total Interest</div><div class="metric-value">${calculation ? money(calculation.totalInterest) : "—"}</div></div>
              <div class="metric payments"><div class="metric-label">Total Payments</div><div class="metric-value">${money(totalPayments)}</div></div>
              <div class="metric outstanding"><div class="metric-label">Current Outstanding</div><div class="metric-value">${calculation ? money(calculation.finalAmount) : "—"}</div></div>
            </div>
          </section>
          <aside class="quick-panel">
            <h3 class="section-title"><i class="bi bi-lightning-charge-fill"></i>Quick Actions</h3>
            <div class="quick-actions">
              <button type="button" class="quick-action-btn" id="refreshRecordBtn"><i class="bi bi-arrow-clockwise"></i><span>Refresh Record</span></button>
              <button type="button" class="quick-action-btn" id="quickNewRecordBtn"><i class="bi bi-plus-lg"></i><span>New Record</span></button>
            </div>
          </aside>
        </div>

        <section class="ledger-panel">
          <h3 class="section-title"><i class="bi bi-list-columns-reverse"></i>Transaction Ledger</h3>
          <div class="ledger-wrap">
            <table class="ledger-table">
              <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Description</th><th>Amount (₹)</th><th>Interest (₹)</th><th>Principal (₹)</th><th>Outstanding (₹)</th></tr></thead>
              <tbody>${ledgerRows}</tbody>
            </table>
          </div>
        </section>
      `;

      resultDiv.innerHTML = html;

      document.getElementById(
        "calcBtn"
      ).onclick = () => {
        showInterest(record);
      };

      const takenBtn =
        document.getElementById(
          "takenBtn"
        );

      if (
        takenBtn &&
        !alreadyTaken
      ) {
        takenBtn.onclick = () => {
          markRecordAsTaken(
            record,
            takenBtn
          );
        };
      }

      const whatsappBtn = document.getElementById("whatsappBtn");
      if (whatsappBtn) {
        whatsappBtn.onclick = () => {
          const currentCalculation = calculateFull(record);
          if (!currentCalculation) {
            alert("Unable to calculate the record details.");
            return;
          }
          sendWhatsApp(record, currentCalculation);
        };
      }

      const printBtn = document.getElementById("printBtn");
      if (printBtn) {
        printBtn.onclick = () => printExistingRecord(record);
      }

      const refreshRecordBtn = document.getElementById("refreshRecordBtn");
      if (refreshRecordBtn) {
        refreshRecordBtn.onclick = async () => {
          const serial = String(
            (lastRecord && lastRecord["Serial no."]) ||
            document.getElementById("serialInput")?.value ||
            record["Serial no."] ||
            ""
          ).trim();

          if (!serial) {
            return;
          }

          const icon = refreshRecordBtn.querySelector("i");
          const label = refreshRecordBtn.querySelector("span");
          const originalLabel = label ? label.textContent : "Refresh Record";

          refreshRecordBtn.disabled = true;
          refreshRecordBtn.classList.add("is-refreshing");
          if (icon) icon.classList.add("spin");
          if (label) label.textContent = "Refreshing...";

          try {
            // Discard the in-memory Sheet cache so the record is read again.
            cachedData = null;

            // Re-fetch the same record without reloading the page. This keeps
            // the current search, scroll position and UI state intact.
            await fetchRecord(serial);
          } finally {
            const currentButton = document.getElementById("refreshRecordBtn");
            if (currentButton) {
              currentButton.disabled = false;
              currentButton.classList.remove("is-refreshing");
              const currentIcon = currentButton.querySelector("i");
              const currentLabel = currentButton.querySelector("span");
              if (currentIcon) currentIcon.classList.remove("spin");
              if (currentLabel) currentLabel.textContent = originalLabel;
            }
          }
        };
      }

      const quickNewRecordBtn = document.getElementById("quickNewRecordBtn");
      if (quickNewRecordBtn) {
        quickNewRecordBtn.onclick = () => {
          const newRecordButton = document.getElementById("openNewRecordBtn");
          if (newRecordButton) newRecordButton.click();
        };
      }
    }
  }

  // ============================================================
  // CUSTOMER / PHONE / SERIAL SEARCH
  // ============================================================

  function normalizeSearch(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function recordFromRow(row) {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = row[i] || "";
    });
    return record;
  }

  function searchRecords(query) {
    const resultDiv = document.getElementById("result");
    const customerResults = document.getElementById("customerSearchResults");
    const value = normalizeSearch(query);

    if (!value) {
      customerResults.innerHTML = "";
      resultDiv.innerHTML = "";
      return;
    }

    const rows = cachedData && cachedData.values
      ? cachedData.values.slice(1)
      : [];

    const numericQuery = value.replace(/\s/g, "");
    const phoneQuery = normalizePhone(value);

    // ----------------------------------------------------------
    // EXACT SERIAL SEARCH
    // ----------------------------------------------------------
    // Keep the original serial-number workflow unchanged. If the
    // user enters an exact serial, open that record directly,
    // including an already-taken record.
    const exactSerial = rows.find(row =>
      String(row[0] || "").trim() === numericQuery
    );

    if (exactSerial) {
      customerResults.innerHTML = "";
      fetchRecord(numericQuery);
      return;
    }

    // ----------------------------------------------------------
    // CUSTOMER / PHONE SEARCH
    // ----------------------------------------------------------
    // For name/phone searches we intentionally exclude taken
    // records. A customer search should only present records that
    // still need attention / are currently active.
    const activeMatches = rows
      .map(recordFromRow)
      .filter(record => !hasTakenDate(record))
      .filter(record => {
        const name = normalizeSearch(record["Name"]);
        const phone = normalizePhone(record["Ph. No"]);

        return (
          (value.length >= 2 && name.includes(value)) ||
          (phoneQuery.length >= 4 && phone.includes(phoneQuery))
        );
      });

    if (!activeMatches.length) {
      customerResults.innerHTML = `
        <div class="customer-results-panel">
          <div class="customer-results-empty">
            <i class="bi bi-person-x me-1"></i>
            No active records found for this customer or phone number.
          </div>
        </div>`;
      resultDiv.innerHTML = "";
      return;
    }

    // ----------------------------------------------------------
    // GROUP BY CUSTOMER IDENTITY
    // ----------------------------------------------------------
    // When the search is a phone number, the phone number is the
    // customer identity. Do NOT use address (or name) to split the
    // same phone into multiple customers. This is important because
    // the same customer may have small address/name formatting
    // differences across old records.
    //
    // When the search is a name, use normalized name + phone. If a
    // phone number is missing, fall back to the address only for
    // disambiguation of identical names with no phone information.
    const groups = new Map();
    const isPhoneSearch = phoneQuery.length >= 4 &&
      activeMatches.some(record => normalizePhone(record["Ph. No"]).includes(phoneQuery));

    activeMatches.forEach(record => {
      const name = String(record["Name"] || "Customer").trim() || "Customer";
      const phone = String(record["Ph. No"] || "").trim();
      const normalizedPhone = normalizePhone(phone);
      const address = String(record["City"] || "").trim();

      let key;

      if (isPhoneSearch && normalizedPhone) {
        // Phone search: same phone = same customer identity.
        key = `phone:${normalizedPhone}`;
      } else {
        const normalizedName = normalizeSearch(name);

        if (normalizedPhone) {
          // Name search: same normalized name + phone = same customer.
          key = `name-phone:${normalizedName}|${normalizedPhone}`;
        } else {
          // No phone available: only then use address as a secondary
          // discriminator for identical names.
          key = `name-address:${normalizedName}|${normalizeSearch(address)}`;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, {
          name,
          phone,
          address,
          records: []
        });
      }

      const group = groups.get(key);
      group.records.push(record);

      // Prefer a non-empty customer name/address if the first matching
      // row did not contain one. This does not affect record data.
      if ((!group.name || group.name === "Customer") && name) {
        group.name = name;
      }
      if (!group.phone && phone) {
        group.phone = phone;
      }
      if (!group.address && address) {
        group.address = address;
      }
    });

    const customerGroups = Array.from(groups.values());

    // One active customer identity: open their active records.
    if (customerGroups.length === 1) {
      renderActiveRecordOptions(customerGroups[0], customerResults, resultDiv);
      return;
    }

    // Multiple active customer identities: ask first.
    renderCustomerIdentityOptions(customerGroups, customerResults, resultDiv);
  }

  function renderCustomerIdentityOptions(groups, customerResults, resultDiv) {
    customerResults.innerHTML = `
      <section class="customer-results-panel">
        <div class="customer-results-header">
          <div>
            <h2 class="customer-results-title">
              <i class="bi bi-people-fill me-1"></i>
              Multiple Customers Found
            </h2>
            <p class="customer-results-meta">
              ${groups.length} different active customers match your search. Select the correct customer first.
            </p>
          </div>
          <span class="badge text-bg-light">Active records only</span>
        </div>
        <div class="customer-record-list">
          ${groups.map((group, index) => `
            <button type="button" class="customer-record-option customer-identity-option" data-customer-group="${index}">
              <span class="customer-record-serial">
                <i class="bi bi-person-fill"></i>
              </span>
              <span class="customer-record-main">
                <strong>${escapeHtml(group.name)}</strong>
                <span>
                  ${group.records.length} active record${group.records.length === 1 ? "" : "s"}
                  ${group.phone ? ` · ${escapeHtml(group.phone)}` : ""}
                  ${group.address ? ` · ${escapeHtml(group.address)}` : ""}
                </span>
              </span>
              <span class="customer-record-status active">Select <i class="bi bi-chevron-right"></i></span>
            </button>`).join("")}
        </div>
      </section>`;

    resultDiv.innerHTML = "";

    customerResults
      .querySelectorAll("[data-customer-group]")
      .forEach(button => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-customer-group"));
          const group = groups[index];
          if (!group) return;

          renderActiveRecordOptions(group, customerResults, resultDiv);
        });
      });
  }

  function renderActiveRecordOptions(group, customerResults, resultDiv) {
    const records = group.records.filter(record => !hasTakenDate(record));

    if (!records.length) {
      customerResults.innerHTML = `
        <div class="customer-results-panel">
          <div class="customer-results-empty">
            <i class="bi bi-person-x me-1"></i>
            No active records found for this customer.
          </div>
        </div>`;
      resultDiv.innerHTML = "";
      return;
    }

    customerResults.innerHTML = `
      <section class="customer-results-panel">
        <div class="customer-results-header">
          <div>
            <h2 class="customer-results-title">
              <i class="bi bi-person-lines-fill me-1"></i>
              ${escapeHtml(group.name)}
            </h2>
            <p class="customer-results-meta">
              ${records.length} active record${records.length === 1 ? "" : "s"}
              ${group.phone ? ` · ${escapeHtml(group.phone)}` : ""}
            </p>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge text-bg-success">Active only</span>
            <button type="button" class="btn btn-sm btn-light customer-back-btn" aria-label="Choose another customer">
              <i class="bi bi-arrow-left me-1"></i>Back
            </button>
          </div>
        </div>
        <div class="customer-record-list">
          ${records.map(record => {
            const serial = String(record["Serial no."] || "").trim();
            const item = record["Item"] || "No item";
            const amount = parseAmount(record["Amount"]);
            const date = record["Date"] || "";
            return `
              <button type="button" class="customer-record-option" data-customer-serial="${escapeHtml(serial)}">
                <span class="customer-record-serial">#${escapeHtml(serial)}</span>
                <span class="customer-record-main">
                  <strong>${escapeHtml(item)}</strong>
                  <span>${escapeHtml(date)} · ₹${Math.round(amount).toLocaleString("en-IN")}</span>
                </span>
                <span class="customer-record-status active">Active <i class="bi bi-chevron-right"></i></span>
              </button>`;
          }).join("")}
        </div>
      </section>`;

    resultDiv.innerHTML = "";

    customerResults
      .querySelectorAll("[data-customer-serial]")
      .forEach(button => {
        button.addEventListener("click", () => {
          const serial = button.getAttribute("data-customer-serial");
          document.getElementById("serialInput").value = serial;
          customerResults.innerHTML = "";
          fetchRecord(serial);
        });
      });

    const backButton = customerResults.querySelector(".customer-back-btn");
    if (backButton) {
      backButton.addEventListener("click", () => {
        // Re-run the original search so the user sees the same
        // customer choices without changing the search text.
        searchRecords(document.getElementById("serialInput").value.trim());
      });
    }
  }

  // ============================================================
  // INITIALIZE
  // ============================================================

  function init() {
    const form =
      document.getElementById(
        "searchForm"
      );

    form.addEventListener(
      "submit",
      e => {
        e.preventDefault();

        const query = document.getElementById("serialInput").value.trim();
        if (!query) return;

        if (!cachedData) {
          const resultDiv = document.getElementById("result");
          resultDiv.innerHTML = "<div class=\"text-center py-4 text-muted\">Loading records...</div>";
          fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}&_=${Date.now()}`,
            { cache: "no-store" }
          )
            .then(res => res.json())
            .then(data => {
              cachedData = data;
              searchRecords(query);
            })
            .catch(error => {
              console.error("Google Sheets error:", error);
              resultDiv.innerHTML = "Unable to load records.";
            });
        } else {
          searchRecords(query);
        }
      }
    );

    const navNewRecordBtn = document.getElementById("navNewRecordBtn");
    if (navNewRecordBtn) {
      navNewRecordBtn.onclick = () => {
        const newRecordButton = document.getElementById("openNewRecordBtn");
        if (newRecordButton) newRecordButton.click();
      };
    }

    // ----------------------------------------------------------
    // CLOSE MODAL
    // ----------------------------------------------------------

    document.getElementById(
      "closeModal"
    ).onclick = () => {
      document.getElementById(
        "ppModal"
      ).style.display =
        "none";
    };

    // ----------------------------------------------------------
    // CLOSE MODAL BY CLICKING OUTSIDE
    // ----------------------------------------------------------

    window.onclick = e => {
      if (
        e.target.id ===
        "ppModal"
      ) {
        document.getElementById(
          "ppModal"
        ).style.display =
          "none";
      }
    };
  }

  // ============================================================
  // DOM READY
  // ============================================================

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();
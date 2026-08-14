(() => {
  const sheetId = "1kP8Iwh5lCnEGvVxLP1vxCy0mJWO34BW9FKBg4ZSXAf8";
  const apiKey = "AIzaSyAwe-nAyIphZ47DgK5din3JoqADod5sVLk";
  const range = "Sheet1!A:M";

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
  // IMPORTANT:
  //
  // PRINCIPAL and INTEREST are ALWAYS separate.
  //
  // Interest is NEVER added to principal.
  //
  // 7-DAY RULE:
  //
  // Extra money taken within 7 days of the original loan date
  // is added to the INITIAL PRINCIPAL before the first
  // minimum-month interest is calculated.
  //
  // Example:
  //
  // 09/04 -> ₹50,000
  // 12/04 -> +₹5,000
  //
  // Since 12/04 is within 7 days:
  //
  // Principal = ₹55,000
  // First month interest = ₹55,000 × 2%
  //
  // Instead of:
  //
  // ₹50,000 × 2%
  //
  // followed by the ₹5,000 being treated separately.
  //
  // Extra taken on day 8 or later is treated normally:
  //
  // Interest is calculated up to that date first,
  // then the extra amount is added to principal.
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

    // Extra money taken between:
    //
    // Start date
    // through
    // Start date + 7 days
    //
    // is treated as part of the initial principal.

    const initialExtras = extras.filter(extra => {
      const extraDate = parseDate(extra.date);

      return (
        extraDate &&
        extraDate >= startDate &&
        extraDate <= graceEndDate
      );
    });

    // Extra money after the 7-day window
    // is processed normally.

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

    // Add ALL early extras to the initial principal.
    //
    // This means multiple extras within the first 7 days
    // are all included.

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
    //
    // Initial extras are NOT included here because they have
    // already been absorbed into the starting principal.
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
        // First period keeps your original rule:
        // minimum 1 month.
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
      //
      // This is an extra taken AFTER the initial 7-day window.
      //
      // Interest up to this date has already been calculated.
      // Now increase principal.
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
      //
      // Payment first clears outstanding interest.
      //
      // Remaining payment reduces principal.
      //
      // Interest NEVER becomes principal.
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

      // Move the calculation date forward.

      currentDate =
        new Date(eventDate);
    });

    // ==========================================================
    // FINAL INTEREST
    //
    // Calculate interest from the last event until today.
    //
    // ONLY PRINCIPAL is used.
    //
    // Previous interest is NEVER added to principal.
    // ==========================================================

    const today = new Date();

    let finalMonths;

    if (isFirstPeriod) {
      // No normal payment or late-extra event occurred.
      //
      // If there were early extras, they are already included
      // in principal.
      //
      // Minimum first month still applies.

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
  // FETCH RECORD
  // ============================================================

  function fetchRecord(serialInput) {
    const resultDiv =
      document.getElementById(
        "result"
      );

    if (!cachedData) {
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`
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
      // RECORD CARD
      // ========================================================

      let html =
        `<div class="record-card">
          <div class="fields-grid">`;

      headers.forEach(header => {
        html += `
          <div class="field">

            <div class="label">
              ${escapeHtml(header)}
            </div>

            <div class="value">
              ${escapeHtml(
                record[header]
              )}
            </div>

          </div>
        `;
      });

      html += `
        <div class="field important">

          <button
            class="pp-btn"
            id="calcBtn"
          >
            Calculate Interest
          </button>

        </div>
      `;

      html += `
          </div>
        </div>
      `;

      resultDiv.innerHTML =
        html;

      document.getElementById(
        "calcBtn"
      ).onclick = () => {
        showInterest(record);
      };
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

        fetchRecord(
          document.getElementById(
            "serialInput"
          ).value
        );
      }
    );

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